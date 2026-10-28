import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.js';

const app = createApp();

describe('health endpoints', () => {
  it('reports liveness without touching dependencies', async () => {
    const response = await request(app).get('/healthz');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('returns 503 and names the failing check when a dependency is down', async () => {
    const appWithFailingCheck = createApp({
      readinessChecks: [
        { name: 'database', check: async () => {} },
        { name: 'queue', check: () => Promise.reject(new Error('down')) },
      ],
    });

    const response = await request(appWithFailingCheck).get('/readyz');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'unavailable',
      checks: [
        { name: 'database', status: 'ok' },
        { name: 'queue', status: 'failed' },
      ],
    });
  });
});

describe('security headers', () => {
  it('sets helmet headers and hides the framework', async () => {
    const response = await request(app).get('/healthz');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});

describe('request id', () => {
  it('generates an id when none is sent', async () => {
    const response = await request(app).get('/healthz');

    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('reuses a safe incoming id', async () => {
    const response = await request(app).get('/healthz').set('X-Request-Id', 'trace-abc-12345');

    expect(response.headers['x-request-id']).toBe('trace-abc-12345');
  });

  it('replaces an unsafe incoming id', async () => {
    const response = await request(app).get('/healthz').set('X-Request-Id', 'bad id <script>');

    expect(response.headers['x-request-id']).not.toBe('bad id <script>');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('api router', () => {
  it('returns ROUTE_NOT_FOUND with the same request id as the header', async () => {
    const response = await request(app).get('/api/v1/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('rejects malformed JSON with MALFORMED_JSON', async () => {
    const response = await request(app)
      .post('/api/v1/anything')
      .set('Content-Type', 'application/json')
      .send('{"subject": ');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('MALFORMED_JSON');
  });

  it('rejects a body larger than 100kb', async () => {
    const response = await request(app)
      .post('/api/v1/anything')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ text: 'x'.repeat(110 * 1024) }));

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
