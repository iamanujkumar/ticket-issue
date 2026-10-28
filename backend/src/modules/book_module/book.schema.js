import { z } from 'zod';

export const bookIdParamsSchema = z
  .object({
    bookId: z.uuid('Book id must be a valid id'),
  })
  .strict();

export const listBooksQuerySchema = z
  .object({
    authorId: z.uuid('Author id must be a valid id').optional(),
  })
  .strict();
