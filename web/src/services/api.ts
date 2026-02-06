import type {
  Task, TripEstimate, AvailableDriver, BtcPrices,
  OperatorInfo, Reputation, LatLng,
} from '../types/api';
import type { DomainProfile } from '../types/domain';

const BASE = '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

/** GET /info — operator metadata */
export function getOperatorInfo(): Promise<OperatorInfo> {
  return request('/info');
}

/** GET /health */
export function getHealth(): Promise<{ status: string }> {
  return request('/health');
}

// ── Domain ──────────────────────────────────────────

/** GET /api/domains — list available domains */
export function listDomains(): Promise<{ domains: Array<{ id: string; name: string }> }> {
  return request('/api/domains');
}

/** GET /api/domains/current — active domain profile */
export function getCurrentDomain(): Promise<DomainProfile> {
  return request('/api/domains/current');
}

// ── Rides / Tasks ───────────────────────────────────

/** POST /api/rides/request — create a new ride request */
export function requestRide(params: {
  pickup: LatLng;
  dropoff: LatLng;
  riderPubkey: string;
  riderNpub?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
}): Promise<Task> {
  return request('/api/rides/request', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** POST /api/rides/:id/accept — driver accepts a ride */
export function acceptRide(rideId: string, params: {
  driverPubkey: string;
  driverNpub?: string;
  driverLocation: LatLng;
}): Promise<Task> {
  return request(`/api/rides/${rideId}/accept`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** POST /api/rides/:id/location — update driver location */
export function updateLocation(rideId: string, params: {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  driverPubkey: string;
}): Promise<{ success: boolean }> {
  return request(`/api/rides/${rideId}/location`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** POST /api/rides/:id/arrive — driver arrives at pickup */
export function arriveAtPickup(rideId: string, params: {
  driverPubkey: string;
}): Promise<Task> {
  return request(`/api/rides/${rideId}/arrive`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** POST /api/rides/:id/start — start trip */
export function startTrip(rideId: string, params: {
  driverPubkey: string;
}): Promise<Task> {
  return request(`/api/rides/${rideId}/start`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** POST /api/rides/:id/complete — complete trip */
export function completeTrip(rideId: string, params: {
  driverPubkey?: string;
}): Promise<Task> {
  return request(`/api/rides/${rideId}/complete`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** POST /api/rides/:id/cancel — cancel ride */
export function cancelRide(rideId: string, params: {
  cancelledBy: string;
  reason?: string;
}): Promise<{ success: boolean }> {
  return request(`/api/rides/${rideId}/cancel`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** POST /api/rides/:id/rate — submit rating */
export function submitRating(rideId: string, params: {
  rating: number;
  comment?: string;
  raterPubkey: string;
  raterRole: 'rider' | 'driver';
}): Promise<{ success: boolean }> {
  return request(`/api/rides/${rideId}/rate`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** POST /api/rides/:id/tip — send tip */
export function sendTip(rideId: string, params: {
  amountSats: number;
  riderPubkey: string;
}): Promise<{ success: boolean }> {
  return request(`/api/rides/${rideId}/tip`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** POST /api/rides/:id/panic — trigger panic alert */
export function triggerPanic(rideId: string, params: {
  triggeredBy: string;
  location: LatLng;
}): Promise<{ success: boolean }> {
  return request(`/api/rides/${rideId}/panic`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** POST /api/rides/:id/check-in — respond to safety check */
export function respondToCheckIn(rideId: string, params: {
  respondedBy: string;
  status: 'ok' | 'help';
}): Promise<{ success: boolean }> {
  return request(`/api/rides/${rideId}/check-in`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** GET /api/rides/:id — get ride details */
export function getRide(rideId: string): Promise<Task> {
  return request(`/api/rides/${rideId}`);
}

/** GET /api/rides/stats */
export function getRideStats(): Promise<{
  total: number;
  active: number;
  completed: number;
  cancelled: number;
}> {
  return request('/api/rides/stats');
}

// ── Stakes ──────────────────────────────────────────

/** POST /rides/:id/rider-stake — post rider stake */
export function postRiderStake(rideId: string, params: {
  riderPubkey: string;
}): Promise<{ invoice: string; amountSats: number; paymentHash: string }> {
  return request(`/rides/${rideId}/rider-stake`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** POST /rides/:id/driver-stake — post driver stake */
export function postDriverStake(rideId: string, params: {
  driverPubkey: string;
}): Promise<{ invoice: string; amountSats: number; paymentHash: string }> {
  return request(`/rides/${rideId}/driver-stake`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ── Estimates & Pricing ─────────────────────────────

/** POST /api/trips/estimate — get fare estimate */
export function getTripEstimate(params: {
  pickup: LatLng;
  dropoff: LatLng;
}): Promise<TripEstimate> {
  return request('/api/trips/estimate', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** POST /api/routes/preview — get route preview */
export function getRoutePreview(params: {
  pickup: LatLng;
  dropoff: LatLng;
}): Promise<{ geometry: string; distanceKm: number; durationMin: number }> {
  return request('/api/routes/preview', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** GET /api/prices/btc — current BTC prices */
export function getBtcPrices(): Promise<BtcPrices> {
  return request('/api/prices/btc');
}

// ── Drivers ─────────────────────────────────────────

/** GET /api/drivers/available */
export function getAvailableDrivers(params?: {
  lat?: number;
  lng?: number;
  radiusKm?: number;
}): Promise<{ drivers: AvailableDriver[] }> {
  const qs = new URLSearchParams();
  if (params?.lat) qs.set('lat', String(params.lat));
  if (params?.lng) qs.set('lng', String(params.lng));
  if (params?.radiusKm) qs.set('radius', String(params.radiusKm));
  const suffix = qs.toString() ? `?${qs}` : '';
  return request(`/api/drivers/available${suffix}`);
}

// ── Reputation ──────────────────────────────────────

/** GET /api/reputation/:npub */
export function getReputation(npub: string): Promise<Reputation> {
  return request(`/api/reputation/${npub}`);
}
