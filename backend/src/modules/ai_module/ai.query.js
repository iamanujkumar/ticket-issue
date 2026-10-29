import { prisma } from '../../core/database/prisma.js';
import { DraftStatus } from './ai.enums.js';

export function logInvocation(row) {
  return prisma.aiInvocation.create({ data: row });
}

export function createDraft(data) {
  return prisma.aiDraft.create({ data: { ...data, status: DraftStatus.PENDING } });
}

export function completeDraft(draftId, { content, internalHints, model }) {
  return prisma.aiDraft.update({
    where: { id: draftId },
    data: { status: DraftStatus.READY, content, internalHints, model },
  });
}

export function failDraft(draftId, errorCode) {
  return prisma.aiDraft.update({
    where: { id: draftId },
    data: { status: DraftStatus.FAILED, errorCode },
  });
}

export function findLatestDraft(ticketId) {
  return prisma.aiDraft.findFirst({
    where: { ticketId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
}

export function findDraft(ticketId, draftId) {
  return prisma.aiDraft.findFirst({ where: { id: draftId, ticketId } });
}

export function markDraftSent(draftId, { usage, messageId }) {
  return prisma.aiDraft.update({
    where: { id: draftId },
    data: { usage, sentMessageId: messageId },
  });
}

export function countRegenerationsSince(ticketId, since) {
  return prisma.aiDraft.count({
    where: { ticketId, requestedById: { not: null }, createdAt: { gte: since } },
  });
}

export async function aiStats({ since }) {
  const [calls, [tickets], [drafts]] = await Promise.all([
    prisma.$queryRaw`
      SELECT
        task::text AS task,
        outcome::text AS outcome,
        count(*)::int AS calls,
        coalesce(sum(input_tokens), 0)::int AS input_tokens,
        coalesce(sum(cached_input_tokens), 0)::int AS cached_input_tokens,
        coalesce(sum(output_tokens), 0)::int AS output_tokens,
        coalesce(sum(estimated_cost_usd), 0)::float8 AS cost_usd,
        coalesce(sum(latency_ms), 0)::int AS latency_ms
      FROM ai_invocations
      WHERE created_at >= ${since}
      GROUP BY task, outcome`,
    prisma.$queryRaw`SELECT count(DISTINCT ticket_id)::int AS count FROM ai_invocations WHERE created_at >= ${since}`,
    prisma.$queryRaw`
      SELECT
        count(*) FILTER (WHERE status = 'READY')::int AS ready,
        count(*) FILTER (WHERE status = 'FAILED')::int AS failed,
        count(*) FILTER (WHERE usage = 'UNCHANGED')::int AS sent_unchanged,
        count(*) FILTER (WHERE usage = 'EDITED')::int AS sent_edited
      FROM ai_drafts
      WHERE created_at >= ${since}`,
  ]);

  return { calls, ticketCount: tickets.count, drafts };
}
