import { describe, it, expect } from 'vitest';
import { normaliseWsMessage } from './websocket';

describe('normaliseWsMessage', () => {
  it('maps status_change with top-level fields', () => {
    expect(normaliseWsMessage({
      type: 'status_change',
      ride_id: 'ride-1',
      status: 'accepted',
      previousStatus: 'requested',
    })).toEqual({
      type: 'status_change',
      taskId: 'ride-1',
      status: 'accepted',
      previousStatus: 'requested',
    });
  });

  it('maps ride_matched and task_matched to task_matched', () => {
    const matched = normaliseWsMessage({
      type: 'ride_matched',
      ride_id: 'ride-1',
      driver_pubkey: 'pub',
      driver_location: { lat: 51.5, lon: -0.12 },
    });
    expect(matched).toEqual({
      type: 'task_matched',
      taskId: 'ride-1',
      providerPubkey: 'pub',
      providerLocation: { lat: 51.5, lng: -0.12 },
    });
    expect(normaliseWsMessage({ type: 'task_matched', task_id: 't1' })?.type).toBe('task_matched');
  });

  it('maps lifecycle frames to semantic names', () => {
    expect(normaliseWsMessage({ type: 'driver_arrived', ride_id: 'r' })?.type).toBe('provider_arrived');
    expect(normaliseWsMessage({ type: 'trip_started', ride_id: 'r' })?.type).toBe('task_started');
    expect(normaliseWsMessage({ type: 'ride_completed', ride_id: 'r' })?.type).toBe('task_completed');
    expect(normaliseWsMessage({ type: 'trip_completed', ride_id: 'r' })?.type).toBe('task_completed');
    expect(normaliseWsMessage({ type: 'ride_cancelled', ride_id: 'r', reason: 'x' })).toEqual({
      type: 'task_cancelled', taskId: 'r', cancelledBy: undefined, reason: 'x',
    });
  });

  it('maps location_update with lon at the top level', () => {
    expect(normaliseWsMessage({
      type: 'location_update', ride_id: 'r', lat: 51.5, lon: -0.12, heading: 90,
    })).toEqual({
      type: 'location_update',
      taskId: 'r',
      location: { lat: 51.5, lng: -0.12 },
      heading: 90,
      speed: undefined,
      etaSeconds: null,
    });
  });

  it('carries the pickup ETA so the rider sees "arriving in N min"', () => {
    expect(normaliseWsMessage({
      type: 'location_update', ride_id: 'r', data: { lat: 1, lng: 2, eta_seconds: 240 },
    })).toMatchObject({ type: 'location_update', etaSeconds: 240 });
  });

  it('maps a moved pickup, and ignores one with no coordinates', () => {
    expect(normaliseWsMessage({
      type: 'pickup_updated', ride_id: 'r', pickup: { lat: 51.5, lon: -0.12 }, moved_m: 240,
      address: 'Deansgate',
    })).toEqual({
      type: 'pickup_updated',
      taskId: 'r',
      pickup: { lat: 51.5, lng: -0.12 },
      address: 'Deansgate',
      movedMetres: 240,
    });
    expect(normaliseWsMessage({ type: 'pickup_updated', ride_id: 'r' })).toBeNull();
  });

  it('maps location_update with a nested location object', () => {
    const msg = normaliseWsMessage({
      type: 'location_update', ride_id: 'r', location: { lat: 1, lng: 2 },
    });
    expect(msg).toMatchObject({ type: 'location_update', location: { lat: 1, lng: 2 } });
  });

  it('maps panic, rating and tip frames', () => {
    expect(normaliseWsMessage({ type: 'panic_alert', ride_id: 'r' })?.type).toBe('panic_alert');
    expect(normaliseWsMessage({ type: 'rating_submitted', ride_id: 'r', rating: 5 }))
      .toMatchObject({ type: 'rating_submitted', rating: 5 });
    expect(normaliseWsMessage({ type: 'tip_sent', ride_id: 'r', amount_sats: 210 }))
      .toMatchObject({ type: 'tip_sent', amountSats: 210 });
  });

  it('maps ride_request broadcasts with distance', () => {
    const msg = normaliseWsMessage({
      type: 'ride_request',
      ride: { id: 'r1', status: 'requested' },
      distance: 2.4,
    });
    expect(msg).toEqual({
      type: 'task_broadcast',
      task: { id: 'r1', status: 'requested' },
      distanceKm: 2.4,
    });
  });

  it('maps auth frames and rejects unknown or malformed input', () => {
    expect(normaliseWsMessage({ type: 'auth_ok', pubkey: 'p' }))
      .toEqual({ type: 'auth_ok', pubkey: 'p' });
    expect(normaliseWsMessage({ type: 'error', error: 'auth_required' }))
      .toEqual({ type: 'error', error: 'auth_required' });
    expect(normaliseWsMessage({ type: 'mystery_frame' })).toBeNull();
    expect(normaliseWsMessage(null)).toBeNull();
    expect(normaliseWsMessage('nonsense')).toBeNull();
  });
});
