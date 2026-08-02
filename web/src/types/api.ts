/** Location coordinates */
export interface LatLng {
  lat: number;
  lng: number;
}

/** A ride/task as returned by the API */
export interface Task {
  id: string;
  status: string;
  requesterPubkey: string;
  providerPubkey?: string;
  providerNpub?: string;
  pickup: LatLng;
  dropoff?: LatLng | null;
  pickupAddress?: string;
  dropoffAddress?: string;
  fareEstimateSats: number;
  fareEstimateFiat?: FiatAmount;
  distanceKm?: number;
  durationMin?: number;
  /** Encoded polyline string, or decoded [lat, lng] positions */
  routeGeometry?: string | [number, number][];
  requesterStake?: StakeInfo;
  providerStake?: StakeInfo;
  streamingPayment?: StreamingPaymentInfo;
  settlement?: SettlementInfo;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  rating?: number;
  tip?: number;
  quote?: TaskQuote;
}

export interface SettlementInfo {
  amountSats?: number;
  method?: string;
  /** Non-custodial rail id (lnaddress|tando|mpesa|cash) */
  rail?: string;
  /** verified | declared | unverified | confirmed */
  status?: string;
  /** True when the operator cryptographically verified the payment (e.g. preimage) */
  verified?: boolean;
  /** Human-readable note, e.g. why a supplied proof was not accepted */
  detail?: string;
  /** True once the driver has confirmed they received the funds */
  confirmedByProvider?: boolean;
}

// ── Non-custodial settlement (rider pays the driver directly) ──

/** A rail from the driver's picker catalogue (GET /api/settlement/rails) */
export interface SettlementRail {
  id: string;
  label: string;
  handleLabel: string | null;
  handleHint: string | null;
  settles: string;
  custody: string;
}

/** An accepted payment method: a rail plus the driver's handle for it */
export interface PaymentMethod {
  rail: string;
  /** Omitted/null for cash */
  handle?: string | null;
}

/** GET /api/rides/:id/payment-options — what the rider can pay on */
export interface PaymentOptions {
  fare: number | null;
  currency: string;
  custody: 'none';
  settlement: 'peer-to-peer';
  methods: PaymentMethod[];
}

/**
 * POST /api/rides/:id/pay-instruction — a payable artefact for a chosen rail.
 * Fields present depend on the rail: lightning/tando carry an invoice, mpesa a
 * number, cash just an amount. Never implies operator custody (custody:'none').
 */
export interface PayInstruction {
  rail: string;
  label?: string;
  custody?: string;
  operator_transmitted?: number;
  verifyMethod: 'preimage' | 'confirmation_code' | 'manual';
  instructions: string;
  currency?: string;
  // Lightning / Tando
  invoice?: string;
  paymentHash?: string | null;
  payLink?: string;
  lnAddress?: string;
  amountSats?: number;
  verifyUrl?: string | null;
  // M-Pesa
  mpesaNumber?: string;
  amount?: number;
  // Cash
}

/** Proof supplied to POST /api/rides/:id/settle, per rail */
export interface SettlementProof {
  preimage?: string;
  confirmationCode?: string;
}

/** The settlement record returned by /settle and /confirm-received */
export interface SettlementRecord {
  rail: string;
  custody: string;
  settlement?: string;
  verified?: boolean;
  status?: string;
  detail?: string | null;
  confirmationCode?: string | null;
  confirmedByProvider?: boolean;
  declaredBy?: string;
}

export interface TaskQuote {
  amountSats: number;
  description: string;
  status: 'pending' | 'accepted' | 'declined' | 'countered';
  submittedAt: string;
  respondedAt?: string;
}

export interface FiatAmount {
  amount: number;
  currency: string;
  symbol: string;
}

export interface StakeInfo {
  amountSats: number;
  paymentHash?: string;
  invoice?: string;
  status: 'pending' | 'locked' | 'released' | 'forfeited';
}

export interface StreamingPaymentInfo {
  totalPaidSats: number;
  intervalSeconds: number;
  lastPaymentAt?: string;
}

/** Trip estimate response */
export interface TripEstimate {
  distanceKm: number;
  durationMinutes: number;
  fareEstimateSats: number;
  fareBreakdown: {
    baseFareSats: number;
    distanceFareSats: number;
    timeFareSats: number;
    surgeMultiplier: number;
    operatorFeeSats: number;
  };
  fiatEstimate?: FiatAmount;
  routeGeometry?: string;
}

/** Available provider (driver, locksmith, courier, etc.) */
export interface AvailableProvider {
  pubkey: string;
  npub: string;
  location: LatLng;
  heading?: number;
  rating?: number;
  totalRides?: number;
  vehicleType?: string;
}

/** @deprecated Use AvailableProvider */
export type AvailableDriver = AvailableProvider;

/** BTC price data */
export interface BtcPrices {
  USD: number;
  GBP: number;
  EUR: number;
  /** BTC/KES — for the M-Pesa and Tando rails */
  KES?: number;
  updatedAt: string;
}

/** Payment section of the operator info response */
export interface OperatorPaymentInfo {
  provider: string;
  trustModel?: string;
  trust_model?: string;
  capabilities?: Record<string, boolean>;
}

/** Operator info response */
export interface OperatorInfo {
  name: string;
  pubkey: string;
  fee: string;
  domain: string;
  domainProfile?: {
    id: string;
    name: string;
    roles: { requester: string; provider: string };
    features: Record<string, boolean>;
  };
  relay?: string;
  public_relays?: string[];
  payment?: OperatorPaymentInfo;
  version?: string;
}

/** Reputation data */
export interface Reputation {
  pubkey: string;
  npub: string;
  averageRating: number;
  totalRatings: number;
  recentRatings: Array<{
    rating: number;
    comment?: string;
    timestamp: number;
  }>;
}

/**
 * Normalised WebSocket messages — a single discriminated union.
 * Raw server frames (ride-centric names, top-level fields) are mapped
 * into these shapes by normaliseWsMessage() in services/websocket.ts.
 */
export type WsMessage =
  | { type: 'status_change'; taskId: string; status: string; previousStatus?: string }
  | { type: 'task_matched'; taskId?: string; providerPubkey?: string; providerLocation?: LatLng | null }
  | { type: 'provider_arrived'; taskId?: string }
  | { type: 'task_started'; taskId?: string }
  | { type: 'task_completed'; taskId?: string }
  | { type: 'location_update'; taskId?: string; location: LatLng; heading?: number; speed?: number }
  | { type: 'panic_alert'; taskId?: string; triggeredBy?: string; location?: LatLng | null }
  | { type: 'rating_submitted'; taskId?: string; rating?: number }
  | { type: 'tip_sent'; taskId?: string; amountSats?: number }
  | { type: 'task_cancelled'; taskId?: string; cancelledBy?: string; reason?: string }
  | { type: 'task_broadcast'; task: Record<string, unknown>; distanceKm?: number }
  | { type: 'settlement_declared'; taskId?: string; rail?: string; verified?: boolean }
  | { type: 'settlement_confirmed'; taskId?: string; rail?: string }
  | { type: 'auth_ok'; pubkey: string }
  | { type: 'error'; error: string };
