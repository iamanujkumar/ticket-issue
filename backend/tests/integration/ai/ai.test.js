import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.js';
import { disconnectDatabase, prisma } from '../../../src/core/database/prisma.js';
import { startJobQueue, stopJobQueue } from '../../../src/core/queue/job_queue.js';
import { MODELS } from '../../../src/modules/ai_module/ai.constants.js';
import { AiInvalidOutputError, AiProviderError } from '../../../src/modules/ai_module/ai.errors.js';
import { handleDraftJob, handleTriageJob } from '../../../src/modules/ai_module/ai.jobs.js';
import { setAiProviderForTests } from '../../../src/modules/ai_module/providers/index.js';
import { createTestBook, createTestUser, deleteTestUsers, loginAs } from '../../helpers/test_users.js';

const app = createApp();
const TICKETS = '/api/v1/tickets';
const VALID_REPLY =
  'Hi there,\n\nThank you for writing to us. Our team is checking this for you and will get back to you within 48 hours.\n\nWarm regards,\nBookLeaf Author Support';

let author;
let admin;
let authorCookies;
let adminCookies;
let authorBook;

function scriptedProvider({ triage, draft } = {}) {
  return {
    name: 'test',
    complete(callRequest) {
      const answer = callRequest.task === 'TRIAGE' ? triage : draft;
      const value = typeof answer === 'function' ? answer(callRequest) : answer;
      return value instanceof Error
        ? Promise.reject(value)
        : Promise.resolve({ json: value, model: callRequest.model, usage: { inputTokens: 100, outputTokens: 20 } });
    },
  };
}

const triageAnswer = (overrides = {}) => ({
  category: 'ISBN_METADATA',
  priority: 'CRITICAL',
  confidence: 0.95,
  rationale: 'Test rationale.',
  ...overrides,
});

const draftAnswer = (overrides = {}) => ({ reply: VALID_REPLY, internalHints: [], ...overrides });

function job(queue, data, { retryCount = 0, retryLimit = 3 } = {}) {
  return { id: `job-${Math.random()}`, name: queue, data, retryCount, retryLimit };
}

async function newTicket(description = "I haven't received my royalty payment for this book yet.") {
  const response = await request(app).post(TICKETS).set('Cookie', authorCookies).send({
    bookId: authorBook.id,
    subject: 'Help with my book',
    description,
  });
  return response.body.data.id;
}

const loadTicket = (ticketId) => prisma.ticket.findUnique({ where: { id: ticketId }, include: { events: { orderBy: { createdAt: 'asc' } } } });
const draftJobs = (ticketId) => prisma.$queryRaw`SELECT name FROM pgboss.job WHERE name = 'ai.draft' AND singleton_key = ${ticketId}`;
const latestDraft = (ticketId) => prisma.aiDraft.findFirst({ where: { ticketId }, orderBy: { createdAt: 'desc' } });

beforeAll(async () => {
  await startJobQueue({ role: 'producer' });
  await deleteTestUsers();
  author = await createTestUser();
  admin = await createTestUser({ role: 'ADMIN' });
  authorBook = await createTestBook(author.user.author.id, {
    royaltyEarnedMinor: 254600,
    royaltyPendingMinor: 254600,
    publicationDate: new Date('2024-07-05T00:00:00Z'),
  });
  authorCookies = (await loginAs(app, author)).cookies;
  adminCookies = (await loginAs(app, admin)).cookies;
});

afterEach(() => {
  setAiProviderForTests(null);
});

afterAll(async () => {
  await deleteTestUsers();
  await stopJobQueue();
  await disconnectDatabase();
});

