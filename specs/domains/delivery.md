# TROTT Domain Profile: Delivery

`draft`

**Domain identifier:** `delivery`
**Coordination pattern:** Relay delivery
**Event kind range:** 30640-30659

## TROTT Specs Used

- TROTT-01: Core **Yes**
- TROTT-02: Discovery (geographic broadcast) **Yes**
- TROTT-03: Reputation **Yes**
- TROTT-04: Payments (simple quote, escrowed) **Yes**
- TROTT-05: Safety (disputes, damage claims) **Yes**
- TROTT-06: Coordination (recommended) **Yes**
- TROTT-07: Navigation (routing, ETA, live tracking) **Yes**

## Roles

- Requester: "Sender"
- Provider: "Courier"
- Third party: "Recipient" (may differ from sender; identified by `recipient_pubkey`)

## State Machine Extension

The delivery domain expands the TROTT-01 `in_progress` phase into four sub-states representing collection, transit, and handover:

```
accepted --> en_route_to_pickup --> collected --> in_transit --> delivered --> completed --> confirmed
                   |                                                            |
                   +--> no_show (sender absent)                                 +--> delivery_failed --> returned_to_sender
```

| Core state | Delivery state | Description |
|------------|---------------|-------------|
| `in_progress` (phase 1) | `en_route_to_pickup` | Courier travelling to collection point |
| `in_progress` (phase 2) | `collected` | Courier has the parcel; proof of collection captured |
| `in_progress` (phase 3) | `in_transit` | Courier transporting parcel to destination |
| `in_progress` (phase 4) | `delivered` | Courier at delivery address; handover pending |

Additional terminal states: `no_show`, `delivery_failed`, `returned_to_sender`.

## Domain-Specific Tags

| Tag | Description |
|-----|-------------|
| `package_size` | Size category: `small`, `medium`, `large`, `oversized` |
| `package_weight` | Weight in grams (integer) |
| `package_dimensions` | Dimensions in mm: `LxWxH` |
| `fragile` | Requires careful handling: `true`/`false` |
| `requires_signature` | Recipient must sign on delivery: `true`/`false` |
| `recipient_pubkey` | Nostr pubkey of the intended recipient |
| `proof_of_collection_photo` | SHA-256 hash of the collection photo |
| `proof_of_delivery_photo` | SHA-256 hash of the delivery photo |
| `delivery_instructions` | Special instructions (e.g. "leave with neighbour") |

## Rating Criteria

| Criterion | Weight |
|-----------|--------|
| `overall` | 0.30 |
| `punctuality` | 0.25 |
| `package_care` | 0.25 |
| `communication` | 0.20 |

## Pricing Model

**Distance + weight.** Base fee plus per-kilometre rate, multiplied by a weight tier factor. Optional surcharges for fragile items and signature-required deliveries. All amounts in smallest currency unit.

## Cancellation Policy

| Stage | Penalty |
|-------|---------|
| Before match | None |
| After match, before collection | 80% of staked amount |
| After collection, before delivery | Full stake forfeit for cancelling party |
| No-show (sender absent at collection) | 100% of sender stake (automatic) |
| Delivery failed (recipient unavailable) | No penalty; triggers re-delivery or return |

Default stakes: Sender 10% of delivery fee, Courier 15% of delivery fee. For high-value parcels, operator may require increased courier stake proportional to declared parcel value.

## PII Requirements

Collection address, delivery address, recipient name (encrypted). Transmitted via TROTT-06 PII Envelope. Both addresses encrypted via NIP-44; only geohash visible publicly. Retained for task duration plus 30 days.

## Safety Rules

- **Check-ins:** Not required for short-distance deliveries. Optional for long-distance (> 1 hour transit).
- **Route deviation:** Threshold of 1 km triggers alert to sender.

## Completion Proof

Dual proof system:
1. **Proof of collection** -- geotagged photo of parcel at collection, documenting condition (baseline for damage disputes).
2. **Proof of delivery** -- geotagged photo at delivery point plus digital signature from recipient (if `requires_signature` is `true`).

## Domain-Specific Event Kinds

| Kind | Name | Description |
|------|------|-------------|
| 30640 | Proof of Collection | Courier documents parcel condition at pickup |
| 30641 | Proof of Delivery | Photo and optional signature at delivery |
| 30642 | Condition Report | Parcel condition changed during transit (damage) |
| 30643 | Delivery Attempt Failed | Recipient unavailable; failed handover |
| 30644 | Re-delivery Scheduled | Operator schedules another delivery attempt |
| 30645 | Return to Sender | Parcel returned after failed delivery |
| 30646-30659 | *(Reserved)* | Future delivery extensions |

## Regulatory Context

Goods in transit are covered by the **Consumer Rights Act 2015**. The courier bears liability for loss or damage from collection to delivery. Operators should ensure couriers carry appropriate goods-in-transit insurance. No specific licensing is required for standard parcel delivery in the UK, though commercial vehicle drivers must comply with standard road transport regulations.
