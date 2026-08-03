import type {
  Task, TaskQuote, TripEstimate, AvailableProvider, BtcPrices,
  OperatorInfo, Reputation, LatLng, SettlementInfo,
  SettlementRail, PaymentMethod, PaymentOptions, PayInstruction,
  SettlementProof, SettlementRecord,
} from '../types/api';
import type { DomainProfile } from '../types/domain';
import { createNip98Auth, signNostrEvent } from './nostr';
import { publishToRelays } from './relays';
import { getCurrencySymbol } from './pricing';

// Same-origin by default; native (Capacitor) builds bake in the operator URL
const BASE = import.meta.env.VITE_API_BASE || '';

/** The operator origin this app instance talks to (absolute) */
export function getApiBase(): string {
  return BASE || window.location.origin;
}

/** Error thrown for non-2xx responses — carries the HTTP status code */
export class ApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Module-level auth private key — set via setAuthPrivKey() */
let _authPrivKey: string | null = null;

/** Set the private key used for NIP-98 auth headers */
export function setAuthPrivKey(key: string | null) {
  _authPrivKey = key;
}

/** Read the private key used for NIP-98 auth (WebSocket auth handshake reuses it) */
export function getAuthPrivKey(): string | null {
  return _authPrivKey;
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
    throw new ApiError(body.error || `${res.status} ${res.statusText}`, res.status);
  }
  return res.json();
}

// ── Response normalisation ──────────────────────────

/** Convert a backend location {lat, lon} to frontend {lat, lng} */
function normLoc(loc: { lat: number; lon?: number; lng?: number } | null | undefined): LatLng | null {
  if (!loc || typeof loc.lat !== 'number') return null;
  const lng = loc.lng ?? loc.lon;
  if (typeof lng !== 'number') return null;
  return { lat: loc.lat, lng };
}

/**
 * Normalise a route field: encoded polyline strings pass through,
 * coordinate arrays ([lon, lat] pairs from the routing engine) are
 * converted to [lat, lng] positions Leaflet can render directly.
 */
export function normaliseRoute(route: unknown): string | [number, number][] | undefined {
  if (typeof route === 'string') return route || undefined;
  if (Array.isArray(route)) {
    const positions: [number, number][] = [];
    for (const pt of route) {
      if (Array.isArray(pt) && pt.length >= 2
          && typeof pt[0] === 'number' && typeof pt[1] === 'number') {
        positions.push([pt[1], pt[0]]); // [lon, lat] → [lat, lng]
      }
    }
    return positions;
  }
  return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normaliseSettlement(raw: any): SettlementInfo | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const amount = raw.amount_sats ?? raw.amountSats ?? raw.amount;
  return {
    amountSats: typeof amount === 'number' ? amount : undefined,
    method: raw.method ?? raw.rail ?? undefined,
    rail: raw.rail ?? raw.method ?? undefined,
    status: raw.status ?? undefined,
    verified: raw.verified === true,
    confirmedByProvider: raw.confirmedByProvider === true,
  };
}

