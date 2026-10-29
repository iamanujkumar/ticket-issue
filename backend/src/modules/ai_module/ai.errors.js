import { AppError, ConflictError, ERROR_CODES, NotFoundError } from '../../core/errors/app_error.js';
import { AiOutcome } from './ai.enums.js';

export const AI_ERROR_CODES = Object.freeze({
  DRAFT_NOT_FOUND: 'DRAFT_NOT_FOUND',
  DRAFT_ALREADY_SENT: 'DRAFT_ALREADY_SENT',
});

export class DraftAlreadySentError extends ConflictError {
  constructor() {
    super({ code: AI_ERROR_CODES.DRAFT_ALREADY_SENT, message: 'This draft has already been sent.' });
  }
}

export class AiError extends Error {
  constructor(message, { outcome, retryable }) {
    super(message);
    this.name = new.target.name;
    this.outcome = outcome;
    this.retryable = retryable;
  }
}

export class AiRateLimitedError extends AiError {
  constructor(retryAfterSeconds = null) {
    super('The AI provider is rate limiting requests', { outcome: AiOutcome.RATE_LIMITED, retryable: true });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class AiTimeoutError extends AiError {
  constructor() {
    super('The AI provider did not answer in time', { outcome: AiOutcome.TIMEOUT, retryable: true });
  }
}

export class AiProviderError extends AiError {
  constructor(message = 'The AI provider failed', { retryable = true } = {}) {
    super(message, { outcome: AiOutcome.PROVIDER_ERROR, retryable });
  }
}

export class AiCircuitOpenError extends AiError {
  constructor() {
    super('AI calls are paused after repeated failures', { outcome: AiOutcome.CIRCUIT_OPEN, retryable: true });
  }
}

export class AiInvalidOutputError extends AiError {
  constructor(message = 'The AI answer did not match the expected format') {
    super(message, { outcome: AiOutcome.INVALID_OUTPUT, retryable: false });
  }
}

export class AiDisabledError extends AiError {
  constructor() {
    super('AI is not configured', { outcome: AiOutcome.DISABLED, retryable: false });
  }
}

export class RegenerateLimitError extends AppError {
  constructor() {
    super({
      code: ERROR_CODES.RATE_LIMITED,
      httpStatus: 429,
      message: 'This draft was regenerated too often. Please wait a few minutes.',
    });
  }
}

export class DraftNotFoundError extends NotFoundError {
  constructor() {
    super({ code: AI_ERROR_CODES.DRAFT_NOT_FOUND, message: 'Draft not found for this ticket.' });
  }
}
