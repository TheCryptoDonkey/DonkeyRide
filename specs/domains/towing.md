# TROTT Domain Profile: Towing

`draft`

**Domain identifier:** `towing`
**Coordination pattern:** Dispatch + Trip
**Event kind range:** 30660-30679

## TROTT Specs Used

- TROTT-01: Core **Yes**
- TROTT-02: Discovery (geographic broadcast) **Yes**
- TROTT-03: Reputation **Yes**
- TROTT-04: Payments (competitive quoting, escrowed) **Yes**
- TROTT-05: Safety (emergency signal, disputes) **Yes**
- TROTT-06: Coordination (recommended) **Yes**
- TROTT-07: Navigation (routing to breakdown, routing to garage) **Yes**

## Roles

- Requester: "Vehicle Owner"
- Provider: "Recovery Operator"

## State Machine Extension

The towing domain combines dispatch (travel to breakdown) and trip (transport vehicle to destination). The `in_progress` phase expands to include vehicle assessment and quote before loading:

```
accepted --> provider_en_route --> vehicle_assessed --> vehicle_loaded --> in_transit --> delivered --> confirmed
                |               |
                |               +--> cancelled (motorist declines quote; no penalty)
                +--> no_show (motorist absent)
```

| Core state | Towing state | Description |
|------------|-------------|-------------|
| `in_progress` (dispatch) | `provider_en_route` | Recovery operator is travelling to the breakdown location |
| `in_progress` (phase 1) | `vehicle_assessed` | Operator has inspected vehicle, determined recovery method, issued binding quote, and motorist has accepted |
| `in_progress` (phase 2) | `vehicle_loaded` | Vehicle is on the flatbed or hook |
| `in_progress` (phase 3) | `in_transit` | Vehicle being transported to destination |
| `in_progress` (phase 4) | `delivered` | Vehicle at destination garage/location |

Additional terminal state: `no_show` -- motorist not present at breakdown location.

## Domain-Specific Tags

| Tag | Description |
|-----|-------------|
| `vehicle_type` | Vehicle category: `car`, `van`, `motorcycle`, `hgv`, `bus` |
| `vehicle_make` | Manufacturer |
| `vehicle_model` | Model name |
| `vehicle_condition` | Condition: `driveable`, `non_driveable`, `accident_damage`, `immobilised` |
| `tow_type` | Recovery method: `flatbed`, `wheel_lift`, `dolly`, `roadside_repair` |
| `destination_type` | Where the vehicle is going: `garage`, `home`, `storage_yard`, `scrapyard` |
| `breakdown_type` | Classification: `engine`, `electrical`, `flat_tyre`, `fuel`, `accident`, `locked_out`, `other` |
| `requires_flatbed` | Whether a flatbed is required: `true`/`false` |
| `vehicle_weight_class` | Weight class: `under_3500kg`, `over_3500kg` |

## Rating Criteria

| Criterion | Weight |
|-----------|--------|
| `overall` | 0.25 |
| `response_time` | 0.25 |
| `professionalism` | 0.20 |
| `care_of_vehicle` | 0.20 |
| `pricing_fairness` | 0.10 |

## Pricing Model

**Flat rate with quote negotiation.** Initial estimate provided at dispatch based on reported breakdown. Recovery operator issues a binding quote after on-site vehicle assessment. Motorist accepts or declines before loading begins. Price factors: vehicle type and weight, flatbed requirement, towing distance to destination, and complications (e.g. vehicle in a ditch).

## Cancellation Policy

| Stage | Penalty |
|-------|---------|
| Before match | None |
| After match, before arrival | 80% of staked amount |
| Motorist declines on-site quote | None to motorist; operator forfeits travel-only stake |
| After vehicle loaded | Full stake forfeit for cancelling party |
| No-show (motorist absent) | 100% of motorist stake (automatic) |

Default stakes: Motorist 10% of estimate, Recovery Operator 15% of estimate. Stakes recalculated against confirmed `quoted_price` upon acceptance.

## PII Requirements

Breakdown location (precise roadside coordinates), destination garage address, vehicle registration plate. All encrypted via NIP-44. Registration plate is personally identifiable and must not appear in public tags. Retained for task duration plus 30 days.

## Safety Rules

- **Emergency signal:** Either party may trigger TROTT-05 Emergency Signal (roadside situations carry inherent risk, especially at night).
- **Check-ins:** Not required for standard recovery. Recommended for long-distance transport (> 30 minutes).
- **Route deviation:** Threshold of 2 km from the agreed destination route triggers alert to motorist.

## Completion Proof

**Photo required.** Photograph of the vehicle at the destination garage/location, proving successful delivery. GPS confirmation at both breakdown location and destination. Vehicle condition documented at pickup and delivery.

## Domain-Specific Event Kinds

| Kind | Name | Description |
|------|------|-------------|
| 30660 | Recovery Request | Motorist reports breakdown with vehicle metadata |
| 30661 | Recovery Quote | Binding quote after vehicle assessment |
| 30662 | Quote Acceptance | Motorist accepts or declines the recovery quote |
| 30663 | Vehicle Assessment | Formal confirmation of vehicle condition and recovery method |
| 30664 | Recovery Completion | Photo proof of vehicle at destination |
| 30665-30679 | *(Reserved)* | Future towing extensions |

## Regulatory Context

Vehicle recovery under 3.5 tonnes does not require a specific licence in the UK beyond a valid driving licence and appropriate insurance. Recovery of vehicles exceeding **3.5 tonnes** requires an **Operator's Licence** issued by the **Traffic Commissioner**. Operators must verify that recovery operators hold the appropriate licence category. The Institute of Vehicle Recovery (IVR) is a voluntary industry body. Many other jurisdictions regulate towing more strictly, including maximum fee schedules and mandatory licensing.
