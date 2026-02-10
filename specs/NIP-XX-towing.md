# NIP-XX-towing: Vehicle Recovery & Towing Domain Extension

`draft` `optional`

**Extends**: NIP-XX-core (Decentralised Service Coordination Protocol)
**Domain Identifier**: `towing`
**Allocated Kind Range**: 30640-30659
**Reference Implementation**: `src/domain-profiles/towing.js`

---

## Abstract

This document defines the **vehicle recovery and towing** domain extension to NIP-XX-core. It specifies role aliases, an extended state machine with a vehicle assessment phase, domain-specific tags for vehicle metadata and breakdown classification, pricing semantics, and rating criteria for coordinating roadside recovery over the Nostr protocol with payment-agnostic financial rails.

The towing domain shares structural similarities with locksmith dispatch — a motorist in a vulnerable, often roadside situation requests urgent assistance from a specialist. The critical difference is the involvement of a vehicle that must be physically transported, introducing requirements around vehicle type assessment, flatbed availability, and destination garage coordination. As with locksmith callouts, the UK towing industry suffers from opportunistic pricing — stranded motorists are quoted one figure over the telephone and charged substantially more once the vehicle is on the hook. Commitment stakes directly address this by requiring the recovery operator to lock funds against the quoted price before work begins.

## Regulatory Context

**Vehicle recovery operators in the United Kingdom are partially regulated.** Standard recovery of vehicles under 3.5 tonnes does not require a specific licence beyond a valid driving licence and appropriate insurance. However, recovery of vehicles exceeding 3.5 tonnes requires an **Operator's Licence** issued by the **Traffic Commissioner**. Operators MUST verify that their recovery operators hold the appropriate licence category for the vehicles they recover.

There is no SIA (Security Industry Authority) requirement for standard vehicle recovery. Voluntary industry bodies exist (e.g., the Institute of Vehicle Recovery) but membership is not required by law.

Operators in other jurisdictions MUST verify local licensing requirements. Many countries and states regulate towing more strictly than the UK, including maximum fee schedules and mandatory licensing.

---

## Currency-Neutral Amounts

All monetary amounts in towing events are **currency-neutral**. The `amount` value is always in the smallest unit of the specified currency (pence for GBP, cents for USD, satoshis for SAT). Every event with a monetary value MUST include `currency` and `trust_model` tags. See [NIP-XX-payments.md](NIP-XX-payments.md) and [NIP-XX-stakes.md](NIP-XX-stakes.md).

---

## Terminology

| Generic Term (NIP-XX-core) | Towing Domain Alias | Description |
|----------------------------|---------------------|-------------|
| Requester | **Motorist** | The person whose vehicle has broken down or requires recovery |
| Provider | **Recovery Operator** | The tradesperson performing the vehicle recovery |
| Task | **Callout** | A single vehicle recovery dispatch and transport job |
| Operator | Operator | The relay/server coordinating callouts (unchanged) |

Implementations SHOULD accept both the generic terms (`requester_pubkey`, `provider_pubkey`) and the domain-specific aliases (`motorist_pubkey`, `recovery_operator_pubkey`). The `domain` tag MUST be set to `"towing"` on all events.

```json
["domain", "towing"]
```

---

## Discovery Method

**Method**: `geohash`

Recovery operator discovery uses the same geohash-based spatial indexing as ridesharing. Motorists broadcast their breakdown location (geohash-encoded) and available recovery operators within the relevant geohash tiles are notified.

```json
["geohash", "gcpvj0"]
```

---

## Pricing Model

**Model**: `flatRate` with `quoteNegotiation` enabled

Unlike ridesharing (distance-based metering), vehicle recovery is priced as a flat rate per job. However, the final price depends on several factors that often cannot be fully determined until the recovery operator arrives and assesses the vehicle: the vehicle type and weight, whether a flatbed is required, the towing distance to the destination garage, and any additional complications (e.g., vehicle in a ditch, wheels locked, accident damage).

### Quote Negotiation Flow

1. **Initial estimate** — Motorist describes the breakdown; operator provides a rough estimate range based on reported vehicle type and breakdown description
2. **Assessment on arrival** — Recovery operator arrives, inspects the vehicle, and determines the recovery method required
3. **Formal quote issued** — Recovery operator publishes a quote event with the confirmed price, recovery method, and destination
4. **Motorist accepts or declines** — Motorist reviews the quote; if declined, no penalty applies (recovery operator forfeits their travel-only stake)
5. **Recovery proceeds** — Upon acceptance, stakes are adjusted to the quoted price and recovery begins

