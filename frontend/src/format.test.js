import { describe, expect, it } from 'vitest';
import { TICKET_CATEGORY, formatDate, formatDateTime, formatMoney, label, timeAgo } from './format.js';

describe('formatMoney', () => {
  it('turns paise into rupees', () => {
    expect(formatMoney({ amountMinor: 254600, currency: 'INR' })).toBe('₹2,546.00');
    expect(formatMoney({ amountMinor: 12345678, currency: 'INR' })).toBe('₹1,23,456.78');
  });

  it('shows zero as an amount and a missing value as a dash', () => {
    expect(formatMoney({ amountMinor: 0, currency: 'INR' })).toBe('₹0.00');
    expect(formatMoney(null)).toBe('—');
  });
});

describe('dates', () => {
  it('shows a calendar date without shifting the day', () => {
    expect(formatDate('2024-07-05')).toBe('5 Jul 2024');
    expect(formatDate(null)).toBe('—');
  });

  it('shows a timestamp in India time', () => {
    expect(formatDateTime('2026-10-29T20:00:00.000Z')).toBe('30 Oct 2026, 1:30 am');
    expect(formatDateTime(null)).toBe('—');
  });

  it('describes how long ago something happened', () => {
    const now = new Date('2026-10-29T12:00:00.000Z');

    expect(timeAgo('2026-10-29T11:59:30.000Z', now)).toBe('this minute');
    expect(timeAgo('2026-10-29T11:15:00.000Z', now)).toBe('45 minutes ago');
    expect(timeAgo('2026-10-29T07:00:00.000Z', now)).toBe('5 hours ago');
    expect(timeAgo('2026-10-26T12:00:00.000Z', now)).toBe('3 days ago');
  });
});

describe('label', () => {
  it('uses the human name, falls back to the raw value, and dashes a missing value', () => {
    expect(label(TICKET_CATEGORY, 'ROYALTY_PAYMENTS')).toBe('Royalty & Payments');
    expect(label(TICKET_CATEGORY, 'SOMETHING_NEW')).toBe('SOMETHING_NEW');
    expect(label(TICKET_CATEGORY, null)).toBe('—');
  });
});
