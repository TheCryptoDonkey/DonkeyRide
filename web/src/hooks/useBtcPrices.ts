import { useState, useEffect, useCallback } from 'react';
import type { BtcPrices } from '../types/api';
import { getBtcPrices } from '../services/api';

const REFRESH_INTERVAL = 60_000; // 1 minute

/**
 * Hook to keep BTC prices refreshed.
 */
export function useBtcPrices() {
  const [prices, setPrices] = useState<BtcPrices | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await getBtcPrices();
      setPrices(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch prices');
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [refresh]);

  return { prices, error, refresh };
}
