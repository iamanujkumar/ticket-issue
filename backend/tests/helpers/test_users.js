import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { prisma } from '../../src/core/database/prisma.js';
import { hashPassword } from '../../src/modules/auth_module/auth.password.js';

export const TEST_EMAIL_DOMAIN = 'auth-test.bookleaf.test';
export const TEST_PASSWORD = 'Test@12345';

export async function createTestUser({ role = 'AUTHOR', isActive = true } = {}) {
  const tag = randomUUID().slice(0, 8);
  const email = `${role.toLowerCase()}-${tag}@${TEST_EMAIL_DOMAIN}`;

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(TEST_PASSWORD),
      role,
      name: `Test ${role} ${tag}`,
      isActive,
      ...(role === 'AUTHOR' && { author: { create: { code: `T${tag}`, joinedDate: new Date('2023-01-01') } } }),
    },
    include: { author: true },
  });

  return { user, email, password: TEST_PASSWORD };
}

export function deleteTestUsers() {
  return prisma.user.deleteMany({ where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } } });
}

export function cookiesFrom(response) {
  return (response.headers['set-cookie'] ?? []).map((cookie) => cookie.split(';')[0]).join('; ');
}

export async function loginAs(app, { email, password }) {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password });
  return { response, cookies: cookiesFrom(response) };
}
