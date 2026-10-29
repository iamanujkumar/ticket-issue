import { randomUUID } from 'node:crypto';
import { prisma } from '../../core/database/prisma.js';
import { UnauthenticatedError } from '../../core/errors/app_error.js';
import { REFRESH_TOKEN_TTL_DAYS } from './auth.constants.js';
import { UserRole } from './auth.enums.js';
import { InvalidCredentialsError, RefreshTokenReuseError, SessionExpiredError } from './auth.errors.js';
import { toAuthUser } from './auth.mapper.js';
import { verifyAgainstDummyHash, verifyPassword } from './auth.password.js';
import * as authQuery from './auth.query.js';
import { createAccessToken, createRefreshToken, hashRefreshToken } from './auth.tokens.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_USER_AGENT_LENGTH = 300;
const MAX_IP_LENGTH = 64;

function refreshTokenRow({ userId, familyId, tokenHash, userAgent, ip }) {
  return {
    userId,
    familyId,
    tokenHash,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * ONE_DAY_MS),
    userAgent: userAgent?.slice(0, MAX_USER_AGENT_LENGTH),
    ip: ip?.slice(0, MAX_IP_LENGTH),
  };
}

function buildSession(user, refreshToken) {
  const authUser = toAuthUser(user);
  return { user: authUser, accessToken: createAccessToken(authUser), refreshToken };
}

async function rotateOrDetectReuse(storedToken, newTokenRow) {
  try {
    await prisma.$transaction(async (tx) => {
      const replacement = await authQuery.rotateRefreshToken({ oldTokenId: storedToken.id, newToken: newTokenRow }, tx);
      if (!replacement) {
        throw new RefreshTokenReuseError();
      }
    });
  } catch (error) {
    if (error instanceof RefreshTokenReuseError) {
      await authQuery.revokeTokenFamily(storedToken.familyId);
    }
    throw error;
  }
}

export async function login({ email, password, userAgent, ip }) {
  const user = await authQuery.findUserByEmail(email);

  if (!user) {
    await verifyAgainstDummyHash(password);
    throw new InvalidCredentialsError();
  }

  const isPasswordCorrect = await verifyPassword(user.passwordHash, password);
  // One error for every failure, so the response never reveals whether an email is registered.
  if (!isPasswordCorrect || !user.isActive) {
    throw new InvalidCredentialsError();
  }

  const { token, tokenHash } = createRefreshToken();
  await authQuery.saveRefreshToken(
    refreshTokenRow({ userId: user.id, familyId: randomUUID(), tokenHash, userAgent, ip }),
  );
  await authQuery.updateLastLogin(user.id);

  return buildSession(user, token);
}

export async function refreshSession({ refreshToken, userAgent, ip }) {
  if (!refreshToken) {
    throw new SessionExpiredError();
  }

  const storedToken = await authQuery.findRefreshTokenByHash(hashRefreshToken(refreshToken));
  if (!storedToken || storedToken.expiresAt <= new Date()) {
    throw new SessionExpiredError();
  }

  // A token that was already rotated is being used again: it was probably stolen, so end the whole session.
  if (storedToken.revokedAt && storedToken.replacedById) {
    await authQuery.revokeTokenFamily(storedToken.familyId);
    throw new RefreshTokenReuseError();
  }

  if (storedToken.revokedAt) {
    throw new SessionExpiredError();
  }

  if (!storedToken.user.isActive) {
    throw new SessionExpiredError();
  }

  const { token, tokenHash } = createRefreshToken();
  await rotateOrDetectReuse(
    storedToken,
    refreshTokenRow({ userId: storedToken.userId, familyId: storedToken.familyId, tokenHash, userAgent, ip }),
  );

  return buildSession(storedToken.user, token);
}

export async function logout(refreshToken) {
  if (!refreshToken) return;

  const storedToken = await authQuery.findRefreshTokenByHash(hashRefreshToken(refreshToken));
  if (storedToken) {
    await authQuery.revokeTokenFamily(storedToken.familyId);
  }
}

export async function getCurrentUser(userId) {
  const user = await authQuery.findUserById(userId);
  if (!user || !user.isActive) {
    throw new UnauthenticatedError();
  }
  return toAuthUser(user);
}

export async function getActiveAdmin(userId) {
  const user = await authQuery.findUserById(userId);
  return user?.isActive && user.role === UserRole.ADMIN ? user : null;
}
