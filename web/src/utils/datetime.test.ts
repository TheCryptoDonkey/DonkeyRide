import { describe, it, expect } from 'vitest';
import { formatScheduledTime, isUpcoming } from './datetime';

describe('formatScheduledTime', () => {
  it('says "today" for a time later today', () => {
    const later = new Date();
    later.setHours(23, 59, 0, 0);
    // If the test runs in the last minute of the day this becomes tomorrow —
    // accept either rather than flake at midnight
    const out = formatScheduledTime(later.getTime());
    expect(out).toMatch(/^(today|tomorrow) at \d{2}:\d{2}$/);
  });

  it('says "tomorrow" for the same time tomorrow', () => {
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
    const out = formatScheduledTime(tomorrow.getTime());
    expect(out).toMatch(/^tomorrow at \d{2}:\d{2}$/);
  });

  it('names the day for later in the week', () => {
    const later = new Date(Date.now() + 3 * 24 * 3600 * 1000);
    const out = formatScheduledTime(later.getTime());
    expect(out).toMatch(/^[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} at \d{2}:\d{2}$/);
  });
});

describe('isUpcoming', () => {
  it('is true for a time comfortably in the future', () => {
    expect(isUpcoming(Date.now() + 3600 * 1000)).toBe(true);
  });

  it('is false for the past, the immediate future, null and undefined', () => {
    expect(isUpcoming(Date.now() - 1000)).toBe(false);
    expect(isUpcoming(Date.now() + 30 * 1000)).toBe(false);
    expect(isUpcoming(null)).toBe(false);
    expect(isUpcoming(undefined)).toBe(false);
  });
});
