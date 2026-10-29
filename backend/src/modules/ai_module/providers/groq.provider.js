import { AiInvalidOutputError, AiProviderError, AiRateLimitedError, AiTimeoutError } from '../ai.errors.js';
import { AiProviderName } from '../ai.enums.js';

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const PROVIDER_MESSAGE_MAX_LENGTH = 200;

function retryAfterSeconds(response) {
  const value = Number(response.headers.get('retry-after'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function providerMessage(response, apiKey) {
  try {
    const body = await response.json();
    return String(body?.error?.message ?? '').replaceAll(apiKey, '[redacted]').slice(0, PROVIDER_MESSAGE_MAX_LENGTH);
  } catch {
    return '';
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
        const message = await providerMessage(response, apiKey);
        throw new AiProviderError(`AI provider returned ${response.status}${message ? `: ${message}` : ''}`, {
          retryable: response.status >= 500,
        });
      }

      return toResult(await response.json(), request.model);
    },
  };
}
