import type {
  Task, TaskQuote, TripEstimate, AvailableProvider, BtcPrices,
  OperatorInfo, Reputation, LatLng,
} from '../types/api';
import type { DomainProfile } from '../types/domain';
import { createNip98Auth } from './nostr';

// Same-origin by default; native (Capacitor) builds bake in the operator URL
const BASE = import.meta.env.VITE_API_BASE || '';

/** Module-level auth private key — set via setAuthPrivKey() */
let _authPrivKey: string | null = null;

/** Set the private key used for NIP-98 auth headers */
export function setAuthPrivKey(key: string | null) {
  _authPrivKey = key;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> || {}),
  };

  // Add NIP-98 auth header if key is set
  if (_authPrivKey) {
    try {
      const url = BASE ? `${BASE}${path}` : `${window.location.origin}${path}`;
      const method = init?.method || 'GET';
      const authToken = await createNip98Auth(url, method, _authPrivKey);
      headers['Authorization'] = `Nostr ${authToken}`;
    } catch {
      // Silently fail — server may not require auth
    }
  }

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

// ── Response normalisation ──────────────────────────

/** Convert a backend location {lat, lon} to frontend {lat, lng} */
function normLoc(loc: { lat: number; lon?: number; lng?: number } | null | undefined): LatLng | null {
  if (!loc) return null;
  return { lat: loc.lat, lng: loc.lng ?? loc.lon ?? 0 };
}

/**
 * Normalise any backend ride/task object into the frontend Task shape.
 * Handles both the raw ride record and the various response wrappers.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normaliseTask(raw: any): Task {
  // The backend may wrap in { success, ride } or { success, ride_id, ... }
  const r = raw.ride || raw;

  return {
    id: r.id || r.ride_id || '',
    status: r.status || '',
    requesterPubkey: r.rider?.pubkey || r.requester?.pubkey || r.requesterPubkey || '',
    providerPubkey: r.driver?.pubkey || r.provider?.pubkey || r.providerPubkey,
    providerNpub: r.driver?.npub || r.provider?.npub || r.providerNpub,
    pickup: normLoc(r.pickup) || { lat: 0, lng: 0 },
    dropoff: normLoc(r.dropoff),
    fareEstimateSats: r.fare ?? r.fareEstimateSats ?? r.estimated_fare ?? 0,
    distanceKm: r.distance_km ?? r.distanceKm,
    durationMin: r.duration_minutes ?? r.durationMin,
    routeGeometry: r.route || r.routeGeometry,
    streamingPayment: r.streaming ? {
      totalPaidSats: r.streaming.totalPaid ?? 0,
      intervalSeconds: 3,
    } : r.streamingPayment,
    createdAt: r.timestamps?.requested
      ? new Date(r.timestamps.requested).toISOString()
      : r.createdAt || new Date().toISOString(),
    startedAt: r.timestamps?.started
      ? new Date(r.timestamps.started).toISOString()
      : r.startedAt,
    completedAt: r.timestamps?.completed
      ? new Date(r.timestamps.completed).toISOString()
      : r.completedAt,
    quote: r.quote ? {
      amountSats: r.quote.amount_sats ?? r.quote.amountSats ?? 0,
      description: r.quote.description || '',
      status: r.quote.status || 'pending',
      submittedAt: r.quote.submitted_at || r.quote.submittedAt || new Date().toISOString(),
      respondedAt: r.quote.responded_at || r.quote.respondedAt,
    } : undefined,
  };
}

// ── General ─────────────────────────────────────────

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
export function listDomains(): Promise<{
  current: string;
  available: Array<{ id: string; name: string; emoji: string }>;
  count: number;
}> {
  return request('/api/domains');
}

/** GET /api/domains/current — active domain profile */
export function getCurrentDomain(): Promise<DomainProfile> {
  return request('/api/domains/current');
}

/** GET /api/domains/:id — get a specific domain profile */
export function getDomain(domainId: string): Promise<DomainProfile> {
  return request(`/api/domains/${domainId}`);
}

// ── Tasks ───────────────────────────────────────────

