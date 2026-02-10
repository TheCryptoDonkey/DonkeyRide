# NIP-XX-ridesharing: Ridesharing Domain Extension

`draft` `optional`

**Extends**: NIP-XX-core (Decentralised Service Coordination Protocol)
**Domain Identifier**: `ridesharing`
**Event Kind Range**: 30500-30599 (80 total)

---

## Abstract

This NIP defines the **ridesharing domain extension** to NIP-XX-core. It specifies role aliases, tag aliases, ridesharing-specific event kinds, state machine mappings, and domain-specific behaviours for peer-to-peer ridesharing coordination over Nostr with payment-agnostic financial rails.

All core event kinds and mechanisms defined in NIP-XX-core apply unchanged when the `domain` tag is set to `"ridesharing"`. This extension adds ridesharing-specific event kinds in the 30514-30516 and 30529-30599 ranges covering financial charges, operational management, driver management, navigation, surge pricing, compliance, accessibility, and more.

---

## Domain Configuration

### Domain Identifier

All ridesharing events SHOULD include the domain tag:

```json
["domain", "ridesharing"]
```

### Role Aliases

| Core Term | Ridesharing Alias |
|-----------|-------------------|
| Requester | Rider |
| Provider | Driver |
| Task | Ride |

Implementations SHOULD accept both the generic terms and the ridesharing aliases interchangeably.

### Tag Aliases

The following tag aliases are defined for ridesharing. Implementations MUST accept both the core tag name and the ridesharing alias.

| Core Tag | Ridesharing Alias | Description |
|----------|-------------------|-------------|
| `requester_pubkey` | `rider_pubkey` | Rider's Nostr pubkey |
| `provider_pubkey` | `driver_pubkey` | Driver's Nostr pubkey |
| `task_id` | `ride_id` | Unique ride identifier |
| `origin_lat` | `pickup_lat` | Pickup latitude |
| `origin_lon` | `pickup_lon` | Pickup longitude |
| `destination_lat` | `dropoff_lat` | Dropoff latitude |
| `destination_lon` | `dropoff_lon` | Dropoff longitude |

Example — the following are semantically equivalent:

```json
["requester_pubkey", "ab12cd34..."]
["rider_pubkey", "ab12cd34..."]
```

---

## Currency-Neutral Amounts

All monetary amounts in ridesharing events are **currency-neutral**. The `amount` value is always in the smallest unit of the specified currency (pence for GBP, cents for USD, satoshis for SAT). Every event with a monetary value MUST include `currency` and `trust_model` tags:

```json
["amount", "1500"],
["currency", "GBP"],
["trust_model", "custodial-third-party"]
```

See [NIP-XX-payments.md](NIP-XX-payments.md) for the full payment specification and [NIP-XX-stakes.md](NIP-XX-stakes.md) for stake lifecycle.

---

## State Machine

The ridesharing state machine maps directly onto the NIP-XX-core lifecycle with domain-specific state names.

```
requested ──→ matched ──→ en_route ──→ arrived ──→ active ──→ completed
    │             │            │            │          │
    │             │            │            │          └──→ cancelled
    │             │            │            └──→ no_show
    │             │            │            └──→ cancelled
    └─────────────┴────────────┴──→ cancelled
```

Terminal states: `completed`, `cancelled`, `no_show`.

### State Mapping

| Core State | Ridesharing State | Description |
|------------|-------------------|-------------|
| `requested` | `requested` | Rider has submitted a ride request |
| `matched` | `matched` | A driver has accepted the ride |
| `provider_en_route` | `en_route` | Driver is travelling to the pickup location |
| `provider_arrived` | `arrived` | Driver has arrived at the pickup location |
| `active` | `active` | Ride is in progress (rider aboard) |
| `completed` | `completed` | Ride has been completed, rider dropped off |
| `cancelled` | `cancelled` | Ride was cancelled (valid from any non-terminal state) |
| `no_show` | `no_show` | Rider failed to appear within the waiting limit; triggers automatic stake forfeiture |

### Allowed Transitions

| From | To |
|------|----|
| `requested` | `matched`, `cancelled` |
| `matched` | `en_route`, `cancelled` |
| `en_route` | `arrived`, `cancelled` |
| `arrived` | `active`, `no_show`, `cancelled` |
| `active` | `completed`, `cancelled` |

---

