import { AppError, ERROR_CODES, ForbiddenError } from '../errors/app_error.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function parseOriginList(value = '') {
  return value
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

export function rejectForeignOrigins(allowedOrigins = parseOriginList(process.env.ALLOWED_ORIGINS)) {
  const allowed = new Set(allowedOrigins);

  return (req, _res, next) => {
    const origin = req.headers.origin;

    if (WRITE_METHODS.has(req.method) && origin !== undefined && !allowed.has(origin)) {
      throw new ForbiddenError({
        code: ERROR_CODES.CSRF_ORIGIN_MISMATCH,
        message: 'Requests from this origin are not allowed.',
      });
    }

    next();
  };
}

function hasBody(req) {
  return req.headers['transfer-encoding'] !== undefined || Number(req.headers['content-length']) > 0;
}

export function requireJsonBody(req, _res, next) {
  if (WRITE_METHODS.has(req.method) && hasBody(req) && !req.is('application/json')) {
    throw new AppError({
      code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
      httpStatus: 415,
      message: 'Request body must be JSON (Content-Type: application/json).',
    });
  }

  next();
}
