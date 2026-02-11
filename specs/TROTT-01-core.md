# TROTT-01: Core — Task Lifecycle & State Machine

`draft` `mandatory`

## Abstract

This specification defines the **core task lifecycle and state machine** for TROTT (Trust-minimised Real-world
Operational Task Transactions) — an open protocol standard for coordinating physical services between strangers over
Nostr. TROTT-01 is the foundation specification. Every TROTT implementation MUST implement this spec.

TROTT-01 defines eight parameterised replaceable event kinds (30500-30507) covering the complete lifecycle of a task
from request through completion or cancellation. It specifies a universal state machine with domain extension points,
enabling any service domain (ridesharing, locksmith dispatch, parcel delivery, towing, pet services, security guard
dispatch, and more) to operate on a common protocol backbone.

## Motivation

Traditional service platforms use proprietary APIs and closed data formats, creating vendor lock-in for both requesters
and providers. TROTT-01 defines a **common task lifecycle** on Nostr that enables:

- **Interoperability** — Any TROTT-compliant client can interact with any TROTT-compliant operator
- **Data portability** — Task history follows the user's Nostr keypair, not a platform account
- **Domain extensibility** — New service domains are added by extending the core state machine, not by forking the
  protocol
- **Auditability** — All state transitions are cryptographically signed and publicly verifiable on Nostr relays

## Depends On

- **NIP-01**: Basic Protocol Flow and Event Format
- **NIP-33**: Parameterised Replaceable Events (all TROTT lifecycle events use `d` tags)
- **NIP-40**: Expiration Timestamp (`expiration` tag on all time-limited events)

## Terminology

| Term          | Description                                           | Examples                          |
|---------------|-------------------------------------------------------|-----------------------------------|
| **Requester** | The party requesting a service                        | Rider, customer, sender, patient  |
| **Provider**  | The party fulfilling a service                        | Driver, locksmith, courier, guard |
| **Task**      | A single unit of service coordination                 | Ride, callout, delivery, shift    |
| **Operator**  | The server coordinating tasks and managing compliance | A TROTT relay instance            |

Domain extension specs (e.g. TROTT-ridesharing) MAY define aliases for these terms. Implementations SHOULD accept both
the generic and domain-specific forms interchangeably.

---

## Event Kinds

All event kinds in this specification are **parameterised replaceable** (NIP-33). Each event MUST include a `d` tag
containing the task identifier. Relays replace earlier versions of the same event (same `pubkey` + `kind` + `d` tag)with
the latest version.

| Kind  | Name          | Publisher             | Description                                              |
|-------|---------------|-----------------------|----------------------------------------------------------|
| 30500 | Task Request  | Requester             | "I need something done"                                  |
| 30501 | Task Offer    | Provider              | "I can do this" (optionally with a quote)                |
| 30502 | Task Accept   | Requester or Provider | Requester picks an offer, or provider accepts a request  |
| 30503 | Task Update   | Provider or Operator  | State transition between accept and complete             |
| 30504 | Task Complete | Provider              | Provider declares work finished with completion proof    |
| 30505 | Task Confirm  | Requester             | Requester confirms completion (triggers payment release) |
| 30506 | Task Cancel   | Either party          | Cancellation with reason code                            |
| 30507 | Task Dispute  | Either party          | Escalate to TROTT-05 (Dispute Resolution)                |

---

## Core Tags

The following tags MUST or SHOULD appear on every TROTT event, as indicated.

| Tag          | Required | Description                                            | Example                              |
|--------------|----------|--------------------------------------------------------|--------------------------------------|
| `d`          | MUST     | Task identifier (NIP-33 parameterised replaceable key) | `["d", "task_abc123"]`               |
| `domain`     | SHOULD   | Service domain identifier                              | `["domain", "ridesharing"]`          |
| `status`     | MUST     | Current task state (from the state machine)            | `["status", "in_progress"]`          |
| `t`          | MUST     | Fixed tag `trott-task` for relay filtering             | `["t", "trott-task"]`                |
| `expiration` | SHOULD   | Event expiration unix timestamp (NIP-40)               | `["expiration", "1698769032"]`       |
| `p`          | SHOULD   | Pubkey of the other party or parties                   | `["p", "<hex_pubkey>"]`              |
| `e`          | SHOULD   | Reference to a related event                           | `["e", "<event_id>", "<relay_url>"]` |

### Monetary Tags

Events that reference monetary values MUST include all three of the following tags:

| Tag           | Description                                             | Example                              |
|---------------|---------------------------------------------------------|--------------------------------------|
| `amount`      | Value in the smallest unit of the specified currency    | `["amount", "1500"]`                 |
| `currency`    | ISO 4217 fiat code or well-known crypto code (BTC, SAT) | `["currency", "GBP"]`                |
| `trust_model` | Payment provider trust model                            | `["trust_model", "operator-escrow"]` |

### Party Tags

| Tag                   | Description                                                   | Example                            |
|-----------------------|---------------------------------------------------------------|------------------------------------|
| `requester_pubkey`    | Requester's Nostr hex pubkey                                  | `["requester_pubkey", "<hex>"]`    |
| `provider_pubkey`     | Provider's Nostr hex pubkey                                   | `["provider_pubkey", "<hex>"]`     |
| `operator_pubkey`     | Coordinating operator's Nostr hex pubkey                      | `["operator_pubkey", "<hex>"]`     |
| `beneficiary_pubkey`  | Optional. Pubkey of the service recipient if different from the requester | `["beneficiary_pubkey", "<hex>"]`  |

#### Beneficiary

When `beneficiary_pubkey` is present, the requester is paying for a service delivered to a different person (the
beneficiary). The beneficiary receives status updates, MAY confirm completion (kind 30505), and MAY need PII exchange
via TROTT-06 (e.g. delivery address). The requester remains the paying party and retains cancellation rights.

Common scenarios: grocery delivery for elderly parents, pharmacy delivery to patients, flower delivery to recipients,
school runs (parent books, child rides), non-emergency medical transport (GP/hospital books, patient travels).

If an operator is coordinating (TROTT-06), it SHOULD handle PII for the beneficiary using the same NIP-17 gift wrap
mechanism as for the requester. See TROTT-06 for beneficiary PII handling guidance.

### Location Tags

| Tag               | Description                                                    | Example                          |
|-------------------|----------------------------------------------------------------|----------------------------------|
| `location_lat`    | Primary task location latitude                                 | `["location_lat", "51.5074"]`    |
| `location_lon`    | Primary task location longitude                                | `["location_lon", "-0.1278"]`    |
| `destination_lat` | Destination latitude (if applicable)                           | `["destination_lat", "51.5155"]` |
| `destination_lon` | Destination longitude (if applicable)                          | `["destination_lon", "-0.1416"]` |
| `g`               | Geohash for privacy-preserving discovery (multiple precisions) | `["g", "gcpuuz"]`                |

