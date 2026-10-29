import { z } from 'zod';
import { dataOf, errorResponses, jsonBody, jsonResponse, registerEndpoint } from '../../core/openapi/registry.js';
import { MessageSchema } from '../ticket_module/ticket.openapi.js';
import { ticketIdParamsSchema } from '../ticket_module/ticket.schema.js';
import { DraftStatus } from './ai.enums.js';
import { regenerateBodySchema, sendDraftBodySchema } from './ai.schema.js';

const TAG = 'AI';
const params = ticketIdParamsSchema;

const DraftSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(Object.values(DraftStatus)),
    content: z.string().nullable(),
    internalHints: z.array(z.string()).meta({ description: 'For the admin only: things to verify or fill in before sending' }),
    isStale: z.boolean().meta({ description: 'A newer author message exists, or the category changed since the draft was written' }),
    model: z.string().nullable(),
    instructions: z.string().nullable(),
    errorCode: z.string().nullable(),
    sent: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .strict()
  .meta({ id: 'AiDraft' });

registerEndpoint({
  method: 'get',
  path: '/tickets/{ticketId}/ai-draft',
  tag: TAG,
  summary: 'The current AI-drafted reply',
  access: 'admin',
  description: 'Drafts are generated in the background when a ticket is created, when the author replies and when the category changes. data is null until the first draft exists.',
  request: { params },
  responses: { 200: jsonResponse('Latest draft, or null', dataOf(DraftSchema.nullable())), ...errorResponses(400, 401, 403, 404) },
});

registerEndpoint({
  method: 'post',
  path: '/tickets/{ticketId}/ai-draft/regenerate',
  tag: TAG,
  summary: 'Ask the AI for a new draft',
  access: 'admin',
  description: 'Optional short instructions (e.g. "shorter, mention the reprint"). At most 5 regenerations per ticket per 10 minutes.',
  request: { params, body: jsonBody(regenerateBodySchema) },
  responses: {
    202: jsonResponse('Queued', dataOf(z.object({ status: z.literal('PENDING') }).strict())),
    ...errorResponses(400, 401, 403, 404, 429),
  },
});

registerEndpoint({
  method: 'post',
  path: '/tickets/{ticketId}/ai-draft/send',
  tag: TAG,
  summary: 'Send a reply based on a draft',
  access: 'admin',
  description: 'Sends body (the draft, edited or not) as a normal reply and records whether the draft was changed. The same reply rules apply as for POST /tickets/{ticketId}/messages.',
  request: { params, body: jsonBody(sendDraftBodySchema) },
  responses: { 201: jsonResponse('Message added', dataOf(MessageSchema)), ...errorResponses(400, 401, 403, 404, 409, 422) },
});

registerEndpoint({
  method: 'post',
  path: '/tickets/{ticketId}/triage/retry',
  tag: TAG,
  summary: 'Run AI triage again',
  access: 'admin',
  responses: {
    202: jsonResponse('Queued', dataOf(z.object({ triageStatus: z.literal('PENDING') }).strict())),
    ...errorResponses(400, 401, 403, 404),
  },
  request: { params },
});
