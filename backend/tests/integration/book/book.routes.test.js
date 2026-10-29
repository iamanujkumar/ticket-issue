import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.js';
import { disconnectDatabase } from '../../../src/core/database/prisma.js';
import { createTestBook, createTestUser, deleteTestUsers, loginAs } from '../../helpers/test_users.js';

const app = createApp();
const BOOKS = '/api/v1/books';

let author;
let otherAuthor;
let ownBook;
let otherBook;
let authorCookies;
let otherAuthorCookies;
let adminCookies;

const get = (path, cookies) => request(app).get(`${BOOKS}${path}`).set('Cookie', cookies);
const codesOf = (response) => response.body.data.map((book) => book.code);

beforeAll(async () => {
  await deleteTestUsers();

  author = await createTestUser();
  otherAuthor = await createTestUser();
  const admin = await createTestUser({ role: 'ADMIN' });

  ownBook = await createTestBook(author.user.author.id, {
    royaltyEarnedMinor: 1197000,
    royaltyPaidMinor: 840000,
    royaltyPendingMinor: 357000,
    lastPayoutDate: new Date('2025-10-15T00:00:00Z'),
    platforms: { create: [{ platform: 'AMAZON_IN' }, { platform: 'FLIPKART' }] },
  });
  await createTestBook(author.user.author.id, { status: 'IN_PRODUCTION', productionStage: 'TYPESETTING' });
  otherBook = await createTestBook(otherAuthor.user.author.id, {
    royaltyEarnedMinor: 85000,
    royaltyPendingMinor: 85000,
  });

  authorCookies = (await loginAs(app, author)).cookies;
  otherAuthorCookies = (await loginAs(app, otherAuthor)).cookies;
  adminCookies = (await loginAs(app, admin)).cookies;
});

afterAll(async () => {
  await deleteTestUsers();
  await disconnectDatabase();
});

describe('GET /books', () => {
  it('requires a session', async () => {
    const response = await request(app).get(BOOKS);

    expect(response.status).toBe(401);
  });

  it('returns only the author\'s own books, including the one in production', async () => {
    const response = await get('', authorCookies);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data.every((book) => book.authorId === author.user.author.id)).toBe(true);
    expect(response.body.data.map((book) => book.status).sort()).toEqual(['IN_PRODUCTION', 'PUBLISHED']);
  });

  it('ignores an authorId sent by an author', async () => {
    const response = await get(`?authorId=${otherAuthor.user.author.id}`, authorCookies);

    expect(response.status).toBe(200);
    expect(codesOf(response)).not.toContain(otherBook.code);
    expect(response.body.data).toHaveLength(2);
  });

  it('lets an admin filter by author', async () => {
    const response = await get(`?authorId=${otherAuthor.user.author.id}`, adminCookies);

    expect(response.status).toBe(200);
    expect(codesOf(response)).toEqual([otherBook.code]);
  });

  it('lets an admin see every author\'s books', async () => {
    const response = await get('', adminCookies);

    expect(codesOf(response)).toEqual(expect.arrayContaining([ownBook.code, otherBook.code]));
  });

  it('rejects unknown query fields and a malformed authorId', async () => {
    const unknownField = await get('?status=PUBLISHED', authorCookies);
    const malformedId = await get('?authorId=AUTH001', adminCookies);

    expect(unknownField.status).toBe(400);
    expect(malformedId.status).toBe(400);
  });
});

describe('GET /books/:bookId', () => {
  it('returns the author\'s own book in the API shape', async () => {
    const response = await get(`/${ownBook.id}`, authorCookies);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      code: ownBook.code,
      royaltyPending: { amountMinor: 357000, currency: 'INR' },
      lastPayoutDate: '2025-10-15',
      platforms: ['AMAZON_IN', 'FLIPKART'],
    });
  });

  it('answers another author\'s book exactly like a book that does not exist', async () => {
    const othersBook = await get(`/${otherBook.id}`, authorCookies);
    const missingBook = await get(`/${randomUUID()}`, authorCookies);

    expect(othersBook.status).toBe(404);
    expect(missingBook.status).toBe(404);
    const { requestId: _first, ...othersError } = othersBook.body.error;
    const { requestId: _second, ...missingError } = missingBook.body.error;
    expect(othersError).toEqual(missingError);
    expect(othersError.code).toBe('BOOK_NOT_FOUND');
  });

  it('lets an admin open any author\'s book', async () => {
    const response = await get(`/${otherBook.id}`, adminCookies);

    expect(response.status).toBe(200);
    expect(response.body.data.code).toBe(otherBook.code);
  });

  it('rejects an id that is not a uuid', async () => {
    const response = await get('/BK001', authorCookies);

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].path).toBe('params.bookId');
  });
});

describe('GET /books/summary', () => {
  it('totals the author\'s royalties and reports the next payout', async () => {
    const response = await get('/summary', authorCookies);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      totals: {
        earned: { amountMinor: 1197000, currency: 'INR' },
        paid: { amountMinor: 840000, currency: 'INR' },
        pending: { amountMinor: 357000, currency: 'INR' },
      },
      bookCount: 2,
      publishedCount: 1,
      lastPayoutDate: '2025-10-15',
      payout: { threshold: { amountMinor: 100000, currency: 'INR' }, isBelowThreshold: false },
    });
    expect(response.body.data.payout.nextPayout).toEqual({
      quarter: expect.stringMatching(/^Q[1-4] \d{4}$/),
      paidBy: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it('flags pending royalty below the ₹1,000 payout threshold', async () => {
    const response = await get('/summary', otherAuthorCookies);

    expect(response.body.data.totals.pending.amountMinor).toBe(85000);
    expect(response.body.data.payout.isBelowThreshold).toBe(true);
  });

  it('is for authors only', async () => {
    const response = await get('/summary', adminCookies);

    expect(response.status).toBe(403);
  });
});

describe('database rules', () => {
  it('rejects a book whose royalty earned is not paid + pending', async () => {
    await expect(
      createTestBook(author.user.author.id, {
        royaltyEarnedMinor: 1000,
        royaltyPaidMinor: 400,
        royaltyPendingMinor: 500,
      }),
    ).rejects.toThrow(/books_royalty_balance_check/);
  });

  it('rejects a production stage on a published book', async () => {
    await expect(createTestBook(author.user.author.id, { productionStage: 'EDITING' })).rejects.toThrow(
      /books_stage_matches_status_check/,
    );
  });
});
