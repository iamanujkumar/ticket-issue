import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  AiCircuitOpenError,
  AiInvalidOutputError,
  AiProviderError,
  AiRateLimitedError,
  AiTimeoutError,
} from '../../../src/modules/ai_module/ai.errors.js';
import { createCircuitBreaker } from '../../../src/modules/ai_module/providers/circuit_breaker.js';
import { createFakeProvider } from '../../../src/modules/ai_module/providers/fake.provider.js';
import { createGroqProvider } from '../../../src/modules/ai_module/providers/groq.provider.js';
import { estimateCostUsd, withResilience } from '../../../src/modules/ai_module/providers/resilient.provider.js';

const API_KEY = 'gsk_test_key_that_must_never_leak';

const request = {
  task: 'TRIAGE',
  ticketId: 'ticket-1',
  promptVersion: 'triage.v1',
  model: 'openai/gpt-oss-20b',
  system: 'system',
  messages: [{ role: 'user', content: 'Subject: royalty not received' }],
  jsonSchema: { type: 'object' },
  schemaName: 'ticket_triage',
  maxTokens: 300,
  reasoningEffort: 'low',
  temperature: 0,
  timeoutMs: 1000,
  outputSchema: z.object({ category: z.string(), confidence: z.number() }).strict(),
};

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function groqWith(response) {
  const fetchImpl = vi.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)));
  return { provider: createGroqProvider({ apiKey: API_KEY, fetchImpl }), fetchImpl };
}

describe('groq provider', () => {
  it('sends a strict structured-output request and reads the usage', async () => {
    const { provider, fetchImpl } = groqWith(
      jsonResponse(200, {
        model: 'openai/gpt-oss-20b',
        choices: [{ message: { content: '{"category":"ROYALTY_PAYMENTS","confidence":0.9}' } }],
        usage: { prompt_tokens: 700, completion_tokens: 80, prompt_tokens_details: { cached_tokens: 512 } },
      }),
    );

    const result = await provider.complete(request);

    const [url, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(init.headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(body).toMatchObject({
      model: 'openai/gpt-oss-20b',
      reasoning_effort: 'low',
      max_completion_tokens: 300,
      response_format: { type: 'json_schema', json_schema: { name: 'ticket_triage', strict: true } },
    });
    expect(body.messages[0]).toEqual({ role: 'system', content: 'system' });
    expect(result).toEqual({
      json: { category: 'ROYALTY_PAYMENTS', confidence: 0.9 },
      model: 'openai/gpt-oss-20b',
      usage: { inputTokens: 700, cachedInputTokens: 512, outputTokens: 80 },
    });
  });

  it('maps 429 to a retryable rate-limit error with retry-after', async () => {
    const { provider } = groqWith(jsonResponse(429, { error: { message: 'slow down' } }, { 'retry-after': '7' }));

    const error = await provider.complete(request).catch((caught) => caught);

    expect(error).toBeInstanceOf(AiRateLimitedError);
    expect(error).toMatchObject({ retryable: true, retryAfterSeconds: 7 });
  });

  it('treats 5xx as retryable and 4xx as permanent', async () => {
    const serverError = await groqWith(jsonResponse(503, {})).provider.complete(request).catch((caught) => caught);
    const badRequest = await groqWith(jsonResponse(400, { error: { message: 'bad schema' } })).provider.complete(request).catch((caught) => caught);

    expect(serverError).toBeInstanceOf(AiProviderError);
    expect(serverError.retryable).toBe(true);
    expect(badRequest.retryable).toBe(false);
    expect(badRequest.message).toContain('bad schema');
  });

  it('never puts the API key into an error message', async () => {
    const { provider } = groqWith(jsonResponse(401, { error: { message: `Invalid API Key ${API_KEY}` } }));

    const error = await provider.complete(request).catch((caught) => caught);

    expect(error.message).not.toContain(API_KEY);
    expect(error.message).toContain('[redacted]');
  });

  it('maps a timeout and a network failure', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });

    await expect(groqWith(timeout).provider.complete(request)).rejects.toBeInstanceOf(AiTimeoutError);
    await expect(groqWith(new TypeError('fetch failed')).provider.complete(request)).rejects.toBeInstanceOf(AiProviderError);
  });

  it('rejects an answer that is not JSON', async () => {
    const { provider } = groqWith(jsonResponse(200, { choices: [{ message: { content: 'Sure! Here you go' } }] }));

    await expect(provider.complete(request)).rejects.toBeInstanceOf(AiInvalidOutputError);
  });
});

describe('circuit breaker', () => {
  it('opens after repeated failures and closes again after the pause', () => {
    let now = 0;
    const breaker = createCircuitBreaker({ failureThreshold: 3, openMs: 1000, clock: () => now });

    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.isOpen()).toBe(false);
    breaker.recordFailure();
    expect(breaker.isOpen()).toBe(true);

    now = 1000;
    expect(breaker.isOpen()).toBe(false);
  });

  it('resets the count after a success', () => {
    const breaker = createCircuitBreaker({ failureThreshold: 2, openMs: 1000 });

    breaker.recordFailure();
    breaker.recordSuccess();
    breaker.recordFailure();

    expect(breaker.isOpen()).toBe(false);
  });
});

