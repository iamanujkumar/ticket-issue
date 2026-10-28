import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorHandler } from '../../../src/core/middlewares/error_handler.js';
import { requestLogger } from '../../../src/core/middlewares/request_logger.js';
import { validate } from '../../../src/core/middlewares/validate.js';

const schemas = {
  params: z.object({ ticketId: z.uuid() }),
  query: z.object({ page: z.coerce.number().int().min(1).default(1) }).strict(),
  body: z
    .object({
      email: z.string().trim().toLowerCase().pipe(z.email()),
      password: z.string().min(1, 'Password is required'),
    })
    .strict(),
};

const TICKET_ID = '7d9f2b1e-3c4a-4b8e-9f10-2a3b4c5d6e7f';

function createValidatedApp() {
  const app = express();
  app.use(requestLogger);
  app.use(express.json());
  app.post('/tickets/:ticketId', validate(schemas), (req, res) => res.json(req.validated));
  app.use(errorHandler);
  return app;
}

const app = createValidatedApp();

describe('validate', () => {
  it('passes cleaned and converted values on req.validated', async () => {
    const response = await request(app)
      .post(`/tickets/${TICKET_ID}?page=2`)
      .send({ email: '  Priya.Sharma@Email.com ', password: 'secret' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      params: { ticketId: TICKET_ID },
      query: { page: 2 },
      body: { email: 'priya.sharma@email.com', password: 'secret' },
    });
  });

  it('applies schema defaults', async () => {
    const response = await request(app)
      .post(`/tickets/${TICKET_ID}`)
      .send({ email: 'a@b.co', password: 'x' });

    expect(response.body.query).toEqual({ page: 1 });
  });

  it('reports problems in params, query and body together', async () => {
    const response = await request(app)
      .post('/tickets/not-a-uuid?page=0')
      .send({ email: 'nope', password: '', role: 'ADMIN' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.map((detail) => detail.path)).toEqual([
      'params.ticketId',
      'query.page',
      'body.email',
      'body.password',
      'body',
    ]);
  });
});
