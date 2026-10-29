import { z } from 'zod';
import { dataOf, errorResponses, jsonResponse, registerEndpoint } from '../../core/openapi/registry.js';
import { statsQuerySchema } from './admin.schema.js';

const TAG = 'Admin';
const count = () => z.number().int();
const rate = () => z.number().min(0).max(1).nullable();
const counts = () => z.record(z.string(), count());

const AdminSchema = z.object({ id: z.uuid(), name: z.string(), email: z.email() }).strict().meta({ id: 'Admin' });

const OverviewSchema = z
  .object({
    window: z.object({ days: count(), since: z.iso.datetime(), until: z.iso.datetime() }).strict(),
    tickets: z
      .object({
        byStatus: counts(),
        unresolved: count(),
        unassigned: count(),
        overdue: count(),
        needsReview: count(),
        unresolvedByPriority: counts(),
        unresolvedByCategory: counts(),
        createdInWindow: count(),
        firstResponse: z.object({ answered: count(), medianMinutes: z.number().nullable(), slaMetRate: rate() }).strict(),
        aiClassification: z
          .object({
            triaged: count(),
            failed: count(),
            categoryOverrideRate: rate().meta({ description: 'Share of AI-triaged tickets whose category an admin changed' }),
            priorityOverrideRate: rate(),
          })
          .strict(),
      })
      .strict(),
    ai: z
      .object({
        calls: z.object({ total: count(), byTask: counts(), byOutcome: counts() }).strict(),
        failureRate: rate(),
        tokens: z.object({ input: count(), cachedInput: count(), output: count(), cacheHitRate: rate() }).strict(),
        estimatedCostUsd: z.object({ total: z.number().nullable(), perTicket: z.number().nullable() }).strict(),
        averageLatencyMs: z.record(z.string(), z.number().int().nullable()),
        drafts: z
          .object({ ready: count(), failed: count(), sent: z.object({ unchanged: count(), edited: count() }).strict() })
          .strict(),
      })
      .strict(),
  })
  .strict()
  .meta({ id: 'StatsOverview' });

registerEndpoint({
  method: 'get',
  path: '/admins',
  tag: TAG,
  summary: 'Active admins (for the assign dropdown)',
  access: 'admin',
  responses: { 200: jsonResponse('Admins', dataOf(z.array(AdminSchema))), ...errorResponses(401, 403) },
});

registerEndpoint({
  method: 'get',
  path: '/stats/overview',
  tag: TAG,
  summary: 'Support desk and AI dashboard',
  access: 'admin',
  description: 'Queue numbers are live; response time and AI numbers cover the last `days` days (default 7).',
  request: { query: statsQuerySchema },
  responses: { 200: jsonResponse('Overview', dataOf(OverviewSchema)), ...errorResponses(400, 401, 403) },
});
