import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { createHealthRouter } from './core/health/health.routes.js';
import { errorHandler, notFoundHandler } from './core/middlewares/error_handler.js';
import { rejectForeignOrigins, requireJsonBody } from './core/middlewares/request_guards.js';
import { requestLogger } from './core/middlewares/request_logger.js';
import { adminsRouter, statsRouter } from './modules/admin_module/admin.routes.js';
import { aiRouter } from './modules/ai_module/ai.routes.js';
import { authRouter } from './modules/auth_module/auth.routes.js';
import { bookRouter } from './modules/book_module/book.routes.js';
import { realtimeRouter } from './modules/realtime_module/realtime.routes.js';
import { ticketRouter } from './modules/ticket_module/ticket.routes.js';
import { createDocsRouter } from './openapi.js';

const JSON_BODY_LIMIT = '100kb';

export const API_PREFIX = '/api/v1';

export const API_ROUTERS = [
  ['/auth', authRouter],
  ['/books', bookRouter],
  ['/tickets', ticketRouter],
  ['/tickets', aiRouter],
  ['/events', realtimeRouter],
  ['/admins', adminsRouter],
  ['/stats', statsRouter],
];

function createApiRouter() {
  const router = express.Router();

  router.use(rejectForeignOrigins());
  router.use(requireJsonBody);
  router.use(express.json({ limit: JSON_BODY_LIMIT }));
  router.use(cookieParser());

  for (const [mountPath, moduleRouter] of API_ROUTERS) {
    router.use(mountPath, moduleRouter);
  }

  return router;
}

export function createApp({ readinessChecks = [] } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 0));

  app.use(requestLogger);
  app.use(helmet());

  app.use(createHealthRouter(readinessChecks));
  app.use(createDocsRouter());
  app.use(API_PREFIX, createApiRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
