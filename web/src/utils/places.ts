/**
 * In-memory place helpers — recents and pinned places for this app session.
 * Exact home/work coordinates are deliberately not written to Web Storage.
 */

export interface Place {
  label: string;
  lat: number;
  lng: number;
}

/** A pinned place: a Place plus the rider's own name for it ("Home"). */
export interface SavedPlace extends Place {
  name: string;
}

const RECENTS_KEY = 'donkeyride.recentPlaces';
const SAVED_KEY = 'donkeyride.savedPlaces';
const MAX_RECENTS = 5;
const MAX_SAVED = 6;
let recentPlaces: Place[] = [];
let savedPlaces: SavedPlace[] = [];

function purgeLegacyStorage(): void {
  try {
    localStorage.removeItem(RECENTS_KEY);
    localStorage.removeItem(SAVED_KEY);
  } catch {
    // Storage may be disabled; memory-only behaviour is unaffected.
  }
}

export function loadRecents(): Place[] {
  purgeLegacyStorage();
  return [...recentPlaces];
}

export function saveRecent(place: Place): void {
  recentPlaces = [place, ...recentPlaces.filter((r) => r.label !== place.label)].slice(0, MAX_RECENTS);
}

export function loadSavedPlaces(): SavedPlace[] {
  purgeLegacyStorage();
  return [...savedPlaces];
}

/**
 * Pin a place under a name. A name is unique — saving "Home" again moves
 * Home. Returns the updated list, or null when the name is blank or the
 * pin limit is reached.
 */
export function savePlace(name: string, place: Place): SavedPlace[] | null {
  const trimmed = name.trim().slice(0, 30);
  if (!trimmed) return null;
  const existing = savedPlaces.filter((s) => s.name.toLowerCase() !== trimmed.toLowerCase());
  if (existing.length >= MAX_SAVED) return null;
  const updated = [...existing, { name: trimmed, label: place.label, lat: place.lat, lng: place.lng }];
  savedPlaces = updated;
  return updated;
}

export function removeSavedPlace(name: string): SavedPlace[] {
  const updated = savedPlaces.filter((s) => s.name !== name);
  savedPlaces = updated;
  return updated;
}

/** The next unclaimed conventional name, to pre-fill the pin input. */
export function suggestPlaceName(): string {
  const taken = new Set(loadSavedPlaces().map((s) => s.name.toLowerCase()));
  if (!taken.has('home')) return 'Home';
  if (!taken.has('work')) return 'Work';
  return '';
}

export function clearPlaces(): void {
  recentPlaces = [];
  savedPlaces = [];
  purgeLegacyStorage();
}
