import { DUE_SOON_FRACTION, SLA_HOURS } from './ticket.constants.js';
import { TicketStatus } from './ticket.enums.js';

const ONE_HOUR_MS = 60 * 60 * 1000;
const AWAITING_RESPONSE_STATUSES = new Set([TicketStatus.OPEN, TicketStatus.IN_PROGRESS]);

export function slaDueAt(createdAt, priority) {
  return new Date(createdAt.getTime() + SLA_HOURS[priority] * ONE_HOUR_MS);
}

export function slaState(ticket, now = new Date()) {
  const isWaitingForFirstResponse = !ticket.firstResponseAt && AWAITING_RESPONSE_STATUSES.has(ticket.status);
  if (!isWaitingForFirstResponse) {
    return { isOverdue: false, isDueSoon: false };
  }

  const remainingMs = ticket.slaDueAt.getTime() - now.getTime();
  const windowMs = ticket.slaDueAt.getTime() - ticket.createdAt.getTime();

  return {
    isOverdue: remainingMs < 0,
    isDueSoon: remainingMs >= 0 && remainingMs < windowMs * DUE_SOON_FRACTION,
  };
}
