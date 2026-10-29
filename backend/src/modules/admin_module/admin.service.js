import { getAiStats } from '../ai_module/ai.stats.js';
import { listActiveAdmins } from '../auth_module/auth.service.js';
import { getTicketStats } from '../ticket_module/ticket.service.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function listAdmins() {
  return listActiveAdmins();
}

export async function getOverview({ days }, now = new Date()) {
  const since = new Date(now.getTime() - days * ONE_DAY_MS);
  const [tickets, ai] = await Promise.all([getTicketStats({ since, now }), getAiStats({ since })]);

  return {
    window: { days, since: since.toISOString(), until: now.toISOString() },
    tickets,
    ai,
  };
}
