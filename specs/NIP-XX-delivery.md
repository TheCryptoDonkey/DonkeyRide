# NIP-XX-delivery: Parcel Delivery Domain Extension

`draft` `optional`

**Extends**: NIP-XX-core (Decentralised Service Coordination Protocol)
**Domain Identifier**: `delivery`
**Allocated Kind Range**: 30620-30639
**Shared Kinds from Original Spec**: 30546-30548
**Reference Implementation**: `src/domain-profiles/delivery.js`

---

## Abstract

This document defines the **parcel delivery** domain extension to NIP-XX-core. It specifies role aliases, an extended state machine with collection and transit states, domain-specific tags for package metadata, dual proof-of-completion mechanisms (photo + signature), and rating criteria tailored to courier services.

Parcel delivery is structurally near-identical to ridesharing — pick up at location A, transport to location B, track in real-time — with the passenger replaced by a parcel. The key differences are: parcels cannot consent to being picked up (requiring proof of collection), parcels can be damaged (requiring condition documentation), and delivery often involves a third party (the recipient) who is distinct from the sender.

---

## Terminology

| Generic Term (NIP-XX-core) | Delivery Domain Alias | Description |
|----------------------------|----------------------|-------------|
| Requester | **Sender** | The person dispatching the parcel |
| Provider | **Courier** | The person transporting the parcel |
| Task | **Delivery** | A single parcel collection and delivery job |
| Operator | Operator | The relay/server coordinating deliveries (unchanged) |

Implementations SHOULD accept both the generic terms (`requester_pubkey`, `provider_pubkey`) and the domain-specific aliases (`sender_pubkey`, `courier_pubkey`). The `domain` tag MUST be set to `"delivery"` on all events.

```json
["domain", "delivery"]
```

---

## Discovery Method

**Method**: `geohash`

Courier discovery uses the same geohash-based spatial indexing as ridesharing. Senders broadcast their collection location (geohash-encoded) and available couriers within the relevant geohash tiles are notified.

```json
["geohash", "gcpvj0"]
```

---

## Pricing Model

**Model**: `distance` + `weight`

Delivery pricing is calculated from two primary factors: the distance between collection and delivery points, and the weight of the parcel. Operators MAY also factor in dimensions, fragility surcharges, and urgency premiums.

```json
{
  "pricing_model": "distance_weight",
  "base_fee_sats": 5000,
  "per_km_sats": 1500,
  "weight_tiers": [
    { "max_grams": 1000, "multiplier": 1.0 },
    { "max_grams": 5000, "multiplier": 1.5 },
    { "max_grams": 15000, "multiplier": 2.0 },
    { "max_grams": 30000, "multiplier": 3.0 }
  ],
  "fragile_surcharge_percent": 20,
  "signature_required_surcharge_sats": 2000,
  "currency_display": "GBP"
}
```

### Price Calculation Example

A 3 kg parcel travelling 8 km:
- Base fee: 5,000 sats
- Distance: 8 km x 1,500 sats = 12,000 sats
- Weight multiplier (1-5 kg tier): x 1.5
- Total: (5,000 + 12,000) x 1.5 = **25,500 sats**

---

## State Machine

The delivery domain extends the NIP-XX-core state machine by inserting three additional states: **`collected`** (courier has the parcel), **`in_transit`** (courier is moving to the destination), and **`arrived_at_delivery`** (courier is at the dropoff, awaiting handover).

```
requested ──> matched ──> courier_en_route ──> courier_arrived ──> collected
     │            │              │                    │                │
     │            │              │                    │                v
     │            │              │                    │           in_transit
     │            │              │                    │                │
     │            │              │                    │                v
     │            │              │                    │       arrived_at_delivery
     │            │              │                    │                │
     │            │              │                    │                v
     │            │              │                    │           completed
     │            │              │                    │
     └────────────┴──────────────┴────────────────────┴──── cancelled
                        (from any non-terminal state)
```

### State Definitions

