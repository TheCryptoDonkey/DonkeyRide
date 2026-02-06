import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView } from '../../components/map/MapView';
import { LocationMarker } from '../../components/map/LocationMarker';
import { useLocation } from '../../hooks/useLocation';
import { useTask } from '../../context/TaskContext';
import { useDomain } from '../../context/DomainContext';
import { getAvailableDrivers } from '../../services/api';
import type { AvailableDriver } from '../../types/api';

export function HomePage() {
  const navigate = useNavigate();
  const { location } = useLocation();
  const { setPickup, setDropoff } = useTask();
  const { profile } = useDomain();
  const [drivers, setDrivers] = useState<AvailableDriver[]>([]);
  const [clickMode, setClickMode] = useState<'pickup' | 'dropoff'>('pickup');
  const [pickupSet, setPickupSet] = useState(false);

  // Fetch available drivers
  useEffect(() => {
    const fetchDrivers = async () => {
      try {
        const { drivers: d } = await getAvailableDrivers({
          lat: location.lat,
          lng: location.lng,
          radiusKm: 10,
        });
        setDrivers(d);
      } catch {
        // Silently fail — drivers are optional on this screen
      }
    };
    fetchDrivers();
    const timer = setInterval(fetchDrivers, 15000);
    return () => clearInterval(timer);
  }, [location.lat, location.lng]);

  const handleMapClick = useCallback((e: { latlng: { lat: number; lng: number } }) => {
    const loc = { lat: e.latlng.lat, lng: e.latlng.lng };
    if (clickMode === 'pickup') {
      setPickup(loc);
      setPickupSet(true);
      setClickMode('dropoff');
    } else {
      setDropoff(loc);
      navigate('/ride/request');
    }
  }, [clickMode, setPickup, setDropoff, navigate]);

  const providerLabel = profile?.roles.provider || 'driver';

  return (
    <div className="h-full relative">
      <MapView centre={location}>
        {/* Available drivers */}
        {drivers.map((d) => (
          <LocationMarker
            key={d.pubkey}
            position={d.location}
            label={`${providerLabel} (${d.rating?.toFixed(1) || '?'})`}
            colour="blue"
          />
        ))}

        {/* User location */}
        <LocationMarker position={location} label="You" colour="green" />

        {/* Click handler — we add a custom component */}
        <MapClickHandler onClick={handleMapClick} />
      </MapView>

      {/* Floating instruction panel */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-full max-w-md px-4">
        <div className="card backdrop-blur-sm bg-donkey-surface/95">
          <p className="text-center text-sm text-donkey-muted mb-3">
            {clickMode === 'pickup'
              ? 'Tap the map to set your pickup location'
              : 'Now tap to set your destination'}
          </p>

          {pickupSet && clickMode === 'dropoff' && (
            <button
              className="text-xs text-donkey-purple underline w-full text-center"
              onClick={() => { setClickMode('pickup'); setPickupSet(false); setPickup(null); }}
            >
              Reset pickup
            </button>
          )}

          {drivers.length > 0 && (
            <p className="text-xs text-donkey-muted text-center mt-2">
              {drivers.length} {providerLabel}{drivers.length !== 1 ? 's' : ''} nearby
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
