import { Router } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { AppError, ERROR_CODES } from '../../core/errors/app_error.js';
import { validate } from '../../core/middlewares/validate.js';
import { LOGIN_RATE_LIMIT } from './auth.constants.js';
import * as authController from './auth.controller.js';
import { requireAuth } from './auth.middleware.js';
import { loginBodySchema } from './auth.schema.js';

// IP + email: one office IP does not lock out colleagues, and one email cannot be locked out from everywhere.
function loginAttemptKey(req) {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  return `${ipKeyGenerator(req.ip)}:${email}`;
}

const loginRateLimiter = rateLimit({
  windowMs: LOGIN_RATE_LIMIT.windowMs,
  limit: LOGIN_RATE_LIMIT.limit,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: loginAttemptKey,
  handler: (_req, _res, next) => {
    next(
      new AppError({
        code: ERROR_CODES.RATE_LIMITED,
        httpStatus: 429,
        message: 'Too many login attempts. Please try again in a minute.',
      }),
    );
  },
});

export const authRouter = Router();

authRouter.post('/login', loginRateLimiter, validate({ body: loginBodySchema }), authController.login);
authRouter.post('/refresh', authController.refresh);
// No requireAuth: a user whose 15-minute access token expired must still be able to log out.
authRouter.post('/logout', authController.logout);
authRouter.get('/me', requireAuth, authController.me);
