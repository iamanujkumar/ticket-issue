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
