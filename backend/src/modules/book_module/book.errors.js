import { NotFoundError } from '../../core/errors/app_error.js';

export const BOOK_ERROR_CODES = Object.freeze({
  BOOK_NOT_FOUND: 'BOOK_NOT_FOUND',
});

export class BookNotFoundError extends NotFoundError {
  constructor() {
    super({ code: BOOK_ERROR_CODES.BOOK_NOT_FOUND, message: 'Book not found.' });
  }
}
