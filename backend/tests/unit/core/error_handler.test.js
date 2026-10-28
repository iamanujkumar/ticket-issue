import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError, NotFoundError } from '../../../src/core/errors/app_error.js';
import { errorHandler, notFoundHandler } from '../../../src/core/middlewares/error_handler.js';
import { requestLogger } from '../../../src/core/middlewares/request_logger.js';

class TicketNotFoundError extends NotFoundError {
  constructor() {
    super({ code: 'TICKET_NOT_FOUND', message: 'Ticket not found.' });
  }
}

function prismaError(code) {
  return Object.assign(new Error('internal prisma details'), { name: 'PrismaClientKnownRequestError', code });
}

function appThrowing(error) {
  const app = express();
  app.use(requestLogger);
  app.get('/fail', () => Promise.reject(error));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('keeps the status, code and message of an AppError subclass', async () => {
    const response = await request(appThrowing(new TicketNotFoundError())).get('/fail');

    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({ code: 'TICKET_NOT_FOUND', message: 'Ticket not found.' });
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('keeps the details of an AppError', async () => {
    const error = new AppError({ code: 'SOMETHING', httpStatus: 422, message: 'No.', details: [{ path: 'x' }] });

    const response = await request(appThrowing(error)).get('/fail');

    expect(response.status).toBe(422);
    expect(response.body.error.details).toEqual([{ path: 'x' }]);
  });

  it('turns a ZodError into VALIDATION_ERROR', async () => {
    const zodError = z.object({ subject: z.string() }).safeParse({}).error;

    const response = await request(appThrowing(zodError)).get('/fail');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details[0].path).toBe('subject');
  });

  it('maps a Prisma unique violation to 409 and a missing record to 404', async () => {
    const duplicate = await request(appThrowing(prismaError('P2002'))).get('/fail');
    const missing = await request(appThrowing(prismaError('P2025'))).get('/fail');

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.message).not.toContain('prisma');
    expect(missing.status).toBe(404);
  });

  it('hides the details of an unexpected error behind a generic 500', async () => {
    const response = await request(appThrowing(new Error('DB password is hunter2'))).get('/fail');

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('hunter2');
  });

  it('answers unknown routes with ROUTE_NOT_FOUND', async () => {
    const response = await request(appThrowing(new Error('unused'))).get('/nowhere');

    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({
      code: 'ROUTE_NOT_FOUND',
      message: 'Route GET /nowhere does not exist.',
    });
  });
});
