import { ZodError } from 'zod';
import { AppError, ERROR_CODES, NotFoundError, ValidationError } from '../errors/app_error.js';

const PRISMA_KNOWN_ERROR = 'PrismaClientKnownRequestError';

function fromZodError(error) {
  return new ValidationError({
    details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  });
}

function fromBodyParserError(error) {
  if (error.type === 'entity.parse.failed') {
    return new AppError({
      code: ERROR_CODES.MALFORMED_JSON,
      httpStatus: 400,
      message: 'The request body is not valid JSON.',
    });
  }

  if (error.type === 'entity.too.large') {
    return new AppError({
      code: ERROR_CODES.PAYLOAD_TOO_LARGE,
      httpStatus: 413,
      message: 'The request body is too large.',
    });
  }

  return null;
}

function fromPrismaError(error) {
  if (error.name !== PRISMA_KNOWN_ERROR) return null;

  if (error.code === 'P2002') {
    return new AppError({
      code: ERROR_CODES.CONFLICT,
      httpStatus: 409,
      message: 'A record with these values already exists.',
    });
  }

  if (error.code === 'P2025') {
    return new NotFoundError();
  }

  return null;
}

function toAppError(error) {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) return fromZodError(error);
  return fromBodyParserError(error) ?? fromPrismaError(error);
}

export function notFoundHandler(req) {
  throw new NotFoundError({
    code: ERROR_CODES.ROUTE_NOT_FOUND,
    message: `Route ${req.method} ${req.path} does not exist.`,
  });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const appError = toAppError(error);

  // Unknown errors may contain internals (SQL, paths, secrets): log them, show only a generic message.
  if (!appError) {
    req.log.error({ err: error }, 'Unhandled error');
    return res.status(500).json({
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Something went wrong. Please try again later.',
        requestId: req.id,
      },
    });
  }

  return res.status(appError.httpStatus).json({
    error: {
      code: appError.code,
      message: appError.message,
      details: appError.details,
      requestId: req.id,
    },
  });
}
