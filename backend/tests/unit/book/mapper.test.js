import { describe, expect, it } from 'vitest';
import { toBook, toIsoDate } from '../../../src/modules/book_module/book.mapper.js';

const baseRow = {
  id: 'book-1',
  code: 'BK001',
  authorId: 'author-1',
  title: 'Whispers of the Ganges',
  isbn: '978-93-5XXXX-01-1',
  genre: 'Literary Fiction',
  currency: 'INR',
  copiesSold: 342,
  royaltyEarnedMinor: 1197000,
  royaltyPaidMinor: 840000,
  royaltyPendingMinor: 357000,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('toBook', () => {
  it('maps a published book with money, dates and platforms', () => {
    const book = toBook({
      ...baseRow,
      status: 'PUBLISHED',
      productionStage: null,
      publicationDate: new Date('2023-06-20T00:00:00Z'),
      mrpMinor: 39900,
      royaltyPerCopyMinor: 3500,
      lastPayoutDate: new Date('2025-10-15T00:00:00Z'),
      printPartner: 'IN_HOUSE',
      platforms: [{ platform: 'AMAZON_IN' }, { platform: 'BOOKLEAF_STORE' }],
    });

    expect(book).toEqual({
      id: 'book-1',
      code: 'BK001',
      authorId: 'author-1',
      title: 'Whispers of the Ganges',
      isbn: '978-93-5XXXX-01-1',
      genre: 'Literary Fiction',
      status: 'PUBLISHED',
      productionStage: null,
      publicationDate: '2023-06-20',
      mrp: { amountMinor: 39900, currency: 'INR' },
      royaltyPerCopy: { amountMinor: 3500, currency: 'INR' },
      copiesSold: 342,
      royaltyEarned: { amountMinor: 1197000, currency: 'INR' },
      royaltyPaid: { amountMinor: 840000, currency: 'INR' },
      royaltyPending: { amountMinor: 357000, currency: 'INR' },
      lastPayoutDate: '2025-10-15',
      printPartner: 'IN_HOUSE',
      platforms: ['AMAZON_IN', 'BOOKLEAF_STORE'],
    });
  });

  it('keeps not-applicable fields of an in-production book as null and royalties as zero', () => {
    const book = toBook({
      ...baseRow,
      copiesSold: 0,
      royaltyEarnedMinor: 0,
      royaltyPaidMinor: 0,
      royaltyPendingMinor: 0,
      status: 'IN_PRODUCTION',
      productionStage: 'COVER_DESIGN',
      publicationDate: null,
      mrpMinor: null,
      royaltyPerCopyMinor: null,
      lastPayoutDate: null,
      printPartner: null,
      platforms: [],
    });

    expect(book).toMatchObject({
      status: 'IN_PRODUCTION',
      productionStage: 'COVER_DESIGN',
      publicationDate: null,
      mrp: null,
      royaltyPerCopy: null,
      royaltyPending: { amountMinor: 0, currency: 'INR' },
      lastPayoutDate: null,
      printPartner: null,
      platforms: [],
    });
  });

  it('does not expose timestamps', () => {
    const book = toBook({ ...baseRow, status: 'PUBLISHED', platforms: [] });

    expect(book).not.toHaveProperty('createdAt');
    expect(book).not.toHaveProperty('updatedAt');
  });
});

describe('toIsoDate', () => {
  it('formats a date and keeps null', () => {
    expect(toIsoDate(new Date('2024-02-29T00:00:00Z'))).toBe('2024-02-29');
    expect(toIsoDate(null)).toBeNull();
  });
});
