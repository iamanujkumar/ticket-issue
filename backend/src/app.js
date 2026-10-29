import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { createHealthRouter } from './core/health/health.routes.js';
import { errorHandler, notFoundHandler } from './core/middlewares/error_handler.js';
import { rejectForeignOrigins, requireJsonBody } from './core/middlewares/request_guards.js';
import { requestLogger } from './core/middlewares/request_logger.js';
import { authRouter } from './modules/auth_module/auth.routes.js';
import { bookRouter } from './modules/book_module/book.routes.js';
import { ticketRouter } from './modules/ticket_module/ticket.routes.js';

const JSON_BODY_LIMIT = '100kb';

function createApiRouter() {
  const router = express.Router();

  router.use(rejectForeignOrigins());
  router.use(requireJsonBody);
  router.use(express.json({ limit: JSON_BODY_LIMIT }));
  router.use(cookieParser());

  router.use('/auth', authRouter);
  router.use('/books', bookRouter);
  router.use('/tickets', ticketRouter);

  return router;
}

export function createApp({ readinessChecks = [] } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 0));

  app.use(requestLogger);
  app.use(helmet());

  app.use(createHealthRouter(readinessChecks));
  app.use('/api/v1', createApiRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
