import { queryRelays } from './relays';
import { resolveHex } from './reputation';
import type { NostrEvent } from '../types/nostr';

/**
 * Who the other person is, in words a human recognises.
 *
 * Before this, a rider's screen said `npub1hp6xaas...` and a driver's said a
 * hex prefix. Nobody gets into a stranger's car on the strength of a base32
 * string. Names come from the counterparty's OWN kind 0 metadata, read from
 * public relays and signature-verified in this client — the operator never
 * asserts an identity, exactly as it never asserts a rating.
 *
 * A name is self-declared and therefore NOT evidence: it sits next to the
 * verified reputation and the vehicle, which are what actually carry trust.
 */

const METADATA = 0;
/** Names change rarely; a long cache keeps this off the hot path */
const CACHE_TTL_MS = 30 * 60 * 1000;

export interface UserProfile {
  hex: string;
  npub: string;
  /** Chosen name, or null when they have published none */
  name: string | null;
  /** https picture URL, or null. Never rendered from other schemes. */
  picture: string | null;
  /** NIP-05 identifier as published — displayed, never treated as verified */
  nip05: string | null;
}

interface CacheEntry {
  profile: UserProfile;
  at: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<UserProfile>>();

/** Trim to something that fits a card without becoming a paragraph */
function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  return trimmed.length > 40 ? `${trimmed.slice(0, 39)}…` : trimmed;
}

/**
 * Only https images. A relay-sourced URL is attacker-controlled, so http://
 * would silently downgrade the page and `data:`/`javascript:` have no
 * business in an <img src> we did not construct.
 */
function cleanPicture(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Parse a kind 0 event's content into the fields we display */
export function parseMetadata(event: NostrEvent, hex: string, npub: string): UserProfile {
  let content: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(event.content || '{}');
    if (parsed && typeof parsed === 'object') content = parsed;
  } catch {
    // Malformed metadata is the same as none
  }
  return {
    hex,
    npub,
    name: cleanName(content.display_name) || cleanName(content.name),
    picture: cleanPicture(content.picture),
    nip05: cleanName(content.nip05),
  };
}

/** A profile with nothing in it — the honest state for a fresh keypair */
export function emptyProfile(hex: string, npub: string): UserProfile {
  return { hex, npub, name: null, picture: null, nip05: null };
}

/**
 * Fetch a counterparty's published profile. Never throws and never blocks
 * a screen: an unreachable relay yields an empty profile, and the caller
 * falls back to the shortened npub it would have shown anyway.
 */
export async function getProfile(subject: string): Promise<UserProfile> {
  const hex = await resolveHex(subject);
  if (!hex) return emptyProfile('', subject);

  const cached = cache.get(hex);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.profile;

  const existing = inflight.get(hex);
  if (existing) return existing;

  const task = (async (): Promise<UserProfile> => {
    const { nip19, verifyEvent } = await import('nostr-tools');
    const npub = nip19.npubEncode(hex);
    const events = await queryRelays({ kinds: [METADATA], authors: [hex], limit: 5 });

    // Newest event this key genuinely signed. Verifying matters: a relay can
    // hand back anything, and an unverified kind 0 would let a third party
    // put a trusted-looking name on somebody else's ride.
    const newest = (events || [])
      .filter((event) => {
        try {
          return event.pubkey?.toLowerCase() === hex && verifyEvent(event as never);
        } catch {
          return false;
        }
      })
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0];

    const profile = newest ? parseMetadata(newest, hex, npub) : emptyProfile(hex, npub);
    cache.set(hex, { profile, at: Date.now() });
    return profile;
  })().finally(() => inflight.delete(hex));

  inflight.set(hex, task);
  return task;
}

/** Drop a cached profile — used after publishing your own new metadata */
export function forgetProfile(hex: string): void {
  cache.delete(hex.toLowerCase());
}

/**
 * Publish your own name and picture as kind 0.
 *
 * This is the user's own metadata on the open network — the same event any
 * other Nostr client reads and writes — not a DonkeyRide account record. The
 * operator is not told and does not store it.
 *
 * Existing fields are preserved: a user who set a picture in another client
 * must not lose it because they typed a name here.
 */
export async function publishProfile(
  privKeyHex: string,
  pubKeyHex: string,
  fields: { name?: string; picture?: string },
): Promise<number> {
  const { signNostrEvent } = await import('./nostr');
  const { publishToRelays } = await import('./relays');

  const hex = pubKeyHex.toLowerCase();
  let content: Record<string, unknown> = {};
  const existing = await queryRelays({ kinds: [METADATA], authors: [hex], limit: 5 });
  const newest = (existing || [])
    .filter((e) => e.pubkey?.toLowerCase() === hex)
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0];
  if (newest) {
    try {
      const parsed = JSON.parse(newest.content || '{}');
      if (parsed && typeof parsed === 'object') content = parsed;
    } catch {
      // Unparseable existing metadata — start clean rather than fail
    }
  }

  if (fields.name !== undefined) {
    const name = fields.name.trim();
    if (name) {
      content.name = name;
      content.display_name = name;
    } else {
      delete content.name;
      delete content.display_name;
    }
  }
  if (fields.picture !== undefined) {
    const picture = fields.picture.trim();
    if (picture) content.picture = picture;
    else delete content.picture;
  }

  const event = await signNostrEvent({
    kind: METADATA,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify(content),
  }, privKeyHex);

  forgetProfile(hex);
  return publishToRelays(event);
}

/**
 * What to call someone when they have published no name. Short, and clearly
 * an identifier rather than a name pretending to be one.
 */
export function fallbackName(npub: string | undefined | null): string {
  if (!npub) return 'Unknown';
  return `${npub.slice(0, 9)}…${npub.slice(-4)}`;
}

/** The name to render: their own, else a short identifier */
export function displayName(
  profile: UserProfile | null | undefined,
  npub: string | undefined | null,
): string {
  return profile?.name || fallbackName(npub);
}

/** Initials for the avatar placeholder when there is no picture */
export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, '').split(' ').filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
