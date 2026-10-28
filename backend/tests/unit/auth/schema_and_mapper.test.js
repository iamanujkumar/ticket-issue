import { describe, expect, it } from 'vitest';
import { toAuthUser } from '../../../src/modules/auth_module/auth.mapper.js';
import { loginBodySchema } from '../../../src/modules/auth_module/auth.schema.js';

describe('loginBodySchema', () => {
  it('trims and lower-cases the email', () => {
    const result = loginBodySchema.parse({ email: '  Priya.Sharma@Email.com ', password: 'x' });

    expect(result.email).toBe('priya.sharma@email.com');
  });

  it('requires both fields', () => {
    const messages = loginBodySchema.safeParse({}).error.issues.map((issue) => issue.message);

    expect(messages).toEqual(['Email is required', 'Password is required']);
  });

  it('rejects extra fields such as role', () => {
    const result = loginBodySchema.safeParse({ email: 'a@b.co', password: 'x', role: 'ADMIN' });

    expect(result.success).toBe(false);
  });

  it('rejects a password longer than 128 characters', () => {
    const result = loginBodySchema.safeParse({ email: 'a@b.co', password: 'x'.repeat(129) });

    expect(result.success).toBe(false);
  });
});

describe('toAuthUser', () => {
  const row = {
    id: 'u-1',
    email: 'priya.sharma@email.com',
    name: 'Priya Sharma',
    role: 'AUTHOR',
    passwordHash: '$argon2id$secret',
    isActive: true,
    lastLoginAt: new Date(),
    author: { id: 'a-1' },
  };

  it('returns only the public fields', () => {
    expect(toAuthUser(row)).toEqual({
      id: 'u-1',
      email: 'priya.sharma@email.com',
      name: 'Priya Sharma',
      role: 'AUTHOR',
      authorId: 'a-1',
    });
  });

  it('never exposes the password hash', () => {
    expect(JSON.stringify(toAuthUser(row))).not.toContain('argon2');
  });

  it('gives admins a null author id', () => {
    expect(toAuthUser({ ...row, role: 'ADMIN', author: null }).authorId).toBeNull();
  });
});
