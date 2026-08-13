import type { NostrIdentity } from '../types/nostr';
import {
  secureDeviceEnvelope, secureDeviceGet, secureDeviceRemove, secureDeviceSet,
} from './secure-device-storage';
import { getCoordinationMode } from './network-mode';
import { getSelectedOperatorBase } from './operator-origin';

export type IdentityRole = 'requester' | 'provider';
export type IdentityKeyModel = 'tree' | 'legacy' | 'uninitialised';

const ROOT_KEY = 'donkeyride.identityTreeRoot';
const MODEL_KEY = 'donkeyride.identity.model';
const RECOVERY_FLAG_KEY = 'donkeyride.identityRecovered';
const TREE_LOCK = 'donkeyride-identity-tree-root';
const LEGACY_KEYS = [
  'donkeyride.requesterPrivKey',
  'donkeyride.providerPrivKey',
  'donkeyride.riderPrivKey',
  'donkeyride.driverPrivKey',
] as const;

let localLock: Promise<unknown> = Promise.resolve();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('Identity-tree root is malformed');
  return new Uint8Array(hex.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
}

function hasLegacyMaterial(): boolean {
  return LEGACY_KEYS.some((key) => secureDeviceEnvelope(key) || localStorage.getItem(key));
}

/** Synchronous status for account copy; identity loading performs the authoritative check. */
export function getIdentityKeyModel(): IdentityKeyModel {
  const saved = localStorage.getItem(MODEL_KEY);
  if (saved === 'tree' || saved === 'legacy') return saved;
  if (secureDeviceEnvelope(ROOT_KEY)) return 'tree';
  if (hasLegacyMaterial()) return 'legacy';
  return 'uninitialised';
}

async function withTreeLock<T>(operation: () => Promise<T>): Promise<T> {
  if (navigator.locks?.request) {
    return navigator.locks.request(TREE_LOCK, operation);
  }
  const previous = localLock;
  let release!: () => void;
  localLock = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

async function randomRootHex(): Promise<string> {
  const { generateSecretKey } = await import('nostr-tools');
  const bytes = generateSecretKey();
  try {
    return bytesToHex(bytes);
  } finally {
    bytes.fill(0);
  }
}

function preserveUnreadableRoot(): void {
  const envelope = secureDeviceEnvelope(ROOT_KEY);
  const timestamp = Date.now();
  if (envelope) localStorage.setItem(`${ROOT_KEY}.corrupt-${timestamp}`, envelope);
  localStorage.setItem(RECOVERY_FLAG_KEY, new Date(timestamp).toISOString());
}

async function writeFreshRoot(): Promise<string> {
  const rootHex = await randomRootHex();
  await secureDeviceSet(ROOT_KEY, rootHex);
  localStorage.setItem(MODEL_KEY, 'tree');
  return rootHex;
}

async function readOrCreateRoot(): Promise<string> {
  try {
    const stored = await secureDeviceGet(ROOT_KEY);
    if (stored && /^[0-9a-f]{64}$/i.test(stored)) {
      localStorage.setItem(MODEL_KEY, 'tree');
      return stored.toLowerCase();
    }
    if (stored) preserveUnreadableRoot();
  } catch {
    preserveUnreadableRoot();
  }
  return writeFreshRoot();
}

async function contextPurpose(role: IdentityRole): Promise<string> {
  if (getCoordinationMode() === 'direct') return `donkeyride:v1:open:${role}`;
  const origin = getSelectedOperatorBase();
  const digest = new Uint8Array(await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(origin),
  ));
  const operatorId = bytesToHex(digest).slice(0, 32);
  digest.fill(0);
  return `donkeyride:v1:operator:${operatorId}:${role}`;
}

async function deriveIdentity(rootHex: string, role: IdentityRole): Promise<NostrIdentity> {
  const [{ fromNsec, derive, zeroise }, { nip19 }] = await Promise.all([
    import('nsec-tree/core'),
    import('nostr-tools'),
  ]);
  const rootBytes = hexToBytes(rootHex);
  const root = fromNsec(rootBytes);
  rootBytes.fill(0);
  const child = derive(root, await contextPurpose(role));
  try {
    const privKeyHex = bytesToHex(child.privateKey);
    const pubKeyHex = bytesToHex(child.publicKey);
    return { privKeyHex, pubKeyHex, npub: nip19.npubEncode(pubKeyHex) };
  } finally {
    zeroise(child);
    root.destroy();
  }
}

/**
 * Return a derived role/network identity for tree-backed installations.
 * Existing installations return null and keep their exact legacy key.
 */
export async function loadIdentityTreePersona(role: IdentityRole): Promise<NostrIdentity | null> {
  return withTreeLock(async () => {
    const model = getIdentityKeyModel();
    if (model === 'legacy') {
      localStorage.setItem(MODEL_KEY, 'legacy');
      return null;
    }
    // A fresh installation creates one protected unpublished root. Both app
    // entrypoints race safely through the browser-wide lock above.
    const rootHex = await readOrCreateRoot();
    return deriveIdentity(rootHex, role);
  });
}

/** Reveal the unpublished tree root as an nsec backup. Never use it to sign. */
export async function revealIdentityTreeRecoveryKey(): Promise<string | null> {
  if (getIdentityKeyModel() !== 'tree') return null;
  return withTreeLock(async () => {
    const rootHex = await readOrCreateRoot();
    const bytes = hexToBytes(rootHex);
    try {
      const { nip19 } = await import('nostr-tools');
      return nip19.nsecEncode(bytes);
    } finally {
      bytes.fill(0);
    }
  });
}

function decodeRecoverySecret(secret: string): Promise<Uint8Array> {
  return import('nostr-tools').then(({ nip19 }) => {
    const trimmed = secret.trim();
    if (/^[0-9a-f]{64}$/i.test(trimmed)) return hexToBytes(trimmed);
    if (!trimmed.startsWith('nsec1')) throw new Error('Expected an nsec1… recovery key');
    const decoded = nip19.decode(trimmed);
    if (decoded.type !== 'nsec') throw new Error('Expected an nsec1… recovery key');
    return new Uint8Array(decoded.data as Uint8Array);
  });
}

function clearLegacyIdentityMaterial(): void {
  for (const key of LEGACY_KEYS) {
    secureDeviceRemove(key);
    localStorage.removeItem(key);
  }
}

/** Replace the unpublished root. Every derived role/operator persona changes. */
export async function restoreIdentityTree(secret: string): Promise<void> {
  await withTreeLock(async () => {
    const bytes = await decodeRecoverySecret(secret);
    try {
      await secureDeviceSet(ROOT_KEY, bytesToHex(bytes));
      localStorage.setItem(MODEL_KEY, 'tree');
      clearLegacyIdentityMaterial();
    } finally {
      bytes.fill(0);
    }
  });
}

/** Explicit destructive migration for legacy installs; never runs automatically. */
export async function startFreshIdentityTree(): Promise<void> {
  await withTreeLock(async () => {
    const rootHex = await randomRootHex();
    await secureDeviceSet(ROOT_KEY, rootHex);
    localStorage.setItem(MODEL_KEY, 'tree');
    clearLegacyIdentityMaterial();
  });
}

/** Test/diagnostic name only; never returns the root or any private material. */
export async function currentPersonaPurpose(role: IdentityRole): Promise<string | null> {
  return getIdentityKeyModel() === 'tree' ? contextPurpose(role) : null;
}