This flow protects motorists from the exploitative pricing that is commonplace when a vehicle is already on the hook or loaded.

```json
{
  "pricing_model": "flatRate",
  "quote_negotiation": true,
  "initial_estimate": 15000,
  "estimate_range": {
    "min": 8000,
    "max": 35000
  },
  "currency": "GBP"
}
```

---

## State Machine

The towing domain extends the NIP-XX-core state machine by inserting two additional states between `provider_arrived` and `completed`: **`vehicle_assessed`** and **`recovery_active`**. A final state **`recovered`** replaces the generic `completed` to indicate the vehicle has been successfully delivered to the destination.

```
breakdown_reported ──> operator_matched ──> en_route ──> arrived
       │                    │                 │            │
       │                    │                 │            v
       │                    │                 │     vehicle_assessed
       │                    │                 │            │
       │                    │                 │            v
       │                    │                 │     recovery_active
       │                    │                 │            │
       │                    │                 │            v
       │                    │                 │        recovered
       │                    │                 │
       └────────────────────┴─────────────────┴──── cancelled
                   (from any non-terminal state)

Terminal states: recovered, cancelled, no_show.
no_show: motorist not present when recovery operator arrives (triggers automatic stake forfeiture).
```

### State Definitions

| Core State | Towing State | Description |
|------------|-------------|-------------|
| `requested` | `breakdown_reported` | Motorist has reported a breakdown or recovery need |
| `matched` | `operator_matched` | A recovery operator has accepted the callout |
| `provider_en_route` | `en_route` | Recovery operator is travelling to the breakdown location |
| `provider_arrived` | `arrived` | Recovery operator has arrived and is assessing the situation |
| *(extension)* | `vehicle_assessed` | Recovery operator has assessed the vehicle, determined the recovery method, and issued a formal quote; motorist has accepted |
| *(extension)* | `recovery_active` | Vehicle is being loaded/towed and transported to the destination |
| `completed` | `recovered` | Vehicle has been successfully delivered to the destination garage or specified location |
| `cancelled` | `cancelled` | Callout was cancelled (valid from any non-terminal state) |

### State Transitions

| From | To | Trigger |
|------|----|---------|
| `breakdown_reported` | `operator_matched` | Recovery operator accepts the callout |
| `breakdown_reported` | `cancelled` | Motorist cancels before match |
| `operator_matched` | `en_route` | Recovery operator begins travel |
| `operator_matched` | `cancelled` | Either party cancels |
| `en_route` | `arrived` | Recovery operator GPS confirms arrival |
| `en_route` | `cancelled` | Either party cancels |
| `arrived` | `vehicle_assessed` | Recovery operator issues quote; motorist accepts |
| `arrived` | `no_show` | Motorist not present within waiting limit |
| `arrived` | `cancelled` | Motorist declines quote or either party cancels |
| `vehicle_assessed` | `recovery_active` | Recovery operator begins loading/towing the vehicle |
| `vehicle_assessed` | `cancelled` | Either party cancels (stake penalties may apply) |
| `recovery_active` | `recovered` | Vehicle delivered to destination; photo proof submitted |
| `recovery_active` | `cancelled` | Exceptional cancellation (dispute likely) |

---

## Domain-Specific Tags

The following tags are specific to the towing domain and SHOULD be included on relevant events.

| Tag | Required | Description | Example Values |
|-----|----------|-------------|----------------|
| `vehicle_make` | RECOMMENDED | Manufacturer of the vehicle | `Ford`, `BMW`, `Toyota`, `Vauxhall` |
| `vehicle_model` | RECOMMENDED | Model of the vehicle | `Focus`, `3 Series`, `Corolla`, `Astra` |
| `vehicle_year` | OPTIONAL | Year of manufacture | `2019`, `2022` |
| `vehicle_colour` | RECOMMENDED | Colour of the vehicle (aids identification at roadside) | `blue`, `silver`, `black`, `red` |
| `vehicle_plate` | RECOMMENDED | Registration plate / licence plate number | `AB12 CDE` |
| `breakdown_type` | RECOMMENDED | Classification of the breakdown | `flat_tyre`, `engine`, `electrical`, `accident`, `fuel`, `locked_out`, `other` |
| `requires_flatbed` | After assessment | Whether a flatbed transporter is required | `true`, `false` |
| `destination_garage` | After assessment | Name or address of the destination garage | `Smith's Garage, 12 High Street` |