/**
 * Normalise any backend ride/task object into the frontend Task shape.
 * Handles both the raw ride record and the various response wrappers.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normaliseTask(raw: any): Task {
  // The backend may wrap in { success, ride } or { success, ride_id, ... }
  const r = raw.ride || raw;

  // Broadcasts carry distance as a bare km number
  const distanceKm = r.distance_km ?? r.distanceKm
    ?? (typeof r.distance === 'number' ? r.distance : r.distance?.km);

  return {
    id: r.id || r.ride_id || '',
    status: r.status || '',
    requesterPubkey: r.rider?.pubkey || r.requester?.pubkey || r.requesterPubkey || '',
    providerPubkey: r.driver?.pubkey || r.provider?.pubkey || r.providerPubkey,
    providerNpub: r.driver?.npub || r.provider?.npub || r.providerNpub,
    pickup: normLoc(r.pickup) || { lat: 0, lng: 0 },
    dropoff: normLoc(r.dropoff),
    // Exact stops arrive only on the participant-gated detail; pre-accept
    // payloads carry stopCount alone
    stops: Array.isArray(r.stops)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? r.stops.flatMap((s: any) => {
          const loc = normLoc(s);
          return loc ? [{ ...loc, ...(s.address ? { address: s.address } : {}) }] : [];
        })
      : undefined,
    stopCount: typeof r.stopCount === 'number' ? r.stopCount
      : Array.isArray(r.stops) ? r.stops.length : undefined,
    vehicle: r.vehicle && typeof r.vehicle === 'object' ? {
      make: r.vehicle.make || undefined,
      model: r.vehicle.model || undefined,
      colour: r.vehicle.colour || undefined,
      registration: r.vehicle.registration || undefined,
    } : undefined,
    womenOnly: r.womenOnly === true || r.women_only === true || undefined,
    fareEstimateSats: r.fare ?? r.fareEstimateSats ?? r.estimated_fare ?? 0,
    distanceKm,
    durationMin: r.duration_minutes ?? r.durationMin,
    routeGeometry: normaliseRoute(r.route ?? r.routeGeometry),
    scheduledFor: r.scheduledFor ?? r.scheduled_for ?? null,
    settlement: normaliseSettlement(r.settlementRecord ?? r.settlement),
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

/**
 * Normalise the available-providers response: backend sends {lat, lon},
 * the frontend (and Leaflet) need {lat, lng}. Entries without a usable
 * location are dropped so they can never reach a map marker.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normaliseProviders(raw: any): AvailableProvider[] {
  const list = Array.isArray(raw) ? raw : raw?.drivers || raw?.providers || [];
  const providers: AvailableProvider[] = [];
  for (const d of list) {
    const location = normLoc(d?.location);
    if (!location) continue;
    providers.push({ ...d, location });
  }
  return providers;
}

// ── General ─────────────────────────────────────────

/** GET /info — operator metadata */
export async function getOperatorInfo(): Promise<OperatorInfo> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any = await request('/info');
  if (raw?.payment && raw.payment.trustModel === undefined && raw.payment.trust_model !== undefined) {
    raw.payment.trustModel = raw.payment.trust_model;
  }
  return raw as OperatorInfo;
}

let _operatorInfoPromise: Promise<OperatorInfo> | null = null;