## Discovery Method

Ridesharing uses **geohash-based discovery**. Ride request events (kind 30500) MUST include geohash tags at multiple precision levels to enable efficient geographic filtering:

```json
["g", "<geohash-5>"],  // Precision 5 (~5 km) — primary search radius
["g", "<geohash-4>"],  // Precision 4 (~20 km) — broader fallback
["g", "<geohash-3>"]   // Precision 3 (~150 km) — metro area coverage
```

Drivers query for nearby ride requests by filtering on the `g` tag:

```json
{ "kinds": [30500], "#g": ["gcpuuz"], "#domain": ["ridesharing"] }
```

---

## Pricing Model

Ridesharing uses a **distance + time + surge** pricing model.

**Base fare calculation:**

```
fare = base_fare + (distance_metres * per_metre_rate) + (duration_seconds * per_second_rate)
```

All values in the smallest unit of the operator's configured currency (pence, cents, satoshis).

**Surge multiplier** (when demand exceeds supply):

```
final_fare = fare * surge_multiplier
```

Surge pricing zones and multipliers are published transparently as kind 30590 events, ensuring riders can verify pricing before requesting a ride.

---

## Inherited Core Event Kinds

The following event kinds are defined in NIP-XX-core and apply unchanged to the ridesharing domain. They are used with `["domain", "ridesharing"]` and accept both core and aliased tag names.

### Task Lifecycle (Core)

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30500 | Ride Request | Yes (NIP-33) | Rider |
| 30501 | Ride Acceptance | Yes (NIP-33) | Driver |
| 30502 | Stake Lock | Yes (NIP-33) | Operator |
| 30503 | Stake Negotiation | Yes (NIP-33) | Either party |
| 30504 | Ride Confirmation | Yes (NIP-33) | Operator |
| 30506 | Ride Cancellation | No (append-only) | Either party |
| 30507 | Ride Start | Yes (NIP-33) | Driver |
| 30508 | Ride End | Yes (NIP-33) | Driver |
| 30509 | Commitment Stake | Yes (NIP-33) | Rider/Driver |
| 30510 | Streaming Payment | No (append-only) | Rider |
| 30511 | Payment Confirmation | Yes (NIP-33) | Operator |
| 30512 | Status Update | Yes (NIP-33) | Driver/Operator |
| 30513 | Driver Tip | No (append-only) | Rider |

### Trust & Reputation (Core)

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30517 | Driver Rating | No (append-only) | Rider |
| 30518 | Rider Rating | No (append-only) | Driver |
| 30519 | Reputation Summary | Yes (NIP-33) | Anyone |
| 30520 | Stake Release | No (append-only) | Operator |
| 30521 | Reputation Export/Import | Yes (NIP-33) | Anyone |
| 30522 | Dispute Filing | No (append-only) | Either party |
| 30523 | Arbiter Assignment | Yes (NIP-33) | Operator |
| 30524 | Dispute Resolution | Yes (NIP-33) | Operator/Arbiter |
| 30525 | Theft Report | No (append-only) | Anyone |
| 30526 | Watchdog Claim | No (append-only) | Verifier |
| 30527 | Operator Slashing | No (append-only) | Verifier |
| 30528 | Operator Reputation | Yes (NIP-33) | Anyone |

### Safety & Emergency (Core)

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30559 | Emergency Alert | No (append-only) | Either party |
| 30560 | Trip Sharing | Yes (NIP-33) | Rider |
| 30561 | Safety Check-In Request | No (append-only) | Operator |
| 30562 | Safety Check-In Response | No (append-only) | Either party |
| 30563 | Safety Check-In Escalation | No (append-only) | Operator |
| 30564 | Harassment Report | No (append-only) | Either party |

### Abuse Detection (Core)

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30549 | Suspicious Activity Report | No (append-only) | Operator |
| 30550 | Account Suspension | Yes (NIP-33) | Operator |
| 30551 | Appeal Request | No (append-only) | Either party |

### Compliance (Core)

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30540 | Operator Bond / Age Verification | Yes (NIP-33) | Operator |

---

## Ridesharing-Specific Event Kinds

The following event kinds are defined by this extension for ridesharing-specific functionality.

### Financial (Ridesharing-Specific)

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30514 | Wait Time Charge | No (append-only) | Driver |
| 30515 | No-Show Fee | No (append-only) | Driver |
| 30516 | Additional Charge | No (append-only) | Driver |

