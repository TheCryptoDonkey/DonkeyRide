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
  routeGeometry?: string;
  requesterStake?: StakeInfo;
  providerStake?: StakeInfo;
  streamingPayment?: StreamingPaymentInfo;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  rating?: number;
  tip?: number;
  quote?: TaskQuote;
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
  updatedAt: string;
}

/** Operator info response */
export interface OperatorInfo {
  name: string;
  pubkey: string;
  fee: string;
  domain: string;
  domainProfile: {
    id: string;
    name: string;
    roles: { requester: string; provider: string };
    features: Record<string, boolean>;
  };
  relay: string;
  payment: {
    provider: string;
    trustModel: string;
    capabilities: Record<string, boolean>;
  };
  version: string;
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

/** WebSocket message types */
export type WsMessage =
  | { type: 'location_update'; data: { lat: number; lng: number; heading?: number; speed?: number } }
  | { type: 'status_change'; data: { status: string; timestamp: string } }
  | { type: 'payment_stream'; data: { amountSats: number; totalPaidSats: number; paymentHash: string } }
  | { type: 'safety_check'; data: { checkId: string; deadline: string } }
  | { type: 'panic_alert'; data: { triggeredBy: string; location: LatLng; timestamp: string } }
  | { type: 'ride_matched'; data: { rideId: string; driverPubkey: string; driverLocation: LatLng } }
  | { type: 'task_matched'; data: { id: string; status: string } }
  | { type: 'driver_assigned'; data: Task }
  | { type: 'provider_assigned'; data: Task }
  | { type: 'ride_cancelled'; data: { rideId: string; cancelledBy: string; reason?: string } }
  | { type: 'task_cancelled'; data: { taskId: string; cancelledBy: string; reason?: string } };