Domain extensions MAY define aliases for location tags (e.g. `pickup_lat` for ridesharing, `lockout_lat` for locksmith).
Implementations MUST accept both the generic and aliased forms.

### Scheduling Tags

| Tag               | Required | Description                                    | Example                             |
|-------------------|----------|------------------------------------------------|-------------------------------------|
| `scheduled_start` | Optional | Planned start time (unix timestamp)            | `["scheduled_start", "1698765600"]` |
| `recurrence`      | Optional | Recurrence frequency                           | `["recurrence", "weekly"]`          |
| `recurrence_end`  | Optional | End date for recurring series (unix timestamp) | `["recurrence_end", "1730000000"]`  |
| `scheduled_end`    | Optional | Planned end time (unix timestamp)              | `["scheduled_end", "1699004400"]`   |
| `expected_duration`| Optional | Expected service duration in seconds           | `["expected_duration", "3600"]`     |
| `urgency`          | Optional | Request urgency level                          | `["urgency", "standard"]`          |

Valid recurrence values: `daily`, `weekdays`, `weekly`, `biweekly`, `monthly`.

---

## State Machine

### Universal Core States

All TROTT domains share the following core state machine. States are divided into the **quoting phase** (optional), the*
*core flow** (mandatory), and **branch states** (reachable from multiple points).

```
                        QUOTING PHASE (optional)
                        ========================

    requested ──────────→ offers_open ──────────→ accepted
        │                 (multiple 30501          │
        │                  Task Offers)            │
        │                                          │
        └──────────────────────────────────────────┘
              (direct accept, no quoting)

                        CORE FLOW (mandatory)
                        =====================

    accepted ──→ in_progress ──→ completed ──→ confirmed
                     │
                     │  (domain-specific sub-states
                     │   inserted here — see below)
                     │

                        BRANCH STATES
                        =============

    cancelled   (reachable from: accepted, in_progress, completed)
    no_show     (reachable from: in_progress; also via disputed resolution)
    disputed    (reachable from: accepted, in_progress, completed)
```

### State Definitions

| State         | Phase   | Description                                                                                                                                        |
|---------------|---------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| `requested`   | Quoting | Requester has published a Task Request (30500). Awaiting offers or direct acceptance.                                                              |
| `offers_open` | Quoting | One or more providers have published Task Offers (30501). Requester is reviewing offers.                                                           |
| `accepted`    | Core    | A match has been made. Either the requester picked an offer (30502) or a provider directly accepted the request (30502). Stakes may now be locked. |
| `in_progress` | Core    | Work is underway. Domain-specific sub-states are inserted within this phase.                                                                       |
| `completed`   | Core    | Provider has declared work finished (30504) with completion proof. Awaiting requester confirmation.                                                |
| `confirmed`   | Core    | Requester has confirmed completion (30505). Payment is released. This is a **terminal state**.                                                     |
| `cancelled`   | Branch  | Task cancelled by either party (30506) with a reason code. This is a **terminal state**.                                                           |
| `disputed`    | Branch  | Task escalated to dispute resolution (30507). Remains in this state until resolved. See TROTT-05.                                                  |
| `no_show`     | Branch  | One party failed to appear after commitment. Triggers automatic stake forfeiture for the absent party. This is a **terminal state**.               |

**Terminal states**: `confirmed`, `cancelled`, `no_show`. A `disputed` task transitions to `confirmed`, `cancelled`, or
`no_show` upon resolution.

### Allowed Transitions

| From          | To            | Triggered By                                                                                          |
|---------------|---------------|-------------------------------------------------------------------------------------------------------|
| `requested`   | `offers_open` | Provider publishes Task Offer (30501)                                                                 |
| `requested`   | `accepted`    | Provider publishes Task Accept (30502) — direct accept, no quoting                                    |
| `requested`   | `cancelled`   | Either party publishes Task Cancel (30506)                                                            |
| `offers_open` | `offers_open` | Additional Task Offers (30501) arrive                                                                 |
| `offers_open` | `accepted`    | Requester publishes Task Accept (30502) picking an offer                                              |
| `offers_open` | `cancelled`   | Requester publishes Task Cancel (30506)                                                               |
| `accepted`    | `in_progress` | Provider publishes Task Update (30503) with domain-appropriate sub-state                              |
| `accepted`    | `cancelled`   | Either party publishes Task Cancel (30506)                                                            |
| `accepted`    | `disputed`    | Either party publishes Task Dispute (30507)                                                           |
| `in_progress` | `completed`   | Provider publishes Task Complete (30504)                                                              |
| `in_progress` | `cancelled`   | Either party publishes Task Cancel (30506)                                                            |
| `in_progress` | `disputed`    | Either party publishes Task Dispute (30507)                                                           |
| `completed`   | `confirmed`   | Requester publishes Task Confirm (30505)                                                              |
| `completed`   | `disputed`    | Either party publishes Task Dispute (30507)                                                           |
| `disputed`    | `confirmed`   | Resolved in favour of completion                                                                      |
| `disputed`    | `cancelled`   | Resolved by cancellation/refund                                                                       |
| `disputed`    | `no_show`     | Resolved as no-show by absent party                                                                   |
| `in_progress` | `no_show`     | Either party publishes Task Cancel (30506) with reason_code `requester_no_show` or `provider_no_show` |

### Domain Extension Points

Domains insert sub-states **within** the `in_progress` phase. The core protocol treats the entire sub-state sequence as
`in_progress`; domain-aware clients render the sub-states for richer UX.

**Example: Ridesharing**

```
accepted → provider_en_route → provider_arrived → trip_active → completed
```

The sub-states `provider_en_route`, `provider_arrived`, and `trip_active` are all sub-states of `in_progress`. A
core-only client sees: `accepted → in_progress → completed`. A ridesharing-aware client sees the full sequence.

**Example: Locksmith**

```
accepted → provider_en_route → provider_arrived → access_method_confirmed → work_active → completed
```

**Example: Delivery**

```
accepted → en_route_to_pickup → collected → in_transit → delivered → completed
```

#### Looping Sub-States

Some domains define sub-states that cycle repeatedly during `in_progress` — for example, a security guard cycling
between `on_station`, `patrolling`, and `incident` throughout an 8-hour shift. Looping sub-states are explicitly
permitted: the domain profile's `transitions` object defines valid transitions between sub-states without restricting
the number of times each transition may occur.

Domains with cycling sub-states SHOULD use TROTT-05 Safety Check-in events (kind 30541) for periodic status signals
rather than publishing Task Update (kind 30503) events for each cycle. Task Update events SHOULD be reserved for
transitions between distinct operational phases (e.g. `briefed → on_station`, `on_station → shift_complete`). This
reduces event volume and distinguishes routine status from genuine state changes.

Domain extension specs define:

1. The ordered list of sub-states within `in_progress`
2. Valid transitions between sub-states
3. Which sub-states are optional (may be skipped)
4. Domain-specific tags required at each sub-state transition

