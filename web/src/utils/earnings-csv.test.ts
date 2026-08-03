import { describe, it, expect } from 'vitest';
import { earningsToCsv } from './earnings-csv';
import type { DriverEarnings } from '../services/api';

const earnings: DriverEarnings = {
  success: true,
  summary: {
    today: { rides: 1, sats: 5000 },
    week: { rides: 1, sats: 5000 },
    allTime: { rides: 2, sats: 9000 },
  },
  rides: [
    {
      id: 'ride_1',
      domain: 'ridesharing',
      completedAt: Date.UTC(2026, 2, 1, 14, 0, 0),
      fare: 5000,
      tips: 500,
      currency: 'GBP',
      rating: 5,
      settlement: { method: 'lightning', rail: 'lnaddress', status: 'confirmed', trust_model: 'none' },
    },
    {
      id: 'ride_2,with comma',
      domain: 'ridesharing',
      completedAt: null,
      fare: 4000,
      tips: 0,
      currency: 'GBP',
      rating: null,
      settlement: null,
    },
  ],
};

describe('earningsToCsv', () => {
  it('has a header and one row per job', () => {
    const lines = earningsToCsv(earnings).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^date,job_id,/);
  });

  it('totals fare and tips, because that is what was earned', () => {
    const row = earningsToCsv(earnings).split('\n')[1].split(',');
    expect(row[3]).toBe('5000');
    expect(row[4]).toBe('500');
    expect(row[5]).toBe('5500');
  });

  it('quotes a field containing a comma rather than shifting every column', () => {
    const line = earningsToCsv(earnings).split('\n')[2];
    expect(line).toContain('"ride_2,with comma"');
    expect(line.split(',')).toHaveLength(11); // 10 columns, one split inside the quotes
  });

  it('leaves missing values empty instead of printing null', () => {
    const line = earningsToCsv(earnings).split('\n')[2];
    expect(line).not.toContain('null');
    expect(line).not.toContain('undefined');
  });
});
