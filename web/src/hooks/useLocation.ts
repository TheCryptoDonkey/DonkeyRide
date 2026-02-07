import { useState, useEffect, useCallback, useRef } from 'react';
import type { LatLng } from '../types/api';

// Default: London
const DEFAULT_LOCATION: LatLng = { lat: 51.5074, lng: -0.1278 };

/**
 * Hook to get the user's current geolocation.
 * Falls back to London if geolocation unavailable.
 *
 * @param watch - When true, uses watchPosition for continuous updates.
 */
export function useLocation(watch = false) {
  const [location, setLocation] = useState<LatLng>(DEFAULT_LOCATION);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const watchIdRef = useRef<number | null>(null);

  const handlePosition = useCallback((pos: GeolocationPosition) => {
    setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    setError(null);
    setLoading(false);
  }, []);

  const handleError = useCallback((err: GeolocationPositionError) => {
    setError(err.message);
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

    // One-shot mode
    refresh();
  }, [watch, handlePosition, handleError, refresh]);

  return { location, error, loading, refresh };
}
