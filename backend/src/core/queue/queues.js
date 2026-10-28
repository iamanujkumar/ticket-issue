export const QUEUES = Object.freeze({
  AI_TRIAGE: 'ai.triage',
  AI_DRAFT: 'ai.draft',
});

const ONE_TICKET_ONE_JOB = 'stately';

const RETRY_WITH_BACKOFF = {
  retryLimit: 3,
  retryDelay: 10,
  retryBackoff: true,
  expireInSeconds: 300,
};

export const QUEUE_SETTINGS = Object.freeze({
  [QUEUES.AI_TRIAGE]: { policy: ONE_TICKET_ONE_JOB, notify: true, ...RETRY_WITH_BACKOFF },
  [QUEUES.AI_DRAFT]: { policy: ONE_TICKET_ONE_JOB, notify: true, ...RETRY_WITH_BACKOFF },
});
