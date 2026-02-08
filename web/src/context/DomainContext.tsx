import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { DomainProfile } from '../types/domain';
import { getCurrentDomain, getDomain, listDomains } from '../services/api';

const STORAGE_KEY = 'donkeyride-domain';

interface DomainState {
  profile: DomainProfile | null;
  loading: boolean;
  error: string | null;
  availableDomains: Array<{ id: string; name: string; emoji: string }>;
  switchDomain: (domainId: string) => void;
}

const DomainContext = createContext<DomainState>({
  profile: null,
  loading: true,
  error: null,
  availableDomains: [],
  switchDomain: () => {},
});

/** Apply a domain profile's theme as CSS custom properties on :root */
function applyTheme(profile: DomainProfile) {
  if (profile.theme) {
    const root = document.documentElement.style;
    root.setProperty('--theme-primary', profile.theme.primary);
    root.setProperty('--theme-primary-rgb', profile.theme.primaryRgb);
    root.setProperty('--theme-secondary', profile.theme.secondary);
    root.setProperty('--theme-secondary-rgb', profile.theme.secondaryRgb);
    root.setProperty('--theme-accent', profile.theme.accent);
    root.setProperty('--theme-accent-rgb', profile.theme.accentRgb);
    root.setProperty('--theme-gradient-from', profile.theme.gradientFrom);
    root.setProperty('--theme-gradient-to', profile.theme.gradientTo);
    root.setProperty('--theme-gradient-angle', profile.theme.gradientAngle);
    root.setProperty('--theme-route-colour', profile.theme.routeColour);
  }

  const emoji = profile.theme?.emoji;
  document.title = emoji
    ? `${emoji} DonkeyRide — ${profile.name}`
    : `DonkeyRide — ${profile.name}`;
}

export function DomainProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<DomainProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableDomains, setAvailableDomains] = useState<Array<{ id: string; name: string; emoji: string }>>([]);

  // Fetch the domain list on mount
  useEffect(() => {
    listDomains()
      .then(data => setAvailableDomains(data.available))
      .catch(() => {}); // Non-critical — picker just won't show options
  }, []);

  // Fetch initial domain profile (from localStorage or server default)
  useEffect(() => {
    const savedDomain = localStorage.getItem(STORAGE_KEY);
    const fetchProfile = savedDomain
      ? getDomain(savedDomain).catch(() => getCurrentDomain()) // Fall back to server default if saved domain fails
      : getCurrentDomain();

    fetchProfile
      .then(p => {
        applyTheme(p);
        setProfile(p);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const switchDomain = useCallback((domainId: string) => {
    if (profile?.id === domainId) return;
    setLoading(true);
    setError(null);

    getDomain(domainId)
      .then(p => {
        applyTheme(p);
        setProfile(p);
        localStorage.setItem(STORAGE_KEY, domainId);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [profile?.id]);

  return (
    <DomainContext.Provider value={{ profile, loading, error, availableDomains, switchDomain }}>
      {children}
    </DomainContext.Provider>
  );
}

export function useDomain(): DomainState {
  return useContext(DomainContext);
}
