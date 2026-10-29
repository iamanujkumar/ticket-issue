import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

export const registry = new OpenAPIRegistry();

export const COOKIE_AUTH = 'cookieAuth';

const ERROR_DESCRIPTIONS = {
  400: 'The request is invalid (VALIDATION_ERROR, MALFORMED_JSON)',
  401: 'Not logged in or the session expired',
  403: 'Logged in, but not allowed (wrong role, or a write from a foreign origin)',
  404: 'Not found, or not yours',
  409: 'Conflicts with the current state',
  413: 'The request body is too large',
  415: 'The request body is not JSON',
  422: 'Valid, but cannot be processed',
  429: 'Too many requests',
};

export const ErrorResponseSchema = z
  .object({
    error: z.object({
      code: z.string().meta({ example: 'TICKET_NOT_FOUND' }),
      message: z.string().meta({ example: 'Ticket not found.' }),
      details: z.unknown().optional(),
      requestId: z.string(),
    }),
  })
  .meta({ id: 'ErrorResponse' });

export const MoneySchema = z
  .object({
    amountMinor: z.number().int().meta({ description: 'Amount in paise (₹1 = 100)', example: 254600 }),
    currency: z.string().meta({ example: 'INR' }),
  })
  .strict()
  .meta({ id: 'Money' });

export const PageMetaSchema = z
  .object({ page: z.number().int(), pageSize: z.number().int(), total: z.number().int() })
  .strict()
  .meta({ id: 'PageMeta' });

export function dataOf(schema) {
  return z.object({ data: schema }).strict();
}

export function jsonBody(schema) {
  return { content: { 'application/json': { schema } } };
}

export function jsonResponse(description, schema) {
  return { description, content: { 'application/json': { schema } } };
}

export function errorResponses(...statuses) {
  return Object.fromEntries(
    statuses.map((status) => [status, jsonResponse(ERROR_DESCRIPTIONS[status], ErrorResponseSchema)]),
  );
}

export function registerEndpoint({ method, path, tag, summary, access, description, request, responses }) {
  const isPublic = access.startsWith('public');
  registry.registerPath({
    method,
    path,
    tags: [tag],
    summary,
    description: [description, `**Access:** ${access}.`].filter(Boolean).join('\n\n'),
    security: isPublic ? [] : [{ [COOKIE_AUTH]: [] }],
    request,
    responses,
  });
}
