import { z } from 'zod';
import { dataOf, errorResponses, jsonResponse, MoneySchema, registerEndpoint } from '../../core/openapi/registry.js';
import { BookStatus, Platform, PrintPartner, ProductionStage } from './book.enums.js';
import { bookIdParamsSchema, listBooksQuerySchema } from './book.schema.js';

const TAG = 'Books';

export const BookSchema = z
  .object({
    id: z.uuid(),
    code: z.string().meta({ example: 'BK001' }),
    authorId: z.uuid(),
    title: z.string(),
    isbn: z.string().nullable(),
    genre: z.string(),
    status: z.enum(Object.values(BookStatus)),
    productionStage: z.enum(Object.values(ProductionStage)).nullable(),
    publicationDate: z.iso.date().nullable(),
    mrp: MoneySchema.nullable(),
    royaltyPerCopy: MoneySchema.nullable(),
    copiesSold: z.number().int(),
    royaltyEarned: MoneySchema,
    royaltyPaid: MoneySchema,
    royaltyPending: MoneySchema,
    lastPayoutDate: z.iso.date().nullable(),
    printPartner: z.enum(Object.values(PrintPartner)).nullable(),
    platforms: z.array(z.enum(Object.values(Platform))),
  })
  .strict()
  .meta({ id: 'Book', description: 'Commercial fields are null while the book is in production.' });

export const RoyaltySummarySchema = z
  .object({
    totals: z.object({ earned: MoneySchema, paid: MoneySchema, pending: MoneySchema }).strict(),
    bookCount: z.number().int(),
    publishedCount: z.number().int(),
    lastPayoutDate: z.iso.date().nullable(),
    payout: z
      .object({
        threshold: MoneySchema,
        isBelowThreshold: z.boolean().meta({ description: 'Pending below ₹1,000 rolls over to the next quarter' }),
        nextPayout: z
          .object({ quarter: z.string().meta({ example: 'Q3 2026' }), paidBy: z.iso.date() })
          .strict(),
      })
      .strict(),
  })
  .strict()
  .meta({ id: 'RoyaltySummary' });

registerEndpoint({
  method: 'get',
  path: '/books',
  tag: TAG,
  summary: 'List books',
  access: 'author, admin',
  description: 'Authors always get only their own books (an authorId in the query is ignored). Admins get all books, or one author with ?authorId=.',
  request: { query: listBooksQuerySchema },
  responses: { 200: jsonResponse('Books', dataOf(z.array(BookSchema))), ...errorResponses(400, 401, 403) },
});

registerEndpoint({
  method: 'get',
  path: '/books/summary',
  tag: TAG,
  summary: "The author's royalty summary and next payout date",
  access: 'author',
  responses: { 200: jsonResponse('Royalty summary', dataOf(RoyaltySummarySchema)), ...errorResponses(401, 403) },
});

registerEndpoint({
  method: 'get',
  path: '/books/{bookId}',
  tag: TAG,
  summary: 'One book',
  access: 'author (own books), admin',
  description: "Another author's book answers 404, exactly like a book that does not exist.",
  request: { params: bookIdParamsSchema },
  responses: { 200: jsonResponse('Book', dataOf(BookSchema)), ...errorResponses(400, 401, 403, 404) },
});
