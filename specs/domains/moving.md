# TROTT Domain Profile: Moving

`draft`

**Domain identifier:** `moving`
**Coordination pattern:** Crew / multi-provider
**Event kind range:** 30760-30779

## TROTT Specs Used

- TROTT-01: Core (multi-provider support) **Yes**
- TROTT-02: Discovery (geographic broadcast + category search) **Yes**
- TROTT-03: Reputation **Yes**
- TROTT-04: Payments (milestone payments, split payments across crew) **Yes**
- TROTT-05: Safety (disputes -- damage claims) **Yes**
- TROTT-06: Coordination (recommended -- both addresses as PII, crew management) **Yes**
- TROTT-07: Navigation (routing between addresses, ETA) **Yes**

## Roles

- Requester: "Client"
- Provider: "Mover" (multiple -- crew of 2-6)

## State Machine Extension

The moving domain uses a crew-based pattern with milestone stages for loading, transit, and unloading:

```
accepted --> crew_assembled --> loading --> in_transit --> unloading --> completed --> confirmed
                                  |            |             |
                                  |            |             +--> damage_reported (triggers dispute)
                                  |            |
                                  |            +--> in_transit (milestone: loading complete)
                                  |
                                  +--> loading (all crew confirmed and on site)
```

| Core state | Moving state | Description |
|------------|-------------|-------------|
| `accepted` (sub-phase) | `crew_assembled` | All movers confirmed; crew on site at origin address |
| `in_progress` (phase 1) | `loading` | Furniture and belongings being loaded onto vehicle |
| `in_progress` (phase 2) | `in_transit` | Vehicle(s) moving from origin to destination |
| `in_progress` (phase 3) | `unloading` | Furniture and belongings being placed in new property |
| `completed` | `completed` | All items delivered and placed; client inspects |

Multi-provider: each mover has their own acceptance event referencing the same task `d` tag. The task proceeds to `crew_assembled` once all required movers have confirmed.

## Domain-Specific Tags

| Tag | Description |
|-----|-------------|
| `property_type` | Origin property: `flat`, `house`, `office`, `storage_unit` |
| `floors` | Number of floors at origin and destination: `origin:2,destination:0` |
| `lift_available` | Lift access: `origin:false,destination:true` |
| `inventory_items` | Estimated number of items or volume description |
| `vehicle_required` | Vehicle type: `transit_van`, `luton_van`, `7.5t_lorry`, `articulated` |
| `crew_size` | Number of movers required: `2`, `3`, `4`, `5`, `6` |
| `packing_required` | Client needs packing service: `true`/`false` |
| `disassembly_required` | Furniture needs disassembly/reassembly: `true`/`false` |
| `fragile_items` | High-value or fragile items present: `true`/`false` |
| `parking_arranged` | Parking confirmed at both ends: `origin:true,destination:false` |

## Rating Criteria

| Criterion | Weight |
|-----------|--------|
| `overall` | 0.25 |
| `care_of_belongings` | 0.25 |
| `efficiency` | 0.20 |
| `punctuality` | 0.15 |
| `communication` | 0.15 |

## Pricing Model

**Milestone with split payments across crew.** Three milestones map to the physical stages:

1. **Loading** -- payment released when loading is complete
2. **Transit** -- payment released on arrival at destination
3. **Unloading** -- payment released when all items are placed

Each milestone amount is split across crew members via TROTT-04 Split Payments (30531 with `payment_type=split`). The lead mover may receive a larger share. Example for a 3-person crew, GBP 1,300 total:

- Loading milestone: 500 (split 200/150/150)
- Transit milestone: 300 (split 120/90/90)
- Unloading milestone: 500 (split 200/150/150)

## Cancellation Policy

| Stage | Penalty |
|-------|---------|
| Before match | None |
| More than 48 hours before scheduled date | None |
| Within 48 hours of scheduled date | 50% of staked amount |
| Within 24 hours of scheduled date | 80% of staked amount |
| On the day / after crew assembled | Full stake forfeit |

Default stakes: Client 10% of total move cost, each Mover 10% of their individual share. Longer cancellation notice period reflects the difficulty of rebooking a full crew at short notice.

## PII Requirements

**Both addresses** (origin and destination) -- these are the client's current and future home addresses. Access details for both properties (buzzer codes, parking permits, key collection). All encrypted via NIP-44. This is among the most PII-sensitive domains -- two home addresses plus timing reveals when the origin property will be empty. Retained for task duration plus 30 days.

## Safety Rules

- **Check-ins:** Not required. Crew works together, providing inherent mutual safety.
- **Route deviation:** Threshold of 2 km from the planned route triggers alert to client (van contains all their belongings).
- **Inventory documentation:** Recommended before loading for damage dispute resolution.

## Completion Proof

**Milestone-based proof.** Photo of loaded vehicle (loading complete). GPS confirmation of arrival at destination. Client walk-through and inspection confirms items delivered and placed. Client signs off each milestone via TROTT-01 Task Confirm or raises a TROTT-05 Dispute Claim for any damage.

## Domain-Specific Event Kinds

| Kind | Name | Description |
|------|------|-------------|
| 30760 | Moving Request | Booking with property details, floors, inventory, crew size |
| 30761 | Crew Assembly | Tracks which movers have confirmed for the job |
| 30762 | Inventory List | Documented list of items being moved (dispute evidence) |
| 30763 | Loading Complete | Milestone event with photo proof of loaded vehicle |
| 30764 | Unloading Complete | Milestone event confirming all items placed |
| 30765 | Damage Report | Item damage documented with photos during move |
| 30766-30779 | *(Reserved)* | Future moving extensions |

## Regulatory Context

House removals are **largely unregulated in the UK**. No specific licensing is required for domestic removals. Commercial vehicle drivers must hold the appropriate licence category (Cat C for vehicles over 3.5 tonnes). Operators should verify that movers carry appropriate goods-in-transit insurance and public liability insurance. The **British Association of Removers (BAR)** is a voluntary trade body offering accreditation and an Alternative Dispute Resolution scheme. International removals may require additional customs and shipping documentation.
