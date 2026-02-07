import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView } from '../../components/map/MapView';
import { LocationMarker } from '../../components/map/LocationMarker';
import { useLocation } from '../../hooks/useLocation';
import { useTask } from '../../context/TaskContext';
import { useDomain } from '../../context/DomainContext';
import { getAvailableProviders } from '../../services/api';
import type { AvailableProvider } from '../../types/api';
import type { LatLng } from '../../types/api';

export function HomePage() {
  const navigate = useNavigate();
  const { location } = useLocation();
  const { setOrigin, setDestination } = useTask();
  const { profile } = useDomain();
  const [providers, setProviders] = useState<AvailableProvider[]>([]);
  const [clickMode, setClickMode] = useState<'origin' | 'destination'>('origin');
  const [originSet, setOriginSet] = useState(false);
  const [selectedOrigin, setSelectedOrigin] = useState<LatLng | null>(null);

  const requiresDestination = profile?.features.requiresDestination !== false;

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

  const providerLabel = profile?.roles.provider || 'provider';
  const originLabel = profile?.labels?.originLabel || 'Pickup';
  const taskNoun = profile?.labels?.taskNoun || 'ride';

  return (
    <div className="h-full relative">
      <MapView centre={location}>
        {/* Available providers */}
        {providers.map((d) => (
          <LocationMarker
            key={d.pubkey}
            position={d.location}
            label={`${providerLabel} (${d.rating?.toFixed(1) || '?'})`}
            colour="blue"
          />
        ))}

        {/* User location */}
        <LocationMarker position={location} label="You" colour="green" />

        {/* Origin marker */}
        {selectedOrigin && originSet && (
          <LocationMarker position={selectedOrigin} label={originLabel} colour="orange" />
        )}

        {/* Click handler */}
        <MapClickHandler onClick={handleMapClick} />
      </MapView>

      {/* Floating instruction panel */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-full max-w-md px-4">
        <div className="card backdrop-blur-sm" style={{ background: 'rgba(26, 26, 46, 0.92)' }}>
          {/* Step indicator */}
          {requiresDestination && (
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2 h-2 rounded-full ${originSet ? 'glow-green' : 'glow-orange'}`} />
              <span className="text-xs uppercase tracking-wider text-donkey-muted">
                Step {originSet ? '2' : '1'} of 2
              </span>
            </div>
          )}

          <p className="text-sm text-donkey-text font-semibold mb-1">
            {clickMode === 'origin'
              ? (profile?.labels?.originInstruction || `Tap the map to set your ${originLabel.toLowerCase()}`)
              : (profile?.labels?.destinationInstruction || 'Now tap to set your destination')}
          </p>

          <p className="text-xs text-donkey-muted mb-3">
            {clickMode === 'origin'
              ? `Select where you want your ${taskNoun} to start`
              : 'Select your destination to get a fare estimate'}
          </p>

          {/* Single-location domain: show confirm button after origin is set */}
          {!requiresDestination && originSet && (
            <button
              className="btn-primary w-full mb-2"
              onClick={handleConfirmSingleLocation}
            >
              Confirm {originLabel}
            </button>
          )}

          {originSet && (requiresDestination ? clickMode === 'destination' : true) && (
            <button
              className="text-xs text-donkey-purple underline w-full text-center"
              onClick={() => { setClickMode('origin'); setOriginSet(false); setOrigin(null); setSelectedOrigin(null); }}
            >
              Reset {originLabel.toLowerCase()}
            </button>
          )}

          {providers.length > 0 && (
            <p className="text-xs text-donkey-muted text-center mt-3">
              <span className="text-donkey-green font-bold">{providers.length}</span> {providerLabel}{providers.length !== 1 ? 's' : ''} nearby
            </p>
          )}
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
