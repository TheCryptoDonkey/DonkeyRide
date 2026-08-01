import { describe, it, expect } from 'vitest';
import { satsToFiat, formatSats } from './pricing';
import type { BtcPrices } from '../types/api';

const prices: BtcPrices = {
  USD: 100_000,
  GBP: 80_000,
  EUR: 90_000,
  updatedAt: '2026-08-01T00:00:00Z',
};

describe('satsToFiat', () => {
  it('converts sats using unwrapped price data', () => {
    // 1,000,000 sats = 0.01 BTC
    expect(satsToFiat(1_000_000, prices, 'GBP')).toBe('£800.00');
    expect(satsToFiat(1_000_000, prices, 'USD')).toBe('$1000.00');
    expect(satsToFiat(1_000_000, prices, 'EUR')).toBe('€900.00');
  });

  it('returns an empty string when prices are unavailable', () => {
    expect(satsToFiat(1_000_000, null, 'GBP')).toBe('');
  });

  it('returns an empty string for an unknown currency', () => {
    expect(satsToFiat(1_000_000, prices, 'CHF')).toBe('');
  });
});

describe('formatSats', () => {
  it('rounds and adds separators', () => {
    expect(formatSats(1234567.4)).toBe((1234567).toLocaleString());
  });
});
