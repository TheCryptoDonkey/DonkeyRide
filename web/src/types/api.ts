/** Location coordinates */
export interface LatLng {
  lat: number;
  lng: number;
}

/** An intermediate stop on a multi-stop trip */
export interface TaskStop extends LatLng {
  address?: string;
}

/**
 * A licence, registration or insurance a provider says they hold.
 *
 * Self-attested: the operator records the claim and shows it, exactly as
 * it records a rating without asserting one. Expiry is part of the claim,
 * because a licence that ran out in March is not a licence.
 */
export interface DeclaredCredential {
  id: string;
  /** Unix ms — an expired claim is dropped rather than displayed */
  expiresAt?: number;
  /** Licence or policy number, participant-gated */
  reference?: string;
}

/** The provider's vehicle — participant-gated, set on accept */
export interface TaskVehicle {
  make?: string;
  model?: string;
  colour?: string;
  registration?: string;
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
  /** Exact stops — participant-gated detail only */
  stops?: TaskStop[];
  /** Stop count — the only stop information pre-accept payloads carry */
  stopCount?: number;
  /** The car to look for — participant-gated detail only */
  vehicle?: TaskVehicle | null;
  /** Requester asked to be matched only with declared-women drivers */
  womenOnly?: boolean;
  /** Access needs this journey requires (wheelchair, child_seat…) */
  accessNeeds?: string[];
  pickupAddress?: string;
  dropoffAddress?: string;
  /** Meeting instructions for the provider — participant-gated free text */
  pickupNote?: string;
  /** Requested service class (domain ride option), e.g. 'standard' | 'xl' */
  option?: string;
  /** Waiting charged after the free period, added to the agreed fare */
  waiting?: { minutes: number; sats: number };
  fareEstimateSats: number;
  fareEstimateFiat?: FiatAmount;
  distanceKm?: number;
  durationMin?: number;
  /** Encoded polyline string, or decoded [lat, lng] positions */
  routeGeometry?: string | [number, number][];
  requesterStake?: StakeInfo;
  providerStake?: StakeInfo;
  /** Unix ms pickup time for a pre-booked task; null/absent = immediate */
  scheduledFor?: number | null;
  settlement?: SettlementInfo;
  /** Why a cancelled task ended — 'no_providers' when the search found nobody */
  cancellationReason?: string;
  /** The structured half of that: a code from the cancelling side's vocabulary */
  cancellationReasonCode?: string;
  /** Which side gave that reason */
  cancelledSide?: 'requester' | 'provider';
  /**
   * Licences and cover the provider declared at accept. Self-attested and
   * participant-gated — the operator verifies none of it and says so.
   */
  providerCredentials?: DeclaredCredential[];
  /**
   * Who is actually travelling, when the requester booked for someone else.
   * Participant-gated free text; never broadcast, never snapshotted.
   */
  passenger?: { name?: string; note?: string };
  /** They committed then dropped it, past the grace window and pre-start */
  lateCancellation?: boolean;
  createdAt: string;
  /** When the provider marked arrival — waiting time counts from here */
  arrivedAt?: string;
  startedAt?: string;
  completedAt?: string;
  rating?: number;
  tip?: number;
  quote?: TaskQuote;
  /**
   * Set when this job was discovered via a Nostr announcement from a
   * DIFFERENT operator (federation): that operator's API origin. The job
   * is coordinated there, not by the operator this app is connected to.
   */
  operatorBase?: string;
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
  verifyMethod: 'preimage' | 'confirmation_code' | 'manual' | 'declared';
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
  // Cashu — optional NUT-18 payment request the driver advertised
  paymentRequest?: string;
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

/** Trip estimate response */
/** A service class as priced for this trip */
export interface ServiceOptionPrice {
  id: string;
  label: string;
  description?: string | null;
  seats?: number | null;
  fareSats: number;
  fareFormatted?: string;
  /** Rows that sum to this class's fare */
  fareBreakdown?: {
    baseFareSats: number;
    distanceFareSats: number;
    timeFareSats: number;
    operatorFeeSats: number;
  };
}

export interface TripEstimate {
  distanceKm: number;
  durationMinutes: number;
  fareEstimateSats: number;
  fareBreakdown: {
    baseFareSats: number;
    distanceFareSats: number;
    timeFareSats: number;
    operatorFeeSats: number;
  };
  fiatEstimate?: FiatAmount;
  routeGeometry?: string | [number, number][];
  /** True when a real road route backed the price (not a straight line) */
  routed?: boolean;
  /** Demand pricing, disclosed before the rider commits (never after) */
  surge?: {
    multiplier: number;
    active: boolean;
    reason?: string | null;
    waiting?: number;
    available?: number;
  };
  /** Per-class prices when the domain defines service classes */
  options?: ServiceOptionPrice[];
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

/**
 * Reputation summary (GET /api/reputation/:npub) — aggregated server-side
 * from signature-verified Nostr rating events (kind 30520), deduped to one
 * rating per (rater, task).
 */
export interface Reputation {
  pubkey: string;
  npub: string;
  averageRating: number;
  ratingsCount: number;
  distinctRaters: number;
  /** Unix seconds of the newest rating, null when unrated */
  lastRatingAt: number | null;
  /** Verified kind 30540 emergency signals raised BY this keypair */
  panicCount: number;
  latestPanicAt: number | null;
  /** Counterparty-signed no-show reports (no_show-flagged 30520 events) */
  noShowCount?: number;
  /** Counterparty-signed late-cancellation reports (late_cancel-flagged) */
  lateCancelCount?: number;
  latestLateCancelAt?: number | null;
  latestNoShowAt?: number | null;
}

/**
 * One in-app chat message — a NIP-17 gift-wrapped DM exchanged directly
 * between the two participants over public relays. End-to-end encrypted:
 * the operator never carries or sees it.
 */
export interface ChatMessage {
  /** The unwrapped rumor's event id (stable across both wrapped copies) */
  id: string;
  /** Sender pubkey (hex) */
  from: string;
  text: string;
  /** Epoch milliseconds */
  at: number;
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
  | { type: 'location_update'; taskId?: string; location: LatLng; heading?: number; speed?: number; etaSeconds?: number | null }
  | { type: 'pickup_updated'; taskId?: string; pickup: LatLng; address?: string; movedMetres?: number }
  | {
      type: 'dropoff_updated';
      taskId?: string;
      dropoff: LatLng;
      address?: string;
      stops?: TaskStop[];
      movedMetres?: number;
      /** The re-priced fare, and what it was before — never a silent change */
      fareSats?: number;
      previousFareSats?: number;
      distanceKm?: number;
      durationMinutes?: number;
    }
  | { type: 'panic_alert'; taskId?: string; triggeredBy?: string; location?: LatLng | null }
  | { type: 'rating_submitted'; taskId?: string; rating?: number }
  | { type: 'tip_sent'; taskId?: string; amountSats?: number }
  | {
      type: 'task_cancelled';
      taskId?: string;
      cancelledBy?: string;
      reason?: string;
      /** The structured half: a code from the cancelling side's vocabulary */
      reasonCode?: string | null;
      cancelledSide?: 'requester' | 'provider' | null;
      lateCancellation?: boolean;
    }
  | { type: 'task_broadcast'; task: Record<string, unknown>; distanceKm?: number }
  | { type: 'scheduled_reminder'; taskId?: string; scheduledFor: number }
  | { type: 'searching'; taskId?: string; attempt: number; radiusKm: number; providersNotified: number; expiresInMs: number }
  | { type: 'settlement_declared'; taskId?: string; rail?: string; verified?: boolean }
  | { type: 'settlement_confirmed'; taskId?: string; rail?: string }
  | { type: 'auth_ok'; pubkey: string }
  | { type: 'error'; error: string };
