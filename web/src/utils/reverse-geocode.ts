/**
 * Reverse geocoding — turn a coordinate into words.
 *
 * A pin on a map is not an answer to "where shall I meet you?". Uber and
 * Bolt name the pickup ("14 Deansgate") so the rider can tell at a glance
 * whether the app guessed right. Same free, key-less Photon (komoot)
 * backend the address search uses, so there is no new dependency and no
 * new party learning where people stand: one request, no identifier
 * attached, nothing stored.
 */

import type { LatLng } from '../types/api';

export interface PhotonProperties {
  name?: string;
  housenumber?: string;
  street?: string;
  city?: string;
  postcode?: string;
  country?: string;
}

/** "14, Deansgate, Manchester, M3 2BW" from a Photon feature */
export function formatPhotonLabel(p: PhotonProperties): string {
  const street = [p.street, p.housenumber].filter(Boolean).join(' ');
  return [p.name, street !== p.name ? street : null, p.city, p.postcode]
    .filter(Boolean)
    .join(', ');
}

const CACHE_PRECISION = 4; // ~11 m — a walk of a few steps reuses the answer
const cache = new Map<string, string>();

function cacheKey(loc: LatLng): string {
  return `${loc.lat.toFixed(CACHE_PRECISION)},${loc.lng.toFixed(CACHE_PRECISION)}`;
}

/**
 * Name a coordinate. Returns null when the lookup fails or times out —
 * callers fall back to showing the coordinates, never an error: an
 * unnamed pickup still works perfectly well.
 */
export async function reverseGeocode(loc: LatLng, timeoutMs = 6000): Promise<string | null> {
  const key = cacheKey(loc);
  const hit = cache.get(key);
  if (hit !== undefined) return hit || null;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(
      `https://photon.komoot.io/reverse?lat=${loc.lat}&lon=${loc.lng}&limit=1`,
      controller ? { signal: controller.signal } : undefined,
    );
    const data = await res.json();
    const feature = data?.features?.[0];
    const label = feature ? formatPhotonLabel(feature.properties || {}) : '';
    if (!label) return null;
    cache.set(key, label);
    return label;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Drop the cache — used by tests. */
export function clearReverseGeocodeCache(): void {
  cache.clear();
}
