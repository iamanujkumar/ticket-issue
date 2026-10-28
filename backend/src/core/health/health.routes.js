import { Router } from 'express';

const CHECK_TIMEOUT_MS = 5000;

function failAfter(milliseconds) {
  return new Promise((_resolve, reject) => {
    setTimeout(() => reject(new Error(`timed out after ${milliseconds} ms`)), milliseconds).unref();
  });
}

async function runCheck({ name, check }, log) {
  try {
    await Promise.race([check(), failAfter(CHECK_TIMEOUT_MS)]);
    return { name, status: 'ok' };
  } catch (error) {
    log.warn({ err: error, check: name }, 'Readiness check failed');
    return { name, status: 'failed' };
  }
}

export function createHealthRouter(readinessChecks = []) {
  const router = Router();

  router.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.get('/readyz', async (req, res) => {
    const checks = await Promise.all(readinessChecks.map((readinessCheck) => runCheck(readinessCheck, req.log)));
    const isReady = checks.every((check) => check.status === 'ok');

    res.status(isReady ? 200 : 503).json({ status: isReady ? 'ok' : 'unavailable', checks });
  });

  return router;
}
