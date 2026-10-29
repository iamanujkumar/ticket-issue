import { z } from 'zod';
import { REPLY_LIMITS } from '../ticket_module/ticket.constants.js';
import { INSTRUCTIONS_MAX_LENGTH } from './ai.constants.js';

export const regenerateBodySchema = z
  .object({
    instructions: z
      .string()
      .trim()
      .min(1, 'Instructions cannot be empty')
      .max(INSTRUCTIONS_MAX_LENGTH, `Instructions must be at most ${INSTRUCTIONS_MAX_LENGTH} characters`)
      .optional(),
  })
  .strict();

export const sendDraftBodySchema = z
  .object({
    draftId: z.uuid('Draft id must be a valid id'),
    body: z
      .string({ error: 'Message is required' })
      .trim()
      .min(REPLY_LIMITS.MIN, 'Message is required')
      .max(REPLY_LIMITS.MAX, `Message must be at most ${REPLY_LIMITS.MAX} characters`),
  })
  .strict();
