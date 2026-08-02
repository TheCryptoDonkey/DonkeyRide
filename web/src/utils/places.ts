/**
 * Device-local place storage — recents and pinned saved places (Home, Work…).
 * Like everything else about the rider, this never leaves the phone: the
 * operator has no notion of a saved place.
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

function readList<T>(key: string): T[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadRecents(): Place[] {
  return readList<Place>(RECENTS_KEY);
}

export function saveRecent(place: Place): void {
  const recents = [place, ...loadRecents().filter((r) => r.label !== place.label)].slice(0, MAX_RECENTS);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
}

export function loadSavedPlaces(): SavedPlace[] {
  return readList<SavedPlace>(SAVED_KEY);
}

/**
 * Pin a place under a name. A name is unique — saving "Home" again moves
 * Home. Returns the updated list, or null when the name is blank or the
 * pin limit is reached.
 */
export function savePlace(name: string, place: Place): SavedPlace[] | null {
  const trimmed = name.trim().slice(0, 30);
  if (!trimmed) return null;
  const existing = loadSavedPlaces().filter((s) => s.name.toLowerCase() !== trimmed.toLowerCase());
  if (existing.length >= MAX_SAVED) return null;
  const updated = [...existing, { name: trimmed, label: place.label, lat: place.lat, lng: place.lng }];
  localStorage.setItem(SAVED_KEY, JSON.stringify(updated));
  return updated;
}

export function removeSavedPlace(name: string): SavedPlace[] {
  const updated = loadSavedPlaces().filter((s) => s.name !== name);
  localStorage.setItem(SAVED_KEY, JSON.stringify(updated));
  return updated;
}

/** The next unclaimed conventional name, to pre-fill the pin input. */
export function suggestPlaceName(): string {
  const taken = new Set(loadSavedPlaces().map((s) => s.name.toLowerCase()));
  if (!taken.has('home')) return 'Home';
  if (!taken.has('work')) return 'Work';
  return '';
}
