# TROTT-06: Coordination — The Operator Layer

`draft` `optional`

## Abstract

This specification defines the **optional operator coordination layer** for trust-minimised service coordination.
Everything in TROTT-01 through TROTT-05 works without an operator — two parties can discover each other on Nostr, lock
stakes via NIP-47, perform a service, and settle directly. Operators are **optional service enhancers** that add value
through PII handling, escrow, dispute mediation, live tracking, compliance verification, and real-time coordination.

This specification formalises the operator's role: how operators claim tasks, handle personally identifiable
information (PII), receive scoped delegations, publish compliance records, and broadcast liveness heartbeats. It also
defines the **three-layer architecture** that separates public protocol data from private operational data from
ephemeral real-time streams.

## Motivation

Fully peer-to-peer service coordination is technically possible but practically difficult for mainstream adoption.
Operators fill the gap by providing:

- **PII handling** — Addresses, phone numbers, and payment details need a compliant custodian
- **Escrow** — Not everyone can run a Lightning node; operators provide custodial payment rails
- **Dispute mediation** — Someone must review evidence and issue rulings (TROTT-05)
- **Live tracking** — Real-time WebSocket coordination is faster than Nostr relay round-trips
- **Compliance** — Background checks, insurance verification, and regulatory filings require a legal entity
- **UX** — A single API endpoint is simpler than managing relay connections, key management, and event signing

However, operators introduce trust. This specification defines **accountability mechanisms** that constrain operator
behaviour: bonds (TROTT-02), reputation (TROTT-03), fee transparency (TROTT-06), compliance records, heartbeat liveness,
and dispute history (TROTT-05).

## Depends On

- **TROTT-01**: Core service coordination protocol (state machine, lifecycle events)
- **TROTT-02**: Discovery (Operator Bond kind 30511, Provider Profile kind 30510)
- **NIP-01**: Basic Nostr protocol
- **NIP-17**: Private direct messages (gift wrap for PII exchange)
- **NIP-33**: Parameterised replaceable events
- **NIP-44**: Encrypted payloads
- **NIP-59**: Gift wrap (outer layer for NIP-17)

## Event Kinds

| Kind  | Name                | Replaceable      | Publisher    |
|-------|---------------------|------------------|--------------|
| 30550 | Operator Claim      | Yes (NIP-33)     | Operator     |
| 30551 | PII Envelope        | No (append-only) | Operator     |
| 30552 | Delegation Grant    | Yes (NIP-33)     | Either party |
| 30553 | Compliance Record   | No (append-only) | Operator     |
| 30554 | Operator Heartbeat  | Yes (NIP-33)     | Operator     |
| 30555 | Compliance Snapshot | No (append-only) | Operator     |

---

## Event Structures

### Kind 30550: Operator Claim

Published by an operator to claim coordination responsibility for a task. The claim declares the services the operator
will provide, the fee it will charge, a reference to its bond (TROTT-02), and the ephemeral WebSocket endpoint for
real-time coordination.

```json
{
  "kind": 30550,
  "tags": [
    [
      "d",
      "claim_task_abc123"
    ],
    [
      "domain",
      "ridesharing"
    ],
    [
      "task_id",
      "task_abc123"
    ],
    [
      "e",
      "<task_request_event_id>",
      "<relay>"
    ],
    [
      "operator_pubkey",
      "<hex>"
    ],
    [
      "services",
      "pii_handling,escrow,dispute_mediation,live_tracking"
    ],
    [
      "fee_amount",
      "75"
    ],
    [
      "fee_currency",
      "GBP"
    ],
    [
      "fee_model",
      "percent"
    ],
    [
      "fee_rate",
      "5.0"
    ],
    [
      "bond_event",
      "<operator_bond_event_id>"
    ],
    [
      "bond_amount",
      "50000"
    ],
    [
      "bond_currency",
      "GBP"
    ],
    [
      "ephemeral_endpoint",
      "wss://london.operator.example.com/ws/task_abc123"
    ],
    [
      "expiration",
      "1698769032"
    ]
  ],
  "content": ""
}
```