| Core State | Delivery State | Description |
|------------|---------------|-------------|
| `requested` | `requested` | Sender has submitted a delivery request with package details |
| `matched` | `matched` | A courier has accepted the delivery |
| `provider_en_route` | `courier_en_route` | Courier is travelling to the collection point |
| `provider_arrived` | `courier_arrived` | Courier has arrived at the collection point |
| *(extension)* | `collected` | Courier has collected the parcel; proof of collection captured |
| *(extension)* | `in_transit` | Courier is transporting the parcel to the destination |
| *(extension)* | `arrived_at_delivery` | Courier has arrived at the delivery address; awaiting handover |
| `completed` | `completed` | Parcel has been delivered; proof of delivery captured |
| `cancelled` | `cancelled` | Delivery was cancelled (valid from any non-terminal state) |

### State Transitions

| From | To | Trigger |
|------|----|---------|
| `requested` | `matched` | Courier accepts the delivery |
| `requested` | `cancelled` | Sender cancels before match |
| `matched` | `courier_en_route` | Courier begins travel to collection point |
| `matched` | `cancelled` | Either party cancels |
| `courier_en_route` | `courier_arrived` | Courier GPS confirms arrival at collection point |
| `courier_en_route` | `cancelled` | Either party cancels |
| `courier_arrived` | `collected` | Courier scans/photographs parcel and confirms collection |
| `courier_arrived` | `cancelled` | Parcel not available or either party cancels |
| `collected` | `in_transit` | Courier departs collection point towards destination |
| `collected` | `cancelled` | Exceptional cancellation (parcel returned to sender) |
| `in_transit` | `arrived_at_delivery` | Courier GPS confirms arrival at delivery address |
| `in_transit` | `cancelled` | Exceptional cancellation (parcel returned to sender) |
| `arrived_at_delivery` | `completed` | Recipient accepts parcel; proof of delivery captured |
| `arrived_at_delivery` | `cancelled` | Recipient refuses parcel or not available (re-delivery or return) |

---

## Domain-Specific Tags

The following tags are specific to the delivery domain and SHOULD be included on relevant events.

| Tag | Required | Description | Example Values |
|-----|----------|-------------|----------------|
| `package_description` | REQUIRED | Human-readable description of the parcel contents | `"Books and stationery"`, `"Birthday cake"` |
| `package_weight_grams` | REQUIRED | Weight of the parcel in grams | `2500` (integer) |
| `package_dimensions` | RECOMMENDED | Dimensions in millimetres (L x W x H) | `"300x200x150"` |
| `requires_signature` | RECOMMENDED | Whether the recipient must sign on delivery | `"true"`, `"false"` |
| `fragile` | RECOMMENDED | Whether the parcel requires careful handling | `"true"`, `"false"` |
| `proof_of_collection_photo` | After collection | URL or hash of the collection photo | SHA-256 hash or URL |
| `proof_of_delivery_photo` | After delivery | URL or hash of the delivery photo | SHA-256 hash or URL |

### Additional Optional Tags

| Tag | Description | Example Values |
|-----|-------------|----------------|
| `recipient_name` | Name of the intended recipient (encrypted) | NIP-04/NIP-44 encrypted |
| `delivery_instructions` | Special instructions for the courier | `"Leave with neighbour at no. 42 if not home"` |
| `collection_window` | Time window for collection | `"2025-10-20T09:00:00Z/2025-10-20T12:00:00Z"` |
| `delivery_window` | Requested delivery time window | `"2025-10-20T14:00:00Z/2025-10-20T18:00:00Z"` |
| `parcel_value_sats` | Declared value for insurance purposes | `500000` (integer) |
| `temperature_sensitive` | Requires temperature control | `"chilled"`, `"frozen"`, `"ambient"` |

### Tag Examples

**On a delivery request (kind 30500):**

```json
{
  "kind": 30500,
  "tags": [
    ["domain", "delivery"],
    ["d", "delivery_xyz789"],
    ["geohash", "gcpvj0"],
    ["package_description", "Box of vintage records — handle with care"],
    ["package_weight_grams", "4200"],
    ["package_dimensions", "350x350x200"],
    ["fragile", "true"],
    ["requires_signature", "true"],
    ["sender_pubkey", "abc123..."],
    ["pickup_location", "51.5074,-0.1278"],
    ["dropoff_location", "51.4545,-0.9781"]
  ],
  "content": ""
}
```

