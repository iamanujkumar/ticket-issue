import { readFileSync } from 'node:fs';
import { MAX_OUTPUT_TOKENS, MODELS, REASONING_EFFORT, TEMPERATURE, TIMEOUTS_MS } from '../src/modules/ai_module/ai.constants.js';
import { AiRateLimitedError } from '../src/modules/ai_module/ai.errors.js';
import {
  buildTriagePrompt,
  TRIAGE_JSON_SCHEMA,
  TRIAGE_PROMPT_VERSION,
  triageOutputSchema,
} from '../src/modules/ai_module/prompts/triage.prompt.v1.js';
import { createGroqProvider } from '../src/modules/ai_module/providers/groq.provider.js';
import { withResilience } from '../src/modules/ai_module/providers/resilient.provider.js';
import { classifyByRules } from '../src/modules/ticket_module/ticket.rules_triage.js';

const CASES_FILE = new URL('../tests/ai-eval/triage_cases.json', import.meta.url);
const PAUSE_BETWEEN_CALLS_MS = 2000;
const MAX_RATE_LIMIT_WAITS = 3;
const DEFAULT_RATE_LIMIT_WAIT_SECONDS = 20;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function percent(part, whole) {
  return `${Math.round((part / whole) * 100)}%`;
}

async function completeWithRateLimitWaits(provider, request) {
  for (let wait = 0; ; wait += 1) {
    try {
      return await provider.complete(request);
    } catch (error) {
      if (!(error instanceof AiRateLimitedError) || wait === MAX_RATE_LIMIT_WAITS) throw error;
      const seconds = error.retryAfterSeconds ?? DEFAULT_RATE_LIMIT_WAIT_SECONDS;
      console.log(`   rate limited, waiting ${seconds} s`);
      await sleep(seconds * 1000);
    }
  }
}

async function main() {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is required: this script calls the real model');
  }

  const invocations = [];
  const provider = withResilience(createGroqProvider({ apiKey: process.env.GROQ_API_KEY }), {
    logInvocation: (row) => invocations.push(row),
  });
  const cases = JSON.parse(readFileSync(CASES_FILE, 'utf8'));
  const score = { aiCategory: 0, aiPriority: 0, rulesCategory: 0, rulesPriority: 0 };

  for (const testCase of cases) {
    const ticket = { subject: testCase.subject, description: testCase.description, book: null };
    const rules = classifyByRules(ticket);
    await sleep(PAUSE_BETWEEN_CALLS_MS);
    const { data: ai } = await completeWithRateLimitWaits(provider, {
      task: 'TRIAGE',
      promptVersion: TRIAGE_PROMPT_VERSION,
      model: MODELS.TRIAGE,
      ...buildTriagePrompt(ticket),
      jsonSchema: TRIAGE_JSON_SCHEMA,
      schemaName: 'ticket_triage',
      outputSchema: triageOutputSchema,
      maxTokens: MAX_OUTPUT_TOKENS.TRIAGE,
      reasoningEffort: REASONING_EFFORT.TRIAGE,
      temperature: TEMPERATURE.TRIAGE,
      timeoutMs: TIMEOUTS_MS.TRIAGE,
    });

    const result = {
      aiCategory: ai.category === testCase.category,
      aiPriority: testCase.priorities.includes(ai.priority),
      rulesCategory: rules.category === testCase.category,
      rulesPriority: testCase.priorities.includes(rules.priority),
    };
    for (const key of Object.keys(score)) score[key] += result[key] ? 1 : 0;

    const mark = (ok) => (ok ? 'ok ' : 'XX ');
    console.log(
      `${mark(result.aiCategory && result.aiPriority)}${testCase.source.padEnd(32)} AI ${ai.category}/${ai.priority} (${ai.confidence}) | rules ${rules.category}/${rules.priority} | expected ${testCase.category}/${testCase.priorities.join('|')}`,
    );
  }

  const total = cases.length;
  const cost = invocations.reduce((sum, row) => sum + (row.estimatedCostUsd ?? 0), 0);
  console.log(`\n${TRIAGE_PROMPT_VERSION} on ${MODELS.TRIAGE}, ${total} cases`);
  console.log(`AI    category ${percent(score.aiCategory, total)}  priority ${percent(score.aiPriority, total)}`);
  console.log(`Rules category ${percent(score.rulesCategory, total)}  priority ${percent(score.rulesPriority, total)}`);
  console.log(`Model calls ${invocations.length}, estimated cost $${cost.toFixed(6)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
