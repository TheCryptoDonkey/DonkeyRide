import { useEffect, useRef } from 'react';
import { updateLocation } from '../../services/api';

interface LiveTrackerProps {
  taskId: string;
  providerPubkey: string;
  lat: number;
  lng: number;
  enabled: boolean;
  intervalMs?: number;
}

/**
 * Headless component that sends location updates at a fixed interval.
 * Extracted from provider ActiveTaskPage so it can be stripped from
 * privacy-maximised deployments.
 */
export function LiveTracker({
  taskId, providerPubkey, lat, lng, enabled, intervalMs = 3000,
}: LiveTrackerProps) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled || !taskId || !providerPubkey) return;

    timerRef.current = setInterval(async () => {
      try {
        await updateLocation(taskId, {
          lat,
          lng,
          providerPubkey,
        });
      } catch {
        // Ignore — location updates are best-effort
      }
    }, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [taskId, providerPubkey, lat, lng, enabled, intervalMs]);

  return null;
}

/**
 * Hook form of LiveTracker for use outside JSX.
 * Returns nothing — purely a side-effect hook.
 */
export function useLiveTracking(params: {
  taskId: string | null;
  providerPubkey: string | null;
  lat: number;
  lng: number;
  enabled: boolean;
  intervalMs?: number;
}) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!params.enabled || !params.taskId || !params.providerPubkey) return;

    timerRef.current = setInterval(async () => {
      try {
        await updateLocation(params.taskId!, {
          lat: params.lat,
          lng: params.lng,
          providerPubkey: params.providerPubkey!,
        });
      } catch {
        // Ignore
      }
    }, params.intervalMs || 3000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [params.taskId, params.providerPubkey, params.lat, params.lng, params.enabled, params.intervalMs]);
}