**On a proof of collection (status update, kind 30512):**

```json
{
  "kind": 30512,
  "tags": [
    ["domain", "delivery"],
    ["d", "delivery_xyz789"],
    ["status", "collected"],
    ["proof_of_collection_photo", "sha256:a1b2c3d4e5f6..."],
    ["condition_note", "Parcel in good condition, sealed, no visible damage"],
    ["timestamp", "1697800000"]
  ],
  "content": ""
}
```

---

## Completion Proof Types

Delivery uses a dual proof system combining **photographic evidence** and **digital signatures**, distinct from ridesharing's GPS trace approach.

| Proof Type | Stage | Description |
|------------|-------|-------------|
| `photo` (collection) | `collected` | Geotagged photo of the parcel at collection, documenting condition |
| `photo` (delivery) | `completed` | Geotagged photo of the parcel at delivery point |
| `signature` | `completed` | Digital signature from the recipient confirming receipt |

### Proof of Collection

When the courier collects the parcel, they SHOULD:
1. Photograph the parcel showing its condition
2. Note any pre-existing damage
3. Confirm the weight matches the declared weight (within tolerance)

This creates an evidence baseline for any subsequent damage disputes.

```json
{
  "proof_type": "photo",
  "stage": "collection",
  "photo_hash": "sha256:a1b2c3d4e5f6...",
  "gps_lat": 51.5074,
  "gps_lon": -0.1278,
  "timestamp": 1697800000,
  "condition": "good",
  "notes": "Sealed box, no visible damage"
}
```

### Proof of Delivery

When the courier delivers the parcel, they SHOULD:
1. Photograph the parcel at the delivery location (or with the recipient)
2. Obtain a digital signature from the recipient (if `requires_signature` is `true`)
3. Record the GPS coordinates of the handover

```json
{
  "proof_type": "photo_and_signature",
  "stage": "delivery",
  "photo_hash": "sha256:f6e5d4c3b2a1...",
  "signature_hash": "sha256:1a2b3c4d5e6f...",
  "gps_lat": 51.4545,
  "gps_lon": -0.9781,
  "timestamp": 1697810000,
  "recipient_confirmed": true
}
```

### Comparison with Ridesharing Proof

| Aspect | Ridesharing | Delivery |
|--------|-------------|----------|
| Primary proof | GPS trace of route taken | Photo at collection + delivery |
| Secondary proof | Passenger confirms arrival | Recipient signature |
| Condition tracking | Not applicable | Photo baseline at collection |
| Third-party handover | Not applicable | Recipient may differ from sender |

---

## Rating Criteria

After a delivery is completed, both parties publish rating events (kind 30530) with domain-specific criteria.

| Criterion Tag | Label | Weight | Description |
|---------------|-------|--------|-------------|
| `overall` | Overall | 0.30 | General satisfaction with the delivery service |
| `punctuality` | Punctuality | 0.25 | Collected and delivered within the estimated time window |
| `package_care` | Package Care | 0.25 | Parcel arrived in the same condition as collected |
| `communication` | Communication | 0.20 | Kept sender informed; responsive to messages |

### Rating Event Example

```json
{
  "kind": 30530,
  "tags": [
    ["domain", "delivery"],
    ["task_id", "delivery_xyz789"],
    ["rated_pubkey", "courier_pubkey_abc"],
    ["overall", "5"],
    ["punctuality", "4"],
    ["package_care", "5"],
    ["communication", "5"]
  ],
  "content": "Records arrived in perfect condition. Courier kept me updated throughout. Slight delay at collection but communicated well."
}
```

---

## Delivery-Specific Event Kinds (30620-30639)

The following kind range is reserved for delivery-domain-specific events. Core protocol kinds (30500-30599) are shared across all domains.

