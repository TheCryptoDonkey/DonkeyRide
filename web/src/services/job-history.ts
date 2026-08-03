import type { Task } from '../types/api';
import type { DriverEarnings } from './api';

/**
 * The driver's own record of the work they have done — on the device, like
 * the rider's trip history.
 *
 * Why this has to exist: earnings were read solely from the operator, which
 * computes them from completed tasks held IN MEMORY. The default operator is
 * deliberately database-free, and two separate mechanisms delete that memory —
 * terminal tasks are evicted after TERMINAL_TASK_RETAIN_MS (six hours), and a
 * restart rehydrates only NON-terminal tasks from the Nostr snapshots. So a
 * driver on a ten-hour shift exported a CSV missing the morning, and after any
 * restart the dashboard read £0.00 / 0 trips with no indication that anything
 * had been lost. For a self-employed driver filing their own return, that is
 * the one record that actually matters.
 *
 * The operator is still asked — it holds ratings and settlement status the
 * device may not have seen — but it is no longer the only copy.
 */

const STORAGE_KEY = 'donkeyride.job-history';
/** Roughly a tax year of full-time work; the cap is on storage, not on time */
const MAX_RECORDS = 2000;

export interface JobRecord {
  id: string;
  domain: string;
  /** Unix ms the job finished */
  completedAt: number;
  fare: number;
  tips: number;
  currency: string;
  rating: number | null;
  settlement: {
    method: string | null;
    rail?: string | null;
    status: string | null;
    trust_model: string | null;
  } | null;
}

function read(): JobRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is JobRecord => r && typeof r.id === 'string' && typeof r.completedAt === 'number',
    );
  } catch {
    return [];
  }
}

function write(records: JobRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_RECORDS)));
  } catch {
    // Storage full or unavailable — never fail a completion over bookkeeping
  }
}

/** Every job this device has finished, newest first */
export function getJobHistory(): JobRecord[] {
  return read().sort((a, b) => b.completedAt - a.completedAt);
}

/**
 * Record a finished job. Idempotent per task id, and MERGES on repeat so a
 * later view that knows the rating or the settled rail can fill those in
 * without discarding what was captured at completion.
 */
export function recordJob(
  task: Task,
  extra?: { domain?: string; rating?: number | null },
): JobRecord {
  const records = read();
  const existing = records.find((r) => r.id === task.id);
  const completedAt = task.completedAt ? Date.parse(task.completedAt) : NaN;

  const record: JobRecord = {
    id: task.id,
    domain: extra?.domain || existing?.domain || 'ridesharing',
    completedAt: Number.isFinite(completedAt)
      ? completedAt
      : existing?.completedAt ?? Date.now(),
    // The agreed fare, which already carries waiting time and any re-price
    fare: task.fareEstimateSats ?? existing?.fare ?? 0,
    tips: task.tip ?? existing?.tips ?? 0,
    currency: task.fareEstimateFiat?.currency || existing?.currency || 'GBP',
    rating: extra?.rating ?? existing?.rating ?? null,
    settlement: task.settlement
      ? {
        method: task.settlement.method ?? null,
        rail: task.settlement.rail ?? null,
        status: task.settlement.status ?? null,
        trust_model: existing?.settlement?.trust_model ?? null,
      }
      : existing?.settlement ?? null,
  };

  write([record, ...records.filter((r) => r.id !== task.id)]);
  return record;
}

export function clearJobHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing to do
  }
}

/**
 * Combine what the operator still remembers with what this device recorded.
 *
 * The operator wins for any job it still holds — it may have a rating or a
 * settlement status the device never saw — and the local ledger supplies
 * everything the operator has since forgotten. Summaries are recomputed over
 * the union, because the operator's own totals only ever cover its half.
 */
export function mergeEarnings(
  remote: DriverEarnings | null,
  local: JobRecord[] = getJobHistory(),
): DriverEarnings {
  const byId = new Map<string, DriverEarnings['rides'][number]>();
  for (const record of local) byId.set(record.id, record);
  for (const ride of remote?.rides || []) byId.set(ride.id, ride);

  const rides = Array.from(byId.values())
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const sum = (list: typeof rides) =>
    list.reduce((acc, r) => acc + (r.fare || 0) + (r.tips || 0), 0);
  const bucket = (list: typeof rides) => ({ rides: list.length, sats: sum(list) });

  return {
    success: true,
    summary: {
      today: bucket(rides.filter((r) => (r.completedAt || 0) >= dayStart.getTime())),
      week: bucket(rides.filter((r) => (r.completedAt || 0) >= weekAgo)),
      allTime: bucket(rides),
    },
    rides,
  };
}
