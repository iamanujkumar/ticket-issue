import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.js';
import { disconnectDatabase, prisma } from '../../../src/core/database/prisma.js';
import { startJobQueue, stopJobQueue } from '../../../src/core/queue/job_queue.js';
import { createTestBook, createTestUser, deleteTestUsers, loginAs } from '../../helpers/test_users.js';

const app = createApp();
const TICKETS = '/api/v1/tickets';
const TAG = randomUUID().slice(0, 8);

let author;
let otherAuthor;
let admin;
let otherAdmin;
let authorBook;
let otherAuthorBook;
let authorCookies;
let otherAuthorCookies;
let adminCookies;
let otherAdminCookies;

const call = (method, path, cookies) => request(app)[method](`${TICKETS}${path}`).set('Cookie', cookies);

function createTicket(cookies, { bookId = null, subject, description }) {
  return call('post', '', cookies).send({ bookId, subject: `${subject} ${TAG}`, description });
}

async function freshVersion(ticketId) {
  return (await prisma.ticket.findUnique({ where: { id: ticketId } })).version;
}

beforeAll(async () => {
  await startJobQueue({ role: 'producer' });
  await deleteTestUsers();

  author = await createTestUser();
  otherAuthor = await createTestUser();
  admin = await createTestUser({ role: 'ADMIN' });
  otherAdmin = await createTestUser({ role: 'ADMIN' });

  authorBook = await createTestBook(author.user.author.id);
  otherAuthorBook = await createTestBook(otherAuthor.user.author.id);

  authorCookies = (await loginAs(app, author)).cookies;
  otherAuthorCookies = (await loginAs(app, otherAuthor)).cookies;
  adminCookies = (await loginAs(app, admin)).cookies;
  otherAdminCookies = (await loginAs(app, otherAdmin)).cookies;
});

afterAll(async () => {
  await deleteTestUsers();
  await stopJobQueue();
  await disconnectDatabase();
});

