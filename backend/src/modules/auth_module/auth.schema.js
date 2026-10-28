import { z } from 'zod';

export const loginBodySchema = z
  .object({
    email: z
      .string({ error: 'Email is required' })
      .trim()
      .toLowerCase()
      .max(254, 'Email is too long')
      .pipe(z.email('Invalid email address')),
    password: z
      .string({ error: 'Password is required' })
      .min(1, 'Password is required')
      .max(128, 'Password is too long'),
  })
  .strict();