### Cross-Operator

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30505 | Cross-Operator Coordination | Yes (NIP-33) | Operator |

### Scheduled Rides & Carpooling

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30529 | Scheduled Ride Request | Yes (NIP-33) | Rider |
| 30532 | Carpool Ride Request | Yes (NIP-33) | Rider |
| 30533 | Carpool Seat Offer | Yes (NIP-33) | Driver |
| 30534 | Carpool Match | Yes (NIP-33) | Operator |
| 30535 | Multi-Leg Trip | Yes (NIP-33) | Rider |

### Compliance (Ridesharing-Specific)

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30541 | Wheelchair Accessibility Request | Yes (NIP-33) | Rider |
| 30542 | Wheelchair Certification | Yes (NIP-33) | Operator |
| 30543 | Fatigue Warning | No (append-only) | Operator |

### Edge Cases

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30544 | Medical Emergency | No (append-only) | Either party |
| 30545 | Accident Report | No (append-only) | Driver |
| 30555 | Driver Break Request | No (append-only) | Driver |
| 30556 | Ride Extension Request | No (append-only) | Rider |
| 30557 | Destination Change | No (append-only) | Rider |
| 30558 | Route Update | Yes (NIP-33) | Driver |

> **Note**: Location clarification and pickup delay notification do not use dedicated event kinds. Instead, use kind 30512 (Status Update) with specific `update_type` tags:
>
> - **Location clarification**: `["update_type", "location_clarification"]` — either party clarifies an ambiguous pickup or dropoff location.
> - **Pickup delay notification**: `["update_type", "pickup_delay"]` — driver notifies the rider of a delay en route to the pickup.
>
> Kinds 30553 and 30554 are reserved for the guardian voting protocol (Slashing Proposal and Guardian Vote) defined in [NIP-XX-disputes.md](NIP-XX-disputes.md).

### Accessibility

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30552 | Accessibility Request | Yes (NIP-33) | Rider |
| 30588 | Service Animal Notification | Yes (NIP-33) | Rider |
| 30589 | Audio Navigation | Yes (NIP-33) | Operator |

### Operational

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30565 | Service Area Definition | Yes (NIP-33) | Operator |
| 30566 | Airport Queue Management | Yes (NIP-33) | Operator |
| 30567 | Flat Rate Zone | Yes (NIP-33) | Operator |
| 30568 | Saved Location | Yes (NIP-33) | Rider/Driver |
| 30569 | Operator Announcement | No (append-only) | Operator |

### UX Features

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30570 | Ride Preferences | Yes (NIP-33) | Rider |
| 30571 | Lost & Found Report | No (append-only) | Rider |
| 30572 | Lost & Found Match | Yes (NIP-33) | Operator |
| 30573 | Referral Code | Yes (NIP-33) | Rider/Driver |
| 30574 | Promo Code | Yes (NIP-33) | Operator |
| 30575 | Split Payment Request | Yes (NIP-33) | Rider |
| 30576 | Corporate Account | Yes (NIP-33) | Operator |
| 30577 | Favourite Driver | Yes (NIP-33) | Rider |

### Driver Management

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30578 | Driver Shift Start | No (append-only) | Driver |
| 30579 | Driver Shift End | No (append-only) | Driver |
| 30580 | Driver Earnings Summary | Yes (NIP-33) | Driver |
| 30581 | Driver Goal Progress | Yes (NIP-33) | Driver |
| 30582 | Driver Performance Metrics | Yes (NIP-33) | Operator |

### Navigation

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30583 | Route Suggestion | Yes (NIP-33) | Driver/Operator |
| 30584 | Turn-by-Turn Navigation | No (append-only) | Driver |
| 30585 | Traffic Alert | No (append-only) | Operator |
| 30586 | Reroute Request | No (append-only) | Driver/Rider |
| 30587 | Navigation Feedback | No (append-only) | Rider |

### Surge Pricing

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30590 | Surge Pricing Zone | Yes (NIP-33) | Operator |
| 30591 | Surge Pricing History | No (append-only) | Operator |
| 30592 | Demand Heatmap | Yes (NIP-33) | Operator |

### History & Reporting

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30593 | Ride History Summary | Yes (NIP-33) | Rider/Driver |
| 30594 | Tax Report | Yes (NIP-33) | Driver |

