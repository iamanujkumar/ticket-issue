import { createApp } from './app.js';
import { checkDatabase, disconnectDatabase } from './core/database/prisma.js';
import { registerShutdown } from './core/lifecycle.js';
import { logger } from './core/logger.js';
import { checkJobQueue, startJobQueue, stopJobQueue } from './core/queue/job_queue.js';
import { registerAiJobs } from './modules/ai_module/ai.jobs.js';
import { closeAllStreams } from './modules/realtime_module/realtime.hub.js';
import { startEventListener, stopEventListener } from './modules/realtime_module/realtime.listener.js';

const port = Number(process.env.PORT ?? 4000);
const runsWorkerInProcess = process.env.RUN_WORKER_IN_PROCESS === 'true';

function closeHttpServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function main() {
  await startJobQueue({ role: runsWorkerInProcess ? 'worker' : 'producer' });
  if (runsWorkerInProcess) {
    await registerAiJobs();
  }
  await startEventListener();

  const app = createApp({
    readinessChecks: [
      { name: 'database', check: checkDatabase },
      { name: 'queue', check: checkJobQueue },
    ],
  });

  const server = app.listen(port, (error) => {
    if (error) {
      logger.fatal({ err: error }, 'API failed to start');
      process.exit(1);
    }

    logger.info({ port }, 'API listening');
  });

  registerShutdown([
    { name: 'live update streams', run: closeAllStreams },
    { name: 'http server', run: () => closeHttpServer(server) },
    { name: 'realtime listener', run: stopEventListener },
    { name: 'job queue', run: stopJobQueue },
    { name: 'database', run: disconnectDatabase },
  ]);
}

main().catch((error) => {
  logger.fatal({ err: error }, 'API failed to start');
  process.exit(1);
});
