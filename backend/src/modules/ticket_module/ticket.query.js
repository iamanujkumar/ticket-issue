import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { ASSIGNEE_FILTERS, QUEUE_SORTS } from './ticket.constants.js';

const TICKET_DETAILS = {
  author: { select: { id: true, user: { select: { name: true } } } },
  book: { select: { id: true, code: true, title: true } },
  assignee: { select: { id: true, name: true } },
};

const SENDER_NAME = { sender: { select: { name: true } } };
const ADMIN_NAME = { admin: { select: { id: true, name: true } } };
const ACTOR_NAME = { actor: { select: { id: true, name: true } } };

const TICKET_NUMBER_PATTERN = /^(?:bl-?)?0*(\d{1,9})$/i;

const UNRESOLVED_SQL = Prisma.sql`t.status IN ('OPEN', 'IN_PROGRESS')`;

function overdueSql(now) {
  return Prisma.sql`(t.first_response_at IS NULL AND ${UNRESOLVED_SQL} AND t.sla_due_at < ${now})`;
}

function escapeLike(text) {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function searchSql(q) {
  const pattern = `%${escapeLike(q)}%`;
  const numberMatch = q.match(TICKET_NUMBER_PATTERN);
  const byNumber = numberMatch ? Prisma.sql` OR t.number = ${Number(numberMatch[1])}` : Prisma.empty;
  return Prisma.sql`(t.subject ILIKE ${pattern} OR u.name ILIKE ${pattern}${byNumber})`;
}

function assigneeSql(assignee, adminId) {
  if (assignee === ASSIGNEE_FILTERS.UNASSIGNED) return Prisma.sql`t.assignee_id IS NULL`;
  const assigneeId = assignee === ASSIGNEE_FILTERS.ME ? adminId : assignee;
  return Prisma.sql`t.assignee_id = ${assigneeId}::uuid`;
}

function queueConditions(filters, { adminId, now }) {
  const conditions = [];

  if (filters.status) conditions.push(Prisma.sql`t.status::text IN (${Prisma.join(filters.status)})`);
  if (filters.category) conditions.push(Prisma.sql`t.category::text IN (${Prisma.join(filters.category)})`);
  if (filters.priority) conditions.push(Prisma.sql`t.priority::text IN (${Prisma.join(filters.priority)})`);
  if (filters.assignee) conditions.push(assigneeSql(filters.assignee, adminId));
  if (filters.createdFrom) conditions.push(Prisma.sql`t.created_at >= ${filters.createdFrom}::date`);
  if (filters.createdTo) conditions.push(Prisma.sql`t.created_at < ${filters.createdTo}::date + 1`);
  if (filters.overdue !== undefined) {
    conditions.push(filters.overdue ? overdueSql(now) : Prisma.sql`NOT ${overdueSql(now)}`);
  }
  if (filters.needsReview !== undefined) conditions.push(Prisma.sql`t.needs_review = ${filters.needsReview}`);
  if (filters.q) conditions.push(searchSql(filters.q));

  return conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
}

function queueOrder(sort, now) {
  switch (sort) {
    case QUEUE_SORTS.NEWEST:
      return Prisma.sql`ORDER BY t.created_at DESC, t.id`;
    case QUEUE_SORTS.OLDEST:
      return Prisma.sql`ORDER BY t.created_at ASC, t.id`;
    case QUEUE_SORTS.UPDATED:
      return Prisma.sql`ORDER BY t.last_activity_at DESC, t.id`;
    default:
      return Prisma.sql`ORDER BY ${UNRESOLVED_SQL} DESC, ${overdueSql(now)} DESC, t.priority ASC, t.created_at ASC, t.id`;
  }
}

function sortByIdOrder(rows, ids) {
  const position = new Map(ids.map((id, index) => [id, index]));
  return rows.sort((a, b) => position.get(a.id) - position.get(b.id));
}

export function createTicket(data, tx) {
  return tx.ticket.create({ data, include: TICKET_DETAILS });
}

export function findTicketById(ticketId, { authorId } = {}) {
  return prisma.ticket.findFirst({ where: { id: ticketId, authorId }, include: TICKET_DETAILS });
}

export function findTicketForAi(ticketId) {
  return prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      author: { select: { id: true, user: { select: { name: true } } } },
      book: { include: { platforms: { select: { platform: true }, orderBy: { platform: 'asc' } } } },
      messages: { select: { id: true, senderRole: true, body: true, createdAt: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
    },
  });
}

export async function listAuthorTickets(authorId, { page, pageSize }) {
  const where = { authorId };
  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: TICKET_DETAILS,
      orderBy: [{ lastActivityAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ticket.count({ where }),
  ]);
  return { tickets, total };
}

export async function listQueue(filters, { page, pageSize, sort, adminId, now }) {
  const from = Prisma.sql`FROM tickets t JOIN authors a ON a.id = t.author_id JOIN users u ON u.id = a.user_id`;
  const where = queueConditions(filters, { adminId, now });

  const [idRows, countRows] = await Promise.all([
    prisma.$queryRaw`SELECT t.id ${from} ${where} ${queueOrder(sort, now)} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    prisma.$queryRaw`SELECT count(*)::int AS total ${from} ${where}`,
  ]);

  const ids = idRows.map((row) => row.id);
  const tickets = ids.length
    ? await prisma.ticket.findMany({ where: { id: { in: ids } }, include: TICKET_DETAILS })
    : [];

  return { tickets: sortByIdOrder(tickets, ids), total: countRows[0].total };
}

export async function updateTicket(ticketId, { expectedVersion, data }, tx) {
  const { count } = await tx.ticket.updateMany({
    where: { id: ticketId, version: expectedVersion },
    data: { ...data, version: { increment: 1 } },
  });
  if (count === 0) return null;
  return tx.ticket.findUnique({ where: { id: ticketId }, include: TICKET_DETAILS });
}

export function createMessage(data, tx) {
  return tx.ticketMessage.create({ data, include: SENDER_NAME });
}

export function listMessages(ticketId) {
  return prisma.ticketMessage.findMany({
    where: { ticketId },
    include: SENDER_NAME,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

export function createNote(data, tx) {
  return tx.internalNote.create({ data, include: ADMIN_NAME });
}

export function listNotes(ticketId) {
  return prisma.internalNote.findMany({
    where: { ticketId },
    include: ADMIN_NAME,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

export function createEvents(events, tx) {
  return tx.ticketEvent.createMany({ data: events });
}

export function listEvents(ticketId) {
  return prisma.ticketEvent.findMany({
    where: { ticketId },
    include: ACTOR_NAME,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}
