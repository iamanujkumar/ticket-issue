import { prisma } from '../database/prisma.js';

export const EVENT_CHANNEL = 'bookleaf_events';

export const EVENT_TYPES = Object.freeze({
  TICKET_CREATED: 'ticket.created',
  TICKET_UPDATED: 'ticket.updated',
  TICKET_MESSAGE_CREATED: 'ticket.message.created',
  TICKET_NOTE_CREATED: 'ticket.note.created',
  TICKET_TRIAGED: 'ticket.triaged',
  TICKET_DRAFT_UPDATED: 'ticket.draft.updated',
});

export async function publishEvent({ type, ticketId, authorId, visibleToAuthor = false }, db = prisma) {
  const payload = JSON.stringify({ type, ticketId, authorId, visibleToAuthor });
  await db.$executeRaw`SELECT pg_notify(${EVENT_CHANNEL}, ${payload})`;
}
