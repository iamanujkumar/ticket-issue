import { z } from 'zod';
import { STATS_WINDOW_DAYS } from './admin.constants.js';

export const statsQuerySchema = z
  .object({
    days: z.coerce
      .number({ error: 'Days must be a number' })
      .int('Days must be a whole number')
      .min(STATS_WINDOW_DAYS.MIN, `Days must be at least ${STATS_WINDOW_DAYS.MIN}`)
      .max(STATS_WINDOW_DAYS.MAX, `Days must be at most ${STATS_WINDOW_DAYS.MAX}`)
      .default(STATS_WINDOW_DAYS.DEFAULT),
  })
  .strict();
