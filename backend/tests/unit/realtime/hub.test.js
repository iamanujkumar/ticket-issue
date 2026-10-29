import { afterEach, describe, expect, it, vi } from 'vitest';
import { EVENT_TYPES } from '../../../src/core/events/event_bus.js';
import {
  addStream,
  canReceive,
  closeAllStreams,
  dispatch,
  formatEvent,
  removeStream,
  streamCount,
} from '../../../src/modules/realtime_module/realtime.hub.js';

const admin = { userId: 'admin-1', role: 'ADMIN', authorId: null };
const priya = { userId: 'user-priya', role: 'AUTHOR', authorId: 'author-priya' };
const rohit = { userId: 'user-rohit', role: 'AUTHOR', authorId: 'author-rohit' };

function fakeResponse() {
  return { write: vi.fn(), end: vi.fn(), writableEnded: false };
}

const event = (type, overrides = {}) => ({
  type,
  ticketId: 'ticket-1',
  authorId: 'author-priya',
  visibleToAuthor: false,
  ...overrides,
});

afterEach(() => {
  closeAllStreams();
});

describe('canReceive', () => {
  it('lets admins receive every event', () => {
    for (const type of Object.values(EVENT_TYPES)) {
      expect(canReceive(admin, event(type))).toBe(true);
    }
  });

  it("lets an author receive visible events about their own tickets", () => {
    expect(canReceive(priya, event(EVENT_TYPES.TICKET_MESSAGE_CREATED, { visibleToAuthor: true }))).toBe(true);
    expect(canReceive(priya, event(EVENT_TYPES.TICKET_UPDATED, { visibleToAuthor: true }))).toBe(true);
  });

  it("never sends an author events about another author's tickets", () => {
    expect(canReceive(rohit, event(EVENT_TYPES.TICKET_MESSAGE_CREATED, { visibleToAuthor: true }))).toBe(false);
  });

  it('never sends an author internal events, even about their own tickets', () => {
    for (const type of [
      EVENT_TYPES.TICKET_NOTE_CREATED,
      EVENT_TYPES.TICKET_TRIAGED,
      EVENT_TYPES.TICKET_DRAFT_UPDATED,
      EVENT_TYPES.TICKET_CREATED,
    ]) {
      expect(canReceive(priya, event(type))).toBe(false);
    }
  });

  it('refuses an author without an author id', () => {
    const brokenAuthor = { userId: 'x', role: 'AUTHOR', authorId: null };

    expect(canReceive(brokenAuthor, event(EVENT_TYPES.TICKET_UPDATED, { authorId: null, visibleToAuthor: true }))).toBe(false);
  });
});

describe('formatEvent', () => {
  it('writes the SSE format with only the ticket id', () => {
    const message = formatEvent(event(EVENT_TYPES.TICKET_MESSAGE_CREATED, { visibleToAuthor: true }));

    expect(message).toBe('event: ticket.message.created\ndata: {"ticketId":"ticket-1"}\n\n');
    expect(message).not.toContain('author-priya');
  });
});

describe('streams', () => {
  it('refuses a sixth stream for the same user', () => {
    const results = Array.from({ length: 6 }, () => addStream(priya, fakeResponse()));

    expect(results).toEqual([true, true, true, true, true, false]);
    expect(addStream(rohit, fakeResponse())).toBe(true);
  });

  it('frees a slot when a stream is removed', () => {
    const responses = Array.from({ length: 5 }, () => fakeResponse());
    responses.forEach((res) => addStream(priya, res));

    removeStream(responses[0]);

    expect(addStream(priya, fakeResponse())).toBe(true);
  });

  it('delivers each event only to streams allowed to receive it', () => {
    const adminStream = fakeResponse();
    const priyaStream = fakeResponse();
    const rohitStream = fakeResponse();
    addStream(admin, adminStream);
    addStream(priya, priyaStream);
    addStream(rohit, rohitStream);

    const toEveryoneAllowed = dispatch(event(EVENT_TYPES.TICKET_MESSAGE_CREATED, { visibleToAuthor: true }));
    const internal = dispatch(event(EVENT_TYPES.TICKET_NOTE_CREATED));

    expect(toEveryoneAllowed).toBe(2);
    expect(internal).toBe(1);
    expect(adminStream.write).toHaveBeenCalledTimes(2);
    expect(priyaStream.write).toHaveBeenCalledTimes(1);
    expect(rohitStream.write).not.toHaveBeenCalled();
  });

  it('skips streams that have already ended', () => {
    const ended = { ...fakeResponse(), writableEnded: true };
    addStream(admin, ended);

    expect(dispatch(event(EVENT_TYPES.TICKET_CREATED))).toBe(0);
    expect(ended.write).not.toHaveBeenCalled();
  });

  it('closes every stream on shutdown', () => {
    const streams = [fakeResponse(), fakeResponse()];
    addStream(admin, streams[0]);
    addStream(priya, streams[1]);

    closeAllStreams();

    expect(streams.every((res) => res.end.mock.calls.length === 1)).toBe(true);
    expect(streamCount()).toBe(0);
  });
});