describe('POST /tickets', () => {
  it('creates a ticket classified by rules and queues an AI triage job in the same transaction', async () => {
    const response = await createTicket(authorCookies, {
      bookId: authorBook.id,
      subject: 'Royalty not received',
      description: "I published my book 4 months ago and still haven't received any royalty.",
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      ticketNumber: expect.stringMatching(/^BL-\d{6,}$/),
      status: 'OPEN',
      category: 'ROYALTY_PAYMENTS',
      book: { id: authorBook.id },
    });
    expect(response.body.data).not.toHaveProperty('priority');

    const ticketId = response.body.data.id;
    const stored = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { events: true } });
    expect(stored).toMatchObject({ priority: 'HIGH', prioritySource: 'RULES', triageStatus: 'PENDING' });
    expect(stored.events.map((event) => event.type)).toEqual(['CREATED']);

    const jobs = await prisma.$queryRaw`SELECT name FROM pgboss.job WHERE singleton_key = ${ticketId}`;
    expect(jobs).toEqual([{ name: 'ai.triage' }]);
  });

  it('accepts a general ticket without a book', async () => {
    const response = await createTicket(authorCookies, {
      subject: 'Author bio',
      description: 'Can I update my author bio on the BookLeaf store?',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.book).toBeNull();
    expect(response.body.data.category).toBe('GENERAL_INQUIRY');
  });

  it("rejects another author's book without revealing that it exists", async () => {
    const response = await createTicket(authorCookies, {
      bookId: otherAuthorBook.id,
      subject: 'Not my book',
      description: 'This book belongs to someone else.',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([{ path: 'body.bookId', message: 'Choose one of your own books' }]);
  });

  it('is for authors only', async () => {
    const response = await createTicket(adminCookies, { subject: 'Admin ticket', description: 'Admins do not raise tickets.' });

    expect(response.status).toBe(403);
  });
});

describe('author access', () => {
  let ticketId;

  beforeAll(async () => {
    const response = await createTicket(authorCookies, {
      subject: 'Typesetting delay',
      description: "It's been 3 weeks and my book is still in typesetting.",
    });
    ticketId = response.body.data.id;
  });

  it('lists only the author’s own tickets', async () => {
    await createTicket(otherAuthorCookies, { subject: 'Other author', description: 'A ticket from a different author.' });

    const response = await call('get', '', authorCookies);

    expect(response.status).toBe(200);
    expect(response.body.meta).toMatchObject({ page: 1, pageSize: 20 });
    const stored = await prisma.ticket.findMany({ where: { id: { in: response.body.data.map((ticket) => ticket.id) } } });
    expect(stored.every((ticket) => ticket.authorId === author.user.author.id)).toBe(true);
  });

  it("answers another author's ticket with 404", async () => {
    const response = await call('get', `/${ticketId}`, otherAuthorCookies);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('TICKET_NOT_FOUND');
  });

  it('can close the ticket but not change anything else', async () => {
    const changePriority = await call('patch', `/${ticketId}`, authorCookies).send({ status: 'CLOSED', priority: 'LOW' });
    const close = await call('patch', `/${ticketId}`, authorCookies).send({ status: 'CLOSED' });

    expect(changePriority.status).toBe(403);
    expect(close.status).toBe(200);
    expect(close.body.data.status).toBe('CLOSED');
  });

  it('cannot reply to a closed ticket', async () => {
    const response = await call('post', `/${ticketId}/messages`, authorCookies).send({ body: 'One more question' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('TICKET_CLOSED');
  });
});

describe('admin queue', () => {
  let overdueMedium;
  let freshHigh;
  let freshLow;

  beforeAll(async () => {
    const make = async (subject, description) =>
      (await createTicket(otherAuthorCookies, { subject: `queue ${subject}`, description })).body.data.id;

    freshLow = await make('low', 'Can I update my author bio on the store?');
    freshHigh = await make('high', "I haven't received any royalty payment for my book.");
    overdueMedium = await make('medium', 'My book is still in typesetting, when will it be done?');

    const longAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);
    await prisma.ticket.update({
      where: { id: overdueMedium },
      data: { createdAt: longAgo, slaDueAt: new Date(longAgo.getTime() + 48 * 60 * 60 * 1000) },
    });
  });

  const queueIds = async (query) => {
    const response = await call('get', `?q=${encodeURIComponent(`queue`)}&${query}`, adminCookies);
    return response.body.data.filter((ticket) => ticket.subject.endsWith(TAG)).map((ticket) => ticket.id);
  };

  it('puts overdue tickets first, then higher priority, then older', async () => {
    const ids = await queueIds('sort=queue');

    expect(ids).toEqual([overdueMedium, freshHigh, freshLow]);
  });

  it('marks the overdue ticket for admins', async () => {
    const response = await call('get', `/${overdueMedium}`, adminCookies);

    expect(response.body.data).toMatchObject({ isOverdue: true, priority: 'MEDIUM' });
  });

  it('filters by priority, overdue and assignee', async () => {
    expect(await queueIds('priority=HIGH,LOW')).toEqual([freshHigh, freshLow]);
    expect(await queueIds('overdue=true')).toEqual([overdueMedium]);
    expect(await queueIds('assignee=me')).toEqual([]);
  });

  it('finds a ticket by its number', async () => {
    const { ticketNumber } = (await call('get', `/${freshHigh}`, adminCookies)).body.data;

    const response = await call('get', `?q=${ticketNumber}`, adminCookies);

    expect(response.body.data.map((ticket) => ticket.id)).toEqual([freshHigh]);
  });

  it('rejects invalid filters', async () => {
    const response = await call('get', '?status=DONE&pageSize=500', adminCookies);

    expect(response.status).toBe(400);
  });
});

describe('admin ticket management', () => {
  let ticketId;

  beforeAll(async () => {
    const response = await createTicket(authorCookies, {
      bookId: authorBook.id,
      subject: 'Wrong ISBN',
      description: 'My book is showing a different ISBN on Amazon than the physical copy.',
    });
    ticketId = response.body.data.id;
  });

  it('overrides category and priority, recording the admin as source', async () => {
    const response = await call('patch', `/${ticketId}`, adminCookies).send({
      category: 'DISTRIBUTION_AVAILABILITY',
      priority: 'CRITICAL',
      version: await freshVersion(ticketId),
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      category: 'DISTRIBUTION_AVAILABILITY',
      categorySource: 'ADMIN',
      priority: 'CRITICAL',
      prioritySource: 'ADMIN',
    });
    const hours = (new Date(response.body.data.slaDueAt) - new Date(response.body.data.createdAt)) / 3600000;
    expect(hours).toBe(4);
  });

  it('rejects a stale version with 409', async () => {
    const version = await freshVersion(ticketId);
    await call('patch', `/${ticketId}`, adminCookies).send({ priority: 'HIGH', version });

    const stale = await call('patch', `/${ticketId}`, otherAdminCookies).send({ priority: 'LOW', version });

    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
  });

  it('requires a version from admins', async () => {
    const response = await call('patch', `/${ticketId}`, adminCookies).send({ priority: 'LOW' });

    expect(response.status).toBe(400);
  });

  it('refuses to assign the ticket to someone who is not an admin', async () => {
    const response = await call('patch', `/${ticketId}`, adminCookies).send({
      assigneeId: author.user.id,
      version: await freshVersion(ticketId),
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('INVALID_ASSIGNEE');
  });

  it('assigns the ticket to the admin and starts work on it', async () => {
    const response = await call('patch', `/${ticketId}`, adminCookies).send({
      assigneeId: admin.user.id,
      version: await freshVersion(ticketId),
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'IN_PROGRESS', assignee: { id: admin.user.id } });
  });

  it('rejects a status change the state machine does not allow', async () => {
    await call('patch', `/${ticketId}`, adminCookies).send({ status: 'RESOLVED', version: await freshVersion(ticketId) });

    const response = await call('patch', `/${ticketId}`, adminCookies).send({
      status: 'IN_PROGRESS',
      version: await freshVersion(ticketId),
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('records every change in the activity log, in order', async () => {
    const response = await call('get', `/${ticketId}/events`, adminCookies);

    expect(response.body.data.map((event) => event.type)).toEqual([
      'CREATED',
      'CATEGORY_CHANGED',
      'PRIORITY_CHANGED',
      'PRIORITY_CHANGED',
      'ASSIGNED',
      'STATUS_CHANGED',
      'STATUS_CHANGED',
    ]);
  });
});

describe('replies', () => {
  let ticketId;

  beforeAll(async () => {
    const response = await createTicket(authorCookies, {
      subject: 'Print quality',
      description: 'The images in my author copies are blurry and pages are misaligned.',
    });
    ticketId = response.body.data.id;
  });

  it('refuses an admin reply that still contains placeholders', async () => {
    const response = await call('post', `/${ticketId}/messages`, adminCookies).send({
      body: 'Please send photos to [support email] and we will arrange a reprint.',
    });

    expect(response.status).toBe(422);
    expect(response.body.error.details).toEqual({ placeholders: ['[support email]'] });
  });

  it('records the first admin reply and moves the ticket to in progress', async () => {
    const response = await call('post', `/${ticketId}/messages`, adminCookies).send({
      body: 'We are sorry about this. Please reply with photos of the defective copies.',
    });

    expect(response.status).toBe(201);
    const stored = await prisma.ticket.findUnique({ where: { id: ticketId } });
    expect(stored.firstResponseAt).toBeInstanceOf(Date);
    expect(stored.status).toBe('IN_PROGRESS');
  });

  it('shows admin replies to the author as BookLeaf Support', async () => {
    const response = await call('get', `/${ticketId}/messages`, authorCookies);

    expect(response.body.data.map((message) => message.senderName)).toEqual(['BookLeaf Support']);
  });

  it('reopens a resolved ticket when the author replies', async () => {
    await call('patch', `/${ticketId}`, adminCookies).send({ status: 'RESOLVED', version: await freshVersion(ticketId) });

    const reply = await call('post', `/${ticketId}/messages`, authorCookies).send({ body: 'The reprint also looks blurry.' });
    const ticket = await call('get', `/${ticketId}`, authorCookies);

    expect(reply.status).toBe(201);
    expect(ticket.body.data).toMatchObject({ status: 'OPEN', resolvedAt: null });
  });
});

describe('internal notes', () => {
  let ticketId;
  const secret = `Internal only ${TAG}`;

  beforeAll(async () => {
    const response = await createTicket(authorCookies, {
      subject: 'Listing',
      description: 'My book is showing as currently unavailable on Amazon.',
    });
    ticketId = response.body.data.id;
    await call('post', `/${ticketId}/notes`, adminCookies).send({ body: secret });
  });

  it('are visible to admins', async () => {
    const response = await call('get', `/${ticketId}/notes`, adminCookies);

    expect(response.status).toBe(200);
    expect(response.body.data.map((note) => note.body)).toEqual([secret]);
  });

  it('are forbidden to authors', async () => {
    const notes = await call('get', `/${ticketId}/notes`, authorCookies);
    const addNote = await call('post', `/${ticketId}/notes`, authorCookies).send({ body: 'Trying to add a note' });
    const events = await call('get', `/${ticketId}/events`, authorCookies);

    expect([notes.status, addNote.status, events.status]).toEqual([403, 403, 403]);
  });

  it('never appear anywhere in the author view', async () => {
    const responses = await Promise.all([
      call('get', `/${ticketId}`, authorCookies),
      call('get', `/${ticketId}/messages`, authorCookies),
      call('get', '', authorCookies),
    ]);

    for (const response of responses) {
      expect(JSON.stringify(response.body)).not.toContain(secret);
    }
  });
});
