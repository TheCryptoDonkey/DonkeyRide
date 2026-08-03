import { getApiBase, getOpenTasks } from './api';
import { subscribeToRelays } from './relays';
import { decodeGeohash } from '../utils/geohash';
import type { Task, LatLng } from '../types/api';
import type { NostrEvent } from '../types/nostr';

/**
 * Federated job discovery — the decentralised answer to liquidity.
 *
 * Riders' kind 37500 task announcements (geohash-5 only, no PII) carry the
 * coordinating operator's API origin. A driver subscribed to public relays
 * therefore hears about jobs from EVERY operator in the region, not just
 * the one their app is pointed at: many small operators become one
 * marketplace, with the relays — not any operator — as the meeting point.
 *
 * The announcement's `api` tag is untrusted input from the network: it is
 * only ever used for HTTPS GETs to that operator's public open-jobs
 * endpoint (localhost HTTP allowed for development), and the job's details
 * come from that operator, never from the announcement itself.
 */

const TASK_ANNOUNCEMENT_KIND = 37500;
/** Announcements expire after 15 min (NIP-40); older ones are noise */
const ANNOUNCEMENT_TTL_SECONDS = 900;
/** Radius slack: a precision-5 geohash cell is ~5 km across */
const CELL_SLACK_KM = 6;

export interface TaskAnnouncement {
  taskId: string;
  geohash: string;
  domain: string;
  /** Coordinating operator's API origin */
  api: string;
  operatorPubkey: string | null;
  expiration: number | null;
  eventId: string;
}

function tag(event: NostrEvent, name: string): string | null {
  return event.tags.find((t) => t[0] === name)?.[1] ?? null;
}

/** Accept only https origins (or localhost http for dev); returns the origin */
export function safeOperatorOrigin(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const localhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localhost)) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function parseTaskAnnouncement(event: NostrEvent): TaskAnnouncement | null {
  if (event.kind !== TASK_ANNOUNCEMENT_KIND) return null;
  const taskId = tag(event, 'd');
  const geohash = tag(event, 'g');
  const domain = tag(event, 'domain');
  const api = safeOperatorOrigin(tag(event, 'api'));
  if (!taskId || !geohash || !domain || !api) return null;
  const expirationRaw = tag(event, 'expiration');
  return {
    taskId,
    geohash: geohash.toLowerCase(),
    domain,
    api,
    operatorPubkey: tag(event, 'operator'),
    expiration: expirationRaw ? Number(expirationRaw) : null,
    eventId: event.id,
  };
}

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Should this driver care about this announcement?
 * Same shape as operator dispatch: declared working areas win (cell
 * overlap in either direction — the announcement is precision 5, the
 * driver's cells vary); otherwise a radius check against the decoded
 * cell centre with cell-width slack. Own-operator jobs are excluded —
 * they already arrive over WS and the open-jobs poll.
 */
export function isRelevantAnnouncement(
  announcement: TaskAnnouncement,
  options: {
    domainId: string | null;
    ownOrigin?: string;
    areas: string[];
    location: LatLng | null;
    radiusKm?: number;
    nowSeconds?: number;
  },
): boolean {
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (announcement.expiration != null && announcement.expiration < now) return false;
  if (options.domainId && announcement.domain !== options.domainId) return false;
  const ownOrigin = options.ownOrigin ?? getApiBase();
  if (safeOperatorOrigin(ownOrigin) === announcement.api) return false;

  if (options.areas.length > 0) {
    return options.areas.some((cell) =>
      announcement.geohash.startsWith(cell) || cell.startsWith(announcement.geohash));
  }
  if (options.location) {
    const centre = decodeGeohash(announcement.geohash);
    if (!centre) return false;
    const here = { lat: options.location.lat, lon: options.location.lng };
    return haversineKm(here, centre) <= (options.radiusKm ?? 15) + CELL_SLACK_KM;
  }
  // No areas and no fix — cannot judge relevance, so stay quiet
  return false;
}

/**
 * Resolve an announcement to the actual open job at its operator.
 * Details come from the operator's public open-jobs endpoint (identity
 * -redacted there, like our own), NOT from the relay event.
 */
export async function resolveForeignTask(announcement: TaskAnnouncement): Promise<Task | null> {
  try {
    // Signed, not a bare fetch: an operator running with NIP-98 enabled —
    // the recommended posture, and the demo's — answers 401 to an
    // unauthenticated open-list GET, which silently emptied federated
    // discovery against exactly the operators most worth federating with.
    const open = await getOpenTasks(undefined, announcement.api);
    return open.find((task) => task.id === announcement.taskId) || null;
  } catch {
    return null; // already taken, cancelled, unreachable, or never real
  }
}

/**
 * Live federation subscription. Calls onTask for each resolved, relevant
 * foreign job. Returns a close handle. `getContext` is read per event so
 * area/location changes apply without resubscribing.
 */
export async function subscribeFederatedTasks(
  getContext: () => {
    domainId: string | null;
    areas: string[];
    location: LatLng | null;
  },
  onTask: (task: Task, announcement: TaskAnnouncement) => void,
): Promise<{ close: () => void }> {
  const seenEvents = new Set<string>();
  return subscribeToRelays(
    {
      kinds: [TASK_ANNOUNCEMENT_KIND],
      '#t': ['trott-task'],
      since: Math.floor(Date.now() / 1000) - ANNOUNCEMENT_TTL_SECONDS,
    },
    (event) => {
      if (seenEvents.has(event.id)) return;
      seenEvents.add(event.id);
      const announcement = parseTaskAnnouncement(event);
      if (!announcement) return;
      if (!isRelevantAnnouncement(announcement, { ...getContext() })) return;
      void resolveForeignTask(announcement).then((task) => {
        if (task) onTask(task, announcement);
      });
    },
  );
}
