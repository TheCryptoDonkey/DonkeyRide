import { describe, it, expect, beforeEach } from 'vitest';
import {
  jobMovesToward, loadDestinationMode, saveDestinationMode, clearDestinationMode,
} from './destination-mode';

// Driver heading north to Bury from central Manchester
const BURY = { lat: 53.593, lng: -2.298 };

describe('jobMovesToward', () => {
  it('accepts a job whose dropoff makes real progress toward the destination', () => {
    expect(jobMovesToward({
      pickup: { lat: 53.48, lng: -2.24 },     // central Manchester
      dropoff: { lat: 53.55, lng: -2.28 },    // most of the way to Bury
    }, BURY)).toBe(true);
  });

  it('rejects a job heading the opposite way', () => {
    expect(jobMovesToward({
      pickup: { lat: 53.48, lng: -2.24 },
      dropoff: { lat: 53.40, lng: -2.20 },    // south — away from Bury
    }, BURY)).toBe(false);
  });

  it('accepts a short hop that ends practically at the destination', () => {
    expect(jobMovesToward({
      pickup: { lat: 53.585, lng: -2.30 },    // already near Bury
      dropoff: { lat: 53.592, lng: -2.297 },  // in Bury
    }, BURY)).toBe(true);
  });

  it('rejects a sideways job with no meaningful progress', () => {
    expect(jobMovesToward({
      pickup: { lat: 53.48, lng: -2.24 },
      dropoff: { lat: 53.48, lng: -2.25 },    // ~700 m sideways
    }, BURY)).toBe(false);
  });

  it('cannot judge a job without a dropoff — does not qualify', () => {
    expect(jobMovesToward({ pickup: { lat: 53.48, lng: -2.24 }, dropoff: null }, BURY)).toBe(false);
  });
});

describe('destination mode storage', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips and clears', () => {
    expect(loadDestinationMode()).toBeNull();
    saveDestinationMode({ ...BURY, label: 'Bury' });
    expect(loadDestinationMode()).toEqual({ ...BURY, label: 'Bury' });
    clearDestinationMode();
    expect(loadDestinationMode()).toBeNull();
  });

  it('ignores corrupt storage', () => {
    localStorage.setItem('donkeyride.destination-mode', '{nope');
    expect(loadDestinationMode()).toBeNull();
  });
});