### Verification

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30595 | Background Check Verification | Yes (NIP-33) | Operator |
| 30596 | Insurance Verification | Yes (NIP-33) | Operator |
| 30597 | Vehicle Inspection | Yes (NIP-33) | Operator |
| 30598 | Licence Verification | Yes (NIP-33) | Operator |
| 30599 | Training Certification | Yes (NIP-33) | Operator |

---

## Event Structures

### Kind 30500: Ride Request (Core, with ridesharing tags)

```json
{
  "kind": 30500,
  "pubkey": "<rider-hex-pubkey>",
  "content": "Need a ride to the station",
  "tags": [
    ["d", "ride_abc123"],
    ["domain", "ridesharing"],
    ["rider_pubkey", "<rider-hex-pubkey>"],
    ["pickup_lat", "51.5074"],
    ["pickup_lon", "-0.1278"],
    ["dropoff_lat", "51.5155"],
    ["dropoff_lon", "-0.1416"],
    ["g", "gcpuu"],
    ["g", "gcpu"],
    ["g", "gcp"],
    ["amount", "1500"],
    ["currency", "GBP"],
    ["trust_model", "custodial-third-party"],
    ["requester_stake", "150"],
    ["vehicle_type", "sedan"],
    ["passenger_count", "2"],
    ["luggage", "small"],
    ["quiet_ride", "true"],
    ["expiration", "1698769032"]
  ]
}
```

### Kind 30501: Ride Acceptance (Core, with ridesharing tags)

```json
{
  "kind": 30501,
  "pubkey": "<driver-hex-pubkey>",
  "content": "",
  "tags": [
    ["d", "ride_abc123"],
    ["domain", "ridesharing"],
    ["e", "<request-event-id>", "wss://relay.example.com"],
    ["driver_pubkey", "<driver-hex-pubkey>"],
    ["provider_stake", "225"],
    ["estimated_arrival", "8"],
    ["amount", "1500"],
    ["currency", "GBP"],
    ["vehicle_make", "Toyota"],
    ["vehicle_model", "Camry"],
    ["vehicle_colour", "Silver"],
    ["vehicle_plate", "AB12 CDE"]
  ]
}
```

### Kind 30505: Cross-Operator Coordination

Published when a ride request cannot be fulfilled by the originating operator and is forwarded to a partner operator.

```json
{
  "kind": 30505,
  "pubkey": "<operator-hex-pubkey>",
  "content": "Forwarding ride request — no available drivers in zone",
  "tags": [
    ["d", "ride_abc123"],
    ["domain", "ridesharing"],
    ["ride_id", "ride_abc123"],
    ["source_operator", "<source-operator-pubkey>"],
    ["target_operator", "<target-operator-pubkey>"],
    ["e", "<original-request-event-id>"],
    ["pickup_lat", "51.5074"],
    ["pickup_lon", "-0.1278"],
    ["fee_split", "0.003"]
  ]
}
```

### Kind 30514: Wait Time Charge

Published by the driver when a rider exceeds the free waiting period at pickup.

```json
{
  "kind": 30514,
  "pubkey": "<driver-hex-pubkey>",
  "content": "Rider 7 minutes late at pickup",
  "tags": [
    ["d", "ride_abc123"],
    ["domain", "ridesharing"],
    ["ride_id", "ride_abc123"],
    ["rider_pubkey", "<rider-hex-pubkey>"],
    ["wait_seconds", "420"],
    ["free_wait_seconds", "300"],
    ["amount", "200"],
    ["currency", "GBP"],
    ["rate_per_minute", "100"]
  ]
}
```

### Kind 30515: No-Show Fee

Published when the rider fails to appear within the allowed waiting period.

```json
{
  "kind": 30515,
  "pubkey": "<driver-hex-pubkey>",
  "content": "Rider did not appear after 10 minutes",
  "tags": [
    ["d", "ride_abc123"],
    ["domain", "ridesharing"],
    ["ride_id", "ride_abc123"],
    ["rider_pubkey", "<rider-hex-pubkey>"],
    ["wait_seconds", "600"],
    ["amount", "500"],
    ["currency", "GBP"],
    ["driver_pubkey", "<driver-hex-pubkey>"]
  ]
}
```

### Kind 30516: Additional Charge

Published for incidental charges during a ride (tolls, parking, cleaning fees).

