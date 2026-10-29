import { AppError, ERROR_CODES } from '../../core/errors/app_error.js';
import { COOKIE_NAMES } from '../auth_module/auth.constants.js';
import { verifyAccessToken } from '../auth_module/auth.tokens.js';
import { CLIENT_RETRY_MS, HEARTBEAT_MS } from './realtime.constants.js';
import { addStream, removeStream } from './realtime.hub.js';

const STREAM_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

function hasValidSession(req) {
  try {
    verifyAccessToken(req.cookies?.[COOKIE_NAMES.ACCESS]);
    return true;
  } catch {
    return false;
  }
}

export function openStream(req, res) {
  if (!addStream(req.user, res)) {
    throw new AppError({
      code: ERROR_CODES.RATE_LIMITED,
      httpStatus: 429,
      message: 'Too many live-update connections are open. Close another tab and try again.',
    });
  }

  res.status(200).set(STREAM_HEADERS);
  res.flushHeaders();
  res.write(`retry: ${CLIENT_RETRY_MS}\n\n: connected\n\n`);

  const heartbeat = setInterval(() => {
    if (hasValidSession(req)) {
      res.write(': ping\n\n');
    } else {
      res.end();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  res.on('close', () => {
    clearInterval(heartbeat);
    removeStream(res);
  });
}
