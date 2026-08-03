import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import type { BtcPrices } from '../types/api';
import { getBtcPrices } from '../services/api';

const REFRESH_INTERVAL = 60_000; // 1 minute

/**
 * One BTC price, shared by every component that shows a price.
 *
 * Each `useBtcPrices()` caller used to own its own fetch and its own state.
 * A screen showing a fare, a breakdown and three service classes therefore
 * fired eight requests at `/api/prices/btc`, tripped the public rate limiter,
 * and rendered the results it got in fiat next to the ones it didn't in sats
 * — the same page quoting the same trip in two currencies.
 *
 * A module-level store fixes both: one request per interval, one value, so
 * every price on the screen agrees.
 */

let prices: BtcPrices | null = null;
let error: string | null = null;
let inflight: Promise<void> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

async function fetchPrices(): Promise<void> {
  // Collapse concurrent callers onto one request
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      prices = await getBtcPrices();
      error = null;
    } catch (err) {
      // Keep the last good price rather than blanking every figure on
      // screen because one refresh failed
      error = err instanceof Error ? err.message : 'Failed to fetch prices';
    } finally {
      inflight = null;
      emit();
    }
  })();
  return inflight;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    void fetchPrices();
    timer = setInterval(() => { void fetchPrices(); }, REFRESH_INTERVAL);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => prices;

/** Reset the shared store — tests only */
export function __resetBtcPrices(): void {
  prices = null;
  error = null;
  inflight = null;
  if (timer) { clearInterval(timer); timer = null; }
  listeners.clear();
}

/**
 * Hook to read the shared, refreshed BTC price.
 */
export function useBtcPrices() {
  const shared = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  // `error` is not part of the external store snapshot (it must stay
  // referentially stable), so mirror it on each change
  const [errorState, setErrorState] = useState<string | null>(error);
  useEffect(() => subscribe(() => setErrorState(error)), []);

  const refresh = useCallback(() => fetchPrices(), []);

  return { prices: shared, error: errorState, refresh };
}
