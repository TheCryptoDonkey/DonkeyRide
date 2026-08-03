import type { DriverEarnings } from '../services/api';

/**
 * Your year, as a file you can hand to an accountant.
 *
 * Self-employed drivers do their own tax returns, and an operator that
 * keeps no durable record of anything cannot produce a statement for them
 * later — this export IS the statement, generated on the device from what
 * the driver's own app knows. Plain CSV on purpose: it opens in anything,
 * including the spreadsheet on a £60 phone.
 */

const HEADERS = [
  'date', 'job_id', 'domain', 'fare_sats', 'tips_sats', 'total_sats',
  'currency', 'rating', 'settlement_rail', 'settlement_status',
];

/** RFC 4180-ish escaping: quote anything with a comma, quote or newline */
function cell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function earningsToCsv(earnings: DriverEarnings): string {
  const rows = [HEADERS.join(',')];
  for (const ride of earnings.rides) {
    rows.push([
      ride.completedAt ? new Date(ride.completedAt).toISOString() : '',
      ride.id,
      ride.domain,
      ride.fare,
      ride.tips,
      (ride.fare || 0) + (ride.tips || 0),
      ride.currency,
      ride.rating ?? '',
      ride.settlement?.rail || ride.settlement?.method || '',
      ride.settlement?.status || '',
    ].map(cell).join(','));
  }
  return rows.join('\n');
}

/** Trigger a download of the CSV. Nothing leaves the device. */
export function downloadEarningsCsv(earnings: DriverEarnings, filename = 'earnings.csv'): void {
  const blob = new Blob([earningsToCsv(earnings)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