| Kind | Name | Status | Replaceable | Publisher |
|------|------|--------|-------------|-----------|
| 30620 | Proof of Collection | Draft | No (append-only) | Courier |
| 30621 | Proof of Delivery | Draft | No (append-only) | Courier |
| 30622 | Condition Report | Draft | No (append-only) | Courier |
| 30623 | Delivery Attempt Failed | Draft | No (append-only) | Courier |
| 30624 | Re-delivery Scheduled | Draft | Yes (NIP-33) | Operator |
| 30625 | Return to Sender | Draft | Yes (NIP-33) | Operator |
| 30626-30639 | *(Reserved for future use)* | — | — | — |

### Kind 30620: Proof of Collection Event

Published by the courier when collecting the parcel. Serves as the formal handover from sender to courier and establishes the condition baseline.

```json
{
  "kind": 30620,
  "tags": [
    ["domain", "delivery"],
    ["e", "<delivery_request_event_id>"],
    ["d", "delivery_xyz789"],
    ["photo_hash", "sha256:a1b2c3d4e5f6..."],
    ["condition", "good"],
    ["weight_confirmed_grams", "4250"],
    ["gps_lat", "51.5074"],
    ["gps_lon", "-0.1278"],
    ["collected_from", "sender"]
  ],
  "content": "Collected from sender. Box sealed, no visible damage. Weight confirmed within tolerance."
}
```

### Kind 30621: Proof of Delivery Event

Published by the courier upon successful delivery. Contains the delivery photo, optional recipient signature, and GPS confirmation.

```json
{
  "kind": 30621,
  "tags": [
    ["domain", "delivery"],
    ["e", "<delivery_request_event_id>"],
    ["d", "delivery_xyz789"],
    ["photo_hash", "sha256:f6e5d4c3b2a1..."],
    ["signature_hash", "sha256:1a2b3c4d5e6f..."],
    ["gps_lat", "51.4545"],
    ["gps_lon", "-0.9781"],
    ["delivered_to", "recipient"],
    ["recipient_name_hash", "sha256:abcdef..."]
  ],
  "content": "Delivered to recipient at front door. Signature obtained."
}
```

### Kind 30622: Condition Report Event

Published by the courier if the parcel condition changes during transit (e.g., damage discovered). Creates an auditable record for dispute resolution.

```json
{
  "kind": 30622,
  "tags": [
    ["domain", "delivery"],
    ["e", "<delivery_request_event_id>"],
    ["d", "delivery_xyz789"],
    ["condition", "damaged"],
    ["photo_hash", "sha256:9876543210..."],
    ["damage_description", "Corner of box crushed during transit"]
  ],
  "content": "Damage noticed during transit. Photo taken immediately upon discovery."
}
```

### Kind 30623: Delivery Attempt Failed Event

Published when the courier arrives at the delivery address but cannot complete the handover (recipient not home, wrong address, access denied).

```json
{
  "kind": 30623,
  "tags": [
    ["domain", "delivery"],
    ["e", "<delivery_request_event_id>"],
    ["d", "delivery_xyz789"],
    ["reason", "recipient_not_home"],
    ["gps_lat", "51.4545"],
    ["gps_lon", "-0.9781"],
    ["photo_hash", "sha256:attempt123..."],
    ["attempt_number", "1"]
  ],
  "content": "No answer at delivery address. Left calling card. Will attempt re-delivery."
}
```

---

## Shared Events from Original Specification (30546-30548)

The original NIP-XX-ridesharing specification reserved kinds 30546-30548 for delivery-related events. These kinds are shared between the delivery domain and the core protocol:

| Kind | Name | Description |
|------|------|-------------|
| 30546 | Delivery Handoff | Parcel handoff confirmation between parties |
| 30547 | Delivery Chain | Chain-of-custody event for multi-hop deliveries |
| 30548 | Delivery Confirmation | Final delivery confirmation from recipient |

Domain extensions in the 30620-30639 range provide more granular delivery events (proof of collection, condition reports, failed attempts) that complement these shared kinds. Implementations SHOULD use the shared kinds for basic interoperability and the domain-specific kinds for richer delivery semantics.

