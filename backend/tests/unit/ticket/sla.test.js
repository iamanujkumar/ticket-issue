import { describe, expect, it } from 'vitest';
import { slaDueAt, slaState } from '../../../src/modules/ticket_module/ticket.sla.js';

const CREATED_AT = new Date('2026-10-29T00:00:00Z');
const hoursAfterCreation = (hours) => new Date(CREATED_AT.getTime() + hours * 60 * 60 * 1000);

function openTicket(priority, overrides = {}) {
  return {
    status: 'OPEN',
    createdAt: CREATED_AT,
    slaDueAt: slaDueAt(CREATED_AT, priority),
    firstResponseAt: null,
    ...overrides,
  };
}

describe('slaDueAt', () => {
  it.each([
    ['CRITICAL', 4],
    ['HIGH', 24],
    ['MEDIUM', 48],
    ['LOW', 72],
  ])('%s is due %i hours after creation', (priority, hours) => {
    expect(slaDueAt(CREATED_AT, priority)).toEqual(hoursAfterCreation(hours));
  });
});

describe('slaState', () => {
  it('is neither overdue nor due soon early in the window', () => {
    expect(slaState(openTicket('HIGH'), hoursAfterCreation(1))).toEqual({ isOverdue: false, isDueSoon: false });
  });

  it('is due soon when less than 25% of the window is left', () => {
    expect(slaState(openTicket('HIGH'), hoursAfterCreation(19))).toEqual({ isOverdue: false, isDueSoon: true });
  });

  it('is not yet overdue exactly at the deadline', () => {
    expect(slaState(openTicket('CRITICAL'), hoursAfterCreation(4)).isOverdue).toBe(false);
  });

  it('is overdue after the deadline', () => {
    expect(slaState(openTicket('CRITICAL'), hoursAfterCreation(5))).toEqual({ isOverdue: true, isDueSoon: false });
  });

  it('stops counting once an admin has replied', () => {
    const answered = openTicket('CRITICAL', { status: 'IN_PROGRESS', firstResponseAt: hoursAfterCreation(1) });

    expect(slaState(answered, hoursAfterCreation(10))).toEqual({ isOverdue: false, isDueSoon: false });
  });

  it.each(['RESOLVED', 'CLOSED'])('is never overdue once %s', (status) => {
    expect(slaState(openTicket('CRITICAL', { status }), hoursAfterCreation(10)).isOverdue).toBe(false);
  });
});
