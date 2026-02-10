# NIP-XX: Decentralised Service Coordination Protocol

`draft` `optional`

## Abstract

This NIP defines an **open protocol standard** for trust-minimised service coordination between strangers over Nostr with cryptographic commitment stakes and flexible payment settlement. It specifies domain-agnostic event schemas (kinds 30500-30599) that enable interoperability between different service operators, applications, and implementations across any service domain (ridesharing, locksmith dispatch, parcel delivery, etc.).

Like HTTP for the web or SMTP for email, NIP-XX provides a common data format for service coordination, allowing:
- **User data portability** — Switch operators while preserving reputation and history
- **Cross-operator compatibility** — Apps can connect to multiple operators
- **Operator competition** — Multiple providers compete on service quality and fees
- **Flexible implementation** — From fully decentralised (Nostr-native) to traditional centralised (schema-compatible)
- **Domain extensibility** — New service domains can be added via extension NIPs without protocol changes

This NIP defines core event schemas and interoperability rules. **It does not mandate specific architectures, legal compliance, or business models.** Operators are responsible for compliance with laws in their jurisdiction.

## Disclaimer

**IMPORTANT LEGAL NOTICE:**

1. **Not Legal Advice**: This specification does not constitute legal advice. Operators MUST consult with qualified legal counsel in their jurisdiction before launching services.
2. **Protocol Standard Only**: This NIP defines data formats and event schemas for interoperability. It does NOT mandate specific implementations, require particular safety features, or prescribe legal compliance methods.
3. **Operator Responsibility**: Each operator is solely responsible for compliance with local, national, and international laws; user safety and privacy; insurance and liability; background checks and provider screening; tax reporting and financial regulations; data protection (GDPR, CCPA, etc.).
4. **No Warranty**: This specification is provided "as is" without warranty of any kind.
5. **Community Standard**: This is an open protocol developed by the community. Adherence is voluntary.

## Motivation

Traditional service platforms extract 15-30% commission, can arbitrarily deplatform providers, control payment timing, and create information asymmetry. This specification enables:

- **Direct peer-to-peer coordination** between requesters and providers
- **Economic incentives** through commitment stakes to prevent ghosting by either party
- **Flexible settlement** via currency-neutral payment providers (Lightning, fiat, or hybrid)
- **Reputation without manipulation** through cryptographically signed events
- **No deplatforming** — providers cannot be banned from the protocol itself
- **Fee competition** between relay operators driving fees towards zero

## Terminology

This specification uses generic terms for the two parties in any service interaction:

| Generic Term | Description | Examples |
|-------------|-------------|----------|
| **Requester** | The party requesting the service | Rider, customer, sender, patient |
| **Provider** | The party fulfilling the service | Driver, locksmith, courier, nurse |
| **Task** | A single unit of service coordination | Ride, callout, delivery, visit |
| **Operator** | The relay/server coordinating tasks | DonkeyRide relay instance |

Domain extension NIPs (e.g., NIP-XX-ridesharing) MAY define aliases for these terms (e.g., `rider_pubkey` as an alias for `requester_pubkey`). Implementations SHOULD accept both the generic and domain-specific tag names.

## Domain Tag

All events in this protocol SHOULD include a `domain` tag identifying the service domain:

```json
["domain", "ridesharing"]
```

Valid domain identifiers are defined by extension NIPs. Core kinds function without a domain tag but implementations SHOULD include one for relay filtering and client routing.

## Three-Layer Architecture

The protocol operates across three layers:

```
NOSTR (public, permanent)     →  Discovery + Reputation + Operator Bonds
OPERATOR (private, compliant) →  PII + Coordination + Payments + Compliance
WEBSOCKET (ephemeral)         →  Real-time tracking + Live updates
```

- **Nostr layer**: Public events for discovery, reputation, and operator accountability. No PII.
- **Operator layer**: Private data storage for personally identifiable information, payment processing, and regulatory compliance.
- **WebSocket layer**: Ephemeral real-time location streams and status updates during active tasks.

## Implementation Flexibility

Operators MAY implement this protocol at three levels of decentralisation:

### 1. Nostr-Native (Maximum Decentralisation)
All coordination via public Nostr relays. Operator provides minimal private services (PII storage, optional safety features).

### 2. Hybrid (Nostr Discovery + Private Operations)
Public Nostr for discovery and reputation. Private operator server for real-time coordination, payments, and compliance. **Recommended for mainstream markets.**

