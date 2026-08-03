import { describe, it, expect } from 'vitest';
import { arrivalClock, etaMinutes, remainingSeconds } from './eta';

describe('etaMinutes', () => {
  it('never says zero minutes', () => {
    expect(etaMinutes(0)).toBe(1);
    expect(etaMinutes(20)).toBe(1);
  });

  it('rounds to the nearest minute', () => {
    expect(etaMinutes(90)).toBe(2);
    expect(etaMinutes(600)).toBe(10);
  });
});

describe('arrivalClock', () => {
  it('is a clock time in the future, not a duration', () => {
    const now = new Date('2026-03-01T14:00:00Z').getTime();
    const clock = arrivalClock(30 * 60, now);
    // Rendered in the runner's own locale/zone, so assert the shape and
    // that it moved forward rather than a literal string
    expect(clock).toMatch(/\d{1,2}[:.]\d{2}/);
    expect(clock).not.toBe(arrivalClock(0, now));
  });

  it('treats a negative ETA as now rather than counting backwards', () => {
    const now = new Date('2026-03-01T14:00:00Z').getTime();
    expect(arrivalClock(-500, now)).toBe(arrivalClock(0, now));
  });
});

describe('remainingSeconds', () => {
  const startedAt = new Date('2026-03-01T14:00:00Z').toISOString();
  const now = new Date('2026-03-01T14:10:00Z').getTime();

  it('prefers a live ETA from the provider over the booking estimate', () => {
    expect(remainingSeconds({
      liveEtaSeconds: 240, durationMin: 60, startedAt, now,
    })).toBe(240);
  });

  it('falls back to the booking estimate less the time already elapsed', () => {
    // 30 min journey, 10 min in → 20 min left, not the 30 booked
    expect(remainingSeconds({
      liveEtaSeconds: null, durationMin: 30, startedAt, now,
    })).toBe(20 * 60);
  });

  it('never counts backwards on an overrunning trip', () => {
    expect(remainingSeconds({
      liveEtaSeconds: null, durationMin: 5, startedAt, now,
    })).toBe(60);
  });

  it('has nothing to say before the trip starts', () => {
    expect(remainingSeconds({ durationMin: 30, startedAt: null, now })).toBeNull();
    expect(remainingSeconds({ durationMin: null, startedAt, now })).toBeNull();
  });
});