### Tag Examples

**On a callout request (kind 30500):**

```json
{
  "kind": 30500,
  "tags": [
    ["domain", "towing"],
    ["d", "callout_tow_abc123"],
    ["geohash", "gcpvj0"],
    ["vehicle_make", "Ford"],
    ["vehicle_model", "Focus"],
    ["vehicle_year", "2021"],
    ["vehicle_colour", "blue"],
    ["vehicle_plate", "AB12 CDE"],
    ["breakdown_type", "engine"],
    ["description", "Engine warning light and loss of power on A38. Vehicle on hard shoulder."],
    ["motorist_pubkey", "abc123..."]
  ],
  "content": ""
}
```

**On a vehicle assessment confirmation (kind 30643):**

```json
{
  "kind": 30643,
  "tags": [
    ["domain", "towing"],
    ["d", "callout_tow_abc123"],
    ["requires_flatbed", "true"],
    ["destination_garage", "Smith's Garage, 12 High Street, Exeter"],
    ["recovery_method", "flatbed"],
    ["tow_distance_km", "15"],
    ["vehicle_weight_class", "under_3500kg"]
  ],
  "content": "Engine seized — vehicle cannot be towed on wheels. Flatbed required. Nearest garage with Ford diagnostics is Smith's in Exeter."
}
```

---

## Rating Criteria

After a callout is completed, both parties publish rating events (kind 30530) with domain-specific criteria.

| Criterion Tag | Label | Weight | Description |
|---------------|-------|--------|-------------|
| `overall` | Overall | 0.25 | General satisfaction with the recovery service |
| `response_time` | Response Time | 0.25 | Arrived within estimated time window |
| `professionalism` | Professionalism | 0.20 | Communication, behaviour, and conduct throughout |
| `care_of_vehicle` | Care of Vehicle | 0.20 | Vehicle handled carefully; no additional damage during recovery |
| `pricing_fairness` | Pricing Fairness | 0.10 | Final price was fair relative to the quote and market rate |

### Rating Event Example

```json
{
  "kind": 30530,
  "tags": [
    ["domain", "towing"],
    ["task_id", "callout_tow_abc123"],
    ["rated_pubkey", "recovery_operator_pubkey_xyz"],
    ["overall", "5"],
    ["response_time", "4"],
    ["professionalism", "5"],
    ["care_of_vehicle", "5"],
    ["pricing_fairness", "4"]
  ],
  "content": "Excellent service. Arrived within 30 minutes, loaded the car carefully onto the flatbed, and delivered it to the garage without a scratch. Price was as quoted."
}
```

---

## Towing-Specific Event Kinds (30640-30659)

The following kind range is reserved for towing-domain-specific events. Core protocol kinds (30500-30599) are shared across all domains.

| Kind | Name | Status | Replaceable | Publisher |
|------|------|--------|-------------|-----------|
| 30640 | Recovery Request | Draft | Yes (NIP-33) | Motorist |
| 30641 | Recovery Quote | Draft | Yes (NIP-33) | Recovery Operator |
| 30642 | Quote Acceptance | Draft | No (append-only) | Motorist |
| 30643 | Vehicle Assessment Confirmation | Draft | Yes (NIP-33) | Recovery Operator |
| 30644 | *(Reserved)* | — | — | — |
| 30645 | Recovery Completion | Draft | Yes (NIP-33) | Recovery Operator |
| 30646-30659 | *(Reserved for future use)* | — | — | — |

### Kind 30640: Recovery Request Event

Published by the motorist to request vehicle recovery. Extends core kind 30500 with towing-specific vehicle metadata and breakdown classification. Operators MAY choose to use either kind 30500 with a `domain: towing` tag or this dedicated kind.

```json
{
  "kind": 30640,
  "tags": [
    ["domain", "towing"],
    ["d", "callout_tow_abc123"],
    ["geohash", "gcpvj0"],
    ["vehicle_make", "Vauxhall"],
    ["vehicle_model", "Astra"],
    ["vehicle_year", "2019"],
    ["vehicle_colour", "silver"],
    ["vehicle_plate", "YZ67 FGH"],
    ["breakdown_type", "engine"],
    ["description", "Engine overheating, steam from bonnet. Pulled over on B3212."],
    ["motorist_pubkey", "abc123..."],
    ["expiration", "1698769032"]
  ],
  "content": ""
}
```

### Kind 30641: Recovery Quote Event

