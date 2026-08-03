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
 * Hook that sends location updates at a fixed interval.
 *
 * The latest coordinates are held in a ref so a fresh GPS fix never resets
 * the interval — the effect only restarts when the task or enablement
 * changes. Posts immediately on start, then every intervalMs.
 */
export function useLiveTracking(params: {
  taskId: string | null;
  providerPubkey: string | null;
  lat: number;
  lng: number;
  enabled: boolean;
  intervalMs?: number;
  /** Coordinating operator for a job found over Nostr; ours when absent */
  operatorBase?: string;
}) {
  const coordsRef = useRef({ lat: params.lat, lng: params.lng });
  coordsRef.current = { lat: params.lat, lng: params.lng };

  const pubkeyRef = useRef(params.providerPubkey);
  pubkeyRef.current = params.providerPubkey;

  const { taskId, enabled, intervalMs = 3000, operatorBase } = params;

  useEffect(() => {
    if (!enabled || !taskId) return;

    let stopped = false;

    const post = async () => {
      const providerPubkey = pubkeyRef.current;
      if (stopped || !providerPubkey) return;
      try {
        await updateLocation(taskId, {
          lat: coordsRef.current.lat,
          lng: coordsRef.current.lng,
          providerPubkey,
        }, operatorBase);
      } catch {
        // Ignore — location updates are best-effort
      }
    };

    void post(); // immediately on start
    const timer = setInterval(post, intervalMs);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [taskId, enabled, intervalMs]);
}

/**
 * Headless component form of useLiveTracking.
 * Extracted from provider ActiveTaskPage so it can be stripped from
 * privacy-maximised deployments.
 */
export function LiveTracker(props: LiveTrackerProps) {
  useLiveTracking(props);
  return null;
}
