import { ERROR_MESSAGE_MAX_LENGTH, PRICE_PER_MILLION_TOKENS_USD } from '../ai.constants.js';
import { AiOutcome } from '../ai.enums.js';
import { AiCircuitOpenError, AiError, AiInvalidOutputError, AiProviderError } from '../ai.errors.js';
import { createCircuitBreaker } from './circuit_breaker.js';

const TOKENS_PER_MILLION = 1_000_000;

export function estimateCostUsd(model, usage) {
  const price = PRICE_PER_MILLION_TOKENS_USD[model];
  if (!price || !Number.isFinite(usage?.inputTokens) || !Number.isFinite(usage?.outputTokens)) return null;

  const cached = usage.cachedInputTokens ?? 0;
  const cost =
    (usage.inputTokens - cached) * price.input + cached * price.cachedInput + usage.outputTokens * price.output;
  return Number((cost / TOKENS_PER_MILLION).toFixed(6));
}

function describeIssues(error) {
  return error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
}

function repairMessages(messages, invalidJson, problem) {
  return [
    ...messages,
    { role: 'assistant', content: JSON.stringify(invalidJson ?? null) },
    {
      role: 'user',
      content: `Your answer did not match the required format (${problem}). Answer again with only valid JSON that matches the schema.`,
    },
  ];
}

function asAiError(error) {
  return error instanceof AiError ? error : new AiProviderError('Unexpected AI provider failure');
}

export function withResilience(provider, { logInvocation, breaker = createCircuitBreaker(), clock = Date.now }) {
  async function record(request, { model, usage, latencyMs, outcome, errorMessage = null }) {
    await logInvocation({
      ticketId: request.ticketId ?? null,
      task: request.task,
      provider: provider.name,
      model,
      promptVersion: request.promptVersion,
      inputTokens: usage?.inputTokens ?? null,
      cachedInputTokens: usage?.cachedInputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      latencyMs,
      estimatedCostUsd: estimateCostUsd(model, usage),
      outcome,
      errorMessage: errorMessage?.slice(0, ERROR_MESSAGE_MAX_LENGTH) ?? null,
    });
  }

  async function attempt(request, messages) {
    if (breaker.isOpen()) {
      await record(request, { model: request.model, latencyMs: 0, outcome: AiOutcome.CIRCUIT_OPEN });
      throw new AiCircuitOpenError();
    }

    const startedAt = clock();
    try {
      const result = await provider.complete({ ...request, messages });
      breaker.recordSuccess();
      return { result, latencyMs: clock() - startedAt };
    } catch (rawError) {
      const error = asAiError(rawError);
      if (error.retryable) breaker.recordFailure();
      await record(request, {
        model: request.model,
        latencyMs: clock() - startedAt,
        outcome: error.outcome,
        errorMessage: error.message,
      });
      throw error;
    }
  }

  async function validated(request, messages) {
    const { result, latencyMs } = await attempt(request, messages);
    const parsed = request.outputSchema.safeParse(result.json);
    const outcome = parsed.success ? AiOutcome.SUCCESS : AiOutcome.INVALID_OUTPUT;
    const errorMessage = parsed.success ? null : describeIssues(parsed.error);
    await record(request, { model: result.model, usage: result.usage, latencyMs, outcome, errorMessage });

    return parsed.success
      ? { ok: true, data: parsed.data, model: result.model, usage: result.usage }
      : { ok: false, json: result.json, problem: errorMessage };
  }

  return {
    name: provider.name,

    async complete(request) {
      let first;
      try {
        first = await validated(request, request.messages);
      } catch (error) {
        if (!(error instanceof AiInvalidOutputError)) throw error;
        first = { ok: false, json: error.json, problem: error.message };
      }
      if (first.ok) return first;

      const second = await validated(request, repairMessages(request.messages, first.json, first.problem));
      if (second.ok) return second;

      throw new AiInvalidOutputError(`The AI answer did not match the schema after one repair: ${second.problem}`);
    },
  };
}