Published by the recovery operator after arriving and assessing the vehicle. Contains the confirmed recovery method, whether a flatbed is required, the destination, and a binding price quote.

```json
{
  "kind": 30641,
  "tags": [
    ["domain", "towing"],
    ["d", "callout_tow_abc123"],
    ["e", "<original_request_event_id>"],
    ["requires_flatbed", "true"],
    ["recovery_method", "flatbed"],
    ["destination_garage", "Smith's Garage, 12 High Street, Exeter"],
    ["tow_distance_km", "15"],
    ["quoted_price", "18000"],
    ["currency", "GBP"],
    ["trust_model", "custodial-third-party"],
    ["vehicle_weight_class", "under_3500kg"],
    ["estimate_minutes", "45"],
    ["valid_for_seconds", "600"]
  ],
  "content": "Engine has seized — cannot be towed on wheels. Flatbed to Smith's Garage in Exeter (15 km). Price includes loading, transport, and unloading."
}
```

**Semantics:**
- `quoted_price` is the total binding price in the smallest unit of the operator's currency
- `valid_for_seconds` indicates how long the quote remains valid (default: 600 seconds / 10 minutes)
- The recovery operator's stake is adjusted to cover the quoted price upon acceptance
- If the motorist declines, the callout transitions to `cancelled` with no penalty to the motorist

### Kind 30642: Quote Acceptance Event

Published by the motorist to accept or decline a recovery quote.

```json
{
  "kind": 30642,
  "tags": [
    ["domain", "towing"],
    ["e", "<quote_event_id>"],
    ["d", "callout_tow_abc123"],
    ["accepted", "true"],
    ["quoted_price", "18000"],
    ["currency", "GBP"]
  ],
  "content": ""
}
```

### Kind 30643: Vehicle Assessment Confirmation Event

Published by the recovery operator to formally confirm the vehicle assessment and recovery method, triggering the `vehicle_assessed` state transition.

```json
{
  "kind": 30643,
  "tags": [
    ["domain", "towing"],
    ["d", "callout_tow_abc123"],
    ["e", "<quote_acceptance_event_id>"],
    ["requires_flatbed", "true"],
    ["recovery_method", "flatbed"],
    ["vehicle_weight_class", "under_3500kg"],
    ["status", "vehicle_assessed"]
  ],
  "content": "Vehicle confirmed as non-driveable. Loading onto flatbed now. Estimated 45 minutes to destination."
}
```

### Kind 30645: Recovery Completion Event

Published by the recovery operator upon successful delivery of the vehicle to the destination. Includes photo proof of the vehicle at the destination location.

```json
{
  "kind": 30645,
  "tags": [
    ["domain", "towing"],
    ["d", "callout_tow_abc123"],
    ["e", "<assessment_event_id>"],
    ["destination_garage", "Smith's Garage, 12 High Street, Exeter"],
    ["proof_type", "photo"],
    ["proof_hash", "<sha256_of_photo>"],
    ["vehicle_condition", "no_additional_damage"],
    ["status", "recovered"]
  ],
  "content": "Vehicle delivered to Smith's Garage. Photo attached showing vehicle safely unloaded in forecourt. No additional damage."
}
```

**Semantics:**
- `proof_type` MUST be `photo` — a photograph of the vehicle at the destination is required for completion
- `proof_hash` is the SHA-256 hash of the proof image, providing tamper evidence
- `vehicle_condition` documents the state of the vehicle upon delivery (e.g., `no_additional_damage`, `pre_existing_damage_documented`)

---

## Staking Model

The towing domain uses asymmetric staking to protect vulnerable motorists:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Requester (motorist) stake | 10% of estimate | Lower stake — motorist is stranded and vulnerable |
| Provider (recovery operator) stake | 15% of estimate | Higher stake — deters bait-and-switch pricing once vehicle is loaded |
| Penalty on cancellation | 80% of stake | Strong deterrent against no-shows and abandonment |

Stakes are initially based on the estimate range. Upon quote acceptance (kind 30642), stakes are recalculated against the confirmed `quoted_price`.

---

## Completion Proof

Towing callouts use the following proof types:

| Proof Type | Description |
|------------|-------------|
| `gps_arrival` | GPS coordinates confirming the recovery operator arrived at the breakdown location |
| `photo` | **Required.** Photograph of the vehicle at the destination garage/location, proving successful delivery |
| `gps_destination` | GPS coordinates confirming the vehicle was delivered to the stated destination |

