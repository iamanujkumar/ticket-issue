import { EVENT_TYPES, publishEvent } from '../../../core/events/event_bus.js';
import { logger } from '../../../core/logger.js';
import { enqueue } from '../../../core/queue/job_queue.js';
import { QUEUES } from '../../../core/queue/queues.js';
import { UserRole } from '../../auth_module/auth.enums.js';
import { getAuthorRoyaltySummary } from '../../book_module/book.service.js';
import { TicketNotFoundError } from '../../ticket_module/ticket.errors.js';
import { findPlaceholders } from '../../ticket_module/ticket.placeholders.js';
import { addMessage, getTicketForAi } from '../../ticket_module/ticket.service.js';
import {
  MAX_OUTPUT_TOKENS,
  MODELS,
  REASONING_EFFORT,
  REGENERATE_LIMIT,
  SUPPORT_EMAIL,
  TEMPERATURE,
  TIMEOUTS_MS,
} from '../ai.constants.js';
import { AiTask, DraftStatus, DraftUsage } from '../ai.enums.js';
import { AiDisabledError, DraftAlreadySentError, DraftNotFoundError, RegenerateLimitError } from '../ai.errors.js';
import * as aiQuery from '../ai.query.js';
import { buildFacts, FLAG_HINTS } from '../facts/facts_builder.js';
import {
  buildDraftPrompt,
  DRAFT_JSON_SCHEMA,
  DRAFT_PROMPT_VERSION,
  draftOutputSchema,
} from '../prompts/draft.prompt.v2.js';
import { getAiProvider } from '../providers/index.js';

const WORDING_TO_CHECK = /\b(overdue|delayed|flagged)\b/gi;
const UNKNOWN_FAILURE = 'INTERNAL_ERROR';

function unique(values) {
  return [...new Set(values)];
}

function lastAuthorMessage(messages) {
  return messages.findLast((message) => message.senderRole === UserRole.AUTHOR) ?? null;
}

function normalise(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function placeholderHints(reply) {
  return findPlaceholders(reply).map((placeholder) => `Replace ${placeholder} before sending.`);
}

function wordingHints(reply) {
  const words = unique((reply.match(WORDING_TO_CHECK) ?? []).map((word) => word.toLowerCase()));
  return words.map((word) => `The reply uses the word "${word}". Check it is accurate before sending.`);
}

async function completeWithFallback(ticketId, prompt) {
  let lastError;

  for (const model of unique([MODELS.DRAFT, MODELS.FALLBACK])) {
    try {
      return await getAiProvider().complete({
        task: AiTask.DRAFT,
        ticketId,
        promptVersion: DRAFT_PROMPT_VERSION,
        model,
        ...prompt,
        jsonSchema: DRAFT_JSON_SCHEMA,
        schemaName: 'support_reply',
        outputSchema: draftOutputSchema,
        maxTokens: MAX_OUTPUT_TOKENS.DRAFT,
        reasoningEffort: REASONING_EFFORT.DRAFT,
        temperature: TEMPERATURE.DRAFT,
        timeoutMs: TIMEOUTS_MS.DRAFT,
      });
    } catch (error) {
      lastError = error;
      if (error instanceof AiDisabledError) break;
    }
  }

  throw lastError;
}

async function announceDraftUpdate(ticket) {
  try {
    await publishEvent({ type: EVENT_TYPES.TICKET_DRAFT_UPDATED, ticketId: ticket.id, authorId: ticket.authorId });
  } catch (error) {
    logger.warn({ err: error, ticketId: ticket.id }, 'Could not announce the draft update');
  }
}

async function loadTicket(ticketId) {
  const ticket = await getTicketForAi(ticketId);
  if (!ticket) {
    throw new TicketNotFoundError();
  }
  return ticket;
}

export function enqueueDraft(ticketId) {
  return enqueue(QUEUES.AI_DRAFT, { ticketId }, { singletonKey: ticketId });
}

export async function generateDraft(ticketId, { requestedBy = null, instructions = null } = {}, now = new Date()) {
  const ticket = await getTicketForAi(ticketId);
  if (!ticket) return null;

  const draft = await aiQuery.createDraft({
    ticketId,
    basedOnMessageId: lastAuthorMessage(ticket.messages)?.id ?? null,
    categoryAtGeneration: ticket.category,
    promptVersion: DRAFT_PROMPT_VERSION,
    instructions,
    requestedById: requestedBy,
  });

  try {
    const royaltySummary = await getAuthorRoyaltySummary(ticket.authorId, now);
    const facts = buildFacts({
      authorName: ticket.author.user.name,
      book: ticket.book,
      royaltySummary,
      supportEmail: SUPPORT_EMAIL,
      now,
    });
    const prompt = buildDraftPrompt({ ticket, facts, messages: ticket.messages, instructions });
    const result = await completeWithFallback(ticketId, prompt);

    const internalHints = unique([
      ...result.data.internalHints,
      ...facts.flags.map((flag) => FLAG_HINTS[flag]),
      ...placeholderHints(result.data.reply),
      ...wordingHints(result.data.reply),
    ]);

    const ready = await aiQuery.completeDraft(draft.id, { content: result.data.reply, internalHints, model: result.model });
    await announceDraftUpdate(ticket);
    return ready;
  } catch (error) {
    await aiQuery.failDraft(draft.id, error.outcome ?? UNKNOWN_FAILURE);
    await announceDraftUpdate(ticket);
    throw error;
  }
}

export async function getCurrentDraft(ticketId) {
  const ticket = await loadTicket(ticketId);
  const draft = await aiQuery.findLatestDraft(ticket.id);
  if (!draft) return null;

  const latestAuthorMessageId = lastAuthorMessage(ticket.messages)?.id ?? null;
  const isStale = draft.categoryAtGeneration !== ticket.category || draft.basedOnMessageId !== latestAuthorMessageId;
  return { draft, isStale };
}

export async function requestRegeneration(admin, ticketId, { instructions = null } = {}, now = new Date()) {
  const ticket = await loadTicket(ticketId);

  const since = new Date(now.getTime() - REGENERATE_LIMIT.WINDOW_MS);
  if ((await aiQuery.countRegenerationsSince(ticket.id, since)) >= REGENERATE_LIMIT.MAX) {
    throw new RegenerateLimitError();
  }

  await enqueue(
    QUEUES.AI_DRAFT,
    { ticketId: ticket.id, requestedBy: admin.userId, instructions },
    { singletonKey: `${ticket.id}:regenerate` },
  );
  return { status: DraftStatus.PENDING };
}

export async function sendDraft(admin, ticketId, { draftId, body }) {
  const draft = await aiQuery.findDraft(ticketId, draftId);
  if (!draft || draft.status !== DraftStatus.READY) {
    throw new DraftNotFoundError();
  }
  if (draft.sentMessageId) {
    throw new DraftAlreadySentError();
  }

  const message = await addMessage(admin, ticketId, { body });
  const usage = normalise(body) === normalise(draft.content) ? DraftUsage.UNCHANGED : DraftUsage.EDITED;
  await aiQuery.markDraftSent(draft.id, { usage, messageId: message.id });

  return message;
}
