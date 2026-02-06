# NIP-XX: Decentralised Service Coordination Protocol

`draft` `optional`

## Abstract

This NIP defines an **open protocol standard** for trust-minimised service coordination between strangers over Nostr with Lightning Network payments. It specifies domain-agnostic event schemas (kinds 30500-30599) that enable interoperability between different service operators, applications, and implementations across any service domain (ridesharing, locksmith dispatch, parcel delivery, etc.).

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
- **Instant settlement** via Lightning Network streaming payments
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
| 30523 | Payment Failure | No (append-only) | Provider/Operator |

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

All tasks follow this core lifecycle. Domain extensions MAY define additional intermediate states between `provider_arrived` and `active`.

```
requested ──→ matched ──→ provider_en_route ──→ provider_arrived ──→ active ──→ completed
    │             │              │                     │               │
    └─────────────┴──────────────┴─────────────────────┴───────────────┘
                              cancelled (from any non-terminal state)
```

### State Definitions

| State | Description |
|-------|-------------|
| `requested` | Requester has submitted a task request |
| `matched` | A provider has accepted the task |
| `provider_en_route` | Provider is travelling to the requester/task location |
| `provider_arrived` | Provider has arrived at the task location |
| `active` | Service is being performed |
| `completed` | Service has been completed successfully |
| `cancelled` | Task was cancelled (valid from any non-terminal state) |

Domain extensions define additional states by inserting them between `provider_arrived` and `active`. For example, the locksmith extension adds `access_method_confirmed` and `work_active` between arrival and completion.

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
    ["requester_pubkey", "<hex_pubkey>"],
    ["origin_lat", "<latitude>"],
    ["origin_lon", "<longitude>"],
    ["origin_geohash", "<geohash>"],
    ["destination_lat", "<latitude>"],
    ["destination_lon", "<longitude>"],
    ["fare_sats", "<estimated_fare>"],
    ["requester_stake", "<stake_amount>"],
    ["expiry", "<unix_timestamp>"]
  ],
  "content": "<optional_notes>"
}
```

**Required tags**: `d`, `requester_pubkey`, `origin_lat`, `origin_lon`
**Optional tags**: `domain`, `destination_*`, `fare_sats`, `requester_stake`, `expiry`

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
    ["quoted_fare", "<sats>"]
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
    ["amount", "<sats>"],
    ["payment_hash", "<hex>"],
    ["invoice", "<bolt11>"],
    ["mechanism", "hodl_invoice|custodial|escrow"],
    ["expiry", "<unix_timestamp>"]
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
    ["penalty_sats", "<amount>"],
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
    ["amount", "<sats>"],
    ["payment_hash", "<hex>"],
    ["cumulative_total", "<sats>"],
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
    ["amount_disputed", "<sats>"],
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
    ["bond_amount", "<sats>"],
    ["bond_txid", "<bitcoin_txid>"],
    ["bond_address", "<bitcoin_address>"],
    ["fee_percent", "<decimal>"],
    ["service_area", "<geojson_or_geohash>"]
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

Commitment stakes are the primary trust primitive. Both parties lock satoshis via Lightning hodl invoices (or equivalent) before the service begins. Stakes are:

- **Released** on successful task completion
- **Forfeited** on no-show, cancellation after commitment, or proven misconduct
- **Split** according to dispute resolution outcomes

### Stake Configuration

Operators define stake parameters per domain profile:

```json
{
  "requester_stake_percent": 10,
  "provider_stake_percent": 15,
  "minimum_stake_sats": 500,
  "maximum_stake_sats": 100000,
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

| Tag | Description | Example |
|-----|-------------|---------|
| `d` | Unique identifier (NIP-33) | `["d", "task_abc123"]` |
| `domain` | Service domain identifier | `["domain", "ridesharing"]` |
| `task_id` | Reference to specific task | `["task_id", "task_abc123"]` |
| `requester_pubkey` | Requester's Nostr pubkey | `["requester_pubkey", "<hex>"]` |
| `provider_pubkey` | Provider's Nostr pubkey | `["provider_pubkey", "<hex>"]` |
| `operator_pubkey` | Operator's Nostr pubkey | `["operator_pubkey", "<hex>"]` |
| `origin_lat` | Origin latitude | `["origin_lat", "51.5074"]` |
| `origin_lon` | Origin longitude | `["origin_lon", "-0.1278"]` |
| `destination_lat` | Destination latitude | `["destination_lat", "51.5155"]` |
| `destination_lon` | Destination longitude | `["destination_lon", "-0.1416"]` |
| `origin_geohash` | Geohash for privacy-preserving discovery | `["origin_geohash", "gcpuuz"]` |
| `fare_sats` | Fare in satoshis | `["fare_sats", "50000"]` |
| `payment_hash` | Lightning payment hash | `["payment_hash", "<hex>"]` |
| `timestamp` | Unix timestamp | `["timestamp", "1698765432"]` |
| `expiry` | Event expiration time | `["expiry", "1698769032"]` |
| `e` | Reference to another event | `["e", "<event-id>", "<relay>"]` |
| `p` | Reference to pubkey | `["p", "<pubkey>"]` |

---

## Extension Mechanism

New service domains are added via **extension NIPs** that:

1. Define a `domain` identifier (e.g., `"locksmith"`, `"delivery"`)
2. Specify role aliases for `requester` and `provider`
3. Define additional states inserted between `provider_arrived` and `active` in the core state machine
4. Specify domain-specific tags for service request events (kind 30500)
5. Define domain-specific rating criteria
6. Optionally define new event kinds for domain-specific operations

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

## See Also

- **NIP-XX-ridesharing**: Ridesharing domain extension (original 82-kind specification)
- **NIP-XX-locksmith**: Locksmith dispatch domain extension
- **NIP-XX-delivery**: Parcel delivery domain extension
- **ARCHITECTURE.md**: Federated operator model
- **TRUST-MECHANISMS.md**: Six layers of trust
