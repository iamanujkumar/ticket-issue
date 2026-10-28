import jwt from 'jsonwebtoken';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnauthenticatedError } from '../../../src/core/errors/app_error.js';
import {
  createAccessToken,
  createRefreshToken,
  hashRefreshToken,
  verifyAccessToken,
} from '../../../src/modules/auth_module/auth.tokens.js';

const AUTHOR = { id: '7d9f2b1e-3c4a-4b8e-9f10-2a3b4c5d6e7f', role: 'AUTHOR', authorId: 'a1b2c3d4-0000-4000-8000-000000000001' };
const ADMIN = { id: 'b2c3d4e5-0000-4000-8000-000000000002', role: 'ADMIN' };

function toBase64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

afterEach(() => {
  vi.useRealTimers();
});

describe('access token', () => {
  it('round-trips the user id, role and author id', () => {
    const token = createAccessToken(AUTHOR);

    expect(verifyAccessToken(token)).toEqual({ userId: AUTHOR.id, role: 'AUTHOR', authorId: AUTHOR.authorId });
  });

  it('stores a null author id for admins', () => {
    expect(verifyAccessToken(createAccessToken(ADMIN))).toEqual({ userId: ADMIN.id, role: 'ADMIN', authorId: null });
  });

  it('expires after 15 minutes', () => {
    vi.useFakeTimers({ now: new Date('2026-10-28T10:00:00Z') });
    const token = createAccessToken(AUTHOR);

    vi.setSystemTime(new Date('2026-10-28T10:14:00Z'));
    expect(() => verifyAccessToken(token)).not.toThrow();

    vi.setSystemTime(new Date('2026-10-28T10:16:00Z'));
    expect(() => verifyAccessToken(token)).toThrow(UnauthenticatedError);
  });

  it('rejects a token whose payload was changed', () => {
    const [header, , signature] = createAccessToken(AUTHOR).split('.');
    const forgedPayload = toBase64Url({ sub: AUTHOR.id, role: 'ADMIN', authorId: null });

    expect(() => verifyAccessToken(`${header}.${forgedPayload}.${signature}`)).toThrow(UnauthenticatedError);
  });

  it('rejects a token signed with another secret', () => {
    const token = jwt.sign({ role: 'ADMIN' }, 'some-other-secret-that-is-long-enough-12345', { subject: ADMIN.id });

    expect(() => verifyAccessToken(token)).toThrow(UnauthenticatedError);
  });

  it('rejects an unsigned token (alg: none)', () => {
    const unsigned = `${toBase64Url({ alg: 'none', typ: 'JWT' })}.${toBase64Url({ sub: ADMIN.id, role: 'ADMIN' })}.`;

    expect(() => verifyAccessToken(unsigned)).toThrow(UnauthenticatedError);
  });

  it('rejects garbage', () => {
    expect(() => verifyAccessToken('not-a-jwt')).toThrow(UnauthenticatedError);
  });
});

describe('refresh token', () => {
  it('is random, url-safe and 256 bits long', () => {
    const first = createRefreshToken();
    const second = createRefreshToken();

    expect(first.token).not.toBe(second.token);
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('stores a SHA-256 hash that is deterministic and differs from the token', () => {
    const { token, tokenHash } = createRefreshToken();

    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toBe(hashRefreshToken(token));
    expect(tokenHash).not.toContain(token);
  });
});