describe('AI triage job', () => {
  it('applies the AI classification, records it and queues a draft', async () => {
    const ticketId = await newTicket();
    setAiProviderForTests(scriptedProvider({ triage: triageAnswer() }));

    await handleTriageJob(job('ai.triage', { ticketId }));

    const ticket = await loadTicket(ticketId);
    expect(ticket).toMatchObject({
      category: 'ISBN_METADATA',
      categorySource: 'AI',
      priority: 'CRITICAL',
      prioritySource: 'AI',
      aiCategory: 'ISBN_METADATA',
      aiPriority: 'CRITICAL',
      triageStatus: 'COMPLETED',
      needsReview: false,
    });
    expect(Number(ticket.aiConfidence)).toBe(0.95);
    expect((ticket.slaDueAt - ticket.createdAt) / 3600000).toBe(4);
    expect(ticket.events.map((event) => event.type)).toEqual(['CREATED', 'TRIAGED', 'CATEGORY_CHANGED', 'PRIORITY_CHANGED']);
    expect(await draftJobs(ticketId)).toHaveLength(1);

    const invocations = await prisma.aiInvocation.findMany({ where: { ticketId } });
    expect(invocations.map((row) => [row.task, row.outcome])).toEqual([['TRIAGE', 'SUCCESS']]);
  });

  it("never overwrites an admin's override", async () => {
    const ticketId = await newTicket();
    const { version } = await prisma.ticket.findUnique({ where: { id: ticketId } });
    await request(app).patch(`${TICKETS}/${ticketId}`).set('Cookie', adminCookies).send({ category: 'GENERAL_INQUIRY', version });
    setAiProviderForTests(scriptedProvider({ triage: triageAnswer() }));

    await handleTriageJob(job('ai.triage', { ticketId }));

    const ticket = await loadTicket(ticketId);
    expect(ticket).toMatchObject({ category: 'GENERAL_INQUIRY', categorySource: 'ADMIN', aiCategory: 'ISBN_METADATA', priority: 'CRITICAL' });
  });

  it('flags a low-confidence classification for review', async () => {
    const ticketId = await newTicket();
    setAiProviderForTests(scriptedProvider({ triage: triageAnswer({ confidence: 0.4 }) }));

    await handleTriageJob(job('ai.triage', { ticketId }));

    expect((await loadTicket(ticketId)).needsReview).toBe(true);
  });

  it('lets pg-boss retry while attempts remain when the provider is down', async () => {
    const ticketId = await newTicket();
    setAiProviderForTests(scriptedProvider({ triage: new AiProviderError('down') }));

    await expect(handleTriageJob(job('ai.triage', { ticketId }, { retryCount: 0 }))).rejects.toBeInstanceOf(AiProviderError);
    expect((await loadTicket(ticketId)).triageStatus).toBe('PENDING');
  });

  it('keeps the rules classification, flags the ticket and still drafts after the last attempt fails', async () => {
    const ticketId = await newTicket();
    setAiProviderForTests(scriptedProvider({ triage: new AiProviderError('down') }));

    await handleTriageJob(job('ai.triage', { ticketId }, { retryCount: 3 }));

    const ticket = await loadTicket(ticketId);
    expect(ticket).toMatchObject({ triageStatus: 'FAILED', needsReview: true, category: 'ROYALTY_PAYMENTS', categorySource: 'RULES' });
    expect(ticket.events.at(-1).type).toBe('TRIAGE_FAILED');
    expect(await draftJobs(ticketId)).toHaveLength(1);
  });

  it('gives up at once on output that stays invalid after the repair attempt', async () => {
    const ticketId = await newTicket();
    setAiProviderForTests(scriptedProvider({ triage: { category: 'NOT_A_CATEGORY' } }));

    await handleTriageJob(job('ai.triage', { ticketId }, { retryCount: 0 }));

    expect((await loadTicket(ticketId)).triageStatus).toBe('FAILED');
    const outcomes = (await prisma.aiInvocation.findMany({ where: { ticketId } })).map((row) => row.outcome);
    expect(outcomes).toEqual(['INVALID_OUTPUT', 'INVALID_OUTPUT']);
  });
});