/** POST /api/tasks/request — create a new task request */
export async function requestTask(params: {
  pickup: LatLng;
  dropoff?: LatLng | null;
  requesterPubkey: string;
  requesterNpub?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  domain?: string;
}): Promise<Task> {
  const body: Record<string, unknown> = {
    pickup_lat: params.pickup.lat,
    pickup_lon: params.pickup.lng,
    rider_pubkey: params.requesterPubkey,
    rider_npub: params.requesterNpub,
  };

  if (params.domain) {
    body.domain = params.domain;
  }

  if (params.dropoff) {
    body.dropoff_lat = params.dropoff.lat;
    body.dropoff_lon = params.dropoff.lng;
  }

  const raw = await request<Record<string, unknown>>('/api/tasks/request', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  // The /request endpoint returns a flat response with ride_id — fetch the full ride
  const rideId = (raw.ride_id || raw.id) as string;
  if (rideId) {
    try {
      return await getTask(rideId);
    } catch {
      // Fall back to normalising whatever we got
    }
  }
  return normaliseTask(raw);
}

/** POST /api/tasks/:id/accept — provider accepts a task */
export async function acceptTask(taskId: string, params: {
  providerPubkey: string;
  providerNpub?: string;
  providerLocation: LatLng;
}): Promise<Task> {
  const raw = await request<Record<string, unknown>>(`/api/tasks/${taskId}/accept`, {
    method: 'POST',
    body: JSON.stringify({
      driver_pubkey: params.providerPubkey,
      driver_npub: params.providerNpub,
      driver_location: params.providerLocation,
    }),
  });
  return normaliseTask(raw);
}

/** POST /api/tasks/:id/location — update provider location */
export function updateLocation(taskId: string, params: {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  providerPubkey: string;
}): Promise<{ success: boolean }> {
  return request(`/api/tasks/${taskId}/location`, {
    method: 'POST',
    body: JSON.stringify({
      lat: params.lat,
      lon: params.lng,
      driverPubkey: params.providerPubkey,
    }),
  });
}

/** POST /api/tasks/:id/arrive — provider arrives at origin */
export async function arriveAtOrigin(taskId: string, params: {
  providerPubkey: string;
}): Promise<Task> {
  const raw = await request<Record<string, unknown>>(`/api/tasks/${taskId}/arrive`, {
    method: 'POST',
    body: JSON.stringify({ driverPubkey: params.providerPubkey }),
  });
  return normaliseTask(raw);
}

/** POST /api/tasks/:id/start — start active phase */
export async function startTask(taskId: string, params: {
  providerPubkey: string;
}): Promise<Task> {
  const raw = await request<Record<string, unknown>>(`/api/tasks/${taskId}/start`, {
    method: 'POST',
    body: JSON.stringify({ driverPubkey: params.providerPubkey }),
  });
  return normaliseTask(raw);
}

/** POST /api/tasks/:id/complete — complete task */
export async function completeTask(taskId: string, params: {
  providerPubkey?: string;
}): Promise<Task> {
  const raw = await request<Record<string, unknown>>(`/api/tasks/${taskId}/complete`, {
    method: 'POST',
    body: JSON.stringify({ driverPubkey: params.providerPubkey }),
  });
  return normaliseTask(raw);
}

/** POST /api/tasks/:id/transition — generic state transition */
export async function transitionTask(taskId: string, params: {
  targetState: string;
  providerPubkey?: string;
  metadata?: Record<string, unknown>;
}): Promise<Task> {
  const raw = await request<Record<string, unknown>>(`/api/tasks/${taskId}/transition`, {
    method: 'POST',
    body: JSON.stringify({
      targetState: params.targetState,
      driverPubkey: params.providerPubkey,
      metadata: params.metadata,
    }),
  });
  return normaliseTask(raw);
}

/** POST /api/tasks/:id/cancel — cancel task */
export function cancelTask(taskId: string, params: {
  cancelledBy: string;
  reason?: string;
}): Promise<{ success: boolean }> {
  return request(`/api/tasks/${taskId}/cancel`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** POST /api/tasks/:id/rate — submit rating */
export function submitRating(taskId: string, params: {
  rating: number;
  comment?: string;
  raterPubkey: string;
  raterRole: 'requester' | 'provider';
}): Promise<{ success: boolean }> {
  return request(`/api/tasks/${taskId}/rate`, {
    method: 'POST',
    body: JSON.stringify({
      ...params,
      // Backend expects rider/driver for now
      raterRole: params.raterRole === 'requester' ? 'rider' : 'driver',
    }),
  });
}

/** POST /api/tasks/:id/tip — send tip */
export function sendTip(taskId: string, params: {
  amountSats: number;
  requesterPubkey: string;
}): Promise<{ success: boolean }> {
  return request(`/api/tasks/${taskId}/tip`, {
    method: 'POST',
    body: JSON.stringify({
      amount_sats: params.amountSats,
      riderPubkey: params.requesterPubkey,
    }),
  });
}

/** POST /api/tasks/:id/panic — trigger panic alert */
export function triggerPanic(taskId: string, params: {
  triggeredBy: string;
  location: LatLng;
}): Promise<{ success: boolean }> {
  return request(`/api/tasks/${taskId}/panic`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** POST /api/tasks/:id/check-in — respond to safety check */
export function respondToCheckIn(taskId: string, params: {
  respondedBy: string;
  status: 'ok' | 'help';
}): Promise<{ success: boolean }> {
  return request(`/api/tasks/${taskId}/check-in`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** GET /api/tasks/:id — get task details */
export async function getTask(taskId: string): Promise<Task> {
  const raw = await request<Record<string, unknown>>(`/api/tasks/${taskId}`);
  return normaliseTask(raw);
}

/** GET /api/tasks/stats */
export function getTaskStats(): Promise<{
  total: number;
  active: number;
  completed: number;
  cancelled: number;
}> {
  return request('/api/tasks/stats');
}

// ── Stakes ──────────────────────────────────────────

/** POST /rides/:id/rider-stake — post requester stake */
export function postRequesterStake(taskId: string, params: {
  requesterPubkey: string;
}): Promise<{ invoice: string; amountSats: number; paymentHash: string }> {
  return request(`/rides/${taskId}/rider-stake`, {
    method: 'POST',
    body: JSON.stringify({ riderPubkey: params.requesterPubkey }),
  });
}

/** POST /rides/:id/driver-stake — post provider stake */
export function postProviderStake(taskId: string, params: {
  providerPubkey: string;
}): Promise<{ invoice: string; amountSats: number; paymentHash: string }> {
  return request(`/rides/${taskId}/driver-stake`, {
    method: 'POST',
    body: JSON.stringify({ driverPubkey: params.providerPubkey }),
  });
}

// ── Estimates & Pricing ─────────────────────────────

/** POST /api/trips/estimate — get fare estimate */
export async function getTripEstimate(params: {
  pickup: LatLng;
  dropoff: LatLng;
}): Promise<TripEstimate> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any = await request('/api/trips/estimate', {
    method: 'POST',
    body: JSON.stringify({
      pickup_lat: params.pickup.lat,
      pickup_lon: params.pickup.lng,
      dropoff_lat: params.dropoff.lat,
      dropoff_lon: params.dropoff.lng,
    }),
  });

  // Normalise backend estimate shape to frontend TripEstimate
  return {
    distanceKm: raw.distance?.km ?? raw.distanceKm ?? 0,
    durationMinutes: raw.duration?.minutes ?? raw.durationMinutes ?? 0,
    fareEstimateSats: raw.fare?.sats ?? raw.fareEstimateSats ?? 0,
    fareBreakdown: {
      baseFareSats: raw.fareBreakdown?.baseFareSats ?? Math.round((raw.fare?.sats ?? 0) * 0.3),
      distanceFareSats: raw.fareBreakdown?.distanceFareSats ?? Math.round((raw.fare?.sats ?? 0) * 0.4),
      timeFareSats: raw.fareBreakdown?.timeFareSats ?? Math.round((raw.fare?.sats ?? 0) * 0.2),
      surgeMultiplier: raw.breakdown?.surge?.multiplier ?? raw.fareBreakdown?.surgeMultiplier ?? 1,
      operatorFeeSats: raw.operatorFee?.sats ?? raw.fareBreakdown?.operatorFeeSats ?? 0,
    },
    fiatEstimate: raw.fare ? {
      amount: raw.fare.fiat,
      currency: raw.fare.currency || raw.currency || 'GBP',
      symbol: raw.fare.currency === 'USD' ? '$' : raw.fare.currency === 'EUR' ? '€' : '£',
    } : raw.fiatEstimate,
    routeGeometry: raw.routeGeometry,
  };
}

/** POST /api/routes/preview — get route preview */
export function getRoutePreview(params: {
  pickup: LatLng;
  dropoff: LatLng;
}): Promise<{ geometry: string; distanceKm: number; durationMin: number }> {
  return request('/api/routes/preview', {
    method: 'POST',
    body: JSON.stringify({
      from_lat: params.pickup.lat,
      from_lon: params.pickup.lng,
      to_lat: params.dropoff.lat,
      to_lon: params.dropoff.lng,
    }),
  });
}

/** GET /api/prices/btc — current BTC prices */
export function getBtcPrices(): Promise<BtcPrices> {
  return request('/api/prices/btc');
}

// ── Providers ───────────────────────────────────────

/** GET /api/providers/available */
export function getAvailableProviders(params?: {
  lat?: number;
  lng?: number;
  radiusKm?: number;
}): Promise<{ drivers: AvailableProvider[] }> {
  const qs = new URLSearchParams();
  if (params?.lat) qs.set('lat', String(params.lat));
  if (params?.lng) qs.set('lng', String(params.lng));
  if (params?.radiusKm) qs.set('radius', String(params.radiusKm));
  const suffix = qs.toString() ? `?${qs}` : '';
  return request(`/api/providers/available${suffix}`);
}

// ── Reputation ──────────────────────────────────────

/** GET /api/reputation/:npub */
export function getReputation(npub: string): Promise<Reputation> {
  return request(`/api/reputation/${npub}`);
}

// ── Proof & Quotes ──────────────────────────────────

/** POST /api/tasks/:id/proof — submit completion proof (photo) */
export async function submitProof(taskId: string, params: {
  type: string;
  file: File;
  providerPubkey: string;
}): Promise<{ success: boolean }> {
  // Convert file to base64 data URL for JSON transport
  // (the reference server stores metadata only — real file storage is an operator concern)
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(params.file);
  });

  return request(`/api/tasks/${taskId}/proof`, {
    method: 'POST',
    body: JSON.stringify({
      type: params.type,
      fileName: params.file.name,
      mimeType: params.file.type,
      sizeBytes: params.file.size,
      dataUrl,
      providerPubkey: params.providerPubkey,
    }),
  });
}

/** POST /api/tasks/:id/proof/signature — submit signature proof */
export function submitSignatureProof(taskId: string, params: {
  dataUrl: string;
  providerPubkey: string;
}): Promise<{ success: boolean }> {
  return request(`/api/tasks/${taskId}/proof`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'signature',
      signature: params.dataUrl,
      providerPubkey: params.providerPubkey,
    }),
  });
}

/** POST /api/tasks/:id/quote — provider submits a quote */
export function submitQuote(taskId: string, params: {
  amountSats: number;
  description: string;
  providerPubkey: string;
}): Promise<{ success: boolean; quote: TaskQuote }> {
  return request(`/api/tasks/${taskId}/quote`, {
    method: 'POST',
    body: JSON.stringify({
      amount_sats: params.amountSats,
      description: params.description,
      providerPubkey: params.providerPubkey,
    }),
  });
}

/** POST /api/tasks/:id/quote/accept — requester accepts a quote */
export function acceptQuote(taskId: string, params: {
  requesterPubkey: string;
}): Promise<{ success: boolean }> {
  return request(`/api/tasks/${taskId}/quote/accept`, {
    method: 'POST',
    body: JSON.stringify({
      requesterPubkey: params.requesterPubkey,
    }),
  });
}

/** POST /api/tasks/:id/quote/decline — requester declines a quote */
export function declineQuote(taskId: string, params: {
  requesterPubkey: string;
  reason?: string;
}): Promise<{ success: boolean }> {
  return request(`/api/tasks/${taskId}/quote/decline`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ── Earnings ────────────────────────────────────────

export interface EarningsSummaryBucket { rides: number; sats: number }
export interface DriverEarnings {
  success: boolean;
  summary: { today: EarningsSummaryBucket; week: EarningsSummaryBucket; allTime: EarningsSummaryBucket };
  rides: Array<{
    id: string;
    domain: string;
    completedAt: number | null;
    fare: number;
    tips: number;
    currency: string;
    rating: number | null;
    settlement: { method: string | null; status: string | null; trust_model: string | null } | null;
  }>;
}

/** GET /api/drivers/:pubkey/earnings — driver earnings + completed rides */
export function getDriverEarnings(pubkey: string): Promise<DriverEarnings> {
  return request(`/api/drivers/${pubkey}/earnings`);
}
