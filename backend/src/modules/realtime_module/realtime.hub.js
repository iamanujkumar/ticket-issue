import { UserRole } from '../auth_module/auth.enums.js';
import { MAX_STREAMS_PER_USER } from './realtime.constants.js';

const streams = new Map();

function openStreamsOf(userId) {
  let count = 0;
  for (const user of streams.values()) {
    if (user.userId === userId) count += 1;
  }
  return count;
}

export function canReceive(user, event) {
  if (user.role === UserRole.ADMIN) return true;
  return event.visibleToAuthor === true && Boolean(user.authorId) && event.authorId === user.authorId;
}

export function formatEvent(event) {
  return `event: ${event.type}\ndata: ${JSON.stringify({ ticketId: event.ticketId })}\n\n`;
}

export function addStream(user, res) {
  if (openStreamsOf(user.userId) >= MAX_STREAMS_PER_USER) {
    return false;
  }
  streams.set(res, user);
  return true;
}

export function removeStream(res) {
  streams.delete(res);
}

export function dispatch(event) {
  const message = formatEvent(event);
  let delivered = 0;

  for (const [res, user] of streams) {
    if (!res.writableEnded && canReceive(user, event)) {
      res.write(message);
      delivered += 1;
    }
  }

  return delivered;
}

export function closeAllStreams() {
  for (const res of streams.keys()) {
    res.end();
  }
  streams.clear();
}

export function streamCount() {
  return streams.size;
}
