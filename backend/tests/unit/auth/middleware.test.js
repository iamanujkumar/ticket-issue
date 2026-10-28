import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../../../src/core/middlewares/error_handler.js';
import { requestLogger } from '../../../src/core/middlewares/request_logger.js';
import { requireAuth, requireRole } from '../../../src/modules/auth_module/auth.middleware.js';
import { createAccessToken } from '../../../src/modules/auth_module/auth.tokens.js';

const AUTHOR = { id: '7d9f2b1e-3c4a-4b8e-9f10-2a3b4c5d6e7f', role: 'AUTHOR', authorId: 'a1b2c3d4-0000-4000-8000-000000000001' };
const ADMIN = { id: 'b2c3d4e5-0000-4000-8000-000000000002', role: 'ADMIN', authorId: null };

function createGuardedApp() {
  const app = express();
  app.use(requestLogger);
  app.use(cookieParser());
  app.get('/whoami', requireAuth, (req, res) => res.json(req.user));
  app.get('/admin-only', requireAuth, requireRole('ADMIN'), (_req, res) => res.json({ reached: true }));
  app.get('/both', requireAuth, requireRole('AUTHOR', 'ADMIN'), (_req, res) => res.json({ reached: true }));
  app.use(errorHandler);
  return app;
}

const app = createGuardedApp();
const accessCookie = (user) => `bl_at=${createAccessToken(user)}`;

describe('requireAuth', () => {
  it('rejects a request without the access cookie', async () => {
    const response = await request(app).get('/whoami');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects an invalid access token', async () => {
    const response = await request(app).get('/whoami').set('Cookie', 'bl_at=not-a-jwt');

    expect(response.status).toBe(401);
  });

  it('puts the user from the token on req.user', async () => {
    const response = await request(app).get('/whoami').set('Cookie', accessCookie(AUTHOR));

    expect(response.body).toEqual({ userId: AUTHOR.id, role: 'AUTHOR', authorId: AUTHOR.authorId });
  });
});

describe('requireRole', () => {
  it('lets an admin through an admin-only route', async () => {
    const response = await request(app).get('/admin-only').set('Cookie', accessCookie(ADMIN));

    expect(response.status).toBe(200);
  });

  it('rejects an author on an admin-only route with 403', async () => {
    const response = await request(app).get('/admin-only').set('Cookie', accessCookie(AUTHOR));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('allows every listed role', async () => {
    const asAuthor = await request(app).get('/both').set('Cookie', accessCookie(AUTHOR));
    const asAdmin = await request(app).get('/both').set('Cookie', accessCookie(ADMIN));

    expect([asAuthor.status, asAdmin.status]).toEqual([200, 200]);
  });
});