### Quoting Phase

The quoting phase is **optional**. Domains that use flat-rate or negotiated pricing (locksmith, emergency trades)
typically enable quoting. Domains with algorithmic pricing (ridesharing) typically skip it.

When the quoting phase is active:

1. Requester publishes a Task Request (30500) with `["status", "requested"]`
2. Multiple providers publish Task Offers (30501) with quotes
3. The task transitions to `offers_open` when the first offer arrives
4. The requester reviews offers and publishes a Task Accept (30502) referencing the chosen offer
5. The task transitions to `accepted`

When the quoting phase is skipped:

1. Requester publishes a Task Request (30500) with `["status", "requested"]`
2. A provider publishes a Task Accept (30502) directly
3. The task transitions to `accepted` immediately

---

## Event Structures

### Kind 30500: Task Request

Published by the requester to announce "I need something done." This is the entry point for every task.

```json
{
  "kind": 30500,
  "pubkey": "<requester_hex_pubkey>",
  "created_at": 1698765432,
  "tags": [
    ["d", "task_abc123"],
    ["domain", "ridesharing"],
    ["status", "requested"],
    ["t", "trott-task"],
    ["requester_pubkey", "<requester_hex_pubkey>"],
    ["location_lat", "51.5074"],
    ["location_lon", "-0.1278"],
    ["destination_lat", "51.5155"],
    ["destination_lon", "-0.1416"],
    ["g", "gcpuu"],
    ["g", "gcpu"],
    ["amount", "1500"],
    ["currency", "GBP"],
    ["trust_model", "fiat-escrow"],
    ["expiration", "1698769032"]
  ],
  "content": "Need a ride to Paddington Station"
}
```

**Required tags**: `d`, `status`, `t`, `requester_pubkey`

**Conditionally required**: `location_lat`, `location_lon` (REQUIRED for geohash-discovered services, OPTIONAL for
virtual or category-discovered services)

**Optional tags**: `domain`, `destination_lat`, `destination_lon`, `g`, `amount`, `currency`, `trust_model`,
`expiration`, `scheduled_start`, `scheduled_end`, `recurrence`, `recurrence_end`, `expected_duration`, `urgency`,
`provider_count`

**Validation rules**:

- `status` MUST be `requested`
- `d` tag MUST be globally unique (implementations SHOULD use UUIDs or similar)
- If `amount` is present, `currency` MUST also be present
- If `expiration` is present, it MUST be a future unix timestamp at time of creation
- The `t` tag MUST be `trott-task`

#### Scheduling

A Task Request MAY include scheduling tags for future or recurring tasks:

```json
{
  "kind": 30500,
  "pubkey": "<requester_hex_pubkey>",
  "created_at": 1698765432,
  "tags": [
    ["d", "task_weekly_clean_001"],
    ["domain", "cleaning"],
    ["status", "requested"],
    ["t", "trott-task"],
    ["requester_pubkey", "<requester_hex_pubkey>"],
    ["location_lat", "51.5074"],
    ["location_lon", "-0.1278"],
    ["scheduled_start", "1699000800"],
    ["recurrence", "weekly"],
    ["recurrence_end", "1730000000"],
    ["amount", "5000"],
    ["currency", "GBP"],
    ["expiration", "1698855432"]
  ],
  "content": "Weekly house clean — 3-bedroom terraced house"
}
```

#### Standing Offers

Some services operate on an inverted flow — the provider advertises persistent availability and requesters respond
(e.g. a knife sharpener at a weekly market, a walk-in barber). Standing-offer services SHOULD publish a Provider Profile
(TROTT-02, kind 30510) with a `standing_offer` tag set to `true` and `availability_schedule` tags describing when the
service is available. Requesters discover these via category search (TROTT-02 Mode 2) and create normal Task Request
events (kind 30500) referencing the provider's profile.

#### Long-Lived Tasks

Tasks with expected durations exceeding 24 hours (e.g. equipment rental, construction projects, guarantee periods)
SHOULD use `scheduled_start` and `scheduled_end` tags to define the service window. Relay operators SHOULD retain task
events for at least 90 days after the task's final state transition. For guarantee periods, use `linked_task` with
`guarantee` relationship type to create a follow-up obligation rather than keeping the original task open indefinitely.

### Kind 30501: Task Offer

Published by a provider to say "I can do this." Optionally includes a quote. Multiple providers MAY publish offers for
the same task, enabling the requester to choose.

```json
{
  "kind": 30501,
  "pubkey": "<provider_hex_pubkey>",
  "created_at": 1698765500,
  "tags": [
    ["d", "task_abc123"],
    ["domain", "locksmith"],
    ["status", "offers_open"],
    ["t", "trott-task"],
    ["e", "<task_request_event_id>", "wss://relay.example.com"],
    ["p", "<requester_hex_pubkey>"],
    ["provider_pubkey", "<provider_hex_pubkey>"],
    ["amount", "7500"],
    ["currency", "GBP"],
    ["trust_model", "operator-escrow"],
    ["estimated_arrival", "15"],
    ["expiration", "1698769032"]
  ],
  "content": "Standard lock — non-destructive entry. If drilling is needed, I will requote before proceeding."
}
```

**Required tags**: `d`, `t`, `e` (referencing the Task Request), `provider_pubkey`

**Optional tags**: `domain`, `status`, `p`, `amount`, `currency`, `trust_model`, `estimated_arrival`, `expiration`

**Validation rules**:

- The `e` tag MUST reference a valid Task Request (30500) event
- The `d` tag MUST match the `d` tag of the referenced Task Request
- If `amount` is present, `currency` MUST also be present
- `estimated_arrival` is in minutes

### Kind 30502: Task Accept

Published to formalise a match. Two usage patterns:

1. **Requester picks an offer** — The requester publishes a Task Accept referencing a specific Task Offer (30501)
2. **Provider accepts directly** — The provider publishes a Task Accept referencing the Task Request (30500), skipping
   the quoting phase

#### Pattern 1: Requester Picks an Offer

```json
{
  "kind": 30502,
  "pubkey": "<requester_hex_pubkey>",
  "created_at": 1698765600,
  "tags": [
    ["d", "task_abc123"],
    ["domain", "locksmith"],
    ["status", "accepted"],
    ["t", "trott-task"],
    ["e", "<task_offer_event_id>", "wss://relay.example.com"],
    ["p", "<provider_hex_pubkey>"],
    ["requester_pubkey", "<requester_hex_pubkey>"],
    ["provider_pubkey", "<provider_hex_pubkey>"],
    ["amount", "7500"],
    ["currency", "GBP"],
    ["trust_model", "operator-escrow"],
    ["expiration", "1698769032"]
  ],
  "content": ""
}
```

#### Pattern 2: Provider Accepts Directly

