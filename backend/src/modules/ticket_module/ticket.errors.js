import { ConflictError, NotFoundError, UnprocessableError } from '../../core/errors/app_error.js';

export const TICKET_ERROR_CODES = Object.freeze({
  TICKET_NOT_FOUND: 'TICKET_NOT_FOUND',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  TICKET_CLOSED: 'TICKET_CLOSED',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  UNRESOLVED_PLACEHOLDERS: 'UNRESOLVED_PLACEHOLDERS',
  INVALID_ASSIGNEE: 'INVALID_ASSIGNEE',
});

export class TicketNotFoundError extends NotFoundError {
  constructor() {
    super({ code: TICKET_ERROR_CODES.TICKET_NOT_FOUND, message: 'Ticket not found.' });
  }
}

export class InvalidStatusTransitionError extends ConflictError {
  constructor(from, to) {
    super({
      code: TICKET_ERROR_CODES.INVALID_STATUS_TRANSITION,
      message: `A ticket cannot move from ${from} to ${to}.`,
      details: { from, to },
    });
  }
}

export class TicketClosedError extends ConflictError {
  constructor() {
    super({
      code: TICKET_ERROR_CODES.TICKET_CLOSED,
      message: 'This ticket is closed. Please raise a new ticket.',
    });
  }
}

export class VersionConflictError extends ConflictError {
  constructor() {
    super({
      code: TICKET_ERROR_CODES.VERSION_CONFLICT,
      message: 'This ticket was updated by someone else. Reload it and try again.',
    });
  }
}

export class UnresolvedPlaceholdersError extends UnprocessableError {
  constructor(placeholders) {
    super({
      code: TICKET_ERROR_CODES.UNRESOLVED_PLACEHOLDERS,
      message: 'The reply still contains placeholders. Replace them before sending.',
      details: { placeholders },
    });
  }
}

export class InvalidAssigneeError extends UnprocessableError {
  constructor() {
    super({
      code: TICKET_ERROR_CODES.INVALID_ASSIGNEE,
      message: 'Tickets can only be assigned to an active admin.',
    });
  }
}
