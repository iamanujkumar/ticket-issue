import { BookStatus, Platform, PrintPartner, ProductionStage } from '../../book_module/book.enums.js';
import { toIsoDate } from '../../book_module/book.mapper.js';
import {
  lastSettledQuarterEnd,
  quarterEnd,
  toBusinessDate,
  upcomingPayoutQuarter,
} from '../../book_module/book.royalty_calendar.js';

export const FACT_FLAGS = Object.freeze({
  BOOK_IN_PRODUCTION: 'BOOK_IN_PRODUCTION',
  ISBN_BEFORE_ASSIGNMENT_STAGE: 'ISBN_BEFORE_ASSIGNMENT_STAGE',
  POSSIBLE_PAYOUT_DELAY: 'POSSIBLE_PAYOUT_DELAY',
  BELOW_PAYOUT_THRESHOLD: 'BELOW_PAYOUT_THRESHOLD',
});

export const FLAG_HINTS = Object.freeze({
  [FACT_FLAGS.BOOK_IN_PRODUCTION]: 'The book is still in production, so it has no sales or royalty yet.',
  [FACT_FLAGS.ISBN_BEFORE_ASSIGNMENT_STAGE]:
    'This book already has an ISBN although it has not reached the ISBN Assignment stage. Verify the ISBN before replying.',
  [FACT_FLAGS.POSSIBLE_PAYOUT_DELAY]:
    'Pending royalty is above the payout threshold and no payout is recorded for a quarter whose deadline has passed. Check the payout records.',
  [FACT_FLAGS.BELOW_PAYOUT_THRESHOLD]:
    "The author's total pending royalty is below the ₹1,000 payout threshold, so it rolls over to the next quarter.",
});

const PLATFORM_LABELS = {
  [Platform.AMAZON_IN]: 'Amazon India',
  [Platform.FLIPKART]: 'Flipkart',
  [Platform.AMAZON_US]: 'Amazon US',
  [Platform.AMAZON_UK]: 'Amazon UK',
  [Platform.BOOKLEAF_STORE]: 'BookLeaf Store',
};

const PRINT_PARTNER_LABELS = {
  [PrintPartner.IN_HOUSE]: 'In-House (Delhi)',
  [PrintPartner.REPRO_INDIA]: 'Repro India',
  [PrintPartner.EPITOME_BOOKS]: 'Epitome Books',
};

const STAGE_LABELS = {
  [ProductionStage.MANUSCRIPT_RECEIVED]: 'Manuscript Received',
  [ProductionStage.EDITING]: 'Editing',
  [ProductionStage.COVER_DESIGN]: 'Cover Design',
  [ProductionStage.TYPESETTING]: 'Typesetting',
  [ProductionStage.PROOFREADING]: 'Proofreading',
  [ProductionStage.ISBN_ASSIGNMENT]: 'ISBN Assignment',
  [ProductionStage.PRINTING]: 'Printing',
  [ProductionStage.DISTRIBUTION_SETUP]: 'Distribution Setup',
};

const STAGE_ORDER = Object.keys(STAGE_LABELS);

const RUPEE_FORMAT = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export function formatRupees(amountMinor) {
  return amountMinor === null || amountMinor === undefined ? null : `₹${RUPEE_FORMAT.format(amountMinor / 100)}`;
}

function firstNameOf(fullName) {
  return fullName.trim().split(/\s+/)[0];
}

function isInProduction(book) {
  return book?.status === BookStatus.IN_PRODUCTION;
}

function hasIsbnBeforeAssignmentStage(book) {
  return (
    isInProduction(book) &&
    Boolean(book.isbn) &&
    STAGE_ORDER.indexOf(book.productionStage) < STAGE_ORDER.indexOf(ProductionStage.ISBN_ASSIGNMENT)
  );
}

function bookFacts(book) {
  if (!book) return null;

  return {
    code: book.code,
    title: book.title,
    status: isInProduction(book) ? `In production — ${STAGE_LABELS[book.productionStage]}` : 'Published & Live',
    isbn: book.isbn,
    publicationDate: toIsoDate(book.publicationDate),
    mrp: formatRupees(book.mrpMinor),
    copiesSold: book.copiesSold,
    royaltyPerCopy: formatRupees(book.royaltyPerCopyMinor),
    royaltyEarned: formatRupees(book.royaltyEarnedMinor),
    royaltyPaid: formatRupees(book.royaltyPaidMinor),
    royaltyPending: formatRupees(book.royaltyPendingMinor),
    lastPayoutDate: toIsoDate(book.lastPayoutDate),
    platforms: (book.platforms ?? []).map(({ platform }) => PLATFORM_LABELS[platform]),
    printPartner: book.printPartner ? PRINT_PARTNER_LABELS[book.printPartner] : null,
  };
}

function payoutReferenceDate(book, royaltySummary) {
  if (!book) return royaltySummary.lastPayoutDate;
  return toIsoDate(book.lastPayoutDate ?? book.publicationDate);
}

function isPossiblyDelayed(book, royaltySummary, now) {
  const meetsThreshold = !royaltySummary.payout.isBelowThreshold;
  const hasPendingOnThisBook = book ? book.royaltyPendingMinor > 0 : royaltySummary.totals.pending.amountMinor > 0;
  const referenceDate = payoutReferenceDate(book, royaltySummary);

  return meetsThreshold && hasPendingOnThisBook && referenceDate !== null && referenceDate < lastSettledQuarterEnd(now);
}

function royaltyFacts(book, royaltySummary, now) {
  return {
    authorPendingTotal: formatRupees(royaltySummary.totals.pending.amountMinor),
    minimumPayoutThreshold: formatRupees(royaltySummary.payout.threshold.amountMinor),
    meetsThreshold: !royaltySummary.payout.isBelowThreshold,
    nextPayoutDeadline: royaltySummary.payout.nextPayout.paidBy,
    nextPayoutCovers: `sales up to ${quarterEnd(upcomingPayoutQuarter(now))}`,
    lastPayoutDate: royaltySummary.lastPayoutDate,
    payoutNeedsVerification: isPossiblyDelayed(book, royaltySummary, now),
  };
}

function flagsFor(book, royalty, royaltySummary) {
  const flags = [];
  if (isInProduction(book)) flags.push(FACT_FLAGS.BOOK_IN_PRODUCTION);
  if (hasIsbnBeforeAssignmentStage(book)) flags.push(FACT_FLAGS.ISBN_BEFORE_ASSIGNMENT_STAGE);
  if (royalty.payoutNeedsVerification) flags.push(FACT_FLAGS.POSSIBLE_PAYOUT_DELAY);
  if (royaltySummary.payout.isBelowThreshold && royaltySummary.totals.pending.amountMinor > 0) {
    flags.push(FACT_FLAGS.BELOW_PAYOUT_THRESHOLD);
  }
  return flags;
}

export function buildFacts({ authorName, book, royaltySummary, now = new Date() }) {
  const royalty = royaltyFacts(book, royaltySummary, now);

  return {
    today: toBusinessDate(now),
    author: { firstName: firstNameOf(authorName) },
    book: bookFacts(book),
    royalty,
    flags: flagsFor(book, royalty, royaltySummary),
  };
}
