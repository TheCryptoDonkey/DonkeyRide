import { describe, it, expect, beforeEach } from 'vitest';
import { getTripHistory, recordTrip, clearTripHistory } from './trip-history';
import type { Task } from '../types/api';

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    status: 'completed',
    requesterPubkey: 'a'.repeat(64),
    pickup: { lat: 53.4808, lng: -2.2426 },
    dropoff: { lat: 53.4774, lng: -2.2309 },
    fareEstimateSats: 8000,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => localStorage.clear());

describe('trip history', () => {
  it('records newest first with addresses when known', () => {
    recordTrip(makeTask('ride_1', { pickupAddress: 'Piccadilly Gardens' }));
    recordTrip(makeTask('ride_2'));
    const history = getTripHistory();
    expect(history.map((r) => r.id)).toEqual(['ride_2', 'ride_1']);
    expect(history[1].from).toBe('Piccadilly Gardens');
    expect(history[0].from).toBe('53.481, -2.243');
    expect(history[0].fareSats).toBe(8000);
  });

  it('re-recording the same trip updates in place, keeping first completion time', () => {
    recordTrip(makeTask('ride_1'));
    const first = getTripHistory()[0].completedAt;
    recordTrip(makeTask('ride_1', { settlement: { rail: 'cash', status: 'confirmed' } }));
    const history = getTripHistory();
    expect(history).toHaveLength(1);
    expect(history[0].rail).toBe('cash');
    expect(history[0].completedAt).toBe(first);
  });

  it('caps the list and clears', () => {
    for (let i = 0; i < 110; i++) recordTrip(makeTask(`ride_${i}`));
    expect(getTripHistory()).toHaveLength(100);
    clearTripHistory();
    expect(getTripHistory()).toEqual([]);
  });

  it('ignores corrupt storage', () => {
    localStorage.setItem('donkeyride.trip-history', '{nope');
    expect(getTripHistory()).toEqual([]);
  });
});
