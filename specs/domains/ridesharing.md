# TROTT Domain Profile: Ridesharing

`draft`

**Domain identifier:** `ridesharing`
**Coordination pattern:** Trip
**Event kind range:** 30600-30619

## TROTT Specs Used

- TROTT-01: Core **Yes**
- TROTT-02: Discovery (geographic broadcast) **Yes**
- TROTT-03: Reputation **Yes**
- TROTT-04: Payments (simple quote, escrowed, streaming) **Yes**
- TROTT-05: Safety (emergency signal, check-ins, trip sharing, disputes) **Yes**
- TROTT-06: Coordination (recommended) **Yes**
- TROTT-07: Navigation (routing, ETA, live tracking, route deviation) **Yes**
- TROTT-08: Messaging (task-scoped chat during rides) **Yes**

## Roles

- Requester: "Rider"
- Provider: "Driver"

## State Machine Extension

The ridesharing domain expands the TROTT-01 `in_progress` phase into three sub-states representing the physical journey:

```
accepted --> provider_en_route --> provider_arrived --> trip_active --> completed --> confirmed
                                        |
                                        +--> no_show (rider absent; automatic stake forfeit)
```

| Core state | Ridesharing state | Description |
|------------|-------------------|-------------|
| `in_progress` (phase 1) | `provider_en_route` | Driver travelling to pickup |
| `in_progress` (phase 2) | `provider_arrived` | Driver waiting at pickup |
| `in_progress` (phase 3) | `trip_active` | Rider aboard, ride underway |

Additional terminal state: `no_show` -- rider fails to appear within the waiting limit.

## Domain-Specific Tags

| Tag | Description |
|-----|-------------|
| `vehicle_type` | Vehicle category: `sedan`, `suv`, `van`, `mpv`, `bike` |
| `vehicle_make` | Manufacturer |
| `vehicle_model` | Model name |
| `vehicle_colour` | Vehicle colour |
| `vehicle_plate` | Registration plate (encrypted via NIP-44) |
| `seats_available` | Number of available passenger seats |
| `passenger_count` | Number of passengers for this ride |
| `luggage` | Luggage size: `none`, `small`, `medium`, `large` |
| `quiet_ride` | Rider prefers silence: `true`/`false` |
| `surge_multiplier` | Current surge pricing multiplier |

## Rating Criteria

**Driver rated by Rider:**

| Criterion | Weight |
|-----------|--------|
| `overall` | 0.25 |
| `punctuality` | 0.20 |
| `safety` | 0.20 |
| `vehicle_condition` | 0.15 |
| `communication` | 0.20 |

**Rider rated by Driver:**

| Criterion | Weight |
|-----------|--------|
| `overall` | 0.40 |
| `punctuality` | 0.30 |
| `communication` | 0.30 |

## Pricing Model

**Distance + time + surge.** Fare = `base_fare + (distance_metres x per_metre_rate) + (duration_seconds x per_second_rate)`. Final fare multiplied by `surge_multiplier` when demand exceeds supply. All amounts in smallest currency unit.

## Payment Configuration

| Property | Value |
|----------|-------|
| Primary `payment_type` | `streaming` |
| Fallback `payment_type` | `simple` |
| Streaming interval | 30 seconds |
| Rate basis | Distance + time |
| Streaming model | GBP 0.25/tick while moving, GBP 0.10/tick while stationary |

Ridesharing uses TROTT-04 streaming payments (kind 30536) as the primary model, with per-tick amounts varying by speed. A `simple` lump-sum fallback is available for short trips or when the payment rail does not support streaming.

### Default Stakes

| Party | Percentage | Basis |
|-------|-----------|-------|
| Rider | 10% | Estimated fare |
| Driver | 15% | Estimated fare |

## Cancellation Policy

| Stage | Penalty |
|-------|---------|
| Before match | None |
| Within 5 minutes of match (grace period) | None |
| After grace period, before pickup | 80% of staked amount |
| No-show (rider absent after 10 minutes) | 100% of rider stake (automatic) |

Stake amounts are defined in the Default Stakes table above.

## PII Requirements

Pickup address, dropoff address, rider phone number (optional). Transmitted via TROTT-06 PII Envelope (NIP-17 gift wrap). Retained for task duration plus 30 days.

