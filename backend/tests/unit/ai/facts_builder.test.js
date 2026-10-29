import { describe, expect, it } from 'vitest';
import { buildFacts, FACT_FLAGS, formatRupees } from '../../../src/modules/ai_module/facts/facts_builder.js';

const NOW = new Date('2026-10-29T12:00:00+05:30');
const date = (iso) => (iso ? new Date(`${iso}T00:00:00Z`) : null);

function summary({ pendingMinor, lastPayoutDate = null }) {
  return {
    totals: { pending: { amountMinor: pendingMinor, currency: 'INR' } },
    lastPayoutDate,
    payout: {
      threshold: { amountMinor: 100000, currency: 'INR' },
      isBelowThreshold: pendingMinor < 100000,
      nextPayout: { quarter: 'Q3 2026', paidBy: '2026-11-14' },
    },
  };
}

function publishedBook(overrides) {
  return {
    code: 'BK000',
    title: 'Test',
    status: 'PUBLISHED',
    productionStage: null,
    isbn: '978-93-5XXXX-00-0',
    mrpMinor: 39900,
    royaltyPerCopyMinor: 3500,
    copiesSold: 0,
    royaltyEarnedMinor: 0,
    royaltyPaidMinor: 0,
    royaltyPendingMinor: 0,
    publicationDate: date('2024-01-01'),
    lastPayoutDate: null,
    printPartner: 'IN_HOUSE',
    platforms: [{ platform: 'AMAZON_IN' }, { platform: 'BOOKLEAF_STORE' }],
    ...overrides,
  };
}

const ananyaBook = publishedBook({
  code: 'BK005',
  title: 'Between Two Temples',
  mrpMinor: 42500,
  royaltyPerCopyMinor: 3800,
  copiesSold: 67,
  royaltyEarnedMinor: 254600,
  royaltyPendingMinor: 254600,
  publicationDate: date('2024-07-05'),
  printPartner: 'EPITOME_BOOKS',
});

describe('formatRupees', () => {
  it('uses Indian digit grouping and keeps null', () => {
    expect(formatRupees(254600)).toBe('₹2,546');
    expect(formatRupees(10000000)).toBe('₹1,00,000');
    expect(formatRupees(85050)).toBe('₹850.5');
    expect(formatRupees(0)).toBe('₹0');
    expect(formatRupees(null)).toBeNull();
  });
});

