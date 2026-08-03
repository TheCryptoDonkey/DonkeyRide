import { describe, it, expect, beforeEach } from 'vitest';
import { getJobHistory, recordJob, clearJobHistory, mergeEarnings } from './job-history';
import type { Task } from '../types/api';
import type { DriverEarnings } from './api';

const makeTask = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  status: 'completed',
  fareEstimateSats: 9104,
  createdAt: '2026-08-03T12:00:00.000Z',
  completedAt: '2026-08-03T13:00:00.000Z',
  ...over,
} as Task);

const remote = (ids: string[]): DriverEarnings => ({
  success: true,
  summary: {
    today: { rides: ids.length, sats: 0 },
    week: { rides: ids.length, sats: 0 },
    allTime: { rides: ids.length, sats: 0 },
  },
  rides: ids.map((id) => ({
    id,
    domain: 'ridesharing',
    completedAt: Date.parse('2026-08-03T13:00:00.000Z'),
    fare: 9104,
    tips: 0,
    currency: 'GBP',
    rating: 5,
    settlement: null,
  })),
});

describe('job-history', () => {
  beforeEach(() => {
    localStorage.clear();
    clearJobHistory();
  });

  it('records a finished job on the device', () => {
    recordJob(makeTask('ride_1'), { domain: 'ridesharing' });
    const history = getJobHistory();
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe('ride_1');
    expect(history[0].fare).toBe(9104);
    expect(history[0].completedAt).toBe(Date.parse('2026-08-03T13:00:00.000Z'));
  });

  it('is idempotent per job and merges later detail in', () => {
    recordJob(makeTask('ride_1'));
    recordJob(makeTask('ride_1'), { rating: 5 });
    const history = getJobHistory();
    expect(history).toHaveLength(1);
    expect(history[0].rating).toBe(5);
    // the fare captured at completion survives the second write
    expect(history[0].fare).toBe(9104);
  });

  it('survives the operator forgetting everything', () => {
    // The whole point: six hours pass, or the operator restarts, and it
    // rehydrates only non-terminal tasks — so it returns nothing at all.
    recordJob(makeTask('ride_1'));
    recordJob(makeTask('ride_2'));

    const merged = mergeEarnings(null);
    expect(merged.rides).toHaveLength(2);
    expect(merged.summary.allTime.rides).toBe(2);
    expect(merged.summary.allTime.sats).toBe(9104 * 2);
  });

  it('lets the operator win for a job it still holds', () => {
    // The operator may know the rating; the device may not.
    recordJob(makeTask('ride_1'));
    const merged = mergeEarnings(remote(['ride_1']));
    expect(merged.rides).toHaveLength(1);
    expect(merged.rides[0].rating).toBe(5);
  });

  it('unions both sides rather than trusting either alone', () => {
    recordJob(makeTask('ride_old'));           // operator has forgotten this
    const merged = mergeEarnings(remote(['ride_new']));
    expect(merged.rides.map((r) => r.id).sort()).toEqual(['ride_new', 'ride_old']);
    expect(merged.summary.allTime.rides).toBe(2);
  });

  it('recomputes summaries over the union, not the operator half', () => {
    recordJob(makeTask('ride_old'));
    const stale = remote(['ride_new']);
    // The operator's own totals only ever cover what it can still see
    expect(stale.summary.allTime.rides).toBe(1);
    const merged = mergeEarnings(stale);
    expect(merged.summary.allTime.sats).toBe(9104 * 2);
  });

  it('ignores corrupt storage rather than throwing', () => {
    localStorage.setItem('donkeyride.job-history', '{not json');
    expect(getJobHistory()).toEqual([]);
  });
});
