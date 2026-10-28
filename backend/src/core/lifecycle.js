import { logger } from './logger.js';

const FORCE_EXIT_AFTER_MS = 25000;
const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'];

async function runShutdownTasks(tasks) {
  for (const { name, run } of tasks) {
    try {
      await run();
      logger.info({ task: name }, 'Shutdown step done');
    } catch (error) {
      logger.error({ err: error, task: name }, 'Shutdown step failed');
    }
  }
}

export function registerShutdown(tasks) {
  let isShuttingDown = false;

  async function shutdown(reason, exitCode) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({ reason }, 'Shutting down');

    setTimeout(() => {
      logger.fatal('Shutdown took too long, forcing exit');
      process.exit(1);
    }, FORCE_EXIT_AFTER_MS).unref();

    await runShutdownTasks(tasks);
    process.exit(exitCode);
  }

  for (const signal of SHUTDOWN_SIGNALS) {
    process.once(signal, () => shutdown(signal, 0));
  }

  process.on('unhandledRejection', (error) => {
    logger.fatal({ err: error }, 'Unhandled promise rejection');
    shutdown('unhandledRejection', 1);
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    shutdown('uncaughtException', 1);
  });
}