```json
{
  "kind": 30502,
  "pubkey": "<provider_hex_pubkey>",
  "created_at": 1698765600,
  "tags": [
    ["d", "task_abc123"],
    ["domain", "ridesharing"],
    ["status", "accepted"],
    ["t", "trott-task"],
    ["e", "<task_request_event_id>", "wss://relay.example.com"],
    ["p", "<requester_hex_pubkey>"],
    ["requester_pubkey", "<requester_hex_pubkey>"],
    ["provider_pubkey", "<provider_hex_pubkey>"],
    ["estimated_arrival", "8"],
    ["amount", "1500"],
    ["currency", "GBP"],
    ["trust_model", "fiat-escrow"],
    ["expiration", "1698769032"]
  ],
  "content": ""
}
```

**Required tags**: `d`, `status`, `t`, `e` (referencing a Task Request or Task Offer)

**Optional tags**: `domain`, `p`, `requester_pubkey`, `provider_pubkey`, `amount`, `currency`, `trust_model`,
`estimated_arrival`, `expiration`

**Validation rules**:

- `status` MUST be `accepted`
- The `e` tag MUST reference either a Task Request (30500) or a Task Offer (30501)
- The referenced task MUST be in state `requested` or `offers_open`
- The `d` tag MUST match the task's `d` tag

#### Multi-Provider Tasks

Some tasks require multiple providers (e.g. a furniture removal requiring two workers). Multi-provider acceptance is
indicated by multiple `p` tags on the Task Accept, each with a confirmation status:

```json
{
  "kind": 30502,
  "pubkey": "<operator_hex_pubkey>",
  "created_at": 1698765600,
  "tags": [
    ["d", "task_removal_001"],
    ["domain", "removals"],
    ["status", "accepted"],
    ["t", "trott-task"],
    ["e", "<task_request_event_id>", "wss://relay.example.com"],
    ["requester_pubkey", "<requester_hex_pubkey>"],
    ["p", "<provider_1_pubkey>", "confirmed"],
    ["p", "<provider_2_pubkey>", "pending"],
    ["provider_count", "2"],
    ["amount", "15000"],
    ["currency", "GBP"],
    ["expiration", "1698769032"]
  ],
  "content": ""
}
```

The third element of each `p` tag indicates the provider's confirmation status: `confirmed` or `pending`. The task
transitions to `in_progress` only when all providers are `confirmed`.

#### Multi-Provider Quorum

For multi-provider tasks, the domain profile SHOULD define a minimum provider count required to proceed. The Task Accept
event (kind 30502) includes a `provider_count` tag indicating the total required. The task transitions to `in_progress`
when the number of `confirmed` providers meets or exceeds the domain profile's minimum. If a domain profile does not
specify a minimum, all providers must confirm.

Individual provider withdrawal during `in_progress` SHOULD be handled as a partial cancellation rather than a full task
failure. If the remaining confirmed provider count falls below the domain's minimum, the operator MAY attempt to find a
replacement provider. If no replacement is found within a reasonable window, the task MAY transition to `cancelled` with
reason `insufficient_providers`.

### Kind 30503: Task Update

Published by the provider or operator to signal a state transition between `accepted` and `completed`. This is the
primary mechanism for domain-specific sub-state transitions within `in_progress`.

```json
{
  "kind": 30503,
  "pubkey": "<provider_hex_pubkey>",
  "created_at": 1698765700,
  "tags": [
    ["d", "task_abc123"],
    ["domain", "ridesharing"],
    ["status", "provider_en_route"],
    ["t", "trott-task"],
    ["e", "<task_accept_event_id>", "wss://relay.example.com"],
    ["p", "<requester_hex_pubkey>"],
    ["provider_pubkey", "<provider_hex_pubkey>"],
    ["provider_lat", "51.5100"],
    ["provider_lon", "-0.1350"],
    ["eta_seconds", "480"],
    ["expiration", "1698769032"]
  ],
  "content": ""
}
```

**Required tags**: `d`, `status`, `t`

**Optional tags**: `domain`, `e`, `p`, `provider_pubkey`, `provider_lat`, `provider_lon`, `eta_seconds`,
`distance_remaining_metres`, `expiration`

**Validation rules**:

- The `status` tag MUST contain a valid state for the task's domain
- The transition from the task's current state to the new `status` MUST be valid per the domain's state machine
- The `d` tag MUST match an existing accepted task

#### Domain Sub-State Examples

**Ridesharing — provider en route:**

```json
{
  "kind": 30503,
  "pubkey": "<driver_hex_pubkey>",
  "created_at": 1698765700,
  "tags": [
    ["d", "ride_def456"],
    ["domain", "ridesharing"],
    ["status", "provider_en_route"],
    ["t", "trott-task"],
    ["e", "<accept_event_id>", "wss://relay.example.com"],
    ["provider_pubkey", "<driver_hex_pubkey>"],
    ["provider_lat", "51.5100"],
    ["provider_lon", "-0.1350"],
    ["eta_seconds", "480"]
  ],
  "content": ""
}
```

**Ridesharing — provider arrived:**

```json
{
  "kind": 30503,
  "pubkey": "<driver_hex_pubkey>",
  "created_at": 1698765900,
  "tags": [
    ["d", "ride_def456"],
    ["domain", "ridesharing"],
    ["status", "provider_arrived"],
    ["t", "trott-task"],
    ["provider_pubkey", "<driver_hex_pubkey>"],
    ["provider_lat", "51.5074"],
    ["provider_lon", "-0.1278"]
  ],
  "content": ""
}
```

**Locksmith — access method confirmed:**

```json
{
  "kind": 30503,
  "pubkey": "<locksmith_hex_pubkey>",
  "created_at": 1698766200,
  "tags": [
    ["d", "callout_ghi789"],
    ["domain", "locksmith"],
    ["status", "access_method_confirmed"],
    ["t", "trott-task"],
    ["provider_pubkey", "<locksmith_hex_pubkey>"],
    ["access_method", "pick"],
    ["revised_amount", "7500"],
    ["currency", "GBP"]
  ],
  "content": "Yale lock — non-destructive pick entry. No damage to door or frame."
}
```

**Delivery — parcel collected:**

```json
{
  "kind": 30503,
  "pubkey": "<courier_hex_pubkey>",
  "created_at": 1698766500,
  "tags": [
    ["d", "delivery_jkl012"],
    ["domain", "delivery"],
    ["status", "collected"],
    ["t", "trott-task"],
    ["provider_pubkey", "<courier_hex_pubkey>"],
    ["collection_photo", "<url_or_hash>"],
    ["collection_lat", "51.5074"],
    ["collection_lon", "-0.1278"]
  ],
  "content": ""
}
```

### Kind 30504: Task Complete

Published by the provider to declare that work is finished. MUST include completion proof as defined by the domain
profile.

