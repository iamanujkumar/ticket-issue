import { Router } from 'express';
import { UserRole } from '../auth_module/auth.enums.js';
import { requireAuth, requireRole } from '../auth_module/auth.middleware.js';
import { openStream } from './realtime.controller.js';

export const realtimeRouter = Router();

realtimeRouter.get('/stream', requireAuth, requireRole(UserRole.AUTHOR, UserRole.ADMIN), openStream);