```json
{
  "kind": 30516,
  "pubkey": "<driver-hex-pubkey>",
  "content": "Congestion zone toll",
  "tags": [
    ["d", "ride_abc123_toll_1"],
    ["domain", "ridesharing"],
    ["ride_id", "ride_abc123"],
    ["charge_type", "toll"],
    ["amount", "1500"],
    ["currency", "GBP"],
    ["description", "Central London congestion charge"]
  ]
}
```

### Kind 30529: Scheduled Ride Request

```json
{
  "kind": 30529,
  "pubkey": "<rider-hex-pubkey>",
  "content": "Airport pickup on Friday morning",
  "tags": [
    ["d", "sched_xyz789"],
    ["domain", "ridesharing"],
    ["rider_pubkey", "<rider-hex-pubkey>"],
    ["pickup_lat", "51.4700"],
    ["pickup_lon", "-0.4543"],
    ["dropoff_lat", "51.5074"],
    ["dropoff_lon", "-0.1278"],
    ["pickup_time", "1699000800"],
    ["vehicle_type", "sedan"],
    ["amount", "2500"],
    ["currency", "GBP"]
  ]
}
```

### Kind 30532: Carpool Ride Request

```json
{
  "kind": 30532,
  "pubkey": "<rider-hex-pubkey>",
  "content": "Happy to share — heading to King's Cross",
  "tags": [
    ["d", "carpool_def456"],
    ["domain", "ridesharing"],
    ["rider_pubkey", "<rider-hex-pubkey>"],
    ["pickup_lat", "51.5033"],
    ["pickup_lon", "-0.1195"],
    ["dropoff_lat", "51.5320"],
    ["dropoff_lon", "-0.1240"],
    ["g", "gcpvj"],
    ["max_detour_minutes", "10"],
    ["passenger_count", "1"]
  ]
}
```

### Kind 30533: Carpool Seat Offer

```json
{
  "kind": 30533,
  "pubkey": "<driver-hex-pubkey>",
  "content": "2 seats available heading north",
  "tags": [
    ["d", "seats_ghi012"],
    ["domain", "ridesharing"],
    ["driver_pubkey", "<driver-hex-pubkey>"],
    ["available_seats", "2"],
    ["route_geohashes", "gcpvj,gcpvm,gcpvn"],
    ["departure_time", "1698765600"],
    ["amount_per_seat", "500"],
    ["currency", "GBP"]
  ]
}
```

### Kind 30541: Wheelchair Accessibility Request

```json
{
  "kind": 30541,
  "pubkey": "<rider-hex-pubkey>",
  "content": "",
  "tags": [
    ["d", "ride_abc123"],
    ["domain", "ridesharing"],
    ["ride_id", "ride_abc123"],
    ["rider_pubkey", "<rider-hex-pubkey>"],
    ["wheelchair_type", "manual"],
    ["ramp_required", "true"],
    ["assistance_needed", "true"]
  ]
}
```

### Kind 30544: Medical Emergency

```json
{
  "kind": 30544,
  "pubkey": "<driver-hex-pubkey>",
  "content": "Rider experiencing chest pain — diverting to nearest hospital",
  "tags": [
    ["d", "ride_abc123"],
    ["domain", "ridesharing"],
    ["ride_id", "ride_abc123"],
    ["emergency_type", "medical"],
    ["lat", "51.4988"],
    ["lon", "-0.1749"],
    ["diverting_to", "Chelsea and Westminster Hospital"],
    ["emergency_services_called", "true"]
  ]
}
```

### Kind 30557: Destination Change

```json
{
  "kind": 30557,
  "pubkey": "<rider-hex-pubkey>",
  "content": "Change of plans — going to Waterloo instead",
  "tags": [
    ["d", "ride_abc123_destchange_1"],
    ["domain", "ridesharing"],
    ["ride_id", "ride_abc123"],
    ["rider_pubkey", "<rider-hex-pubkey>"],
    ["new_dropoff_lat", "51.5031"],
    ["new_dropoff_lon", "-0.1132"],
    ["original_dropoff_lat", "51.5155"],
    ["original_dropoff_lon", "-0.1416"],
    ["fare_adjustment", "-500"],
    ["currency", "GBP"]
  ]
}
```

### Kind 30565: Service Area Definition