/** Cached GET /info — one fetch shared by relays, stakes and payment copy */
export function getOperatorInfoCached(): Promise<OperatorInfo> {
  if (!_operatorInfoPromise) {
    _operatorInfoPromise = getOperatorInfo().catch((err) => {
      _operatorInfoPromise = null;
      throw err;
    });
  }
  return _operatorInfoPromise;
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
  /** Unix ms pickup time for a pre-booked task */
  scheduledFor?: number | null;
  /** Intermediate stops in visit order (≤3) */
  stops?: { lat: number; lng: number; address?: string }[];
  /** Match only with drivers who have declared they are women */
  womenOnly?: boolean;
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

  if (params.scheduledFor) {
    body.scheduled_for = params.scheduledFor;
  }

  if (params.womenOnly) {
    body.women_only = true;
  }

  if (params.dropoff) {
    body.dropoff_lat = params.dropoff.lat;
    body.dropoff_lon = params.dropoff.lng;
  }

  if (params.stops && params.stops.length > 0) {
    body.stops = params.stops.map((s) => ({
      lat: s.lat,
      lon: s.lng,
      ...(s.address ? { address: s.address } : {}),
    }));
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
  /** The car the requester should look for (device-local profile) */
  vehicle?: { make?: string; model?: string; colour?: string; registration?: string } | null;
  /** Self-declared gender — required to accept a women-only task */
  gender?: 'woman' | 'man' | null;
}): Promise<Task> {
  const raw = await request<Record<string, unknown>>(`/api/tasks/${taskId}/accept`, {
    method: 'POST',
    body: JSON.stringify({
      driver_pubkey: params.providerPubkey,
      driver_npub: params.providerNpub,
      // Server reads .lon, not .lng
      driver_location: {
        lat: params.providerLocation.lat,
        lon: params.providerLocation.lng,
      },
      ...(params.vehicle ? { vehicle: params.vehicle } : {}),
      ...(params.gender ? { gender: params.gender } : {}),
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

/**
 * POST /api/tasks/:id/rate — submit rating.
 * Builds a user-signed kind 30520 rating event (TROTT-03), posts it to the
 * operator and best-effort publishes it directly to public relays so the
 * reputation exists independently of the operator.
 */
export async function submitRating(taskId: string, params: {
  rating: number;
  comment?: string;
  raterRole: 'requester' | 'provider';
  targetPubkey?: string;
  domainId: string;
}): Promise<{ success: boolean }> {
  if (!_authPrivKey) {
    throw new Error('No identity available to sign the rating');
  }

  const tags: string[][] = [
    ['ride', taskId],
    ['rating', String(params.rating)],
    ['role', params.raterRole === 'requester' ? 'rider' : 'driver'],
  ];
  if (params.targetPubkey) tags.push(['p', params.targetPubkey]);
  tags.push(['domain', params.domainId]);

  const event = await signNostrEvent({
    kind: 30520,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: params.comment || '',
  }, _authPrivKey);

  const res = await request<{ success: boolean }>(`/api/tasks/${taskId}/rate`, {
    method: 'POST',
    body: JSON.stringify({ event }),
  });

  // Best-effort decentralised publish — never blocks the UI
  void publishToRelays(event);

  return res;
}

/**
 * Report a no-show: a counterparty-signed kind 30520 event carrying a
 * no_show flag (and a 1-star rating, so every aggregator prices it in).
 * Published straight to public relays — reputation never depends on the
 * operator — and best-effort posted to the operator's rate endpoint so
 * its fallback aggregate sees it too. Mode A holds no money: no-show
 * accountability is reputational, and it is signed by the wronged party,
 * never asserted by the operator.
 */
export async function reportNoShow(taskId: string, params: {
  targetPubkey: string;
  reporterRole: 'requester' | 'provider';
  domainId?: string;
}): Promise<void> {
  if (!_authPrivKey) {
    throw new Error('No identity available to sign the report');
  }

  const tags: string[][] = [
    ['ride', taskId],
    ['rating', '1'],
    ['no_show', 'true'],
    ['role', params.reporterRole === 'requester' ? 'rider' : 'driver'],
    ['p', params.targetPubkey],
  ];
  if (params.domainId) tags.push(['domain', params.domainId]);

  const event = await signNostrEvent({
    kind: 30520,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: 'no_show',
  }, _authPrivKey);

  void publishToRelays(event);
  try {
    await request(`/api/tasks/${taskId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ event }),
    });
  } catch {
    // The relays are the primary rail; the operator copy is best-effort
  }
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

/**
 * POST /api/tasks/:id/panic — trigger panic alert.
 * Builds a user-signed kind 30540 event, posts it to the operator and
 * best-effort publishes it directly to public relays.
 */
export async function triggerPanic(taskId: string, params: {
  role: 'requester' | 'provider';
  location?: LatLng | null;
}): Promise<{ success: boolean }> {
  if (!_authPrivKey) {
    throw new Error('No identity available to sign the alert');
  }

  const tags: string[][] = [
    ['ride', taskId],
    ['role', params.role === 'requester' ? 'rider' : 'driver'],
  ];
  if (params.location) {
    tags.push(['location', JSON.stringify({ lat: params.location.lat, lng: params.location.lng })]);
  }

  const event = await signNostrEvent({
    kind: 30540,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: 'panic',
  }, _authPrivKey);

  const res = await request<{ success: boolean }>(`/api/tasks/${taskId}/panic`, {
    method: 'POST',
    body: JSON.stringify({ event }),
  });

  void publishToRelays(event);

  return res;
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

/**
 * GET /api/participants/:pubkey/active — the participant's latest
 * non-terminal task (as requester or provider), or null.
 * Used to recover an active task after an app/tab restart.
 */
export async function getActiveParticipantTask(pubkey: string): Promise<Task | null> {
  const raw = await request<{ task: Record<string, unknown> | null }>(
    `/api/participants/${pubkey}/active`,
  );
  return raw.task ? normaliseTask(raw.task) : null;
}

/**
 * GET /api/tasks/open — every open (unaccepted) task, so a provider can
 * browse all waiting requesters rather than only catching live broadcasts.
 * Filter by working-area geohash cells, or by proximity to a location
 * (operator dispatch radius). Payload mirrors the WS broadcast: no
 * requester identity beyond the task itself.
 */
export async function getOpenTasks(params?: {
  location?: LatLng;
  areas?: string[];
  /** Self-declared — women-only tasks are only listed to declared women */
  gender?: 'woman' | 'man';
}): Promise<Task[]> {
  const query = new URLSearchParams();
  if (params?.areas && params.areas.length > 0) {
    query.set('areas', params.areas.join(','));
  } else if (params?.location) {
    query.set('lat', String(params.location.lat));
    query.set('lon', String(params.location.lng));
  }
  if (params?.gender) {
    query.set('gender', params.gender);
  }
  const qs = query.toString();
  const raw = await request<{ rides: Record<string, unknown>[] }>(
    `/api/tasks/open${qs ? `?${qs}` : ''}`,
  );
  return (raw.rides || []).map(normaliseTask);
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

/** Stake endpoint response — instant rails lock immediately, others await payment */
export interface StakeResponse {
  success?: boolean;
  status?: string;
  invoice?: string;
  confirm?: string;
  amountSats?: number;
  amount_sats?: number;
  paymentHash?: string;
}

/** POST /api/tasks/:id/requester-stake — post requester stake */
export function postRequesterStake(taskId: string, params: {
  requesterPubkey: string;
}): Promise<StakeResponse> {
  return request(`/api/tasks/${taskId}/requester-stake`, {
    method: 'POST',
    body: JSON.stringify({
      requesterPubkey: params.requesterPubkey,
      riderPubkey: params.requesterPubkey,
    }),
  });
}

/** POST /api/tasks/:id/provider-stake — post provider stake */
export function postProviderStake(taskId: string, params: {
  providerPubkey: string;
}): Promise<StakeResponse> {
  return request(`/api/tasks/${taskId}/provider-stake`, {
    method: 'POST',
    body: JSON.stringify({
      providerPubkey: params.providerPubkey,
      driverPubkey: params.providerPubkey,
    }),
  });
}

/** POST /api/tasks/:id/requester-stake/confirm — confirm a non-instant stake payment */
export function confirmRequesterStake(taskId: string, params: {
  requesterPubkey: string;
}): Promise<StakeResponse> {
  return request(`/api/tasks/${taskId}/requester-stake/confirm`, {
    method: 'POST',
    body: JSON.stringify({
      requesterPubkey: params.requesterPubkey,
      riderPubkey: params.requesterPubkey,
    }),
  });
}

/** POST /api/tasks/:id/provider-stake/confirm — confirm a non-instant stake payment */
export function confirmProviderStake(taskId: string, params: {
  providerPubkey: string;
}): Promise<StakeResponse> {
  return request(`/api/tasks/${taskId}/provider-stake/confirm`, {
    method: 'POST',
    body: JSON.stringify({
      providerPubkey: params.providerPubkey,
      driverPubkey: params.providerPubkey,
    }),
  });
}

// ── Non-custodial settlement ────────────────────────
// The operator holds NO funds. The rider pays the driver DIRECTLY over the
// driver's chosen rail; the operator only advertises accepted rails, resolves
// a payable artefact, and records/verifies proof. custody is always 'none'.

/** GET /api/settlement/rails — the catalogue of rails a driver can offer */
export async function getSettlementRails(): Promise<SettlementRail[]> {
  const raw = await request<{ rails: SettlementRail[] }>('/api/settlement/rails');
  return raw.rails || [];
}

/**
 * POST /api/rides/:id/payment-methods (driver, signed) — declare the rails the
 * driver accepts for this ride, each with its handle (omit handle for cash).
 */
export function setPaymentMethods(rideId: string, params: {
  methods: PaymentMethod[];
}): Promise<{ success: boolean; methods: Array<{ rail: string }> }> {
  return request(`/api/rides/${rideId}/payment-methods`, {
    method: 'POST',
    body: JSON.stringify({ methods: params.methods }),
  });
}

/** GET /api/rides/:id/payment-options (participant, signed) — the driver's rails */
export function getPaymentOptions(rideId: string): Promise<PaymentOptions> {
  return request(`/api/rides/${rideId}/payment-options`);
}

/**
 * POST /api/rides/:id/pay-instruction (rider, signed) — resolve a payable
 * artefact for a rail (e.g. the driver's Lightning Address to a bolt11 the
 * rider's own wallet pays).
 */
export function getPayInstruction(rideId: string, params: {
  rail: string;
}): Promise<PayInstruction> {
  return request(`/api/rides/${rideId}/pay-instruction`, {
    method: 'POST',
    body: JSON.stringify({ rail: params.rail }),
  });
}

/**
 * POST /api/rides/:id/settle (rider, signed) — submit proof of a direct
 * payment: {preimage} for lightning/tando, {confirmationCode} for mpesa, {}
 * for cash.
 */
export function settleRide(rideId: string, params: {
  rail: string;
  proof: SettlementProof;
}): Promise<{ success: boolean; settlement: SettlementRecord }> {
  return request(`/api/rides/${rideId}/settle`, {
    method: 'POST',
    body: JSON.stringify({ rail: params.rail, proof: params.proof }),
  });
}

/** POST /api/rides/:id/confirm-received (driver, signed) — confirm funds arrived */
export function confirmReceived(rideId: string): Promise<{
  success: boolean; settlement: SettlementRecord;
}> {
  return request(`/api/rides/${rideId}/confirm-received`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

// ── Estimates & Pricing ─────────────────────────────

/** POST /api/trips/estimate — get fare estimate */
export async function getTripEstimate(params: {
  pickup: LatLng;
  dropoff: LatLng;
  /** Intermediate stops in visit order (≤3) — the estimate covers the detour */
  stops?: { lat: number; lng: number }[];
}): Promise<TripEstimate> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any = await request('/api/trips/estimate', {
    method: 'POST',
    body: JSON.stringify({
      pickup_lat: params.pickup.lat,
      pickup_lon: params.pickup.lng,
      dropoff_lat: params.dropoff.lat,
      dropoff_lon: params.dropoff.lng,
      ...(params.stops && params.stops.length > 0
        ? { stops: params.stops.map((s) => ({ lat: s.lat, lon: s.lng })) }
        : {}),
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
      operatorFeeSats: raw.operatorFee?.sats ?? raw.fareBreakdown?.operatorFeeSats ?? 0,
    },
    fiatEstimate: raw.fare ? {
      amount: raw.fare.fiat,
      currency: raw.fare.currency || raw.currency || 'GBP',
      symbol: getCurrencySymbol(raw.fare.currency || raw.currency || 'GBP'),
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

/** GET /api/prices/btc — current BTC prices (server wraps them in {prices}) */
export async function getBtcPrices(): Promise<BtcPrices> {
  const raw = await request<{ prices?: BtcPrices } & Partial<BtcPrices>>('/api/prices/btc');
  return (raw.prices ?? raw) as BtcPrices;
}

// ── Providers ───────────────────────────────────────

/** GET /api/providers/available */
export async function getAvailableProviders(params?: {
  lat?: number;
  lng?: number;
  radiusKm?: number;
}): Promise<{ drivers: AvailableProvider[] }> {
  const qs = new URLSearchParams();
  if (params?.lat) qs.set('lat', String(params.lat));
  if (params?.lng) qs.set('lng', String(params.lng));
  if (params?.radiusKm) qs.set('radius', String(params.radiusKm));
  const suffix = qs.toString() ? `?${qs}` : '';
  const raw = await request<Record<string, unknown>>(`/api/providers/available${suffix}`);
  return { drivers: normaliseProviders(raw) };
}

// ── Reputation ──────────────────────────────────────

/** GET /api/reputation/:npub (accepts npub or hex pubkey) */
export function getReputation(npub: string): Promise<Reputation> {
  return request(`/api/reputation/${npub}`);
}

// ── Web Push (job alerts) ───────────────────────────

/** GET /api/push/vapid-key — the operator's self-generated VAPID public key */
export async function getVapidKey(): Promise<string | null> {
  const raw = await request<{ key?: string | null }>(`/api/push/vapid-key`);
  return raw.key || null;
}

/** POST /api/push/subscribe — register this device for job alerts */
export function subscribePush(params: {
  subscription: unknown;
  pubkey: string;
  areas?: string[];
  location?: { lat: number; lon: number } | null;
  /** Self-declared, for women-only matching of pushed jobs */
  gender?: 'woman' | 'man' | null;
  women_only?: boolean;
}): Promise<{ success: boolean }> {
  return request(`/api/push/subscribe`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** DELETE /api/push/subscribe — stop job alerts for this driver */
export function unsubscribePush(pubkey: string): Promise<{ success: boolean }> {
  return request(`/api/push/subscribe`, {
    method: 'DELETE',
    body: JSON.stringify({ pubkey }),
  });
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
