import { queryRelays } from './relays';
import { getReputation as getOperatorReputation } from './api';
import type { Reputation } from '../types/api';
import type { NostrEvent } from '../types/nostr';

/**
 * Trust-minimised reputation: the client reads kind 30520 rating events
 * (and kind 30540 emergency signals) from public relays ITSELF, verifies
 * every signature, and aggregates locally — so no operator can invent,
 * inflate or hide a counterparty's history. The operator's aggregation
 * endpoint is only a fallback for when the relays are unreachable.
 *
 * Kind numbers are pinned to the TROTT spec table (src/nostr/kinds.js).
 */
const TASK_RATING = 30520;
const EMERGENCY_SIGNAL = 30540;

/** Resolve an npub or 64-hex pubkey to lowercase hex; null if invalid */
export async function resolveHex(subject: string): Promise<string | null> {
  const trimmed = (subject || '').trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (trimmed.startsWith('npub')) {
    try {
      const { nip19 } = await import('nostr-tools');
      const decoded = nip19.decode(trimmed);
      if (decoded.type === 'npub' && typeof decoded.data === 'string') {
        return decoded.data.toLowerCase();
      }
    } catch {
      return null;
    }
  }
  return null;
}

/** Keep only events whose signature genuinely verifies */
export function filterVerified(
  events: NostrEvent[],
  verify: (event: NostrEvent) => boolean,
): NostrEvent[] {
  return events.filter((event) => {
    try {
      return verify(event);
    } catch {
      return false;
    }
  });
}

/**
 * Aggregate verified rating/panic events into the Reputation shape.
 * Mirrors the operator's rules (src/nostr/reputation.js): one rating per
 * (rater, task) — newest wins — so a rater cannot stuff the average.
 * Pure: callers verify signatures first.
 */
export function aggregateReputation(
  hex: string,
  npub: string,
  ratingEvents: NostrEvent[],
  panicEvents: NostrEvent[],
): Reputation {
  const byKey = new Map<string, NostrEvent>();
  for (const event of ratingEvents) {
    const taskTag = event.tags.find((t) => t[0] === 'ride' || t[0] === 'task_id');
    const key = `${event.pubkey}:${taskTag?.[1] || event.id}`;
    const existing = byKey.get(key);
    if (!existing || (event.created_at || 0) > (existing.created_at || 0)) {
      byKey.set(key, event);
    }
  }
  const deduped = Array.from(byKey.values());

  let sum = 0;
  let lastRatingAt = 0;
  for (const event of deduped) {
    sum += Number(event.tags.find((t) => t[0] === 'rating')?.[1] || 0);
    lastRatingAt = Math.max(lastRatingAt, event.created_at || 0);
  }

  // No-show reports ride the rating rail: flagged events stay in the
  // average (they carry rating 1) and are surfaced as a separate count
  const noShows = deduped.filter((event) =>
    event.tags.some((t) => t[0] === 'no_show' && t[1] === 'true'));
  const latestNoShowAt = noShows.reduce(
    (latest, event) => Math.max(latest, event.created_at || 0), 0);

  const ownPanics = panicEvents.filter((event) => event.pubkey.toLowerCase() === hex);
  const latestPanicAt = ownPanics.reduce(
    (latest, event) => Math.max(latest, event.created_at || 0), 0);

  return {
    pubkey: hex,
    npub,
    averageRating: deduped.length > 0 ? Number((sum / deduped.length).toFixed(2)) : 0,
    ratingsCount: deduped.length,
    distinctRaters: new Set(deduped.map((event) => event.pubkey)).size,
    lastRatingAt: lastRatingAt || null,
    panicCount: ownPanics.length,
    latestPanicAt: latestPanicAt || null,
    noShowCount: noShows.length,
    latestNoShowAt: latestNoShowAt || null,
  };
}

/**
 * Fetch a counterparty's reputation, relays first. Returns null only when
 * both the relays and the operator fallback are unreachable.
 */
export async function fetchReputation(subject: string): Promise<Reputation | null> {
  const hex = await resolveHex(subject);
  if (!hex) return null;

  const { nip19, verifyEvent } = await import('nostr-tools');
  const [ratings, panics] = await Promise.all([
    queryRelays({ kinds: [TASK_RATING], '#p': [hex], limit: 200 }),
    queryRelays({ kinds: [EMERGENCY_SIGNAL], authors: [hex], limit: 100 }),
  ]);

  if (ratings !== null) {
    // The relays answered — aggregate locally from verified events only.
    // (An empty answer is a real answer: a fresh keypair has no history.)
    const verify = (event: NostrEvent) => verifyEvent(event as never);
    return aggregateReputation(
      hex,
      nip19.npubEncode(hex),
      filterVerified(ratings, verify),
      filterVerified(panics || [], verify),
    );
  }

  // Relays unreachable — fall back to the operator's aggregate
  try {
    return await getOperatorReputation(subject);
  } catch {
    return null;
  }
}
