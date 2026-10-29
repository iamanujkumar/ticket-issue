import { execFileSync } from 'node:child_process';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.js';
import { disconnectDatabase, prisma } from '../../../src/core/database/prisma.js';
import { loginAs } from '../../helpers/test_users.js';

const SEED_TIMEOUT_MS = 180000;
const SEEDED_EMAILS = { email: { not: { endsWith: '@auth-test.bookleaf.test' } } };

function runSeed() {
  execFileSync(process.execPath, ['prisma/seed/seed.js'], {
    env: { ...process.env, LOG_LEVEL: 'silent' },
    stdio: 'pipe',
  });
}

async function seededCounts() {
  const [users, authors, admins, books, platforms] = await Promise.all([
    prisma.user.count({ where: SEEDED_EMAILS }),
    prisma.author.count({ where: { user: SEEDED_EMAILS } }),
    prisma.user.count({ where: { ...SEEDED_EMAILS, role: 'ADMIN' } }),
    prisma.book.count({ where: { author: { user: SEEDED_EMAILS } } }),
    prisma.bookPlatform.count({ where: { book: { author: { user: SEEDED_EMAILS } } } }),
  ]);
  return { users, authors, admins, books, platforms };
}

const app = createApp();

beforeAll(() => {
  runSeed();
}, SEED_TIMEOUT_MS);

afterAll(async () => {
  await disconnectDatabase();
});

describe('database seed', () => {
  it('loads the 10 dataset authors, 2 demo admins and 18 books', async () => {
    expect(await seededCounts()).toEqual({ users: 12, authors: 10, admins: 2, books: 18, platforms: 46 });
  });

  it('is idempotent: a second run changes nothing', async () => {
    const before = await seededCounts();
    runSeed();

    expect(await seededCounts()).toEqual(before);
  }, SEED_TIMEOUT_MS);

  it('stores the in-production book BK013 with its stage and no commercial data', async () => {
    const book = await prisma.book.findUnique({ where: { code: 'BK013' }, include: { platforms: true } });

    expect(book).toMatchObject({
      status: 'IN_PRODUCTION',
      productionStage: 'COVER_DESIGN',
      isbn: '978-93-5XXXX-13-4',
      mrpMinor: null,
      publicationDate: null,
      printPartner: null,
      royaltyPendingMinor: 0,
    });
    expect(book.platforms).toEqual([]);
  });

  it('converts BK001 money to paise exactly', async () => {
    const book = await prisma.book.findUnique({ where: { code: 'BK001' } });

    expect(book).toMatchObject({
      mrpMinor: 39900,
      royaltyPerCopyMinor: 3500,
      copiesSold: 342,
      royaltyEarnedMinor: 1197000,
      royaltyPaidMinor: 840000,
      royaltyPendingMinor: 357000,
    });
  });

  it('lets a dataset author log in with the demo password and see the ₹850 rollover', async () => {
    const { response, cookies } = await loginAs(app, {
      email: 'kavita.deshmukh@email.com',
      password: process.env.SEED_AUTHOR_PASSWORD,
    });
    const summary = await request(app).get('/api/v1/books/summary').set('Cookie', cookies);

    expect(response.status).toBe(200);
    expect(summary.body.data.totals.pending.amountMinor).toBe(85000);
    expect(summary.body.data.payout.isBelowThreshold).toBe(true);
  });

  it('lets a demo admin log in with the demo password', async () => {
    const { response } = await loginAs(app, {
      email: 'aditi.rao@bookleaf.test',
      password: process.env.SEED_ADMIN_PASSWORD,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.user.role).toBe('ADMIN');
  });
});
