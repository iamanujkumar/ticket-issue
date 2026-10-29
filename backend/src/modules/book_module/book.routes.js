import { Router } from 'express';
import { validate } from '../../core/middlewares/validate.js';
import { UserRole } from '../auth_module/auth.enums.js';
import { requireAuth, requireRole } from '../auth_module/auth.middleware.js';
import * as bookController from './book.controller.js';
import { bookIdParamsSchema, listBooksQuerySchema } from './book.schema.js';

export const bookRouter = Router();

bookRouter.use(requireAuth);

bookRouter.get(
  '/',
  requireRole(UserRole.AUTHOR, UserRole.ADMIN),
  validate({ query: listBooksQuerySchema }),
  bookController.listBooks,
);

bookRouter.get('/summary', requireRole(UserRole.AUTHOR), bookController.getRoyaltySummary);

bookRouter.get(
  '/:bookId',
  requireRole(UserRole.AUTHOR, UserRole.ADMIN),
  validate({ params: bookIdParamsSchema }),
  bookController.getBook,
);
