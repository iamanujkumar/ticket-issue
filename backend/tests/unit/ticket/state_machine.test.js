import { describe, expect, it } from 'vitest';
import {
  assertTransition,
  canTransition,
  transitionChanges,
} from '../../../src/modules/ticket_module/ticket.state_machine.js';
import { InvalidStatusTransitionError } from '../../../src/modules/ticket_module/ticket.errors.js';

const NOW = new Date('2026-10-29T10:00:00Z');

describe('canTransition for an admin', () => {
  it.each([
    ['OPEN', 'IN_PROGRESS', true],
    ['OPEN', 'RESOLVED', true],
    ['OPEN', 'CLOSED', true],
    ['IN_PROGRESS', 'OPEN', true],
    ['IN_PROGRESS', 'RESOLVED', true],
    ['IN_PROGRESS', 'CLOSED', true],
    ['RESOLVED', 'OPEN', true],
    ['RESOLVED', 'CLOSED', true],
    ['RESOLVED', 'IN_PROGRESS', false],
    ['CLOSED', 'OPEN', false],
    ['CLOSED', 'IN_PROGRESS', false],
    ['OPEN', 'OPEN', false],
  ])('%s → %s is %s', (from, to, allowed) => {
    expect(canTransition(from, to, 'ADMIN')).toBe(allowed);
  });
});

describe('canTransition for an author', () => {
  it.each([
    ['OPEN', 'CLOSED', true],
    ['IN_PROGRESS', 'CLOSED', true],
    ['RESOLVED', 'CLOSED', true],
    ['OPEN', 'RESOLVED', false],
    ['OPEN', 'IN_PROGRESS', false],
    ['RESOLVED', 'OPEN', false],
    ['CLOSED', 'OPEN', false],
  ])('%s → %s is %s', (from, to, allowed) => {
    expect(canTransition(from, to, 'AUTHOR')).toBe(allowed);
  });

  it('rejects an unknown role', () => {
    expect(canTransition('OPEN', 'CLOSED', 'GUEST')).toBe(false);
  });
});

describe('assertTransition', () => {
  it('throws a 409 naming both statuses', () => {
    expect(() => assertTransition('CLOSED', 'OPEN', 'ADMIN')).toThrow(InvalidStatusTransitionError);

    try {
      assertTransition('CLOSED', 'OPEN', 'ADMIN');
    } catch (error) {
      expect(error.httpStatus).toBe(409);
      expect(error.details).toEqual({ from: 'CLOSED', to: 'OPEN' });
    }
  });
});

describe('transitionChanges', () => {
  it('stamps resolvedAt when a ticket is resolved', () => {
    expect(transitionChanges({ status: 'IN_PROGRESS' }, 'RESOLVED', NOW)).toEqual({ status: 'RESOLVED', resolvedAt: NOW });
  });

  it('clears resolvedAt when a resolved ticket is reopened', () => {
    expect(transitionChanges({ status: 'RESOLVED' }, 'OPEN', NOW)).toEqual({ status: 'OPEN', resolvedAt: null });
  });

  it('keeps resolvedAt and stamps closedAt when a resolved ticket is closed', () => {
    expect(transitionChanges({ status: 'RESOLVED' }, 'CLOSED', NOW)).toEqual({ status: 'CLOSED', closedAt: NOW });
  });

  it('only changes the status for other moves', () => {
    expect(transitionChanges({ status: 'OPEN' }, 'IN_PROGRESS', NOW)).toEqual({ status: 'IN_PROGRESS' });
  });
});
