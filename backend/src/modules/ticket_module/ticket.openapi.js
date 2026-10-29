import { z } from 'zod';
import {
  dataOf,
  errorResponses,
  jsonBody,
  jsonResponse,
  PageMetaSchema,
  registerEndpoint,
} from '../../core/openapi/registry.js';
import { UserRole } from '../auth_module/auth.enums.js';
import {
  ClassificationSource,
  TicketCategory,
  TicketEventType,
  TicketPriority,
  TicketStatus,
  TriageStatus,
} from './ticket.enums.js';
import {
  createTicketBodySchema,
  listTicketsQuerySchema,
  messageBodySchema,
  noteBodySchema,
  ticketIdParamsSchema,
  updateTicketBodySchema,
} from './ticket.schema.js';

const TAG = 'Tickets';
const isoTime = () => z.iso.datetime();
const person = z.object({ id: z.uuid(), name: z.string() }).strict();

const authorTicketShape = {
  id: z.uuid(),
  ticketNumber: z.string().meta({ example: 'BL-000042' }),
  subject: z.string(),
  description: z.string(),
  status: z.enum(Object.values(TicketStatus)),
  category: z.enum(Object.values(TicketCategory)),
  book: z.object({ id: z.uuid(), code: z.string(), title: z.string() }).strict().nullable(),
  createdAt: isoTime(),
  lastActivityAt: isoTime(),
  resolvedAt: isoTime().nullable(),
  closedAt: isoTime().nullable(),
};

export const AuthorTicketSchema = z
  .object(authorTicketShape)
  .strict()
  .meta({ id: 'AuthorTicket', description: 'What an author sees. No priority, AI or assignment details.' });

export const AdminTicketSchema = z
  .object({
    ...authorTicketShape,
    categorySource: z.enum(Object.values(ClassificationSource)),
    priority: z.enum(Object.values(TicketPriority)),
    prioritySource: z.enum(Object.values(ClassificationSource)),
    ai: z
      .object({
        category: z.enum(Object.values(TicketCategory)).nullable(),
        priority: z.enum(Object.values(TicketPriority)).nullable(),
        confidence: z.number().min(0).max(1).nullable(),
        rationale: z.string().nullable(),
      })
      .strict(),
    triageStatus: z.enum(Object.values(TriageStatus)),
    needsReview: z.boolean(),
    author: person,
    assignee: person.nullable(),
    slaDueAt: isoTime(),
    isOverdue: z.boolean(),
    isDueSoon: z.boolean(),
    firstResponseAt: isoTime().nullable(),
    version: z.number().int().meta({ description: 'Send back in PATCH to detect concurrent edits' }),
  })
  .strict()
  .meta({ id: 'AdminTicket' });

const TicketSchema = z.union([AdminTicketSchema, AuthorTicketSchema]).meta({ id: 'Ticket' });

export const MessageSchema = z
  .object({
    id: z.uuid(),
    body: z.string(),
    senderRole: z.enum(Object.values(UserRole)),
    senderName: z.string().meta({ description: 'Authors see every admin as "BookLeaf Support"' }),
    createdAt: isoTime(),
  })
  .strict()
  .meta({ id: 'Message' });

const NoteSchema = z
  .object({ id: z.uuid(), body: z.string(), admin: person.nullable(), createdAt: isoTime() })
  .strict()
  .meta({ id: 'InternalNote' });

const EventSchema = z
  .object({
    id: z.uuid(),
    type: z.enum(Object.values(TicketEventType)),
    from: z.string().nullable(),
    to: z.string().nullable(),
    actor: person.nullable().meta({ description: 'Null for system events (AI, automatic changes)' }),
    createdAt: isoTime(),
  })
  .strict()
  .meta({ id: 'TicketEvent' });

const ticketPath = '/tickets/{ticketId}';
const params = ticketIdParamsSchema;

