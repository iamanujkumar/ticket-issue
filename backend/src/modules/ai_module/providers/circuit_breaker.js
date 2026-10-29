import { CIRCUIT_BREAKER } from '../ai.constants.js';

export function createCircuitBreaker({
  failureThreshold = CIRCUIT_BREAKER.FAILURE_THRESHOLD,
  openMs = CIRCUIT_BREAKER.OPEN_MS,
  clock = Date.now,
} = {}) {
  let consecutiveFailures = 0;
  let openedAt = null;

  return {
    isOpen() {
      if (openedAt === null) return false;
      if (clock() - openedAt >= openMs) {
        openedAt = null;
        consecutiveFailures = 0;
        return false;
      }
      return true;
    },

    recordSuccess() {
      consecutiveFailures = 0;
      openedAt = null;
    },

    recordFailure() {
      consecutiveFailures += 1;
      if (consecutiveFailures >= failureThreshold) {
        openedAt = clock();
      }
    },
  };
}