### 3. Schema-Compatible (Traditional Centralised)
Traditional centralised architecture using DonkeyRide-compatible schemas for data portability. No public Nostr requirement.

---

## Core Event Kinds

### Task Lifecycle Events

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30500 | Service Request | Yes (NIP-33) | Requester |
| 30501 | Service Acceptance | Yes (NIP-33) | Provider |
| 30504 | Service Confirmation | Yes (NIP-33) | Operator |
| 30506 | Service Cancellation | No (append-only) | Either party |
| 30507 | Service Start | Yes (NIP-33) | Provider |
| 30508 | Service End | Yes (NIP-33) | Provider |
| 30512 | Status Update | Yes (NIP-33) | Provider/Operator |

### Stake Management Events

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30502 | Stake Lock | Yes (NIP-33) | Operator |
| 30503 | Stake Negotiation | Yes (NIP-33) | Either party |
| 30509 | Commitment Stake | Yes (NIP-33) | Requester/Provider |
| 30520 | Stake Release | No (append-only) | Operator |
| 30540 | Operator Bond | Yes (NIP-33) | Operator |

### Payment Events

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30510 | Streaming Payment | No (append-only) | Requester |
| 30511 | Payment Confirmation | Yes (NIP-33) | Operator |
| 30513 | Provider Tip | No (append-only) | Requester |
| 30538 | Payment Failure | No (append-only) | Provider/Operator |

### Trust & Reputation Events

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30517 | Provider Rating | No (append-only) | Requester |
| 30518 | Requester Rating | No (append-only) | Provider |
| 30519 | Reputation Summary | Yes (NIP-33) | Anyone |
| 30521 | Reputation Export/Import | Yes (NIP-33) | Anyone |
| 30528 | Operator Reputation | Yes (NIP-33) | Anyone |
| 30530 | Reputation Rating | No (append-only) | Either party |

### Dispute Resolution Events

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30522 | Dispute Filing | No (append-only) | Either party |
| 30523 | Arbiter Assignment | Yes (NIP-33) | Operator |
| 30524 | Dispute Resolution | Yes (NIP-33) | Operator/Arbiter |

### Operator Trust Events

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30525 | Theft Report | No (append-only) | Anyone |
| 30526 | Watchdog Claim | No (append-only) | Verifier |
| 30527 | Operator Slashing | No (append-only) | Verifier |

### Safety & Emergency Events

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30559 | Emergency Alert | No (append-only) | Either party |
| 30560 | Task Sharing | Yes (NIP-33) | Requester |
| 30561 | Safety Check-In Request | No (append-only) | Operator |
| 30562 | Safety Check-In Response | No (append-only) | Either party |
| 30563 | Safety Check-In Escalation | No (append-only) | Operator |
| 30564 | Harassment Report | No (append-only) | Either party |

### Abuse Detection Events

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30549 | Suspicious Activity Report | No (append-only) | Operator |
| 30550 | Account Suspension | Yes (NIP-33) | Operator |
| 30551 | Appeal Request | No (append-only) | Either party |

---

## Core State Machine

All tasks follow this core lifecycle. The state machine distinguishes between **required states** that all domains MUST implement and **optional states** that domains declare based on their service model.

**Required states** (all domains): `requested`, `matched`, `active`, `completed`, `cancelled`, `no_show`

**Optional states** (domain declares which): `provider_en_route`, `provider_arrived`

```
requested ──→ matched ──→ [provider_en_route] ──→ [provider_arrived] ──→ active ──→ completed
    │             │              │                       │                  │
    │             │              │                       ├──────────────→ no_show
    └─────────────┴──────────────┴───────────────────────┴──────────────→ cancelled

States in [brackets] are optional — domain profiles declare which states are used.
Domains MAY transition directly from matched → active when physical transit is not applicable.
```

### State Definitions

| State | Required | Description |
|-------|----------|-------------|
| `requested` | Yes | Requester has submitted a task request |
| `matched` | Yes | A provider has accepted the task |
| `provider_en_route` | No | Provider is travelling to the requester/task location |
| `provider_arrived` | No | Provider has arrived at the task location |
| `active` | Yes | Service is being performed |
| `completed` | Yes | Service has been completed successfully |
| `no_show` | Yes | One party failed to appear after commitment (triggers stake forfeiture) |
| `cancelled` | Yes | Task was cancelled (valid from any non-terminal state) |

