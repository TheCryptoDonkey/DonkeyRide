import { useState, useEffect, useCallback, useRef } from 'react';
import type { LatLng } from '../types/api';

// Default: London. A PLACEHOLDER for map framing only — never a position to
// act on. `hasFix` is the only thing that says whether it is real.
const DEFAULT_LOCATION: LatLng = { lat: 51.5074, lng: -0.1278 };
const CONSENT_KEY = 'donkeyride.location-consent';

export function hasLocationConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * How long to wait before asking again after a failed one-shot fix. A driver
 * whose first attempt fails (cold GPS, indoors, a permission prompt still on
 * screen) must not be stranded for the whole shift with no way back but a
 * manual reload.
 */
const RETRY_MS = 15000;

/** GeolocationPositionError.code → something a human can read */
const GEO_ERROR: Record<number, string> = {
  1: 'Location permission denied',
  2: 'Location unavailable',
  3: 'Location timed out',
};

/**
 * Hook to get the user's current geolocation.
 *
 * Returns `location` ALWAYS (falling back to London so a map has something to
 * frame) and `hasFix` to say whether that location came from the device. Read
 * `hasFix` for anything consequential — registering presence, ranking jobs,
 * measuring distance. It is a positive signal, deliberately: callers used to
 * infer readiness as `!loading && !error`, which quietly breaks because
 * Chrome on Android reports POSITION_UNAVAILABLE with an EMPTY message, so
 * `!error` was true while the position was still the London placeholder. A
 * driver was then advertised to the operator at Charing Cross, invisible to
 * every job around them, with the app still saying "listening for requests".
 *
 * Location access is enabled explicitly. Screens that only need a map frame
 * can render without triggering a browser/native permission sheet; their
 * user-facing action calls `refresh()` instead.
 */
export function useLocation({
  watch = false,
  enabled = false,
}: { watch?: boolean; enabled?: boolean } = {}) {
  const [location, setLocation] = useState<LatLng>(DEFAULT_LOCATION);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [hasFix, setHasFix] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePosition = useCallback((pos: GeolocationPosition) => {
    try { localStorage.setItem(CONSENT_KEY, 'true'); } catch { /* device-only state */ }
    setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    setError(null);
    setLoading(false);
    setHasFix(true);
  }, []);

  const handleError = useCallback((err: GeolocationPositionError) => {
    if (err.code === 1) {
      try { localStorage.removeItem(CONSENT_KEY); } catch { /* device-only state */ }
    }
    // Never store an empty message — a falsy error reads as "no error" to
    // any caller testing truthiness
    setError(err.message || GEO_ERROR[err.code] || 'Location unavailable');
    setLoading(false);
  }, []);

  const refresh = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      setLoading(false);
      return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      handlePosition,
      handleError,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, [handlePosition, handleError]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      setLoading(false);
      return;
    }

    if (watch) {
      setLoading(true);
      watchIdRef.current = navigator.geolocation.watchPosition(
        handlePosition,
        handleError,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
      );
      return () => {
        if (watchIdRef.current != null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
      };
    }

    // One-shot mode — but keep asking until we actually have a fix
    let cancelled = false;
    const attempt = () => {
      if (cancelled) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => { if (!cancelled) handlePosition(pos); },
        (err) => {
          if (cancelled) return;
          handleError(err);
          retryRef.current = setTimeout(attempt, RETRY_MS);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      );
    };
    setLoading(true);
    attempt();
    return () => {
      cancelled = true;
      if (retryRef.current) {
        clearTimeout(retryRef.current);
        retryRef.current = null;
      }
    };
  }, [enabled, watch, handlePosition, handleError]);

  return { location, error, loading, hasFix, refresh };
}
