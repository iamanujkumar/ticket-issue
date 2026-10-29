import { toMoney } from '../../core/utils/money.js';

export function toIsoDate(date) {
  return date ? date.toISOString().slice(0, 10) : null;
}

export function toBook(book) {
  return {
    id: book.id,
    code: book.code,
    authorId: book.authorId,
    title: book.title,
    isbn: book.isbn,
    genre: book.genre,
    status: book.status,
    productionStage: book.productionStage,
    publicationDate: toIsoDate(book.publicationDate),
    mrp: toMoney(book.mrpMinor, book.currency),
    royaltyPerCopy: toMoney(book.royaltyPerCopyMinor, book.currency),
    copiesSold: book.copiesSold,
    royaltyEarned: toMoney(book.royaltyEarnedMinor, book.currency),
    royaltyPaid: toMoney(book.royaltyPaidMinor, book.currency),
    royaltyPending: toMoney(book.royaltyPendingMinor, book.currency),
    lastPayoutDate: toIsoDate(book.lastPayoutDate),
    printPartner: book.printPartner,
    platforms: book.platforms.map(({ platform }) => platform),
  };
}
