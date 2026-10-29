import { AiInvalidOutputError, AiProviderError, AiRateLimitedError, AiTimeoutError } from '../ai.errors.js';
import { AiProviderName } from '../ai.enums.js';

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const PROVIDER_MESSAGE_MAX_LENGTH = 200;
const JSON_VALIDATE_FAILED = 'json_validate_failed';

function retryAfterSeconds(response) {
  const value = Number(response.headers.get('retry-after'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function errorOf(response) {
  try {
    const body = await response.json();
    return body?.error ?? {};
  } catch {
    return {};
  }
}

function redacted(message, apiKey) {
  return String(message ?? '').replaceAll(apiKey, '[redacted]').slice(0, PROVIDER_MESSAGE_MAX_LENGTH);
}

function invalidGeneration(failedGeneration) {
  if (!failedGeneration) {
    return new AiInvalidOutputError('The model used its whole token budget before writing an answer');
  }
  try {
    return new AiInvalidOutputError('The AI answer did not match the JSON schema', { json: JSON.parse(failedGeneration) });
  } catch {
    return new AiInvalidOutputError('The AI answer was not valid JSON');
  }
}

function requestBody({ model, system, messages, jsonSchema, schemaName, maxTokens, reasoningEffort, temperature }) {
  return {
    model,
    messages: [{ role: 'system', content: system }, ...messages],
    temperature,
    max_completion_tokens: maxTokens,
    reasoning_effort: reasoningEffort,
    response_format: {
      type: 'json_schema',
      json_schema: { name: schemaName, strict: true, schema: jsonSchema },
    },
  };
}

function toResult(body, requestedModel) {
  const content = body.choices?.[0]?.message?.content;
  let json;
  try {
    json = JSON.parse(content);
  } catch {
    throw new AiInvalidOutputError('The AI answer was not valid JSON');
  }

  return {
    json,
    model: body.model ?? requestedModel,
    usage: {
      inputTokens: body.usage?.prompt_tokens ?? null,
      cachedInputTokens: body.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      outputTokens: body.usage?.completion_tokens ?? null,
    },
  };
}

export function createGroqProvider({ apiKey, fetchImpl = fetch }) {
  async function send(request) {
    try {
      return await fetchImpl(GROQ_CHAT_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody(request)),
        signal: AbortSignal.timeout(request.timeoutMs),
      });
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new AiTimeoutError();
      }
      throw new AiProviderError('Could not reach the AI provider');
    }
  }

  return {
    name: AiProviderName.GROQ,

    async complete(request) {
      const response = await send(request);

      if (response.status === 429) {
        throw new AiRateLimitedError(retryAfterSeconds(response));
      }
      if (!response.ok) {
        const error = await errorOf(response);
        if (error.code === JSON_VALIDATE_FAILED) {
          throw invalidGeneration(error.failed_generation);
        }
        const message = redacted(error.message, apiKey);
        throw new AiProviderError(`AI provider returned ${response.status}${message ? `: ${message}` : ''}`, {
          retryable: response.status >= 500,
        });
      }

      return toResult(await response.json(), request.model);
    },
  };
}
