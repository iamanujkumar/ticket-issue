import { z } from 'zod';
import { EVENT_TYPES } from '../../core/events/event_bus.js';
import { errorResponses, registerEndpoint } from '../../core/openapi/registry.js';

registerEndpoint({
  method: 'get',
  path: '/events/stream',
  tag: 'Realtime',
  summary: 'Live update stream (Server-Sent Events)',
  access: 'author, admin',
  description: [
    'Keeps the connection open and sends `event: <type>` with `data: {"ticketId":"…"}` whenever something changes; the client then re-fetches through the normal endpoints. A `: ping` comment arrives every 25 s. At most 5 streams per user.',
    `Event types: ${Object.values(EVENT_TYPES).join(', ')}. Authors only receive message and status events for their own tickets.`,
    'Swagger UI cannot display a stream; open it with `curl -N` or the browser EventSource API.',
  ].join('\n\n'),
  responses: {
    200: { description: 'An open event stream', content: { 'text/event-stream': { schema: z.string() } } },
    ...errorResponses(401, 429),
  },
});
