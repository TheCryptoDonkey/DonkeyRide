import type { AvailableProvider, LatLng } from '../types/api';
import { signNostrEvent, bytesToHex } from './nostr';
import { publishToRelays, queryRelays, subscribeToRelays } from './relays';
import { decodeGeohash, encodeGeohash } from '../utils/geohash';
import { getCoordinationMode } from './network-mode';
import type { NostrEvent } from '../types/nostr';

/**
 * Decentralised discovery events — published DIRECT TO PUBLIC RELAYS ONLY,
 * never to the operator. Location is geohash precision 5 (roughly 5 km cell):
 * minimised for local discovery, but still correlatable personal data.
 */

/**
 * Is the TROTT-02 peer-to-peer availability beacon switched on?
 *
 * OFF unless `VITE_TROTT_P2P_BEACON=true`, and the default is the point.
 *
 * The beacon is the one public event a provider signs with their DURABLE
 * IDENTITY key — necessarily so: in operator-free discovery the pubkey IS
 * the contact address and the reputation anchor, so a throwaway key (the
 * fix applied to task announcements) would make it useless. That key also
 * carries their kind 0 name and avatar and is `p`-tagged by every kind
 * 30520 rating. So a beacon every 60 seconds for a whole shift is a live,
 * named, rated feed of where a working person is, published to relays
 * anyone may subscribe to. The ephemeral kind range means relays do not
 * STORE it — but nothing stops a subscriber storing it themselves, and
 * `{kinds:[20500]}` is a free, passive, permanently-open subscription.
 *
 * Direct-mode riders keep a live kind-20500 subscription and need this
 * contact/reputation anchor to discover nearby drivers. Managed dispatch
 * already has its own authenticated presence channel, so its beacon remains
 * off unless that operator build explicitly opts in.
 */
export function p2pBeaconEnabled(): boolean {
  if (getCoordinationMode() === 'direct') return true;
  return String(import.meta.env.VITE_TROTT_P2P_BEACON || '')
    .trim().toLowerCase() === 'true';
}

/**
 * TROTT-02 availability beacon (kind 20500, ephemeral).
 * Announces that a provider is available near a geohash cell.
 * Best-effort: returns the relay ack count, never throws.
 *
 * No-op unless `p2pBeaconEnabled()` — see the note there for why.
 */
export async function publishAvailabilityBeacon(
  location: LatLng,
  domainId: string,
  privKeyHex: string,
): Promise<number> {
  if (!p2pBeaconEnabled()) return 0;
  try {
    const now = Math.floor(Date.now() / 1000);
    const event = await signNostrEvent({
      kind: 20500,
      created_at: now,
      tags: [
        ['g', encodeGeohash(location.lat, location.lng, 5)],
        ['domain', domainId],
        ['expiration', String(now + 120)],
      ],
      content: '',
    }, privKeyHex);
    return await publishToRelays(event);
  } catch {
    return 0;
  }
}

