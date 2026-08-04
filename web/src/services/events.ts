import type { LatLng } from '../types/api';
import { signNostrEvent, bytesToHex } from './nostr';
import { publishToRelays } from './relays';
import { encodeGeohash } from '../utils/geohash';

/**
 * Decentralised discovery events — published DIRECT TO PUBLIC RELAYS ONLY,
 * never to the operator. Location is geohash precision 5 (roughly 5 km cell):
 * coarse enough to carry no PII, fine enough for local discovery.
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
 * That cost buys nothing while an operator coordinates: dispatch already
 * has the provider's position over the authenticated task socket every 30
 * seconds, and NOTHING in this codebase subscribes to kind 20500 — riders
 * are matched by the operator, and federated jobs resolve through the
 * coordinating operator's authenticated API. Providers were paying a
 * public-location price for a reader that does not exist.
 *
 * It stays implemented, and spec-conformant, for the operator-free mode it
 * was written for. It is simply not on by default in a deployment that has
 * an operator — which is every deployment of this app today.
 */
export function p2pBeaconEnabled(): boolean {
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
