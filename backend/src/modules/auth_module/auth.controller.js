import { ACCESS_COOKIE_OPTIONS, COOKIE_NAMES, REFRESH_COOKIE_OPTIONS } from './auth.constants.js';
import * as authService from './auth.service.js';

function clientDetails(req) {
  return { userAgent: req.get('user-agent'), ip: req.ip };
}

function setSessionCookies(res, { accessToken, refreshToken }) {
  res.cookie(COOKIE_NAMES.ACCESS, accessToken, ACCESS_COOKIE_OPTIONS);
  res.cookie(COOKIE_NAMES.REFRESH, refreshToken, REFRESH_COOKIE_OPTIONS);
}

function clearSessionCookies(res) {
  res.clearCookie(COOKIE_NAMES.ACCESS, ACCESS_COOKIE_OPTIONS);
  res.clearCookie(COOKIE_NAMES.REFRESH, REFRESH_COOKIE_OPTIONS);
}

export async function login(req, res) {
  const session = await authService.login({ ...req.validated.body, ...clientDetails(req) });
  setSessionCookies(res, session);
  res.json({ data: { user: session.user } });
}

export async function refresh(req, res) {
  try {
    const session = await authService.refreshSession({
      refreshToken: req.cookies?.[COOKIE_NAMES.REFRESH],
      ...clientDetails(req),
    });
    setSessionCookies(res, session);
    res.json({ data: { user: session.user } });
  } catch (error) {
    clearSessionCookies(res);
    throw error;
  }
}

export async function logout(req, res) {
  await authService.logout(req.cookies?.[COOKIE_NAMES.REFRESH]);
  clearSessionCookies(res);
  res.status(204).end();
}

export async function me(req, res) {
  const user = await authService.getCurrentUser(req.user.userId);
  res.json({ data: { user } });
}