## Safety Rules

- **Check-ins:** Not required during standard rides. Optional for long-distance rides (> 30 minutes).
- **Trip sharing:** Rider may share live location with safety contacts via TROTT-05 Safety Contact Share.
- **Route deviation:** Threshold of 500 metres triggers TROTT-07 Route Deviation alert to rider and safety contacts.
- **Emergency signal:** Either party may trigger TROTT-05 Emergency Signal at any time.

## Completion Proof

GPS trace of the route taken, confirming pickup at origin and dropoff at destination. Rider confirms arrival via TROTT-01 Task Confirm (30505).

## Domain-Specific Event Kinds

| Kind | Name | Description |
|------|------|-------------|
| 30600 | Wait Time Charge | Driver charges for excess waiting at pickup |
| 30601 | No-Show Fee | Rider failed to appear; fee event |
| 30602 | Additional Charge | Incidental charge: toll, parking, cleaning |
| 30603 | Destination Change | Rider changes dropoff mid-ride |
| 30604 | Surge Pricing Zone | Operator publishes current surge zone and multiplier |
| 30605 | Scheduled Ride Request | Pre-booked ride for a future time |
| 30606 | Carpool Request | Rider signals willingness to share a ride on an overlapping route |
| 30607 | Carpool Seat Offer | Driver advertises available seats on a planned route |
| 30608 | Split Payment Request | Fare split definition for a shared ride among multiple passengers |
| 30609 | Ride Preferences | Rider's standing preferences (music, temperature, quiet) |
| 30610-30619 | *(Reserved)* | Future ridesharing extensions |

## Regulatory Context

Private hire vehicle licensing in the UK is governed by the **Private Hire Vehicles (London) Act 1998** (London) and the **Local Government (Miscellaneous Provisions) Act 1976** (rest of England and Wales). Drivers require a private hire driver licence and vehicles require a private hire vehicle licence from the relevant local authority. Operators coordinating bookings require a private hire operator licence. Insurance must cover hire and reward use.

## Carpool / Shared Rides

Carpooling allows multiple riders heading in roughly the same direction to share a single vehicle, splitting the fare proportionally. Three domain-specific event kinds support this workflow: Carpool Request (30606), Carpool Seat Offer (30607), and Split Payment Request (30608). These events complement the core TROTT-01 task lifecycle and TROTT-04 payment flow.

### Kind 30606: Carpool Request

Published by a rider willing to share a ride with others on an overlapping route. This is a **discovery event** -- riders publish it to signal willingness to share. It does **not** create a task (30500) yet; a task is created only when a match is found.

**Tags:**

| Tag | Description |
|-----|-------------|
| `d` | `carpool_req:<request_id>` |
| `g` (multiple) | Geohash tags for pickup area (precision 3-5) |
| `destination_geohash` | Approximate destination (precision 4-5) |
| `seats_requested` | Number of seats needed (default `1`) |
| `departure_window_start` | Earliest acceptable departure (unix timestamp) |
| `departure_window_end` | Latest acceptable departure (unix timestamp) |
| `flexibility_metres` | How far the rider is willing to walk to a common pickup point |
| `max_detour_minutes` | Maximum acceptable detour versus direct route |
| `expiration` | NIP-40 expiration timestamp |

**Content:** optional rider note.

```json
{
  "kind": 30606,
  "pubkey": "<rider_pubkey>",
  "created_at": 1707600000,
  "tags": [
    ["d", "carpool_req:abc123"],
    ["g", "gcpvj"],
    ["g", "gcpv"],
    ["g", "gcp"],
    ["destination_geohash", "gcpuw"],
    ["seats_requested", "1"],
    ["departure_window_start", "1707620000"],
    ["departure_window_end", "1707627200"],
    ["flexibility_metres", "400"],
    ["max_detour_minutes", "10"],
    ["expiration", "1707627200"]
  ],
  "content": "Happy to walk a few minutes to a shared pickup spot"
}
```

### Kind 30607: Carpool Seat Offer

Published by a driver advertising available seats on a planned route.

**Tags:**

