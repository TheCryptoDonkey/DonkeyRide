import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView } from '../../components/map/MapView';
import { LocationMarker } from '../../components/map/LocationMarker';
import { useLocation } from '../../hooks/useLocation';
import { useTask } from '../../context/TaskContext';
import { useDomain } from '../../context/DomainContext';
import { getAvailableProviders } from '../../services/api';
import { AddressSearch } from '../../components/AddressSearch';
import { useT } from '../../i18n';
import type { AvailableProvider } from '../../types/api';
import type { LatLng } from '../../types/api';

export function HomePage() {
  const navigate = useNavigate();
  const { t, td, locale } = useT();
  const { location } = useLocation();
  const { setOrigin, setDestination, activeTask } = useTask();
  const { profile } = useDomain();
  const [providers, setProviders] = useState<AvailableProvider[]>([]);
  const [clickMode, setClickMode] = useState<'origin' | 'destination'>('origin');
  const [originSet, setOriginSet] = useState(false);
  const [selectedOrigin, setSelectedOrigin] = useState<LatLng | null>(null);

  const requiresDestination = profile?.features.requiresDestination !== false;

  // A live task (including one rehydrated after a restart) resumes here
  useEffect(() => {
    if (activeTask && profile && !profile.states.terminal.includes(activeTask.status)) {
      navigate('/request/active');
    }
  }, [activeTask, profile, navigate]);

  // Fetch available providers
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const { drivers: d } = await getAvailableProviders({
          lat: location.lat,
          lng: location.lng,
          radiusKm: 10,
        });
        setProviders(d);
      } catch {
        // Silently fail — providers are optional on this screen
      }
    };
    fetchProviders();
    const timer = setInterval(fetchProviders, 15000);
    return () => clearInterval(timer);
  }, [location.lat, location.lng]);

  const handleMapClick = useCallback((e: { latlng: { lat: number; lng: number } }) => {
    const loc = { lat: e.latlng.lat, lng: e.latlng.lng };
    if (clickMode === 'origin') {
      setOrigin(loc);
      setSelectedOrigin(loc);
      setOriginSet(true);
      if (requiresDestination) {
        setClickMode('destination');
      }
    } else {
      setDestination(loc);
      navigate('/request/new');
    }
  }, [clickMode, setOrigin, setDestination, navigate, requiresDestination]);

  const handleConfirmSingleLocation = () => {
    navigate('/request/new');
  };

  const providerLabel = td(profile?.roles.provider || 'provider');
  const originLabel = td(profile?.labels?.originLabel || 'Pickup');
  const taskNoun = td(profile?.labels?.taskNoun || 'ride');
  // Pluralised provider label ("drivers" → "madereva") for counts
  const providersLabel = (n: number) =>
    n === 1 ? providerLabel : td(`${profile?.roles.provider || 'provider'}s`);

  return (
    <div className="h-full flex flex-col">
      {/* Map section */}
      {profile?.features.navigation !== false ? (
        <div className="flex-1 relative">
          <MapView centre={selectedOrigin || location}>
            {/* Available providers */}
            {providers.map((d) => (
              <LocationMarker
                key={d.pubkey}
                position={d.location}
                label={d.rating != null ? `${providerLabel} (${d.rating.toFixed(1)})` : providerLabel}
                colour="blue"
              />
            ))}

            {/* User location */}
            <LocationMarker position={location} label={t('common.you')} colour="green" />

            {/* Origin marker */}
            {selectedOrigin && originSet && (
              <LocationMarker position={selectedOrigin} label={originLabel} colour="orange" />
            )}

            {/* Click handler */}
            <MapClickHandler onClick={handleMapClick} />
          </MapView>

          {/* Address search — sits above Leaflet's panes (z-index ≥ 1000) */}
          <div className="absolute top-3 left-3 right-3 z-[1100] space-y-2">
            <AddressSearch
              placeholder={t('home.searchOrigin', { label: originLabel })}
              biasLocation={location}
              onSelect={(loc) => {
                setOrigin(loc);
                setSelectedOrigin(loc);
                setOriginSet(true);
                if (requiresDestination) {
                  setClickMode('destination');
                }
              }}
            />
            {requiresDestination && originSet && (
              <AddressSearch
                placeholder={t('home.searchDestination')}
                biasLocation={selectedOrigin || location}
                autoFocus
                onSelect={(loc) => {
                  setDestination(loc);
                  navigate('/request/new');
                }}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-donkey-bg">
          <div className="card text-center max-w-sm">
            <p className="text-lg font-bold text-donkey-text mb-2">
              {providers.length > 0
                ? t('home.available', { n: providers.length, label: providersLabel(providers.length) })
                : t('home.searching', { label: providersLabel(2) })}
            </p>
            <p className="text-sm text-donkey-muted">
              {t('home.locationLater', { noun: taskNoun })}
            </p>
          </div>
        </div>
      )}

      {/* Instruction panel — solid bottom section, outside Leaflet's stacking context */}
      <div className="bg-donkey-surface border-t-2 border-donkey-border p-5 shadow-panel">
        {/* Step indicator */}
        {requiresDestination && (
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-2 h-2 rounded-full ${originSet ? 'glow-green' : 'glow-orange'}`} />
            <span className="text-xs uppercase tracking-wider text-donkey-muted">
              {t('home.step', { n: originSet ? 2 : 1 })}
            </span>
          </div>
        )}

        <p className="text-sm text-donkey-text font-semibold mb-1">
          {clickMode === 'origin'
            ? ((locale === 'en' && profile?.labels?.originInstruction)
              || t('home.tapOrigin', { label: originLabel.toLowerCase() }))
            : ((locale === 'en' && profile?.labels?.destinationInstruction)
              || t('home.tapDestination'))}
        </p>

        <p className="text-xs text-donkey-muted mb-3">
          {clickMode === 'origin'
            ? t('home.selectStart', { noun: taskNoun })
            : t('home.selectDestination')}
        </p>

        {/* Single-location domain: show confirm button after origin is set */}
        {!requiresDestination && originSet && (
          <button
            className="btn-primary w-full mb-2"
            onClick={handleConfirmSingleLocation}
          >
            {t('home.confirm', { label: originLabel })}
          </button>
        )}

        {originSet && (requiresDestination ? clickMode === 'destination' : true) && (
          <button
            className="text-xs text-donkey-purple underline w-full text-center min-h-[44px]"
            onClick={() => { setClickMode('origin'); setOriginSet(false); setOrigin(null); setSelectedOrigin(null); }}
          >
            {t('home.reset', { label: originLabel.toLowerCase() })}
          </button>
        )}

        {providers.length > 0 && (
          <p className="text-xs text-donkey-muted text-center mt-3">
            {t('home.nearby', { n: providers.length, label: providersLabel(providers.length) })}
          </p>
        )}

        <div className="flex items-center justify-center gap-4 mt-2">
          <button
            className="text-xs text-donkey-muted underline min-h-[44px]"
            onClick={() => navigate('/request/history')}
          >
            {t('home.pastTasks', { noun: taskNoun })}
          </button>
          <a
            className="text-xs text-donkey-muted underline min-h-[44px] inline-flex items-center"
            href="/manual.html"
          >
            {t('home.howItWorks')}
          </a>
        </div>
      </div>
    </div>
  );
}

// Helper component to capture map click events
import { useMapEvents } from 'react-leaflet';

function MapClickHandler({ onClick }: { onClick: (e: { latlng: { lat: number; lng: number } }) => void }) {
  useMapEvents({
    click: onClick,
  });
  return null;
}
