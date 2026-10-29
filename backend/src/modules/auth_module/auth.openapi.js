import { z } from 'zod';
import {
  COOKIE_AUTH,
  dataOf,
  errorResponses,
  jsonBody,
  jsonResponse,
  registerEndpoint,
  registry,
} from '../../core/openapi/registry.js';
import { COOKIE_NAMES } from './auth.constants.js';
import { UserRole } from './auth.enums.js';
import { loginBodySchema } from './auth.schema.js';

const TAG = 'Auth';

registry.registerComponent('securitySchemes', COOKIE_AUTH, {
  type: 'apiKey',
  in: 'cookie',
  name: COOKIE_NAMES.ACCESS,
  description: 'Set by POST /auth/login. In Swagger UI, call login once; the browser sends the cookie on every request.',
});

export const AuthUserSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    name: z.string(),
    role: z.enum(Object.values(UserRole)),
    authorId: z.uuid().nullable().meta({ description: 'Null for admins' }),
  })
  .strict()
  .meta({ id: 'AuthUser' });

const UserResponseSchema = dataOf(z.object({ user: AuthUserSchema }).strict());

registerEndpoint({
  method: 'post',
  path: '/auth/login',
  tag: TAG,
  summary: 'Log in with email and password',
  access: 'public',
  description: `Sets two httpOnly cookies: \`${COOKIE_NAMES.ACCESS}\` (15 minutes) and \`${COOKIE_NAMES.REFRESH}\` (7 days). Unknown email and wrong password give the same 401. Limited to 5 attempts per minute per IP and email.`,
  request: {
    body: jsonBody(loginBodySchema.meta({ example: { email: 'priya.sharma@email.com', password: 'Author@12345' } })),
  },
  responses: { 200: jsonResponse('Logged in', UserResponseSchema), ...errorResponses(400, 401, 429) },
});

registerEndpoint({
  method: 'post',
  path: '/auth/refresh',
  tag: TAG,
  summary: 'Get a new access token using the refresh cookie',
  access: 'public (refresh cookie)',
  description: 'Rotates the refresh token. Re-using an old refresh token ends the whole session (REFRESH_TOKEN_REUSED).',
  responses: { 200: jsonResponse('Session renewed', UserResponseSchema), ...errorResponses(401) },
});

registerEndpoint({
  method: 'post',
  path: '/auth/logout',
  tag: TAG,
  summary: 'Log out',
  access: 'public',
  description: 'Ends the session and clears both cookies. Works even when the access token has expired.',
  responses: { 204: { description: 'Logged out' } },
});

registerEndpoint({
  method: 'get',
  path: '/auth/me',
  tag: TAG,
  summary: 'The logged-in user',
  access: 'author, admin',
  responses: { 200: jsonResponse('Current user', UserResponseSchema), ...errorResponses(401) },
});
