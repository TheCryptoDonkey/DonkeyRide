import { getAvailableProviders, getOperatorInfo } from './api';
import { queryRelays } from './relays';
import {
  getBootstrapOperatorBase,
  getSelectedOperatorBase,
  safeOperatorOrigin,
} from './operator-origin';
import type { AvailableProvider, LatLng, OperatorInfo, OperatorPolicy } from '../types/api';
import type { NostrEvent } from '../types/nostr';
import { decodeGeohash, encodeGeohash } from '../utils/geohash';

const OPERATOR_KIND = 30511;
const KNOWN_KEY = 'donkeyride.operator.known';
const INFO_TIMEOUT_MS = 5000;
const DIRECTORY_CACHE_MS = 60_000;
let directoryCache: { at: number; entries: OperatorDirectoryEntry[] } | null = null;

export interface OperatorAnnouncement {
  origin: string;
  pubkey: string;
  name: string;
  domains: string[];
  relays: string[];
  feePercent: number | null;
  policyMode: string | null;
  admissionMode: string | null;
  announcedAt: number;
  eventId: string;
}

export interface OperatorDirectoryEntry {
  origin: string;
  name: string;
  pubkey: string | null;
  domains: string[];
  relays: string[];
  feePercent: number | null;
  policy: OperatorPolicy | null;
  reachable: boolean;
  selected: boolean;
  announcedAt: number | null;
}

export interface NetworkProvider extends AvailableProvider {
  operatorBase: string;
  operatorName: string;
}

function tag(event: NostrEvent, name: string): string | null {
  return event.tags.find((item) => item[0] === name)?.[1] ?? null;
}

function tags(event: NostrEvent, name: string): string[] {
  return event.tags.filter((item) => item[0] === name && item[1]).map((item) => item[1]);
}

export function parseOperatorAnnouncement(event: NostrEvent): OperatorAnnouncement | null {
  if (event.kind !== OPERATOR_KIND || tag(event, 't') !== 'trott-operator') return null;
  const origin = safeOperatorOrigin(tag(event, 'service_url'));
  if (!origin) return null;
  const feeRaw = tag(event, 'fee_percent');
  const fee = feeRaw == null ? null : Number(feeRaw);
  return {
    origin,
    pubkey: event.pubkey,
    name: tag(event, 'name') || 'DonkeyRide operator',
    domains: tags(event, 'domain'),
    relays: tags(event, 'relay'),
    feePercent: Number.isFinite(fee) ? fee : null,
    policyMode: tag(event, 'policy_mode'),
    admissionMode: tag(event, 'admission'),
    announcedAt: event.created_at,
    eventId: event.id,
  };
}

function readKnownOrigins(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KNOWN_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value) => {
      const origin = safeOperatorOrigin(typeof value === 'string' ? value : null);
      return origin ? [origin] : [];
    });
  } catch {
    return [];
  }
}

export function rememberOperator(origin: string): void {
  const safe = safeOperatorOrigin(origin);
  if (!safe) return;
  const next = Array.from(new Set([...readKnownOrigins(), safe])).slice(-25);
  localStorage.setItem(KNOWN_KEY, JSON.stringify(next));
}