---

## Staking Model

The delivery domain uses symmetric staking since both parties have roughly equal commitment:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Requester (sender) stake | 10% of delivery fee | Deters fake collection requests |
| Provider (courier) stake | 15% of delivery fee | Deters parcel theft and no-shows |
| Penalty on cancellation | 80% of stake | Strong deterrent against ghosting |

For high-value parcels (declared `parcel_value_sats` above a threshold), operators MAY require increased provider stakes proportional to the parcel value.

---

## Relationship to Core Protocol

The delivery domain uses all core NIP-XX event kinds for task lifecycle management, staking, payments, disputes, and reputation. The domain-specific kinds (30620-30639) extend the core protocol with delivery-specific semantics — principally around proof of collection, proof of delivery, condition tracking, and failed delivery attempts.

### Shared Core Kinds Used

| Kind | Name | Usage in Delivery Domain |
|------|------|--------------------------|
| 30500 | Service Request | Sender requests a delivery with package details |
| 30501 | Service Acceptance | Courier accepts the delivery |
| 30502 | Stake Lock | Operator locks commitment stakes |
| 30510 | Streaming Payment | Optional — streaming payment during long-distance deliveries |
| 30511 | Payment Confirmation | Final payment confirmation after delivery complete |
| 30512 | Status Update | State transitions during the delivery |
| 30513 | Provider Tip | Sender tips the courier |
| 30520 | Stake Release | Operator releases stakes upon completion |
| 30522 | Dispute Filing | Either party files a dispute (e.g., damaged parcel) |
| 30524 | Dispute Resolution | Arbiter resolves the dispute |
| 30530 | Reputation Rating | Post-delivery rating with delivery-specific criteria |
| 30546 | Delivery Handoff | Shared kind — parcel handoff between parties |
| 30547 | Delivery Chain | Shared kind — chain of custody for multi-hop |
| 30548 | Delivery Confirmation | Shared kind — recipient confirms receipt |

---

## Dispute Evidence Types

| Evidence Type | Description |
|---------------|-------------|
| `text` | Written description of the dispute |
| `photo` | Photographic evidence (condition at collection vs delivery) |
| `gps_trace` | GPS trace showing the courier's route |
| `signature` | Digital signature from the recipient |

The dual-photo system (collection + delivery) provides particularly strong evidence for damage disputes, as the condition baseline is established at collection.

---

## Security Considerations

1. **Address privacy** — Delivery requests contain both collection and delivery addresses. Implementations MUST encrypt precise addresses using NIP-04 or NIP-44. Only geohashes should be visible publicly.
2. **Parcel contents** — The `package_description` tag may reveal sensitive information about the sender's possessions. Senders SHOULD keep descriptions general.
3. **Recipient privacy** — The recipient is a third party who has not necessarily consented to protocol participation. Recipient names SHOULD be hashed, not stored in plaintext.
4. **High-value parcels** — Deliveries of high-value items create theft incentives. Operators SHOULD implement enhanced identity verification for high-value deliveries.

---

## Future Work

- **Multi-hop deliveries** — Relay-style deliveries where a parcel passes through multiple couriers (leveraging kind 30547)
- **Scheduled collections** — Recurring collection schedules for businesses
- **Batch deliveries** — Multiple parcels from one sender to different recipients in a single courier run
- **Insurance integration** — Goods-in-transit insurance verification and automatic claims
- **Temperature logging** — IoT sensor integration for temperature-sensitive deliveries
- **Weight verification** — Smart scale integration for automated weight confirmation
- **Locker handover** — Support for parcel locker collection/delivery without direct handover

---

## References

- **NIP-XX-core**: Decentralised Service Coordination Protocol (core specification)
- **NIP-XX-ridesharing**: Ridesharing domain extension (structural reference)
- **Reference implementation**: `src/domain-profiles/delivery.js`
- **Original delivery event kinds**: NIP-XX-ridesharing kinds 30546-30548
- **Consumer Rights Act 2015**: Goods-in-transit liability (UK)
