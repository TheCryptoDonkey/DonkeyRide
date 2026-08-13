import { useEffect, useRef, useState } from 'react';
import { showToast } from './common/Toast';
import { useT } from '../i18n';
import type { LatLng } from '../types/api';
import {
  loadRecents,
  saveRecent,
  loadSavedPlaces,
  savePlace,
  removeSavedPlace,
  suggestPlaceName,
  type Place,
  type SavedPlace,
} from '../utils/places';

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    postcode?: string;
    country?: string;
  };
}

interface AddressSearchProps {
  name: string;
  placeholder: string;
  biasLocation?: LatLng | null;
  onSelect: (location: LatLng, label: string) => void;
  autoFocus?: boolean;
}

function formatLabel(p: PhotonFeature['properties']): string {
  const street = [p.street, p.housenumber].filter(Boolean).join(' ');
  return [p.name, street !== p.name ? street : null, p.city, p.postcode]
    .filter(Boolean)
    .join(', ');
}

/**
 * Debounced address search backed by Photon (komoot) — free, no API key,
 * OpenStreetMap data. Falls back gracefully: tapping the map still works.
 */
export function AddressSearch({ name, placeholder, biasLocation, onSelect, autoFocus }: AddressSearchProps) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PhotonFeature[]>([]);
  const [recents, setRecents] = useState<Place[]>([]);
  const [saved, setSaved] = useState<SavedPlace[]>([]);
  const [pinning, setPinning] = useState<Place | null>(null);
  const [pinName, setPinName] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside tap
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (selectedRef.current) {
      selectedRef.current = false;
      return;
    }
    if (query.trim().length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const bias = biasLocation ? `&lat=${biasLocation.lat}&lon=${biasLocation.lng}` : '';
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5${bias}`
        );
        const data = await res.json();
        setResults(data.features || []);
        setOpen(true);
      } catch {
        setResults([]);
        showToast(t('search.failed'), { type: 'error' });
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, biasLocation]);

  const pick = (feature: PhotonFeature) => {
    const [lng, lat] = feature.geometry.coordinates;
    const label = formatLabel(feature.properties);
    selectedRef.current = true;
    setQuery(label);
    setOpen(false);
    setResults([]);
    saveRecent({ label, lat, lng });
    onSelect({ lat, lng }, label);
  };

  const pickPlace = (place: Place) => {
    selectedRef.current = true;
    setQuery(place.label);
    setOpen(false);
    setPinning(null);
    saveRecent({ label: place.label, lat: place.lat, lng: place.lng });
    onSelect({ lat: place.lat, lng: place.lng }, place.label);
  };

  const startPinning = (place: Place) => {
    setPinning(place);
    setPinName(suggestPlaceName() || place.label.split(',')[0]);
  };

  const confirmPin = () => {
    if (!pinning) return;
    const updated = savePlace(pinName, pinning);
    if (updated) {
      setSaved(updated);
      setPinning(null);
    } else {
      showToast(t('search.saveFailed'), { type: 'error' });
    }
  };

  const unpin = (name: string) => {
    setSaved(removeSavedPlace(name));
  };

  return (
    <div className="relative" ref={containerRef}>
      <input
        type="text"
        name={name}
        className="w-full bg-donkey-surface/95 backdrop-blur border border-donkey-border rounded-lg px-4 py-3 text-sm shadow-panel focus:outline-none focus:border-donkey-blue"
        placeholder={placeholder}
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        onFocus={() => {
          if (results.length > 0) {
            setOpen(true);
          } else if (query.trim().length < 3) {
            setRecents(loadRecents());
            setSaved(loadSavedPlaces());
            setOpen(true);
          }
        }}
      />
      {loading && (
        <div className="absolute right-3 top-3.5 animate-spin motion-reduce:animate-none h-4 w-4 border-2 border-donkey-blue border-t-transparent rounded-full" />
      )}
      {open && results.length === 0 && (saved.length > 0 || recents.length > 0) && query.trim().length < 3 && (
        <ul className="absolute left-0 right-0 mt-1 bg-donkey-surface border border-donkey-border rounded-lg shadow-panel overflow-hidden max-h-72 overflow-y-auto">
          {saved.map((place) => (
            <li key={`saved-${place.name}`} className="flex items-stretch border-b border-donkey-border/50">
              <button
                className="flex-1 text-left px-4 py-3 text-sm hover:bg-donkey-card min-w-0"
                onClick={() => pickPlace(place)}
              >
                <span className="font-semibold text-donkey-text">
                  {place.name.toLowerCase() === 'home' ? '🏠 ' : place.name.toLowerCase() === 'work' ? '💼 ' : '⭐ '}
                  {place.name}
                </span>
                <span className="block text-xs text-donkey-muted truncate">{place.label}</span>
              </button>
              <button
                className="px-3 text-donkey-muted hover:text-donkey-text"
                aria-label={`Remove saved place ${place.name}`}
                onClick={() => unpin(place.name)}
              >
                ✕
              </button>
            </li>
          ))}
          {recents.length > 0 && (
            <li className="px-4 py-2 text-xs uppercase tracking-wider text-donkey-muted border-b border-donkey-border/50">{t('common.recent')}</li>
          )}
          {recents.map((place) => (
            <li key={place.label} className="border-b border-donkey-border/50 last:border-0">
              {pinning?.label === place.label ? (
                <div className="flex items-center gap-2 px-4 py-2">
                  <input
                    type="text"
                    name="saved-place-name"
                    className="flex-1 bg-donkey-card border border-donkey-border rounded px-2 py-1.5 text-sm min-w-0"
                    value={pinName}
                    autoFocus
                    maxLength={30}
                    placeholder={t('search.placeName')}
                    onChange={(e) => setPinName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmPin(); }}
                  />
                  <button className="text-sm text-donkey-green font-semibold" onClick={confirmPin}>{t('common.save')}</button>
                  <button className="text-sm text-donkey-muted" onClick={() => setPinning(null)}>{t('common.cancel')}</button>
                </div>
              ) : (
                <div className="flex items-stretch">
                  <button
                    className="flex-1 text-left px-4 py-3 text-sm hover:bg-donkey-card min-w-0 truncate"
                    onClick={() => pickPlace(place)}
                  >
                    {place.label}
                  </button>
                  {!saved.some((s) => s.label === place.label) && (
                    <button
                      className="px-3 text-donkey-muted hover:text-donkey-orange"
                      aria-label={`Save ${place.label}`}
                      title="Save this place"
                      onClick={() => startPinning(place)}
                    >
                      ☆
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {open && results.length > 0 && (
        <ul className="absolute left-0 right-0 mt-1 bg-donkey-surface border border-donkey-border rounded-lg shadow-panel overflow-hidden">
          {results.map((feature, i) => (
            <li key={i}>
              <button
                className="w-full text-left px-4 py-3 text-sm hover:bg-donkey-card border-b border-donkey-border/50 last:border-0"
                onClick={() => pick(feature)}
              >
                {formatLabel(feature.properties)}
                {feature.properties.country && (
                  <span className="text-donkey-muted"> · {feature.properties.country}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
