const ONE_MINUTE_MS = 60 * 1000;
const ONE_DAY_MS = 24 * 60 * ONE_MINUTE_MS;

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 7;

export const COOKIE_NAMES = Object.freeze({
  ACCESS: 'bl_at',
  REFRESH: 'bl_rt',
});

const BASE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  // Secure cookies need HTTPS; local development runs on plain http://localhost.
  secure: process.env.NODE_ENV !== 'development',
};

export const ACCESS_COOKIE_OPTIONS = Object.freeze({
  ...BASE_COOKIE_OPTIONS,
  path: '/api',
  maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
});

export const REFRESH_COOKIE_OPTIONS = Object.freeze({
  ...BASE_COOKIE_OPTIONS,
  // The refresh token is sent only to auth endpoints, never with ordinary API calls.
  path: '/api/v1/auth',
  maxAge: REFRESH_TOKEN_TTL_DAYS * ONE_DAY_MS,
});

export const LOGIN_RATE_LIMIT = Object.freeze({
  windowMs: ONE_MINUTE_MS,
  limit: 5,
});