**Required tags**: `d`, `task_id`, `operator_pubkey`, `services`
**Optional tags**: `domain`, `e` (task reference), `fee_amount`, `fee_currency`, `fee_model`, `fee_rate`, `bond_event`,
`bond_amount`, `bond_currency`, `ephemeral_endpoint`, `expiration`

#### Declared Services

The `services` tag is a comma-separated list of capabilities the operator provides for this task:

| Service                   | Description                                                                                                          |
|---------------------------|----------------------------------------------------------------------------------------------------------------------|
| `pii_handling`            | Operator will receive, store, and protect personally identifiable information (addresses, phone numbers, real names) |
| `escrow`                  | Operator will hold funds in escrow during the task (via TROTT-02 stake mechanisms)                                   |
| `dispute_mediation`       | Operator will mediate disputes per TROTT-05 resolution models                                                        |
| `live_tracking`           | Operator provides real-time location tracking via WebSocket                                                          |
| `compliance_verification` | Operator has verified provider credentials (background checks, insurance, licensing)                                 |
| `safety_monitoring`       | Operator provides 24/7 safety response (TROTT-05 emergency signal handling)                                          |
| `payment_processing`      | Operator handles payment settlement between parties                                                                  |
| `navigation`              | Operator provides routing and ETA services (TROTT-07)                                                                |

#### Fee Models

| Model     | Description                                                          | Example                                                   |
|-----------|----------------------------------------------------------------------|-----------------------------------------------------------|
| `percent` | Percentage of the task fare                                          | `fee_rate: 5.0` = 5% of fare                              |
| `flat`    | Fixed amount per task                                                | `fee_amount: 100, fee_currency: GBP` = 100 pence per task |
| `tiered`  | Percentage that decreases with volume (details in `content`)         | First 100 tasks: 8%, 101-500: 5%, 500+: 3%                |
| `zero`    | No fee (operator funded by other means, e.g. advertising, donations) | No fee tags required                                      |

#### Multiple Operators

A single task MAY receive claims from multiple operators. In this case:

1. Both the requester and provider see all operator claims
2. Either party MAY select a preferred operator (by referencing the claim event)
3. If both parties agree on the same operator, that operator coordinates the task
4. If they disagree, the requester's preference takes priority (the requester initiated the task)
5. If no operator is selected, the task proceeds peer-to-peer using only TROTT-01 through TROTT-05

#### Multi-Operator Tasks

Multi-service engagements requiring providers from different operators (e.g. a moving job needing movers from Operator A
and security from Operator B) SHOULD be modelled as separate tasks, each with its own Operator Claim (kind 30550),
linked via `linked_task` tags with `coordinated` relationship type. Cross-operator coordination (e.g. shared scheduling,
combined billing) is an operator-level concern, not a protocol-level one. The protocol does not support multiple
Operator Claims on a single task.

### Kind 30551: PII Envelope

Published by the operator when personally identifiable information is received from a party. The envelope declares which
PII fields are held, the retention policy, and the erasure method. The actual PII is never in the Nostr event — it is
exchanged via NIP-17 gift-wrapped messages between the party and the operator, then stored in the operator's private
database (Layer 2).

```json
{
  "kind": 30551,
  "tags": [
    [
      "d",
      "pii_task_abc123_requester"
    ],
    [
      "domain",
      "ridesharing"
    ],
    [
      "task_id",
      "task_abc123"
    ],
    [
      "party",
      "requester"
    ],
    [
      "pii_fields",
      "real_name,phone_number,pickup_address"
    ],
    [
      "retention_policy",
      "task_duration_plus_90_days"
    ],
    [
      "retention_days",
      "90"
    ],
    [
      "erasure_method",
      "crypto_shredding"
    ],
    [
      "legal_basis",
      "legitimate_interest"
    ],
    [
      "data_controller",
      "<operator_pubkey>"
    ],
    [
      "privacy_policy_url",
      "https://operator.example.com/privacy"
    ],
    [
      "p",
      "<requester_pubkey>"
    ]
  ],
  "content": ""
}
```

**Required tags**: `d`, `task_id`, `party`, `pii_fields`, `retention_policy`, `erasure_method`
**Optional tags**: `domain`, `retention_days`, `legal_basis`, `data_controller`, `privacy_policy_url`, `p` (party
pubkey), `sensitivity_level`

