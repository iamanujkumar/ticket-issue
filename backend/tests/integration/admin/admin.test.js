import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.js';
import { disconnectDatabase, prisma } from '../../../src/core/database/prisma.js';
import { startJobQueue, stopJobQueue } from '../../../src/core/queue/job_queue.js';
import { getAiStats } from '../../../src/modules/ai_module/ai.stats.js';
import { getTicketStats } from '../../../src/modules/ticket_module/ticket.service.js';
import { createTestUser, deleteTestUsers, loginAs } from '../../helpers/test_users.js';

const app = createApp();
const API = '/api/v1';

let author;
let admin;
let inactiveAdmin;
let authorCookies;
let adminCookies;

const overview = async () => (await request(app).get(`${API}/stats/overview`).set('Cookie', adminCookies)).body.data;

async function createTicket(description = 'Can I update my author bio on the BookLeaf store?') {
  const response = await request(app).post(`${API}/tickets`).set('Cookie', authorCookies).send({
    bookId: null,
    subject: 'Stats test ticket',
    description,
  });
  return response.body.data.id;
}

async function patchAsAdmin(ticketId, changes) {
  const { version } = await prisma.ticket.findUnique({ where: { id: ticketId } });
  return request(app).patch(`${API}/tickets/${ticketId}`).set('Cookie', adminCookies).send({ ...changes, version });
}

async function markAiTriaged(ticketId) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      triageStatus: 'COMPLETED',
      aiCategory: ticket.category,
      aiPriority: ticket.priority,
      categorySource: 'AI',
      prioritySource: 'AI',
    },
  });
}

beforeAll(async () => {
  await startJobQueue({ role: 'producer' });
  await deleteTestUsers();

  author = await createTestUser();
  admin = await createTestUser({ role: 'ADMIN' });
  inactiveAdmin = await createTestUser({ role: 'ADMIN', isActive: false });
  authorCookies = (await loginAs(app, author)).cookies;
  adminCookies = (await loginAs(app, admin)).cookies;
});

afterAll(async () => {
  await deleteTestUsers();
  await stopJobQueue();
  await disconnectDatabase();
});

describe('GET /admins', () => {
  it('lists active admins only', async () => {
    const response = await request(app).get(`${API}/admins`).set('Cookie', adminCookies);
    const ids = response.body.data.map((person) => person.id);

    expect(response.status).toBe(200);
    expect(ids).toContain(admin.user.id);
    expect(ids).not.toContain(inactiveAdmin.user.id);
    expect(ids).not.toContain(author.user.id);
    expect(Object.keys(response.body.data[0]).sort()).toEqual(['email', 'id', 'name']);
  });

  it('is admin only', async () => {
    expect((await request(app).get(`${API}/admins`).set('Cookie', authorCookies)).status).toBe(403);
    expect((await request(app).get(`${API}/admins`)).status).toBe(401);
  });
});

describe('GET /stats/overview', () => {
  it('is admin only and validates the window', async () => {
    const asAuthor = await request(app).get(`${API}/stats/overview`).set('Cookie', authorCookies);
    const tooLong = await request(app).get(`${API}/stats/overview?days=91`).set('Cookie', adminCookies);
    const fine = await request(app).get(`${API}/stats/overview?days=30`).set('Cookie', adminCookies);

    expect(asAuthor.status).toBe(403);
    expect(tooLong.status).toBe(400);
    expect(fine.status).toBe(200);
    expect(fine.body.data.window.days).toBe(30);
    expect(Object.keys(fine.body.data)).toEqual(['window', 'tickets', 'ai']);
  });

  it('counts a new ticket as open, unassigned and created in the window', async () => {
    const before = (await overview()).tickets;

    await createTicket();
    const after = (await overview()).tickets;

    expect(after.byStatus.OPEN - before.byStatus.OPEN).toBe(1);
    expect(after.unresolved - before.unresolved).toBe(1);
    expect(after.unassigned - before.unassigned).toBe(1);
    expect(after.createdInWindow - before.createdInWindow).toBe(1);
    expect(after.unresolvedByPriority.LOW - before.unresolvedByPriority.LOW).toBe(1);
    expect(after.unresolvedByCategory.GENERAL_INQUIRY - before.unresolvedByCategory.GENERAL_INQUIRY).toBe(1);
  });

  it('moves a ticket to in progress and counts the first response when an admin replies', async () => {
    const ticketId = await createTicket();
    const before = (await overview()).tickets;

    await request(app).post(`${API}/tickets/${ticketId}/messages`).set('Cookie', adminCookies).send({ body: 'Hello, we are on it.' });
    const after = (await overview()).tickets;

    expect(after.byStatus.OPEN - before.byStatus.OPEN).toBe(-1);
    expect(after.byStatus.IN_PROGRESS - before.byStatus.IN_PROGRESS).toBe(1);
    expect(after.firstResponse.answered - before.firstResponse.answered).toBe(1);
  });

  it('counts an unanswered ticket past its SLA as overdue', async () => {
    const ticketId = await createTicket();
    const before = (await overview()).tickets;

    await prisma.ticket.update({ where: { id: ticketId }, data: { slaDueAt: new Date(Date.now() - 60 * 1000) } });
    const after = (await overview()).tickets;

    expect(after.overdue - before.overdue).toBe(1);
  });

  it('counts tickets flagged for review while they are unresolved', async () => {
    const ticketId = await createTicket();
    const before = (await overview()).tickets;

    await prisma.ticket.update({ where: { id: ticketId }, data: { needsReview: true } });
    const after = (await overview()).tickets;

    expect(after.needsReview - before.needsReview).toBe(1);
  });
});

