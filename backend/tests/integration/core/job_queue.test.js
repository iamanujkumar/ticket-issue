import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.js';
import { checkDatabase, disconnectDatabase, prisma } from '../../../src/core/database/prisma.js';
import { checkJobQueue, enqueue, startJobQueue, stopJobQueue } from '../../../src/core/queue/job_queue.js';
import { QUEUES } from '../../../src/core/queue/queues.js';

const TEST_KEY_PREFIX = 'core-test-';

function testKey() {
  return `${TEST_KEY_PREFIX}${randomUUID()}`;
}

async function countJobs(singletonKey) {
  const [row] = await prisma.$queryRaw`
    SELECT count(*)::int AS total FROM pgboss.job
    WHERE name = ${QUEUES.AI_TRIAGE} AND singleton_key = ${singletonKey}
  `;
  return row.total;
}

async function deleteTestJobs() {
  await prisma.$executeRaw`DELETE FROM pgboss.job WHERE singleton_key LIKE ${`${TEST_KEY_PREFIX}%`}`;
}

beforeAll(async () => {
  await startJobQueue({ role: 'producer' });
});

afterAll(async () => {
  await deleteTestJobs();
  await stopJobQueue();
  await disconnectDatabase();
});

describe('readiness with real dependencies', () => {
  it('reports database and queue as ok', async () => {
    const app = createApp({
      readinessChecks: [
        { name: 'database', check: checkDatabase },
        { name: 'queue', check: checkJobQueue },
      ],
    });

    const response = await request(app).get('/readyz');

    expect(response.status).toBe(200);
    expect(response.body.checks).toEqual([
      { name: 'database', status: 'ok' },
      { name: 'queue', status: 'ok' },
    ]);
  });
});

describe('transactional enqueue', () => {
  it('keeps the job when the transaction commits', async () => {
    const key = testKey();

    await prisma.$transaction(async (tx) => {
      await enqueue(QUEUES.AI_TRIAGE, { ticketId: key }, { tx, singletonKey: key });
    });

    expect(await countJobs(key)).toBe(1);
  });

  it('drops the job when the transaction rolls back', async () => {
    const key = testKey();

    const transaction = prisma.$transaction(async (tx) => {
      await enqueue(QUEUES.AI_TRIAGE, { ticketId: key }, { tx, singletonKey: key });
      throw new Error('ticket insert failed');
    });

    await expect(transaction).rejects.toThrow('ticket insert failed');
    expect(await countJobs(key)).toBe(0);
  });

  it('does not queue a second job for the same ticket', async () => {
    const key = testKey();

    const firstJobId = await enqueue(QUEUES.AI_TRIAGE, { ticketId: key }, { singletonKey: key });
    const secondJobId = await enqueue(QUEUES.AI_TRIAGE, { ticketId: key }, { singletonKey: key });

    expect(firstJobId).toEqual(expect.any(String));
    expect(secondJobId).toBeNull();
    expect(await countJobs(key)).toBe(1);
  });
});