#### PII Fields

The `pii_fields` tag is a comma-separated list of data categories the operator holds:

| Field              | Description                                    | GDPR Category                               |
|--------------------|------------------------------------------------|---------------------------------------------|
| `real_name`        | Legal name of the party                        | Directly identifying                        |
| `phone_number`     | Phone number                                   | Directly identifying                        |
| `email`            | E-mail address                                 | Directly identifying                        |
| `pickup_address`   | Exact collection/pickup address                | Location data (special category in context) |
| `delivery_address` | Exact delivery/destination address             | Location data                               |
| `payment_details`  | Card number, bank details, or wallet reference | Financial data                              |
| `photo_id`         | Government-issued ID scan                      | Biometric/identity document                 |
| `gps_trace`        | Detailed GPS trace during task                 | Location data                               |

| Tag                  | Optionality      | Format            | Description                                                                                        |
|----------------------|------------------|-------------------|----------------------------------------------------------------------------------------------------|
| `sensitivity_level`  | Optional         | Enumerated string | PII sensitivity classification: `standard`, `heightened`, `special_category`, `child_data`          |

#### PII Sensitivity Levels

| Level              | Description                                                          | Example Domains                          |
|--------------------|----------------------------------------------------------------------|------------------------------------------|
| `standard`         | Address and contact details                                          | Ridesharing, cleaning, pest control      |
| `heightened`        | Multiple addresses or security-relevant timing                       | Moving (two addresses), locksmith (locked out) |
| `special_category` | UK GDPR Article 9 data (health, biometric, genetic)                  | Healthcare, elderly care, disability services |
| `child_data`       | Information about children (Children Act 2004 obligations)           | Babysitting, tutoring, school runs       |

Operators SHOULD apply additional safeguards proportionate to the sensitivity level — for example, enhanced access
logging for `special_category` data, restricted delegation for `child_data`, and shorter retention periods for
`heightened` data.

#### Retention Policies

| Policy                       | Description                                                                    |
|------------------------------|--------------------------------------------------------------------------------|
| `task_duration_only`         | PII deleted immediately upon task completion                                   |
| `task_duration_plus_90_days` | PII retained for 90 days post-completion (for dispute resolution) then deleted |
| `regulatory_minimum`         | PII retained for the minimum period required by the applicable regulatory body |
| `custom`                     | Custom retention period specified in `retention_days`                          |

#### Erasure Methods

| Method              | Description                                                                                                                |
|---------------------|----------------------------------------------------------------------------------------------------------------------------|
| `crypto_shredding`  | PII is encrypted with a per-task key; erasure is achieved by destroying the key. Endorsed by CNIL for distributed systems. |
| `database_deletion` | PII is deleted from the operator's database directly                                                                       |
| `overwrite`         | PII is overwritten with random data before deletion                                                                        |

#### GDPR Alignment

This event aligns with GDPR principles:

- **Data minimisation** (Article 5(1)(c)): The `pii_fields` tag lists exactly which data is collected — no more
- **Storage limitation** (Article 5(1)(e)): The `retention_policy` and `retention_days` tags declare how long data is
  kept
- **Right to erasure** (Article 17): The `erasure_method` tag declares how data will be destroyed on request
- **Transparency** (Article 12): The event is a public, signed declaration of the operator's data practices for this
  task

The PII Envelope is a **transparency record**, not a data store. The actual PII is in the operator's private Layer 2
database, never on Nostr relays.

#### Per-Field Retention Variance

When data fields within a single task have different retention requirements (e.g. financial records requiring 7-year
retention vs GPS traces requiring 90-day retention vs clinical notes requiring 25-year retention), the operator SHOULD
publish separate PII Envelope events per retention category. Each envelope declares its own `retention_days` and
`pii_fields` tags, covering only the fields subject to that envelope's retention policy. This ensures GDPR-compliant
retention without forcing all data to the longest retention period.

#### Beneficiary PII Handling

When a Task Request (kind 30500) includes a `beneficiary_pubkey` tag (TROTT-01), the operator MUST handle PII for the
beneficiary using the same NIP-17 gift wrap mechanism as for the requester. The beneficiary is a distinct party whose
personal data (typically a delivery address, contact details, or access instructions) must be collected, stored, and
erased independently of the requester's data.

