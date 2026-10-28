import { fromPrisma, PgBoss } from 'pg-boss';
import { logger } from '../logger.js';
import { QUEUE_SETTINGS } from './queues.js';

const JOB_QUEUE_POOL_SIZE = 3;
const GRACEFUL_STOP_TIMEOUT_MS = 20000;

let boss = null;

function startedBoss() {
  if (!boss) {
    throw new Error('Job queue is not started');
  }
  return boss;
}

export async function startJobQueue({ role }) {
  const isWorker = role === 'worker';

  boss = new PgBoss({
    connectionString: process.env.DATABASE_URL,
    max: JOB_QUEUE_POOL_SIZE,
    // Only the worker runs maintenance and listens for new jobs; the API process only sends jobs.
    supervise: isWorker,
    schedule: isWorker,
    useListenNotify: isWorker,
  });

  boss.on('error', (error) => logger.error({ err: error }, 'Job queue error'));

  await boss.start();

  for (const [name, settings] of Object.entries(QUEUE_SETTINGS)) {
    await boss.createQueue(name, settings);
  }

  logger.info({ role }, 'Job queue started');
}

export function enqueue(name, payload, { tx, singletonKey, startAfter } = {}) {
  return startedBoss().send(name, payload, {
    singletonKey,
    startAfter,
    // Inside the caller's transaction, the job exists only if the ticket insert commits.
    ...(tx && { db: fromPrisma(tx) }),
  });
}

export function registerWorker(name, options, handler) {
  return startedBoss().work(name, options, handler);
}

export async function checkJobQueue() {
  const isInstalled = await startedBoss().isInstalled();
  if (!isInstalled) {
    throw new Error('Job queue schema is not installed');
  }
}

export async function stopJobQueue() {
  if (!boss) return;

  await boss.stop({ graceful: true, timeout: GRACEFUL_STOP_TIMEOUT_MS });
  boss = null;
}
