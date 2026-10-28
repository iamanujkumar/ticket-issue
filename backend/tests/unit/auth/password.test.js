import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  verifyAgainstDummyHash,
  verifyPassword,
} from '../../../src/modules/auth_module/auth.password.js';

describe('auth.password', () => {
  it('hashes with argon2id and never stores the plain password', async () => {
    const passwordHash = await hashPassword('Author@2026');

    expect(passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(passwordHash).not.toContain('Author@2026');
  });

  it('produces a different hash for the same password each time', async () => {
    const first = await hashPassword('Author@2026');
    const second = await hashPassword('Author@2026');

    expect(first).not.toBe(second);
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const passwordHash = await hashPassword('Author@2026');

    expect(await verifyPassword(passwordHash, 'Author@2026')).toBe(true);
    expect(await verifyPassword(passwordHash, 'author@2026')).toBe(false);
  });

  it('returns false instead of throwing for a malformed hash', async () => {
    expect(await verifyPassword('not-a-hash', 'Author@2026')).toBe(false);
  });

  it('always answers false for the dummy check', async () => {
    expect(await verifyAgainstDummyHash('bookleaf-dummy-password')).toBe(false);
  });
});