Operators SHOULD publish a separate PII Envelope (kind 30551) for the beneficiary with `["party", "beneficiary"]`:

```json
{
  "kind": 30551,
  "tags": [
    ["d", "pii_task_abc123_beneficiary"],
    ["domain", "delivery"],
    ["task_id", "task_abc123"],
    ["party", "beneficiary"],
    ["pii_fields", "real_name,phone_number,delivery_address"],
    ["retention_policy", "task_duration_plus_90_days"],
    ["retention_days", "90"],
    ["erasure_method", "crypto_shredding"],
    ["legal_basis", "legitimate_interest"],
    ["data_controller", "<operator_pubkey>"],
    ["p", "<beneficiary_pubkey>"]
  ],
  "content": ""
}
```

The `party` tag value `beneficiary` distinguishes this envelope from the requester's and provider's PII records.
Implementations MUST accept `beneficiary` alongside `requester` and `provider` as valid `party` values.

**GDPR considerations**: The beneficiary is a data subject in their own right. The operator has data controller
obligations to the beneficiary regardless of who initiated or is paying for the task. The beneficiary retains the right
to erasure (Article 17) independently of the requester. If the requester and beneficiary are in different jurisdictions,
the stricter data protection regime applies.

**PII exchange flow**: The requester provides the beneficiary's delivery address or contact details to the operator via
NIP-17 gift wrap. The operator stores this in Layer 2 and publishes the PII Envelope. The provider receives the
beneficiary's PII (e.g. delivery address) from the operator, also via NIP-17, only after task acceptance. The
beneficiary themselves need not interact with the protocol at all — their pubkey is used for status update delivery and
optional completion confirmation, not for PII submission.

### Kind 30552: Delegation Grant

Published by a party (requester or provider) to grant the operator scoped, temporary authority to act on their behalf
for a specific task. Delegations are strictly limited in scope, duration, and event kinds.

```json
{
  "kind": 30552,
  "tags": [
    ["d", "delegation_task_abc123_requester"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["delegator_pubkey", "<requester_hex>"],
    ["delegatee_pubkey", "<operator_hex>"],
    ["delegated_kinds", "30512,30510"],
    ["conditions", "task_scope_only"],
    ["valid_from", "1698765432"],
    ["valid_until", "1698851832"],
    ["revocable", "true"]
  ],
  "content": ""
}
```

**Required tags**: `d`, `task_id`, `delegator_pubkey`, `delegatee_pubkey`, `delegated_kinds`, `valid_until`
**Optional tags**: `domain`, `conditions`, `valid_from`, `revocable`

#### Scope Constraints

| Tag               | Constraint                                                                                                                   |
|-------------------|------------------------------------------------------------------------------------------------------------------------------|
| `delegated_kinds` | Comma-separated list of specific event kinds the operator may publish on the delegator's behalf                              |
| `conditions`      | `task_scope_only` — delegation applies only to events referencing this specific task ID                                      |
| `valid_until`     | Unix timestamp after which the delegation expires automatically                                                              |
| `revocable`       | If `true`, the delegator may revoke by publishing a new kind 30552 with the same `d` tag and an empty `delegated_kinds` list |

#### What Can Be Delegated

| Kind  | Description     | Common Delegation                                          |
|-------|-----------------|------------------------------------------------------------|
| 30503 | Task Update     | Operator publishes state transitions on behalf of provider |
| 30536 | Streaming Tick  | Operator publishes payment ticks on behalf of requester    |
| 30535 | Payment Receipt | Operator confirms payment settlement                       |
| 30533 | Stake Release   | Operator releases stakes on successful completion          |
| 30534 | Stake Forfeit   | Operator forfeits stakes on cancellation/no-show           |

#### What MUST NOT Be Delegated

- **Kind 30520** (Task Rating) — Ratings must be signed by the rater's own key to preserve reputation integrity
- **Kind 30543** (Dispute Claims) — Disputes must be filed by the actual complainant
- **Kind 30540** (Emergency Signals) — Safety signals must come from the actual person in distress

