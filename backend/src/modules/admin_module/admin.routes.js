import { Router } from 'express';
import { validate } from '../../core/middlewares/validate.js';
import { UserRole } from '../auth_module/auth.enums.js';
import { requireAuth, requireRole } from '../auth_module/auth.middleware.js';
import * as adminController from './admin.controller.js';
import { statsQuerySchema } from './admin.schema.js';

const adminOnly = [requireAuth, requireRole(UserRole.ADMIN)];

export const adminsRouter = Router();
adminsRouter.get('/', ...adminOnly, adminController.listAdmins);

export const statsRouter = Router();
statsRouter.get('/overview', ...adminOnly, validate({ query: statsQuerySchema }), adminController.getOverview);
