import { useEffect, useRef, useState } from 'react';
import { showToast } from './common/Toast';
import type { LatLng } from '../types/api';

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
const RECENTS_KEY = 'donkeyride.recentPlaces';

interface RecentPlace { label: string; lat: number; lng: number }

function loadRecents(): RecentPlace[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveRecent(place: RecentPlace) {
  const recents = [place, ...loadRecents().filter((r) => r.label !== place.label)].slice(0, 5);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
}

export function AddressSearch({ placeholder, biasLocation, onSelect, autoFocus }: AddressSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PhotonFeature[]>([]);
  const [recents, setRecents] = useState<RecentPlace[]>([]);
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
        showToast('Address search failed. Tap the map to set the location instead.', { type: 'error' });
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

  const pickRecent = (place: RecentPlace) => {
    selectedRef.current = true;
    setQuery(place.label);
    setOpen(false);
    saveRecent(place);
    onSelect({ lat: place.lat, lng: place.lng }, place.label);
  };

  return (
    <div className="relative" ref={containerRef}>
      <input
        type="text"
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
            setOpen(true);
          }
        }}
      />
      {loading && (
        <div className="absolute right-3 top-3.5 animate-spin h-4 w-4 border-2 border-donkey-blue border-t-transparent rounded-full" />
      )}
      {open && results.length === 0 && recents.length > 0 && query.trim().length < 3 && (
        <ul className="absolute left-0 right-0 mt-1 bg-donkey-surface border border-donkey-border rounded-lg shadow-panel overflow-hidden">
          <li className="px-4 py-2 text-xs uppercase tracking-wider text-donkey-muted border-b border-donkey-border/50">Recent</li>
          {recents.map((place) => (
            <li key={place.label}>
              <button
                className="w-full text-left px-4 py-3 text-sm hover:bg-donkey-card border-b border-donkey-border/50 last:border-0"
                onClick={() => pickRecent(place)}
              >
                {place.label}
              </button>
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