async function withTimeout<T>(promise: Promise<T>, ms = INFO_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

/**
 * Find signed operator announcements, then ask each advertised origin for
 * its live policy. Relay data discovers; HTTPS confirms current reality.
 */
export async function discoverOperators(force = false): Promise<OperatorDirectoryEntry[]> {
  if (!force && directoryCache && Date.now() - directoryCache.at < DIRECTORY_CACHE_MS) {
    return directoryCache.entries;
  }
  const selected = getSelectedOperatorBase();
  const bootstrap = getBootstrapOperatorBase();
  const announced = new Map<string, OperatorAnnouncement>();
  const { verifyEvent } = await import('nostr-tools');
  const events = await queryRelays({
    kinds: [OPERATOR_KIND],
    '#t': ['trott-operator'],
    limit: 200,
  }, INFO_TIMEOUT_MS);

  for (const event of events || []) {
    if (!verifyEvent(event as never)) continue;
    const parsed = parseOperatorAnnouncement(event);
    if (!parsed) continue;
    const existing = announced.get(parsed.origin);
    if (!existing || parsed.announcedAt > existing.announcedAt) {
      announced.set(parsed.origin, parsed);
    }
  }

  const origins = Array.from(new Set([
    selected,
    bootstrap,
    ...readKnownOrigins(),
    ...announced.keys(),
  ])).slice(0, 30);

  const entries = await Promise.all(origins.map(async (origin): Promise<OperatorDirectoryEntry> => {
    const announcement = announced.get(origin);
    try {
      const info = await withTimeout(getOperatorInfo(origin));
      rememberOperator(origin);
      const domain = typeof info.domain === 'object' ? info.domain.id : info.domain;
      return {
        origin,
        name: info.name || announcement?.name || origin,
        pubkey: info.pubkey || info.operator || announcement?.pubkey || null,
        domains: domain ? [domain] : (announcement?.domains || []),
        relays: info.public_relays || announcement?.relays || [],
        feePercent: typeof info.feePercent === 'number'
          ? info.feePercent * 100 : (announcement?.feePercent ?? null),
        policy: info.policy || null,
        reachable: true,
        selected: origin === selected,
        announcedAt: announcement?.announcedAt ?? null,
      };
    } catch {
      return {
        origin,
        name: announcement?.name || origin,
        pubkey: announcement?.pubkey || null,
        domains: announcement?.domains || [],
        relays: announcement?.relays || [],
        feePercent: announcement?.feePercent ?? null,
        policy: announcement?.policyMode ? {
          schema: 'org.donkeyride.operator-policy/v1',
          mode: announcement.policyMode as OperatorPolicy['mode'],
          admission: {
            mode: (announcement.admissionMode || 'open') as OperatorPolicy['admission']['mode'],
            assurance: 'none',
            requiredCredentials: [],
            allowlistSize: null,
            note: 'Policy summary from a signed announcement; live operator details are unavailable.',
          },
          records: { mode: 'ephemeral', backend: 'unknown' },
        } : null,
        reachable: false,
        selected: origin === selected,
        announcedAt: announcement?.announcedAt ?? null,
      };
    }
  }));

  const sorted = entries.sort((a, b) => Number(b.selected) - Number(a.selected)
    || Number(b.reachable) - Number(a.reachable)
    || a.name.localeCompare(b.name));
  directoryCache = { at: Date.now(), entries: sorted };
  return sorted;
}

/** Coarse, identity-free supply across all reachable operators. */
export async function discoverNetworkProviders(location: LatLng, radiusKm = 10): Promise<{
  providers: NetworkProvider[];
  operators: OperatorDirectoryEntry[];
}> {
  const operators = await discoverOperators();
  const cell = decodeGeohash(encodeGeohash(location.lat, location.lng, 5));
  const coarseLocation = cell ? { lat: cell.lat, lng: cell.lon } : location;
  const reachable = operators.filter((operator) => operator.reachable);
  const results = await Promise.all(reachable.map(async (operator) => {
    try {
      const response = await withTimeout(getAvailableProviders({
        lat: coarseLocation.lat,
        lng: coarseLocation.lng,
        radiusKm,
      }, operator.origin));
      return response.drivers.map((provider, index): NetworkProvider => ({
        ...provider,
        // Availability deliberately withholds identity. Give React a stable
        // per-response key without pretending it is the driver's pubkey.
        pubkey: provider.pubkey || `${operator.origin}#${index}`,
        npub: provider.npub || '',
        operatorBase: operator.origin,
        operatorName: operator.name,
      }));
    } catch {
      return [];
    }
  }));
  return { providers: results.flat(), operators };
}

export type { OperatorInfo };
