import { UnauthenticatedError } from '../../core/errors/app_error.js';

export const AUTH_ERROR_CODES = Object.freeze({
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  REFRESH_TOKEN_REUSED: 'REFRESH_TOKEN_REUSED',
});

export class InvalidCredentialsError extends UnauthenticatedError {
  constructor() {
    super({ code: AUTH_ERROR_CODES.INVALID_CREDENTIALS, message: 'Invalid email or password.' });
  }
}

export class SessionExpiredError extends UnauthenticatedError {
  constructor() {
    super({ code: AUTH_ERROR_CODES.SESSION_EXPIRED, message: 'Your session has expired. Please log in again.' });
  }
}

export class RefreshTokenReuseError extends UnauthenticatedError {
  constructor() {
    super({
      code: AUTH_ERROR_CODES.REFRESH_TOKEN_REUSED,
      message: 'This session is no longer valid. Please log in again.',
    });
  }
}
