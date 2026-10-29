import { applyAiTriage, getTicketForAi, markTriageFailed } from '../../ticket_module/ticket.service.js';
import {
  LOW_CONFIDENCE,
  MAX_OUTPUT_TOKENS,
  MODELS,
  REASONING_EFFORT,
  TEMPERATURE,
  TIMEOUTS_MS,
} from '../ai.constants.js';
import { AiTask } from '../ai.enums.js';
import { enqueueDraft } from '../drafts/draft.service.js';
import {
  buildTriagePrompt,
  TRIAGE_JSON_SCHEMA,
  TRIAGE_PROMPT_VERSION,
  triageOutputSchema,
} from '../prompts/triage.prompt.v2.js';
import { getAiProvider } from '../providers/index.js';

export async function triageTicket(ticketId) {
  const ticket = await getTicketForAi(ticketId);
  if (!ticket) return null;

  const result = await getAiProvider().complete({
    task: AiTask.TRIAGE,
    ticketId,
    promptVersion: TRIAGE_PROMPT_VERSION,
    model: MODELS.TRIAGE,
    ...buildTriagePrompt(ticket),
    jsonSchema: TRIAGE_JSON_SCHEMA,
    schemaName: 'ticket_triage',
    outputSchema: triageOutputSchema,
    maxTokens: MAX_OUTPUT_TOKENS.TRIAGE,
    reasoningEffort: REASONING_EFFORT.TRIAGE,
    temperature: TEMPERATURE.TRIAGE,
    timeoutMs: TIMEOUTS_MS.TRIAGE,
  });

  await applyAiTriage(ticketId, { ...result.data, needsReview: result.data.confidence < LOW_CONFIDENCE });
  await enqueueDraft(ticketId);
  return result.data;
}

export async function failTriage(ticketId) {
  const ticket = await markTriageFailed(ticketId);
  if (ticket) {
    await enqueueDraft(ticketId);
  }
}
