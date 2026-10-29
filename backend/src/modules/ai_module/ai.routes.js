import { Router } from 'express';
import { validate } from '../../core/middlewares/validate.js';
import { UserRole } from '../auth_module/auth.enums.js';
import { requireAuth, requireRole } from '../auth_module/auth.middleware.js';
import { ticketIdParamsSchema } from '../ticket_module/ticket.schema.js';
import * as aiController from './ai.controller.js';
import { regenerateBodySchema, sendDraftBodySchema } from './ai.schema.js';

const adminOnly = [requireAuth, requireRole(UserRole.ADMIN)];
const ticketParams = { params: ticketIdParamsSchema };

export const aiRouter = Router();

aiRouter.get('/:ticketId/ai-draft', ...adminOnly, validate(ticketParams), aiController.getDraft);

aiRouter.post(
  '/:ticketId/ai-draft/regenerate',
  ...adminOnly,
  validate({ ...ticketParams, body: regenerateBodySchema }),
  aiController.regenerateDraft,
);

aiRouter.post(
  '/:ticketId/ai-draft/send',
  ...adminOnly,
  validate({ ...ticketParams, body: sendDraftBodySchema }),
  aiController.sendDraft,
);

aiRouter.post('/:ticketId/triage/retry', ...adminOnly, validate(ticketParams), aiController.retryTriage);