**Terminal states**: `completed`, `no_show`, `cancelled`. The distinction between `no_show` and `cancelled` is critical: `no_show` triggers automatic stake forfeiture for the absent party, whilst `cancelled` triggers mutual stake release.

Domain extensions MAY define additional states by inserting them between `provider_arrived` and `active`. For example, the locksmith extension adds `access_method_confirmed` and `work_active` between arrival and completion. Domains that do not involve physical transit (e.g., virtual consultations) MAY omit `provider_en_route` and `provider_arrived` entirely, transitioning directly from `matched` to `active`.

### Domain State Aliases

Domain extensions MAY define aliases for core states to improve domain-specific readability. Implementations MUST map aliases back to the corresponding core state for protocol-level processing.

| Core State | Alias Pattern | Examples |
|------------|--------------|---------|
| `requested` | `{task_noun}_requested` | `lockout_reported`, `delivery_requested` |
| `matched` | `{provider}_matched` | `locksmith_matched`, `courier_matched` |
| `provider_en_route` | `{provider}_en_route` | `en_route`, `courier_en_route` |
| `provider_arrived` | `{provider}_arrived` | `arrived`, `courier_arrived` |
| `active` | `work_active`, `in_progress`, `on_duty` | `work_active`, `in_transit`, `on_duty` |
| `completed` | `{domain}_completed` | `access_gained`, `delivered`, `shift_ended` |

---

## Event Structures

### Kind 30500: Service Request

Published by a requester to request a service.

```json
{
  "kind": 30500,
  "tags": [
    ["d", "<task_id>"],
    ["domain", "<domain_id>"],
    ["discovery_method", "<method_list>"],
    ["requester_pubkey", "<hex_pubkey>"],
    ["location_lat", "<latitude>"],
    ["location_lon", "<longitude>"],
    ["g", "<geohash>"],
    ["destination_lat", "<latitude>"],
    ["destination_lon", "<longitude>"],
    ["amount", "<estimated_fare>"],
    ["currency", "<iso_4217_or_crypto_code>"],
    ["trust_model", "<provider_trust_model>"],
    ["requester_stake", "<stake_amount>"],
    ["expiration", "<unix_timestamp>"]
  ],
  "content": "<optional_notes>"
}
```

**Required tags**: `d`, `requester_pubkey`
**Conditionally required**: `location_lat`, `location_lon` (REQUIRED for geohash-discovered services, OPTIONAL for virtual/category-discovered services)
**Optional tags**: `domain`, `discovery_method`, `g`, `destination_*`, `amount`, `currency`, `trust_model`, `requester_stake`, `expiration`

> **Domain aliases:** Domain extensions define aliases for location tags: ridesharing uses `pickup_lat`/`dropoff_lat`, delivery uses `collection_lat`/`delivery_lat`, locksmith uses `lockout_lat`/`lockout_lon`. Implementations MUST accept both the generic and domain-aliased forms.

The `discovery_method` tag declares how providers should be matched for this request. See NIP-XX-discovery for the full discovery method taxonomy (geohash, skill tags, categories, availability, jurisdiction). If omitted, implementations SHOULD default to `geohash`.

Domain extensions MAY define additional required/optional tags (e.g., `vehicle_type` for ridesharing, `lock_type` for locksmith).

### Kind 30501: Service Acceptance

Published by a provider to accept a task.

```json
{
  "kind": 30501,
  "tags": [
    ["d", "<task_id>"],
    ["domain", "<domain_id>"],
    ["e", "<request_event_id>", "<relay>"],
    ["provider_pubkey", "<hex_pubkey>"],
    ["provider_stake", "<stake_amount>"],
    ["estimated_arrival", "<minutes>"],
    ["amount", "<quoted_fare>"],
    ["currency", "<iso_4217_or_crypto_code>"],
    ["trust_model", "<provider_trust_model>"]
  ],
  "content": "<optional_notes>"
}
```

### Kind 30502: Stake Lock

Published by the operator when a commitment stake is locked.

