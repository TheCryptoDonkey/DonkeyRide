# API Stress Test Report — TROTT Protocol Reference Implementation

**Generated**: 2026-02-11
**Scope**: Top 5 use cases walked through every API endpoint and WebSocket message
**Methodology**: Each use case is walked step-by-step through the complete task lifecycle, comparing the TROTT specification with the actual API implementation in `server.js`.

> **Historical snapshot.** This report describes the implementation as of
> 2026-02-11. Since then the streaming-payment machinery
> (`startStreamingForRide`, `stream_payment` WebSocket messages, kind 30536
> ticks) and the vestigial surge-multiplier plumbing it references have been
> removed entirely — riders now settle directly with drivers via the
> non-custodial settlement rails (`settlement/`). Line numbers and verdicts
> referring to streaming or surge no longer correspond to current code.

## Verdicts

| Verdict | Meaning |
|---------|---------|
| ✅ Match | Spec and implementation align |
| ⚠️ Friction | Works but with naming mismatches, missing tags, or incomplete mapping |
| ❌ Gap | Spec defines behaviour the API does not implement |
| 🔧 Enhancement | Not in spec but implementation adds useful functionality |

## Top 5 Use Cases

| # | Domain | Pattern | Implementation | Selection Rationale |
|---|--------|---------|----------------|---------------------|
| 1 | Ridesharing | Trip (A→B with live tracking) | Full (`src/domain-profiles/ridesharing.js`) | Baseline — streaming payments, live tracking, distance+time pricing |
| 2 | Locksmith | Dispatch (go to location, do work) | Full (`src/domain-profiles/locksmith.js`) | Quote negotiation, flat-rate pricing, guarantee period, no destination |
| 3 | Delivery | Relay (collect → transport → deliver) | Full (`src/domain-profiles/delivery.js`) | Most complex state machine (12 states), photo+signature proofs, failure/return |
| 4 | Security Guard | Shift (long-duration, stationary) | Spec-only ([`domains/security.md`](https://github.com/TheCryptoDonkey/trott/blob/main/domains/security.md)) | Check-ins, multi-provider crews, long-lived tasks, geofencing |
| 5 | Emergency Plumber | Dispatch + urgency | Spec-only ([`domains/emergency-trades.md`](https://github.com/TheCryptoDonkey/trott/blob/main/domains/emergency-trades.md)) | Credential filtering, urgency signals, milestone payments, regulatory compliance |

---

## Use Case 1: Ridesharing

**Domain profile**: `src/domain-profiles/ridesharing.js`
**Coordination pattern**: Trip (continuous A→B movement)
**State machine**: `requested` → `matched` → `en_route` → `arrived` → `active` → `completed`
**Terminal states**: `completed`, `no_show`, `cancelled`

### Happy Path

#### Step 1 — Discovery

The rider searches for available drivers before requesting a ride.

**HTTP Request**:
```http
GET /api/drivers/available HTTP/1.1
Host: localhost:3000
```

**Expected Nostr Event (Spec)**:
TROTT-02 defines discovery via kind 20500 (Provider Availability Broadcast) with geohash `g` tags and kind 30510 (Provider Profile). Drivers publish ephemeral availability events to relays; requesters filter by geohash.

**HTTP Response** (200):
```json
{
  "drivers": [
    {
      "npub": "npub1driver1abc123def456...",
      "name": "Marcus",
      "location": { "lat": 51.5074, "lon": -0.1278 },
      "available": true,
      "rating": 4.8,
      "totalRides": 142,
      "lastUpdate": 1739260800000
    }
  ],
  "count": 1,
  "timestamp": 1739260800000
}
```

**What the spec says**: TROTT-02 §2 defines geohash-based geographic broadcast discovery. Riders query relays for kind 20500 events filtered by geohash prefix. Kind 30510 Provider Profile events carry domain-specific tags (`vehicle_type`, `seats_available`, etc.) and credential attestations.

**What the API actually does**: `server.js` line 1156 — `GET /api/drivers/available` reads from Redis (`driver:online:*` keys). No geohash filtering. No Nostr relay query. No domain-specific tags or credential verification. Drivers register via WebSocket `register_driver` messages, and their data is stored in Redis by the operator.

**WebSocket**: Drivers register via `register_driver` message; no outgoing message on this endpoint.

**VERDICT**: ⚠️ Friction — The API provides driver availability but via centralised Redis lookup, not decentralised geohash-based Nostr discovery. Missing: geohash filtering, domain-specific tags (vehicle_type, etc.), and NIP-32 label filtering.

---

#### Step 2 — Task Creation

The rider requests a ride, specifying pickup and dropoff.

**HTTP Request**:
```http
POST /api/rides/request HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "pickup_lat": 51.5074,
  "pickup_lon": -0.1278,
  "dropoff_lat": 51.4700,
  "dropoff_lon": -0.4543,
  "rider_npub": "npub1rider9a8b7c6d5e4f3...",
  "currency": "GBP"
}
```

**Expected Nostr Event (Spec)**:
TROTT-01 kind 30500 (Task Request) with tags: `d` (task ID), `domain` (`ridesharing`), `g` (geohash), `location_lat`, `location_lon`, `amount`, `currency`, `payment_type` (`streaming`), and `expiration` (NIP-40).

**HTTP Response** (200):
```json
{
  "success": true,
  "ride_id": "ride_abc123",
  "status": "requested",
  "estimated_fare": 4500,
  "estimated_cost": "0.00045 BTC",
  "distance_km": 24.3,
  "duration_minutes": 35,
  "drivers_notified": 3,
  "route": [[51.5074, -0.1278], [51.4920, -0.2100], [51.4700, -0.4543]],
  "currency": "GBP",
  "estimate": {
    "distance_km": 24.3,
    "duration_minutes": 35,
    "fare": {
      "sats": 4500,
      "formatted": "0.00045 BTC",
      "gbp": 28.50
    }
  }
}
```

**WebSocket Broadcast** (to all registered drivers):
```json
{
  "type": "ride_request",
  "ride": {
    "id": "ride_abc123",
    "pickup": { "lat": 51.5074, "lon": -0.1278 },
    "dropoff": { "lat": 51.4700, "lon": -0.4543 },
    "fare": 4500,
    "distance": 24.3,
    "estimatedFare": { "fare": { "sats": 4500, "gbp": 28.50 } },
    "route": [[51.5074, -0.1278], [51.4920, -0.2100], [51.4700, -0.4543]],
    "currency": "GBP",
    "rider": {
      "npub": "npub1rider9a8b7c6d5e4f3...",
      "pubkey": null
    }
  }
}
```

**What the spec says**: TROTT-01 §Kind 30500 defines Task Request as a replaceable Nostr event published to relays. Discovery happens via relay subscription with geohash filters.

**What the API actually does**: `server.js` lines 1343-1497. The endpoint creates a task via `rideManager.createRide()`, calculates distance (OSRM or Haversine fallback), estimates fare via `estimateTripCost()`, and broadcasts a `ride_request` WebSocket message to registered drivers. The `domain` body field is optional and defaults to the server's startup profile. No Nostr event is published — the broadcast is WebSocket-only.

**VERDICT**: ⚠️ Friction — Task creation works but bypasses Nostr relay publication entirely. The API creates an in-memory task and broadcasts via WebSocket instead of publishing a kind 30500 event. The response includes useful route/estimate data not specified by the protocol.

---

#### Step 3 — Stake Locking

Both rider and driver lock commitment stakes before the ride proceeds.

**HTTP Request (Rider Stake)**:
```http
POST /rides/ride_abc123/rider-stake HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "paymentProof": "lnbc450n1pjk..."
}
```

**HTTP Response** (200):
```json
{
  "success": true,
  "status": "stake_locked",
  "proof": {
    "id": "event_abc...",
    "kind": 30502,
    "pubkey": "a1b2c3d4e5f6...",
    "created_at": 1739260800,
    "tags": [
      ["e", "ride_abc123"],
      ["role", "rider"],
      ["amount", "450"],
      ["currency", "SAT"]
    ]
  }
}
```

**WebSocket Broadcast**:
```json
{
  "type": "rider_stake_locked",
  "amount": 450
}
```

**HTTP Request (Driver Stake)** — requires `/rides/:rideId/driver-accept` first:
```http
POST /rides/ride_abc123/driver-accept HTTP/1.1
Content-Type: application/json

{
  "driverId": "npub1driver1abc123...",
  "driverLightning": "marcus@getalby.com",
  "driverPubkey": "d1e2f3a4b5c6..."
}
```

Then:
```http
POST /rides/ride_abc123/driver-stake HTTP/1.1
Content-Type: application/json

{
  "paymentProof": "lnbc675n1pjk..."
}
```

**HTTP Response** (200):
```json
{
  "success": true,
  "status": "ride_active",
  "proof": {
    "id": "event_def...",
    "kind": 30502,
    "pubkey": "d1e2f3a4b5c6...",
    "created_at": 1739260860,
    "tags": [
      ["e", "ride_abc123"],
      ["role", "driver"],
      ["amount", "675"],
      ["currency", "SAT"]
    ]
  }
}
```

**WebSocket Broadcast**:
```json
{
  "type": "driver_stake_locked",
  "driver": "d1e2f3a4b5c6...",
  "stake": 675,
  "timestamp": 1739260860000
}
```

**What the spec says**: TROTT-04 kind 30532 (Stake Lock) defines stake events with tags: `d`, `task_id`, `role`, `amount`, `currency`, `trust_model`, `escrow_id`, and `expiration`. Stakes should be 10% for the rider and 15% for the driver per the ridesharing domain profile.

**What the API actually does**: `server.js` lines 722-862. Rider stake at line 723 via `POST /rides/:rideId/rider-stake`; driver flow via lines 775 (`driver-accept`) and 811 (`driver-stake`). The stakeManager.lockStake() call handles the payment rail. Nostr stake lock events are published asynchronously via `stakeEvents.publishStakeLock()` (fire-and-forget with `.catch()`). The stake percentages are hardcoded: rider at 10% (line 689: `Math.floor(fareSats * 0.1)`), driver at 15% (line 785: `Math.floor(ride.fareAmount * 0.15)`).

**Note**: These are the **legacy** staking endpoints (under `/rides/` not `/api/rides/`). They require prior session creation via `POST /rides/create` (NIP-98 authenticated, line 666). The MVP API endpoints (`/api/rides/*`) do not have dedicated stake endpoints — staking is implicit.

**VERDICT**: ⚠️ Friction — Stakes work and Nostr events are published, but on the legacy API path only. The MVP API (`/api/rides/*`) skips explicit staking entirely. The spec's `trust_model` and `escrow_id` tags are included in the published events. However, the stake endpoints use `/rides/` (not `/api/rides/`), creating a split API surface.

---

#### Step 4 — Acceptance

A driver accepts the ride request.

**HTTP Request**:
```http
POST /api/rides/ride_abc123/accept HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "driver_npub": "npub1driver1abc123def456...",
  "driver_name": "Marcus",
  "driver_location": { "lat": 51.5150, "lon": -0.1400 },
  "driver_rating": 4.8,
  "driver_pubkey": "d1e2f3a4b5c6..."
}
```

**Expected Nostr Event (Spec)**:
TROTT-01 kind 30502 (Task Accept) with tags: `e` (references task request event), `p` (requester pubkey), `accepted_by` (provider pubkey).

**HTTP Response** (200):
```json
{
  "success": true,
  "ride": {
    "id": "ride_abc123",
    "domain": "ridesharing",
    "status": "en_route",
    "rider": { "npub": "npub1rider9a8b7c6d5e4f3...", "pubkey": null },
    "driver": {
      "npub": "npub1driver1abc123def456...",
      "pubkey": "d1e2f3a4b5c6...",
      "name": "Marcus",
      "location": { "lat": 51.5150, "lon": -0.1400 },
      "rating": 4.8
    },
    "pickup": { "lat": 51.5074, "lon": -0.1278 },
    "dropoff": { "lat": 51.4700, "lon": -0.4543 },
    "fare": 4500,
    "currency": "GBP"
  },
  "eta_seconds": 420,
  "driver_route": [[51.5150, -0.1400], [51.5110, -0.1340], [51.5074, -0.1278]]
}
```

**WebSocket Broadcast** (to ride subscribers — both legacy and generic):
```json
{
  "type": "ride_matched",
  "ride": {
    "id": "ride_abc123",
    "status": "en_route",
    "driver": {
      "npub": "npub1driver1abc123def456...",
      "pubkey": "d1e2f3a4b5c6...",
      "name": "Marcus",
      "location": { "lat": 51.5150, "lon": -0.1400 },
      "rating": 4.8
    },
    "eta_seconds": 420,
    "driver_route": [[51.5150, -0.1400], [51.5110, -0.1340], [51.5074, -0.1278]]
  }
}
```
```json
{
  "type": "task_matched",
  "task": { "...same payload..." }
}
```

**What the spec says**: TROTT-01 defines kind 30502 (Task Accept) as a separate event. The spec's state machine goes `requested` → `accepted` → `provider_en_route`. Acceptance and en-route are distinct transitions.

**What the API actually does**: `server.js` lines 1500-1572. The accept endpoint calls `rideManager.acceptRide()` which transitions `requested` → `matched`, then immediately calls `rideManager.startEnRoute()` which transitions `matched` → `en_route`. The response status is already `en_route`, not `matched`. Two WebSocket messages are broadcast: `ride_matched` and `task_matched` (dual-format for legacy and generic clients). OSRM routing is used to calculate driver-to-pickup route and ETA (line 1530).

**VERDICT**: ⚠️ Friction — The accept endpoint atomically performs two transitions (requested→matched→en_route). The `matched` state is never visible to the client — the response shows `en_route` directly. The spec treats acceptance and en-route as separate steps. No kind 30502 Nostr event is published.

---

#### Step 5 — Provider En Route (Live Tracking)

The driver sends periodic location updates while heading to the pickup.

**HTTP Request**:
```http
POST /api/rides/ride_abc123/location HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "lat": 51.5120,
  "lon": -0.1340
}
```

**Expected Nostr Event (Spec)**:
TROTT-07 kind 20501 (Ephemeral Location Update) with tags: `e` (task reference), `p` (subscriber), NIP-44 encrypted coordinates for privacy.

**HTTP Response** (200):
```json
{
  "success": true,
  "eta_seconds": 240
}
```

**WebSocket Broadcast** (dual-format):
```json
{
  "type": "driver_location",
  "ride_id": "ride_abc123",
  "location": { "lat": 51.5120, "lon": -0.1340 },
  "eta_seconds": 240
}
```
```json
{
  "type": "location_update",
  "data": { "lat": 51.5120, "lng": -0.1340, "eta_seconds": 240 }
}
```

**What the spec says**: TROTT-07 defines kind 20501 as an ephemeral event (prefix `2xxxx`) — it is not persisted on relays. Location data should be NIP-44 encrypted. Route tracking and deviation detection (500m threshold) are defined in TROTT-07 §Route Deviation.

**What the API actually does**: `server.js` lines 1574-1628. Location updates are sent via HTTP POST, not published as Nostr events. The API calculates ETA using Haversine distance at 30 km/h (line 1598 via `rideManager.calculateETA()`). ETA destination switches based on ride state: pickup during `en_route`, dropoff during `active` (lines 1588-1593 using `rideProfile.states.values`). Two WebSocket broadcast formats are emitted: `driver_location` (legacy) and `location_update` (React frontend, note `lng` vs `lon`).

**VERDICT**: ⚠️ Friction — Location tracking works via HTTP + WebSocket but is not published as kind 20501 ephemeral Nostr events. No NIP-44 encryption. No route deviation detection. The dual WebSocket format (`lon` vs `lng`) is a practical accommodation but diverges from spec consistency.

---

#### Step 6 — Arrival

The driver arrives at the pickup location.

**HTTP Request**:
```http
POST /api/rides/ride_abc123/arrive HTTP/1.1
Host: localhost:3000
```

**Expected Nostr Event (Spec)**:
TROTT-01 kind 30503 (Task Update) with status tag `provider_arrived`.

**HTTP Response** (200):
```json
{
  "success": true,
  "ride": {
    "id": "ride_abc123",
    "status": "arrived",
    "driver": { "npub": "npub1driver1abc123def456...", "pubkey": "d1e2f3a4b5c6..." },
    "timestamps": {
      "requested": 1739260800000,
      "matched": 1739260810000,
      "providerEnRoute": 1739260810000,
      "providerArrived": 1739261220000
    }
  }
}
```

**WebSocket Broadcast**:
```json
{
  "type": "driver_arrived",
  "ride_id": "ride_abc123",
  "ride": { "...full ride object..." }
}
```

**What the spec says**: TROTT-01 defines `provider_arrived` as a sub-state of `in_progress`. The ridesharing spec names this `provider_arrived` — driver waiting at pickup.

**What the API actually does**: `server.js` lines 1630-1656. Calls `rideManager.arriveAtPickup()` which transitions `en_route` → `arrived` (see `task-manager.js` line 270). Broadcasts `driver_arrived` WebSocket message. No Nostr event published.

**State naming**: The spec says `provider_arrived`; the implementation profile uses `arrived` (see `ridesharing.js` line 23: `PROVIDER_ARRIVED: 'arrived'`). The WebSocket type is `driver_arrived` (domain-specific, not generic).

**VERDICT**: ⚠️ Friction — Works correctly but the state value `arrived` differs from the spec's `provider_arrived`. The WebSocket type `driver_arrived` is ridesharing-specific rather than domain-agnostic. No kind 30503 Task Update published to relays.

---

#### Step 7 — Trip Start (Streaming Payments Begin)

The rider boards and the trip begins.

**HTTP Request**:
```http
POST /api/rides/ride_abc123/start HTTP/1.1
Host: localhost:3000
```

**Expected Nostr Event (Spec)**:
TROTT-01 kind 30503 (Task Update) with status tag `trip_active`. TROTT-04 kind 30536 (Streaming Tick) begins at 30-second intervals per the ridesharing domain profile.

**HTTP Response** (200):
```json
{
  "success": true,
  "ride": {
    "id": "ride_abc123",
    "status": "active",
    "timestamps": {
      "started": 1739261300000
    }
  }
}
```

**WebSocket Broadcast**:
```json
{
  "type": "trip_started",
  "ride_id": "ride_abc123",
  "ride": { "...full ride object..." }
}
```

**What the spec says**: TROTT-01 defines `trip_active` as the active service phase. The ridesharing domain profile specifies streaming payments at 30-second intervals with varying rates: GBP 0.25/tick while moving, GBP 0.10/tick while stationary.

**What the API actually does**: `server.js` lines 1658-1685. Calls `rideManager.startTrip()` which transitions `arrived` → `active` (see `task-manager.js` line 333). Then calls `startStreamingForRide(rideId)` (line 1664). Broadcasts `trip_started` WebSocket message.

**State naming**: Spec says `trip_active`; implementation uses `active` (see `ridesharing.js` line 22: `ACTIVE: 'active'`).

**VERDICT**: ⚠️ Friction — State value `active` differs from spec's `trip_active`. No kind 30503 Task Update published. Streaming payment initialisation is correct (see next step for interval analysis).

---

#### Step 8 — Streaming Payments

During the active trip, the server emits periodic payment ticks.

**Expected Nostr Event (Spec)**:
TROTT-04 kind 30536 (Streaming Tick) with tags: `task_id`, `amount`, `currency`, `trust_model`, `total_paid`, `tick_number`. Interval: 30 seconds per ridesharing domain profile.

**WebSocket Broadcast** (every 1 second):
```json
{
  "type": "stream_payment",
  "ride_id": "ride_abc123",
  "amount_sats": 300,
  "total_paid_sats": 600,
  "fare_sats": 4500,
  "remaining_sats": 3900,
  "timestamp": 1739261302000
}
```

**What the spec says**: The ridesharing domain profile ([`domains/ridesharing.md`](https://github.com/TheCryptoDonkey/trott/blob/main/domains/ridesharing.md) line 90) specifies a streaming interval of **30 seconds**. TROTT-04 kind 30536 defines each tick as a Nostr event published to relays.

**What the API actually does**: `server.js` lines 228-229 define the constants:
```javascript
const STREAM_INTERVAL_MS = 1000;   // 1 second
const STREAM_STEPS = 15;           // 15 total ticks
```
`startStreamingForRide()` (lines 519-590) divides the total fare into 15 equal steps and emits one `stream_payment` WebSocket message per second. Each tick also calls `stakeEvents.publishStreamPayment()` to publish a kind 30536 Nostr event (lines 573-582, fire-and-forget). Streaming stops when the fare is fully paid (15 seconds for a complete ride) or when `stopStreamingForRide()` is called.

**Key discrepancy**: The spec defines 30-second intervals; the implementation uses 1-second intervals with 15 steps. A ride estimated at 4500 sats would pay 300 sats/tick × 15 ticks = 4500 sats in 15 seconds regardless of actual trip duration. The spec's model is distance+time-proportional; the implementation's model is fare-proportional with fixed step count.

**VERDICT**: ❌ Gap — **Major streaming interval mismatch.** Spec says 30 seconds; API does 1 second × 15 steps. The spec's rate varies by speed (GBP 0.25/tick moving vs GBP 0.10/tick stationary); the API uses a flat `fare / 15` per tick. Additionally, the API's 15-step model means the entire fare streams in 15 seconds regardless of trip duration, which does not align with real-time metering. Kind 30536 events are published (a positive), but with the wrong interval and amount model.

---

#### Step 9 — Completion

The driver marks the trip as complete.

**HTTP Request** (MVP API):
```http
POST /api/rides/ride_abc123/complete HTTP/1.1
Host: localhost:3000
```

**Expected Nostr Event (Spec)**:
TROTT-01 kind 30504 (Task Complete) with tags: `e` (task reference), `proof` (GPS trace hash), `amount` (final fare), `currency`.

**HTTP Response** (200):
```json
{
  "success": true,
  "ride": {
    "id": "ride_abc123",
    "status": "completed",
    "payment": {
      "success": true,
      "payment_hash": "mock_hash_1739261800000",
      "amount_sats": 4500,
      "timestamp": 1739261800000
    },
    "duration": 500
  },
  "payment": {
    "success": true,
    "payment_hash": "mock_hash_1739261800000",
    "amount_sats": 4500,
    "timestamp": 1739261800000
  }
}
```

**WebSocket Broadcast**:
```json
{
  "type": "trip_completed",
  "ride_id": "ride_abc123",
  "ride": { "...full ride object..." },
  "payment": {
    "success": true,
    "payment_hash": "mock_hash_1739261800000",
    "amount_sats": 4500,
    "timestamp": 1739261800000
  }
}
```

**What the spec says**: TROTT-01 kind 30504 (Task Complete) includes completion proof (GPS trace for ridesharing) and final payment details. The task transitions to `completed`, and stakes should be released.

**What the API actually does**: There are **two** complete endpoints:

1. **MVP API** — `POST /api/rides/:rideId/complete` at line 3138. Calls `rideManager.completeTrip()`, stops streaming, creates a mock payment object, broadcasts `trip_completed`. No stake release — stakes are managed on the legacy API path.

2. **Legacy API** — `POST /rides/:rideId/complete` at line 865. Releases both rider and driver stakes via `stakeManager.releaseStakes()`, publishes Nostr stake release events via `stakeEvents.publishStakeRelease()`, pays operator fee, broadcasts `ride_completed`, and finalises the session.

The MVP complete endpoint does **not** release stakes or publish Nostr events. The payment is always mocked (`mock_hash_*`).

**State naming**: Spec says `completed`; implementation uses `completed` (match). However, the spec also defines a `confirmed` state (kind 30505 Task Confirm by the requester) which the API does not implement.

**VERDICT**: ⚠️ Friction — Completion works but stake release only happens on the legacy API path. The MVP complete endpoint mocks the payment. No kind 30504 Nostr event is published. The spec's `confirmed` state (requester confirms delivery) has no API endpoint.

---

#### Step 10 — Rating

Both parties rate each other after the ride.

**HTTP Request (Path A — Full Nostr Event)**:
```http
POST /api/rides/ride_abc123/rate HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "event": {
    "id": "evt_rating_abc...",
    "kind": 30520,
    "pubkey": "a1b2c3d4e5f6...",
    "created_at": 1739262000,
    "content": "Excellent driver, very safe.",
    "tags": [
      ["p", "d1e2f3a4b5c6..."],
      ["rating", "4.5"],
      ["criteria", "overall", "4.5"],
      ["criteria", "punctuality", "5"],
      ["criteria", "safety", "5"],
      ["criteria", "courtesy", "4"]
    ],
    "sig": "sig_abc..."
  }
}
```

**HTTP Request (Path B — Simple Rating from React frontend)**:
```http
POST /api/rides/ride_abc123/rate HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "rating": 5,
  "comment": "Excellent driver, very safe.",
  "raterPubkey": "a1b2c3d4e5f6...",
  "raterRole": "rider"
}
```

**Expected Nostr Event (Spec)**:
TROTT-03 kind 30520 (Rating) with tags: `d`, `p` (rated party), `rating`, `criteria` (one per criterion from the domain profile's `ratingCriteria`), `task_id`.

**HTTP Response** (200 — Path A):
```json
{
  "success": true,
  "rating": 4.5,
  "target_hex": "d1e2f3a4b5c6...",
  "target_npub": "npub1driver1abc123def456...",
  "relay_statuses": ["wss://relay.damus.io"],
  "cached_locally": true
}
```

**WebSocket Broadcast**:
```json
{
  "type": "rating_submitted",
  "ride_id": "ride_abc123",
  "role": "rider",
  "rating": 4.5,
  "target_hex": "d1e2f3a4b5c6...",
  "target_npub": "npub1driver1abc123def456...",
  "relay_statuses": ["wss://relay.damus.io"],
  "cached_locally": true
}
```

**What the spec says**: TROTT-03 defines kind 30520 with weighted criteria. The ridesharing spec defines four criteria for rider-rates-driver: `overall` (0.25), `punctuality` (0.20), `safety` (0.20), `vehicle_condition` (0.15), `communication` (0.20).

**What the API actually does**: `server.js` lines 1832-1935. Two rating paths:
- **Path A** (line 1848): Full Nostr event — calls `reputation.publishRating(event, ride)` which attempts to publish to relays and caches locally. Validates that the rater is a task participant.
- **Path B** (line 1887): Simple 1-5 rating — stores in the ride record but does not publish a Nostr event. Used by the React frontend.

The API accepts the ride manager-level cancellation check (line 1843): ratings are blocked if the task is not completed or is in cancelled state. However, `no_show` status (which is terminal) would allow rating — this is correct per spec.

**Rating criteria mismatch**: The implementation profile (`ridesharing.js` lines 63-68) defines: `overall` (0.4), `punctuality` (0.2), `safety` (0.2), `courtesy` (0.2). The spec ([`domains/ridesharing.md`](https://github.com/TheCryptoDonkey/trott/blob/main/domains/ridesharing.md) lines 60-68) defines: `overall` (0.25), `punctuality` (0.20), `safety` (0.20), `vehicle_condition` (0.15), `communication` (0.20). Weights and criteria differ.

**VERDICT**: ⚠️ Friction — Path A correctly publishes kind 30520 Nostr events. Path B is a simplified alternative that skips Nostr publication. The rating criteria in the implementation profile do not match the spec: `courtesy` vs `vehicle_condition`+`communication`, and `overall` weight is 0.4 vs 0.25.

---

### Edge Cases

#### Cancellation

**HTTP Request** (Legacy API only):
```http
POST /rides/ride_abc123/cancel HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "cancelledBy": "a1b2c3d4e5f6...",
  "reason": "Changed plans"
}
```

**HTTP Response** (200):
```json
{
  "success": true,
  "cancelledBy": "a1b2c3d4e5f6...",
  "penalty": 360,
  "refund": 90
}
```

**What the spec says**: TROTT-01 kind 30506 (Task Cancel). The ridesharing domain profile defines graduated penalties: none before match, none within 5-minute grace period, 80% of stake after grace period, 100% for no-show.

**What the API actually does**: `server.js` lines 954-1090. `POST /rides/:rideId/cancel` handles cancellation on the legacy API path. The cancellation logic checks `ride.status`:
- `active` state: Cancelling party's stake is forfeited at 80% (via `stakeManager.forfeitStake()`), other party's stake is released.
- `waiting_driver` or `waiting_rider_stake`: Rider stake released if locked, no penalty.
- Nostr events published for stake release/penalty via `stakeEvents.publishStakeRelease()` and `stakeEvents.publishStakePenalty()`.

**Missing**: No cancellation endpoint exists on the MVP API (`/api/rides/*`). The spec's 5-minute grace period is not implemented — penalties are binary based on state, not time elapsed. No kind 30506 Task Cancel event is published.

**VERDICT**: ❌ Gap — Cancellation exists only on the legacy API path (`/rides/:id/cancel`), not on the MVP API (`/api/rides/:id/cancel`). The spec's grace period is not implemented. No kind 30506 event is published.

---

#### No-Show

**What the spec says**: Ridesharing domain profile defines automatic no-show after 10 minutes at `provider_arrived`. The rider's stake is automatically forfeited (100%). Task transitions to `no_show` terminal state.

**What the API actually does**: There is **no dedicated no-show endpoint or timer**. The `no_show` state exists in the ridesharing profile (`ridesharing.js` line 25) and is a valid transition from `arrived` (line 31: `'arrived': ['active', 'no_show', 'cancelled']`). However, no server-side timer triggers the transition, and no API endpoint exists to invoke it. A client would need to call the generic transition endpoint:

```http
POST /api/rides/ride_abc123/transition HTTP/1.1
Content-Type: application/json

{
  "targetState": "no_show"
}
```

This would work at the state machine level but would not trigger automatic stake forfeit.

**VERDICT**: ❌ Gap — No automatic no-show detection. The state exists in the profile but no timer or dedicated endpoint triggers it. Automatic stake forfeit on no-show is not implemented.

---

#### Panic / Emergency

**HTTP Request**:
```http
POST /api/rides/ride_abc123/panic HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "event": {
    "id": "evt_panic_xyz...",
    "kind": 30560,
    "pubkey": "a1b2c3d4e5f6...",
    "created_at": 1739261500,
    "content": "Driver is taking a different route, I feel unsafe",
    "tags": [
      ["e", "ride_abc123"],
      ["p", "d1e2f3a4b5c6..."]
    ],
    "sig": "sig_xyz..."
  }
}
```

**HTTP Response** (200):
```json
{
  "success": true,
  "relay_statuses": ["wss://relay.damus.io"],
  "cached_locally": true
}
```

**WebSocket Broadcast**:
```json
{
  "type": "panic_alert",
  "ride_id": "ride_abc123",
  "initiated_by": "a1b2c3d4e5f6...",
  "role": "rider",
  "content": "Driver is taking a different route, I feel unsafe",
  "tags": [["e", "ride_abc123"], ["p", "d1e2f3a4b5c6..."]],
  "timestamp": 1739261500000,
  "relay_statuses": ["wss://relay.damus.io"],
  "cached_locally": true
}
```

**What the spec says**: TROTT-05 kind 30540 (Emergency Signal). Should be relayed to safety contacts, operator, and emergency services where applicable.

**What the API actually does**: `server.js` lines 1728-1789. The endpoint accepts a pre-signed Nostr event, publishes it via `reputation.publishPanic()`, stops streaming payments (line 1746), records the panic event on the ride record, and broadcasts a `panic_alert` WebSocket message. The event kind in the body is 30560 (the implementation profile's `panic` kind, see `ridesharing.js` line 131), not the spec's 30540.

**VERDICT**: ⚠️ Friction — Panic works and publishes to relays. However, the event kind is 30560 (implementation profile) vs 30540 (TROTT-05 spec). Safety contact notification is not implemented — the broadcast goes to ride subscribers only.

---

#### Route Deviation

**What the spec says**: TROTT-07 kind 30562 (Route Deviation Alert). The ridesharing domain profile specifies a 500-metre threshold — if the driver deviates more than 500m from the planned route, an alert is sent to the rider and safety contacts.

**What the API actually does**: No route deviation detection is implemented. The location update endpoint (line 1574) updates coordinates and calculates ETA but does not compare against the planned route.

**VERDICT**: ❌ Gap — Route deviation detection is entirely absent from the implementation.

---

#### Multi-Stop / Linked Tasks

**What the spec says**: TROTT-01 §Linked Tasks defines `linked_task` references and kind 30508 (Leg Plan) for multi-stop rides. The ridesharing spec references carpool/shared rides via kinds 30606-30608.

**What the API actually does**: No support for linked tasks, multi-stop rides, or carpool matching. No endpoints for kinds 30606, 30607, or 30608.

**VERDICT**: ❌ Gap — Multi-stop rides and carpool functionality are unimplemented.

---

### Domain-Specific Scenarios

#### Surge Pricing

**What the spec says**: The ridesharing domain profile defines a `surge_multiplier` tag. Fare = base formula × surge_multiplier. Kind 30604 (Surge Pricing Zone) allows operators to publish surge zones.

**What the API actually does**: The fare estimate endpoint (`POST /api/trips/estimate`, line 1206) calls `estimateTripCost()` which calculates distance+time pricing. No surge multiplier is applied. The `surge_multiplier` tag is not read from the request body and no kind 30604 events are published.

**VERDICT**: ❌ Gap — Surge pricing is defined in the spec but not implemented in the API.

---

#### Streaming Interval Mismatch

| Property | Spec | Implementation |
|----------|------|----------------|
| Interval | 30 seconds | 1 second (`STREAM_INTERVAL_MS = 1000`) |
| Total ticks | Trip duration / 30 | 15 (`STREAM_STEPS = 15`) |
| Tick amount | GBP 0.25 moving / GBP 0.10 stationary | `fare / 15` (flat) |
| Speed-dependent | Yes | No |
| Trip-duration-proportional | Yes | No (always 15 seconds) |

**VERDICT**: ❌ Gap — The streaming model fundamentally differs between spec and implementation.

---

### Spec-vs-Implementation Gap Table

| Feature | Spec Reference | API Endpoint | Status |
|---------|---------------|--------------|--------|
| Geohash discovery | TROTT-02, kind 20500 | `GET /api/drivers/available` | ⚠️ Friction |
| Task request | TROTT-01, kind 30500 | `POST /api/rides/request` | ⚠️ Friction |
| Stake lock | TROTT-04, kind 30532 | `POST /rides/:id/rider-stake` | ⚠️ Friction |
| Task accept | TROTT-01, kind 30502 | `POST /api/rides/:id/accept` | ⚠️ Friction |
| Location updates | TROTT-07, kind 20501 | `POST /api/rides/:id/location` | ⚠️ Friction |
| Provider arrival | TROTT-01, kind 30503 | `POST /api/rides/:id/arrive` | ✅ Match |
| Trip start | TROTT-01, kind 30503 | `POST /api/rides/:id/start` | ✅ Match |
| Streaming payments | TROTT-04, kind 30536 | WebSocket `stream_payment` | ❌ Gap |
| Trip completion | TROTT-01, kind 30504 | `POST /api/rides/:id/complete` | ⚠️ Friction |
| Task confirm | TROTT-01, kind 30505 | (none) | ❌ Gap |
| Rating | TROTT-03, kind 30520 | `POST /api/rides/:id/rate` | ✅ Match |
| Cancellation | TROTT-01, kind 30506 | `POST /rides/:id/cancel` | ⚠️ Friction |
| No-show auto-forfeit | Ridesharing spec | (none) | ❌ Gap |
| Emergency signal | TROTT-05, kind 30540 | `POST /api/rides/:id/panic` | ⚠️ Friction |
| Safety check-in | TROTT-05, kind 30541 | `POST /api/rides/:id/check-in` | ✅ Match |
| Route deviation | TROTT-07, kind 30562 | (none) | ❌ Gap |
| Surge pricing | Ridesharing, kind 30604 | (none) | ❌ Gap |
| Wait time charge | Ridesharing, kind 30600 | (none) | ❌ Gap |
| Destination change | Ridesharing, kind 30603 | (none) | ❌ Gap |
| Scheduled rides | Ridesharing, kind 30605 | (none) | ❌ Gap |
| Carpool request | Ridesharing, kind 30606 | (none) | ❌ Gap |
| Carpool seat offer | Ridesharing, kind 30607 | (none) | ❌ Gap |
| Split payment | Ridesharing, kind 30608 | (none) | ❌ Gap |
| Tipping | TROTT-04, kind 30537 | `POST /api/rides/:id/tip` | 🔧 Enhancement |
| Proof submission | TROTT-01 | `POST /api/rides/:id/proof` | 🔧 Enhancement |
| Dispute filing | TROTT-05, kind 30543 | `POST /api/rides/:id/dispute` | 🔧 Enhancement |
| OSRM route preview | (none) | `POST /api/routes/preview` | 🔧 Enhancement |
| BTC price feed | (none) | `GET /api/prices/btc` | 🔧 Enhancement |
| Trip cost estimate | (none) | `POST /api/trips/estimate` | 🔧 Enhancement |
| Domain profile API | (none) | `GET /api/domains/current` | 🔧 Enhancement |

**Summary**: 4 ✅ Match, 8 ⚠️ Friction, 10 ❌ Gap, 6 🔧 Enhancement

---

## Use Case 2: Locksmith

**Domain profile**: `src/domain-profiles/locksmith.js`
**Coordination pattern**: Dispatch (single location, no destination)
**State machine**: `lockout_reported` → `locksmith_matched` → `en_route` → `arrived` → `access_method_confirmed` → `work_active` → `access_gained`
**Terminal states**: `access_gained`, `no_show`, `cancelled`
**Key differentiators**: Quote negotiation, flat-rate pricing, no streaming, no destination, guarantee period

### Happy Path

#### Step 1 — Discovery

Customer searches for available locksmiths.

**HTTP Request**:
```http
GET /api/drivers/available HTTP/1.1
Host: localhost:3000
```

**HTTP Response** (200):
```json
{
  "drivers": [
    {
      "npub": "npub1locksmith7x8y9z...",
      "name": "KeyMaster Pete",
      "location": { "lat": 51.5200, "lon": -0.0900 },
      "available": true,
      "rating": 4.9,
      "totalRides": 87,
      "lastUpdate": 1739260800000
    }
  ],
  "count": 1,
  "timestamp": 1739260800000
}
```

**What the spec says**: TROTT-02 geohash-based discovery with skill search. The locksmith domain profile specifies `discoveryMethod: 'geohash'`. Provider profiles (kind 30510) should carry domain-specific tags: `lock_type` capabilities, `access_type` specialities, MLA membership status.

**What the API actually does**: Same as ridesharing — Redis-backed `GET /api/drivers/available` (line 1156). No geohash filtering, no skill/speciality filtering, no domain-specific tags exposed.

**Note**: The endpoint is `/api/drivers/available` regardless of domain. The alias `/api/providers/available` also works (via the middleware at line 42: `/api/providers` → `/api/drivers`).

**VERDICT**: ⚠️ Friction — Locksmith discovery lacks skill filtering, certification checks, and domain-specific tags. The generic endpoint serves all domains identically.

---

#### Step 2 — Task Creation (Lockout Reported)

Customer reports a lockout. Note: no destination is required.

**HTTP Request**:
```http
POST /api/rides/request HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "pickup_lat": 51.5074,
  "pickup_lon": -0.1278,
  "rider_npub": "npub1customer4a5b6c...",
  "currency": "GBP",
  "domain": "locksmith"
}
```

**Expected Nostr Event (Spec)**:
TROTT-01 kind 30500 (Task Request) with `domain` tag set to `locksmith`. Domain-specific tags: `lock_type`, `property_type`, `service_urgency`. No destination tags.

**HTTP Response** (200):
```json
{
  "success": true,
  "ride_id": "task_abc456",
  "status": "lockout_reported",
  "estimated_fare": 0,
  "estimated_cost": "0 BTC",
  "distance_km": 0,
  "duration_minutes": 0,
  "drivers_notified": 1,
  "route": null,
  "currency": "GBP",
  "estimate": {
    "distance_km": 0,
    "duration_minutes": 0,
    "fare": { "sats": 0, "gbp": 0 }
  }
}
```

**WebSocket Broadcast** (to registered locksmiths):
```json
{
  "type": "ride_request",
  "ride": {
    "id": "task_abc456",
    "pickup": { "lat": 51.5074, "lon": -0.1278 },
    "dropoff": null,
    "fare": 0,
    "distance": 0,
    "estimatedFare": { "fare": { "sats": 0, "gbp": 0 } },
    "route": null,
    "currency": "GBP",
    "rider": { "npub": "npub1customer4a5b6c...", "pubkey": null }
  }
}
```

**What the spec says**: Task request for locksmith includes `lock_type`, `property_type`, and `service_urgency` tags. No destination.

**What the API actually does**: `server.js` lines 1343-1497. The `domain` body field selects the locksmith profile. The key difference from ridesharing: `requestProfile.features.requiresDestination` is `false` for locksmith (see `locksmith.js` line 103), so the dropoff validation at line 1375-1380 is skipped. Without a dropoff, distance and duration are both 0 (lines 1411-1416). The fare estimate is 0 sats because there is no distance to price. The task ID is prefixed `task_` (not `ride_`) per `task-manager.js` line 122.

**Initial state**: `lockout_reported` (not `requested`) per `locksmith.js` line 22.

**Missing**: No domain-specific tags (`lock_type`, `property_type`, `service_urgency`) are accepted in the request body or stored on the task. The API body schema is generic across all domains.

**VERDICT**: ⚠️ Friction — Task creation works correctly for single-location domains (no dropoff required). However, the fare estimate is 0 for locksmith because the pricing model is `flatRate` (determined by on-site quote, not distance). No domain-specific tags are captured. The WebSocket message type is `ride_request` even for locksmith tasks.

---

#### Step 3 — Stake Locking

Same as ridesharing (legacy API path only). Stakes are calculated as percentages of the estimated fare — but since the fare at this point is 0 or a placeholder estimate, the initial stake would be near-zero.

**What the spec says**: Customer 10% and locksmith 15% of the initial estimate. Stakes are recalculated when the on-site quote is accepted.

**What the API actually does**: The legacy staking endpoints (`/rides/:id/rider-stake`, `/rides/:id/driver-stake`) use the `fareAmount` set during `/rides/create`. If the fare is 0, the stake would be `Math.max(config.minStakeAmount, Math.floor(0 * 0.1))` = 50 sats (the minimum at `server.js` line 689).

**Missing**: Stake recalculation upon quote acceptance is not implemented. When a customer accepts a quote (line 2069: `ride.fare = ride.quote.amount_sats`), the fare is updated on the ride record but stakes are not recalculated.

**VERDICT**: ❌ Gap — Stake recalculation on quote acceptance is not implemented. Initial stakes may be near-zero for locksmith tasks. The spec explicitly requires recalculation.

---

#### Step 4 — Acceptance (Locksmith Matched)

A locksmith accepts the callout.

**HTTP Request**:
```http
POST /api/rides/task_abc456/accept HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "driver_npub": "npub1locksmith7x8y9z...",
  "driver_name": "KeyMaster Pete",
  "driver_location": { "lat": 51.5200, "lon": -0.0900 },
  "driver_rating": 4.9,
  "driver_pubkey": "e7f8a9b0c1d2..."
}
```

**HTTP Response** (200):
```json
{
  "success": true,
  "ride": {
    "id": "task_abc456",
    "domain": "locksmith",
    "status": "en_route",
    "rider": { "npub": "npub1customer4a5b6c...", "pubkey": null },
    "driver": {
      "npub": "npub1locksmith7x8y9z...",
      "pubkey": "e7f8a9b0c1d2...",
      "name": "KeyMaster Pete",
      "location": { "lat": 51.5200, "lon": -0.0900 },
      "rating": 4.9
    },
    "pickup": { "lat": 51.5074, "lon": -0.1278 },
    "dropoff": null,
    "fare": 0,
    "currency": "GBP"
  },
  "eta_seconds": 720,
  "driver_route": [[51.5200, -0.0900], [51.5140, -0.1080], [51.5074, -0.1278]]
}
```

**What the spec says**: The locksmith domain defines the matched state as `locksmith_matched`. Acceptance should be distinct from en-route.

**What the API actually does**: Same as ridesharing — `server.js` lines 1500-1572. The accept endpoint calls `rideManager.acceptRide()` (transitions `lockout_reported` → `locksmith_matched`) then immediately `rideManager.startEnRoute()` (transitions `locksmith_matched` → `en_route`). The `locksmith_matched` state is never visible to the client.

**State transition**: `lockout_reported` → `locksmith_matched` → `en_route` (atomic in accept handler).

**VERDICT**: ⚠️ Friction — Same atomic accept+en_route pattern as ridesharing. The locksmith-specific `locksmith_matched` state is transient and never observable. The response body uses `driver` (ridesharing terminology) rather than `locksmith` or `provider`.

---

#### Step 5 — Provider En Route

Locksmith sends location updates while travelling to the customer.

**HTTP Request**:
```http
POST /api/rides/task_abc456/location HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "lat": 51.5140,
  "lon": -0.1080
}
```

**HTTP Response** (200):
```json
{
  "success": true,
  "eta_seconds": 360
}
```

**What the spec says**: TROTT-07 is **not used** for locksmith (see [`domains/locksmith.md`](https://github.com/TheCryptoDonkey/trott/blob/main/domains/locksmith.md) line 17: "TROTT-07: Navigation **No** (dispatch only; no transport phase)"). However, the API provides live tracking as a convenience.

**What the API actually does**: `server.js` line 1574 — same endpoint as ridesharing. The location endpoint's ETA calculation uses `rideProfile.states.values.PROVIDER_EN_ROUTE` to determine the destination is the pickup location (line 1589). Since locksmith has no dropoff, the destination switches to `null` when in `active` state (line 1591-1593), yielding `null` ETA.

**VERDICT**: 🔧 Enhancement — The spec says TROTT-07 is not applicable for locksmith, but the API provides location tracking regardless. This is useful in practice — customers want to see the locksmith approaching.

---

#### Step 6 — Arrival + Assessment

Locksmith arrives and begins assessing the lock.

**HTTP Request**:
```http
POST /api/rides/task_abc456/arrive HTTP/1.1
Host: localhost:3000
```

**HTTP Response** (200):
```json
{
  "success": true,
  "ride": {
    "id": "task_abc456",
    "status": "arrived",
    "timestamps": {
      "providerArrived": 1739261500000
    }
  }
}
```

**WebSocket Broadcast**:
```json
{
  "type": "driver_arrived",
  "ride_id": "task_abc456",
  "ride": { "...full task object..." }
}
```

**What the spec says**: The locksmith domain defines `provider_arrived` as the assessment phase — the locksmith inspects the lock and determines the best access method before issuing a quote.

**What the API actually does**: Same as ridesharing — `server.js` line 1635. The state is `arrived` (per `locksmith.js` line 24: `PROVIDER_ARRIVED: 'arrived'`). The WebSocket type is `driver_arrived` even for locksmith tasks.

**VERDICT**: ⚠️ Friction — The WebSocket message type `driver_arrived` is ridesharing-specific. For locksmith, a more appropriate type would be `locksmith_arrived` or the generic `provider_arrived`. Functionally correct.

---

#### Step 7 — Quote Submission

After assessing the lock, the locksmith submits a binding quote.

**HTTP Request**:
```http
POST /api/rides/task_abc456/quote HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "amount_sats": 15000,
  "description": "Euro cylinder lock — non-destructive picking required. Estimated 20 minutes. Includes new key cutting.",
  "providerPubkey": "e7f8a9b0c1d2..."
}
```

**Expected Nostr Event (Spec)**:
Locksmith domain kind 30620 (Quote Negotiation) / TROTT-04 kind 30530 (Quote). Tags: `task_id`, `amount`, `currency`, `description`, `lock_type`, `access_type`, `parts_required`.

**HTTP Response** (200):
```json
{
  "success": true,
  "quote": {
    "amount_sats": 15000,
    "description": "Euro cylinder lock — non-destructive picking required. Estimated 20 minutes. Includes new key cutting.",
    "status": "pending",
    "submitted_at": "2026-02-11T12:15:00.000Z",
    "provider_pubkey": "e7f8a9b0c1d2..."
  }
}
```

**WebSocket Broadcast**:
```json
{
  "type": "quote_submitted",
  "ride_id": "task_abc456",
  "quote": {
    "amount_sats": 15000,
    "description": "Euro cylinder lock — non-destructive picking required. Estimated 20 minutes. Includes new key cutting.",
    "status": "pending",
    "submitted_at": "2026-02-11T12:15:00.000Z",
    "provider_pubkey": "e7f8a9b0c1d2..."
  }
}
```

**What the spec says**: The locksmith domain defines kind 30620 (Quote Negotiation) as a binding quote issued after on-site assessment. TROTT-04 kind 30530 (Quote) defines the generic quote structure with `amount`, `currency`, `trust_model`, `expiration`, and optional `breakdown` tags.

**What the API actually does**: `server.js` lines 2018-2053. The quote is stored directly on the ride record (`ride.quote = { ... }`). The amount is in `amount_sats` (field name implies satoshis but is actually domain-agnostic — the currency context is inherited from the task). No Nostr event is published (neither kind 30620 nor kind 30530). The quote stores only amount, description, status, timestamp, and provider pubkey — no domain-specific tags (`lock_type`, `access_type`, `parts_required`).

**VERDICT**: ⚠️ Friction — Quote submission works at the API level but no Nostr event is published. Missing domain-specific tags. The quote object is simplistic compared to the spec's kind 30530 structure (no currency, no trust_model, no expiration, no breakdown).

---

#### Step 8 — Quote Acceptance

Customer accepts the binding quote.

**HTTP Request**:
```http
POST /api/rides/task_abc456/quote/accept HTTP/1.1
Host: localhost:3000
```

**HTTP Response** (200):
```json
{
  "success": true
}
```

**WebSocket Broadcast**:
```json
{
  "type": "quote_accepted",
  "ride_id": "task_abc456",
  "quote": {
    "amount_sats": 15000,
    "description": "Euro cylinder lock — non-destructive picking required. Estimated 20 minutes. Includes new key cutting.",
    "status": "accepted",
    "submitted_at": "2026-02-11T12:15:00.000Z",
    "responded_at": "2026-02-11T12:16:00.000Z",
    "provider_pubkey": "e7f8a9b0c1d2..."
  }
}
```

**Expected Nostr Event (Spec)**:
Locksmith domain kind 30621 (Quote Acceptance) referencing the original quote event. TROTT-04 §Payment Terms (kind 30531) formalises the accepted price.

**What the API actually does**: `server.js` lines 2057-2083. Sets `ride.quote.status = 'accepted'`, records `responded_at`, and critically **updates the ride fare**: `ride.fare = ride.quote.amount_sats` (line 2071). This means subsequent completion will use the quoted price. Broadcasts `quote_accepted` WebSocket message.

**Missing**: No Nostr event published (neither kind 30621 nor kind 30531). No state transition is triggered — the task remains in `arrived` state. The spec implies the quote acceptance should trigger `access_method_confirmed`. No stake recalculation occurs despite the fare changing from 0 to 15000.

**VERDICT**: ⚠️ Friction — The fare is correctly updated but no state transition or stake recalculation occurs. The client must separately call the transition endpoint to move to `access_method_confirmed`.

---

#### Step 9 — Access Method Confirmed

After the customer accepts the quote, the locksmith confirms the access method and the task transitions to the working phase.

**HTTP Request**:
```http
POST /api/rides/task_abc456/transition HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "targetState": "access_method_confirmed",
  "driverPubkey": "e7f8a9b0c1d2...",
  "metadata": {
    "lock_type": "euro_cylinder",
    "access_type": "picking",
    "parts_required": false
  }
}
```

**Expected Nostr Event (Spec)**:
Locksmith domain kind 30622 (Access Method Confirmation) with tags: `lock_type`, `access_type`, `parts_required`.

**HTTP Response** (200):
```json
{
  "success": true,
  "ride": {
    "id": "task_abc456",
    "status": "access_method_confirmed",
    "metadata": {
      "lock_type": "euro_cylinder",
      "access_type": "picking",
      "parts_required": false
    }
  }
}
```

**WebSocket Broadcast**:
```json
{
  "type": "status_change",
  "ride_id": "task_abc456",
  "status": "access_method_confirmed",
  "previousStatus": "arrived",
  "timestamp": 1739261600000
}
```

**What the API actually does**: `server.js` lines 1688-1726. The generic transition endpoint calls `rideManager.transitionTo(rideId, targetState, metadata)`. The `task-manager.js` `transitionTo()` method (line 302) validates the transition (`arrived` → `access_method_confirmed` is valid per `locksmith.js` line 37) and stores the metadata on the task. The WebSocket broadcast is `status_change` (generic, domain-agnostic).

**Note**: The transition `arrived` → `access_method_confirmed` is only valid for the locksmith domain. Ridesharing does not define this state. The generic transition endpoint enables domain-specific flows without domain-specific code in `server.js`.

**VERDICT**: ✅ Match — The generic transition endpoint correctly supports the locksmith-specific `access_method_confirmed` state. Metadata (lock_type, access_type) is stored on the task. The WebSocket broadcast is domain-agnostic. No Nostr event is published (kind 30622), but the state machine works correctly.

---

#### Step 10 — Work Active

The locksmith begins working.

**HTTP Request**:
```http
POST /api/rides/task_abc456/start HTTP/1.1
Host: localhost:3000
```

**HTTP Response** (200):
```json
{
  "success": true,
  "ride": {
    "id": "task_abc456",
    "status": "work_active",
    "timestamps": { "started": 1739261700000 }
  }
}
```

**WebSocket Broadcast**:
```json
{
  "type": "trip_started",
  "ride_id": "task_abc456",
  "ride": { "...full task object..." }
}
```

**What the spec says**: The locksmith domain defines `work_active` as the active work phase (ACTIVE state value in the profile).

**What the API actually does**: `server.js` line 1663 calls `rideManager.startTrip()` which transitions to `this.states.ACTIVE`. For locksmith, `ACTIVE` = `'work_active'` (see `locksmith.js` line 26). Then line 1664 calls `startStreamingForRide(rideId)`.

**Problem**: The locksmith profile has `streaming: false` (see `locksmith.js` line 98), but the `startTrip` endpoint unconditionally calls `startStreamingForRide()`. Since the fare is now 15000 (updated when the quote was accepted), `startStreamingForRide()` will begin streaming 1000 sats/tick × 15 ticks. This is incorrect for locksmith — the pricing model is `flatRate` with simple lump-sum payment, not streaming.

**VERDICT**: ❌ Gap — `startStreamingForRide()` is called unconditionally regardless of the domain profile's `streaming: false` feature flag. Locksmith tasks should not have streaming payments. The WebSocket type `trip_started` is also semantically wrong for locksmith (should be `work_started` or similar).

---

#### Step 11 — Completion (Access Gained)

The locksmith gains entry.

**HTTP Request** (MVP API):
```http
POST /api/rides/task_abc456/complete HTTP/1.1
Host: localhost:3000
```

**HTTP Response** (200):
```json
{
  "success": true,
  "ride": {
    "id": "task_abc456",
    "status": "access_gained",
    "payment": {
      "success": true,
      "payment_hash": "mock_hash_1739262000000",
      "amount_sats": 15000,
      "timestamp": 1739262000000
    },
    "duration": 300
  },
  "payment": {
    "success": true,
    "payment_hash": "mock_hash_1739262000000",
    "amount_sats": 15000,
    "timestamp": 1739262000000
  }
}
```

**WebSocket Broadcast**:
```json
{
  "type": "trip_completed",
  "ride_id": "task_abc456",
  "ride": { "...full task object..." },
  "payment": { "...payment object..." }
}
```

**What the spec says**: Task transitions to `completed` (locksmith domain: `access_gained`). TROTT-01 kind 30504 (Task Complete). Completion proof includes GPS arrival confirmation and optional photo of completed work (see `locksmith.js` line 66: `completionProofTypes: ['gps_arrival', 'photo']`). The spec also defines `confirmed` as a follow-up state (kind 30505) where the customer confirms the work.

**What the API actually does**: `server.js` line 3138. Calls `rideManager.completeTrip()` which transitions `work_active` → `access_gained` (the COMPLETED state for locksmith). Payment is mocked. Streaming is stopped (line 3157). The WebSocket type is `trip_completed` — semantically wrong for locksmith.

**Missing**: No completion proof is required or validated. No kind 30504 event published. No `confirmed` state or endpoint.

**VERDICT**: ⚠️ Friction — The state machine correctly transitions to `access_gained`. The WebSocket type `trip_completed` is ridesharing-specific. No completion proof validation. No Nostr event published.

---

#### Step 12 — Rating

Customer rates the locksmith.

**HTTP Request**:
```http
POST /api/rides/task_abc456/rate HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "rating": 5,
  "comment": "Gained entry without any damage. Very professional.",
  "raterPubkey": "a1b2c3d4e5f6...",
  "raterRole": "requester"
}
```

**HTTP Response** (200):
```json
{
  "success": true,
  "rating": 5,
  "target_hex": "e7f8a9b0c1d2...",
  "target_npub": "npub1locksmith7x8y9z...",
  "cached_locally": true
}
```

**What the spec says**: TROTT-03 kind 30520. Locksmith rating criteria: `overall` (0.25), `punctuality` (0.20), `workmanship` (0.25), `pricing_fairness` (0.15), `tidiness` (0.15).

**What the API actually does**: Same as ridesharing — `server.js` lines 1832-1935. The simple rating path (Path B) stores a single 1-5 rating without per-criterion breakdown. The rating criteria are defined in the locksmith profile but not enforced by the API — a client could submit a single rating without specifying `workmanship` or `pricing_fairness` scores.

**VERDICT**: ⚠️ Friction — The rating endpoint works but the simple path does not enforce domain-specific criteria. The full Nostr event path (Path A) supports criteria tags but does not validate them against the domain profile's `ratingCriteria`.

---

### Edge Cases

#### Customer Declines On-Site Quote

**HTTP Request**:
```http
POST /api/rides/task_abc456/quote/decline HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "reason": "Price too high"
}
```

**HTTP Response** (200):
```json
{
  "success": true
}
```

**WebSocket Broadcast**:
```json
{
  "type": "quote_declined",
  "ride_id": "task_abc456",
  "quote": {
    "amount_sats": 15000,
    "description": "Euro cylinder lock...",
    "status": "declined",
    "responded_at": "2026-02-11T12:20:00.000Z",
    "decline_reason": "Price too high"
  }
}
```

**What the spec says**: The locksmith cancellation policy (line 96 of [`domains/locksmith.md`](https://github.com/TheCryptoDonkey/trott/blob/main/domains/locksmith.md)) states: "Customer declines on-site quote — None to customer; locksmith forfeits travel-only stake." This is a distinct penalty model — the customer walks away penalty-free, but the locksmith loses their travel stake because they quoted a price the customer wouldn't accept.

**What the API actually does**: `server.js` lines 2087-2113. The quote decline endpoint sets `ride.quote.status = 'declined'` and broadcasts `quote_declined`. However, it does **not**:
- Transition the task to `cancelled`
- Trigger any stake forfeit or release
- Handle the asymmetric penalty model

The task remains in `arrived` state after a quote decline. The client would need to separately call a cancel endpoint to close the task, and the penalty logic does not distinguish "customer declined quote" from "customer cancelled after arrival".

**VERDICT**: ❌ Gap — The asymmetric penalty model (customer penalty-free, locksmith forfeits travel stake) is not implemented. Quote decline does not trigger cancellation or stake handling. The API treats decline as a pure state update without consequences.

---

#### No-Show (Customer Absent)

**What the spec says**: If the customer is not present when the locksmith arrives, the task transitions to `no_show`. Customer's stake is automatically forfeited (100%).

**What the API actually does**: Same as ridesharing — no automatic no-show detection or timer. The `no_show` state is valid from `arrived` (per `locksmith.js` line 36), but no endpoint or timer triggers it. Manual transition via the generic endpoint would work but without stake handling.

**VERDICT**: ❌ Gap — No automatic no-show handling.

---

#### Emergency Lockout Urgency Signal

**What the spec says**: The locksmith domain includes `service_urgency` tag with values `emergency`, `urgent`, `scheduled`. Emergency lockouts (e.g. locked out at night, child locked in car) should be prioritised in discovery.

**What the API actually does**: No urgency filtering in discovery. The `service_urgency` tag is not accepted in the task creation body or used in any matching logic.

**VERDICT**: ❌ Gap — Urgency signalling is defined in the spec but not implemented.

---

#### Guarantee Period

**What the spec says**: Locksmith domain kind 30623 (Guarantee Period Start). After completion, the locksmith may offer a guarantee on their work. This could involve holding back a portion of the payment during the guarantee period.

**What the API actually does**: The locksmith profile has `guaranteePeriod: true` (see `locksmith.js` line 102). The event kind 30605 is listed in the profile's `eventKinds.guaranteeStart` (line 145). However, no API endpoint exists to start, manage, or conclude a guarantee period. No payment hold-back mechanism is implemented.

**VERDICT**: ❌ Gap — Guarantee period is flagged in the profile but entirely unimplemented in the API.

---

### Spec-vs-Implementation Gap Table

| Feature | Spec Reference | API Endpoint | Status |
|---------|---------------|--------------|--------|
| Geohash + skill discovery | TROTT-02, kind 20500/30510 | `GET /api/drivers/available` | ⚠️ Friction |
| Task request (lockout) | TROTT-01, kind 30500 | `POST /api/rides/request` | ⚠️ Friction |
| Domain-specific tags | Locksmith spec §Tags | (none in request body) | ❌ Gap |
| Stake lock | TROTT-04, kind 30532 | `POST /rides/:id/rider-stake` | ⚠️ Friction |
| Stake recalculation on quote | Locksmith spec §Stakes | (none) | ❌ Gap |
| Task accept | TROTT-01, kind 30502 | `POST /api/rides/:id/accept` | ⚠️ Friction |
| Location tracking | TROTT-07 (not required) | `POST /api/rides/:id/location` | 🔧 Enhancement |
| Arrival | TROTT-01, kind 30503 | `POST /api/rides/:id/arrive` | ✅ Match |
| Quote submission | TROTT-04 kind 30530, locksmith kind 30620 | `POST /api/rides/:id/quote` | ⚠️ Friction |
| Quote acceptance | Locksmith kind 30621 | `POST /api/rides/:id/quote/accept` | ⚠️ Friction |
| Quote decline | Locksmith kind 30621 | `POST /api/rides/:id/quote/decline` | ⚠️ Friction |
| Asymmetric penalty on decline | Locksmith spec §Cancellation | (none) | ❌ Gap |
| Access method confirmed | Locksmith kind 30622 | `POST /api/rides/:id/transition` | ✅ Match |
| Work active | TROTT-01 | `POST /api/rides/:id/start` | ⚠️ Friction |
| Streaming disabled for flatRate | Locksmith profile `streaming: false` | (streaming starts anyway) | ❌ Gap |
| Completion (access gained) | TROTT-01, kind 30504 | `POST /api/rides/:id/complete` | ⚠️ Friction |
| Completion proof (GPS + photo) | Locksmith spec §Proof | `POST /api/rides/:id/proof` | ⚠️ Friction |
| Task confirm | TROTT-01, kind 30505 | (none) | ❌ Gap |
| Rating | TROTT-03, kind 30520 | `POST /api/rides/:id/rate` | ⚠️ Friction |
| Guarantee period | Locksmith kind 30623 | (none) | ❌ Gap |
| No-show auto-forfeit | Locksmith spec §Cancellation | (none) | ❌ Gap |
| Urgency signalling | Locksmith spec §Tags | (none) | ❌ Gap |
| MLA verification | Locksmith spec §Regulatory | (none) | ❌ Gap |
| Tipping | TROTT-04, kind 30537 | `POST /api/rides/:id/tip` | 🔧 Enhancement |
| Dispute filing | TROTT-05, kind 30543 | `POST /api/rides/:id/dispute` | 🔧 Enhancement |

**Summary**: 2 ✅ Match, 10 ⚠️ Friction, 10 ❌ Gap, 3 🔧 Enhancement

---

### Cross-Cutting Observations (Use Cases 1 & 2)

**1. Dual API surface**: The legacy API (`/rides/*`) handles staking and NIP-98 auth; the MVP API (`/api/rides/*`) handles the task lifecycle without staking. Neither is complete on its own. A full ride flow requires calling both API surfaces.

**2. No Nostr event publication on the lifecycle path**: Task creation, acceptance, state transitions, and completion do not publish Nostr events (kinds 30500-30506). Only stakes (via `stakeEvents`), streaming ticks (via `stakeEvents.publishStreamPayment`), ratings (via `reputation.publishRating`), and panics (via `reputation.publishPanic`) are published.

**3. WebSocket message types are ridesharing-flavoured**: `ride_request`, `ride_matched`, `driver_arrived`, `driver_location`, `trip_started`, `trip_completed` — all use ridesharing terminology regardless of the active domain. Only `task_matched` and `status_change` are domain-agnostic.

**4. Domain-specific tags are not captured**: The API request bodies are generic. Domain-specific tags (`vehicle_type`, `lock_type`, `service_urgency`, etc.) defined in the specs are not accepted, stored, or published.

**5. State value naming diverges from spec**: The implementation profiles use shortened state names (`en_route`, `arrived`, `active`, `completed`) while the specs use longer names (`provider_en_route`, `provider_arrived`, `trip_active`, `access_gained`). The locksmith profile does use the spec names for its domain-specific states (`lockout_reported`, `locksmith_matched`, `access_method_confirmed`, `work_active`, `access_gained`).

**6. The generic transition endpoint is the most spec-aligned feature**: `POST /api/rides/:id/transition` (line 1688) supports any valid state transition defined by the domain profile, making it the primary mechanism for domain-specific flows. This is a strong architectural decision that enables domain extensibility without modifying `server.js`.

---

## Use Case 3: Delivery (Full Implementation)

**Domain profile:** `src/domain-profiles/delivery.js`
**Coordination pattern:** Relay delivery (3-phase: pickup, transit, delivery)
**Implementation status:** FULL — domain profile exists, server.js supports all transitions
**State machine:** 12 states (the most complex of any implemented domain)

### 3.1 Happy Path: Complete Delivery Lifecycle

---

#### Step 1: Discovery — Sender Discovers Available Couriers

**HTTP Request:**
```http
GET /api/drivers/available HTTP/1.1
Host: localhost:3000
```

**Expected Nostr Event:**
- Kind 20500 (ephemeral availability broadcast) — not published by the API; couriers register availability via WebSocket `register_driver` message, stored in Redis.

**Expected HTTP Response (200):**
```json
{
  "drivers": [
    {
      "npub": "npub1courier_abc123...",
      "name": "Alex",
      "location": { "lat": 51.5074, "lon": -0.1278 },
      "available": true,
      "rating": 4.7,
      "totalRides": 42,
      "lastUpdate": 1739289600000
    }
  ],
  "count": 1,
  "timestamp": 1739289600000
}
```

**What the spec says (TROTT-02):** Discovery uses geohash broadcast (kind 20500) for provider availability and kind 30510 for provider profiles. Couriers should advertise their location and capacity. The `delivery.md` spec says discovery is geographic broadcast.

**What the API actually does (server.js lines 1156-1203):** Returns all online providers from Redis (`driver:online:*` keys). No geohash filtering — returns ALL online drivers regardless of proximity. No domain-specific tags (package capacity, vehicle type) are included.

**VERDICT:** ⚠️ Friction — Discovery returns all providers without geohash filtering. No delivery-specific provider attributes (vehicle capacity, maximum package weight) are exposed. The endpoint uses the generic `drivers` terminology rather than `couriers`.

---

#### Step 2: Task Creation — Sender Requests Collection

**HTTP Request:**
```http
POST /api/rides/request HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "pickup_lat": 51.5074,
  "pickup_lon": -0.1278,
  "dropoff_lat": 51.4816,
  "dropoff_lon": -0.0090,
  "rider_npub": "npub1sender_abc123...",
  "currency": "GBP",
  "domain": "delivery"
}
```

**Expected Nostr Event:**
- Kind 30500 (Task Request) with tags: `["d", "task_abc123"]`, `["domain", "delivery"]`, `["location_lat", "51.5074"]`, `["location_lon", "-0.1278"]`, `["package_size", "medium"]`, `["fragile", "false"]`, `["requires_signature", "true"]`, `["recipient_pubkey", "<hex>"]`.

**Expected HTTP Response (200):**
```json
{
  "success": true,
  "ride_id": "task_abc123",
  "status": "collection_requested",
  "estimated_fare": 850,
  "estimated_cost": "0.00000850 BTC",
  "distance_km": 8.2,
  "duration_minutes": 22,
  "drivers_notified": 3,
  "route": [[51.5074, -0.1278], [51.4900, -0.0500], [51.4816, -0.0090]],
  "currency": "GBP",
  "estimate": { "fare": { "sats": 850, "gbp": 8.50 } }
}
```

**Expected WebSocket Broadcast:**
```json
{
  "type": "ride_request",
  "ride": {
    "id": "task_abc123",
    "pickup": { "lat": 51.5074, "lon": -0.1278 },
    "dropoff": { "lat": 51.4816, "lon": -0.0090 },
    "fare": 850,
    "distance": 8.2,
    "currency": "GBP",
    "rider": { "npub": "npub1sender_abc123...", "pubkey": null }
  }
}
```

**What the spec says (TROTT-01):** Task Request (kind 30500) should include domain-specific tags. Delivery spec requires `package_size`, `package_weight`, `fragile`, `requires_signature`, `recipient_pubkey`, and `delivery_instructions` tags.

**What the API actually does (server.js lines 1342-1497):** Creates a task via `rideManager.createTask()` with the delivery domain profile. The initial state is correctly set to `collection_requested`. However, the API does NOT accept delivery-specific fields (package_size, weight, fragile, requires_signature, recipient_pubkey) in the request body — the request format is identical to ridesharing. Task IDs are prefixed with `task_` (not `ride_`) when the domain is not ridesharing (line 122 of task-manager.js). The WebSocket broadcast still uses the `ride_request` type name. The pricing model uses `estimateTripCost()` which calculates distance+time, not the spec's distance+weight model.

**VERDICT:** ⚠️ Friction — Initial state `collection_requested` is correct, but the API has no way to pass delivery-specific tags (package_size, fragile, requires_signature, recipient_pubkey). The pricing model uses distance+time rather than the spec's distance+weight formula. WebSocket message type is `ride_request` rather than `task_request`.

---

#### Step 3: Stake Locking — Sender Locks Stake

**HTTP Request:**
```http
POST /rides/create HTTP/1.1
Host: localhost:3000
Content-Type: application/json
Authorization: Nostr <base64_nip98_event>

{
  "rideId": "task_abc123",
  "riderId": "<sender_pubkey_hex>",
  "fareAmount": 850,
  "currency": "GBP"
}
```

**Expected Nostr Event:**
- Kind 30532 (Stake Lock) with tags: `["amount", "85"]`, `["currency", "GBP"]`, `["trust_model", "custodial"]`, `["role", "sender"]`.

**Expected HTTP Response (200):**
```json
{
  "success": true,
  "rideId": "task_abc123",
  "invoice": "lnbc850n1p...",
  "stakeAmount": 85,
  "operatorFee": 4,
  "currency": "GBP",
  "expiresAt": 1739290200000
}
```

**What the spec says (TROTT-04, delivery.md):** Sender stakes 10% of the delivery fee. Courier stakes 15%. For high-value parcels, the operator MAY require an increased courier stake.

**What the API actually does (server.js lines 666-720):** Calculates rider (sender) stake as `Math.max(minStakeAmount, Math.floor(fareSats * 0.1))` — matches the 10% spec. No mechanism to increase stakes for high-value parcels. NIP-98 auth is required for this endpoint. The stake is domain-agnostic; it uses the same calculation for all domains rather than reading `stakingModel` from the profile.

**VERDICT:** ✅ Match — Stake percentages align (10% sender). The `stakingModel` in `delivery.js` specifies `requesterStakePercent: 0.10` and `providerStakePercent: 0.15`, matching server.js hardcoded values. No high-value parcel surcharge mechanism exists.

---

#### Step 4: Acceptance — Courier Accepts the Delivery

**HTTP Request:**
```http
POST /api/rides/task_abc123/accept HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "driver_npub": "npub1courier_def456...",
  "driver_name": "Alex",
  "driver_location": { "lat": 51.5200, "lon": -0.1300 },
  "driver_rating": 4.7,
  "driver_pubkey": "def456abc789..."
}
```

**Expected Nostr Event:**
- Kind 30501 (Task Acceptance) with tags: `["e", "task_abc123"]`, `["p", "<sender_pubkey>"]`, `["domain", "delivery"]`.

**Expected HTTP Response (200):**
```json
{
  "success": true,
  "ride": {
    "id": "task_abc123",
    "domain": "delivery",
    "status": "en_route_to_pickup",
    "driver": {
      "npub": "npub1courier_def456...",
      "pubkey": "def456abc789...",
      "name": "Alex",
      "location": { "lat": 51.5200, "lon": -0.1300 },
      "rating": 4.7
    },
    "pickup": { "lat": 51.5074, "lon": -0.1278 },
    "dropoff": { "lat": 51.4816, "lon": -0.0090 }
  },
  "eta_seconds": 480,
  "driver_route": [[51.5200, -0.1300], [51.5100, -0.1280], [51.5074, -0.1278]]
}
```

**Expected WebSocket Broadcasts:**
```json
{ "type": "ride_matched", "ride": { "id": "task_abc123", "status": "en_route_to_pickup", "driver": { ... }, "eta_seconds": 480 } }
{ "type": "task_matched", "task": { "id": "task_abc123", "status": "en_route_to_pickup", "driver": { ... }, "eta_seconds": 480 } }
```

**What the spec says (TROTT-01):** Acceptance transitions to the matched state, then provider en route. Delivery spec shows: `accepted -> en_route_to_pickup`.

**What the API actually does (server.js lines 1500-1572):** `acceptRide()` transitions to `courier_matched`, then `startEnRoute()` immediately transitions to `en_route_to_pickup`. Both transitions happen in a single request. The response status will show `en_route_to_pickup` because both transitions are executed atomically. Both `ride_matched` and `task_matched` WebSocket messages are broadcast (dual emission for backward compatibility).

**VERDICT:** ✅ Match — The accept endpoint correctly chains `courier_matched` -> `en_route_to_pickup` in one call. The delivery profile's state names are used correctly. Field names still use `driver` rather than `courier` in the response body and WebSocket payloads.

---

#### Step 5: En Route to Pickup — Courier Location Updates

**HTTP Request:**
```http
POST /api/rides/task_abc123/location HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "lat": 51.5150,
  "lon": -0.1290
}
```

**Expected Nostr Event:**
- Kind 20501 (ephemeral location update) — not published by the API; location updates are in-memory only.

**Expected HTTP Response (200):**
```json
{
  "success": true,
  "eta_seconds": 240
}
```

**Expected WebSocket Broadcasts:**
```json
{ "type": "driver_location", "ride_id": "task_abc123", "location": { "lat": 51.5150, "lon": -0.1290 }, "eta_seconds": 240 }
{ "type": "location_update", "data": { "lat": 51.5150, "lng": -0.1290, "eta_seconds": 240 } }
```

**What the spec says (TROTT-07):** Live tracking via ephemeral kind 20501. Delivery spec says routing, ETA, and live tracking are all used.

**What the API actually does (server.js lines 1574-1628):** Updates in-memory location on the ride object. Calculates ETA using `rideManager.calculateETA()`. During `en_route_to_pickup` state, destination is set to `ride.pickup` (correct — courier heading to collection point). Broadcasts both `driver_location` (legacy) and `location_update` (React frontend) formats. No Nostr event is published. The delivery spec has a 1 km route deviation threshold, but the API does not implement route deviation detection.

**VERDICT:** ⚠️ Friction — Location tracking works but uses `driver_location` message type rather than domain-neutral `courier_location`. No route deviation detection (delivery spec specifies 1 km threshold). No Nostr event publication for live tracking (TROTT-07 kind 20501).

---

#### Step 6: Arrived at Pickup — Courier Arrives at Collection Point

**HTTP Request:**
```http
POST /api/rides/task_abc123/arrive HTTP/1.1
Host: localhost:3000
```

**Expected Nostr Event:**
- Kind 30503 (Task Update) with tags: `["status", "arrived_at_pickup"]`.

**Expected HTTP Response (200):**
```json
{
  "success": true,
  "ride": {
    "id": "task_abc123",
    "status": "arrived_at_pickup",
    "timestamps": { "providerArrived": 1739290000000 }
  }
}
```

**Expected WebSocket Broadcast:**
```json
{ "type": "driver_arrived", "ride_id": "task_abc123", "ride": { "status": "arrived_at_pickup" } }
```

**What the spec says (TROTT-01, delivery.md):** `en_route_to_pickup` -> `arrived_at_pickup` is a valid transition.

**What the API actually does (server.js lines 1630-1656):** Calls `rideManager.arriveAtPickup()` which transitions from `en_route_to_pickup` to `arrived_at_pickup` (delivery profile's `PROVIDER_ARRIVED` state). Broadcasts `driver_arrived` message.

**VERDICT:** ✅ Match — State transition is correct. WebSocket message type uses `driver_arrived` rather than `courier_arrived` but the state value `arrived_at_pickup` is delivery-domain-specific and correct.

---

#### Step 7: Collection + Photo Proof — Courier Collects Parcel

This is a two-step process: (a) submit proof of collection photo, then (b) transition to `collected` state.

**Step 7a: Submit Collection Photo Proof**

**HTTP Request:**
```http
POST /api/rides/task_abc123/proof HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "type": "photo",
  "fileName": "collection_proof_2026-02-11.jpg",
  "mimeType": "image/jpeg",
  "sizeBytes": 245760,
  "providerPubkey": "def456abc789..."
}
```

**Expected Nostr Event:**
- Kind 30640 (Proof of Collection) with tags: `["proof_of_collection_photo", "<sha256_hash>"]`, `["e", "task_abc123"]`.

**Expected HTTP Response (200):**
```json
{
  "success": true,
  "proofCount": 1
}
```

**What the spec says (delivery.md):** Proof of collection is a geotagged photo documenting parcel condition at pickup, used as a baseline for damage disputes. Kind 30640.

**What the API actually does (server.js lines 1977-2015):** Stores proof metadata on the ride object (`ride.proofs.push()`). Accepts `type`, `fileName`, `mimeType`, `sizeBytes`, and `providerPubkey`. Does NOT publish a Nostr event (kind 30640). Does NOT store geotagging data (lat/lon of where the photo was taken). Does NOT compute or store a SHA-256 hash of the photo. The proof type is generic — no distinction between collection proof and delivery proof. No WebSocket broadcast for proof submission.

**VERDICT:** ⚠️ Friction — The proof endpoint works generically but lacks delivery-specific semantics. No Nostr event kind 30640 is published. No geolocation tagging. No SHA-256 hash computation. No distinction between collection proof and delivery proof (both use the same generic `/proof` endpoint). No WebSocket notification to the sender.

**Step 7b: Transition to Collected State**

**HTTP Request:**
```http
POST /api/rides/task_abc123/transition HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "targetState": "collected",
  "metadata": {
    "proof_of_collection": true,
    "parcel_condition": "good"
  }
}
```

**Expected Nostr Event:**
- Kind 30503 (Task Update) with tags: `["status", "collected"]`, `["proof_of_collection_photo", "<sha256>"]`.

**Expected HTTP Response (200):**
```json
{
  "success": true,
  "ride": {
    "id": "task_abc123",
    "status": "collected",
    "metadata": { "proof_of_collection": true, "parcel_condition": "good" }
  }
}
```

**Expected WebSocket Broadcast:**
```json
{
  "type": "status_change",
  "ride_id": "task_abc123",
  "status": "collected",
  "previousStatus": "arrived_at_pickup",
  "timestamp": 1739290100000
}
```

**What the spec says (delivery.md):** `arrived_at_pickup` -> `collected` transition. The `collected` state means the courier has the parcel and proof of collection has been captured.

**What the API actually does (server.js lines 1688-1726):** Uses the generic `POST /api/rides/:rideId/transition` endpoint. Calls `rideManager.transitionTo(rideId, "collected", metadata)` which validates the transition against the delivery profile's state machine. The delivery profile allows `arrived_at_pickup` -> `collected`. Metadata is stored on the task object. Broadcasts a `status_change` WebSocket message.

**VERDICT:** ✅ Match — The generic transition endpoint correctly validates and executes the delivery-specific `collected` transition. Metadata support allows storing arbitrary collection details. However, the API does NOT enforce that a proof of collection photo must be submitted before transitioning to `collected` — this is a gap between spec intent and implementation.

---

#### Step 8: In Transit — Courier Begins Transport

**HTTP Request:**
```http
POST /api/rides/task_abc123/start HTTP/1.1
Host: localhost:3000
```

**Expected Nostr Event:**
- Kind 30503 (Task Update) with tags: `["status", "in_transit"]`.

**Expected HTTP Response (200):**
```json
{
  "success": true,
  "ride": {
    "id": "task_abc123",
    "status": "in_transit",
    "timestamps": { "started": 1739290200000 }
  }
}
```

**Expected WebSocket Broadcast:**
```json
{ "type": "trip_started", "ride_id": "task_abc123", "ride": { "status": "in_transit" } }
```

**What the spec says (delivery.md):** `collected` -> `in_transit`. Delivery spec says optional streaming payments (per 100m) for long-distance deliveries.

**What the API actually does (server.js lines 1658-1685):** Calls `rideManager.startTrip()` which transitions to the `ACTIVE` state — in the delivery profile, `ACTIVE` maps to `in_transit`. Calls `startStreamingForRide()` which begins streaming payment ticks every 1 second (server constant `STREAM_INTERVAL_MS = 1000`), dividing the fare into 15 steps (`STREAM_STEPS = 15`). The streaming interval is fixed at 1 second regardless of domain; the delivery spec calls for per-100m ticks.

**VERDICT:** ⚠️ Friction — State transition is correct (`in_transit`). Streaming payments start automatically, but the implementation uses a fixed 1-second time-based interval rather than the spec's per-100-metre distance-based interval. The delivery spec says streaming is optional (only for long-distance > 1 hour), but the implementation starts streaming unconditionally.

---

#### Step 9: Arrived at Delivery — Courier Reaches Destination

**HTTP Request:**
```http
POST /api/rides/task_abc123/transition HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "targetState": "arrived_at_delivery"
}
```

**Expected Nostr Event:**
- Kind 30503 (Task Update) with tags: `["status", "arrived_at_delivery"]`.

**Expected HTTP Response (200):**
```json
{
  "success": true,
  "ride": {
    "id": "task_abc123",
    "status": "arrived_at_delivery"
  }
}
```

**Expected WebSocket Broadcast:**
```json
{
  "type": "status_change",
  "ride_id": "task_abc123",
  "status": "arrived_at_delivery",
  "previousStatus": "in_transit",
  "timestamp": 1739291400000
}
```

**What the spec says (delivery.md):** `in_transit` -> `arrived_at_delivery`. The courier is at the delivery address; handover is pending.

**What the API actually does (server.js lines 1688-1726):** Uses the generic transition endpoint. The delivery profile allows `in_transit` -> `arrived_at_delivery`. Note: there is no dedicated `/arrive` endpoint for the delivery destination — the generic `/transition` must be used. The `/arrive` endpoint (line 1631) always transitions to `PROVIDER_ARRIVED` (which is `arrived_at_pickup` in delivery), so it cannot be reused for arrival at delivery.

**VERDICT:** ✅ Match — The transition works correctly through the generic endpoint. The distinction between pickup arrival (`/arrive`) and delivery arrival (`/transition`) is architecturally sound but may cause confusion for API consumers who expect a single arrival endpoint.

---

#### Step 10: Delivery + Photo Proof + Signature

**Step 10a: Submit Delivery Photo Proof**

**HTTP Request:**
```http
POST /api/rides/task_abc123/proof HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "type": "photo",
  "fileName": "delivery_proof_2026-02-11.jpg",
  "mimeType": "image/jpeg",
  "sizeBytes": 312000,
  "providerPubkey": "def456abc789..."
}
```

**Expected Nostr Event:**
- Kind 30641 (Proof of Delivery) with tags: `["proof_of_delivery_photo", "<sha256_hash>"]`, `["e", "task_abc123"]`.

**Expected HTTP Response (200):**
```json
{
  "success": true,
  "proofCount": 2
}
```

**Step 10b: Submit Recipient Signature**

**HTTP Request:**
```http
POST /api/rides/task_abc123/proof HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "type": "signature",
  "signature": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...",
  "providerPubkey": "def456abc789..."
}
```

**Expected HTTP Response (200):**
```json
{
  "success": true,
  "proofCount": 3
}
```

**What the spec says (delivery.md):** Dual proof system: (1) geotagged photo at delivery point, (2) digital signature from recipient if `requires_signature` is true. Kind 30641 for proof of delivery.

**What the API actually does (server.js lines 1977-2015):** The proof endpoint stores both photo and signature metadata. Signatures are stored with `type: "signature"` and `data: <signature_data>`. Photos are stored with type, fileName, mimeType, and sizeBytes. Both are appended to the same `ride.proofs` array. No Nostr event (kind 30641) is published. No validation that `requires_signature` was set on the original task. No validation that the signature comes from the `recipient_pubkey` specified at task creation. The delivery profile's `completionProofTypes: ['gps_arrival', 'photo', 'signature']` is defined but not enforced by the API.

**VERDICT:** ⚠️ Friction — The generic proof endpoint supports both photo and signature types, which covers the delivery use case. However: no Nostr event publication (kind 30641), no enforcement of the `requires_signature` tag, no verification of recipient identity against `recipient_pubkey`, and no distinction between collection proofs and delivery proofs. The `completionProofTypes` in the domain profile is defined but never validated by the server.

---

#### Step 11: Completion — Mark Delivery as Complete

**HTTP Request:**
```http
POST /api/rides/task_abc123/complete HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{}
```

**Expected Nostr Event:**
- Kind 30504 (Task Complete) with tags: `["status", "delivered"]`, `["e", "task_abc123"]`.
- Kind 30533 (Stake Release) for both sender and courier stakes.

**Expected HTTP Response (200):**
```json
{
  "success": true,
  "ride": {
    "id": "task_abc123",
    "status": "delivered",
    "payment": {
      "success": true,
      "payment_hash": "mock_hash_1739292000000",
      "amount_sats": 850,
      "timestamp": 1739292000000
    }
  },
  "payment": {
    "success": true,
    "payment_hash": "mock_hash_1739292000000",
    "amount_sats": 850,
    "timestamp": 1739292000000
  }
}
```

**Expected WebSocket Broadcasts:**
```json
{ "type": "trip_completed", "ride_id": "task_abc123", "ride": { "status": "delivered" }, "payment": { ... } }
{ "type": "ride_completed", "operatorFee": 4, "duration": 1800000, "currency": "GBP" }
```

**What the spec says (TROTT-01, delivery.md):** Completion transitions to the terminal `delivered` state. Stakes should be released for both parties. The delivery spec's completed state maps to `delivered`.

**What the API actually does (server.js lines 864-951):** The legacy `/rides/:rideId/complete` endpoint transitions the activeRides session to `completed` and calls `rideManager.completeTrip()` which transitions the TaskManager state to `COMPLETED` — which is `delivered` in the delivery profile. Streaming payments are stopped. Both stakes are released. The response uses `riderStakeReleased`/`driverStakeReleased` field names (ridesharing terminology). However, there is a critical issue: the `completeTrip()` method calls `validateTransition(task.status, completedState)` where `completedState` is `delivered`. For this to work, the task must be in a state that can transition to `delivered`. The delivery profile only allows `arrived_at_delivery` -> `delivered`. If the task is still in `in_transit` (because step 9 was skipped), this will fail.

There is also the `/api/rides/:rideId/complete` endpoint (line 864) which is the legacy staking API, and the TaskManager's `completeTrip` which is called within it. The `/api/rides/:rideId/complete` endpoint first checks the activeRides session status, not the TaskManager status.

**VERDICT:** ⚠️ Friction — Completion works but requires the task to be in `arrived_at_delivery` state first (due to delivery profile's state machine validation). The response uses ridesharing terminology (`riderStakeReleased`). No validation that both collection and delivery proofs were submitted before allowing completion. The `completionProofTypes` from the domain profile are not checked.

---

#### Step 12: Rating — Sender Rates Courier

**HTTP Request:**
```http
POST /api/rides/task_abc123/rate HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "rating": 5,
  "comment": "Parcel delivered in perfect condition, very prompt.",
  "raterPubkey": "<sender_pubkey_hex>",
  "raterRole": "requester"
}
```

**Expected Nostr Event:**
- Kind 30520 (Rating) with tags: `["p", "<courier_pubkey>"]`, `["rating", "5"]`, `["criteria", "overall", "5"]`, `["criteria", "punctuality", "5"]`, `["criteria", "package_care", "5"]`, `["criteria", "communication", "5"]`.

**Expected HTTP Response (200):**
```json
{
  "success": true,
  "rating": 5,
  "role": "rider",
  "target_hex": "def456abc789..."
}
```

**Expected WebSocket Broadcast:**
```json
{
  "type": "rating_submitted",
  "ride_id": "task_abc123",
  "role": "rider",
  "rating": 5,
  "target_hex": "def456abc789...",
  "timestamp": 1739292300000
}
```

**What the spec says (TROTT-03, delivery.md):** Ratings use kind 30520 with domain-specific criteria. Delivery criteria are: overall (0.30), punctuality (0.25), package_care (0.25), communication (0.20).

**What the API actually does (server.js lines 1832-1938):** Path B (simple rating) stores a single numeric rating (1-5). The `raterRole: "requester"` is mapped to `"rider"` (line 1894). Delivery-specific criteria (package_care) are NOT collected via the simple path. Path A (full Nostr event) would support criteria tags, but the simple path loses all granularity. No validation that the rating criteria match the delivery domain's `ratingCriteria`. The response uses `"rider"` as the role, not `"sender"`.

**VERDICT:** ⚠️ Friction — Simple rating works but loses delivery-specific criteria. The role mapping converts `"requester"` to `"rider"` rather than the delivery domain's `"sender"`. The delivery profile defines `ratingCriteria` with delivery-specific criteria (package_care), but these are only usable via Path A (full Nostr event).

---

### 3.2 Edge Cases

---

#### Edge Case 3A: Delivery Failure — Recipient Unavailable

**HTTP Request:**
```http
POST /api/rides/task_abc123/transition HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "targetState": "delivery_failed",
  "metadata": {
    "reason": "recipient_unavailable",
    "attempted_at": "2026-02-11T15:30:00Z",
    "notes": "No answer at door, doorbell rung twice"
  }
}
```

**Expected Nostr Event:**
- Kind 30643 (Delivery Attempt Failed) with tags: `["reason", "recipient_unavailable"]`, `["e", "task_abc123"]`.

**Expected HTTP Response (200):**
```json
{
  "success": true,
  "ride": {
    "id": "task_abc123",
    "status": "delivery_failed",
    "metadata": { "reason": "recipient_unavailable" }
  }
}
```

**What the spec says (delivery.md):** `arrived_at_delivery` -> `delivery_failed` is a valid transition. `delivery_failed` is a terminal state. Kind 30643 documents the failed attempt. Kind 30644 schedules a re-delivery. No penalty for delivery failure (recipient unavailable).

**What the API actually does:** The delivery profile allows `arrived_at_delivery` -> `delivery_failed` (line 42 of delivery.js). The generic transition endpoint validates and executes this. However, `delivery_failed` is listed in the terminal states array (line 45 of delivery.js), BUT the transitions table (line 43) also shows `delivery_failed` -> `returned_to_sender` — meaning it is not truly terminal in the graph sense. The TaskManager's `isTerminal()` method checks the `terminalStates` array, so once in `delivery_failed`, the system considers it terminal. The `transitionTo()` method checks `transitions[from]` — and since `delivery_failed` -> `returned_to_sender` IS defined in the transitions table, the `returned_to_sender` transition should still work despite `isTerminal()` returning true.

**VERDICT:** ✅ Match — The state machine correctly supports the delivery failure flow. The tension between `delivery_failed` being listed as terminal AND having an outgoing transition to `returned_to_sender` is a deliberate design choice — it prevents further forward progress (no new active states) while allowing the return flow. No Nostr event (kind 30643) is published, and no cancellation policy exemption (no penalty) is explicitly implemented.

---

#### Edge Case 3B: Returned to Sender

**HTTP Request:**
```http
POST /api/rides/task_abc123/transition HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "targetState": "returned_to_sender",
  "metadata": {
    "return_reason": "recipient_unavailable_after_3_attempts",
    "returned_at": "2026-02-11T17:00:00Z"
  }
}
```

**Expected Nostr Event:**
- Kind 30645 (Return to Sender) with tags: `["e", "task_abc123"]`, `["reason", "recipient_unavailable"]`.

**Expected HTTP Response (200):**
```json
{
  "success": true,
  "ride": {
    "id": "task_abc123",
    "status": "returned_to_sender"
  }
}
```

**What the spec says (delivery.md):** `delivery_failed` -> `returned_to_sender` is valid. Kind 30645 documents the return. `returned_to_sender` is terminal.

**What the API actually does:** The transition is validated against the delivery profile: `delivery_failed` -> `returned_to_sender` is in the transitions table. `returned_to_sender` is a terminal state with no outgoing transitions. No Nostr event is published.

**VERDICT:** ✅ Match — State transition works correctly. No Nostr event (kind 30645) is published.

---

#### Edge Case 3C: No-Show at Pickup

**HTTP Request:**
```http
POST /api/rides/task_abc123/transition HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "targetState": "no_show",
  "metadata": {
    "waited_minutes": 15,
    "reason": "sender_absent"
  }
}
```

**What the spec says (delivery.md):** `arrived_at_pickup` -> `no_show` is valid. Triggers automatic 100% sender stake forfeit.

**What the API actually does:** The transition is validated: `arrived_at_pickup` -> `no_show` is allowed. However, no automatic stake forfeit is triggered — the transition endpoint simply changes state and broadcasts `status_change`. Stake penalties would need to be handled separately via the cancellation flow or manual forfeit.

**VERDICT:** ❌ Gap — The state transition works, but automatic stake forfeit on no-show is not implemented. The spec says "100% of sender stake (automatic)" but the `/transition` endpoint does not trigger any payment operations.

---

#### Edge Case 3D: Package Damage During Transit

**HTTP Request:**
```http
POST /api/rides/task_abc123/proof HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "type": "photo",
  "fileName": "damage_report_2026-02-11.jpg",
  "mimeType": "image/jpeg",
  "sizeBytes": 198000,
  "providerPubkey": "def456abc789..."
}
```

**What the spec says (delivery.md):** Kind 30642 (Condition Report) documents parcel condition changes during transit. This is used for damage claims by comparing against the proof of collection baseline.

**What the API actually does:** The generic proof endpoint stores the photo metadata. There is no dedicated condition report endpoint. No Nostr event (kind 30642) is published. No mechanism to compare against the collection proof baseline. No damage claim workflow.

**VERDICT:** ❌ Gap — No condition report mechanism. The proof endpoint stores photos but has no concept of "condition change" or damage documentation. Kind 30642 is defined in the delivery profile's `eventKinds` but never used by the server.

---

### 3.3 Domain-Specific Scenarios

---

#### Scenario 3E: Dual Photo Proofs

The delivery domain requires TWO photo proofs: collection and delivery. The API supports this via the generic `/proof` endpoint, called twice. However, there is no enforcement that both proofs are present before completion.

**Implementation gap:** The `completionProofTypes: ['gps_arrival', 'photo', 'signature']` in `delivery.js` is declarative only — the server never checks `ride.proofs` against this list before allowing `completeTrip()`.

**VERDICT:** ⚠️ Friction — Both proofs CAN be submitted, but neither is REQUIRED. A delivery could be marked complete with zero proofs.

---

#### Scenario 3F: Signature Capture

**HTTP Request (signature):**
```http
POST /api/rides/task_abc123/proof HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "type": "signature",
  "signature": "data:image/png;base64,...",
  "providerPubkey": "def456abc789..."
}
```

**What the spec says:** Signature required when `requires_signature` tag is set. Signature should come from the `recipient_pubkey`.

**What the API actually does:** Stores signature data on the proof array. No validation of signatory identity. No check that `requires_signature` was set on the task.

**VERDICT:** ⚠️ Friction — Signature capture works mechanically, but no identity verification of the signatory and no enforcement of the `requires_signature` flag.

---

#### Scenario 3G: Package Dimensions/Weight Tags

**What the spec says:** Tags `package_size`, `package_weight`, `package_dimensions`, `fragile` should be included in the task request.

**What the API actually does:** The `POST /api/rides/request` body does not accept these fields. They are not stored on the task object.

**VERDICT:** ❌ Gap — No mechanism to pass or store delivery-specific package metadata.

---

#### Scenario 3H: Recipient Pubkey (Third-Party Delivery)

**What the spec says:** `recipient_pubkey` identifies a third-party recipient who is different from the sender. The recipient should be able to confirm delivery.

**What the API actually does:** No `recipient_pubkey` field is accepted in the task request. No mechanism for a third party to confirm or interact with the task.

**VERDICT:** ❌ Gap — Third-party recipient support is entirely absent from the implementation. The `recipient_pubkey` tag from the delivery spec has no corresponding API support.

---

#### Scenario 3I: Multi-Drop Delivery (Linked Tasks)

**What the spec says:** Not explicitly specified in the delivery domain profile, but TROTT-01 supports linked tasks via `linked_task` references.

**What the API actually does:** No linked task mechanism exists. Each delivery is an independent task.

**VERDICT:** ❌ Gap — No linked task support for multi-drop delivery routes.

---

### 3.4 Delivery Event Kind Usage Summary

| Kind  | Name                    | Defined In     | Used By Server | VERDICT |
|-------|-------------------------|----------------|----------------|---------|
| 30620 | Proof of Collection     | delivery.js    | No             | ❌ Gap  |
| 30621 | Proof of Delivery       | delivery.js    | No             | ❌ Gap  |
| 30622 | Condition Report        | delivery.js    | No             | ❌ Gap  |
| 30623 | Delivery Attempt Failed | delivery.js    | No             | ❌ Gap  |
| 30624 | Re-delivery Scheduled   | delivery.js    | No             | ❌ Gap  |
| 30625 | Return to Sender        | delivery.js    | No             | ❌ Gap  |

Note: The `delivery.js` profile defines event kinds 30620-30625, but the `delivery.md` spec uses 30640-30645 for the same events. This is a **numbering discrepancy** between the implementation profile and the domain spec.

**VERDICT:** ❌ Gap — The implementation profile `delivery.js` uses kind range 30620-30625, while the domain spec `delivery.md` uses 30640-30659. This is a clear conflict. Neither set is published by the server regardless.

---

---

## Use Case 4: Security Guard (SPEC-ONLY — Gap Analysis)

**Domain profile:** [`domains/security.md`](https://github.com/TheCryptoDonkey/trott/blob/main/domains/security.md)
**Coordination pattern:** Shift (sustained on-site presence with periodic heartbeat)
**Implementation status:** SPEC ONLY — no `src/domain-profiles/security.js` exists
**Event kind range:** 30720-30739

The security domain requires the most significant API extensions of any domain due to its unique shift-based pattern, mandatory heartbeat check-ins, patrol tracking, and regulatory (SIA) verification requirements.

### 4.1 Theoretical Happy Path

---

#### Step 1: Discovery with SIA Licence Verification

**Theoretical HTTP Request:**
```http
GET /api/providers/discovery?geohash=gcpvj&licence_type=security_guarding&available_from=2026-02-12T18:00:00Z&available_to=2026-02-13T06:00:00Z HTTP/1.1
Host: localhost:3000
```

**Expected Nostr Event:**
- Kind 20500 (Provider Availability) with tags: `["geohash", "gcpvj"]`, `["licence_type", "security_guarding"]`, `["sia_licence", "verified"]`.
- Kind 30510 (Provider Profile) with tags: `["assignment_type", "static_guard"]`, `["licence_type", "security_guarding"]`.

**What exists today:** `GET /api/drivers/available` returns all online providers from Redis. No filtering by licence type, availability window, or domain-specific attributes.

**What would be needed:**
- SIA licence number storage on provider profiles
- Real-time verification against the SIA public register API
- Filtering by licence type (security_guarding, door_supervision, close_protection, cctv)
- Time-window availability matching (shift-based scheduling)

**VERDICT:** ❌ Gap — No SIA verification, no licence-type filtering, no shift-based availability matching.

---

#### Step 2: Assignment Request

**Theoretical HTTP Request:**
```http
POST /api/tasks/request HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "pickup_lat": 51.5155,
  "pickup_lon": -0.1419,
  "rider_npub": "npub1client_abc123...",
  "currency": "GBP",
  "domain": "security",
  "shift_start": "2026-02-12T18:00:00Z",
  "shift_end": "2026-02-13T06:00:00Z",
  "site_type": "commercial",
  "security_level": "standard",
  "assignment_type": "static_guard",
  "number_of_guards": 1,
  "heartbeat_interval_minutes": 30,
  "uniform_required": true
}
```

**Expected Nostr Event:**
- Kind 30720 (Security Assignment Request) with all domain-specific tags.

**What exists today:** `POST /api/rides/request` accepts `pickup_lat`, `pickup_lon`, and `domain`, but none of the security-specific fields. The delivery profile does not `requiresDestination`, and security similarly would not (single-location). The task would be created with an initial state but no shift metadata.

**What would be needed:**
- Accept security-specific fields in the request body
- Store shift_start, shift_end, number_of_guards, heartbeat_interval_minutes
- Calculate pricing based on hourly rate x shift duration
- Publish kind 30720 event

**VERDICT:** ❌ Gap — Cannot pass shift times, guard count, security level, or other domain-specific parameters.

---

#### Step 3: Stake Locking

**Theoretical Calculation:**
- 12-hour shift at GBP 15/hour = GBP 180 total
- Client stake: 10% = GBP 18 (1800 pence)
- Officer stake: 20% = GBP 36 (3600 pence) — higher due to abandonment severity

**What exists today:** The staking API uses 10% requester / 15% provider, hardcoded. Security spec requires 10% / 20%.

**What would be needed:**
- Read `stakingModel` from the domain profile (security would define `providerStakePercent: 0.20`)
- Support domain-specific stake percentages

**VERDICT:** ⚠️ Friction — The staking mechanism exists but uses hardcoded percentages. The server does not read `stakingModel` from the domain profile. Would need a `security.js` profile with `providerStakePercent: 0.20`.

---

#### Step 4: Acceptance

**Theoretical HTTP Request:**
```http
POST /api/rides/task_abc123/accept HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "driver_npub": "npub1officer_def456...",
  "driver_name": "Officer Smith",
  "driver_location": { "lat": 51.5000, "lon": -0.1200 },
  "driver_rating": 4.9,
  "driver_pubkey": "def456abc789...",
  "sia_licence_number": "1234567890123456"
}
```

**What exists today:** The accept endpoint works generically but does not validate SIA licence or store it. The field names use `driver_*` rather than `officer_*`.

**VERDICT:** ⚠️ Friction — Accept mechanism works but no SIA verification step.

---

#### Step 5: Provider En Route

Works with existing `POST /api/rides/:id/accept` (which chains to `startEnRoute()`). No changes needed for this step.

**VERDICT:** ✅ Match — Generic en route mechanism is sufficient.

---

#### Step 6: Briefed (Site Briefing Acknowledged)

**Theoretical HTTP Request:**
```http
POST /api/rides/task_abc123/transition HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "targetState": "briefed",
  "metadata": {
    "site_briefing_acknowledged": true,
    "briefing_event_id": "<kind_30724_event_id>"
  }
}
```

**Expected Nostr Event:**
- Kind 30724 (Site Briefing) — encrypted via NIP-44 to the assigned officer only. Contains site access procedures, alarm codes, key locations, emergency contacts. Uses `expiration` tag (NIP-40) to auto-prune after shift window.

**What exists today:** The generic transition endpoint can transition to any state defined in a domain profile. A `security.js` profile would need to define the `briefed` state. No site briefing encryption or NIP-44 support in the API.

**What would be needed:**
- New endpoint: `POST /api/tasks/:id/briefing` to publish encrypted site briefing (kind 30724)
- NIP-44 encryption of sensitive site data
- NIP-40 expiration tag
- State machine definition with `briefed` state

**VERDICT:** ❌ Gap — No site briefing endpoint. No NIP-44 encryption mechanism. The generic transition endpoint could handle the state change but not the briefing content.

---

#### Step 7: On Station

**Theoretical HTTP Request:**
```http
POST /api/rides/task_abc123/transition HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "targetState": "on_station",
  "metadata": {
    "arrived_at": "2026-02-12T17:55:00Z"
  }
}
```

**What exists today:** Generic transition would work IF a security profile defined `on_station` in its state machine.

**VERDICT:** 🔧 Enhancement — Transition mechanism exists; needs security domain profile implementation.

---

#### Step 8: Heartbeat Check-Ins (Every 30 Minutes)

**Theoretical HTTP Request (check-in request from server):**
```json
// WebSocket message from server to officer:
{
  "type": "safety_checkin_request",
  "task_id": "task_abc123",
  "deadline_seconds": 300,
  "sequence": 1
}
```

**Theoretical HTTP Request (officer responds):**
```http
POST /api/rides/task_abc123/check-in HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "status": "ok",
  "source": "scheduled",
  "note": "All quiet, patrol completed",
  "by": "officer"
}
```

**Expected Nostr Event:**
- Kind 30541 (Safety Check-in) with tags: `["status", "ok"]`, `["sequence", "1"]`, `["heartbeat_interval", "1800"]`.

**What exists today:** `POST /api/rides/:rideId/check-in` exists (server.js lines 1792-1830). It records check-in data on the ride's `safety.checkIns` array and broadcasts a `safety_check_update` WebSocket message. However, it is entirely passive — the server does NOT:
- Initiate check-in requests on a schedule
- Track missed check-ins
- Alert on two consecutive misses
- Publish kind 30541 events

**What would be needed:**
- Server-side heartbeat scheduler (setInterval at `heartbeat_interval_minutes * 60 * 1000`)
- Check-in deadline tracking (5-minute response window)
- Consecutive miss counter
- Automatic safety alert on 2 consecutive misses (kind 30540)
- WebSocket push of check-in requests to the officer

**VERDICT:** ⚠️ Friction — The check-in recording endpoint exists, but the critical heartbeat SCHEDULING and MISS DETECTION infrastructure does not. The check-in endpoint is reactive only; the security domain requires a proactive server-driven heartbeat system.

---

#### Step 9: Patrol Cycles

**Theoretical HTTP Request:**
```http
POST /api/tasks/task_abc123/patrol/checkpoint HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "lat": 51.5157,
  "lon": -0.1418,
  "checkpoint_name": "North Gate",
  "status": "all_clear",
  "timestamp": "2026-02-12T20:30:00Z"
}
```

**Expected Nostr Event:**
- Kind 30723 (Patrol Checkpoint) with tags: `["location_lat", "51.5157"]`, `["location_lon", "-0.1418"]`, `["checkpoint", "North Gate"]`, `["status", "all_clear"]`.

**What exists today:** No patrol checkpoint endpoint exists. The location update endpoint (`POST /api/rides/:id/location`) could track position but does not log named checkpoints.

**What would be needed:**
- New endpoint: `POST /api/tasks/:id/patrol/checkpoint`
- Checkpoint storage with GPS, name, status, and timestamp
- Kind 30723 event publication
- Patrol route validation (geofencing)

**VERDICT:** ❌ Gap — No patrol checkpoint endpoint exists.

---

#### Step 10: Incident Handling

**Theoretical HTTP Request:**
```http
POST /api/tasks/task_abc123/incident HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "incident_type": "trespass",
  "severity": "medium",
  "description": "Unauthorised person found at rear loading bay. Individual asked to leave, complied without incident.",
  "photos": ["incident_photo_001.jpg"],
  "location": { "lat": 51.5153, "lon": -0.1420 },
  "timestamp": "2026-02-12T22:15:00Z"
}
```

**Expected Nostr Event:**
- Kind 30722 (Incident Report) — append-only incident record.

**What exists today:** No incident report endpoint. The generic proof endpoint could store photos but has no incident metadata structure.

**What would be needed:**
- New endpoint: `POST /api/tasks/:id/incident`
- Incident type classification
- Append-only incident log
- Kind 30722 event publication
- Photo attachment support

**VERDICT:** ❌ Gap — No incident reporting mechanism.

---

#### Step 11: Shift Complete

**Theoretical HTTP Request:**
```http
POST /api/rides/task_abc123/transition HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "targetState": "shift_complete"
}
```

**What exists today:** Generic transition would work with a security domain profile.

**VERDICT:** 🔧 Enhancement — Needs domain profile, then existing transition endpoint would work.

---

#### Step 12: Shift Report

**Theoretical HTTP Request:**
```http
POST /api/tasks/task_abc123/shift/report HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "shift_start_actual": "2026-02-12T17:55:00Z",
  "shift_end_actual": "2026-02-13T06:02:00Z",
  "patrols_completed": 8,
  "incidents": [
    {
      "type": "trespass",
      "time": "2026-02-12T22:15:00Z",
      "resolved": true
    }
  ],
  "handover_notes": "Relief officer briefed. Front gate sensor intermittent — maintenance requested.",
  "total_checkpoints": 24
}
```

**Expected Nostr Event:**
- Kind 30721 (Shift Report) with summary tags.

**What exists today:** No shift report endpoint.

**What would be needed:**
- New endpoint: `POST /api/tasks/:id/shift/report`
- Structured report format (patrols, incidents, handover notes)
- Kind 30721 event publication
- Linkage to completion proof (heartbeat log + patrol checkpoints + shift report)

**VERDICT:** ❌ Gap — No shift report endpoint.

---

#### Step 13: Streaming Payments (Hourly)

**What the spec says:** Security uses TROTT-04 streaming payments (kind 30536) with hourly ticks (3600-second interval). Surcharges for night (+25%), weekend (+15%), close protection (+100%).

**What exists today:** The streaming payment system uses fixed 1-second intervals and divides the fare into 15 steps. The streaming interval is not configurable per domain. No surcharge calculation.

**What would be needed:**
- Configurable streaming interval per domain (3600s for security vs 30s for ridesharing)
- Surcharge calculation based on time-of-day and assignment type
- Multi-guard split payment support (TROTT-04 split + streaming combined)

**VERDICT:** ❌ Gap — Streaming interval is hardcoded at 1 second. Cannot configure hourly ticks. No surcharge logic. No split payment for multi-guard crews.

---

### 4.2 Gap Analysis: Required New API Endpoints

#### Required New API Endpoints

| Method | Path | Nostr Kind | Purpose | Priority |
|--------|------|------------|---------|----------|
| `GET` | `/api/providers/:id/sia-licence` | — | Verify SIA licence against public register | Critical |
| `POST` | `/api/tasks/:id/briefing` | 30724 | Publish NIP-44 encrypted site briefing | Critical |
| `POST` | `/api/tasks/:id/patrol/checkpoint` | 30723 | Log GPS-confirmed patrol waypoint | Critical |
| `POST` | `/api/tasks/:id/incident` | 30722 | File incident report (append-only) | Critical |
| `POST` | `/api/tasks/:id/shift/report` | 30721 | Submit end-of-shift report | Critical |
| `POST` | `/api/safety/heartbeat/start` | 30541 | Initiate server-driven heartbeat schedule | Critical |
| `POST` | `/api/safety/heartbeat/respond` | 30541 | Officer responds to heartbeat check-in | Critical |
| `GET` | `/api/tasks/:id/heartbeat/status` | — | View heartbeat log and miss count | High |
| `GET` | `/api/tasks/:id/patrol/log` | — | View all patrol checkpoints for a shift | High |
| `GET` | `/api/tasks/:id/incidents` | — | List all incidents for a shift | High |
| `POST` | `/api/tasks/:id/geofence/check` | — | Validate officer is within site boundary | Medium |
| `POST` | `/api/tasks/request` (security fields) | 30720 | Accept security-specific request fields | Critical |

#### Required Infrastructure Changes

| Component | Change | Priority |
|-----------|--------|----------|
| Domain profile | Create `src/domain-profiles/security.js` with 7-state machine | Critical |
| Heartbeat scheduler | Server-side `setInterval` for check-in requests | Critical |
| Miss detection | Track consecutive misses; trigger safety alert on 2 misses | Critical |
| SIA verification | HTTP client for SIA public register API | Critical |
| Streaming config | Configurable streaming interval per domain (3600s) | High |
| Surcharge calc | Time-based surcharge logic (night +25%, weekend +15%) | High |
| Geofencing | GPS boundary check against defined site perimeter | Medium |
| Multi-guard | Split payment combined with streaming ticks | Medium |
| NIP-44 encryption | Server-side NIP-44 encrypt/decrypt for site briefings | High |

---

---

## Use Case 5: Emergency Plumber (SPEC-ONLY — Gap Analysis)

**Domain profile:** [`domains/emergency-trades.md`](https://github.com/TheCryptoDonkey/trott/blob/main/domains/emergency-trades.md)
**Coordination pattern:** Dispatch + milestone-based repair phases
**Implementation status:** SPEC ONLY — no `src/domain-profiles/emergency-trades.js` exists
**Event kind range:** 30680-30699

The emergency trades domain introduces milestone-based payments (a fundamentally different payment pattern from the streaming or lump-sum models currently implemented) and mandatory certification verification for regulated trades.

### 5.1 Theoretical Happy Path

---

#### Step 1: Discovery with Urgency Signal + Certification Filter

**Theoretical HTTP Request:**
```http
GET /api/providers/discovery?geohash=gcpvj&trade_type=plumber&emergency_level=critical&certification=none_required HTTP/1.1
Host: localhost:3000
```

For a gas emergency:
```http
GET /api/providers/discovery?geohash=gcpvj&trade_type=gas_engineer&emergency_level=critical&certification=gas_safe HTTP/1.1
Host: localhost:3000
```

**Expected Nostr Event:**
- Kind 20500 (Provider Availability) with tags: `["geohash", "gcpvj"]`, `["trade_type", "plumber"]`, `["certification", "gas_safe"]`, `["certification_id", "1234567"]`.
- Kind 30510 (Provider Profile) with certification and trade type tags.

**What exists today:** `GET /api/drivers/available` returns all online providers. No trade type filtering, no certification verification, no urgency-based prioritisation.

**What would be needed:**
- Trade type filtering on discovery
- Certification verification against external registers (Gas Safe, NICEIC, NAPIT)
- Urgency-based sorting (critical emergencies surface first)
- Mandatory rejection of uncertified gas engineers

**VERDICT:** ❌ Gap — No trade-type filtering, no certification verification, no urgency prioritisation.

---

#### Step 2: Emergency Callout Request

**Theoretical HTTP Request:**
```http
POST /api/tasks/request HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "pickup_lat": 51.4652,
  "pickup_lon": -0.1147,
  "rider_npub": "npub1householder_abc123...",
  "currency": "GBP",
  "domain": "emergency-trades",
  "trade_type": "plumber",
  "emergency_level": "critical",
  "description": "Burst pipe in kitchen — water flooding ground floor",
  "certification": null
}
```

**Expected Nostr Event:**
- Kind 30680 (Emergency Callout Request) with tags: `["trade_type", "plumber"]`, `["emergency_level", "critical"]`, `["location_lat", "51.4652"]`, `["location_lon", "-0.1147"]`.

**What exists today:** `POST /api/rides/request` creates a task but does not accept `trade_type`, `emergency_level`, `description`, or `certification` fields.

**What would be needed:**
- Accept emergency-trades-specific fields
- Validate `trade_type` against allowed values
- Store `emergency_level` for prioritisation
- Publish kind 30680 event
- For gas emergencies: display prominent warning to call National Gas Emergency Service (0800 111 999)

**VERDICT:** ❌ Gap — Cannot pass emergency-specific metadata.

---

#### Step 3: Stake Locking

**Theoretical Calculation (standard plumber callout):**
- Diagnosis fee: GBP 75 (callout)
- Householder stake: 10% = GBP 7.50 (750 pence)
- Tradesperson stake: 15% = GBP 11.25 (1125 pence)

**Theoretical Calculation (gas engineer callout):**
- Diagnosis fee: GBP 95 (callout)
- Householder stake: 10% = GBP 9.50 (950 pence)
- Tradesperson stake: 20% = GBP 19.00 (1900 pence) — gas work override

**What exists today:** The staking API uses 10% requester / 15% provider. No gas work override (20% tradesperson).

**What would be needed:**
- Trade-type-specific stake percentages
- Gas work override: 20% tradesperson stake
- Stakes calculated on diagnosis fee (initial), then recalculated per milestone

**VERDICT:** ❌ Gap — No trade-type-specific staking. No milestone-based stake recalculation.

---

#### Step 4: Acceptance

**Theoretical HTTP Request:**
```http
POST /api/rides/task_abc123/accept HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "driver_npub": "npub1plumber_def456...",
  "driver_name": "Mike's Plumbing",
  "driver_location": { "lat": 51.4700, "lon": -0.1100 },
  "driver_rating": 4.8,
  "driver_pubkey": "def456abc789...",
  "certification_id": null,
  "estimated_arrival_minutes": 25
}
```

**What exists today:** The accept endpoint works generically. No certification validation.

**For gas engineers:** The server MUST refuse to match without a verified Gas Safe registration number. This is a legal requirement.

**VERDICT:** ⚠️ Friction — Accept mechanism works, but no certification gate for regulated trades.

---

#### Step 5: Provider En Route

Works with existing accept flow (chains `startEnRoute()`). No changes needed.

**VERDICT:** ✅ Match — Generic mechanism sufficient.

---

#### Step 6: Diagnosis On-Site

**Theoretical HTTP Request:**
```http
POST /api/rides/task_abc123/transition HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "targetState": "diagnosis",
  "metadata": {
    "arrived_at": "2026-02-11T14:25:00Z"
  }
}
```

**What exists today:** Generic transition endpoint would work IF an emergency-trades profile defined the `diagnosis` state.

**VERDICT:** 🔧 Enhancement — Needs domain profile, then existing transition works.

---

#### Step 7: Diagnosis Report Submission

**Theoretical HTTP Request:**
```http
POST /api/tasks/task_abc123/diagnosis HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "root_cause": "Corroded joint on 15mm copper pipe under kitchen sink",
  "severity": "critical",
  "water_supply_isolated": true,
  "photos": [
    {
      "type": "diagnosis",
      "fileName": "burst_pipe_diagnosis.jpg",
      "description": "Corroded joint visible at connection"
    }
  ],
  "parts_needed": true,
  "parts_list": [
    { "item": "15mm copper compression fitting", "cost_pence": 350 },
    { "item": "15mm copper pipe (300mm)", "cost_pence": 180 }
  ],
  "estimated_repair_time_minutes": 45
}
```

**Expected Nostr Event:**
- Kind 30681 (Diagnosis Report) with tags: `["root_cause", "corroded_joint"]`, `["severity", "critical"]`, `["parts_needed", "true"]`, `["parts_cost", "530"]`.

**What exists today:** No diagnosis report endpoint. The generic proof endpoint could store photos but not structured diagnosis data.

**What would be needed:**
- New endpoint: `POST /api/tasks/:id/diagnosis`
- Structured diagnosis format (root cause, severity, parts assessment)
- Kind 30681 event publication
- Photo attachment linked to diagnosis

**VERDICT:** ❌ Gap — No diagnosis report endpoint.

---

#### Step 8: Repair Quote (Milestone-Based)

**Theoretical HTTP Request:**
```http
POST /api/tasks/task_abc123/quote HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "milestones": [
    {
      "id": "milestone_diagnosis",
      "name": "Callout & Diagnosis",
      "amount_pence": 7500,
      "currency": "GBP",
      "status": "completed",
      "description": "Emergency callout and on-site diagnosis"
    },
    {
      "id": "milestone_emergency_fix",
      "name": "Emergency Pipe Repair",
      "amount_pence": 18500,
      "currency": "GBP",
      "status": "quoted",
      "description": "Replace corroded joint, restore water supply",
      "parts_cost_pence": 530,
      "labour_cost_pence": 17970
    },
    {
      "id": "milestone_full_repair",
      "name": "Full Pipework Replacement (Optional)",
      "amount_pence": 45000,
      "currency": "GBP",
      "status": "quoted",
      "description": "Replace 2m section of aged copper pipework",
      "optional": true
    }
  ],
  "total_pence": 71000,
  "providerPubkey": "def456abc789..."
}
```

**Expected Nostr Event:**
- Kind 30682 (Repair Quote) with milestone breakdown tags.

**What exists today:** `POST /api/rides/:rideId/quote` accepts a single `amount_sats` and `description`. No milestone support. No multiple quote items. No currency-agnostic amount handling (uses `amount_sats`).

**What would be needed:**
- Extended quote endpoint with milestone array support
- Per-milestone amounts in smallest currency unit
- Milestone status tracking (quoted, accepted, in_progress, completed)
- Kind 30682 event publication
- Differentiation between optional and required milestones

**VERDICT:** ❌ Gap — Existing quote endpoint is single-amount only. No milestone-based quoting infrastructure.

---

#### Step 9: Quote Acceptance

**Theoretical HTTP Request:**
```http
POST /api/tasks/task_abc123/quote/accept HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "accepted_milestones": ["milestone_diagnosis", "milestone_emergency_fix"],
  "declined_milestones": ["milestone_full_repair"],
  "notes": "Will schedule full repair separately next week"
}
```

**Expected Nostr Event:**
- Kind 30683 (Quote Acceptance) with tags: `["accepted", "milestone_diagnosis"]`, `["accepted", "milestone_emergency_fix"]`, `["declined", "milestone_full_repair"]`.

**What exists today:** `POST /api/rides/:rideId/quote/accept` accepts the entire quote with no partial acceptance. No milestone-level granularity.

**What would be needed:**
- Selective milestone acceptance/decline
- Per-milestone stake recalculation (12% of milestone amount; 20% for gas work)
- Kind 30683 event publication
- Transition to `quote_accepted` state

**VERDICT:** ❌ Gap — No partial quote acceptance. No milestone-level granularity.

---

#### Step 10: Work Active

**Theoretical HTTP Request:**
```http
POST /api/rides/task_abc123/transition HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "targetState": "work_active",
  "metadata": {
    "active_milestone": "milestone_emergency_fix"
  }
}
```

**What exists today:** Generic transition would work with an emergency-trades profile.

**VERDICT:** 🔧 Enhancement — Needs domain profile.

---

#### Step 11: Milestone Completion with Before/After Photos

**Theoretical HTTP Request:**
```http
POST /api/tasks/task_abc123/milestone/complete HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "milestone_id": "milestone_emergency_fix",
  "description": "Corroded joint replaced with compression fitting. Water supply restored. Tested for 15 minutes — no leaks.",
  "photos": {
    "before": {
      "fileName": "before_repair.jpg",
      "hash": "sha256:abc123..."
    },
    "after": {
      "fileName": "after_repair.jpg",
      "hash": "sha256:def456..."
    }
  },
  "materials_used": [
    "15mm copper compression fitting",
    "15mm copper pipe (300mm)"
  ],
  "time_taken_minutes": 40
}
```

**Expected Nostr Event:**
- Kind 30684 (Milestone Completion) with tags: `["milestone", "milestone_emergency_fix"]`, `["photos_before", "<hash>"]`, `["photos_after", "<hash>"]`.
- Kind 30533 (Stake Release with `release_reason: milestone`) for the completed milestone amount.

**What exists today:** No milestone completion endpoint. The proof endpoint stores individual photos but not structured milestone data. The stake release mechanism exists (`stakeManager.releaseStakes()`) but is designed for whole-task release, not per-milestone partial release.

**What would be needed:**
- New endpoint: `POST /api/tasks/:id/milestone/complete`
- Before/after photo pairs linked to milestones
- Partial stake release per milestone (TROTT-04 kind 30533 with `release_reason: milestone`)
- Milestone status tracking (quoted -> accepted -> in_progress -> completed)
- Kind 30684 event publication

**VERDICT:** ❌ Gap — No milestone completion mechanism. No partial stake release.

---

#### Step 12: Work Complete

**Theoretical HTTP Request:**
```http
POST /api/rides/task_abc123/transition HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "targetState": "work_complete"
}
```

**What exists today:** Generic transition would work with a profile.

**VERDICT:** 🔧 Enhancement — Needs domain profile.

---

#### Step 13: Optional Linked Full Repair Task

**Theoretical HTTP Request:**
```http
POST /api/tasks/request HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "pickup_lat": 51.4652,
  "pickup_lon": -0.1147,
  "rider_npub": "npub1householder_abc123...",
  "currency": "GBP",
  "domain": "emergency-trades",
  "trade_type": "plumber",
  "emergency_level": "minor",
  "linked_task": "task_abc123",
  "description": "Full pipework replacement — follow-up from emergency repair"
}
```

**What exists today:** No linked task support. Each task is independent.

**What would be needed:**
- `linked_task` field accepted in task creation
- Reference to the original emergency callout
- Preferred provider matching (same tradesperson as original callout)
- Kind 30680 event with `linked_task` tag

**VERDICT:** ❌ Gap — No linked task mechanism.

---

#### Step 14: Rating

**Theoretical HTTP Request:**
```http
POST /api/rides/task_abc123/rate HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "event": {
    "kind": 30520,
    "content": "Excellent response time, explained everything clearly, fair price.",
    "tags": [
      ["p", "<plumber_pubkey>"],
      ["rating", "4.8"],
      ["criteria", "overall", "5"],
      ["criteria", "response_time", "5"],
      ["criteria", "diagnosis_accuracy", "5"],
      ["criteria", "workmanship", "5"],
      ["criteria", "pricing_transparency", "4"],
      ["criteria", "tidiness", "4"]
    ]
  }
}
```

**What exists today:** Path A (full Nostr event) supports arbitrary criteria tags, so emergency-trades-specific criteria (diagnosis_accuracy, workmanship, pricing_transparency, tidiness) can be submitted. Path B (simple rating) loses all granularity.

**VERDICT:** ✅ Match — Path A supports the criteria. Path B is insufficient for the 6-criteria emergency trades rating model.

---

### 5.2 Domain-Specific Scenarios

---

#### Scenario 5A: Gas Emergency Special Handling

**What the spec says:**
- Gas Safe Register verification is MANDATORY — criminal offence to work without
- Implementation must display prominent warning to call National Gas Emergency Service (0800 111 999)
- Tradesperson stake increased to 20% for gas work
- Completion proof requires Gas Safe notification confirmation and gas tightness test

**What exists today:** No certification verification, no gas safety warnings, no stake override, no gas-specific completion proof.

**What would be needed:**
- Gas Safe Register API integration (or manual verification workflow)
- Hard block on matching `trade_type=gas_engineer` without verified `certification_id`
- Client-facing gas safety warning message
- Increased tradesperson stake (20%)
- Gas-specific completion proof fields (Gas Safe notification, tightness test)

**VERDICT:** ❌ Gap — No gas safety infrastructure. This is the highest-priority gap due to legal implications.

---

#### Scenario 5B: Two-Phase Repair

**What the spec says:** Emergency fix + scheduled full repair as a linked task. The `full_repair` state is optional — many emergencies resolve at the emergency fix stage.

**What exists today:** No linked task support. No mechanism to transition from `work_complete` to `full_repair`.

**VERDICT:** ❌ Gap — No linked task or two-phase repair support.

---

#### Scenario 5C: Diagnosis Fee Retained on Cancellation

**What the spec says:** If the householder declines the repair quote after diagnosis, the diagnosis fee is retained by the tradesperson with no further penalty.

**What exists today:** The cancellation flow (`POST /rides/:rideId/cancel`) applies a flat 80% penalty. No milestone-aware cancellation logic.

**What would be needed:**
- Milestone-aware cancellation: diagnosis fee retained, remaining stakes released
- Partial forfeit: householder loses diagnosis stake, tradesperson retains diagnosis payment
- No further penalty to householder for declining the repair quote

**VERDICT:** ❌ Gap — Cancellation is not milestone-aware.

---

#### Scenario 5D: Out-of-Hours Pricing

**What the spec says:** Not explicitly defined in the emergency-trades spec, but implied by the `emergency_level` tag and the general pricing model allowing surcharges.

**What exists today:** No time-based pricing. The `estimateTripCost()` function does not consider time-of-day.

**VERDICT:** ❌ Gap — No out-of-hours surcharge mechanism.

---

### 5.3 Gap Analysis: Required New API Endpoints

#### Required New API Endpoints

| Method | Path | Nostr Kind | Purpose | Priority |
|--------|------|------------|---------|----------|
| `POST` | `/api/tasks/:id/diagnosis` | 30681 | Submit structured diagnosis report | Critical |
| `POST` | `/api/tasks/:id/quote` (extended) | 30682 | Submit milestone-based repair quote | Critical |
| `POST` | `/api/tasks/:id/quote/accept` (extended) | 30683 | Accept/decline individual milestones | Critical |
| `POST` | `/api/tasks/:id/milestone/complete` | 30684 | Complete milestone with before/after photos | Critical |
| `POST` | `/api/tasks/:id/milestone/release` | 30533 | Release stake for completed milestone | Critical |
| `GET` | `/api/providers/:id/certification` | — | Verify Gas Safe / NICEIC / NAPIT / Part P | Critical |
| `POST` | `/api/tasks/:id/guarantee` | 30685 | Start guarantee period on completed work | Medium |
| `POST` | `/api/tasks/:id/link` | — | Link follow-up task to original callout | High |
| `GET` | `/api/tasks/:id/milestones` | — | View all milestones and their status | High |
| `POST` | `/api/tasks/request` (emergency fields) | 30680 | Accept emergency-specific request fields | Critical |

#### Required Infrastructure Changes

| Component | Change | Priority |
|-----------|--------|----------|
| Domain profile | Create `src/domain-profiles/emergency-trades.js` with 8-state machine | Critical |
| Milestone payments | Partial stake release per milestone (kind 30533) | Critical |
| Certification API | HTTP client for Gas Safe Register, NICEIC, NAPIT | Critical |
| Milestone tracking | Per-milestone status (quoted, accepted, in_progress, completed) | Critical |
| Quote extension | Milestone array in quote request/response | Critical |
| Selective acceptance | Accept/decline individual milestones | Critical |
| Linked tasks | `linked_task` reference in task creation | High |
| Cancellation logic | Milestone-aware cancellation (diagnosis fee retained) | High |
| Stake override | Trade-type-specific stake percentages (gas: 20%) | High |
| Gas safety | Mandatory Gas Safe check + gas safety warning | Critical |

---

---

## Use Cases 3–5: Cross-Domain Findings

### Implementation Completeness Matrix

| Feature | Delivery (3) | Security (4) | Emergency Trades (5) |
|---------|:------------:|:------------:|:-------------------:|
| Domain profile exists | ✅ | ❌ | ❌ |
| State machine defined | ✅ | ❌ (spec only) | ❌ (spec only) |
| Task creation | ⚠️ (no domain tags) | ❌ | ❌ |
| State transitions | ✅ | 🔧 (needs profile) | 🔧 (needs profile) |
| Discovery filtering | ❌ | ❌ | ❌ |
| Proof submission | ⚠️ (generic) | ❌ | ❌ |
| Domain-specific endpoints | ❌ | ❌ | ❌ |
| Nostr event publication | ❌ (none of 30620-30625) | ❌ | ❌ |
| Streaming payments | ⚠️ (wrong interval) | ❌ (needs hourly) | N/A (milestone) |
| Milestone payments | N/A | N/A | ❌ |
| Certification verification | N/A | ❌ (SIA) | ❌ (Gas Safe) |
| Heartbeat check-ins | N/A | ❌ | N/A |
| Rating criteria | ⚠️ (Path A only) | ❌ | ⚠️ (Path A only) |

### Priority Ranking of Gaps

1. **Critical: Milestone payment infrastructure** (Emergency Trades) — fundamentally different payment pattern from streaming/lump-sum; requires new stake release logic.
2. **Critical: Heartbeat check-in scheduler** (Security) — safety-critical; missed check-ins may indicate officer injury.
3. **Critical: Certification verification** (Security: SIA; Emergency Trades: Gas Safe) — legal requirements; criminal offences if not verified.
4. **Critical: Domain profile creation** — both Security and Emergency Trades need `src/domain-profiles/` implementations before any state machine functionality works.
5. **High: Domain-specific event kind publication** — even Delivery (which has a full profile) publishes zero domain-specific Nostr events.
6. **High: Domain-specific tag acceptance** — all three domains need the request body to accept domain-specific fields.
7. **High: Configurable streaming interval** — Security needs 3600s; Delivery needs per-100m; current implementation is hardcoded at 1s.
8. **Medium: Proof enforcement** — completion should validate required proofs are present before allowing state transition.
9. **Medium: Third-party participant support** — Delivery's `recipient_pubkey` and Security's multi-guard crews.
10. **Low: Linked task support** — Emergency Trades' two-phase repair pattern.

### Event Kind Numbering Discrepancy

The delivery implementation profile (`delivery.js`) defines event kinds 30620-30625, while the delivery domain spec (`delivery.md`) uses 30640-30659. The locksmith range in the specs is 30620-30639, creating a direct collision with the delivery profile's kind numbers. This must be resolved — the implementation should align with the spec's kind range assignments.

| Source | Proof of Collection | Proof of Delivery | Condition Report |
|--------|:------------------:|:-----------------:|:----------------:|
| `delivery.js` (implementation) | 30620 | 30621 | 30622 |
| `delivery.md` (spec) | 30640 | 30641 | 30642 |
| `locksmith.md` (spec) | 30620-30639 (range) | — | — |

**VERDICT:** ❌ Gap — Kind number conflict between delivery implementation and locksmith spec range. The `delivery.js` event kinds need updating to 30640-30645 to match the domain spec.

---

## Cross-Cutting Analysis

This section maps every spec-defined event kind, WebSocket message, and state machine to the actual DonkeyRide implementation, identifying matches, mismatches, gaps, and enhancements.

---

### 6.1 API Coverage Matrix

The TROTT Protocol defines **51 core event kinds** across 8 specifications, plus domain-specific kinds in the 30600-30779 range. The following matrix maps each to its corresponding API endpoint in `server.js`.

#### TROTT-01: Core -- Task Lifecycle (kinds 30500-30509)

| Event Kind | Name | Spec | API Endpoint | Implemented? |
|------------|------|------|-------------|--------------|
| 30500 | Task Request | TROTT-01 | `POST /api/rides/request` | ✅ Full |
| 30501 | Task Offer | TROTT-01 | -- | ❌ Gap |
| 30502 | Task Accept | TROTT-01 | `POST /api/rides/:rideId/accept` | ✅ Full |
| 30503 | Task Update | TROTT-01 | `POST /api/rides/:rideId/transition` | ✅ Full |
| 30504 | Task Complete | TROTT-01 | `POST /api/rides/:rideId/complete` | ✅ Full |
| 30505 | Task Confirm | TROTT-01 | -- | ❌ Gap |
| 30506 | Task Cancel | TROTT-01 | `POST /rides/:rideId/cancel` | ✅ Full |
| 30507 | Task Dispute | TROTT-01 | `POST /api/rides/:rideId/dispute` | ✅ Full |
| 30508 | Leg Plan | TROTT-01 | -- | ❌ Gap |
| 30509 | Recurring Series | TROTT-01 | -- | ❌ Gap |

#### TROTT-02: Discovery (kinds 20500, 30510-30513)

| Event Kind | Name | Spec | API Endpoint | Implemented? |
|------------|------|------|-------------|--------------|
| 20500 | Provider Availability | TROTT-02 | `GET /api/drivers/available` | ⚠️ Partial -- Redis location lookup; no geohash broadcast to Nostr relays |
| 30510 | Provider Profile | TROTT-02 | -- | ❌ Gap |
| 30511 | Operator Bond | TROTT-02 | `POST /api/operator/bond` | ✅ Full |
| 30512 | Trusted Provider List | TROTT-02 | -- | ❌ Gap |
| 30513 | Requester Profile | TROTT-02 | -- | ❌ Gap |

#### TROTT-03: Reputation (kinds 30520-30522)

| Event Kind | Name | Spec | API Endpoint | Implemented? |
|------------|------|------|-------------|--------------|
| 30520 | Task Rating | TROTT-03 | `POST /api/rides/:rideId/rate` | ✅ Full |
| 30521 | Reputation Query | TROTT-03 | `GET /api/reputation/:npub` | ✅ Full |
| 30522 | Credential Attestation | TROTT-03 | -- | ❌ Gap |

#### TROTT-04: Payments (kinds 30530-30538)

| Event Kind | Name | Spec | API Endpoint | Implemented? |
|------------|------|------|-------------|--------------|
| 30530 | Quote | TROTT-04 | `POST /api/rides/:rideId/quote` | ✅ Full |
| 30531 | Payment Terms | TROTT-04 | -- | ❌ Gap |
| 30532 | Stake Lock | TROTT-04 | `POST /rides/:rideId/rider-stake`, `POST /rides/:rideId/driver-stake` | ⚠️ Partial -- legacy endpoints, split across two routes |
| 30533 | Stake Release | TROTT-04 | Automatic on completion via `stakeEvents.publishStakeRelease` | ⚠️ Partial -- internal, no dedicated API endpoint |
| 30534 | Stake Forfeit | TROTT-04 | Automatic on cancellation/no-show | ⚠️ Partial -- internal, no dedicated API endpoint |
| 30535 | Payment Receipt | TROTT-04 | -- | ❌ Gap |
| 30536 | Streaming Tick | TROTT-04 | Automatic via `startStreamingForRide()` | ⚠️ Partial -- internal timer, not externally triggerable |
| 30537 | Task Tip | TROTT-04 | `POST /api/rides/:rideId/tip` | ✅ Full |
| 30538 | Earnings Summary | TROTT-04 | -- | ❌ Gap |

#### TROTT-05: Safety & Disputes (kinds 30540-30547)

| Event Kind | Name | Spec | API Endpoint | Implemented? |
|------------|------|------|-------------|--------------|
| 30540 | Emergency Signal | TROTT-05 | `POST /api/rides/:rideId/panic` | ✅ Full |
| 30541 | Safety Check-in | TROTT-05 | `POST /api/rides/:rideId/check-in` | ✅ Full |
| 30542 | Safety Contact Share | TROTT-05 | -- | ❌ Gap |
| 30543 | Dispute Claim | TROTT-05 | `POST /api/rides/:rideId/dispute` | ✅ Full (uses kind 30522 internally, not 30543) |
| 30544 | Dispute Evidence | TROTT-05 | `POST /api/rides/:rideId/dispute/:disputeId/evidence` | ✅ Full |
| 30545 | Dispute Resolution | TROTT-05 | `POST /api/disputes/:disputeId/resolve` | ✅ Full |
| 30546 | Abuse Report | TROTT-05 | `POST /api/abuse/report` | ✅ Full |
| 30547 | Media Attachment | TROTT-05 | `POST /api/rides/:rideId/proof` | ⚠️ Partial -- accepts photos/signatures but uses custom format, not kind 30547 event structure |

#### TROTT-06: Coordination (kinds 30550-30555) -- Optional

| Event Kind | Name | Spec | API Endpoint | Implemented? |
|------------|------|------|-------------|--------------|
| 30550 | Operator Claim | TROTT-06 | -- | ❌ Gap |
| 30551 | PII Envelope | TROTT-06 | -- | ❌ Gap |
| 30552 | Delegation Grant | TROTT-06 | -- | ❌ Gap |
| 30553 | Compliance Record | TROTT-06 | -- | ❌ Gap |
| 30554 | Operator Heartbeat | TROTT-06 | -- | ❌ Gap |
| 30555 | Compliance Snapshot | TROTT-06 | -- | ❌ Gap |

#### TROTT-07: Navigation (kinds 20501, 30560-30563) -- Optional

| Event Kind | Name | Spec | API Endpoint | Implemented? |
|------------|------|------|-------------|--------------|
| 20501 | Location Update | TROTT-07 | `POST /api/rides/:rideId/location` | ✅ Full |
| 30560 | Route Summary | TROTT-07 | `POST /api/routes/preview` | ⚠️ Partial -- preview only, not attached to a task |
| 30561 | ETA Update | TROTT-07 | Computed within location endpoint | ⚠️ Partial -- piggybacks on location, not a separate event |
| 30562 | Route Deviation | TROTT-07 | -- | ❌ Gap |
| 30563 | Navigation Resource | TROTT-07 | -- | ❌ Gap |

#### TROTT-08: Messaging & Personal Data (kinds 20502, 30564-30567) -- Optional

| Event Kind | Name | Spec | API Endpoint | Implemented? |
|------------|------|------|-------------|--------------|
| 20502 | Typing Indicator | TROTT-08 | -- | ❌ Gap |
| 30564 | Task Message | TROTT-08 | -- | ❌ Gap |
| 30565 | Message Status | TROTT-08 | -- | ❌ Gap |
| 30566 | Task Archive Entry | TROTT-08 | -- | ❌ Gap |
| 30567 | User Preferences | TROTT-08 | -- | ❌ Gap |

#### Domain-Specific Kinds (30600-30779)

**Ridesharing (30600-30619):**

| Event Kind | Name | API Endpoint | Implemented? |
|------------|------|-------------|--------------|
| 30600 | Wait Time Charge | -- | ❌ Gap |
| 30601 | No-Show Fee | -- (handled as state transition) | ⚠️ Implicit |
| 30602 | Additional Charge | -- | ❌ Gap |
| 30603 | Destination Change | -- | ❌ Gap |
| 30604 | Surge Pricing Zone | -- | ❌ Gap |
| 30605 | Scheduled Ride Request | -- | ❌ Gap |
| 30606 | Carpool Request | -- | ❌ Gap |
| 30607 | Carpool Seat Offer | -- | ❌ Gap |
| 30608 | Split Payment Request | -- | ❌ Gap |
| 30609 | Ride Preferences | -- | ❌ Gap |

**Locksmith (30620-30639):**

| Event Kind | Name | API Endpoint | Implemented? |
|------------|------|-------------|--------------|
| 30620 | Quote Negotiation | `POST /api/rides/:rideId/quote` | ✅ (mapped to generic quote endpoint) |
| 30621 | Quote Acceptance | `POST /api/rides/:rideId/quote/accept` | ✅ |
| 30622 | Access Method Confirmation | `POST /api/rides/:rideId/transition` (targetState = access_method_confirmed) | ✅ (via generic transition) |
| 30623 | Guarantee Period Start | -- | ❌ Gap |

**Delivery (30640-30659):**

| Event Kind | Name | API Endpoint | Implemented? |
|------------|------|-------------|--------------|
| 30640 | Proof of Collection | `POST /api/rides/:rideId/proof` | ⚠️ Partial (generic proof endpoint, no collection-specific format) |
| 30641 | Proof of Delivery | `POST /api/rides/:rideId/proof` | ⚠️ Partial (same generic endpoint) |
| 30642 | Condition Report | -- | ❌ Gap |
| 30643 | Delivery Attempt Failed | `POST /api/rides/:rideId/transition` (targetState = delivery_failed) | ⚠️ Via generic transition |
| 30644 | Re-delivery Scheduled | -- | ❌ Gap |
| 30645 | Return to Sender | `POST /api/rides/:rideId/transition` (targetState = returned_to_sender) | ⚠️ Via generic transition |

**Security (30720-30739) -- Spec Only:**

| Event Kind | Name | API Endpoint | Implemented? |
|------------|------|-------------|--------------|
| 30720 | Security Assignment Request | -- | ❌ No implementation |
| 30721 | Shift Report | -- | ❌ No implementation |
| 30722 | Incident Report | -- | ❌ No implementation |
| 30723 | Patrol Checkpoint | -- | ❌ No implementation |
| 30724 | Site Briefing | -- | ❌ No implementation |

**Emergency Trades (30680-30699) -- Spec Only:**

| Event Kind | Name | API Endpoint | Implemented? |
|------------|------|-------------|--------------|
| 30680 | Emergency Callout Request | -- | ❌ No implementation |
| 30681 | Diagnosis Report | -- | ❌ No implementation |
| 30682 | Repair Quote | -- | ❌ No implementation |
| 30683 | Quote Acceptance | -- | ❌ No implementation |
| 30684 | Milestone Completion | -- | ❌ No implementation |
| 30685 | Guarantee Start | -- | ❌ No implementation |

**Remaining Domains (30660-30679 Towing, 30700-30719 Pet Services, 30740-30759 Cleaning, 30760-30779 Moving):**

All 40 reserved kinds across these 4 spec-only domains have no API implementation. These domains exist as specification documents only.

#### Summary

**Core event kinds (51 defined):**

| Category | ✅ Implemented | ⚠️ Partial | ❌ Not Implemented |
|----------|---------------|------------|-------------------|
| TROTT-01 (10 kinds) | 5 | 0 | 5 |
| TROTT-02 (5 kinds) | 1 | 1 | 3 |
| TROTT-03 (3 kinds) | 2 | 0 | 1 |
| TROTT-04 (9 kinds) | 2 | 4 | 3 |
| TROTT-05 (8 kinds) | 5 | 1 | 2 |
| TROTT-06 (6 kinds) | 0 | 0 | 6 |
| TROTT-07 (5 kinds) | 1 | 2 | 2 |
| TROTT-08 (5 kinds) | 0 | 0 | 5 |
| **Total (51 kinds)** | **16** | **8** | **27** |

**Summary**: 16 of 51 core event kinds have full API coverage (31%). A further 8 (16%) have partial coverage. 27 kinds (53%) have no API implementation.

**Domain-specific kinds**: Of the 30 defined domain-specific kinds across 5 tested domains (ridesharing 10, locksmith 4, delivery 6, security 5, emergency trades 6), only 3 have full coverage, 5 have partial coverage, and 22 have no implementation.

---

### 6.2 WebSocket Coverage Matrix

The server broadcasts real-time updates via WebSocket on port 3001. The following matrix maps spec-defined real-time events to actual WebSocket message types.

#### Spec Events Mapped to WebSocket Messages

| Spec Event | Kind | WebSocket Type | Format Match | Notes |
|-----------|------|---------------|-------------|-------|
| Location Update | 20501 | `driver_location` + `location_update` | ⚠️ Dual format | Legacy format uses `location: {lat, lon}`; React format uses `data: {lat, lng}` (note: `lng` not `lon`) |
| Streaming Tick | 30536 | `stream_payment` | ⚠️ Field names | API uses `amount_sats`, `total_paid_sats`, `fare_sats`, `remaining_sats`; spec uses `amount` + `currency` tag |
| Task Request | 30500 | `ride_request` | ⚠️ Name mismatch | Broadcast to drivers on task creation; type name is ridesharing-specific |
| Task Accept | 30502 | `ride_matched` + `task_matched` | ⚠️ Dual format | Both sent simultaneously; `ride_matched` is legacy, `task_matched` is domain-agnostic |
| Task Update (arrival) | 30503 | `driver_arrived` | ⚠️ Name mismatch | Ridesharing-specific name |
| Task Update (start) | 30503 | `trip_started` | ⚠️ Name mismatch | Ridesharing-specific name |
| Task Update (generic) | 30503 | `status_change` | ✅ Match | Generic transition endpoint broadcasts domain-agnostic status change |
| Task Complete | 30504 | `trip_completed` + `ride_completed` | ⚠️ Dual endpoints | Legacy `/rides/:rideId/complete` sends `ride_completed`; modern `/api/rides/:rideId/complete` sends `trip_completed` |
| Task Cancel | 30506 | `ride_cancelled` | ⚠️ Name mismatch | Broadcast to both ride subscribers and all drivers |
| Emergency Signal | 30540 | `panic_alert` | ✅ Match | Includes relay statuses and content |
| Safety Check-in | 30541 | `safety_check_update` | ✅ Match | Includes status, source, note, by, timestamp |
| Task Rating | 30520 | `rating_submitted` | ✅ Match | Includes role, rating value, target pubkey |
| Dispute Claim | 30543 | `dispute_filed` | ✅ Match | Includes dispute_id, dispute_type, complainant_pubkey |
| Dispute Evidence | 30544 | `dispute_evidence` | ✅ Match | Includes dispute_id, from_pubkey |
| Dispute Resolution | 30545 | `dispute_resolved` | ✅ Match | Includes outcome, stake effects |
| Quote | 30530 | `quote_submitted` | ✅ Match | Includes full quote object |
| Quote Acceptance | -- | `quote_accepted` | ✅ Match | Broadcasts updated quote status |
| Quote Decline | -- | `quote_declined` | ✅ Match | Broadcasts decline reason |
| Task Tip | 30537 | `tip_sent` | ⚠️ Field names | Uses `amount_sats` rather than `amount` + `currency` |

#### WebSocket Messages With No Spec Equivalent

These exist in the implementation but are not defined in any TROTT specification:

| WebSocket Type | Direction | Purpose | Category |
|---------------|-----------|---------|----------|
| `subscribe_ride` | Client → Server | Client subscribes to a specific ride's updates | 🔧 Enhancement (transport-layer) |
| `register_driver` | Client → Server | Driver registers for ride request broadcasts | 🔧 Enhancement (transport-layer) |
| `get_status` | Client → Server | Client requests server status summary | 🔧 Enhancement (operational) |
| `status` | Server → Client | Response to `get_status` with ride counts and stats | 🔧 Enhancement (operational) |
| `rider_stake_locked` | Server → Client | Rider's stake payment confirmed | 🔧 Enhancement (payment flow) |
| `driver_stake_locked` | Server → Client | Driver's stake payment confirmed | 🔧 Enhancement (payment flow) |
| `arbiter_assigned` | Server → Client | Arbiter assigned to dispute | 🔧 Enhancement (dispute flow) |
| `dispute_appealed` | Server → Client | Dispute has been appealed | 🔧 Enhancement (dispute flow) |
| `account_suspended` | Server → All | Account suspension broadcast | 🔧 Enhancement (moderation) |

#### Summary

Of 19 spec-mappable real-time events, 10 have a full match in WebSocket format, 9 have partial matches (naming or field format mismatches). The implementation adds 9 additional WebSocket message types not defined in the specs, primarily for transport-layer subscription management and payment confirmation flows.

---

### 6.3 State Machine Comparison

Side-by-side comparison of the spec-defined state machine versus the implementation state machine for each of the 5 domains tested.

##### Ridesharing

| Aspect | Spec (TROTT-ridesharing) | Implementation (`ridesharing.js`) | Verdict |
|--------|------------------------|-----------------------------------|---------|
| Initial state | `requested` (implicit from Task Request event) | `requested` | ✅ Match |
| Matching state | `accepted` → sub-states | `matched` | ⚠️ Spec says `accepted`, implementation says `matched` |
| Sub-state 1 | `provider_en_route` | `en_route` | ⚠️ Name mismatch (`provider_en_route` vs `en_route`) |
| Sub-state 2 | `provider_arrived` | `arrived` | ⚠️ Name mismatch (`provider_arrived` vs `arrived`) |
| Sub-state 3 | `trip_active` | `active` | ⚠️ Name mismatch (`trip_active` vs `active`) |
| Completion state | `completed` → `confirmed` | `completed` (terminal) | ⚠️ Spec has two-step completion (completed + confirmed); impl has one step |
| Terminal states | `confirmed`, `no_show`, `cancelled` | `completed`, `no_show`, `cancelled` | ⚠️ `confirmed` vs `completed` |
| `offers_open` state | Defined in core spec between `requested` and `accepted` | Not present | ❌ Gap -- spec allows competitive offers before acceptance |
| `disputed` state | Intermediate (resolves to confirmed/cancelled/no_show) | Not a state -- disputes tracked separately | ⚠️ Structural difference |
| Transition: `arrived` → `no_show` | ✅ (rider absent) | ✅ | ✅ Match |
| Transition: `active` → `cancelled` | ✅ | ✅ | ✅ Match |

**Key findings**: The implementation omits the `offers_open` competitive offer phase and the `confirmed` (requester confirmation) step. State names are abbreviated (e.g. `en_route` instead of `provider_en_route`). The implementation's `matched` state conflates the spec's `accepted` state.

##### Locksmith

| Aspect | Spec (TROTT-locksmith) | Implementation (`locksmith.js`) | Verdict |
|--------|----------------------|--------------------------------|---------|
| Initial state | `requested` (implicit) | `lockout_reported` | ⚠️ Domain-specific naming in impl |
| Matching state | `accepted` | `locksmith_matched` | ⚠️ Domain-specific naming |
| Sub-state 1 | `provider_en_route` | `en_route` | ⚠️ Abbreviated |
| Sub-state 2 | `provider_arrived` | `arrived` | ⚠️ Abbreviated |
| Sub-state 3 | `access_method_confirmed` | `access_method_confirmed` | ✅ Match |
| Sub-state 4 | `work_active` | `work_active` | ✅ Match |
| Completion state | `completed` → `confirmed` | `access_gained` (terminal) | ⚠️ Domain-specific terminal name; no confirmed step |
| Terminal states | `confirmed`, `no_show`, `cancelled` | `access_gained`, `no_show`, `cancelled` | ⚠️ Different completion terminal |
| Quote negotiation phase | After `provider_arrived`, locksmith issues quote (kind 30530); customer accepts before `access_method_confirmed` | Quote endpoint exists (`POST /api/rides/:rideId/quote`); transition to `access_method_confirmed` | ✅ Functional match |
| Transition: `arrived` → `cancelled` (decline quote) | No penalty to customer per spec | `arrived` → `cancelled` is a valid transition | ⚠️ Penalty logic not implemented |
| `offers_open` state | Defined in core spec | Not present | ❌ Gap |

**Key findings**: The implementation uses domain-flavoured state names (`lockout_reported`, `locksmith_matched`, `access_gained`) which is a reasonable design choice but creates a naming divergence from the spec. The core `access_method_confirmed` and `work_active` states match exactly. Quote negotiation is functionally present but cancellation penalty logic (the spec says "no penalty to customer" when declining a quote) is not enforced.

##### Delivery

| Aspect | Spec (TROTT-delivery) | Implementation (`delivery.js`) | Verdict |
|--------|---------------------|-------------------------------|---------|
| Initial state | `requested` (implicit) | `collection_requested` | ⚠️ Domain-specific naming |
| Matching state | `accepted` | `courier_matched` | ⚠️ Domain-specific naming |
| Sub-state 1 | `en_route_to_pickup` | `en_route_to_pickup` | ✅ Match |
| Sub-state 2 | `collected` | `collected` | ✅ Match |
| Sub-state 3 | `in_transit` | `in_transit` | ✅ Match |
| Sub-state 4 (spec) | `delivered` (handover pending) | `arrived_at_delivery` | ⚠️ Spec uses `delivered`; impl uses `arrived_at_delivery` |
| Completion state | `completed` → `confirmed` | `delivered` (terminal) | ⚠️ Impl maps spec's `delivered` to its `arrived_at_delivery`, then uses `delivered` as terminal completion |
| Terminal states | `confirmed`, `no_show`, `delivery_failed`, `returned_to_sender` | `delivered`, `delivery_failed`, `returned_to_sender`, `no_show`, `cancelled` | ⚠️ Impl adds `cancelled` as terminal; uses `delivered` instead of `confirmed` |
| `delivery_failed` → `returned_to_sender` | ✅ | ✅ | ✅ Match |
| `arrived_at_delivery` → `delivery_failed` | ✅ (implied) | ✅ Explicit transition | ✅ Match |
| Recipient identity | `recipient_pubkey` tag | Not accepted in API request body | ❌ Gap |
| Proof of collection | Required (kind 30640) | Generic `POST /api/rides/:rideId/proof` | ⚠️ Not collection-specific |
| `offers_open` state | Defined in core spec | Not present | ❌ Gap |

**Key findings**: The delivery domain has the closest alignment between spec and implementation. Core transit states (`en_route_to_pickup`, `collected`, `in_transit`) match exactly. The implementation adds a useful `arrived_at_delivery` sub-state. The main gaps are the missing `recipient_pubkey` field and the absence of collection-specific vs delivery-specific proof endpoints.

##### Security (Spec Only)

| Aspect | Spec (TROTT-security) | Implementation | Verdict |
|--------|---------------------|----------------|---------|
| State machine | `accepted` → `provider_en_route` → `briefed` → `on_station` → `patrolling` → `incident` → `shift_complete` → `confirmed` | No implementation profile | ❌ Not implemented |
| Heartbeat check-ins | Mandatory, 30-minute default interval, two misses trigger alert | `POST /api/rides/:rideId/check-in` exists (generic) | ⚠️ Generic endpoint exists but no security-specific enforcement |
| SIA licence verification | Mandatory before matching | No verification endpoint | ❌ Gap |
| Patrol checkpoints | GPS-confirmed waypoints (kind 30723) | No implementation | ❌ Gap |
| Shift reports | End-of-shift summary (kind 30721) | No implementation | ❌ Gap |
| Hourly streaming payments | 3600-second interval | Streaming exists but at 1000ms interval | ⚠️ Interval mismatch |
| Multi-guard assignments | Split payments combined with streaming | No split payment support | ❌ Gap |

**Key findings**: The security domain has no implementation profile in `src/domain-profiles/`. The generic check-in endpoint could serve as a foundation, but the mandatory heartbeat enforcement (automatic alerts on missed check-ins), SIA licence verification, and shift-based streaming payments are entirely absent.

##### Emergency Trades (Spec Only)

| Aspect | Spec (TROTT-emergency-trades) | Implementation | Verdict |
|--------|------------------------------|----------------|---------|
| State machine | `accepted` → `provider_en_route` → `diagnosis` → `quote_provided` → `quote_accepted` → `work_active` → `work_complete` → `confirmed` | No implementation profile | ❌ Not implemented |
| Milestone payments | Per-milestone quoting and release (kind 30533) | Stake release exists but not milestone-based | ⚠️ Foundation exists |
| Diagnosis report | Kind 30681 | No implementation | ❌ Gap |
| Repair quote | Multi-milestone pricing (kind 30682) | Generic quote endpoint exists | ⚠️ Foundation exists |
| Certification verification | Gas Safe, NICEIC mandatory checks | No verification endpoint | ❌ Gap |
| Linked tasks | `linked_task` tag for follow-up repairs | No linked task support | ❌ Gap |
| Gas emergency display | Prominent reminder for 0800 111 999 | No implementation | ❌ Gap |

**Key findings**: Emergency trades has no implementation profile. The generic quote endpoint (`POST /api/rides/:rideId/quote`) could partially serve the quote negotiation flow, but the multi-milestone payment model, diagnosis-before-quote flow, and regulatory certification verification are all absent.

---

### 6.4 Missing API Endpoints

Prioritised list of spec-defined features with no API implementation, grouped by practical impact on an operator deploying the protocol.

##### Critical (blocks core functionality)

| # | Feature | Spec | Required Endpoint | Affected Domains |
|---|---------|------|-------------------|-----------------|
| 1 | Task Offer (competitive bidding) | TROTT-01, kind 30501 | `POST /api/rides/:rideId/offer` | All -- currently only single-accept, no competitive offers |
| 2 | Task Confirm (requester confirmation) | TROTT-01, kind 30505 | `POST /api/rides/:rideId/confirm` | All -- stakes cannot be released without requester confirmation |
| 3 | Payment Terms agreement | TROTT-04, kind 30531 | `POST /api/rides/:rideId/payment-terms` | All -- formal payment agreement before work |
| 4 | Credential Attestation | TROTT-03, kind 30522 | `POST /api/credentials/attest`, `GET /api/credentials/:pubkey` | Security (SIA), Emergency Trades (Gas Safe) |

##### High (needed for full spec compliance)

| # | Feature | Spec | Required Endpoint | Affected Domains |
|---|---------|------|-------------------|-----------------|
| 5 | Provider Profile publishing | TROTT-02, kind 30510 | `POST /api/drivers/profile`, `GET /api/drivers/:pubkey/profile` | All -- providers cannot advertise skills/vehicles |
| 6 | Requester Profile | TROTT-02, kind 30513 | `POST /api/riders/profile` | All |
| 7 | Payment Receipt | TROTT-04, kind 30535 | `GET /api/rides/:rideId/receipt` | All -- no formal payment record |
| 8 | Route Deviation alert | TROTT-07, kind 30562 | Automatic via `POST /api/rides/:rideId/location` | Ridesharing (500m threshold), Delivery (1km threshold) |
| 9 | Safety Contact Share | TROTT-05, kind 30542 | `POST /api/rides/:rideId/safety-contacts` | Ridesharing, Security |
| 10 | Earnings Summary | TROTT-04, kind 30538 | `GET /api/drivers/:pubkey/earnings` | All |

##### Medium (enhances functionality)

| # | Feature | Spec | Required Endpoint | Affected Domains |
|---|---------|------|-------------------|-----------------|
| 11 | Leg Plan (multi-leg tasks) | TROTT-01, kind 30508 | `POST /api/rides/:rideId/legs` | Ridesharing (carpool), Delivery |
| 12 | Recurring Series | TROTT-01, kind 30509 | `POST /api/tasks/recurring` | Security (shift schedules), Cleaning |
| 13 | Trusted Provider List | TROTT-02, kind 30512 | `POST /api/riders/trusted-providers` | All |
| 14 | Operator Claim | TROTT-06, kind 30550 | `POST /api/operator/claim` | All (operator-coordinated mode) |
| 15 | PII Envelope | TROTT-06, kind 30551 | `POST /api/rides/:rideId/pii` | All (GDPR compliance) |
| 16 | Compliance Snapshot | TROTT-06, kind 30555 | `POST /api/compliance/snapshot` | All (audit trail) |
| 17 | Guarantee Period Start | Locksmith (30623), Emergency Trades (30685) | `POST /api/rides/:rideId/guarantee` | Locksmith, Emergency Trades |

##### Low (nice to have)

| # | Feature | Spec | Required Endpoint | Affected Domains |
|---|---------|------|-------------------|-----------------|
| 18 | Task Message (in-task chat) | TROTT-08, kind 30564 | `POST /api/rides/:rideId/messages` | All |
| 19 | Typing Indicator | TROTT-08, kind 20502 | WebSocket message type | All |
| 20 | Message Status (read receipts) | TROTT-08, kind 30565 | `POST /api/rides/:rideId/messages/:id/read` | All |
| 21 | Task Archive Entry | TROTT-08, kind 30566 | `GET /api/rides/archive` | All |
| 22 | User Preferences | TROTT-08, kind 30567 | `GET /api/users/:pubkey/preferences`, `PUT /api/users/:pubkey/preferences` | All |
| 23 | Navigation Resource | TROTT-07, kind 30563 | `GET /api/navigation/resources` | Ridesharing, Delivery |
| 24 | Operator Heartbeat | TROTT-06, kind 30554 | Automatic (operator publishes to relay) | All |
| 25 | Delegation Grant | TROTT-06, kind 30552 | `POST /api/delegation/grant` | All |
| 26 | Ridesharing domain kinds | TROTT-ridesharing, kinds 30600-30609 | Various (surge zones, carpool, scheduled rides) | Ridesharing |

---

### 6.5 Tag Coverage

For each major API endpoint, comparison of accepted request fields against spec-defined tags.

##### POST /api/rides/request (Task Request -- kind 30500)

| Spec Tag | Type | API Field | Mapped? | Notes |
|----------|------|-----------|---------|-------|
| `d` (task ID) | required | `ride_id` (optional) | ⚠️ | Auto-generated if not provided; spec requires unique `d` tag |
| `domain` | required | `domain` | ✅ | Defaults to server's startup domain |
| `status` | required | -- (set internally) | ✅ | Set to initial state automatically |
| `t` (protocol tag) | required | -- | ❌ | Not included in created events |
| pickup `location_lat`/`location_lon` | required | `pickup_lat`, `pickup_lon` | ✅ | Field names differ from spec tag names |
| dropoff `location_lat`/`location_lon` | conditional | `dropoff_lat`, `dropoff_lon` | ✅ | Correctly optional for single-location domains |
| `g` (geohash) | required | -- (not computed) | ❌ | No geohash generation for Nostr discovery |
| `amount` | optional | `fare_sats` | ⚠️ | Field name uses `_sats` suffix; spec is currency-neutral |
| `currency` | optional | `currency` | ✅ | Accepted, defaults to GBP |
| `trust_model` | required | -- | ❌ | Not included in responses |
| `expiration` | optional | -- | ❌ | No NIP-40 expiration support |
| `p` (pubkey) | required | `rider_npub`, `rider_pubkey` | ⚠️ | Accepts npub or pubkey; spec uses hex pubkey in `p` tag |
| `vehicle_type` | ridesharing | -- | ❌ | Not accepted |
| `passenger_count` | ridesharing | -- | ❌ | Not accepted |
| `luggage` | ridesharing | -- | ❌ | Not accepted |
| `surge_multiplier` | ridesharing | -- | ❌ | Not accepted |
| `lock_type` | locksmith | -- | ❌ | Not accepted |
| `property_type` | locksmith | -- | ❌ | Not accepted |
| `service_urgency` | locksmith | -- | ❌ | Not accepted |
| `package_size` | delivery | -- | ❌ | Not accepted |
| `package_weight` | delivery | -- | ❌ | Not accepted |
| `fragile` | delivery | -- | ❌ | Not accepted |
| `requires_signature` | delivery | -- | ❌ | Not accepted |
| `recipient_pubkey` | delivery | -- | ❌ | Not accepted |

##### POST /api/rides/:rideId/accept (Task Accept -- kind 30502)

| Spec Tag | Type | API Field | Mapped? | Notes |
|----------|------|-----------|---------|-------|
| `d` (task ID) | required | `:rideId` (URL param) | ✅ | |
| `p` (provider pubkey) | required | `driver_npub` or `driver_pubkey` | ✅ | Accepts both formats |
| `status` | required | -- (set internally) | ✅ | Transitions to `matched` state |
| `amount` | optional | -- | ❌ | Provider cannot propose a different amount |
| `vehicle_type` | ridesharing | -- | ❌ | Driver vehicle details not captured at acceptance |
| `vehicle_make` | ridesharing | -- | ❌ | |
| `vehicle_model` | ridesharing | -- | ❌ | |
| `vehicle_colour` | ridesharing | -- | ❌ | |
| `vehicle_plate` | ridesharing | -- | ❌ | |
| `seats_available` | ridesharing | -- | ❌ | |

##### POST /api/rides/:rideId/location (Location Update -- kind 20501)

| Spec Tag | Type | API Field | Mapped? | Notes |
|----------|------|-----------|---------|-------|
| Location lat/lon | required | `lat`, `lon` | ✅ | |
| `speed` | optional | -- | ❌ | Not accepted; spec uses speed for streaming rate variation |
| `heading` | optional | -- | ❌ | Not accepted |
| `altitude` | optional | -- | ❌ | Not accepted |
| `accuracy` | optional | -- | ❌ | Not accepted |
| ETA | computed | -- (response only) | ✅ | Computed via haversine and returned in response |
| `d` (task reference) | required | `:rideId` (URL param) | ✅ | |

##### POST /api/rides/:rideId/rate (Task Rating -- kind 30520)

| Spec Tag | Type | API Field | Mapped? | Notes |
|----------|------|-----------|---------|-------|
| `d` (rating ID) | required | -- (auto) | ⚠️ | Not explicitly set in simple path |
| `p` (target pubkey) | required | Computed from ride participants | ✅ | Automatically determined from role |
| `rating` | required | `rating` (1-5) or `event` (full Nostr event) | ✅ | Dual-path: simple number or full Nostr event |
| `domain` | required | -- (set from ride's domain) | ⚠️ | Not explicitly tagged in simple path |
| Domain-specific criteria | optional | -- | ❌ | Spec defines weighted criteria per domain; simple path accepts only overall rating |
| `content` (review text) | optional | `comment` | ✅ | |
| Role-specific criteria | per-domain | -- | ❌ | Spec defines different criteria for requester vs provider ratings |

##### POST /api/rides/:rideId/quote (Quote -- kind 30530)

| Spec Tag | Type | API Field | Mapped? | Notes |
|----------|------|-----------|---------|-------|
| `d` (quote ID) | required | -- (not set) | ❌ | No unique quote identifier |
| `amount` | required | `amount_sats` | ⚠️ | Field name assumes sats; spec is currency-neutral |
| `currency` | required | -- | ❌ | Not accepted; no currency tag on quotes |
| `description` | optional | `description` | ✅ | |
| `p` (provider pubkey) | required | `providerPubkey` | ✅ | |
| `expiration` | optional | -- | ❌ | No quote expiry support |
| `trust_model` | required | -- | ❌ | Not included |
| `breakdown` (itemised) | optional | -- | ❌ | Spec allows itemised quotes; impl is single amount |
| `milestone` tags | emergency-trades | -- | ❌ | No multi-milestone quoting |

##### POST /api/rides/:rideId/panic (Emergency Signal -- kind 30540)

| Spec Tag | Type | API Field | Mapped? | Notes |
|----------|------|-----------|---------|-------|
| `d` (task reference) | required | `:rideId` (URL param) | ✅ | |
| Full Nostr event | required | `event` (signed event object) | ✅ | Requires pre-signed Nostr event |
| `location_lat`/`location_lon` | recommended | Via event tags | ✅ | If included in event tags |
| `content` | optional | Via `event.content` | ✅ | Free-text description |
| Safety contact notification | spec-defined | -- | ❌ | No automatic notification to safety contacts |

---

### 6.6 Findings Summary

Consolidated findings from all 5 use case analyses and the cross-cutting analysis above.

| # | Finding | Severity | Domains Affected | Category |
|---|---------|----------|-----------------|----------|
| 1 | Task Offer (kind 30501) not implemented -- no competitive bidding | ❌ Gap | All | Lifecycle |
| 2 | Task Confirm (kind 30505) not implemented -- no requester sign-off step | ❌ Gap | All | Lifecycle |
| 3 | `offers_open` state missing from all implementation state machines | ❌ Gap | All | Lifecycle |
| 4 | Streaming interval mismatch: spec defines 30s (ridesharing) / 3600s (security); implementation uses 1000ms fixed | ⚠️ Friction | Ridesharing, Security | Payments |
| 5 | Streaming payment field names use `_sats` suffix; spec uses `amount` + `currency` tags (currency-neutral) | ⚠️ Friction | All with streaming | Payments |
| 6 | Payment Terms (kind 30531) not implemented | ❌ Gap | All | Payments |
| 7 | Payment Receipt (kind 30535) not implemented | ❌ Gap | All | Payments |
| 8 | Earnings Summary (kind 30538) not implemented | ❌ Gap | All | Payments |
| 9 | Milestone-based payments not supported; emergency trades requires per-milestone quoting and release | ❌ Gap | Emergency Trades | Payments |
| 10 | State names abbreviated in implementation vs spec (e.g. `en_route` vs `provider_en_route`, `active` vs `trip_active`) | ⚠️ Friction | Ridesharing | Lifecycle |
| 11 | Locksmith uses domain-flavoured state names (`lockout_reported`, `access_gained`) diverging from spec | ⚠️ Friction | Locksmith | Lifecycle |
| 12 | Delivery `arrived_at_delivery` sub-state not in spec; spec goes directly to `delivered` | 🔧 Enhancement | Delivery | Lifecycle |
| 13 | Provider Profile (kind 30510) not implemented -- providers cannot publish skill/vehicle profiles | ❌ Gap | All | Discovery |
| 14 | Requester Profile (kind 30513) not implemented | ❌ Gap | All | Discovery |
| 15 | Geohash discovery not published to Nostr relays; availability is Redis-only | ⚠️ Friction | All | Discovery |
| 16 | Trusted Provider List (kind 30512) not implemented | ❌ Gap | All | Discovery |
| 17 | Route Deviation alert (kind 30562) not implemented; spec defines 500m threshold for ridesharing, 1km for delivery | ❌ Gap | Ridesharing, Delivery | Navigation |
| 18 | Safety Contact Share (kind 30542) not implemented | ❌ Gap | Ridesharing, Security | Safety |
| 19 | Credential Attestation (kind 30522) not implemented; blocks SIA licence and Gas Safe verification | ❌ Gap | Security, Emergency Trades | Safety |
| 20 | Dispute event uses kind 30522 internally; spec defines kind 30543 for Dispute Claim | ⚠️ Friction | All | Safety |
| 21 | WebSocket location update sent in dual formats (legacy `driver_location` + React `location_update`) with inconsistent field names (`lon` vs `lng`) | ⚠️ Friction | All with tracking | Navigation |
| 22 | WebSocket message types use ridesharing-specific names (`ride_request`, `driver_arrived`, `trip_started`) rather than domain-agnostic names | ⚠️ Friction | All | Lifecycle |
| 23 | Quote endpoint uses `amount_sats` field; spec Quote (kind 30530) is currency-neutral with `amount` + `currency` tags | ⚠️ Friction | Locksmith, Emergency Trades | Payments |
| 24 | No domain-specific tags accepted in task request (vehicle_type, lock_type, package_size, etc.) | ❌ Gap | All | Lifecycle |
| 25 | No `expiration` tag (NIP-40) support on any event | ❌ Gap | All | Lifecycle |
| 26 | No `trust_model` tag in payment events | ⚠️ Friction | All | Payments |
| 27 | Implementation `eventKinds` in domain profiles use legacy kind numbers that do not match TROTT spec (e.g. `rating: 30530` instead of `30520`) | ❌ Gap | All | Lifecycle |
| 28 | TROTT-06 Coordination spec entirely unimplemented (PII envelopes, compliance records, operator claims) | ❌ Gap | All | Coordination |
| 29 | TROTT-08 Messaging spec entirely unimplemented (in-task chat, read receipts, typing indicators) | ❌ Gap | All | Messaging |
| 30 | Security domain has no implementation profile; all 5 domain-specific kinds (30720-30724) unimplemented | ❌ Gap | Security | Lifecycle |
| 31 | Emergency Trades domain has no implementation profile; all 6 domain-specific kinds (30680-30685) unimplemented | ❌ Gap | Emergency Trades | Lifecycle |
| 32 | Ridesharing domain-specific kinds (30600-30609) entirely unimplemented -- no carpool, surge zones, scheduled rides | ❌ Gap | Ridesharing | Lifecycle |
| 33 | Delivery proof endpoints are generic; no distinction between proof-of-collection (kind 30640) and proof-of-delivery (kind 30641) | ⚠️ Friction | Delivery | Safety |
| 34 | `recipient_pubkey` tag not supported; delivery cannot identify a third-party recipient | ❌ Gap | Delivery | Lifecycle |
| 35 | Cancellation penalty logic not enforced (spec defines different penalties per stage and domain) | ⚠️ Friction | All | Payments |
| 36 | Dual `/api/rides/:rideId/complete` endpoints exist (lines 865 and 3138) with different behaviour; legacy uses stake release, modern uses mock payment | ⚠️ Friction | All | Lifecycle |
| 37 | Guarantee Period Start (kinds 30623, 30685) not implemented for locksmith or emergency trades | ❌ Gap | Locksmith, Emergency Trades | Lifecycle |
| 38 | No NIP-44 encrypted payload support for PII fields (vehicle plate, addresses) | ❌ Gap | All | Safety |

---

### Overall Statistics

| Category | ✅ Match | ⚠️ Friction | ❌ Gap | 🔧 Enhancement |
|----------|----------|------------|--------|----------------|
| Lifecycle | 5 | 6 | 11 | 1 |
| Payments | 2 | 5 | 5 | 0 |
| Safety | 3 | 2 | 4 | 0 |
| Discovery | 0 | 1 | 3 | 0 |
| Navigation | 1 | 1 | 1 | 0 |
| Messaging | 0 | 0 | 1 | 0 |
| Coordination | 0 | 0 | 1 | 0 |
| **Total** | **11** | **15** | **26** | **1** |

**Interpretation**: Of 53 distinct findings (including the 38 itemised above and 15 high-level category assessments), 11 represent areas where the spec and implementation are in agreement, 15 show friction points where the implementation partially covers the spec but with naming, format, or structural mismatches, 26 represent outright gaps where spec-defined functionality has no implementation, and 1 represents an implementation enhancement beyond what the spec requires. The overall spec coverage rate is approximately **21% full match, 28% partial match, and 49% gap** -- consistent with a reference implementation that has prioritised the core happy-path lifecycle while leaving advanced protocol features (competitive offers, PII handling, messaging, multi-milestone payments, and domain-specific event kinds) for future development.
