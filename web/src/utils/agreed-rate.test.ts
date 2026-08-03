import { describe, it, expect, beforeEach } from 'vitest';
import { recordAgreedRate, getAgreedRate, clearAgreedRates } from './agreed-rate';
import type { BtcPrices } from '../types/api';

const AT_BOOKING = { USD: 60000, GBP: 48000, EUR: 55000, KES: 7800000 } as BtcPrices;
const LATER = { USD: 61000, GBP: 48800, EUR: 56000, KES: 7900000 } as BtcPrices;

describe('agreed-rate', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAgreedRates();
  });

  it('remembers the rate a price was agreed at', () => {
    recordAgreedRate('ride_1', AT_BOOKING);
    expect(getAgreedRate('ride_1')).toEqual(AT_BOOKING);
  });

  it('keeps the FIRST rate — a later reprice is on the agreed terms', () => {
    recordAgreedRate('ride_1', AT_BOOKING);
    recordAgreedRate('ride_1', LATER);
    expect(getAgreedRate('ride_1')).toEqual(AT_BOOKING);
  });

  it('returns null for a job booked before this existed', () => {
    // Falls back to the live rate — exactly the old behaviour
    expect(getAgreedRate('ride_unknown')).toBeNull();
  });

  it('returns null rather than throwing for a missing id', () => {
    expect(getAgreedRate(null)).toBeNull();
    expect(getAgreedRate(undefined)).toBeNull();
  });

  it('ignores a missing price rather than storing a hole', () => {
    recordAgreedRate('ride_1', null);
    expect(getAgreedRate('ride_1')).toBeNull();
  });

  it('keeps each job on its own rate', () => {
    recordAgreedRate('ride_1', AT_BOOKING);
    recordAgreedRate('ride_2', LATER);
    expect(getAgreedRate('ride_1')).toEqual(AT_BOOKING);
    expect(getAgreedRate('ride_2')).toEqual(LATER);
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('donkeyride.agreed-rates', '{not json');
    expect(getAgreedRate('ride_1')).toBeNull();
    recordAgreedRate('ride_1', AT_BOOKING);
    expect(getAgreedRate('ride_1')).toEqual(AT_BOOKING);
  });

  it('holds the fiat figure steady while the market moves', () => {
    // The bug this exists for: same sats, different fiat, because the
    // completion screen reconverted at today's rate
    const sats = 9104;
    recordAgreedRate('ride_1', AT_BOOKING);
    const agreed = getAgreedRate('ride_1')!;

    const atBooking = (sats / 100_000_000) * agreed.GBP;
    const today = (sats / 100_000_000) * LATER.GBP;

    expect(atBooking.toFixed(2)).toBe('4.37');
    expect(today.toFixed(2)).toBe('4.44');   // what it used to show
    expect(atBooking).not.toBeCloseTo(today, 2);
  });
});
