import { z } from 'zod';
import {
  ASSIGNEE_FILTERS,
  DESCRIPTION_LIMITS,
  PAGE_SIZE,
  QUEUE_SORTS,
  REPLY_LIMITS,
  SEARCH_MAX_LENGTH,
  SUBJECT_LIMITS,
} from './ticket.constants.js';
import { TicketCategory, TicketPriority, TicketStatus } from './ticket.enums.js';

const statusValues = Object.values(TicketStatus);
const categoryValues = Object.values(TicketCategory);
const priorityValues = Object.values(TicketPriority);

function listOf(values) {
  return z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(values)).min(1));
}

function textBetween({ MIN, MAX }, label) {
  return z
    .string({ error: `${label} is required` })
    .trim()
    .min(MIN, MIN === 1 ? `${label} is required` : `${label} must be at least ${MIN} characters`)
    .max(MAX, `${label} must be at most ${MAX} characters`);
}

export const ticketIdParamsSchema = z
  .object({
    ticketId: z.uuid('Ticket id must be a valid id'),
  })
  .strict();

export const createTicketBodySchema = z
  .object({
    bookId: z.uuid('Book id must be a valid id').nullable().default(null),
    subject: textBetween(SUBJECT_LIMITS, 'Subject'),
    description: textBetween(DESCRIPTION_LIMITS, 'Description'),
  })
  .strict();

export const listTicketsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE.MAX).default(PAGE_SIZE.DEFAULT),
    status: listOf(statusValues).optional(),
    category: listOf(categoryValues).optional(),
    priority: listOf(priorityValues).optional(),
    assignee: z
      .union([z.enum(Object.values(ASSIGNEE_FILTERS)), z.uuid('Assignee must be me, unassigned or an admin id')])
      .optional(),
    createdFrom: z.iso.date().optional(),
    createdTo: z.iso.date().optional(),
    overdue: z.stringbool().optional(),
    needsReview: z.stringbool().optional(),
    q: z.string().trim().min(1).max(SEARCH_MAX_LENGTH).optional(),
    sort: z.enum(Object.values(QUEUE_SORTS)).default(QUEUE_SORTS.QUEUE),
  })
  .strict();

export const updateTicketBodySchema = z
  .object({
    status: z.enum(statusValues).optional(),
    category: z.enum(categoryValues).optional(),
    priority: z.enum(priorityValues).optional(),
    assigneeId: z.uuid('Assignee must be a valid id').nullable().optional(),
    version: z.number().int().min(1).optional(),
  })
  .strict()
  .refine(
    ({ status, category, priority, assigneeId }) =>
      [status, category, priority, assigneeId].some((value) => value !== undefined),
    'Send at least one of status, category, priority or assigneeId',
  );

export const messageBodySchema = z
  .object({
    body: textBetween(REPLY_LIMITS, 'Message'),
  })
  .strict();

export const noteBodySchema = z
  .object({
    body: textBetween(REPLY_LIMITS, 'Note'),
  })
  .strict();
