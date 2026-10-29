export const SLA_HOURS = Object.freeze({
  CRITICAL: 4,
  HIGH: 24,
  MEDIUM: 48,
  LOW: 72,
});

export const DUE_SOON_FRACTION = 0.25;

export const SUBJECT_LIMITS = Object.freeze({ MIN: 5, MAX: 200 });

export const DESCRIPTION_LIMITS = Object.freeze({ MIN: 20, MAX: 5000 });

export const REPLY_LIMITS = Object.freeze({ MIN: 1, MAX: 5000 });

export const SEARCH_MAX_LENGTH = 100;

export const PAGE_SIZE = Object.freeze({ DEFAULT: 20, MAX: 100 });

export const TICKET_NUMBER_PREFIX = 'BL-';

export const TICKET_NUMBER_DIGITS = 6;

export const QUEUE_SORTS = Object.freeze({
  QUEUE: 'queue',
  NEWEST: 'newest',
  OLDEST: 'oldest',
  UPDATED: 'updated',
});

export const ASSIGNEE_FILTERS = Object.freeze({
  ME: 'me',
  UNASSIGNED: 'unassigned',
});
