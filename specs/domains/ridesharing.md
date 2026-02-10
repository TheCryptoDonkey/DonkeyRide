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
| `overall` | 0.4 |
| `punctuality` | 0.2 |
| `safety` | 0.2 |
| `courtesy` | 0.2 |

**Rider rated by Driver:**

| Criterion | Weight |
|-----------|--------|
| `overall` | 0.4 |
| `punctuality` | 0.3 |
| `courtesy` | 0.3 |

## Pricing Model

**Distance + time + surge.** Fare = `base_fare + (distance_metres x per_metre_rate) + (duration_seconds x per_second_rate)`. Final fare multiplied by `surge_multiplier` when demand exceeds supply. All amounts in smallest currency unit.

## Cancellation Policy

| Stage | Penalty |
|-------|---------|
| Before match | None |
| Within 5 minutes of match (grace period) | None |
| After grace period, before pickup | 80% of staked amount |
| No-show (rider absent after 10 minutes) | 100% of rider stake (automatic) |

Default stakes: Rider 10% of estimated fare, Driver 15% of estimated fare.

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
| 30606 | Carpool Request | Rider willing to share a ride |
| 30607 | Carpool Seat Offer | Driver advertising available seats on a route |
| 30608 | Split Payment Request | Rider requests fare split among multiple pubkeys |
| 30609 | Ride Preferences | Rider's standing preferences (music, temperature, quiet) |
| 30610-30619 | *(Reserved)* | Future ridesharing extensions |

## Regulatory Context

Private hire vehicle licensing in the UK is governed by the **Private Hire Vehicles (London) Act 1998** (London) and the **Local Government (Miscellaneous Provisions) Act 1976** (rest of England and Wales). Drivers require a private hire driver licence and vehicles require a private hire vehicle licence from the relevant local authority. Operators coordinating bookings require a private hire operator licence. Insurance must cover hire and reward use.
