import { ForbiddenError } from '../../core/errors/app_error.js';
import { toMoney } from '../../core/utils/money.js';
import { UserRole } from '../auth_module/auth.enums.js';
import { DEFAULT_CURRENCY, MIN_PAYOUT_THRESHOLD_MINOR } from './book.constants.js';
import { BookNotFoundError } from './book.errors.js';
import { toBook, toIsoDate } from './book.mapper.js';
import * as bookQuery from './book.query.js';
import { nextPayout } from './book.royalty_calendar.js';

function ownAuthorId(user) {
  if (!user.authorId) {
    throw new ForbiddenError();
  }
  return user.authorId;
}

function authorScope(user, requestedAuthorId) {
  return user.role === UserRole.ADMIN ? requestedAuthorId : ownAuthorId(user);
}

export async function listBooks(user, { authorId } = {}) {
  const books = await bookQuery.findBooks({ authorId: authorScope(user, authorId) });
  return books.map(toBook);
}

export async function getBook(user, bookId) {
  const book = await bookQuery.findBookById(bookId, { authorId: authorScope(user, undefined) });
  if (!book) {
    throw new BookNotFoundError();
  }
  return toBook(book);
}

export async function getRoyaltySummary(user, now = new Date()) {
  const totals = await bookQuery.sumRoyalties(ownAuthorId(user));

  return {
    totals: {
      earned: toMoney(totals.earnedMinor, DEFAULT_CURRENCY),
      paid: toMoney(totals.paidMinor, DEFAULT_CURRENCY),
      pending: toMoney(totals.pendingMinor, DEFAULT_CURRENCY),
    },
    bookCount: totals.bookCount,
    publishedCount: totals.publishedCount,
    lastPayoutDate: toIsoDate(totals.lastPayoutDate),
    payout: {
      threshold: toMoney(MIN_PAYOUT_THRESHOLD_MINOR, DEFAULT_CURRENCY),
      isBelowThreshold: totals.pendingMinor < MIN_PAYOUT_THRESHOLD_MINOR,
      nextPayout: nextPayout(now),
    },
  };
}

export async function getOwnedBook(authorId, bookId) {
  if (!authorId) {
    throw new BookNotFoundError();
  }

  const book = await bookQuery.findBookById(bookId, { authorId });
  if (!book) {
    throw new BookNotFoundError();
  }
  return book;
}
