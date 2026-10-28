import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.js';
import { disconnectDatabase, prisma } from '../../../src/core/database/prisma.js';
import { cookiesFrom, createTestUser, deleteTestUsers, loginAs } from '../../helpers/test_users.js';

const app = createApp();
const AUTH = '/api/v1/auth';

beforeAll(async () => {
  await deleteTestUsers();
});

afterAll(async () => {
  await deleteTestUsers();
  await disconnectDatabase();
});

describe('POST /auth/login', () => {
  it('sets both httpOnly cookies and returns the user', async () => {
    const { user, email, password } = await createTestUser();

    const { response } = await loginAs(app, { email: `  ${email.toUpperCase()} `, password });

    expect(response.status).toBe(200);
    expect(response.body.data.user).toEqual({
      id: user.id,
      email,
      name: user.name,
      role: 'AUTHOR',
      authorId: user.author.id,
    });

    const [accessCookie, refreshCookie] = ['bl_at=', 'bl_rt='].map((name) =>
      response.headers['set-cookie'].find((cookie) => cookie.startsWith(name)),
    );
    expect(accessCookie).toMatch(/HttpOnly/);
    expect(accessCookie).toMatch(/Path=\/api;/);
    expect(refreshCookie).toMatch(/HttpOnly/);
    expect(refreshCookie).toMatch(/Path=\/api\/v1\/auth/);
    expect(JSON.stringify(response.body)).not.toContain('Token');
  });

  it('records the login time', async () => {
    const { user, email, password } = await createTestUser();

    await loginAs(app, { email, password });

    const stored = await prisma.user.findUnique({ where: { id: user.id } });
    expect(stored.lastLoginAt).toBeInstanceOf(Date);
  });

  it('answers a wrong password and an unknown email identically', async () => {
    const { email } = await createTestUser();

    const wrongPassword = await loginAs(app, { email, password: 'Wrong@12345' });
    const unknownEmail = await loginAs(app, { email: `nobody-${Date.now()}@auth-test.bookleaf.test`, password: 'x' });

    expect(wrongPassword.response.status).toBe(401);
    expect(unknownEmail.response.status).toBe(401);
    const { requestId: _first, ...wrongPasswordError } = wrongPassword.response.body.error;
    const { requestId: _second, ...unknownEmailError } = unknownEmail.response.body.error;
    expect(wrongPasswordError).toEqual(unknownEmailError);
    expect(wrongPasswordError.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects an inactive user with the same error', async () => {
    const { email, password } = await createTestUser({ role: 'ADMIN', isActive: false });

    const { response } = await loginAs(app, { email, password });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rate-limits the sixth attempt within a minute', async () => {
    const { email } = await createTestUser();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await loginAs(app, { email, password: 'Wrong@12345' });
    }
    const { response } = await loginAs(app, { email, password: 'Wrong@12345' });

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('GET /auth/me', () => {
  it('requires a session', async () => {
    const response = await request(app).get(`${AUTH}/me`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns the logged-in user', async () => {
    const { user, email, password } = await createTestUser({ role: 'ADMIN' });
    const { cookies } = await loginAs(app, { email, password });

    const response = await request(app).get(`${AUTH}/me`).set('Cookie', cookies);

    expect(response.status).toBe(200);
    expect(response.body.data.user).toMatchObject({ id: user.id, role: 'ADMIN', authorId: null });
  });
});

describe('POST /auth/refresh', () => {
  it('rotates the refresh token: the old one stops working, the new one works', async () => {
    const { email, password } = await createTestUser();
    const { cookies: firstCookies } = await loginAs(app, { email, password });

    const refreshed = await request(app).post(`${AUTH}/refresh`).set('Cookie', firstCookies);
    const secondCookies = cookiesFrom(refreshed);
    const refreshedAgain = await request(app).post(`${AUTH}/refresh`).set('Cookie', secondCookies);

    expect(refreshed.status).toBe(200);
    expect(secondCookies).not.toBe(firstCookies);
    expect(refreshedAgain.status).toBe(200);
  });

  it('detects reuse of a rotated token and ends the whole session', async () => {
    const { email, password } = await createTestUser();
    const { cookies: stolenCookies } = await loginAs(app, { email, password });
    const refreshed = await request(app).post(`${AUTH}/refresh`).set('Cookie', stolenCookies);

    const reuse = await request(app).post(`${AUTH}/refresh`).set('Cookie', stolenCookies);
    const newestAfterReuse = await request(app).post(`${AUTH}/refresh`).set('Cookie', cookiesFrom(refreshed));

    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('REFRESH_TOKEN_REUSED');
    expect(newestAfterReuse.status).toBe(401);
    expect(newestAfterReuse.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('fails without a refresh cookie and clears the cookies', async () => {
    const response = await request(app).post(`${AUTH}/refresh`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_EXPIRED');
    expect(response.headers['set-cookie'].join(';')).toMatch(/bl_at=;.*bl_rt=;/);
  });
});

describe('POST /auth/logout', () => {
  it('ends the session using only the refresh cookie and clears both cookies', async () => {
    const { email, password } = await createTestUser();
    const { cookies } = await loginAs(app, { email, password });
    const refreshCookieOnly = cookies.split('; ').find((cookie) => cookie.startsWith('bl_rt='));

    const logout = await request(app).post(`${AUTH}/logout`).set('Cookie', refreshCookieOnly);
    const refreshAfterLogout = await request(app).post(`${AUTH}/refresh`).set('Cookie', cookies);

    expect(logout.status).toBe(204);
    expect(logout.headers['set-cookie'].join(';')).toMatch(/bl_at=;.*bl_rt=;/);
    expect(refreshAfterLogout.status).toBe(401);
    expect(refreshAfterLogout.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('succeeds even without any cookie', async () => {
    const response = await request(app).post(`${AUTH}/logout`);

    expect(response.status).toBe(204);
  });
});