### Kind 30553: Compliance Record

Published by the operator to attest that a specific compliance verification has been performed. Compliance records are
append-only (not replaceable) to create an auditable history.

```json
{
  "kind": 30553,
  "tags": [
    [
      "d",
      "compliance_provider_<hex>_dbs_check_1698765432"
    ],
    [
      "domain",
      "ridesharing"
    ],
    [
      "p",
      "<provider_pubkey>"
    ],
    [
      "compliance_type",
      "dbs_check"
    ],
    [
      "verification_method",
      "onfido_enhanced_dbs"
    ],
    [
      "result",
      "passed"
    ],
    [
      "verified_at",
      "1698765432"
    ],
    [
      "valid_until",
      "1701443832"
    ],
    [
      "regulatory_body",
      "disclosure_and_barring_service"
    ],
    [
      "reference_number",
      "<redacted_reference>"
    ],
    [
      "operator_pubkey",
      "<hex>"
    ]
  ],
  "content": ""
}
```

**Required tags**: `d`, `p` (verified party), `compliance_type`, `result`, `verified_at`
**Optional tags**: `domain`, `verification_method`, `valid_until`, `regulatory_body`, `reference_number`,
`operator_pubkey`

#### Compliance Types

| Type                           | Description                                                         | Regulatory Body (UK examples)          |
|--------------------------------|---------------------------------------------------------------------|----------------------------------------|
| `provider_credential_verified` | General identity and credential verification                        | Varies                                 |
| `insurance_confirmed`          | Professional indemnity or public liability insurance verified       | Financial Conduct Authority            |
| `right_to_work`                | Right-to-work check passed                                          | Home Office                            |
| `dbs_check`                    | Disclosure and Barring Service check (basic, standard, or enhanced) | Disclosure and Barring Service         |
| `vehicle_check`                | Vehicle roadworthiness, MOT, insurance                              | DVLA / DVSA                            |
| `pii_erasure_complete`         | Confirmation that PII has been erased per retention policy          | Information Commissioner's Office      |
| `gas_safe`                     | Gas Safe Register verification                                      | Gas Safe Register                      |
| `sia_licence`                  | Security Industry Authority licence verification                    | Security Industry Authority            |
| `phv_licence`                  | Private hire vehicle licence verification                           | Transport for London / local authority |

#### Verification Methods

| Method                   | Description                                       |
|--------------------------|---------------------------------------------------|
| `onfido_enhanced_dbs`    | Onfido digital identity + enhanced DBS check      |
| `checkr_background`      | Checkr background screening                       |
| `manual_document_review` | Operator staff manually reviewed documents        |
| `api_registry_check`     | Automated check against a regulatory registry API |
| `self_declaration`       | Provider self-declared (lowest assurance)         |

The `result` tag accepts: `passed`, `failed`, `pending`, `expired`.

### Kind 30554: Operator Heartbeat

Published by the operator every 5-10 minutes to signal liveness. A stale or missing heartbeat is a warning signal to
participants — the operator may be offline, compromised, or abandoned.

```json
{
  "kind": 30554,
  "tags": [
    [
      "d",
      "<operator_pubkey>_heartbeat"
    ],
    [
      "operator_pubkey",
      "<hex>"
    ],
    [
      "active_tasks",
      "23"
    ],
    [
      "domains",
      "ridesharing,locksmith,delivery"
    ],
    [
      "uptime_seconds",
      "8640000"
    ],
    [
      "uptime_percent",
      "99.97"
    ],
    [
      "version",
      "3.2.1"
    ],
    [
      "active_providers",
      "142"
    ],
    [
      "active_requesters",
      "89"
    ],
    [
      "tasks_completed_24h",
      "312"
    ],
    [
      "average_response_seconds",
      "4.2"
    ],
    [
      "expiration",
      "1698766032"
    ]
  ],
  "content": ""
}
```

**Required tags**: `d` (operator pubkey + `_heartbeat`), `operator_pubkey`, `active_tasks`, `expiration`
**Optional tags**: `domains`, `uptime_seconds`, `uptime_percent`, `version`, `active_providers`, `active_requesters`,
`tasks_completed_24h`, `average_response_seconds`

