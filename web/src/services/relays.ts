import type { NostrEvent } from '../types/nostr';
import { getOperatorInfoCached } from './api';

/**
 * Last-resort public relays when neither env nor operator supply any.
 *
 * These are large third-party hosts and they stay, deliberately — the
 * opposite call to the OPERATOR's relay list, which now defaults to
 * nowhere. The two are not the same question.
 *
 * The operator publishes on behalf of OTHER PEOPLE (task snapshots), so
 * silently defaulting it to a stranger's relay leaked riders' journeys.
 * This list is what a client publishes about ITSELF, and every event that
 * reaches it is one whose whole value is being publicly readable:
 *
 *   kind 0      profile     how a stranger sees your name and face
 *   kind 30520  ratings     portable reputation — the point of TROTT-03
 *   kind 30540  panic       accountability; coarse by construction
 *   kind 1059   NIP-17      gift wraps; a guardian or counterparty may
 *                           read them in ANY DM client, on their relays
 *   kind 37500  task ann.   cross-operator discovery, throwaway-signed
 *
 * Narrow this to one operator's relay and a driver's reputation becomes
 * invisible to anyone not already pointed at that operator, which is
 * precisely the lock-in the protocol exists to avoid. The kind 20500
 * beacon was the one member of this list that did NOT need public reach;
 * it is off by default now (see `p2pBeaconEnabled`), which is why this
 * list can stay wide with a clear conscience.
 */
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
 * Live subscription on the public relays. Returns a close handle.
 * Events are deduped across relays by SimplePool; `onEvent` may still see
 * the same logical message twice on reconnect — callers dedupe by id.
 */
export async function subscribeToRelays(
  filter: object,
  onEvent: (event: NostrEvent) => void,
): Promise<{ close: () => void }> {
  const [pool, relays] = await Promise.all([getPool(), getPublicRelays()]);
  const sub = pool.subscribeMany(relays, filter as never, {
    onevent: (event) => onEvent(event as NostrEvent),
  });
  return { close: () => sub.close() };
}

/**
 * One-shot EOSE-bounded query against the public relays.
 * Returns the events on success (possibly none — that IS the relays'
 * answer) and null when the query itself failed, so callers can tell
 * "no history" apart from "relays unreachable".
 */
export async function queryRelays(
  filter: object,
  maxWaitMs = 4000,
): Promise<NostrEvent[] | null> {
  try {
    const [pool, relays] = await Promise.all([getPool(), getPublicRelays()]);
    const events = await pool.querySync(relays, filter as never, { maxWait: maxWaitMs });
    return events as NostrEvent[];
  } catch {
    return null;
  }
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