```json
{
  "kind": 30504,
  "pubkey": "<provider_hex_pubkey>",
  "created_at": 1698766800,
  "tags": [
    ["d", "task_abc123"],
    ["domain", "ridesharing"],
    ["status", "completed"],
    ["t", "trott-task"],
    ["e", "<task_accept_event_id>", "wss://relay.example.com"],
    ["p", "<requester_hex_pubkey>"],
    ["provider_pubkey", "<provider_hex_pubkey>"],
    ["completion_proof", "gps_trace"],
    ["proof_data", "<encoded_gps_trace_or_hash>"],
    ["final_amount", "1650"],
    ["currency", "GBP"],
    ["trust_model", "fiat-escrow"],
    ["distance_metres", "8450"],
    ["duration_seconds", "1260"],
    ["expiration", "1698770432"]
  ],
  "content": ""
}
```

**Required tags**: `d`, `status`, `t`, `completion_proof`

**Optional tags**: `domain`, `e`, `p`, `provider_pubkey`, `proof_data`, `final_amount`, `currency`, `trust_model`,
`distance_metres`, `duration_seconds`, `actual_duration`, `expiration`

**Validation rules**:

- `status` MUST be `completed`
- The referenced task MUST be in the `in_progress` phase (including any domain sub-state within `in_progress`)
- `completion_proof` MUST contain a proof type defined by the task's domain profile
- If `final_amount` is present, `currency` MUST also be present

#### Completion Proof Types

Domain profiles declare which proof types are required. The core protocol defines the following:

| Proof Type           | Description                                         | Typical Domains                        |
|----------------------|-----------------------------------------------------|----------------------------------------|
| `gps_trace`          | GPS route trace during active task                  | Ridesharing, delivery                  |
| `gps_arrival`        | GPS coordinates confirming arrival at task location | All location-based services            |
| `photo`              | Geotagged photographic evidence                     | Locksmith, delivery, cleaning          |
| `photo_before_after` | Before and after photographs                        | Cleaning, repair, grooming             |
| `signature`          | Digital signature from the counterparty             | Delivery, legal services               |
| `document`           | Document or file handover proof                     | Legal, virtual services                |
| `checkin`            | Heartbeat check-in confirmations                    | Security guard, companion care         |
| `video`              | Video evidence                                      | High-value or safety-critical services |
| `receipt`            | External receipt or confirmation                    | Purchases, toll payments               |
| `deliverable`        | Report, certificate, assessment, or other document produced as service output | Inspection, surveying, professional services, creative services |
| `counterparty_ack`   | Explicit acknowledgement from the other party       | All services (universal fallback)      |

#### Domain-Specific Completion Examples

**Locksmith — photo proof:**

```json
{
  "kind": 30504,
  "pubkey": "<locksmith_hex_pubkey>",
  "created_at": 1698767100,
  "tags": [
    ["d", "callout_ghi789"],
    ["domain", "locksmith"],
    ["status", "completed"],
    ["t", "trott-task"],
    ["provider_pubkey", "<locksmith_hex_pubkey>"],
    ["completion_proof", "gps_arrival"],
    ["completion_proof", "photo"],
    ["proof_photo", "<url_or_hash>"],
    ["proof_gps_lat", "51.5074"],
    ["proof_gps_lon", "-0.1278"],
    ["final_amount", "7500"],
    ["currency", "GBP"],
    ["access_method", "pick"],
    ["damage", "none"]
  ],
  "content": "Non-destructive entry via pick. Lock functional, no damage."
}
```

**Delivery — signature proof:**

```json
{
  "kind": 30504,
  "pubkey": "<courier_hex_pubkey>",
  "created_at": 1698767400,
  "tags": [
    ["d", "delivery_jkl012"],
    ["domain", "delivery"],
    ["status", "completed"],
    ["t", "trott-task"],
    ["provider_pubkey", "<courier_hex_pubkey>"],
    ["completion_proof", "photo"],
    ["completion_proof", "signature"],
    ["proof_photo", "<url_or_hash>"],
    ["proof_signature", "<encoded_signature>"],
    ["delivery_lat", "51.5155"],
    ["delivery_lon", "-0.1416"],
    ["final_amount", "800"],
    ["currency", "GBP"]
  ],
  "content": ""
}
```

### Kind 30505: Task Confirm

Published by the requester to confirm that the work has been completed satisfactorily. This event triggers payment
release (via the payment and stakes layers defined in TROTT-03 and TROTT-04).

```json
{
  "kind": 30505,
  "pubkey": "<requester_hex_pubkey>",
  "created_at": 1698767000,
  "tags": [
    ["d", "task_abc123"],
    ["domain", "ridesharing"],
    ["status", "confirmed"],
    ["t", "trott-task"],
    ["e", "<task_complete_event_id>", "wss://relay.example.com"],
    ["p", "<provider_hex_pubkey>"],
    ["requester_pubkey", "<requester_hex_pubkey>"],
    ["confirmed_amount", "1650"],
    ["currency", "GBP"],
    ["trust_model", "fiat-escrow"]
  ],
  "content": ""
}
```

**Required tags**: `d`, `status`, `t`, `e` (referencing the Task Complete event)

**Optional tags**: `domain`, `p`, `requester_pubkey`, `confirmed_amount`, `currency`, `trust_model`

**Validation rules**:

- `status` MUST be `confirmed`
- The `e` tag MUST reference a Task Complete (30504) event
- The referenced task MUST be in state `completed`
- If `confirmed_amount` differs from the Task Complete's `final_amount`, the operator SHOULD flag the discrepancy

#### Auto-Confirmation

Operators MAY implement auto-confirmation with a configurable timeout. If the requester does not publish a Task
Confirm (30505) or Task Dispute (30507) within the timeout period (e.g. 24 hours), the operator MAY publish a Task
Confirm on behalf of the requester. The auto-confirmation timeout SHOULD be declared in the operator's bond event.

### Kind 30506: Task Cancel

Published by either party to cancel a task. Valid from any non-terminal state.

```json
{
  "kind": 30506,
  "pubkey": "<requester_hex_pubkey>",
  "created_at": 1698765800,
  "tags": [
    ["d", "task_abc123"],
    ["domain", "ridesharing"],
    ["status", "cancelled"],
    ["t", "trott-task"],
    ["e", "<task_request_event_id>", "wss://relay.example.com"],
    ["cancelled_by", "requester"],
    ["reason_code", "changed_plans"],
    ["reason", "No longer need a ride"],
    ["p", "<provider_hex_pubkey>"]
  ],
  "content": ""
}
```

**Required tags**: `d`, `status`, `t`, `cancelled_by`, `reason_code`

**Optional tags**: `domain`, `e`, `reason`, `p`, `amount`, `currency`

**Validation rules**:

- `status` MUST be `cancelled`
- `cancelled_by` MUST be one of: `requester`, `provider`, `operator`
- The referenced task MUST NOT already be in a terminal state (`confirmed`, `cancelled`)
- The `pubkey` of the event MUST match the party indicated by `cancelled_by` (or be the operator's pubkey if
  `cancelled_by` is `operator`)

#### Reason Codes

