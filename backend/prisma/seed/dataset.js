import { z } from 'zod';
import { BookStatus, Platform, PrintPartner, ProductionStage } from '../../src/modules/book_module/book.enums.js';

const PUBLISHED_LABEL = 'Published & Live';
const IN_PRODUCTION_PREFIX = 'In Production - ';

const PLATFORM_BY_LABEL = {
  'Amazon India': Platform.AMAZON_IN,
  Flipkart: Platform.FLIPKART,
  'Amazon US': Platform.AMAZON_US,
  'Amazon UK': Platform.AMAZON_UK,
  'BookLeaf Store': Platform.BOOKLEAF_STORE,
};

const PRINT_PARTNER_BY_LABEL = {
  'In-House': PrintPartner.IN_HOUSE,
  'Repro India': PrintPartner.REPRO_INDIA,
  'Epitome Books': PrintPartner.EPITOME_BOOKS,
};

const PRODUCTION_STAGE_BY_LABEL = {
  'Manuscript Received': ProductionStage.MANUSCRIPT_RECEIVED,
  Editing: ProductionStage.EDITING,
  'Cover Design': ProductionStage.COVER_DESIGN,
  Typesetting: ProductionStage.TYPESETTING,
  Proofreading: ProductionStage.PROOFREADING,
  'ISBN Assignment': ProductionStage.ISBN_ASSIGNMENT,
  Printing: ProductionStage.PRINTING,
  'Distribution Setup': ProductionStage.DISTRIBUTION_SETUP,
};

const isoDate = z.iso.date();
const rupees = z.number().nonnegative();

const rawBookSchema = z
  .object({
    book_id: z.string().regex(/^BK\d{3}$/),
    title: z.string().min(1),
    isbn: z.string().min(1).nullable(),
    genre: z.string().min(1),
    publication_date: isoDate.nullable(),
    status: z.string().min(1),
    mrp: rupees.nullable(),
    author_royalty_per_copy: rupees.nullable(),
    total_copies_sold: z.number().int().nonnegative(),
    total_royalty_earned: rupees,
    royalty_paid: rupees,
    royalty_pending: rupees,
    last_royalty_payout_date: isoDate.nullable(),
    print_partner: z.enum(Object.keys(PRINT_PARTNER_BY_LABEL)).nullable(),
    available_on: z.array(z.enum(Object.keys(PLATFORM_BY_LABEL))),
  })
  .strict();

const rawAuthorSchema = z
  .object({
    author_id: z.string().regex(/^AUTH\d{3}$/),
    name: z.string().min(1),
    email: z.email(),
    phone: z.string().min(1).nullable(),
    city: z.string().min(1).nullable(),
    joined_date: isoDate,
    books: z.array(rawBookSchema),
  })
  .strict();

const rawDatasetSchema = z.object({ authors: z.array(rawAuthorSchema).min(1) }).strict();

export class DatasetError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DatasetError';
  }
}

function toPaise(amount, field, bookCode) {
  if (amount === null) return null;
  const paise = Math.round(amount * 100);
  if (Math.abs(paise - amount * 100) > 1e-6) {
    throw new DatasetError(`${bookCode}: ${field} has more than two decimal places (${amount})`);
  }
  return paise;
}

function toDate(isoDateString) {
  return isoDateString ? new Date(`${isoDateString}T00:00:00Z`) : null;
}

function toStatus(label, bookCode) {
  if (label === PUBLISHED_LABEL) {
    return { status: BookStatus.PUBLISHED, productionStage: null };
  }

  if (label.startsWith(IN_PRODUCTION_PREFIX)) {
    const productionStage = PRODUCTION_STAGE_BY_LABEL[label.slice(IN_PRODUCTION_PREFIX.length)];
    if (productionStage) {
      return { status: BookStatus.IN_PRODUCTION, productionStage };
    }
  }

  throw new DatasetError(`${bookCode}: unknown status "${label}"`);
}

function toBook(raw, warnings) {
  const code = raw.book_id;
  const royaltyEarnedMinor = toPaise(raw.total_royalty_earned, 'total_royalty_earned', code);
  const royaltyPaidMinor = toPaise(raw.royalty_paid, 'royalty_paid', code);
  const royaltyPendingMinor = toPaise(raw.royalty_pending, 'royalty_pending', code);
  const royaltyPerCopyMinor = toPaise(raw.author_royalty_per_copy, 'author_royalty_per_copy', code);

  if (royaltyEarnedMinor !== royaltyPaidMinor + royaltyPendingMinor) {
    throw new DatasetError(`${code}: royalty earned is not equal to paid + pending`);
  }

  if (royaltyPerCopyMinor !== null && royaltyEarnedMinor !== raw.total_copies_sold * royaltyPerCopyMinor) {
    warnings.push(`${code}: royalty earned differs from copies sold × royalty per copy`);
  }

  return {
    code,
    title: raw.title,
    isbn: raw.isbn,
    genre: raw.genre,
    ...toStatus(raw.status, code),
    publicationDate: toDate(raw.publication_date),
    mrpMinor: toPaise(raw.mrp, 'mrp', code),
    royaltyPerCopyMinor,
    copiesSold: raw.total_copies_sold,
    royaltyEarnedMinor,
    royaltyPaidMinor,
    royaltyPendingMinor,
    lastPayoutDate: toDate(raw.last_royalty_payout_date),
    printPartner: raw.print_partner ? PRINT_PARTNER_BY_LABEL[raw.print_partner] : null,
    platforms: raw.available_on.map((label) => PLATFORM_BY_LABEL[label]),
  };
}

function toAuthor(raw, warnings) {
  return {
    code: raw.author_id,
    name: raw.name,
    email: raw.email.trim().toLowerCase(),
    phone: raw.phone,
    city: raw.city,
    joinedDate: toDate(raw.joined_date),
    books: raw.books.map((book) => toBook(book, warnings)),
  };
}

export function parseDataset(json) {
  const result = rawDatasetSchema.safeParse(json);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new DatasetError(`Sample dataset is invalid:\n${problems.join('\n')}`);
  }

  const warnings = [];
  const authors = result.data.authors.map((author) => toAuthor(author, warnings));
  return { authors, warnings };
}
