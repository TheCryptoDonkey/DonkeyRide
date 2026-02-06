import type { NostrIdentity } from '../types/nostr';

const RIDER_KEY = 'donkeyride.riderPrivKey';
const DRIVER_KEY = 'donkeyride.driverPrivKey';

/** Generate a random 32-byte hex key */
function generateRandomHex(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Convert hex string to Uint8Array */
export function hexToBytes(hex: string): Uint8Array {
  const matches = hex.match(/.{1,2}/g) || [];
  return new Uint8Array(matches.map(byte => parseInt(byte, 16)));
}

/** Convert Uint8Array to hex string */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Load or create a Nostr identity from localStorage.
 * Uses nostr-tools dynamically to avoid bundling issues.
 */
export async function loadOrCreateIdentity(
  storageKey: string,
): Promise<NostrIdentity> {
  const { getPublicKey, nip19 } = await import('nostr-tools');

  let privKeyHex = localStorage.getItem(storageKey);

  if (!privKeyHex) {
    privKeyHex = generateRandomHex();
    localStorage.setItem(storageKey, privKeyHex);
  }

  try {
    const pubKeyHex = getPublicKey(hexToBytes(privKeyHex));
    const npub = nip19.npubEncode(pubKeyHex);
    return { privKeyHex, pubKeyHex, npub };
  } catch {
    // Key was corrupted — regenerate
    privKeyHex = generateRandomHex();
    localStorage.setItem(storageKey, privKeyHex);
    const pubKeyHex = getPublicKey(hexToBytes(privKeyHex));
    const npub = nip19.npubEncode(pubKeyHex);
    return { privKeyHex, pubKeyHex, npub };
  }
}

/** Load rider identity */
export function loadRiderIdentity(): Promise<NostrIdentity> {
  return loadOrCreateIdentity(RIDER_KEY);
}

/** Load driver identity */
export function loadDriverIdentity(): Promise<NostrIdentity> {
  return loadOrCreateIdentity(DRIVER_KEY);
}

/**
 * Create a NIP-98 auth header event.
 * Returns base64-encoded signed event for the Authorization header.
 */
export async function createNip98Auth(
  url: string,
  method: string,
  privKeyHex: string,
): Promise<string> {
  const { finalizeEvent } = await import('nostr-tools');
  const privBytes = hexToBytes(privKeyHex);

  const eventTemplate = {
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', url],
      ['method', method.toUpperCase()],
    ],
    content: '',
  };

  const signedEvent = finalizeEvent(eventTemplate, privBytes);
  return btoa(JSON.stringify(signedEvent));
}
