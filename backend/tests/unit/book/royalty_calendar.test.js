import { describe, expect, it } from 'vitest';
import {
  lastSettledQuarterEnd,
  nextPayout,
  payoutDeadline,
  quarterEnd,
  quarterOf,
  toBusinessDate,
  upcomingPayoutQuarter,
} from '../../../src/modules/book_module/book.royalty_calendar.js';

const indiaMidday = (isoDate) => new Date(`${isoDate}T12:00:00+05:30`);

describe('quarterOf', () => {
  it.each([
    ['2026-01-01', 1],
    ['2026-03-31', 1],
    ['2026-04-01', 2],
    ['2026-09-30', 3],
    ['2026-12-31', 4],
  ])('%s is in quarter %i', (date, quarter) => {
    expect(quarterOf(date)).toEqual({ year: 2026, quarter });
  });
});

describe('quarterEnd and payoutDeadline (KB: paid within 45 days of the quarter ending)', () => {
  it.each([
    [1, '2026-03-31', '2026-05-15'],
    [2, '2026-06-30', '2026-08-14'],
    [3, '2026-09-30', '2026-11-14'],
    [4, '2026-12-31', '2027-02-14'],
  ])('Q%i ends %s and is paid by %s', (quarter, end, deadline) => {
    expect(quarterEnd({ year: 2026, quarter })).toBe(end);
    expect(payoutDeadline({ year: 2026, quarter })).toBe(deadline);
  });

  it('handles a leap-year first quarter', () => {
    expect(quarterEnd({ year: 2028, quarter: 1 })).toBe('2028-03-31');
    expect(payoutDeadline({ year: 2028, quarter: 1 })).toBe('2028-05-15');
  });
});

describe('nextPayout', () => {
  it.each([
    ['2026-10-28', 'Q3 2026', '2026-11-14'],
    ['2026-11-14', 'Q3 2026', '2026-11-14'],
    ['2026-11-15', 'Q4 2026', '2027-02-14'],
    ['2026-12-31', 'Q4 2026', '2027-02-14'],
    ['2027-01-01', 'Q4 2026', '2027-02-14'],
    ['2027-02-14', 'Q4 2026', '2027-02-14'],
    ['2027-02-15', 'Q1 2027', '2027-05-15'],
    ['2027-05-15', 'Q1 2027', '2027-05-15'],
    ['2027-05-16', 'Q2 2027', '2027-08-14'],
  ])('on %s the next payout covers %s, paid by %s', (today, quarter, paidBy) => {
    expect(nextPayout(indiaMidday(today))).toEqual({ quarter, paidBy });
  });

  it('uses the date in India, not UTC', () => {
    const justAfterMidnightInIndia = new Date('2026-11-14T19:00:00Z');

    expect(toBusinessDate(justAfterMidnightInIndia)).toBe('2026-11-15');
    expect(nextPayout(justAfterMidnightInIndia)).toEqual({ quarter: 'Q4 2026', paidBy: '2027-02-14' });
  });
});

describe('upcomingPayoutQuarter and lastSettledQuarterEnd', () => {
  it.each([
    ['2026-10-29', { year: 2026, quarter: 3 }, '2026-06-30'],
    ['2026-11-15', { year: 2026, quarter: 4 }, '2026-09-30'],
    ['2027-02-14', { year: 2026, quarter: 4 }, '2026-09-30'],
    ['2027-02-15', { year: 2027, quarter: 1 }, '2026-12-31'],
  ])('on %s the upcoming payout is %o and the last settled quarter ended %s', (today, quarter, settledEnd) => {
    expect(upcomingPayoutQuarter(indiaMidday(today))).toEqual(quarter);
    expect(lastSettledQuarterEnd(indiaMidday(today))).toBe(settledEnd);
  });
});