```json
{
  "kind": 30502,
  "tags": [
    ["d", "<task_id>"],
    ["domain", "<domain_id>"],
    ["party", "requester|provider"],
    ["amount", "<value>"],
    ["currency", "<iso_4217_or_crypto_code>"],
    ["trust_model", "trustless|custodial|custodial-escrow|custodial-third-party|federated|smart-contract"],
    ["payment_hash", "<hex>"],
    ["invoice", "<bolt11_or_provider_reference>"],
    ["mechanism", "hodl_invoice|custodial|escrow|nip47"],
    ["expiration", "<unix_timestamp>"]
  ],
  "content": ""
}
```

### Kind 30506: Service Cancellation

```json
{
  "kind": 30506,
  "tags": [
    ["d", "<task_id>"],
    ["domain", "<domain_id>"],
    ["cancelled_by", "requester|provider|operator"],
    ["reason", "<cancellation_reason>"],
    ["amount", "<penalty_value>"],
    ["currency", "<iso_4217_or_crypto_code>"],
    ["e", "<original_request_event_id>"]
  ],
  "content": "<optional_details>"
}
```

### Kind 30510: Streaming Payment

Published by the requester (or operator on behalf) during an active task for ongoing payments.

```json
{
  "kind": 30510,
  "tags": [
    ["d", "<task_id>"],
    ["domain", "<domain_id>"],
    ["amount", "<value>"],
    ["currency", "<iso_4217_or_crypto_code>"],
    ["trust_model", "<provider_trust_model>"],
    ["payment_hash", "<hex>"],
    ["cumulative_total", "<value>"],
    ["interval_seconds", "<seconds>"]
  ],
  "content": ""
}
```

### Kind 30512: Status Update

Published by the provider or operator to update task status.

```json
{
  "kind": 30512,
  "tags": [
    ["d", "<task_id>"],
    ["domain", "<domain_id>"],
    ["status", "<state>"],
    ["provider_lat", "<latitude>"],
    ["provider_lon", "<longitude>"],
    ["eta_seconds", "<seconds>"],
    ["distance_remaining_metres", "<metres>"]
  ],
  "content": "<optional_notes>"
}
```

### Kind 30517: Provider Rating

Published by the requester after task completion.

```json
{
  "kind": 30517,
  "tags": [
    ["d", "<task_id>"],
    ["domain", "<domain_id>"],
    ["rated_pubkey", "<provider_hex_pubkey>"],
    ["rating", "1-5"],
    ["categories", "<json_object>"],
    ["safety_flag", "true|false"]
  ],
  "content": "<review_text>"
}
```

The `categories` tag contains a JSON object with domain-specific rating criteria. The domain profile defines which criteria are available. Example for ridesharing: `{"driving": 5, "punctuality": 4, "cleanliness": 5}`.

### Kind 30522: Dispute Filing

```json
{
  "kind": 30522,
  "tags": [
    ["d", "<dispute_id>"],
    ["domain", "<domain_id>"],
    ["e", "<task_event_id>"],
    ["complainant_pubkey", "<hex>"],
    ["accused_pubkey", "<hex>"],
    ["dispute_type", "payment|conduct|safety|quality"],
    ["amount", "<disputed_value>"],
    ["currency", "<iso_4217_or_crypto_code>"],
    ["evidence", "<json_array>"]
  ],
  "content": "<dispute_description>"
}
```

### Kind 30540: Operator Bond

Published by an operator to demonstrate financial commitment and trustworthiness.

```json
{
  "kind": 30540,
  "tags": [
    ["d", "<operator_pubkey>"],
    ["domain", "<domain_id>"],
    ["amount", "<bond_value>"],
    ["currency", "<iso_4217_or_crypto_code>"],
    ["trust_model", "<provider_trust_model>"],
    ["bond_txid", "<transaction_reference>"],
    ["bond_address", "<address_or_reference>"],
    ["fee_percent", "<decimal>"],
    ["service_area", "<geojson_or_geohash_or_virtual>"]
  ],
  "content": "<operator_description>"
}
```

### Kind 30559: Emergency Alert

```json
{
  "kind": 30559,
  "tags": [
    ["d", "<task_id>"],
    ["domain", "<domain_id>"],
    ["alert_type", "panic|medical|accident|threat"],
    ["triggered_by", "requester|provider"],
    ["lat", "<latitude>"],
    ["lon", "<longitude>"],
    ["e", "<task_event_id>"]
  ],
  "content": "<emergency_details>"
}
```

---

## Stake Mechanism

Commitment stakes are the primary trust primitive. Both parties lock a currency-neutral value via the configured payment provider (Lightning hold invoices, fiat escrow, or equivalent) before the service begins. Stakes are:

- **Released** on successful task completion
- **Forfeited** on no-show, cancellation after commitment, or proven misconduct
- **Split** according to dispute resolution outcomes

### Stake Configuration

Operators define stake parameters per domain profile:

```json
{
  "requester_stake_percent": 10,
  "provider_stake_percent": 15,
  "minimum_stake": { "value": 500, "currency": "GBP" },
  "maximum_stake": { "value": 10000, "currency": "GBP" },
  "cancellation_penalty_percent": 50,
  "no_show_penalty_percent": 100,
  "grace_period_seconds": 300
}
```

### Stake Lifecycle

```
1. Requester creates task          → Requester stake locked (kind 30502)
2. Provider accepts task           → Provider stake locked (kind 30502)
3. Service completes successfully  → Both stakes released (kind 30520)
   OR
3. Cancellation within grace       → Both stakes released (kind 30520)
   OR
3. No-show                         → No-show party's stake forfeited (kind 30520)
   OR
3. Dispute                         → Stakes held pending resolution (kind 30522/30524)
```

---

## Reputation System

Reputation is built from cryptographically signed rating events (kind 30517/30518/30530) stored on public Nostr relays. This makes reputation:

- **Portable** — Follows the user's pubkey across operators
- **Unforgeable** — Signed by the rater's private key
- **Transparent** — Anyone can query and verify
- **Time-decayed** — Implementations SHOULD weight recent ratings more heavily

### Rating Criteria

Each domain profile defines its own rating criteria. The core protocol defines:

| Criterion | Description | All Domains |
|-----------|-------------|-------------|
| `overall` | Overall service quality (1-5 stars) | Yes |
| `punctuality` | Timeliness | Yes |
| `communication` | Quality of communication | Yes |

Domain extensions add domain-specific criteria (e.g., `driving` for ridesharing, `workmanship` for locksmith).

---

## Common Tags Reference

| Tag | Description | Domain Aliases | Example |
|-----|-------------|---------------|---------|
| `d` | Unique identifier (NIP-33) | | `["d", "task_abc123"]` |
| `domain` | Service domain identifier | | `["domain", "ridesharing"]` |
| `task_id` | Reference to specific task | | `["task_id", "task_abc123"]` |
| `requester_pubkey` | Requester's Nostr pubkey | `rider_pubkey` (ridesharing), `customer_pubkey` (locksmith), `sender_pubkey` (delivery) | `["requester_pubkey", "<hex>"]` |
| `provider_pubkey` | Provider's Nostr pubkey | `driver_pubkey` (ridesharing), `locksmith_pubkey` (locksmith), `courier_pubkey` (delivery) | `["provider_pubkey", "<hex>"]` |
| `operator_pubkey` | Operator's Nostr pubkey | | `["operator_pubkey", "<hex>"]` |
| `location_lat` | Primary task location latitude | `pickup_lat` (ridesharing), `collection_lat` (delivery), `lockout_lat` (locksmith) | `["location_lat", "51.5074"]` |
| `location_lon` | Primary task location longitude | `pickup_lon` (ridesharing), `collection_lon` (delivery), `lockout_lon` (locksmith) | `["location_lon", "-0.1278"]` |
| `destination_lat` | Destination latitude (if applicable) | `dropoff_lat` (ridesharing), `delivery_lat` (delivery) | `["destination_lat", "51.5155"]` |
| `destination_lon` | Destination longitude (if applicable) | `dropoff_lon` (ridesharing), `delivery_lon` (delivery) | `["destination_lon", "-0.1416"]` |
| `g` | Standard Nostr geohash tag for privacy-preserving discovery | | `["g", "gcpuuz"]` |
| `amount` | Value in the specified currency | | `["amount", "1500"]` |
| `currency` | ISO 4217 fiat code or crypto code (BTC, SAT) | | `["currency", "GBP"]` |
| `trust_model` | Payment provider trust model | | `["trust_model", "custodial-escrow"]` |
| `payment_hash` | Payment reference (Lightning hash or provider ID) | | `["payment_hash", "<hex>"]` |
| `timestamp` | Unix timestamp | | `["timestamp", "1698765432"]` |
| `expiration` | Event expiration time (NIP-40) | | `["expiration", "1698769032"]` |
| `linked_task` | Reference to a related task | | `["linked_task", "<task_id>", "<relationship>"]` |
| `e` | Reference to another event | | `["e", "<event-id>", "<relay>"]` |
| `p` | Reference to pubkey | | `["p", "<pubkey>"]` |

