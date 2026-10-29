import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.js';
import { disconnectDatabase, prisma } from '../../../src/core/database/prisma.js';
import { EVENT_TYPES, publishEvent } from '../../../src/core/events/event_bus.js';
import { startJobQueue, stopJobQueue } from '../../../src/core/queue/job_queue.js';
import { closeAllStreams } from '../../../src/modules/realtime_module/realtime.hub.js';
import { startEventListener, stopEventListener } from '../../../src/modules/realtime_module/realtime.listener.js';
import { createTestUser, deleteTestUsers, loginAs } from '../../helpers/test_users.js';

const app = createApp();
const DELIVERY_WAIT_MS = 2500;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let server;
let baseUrl;
let author;
let otherAuthor;
let authorCookies;
let otherAuthorCookies;
let adminCookies;
const openStreams = [];

function openStream(cookies) {
  const stream = { status: null, headers: null, text: '', events: [] };
  const controller = new AbortController();
  stream.close = () => controller.abort();

  stream.ready = fetch(`${baseUrl}/api/v1/events/stream`, { headers: { cookie: cookies }, signal: controller.signal }).then(
    async (response) => {
      stream.status = response.status;
      stream.headers = response.headers;
      if (response.status !== 200) {
        stream.text = await response.text();
        return;
      }
      (async () => {
        const decoder = new TextDecoder();
        for await (const chunk of response.body) {
          stream.text += decoder.decode(chunk, { stream: true });
          stream.events = [...stream.text.matchAll(/^event: (.+)\ndata: (.+)$/gm)].map(([, type, data]) => ({
            type,
            ...JSON.parse(data),
          }));
        }
      })().catch(() => {});
    },
  );

  openStreams.push(stream);
  return stream;
}

async function openConnectedStream(cookies) {
  const stream = openStream(cookies);
  await stream.ready;
  await sleep(300);
  return stream;
}

const eventsFor = (stream, ticketId) => stream.events.filter((event) => event.ticketId === ticketId).map((event) => event.type);

async function createTicket(cookies) {
  const response = await request(app).post('/api/v1/tickets').set('Cookie', cookies).send({
    bookId: null,
    subject: 'Realtime test ticket',
    description: 'A ticket created by the realtime integration test.',
  });
  return response.body.data.id;
}

beforeAll(async () => {
  await startJobQueue({ role: 'producer' });
  await startEventListener();
  await deleteTestUsers();

  author = await createTestUser();
  otherAuthor = await createTestUser();
  const admin = await createTestUser({ role: 'ADMIN' });
  authorCookies = (await loginAs(app, author)).cookies;
  otherAuthorCookies = (await loginAs(app, otherAuthor)).cookies;
  adminCookies = (await loginAs(app, admin)).cookies;

  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://localhost:${server.address().port}`;
});

afterAll(async () => {
  openStreams.forEach((stream) => stream.close());
  closeAllStreams();
  await new Promise((resolve) => server.close(resolve));
  await stopEventListener();
  await deleteTestUsers();
  await stopJobQueue();
  await disconnectDatabase();
});

describe('GET /events/stream', () => {
  it('requires a session', async () => {
    const response = await request(app).get('/api/v1/events/stream');

    expect(response.status).toBe(401);
  });

  it('opens an event stream with the reconnect hint', async () => {
    const stream = await openConnectedStream(authorCookies);

    expect(stream.status).toBe(200);
    expect(stream.headers.get('content-type')).toMatch(/^text\/event-stream/);
    expect(stream.headers.get('cache-control')).toBe('no-cache, no-transform');
    expect(stream.text).toMatch(/^retry: 5000\n\n: connected\n\n/);
    stream.close();
  });

  it('refuses a sixth stream for the same user', async () => {
    const user = await createTestUser();
    const { cookies } = await loginAs(app, user);
    const streams = await Promise.all(Array.from({ length: 5 }, () => openConnectedStream(cookies)));

    const sixth = await openConnectedStream(cookies);

    expect(streams.map((stream) => stream.status)).toEqual([200, 200, 200, 200, 200]);
    expect(sixth.status).toBe(429);
    streams.forEach((stream) => stream.close());
  });
});

describe('event delivery', () => {
  let adminStream;
  let authorStream;
  let otherAuthorStream;
  let ticketId;
  const secretReply = `Secret reply text ${randomUUID()}`;

  beforeAll(async () => {
    [adminStream, authorStream, otherAuthorStream] = await Promise.all([
      openConnectedStream(adminCookies),
      openConnectedStream(authorCookies),
      openConnectedStream(otherAuthorCookies),
    ]);

    ticketId = await createTicket(authorCookies);
    await request(app).post(`/api/v1/tickets/${ticketId}/notes`).set('Cookie', adminCookies).send({ body: 'Internal note' });
    await request(app).post(`/api/v1/tickets/${ticketId}/messages`).set('Cookie', adminCookies).send({ body: secretReply });
    await sleep(DELIVERY_WAIT_MS);
  });

  it('tells admins about a new ticket, its note and the reply', () => {
    expect(eventsFor(adminStream, ticketId)).toEqual([
      EVENT_TYPES.TICKET_CREATED,
      EVENT_TYPES.TICKET_NOTE_CREATED,
      EVENT_TYPES.TICKET_MESSAGE_CREATED,
    ]);
  });

  it('tells the author only about the reply to their own ticket', () => {
    expect(eventsFor(authorStream, ticketId)).toEqual([EVENT_TYPES.TICKET_MESSAGE_CREATED]);
  });

  it("tells another author nothing about someone else's ticket", () => {
    expect(eventsFor(otherAuthorStream, ticketId)).toEqual([]);
  });

  it('sends only the ticket id, never the message text', () => {
    expect(authorStream.text).not.toContain(secretReply);
    expect(adminStream.text).not.toContain(secretReply);
    expect(authorStream.events.find((event) => event.ticketId === ticketId)).toEqual({
      type: EVENT_TYPES.TICKET_MESSAGE_CREATED,
      ticketId,
    });
  });

  it('never delivers an event from a rolled-back transaction', async () => {
    const rolledBackTicketId = randomUUID();

    await prisma
      .$transaction(async (tx) => {
        await publishEvent({ type: EVENT_TYPES.TICKET_CREATED, ticketId: rolledBackTicketId, authorId: null }, tx);
        throw new Error('roll back');
      })
      .catch(() => {});
    await sleep(DELIVERY_WAIT_MS);

    expect(eventsFor(adminStream, rolledBackTicketId)).toEqual([]);
  });
});
