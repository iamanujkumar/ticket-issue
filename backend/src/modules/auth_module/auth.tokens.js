import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { UnauthenticatedError } from '../../core/errors/app_error.js';
import { ACCESS_TOKEN_TTL_SECONDS } from './auth.constants.js';

const JWT_ALGORITHM = 'HS256';
const MIN_SECRET_LENGTH = 32;
const REFRESH_TOKEN_BYTES = 32;

function readAccessSecret() {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_ACCESS_SECRET must be set and at least ${MIN_SECRET_LENGTH} characters long`);
  }
  return secret;
}

const ACCESS_SECRET = readAccessSecret();

export function createAccessToken(user) {
  return jwt.sign({ role: user.role, authorId: user.authorId ?? null }, ACCESS_SECRET, {
    algorithm: JWT_ALGORITHM,
    subject: user.id,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token) {
  try {
    // Pinning the algorithm blocks forged tokens that claim "alg: none" or another algorithm.
    const payload = jwt.verify(token, ACCESS_SECRET, { algorithms: [JWT_ALGORITHM] });
    return { userId: payload.sub, role: payload.role, authorId: payload.authorId };
  } catch {
    throw new UnauthenticatedError();
  }
}

export function hashRefreshToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function createRefreshToken() {
  const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: hashRefreshToken(token) };
}