The `location_*` tags are REQUIRED for geohash-discovered services and OPTIONAL for virtual/category-discovered services. Implementations MUST accept both the generic tag names and any domain-aliased forms listed above.

---

## Payment Agnosticism

This protocol is **currency-neutral**. All event schemas that reference monetary values use explicit `amount`, `currency`, and `trust_model` tags rather than assuming a specific currency or payment rail.

### Design Principle

The protocol specifies *what* needs to be paid, not *how*. Payment settlement is delegated to payment providers, each of which declares its trust model. This enables:

- **Fiat UX with Bitcoin rails** — A customer pays £12.50 via Strike, which converts to sats and settles over Lightning. Neither party touches cryptocurrency directly.
- **Full sovereignty** — A Bitcoin-native user connects their own wallet via NIP-47 (Nostr Wallet Connect) for trustless hold invoices with no intermediary.
- **Fiat-only markets** — An operator runs Stripe for traditional card payments with escrow.
- **Mixed methods** — An operator offers multiple payment methods; the user chooses, seeing the trust trade-off for each.

### Trust Model Taxonomy

Every payment provider declares one of these trust models via the `trust_model` tag:

| Trust Model | Description | Example Provider |
|-------------|-------------|-----------------|
| `trustless` | User wallet ↔ user wallet. No intermediary custody. | NIP-47 + hold invoices |
| `custodial` | Operator holds funds temporarily. | LND (operator node) |
| `custodial-escrow` | Third party holds funds in escrow until completion. | Stripe Escrow |
| `custodial-third-party` | Third-party processor holds funds briefly. Operator never has custody. | Strike, PayPal |
| `federated` | Multi-party custody via ecash mint or federation. | Cashu, Fedimint |
| `smart-contract` | Programmatic escrow via smart contract. | Future providers |

### Currency Tags

The `currency` tag uses:
- **ISO 4217 codes** for fiat: `GBP`, `USD`, `EUR`, `JPY`
- **Well-known codes** for cryptocurrency: `BTC`, `SAT`, `ETH`

Implementations MUST include `currency` on all events with an `amount` tag. Implementations SHOULD include `trust_model` on all events involving payment or stake operations.

---

## Linked Tasks

Tasks MAY reference other tasks using the `linked_task` tag to model follow-up work, guarantees, and escalations:

```json
["linked_task", "<original_task_id>", "follow_up"]
["linked_task", "<original_task_id>", "guarantee"]
["linked_task", "<original_task_id>", "escalation"]
```

| Relationship | Semantics |
|-------------|-----------|
| `follow_up` | Scheduled work arising from a completed task (e.g. emergency plumber fix → proper repair next week) |
| `guarantee` | Reopened task under original terms (e.g. locksmith guarantee — lock fails within 30 days) |
| `escalation` | Escalated task when original service was insufficient (e.g. roadside fix failed → tow → taxi) |

Guarantee links inherit the original task's terms. Escalation links form a chain that can be audited for accountability.

---

## Completion Proof Types

Domain profiles declare which proof types are required for task completion. The core protocol defines the following proof types:

| Proof Type | Description | Applicable To |
|------------|-------------|---------------|
| `gps_trace` | GPS route trace during active task | Location-based transit (ridesharing, delivery) |
| `gps_arrival` | GPS coordinates confirming arrival | All location-based services |
| `photo` | Geotagged photographic evidence | Physical services (locksmith, delivery, cleaning) |
| `photo_before_after` | Before and after photos | Transformation services (cleaning, repair, grooming) |
| `signature` | Digital signature from counterparty | Delivery, legal services |
| `document` | Document or file handover | Legal services, virtual services |
| `checkin` | Heartbeat check-in confirmations | Duration services (security guard, companion care) |
| `video` | Video evidence | High-value or safety-critical services |
| `receipt` | External receipt or confirmation | Purchases, toll payments |
| `counterparty_ack` | Explicit acknowledgement from the other party | All services (universal fallback) |

Domain profiles specify required proof types as an array:

```json
["completion_proof", "gps_arrival", "photo"]
```

All proof types are verified by the operator before triggering stake release (kind 30520). Domain extensions MAY define additional proof types beyond this core list.

---

