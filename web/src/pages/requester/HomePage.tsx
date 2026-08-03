import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView } from '../../components/map/MapView';
import { LocationMarker } from '../../components/map/LocationMarker';
import { useLocation } from '../../hooks/useLocation';
import { useTask } from '../../context/TaskContext';
import { useDomain } from '../../context/DomainContext';
import { getAvailableProviders } from '../../services/api';
import { AddressSearch } from '../../components/AddressSearch';
import { reverseGeocode } from '../../utils/reverse-geocode';
import { useT } from '../../i18n';
import type { AvailableProvider } from '../../types/api';
import type { LatLng } from '../../types/api';

export function HomePage() {
  const navigate = useNavigate();
  const { t, td } = useT();
  const { location, error: locationError, loading: locationLoading, refresh } = useLocation();
  const { setOrigin, setDestination, activeTask } = useTask();
  const { profile } = useDomain();
  const [providers, setProviders] = useState<AvailableProvider[]>([]);
  const [pickup, setPickup] = useState<LatLng | null>(null);
  const [pickupLabel, setPickupLabel] = useState<string | null>(null);
  // True while the rider is deliberately re-choosing the pickup: map taps
  // set the pickup instead of the destination.
  const [editingPickup, setEditingPickup] = useState(false);

  const requiresDestination = profile?.features.requiresDestination !== false;
  // A GPS fix we can trust — useLocation falls back to London, which must
  // never become somebody's pickup by default
  const hasFix = !locationLoading && !locationError;

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

  // Set when the rider named a destination before we had a pickup (GPS
  // denied or still resolving) — the moment they set one, we continue.
  const awaitingPickupRef = useRef(false);

  /** Set the pickup and name it (address lookups are best-effort) */
  const choosePickup = useCallback((loc: LatLng, label?: string) => {
    setPickup(loc);
    setOrigin(loc);
    setPickupLabel(label ?? null);
    if (label === undefined) {
      void reverseGeocode(loc).then((named) => {
        if (named) setPickupLabel(named);
      });
    }
    if (awaitingPickupRef.current) {
      awaitingPickupRef.current = false;
      navigate('/request/new');
    }
  }, [setOrigin, navigate]);

  /** Destination chosen — the last answer we need, unless the pickup is unknown */
  const chooseDestination = useCallback((loc: LatLng) => {
    setDestination(loc);
    if (pickup) {
      navigate('/request/new');
      return;
    }
    // No usable fix: ask for the pickup rather than bouncing them back
    awaitingPickupRef.current = true;
    setEditingPickup(true);
  }, [pickup, setDestination, navigate]);

  // Where you are IS the pickup, until you say otherwise. This is the
  // whole point: nobody should have to search for the spot they are
  // standing on.
  const autoPickedRef = useRef(false);
  useEffect(() => {
    if (autoPickedRef.current || !hasFix || pickup) return;
    autoPickedRef.current = true;
    choosePickup(location);
  }, [hasFix, location, pickup, choosePickup]);

  const handleMapClick = useCallback((e: { latlng: { lat: number; lng: number } }) => {
    const loc = { lat: e.latlng.lat, lng: e.latlng.lng };
    if (editingPickup || !pickup) {
      choosePickup(loc);
      setEditingPickup(false);
    } else if (requiresDestination) {
      chooseDestination(loc);
    }
  }, [editingPickup, pickup, choosePickup, chooseDestination, requiresDestination]);

  const providerLabel = td(profile?.roles.provider || 'provider');
  const originLabel = td(profile?.labels?.originLabel || 'Pickup');
  const taskNoun = td(profile?.labels?.taskNoun || 'ride');
  // Pluralised provider label ("drivers" → "madereva") for counts
  const providersLabel = (n: number) =>
    n === 1 ? providerLabel : td(`${profile?.roles.provider || 'provider'}s`);

  const pickupText = pickupLabel
    || (pickup ? `${pickup.lat.toFixed(4)}, ${pickup.lng.toFixed(4)}` : null);

  return (
    <div className="h-full flex flex-col">
      {/* Map section */}
      {profile?.features.navigation !== false ? (
        <div className="flex-1 relative">
          <MapView centre={pickup || location} zoom={pickup ? 15 : 13}>
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

            {/* Pickup pin — drag it to nudge the meeting point */}
            {pickup && (
              <LocationMarker
                position={pickup}
                label={originLabel}
                colour="orange"
                draggable
                onDragEnd={(loc) => choosePickup(loc)}
              />
            )}

            {/* Click handler */}
            <MapClickHandler onClick={handleMapClick} />
          </MapView>

          {/* Pickup search only appears while re-choosing it — sits above
              Leaflet's panes (z-index ≥ 1000) */}
          {editingPickup && (
            <div className="absolute top-3 left-3 right-3 z-[1100]">
              <AddressSearch
                placeholder={t('home.searchOrigin', { label: originLabel })}
                biasLocation={pickup || location}
                autoFocus
                onSelect={(loc, label) => {
                  choosePickup(loc, label);
                  setEditingPickup(false);
                }}
              />
            </div>
          )}
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

      {/* Booking panel — pickup is already answered, destination is the ask */}
      <div className="bg-donkey-surface border-t-2 border-donkey-border p-5 shadow-panel">
        {/* Pickup row */}
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-2 h-2 rounded-full shrink-0 ${pickup ? 'glow-green' : 'glow-orange'}`} />
          <div className="flex-1 min-w-0">
            <p className="meta-label">{originLabel}</p>
            <p className="text-sm text-donkey-text font-semibold truncate">
              {pickupText
                ? (pickupLabel && pickup && hasFix && sameSpot(pickup, location)
                  ? `${t('home.currentLocation')} · ${pickupLabel}`
                  : pickupText)
                : locationLoading
                  ? t('home.locating')
                  : t('home.noFix', { label: originLabel.toLowerCase() })}
            </p>
          </div>
          <button
            className="text-xs text-donkey-blue font-semibold underline min-h-[44px] px-1 shrink-0"
            onClick={() => setEditingPickup((v) => !v)}
          >
            {editingPickup ? t('common.cancel') : t('home.change')}
          </button>
        </div>

        {editingPickup && (
          <div className="mb-3">
            <p className="text-xs text-donkey-muted mb-2">
              {t('home.movePickup', { label: originLabel.toLowerCase() })}
            </p>
            <button
              className="btn-secondary w-full text-sm"
              onClick={() => {
                refresh();
                if (hasFix) choosePickup(location);
                setEditingPickup(false);
              }}
            >
              {t('home.useMyLocation')}
            </button>
          </div>
        )}

        {/* Destination — the one thing the rider actually has to answer */}
        {requiresDestination ? (
          <>
            <AddressSearch
              placeholder={t('home.whereTo')}
              biasLocation={pickup || location}
              onSelect={(loc) => chooseDestination(loc)}
            />
            <p className="text-xs text-donkey-muted mt-2">
              {t('home.selectDestination')}
            </p>
          </>
        ) : (
          pickup && (
            <button
              className="btn-primary w-full"
              onClick={() => navigate('/request/new')}
            >
              {t('home.confirm', { label: originLabel })}
            </button>
          )
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

/** Within ~11 m — close enough to call it "where you are" */
function sameSpot(a: LatLng, b: LatLng): boolean {
  return Math.abs(a.lat - b.lat) < 1e-4 && Math.abs(a.lng - b.lng) < 1e-4;
}

// Helper component to capture map click events
import { useMapEvents } from 'react-leaflet';

function MapClickHandler({ onClick }: { onClick: (e: { latlng: { lat: number; lng: number } }) => void }) {
  useMapEvents({
    click: onClick,
  });
  return null;
}