| Reason Code            | Description                                 | Applicable Party    |
|------------------------|---------------------------------------------|---------------------|
| `changed_plans`        | Requester no longer needs the service       | Requester           |
| `provider_unavailable` | Provider can no longer fulfil the task      | Provider            |
| `requester_no_show`    | Requester failed to appear after commitment | Provider, Operator  |
| `provider_no_show`     | Provider failed to appear after commitment  | Requester, Operator |
| `safety_concern`       | Safety concern raised by either party       | Either              |
| `price_dispute`        | Parties cannot agree on pricing             | Either              |
| `duplicate`            | Duplicate request                           | Either, Operator    |
| `system_error`         | Technical failure preventing completion     | Operator            |
| `force_majeure`        | External event preventing completion        | Operator            |
| `timeout`              | Task expired without acceptance             | Operator            |

Operators MAY define additional reason codes for domain-specific scenarios.

### Kind 30507: Task Dispute

Published by either party to escalate a task to dispute resolution. See TROTT-05 for the full dispute resolution
protocol.

```json
{
  "kind": 30507,
  "pubkey": "<requester_hex_pubkey>",
  "created_at": 1698767200,
  "tags": [
    ["d", "task_abc123"],
    ["domain", "ridesharing"],
    ["status", "disputed"],
    ["t", "trott-task"],
    ["e", "<task_complete_event_id>", "wss://relay.example.com"],
    ["p", "<provider_hex_pubkey>"],
    ["dispute_type", "payment"],
    ["claimed_amount", "800"],
    ["currency", "GBP"],
    ["evidence", "[\"photo_url_1\", \"photo_url_2\"]"]
  ],
  "content": "Driver took a significantly longer route than necessary. Fare should be lower."
}
```

**Required tags**: `d`, `status`, `t`, `dispute_type`

**Optional tags**: `domain`, `e`, `p`, `claimed_amount`, `currency`, `evidence`

**Validation rules**:

- `status` MUST be `disputed`
- The referenced task MUST be in state `accepted`, `in_progress`, or `completed`
- `dispute_type` MUST be one of: `payment`, `conduct`, `safety`, `quality`, `no_show`

---

## Domain Extension Mechanism

New service domains are added via **domain extension specifications** that build upon TROTT-01. A domain extension MUST:

1. **Define a domain identifier** — A unique string (e.g. `ridesharing`, `locksmith`, `delivery`)
2. **Declare role aliases** — Map `requester` and `provider` to domain-specific names
3. **Declare tag aliases** — Map core location and party tags to domain-specific names
4. **Define sub-states** — Specify an ordered list of sub-states within the `in_progress` phase, with valid transitions
5. **Declare optional state skipping** — Indicate which sub-states may be skipped (e.g. virtual services skip transit
   states)
6. **Specify completion proof types** — Declare which proof types from the core list are required
7. **Define domain-specific tags** — Additional tags for Task Request, Task Offer, and Task Update events
8. **Define rating criteria** — Domain-specific rating categories and weights

A domain extension MUST NOT:

- Redefine the semantics of core event kinds (30500-30507)
- Alter the core state machine transitions (it may only insert sub-states within `in_progress`)
- Remove or make optional any MUST-level requirement from TROTT-01

### Allocated Kind Ranges

Domain extensions MAY define additional event kinds within their allocated ranges:

| Range              | Domain                                                    | Extension Spec         |
|--------------------|-----------------------------------------------------------|------------------------|
| 30500-30509        | Core task lifecycle (incl. multi-leg and recurring tasks) | TROTT-01 (this spec)   |
| 30510-30512, 20500 | Discovery                                                 | TROTT-02               |
| 30520-30522        | Reputation                                                | TROTT-03               |
| 30530-30536        | Payments                                                  | TROTT-04               |
| 30540-30546        | Safety & Disputes                                         | TROTT-05               |
| 30550-30554        | Coordination                                              | TROTT-06               |
| 30560-30563, 20501 | Navigation                                                | TROTT-07               |
| 30564-30599        | Reserved for future core expansion                        | —                      |
| 30600-30619        | Ridesharing                                               | TROTT-ridesharing      |
| 30620-30639        | Locksmith                                                 | TROTT-locksmith        |
| 30640-30659        | Delivery                                                  | TROTT-delivery         |
| 30660-30679        | Towing                                                    | TROTT-towing           |
| 30680-30699        | Emergency trades                                          | TROTT-emergency-trades |
| 30700-30719        | Pet services                                              | TROTT-pet-services     |
| 30720-30739        | Security guard dispatch                                   | TROTT-security         |
| 30740-30759        | Cleaning                                                  | TROTT-cleaning         |
| 30760-30779        | Moving                                                    | TROTT-moving           |
| 30780-30999        | Reserved for future domains                               | TBD                    |

---

## Linked Tasks

Tasks MAY reference other tasks using the `linked_task` tag:

```json
[
  "linked_task",
  "<original_task_id>",
  "<relationship>"
]
```

| Relationship  | Semantics                                                                                                                             |
|---------------|---------------------------------------------------------------------------------------------------------------------------------------|
| `follow_up`   | Scheduled work arising from a completed task (e.g. emergency repair followed by a proper fix)                                         |
| `guarantee`   | Reopened task under original terms (e.g. locksmith guarantee — lock fails within 30 days)                                             |
| `escalation`  | Escalated task when original service was insufficient (e.g. roadside fix failed, escalate to tow)                                     |
| `recurrence`  | Instance of a recurring task series                                                                                                   |
| `shared_ride` | Tasks sharing a single provider journey (e.g. carpool passengers). Each task is independent but linked via a common Leg Plan (30508). |
| `round_trip`  | Return leg of a collection-and-return workflow. The outbound task collects an item; the `round_trip`-linked task returns it.           |

Guarantee-linked tasks inherit the original task's agreed terms. Escalation-linked tasks form an auditable chain.
Recurrence-linked tasks are independent instances sharing a series identifier. Shared-ride-linked tasks are fully
independent lifecycles (cancellation, payment, ratings) that happen to share a provider and a Leg Plan. Round-trip-linked
tasks model collection-and-return workflows (laundry pickup & return, vehicle collection for servicing & return,
equipment rental delivery & collection) as two independent delivery tasks — the processing phase between collection and
return is the provider's own workflow and does not require protocol-level state tracking.

---

## Multi-Leg Tasks

Many real-world tasks involve ordered intermediate stops rather than a simple origin-to-destination journey. An airport
shuttle picking up passengers at hotels 1 through 4, a multi-drop parcel delivery visiting several addresses, or a
moving job splitting furniture across two destination addresses are all examples of **multi-leg tasks** — tasks with a
sequence of waypoints that must be visited in a defined order.

TROTT models multi-leg tasks with a dedicated **Leg Plan** event that defines the stop sequence, and uses Task Update (
30503) sub-state transitions to track progress through each leg.

### Kind 30508: Leg Plan

