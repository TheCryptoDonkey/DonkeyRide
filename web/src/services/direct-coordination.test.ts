import { beforeEach, describe, expect, it, vi } from 'vitest';

const relay = vi.hoisted(() => {
  const events: any[] = [];
  const subscriptions: Array<{ filter: any; callback: (event: any) => void; closed: boolean }> = [];
  const matches = (event: any, filter: any) => {
    if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
    for (const [key, values] of Object.entries(filter)) {
      if (!key.startsWith('#')) continue;
      const tag = key.slice(1);
      if (!(values as string[]).some((value) =>
        event.tags.some((item: string[]) => item[0] === tag && item[1] === value))) return false;
    }
    return true;
  };
  return { events, subscriptions, matches };
});

vi.mock('./relays', () => ({
  publishToRelays: vi.fn(async (event: any) => {
    relay.events.push(event);
    for (const subscription of relay.subscriptions) {
      if (!subscription.closed && relay.matches(event, subscription.filter)) {
        subscription.callback(event);
      }
    }
    return 1;
  }),
  subscribeToRelays: vi.fn(async (filter: any, callback: (event: any) => void) => {
    const subscription = { filter, callback, closed: false };
    relay.subscriptions.push(subscription);
    for (const event of relay.events) {
      if (relay.matches(event, filter)) callback(event);
    }
    return { close: () => { subscription.closed = true; } };
  }),
  queryRelays: vi.fn(async () => relay.events),
}));

import { generateSecretKey, getPublicKey, verifyEvent } from 'nostr-tools';
import { bytesToHex, hexToBytes } from './nostr';
import {
  acceptDirectTask,
  createDirectTask,
  loadDirectTask,
  parseDirectTaskAnnouncement,
  subscribeRequesterDirectTask,
  transitionDirectTask,
} from './direct-coordination';

const tick = () => new Promise((resolve) => window.setTimeout(resolve, 0));

describe('operatorless encrypted coordination', () => {
  beforeEach(() => {
    localStorage.clear();
    relay.events.length = 0;
    relay.subscriptions.length = 0;
  });

  it('matches and advances a multi-stop no-money journey without an API', async () => {
    const riderPriv = bytesToHex(generateSecretKey());
    const driverPriv = bytesToHex(generateSecretKey());
    const riderPub = getPublicKey(hexToBytes(riderPriv));
    const driverPub = getPublicKey(hexToBytes(driverPriv));
    const exactPickup = { lat: 53.4808123, lng: -2.2426123 };
    const exactDropoff = { lat: 53.4831123, lng: -2.2004123 };

    const riderTask = await createDirectTask({
      requesterPrivkey: riderPriv,
      requesterPubkey: riderPub,
      pickup: exactPickup,
      dropoff: exactDropoff,
      stops: [
        { lat: 53.4631, lng: -2.2913, address: 'Private stop one' },
        { lat: 53.4668, lng: -2.2339, address: 'Private stop two' },
      ],
      pickupAddress: 'Private pickup',
      dropoffAddress: 'Private dropoff',
      pickupNote: 'Private note',
      distanceKm: 17.931,
      durationMinutes: 31.3,
      routeGeometry: [[53.48, -2.24], [53.46, -2.29]],
      settlementMode: 'none',
    });

    const announcement = relay.events.find((event) => event.kind === 37500);
    expect(announcement).toBeTruthy();
    expect(verifyEvent(announcement)).toBe(true);
    const publicJson = JSON.stringify(announcement);
    expect(publicJson).not.toContain(riderPub);
    expect(publicJson).not.toContain('Private');
    expect(publicJson).not.toContain('53.4808123');

    const offer = parseDirectTaskAnnouncement(announcement)!;
    expect(offer.task.coordinationMode).toBe('direct');
    expect(offer.task.stopCount).toBe(2);
    expect(offer.task.settlementMode).toBe('none');
    expect(offer.task.pickup).not.toEqual(exactPickup);
    expect(offer.task.requesterPubkey).toBe(announcement.pubkey);

    let riderView = riderTask;
    const riderSubscription = await subscribeRequesterDirectTask(
      riderPriv, riderPub, riderTask, (task) => { riderView = task; },
    );
    const driverTask = await acceptDirectTask(
      driverPriv, driverPub, offer.task, { lat: 53.47, lng: -2.25 }, 2000,
    );
    expect(driverTask.providerPubkey).toBe(driverPub);
    expect(driverTask.requesterPubkey).toBe(riderPub);
    expect(driverTask.status).toBe('en_route');
    expect(riderView.providerPubkey).toBe(driverPub);
    expect(riderView.pickup).toEqual(exactPickup);

    await transitionDirectTask(driverPriv, driverTask.id, 'arrived');
    await tick();
    expect(riderView.status).toBe('arrived');
    await transitionDirectTask(driverPriv, driverTask.id, 'active');
    await tick();
    expect(riderView.status).toBe('active');
    await transitionDirectTask(driverPriv, driverTask.id, 'completed');
    await tick();
    expect(riderView.status).toBe('completed');

    const storedDriverTask = await loadDirectTask(driverPriv, driverTask.id);
    expect(storedDriverTask?.status).toBe('completed');
    const relayJson = JSON.stringify(relay.events);
    expect(relayJson).not.toContain('Private pickup');
    expect(relayJson).not.toContain('Private stop one');
    riderSubscription.close();
  });
});
