import { TicketCategory, TicketPriority } from './ticket.enums.js';

const CATEGORY_KEYWORDS = [
  [TicketCategory.ISBN_METADATA, ['isbn', 'metadata', 'wrong book linked', 'imprint']],
  [
    TicketCategory.ROYALTY_PAYMENTS,
    ['royalty', 'royalties', 'payout', 'payment', 'paid', 'bank', 'earning', '₹', 'rupees'],
  ],
  [
    TicketCategory.PRINTING_QUALITY,
    ['print quality', 'printing', 'misprint', 'blurry', 'binding', 'misaligned', 'defect', 'author copies', 'reprint'],
  ],
  [
    TicketCategory.DISTRIBUTION_AVAILABILITY,
    ['unavailable', 'not available', 'out of stock', 'not listed', 'listing', 'not showing on', "can't find my book"],
  ],
  [
    TicketCategory.BOOK_STATUS_PRODUCTION,
    ['typesetting', 'cover design', 'proofread', 'editing', 'production', 'manuscript', 'when will', 'delay', 'stage'],
  ],
];

const ISBN_ERROR_SIGNALS = ['wrong', 'different', 'duplicate', 'incorrect', 'mismatch', 'error', "doesn't match"];

const MISSING_ROYALTY_SIGNALS = [
  "haven't received",
  'have not received',
  'not received',
  "didn't receive",
  'did not receive',
  'never received',
  "haven't been paid",
  'not been paid',
  'no royalty',
  'overdue',
];

const PRINT_DEFECT_SIGNALS = [
  'blurry',
  'misaligned',
  'misprint',
  'defect',
  'binding',
  'torn',
  'smudged',
  'missing pages',
  'faded',
  'terrible',
  'poor quality',
];

const HOW_TO_SIGNALS = ['can i', 'how do i', 'how can i', 'is it possible', 'update', 'change my', 'author bio'];

function normalise(text) {
  return text.toLowerCase().replaceAll('’', "'");
}

function mentionsAny(text, phrases) {
  return phrases.some((phrase) => text.includes(phrase));
}

function categoryOf(text) {
  const match = CATEGORY_KEYWORDS.find(([, keywords]) => mentionsAny(text, keywords));
  return match ? match[0] : TicketCategory.GENERAL_INQUIRY;
}

function priorityOf(category, text) {
  const isUrgent =
    (category === TicketCategory.ISBN_METADATA && mentionsAny(text, ISBN_ERROR_SIGNALS)) ||
    (category === TicketCategory.ROYALTY_PAYMENTS && mentionsAny(text, MISSING_ROYALTY_SIGNALS)) ||
    (category === TicketCategory.PRINTING_QUALITY && mentionsAny(text, PRINT_DEFECT_SIGNALS));

  if (isUrgent) return TicketPriority.HIGH;
  if (category === TicketCategory.GENERAL_INQUIRY && mentionsAny(text, HOW_TO_SIGNALS)) return TicketPriority.LOW;
  return TicketPriority.MEDIUM;
}

export function classifyByRules({ subject, description }) {
  const text = normalise(`${subject} ${description}`);
  const category = categoryOf(text);
  return { category, priority: priorityOf(category, text) };
}
