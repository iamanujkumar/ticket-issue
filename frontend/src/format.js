const EMPTY = '—';
const TIME_ZONE = 'Asia/Kolkata';
const LOCALE = 'en-IN';

const dateFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short', timeZone: TIME_ZONE });
const relativeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });

const RELATIVE_UNITS = [
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
];

export function formatMoney(money) {
  if (!money) {
    return EMPTY;
  }
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: money.currency }).format(money.amountMinor / 100);
}

export function formatDate(isoDate) {
  return isoDate ? dateFormat.format(new Date(`${isoDate}T00:00:00Z`)) : EMPTY;
}

export function formatDateTime(isoTime) {
  return isoTime ? dateTimeFormat.format(new Date(isoTime)) : EMPTY;
}

export function timeAgo(isoTime, now = new Date()) {
  const elapsedMs = now.getTime() - new Date(isoTime).getTime();
  const [unit, unitMs] = RELATIVE_UNITS.find(([, ms]) => elapsedMs >= ms) ?? RELATIVE_UNITS.at(-1);
  return relativeFormat.format(-Math.floor(elapsedMs / unitMs), unit);
}

export const TICKET_STATUS = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const TICKET_CATEGORY = {
  ROYALTY_PAYMENTS: 'Royalty & Payments',
  ISBN_METADATA: 'ISBN & Metadata Issues',
  PRINTING_QUALITY: 'Printing & Quality',
  DISTRIBUTION_AVAILABILITY: 'Distribution & Availability',
  BOOK_STATUS_PRODUCTION: 'Book Status & Production Updates',
  GENERAL_INQUIRY: 'General Inquiry',
};

export const TICKET_PRIORITY = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

export const BOOK_STATUS = {
  PUBLISHED: 'Published & Live',
  IN_PRODUCTION: 'In Production',
};

export const PRODUCTION_STAGE = {
  MANUSCRIPT_RECEIVED: 'Manuscript Received',
  EDITING: 'Editing',
  COVER_DESIGN: 'Cover Design',
  TYPESETTING: 'Typesetting',
  PROOFREADING: 'Proofreading',
  ISBN_ASSIGNMENT: 'ISBN Assignment',
  PRINTING: 'Printing',
  DISTRIBUTION_SETUP: 'Distribution Setup',
};

export function label(labels, value) {
  return value ? (labels[value] ?? value) : EMPTY;
}
