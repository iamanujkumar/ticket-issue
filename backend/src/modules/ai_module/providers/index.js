import { logger } from '../../../core/logger.js';
import { AiProviderName } from '../ai.enums.js';
import { AiDisabledError } from '../ai.errors.js';
import * as aiQuery from '../ai.query.js';
import { createFakeProvider } from './fake.provider.js';
import { createGroqProvider } from './groq.provider.js';
import { withResilience } from './resilient.provider.js';

let aiProvider = null;

const disabledProvider = {
  name: AiProviderName.DISABLED,
  complete: () => Promise.reject(new AiDisabledError()),
};

async function logInvocationSafely(row) {
  try {
    await aiQuery.logInvocation(row);
  } catch (error) {
    logger.warn({ err: error, task: row.task }, 'Could not record AI invocation');
  }
}

function selectProvider() {
  const choice = process.env.AI_PROVIDER ?? AiProviderName.GROQ;

  if (choice === AiProviderName.FAKE) return createFakeProvider();
  if (choice === AiProviderName.GROQ && process.env.GROQ_API_KEY) {
    return createGroqProvider({ apiKey: process.env.GROQ_API_KEY });
  }

  logger.warn({ provider: choice }, 'AI is disabled: no usable AI provider is configured');
  return disabledProvider;
}

export function getAiProvider() {
  aiProvider ??= withResilience(selectProvider(), { logInvocation: logInvocationSafely });
  return aiProvider;
}

export function setAiProviderForTests(provider) {
  aiProvider = provider ? withResilience(provider, { logInvocation: logInvocationSafely }) : null;
}
