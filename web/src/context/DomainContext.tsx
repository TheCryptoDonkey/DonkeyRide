import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { DomainProfile } from '../types/domain';
import { getCurrentDomain, getDomain, listDomains } from '../services/api';
import { normaliseRgbTriplet, readableOnLight } from '../utils/theme';

const STORAGE_KEY = 'donkeyride-domain';

interface DomainState {
  profile: DomainProfile | null;
  loading: boolean;
  error: string | null;
  availableDomains: Array<{
    id: string;
    name: string;
    emoji: string;
    operational?: boolean;
    unavailableReason?: string | null;
  }>;
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

    // Profiles publish channels comma-separated ('178, 76, 243'), which is a
    // parse error once Tailwind appends `/ <alpha>` — normalise rather than
    // require every operator to reformat their own profile. A malformed
    // triplet is left alone so the stylesheet default stands.
    const setRgb = (name: string, value: string) => {
      const rgb = normaliseRgbTriplet(value);
      if (!rgb) return;
      root.setProperty(`--theme-${name}-rgb`, rgb);
      const onLight = readableOnLight(rgb);
      if (onLight) root.setProperty(`--theme-${name}-on-light-rgb`, onLight);
    };

    root.setProperty('--theme-primary', profile.theme.primary);
    setRgb('primary', profile.theme.primaryRgb);
    root.setProperty('--theme-secondary', profile.theme.secondary);
    setRgb('secondary', profile.theme.secondaryRgb);
    root.setProperty('--theme-accent', profile.theme.accent);
    setRgb('accent', profile.theme.accentRgb);
    root.setProperty('--theme-gradient-from', profile.theme.gradientFrom);
    root.setProperty('--theme-gradient-to', profile.theme.gradientTo);
    root.setProperty('--theme-gradient-angle', profile.theme.gradientAngle);
    root.setProperty('--theme-route-colour', profile.theme.routeColour);
  }

  const emoji = profile.theme?.emoji;
  document.title = emoji
    ? `${emoji} DonkeyRide | ${profile.name}`
    : `DonkeyRide | ${profile.name}`;
}

export function DomainProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<DomainProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableDomains, setAvailableDomains] = useState<DomainState['availableDomains']>([]);

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