function distanceKm(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Kind 20500 is ephemeral by design: a conforming relay need not replay a
// beacon to a query made after it was published. Keep one live subscription
// in the PWA and cache only the latest short-lived event in memory. This
// makes discovery work without asking a relay to retain a location history.
const liveAvailability = new Map<string, NostrEvent>();
let availabilitySubscription: Promise<{ close: () => void }> | null = null;

async function ensureAvailabilitySubscription(): Promise<void> {
  if (!availabilitySubscription) {
    availabilitySubscription = import('nostr-tools').then(({ verifyEvent }) =>
      subscribeToRelays({
        kinds: [20500],
        since: Math.floor(Date.now() / 1000) - 180,
      }, (event) => {
        if (!verifyEvent(event as never)) return;
        const existing = liveAvailability.get(event.pubkey);
        if (!existing || event.created_at > existing.created_at) {
          liveAvailability.set(event.pubkey, event);
        }
      }));
  }
  await availabilitySubscription;
}

/** Current coarse provider beacons for the rider's map; no operator query. */
export async function queryAvailabilityBeacons(
  around: LatLng,
  domainId = 'ridesharing',
  radiusKm = 10,
): Promise<AvailableProvider[]> {
  const now = Math.floor(Date.now() / 1000);
  await ensureAvailabilitySubscription();
  const replayed = await queryRelays({
    kinds: [20500],
    since: now - 180,
    limit: 500,
  });
  const byId = new Map<string, NostrEvent>();
  for (const event of liveAvailability.values()) byId.set(event.id, event);
  for (const event of replayed || []) byId.set(event.id, event);
  const events = Array.from(byId.values());
  const { verifyEvent, nip19 } = await import('nostr-tools');
  const latest = new Map<string, AvailableProvider & { at: number }>();
  for (const event of events) {
    if (!verifyEvent(event as never)) continue;
    const expiration = Number(event.tags.find((item) => item[0] === 'expiration')?.[1]);
    const geohash = event.tags.find((item) => item[0] === 'g')?.[1];
    const eventDomain = event.tags.find((item) => item[0] === 'domain')?.[1];
    if (!geohash || eventDomain !== domainId || !Number.isFinite(expiration) || expiration < now) continue;
    const point = decodeGeohash(geohash);
    if (!point) continue;
    const location = { lat: point.lat, lng: point.lon };
    if (distanceKm(around, location) > radiusKm + 5) continue;
    const existing = latest.get(event.pubkey);
    if (!existing || event.created_at > existing.at) {
      latest.set(event.pubkey, {
        pubkey: event.pubkey,
        npub: nip19.npubEncode(event.pubkey),
        location,
        at: event.created_at,
      });
    }
  }
  for (const [pubkey, event] of liveAvailability) {
    const expiration = Number(event.tags.find((item) => item[0] === 'expiration')?.[1]);
    if (!Number.isFinite(expiration) || expiration < now) liveAvailability.delete(pubkey);
  }
  return Array.from(latest.values()).map(({ at: _at, ...provider }) => provider);
}

/**
 * TROTT-02 task announcement (kind 37500, addressable).
 * Announces an open task near a geohash cell. Carries NO coordinates,
 * NO addresses and NO other PII — geohash precision 5 only.
 * The optional operator tags (`operator` pubkey + `api` base URL) let
 * drivers on OTHER operators discover and resolve this job — the
 * federation hook. Best-effort: returns the relay ack count, never throws.
 *
 * Signed by a THROWAWAY key, never the requester's identity key. The
 * announcement's `d` tag is the task id, and a coordinating operator
 * publishes state under that same id, so signing with a durable key made
 * the author the join between "who I am" and every job they ever posted —
 * one relay query for `authors:[me]` and you have somebody's travel
 * history. Nothing reads the author: `parseTaskAnnouncement` takes the
 * task id, cell, domain and api tags and ignores `event.pubkey`, and a
 * driver resolves the job against the operator's API, which authenticates
 * them properly. A fresh key per announcement costs one keygen and leaves
 * discovery working exactly as before.
 */
export async function publishTaskAnnouncement(
  taskId: string,
  pickup: LatLng,
  domainId: string,
  operator?: { pubkey?: string | null; api?: string | null; scheduledFor?: number | null },
): Promise<number> {
  try {
    const { generateSecretKey } = await import('nostr-tools');
    const ephemeralKey = bytesToHex(generateSecretKey());
    const now = Math.floor(Date.now() / 1000);
    // A pre-booked task stays discoverable until an hour past its pickup
    // time; an immediate one expires in 15 minutes (NIP-40)
    const scheduledSec = operator?.scheduledFor
      ? Math.floor(operator.scheduledFor / 1000)
      : null;
    const tags = [
      ['d', taskId],
      ['g', encodeGeohash(pickup.lat, pickup.lng, 5)],
      ['domain', domainId],
      ['t', 'trott-task'],
      ['expiration', String(scheduledSec ? scheduledSec + 3600 : now + 900)],
    ];
    if (scheduledSec) tags.push(['scheduled_for', String(scheduledSec)]);
    if (operator?.pubkey) tags.push(['operator', operator.pubkey]);
    if (operator?.api) tags.push(['api', operator.api]);
    const event = await signNostrEvent({
      kind: 37500,
      created_at: now,
      tags,
      content: '',
    }, ephemeralKey);
    return await publishToRelays(event);
  } catch {
    return 0;
  }
}