describe('AI classification accuracy', () => {
  it('counts an admin correction as an override, but not an admin confirmation', async () => {
    const since = new Date();
    const corrected = await createTicket();
    const confirmed = await createTicket();
    await markAiTriaged(corrected);
    await markAiTriaged(confirmed);

    await patchAsAdmin(corrected, { category: 'ISBN_METADATA' });
    await patchAsAdmin(confirmed, { category: 'GENERAL_INQUIRY' });
    const stats = await getTicketStats({ since });

    expect(stats.aiClassification).toEqual({
      triaged: 2,
      failed: 0,
      categoryOverrideRate: 0.5,
      priorityOverrideRate: 0,
    });
  });

  it('reports AI triage failures', async () => {
    const since = new Date();
    const ticketId = await createTicket();
    await prisma.ticket.update({ where: { id: ticketId }, data: { triageStatus: 'FAILED' } });

    expect((await getTicketStats({ since })).aiClassification).toMatchObject({ triaged: 0, failed: 1, categoryOverrideRate: null });
  });
});

describe('AI usage and cost', () => {
  it('summarises calls, failures, tokens, cost and draft usage', async () => {
    const since = new Date();
    const ticketId = await createTicket();
    const call = { ticketId, provider: 'groq', promptVersion: 'test', latencyMs: 1000 };
    await prisma.aiInvocation.createMany({
      data: [
        { ...call, task: 'TRIAGE', model: 'openai/gpt-oss-20b', inputTokens: 800, cachedInputTokens: 200, outputTokens: 80, estimatedCostUsd: 0.0001, outcome: 'SUCCESS' },
        { ...call, task: 'DRAFT', model: 'openai/gpt-oss-120b', inputTokens: 1400, cachedInputTokens: 0, outputTokens: 500, estimatedCostUsd: 0.0005, outcome: 'SUCCESS', latencyMs: 3000 },
        { ...call, task: 'DRAFT', model: 'openai/gpt-oss-120b', outcome: 'RATE_LIMITED', latencyMs: 200 },
      ],
    });
    const message = await prisma.ticketMessage.create({
      data: { ticketId, senderId: admin.user.id, senderRole: 'ADMIN', body: 'Edited reply' },
    });
    const draft = { ticketId, categoryAtGeneration: 'GENERAL_INQUIRY', promptVersion: 'draft.v1' };
    await prisma.aiDraft.createMany({
      data: [
        { ...draft, status: 'READY', content: 'Ready draft', usage: 'EDITED', sentMessageId: message.id },
        { ...draft, status: 'FAILED', errorCode: 'RATE_LIMITED' },
      ],
    });

    const stats = await getAiStats({ since });

    expect(stats).toEqual({
      calls: {
        total: 3,
        byTask: { TRIAGE: 1, DRAFT: 2 },
        byOutcome: {
          SUCCESS: 2,
          INVALID_OUTPUT: 0,
          RATE_LIMITED: 1,
          TIMEOUT: 0,
          PROVIDER_ERROR: 0,
          CIRCUIT_OPEN: 0,
          DISABLED: 0,
        },
      },
      failureRate: 0.333,
      tokens: { input: 2200, cachedInput: 200, output: 580, cacheHitRate: 0.091 },
      estimatedCostUsd: { total: 0.0006, perTicket: 0.0006 },
      averageLatencyMs: { TRIAGE: 1000, DRAFT: 1600 },
      drafts: { ready: 1, failed: 1, sent: { unchanged: 0, edited: 1 } },
    });
  });
});