```json
{
  "kind": 30565,
  "pubkey": "<operator-hex-pubkey>",
  "content": "Greater London service area",
  "tags": [
    ["d", "area_london"],
    ["domain", "ridesharing"],
    ["operator_pubkey", "<operator-hex-pubkey>"],
    ["area_name", "Greater London"],
    ["boundary_geohashes", "gcpv,gcpw,gcpu,gcps"],
    ["active", "true"],
    ["surge_enabled", "true"],
    ["min_fare", "500"],
    ["currency", "GBP"]
  ]
}
```

### Kind 30570: Ride Preferences

```json
{
  "kind": 30570,
  "pubkey": "<rider-hex-pubkey>",
  "content": "",
  "tags": [
    ["d", "<rider-hex-pubkey>_prefs"],
    ["domain", "ridesharing"],
    ["rider_pubkey", "<rider-hex-pubkey>"],
    ["music", "none"],
    ["temperature", "cool"],
    ["quiet_ride", "true"],
    ["conversation", "minimal"],
    ["route_preference", "fastest"]
  ]
}
```

### Kind 30575: Split Payment Request

```json
{
  "kind": 30575,
  "pubkey": "<rider-hex-pubkey>",
  "content": "Splitting fare 3 ways",
  "tags": [
    ["d", "ride_abc123_split"],
    ["domain", "ridesharing"],
    ["ride_id", "ride_abc123"],
    ["rider_pubkey", "<rider-hex-pubkey>"],
    ["split_with", "<pubkey_2>"],
    ["split_with", "<pubkey_3>"],
    ["split_type", "equal"],
    ["total_amount", "1500"],
    ["per_person_amount", "500"],
    ["currency", "GBP"]
  ]
}
```

### Kind 30577: Favourite Driver

```json
{
  "kind": 30577,
  "pubkey": "<rider-hex-pubkey>",
  "content": "",
  "tags": [
    ["d", "<rider-hex-pubkey>_fav_<driver-hex-pubkey>"],
    ["domain", "ridesharing"],
    ["rider_pubkey", "<rider-hex-pubkey>"],
    ["driver_pubkey", "<driver-hex-pubkey>"],
    ["priority", "high"]
  ]
}
```

### Kind 30578: Driver Shift Start

```json
{
  "kind": 30578,
  "pubkey": "<driver-hex-pubkey>",
  "content": "",
  "tags": [
    ["d", "shift_20241031_am"],
    ["domain", "ridesharing"],
    ["driver_pubkey", "<driver-hex-pubkey>"],
    ["start_time", "1698735600"],
    ["planned_hours", "8"],
    ["service_area", "gcpv"],
    ["vehicle_type", "sedan"]
  ]
}
```

### Kind 30582: Driver Performance Metrics

```json
{
  "kind": 30582,
  "pubkey": "<operator-hex-pubkey>",
  "content": "",
  "tags": [
    ["d", "<driver-hex-pubkey>_metrics_weekly"],
    ["domain", "ridesharing"],
    ["driver_pubkey", "<driver-hex-pubkey>"],
    ["period", "2024-W44"],
    ["acceptance_rate", "0.92"],
    ["completion_rate", "0.98"],
    ["average_rating", "4.8"],
    ["total_rides", "47"],
    ["online_hours", "38.5"]
  ]
}
```

### Kind 30583: Route Suggestion

```json
{
  "kind": 30583,
  "pubkey": "<operator-hex-pubkey>",
  "content": "",
  "tags": [
    ["d", "ride_abc123_route"],
    ["domain", "ridesharing"],
    ["ride_id", "ride_abc123"],
    ["encoded_polyline", "<encoded_polyline_string>"],
    ["distance_metres", "8450"],
    ["duration_seconds", "1260"],
    ["waypoints", "51.5074,-0.1278;51.5100,-0.1350;51.5155,-0.1416"]
  ]
}
```

### Kind 30590: Surge Pricing Zone

```json
{
  "kind": 30590,
  "pubkey": "<operator-hex-pubkey>",
  "content": "",
  "tags": [
    ["d", "surge_gcpvj_1698765600"],
    ["domain", "ridesharing"],
    ["operator_pubkey", "<operator-hex-pubkey>"],
    ["geohash", "gcpvj"],
    ["multiplier", "1.8"],
    ["demand_level", "high"],
    ["active_drivers", "12"],
    ["pending_requests", "31"],
    ["valid_from", "1698765600"],
    ["valid_until", "1698769200"]
  ]
}
```

