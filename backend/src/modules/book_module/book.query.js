import { prisma } from '../../core/database/prisma.js';
import { BookStatus } from './book.enums.js';

const WITH_PLATFORMS = {
  platforms: { select: { platform: true }, orderBy: { platform: 'asc' } },
};

export function findBooks({ authorId } = {}) {
  return prisma.book.findMany({
    where: { authorId },
    include: WITH_PLATFORMS,
    orderBy: { code: 'asc' },
  });
}

export function findBookById(bookId, { authorId } = {}) {
  return prisma.book.findFirst({
    where: { id: bookId, authorId },
    include: WITH_PLATFORMS,
  });
}

export async function sumRoyalties(authorId) {
  const [totals, publishedCount] = await Promise.all([
    prisma.book.aggregate({
      where: { authorId },
      _sum: { royaltyEarnedMinor: true, royaltyPaidMinor: true, royaltyPendingMinor: true },
      _max: { lastPayoutDate: true },
      _count: { _all: true },
    }),
    prisma.book.count({ where: { authorId, status: BookStatus.PUBLISHED } }),
  ]);

  return {
    earnedMinor: totals._sum.royaltyEarnedMinor ?? 0,
    paidMinor: totals._sum.royaltyPaidMinor ?? 0,
    pendingMinor: totals._sum.royaltyPendingMinor ?? 0,
    lastPayoutDate: totals._max.lastPayoutDate,
    bookCount: totals._count._all,
    publishedCount,
  };
}

export function upsertBookByCode({ code, ...fields }, db = prisma) {
  return db.book.upsert({
    where: { code },
    create: { code, ...fields },
    update: fields,
  });
}

export async function replaceBookPlatforms(bookId, platforms, db = prisma) {
  await db.bookPlatform.deleteMany({ where: { bookId } });
  await db.bookPlatform.createMany({ data: platforms.map((platform) => ({ bookId, platform })) });
}
