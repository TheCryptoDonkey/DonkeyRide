/**
 * Access needs, device-local.
 *
 * A wheelchair user should not have to re-declare their needs on every
 * single journey, so the choice is remembered here — on the phone, like
 * favourites and saved places. It reaches the operator only as part of a
 * request the person chose to make, lives in memory for that request alone,
 * and is deliberately kept out of the Nostr snapshot: health-adjacent data
 * must never be published to a public relay.
 *
 * On the provider side this stores which features they can actually offer.
 */

const RIDER_KEY = 'donkeyride.accessNeeds';
const PROVIDER_KEY = 'donkeyride.accessFeatures';

function read(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string' && !!v).slice(0, 6);
  } catch {
    return [];
  }
}

function write(key: string, ids: string[]): void {
  try {
    const unique = [...new Set(ids.filter(Boolean))].slice(0, 6);
    if (unique.length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(unique));
  } catch {
    // Storage unavailable — the request still carries whatever is on screen
  }
}

/** What this rider needs, remembered between journeys */
export function loadAccessNeeds(): string[] {
  return read(RIDER_KEY);
}

export function saveAccessNeeds(ids: string[]): void {
  write(RIDER_KEY, ids);
}

/** What this provider can offer */
export function loadAccessFeatures(): string[] {
  return read(PROVIDER_KEY);
}

export function saveAccessFeatures(ids: string[]): void {
  write(PROVIDER_KEY, ids);
}

/** Toggle one id in a list, returning the new list */
export function toggle(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id];
}
