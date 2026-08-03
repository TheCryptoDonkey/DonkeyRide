import type { BtcPrices } from '../types/api';

/**
 * The exchange rate in force when the requester agreed the price.
 *
 * The fare is agreed in SATS and that figure is exact — but every screen
 * shows fiat first, because that is the number a person actually thinks in.
 * Converting those sats again later, at a rate that has moved, means the
 * completion screen says "Agreed amount: £4.24" over a job the rider tapped
 * "Request driver · £4.23" to book. Nothing was overcharged and the sats are
 * identical; it just makes a liar of the word "agreed".
 *
 * So capture the rate at the moment of agreement and render the agreed
 * figure through it, exactly as a settled trip renders its receipt through
 * `TripRecord.btcPricesAt`.
 *
 * Device-local, like everything else here: the operator holds no copy.
 */

const STORAGE_KEY = 'donkeyride.agreed-rates';
/** A few hundred jobs is far more than any device needs to look back over */
const MAX_RECORDS = 200;

type Store = Record<string, BtcPrices>;

function read(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    // Corrupt or unavailable storage is the same as none — never throw on a
    // path that only exists to make a number prettier
    return {};
  }
}

function write(store: Store): void {
  try {
    const entries = Object.entries(store);
    const trimmed = entries.length > MAX_RECORDS
      ? Object.fromEntries(entries.slice(-MAX_RECORDS))
      : store;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Out of quota, or private mode — the figure just falls back to live
  }
}

/**
 * Remember the rate a task's price was agreed at. The FIRST rate wins: a
 * destination change re-prices in sats on the terms already agreed, so the
 * rate the rider signed up to is still the honest one to display.
 */
export function recordAgreedRate(taskId: string, prices: BtcPrices | null | undefined): void {
  if (!taskId || !prices) return;
  const store = read();
  if (store[taskId]) return;
  store[taskId] = prices;
  write(store);
}

/** The rate this task's price was agreed at, or null to fall back to live */
export function getAgreedRate(taskId: string | null | undefined): BtcPrices | null {
  if (!taskId) return null;
  return read()[taskId] ?? null;
}

export function clearAgreedRates(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing to do
  }
}