**Parameterised replaceable** (NIP-33). Published by the requester or operator.

**`d` tag**: `<task_id>:legs`

| Tag              | Description                                                       |
|------------------|-------------------------------------------------------------------|
| `d`              | `<task_id>:legs` — links this plan to the parent task             |
| `task_id`        | References the parent Task Request (30500)                        |
| `leg` (multiple) | `<sequence>, <purpose>, <geohash>, <participant_pubkey_or_empty>` |
| `leg_count`      | Total number of legs                                              |
| `pricing_model`  | `per_leg` \| `total` \| `distance_proportional`                   |

**Encrypted content** (NIP-44 to all participants) contains precise coordinates for each leg — latitude, longitude, and
human-readable address. The public `leg` tags use geohashes for privacy-preserving discovery.

**Leg purposes**: `pickup`, `dropoff`, `waypoint`, `collection`, `delivery`, `loading`, `unloading`.

#### State Machine Interaction

Each leg maps to a sub-state transition within `in_progress`. The provider publishes a Task Update (30503) with a
`leg_sequence` tag to indicate which leg is currently active. For example, on an airport shuttle with 3 pickup legs:

```
accepted → in_progress (leg 1: pickup hotel A) → in_progress (leg 2: pickup hotel B)
         → in_progress (leg 3: pickup hotel C) → in_progress (leg 4: dropoff airport)
         → completed
```

Completion of all legs triggers the normal `completed` transition. A domain-aware client renders each leg individually;
a core-only client sees the standard `accepted → in_progress → completed` flow.

#### Relation to TROTT-07

Kind 30560 (Route Summary) already supports `stop_count`, `stop_purposes`, and a `stops` array. The Leg Plan (30508)
defines the **task coordination** layer — who gets picked up where and in what order — while the Route Summary defines
the **navigation** layer — the actual driving route between stops. These complement each other: the Leg Plan is
published first, and the Route Summary is computed from it.

#### Example: Airport Shuttle Leg Plan

```json
{
  "kind": 30508,
  "pubkey": "<operator_hex_pubkey>",
  "created_at": 1698765432,
  "tags": [
    ["d", "task_shuttle_001:legs"],
    ["task_id", "task_shuttle_001"],
    ["domain", "ridesharing"],
    ["t", "trott-task"],
    ["leg", "1", "pickup", "gcpuuz", "<passenger_1_pubkey>"],
    ["leg", "2", "pickup", "gcpuuy", "<passenger_2_pubkey>"],
    ["leg", "3", "pickup", "gcpuvb", "<passenger_3_pubkey>"],
    ["leg", "4", "dropoff", "gcpvj0", ""],
    ["leg_count", "4"],
    ["pricing_model", "per_leg"],
    ["expiration", "1698769032"]
  ],
  "content": "<NIP-44 encrypted: precise addresses for each leg>"
}
```

### Shared Rides

Shared rides — multiple requesters, one provider, overlapping routes — are modelled as a set of independent tasks linked
by a common Leg Plan. This preserves per-passenger autonomy while enabling efficient multi-stop coordination.

**How shared rides work:**

1. Each passenger publishes their own Task Request (30500) with a `shared_ride` tag set to `true`
2. The operator or provider groups compatible requests by route overlap and timing
3. A Leg Plan (30508) is published linking all participants' pickup and dropoff points in an efficient order
4. Payment Terms (30531) uses `payment_type: split` with each passenger's individual share
5. Each passenger retains their own independent task lifecycle

**Key design decision:** A shared ride does NOT create a single mega-task. Each passenger's journey is a separate Task
Request (30500), linked to other passengers' tasks via `linked_task` tags with relationship `shared_ride`. This
preserves:

- **Independent cancellation** — one passenger cancelling does not affect others
- **Independent payment** — each passenger pays their own fare
- **Independent ratings** — each passenger rates the provider separately
- **Privacy** — passengers do not see each other's precise addresses unless the Leg Plan's encrypted content is shared
  with them

---

## Recurring Tasks

Some services follow a regular pattern — weekly house cleaning, daily courier runs, monthly security patrols. TROTT
supports recurring tasks through scheduling tags on the Task Request (30500) combined with a **Recurring Series** event
that tracks the series lifecycle.

### Kind 30509: Recurring Series

**Parameterised replaceable** (NIP-33). Published by the operator.

**`d` tag**: `series:<series_id>`

| Tag                | Description                                                                    |
|--------------------|--------------------------------------------------------------------------------|
| `series_id`        | Unique identifier for the series                                               |
| `source_task`      | References the original Task Request (30500) that includes `recurrence` tags   |
| `recurrence`       | Echoes the recurrence pattern from the source task (e.g. `weekly`, `biweekly`) |
| `instance_count`   | Total instances created so far                                                 |
| `next_instance_at` | Unix timestamp for the next expected instance                                  |
| `status`           | `active` \| `paused` \| `ended`                                                |
| `preferred_provider` | Optional. Provider pubkey preferred for all instances in this series            |

Each instance in the series is a normal Task Request (30500) with:

- A `linked_task` tag referencing the series (`relationship: recurrence`)
- An `instance_number` tag indicating its position in the series

**Notification flow:** When `next_instance_at` approaches, the operator publishes the next Task Request (30500). The
matched provider receives it via their normal relay subscription. If a preferred provider is associated with the series,
the operator MAY publish a Task Accept (30502) automatically, subject to the provider's prior consent.

#### Exception Handling

Individual instances within a recurring series MAY be rescheduled by cancelling the original instance (kind 30506 with
reason code `rescheduled`) and creating a new Task Request with `linked_task` referencing the series and an updated
`scheduled_start`. The `rescheduled` reason code distinguishes rescheduling from genuine cancellation for reputation and
billing purposes — a rescheduled instance does not count as a cancellation in the requester's reputation history.

To skip an instance without rescheduling, the operator publishes a Task Cancel (kind 30506) with reason code
`instance_skipped`. Skipped instances are excluded from billing and do not affect reputation.

#### Example: Weekly Cleaning Series

```json
{
  "kind": 30509,
  "pubkey": "<operator_hex_pubkey>",
  "created_at": 1698765432,
  "tags": [
    ["d", "series:clean_weekly_001"],
    ["series_id", "clean_weekly_001"],
    ["source_task", "task_weekly_clean_001"],
    ["domain", "cleaning"],
    ["t", "trott-task"],
    ["recurrence", "weekly"],
    ["instance_count", "4"],
    ["next_instance_at", "1699605600"],
    ["status", "active"],
    ["expiration", "1730000000"]
  ],
  "content": ""
}
```

An individual instance within the series:

