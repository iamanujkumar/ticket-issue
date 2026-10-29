import { ratio, roundTo } from '../../core/utils/numbers.js';
import { AiOutcome, AiTask } from './ai.enums.js';
import * as aiQuery from './ai.query.js';

const COST_DECIMALS = 6;

function zeroCounts(values) {
  return Object.fromEntries(values.map((value) => [value, 0]));
}

function summariseCalls(rows) {
  const byTask = zeroCounts(Object.values(AiTask));
  const byOutcome = zeroCounts(Object.values(AiOutcome));
  const latencyByTask = zeroCounts(Object.values(AiTask));
  const totals = { calls: 0, input: 0, cachedInput: 0, output: 0, costUsd: 0 };

  for (const row of rows) {
    byTask[row.task] += row.calls;
    byOutcome[row.outcome] += row.calls;
    latencyByTask[row.task] += row.latency_ms;
    totals.calls += row.calls;
    totals.input += row.input_tokens;
    totals.cachedInput += row.cached_input_tokens;
    totals.output += row.output_tokens;
    totals.costUsd += row.cost_usd;
  }

  return { byTask, byOutcome, latencyByTask, totals };
}

export async function getAiStats({ since }) {
  const { calls, ticketCount, drafts } = await aiQuery.aiStats({ since });
  const { byTask, byOutcome, latencyByTask, totals } = summariseCalls(calls);

  return {
    calls: { total: totals.calls, byTask, byOutcome },
    failureRate: ratio(totals.calls - byOutcome[AiOutcome.SUCCESS], totals.calls),
    tokens: {
      input: totals.input,
      cachedInput: totals.cachedInput,
      output: totals.output,
      cacheHitRate: ratio(totals.cachedInput, totals.input),
    },
    estimatedCostUsd: {
      total: roundTo(totals.costUsd, COST_DECIMALS),
      perTicket: ticketCount ? roundTo(totals.costUsd / ticketCount, COST_DECIMALS) : null,
    },
    averageLatencyMs: Object.fromEntries(
      Object.entries(latencyByTask).map(([task, latency]) => [task, byTask[task] ? Math.round(latency / byTask[task]) : null]),
    ),
    drafts: {
      ready: drafts.ready,
      failed: drafts.failed,
      sent: { unchanged: drafts.sent_unchanged, edited: drafts.sent_edited },
    },
  };
}