describe('AI draft job', () => {
  it('stores a ready draft with model, fact and safety hints', async () => {
    const ticketId = await newTicket();
    const reply = `${VALID_REPLY}\n\nPlease email the photos to [support email]. Sorry it was delayed.`;
    setAiProviderForTests(scriptedProvider({ draft: draftAnswer({ reply, internalHints: ['Check the bank details.'] }) }));

    await handleDraftJob(job('ai.draft', { ticketId }));

    const draft = await latestDraft(ticketId);
    expect(draft).toMatchObject({ status: 'READY', content: reply, model: MODELS.DRAFT, categoryAtGeneration: 'ROYALTY_PAYMENTS' });
    expect(draft.internalHints).toEqual([
      'Check the bank details.',
      expect.stringContaining('payout records'),
      'Replace [support email] before sending.',
      'The reply uses the word "delayed". Check it is accurate before sending.',
    ]);
  });

  it('falls back to the second model when the main model fails', async () => {
    const ticketId = await newTicket();
    setAiProviderForTests(
      scriptedProvider({ draft: (callRequest) => (callRequest.model === MODELS.DRAFT && MODELS.DRAFT !== MODELS.FALLBACK ? new AiProviderError('down') : draftAnswer()) }),
    );

    await handleDraftJob(job('ai.draft', { ticketId }));

    expect(await latestDraft(ticketId)).toMatchObject({ status: 'READY', model: MODELS.FALLBACK });
  });

  it('marks the draft failed when every model fails, so the admin writes manually', async () => {
    const ticketId = await newTicket();
    setAiProviderForTests(scriptedProvider({ draft: new AiInvalidOutputError() }));

    await handleDraftJob(job('ai.draft', { ticketId }, { retryCount: 3 }));

    expect(await latestDraft(ticketId)).toMatchObject({ status: 'FAILED', errorCode: 'INVALID_OUTPUT', content: null });
    const response = await request(app).get(`${TICKETS}/${ticketId}/ai-draft`).set('Cookie', adminCookies);
    expect(response.body.data).toMatchObject({ status: 'FAILED', errorCode: 'INVALID_OUTPUT' });
  });

  it('marks a draft stale when the author replies after it was written', async () => {
    const ticketId = await newTicket();
    setAiProviderForTests(scriptedProvider({ draft: draftAnswer() }));
    await handleDraftJob(job('ai.draft', { ticketId }));

    await request(app).post(`${TICKETS}/${ticketId}/messages`).set('Cookie', authorCookies).send({ body: 'Any update?' });
    const response = await request(app).get(`${TICKETS}/${ticketId}/ai-draft`).set('Cookie', adminCookies);

    expect(response.body.data).toMatchObject({ status: 'READY', isStale: true });
    expect(await draftJobs(ticketId)).toHaveLength(1);
  });
});

describe('AI endpoints', () => {
  it('returns null before any draft exists and is admin only', async () => {
    const ticketId = await newTicket();

    const adminView = await request(app).get(`${TICKETS}/${ticketId}/ai-draft`).set('Cookie', adminCookies);
    const authorView = await request(app).get(`${TICKETS}/${ticketId}/ai-draft`).set('Cookie', authorCookies);

    expect(adminView.status).toBe(200);
    expect(adminView.body.data).toBeNull();
    expect(authorView.status).toBe(403);
  });

  it('records a draft sent unchanged and refuses to send it twice', async () => {
    const ticketId = await newTicket();
    setAiProviderForTests(scriptedProvider({ draft: draftAnswer() }));
    await handleDraftJob(job('ai.draft', { ticketId }));
    const draft = await latestDraft(ticketId);

    const sent = await request(app)
      .post(`${TICKETS}/${ticketId}/ai-draft/send`)
      .set('Cookie', adminCookies)
      .send({ draftId: draft.id, body: `  ${VALID_REPLY.replaceAll('\n\n', '\n')}  ` });
    const again = await request(app).post(`${TICKETS}/${ticketId}/ai-draft/send`).set('Cookie', adminCookies).send({ draftId: draft.id, body: VALID_REPLY });

    expect(sent.status).toBe(201);
    expect((await prisma.aiDraft.findUnique({ where: { id: draft.id } })).usage).toBe('UNCHANGED');
    expect(again.status).toBe(409);
  });

  it('limits regeneration to five per ten minutes for a ticket', async () => {
    const ticketId = await newTicket();
    await prisma.aiDraft.createMany({
      data: Array.from({ length: 5 }, () => ({
        ticketId,
        categoryAtGeneration: 'ROYALTY_PAYMENTS',
        promptVersion: 'draft.v1',
        requestedById: admin.user.id,
      })),
    });

    const response = await request(app).post(`${TICKETS}/${ticketId}/ai-draft/regenerate`).set('Cookie', adminCookies).send({});

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
  });

  it('requeues triage on retry', async () => {
    const ticketId = await newTicket();
    await prisma.ticket.update({ where: { id: ticketId }, data: { triageStatus: 'FAILED' } });

    const response = await request(app).post(`${TICKETS}/${ticketId}/triage/retry`).set('Cookie', adminCookies);

    expect(response.status).toBe(202);
    expect((await loadTicket(ticketId)).triageStatus).toBe('PENDING');
  });
});
