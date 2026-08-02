import type { LatLng } from '../types/api';
import { signNostrEvent } from './nostr';
import { publishToRelays } from './relays';
import { encodeGeohash } from '../utils/geohash';

/**
 * Decentralised discovery events — published DIRECT TO PUBLIC RELAYS ONLY,
 * never to the operator. Location is geohash precision 5 (roughly 5 km cell):
 * coarse enough to carry no PII, fine enough for local discovery.
 */

/**
 * TROTT-02 availability beacon (kind 20500, ephemeral).
 * Announces that a provider is available near a geohash cell.
 * Best-effort: returns the relay ack count, never throws.
 */
export async function publishAvailabilityBeacon(
  location: LatLng,
  domainId: string,
  privKeyHex: string,
): Promise<number> {
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
 */
export async function publishTaskAnnouncement(
  taskId: string,
  pickup: LatLng,
  domainId: string,
  privKeyHex: string,
  operator?: { pubkey?: string | null; api?: string | null; scheduledFor?: number | null },
): Promise<number> {
  try {
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
    }, privKeyHex);
    return await publishToRelays(event);
  } catch {
    return 0;
  }
}
