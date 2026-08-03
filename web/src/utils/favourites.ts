/**
 * Favourite providers — the driver you'd rather have again.
 *
 * The list lives on this device. It reaches the operator only as part of
 * a request the rider chose to make (as `preferred_providers`), is held
 * in memory for that request alone, and is never published to relays.
 * The operator gives those providers a short exclusive window on the job
 * and then opens it to everyone, so a favourite who is busy or offline
 * costs the rider nothing but a few seconds.
 */

const KEY = 'donkeyride.favouriteProviders';
const MAX_FAVOURITES = 10;

export interface FavouriteProvider {
  /** Hex pubkey — what dispatch matches on */
  pubkey: string;
  npub?: string;
  /** Rider's own label ("Sam, blue Corolla") */
  label?: string;
  savedAt: number;
}

function read(): FavouriteProvider[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((f) => f && typeof f.pubkey === 'string' && /^[0-9a-f]{64}$/i.test(f.pubkey));
  } catch {
    return [];
  }
}

function write(list: FavouriteProvider[]): FavouriteProvider[] {
  const capped = list.slice(0, MAX_FAVOURITES);
  try {
    localStorage.setItem(KEY, JSON.stringify(capped));
  } catch {
    // Private browsing or a full quota — favourites are a nicety
  }
  return capped;
}

export function loadFavourites(): FavouriteProvider[] {
  return read().sort((a, b) => b.savedAt - a.savedAt);
}

export function isFavourite(pubkey: string): boolean {
  const key = (pubkey || '').toLowerCase();
  return read().some((f) => f.pubkey.toLowerCase() === key);
}

export function addFavourite(provider: {
  pubkey: string; npub?: string; label?: string;
}): FavouriteProvider[] {
  const key = (provider.pubkey || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(key)) return loadFavourites();
  const rest = read().filter((f) => f.pubkey.toLowerCase() !== key);
  return write([
    { pubkey: key, npub: provider.npub, label: provider.label, savedAt: Date.now() },
    ...rest,
  ]);
}

export function removeFavourite(pubkey: string): FavouriteProvider[] {
  const key = (pubkey || '').toLowerCase();
  return write(read().filter((f) => f.pubkey.toLowerCase() !== key));
}

export function toggleFavourite(provider: {
  pubkey: string; npub?: string; label?: string;
}): boolean {
  if (isFavourite(provider.pubkey)) {
    removeFavourite(provider.pubkey);
    return false;
  }
  addFavourite(provider);
  return true;
}

/** Hex pubkeys to send with a request, so favourites get first refusal */
export function favouritePubkeys(): string[] {
  return read().map((f) => f.pubkey.toLowerCase());
}
