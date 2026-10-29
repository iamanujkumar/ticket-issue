import { prisma } from '../../core/database/prisma.js';

const WITH_AUTHOR_ID = { author: { select: { id: true } } };

export function findUserByEmail(email) {
  return prisma.user.findUnique({ where: { email }, include: WITH_AUTHOR_ID });
}

export function findUserById(id) {
  return prisma.user.findUnique({ where: { id }, include: WITH_AUTHOR_ID });
}

export function updateLastLogin(userId) {
  return prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
}

export function saveRefreshToken(data, db = prisma) {
  return db.refreshToken.create({ data });
}

export function findRefreshTokenByHash(tokenHash) {
  return prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: { include: WITH_AUTHOR_ID } },
  });
}

export async function rotateRefreshToken({ oldTokenId, newToken }, tx) {
  const replacement = await tx.refreshToken.create({ data: newToken });

  // "revokedAt: null" makes two simultaneous refreshes with the same token race: only one can revoke it.
  const { count } = await tx.refreshToken.updateMany({
    where: { id: oldTokenId, revokedAt: null },
    data: { revokedAt: new Date(), replacedById: replacement.id },
  });

  return count === 1 ? replacement : null;
}

export function revokeTokenFamily(familyId) {
  return prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function upsertUserByEmail({ email, name, role, passwordHash }, db = prisma) {
  return db.user.upsert({
    where: { email },
    create: { email, name, role, passwordHash },
    update: { name, role, passwordHash, isActive: true },
  });
}

export function upsertAuthorByCode({ code, userId, phone, city, joinedDate }, db = prisma) {
  return db.author.upsert({
    where: { code },
    create: { code, userId, phone, city, joinedDate },
    update: { userId, phone, city, joinedDate },
  });
}