| Tag | Description |
|-----|-------------|
| `d` | `carpool_offer:<offer_id>` |
| `g` (multiple) | Geohash tags for route corridor (precision 3-5) |
| `origin_geohash` | Approximate origin |
| `destination_geohash` | Approximate destination |
| `seats_available` | Remaining seats |
| `departure_at` | Planned departure time (unix timestamp) |
| `price_per_seat` | Per-seat price (smallest currency unit) |
| `currency` | Currency code |
| `vehicle_type` | Vehicle category |
| `detour_tolerance_minutes` | How much detour the driver accepts for pickups |
| `expiration` | NIP-40 expiration timestamp |

**Content:** optional driver note (e.g. "Heathrow run, leaving from central London").

```json
{
  "kind": 30607,
  "pubkey": "<driver_pubkey>",
  "created_at": 1707600000,
  "tags": [
    ["d", "carpool_offer:xyz789"],
    ["g", "gcpvj"],
    ["g", "gcpv"],
    ["g", "gcp"],
    ["origin_geohash", "gcpvj"],
    ["destination_geohash", "gcpuw"],
    ["seats_available", "3"],
    ["departure_at", "1707620000"],
    ["price_per_seat", "1500"],
    ["currency", "GBP"],
    ["vehicle_type", "mpv"],
    ["detour_tolerance_minutes", "15"],
    ["expiration", "1707620000"]
  ],
  "content": "Heathrow run, leaving from central London"
}
```

### Kind 30608: Split Payment Request

Published when a carpool ride's fare needs splitting among passengers. Each passenger is expected to lock their share via Stake Lock (30532). The driver receives the combined total (minus operator fee) via Stake Release (30533).

**Tags:**

| Tag | Description |
|-----|-------------|
| `d` | `<task_id>:split_req` |
| `task_id` | Parent task identifier |
| `e` | References Payment Terms (30531) |
| `split_method` | `equal`, `distance_proportional`, or `fixed_per_seat` |
| `passenger` (multiple) | `<pubkey>, <amount>, <currency>, <pickup_geohash>, <dropoff_geohash>` |
| `total_amount` | Total fare |
| `currency` | Currency code |

```json
{
  "kind": 30608,
  "pubkey": "<operator_pubkey>",
  "created_at": 1707625000,
  "tags": [
    ["d", "task_001:split_req"],
    ["task_id", "task_001"],
    ["e", "<payment_terms_event_id>"],
    ["split_method", "distance_proportional"],
    ["passenger", "<pubkey_alice>", "800", "GBP", "gcpvj", "gcpuw"],
    ["passenger", "<pubkey_bob>", "650", "GBP", "gcpvm", "gcpuw"],
    ["passenger", "<pubkey_carol>", "550", "GBP", "gcpvn", "gcpuw"],
    ["total_amount", "2000"],
    ["currency", "GBP"]
  ],
  "content": ""
}
```

### Carpool Coordination Flow

The end-to-end flow for a carpool ride:

```
1.  Riders publish Carpool Requests (30606) with route and time windows
2.  Driver publishes Carpool Seat Offer (30607) with route and capacity
3.  Operator matches compatible requests to offers based on route overlap
4.  Each matched rider creates a Task Request (30500) with linked_task relationship: shared_ride
5.  Operator publishes Leg Plan (30508) with ordered pickup/dropoff sequence
6.  Split Payment Request (30608) defines each passenger's fare share
7.  Each passenger locks their share (30532)
8.  Driver picks up passengers in Leg Plan order, publishing Task Update (30503)
    with leg_sequence per stop
9.  Each passenger's task transitions through their own lifecycle
    (their pickup -> in-vehicle -> their dropoff)
10. On each dropoff, that passenger's task completes and their payment releases
11. Final passenger dropoff completes the driver's overall trip
12. All parties rate independently
```

### Airport Shuttle Example

A hotel concierge or travel app publishes four Carpool Requests (30606), one per hotel guest heading to Heathrow. A driver publishes a Carpool Seat Offer (30607) for "Heathrow, departing 06:00". The operator groups the compatible requests, creates a task for each guest, and publishes a Leg Plan (30508) with the pickup sequence: Hotel 1 -> Hotel 2 -> Hotel 3 -> Hotel 4 -> Heathrow. Each hotel guest pays their distance-proportional share via Split Payment Request (30608). As each guest is dropped at Heathrow, their individual task completes and their stake releases.