registerEndpoint({
  method: 'post',
  path: '/tickets',
  tag: TAG,
  summary: 'Raise a support ticket',
  access: 'author',
  description: 'bookId null = General / Account Level. The ticket is classified by keyword rules at once and queued for AI triage in the same transaction.',
  request: { body: jsonBody(createTicketBodySchema) },
  responses: { 201: jsonResponse('Created', dataOf(AuthorTicketSchema)), ...errorResponses(400, 401, 403, 415) },
});

registerEndpoint({
  method: 'get',
  path: '/tickets',
  tag: TAG,
  summary: 'My tickets (author) or the ticket queue (admin)',
  access: 'author, admin',
  description: 'Authors get their own tickets, latest activity first; filters are ignored. Admins get the queue: sort=queue puts unresolved, then overdue, then higher priority, then older tickets first. List filters accept comma-separated values, e.g. status=OPEN,IN_PROGRESS.',
  request: { query: listTicketsQuerySchema },
  responses: {
    200: jsonResponse('Page of tickets', z.object({ data: z.array(TicketSchema), meta: PageMetaSchema }).strict()),
    ...errorResponses(400, 401, 403),
  },
});

registerEndpoint({
  method: 'get',
  path: ticketPath,
  tag: TAG,
  summary: 'One ticket',
  access: 'author (own tickets), admin',
  request: { params },
  responses: { 200: jsonResponse('Ticket (author or admin view)', dataOf(TicketSchema)), ...errorResponses(400, 401, 403, 404) },
});

registerEndpoint({
  method: 'patch',
  path: ticketPath,
  tag: TAG,
  summary: 'Change status, category, priority or assignee',
  access: 'admin; author may only send {"status":"CLOSED"}',
  description: 'Admins must send the ticket version; a stale version answers 409 VERSION_CONFLICT. Status changes follow the state machine (INVALID_STATUS_TRANSITION). Assigning an open ticket moves it to IN_PROGRESS.',
  request: { params, body: jsonBody(updateTicketBodySchema) },
  responses: { 200: jsonResponse('Updated ticket', dataOf(TicketSchema)), ...errorResponses(400, 401, 403, 404, 409, 422) },
});

registerEndpoint({
  method: 'get',
  path: `${ticketPath}/messages`,
  tag: TAG,
  summary: 'The public conversation',
  access: 'author (own tickets), admin',
  request: { params },
  responses: { 200: jsonResponse('Messages, oldest first', dataOf(z.array(MessageSchema))), ...errorResponses(400, 401, 403, 404) },
});

registerEndpoint({
  method: 'post',
  path: `${ticketPath}/messages`,
  tag: TAG,
  summary: 'Reply',
  access: 'author (own tickets), admin',
  description: 'An author reply re-opens a RESOLVED ticket. The first admin reply moves an OPEN ticket to IN_PROGRESS. Admin replies with [placeholders] are refused (422 UNRESOLVED_PLACEHOLDERS). Closed tickets refuse replies (409 TICKET_CLOSED).',
  request: { params, body: jsonBody(messageBodySchema) },
  responses: { 201: jsonResponse('Message added', dataOf(MessageSchema)), ...errorResponses(400, 401, 403, 404, 409, 422) },
});

registerEndpoint({
  method: 'get',
  path: `${ticketPath}/notes`,
  tag: TAG,
  summary: 'Internal notes',
  access: 'admin',
  request: { params },
  responses: { 200: jsonResponse('Notes, oldest first', dataOf(z.array(NoteSchema))), ...errorResponses(400, 401, 403, 404) },
});

registerEndpoint({
  method: 'post',
  path: `${ticketPath}/notes`,
  tag: TAG,
  summary: 'Add an internal note (never visible to the author)',
  access: 'admin',
  request: { params, body: jsonBody(noteBodySchema) },
  responses: { 201: jsonResponse('Note added', dataOf(NoteSchema)), ...errorResponses(400, 401, 403, 404) },
});

registerEndpoint({
  method: 'get',
  path: `${ticketPath}/events`,
  tag: TAG,
  summary: 'Activity log',
  access: 'admin',
  request: { params },
  responses: { 200: jsonResponse('Events, oldest first', dataOf(z.array(EventSchema))), ...errorResponses(400, 401, 403, 404) },
});
