import { Router } from 'express';
import { validate } from '../../core/middlewares/validate.js';
import { UserRole } from '../auth_module/auth.enums.js';
import { requireAuth, requireRole } from '../auth_module/auth.middleware.js';
import * as ticketController from './ticket.controller.js';
import {
  createTicketBodySchema,
  listTicketsQuerySchema,
  messageBodySchema,
  noteBodySchema,
  ticketIdParamsSchema,
  updateTicketBodySchema,
} from './ticket.schema.js';

const authorOnly = requireRole(UserRole.AUTHOR);
const adminOnly = requireRole(UserRole.ADMIN);
const authorOrAdmin = requireRole(UserRole.AUTHOR, UserRole.ADMIN);
const ticketParams = { params: ticketIdParamsSchema };

export const ticketRouter = Router();

ticketRouter.use(requireAuth);

ticketRouter.post('/', authorOnly, validate({ body: createTicketBodySchema }), ticketController.createTicket);
ticketRouter.get('/', authorOrAdmin, validate({ query: listTicketsQuerySchema }), ticketController.listTickets);

ticketRouter.get('/:ticketId', authorOrAdmin, validate(ticketParams), ticketController.getTicket);
ticketRouter.patch(
  '/:ticketId',
  authorOrAdmin,
  validate({ ...ticketParams, body: updateTicketBodySchema }),
  ticketController.updateTicket,
);

ticketRouter.get('/:ticketId/messages', authorOrAdmin, validate(ticketParams), ticketController.listMessages);
ticketRouter.post(
  '/:ticketId/messages',
  authorOrAdmin,
  validate({ ...ticketParams, body: messageBodySchema }),
  ticketController.addMessage,
);

ticketRouter.get('/:ticketId/notes', adminOnly, validate(ticketParams), ticketController.listNotes);
ticketRouter.post(
  '/:ticketId/notes',
  adminOnly,
  validate({ ...ticketParams, body: noteBodySchema }),
  ticketController.addNote,
);

ticketRouter.get('/:ticketId/events', adminOnly, validate(ticketParams), ticketController.listEvents);