describe('buildFacts', () => {
  it('sends only the first name of the author', () => {
    const facts = buildFacts({ authorName: 'Ananya Reddy', book: ananyaBook, royaltySummary: summary({ pendingMinor: 254600 }), now: NOW });

    expect(facts.author).toEqual({ firstName: 'Ananya' });
    expect(JSON.stringify(facts)).not.toContain('Reddy');
  });

  it('formats book money and labels in code (Ananya, BK005)', () => {
    const facts = buildFacts({ authorName: 'Ananya Reddy', book: ananyaBook, royaltySummary: summary({ pendingMinor: 254600 }), now: NOW });

    expect(facts.today).toBe('29 Oct 2026');
    expect(facts.book).toMatchObject({
      title: 'Between Two Temples',
      status: 'Published & Live',
      publicationDate: '5 Jul 2024',
      mrp: '₹425',
      royaltyPerCopy: '₹38',
      royaltyEarned: '₹2,546',
      royaltyPaid: '₹0',
      royaltyPending: '₹2,546',
      lastPayoutDate: null,
      platforms: ['Amazon India', 'BookLeaf Store'],
      printPartner: 'Epitome Books',
    });
    expect(facts.royalty).toMatchObject({
      authorPendingTotal: '₹2,546',
      minimumPayoutThreshold: '₹1,000',
      meetsThreshold: true,
      nextPayoutDeadline: '14 Nov 2026',
      nextPayoutCovers: 'sales up to 30 Sept 2026',
    });
  });

  it('writes payout dates the way an author reads them', () => {
    const paidBook = publishedBook({ royaltyEarnedMinor: 793800, royaltyPaidMinor: 793800, lastPayoutDate: date('2025-12-01') });

    const facts = buildFacts({
      authorName: 'Priya Sharma',
      book: paidBook,
      royaltySummary: summary({ pendingMinor: 0, lastPayoutDate: '2025-12-01' }),
      now: NOW,
    });

    expect(facts.book.lastPayoutDate).toBe('1 Dec 2025');
    expect(facts.royalty.lastPayoutDate).toBe('1 Dec 2025');
  });

  it('adds the support email only when it is configured', () => {
    const base = { authorName: 'Ananya Reddy', book: ananyaBook, royaltySummary: summary({ pendingMinor: 254600 }), now: NOW };

    expect(buildFacts({ ...base, supportEmail: 'support@bookleaf.test' }).support).toEqual({ email: 'support@bookleaf.test' });
    expect(buildFacts(base)).not.toHaveProperty('support');
  });

  it('flags a possible payout delay for a book that was never paid (Ananya)', () => {
    const facts = buildFacts({ authorName: 'Ananya Reddy', book: ananyaBook, royaltySummary: summary({ pendingMinor: 254600 }), now: NOW });

    expect(facts.royalty.payoutNeedsVerification).toBe(true);
    expect(facts.flags).toContain(FACT_FLAGS.POSSIBLE_PAYOUT_DELAY);
  });

  it('does not flag a delay when the pending total is below ₹1,000 (Kavita, ₹850)', () => {
    const kavitaBook = publishedBook({ code: 'BK016', royaltyEarnedMinor: 85000, royaltyPendingMinor: 85000, publicationDate: date('2024-11-05') });

    const facts = buildFacts({ authorName: 'Kavita Deshmukh', book: kavitaBook, royaltySummary: summary({ pendingMinor: 85000 }), now: NOW });

    expect(facts.royalty).toMatchObject({ meetsThreshold: false, payoutNeedsVerification: false });
    expect(facts.flags).toEqual([FACT_FLAGS.BELOW_PAYOUT_THRESHOLD]);
  });

  it('does not flag a delay when the book has nothing pending (BK002)', () => {
    const paidBook = publishedBook({ royaltyEarnedMinor: 793800, royaltyPaidMinor: 793800, lastPayoutDate: date('2025-12-01') });

    const facts = buildFacts({ authorName: 'Priya Sharma', book: paidBook, royaltySummary: summary({ pendingMinor: 357000 }), now: NOW });

    expect(facts.royalty.payoutNeedsVerification).toBe(false);
  });

  it('does not flag a delay when the last payout is after the last settled quarter', () => {
    const recentlyPaid = publishedBook({ royaltyEarnedMinor: 200000, royaltyPaidMinor: 100000, royaltyPendingMinor: 100000, lastPayoutDate: date('2026-08-10') });

    const facts = buildFacts({ authorName: 'Rohit Kapoor', book: recentlyPaid, royaltySummary: summary({ pendingMinor: 100000 }), now: NOW });

    expect(facts.royalty.payoutNeedsVerification).toBe(false);
  });

  it('describes an in-production book and warns about its early ISBN (BK013)', () => {
    const bk013 = publishedBook({
      code: 'BK013',
      title: 'Midnight in Mysore',
      status: 'IN_PRODUCTION',
      productionStage: 'COVER_DESIGN',
      isbn: '978-93-5XXXX-13-4',
      mrpMinor: null,
      royaltyPerCopyMinor: null,
      publicationDate: null,
      printPartner: null,
      platforms: [],
    });

    const facts = buildFacts({ authorName: 'Sneha Kulkarni', book: bk013, royaltySummary: summary({ pendingMinor: 786500 }), now: NOW });

    expect(facts.book).toMatchObject({ status: 'In production — Cover Design', mrp: null, publicationDate: null, platforms: [], printPartner: null });
    expect(facts.flags).toEqual([FACT_FLAGS.BOOK_IN_PRODUCTION, FACT_FLAGS.ISBN_BEFORE_ASSIGNMENT_STAGE]);
    expect(facts.royalty.payoutNeedsVerification).toBe(false);
  });

  it('builds account-level facts when the ticket has no book', () => {
    const facts = buildFacts({
      authorName: 'Arjun Malhotra',
      book: null,
      royaltySummary: summary({ pendingMinor: 246400 }),
      now: NOW,
    });

    expect(facts.book).toBeNull();
    expect(facts.royalty.authorPendingTotal).toBe('₹2,464');
    expect(facts.flags).toEqual([]);
  });
});
