import { useState, useEffect, useCallback } from 'react';
import type { LatLng } from '../types/api';

// Default: London
const DEFAULT_LOCATION: LatLng = { lat: 51.5074, lng: -0.1278 };

/**
 * Hook to get the user's current geolocation.
 * Falls back to London if geolocation unavailable.
 */
export function useLocation() {
  const [location, setLocation] = useState<LatLng>(DEFAULT_LOCATION);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      setLoading(false);
      return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setError(null);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { location, error, loading, refresh };
}
