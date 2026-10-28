import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../../../src/core/middlewares/error_handler.js';
import { rejectForeignOrigins, requireJsonBody } from '../../../src/core/middlewares/request_guards.js';
import { requestLogger } from '../../../src/core/middlewares/request_logger.js';

function createGuardedApp() {
  const app = express();
  app.use(requestLogger);
  app.use(rejectForeignOrigins(['http://localhost:5173']));
  app.use(requireJsonBody);
  app.all('/target', (_req, res) => res.json({ reached: true }));
  app.use(errorHandler);
  return app;
}

const app = createGuardedApp();

describe('rejectForeignOrigins', () => {
  it('allows writes from an allowed origin', async () => {
    const response = await request(app).post('/target').set('Origin', 'http://localhost:5173').send({});

    expect(response.status).toBe(200);
  });

  it('rejects writes from a foreign origin', async () => {
    const response = await request(app).post('/target').set('Origin', 'https://evil.example').send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_ORIGIN_MISMATCH');
  });

  it('allows reads from a foreign origin', async () => {
    const response = await request(app).get('/target').set('Origin', 'https://evil.example');

    expect(response.status).toBe(200);
  });

  it('allows writes without an Origin header', async () => {
    const response = await request(app).post('/target').send({});

    expect(response.status).toBe(200);
  });

  it('reads the allowed origins from ALLOWED_ORIGINS by default', async () => {
    const appUsingEnv = express();
    appUsingEnv.use(rejectForeignOrigins());
    appUsingEnv.post('/target', (_req, res) => res.json({ reached: true }));
    appUsingEnv.use(errorHandler);

    const response = await request(appUsingEnv).post('/target').set('Origin', 'http://localhost:5173');

    expect(response.status).toBe(200);
  });
});

describe('requireJsonBody', () => {
  it('rejects an HTML form body', async () => {
    const response = await request(app).post('/target').type('form').send('subject=hello');

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('accepts a JSON body', async () => {
    const response = await request(app).post('/target').send({ subject: 'hello' });

    expect(response.status).toBe(200);
  });

  it('accepts a write request without a body', async () => {
    const response = await request(app).post('/target');

    expect(response.status).toBe(200);
  });
});
