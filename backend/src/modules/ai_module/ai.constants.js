export const MODELS = Object.freeze({
  TRIAGE: process.env.AI_TRIAGE_MODEL ?? 'openai/gpt-oss-20b',
  DRAFT: process.env.AI_DRAFT_MODEL ?? 'openai/gpt-oss-120b',
  FALLBACK: process.env.AI_FALLBACK_MODEL ?? 'openai/gpt-oss-20b',
});

export const TIMEOUTS_MS = Object.freeze({
  TRIAGE: 15000,
  DRAFT: 45000,
});

export const MAX_OUTPUT_TOKENS = Object.freeze({
  TRIAGE: 600,
  DRAFT: 2500,
});

export const REASONING_EFFORT = Object.freeze({
  TRIAGE: 'low',
  DRAFT: 'medium',
});

export const TEMPERATURE = Object.freeze({
  TRIAGE: 0,
  DRAFT: 0.4,
});

export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || null;

export const LOW_CONFIDENCE = 0.6;

export const CONVERSATION_WINDOW = Object.freeze({
  MESSAGES: 4,
  MESSAGE_CHARS: 800,
  DESCRIPTION_CHARS: 2000,
});

export const CIRCUIT_BREAKER = Object.freeze({
  FAILURE_THRESHOLD: 5,
  OPEN_MS: 60000,
});

export const REGENERATE_LIMIT = Object.freeze({
  MAX: 5,
  WINDOW_MS: 10 * 60 * 1000,
});

export const INSTRUCTIONS_MAX_LENGTH = 300;

export const ERROR_MESSAGE_MAX_LENGTH = 300;

export const PRICE_PER_MILLION_TOKENS_USD = Object.freeze({
  'openai/gpt-oss-20b': { input: 0.075, cachedInput: 0.037, output: 0.3 },
  'openai/gpt-oss-120b': { input: 0.15, cachedInput: 0.075, output: 0.6 },
});