## Extension Mechanism

New service domains are added via **extension NIPs** that:

1. Define a `domain` identifier (e.g., `"locksmith"`, `"delivery"`)
2. Specify role aliases for `requester` and `provider`
3. Declare which optional states are used (`provider_en_route`, `provider_arrived`) and define any additional states inserted between `provider_arrived` and `active` in the core state machine
4. Specify domain-specific tags for service request events (kind 30500)
5. Define domain-specific rating criteria
6. Declare discovery method(s) appropriate for the domain (see NIP-XX-discovery for the taxonomy)
7. Declare required completion proof types (see Completion Proof Types)
8. Optionally define new event kinds for domain-specific operations

Discovery methods are extensible — domains are not limited to geohash-based geographic matching. Virtual and scheduled services (tutoring, consulting, skilled trades) use skill tags, categories, and availability windows for discovery. See NIP-XX-discovery for the full taxonomy and relay filter patterns.

Extension NIPs MUST NOT redefine the semantics of core event kinds. They MAY define additional event kinds in allocated ranges.

### Allocated Kind Ranges

| Range | Domain | Extension NIP |
|-------|--------|---------------|
| 30500-30529 | Core protocol | This NIP |
| 30530-30549 | Core extensions (scheduling, compliance) | This NIP |
| 30549-30569 | Safety, abuse, operational | This NIP |
| 30570-30599 | Ridesharing-specific | NIP-XX-ridesharing |
| 30600-30619 | Locksmith-specific | NIP-XX-locksmith |
| 30620-30639 | Delivery-specific | NIP-XX-delivery |
| 30640-30699 | Reserved for future domains | TBD |

---

## Minimum Viable Operator

To launch a basic service operator, implement **at minimum**:

- **Task lifecycle**: 30500, 30501, 30506, 30507, 30508, 30512 (request, accept, cancel, start, end, status)
- **Stakes**: 30502, 30520 (lock, release)
- **Payments**: 30510, 30511 (streaming, confirmation)
- **Trust**: 30517, 30518, 30519 (ratings, reputation summary)
- **Safety**: 30559 (emergency alert)

**Total**: ~15 event kinds for MVP.

---

## Referenced NIPs

This specification references the following Nostr Implementation Possibilities:

| NIP | Name | Usage in This Protocol |
|-----|------|----------------------|
| **NIP-33** | Parameterised Replaceable Events | All replaceable events use `d` tags for unique identification |
| **NIP-40** | Expiration Timestamp | All time-limited events use `["expiration", "<unix_timestamp>"]` |
| **NIP-44** | Encrypted Payloads | All private coordination messages between parties |
| **NIP-17 + NIP-59** | Private Messages (Gift Wrap) | PII exchange (addresses, phone numbers) between requester and provider |
| **NIP-47** | Nostr Wallet Connect | Trustless stake management via hold invoices directly between user wallets |
| **NIP-57** | Lightning Zaps | Tips MAY be implemented as standard Nostr zaps on completion events |
| **NIP-58** | Badges | Verification credentials (background check, insurance, licensing) |
| **NIP-85** | Trusted Assertions | Operators SHOULD publish computed reputation summaries |
| **NIP-89** | App Handlers | Operators publish handler events declaring support for kinds 30500-30599 |

---

## See Also

### Modular NIP Specifications

- **NIP-XX-stakes**: Commitment stakes, escrow, and operator bonds
- **NIP-XX-reputation**: Ratings, reputation, and verification badges
- **NIP-XX-disputes**: Dispute resolution, guardian voting, and operator accountability
- **NIP-XX-discovery**: Extensible provider discovery (geohash, skill tags, categories, availability, jurisdiction) and operator advertising
- **NIP-XX-safety**: Emergency alerts, trip sharing, and safety check-ins
- **NIP-XX-navigation**: Routes, turn-by-turn navigation, and traffic
- **NIP-XX-payments**: Streaming payments, tips, and surcharges

### Domain Extensions

- **NIP-XX-ridesharing**: Ridesharing domain extension
- **NIP-XX-locksmith**: Locksmith dispatch domain extension
- **NIP-XX-delivery**: Parcel delivery domain extension

### Documentation

- **ARCHITECTURE.md**: Federated operator model
- **TRUST-MECHANISMS.md**: Six layers of trust
- **docs/PAYMENT-PROVIDERS.md**: Payment provider integration guide