### Kind 30593: Ride History Summary

```json
{
  "kind": 30593,
  "pubkey": "<rider-hex-pubkey>",
  "content": "",
  "tags": [
    ["d", "<rider-hex-pubkey>_history_2024"],
    ["domain", "ridesharing"],
    ["rider_pubkey", "<rider-hex-pubkey>"],
    ["period", "2024"],
    ["total_rides", "156"],
    ["total_spent", "425000"],
    ["currency", "GBP"],
    ["average_fare", "2724"],
    ["total_distance_metres", "2340000"],
    ["favourite_destination", "51.5320,-0.1240"]
  ]
}
```

### Kind 30595: Background Check Verification

```json
{
  "kind": 30595,
  "pubkey": "<operator-hex-pubkey>",
  "content": "",
  "tags": [
    ["d", "<driver-hex-pubkey>_bgcheck"],
    ["domain", "ridesharing"],
    ["driver_pubkey", "<driver-hex-pubkey>"],
    ["provider", "checkr"],
    ["status", "clear"],
    ["checked_at", "1698000000"],
    ["valid_until", "1729536000"],
    ["criminal", "clear"],
    ["driving_record", "clear"]
  ]
}
```

### Kind 30598: Licence Verification

```json
{
  "kind": 30598,
  "pubkey": "<operator-hex-pubkey>",
  "content": "",
  "tags": [
    ["d", "<driver-hex-pubkey>_licence"],
    ["domain", "ridesharing"],
    ["driver_pubkey", "<driver-hex-pubkey>"],
    ["licence_class", "full"],
    ["issuing_authority", "DVLA"],
    ["verified_at", "1698000000"],
    ["valid_until", "1761264000"],
    ["endorsements", "none"]
  ]
}
```

---

## Ridesharing-Specific Tags

In addition to the core tags and aliases defined above, ridesharing events MAY use the following domain-specific tags:

| Tag | Description | Used In |
|-----|-------------|---------|
| `vehicle_type` | Vehicle category (sedan, SUV, van, bike) | 30500, 30501 |
| `vehicle_make` | Vehicle manufacturer | 30501 |
| `vehicle_model` | Vehicle model name | 30501 |
| `vehicle_colour` | Vehicle colour | 30501 |
| `vehicle_plate` | Registration plate | 30501 |
| `passenger_count` | Number of passengers | 30500, 30532 |
| `luggage` | Luggage size (none, small, medium, large) | 30500 |
| `quiet_ride` | Rider prefers silence | 30500, 30570 |
| `music` | Music preference (none, rider-choice) | 30570 |
| `temperature` | Temperature preference (cool, warm, neutral) | 30570 |
| `wheelchair_type` | Wheelchair type (manual, electric) | 30541 |
| `ramp_required` | Whether a ramp is needed | 30541 |
| `available_seats` | Seats available for carpool | 30533 |
| `surge_multiplier` | Current surge multiplier | 30590 |
| `wait_seconds` | Waiting time in seconds | 30514, 30515 |
| `charge_type` | Type of additional charge (toll, parking, cleanup) | 30516 |
| `pickup_time` | Scheduled pickup time (unix timestamp) | 30529 |
| `acceptance_rate` | Driver's acceptance rate | 30582 |
| `completion_rate` | Driver's completion rate | 30582 |
| `encoded_polyline` | Encoded route polyline | 30583 |
| `distance_metres` | Route distance in metres | 30583, 30593 |
| `duration_seconds` | Route duration in seconds | 30583 |

---

## Rating Criteria

The ridesharing domain defines the following rating criteria for kind 30517 (Driver Rating) and kind 30518 (Rider Rating) events:

### Driver Rating Criteria (published by rider)

| Criterion | Weight | Description |
|-----------|--------|-------------|
| `overall` | 0.4 | Overall ride quality |
| `punctuality` | 0.2 | Timeliness of arrival and route efficiency |
| `safety` | 0.2 | Driving safety and adherence to road rules |
| `courtesy` | 0.2 | Friendliness and professionalism |

### Rider Rating Criteria (published by driver)

