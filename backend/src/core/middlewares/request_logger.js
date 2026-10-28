import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { logger } from '../logger.js';

const REQUEST_ID_HEADER = 'x-request-id';
// A client-supplied id is echoed into logs and headers, so only plain short ids are trusted.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;
const UNLOGGED_PATHS = new Set(['/healthz', '/readyz']);

function pathOf(req) {
  return (req.originalUrl ?? req.url).split('?')[0];
}

function resolveRequestId(req, res) {
  const incomingId = req.headers[REQUEST_ID_HEADER];
  const requestId =
    typeof incomingId === 'string' && SAFE_REQUEST_ID.test(incomingId) ? incomingId : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, requestId);
  return requestId;
}

function chooseLogLevel(_req, res, error) {
  if (error || res.statusCode >= 500) return 'error';
  if (res.statusCode >= 400) return 'warn';
  return 'info';
}

function describeRequest(req, res) {
  return `${req.method} ${pathOf(req)} ${res.statusCode}`;
}

// pino-http invents an error for every 5xx; the real error is logged by the error handler.
function withoutStatusCodeError(_req, _res, _error, logObject) {
  const { err: _statusCodeError, ...rest } = logObject;
  return rest;
}

export const requestLogger = pinoHttp({
  logger,
  genReqId: resolveRequestId,
  quietReqLogger: true,
  autoLogging: { ignore: (req) => UNLOGGED_PATHS.has(pathOf(req)) },
  customLogLevel: chooseLogLevel,
  customSuccessMessage: describeRequest,
  customErrorMessage: describeRequest,
  customErrorObject: withoutStatusCodeError,
  serializers: {
    req: (req) => ({ method: req.method, path: pathOf(req) }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
