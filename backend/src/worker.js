import { disconnectDatabase } from './core/database/prisma.js';
import { registerShutdown } from './core/lifecycle.js';
import { logger } from './core/logger.js';
import { startJobQueue, stopJobQueue } from './core/queue/job_queue.js';
import { registerAiJobs } from './modules/ai_module/ai.jobs.js';

async function main() {
  await startJobQueue({ role: 'worker' });
  await registerAiJobs();

  registerShutdown([
    { name: 'job queue', run: stopJobQueue },
    { name: 'database', run: disconnectDatabase },
  ]);

  logger.info('Worker ready');
}

main().catch((error) => {
  logger.fatal({ err: error }, 'Worker failed to start');
  process.exit(1);
});