describe('estimateCostUsd', () => {
  it('prices input, cached input and output tokens', () => {
    const cost = estimateCostUsd('openai/gpt-oss-120b', { inputTokens: 1000, cachedInputTokens: 400, outputTokens: 500 });

    expect(cost).toBeCloseTo((600 * 0.15 + 400 * 0.075 + 500 * 0.6) / 1_000_000, 9);
  });

  it('returns null for an unknown model or missing usage', () => {
    expect(estimateCostUsd('unknown-model', { inputTokens: 1, outputTokens: 1 })).toBeNull();
    expect(estimateCostUsd('openai/gpt-oss-20b', { inputTokens: null, outputTokens: 1 })).toBeNull();
  });
});

describe('resilient provider', () => {
  function sequenceProvider(answers) {
    const calls = [];
    return {
      calls,
      provider: {
        name: 'test',
        complete(callRequest) {
          calls.push(callRequest);
          const next = answers.shift();
          return next instanceof Error ? Promise.reject(next) : Promise.resolve({ json: next, model: callRequest.model, usage: { inputTokens: 10, outputTokens: 5 } });
        },
      },
    };
  }

  it('returns validated data and logs one successful invocation', async () => {
    const { provider } = sequenceProvider([{ category: 'ROYALTY_PAYMENTS', confidence: 0.9 }]);
    const logInvocation = vi.fn();

    const result = await withResilience(provider, { logInvocation }).complete(request);

    expect(result.data).toEqual({ category: 'ROYALTY_PAYMENTS', confidence: 0.9 });
    expect(logInvocation).toHaveBeenCalledTimes(1);
    expect(logInvocation.mock.calls[0][0]).toMatchObject({ ticketId: 'ticket-1', task: 'TRIAGE', provider: 'test', outcome: 'SUCCESS', inputTokens: 10 });
  });

  it('repairs an invalid answer once by sending the problem back', async () => {
    const { provider, calls } = sequenceProvider([{ category: 'X' }, { category: 'ROYALTY_PAYMENTS', confidence: 0.8 }]);
    const logInvocation = vi.fn();

    const result = await withResilience(provider, { logInvocation }).complete(request);

    expect(result.data.confidence).toBe(0.8);
    expect(calls).toHaveLength(2);
    expect(calls[1].messages.at(-1).content).toContain('did not match the required format');
    expect(logInvocation.mock.calls.map(([row]) => row.outcome)).toEqual(['INVALID_OUTPUT', 'SUCCESS']);
  });

  it('gives up after one failed repair', async () => {
    const { provider } = sequenceProvider([{ category: 'X' }, { still: 'wrong' }]);

    await expect(withResilience(provider, { logInvocation: vi.fn() }).complete(request)).rejects.toBeInstanceOf(AiInvalidOutputError);
  });

  it('opens the circuit after repeated provider failures and stops calling the provider', async () => {
    const failures = Array.from({ length: 5 }, () => new AiProviderError('down'));
    const { provider, calls } = sequenceProvider(failures);
    const breaker = createCircuitBreaker({ failureThreshold: 5, openMs: 60000 });
    const logInvocation = vi.fn();
    const resilient = withResilience(provider, { logInvocation, breaker });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(resilient.complete(request)).rejects.toBeInstanceOf(AiProviderError);
    }
    await expect(resilient.complete(request)).rejects.toBeInstanceOf(AiCircuitOpenError);

    expect(calls).toHaveLength(5);
    expect(logInvocation.mock.calls.at(-1)[0].outcome).toBe('CIRCUIT_OPEN');
  });

  it('does not count permanent errors towards the circuit breaker', async () => {
    const permanent = Array.from({ length: 6 }, () => new AiProviderError('bad request', { retryable: false }));
    const { provider, calls } = sequenceProvider(permanent);
    const resilient = withResilience(provider, { logInvocation: vi.fn(), breaker: createCircuitBreaker({ failureThreshold: 5 }) });

    for (let attempt = 0; attempt < 6; attempt += 1) {
      await expect(resilient.complete(request)).rejects.toBeInstanceOf(AiProviderError);
    }

    expect(calls).toHaveLength(6);
  });
});

describe('fake provider', () => {
  it('classifies with the keyword rules', async () => {
    const result = await createFakeProvider().complete({ ...request, messages: [{ role: 'user', content: "I haven't received my royalty" }] });

    expect(result.json).toMatchObject({ category: 'ROYALTY_PAYMENTS', priority: 'HIGH', confidence: 0.9 });
  });

  it('writes a draft addressed to the first name in the facts', async () => {
    const result = await createFakeProvider().complete({ ...request, task: 'DRAFT', messages: [{ role: 'user', content: '<facts>{"firstName": "Ananya"}</facts>' }] });

    expect(result.json.reply).toMatch(/^Hi Ananya,/);
  });

  it('can be told to fail', async () => {
    await expect(createFakeProvider({ fail: new AiTimeoutError() }).complete(request)).rejects.toBeInstanceOf(AiTimeoutError);
  });
});

describe('resilient provider token logging', () => {
  it('stores cached input tokens reported by the provider', async () => {
    const provider = {
      name: 'test',
      complete: (callRequest) =>
        Promise.resolve({
          json: { category: 'ROYALTY_PAYMENTS', confidence: 0.9 },
          model: callRequest.model,
          usage: { inputTokens: 800, cachedInputTokens: 512, outputTokens: 60 },
        }),
    };
    const logInvocation = vi.fn();

    await withResilience(provider, { logInvocation }).complete(request);

    expect(logInvocation.mock.calls[0][0]).toMatchObject({ inputTokens: 800, cachedInputTokens: 512, outputTokens: 60 });
  });
});