The `expiration` tag (NIP-40) MUST be set to the current time plus 10 minutes (600 seconds). If the operator fails to
publish a new heartbeat before the previous one expires, relays will automatically discard the stale event and clients
will see that the operator has gone silent.

#### Heartbeat Monitoring

Clients and participants SHOULD monitor operator heartbeats and apply the following thresholds:

| Condition                            | Severity | Action                                                                                           |
|--------------------------------------|----------|--------------------------------------------------------------------------------------------------|
| Heartbeat received within 10 minutes | Normal   | No action                                                                                        |
| No heartbeat for 10-30 minutes       | Warning  | Display a warning to active participants                                                         |
| No heartbeat for 30-60 minutes       | Critical | Alert participants; suggest contacting safety contacts                                           |
| No heartbeat for >60 minutes         | Offline  | Treat operator as offline; participants should seek alternative operators or settle peer-to-peer |

### Kind 30555: Compliance Snapshot

Published by the operator at task start. Append-only (not replaceable) to create an auditable record of which compliance
checks were current when a task began. If a compliance record (kind 30553) expires mid-task, the snapshot proves what
was verified at match time.

```json
{
  "kind": 30555,
  "pubkey": "<operator_hex_pubkey>",
  "created_at": 1698765200,
  "tags": [
    [
      "d",
      "task_abc123:compliance"
    ],
    [
      "domain",
      "ridesharing"
    ],
    [
      "task_id",
      "task_abc123"
    ],
    [
      "provider_pubkey",
      "<provider_hex_pubkey>"
    ],
    [
      "e",
      "<compliance_insurance_event_id>",
      "wss://relay.example.com"
    ],
    [
      "e",
      "<compliance_phv_licence_event_id>",
      "wss://relay.example.com"
    ],
    [
      "e",
      "<compliance_dbs_event_id>",
      "wss://relay.example.com"
    ],
    [
      "checks",
      "insurance_confirmed,phv_licence,dbs_check"
    ],
    [
      "snapshot_at",
      "1698765200"
    ]
  ],
  "content": ""
}
```

**Required tags**: `d`, `task_id`, `provider_pubkey`, `checks`, `snapshot_at`
**Optional tags**: `domain`, `e` (compliance record references)

The `e` tags reference the specific Compliance Record (kind 30553) events that were valid at the time of the snapshot.
For example: "At the time this task started, provider X had valid insurance (ref: event abc), valid PHV licence (ref:
event def), and a passed DBS check (ref: event ghi)." This allows any auditor to independently verify that the
referenced compliance records were indeed current at `snapshot_at`.

---

## Three-Layer Architecture

The protocol operates across three architectural layers. Each layer has different persistence, privacy, and performance
characteristics.

```
LAYER 1: NOSTR (public, permanent, pseudonymous)
    Discovery + Reputation + Lifecycle + Payments + Operator Bonds
    Pubkeys only — no PII

LAYER 2: OPERATOR (private, compliant, auditable)
    PII + Payment Processing + Compliance + Coordination
    GDPR-subject — full data controller obligations

LAYER 3: EPHEMERAL (real-time, temporary)
    Live Tracking + ETA Updates + Chat + Status Streams
    WebSocket — never persisted on relays or in databases
```

### Layer 1: Nostr (Public)

All events defined in TROTT-01 through TROTT-05 and TROTT-07 live on Layer 1. These are published to standard Nostr
relays and are:

- **Permanent** — Relays store them indefinitely (subject to relay policies)
- **Pseudonymous** — Identified by Nostr pubkeys only, never real names or addresses
- **Verifiable** — Every event is cryptographically signed and independently verifiable
- **Portable** — Users can take their event history to any relay or operator

**What is on Layer 1**: Service requests, acceptances, cancellations, stake locks/releases, ratings, reputation
summaries, dispute claims and resolutions, emergency signals, operator bonds, compliance records, heartbeats.

**What is NEVER on Layer 1**: Real names, phone numbers, e-mail addresses, street addresses, payment card numbers, GPS
traces, government ID scans.

### Layer 2: Operator (Private)

The operator's private database and API. This is a traditional server with standard data protection obligations:

