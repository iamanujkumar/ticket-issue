import { prisma } from '../../core/database/prisma.js';
import { ForbiddenError, ValidationError } from '../../core/errors/app_error.js';
import { enqueue } from '../../core/queue/job_queue.js';
import { QUEUES } from '../../core/queue/queues.js';
import { UserRole } from '../auth_module/auth.enums.js';
import { getActiveAdmin } from '../auth_module/auth.service.js';
import { BookNotFoundError } from '../book_module/book.errors.js';
import { getOwnedBook } from '../book_module/book.service.js';
import { ClassificationSource, TicketEventType, TicketStatus } from './ticket.enums.js';
import {
  InvalidAssigneeError,
  TicketClosedError,
  TicketNotFoundError,
  UnresolvedPlaceholdersError,
  VersionConflictError,
} from './ticket.errors.js';
import { toAdminTicket, toAuthorTicket, toEvent, toMessage, toNote } from './ticket.mapper.js';
import * as ticketQuery from './ticket.query.js';
import { classifyByRules } from './ticket.rules_triage.js';
import { slaDueAt } from './ticket.sla.js';
import { assertTransition, transitionChanges } from './ticket.state_machine.js';

const PLACEHOLDER_PATTERN = /\[[^\]\n]{1,60}\]/g;
const EVENT_VALUE_MAX_LENGTH = 80;

function isAdmin(user) {
  return user.role === UserRole.ADMIN;
}

function ownAuthorId(user) {
  if (!user.authorId) {
    throw new ForbiddenError();
  }
  return user.authorId;
}

function requireAdmin(user) {
  if (!isAdmin(user)) {
    throw new ForbiddenError();
  }
}

function present(user, ticket, now) {
  return isAdmin(user) ? toAdminTicket(ticket, now) : toAuthorTicket(ticket);
}

function eventValue(value) {
  return value === null || value === undefined ? null : String(value).slice(0, EVENT_VALUE_MAX_LENGTH);
}

function event(type, actorId, from, to) {
  return { type, actorId, fromValue: eventValue(from), toValue: eventValue(to) };
}

function withTicketId(events, ticketId, now) {
  return events.map((item, index) => ({ ...item, ticketId, createdAt: new Date(now.getTime() + index) }));
}

async function loadTicket(user, ticketId) {
  const authorId = isAdmin(user) ? undefined : ownAuthorId(user);
  const ticket = await ticketQuery.findTicketById(ticketId, { authorId });
  if (!ticket) {
    throw new TicketNotFoundError();
  }
  return ticket;
}

async function assertBookBelongsToAuthor(authorId, bookId) {
  try {
    await getOwnedBook(authorId, bookId);
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      throw new ValidationError({ details: [{ path: 'body.bookId', message: 'Choose one of your own books' }] });
    }
    throw error;
  }
}

function saveChanges(ticketId, { expectedVersion, data, events, now }) {
  return prisma.$transaction(async (tx) => {
    const updated = await ticketQuery.updateTicket(ticketId, { expectedVersion, data }, tx);
    if (!updated) {
      throw new VersionConflictError();
    }
    await ticketQuery.createEvents(withTicketId(events, ticketId, now), tx);
    return updated;
  });
}

function applyStatus(ticket, to, role, actorId, now, data, events) {
  const current = { ...ticket, ...data };
  assertTransition(current.status, to, role);
  Object.assign(data, transitionChanges(current, to, now));
  events.push(event(TicketEventType.STATUS_CHANGED, actorId, current.status, to));
}

async function resolveAssignee(assigneeId) {
  if (assigneeId === null) return null;
  const admin = await getActiveAdmin(assigneeId);
  if (!admin) {
    throw new InvalidAssigneeError();
  }
  return admin;
}

async function adminChanges(ticket, changes, actorId, now) {
  const data = {};
  const events = [];

  if (changes.status !== undefined) {
    applyStatus(ticket, changes.status, UserRole.ADMIN, actorId, now, data, events);
  }

  if (changes.category !== undefined) {
    data.categorySource = ClassificationSource.ADMIN;
    if (changes.category !== ticket.category) {
      data.category = changes.category;
      events.push(event(TicketEventType.CATEGORY_CHANGED, actorId, ticket.category, changes.category));
    }
  }

  if (changes.priority !== undefined) {
    data.prioritySource = ClassificationSource.ADMIN;
    if (changes.priority !== ticket.priority) {
      data.priority = changes.priority;
      events.push(event(TicketEventType.PRIORITY_CHANGED, actorId, ticket.priority, changes.priority));
      if (!ticket.firstResponseAt) {
        data.slaDueAt = slaDueAt(ticket.createdAt, changes.priority);
      }
    }
  }

  if (changes.assigneeId !== undefined && changes.assigneeId !== ticket.assigneeId) {
    const assignee = await resolveAssignee(changes.assigneeId);
    data.assigneeId = changes.assigneeId;
    events.push(
      assignee
        ? event(TicketEventType.ASSIGNED, actorId, ticket.assignee?.name, assignee.name)
        : event(TicketEventType.UNASSIGNED, actorId, ticket.assignee?.name, null),
    );
    if (assignee && (data.status ?? ticket.status) === TicketStatus.OPEN) {
      applyStatus(ticket, TicketStatus.IN_PROGRESS, UserRole.ADMIN, actorId, now, data, events);
    }
  }

  return { data, events };
}

function authorChanges(ticket, changes, actorId, now) {
  const { status, ...otherFields } = changes;
  const triesOtherFields = ['category', 'priority', 'assigneeId'].some((field) => otherFields[field] !== undefined);
  if (status !== TicketStatus.CLOSED || triesOtherFields) {
    throw new ForbiddenError({ message: 'Authors can only close their own tickets.' });
  }

  const data = {};
  const events = [];
  applyStatus(ticket, TicketStatus.CLOSED, UserRole.AUTHOR, actorId, now, data, events);
  return { data, events };
}

