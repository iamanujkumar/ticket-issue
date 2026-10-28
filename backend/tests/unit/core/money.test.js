import { describe, expect, it } from 'vitest';
import { toMoney } from '../../../src/core/utils/money.js';

describe('toMoney', () => {
  it('wraps an amount in paise with its currency', () => {
    expect(toMoney(39900)).toEqual({ amountMinor: 39900, currency: 'INR' });
  });

  it('keeps zero as zero', () => {
    expect(toMoney(0)).toEqual({ amountMinor: 0, currency: 'INR' });
  });

  it('keeps a missing amount as null, not zero', () => {
    expect(toMoney(null)).toBeNull();
    expect(toMoney(undefined)).toBeNull();
  });

  it('accepts another currency', () => {
    expect(toMoney(1999, 'USD')).toEqual({ amountMinor: 1999, currency: 'USD' });
  });
});