- **Private** — Accessible only via the operator's authenticated API
- **Compliant** — Subject to GDPR, CCPA, or equivalent data protection regulation in the operator's jurisdiction
- **Auditable** — The operator publishes kind 30551 (PII Envelope) events on Layer 1 declaring what data they hold, for
  how long, and how they will erase it
- **Ephemeral by policy** — Data is retained only as long as the declared retention policy permits

**What is on Layer 2**: Exact addresses, real names, phone numbers, payment credentials, GPS traces (for dispute
evidence), compliance documentation, identity verification results.

**What moves between Layer 1 and Layer 2**: PII is exchanged via NIP-17 gift-wrapped messages between the party and the
operator. The encrypted exchange happens on Nostr relays (Layer 1 transport), but only the operator can decrypt the
content (Layer 2 storage). The relay sees an opaque gift-wrapped message; it cannot read the PII.

### Layer 3: Ephemeral (Real-time)

The WebSocket connection between the operator and active participants. This layer provides:

- **Real-time** — Sub-second location updates and status changes
- **Temporary** — Data exists only in memory during the active task
- **Never persisted** — WebSocket messages are not stored in databases or on relays after the connection closes
- **Operator-mediated** — The operator relays location from provider to requester, applying any privacy controls (e.g.
  hiding exact provider location until acceptance)

**What is on Layer 3**: Live GPS coordinates, real-time ETA calculations, chat messages during active tasks, status
change notifications.

The `ephemeral_endpoint` tag on the Operator Claim (kind 30550) provides the WebSocket URL. Participants connect after
task matching and disconnect after task completion.

#### Layer 3 Alternatives

For operators that prefer not to run WebSocket infrastructure, TROTT-07 defines ephemeral Nostr events (kind 20501,
Location Update) as an alternative transport for real-time location data. Both approaches achieve the same result; the
operator chooses which to implement.

---

## P2P vs Operator Comparison

The protocol works at two levels: fully peer-to-peer (no operator) or operator-mediated. The table below compares
capabilities:

| Capability         | P2P (No Operator)                                          | With Operator                                                 |
|--------------------|------------------------------------------------------------|---------------------------------------------------------------|
| Discovery          | Nostr relay filters (geohash, tags)                        | Same + operator-curated matching                              |
| Stake locking      | NIP-47 hold invoices (both parties need Lightning wallets) | Operator provides custodial escrow (any payment method)       |
| PII exchange       | NIP-17 directly between parties                            | NIP-17 to operator; operator handles storage and compliance   |
| Live tracking      | Ephemeral Nostr events (kind 20501)                        | WebSocket (sub-second updates)                                |
| Dispute resolution | Mutual or community models only                            | Operator, community, mutual, or automated                     |
| Compliance         | No verification infrastructure                             | Background checks, insurance, licensing (kind 30553)          |
| Safety monitoring  | Safety contacts only (kind 30542)                          | 24/7 operator safety team + safety contacts                   |
| Fee                | Zero (no intermediary)                                     | Operator fee (kind 30550 declares fee model)                  |
| UX complexity      | High (key management, relay management, wallet setup)      | Low (single API endpoint)                                     |
| Trust assumption   | Trustless (NIP-47 + signed events)                         | Trust the operator (constrained by bond + reputation)         |
| Availability       | Depends on relay uptime                                    | Depends on operator uptime (kind 30554 heartbeat)             |
| Data portability   | Full (all events on public relays)                         | Full (all events on public relays; only PII is operator-held) |

### When to Use an Operator

- **Mainstream markets** — Users who cannot manage Lightning wallets or Nostr keys benefit from operator-provided
  custodial rails and simple UX
- **Regulated domains** — Ridesharing, security guard dispatch, and emergency trades require compliance verification
  that only a legal entity can provide
- **High-value tasks** — Tasks above a certain value benefit from escrow, insurance, and professional dispute mediation
- **Safety-critical domains** — 24/7 safety monitoring requires a staffed operations centre

### When to Go P2P

- **Privacy-maximising users** — Users who prioritise sovereignty and minimise third-party trust
- **Low-value casual tasks** — Dog walking between neighbours, informal courier runs, community favours
- **High-trust social contexts** — Tasks between NIP-02 mutual follows with established reputation history
- **Operator-hostile jurisdictions** — Regions where operating a coordination service is legally complex

