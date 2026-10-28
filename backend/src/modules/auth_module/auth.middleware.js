import { ForbiddenError, UnauthenticatedError } from '../../core/errors/app_error.js';
import { COOKIE_NAMES } from './auth.constants.js';
import { verifyAccessToken } from './auth.tokens.js';

export function requireAuth(req, _res, next) {
  const accessToken = req.cookies?.[COOKIE_NAMES.ACCESS];
  if (!accessToken) {
    throw new UnauthenticatedError();
  }

  // No database lookup: the signed token already carries the role and author id.
  req.user = verifyAccessToken(accessToken);
  next();
}

export function requireRole(...allowedRoles) {
  const allowed = new Set(allowedRoles);

  return (req, _res, next) => {
    if (!req.user || !allowed.has(req.user.role)) {
      throw new ForbiddenError();
    }
    next();
  };
}
