export const ERROR_CODES = Object.freeze({
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  MALFORMED_JSON: 'MALFORMED_JSON',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  CSRF_ORIGIN_MISMATCH: 'CSRF_ORIGIN_MISMATCH',
  NOT_FOUND: 'NOT_FOUND',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  UNPROCESSABLE: 'UNPROCESSABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

export class AppError extends Error {
  constructor({ code, httpStatus, message, details }) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor({ code = ERROR_CODES.VALIDATION_ERROR, message = 'The request is invalid.', details } = {}) {
    super({ code, httpStatus: 400, message, details });
  }
}

export class UnauthenticatedError extends AppError {
  constructor({ code = ERROR_CODES.UNAUTHENTICATED, message = 'Authentication is required.', details } = {}) {
    super({ code, httpStatus: 401, message, details });
  }
}

export class ForbiddenError extends AppError {
  constructor({ code = ERROR_CODES.FORBIDDEN, message = 'You are not allowed to do this.', details } = {}) {
    super({ code, httpStatus: 403, message, details });
  }
}

export class NotFoundError extends AppError {
  constructor({ code = ERROR_CODES.NOT_FOUND, message = 'The resource was not found.', details } = {}) {
    super({ code, httpStatus: 404, message, details });
  }
}

export class ConflictError extends AppError {
  constructor({ code = ERROR_CODES.CONFLICT, message = 'The request conflicts with the current state.', details } = {}) {
    super({ code, httpStatus: 409, message, details });
  }
}

export class UnprocessableError extends AppError {
  constructor({ code = ERROR_CODES.UNPROCESSABLE, message = 'The request cannot be processed.', details } = {}) {
    super({ code, httpStatus: 422, message, details });
  }
}
