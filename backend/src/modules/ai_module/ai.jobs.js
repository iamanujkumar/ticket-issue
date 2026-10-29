import { logger } from '../../core/logger.js';
import { registerWorker } from '../../core/queue/job_queue.js';
import { QUEUES } from '../../core/queue/queues.js';
import { generateDraft } from './drafts/draft.service.js';
import { failTriage, triageTicket } from './triage/triage.service.js';

const TRIAGE_CONCURRENCY = 4;
const DRAFT_CONCURRENCY = 2;

function canRetry(error, job) {
  return error.retryable !== false && job.retryCount < job.retryLimit;
}

export async function runJob(job, { work, giveUp }) {
  try {
    await work(job.data);
  } catch (error) {
    if (canRetry(error, job)) {
      throw error;
    }
    logger.warn({ err: error, jobId: job.id, queue: job.name, attempts: job.retryCount + 1 }, 'AI job gave up');
    await giveUp(job.data, error);
  }
}

export function handleTriageJob(job) {
  return runJob(job, {
    work: ({ ticketId }) => triageTicket(ticketId),
    giveUp: ({ ticketId }) => failTriage(ticketId),
  });
}

export function handleDraftJob(job) {
  return runJob(job, {
    work: ({ ticketId, requestedBy, instructions }) => generateDraft(ticketId, { requestedBy, instructions }),
    giveUp: async () => {},
  });
}

export async function registerAiJobs() {
  const options = { batchSize: 1, includeMetadata: true };
  await registerWorker(QUEUES.AI_TRIAGE, { ...options, localConcurrency: TRIAGE_CONCURRENCY }, ([job]) =>
    handleTriageJob(job),
  );
  await registerWorker(QUEUES.AI_DRAFT, { ...options, localConcurrency: DRAFT_CONCURRENCY }, ([job]) =>
    handleDraftJob(job),
  );
  logger.info('AI job handlers registered');
}
