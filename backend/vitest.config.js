import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const quietLogs = {
  LOG_LEVEL: 'silent',
  LOG_PRETTY: 'false',
  AI_PROVIDER: 'fake',
};

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.js'],
          env: {
            ...quietLogs,
            ALLOWED_ORIGINS: 'http://localhost:5173',
            JWT_ACCESS_SECRET: 'unit-test-secret-that-is-long-enough-123456',
          },
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.js'],
          env: quietLogs,
          testTimeout: 30000,
          hookTimeout: 60000,
          fileParallelism: false,
        },
      },
    ],
  },
});
