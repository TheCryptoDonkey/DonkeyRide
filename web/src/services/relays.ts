import type { NostrEvent } from '../types/nostr';
import { getOperatorInfoCached } from './api';

/** Last-resort public relays when neither env nor operator supply any */
const FALLBACK_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol'];

const PUBLISH_TIMEOUT_MS = 5000;

// Lazy singleton — SimplePool opens sockets on first publish, not at import
let poolPromise: Promise<import('nostr-tools').SimplePool> | null = null;
let cachedRelays: string[] | null = null;

function getPool() {
  if (!poolPromise) {
    poolPromise = import('nostr-tools').then(({ SimplePool }) => new SimplePool());
  }
  return poolPromise;
}

/**
 * Resolve the public relay list, in order of preference:
 * 1. VITE_NOSTR_RELAYS env var (comma-separated)
 * 2. `public_relays` array from GET /info (cached)
 * 3. Hard-coded fallback relays
 */
export async function getPublicRelays(): Promise<string[]> {
  if (cachedRelays) return cachedRelays;

  const envRelays = String(import.meta.env.VITE_NOSTR_RELAYS || '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
  if (envRelays.length > 0) {
    cachedRelays = envRelays;
    return cachedRelays;
  }

  try {
    const info = await getOperatorInfoCached();
    if (Array.isArray(info.public_relays) && info.public_relays.length > 0) {
      cachedRelays = info.public_relays;
      return cachedRelays;
    }
  } catch {
    // Operator unreachable — fall through to defaults
  }

  cachedRelays = FALLBACK_RELAYS;
  return cachedRelays;
}

/**
 * Best-effort publish of a signed event to the public relays.
 * Never throws; each relay gets a 5-second timeout.
 * Returns the number of relays that acknowledged the event.
 */
export async function publishToRelays(event: NostrEvent): Promise<number> {
  try {
    const [pool, relays] = await Promise.all([getPool(), getPublicRelays()]);
    const timeout = () => new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('publish timeout')), PUBLISH_TIMEOUT_MS));

    const results = await Promise.allSettled(
      pool.publish(relays, event).map((p) => Promise.race([p, timeout()])),
    );
    return results.filter((r) => r.status === 'fulfilled').length;
  } catch {
    return 0;
  }
}