function findPlaceholders(body) {
  return [...new Set(body.match(PLACEHOLDER_PATTERN) ?? [])];
}

export async function createTicket(user, { bookId, subject, description }, now = new Date()) {
  const authorId = ownAuthorId(user);
  if (bookId) {
    await assertBookBelongsToAuthor(authorId, bookId);
  }

  const { category, priority } = classifyByRules({ subject, description });

  const ticket = await prisma.$transaction(async (tx) => {
    const created = await ticketQuery.createTicket(
      {
        authorId,
        bookId,
        subject,
        description,
        category,
        categorySource: ClassificationSource.RULES,
        priority,
        prioritySource: ClassificationSource.RULES,
        slaDueAt: slaDueAt(now, priority),
        createdAt: now,
        lastActivityAt: now,
      },
      tx,
    );
    await ticketQuery.createEvents(withTicketId([event(TicketEventType.CREATED, user.userId)], created.id, now), tx);
    await enqueue(QUEUES.AI_TRIAGE, { ticketId: created.id }, { tx, singletonKey: created.id });
    return created;
  });

  return toAuthorTicket(ticket);
}

export async function listTickets(user, query, now = new Date()) {
  const { page, pageSize, sort, ...filters } = query;

  const { tickets, total } = isAdmin(user)
    ? await ticketQuery.listQueue(filters, { page, pageSize, sort, adminId: user.userId, now })
    : await ticketQuery.listAuthorTickets(ownAuthorId(user), { page, pageSize });

  return {
    tickets: tickets.map((ticket) => present(user, ticket, now)),
    meta: { page, pageSize, total },
  };
}

export async function getTicket(user, ticketId, now = new Date()) {
  return present(user, await loadTicket(user, ticketId), now);
}

export async function updateTicket(user, ticketId, changes, now = new Date()) {
  const ticket = await loadTicket(user, ticketId);

  if (isAdmin(user) && changes.version === undefined) {
    throw new ValidationError({ details: [{ path: 'body.version', message: 'Version is required' }] });
  }

  const { data, events } = isAdmin(user)
    ? await adminChanges(ticket, changes, user.userId, now)
    : authorChanges(ticket, changes, user.userId, now);

  if (Object.keys(data).length === 0) {
    return present(user, ticket, now);
  }

  const updated = await saveChanges(ticket.id, {
    expectedVersion: isAdmin(user) ? changes.version : undefined,
    data: { ...data, lastActivityAt: now },
    events,
    now,
  });
  return present(user, updated, now);
}

export async function addMessage(user, ticketId, { body }, now = new Date()) {
  const ticket = await loadTicket(user, ticketId);
  if (ticket.status === TicketStatus.CLOSED) {
    throw new TicketClosedError();
  }

  const fromAdmin = isAdmin(user);
  if (fromAdmin) {
    const placeholders = findPlaceholders(body);
    if (placeholders.length > 0) {
      throw new UnresolvedPlaceholdersError(placeholders);
    }
  }

  const data = { lastActivityAt: now };
  const events = [event(TicketEventType.REPLIED, user.userId)];

  if (fromAdmin && !ticket.firstResponseAt) {
    data.firstResponseAt = now;
  }
  if (fromAdmin && ticket.status === TicketStatus.OPEN) {
    Object.assign(data, transitionChanges(ticket, TicketStatus.IN_PROGRESS, now));
    events.push(event(TicketEventType.STATUS_CHANGED, user.userId, TicketStatus.OPEN, TicketStatus.IN_PROGRESS));
  }
  if (!fromAdmin && ticket.status === TicketStatus.RESOLVED) {
    Object.assign(data, transitionChanges(ticket, TicketStatus.OPEN, now));
    events.push(event(TicketEventType.REOPENED, user.userId, TicketStatus.RESOLVED, TicketStatus.OPEN));
  }

  const message = await prisma.$transaction(async (tx) => {
    const created = await ticketQuery.createMessage(
      { ticketId: ticket.id, senderId: user.userId, senderRole: user.role, body, createdAt: now },
      tx,
    );
    await ticketQuery.updateTicket(ticket.id, { data }, tx);
    await ticketQuery.createEvents(withTicketId(events, ticket.id, now), tx);
    return created;
  });

  return toMessage(message, { forAuthor: !fromAdmin });
}

export async function listMessages(user, ticketId) {
  const ticket = await loadTicket(user, ticketId);
  const messages = await ticketQuery.listMessages(ticket.id);
  return messages.map((message) => toMessage(message, { forAuthor: !isAdmin(user) }));
}

export async function addNote(user, ticketId, { body }, now = new Date()) {
  requireAdmin(user);
  const ticket = await loadTicket(user, ticketId);

  const note = await prisma.$transaction(async (tx) => {
    const created = await ticketQuery.createNote({ ticketId: ticket.id, adminId: user.userId, body, createdAt: now }, tx);
    await ticketQuery.createEvents(withTicketId([event(TicketEventType.NOTE_ADDED, user.userId)], ticket.id, now), tx);
    return created;
  });

  return toNote(note);
}

export async function listNotes(user, ticketId) {
  requireAdmin(user);
  const ticket = await loadTicket(user, ticketId);
  return (await ticketQuery.listNotes(ticket.id)).map(toNote);
}

export async function listEvents(user, ticketId) {
  requireAdmin(user);
  const ticket = await loadTicket(user, ticketId);
  return (await ticketQuery.listEvents(ticket.id)).map(toEvent);
}
