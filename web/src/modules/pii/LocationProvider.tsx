import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useLocation } from '../../hooks/useLocation';
import type { LatLng } from '../../types/api';

interface LocationConsentState {
  /** Whether the user has given consent for location tracking */
  consented: boolean;
  /** Grant consent — starts location access */
  grantConsent: () => void;
  /** Revoke consent — stops location access */
  revokeConsent: () => void;
  /** Current location (default fallback if no consent) */
  location: LatLng;
  /** Whether location is still loading */
  loading: boolean;
  /** Any geolocation error */
  error: string | null;
}

const CONSENT_KEY = 'donkeyride.location-consent';

const LocationConsentContext = createContext<LocationConsentState>({
  consented: false,
  grantConsent: () => {},
  revokeConsent: () => {},
  location: { lat: 51.5074, lng: -0.1278 },
  loading: false,
  error: null,
});

/**
 * Consent-gated location provider.
 * Wraps the useLocation hook behind an explicit consent step.
 * This is the operator's primary GDPR compliance mechanism for location data.
 */
export function LocationProvider({ children }: { children: ReactNode }) {
  const [consented, setConsented] = useState(() => {
    return localStorage.getItem(CONSENT_KEY) === 'true';
  });

  // Only activate geolocation when consent is granted
  const { location, loading, error } = useLocation(consented);

  const grantConsent = useCallback(() => {
    localStorage.setItem(CONSENT_KEY, 'true');
    setConsented(true);
  }, []);

  const revokeConsent = useCallback(() => {
    localStorage.removeItem(CONSENT_KEY);
    setConsented(false);
  }, []);

  return (
    <LocationConsentContext.Provider
      value={{ consented, grantConsent, revokeConsent, location, loading, error }}
    >
      {children}
    </LocationConsentContext.Provider>
  );
}

export function useLocationConsent() {
  return useContext(LocationConsentContext);
}
