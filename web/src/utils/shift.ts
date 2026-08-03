/**
 * How long the driver has actually been online today, and what that works
 * out at per hour.
 *
 * A daily earnings total on its own is not decision-useful: £60 is a good
 * day in four hours and a poor one in twelve. The operator cannot compute
 * this — it holds no durable record of anyone's shift, by design — so the
 * device tracks its own clock and keeps it here.
 *
 * Device-local, like trip history and favourites. Clearing site data clears
 * the shift log; that is the same trade every other local record makes.
 */

const KEY = 'donkeyride.shift';
/** Older days are pruned — this is a "today" clock, not an employment record */
const KEEP_DAYS = 14;

interface ShiftLog {
  /** Accumulated online milliseconds, keyed by local YYYY-MM-DD */
  days: Record<string, number>;
  /** Unix ms the current online stretch began; null when offline */
  since: number | null;
}

function today(at: number = Date.now()): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function read(): ShiftLog {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { days: {}, since: null };
    const parsed = JSON.parse(raw);
    const days: Record<string, number> = {};
    if (parsed?.days && typeof parsed.days === 'object') {
      for (const [day, ms] of Object.entries(parsed.days)) {
        if (typeof ms === 'number' && Number.isFinite(ms) && ms >= 0) days[day] = ms;
      }
    }
    const since = typeof parsed?.since === 'number' && parsed.since > 0 ? parsed.since : null;
    return { days, since };
  } catch {
    return { days: {}, since: null };
  }
}

function write(log: ShiftLog): void {
  try {
    // Prune before writing so the record cannot grow without bound
    const cutoff = today(Date.now() - KEEP_DAYS * 86400000);
    const days: Record<string, number> = {};
    for (const [day, ms] of Object.entries(log.days)) {
      if (day >= cutoff) days[day] = ms;
    }
    localStorage.setItem(KEY, JSON.stringify({ days, since: log.since }));
  } catch {
    // Storage full or unavailable — the shift clock is not worth failing over
  }
}

/**
 * Bank the time accrued since `since` into the right day buckets.
 * Split across midnight so an overnight shift does not land entirely on
 * whichever day it happened to end on.
 */
function bank(log: ShiftLog, until: number): ShiftLog {
  if (log.since == null || until <= log.since) return log;
  const days = { ...log.days };
  let cursor = log.since;
  while (cursor < until) {
    const midnight = new Date(cursor);
    midnight.setHours(24, 0, 0, 0);
    const chunkEnd = Math.min(until, midnight.getTime());
    const day = today(cursor);
    days[day] = (days[day] || 0) + (chunkEnd - cursor);
    cursor = chunkEnd;
  }
  return { days, since: null };
}

/** The driver went online */
export function startShift(at: number = Date.now()): void {
  const log = read();
  // Already running (a reload, a second tab) — keep the earlier start
  if (log.since != null) return;
  write({ ...log, since: at });
}

/** The driver went offline */
export function endShift(at: number = Date.now()): void {
  const log = read();
  if (log.since == null) return;
  write(bank(log, at));
}

/** Milliseconds online today, including the stretch currently running */
export function onlineMsToday(at: number = Date.now()): number {
  const log = read();
  const banked = bank(log, at);
  return banked.days[today(at)] || 0;
}

/** "3h 20m" — hours online, in words a driver reads at a glance */
export function formatOnline(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes % 60}m`;
}

/**
 * Sats per hour so far today. Null until a meaningful stretch has been
 * worked — a rate extrapolated from four minutes online is noise, and a
 * wildly wrong headline number is worse than no number.
 */
export function satsPerHour(satsToday: number, onlineMs: number): number | null {
  const MIN_MS = 15 * 60 * 1000;
  if (onlineMs < MIN_MS) return null;
  return Math.round(satsToday / (onlineMs / 3600000));
}