| Criterion | Weight | Description |
|-----------|--------|-------------|
| `overall` | 0.4 | Overall rider behaviour |
| `punctuality` | 0.3 | Ready at pickup location on time |
| `courtesy` | 0.3 | Respectful behaviour during ride |

---

## Staking Model

Ridesharing uses the following default stake parameters:

| Parameter | Value |
|-----------|-------|
| Requester (rider) stake | 10% of estimated fare |
| Provider (driver) stake | 15% of estimated fare |
| Cancellation penalty | 80% of staked amount |
| No-show penalty | 100% of staked amount (automatic on `no_show` transition) |
| Minimum stake | Operator-configured (e.g. £1.00 / 500 sats) |
| Maximum stake | Operator-configured (e.g. £100.00 / 100,000 sats) |
| Free cancellation grace period | 300 seconds (5 minutes) |
| No-show waiting limit | 600 seconds (10 minutes) |

Operators MAY adjust these parameters within reasonable bounds for their market.

---

## Data Retention

Ridesharing operators SHOULD follow these default retention periods:

| Data Type | Retention | Reason |
|-----------|-----------|--------|
| Ride data (task records) | 90 days | Service quality, disputes |
| Location data (GPS traces) | 30 days | Privacy, GDPR compliance |
| Payment data | 7 years | Tax and legal compliance |

---

## Implementation Notes

### Minimum Viable Ridesharing Operator

To launch a basic ridesharing operator, implement at minimum:

**Core lifecycle**: 30500, 30501, 30506, 30507, 30508, 30512 (request, accept, cancel, start, end, status)
**Stakes**: 30502, 30509, 30520 (lock, commitment, release)
**Payments**: 30510, 30511, 30513 (streaming, confirmation, tip)
**Trust**: 30517, 30518, 30519 (driver rating, rider rating, reputation summary)
**Safety**: 30559 (emergency alert)
**Verification**: 30595, 30596 (background check, insurance)

**Total**: ~18 event kinds for MVP.

### Optional Feature Sets

Add these for feature parity with traditional ridesharing platforms:

- **Safety**: 30560-30564 (trip sharing, check-ins, harassment reports)
- **Financial**: 30514-30516 (wait time, no-show, additional charges)
- **UX**: 30570-30577 (preferences, lost & found, split payment, favourites)
- **Scheduling**: 30529 (scheduled rides)
- **Carpooling**: 30532-30535 (carpool requests, seat offers, matching, multi-leg)
- **Navigation**: 30583-30587 (routes, turn-by-turn, traffic, rerouting)
- **Surge**: 30590-30592 (pricing zones, history, demand heatmaps)
- **Driver management**: 30578-30582 (shifts, earnings, goals, performance)
- **Accessibility**: 30541, 30542, 30552, 30588, 30589
- **Verification**: 30595-30599 (background, insurance, inspection, licence, training)
- **History**: 30593, 30594 (ride history, tax reports)
- **Edge cases**: 30544, 30545, 30555-30558 (emergencies, breaks, destination changes)
- **Cross-operator**: 30505 (multi-operator coordination)

---

## See Also

- **[NIP-XX-core.md](NIP-XX-core.md)** — Domain-agnostic core protocol (this extension's parent)
- **[NIP-XX-stakes.md](NIP-XX-stakes.md)** — Commitment stakes (lock, release, forfeit, milestones)
- **[NIP-XX-payments.md](NIP-XX-payments.md)** — Streaming payments, tips, surcharges
- **[NIP-XX-reputation.md](NIP-XX-reputation.md)** — Ratings and reputation portability
- **[NIP-XX-safety.md](NIP-XX-safety.md)** — Emergency alerts, trip sharing, heartbeat
- **[NIP-XX-navigation.md](NIP-XX-navigation.md)** — Routes, turn-by-turn, traffic
- **[QUICK-REFERENCE.md](QUICK-REFERENCE.md)** — Summary table of all event kinds
- **[../ARCHITECTURE.md](../ARCHITECTURE.md)** — Federated operator model and decentralisation analysis
- **[../TRUST-MECHANISMS.md](../TRUST-MECHANISMS.md)** — Six layers of trust
- **[../docs/PAYMENT-PROVIDERS.md](../docs/PAYMENT-PROVIDERS.md)** — Payment provider integration guide

---

**Protocol Version**: v3.0 (Payment-Agnostic)
**Domain**: ridesharing
**Total Event Kinds**: 80 (30500-30599)
