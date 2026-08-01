import { describe, it, expect } from 'vitest';
import { normaliseTask, normaliseProviders, normaliseRoute } from './api';

describe('normaliseTask', () => {
  it('converts an array route ([lon, lat] pairs) to [lat, lng] positions', () => {
    const task = normaliseTask({
      ride: {
        id: 'ride-1',
        status: 'accepted',
        route: [[-0.1278, 51.5074], [-0.13, 51.51]],
      },
    });
    expect(task.routeGeometry).toEqual([[51.5074, -0.1278], [51.51, -0.13]]);
  });

  it('keeps a string route as an encoded polyline', () => {
    const task = normaliseTask({ id: 'ride-2', status: 'accepted', route: '_p~iF~ps|U' });
    expect(task.routeGeometry).toBe('_p~iF~ps|U');
  });

  it('leaves routeGeometry undefined when no route is present', () => {
    const task = normaliseTask({ id: 'ride-3', status: 'requested' });
    expect(task.routeGeometry).toBeUndefined();
  });

  it('exposes counterpart pubkeys from both new and legacy shapes', () => {
    const legacy = normaliseTask({
      id: 'r', status: 'accepted',
      rider: { pubkey: 'riderpub' },
      driver: { pubkey: 'driverpub', npub: 'npub1driver' },
    });
    expect(legacy.requesterPubkey).toBe('riderpub');
    expect(legacy.providerPubkey).toBe('driverpub');

    const modern = normaliseTask({
      id: 'r', status: 'accepted',
      requester: { pubkey: 'reqpub' },
      provider: { pubkey: 'provpub' },
    });
    expect(modern.requesterPubkey).toBe('reqpub');
    expect(modern.providerPubkey).toBe('provpub');
  });

  it('reads a bare distance km number from broadcasts', () => {
    const task = normaliseTask({ id: 'r', status: 'requested', distance: 3.2 });
    expect(task.distanceKm).toBe(3.2);
  });

  it('normalises backend {lat, lon} locations to {lat, lng}', () => {
    const task = normaliseTask({
      id: 'r', status: 'requested',
      pickup: { lat: 51.5, lon: -0.12 },
      dropoff: { lat: 51.52, lon: -0.1 },
    });
    expect(task.pickup).toEqual({ lat: 51.5, lng: -0.12 });
    expect(task.dropoff).toEqual({ lat: 51.52, lng: -0.1 });
  });
});

describe('normaliseRoute', () => {
  it('drops malformed points from array routes', () => {
    expect(normaliseRoute([[-0.1, 51.5], 'junk', [1]])).toEqual([[51.5, -0.1]]);
  });

  it('passes strings through and rejects other types', () => {
    expect(normaliseRoute('abc')).toBe('abc');
    expect(normaliseRoute(42)).toBeUndefined();
    expect(normaliseRoute(null)).toBeUndefined();
  });
});

describe('normaliseProviders', () => {
  it('converts lon to lng and filters entries without a location', () => {
    const providers = normaliseProviders({
      drivers: [
        { pubkey: 'a', npub: 'npub1a', location: { lat: 51.5, lon: -0.12 } },
        { pubkey: 'b', npub: 'npub1b', location: null },
        { pubkey: 'c', npub: 'npub1c' },
        { pubkey: 'd', npub: 'npub1d', location: { lat: 51.6, lng: -0.2 } },
      ],
    });
    expect(providers).toHaveLength(2);
    expect(providers[0]).toMatchObject({ pubkey: 'a', location: { lat: 51.5, lng: -0.12 } });
    expect(providers[1]).toMatchObject({ pubkey: 'd', location: { lat: 51.6, lng: -0.2 } });
  });

  it('handles a bare array response', () => {
    const providers = normaliseProviders([
      { pubkey: 'a', npub: 'npub1a', location: { lat: 1, lon: 2 } },
    ]);
    expect(providers).toHaveLength(1);
    expect(providers[0].location).toEqual({ lat: 1, lng: 2 });
  });
});
