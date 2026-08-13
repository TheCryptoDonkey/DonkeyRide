import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getPublicKey, verifyEvent } from 'nostr-tools';
import { hexToBytes } from './nostr';
import type { NostrEvent } from '../types/nostr';

const published: NostrEvent[] = [];

vi.mock('./relays', () => ({
  publishToRelays: async (event: NostrEvent) => {
    published.push(event);
    return 1;
  },
}));

const { publishTaskAnnouncement, publishAvailabilityBeacon } = await import('./events');

// A real requester identity — the one that must NOT sign announcements
const RIDER_PRIV = '11'.repeat(32);
const RIDER_PUB = getPublicKey(hexToBytes(RIDER_PRIV));

const PICKUP = { lat: 53.47741, lng: -2.23094 };

beforeEach(() => {
  published.length = 0;
  localStorage.setItem('donkeyride.coordination.mode', 'managed');
});

describe('task announcements are unlinkable to the requester', () => {
  it('is signed by a throwaway key, never the requester identity', async () => {
    await publishTaskAnnouncement('ride_abc', PICKUP, 'ridesharing', {
      pubkey: 'f'.repeat(64),
      api: 'https://operator.example',
    });

    expect(published).toHaveLength(1);
    const [event] = published;
    expect(verifyEvent(event as never)).toBe(true);
    expect(event.pubkey).not.toBe(RIDER_PUB);
  });

  it('uses a DIFFERENT key for every announcement', async () => {
    await publishTaskAnnouncement('ride_one', PICKUP, 'ridesharing');
    await publishTaskAnnouncement('ride_two', PICKUP, 'ridesharing');

    const [first, second] = published;
    expect(first.pubkey).not.toBe(second.pubkey);
  });

  it('still carries everything federated discovery needs', async () => {
    await publishTaskAnnouncement('ride_abc', PICKUP, 'ridesharing', {
      pubkey: 'f'.repeat(64),
      api: 'https://operator.example',
    });

    const tag = (k: string) => published[0].tags.find((t) => t[0] === k)?.[1];
    expect(tag('d')).toBe('ride_abc');
    expect(tag('domain')).toBe('ridesharing');
    expect(tag('api')).toBe('https://operator.example');
    expect(tag('g')).toHaveLength(5);
    expect(tag('expiration')).toBeTruthy();
  });

  it('carries no coordinates, address or requester key anywhere on the wire', async () => {
    await publishTaskAnnouncement('ride_abc', PICKUP, 'ridesharing');

    const wire = JSON.stringify(published[0]);
    expect(wire).not.toContain('53.47');
    expect(wire).not.toContain('-2.23');
    expect(wire).not.toContain(RIDER_PUB);
  });
});

describe('the P2P availability beacon is off unless asked for', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('publishes NOTHING by default', async () => {
    // A provider going on shift used to sign a kind 20500 under their
    // Managed dispatch uses its authenticated socket, so it must not also
    // publish the driver's identity-linked coarse position to public relays.
    const acks = await publishAvailabilityBeacon(PICKUP, 'ridesharing', RIDER_PRIV);

    expect(acks).toBe(0);
    expect(published).toHaveLength(0);
  });

  it('publishes when an operator-free deployment opts in', async () => {
    vi.stubEnv('VITE_TROTT_P2P_BEACON', 'true');

    await publishAvailabilityBeacon(PICKUP, 'ridesharing', RIDER_PRIV);

    expect(published).toHaveLength(1);
  });

  it('stays coarse and ephemeral when it does publish', async () => {
    vi.stubEnv('VITE_TROTT_P2P_BEACON', 'true');
    await publishAvailabilityBeacon(PICKUP, 'ridesharing', RIDER_PRIV);

    const [event] = published;
    const tag = (k: string) => event.tags.find((t) => t[0] === k)?.[1];
    expect(tag('g')).toHaveLength(5);
    expect(JSON.stringify(event)).not.toContain('53.47');
    // Ephemeral kind range — relays do not store these.
    expect(event.kind).toBeGreaterThanOrEqual(20000);
    expect(event.kind).toBeLessThan(30000);
  });

  it('is signed by the provider IDENTITY key, deliberately', async () => {
    // Unlike a task announcement, this one may NOT be moved to a throwaway
    // key. With no operator to resolve through, the beacon's author IS the
    // contact address and the reputation anchor — a fresh key per beacon
    // would announce an unreachable stranger with no history. The privacy
    // answer for the beacon is the default-off switch above, not anonymity.
    vi.stubEnv('VITE_TROTT_P2P_BEACON', 'true');
    await publishAvailabilityBeacon(PICKUP, 'ridesharing', RIDER_PRIV);

    expect(published[0].pubkey).toBe(RIDER_PUB);
  });
});
