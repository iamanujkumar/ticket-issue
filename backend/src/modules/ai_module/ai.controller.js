import { requestAiTriage } from '../ticket_module/ticket.service.js';
import { toDraft } from './ai.mapper.js';
import * as draftService from './drafts/draft.service.js';

export async function getDraft(req, res) {
  const current = await draftService.getCurrentDraft(req.validated.params.ticketId);
  res.json({ data: current ? toDraft(current) : null });
}

export async function regenerateDraft(req, res) {
  const result = await draftService.requestRegeneration(req.user, req.validated.params.ticketId, req.validated.body);
  res.status(202).json({ data: result });
}

export async function sendDraft(req, res) {
  const message = await draftService.sendDraft(req.user, req.validated.params.ticketId, req.validated.body);
  res.status(201).json({ data: message });
}

export async function retryTriage(req, res) {
  const result = await requestAiTriage(req.user, req.validated.params.ticketId);
  res.status(202).json({ data: result });
}
