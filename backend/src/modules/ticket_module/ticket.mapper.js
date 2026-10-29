import { UserRole } from '../auth_module/auth.enums.js';
import { TICKET_NUMBER_DIGITS, TICKET_NUMBER_PREFIX } from './ticket.constants.js';
import { slaState } from './ticket.sla.js';

const SUPPORT_TEAM_NAME = 'BookLeaf Support';

function toIsoTime(date) {
  return date ? date.toISOString() : null;
}

function toPerson(user) {
  return user ? { id: user.id, name: user.name } : null;
}

function toBookSummary(book) {
  return book ? { id: book.id, code: book.code, title: book.title } : null;
}

export function toTicketNumber(number) {
  return `${TICKET_NUMBER_PREFIX}${String(number).padStart(TICKET_NUMBER_DIGITS, '0')}`;
}

export function toAuthorTicket(ticket) {
  return {
    id: ticket.id,
    ticketNumber: toTicketNumber(ticket.number),
    subject: ticket.subject,
    description: ticket.description,
    status: ticket.status,
    category: ticket.category,
    book: toBookSummary(ticket.book),
    createdAt: toIsoTime(ticket.createdAt),
    lastActivityAt: toIsoTime(ticket.lastActivityAt),
    resolvedAt: toIsoTime(ticket.resolvedAt),
    closedAt: toIsoTime(ticket.closedAt),
  };
}

export function toAdminTicket(ticket, now = new Date()) {
  return {
    ...toAuthorTicket(ticket),
    categorySource: ticket.categorySource,
    priority: ticket.priority,
    prioritySource: ticket.prioritySource,
    ai: {
      category: ticket.aiCategory,
      priority: ticket.aiPriority,
      confidence: ticket.aiConfidence === null ? null : Number(ticket.aiConfidence),
      rationale: ticket.aiRationale,
    },
    triageStatus: ticket.triageStatus,
    needsReview: ticket.needsReview,
    author: { id: ticket.author.id, name: ticket.author.user.name },
    assignee: toPerson(ticket.assignee),
    slaDueAt: toIsoTime(ticket.slaDueAt),
    ...slaState(ticket, now),
    firstResponseAt: toIsoTime(ticket.firstResponseAt),
    version: ticket.version,
  };
}

export function toMessage(message, { forAuthor }) {
  const fromSupport = message.senderRole === UserRole.ADMIN;
  return {
    id: message.id,
    body: message.body,
    senderRole: message.senderRole,
    senderName: forAuthor && fromSupport ? SUPPORT_TEAM_NAME : message.sender.name,
    createdAt: toIsoTime(message.createdAt),
  };
}

export function toNote(note) {
  return {
    id: note.id,
    body: note.body,
    admin: toPerson(note.admin),
    createdAt: toIsoTime(note.createdAt),
  };
}

export function toEvent(event) {
  return {
    id: event.id,
    type: event.type,
    from: event.fromValue,
    to: event.toValue,
    actor: toPerson(event.actor),
    createdAt: toIsoTime(event.createdAt),
  };
}