Photo proof is **required** for towing completion, as the vehicle changes custody and location. The photograph MUST show the vehicle at the destination and serves as evidence in the event of a dispute regarding delivery or vehicle condition.

---

## Dispute Evidence Types

| Evidence Type | Description |
|---------------|-------------|
| `text` | Written description of the dispute |
| `photo` | Photographic evidence (e.g., vehicle damage, incorrect destination, vehicle condition before/after) |
| `gps_trace` | GPS trace showing the recovery operator's route from breakdown to destination |
| `price_quote` | The original quote event, proving the agreed price |
| `vehicle_condition` | Before and after photographs documenting vehicle condition |

---

## Relationship to Core Protocol

The towing domain uses all core NIP-XX event kinds for task lifecycle management, staking, payments, disputes, and reputation. The domain-specific kinds (30640-30659) extend the core protocol with towing-specific semantics — principally around vehicle assessment, quote negotiation, and delivery confirmation with photo proof.

### Shared Core Kinds Used

| Kind | Name | Usage in Towing Domain |
|------|------|------------------------|
| 30500 | Service Request | Motorist reports breakdown / requests recovery |
| 30501 | Service Acceptance | Recovery operator accepts the callout |
| 30502 | Stake Lock | Operator locks commitment stakes |
| 30510 | Streaming Payment | Not typically used (flat rate, not streaming) |
| 30511 | Payment Confirmation | Final payment confirmation after recovery complete |
| 30512 | Status Update | State transitions during the callout |
| 30513 | Provider Tip | Motorist tips the recovery operator |
| 30520 | Stake Release | Operator releases stakes upon completion |
| 30522 | Dispute Filing | Either party files a dispute |
| 30524 | Dispute Resolution | Arbiter resolves the dispute |
| 30530 | Reputation Rating | Post-callout rating with towing-specific criteria |

---

## Security Considerations

1. **Location privacy** — Breakdown reports reveal the motorist's precise roadside location. Implementations SHOULD use NIP-17 gift wrap or NIP-44 encryption for the precise location, with only the geohash visible publicly.
2. **Vulnerability exploitation** — Motorists stranded at the roadside are in an extremely vulnerable position, particularly at night or in remote areas. The quote negotiation flow with commitment stakes is specifically designed to prevent exploitation.
3. **Vehicle custody** — Recovery operators take physical custody of the motorist's vehicle. The photo proof requirement at destination provides evidence of safe delivery. Operators SHOULD consider identity verification requirements for recovery operators.
4. **Registration plate privacy** — Vehicle registration plates are personally identifiable. The `vehicle_plate` tag SHOULD be transmitted via NIP-44 encrypted content, not in public tags.

---

## Future Work

- **Roadside repair events** — Dedicated event kinds for breakdowns that can be repaired on-site without towing (e.g., flat tyre change, jump start, fuel delivery)
- **Multi-vehicle recovery** — Support for incidents involving multiple vehicles (e.g., road traffic accidents)
- **Heavy vehicle extension** — Extended tags and licensing verification for vehicles over 3.5 tonnes requiring an Operator's Licence
- **Insurance integration** — Integration with motor breakdown cover providers (e.g., AA, RAC, Green Flag) for direct settlement
- **Storage yard tracking** — Event kinds for vehicles taken to storage yards rather than garages, with daily storage fee tracking
- **Accident recovery** — Extended state machine for accident scenes involving police, insurance, and third-party coordination
- **IVR verification** — Optional Institute of Vehicle Recovery membership credential verification via NIP-XX-core verification kinds

---

## See Also

- **[NIP-XX-core.md](NIP-XX-core.md)** — Domain-agnostic core protocol (this extension's parent)
- **[NIP-XX-stakes.md](NIP-XX-stakes.md)** — Commitment stakes (lock, release, forfeit)
- **[NIP-XX-payments.md](NIP-XX-payments.md)** — Payment events and streaming models
- **[NIP-XX-reputation.md](NIP-XX-reputation.md)** — Ratings and reputation portability
- **[QUICK-REFERENCE.md](QUICK-REFERENCE.md)** — Summary table of all event kinds
- **[../docs/PAYMENT-PROVIDERS.md](../docs/PAYMENT-PROVIDERS.md)** — Payment provider integration guide
- **Reference implementation**: `src/domain-profiles/towing.js`
- **Institute of Vehicle Recovery**: https://www.theivrgroup.com/ (voluntary industry body)
- **Traffic Commissioner**: https://www.gov.uk/traffic-commissioners (licensing for vehicles over 3.5 tonnes)
