import { UserRole } from '../auth_module/auth.enums.js';
import { TicketStatus } from './ticket.enums.js';
import { InvalidStatusTransitionError } from './ticket.errors.js';

const { OPEN, IN_PROGRESS, RESOLVED, CLOSED } = TicketStatus;

const ALLOWED_TRANSITIONS = {
  [UserRole.ADMIN]: {
    [OPEN]: [IN_PROGRESS, RESOLVED, CLOSED],
    [IN_PROGRESS]: [OPEN, RESOLVED, CLOSED],
    [RESOLVED]: [OPEN, CLOSED],
    [CLOSED]: [],
  },
  [UserRole.AUTHOR]: {
    [OPEN]: [CLOSED],
    [IN_PROGRESS]: [CLOSED],
    [RESOLVED]: [CLOSED],
    [CLOSED]: [],
  },
};

export function canTransition(from, to, role) {
  return ALLOWED_TRANSITIONS[role]?.[from]?.includes(to) ?? false;
}

export function assertTransition(from, to, role) {
  if (!canTransition(from, to, role)) {
    throw new InvalidStatusTransitionError(from, to);
  }
}

export function transitionChanges(ticket, to, now) {
  const changes = { status: to };

  if (to === RESOLVED) {
    changes.resolvedAt = now;
  }
  if (ticket.status === RESOLVED && (to === OPEN || to === IN_PROGRESS)) {
    changes.resolvedAt = null;
  }
  if (to === CLOSED) {
    changes.closedAt = now;
  }

  return changes;
}
