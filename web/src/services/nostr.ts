import type { NostrIdentity } from '../types/nostr';

const REQUESTER_KEY = 'donkeyride.requesterPrivKey';
const PROVIDER_KEY = 'donkeyride.providerPrivKey';

// Legacy keys for backward compatibility
const LEGACY_RIDER_KEY = 'donkeyride.riderPrivKey';
const LEGACY_DRIVER_KEY = 'donkeyride.driverPrivKey';

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
 * Falls back to legacy storage keys for backward compatibility.
 */
export async function loadOrCreateIdentity(
  storageKey: string,
  legacyKey?: string,
): Promise<NostrIdentity> {
  const { getPublicKey, nip19 } = await import('nostr-tools');

  let privKeyHex = localStorage.getItem(storageKey);

  // Fall back to legacy key if new key not found
  if (!privKeyHex && legacyKey) {
    privKeyHex = localStorage.getItem(legacyKey);
    if (privKeyHex) {
      // Migrate to new key
      localStorage.setItem(storageKey, privKeyHex);
    }
  }

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

/** Load requester identity */
export function loadRequesterIdentity(): Promise<NostrIdentity> {
  return loadOrCreateIdentity(REQUESTER_KEY, LEGACY_RIDER_KEY);
}

/** Load provider identity */
export function loadProviderIdentity(): Promise<NostrIdentity> {
  return loadOrCreateIdentity(PROVIDER_KEY, LEGACY_DRIVER_KEY);
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

/** Encode the private key as nsec for backup */
export async function encodeNsec(privKeyHex: string): Promise<string> {
  const { nip19 } = await import('nostr-tools');
  return nip19.nsecEncode(hexToBytes(privKeyHex));
}

/**
 * Import an identity from an nsec (or raw hex) backup.
 * Overwrites the stored key for the given role. Returns the npub.
 */
export async function importIdentity(
  role: 'requester' | 'provider',
  secret: string,
): Promise<string> {
  const { getPublicKey, nip19 } = await import('nostr-tools');
  const trimmed = secret.trim();

  let privKeyHex: string;
  if (trimmed.startsWith('nsec1')) {
    const decoded = nip19.decode(trimmed);
    if (decoded.type !== 'nsec') {
      throw new Error('Not an nsec key');
    }
    privKeyHex = bytesToHex(decoded.data as Uint8Array);
  } else if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    privKeyHex = trimmed.toLowerCase();
  } else {
    throw new Error('Expected an nsec1… key or 64-character hex');
  }

  const pubKeyHex = getPublicKey(hexToBytes(privKeyHex));
  localStorage.setItem(role === 'provider' ? PROVIDER_KEY : REQUESTER_KEY, privKeyHex);
  return nip19.npubEncode(pubKeyHex);
}