---

## Internationalisation

The TROTT protocol does not mandate a single language. Implementations SHOULD support language preferences at multiple
levels:

- **Task Request (kind 30500)** MAY include a `language` tag (ISO 639-1 code, e.g. `en`, `fr`, `de`) indicating the
  requester's preferred language for communication during the task
- **Provider Profile (kind 30510)** already supports a `languages` tag (comma-separated ISO 639-1 codes) — discovery
  clients SHOULD filter or rank results by language match when the requester specifies a preference
- **Requester Profile (kind 30513)** supports a `languages` tag for the same purpose, allowing providers to assess
  communication compatibility before accepting a task
- **Task Rating (kind 30520)** MAY include a `language` tag indicating the language in which the review text is written,
  enabling clients to filter or translate reviews
- **Operator Claim (kind 30550)** MAY include a `supported_languages` tag (comma-separated ISO 639-1 codes) declaring
  the languages the operator's support team can handle

Domain profiles are authored in English as the canonical language. Community translations of domain profiles are out of
scope for the protocol, but implementations SHOULD support localised UI labels driven by the domain profile's role and
label definitions.

---

## Operator Accountability

Operators are constrained by six accountability mechanisms, drawn from across the TROTT specification family:

| Mechanism              | Specification        | Description                                                                                                                            |
|------------------------|----------------------|----------------------------------------------------------------------------------------------------------------------------------------|
| **Bond**               | TROTT-02             | Operator Bond (kind 30511) — a public, verifiable financial commitment. Subject to slashing by guardian network for proven misconduct. |
| **Reputation**         | TROTT-03             | Operator reputation computed from Task Ratings (kind 30520). Low-reputation operators lose users to competitors.                       |
| **Fee transparency**   | TROTT-06 (this spec) | Every operator claim (kind 30550) declares the fee model and rate. Hidden fees are impossible — the claim is a signed public event.    |
| **Compliance records** | TROTT-06 (this spec) | Kind 30553 events create an auditable trail of verification actions.                                                                   |
| **Heartbeat**          | TROTT-06 (this spec) | Kind 30554 heartbeats prove liveness. Stale operators are visible to all participants.                                                 |
| **Dispute history**    | TROTT-05             | All disputes filed against the operator and their resolutions are public, signed events on Nostr relays.                               |

### Operator Selection

When multiple operators claim a task (multiple kind 30550 events for the same task), clients SHOULD display a comparison
based on:

1. **Bond size** — Higher bond = more skin in the game
2. **Fee rate** — Lower fee = cheaper for participants
3. **Reputation score** — Higher reputation = better historical performance
4. **Dispute resolution rate** — Higher rate = disputes are handled fairly
5. **Heartbeat freshness** — Recent heartbeat = operator is active
6. **Declared services** — Match the participant's needs (e.g. `live_tracking` for ridesharing,`compliance_verification`
   for regulated domains)
7. **Trust model** — Users who prefer sovereignty see operators offering `trustless` NIP-47 payment rails; users who
   prefer convenience see operators offering `operator-escrow` fiat rails

---

## See Also

- **TROTT-01**: Core service coordination protocol (state machine, lifecycle events)
- **TROTT-02**: Discovery — Operator Bond (30511), Provider Profile (30510)
- **TROTT-03**: Reputation — Operator reputation, WoT weighting
- **TROTT-04**: Payments — Payment processing, fee settlement, stake management
- **TROTT-05**: Safety — Emergency signals, dispute resolution
- **TROTT-07**: Navigation — Routing, ETA, live tracking as alternative to WebSocket
- **TROTT-08**: Messaging — Task-scoped messaging and user preferences
- **NIP-01**: Basic Nostr protocol
- **NIP-17**: Private direct messages (PII exchange via gift wrap)
- **NIP-33**: Parameterised replaceable events
- **NIP-44**: Encrypted payloads
- **NIP-59**: Gift wrap (outer layer for NIP-17)
- **docs/GDPR-COMPLIANCE.md**: Full GDPR compliance guide for operators
