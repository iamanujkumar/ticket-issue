import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { Router } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { registry } from './core/openapi/registry.js';
import './modules/auth_module/auth.openapi.js';
import './modules/book_module/book.openapi.js';
import './modules/ticket_module/ticket.openapi.js';
import './modules/ai_module/ai.openapi.js';
import './modules/realtime_module/realtime.openapi.js';
import './modules/admin_module/admin.openapi.js';

export const OPENAPI_SPEC_PATH = '/api/v1/openapi.json';
export const DOCS_PATH = '/api/docs';

const API_DESCRIPTION = `REST API of the BookLeaf Author Support & Communication Portal.

1. Call **POST /auth/login** with a demo account (see the README). The browser keeps the session cookie.
2. Every other "Try it out" request is then sent as that user.

Errors always look like \`{ "error": { "code", "message", "details?", "requestId" } }\`. Money is in paise (₹1 = 100).`;

const TAGS = [
  { name: 'Auth', description: 'Login, session refresh, logout' },
  { name: 'Books', description: "Author's books and royalty summary" },
  { name: 'Tickets', description: 'Support tickets, replies, internal notes, activity' },
  { name: 'AI', description: 'AI-drafted replies and triage retries' },
  { name: 'Realtime', description: 'Live update stream' },
  { name: 'Admin', description: 'Admins list and dashboard statistics' },
];

const docsSecurityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      'script-src': ["'self'", "'unsafe-inline'"],
      'upgrade-insecure-requests': null,
    },
  },
});

let openApiDocument = null;

export function buildOpenApiDocument() {
  openApiDocument ??= new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'BookLeaf Author Support API', version: '1.0.0', description: API_DESCRIPTION },
    servers: [{ url: '/api/v1' }],
    tags: TAGS,
  });
  return openApiDocument;
}

export function createDocsRouter() {
  const router = Router();

  router.get(OPENAPI_SPEC_PATH, (_req, res) => {
    res.json(buildOpenApiDocument());
  });

  router.use(
    DOCS_PATH,
    docsSecurityHeaders,
    swaggerUi.serve,
    swaggerUi.setup(null, {
      customSiteTitle: 'BookLeaf API',
      swaggerOptions: { url: OPENAPI_SPEC_PATH, withCredentials: true, displayRequestDuration: true },
    }),
  );

  return router;
}