```json
{
  "kind": 30500,
  "pubkey": "<requester_hex_pubkey>",
  "created_at": 1699000800,
  "tags": [
    ["d", "task_weekly_clean_004"],
    ["domain", "cleaning"],
    ["status", "requested"],
    ["t", "trott-task"],
    ["requester_pubkey", "<requester_hex_pubkey>"],
    ["location_lat", "51.5074"],
    ["location_lon", "-0.1278"],
    ["linked_task", "series:clean_weekly_001", "recurrence"],
    ["instance_number", "4"],
    ["amount", "5000"],
    ["currency", "GBP"],
    ["expiration", "1699087200"]
  ],
  "content": "Weekly house clean — 3-bedroom terraced house"
}
```

---

## Offline Operation

Physical service coordination often occurs in areas with unreliable connectivity — underground car parks, rural
locations, indoor premises. TROTT clients MUST handle intermittent relay and operator connectivity gracefully.

### Local Event Buffering

Clients MUST buffer signed events locally when relay or operator connectivity is lost. Events are signed with
`created_at` set to the actual local time of the action, not the time of eventual publication. This ensures the event
timeline accurately reflects real-world events.

### Replay on Reconnection

When connectivity resumes, buffered events are published in `created_at` order. Relays SHOULD accept events with
`created_at` up to 30 minutes in the past. Operators MUST reconcile replayed events against their current state,
applying valid transitions and rejecting events that conflict with transitions already recorded.

### Safety-Critical Events

Emergency signals (30540) and no-show claims are safety-critical and use exponential backoff retry (1s, 2s, 4s, 8s, ...)
when publication fails. If an emergency signal remains unpublishable after 5 minutes, the client SHOULD escalate to
safety contacts via SMS or an alternative out-of-band channel if available. Implementations SHOULD pre-configure
fallback contact details for this scenario.

### Payment Events

Payment-related events (stake locks, releases, streaming ticks) require explicit operator ACK before being cleared from
the local buffer. A client MUST NOT assume a payment event has been processed until the operator confirms receipt. Cashu
HTLC tokens remain valid offline — the mint enforces expiry independently of relay connectivity.

### Conflict Resolution

Out-of-order events are reconciled by `created_at` timestamp, not relay receipt order. Where two events share the same
`created_at`, the event with the lower event ID (lexicographic sort) takes precedence. The `tick_number` tag on
streaming payment ticks (30536) provides additional ordering within rapid-fire sequences.

---

## Validation Summary

Implementations MUST enforce the following validation rules:

| Rule    | Description                                                                                                                    |
|---------|--------------------------------------------------------------------------------------------------------------------------------|
| **V1**  | Task Request (30500) MUST have `status` = `requested`                                                                          |
| **V2**  | Task Offer (30501) MUST reference a Task Request (30500) via `e` tag                                                           |
| **V3**  | Task Accept (30502) MUST reference a Task Request (30500) or Task Offer (30501) via `e` tag                                    |
| **V4**  | Task Accept (30502) MUST target a task in state `requested` or `offers_open`                                                   |
| **V5**  | Task Update (30503) MUST target a task in state `accepted` or `in_progress`                                                    |
| **V6**  | Task Update (30503) MUST contain a valid state transition per the domain's state machine                                       |
| **V7**  | Task Complete (30504) MUST target a task in the `in_progress` phase                                                            |
| **V8**  | Task Complete (30504) MUST include at least one `completion_proof` tag                                                         |
| **V9**  | Task Confirm (30505) MUST reference a Task Complete (30504) via `e` tag                                                        |
| **V10** | Task Confirm (30505) MUST target a task in state `completed`                                                                   |
| **V11** | Task Cancel (30506) MUST NOT target a task already in a terminal state (`confirmed`, `cancelled`, `no_show`)                   |
| **V12** | Task Dispute (30507) MUST target a task in state `accepted`, `in_progress`, or `completed`                                     |
| **V13** | All events with an `amount` tag MUST also include a `currency` tag                                                             |
| **V14** | The `d` tag on all events for the same task MUST be identical                                                                  |
| **V15** | The `t` tag MUST be `trott-task` on all TROTT lifecycle events                                                                 |
| **V16** | A Task Cancel (30506) with reason_code `requester_no_show` or `provider_no_show` MUST transition to `no_show`, not `cancelled` |

---

## Implementation Notes

### Minimum Viable Implementation

To implement a basic TROTT operator, the following event kinds are required at minimum:

| Kind  | Name          | Purpose                       |
|-------|---------------|-------------------------------|
| 30500 | Task Request  | Accept service requests       |
| 30502 | Task Accept   | Match requester with provider |
| 30503 | Task Update   | Track state transitions       |
| 30504 | Task Complete | Record completion             |
| 30505 | Task Confirm  | Trigger payment release       |
| 30506 | Task Cancel   | Handle cancellations          |

**Total**: 6 event kinds for a minimal viable operator (add 30501 for quoting, 30507 for disputes).

### Relay Recommendations

- TROTT lifecycle events (30500-30507) SHOULD be published to at least two relays for redundancy
- Operators SHOULD maintain their own relay for authoritative task state
- Clients SHOULD subscribe to both the operator's relay and public relays for resilience
- The `expiration` tag (NIP-40) ensures stale events are automatically cleaned up

### Backward Compatibility

The event kinds 30500-30507 defined in this specification are the canonical TROTT lifecycle events. Implementations
transitioning from a prior event schema SHOULD:

1. Publish events using TROTT kinds (30500-30507) for all new tasks
2. Continue serving existing tasks using their original event kinds until completion
3. Maintain dual-subscription during any transition period

---

## Referenced NIPs

| NIP        | Name                             | Usage in TROTT-01                                         |
|------------|----------------------------------|-----------------------------------------------------------|
| **NIP-01** | Basic Protocol Flow              | Event format, relay communication                         |
| **NIP-33** | Parameterised Replaceable Events | All lifecycle events use `d` tags for task identification |
| **NIP-40** | Expiration Timestamp             | `["expiration", "<unix>"]` on time-limited events         |

---

## See Also

- **TROTT-02**: Discovery — Finding providers and advertising availability
- **TROTT-03**: Reputation — Ratings, trust weighting, and credentials
- **TROTT-04**: Payments — Quotes, escrow, streaming, milestones, and split payments
- **TROTT-05**: Safety — Emergency signals, check-ins, disputes, and abuse reporting
- **TROTT-06**: Coordination — Operator participation, PII handling, and compliance
- **TROTT-07**: Navigation — Routing, ETA, live tracking, and route deviation
- **TROTT-08**: Messaging — In-task communication between parties

### Domain Extensions

- **TROTT-ridesharing**: Ridesharing domain extension
- **TROTT-locksmith**: Locksmith dispatch domain extension
- **TROTT-delivery**: Parcel delivery domain extension
- **TROTT-towing**: Vehicle recovery and towing domain extension
- **TROTT-emergency-trades**: Emergency trades domain extension
- **TROTT-pet-services**: Pet services domain extension
- **TROTT-security**: Security guard dispatch domain extension
- **TROTT-cleaning**: Cleaning services domain extension
- **TROTT-moving**: Moving and removals domain extension
