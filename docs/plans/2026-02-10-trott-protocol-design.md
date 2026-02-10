# TROTT Protocol Design

**Trusted Real-world Orchestration of Tasks & Trades**

**Date:** 2026-02-10
**Status:** Design approved, pending implementation
**Author:** TheCryptoDonkey + Claude

---

## Overview

TROTT is a suite of 7 specifications for trust-minimised physical service coordination on Nostr. It defines how requesters find providers, agree on terms, coordinate work, handle payments, build reputation, and resolve disputes — all using Nostr events as the communication layer.

The protocol is payment-agnostic (Lightning, Cashu, fiat, NIP-47), coordination-model-agnostic (P2P or operator-coordinated), and domain-agnostic (ridesharing, locksmith, delivery, security, and any future physical service).

### Name

- **Surface meaning:** A donkey's steady working gait — reliable, no-nonsense, gets the job done
- **Acronym:** **T**rusted **R**eal-world **O**rchestration of **T**asks & **T**rades

### Goals

1. **Portable reputation** — A provider's trust record follows them across every app that speaks TROTT
2. **Payment freedom** — Parties choose their payment rail; no platform lock-in
3. **Trust without a corporation** — Stakes, disputes, credentials, and social graph provide trust guarantees without a centralised intermediary
4. **Censorship-resistant livelihoods** — A provider's identity, reputation, and client relationships live on Nostr, not in a corporate database
5. **Progressive adoption** — A minimal implementation needs only 2 specs and 14 event kinds; everything else is opt-in
6. **Domain extensibility** — Adding a new service domain means writing a one-page profile, not a new protocol

### Architectural Decisions

- **Layered specs:** Core events (TROTT-01 through 05) are coordination-model-agnostic. The operator layer (TROTT-06) is optional. P2P apps and operator apps speak the same event language.
- **Standalone suite:** TROTT is published as an independent protocol that references official NIPs. Not submitted to the official nips repo initially — earns its way in through adoption.
- **Domain profiles are configuration, not specs:** Each service domain is a declarative profile that says which TROTT specs it uses and adds domain-specific states, tags, and rules.

---

## Spec Summary

| Spec | Name | Purpose | Required? |
|------|------|---------|-----------|
| TROTT-01 | Core | Task lifecycle, state machine, scheduling, multi-provider | **Yes** |
| TROTT-02 | Discovery | Provider availability, geohash search, skill search, trusted networks | **Yes** |
| TROTT-03 | Reputation | Ratings, social graph trust, credentials | Recommended |
| TROTT-04 | Payments | Quotes, escrow, streaming, milestones, split payments | Recommended |
| TROTT-05 | Safety | Emergency signals, check-ins, disputes, abuse reporting | Optional |
| TROTT-06 | Coordination | Operator participation, PII handling, compliance, delegation | Optional |
| TROTT-07 | Navigation | Routing, ETA, live tracking, route deviation, offline tiles | Optional |

---

## Complete Event Kind Allocation

```
TROTT-01: Core (30500-30507)
─────────────────────────────
30500  Task Request              Parameterised replaceable
30501  Task Offer                Parameterised replaceable
30502  Task Accept               Parameterised replaceable
30503  Task Update               Parameterised replaceable
30504  Task Complete             Parameterised replaceable
30505  Task Confirm              Parameterised replaceable
30506  Task Cancel               Parameterised replaceable
30507  Task Dispute              Parameterised replaceable

TROTT-02: Discovery (30510-30512, 20500)
────────────────────────────────────────
20500  Provider Availability     Ephemeral
30510  Provider Profile          Parameterised replaceable
30511  Operator Bond             Parameterised replaceable
30512  Trusted Provider List     Parameterised replaceable

TROTT-03: Reputation (30520-30522)
──────────────────────────────────
30520  Task Rating               Parameterised replaceable
30521  Reputation Query          Parameterised replaceable
30522  Credential Attestation    Parameterised replaceable

TROTT-04: Payments (30530-30536)
────────────────────────────────
30530  Quote                     Parameterised replaceable
30531  Payment Terms             Parameterised replaceable
30532  Stake Lock                Parameterised replaceable
30533  Stake Release             Parameterised replaceable
30534  Stake Forfeit             Parameterised replaceable
30535  Payment Receipt           Parameterised replaceable
30536  Streaming Tick            Parameterised replaceable

TROTT-05: Safety & Disputes (30540-30546)
─────────────────────────────────────────
30540  Emergency Signal          Parameterised replaceable
30541  Safety Check-in           Parameterised replaceable
30542  Safety Contact Share      Parameterised replaceable
30543  Dispute Claim             Parameterised replaceable
30544  Dispute Evidence          Parameterised replaceable
30545  Dispute Resolution        Parameterised replaceable
30546  Abuse Report              Parameterised replaceable

TROTT-06: Coordination (30550-30554)
─────────────────────────────────────
30550  Operator Claim            Parameterised replaceable
30551  PII Envelope              Parameterised replaceable
30552  Delegation Grant          Parameterised replaceable
30553  Compliance Record         Parameterised replaceable
30554  Operator Heartbeat        Parameterised replaceable

TROTT-07: Navigation (30560-30563, 20501)
─────────────────────────────────────────
20501  Location Update           Ephemeral
30560  Route Summary             Parameterised replaceable
30561  ETA Update                Parameterised replaceable
30562  Route Deviation           Parameterised replaceable
30563  Navigation Resource       Parameterised replaceable

TOTAL: 38 event kinds (36 replaceable + 2 ephemeral)
RANGE: 20500-20501, 30500-30563
RESERVED: 30564-30599 (future core expansion)
DOMAINS: 30600+ (domain extensions)
```

---

## Dependency Graph

```
                    TROTT-01: Core
                   (task lifecycle)
                    /    |    \    \
                   /     |     \    \
            TROTT-02  TROTT-03  TROTT-04  TROTT-05
           Discovery  Reputation Payments  Safety
                \        |        /
                 \       |       /
                  TROTT-06: Coordination (optional)
                      |
                  TROTT-07: Navigation (optional)
```

---

## TROTT-01: Core — Task Lifecycle & State Machine

### Purpose

Define the universal event kinds and state machine that every TROTT implementation speaks. This is the minimum viable protocol.

### Event Kinds

| Kind | Name | Published by | Purpose |
|------|------|-------------|---------|
| 30500 | Task Request | Requester | "I need something done" — location, description, domain |
| 30501 | Task Offer | Provider | "I can do this" — optionally includes quote/price |
| 30502 | Task Accept | Either party | Requester picks an offer, or provider accepts a request |
| 30503 | Task Update | Either party | State transition — captures every step between accept and complete |
| 30504 | Task Complete | Provider | Work finished, includes completion proof |
| 30505 | Task Confirm | Requester | Requester confirms completion (triggers payment settlement) |
| 30506 | Task Cancel | Either party | Cancellation with reason code |
| 30507 | Task Dispute | Either party | Escalate to dispute resolution (TROTT-05) |

### State Machine

Universal core with optional phases:

```
                    ┌─────────────────────────────┐
                    │        QUOTING PHASE         │
                    │  (competitive quoting, opt)  │
                    │                              │
                    │  requested ──→ offers_open    │
                    │       multiple 30501 events   │
                    │       requester picks one     │
                    └──────────────┬───────────────┘
                                   │
         ┌─────────────────────────▼───────────────────────────┐
         │                  CORE FLOW                          │
         │                                                     │
         │  accepted ──→ in_progress ──→ completed ──→ confirmed│
         │     │              │              │                  │
         │     └──→ cancelled └──→ disputed  └──→ disputed     │
         └─────────────────────────────────────────────────────┘
```

Domains insert their own states within the core flow. For example, ridesharing expands `in_progress` into `en_route → arrived → ride_active`. Delivery expands it into `en_route_to_pickup → collected → in_transit → delivered`. Every implementation understands the core states — even if it doesn't know what `collected` means, it knows the task is between `accepted` and `completed`.

### Core Tags

Present on every task event:

```json
{
  "kind": 30500,
  "tags": [
    ["d", "<task-id>"],
    ["domain", "ridesharing"],
    ["status", "requested"],
    ["t", "trott-task"],
    ["expiration", "<unix-timestamp>"]
  ]
}
```

- `d` — unique task identifier (NIP-33)
- `domain` — which domain profile applies
- `status` — current state
- `t` — topic tag, always includes `trott-task` for discoverability
- `expiration` — NIP-40 expiry

### Scheduling

Handled via optional tags on the Task Request:

```json
["scheduled_start", "<unix-timestamp>"]
["recurrence", "weekly|daily|biweekly|monthly"]
["recurrence_end", "<unix-timestamp>"]
```

### Multi-Provider

Handled by allowing multiple `p` tags on Task Accept:

```json
["p", "<provider-pubkey-1>", "confirmed"]
["p", "<provider-pubkey-2>", "confirmed"]
["p", "<provider-pubkey-3>", "pending"]
```

Each provider's individual state is tracked via their own Task Update events referencing the same `d` tag.

---

## TROTT-02: Discovery — Finding Providers & Advertising Availability

### Purpose

How providers say "I'm available" and requesters find them. Supports three discovery modes: geographic broadcast, category/skill search, and trusted provider networks.

### Event Kinds

| Kind | Name | Published by | Replaceability | Purpose |
|------|------|-------------|----------------|---------|
| 20500 | Provider Availability | Provider | Ephemeral | "I'm available now, here" — short-lived beacon |
| 30510 | Provider Profile | Provider | Parameterised replaceable | Capabilities, credentials, domains, areas served |
| 30511 | Operator Bond | Operator | Parameterised replaceable | Operator advertising — stake, domains, terms, SLA |
| 30512 | Trusted Provider List | Requester | Parameterised replaceable | Requester's preferred providers |

### Discovery Mode 1: Geographic Broadcast

For location-based services. Provider publishes ephemeral availability with geohash tags at multiple precisions:

```json
{
  "kind": 20500,
  "tags": [
    ["d", "<provider-pubkey>:<domain>"],
    ["domain", "ridesharing"],
    ["g", "gcpuuz"],
    ["g", "gcpuu"],
    ["g", "gcpu"],
    ["t", "trott-available"],
    ["expiration", "<now + 30 minutes>"],
    ["capacity", "3"],
    ["payment_methods", "lightning,cashu,fiat"]
  ]
}
```

Requester subscribes with geohash filter + neighbours (9 cells at target precision):

```json
["REQ", "<sub-id>", {
  "kinds": [20500],
  "#domain": ["ridesharing"],
  "#g": ["gcpuu", "gcpuv", "gcput", "gcpus", "..."],
  "since": "<now - 30 minutes>"
}]
```

**Privacy rule:** Availability events use coarse location only (precision 4-5, ~5-39km). Precise coordinates are never in public events. Exact location is shared only after task acceptance, via NIP-44 encrypted tags.

### Discovery Mode 2: Category & Skill Search

For services where "what" matters more than "where." Uses the Provider Profile (30510):

```json
{
  "kind": 30510,
  "tags": [
    ["d", "<provider-pubkey>:profile"],
    ["domain", "locksmith"],
    ["domain", "security"],
    ["skill", "auto-locksmith"],
    ["skill", "safe-cracking"],
    ["credential", "MLA", "Master Locksmiths Association"],
    ["credential", "DBS", "Enhanced DBS Check"],
    ["coverage", "gcpu", "gcpv", "gcpw"],
    ["t", "trott-provider"],
    ["payment_methods", "lightning,fiat"],
    ["languages", "en,pl"]
  ]
}
```

A provider can serve multiple domains. Requesters search by skill, credential, or domain.

### Discovery Mode 3: Trusted Provider Network

Requesters maintain a list of preferred providers:

```json
{
  "kind": 30512,
  "tags": [
    ["d", "<requester-pubkey>:trusted"],
    ["p", "<provider-pubkey-1>", "locksmith", "5"],
    ["p", "<provider-pubkey-2>", "ridesharing", "4"],
    ["p", "<provider-pubkey-3>", "cleaning", "5"]
  ]
}
```

The third value is domain, the fourth is personal trust rating (1-5). When a requester needs a service, they can send a Task Request directly to trusted providers, fall back to geographic broadcast, or both simultaneously.

### Progressive Location Reveal

| Stage | Location precision | Visible to |
|-------|-------------------|------------|
| Provider availability (20500) | ~5km geohash | Public |
| Task request (30500) | ~1km geohash | Public or direct |
| Task accepted (30502) | ~150m geohash | Matched parties only (NIP-44) |
| In progress (30503) | Precise coordinates | Matched parties only (NIP-44) |

---

## TROTT-03: Reputation — Ratings, Trust & Credentials

### Purpose

Portable reputation that follows a provider (or requester) across every app that speaks TROTT. Breaks platform lock-in permanently.

### Event Kinds

| Kind | Name | Published by | Purpose |
|------|------|-------------|---------|
| 30520 | Task Rating | Either party | Rate the other party after task completion |
| 30521 | Reputation Query | Anyone | Pre-aggregated reputation summary (convenience) |
| 30522 | Credential Attestation | Issuer | Third-party verification of qualifications |

### Rating Structure (30520)

```json
{
  "kind": 30520,
  "pubkey": "<rater-pubkey>",
  "tags": [
    ["d", "<task-id>:rating:<rater-role>"],
    ["p", "<rated-pubkey>"],
    ["e", "<task-confirm-event-id>", "", "task"],
    ["domain", "ridesharing"],
    ["role", "provider"],
    ["rating", "overall", "4"],
    ["rating", "punctuality", "5"],
    ["rating", "communication", "4"],
    ["rating", "safety", "5"],
    ["stake_evidence", "1000", "SAT"],
    ["t", "trott-rating"],
    ["expiration", "<optional>"]
  ],
  "content": "Optional text review"
}
```

**Key design decisions:**

- **One rating per party per task.** The `d` tag includes task ID + rater role. NIP-33 parameterised replaceability prevents duplicates.
- **Verifiable linkage.** The `e` tag references the Task Confirm event (30505). Anyone can verify the task actually happened.
- **Stake weight.** The `stake_evidence` tag records how much was at stake. Higher stakes = more meaningful rating.
- **Domain-specific criteria.** Each `rating` tag is a key-value pair. The `overall` rating (1-5) is always present. Domain criteria are optional but recommended.

### Domain-Specific Rating Criteria

| Domain | Example criteria |
|--------|-----------------|
| Ridesharing | punctuality, safety, vehicle_condition, route_knowledge |
| Locksmith | response_time, workmanship, pricing_fairness, tidiness |
| Delivery | speed, package_condition, communication, proof_quality |
| Cleaning | thoroughness, punctuality, trustworthiness, attention_to_detail |
| Security | professionalism, alertness, reporting_quality, appearance |

### Trust Weighting — Social Graph Layer

Raw ratings are gameable. The real power comes from weighting by social proximity using NIP-02:

```
Rating weight = f(stake_evidence, social_distance, rater_reputation, recency)
```

The spec defines the **signals** but not the algorithm:

| Signal | Source | Meaning |
|--------|--------|---------|
| Stake evidence | `stake_evidence` tag | Higher stakes = more credible rating |
| Social distance | NIP-02 follow graph | Rating from someone you follow > stranger |
| Rater reputation | Recursive TROTT-03 query | Well-rated raters carry more weight |
| Recency | Event `created_at` | Recent ratings > old ratings |
| Task count | Count of 30520 events by rater | Prolific, consistent raters > one-off |

**Why not mandate an algorithm?** Different contexts need different weightings. The spec gives implementations the building blocks; they assemble them.

### Cross-Domain Reputation

**Universal criteria** (transfer across all domains): punctuality, communication, reliability, honesty.

**Domain-specific criteria** (don't transfer): vehicle_condition (ridesharing only), workmanship (trades only), package_condition (delivery only).

### Credentials (30522)

```json
{
  "kind": 30522,
  "pubkey": "<issuer-pubkey>",
  "tags": [
    ["d", "<credential-id>"],
    ["p", "<provider-pubkey>"],
    ["credential_type", "gas_safe"],
    ["credential_name", "Gas Safe Register"],
    ["credential_id", "123456"],
    ["issued", "<unix-timestamp>"],
    ["expires", "<unix-timestamp>"],
    ["domain", "emergency-trades"],
    ["t", "trott-credential"],
    ["verification_url", "<optional link to registry>"]
  ]
}
```

**Who issues credentials?** Operators (highest trust), industry bodies, peer attestation, self-declared (lowest trust). The `issuer-pubkey` determines weight via the same social graph weighting from NIP-02.

---

## TROTT-04: Payments — Quotes, Escrow, Streaming & Settlement

### Purpose

Payment coordination events. TROTT-04 defines the communication layer — what's owed, what's locked, what's released. The actual money moves on whatever rail the parties choose. The spec never touches the money directly.

### Event Kinds

| Kind | Name | Published by | Purpose |
|------|------|-------------|---------|
| 30530 | Quote | Provider | "This will cost X" — price proposal |
| 30531 | Payment Terms | Either party | Agreed structure — milestones, splits, streaming rate |
| 30532 | Stake Lock | Payer/Escrow | Funds committed — proof of lock |
| 30533 | Stake Release | Escrow holder | Funds released to provider on completion |
| 30534 | Stake Forfeit | Escrow holder | Funds penalised (cancellation, no-show, dispute loss) |
| 30535 | Payment Receipt | Either party | Confirmation that money changed hands |
| 30536 | Streaming Tick | Payer | Periodic proof-of-payment during ongoing task |

### Currency Neutrality

Every payment event includes explicit `amount`, `currency`, and `trust_model` tags:

```json
["amount", "1500"],
["currency", "GBP"],
["trust_model", "custodial-escrow"]
```

Amounts are always in the smallest unit of the specified currency:

| Currency | Unit | Example: "1500" means |
|----------|------|----------------------|
| SAT | satoshis | 1,500 sats |
| USD | cents | $15.00 |
| GBP | pence | £15.00 |
| EUR | cents | €15.00 |

### Trust Models

| Trust model | Meaning | Example rails |
|-------------|---------|---------------|
| `trustless` | Cryptographic escrow, no trusted third party | Cashu NUT-14 HTLC, NIP-47 hold invoices |
| `operator-escrow` | Operator holds funds, releases on completion | Operator LND, BTCPay |
| `third-party-escrow` | External service holds funds | Strike, Alby |
| `fiat-escrow` | Traditional payment processor holds funds | Stripe |
| `direct` | No escrow — direct payment on completion | Zaps, cash, bank transfer |
| `prepaid` | Requester pays upfront, no escrow protection | Prepaid Lightning invoice |

### Flow 1: Simple Quote & Pay

```
Requester                    Provider
    │                            │
    │──── Task Request (30500) ──→│
    │                            │
    │←── Quote (30530) ──────────│  "£45 flat rate"
    │                            │
    │──── Task Accept (30502) ──→│  references quote event
    │                            │
    │  ... task happens ...      │
    │                            │
    │←── Task Complete (30504) ──│
    │                            │
    │──── Payment Receipt (30535)│  "Paid £45 via Lightning"
    │──── Task Confirm (30505) ──│
```

**Quote event (30530):**

```json
{
  "kind": 30530,
  "tags": [
    ["d", "<task-id>:quote:<provider-pubkey>"],
    ["e", "<task-request-event-id>", "", "task"],
    ["p", "<requester-pubkey>"],
    ["amount", "4500"],
    ["currency", "GBP"],
    ["pricing_model", "flat_rate"],
    ["valid_until", "<unix-timestamp>"],
    ["breakdown", "callout", "2000"],
    ["breakdown", "labour", "2000"],
    ["breakdown", "parts_estimate", "500"],
    ["t", "trott-quote"]
  ],
  "content": "Standard lock replacement, 30-minute job"
}
```

The `breakdown` tags are optional but valuable for transparent pricing. The `d` tag allows multiple providers to quote on the same task (competitive quoting).

### Flow 2: Escrowed Payment

```
Requester                 Escrow              Provider
    │                       │                     │
    │── Stake Lock (30532) ─→│  "£45 locked"      │
    │                       │                     │
    │   ... task happens ...                      │
    │                                             │
    │── Task Confirm (30505) ──────────────────→  │
    │                       │                     │
    │                       │── Stake Release ───→│  "£45 released"
    │                       │     (30533)         │
```

**Stake Lock event (30532):**

```json
{
  "kind": 30532,
  "tags": [
    ["d", "<task-id>:stake"],
    ["e", "<task-accept-event-id>", "", "task"],
    ["p", "<provider-pubkey>"],
    ["amount", "4500"],
    ["currency", "GBP"],
    ["trust_model", "trustless"],
    ["payment_rail", "cashu"],
    ["lock_type", "htlc"],
    ["payment_hash", "<sha256-hash>"],
    ["escrow_token", "<encrypted-cashu-token>"],
    ["t", "trott-stake"]
  ]
}
```

**Who is "Escrow"?** Depends on the trust model:
- `trustless`: The cryptographic mechanism itself (Cashu HTLC, hold invoice)
- `operator-escrow`: The operator holds funds
- `third-party-escrow`: An external payment service
- `direct`: No escrow — the Stake Lock event is a commitment signal only

### Flow 3: Streaming Payments

For time-based services — security shifts, cleaning, tutoring.

**Payment Terms (30531):**

```json
{
  "kind": 30531,
  "tags": [
    ["d", "<task-id>:terms"],
    ["e", "<task-accept-event-id>", "", "task"],
    ["payment_type", "streaming"],
    ["rate", "500"],
    ["currency", "SAT"],
    ["interval", "3600"],
    ["minimum_duration", "7200"],
    ["maximum_duration", "28800"],
    ["t", "trott-terms"]
  ]
}
```

During the task, the payer publishes Streaming Tick events (30536) as proof of ongoing payment. The `cumulative` field provides an auditable total. Either party can end the stream via Task Complete or Task Cancel.

### Flow 4: Milestone Payments

For multi-stage work — moving, construction, complex repairs:

```json
{
  "kind": 30531,
  "tags": [
    ["d", "<task-id>:terms"],
    ["payment_type", "milestone"],
    ["milestone", "loaded", "5000", "GBP", "Furniture loaded onto van"],
    ["milestone", "transported", "3000", "GBP", "Delivered to new address"],
    ["milestone", "unloaded", "5000", "GBP", "Furniture placed in rooms"],
    ["currency", "GBP"],
    ["total", "13000"],
    ["t", "trott-terms"]
  ]
}
```

Each milestone triggers a partial Stake Release (30533).

### Flow 5: Split Payments

For multi-provider tasks — moving crew, event staffing:

```json
{
  "kind": 30531,
  "tags": [
    ["d", "<task-id>:terms"],
    ["payment_type", "split"],
    ["split", "<provider-pubkey-1>", "4000", "GBP"],
    ["split", "<provider-pubkey-2>", "4000", "GBP"],
    ["split", "<provider-pubkey-3>", "5000", "GBP"],
    ["currency", "GBP"],
    ["total", "13000"],
    ["t", "trott-terms"]
  ]
}
```

Split and milestone can combine — each milestone releases split portions.

### Cancellation & Forfeiture

**Stake Forfeit (30534):**

```json
{
  "kind": 30534,
  "tags": [
    ["d", "<task-id>:forfeit"],
    ["e", "<task-cancel-event-id>", "", "cancel"],
    ["p", "<penalised-pubkey>"],
    ["amount", "1000"],
    ["currency", "GBP"],
    ["forfeit_reason", "requester_no_show"],
    ["refund_amount", "3500"],
    ["refund_to", "<requester-pubkey>"],
    ["t", "trott-forfeit"]
  ]
}
```

Cancellation policies are domain-defined. The domain profile specifies the rules; TROTT-04 provides the event structure.

---

## TROTT-05: Safety & Disputes — When Things Go Wrong

### Purpose

Two distinct but related concerns. **Safety** — real-time protection during a task. **Disputes** — resolving disagreements after a task. Both feed into TROTT-03 reputation.

### Event Kinds

| Kind | Name | Published by | Purpose |
|------|------|-------------|---------|
| 30540 | Emergency Signal | Either party | Panic button — immediate distress |
| 30541 | Safety Check-in | Either party | "I'm OK" periodic confirmation |
| 30542 | Safety Contact Share | Either party | Share live task details with a trusted person |
| 30543 | Dispute Claim | Either party | "I dispute this task outcome" |
| 30544 | Dispute Evidence | Either party | Photos, GPS logs, screenshots, timestamps |
| 30545 | Dispute Resolution | Mediator | Final ruling — affects funds and reputation |
| 30546 | Abuse Report | Anyone | Flag a bad actor (NIP-56 compatible) |

### Safety Infrastructure

**Emergency Signal (30540):**

```json
{
  "kind": 30540,
  "tags": [
    ["d", "<task-id>:emergency"],
    ["e", "<task-event-id>", "", "task"],
    ["p", "<other-party-pubkey>"],
    ["severity", "critical"],
    ["location_lat", "51.5074"],
    ["location_lon", "-0.1278"],
    ["t", "trott-emergency"]
  ],
  "content": "<NIP-44 encrypted: nature of emergency>"
}
```

Severity levels:

| Level | Meaning | Expected response |
|-------|---------|-------------------|
| `critical` | Immediate physical danger | Alert safety contacts, share location, notify authorities |
| `urgent` | Situation deteriorating | Alert safety contacts, share location |
| `concern` | Something feels wrong | Log for record, notify safety contacts silently |

**Safety Check-ins (30541):** Periodic "I'm OK" signals during tasks. If no check-in arrives within the expected window, safety contacts are alerted. The domain profile defines whether check-ins are required.

**Safety Contact Share (30542):** Share live task details (location, provider identity, route, ETA) with a trusted person who isn't a party to the task. Encrypted to the safety contact only — the provider never knows who your safety contact is.

### Dispute Resolution

**Dispute Claim (30543):**

```json
{
  "kind": 30543,
  "tags": [
    ["d", "<task-id>:dispute"],
    ["e", "<task-event-id>", "", "task"],
    ["p", "<other-party-pubkey>"],
    ["dispute_type", "quality"],
    ["amount_disputed", "4500"],
    ["currency", "GBP"],
    ["resolution_model", "operator"],
    ["t", "trott-dispute"]
  ],
  "content": "Description of the dispute"
}
```

Dispute types: `no_show`, `quality`, `pricing`, `damage`, `safety`, `fraud`.

**Dispute Evidence (30544):** Evidence with verifiable integrity — content hash, timestamp, location. Evidence types: `photo`, `video`, `audio`, `gps_log`, `screenshot`, `message_log`, `receipt`, `timestamp_proof`. All encrypted to dispute participants and mediator only.

### Resolution Models

| Model | Tag value | How it works |
|-------|-----------|-------------|
| Operator-mediated | `operator` | Operator reviews evidence and rules |
| Community panel | `community` | 3-5 high-reputation domain members vote |
| Mutual contacts | `mutual` | NIP-02 mutual follows mediate |
| Automated rules | `automated` | GPS/time evidence triggers automatic ruling |

**Dispute Resolution (30545):**

```json
{
  "kind": 30545,
  "tags": [
    ["d", "<task-id>:resolution"],
    ["e", "<dispute-event-id>", "", "dispute"],
    ["p", "<party-1-pubkey>"],
    ["p", "<party-2-pubkey>"],
    ["ruling", "partial_refund"],
    ["refund_amount", "2500"],
    ["currency", "GBP"],
    ["at_fault", "<party-pubkey>"],
    ["resolution_model", "operator"],
    ["mediator", "<mediator-pubkey>"],
    ["t", "trott-resolution"]
  ],
  "content": "Reasoning for the ruling"
}
```

Ruling types: `full_refund`, `partial_refund`, `no_refund`, `provider_compensated`, `mutual_release`, `task_voided`.

Dispute outcomes feed into TROTT-03 (reputation) and TROTT-04 (fund release/forfeit).

### Abuse Reporting (30546)

NIP-56 compatible. Uses NIP-32 label tags for categorisation:

```json
{
  "kind": 30546,
  "tags": [
    ["d", "<report-id>"],
    ["p", "<reported-pubkey>", "fraud"],
    ["e", "<evidence-event-id>"],
    ["report_type", "fraud"],
    ["domain", "locksmith"],
    ["L", "trott-abuse"],
    ["l", "fraud", "trott-abuse"],
    ["t", "trott-report"]
  ]
}
```

---

## TROTT-06: Coordination — The Operator Layer (Optional)

### Purpose

Define how an operator participates in task coordination. Everything in TROTT-01 through 05 works without this spec. TROTT-06 adds value, not gatekeeping.

### Why Operators Exist

Pure P2P has real-world friction: PII goes directly to strangers, no one handles compliance, real-time coordination requires infrastructure, dispute mediation needs record access. Operators are optional service enhancers — not middlemen.

### Event Kinds

| Kind | Name | Published by | Purpose |
|------|------|-------------|---------|
| 30550 | Operator Claim | Operator | "I'm coordinating this task" |
| 30551 | PII Envelope | Party → Operator | Encrypted sensitive data handover (NIP-17) |
| 30552 | Delegation Grant | Party → Operator | "This operator may publish events on my behalf" |
| 30553 | Compliance Record | Operator | Verifiable regulatory compliance evidence |
| 30554 | Operator Heartbeat | Operator | Liveness and status proof |

### Three-Layer Architecture

```
┌─────────────────────────────────────────────────┐
│  LAYER 1: NOSTR (public, permanent, pseudonymous)│
│  Discovery, Reputation, Task lifecycle, Payments │
│  Pubkeys only. No PII. Permanent on relays.     │
├─────────────────────────────────────────────────┤
│  LAYER 2: OPERATOR (private, compliant, auditable)│
│  PII storage, Payment processing, Compliance     │
│  Subject to GDPR. Erasable. NOT on Nostr relays. │
├─────────────────────────────────────────────────┤
│  LAYER 3: EPHEMERAL (real-time, temporary)       │
│  Live tracking, ETA updates, In-task chat        │
│  WebSocket. Never persisted.                     │
└─────────────────────────────────────────────────┘
```

**Key rule:** PII never enters Layer 1.

### Operator Claim (30550)

```json
{
  "kind": 30550,
  "pubkey": "<operator-pubkey>",
  "tags": [
    ["d", "<task-id>:operator"],
    ["e", "<task-accept-event-id>", "", "task"],
    ["p", "<requester-pubkey>"],
    ["p", "<provider-pubkey>"],
    ["bond", "<operator-bond-event-id>"],
    ["services", "pii_handling", "escrow", "dispute_mediation", "live_tracking"],
    ["fee", "500", "GBP"],
    ["fee_model", "percentage"],
    ["fee_rate", "10"],
    ["ephemeral_endpoint", "wss://operator.example.com/tasks/<task-id>"],
    ["t", "trott-operator"]
  ]
}
```

Transparency by design: bond link, services declared, fee visible, ephemeral endpoint provided.

### PII Envelope (30551)

NIP-17 gift wrap for sensitive data:

```json
{
  "kind": 30551,
  "tags": [
    ["d", "<task-id>:pii:<party-role>"],
    ["e", "<task-event-id>", "", "task"],
    ["p", "<operator-pubkey>"],
    ["pii_fields", "name", "phone", "pickup_address"],
    ["retention", "task_duration_plus_30d"],
    ["erasure_method", "crypto_shredding"],
    ["t", "trott-pii"]
  ],
  "content": "<NIP-44 encrypted to operator: { name, phone, address }>"
}
```

GDPR alignment built into the event: data minimisation (`pii_fields`), storage limitation (`retention`), erasure method (`crypto_shredding`).

### Delegation Grant (30552)

Scoped, temporary delegation of specific event kinds for a specific task:

```json
{
  "kind": 30552,
  "pubkey": "<party-pubkey>",
  "tags": [
    ["d", "<task-id>:delegation:<operator-pubkey>"],
    ["p", "<operator-pubkey>"],
    ["e", "<task-event-id>", "", "task"],
    ["delegated_kinds", "30503", "30505", "30535"],
    ["conditions", "task_scope_only"],
    ["valid_until", "<unix-timestamp>"],
    ["t", "trott-delegation"]
  ]
}
```

### Compliance Record (30553)

Compliance types: `provider_credential_verified`, `insurance_confirmed`, `right_to_work`, `dbs_check`, `vehicle_check`, `pii_erasure_complete`.

### Operator Accountability

| Mechanism | Spec | What it does |
|-----------|------|-------------|
| Operator Bond | TROTT-02 (30511) | Public stake — financial skin in the game |
| Operator Reputation | TROTT-03 (30520) | Parties rate the operator after every task |
| Fee Transparency | TROTT-06 (30550) | Every task shows the operator's fee |
| Compliance Records | TROTT-06 (30553) | Verifiable regulatory due diligence |
| Heartbeat | TROTT-06 (30554) | Liveness and operational metrics |
| Dispute History | TROTT-05 (30545) | Public record of dispute outcomes |

### P2P vs Operator Comparison

| Concern | With operator | Without operator (P2P) |
|---------|---------------|----------------------|
| PII | Held by operator, GDPR-compliant | Shared directly (NIP-44) |
| Real-time tracking | Operator WebSocket | Direct or relay-based |
| Escrow | Operator or third-party managed | Trustless (Cashu HTLC, hold invoices) |
| Disputes | Operator mediates | Community panel or mutual contacts |
| Compliance | Operator handles | Each party's responsibility |
| Fee | Operator takes a cut | No intermediary fee |

---

## TROTT-07: Navigation — Routing, ETA & Real-time Tracking (Optional)

### Purpose

Location-aware coordination for physical services. Only relevant for domains where a provider travels or moves something.

### Event Kinds

| Kind | Name | Type | Published by | Purpose |
|------|------|------|-------------|---------|
| 30560 | Route Summary | Replaceable | Either/Operator | Route: distance, duration, waypoints |
| 30561 | ETA Update | Replaceable | Provider | Updated arrival estimate |
| 30562 | Route Deviation | Replaceable | Provider/Operator | Off-route safety alert |
| 30563 | Navigation Resource | Replaceable | Anyone | Offline routing data discovery |
| 20501 | Location Update | Ephemeral | Either party | Real-time encrypted position |

### Route Summary (30560)

```json
{
  "kind": 30560,
  "tags": [
    ["d", "<task-id>:route"],
    ["e", "<task-event-id>", "", "task"],
    ["distance", "12400"],
    ["distance_unit", "metres"],
    ["duration", "1080"],
    ["duration_unit", "seconds"],
    ["provider", "osrm"],
    ["provider_version", "5.27.1"],
    ["waypoints", "<NIP-44 encrypted waypoint array>"],
    ["origin_geohash", "gcpuuz"],
    ["destination_geohash", "gcpvbn"],
    ["transport_mode", "car"],
    ["t", "trott-route"]
  ]
}
```

Navigation provider transparency via `provider` tag. Encrypted waypoints, public distance/duration summary. Metric units always.

### ETA Update (30561)

Replaceable — each new ETA overwrites the previous:

```json
{
  "kind": 30561,
  "tags": [
    ["d", "<task-id>:eta"],
    ["e", "<task-event-id>", "", "task"],
    ["p", "<requester-pubkey>"],
    ["eta", "<unix-timestamp>"],
    ["eta_minutes", "7"],
    ["confidence", "high"],
    ["remaining_distance", "2800"],
    ["remaining_distance_unit", "metres"],
    ["t", "trott-eta"]
  ]
}
```

Confidence levels: `high` (live GPS + traffic), `medium` (recent GPS + projection), `low` (static estimate), `unknown` (no tracking data).

ETA accuracy feeds into TROTT-03 reputation — punctuality is measurable.

### Location Update (20501) — Ephemeral

```json
{
  "kind": 20501,
  "tags": [
    ["p", "<recipient-pubkey>"],
    ["e", "<task-event-id>", "", "task"],
    ["t", "trott-location"]
  ],
  "content": "<NIP-44 encrypted: { lat, lon, speed, heading, accuracy, timestamp }>"
}
```

Everything about the actual location is encrypted. Relays see that an update exists but cannot read coordinates. Tracking consent is explicit — providers opt in by publishing updates.

### Route Deviation (30562)

Safety-critical event when a provider deviates significantly from the expected route:

Deviation types: `off_route`, `wrong_direction`, `stopped_unexpectedly`, `excessive_speed`, `returned_to_route`.

Goes to the requester and their safety contacts (TROTT-05). Does not go public.

### Navigation Resource (30563)

Discovery events for downloadable offline routing data:

```json
{
  "kind": 30563,
  "tags": [
    ["d", "<resource-id>"],
    ["resource_type", "routing_tiles"],
    ["engine", "valhalla"],
    ["coverage", "gcpu", "gcpv", "gcpw"],
    ["coverage_name", "Greater London"],
    ["format", "pbf"],
    ["size_bytes", "156000000"],
    ["url", "<blossom or HTTP URL>"],
    ["hash", "<sha256 of file>"],
    ["t", "trott-nav-resource"]
  ]
}
```

---

## Official NIP Dependencies

| NIP | Name | Used by | How |
|-----|------|---------|-----|
| NIP-01 | Basic Protocol | All | Event structure, signing, relay communication |
| NIP-02 | Follow List | TROTT-03 | Social graph trust weighting |
| NIP-17 | Private DMs | TROTT-06 | Gift-wrapped PII exchange |
| NIP-32 | Labels | TROTT-03, 05 | Categorisation, abuse labels |
| NIP-33 | Parameterised Replaceable | All | All 36 replaceable events use `d` tags |
| NIP-40 | Expiration | All | Time-limited events |
| NIP-44 | Encryption | TROTT-02, 04, 06, 07 | Encrypted locations, PII, payments |
| NIP-47 | Wallet Connect | TROTT-04 | Trustless payment rail option |
| NIP-56 | Reporting | TROTT-05 | Abuse report compatibility |
| NIP-57 | Zaps | TROTT-04 | Payment rail option |
| NIP-58 | Badges | TROTT-03 | Credential attestation compatibility |
| NIP-59 | Gift Wrap | TROTT-06 | PII envelope encryption |

---

## Coordination Patterns

| Pattern | State machine flow | TROTT specs needed | Domain examples |
|---------|-------------------|-------------------|-----------------|
| **Trip** | accepted → en_route → arrived → in_progress → completed | 01, 02, 04, 07 | Ridesharing, taxi |
| **Dispatch** | requested → offers_open → accepted → en_route → in_progress → completed | 01, 02, 03, 04 | Locksmith, plumber, electrician |
| **Relay delivery** | accepted → en_route_pickup → collected → in_transit → delivered → confirmed | 01, 02, 04, 07 | Parcels, food, court serving |
| **Shift/patrol** | accepted → on_shift → [streaming ticks] → completed | 01, 02, 04 | Security, event staffing |
| **Scheduled/recurring** | requested → accepted → scheduled → [activates] → in_progress → completed | 01, 02, 03, 04 | Cleaning, dog walking, tutoring |
| **Crew/multi-provider** | requested → offers_open → team_assembled → in_progress → completed | 01, 02, 04 | Moving, event setup |

Cross-cutting: **competitive quoting** — any non-urgent pattern can use the `offers_open` phase.

---

## Domain Profiles

Domain profiles are configuration documents, not specs. Structure:

```markdown
# TROTT Domain Profile: {Name}

**Domain identifier:** `{id}`
**Coordination pattern:** {pattern}
**Event kind range:** 30XXX-30XXX

## TROTT Specs Used
[checklist of which specs apply]

## Roles
- Requester: "{label}"
- Provider: "{label}"

## State Machine Extension
[domain-specific states inserted into the core flow]

## Domain-Specific Tags
[tags unique to this domain]

## Rating Criteria
[criteria for TROTT-03]

## Pricing Model
[how pricing works]

## Cancellation Policy
[rules for TROTT-04 forfeiture]

## PII Requirements (if TROTT-06)
[what PII the operator needs]

## Safety Rules (if TROTT-05)
[check-in requirements, deviation thresholds]

## Domain-Specific Event Kinds
[additional kinds in the allocated range]
```

### Proposed Domains

| Domain | Identifier | Pattern | Kind range | Status |
|--------|-----------|---------|------------|--------|
| Ridesharing | `ridesharing` | Trip | 30600-30619 | Draft |
| Locksmith | `locksmith` | Dispatch | 30620-30639 | Draft |
| Delivery | `delivery` | Relay delivery | 30640-30659 | Draft |
| Towing | `towing` | Dispatch + Trip | 30660-30679 | Draft |
| Emergency trades | `emergency-trades` | Dispatch | 30680-30699 | Draft |
| Pet services | `pet-services` | Scheduled | 30700-30719 | Draft |
| Security | `security` | Shift | 30720-30739 | Draft |
| Cleaning | `cleaning` | Scheduled/recurring | 30740-30759 | Planned |
| Moving | `moving` | Crew/multi-provider | 30760-30779 | Planned |

**30780-30999 reserved** for future domains.

---

## Use Case Universe

The following use cases are covered by the 6 coordination patterns and 9 domain profiles:

### On-demand physical services (Dispatch pattern)
Locksmith, plumbing, electrical, gas, HVAC, mobile mechanic, pest control, handyman, mobile car wash/detailing, mobile massage/physiotherapy, mobile hairdresser, on-site IT support

### Delivery & logistics (Relay delivery pattern)
Parcel delivery, food delivery, grocery delivery, medical courier, document courier, process serving, court serving, furniture delivery

### Transport (Trip pattern)
Ridesharing, taxi, valet parking

### Vehicle & roadside (Dispatch + Trip pattern)
Towing, vehicle recovery, roadside assistance (jump start, tyre change, fuel delivery)

### Care services (Scheduled pattern)
Pet walking, pet sitting, pet grooming, babysitting, childcare, elder care, companion visits, tutoring, personal training

### Security & safety (Shift pattern)
Security guard dispatch, event security staffing, neighbourhood watch coordination

### Professional/licensed (Dispatch pattern)
Surveying, home inspection, notary services, on-site translation/interpretation, photography/videography

### Recurring services (Scheduled/recurring pattern)
Cleaning (home, commercial), lawn care, landscaping, regular maintenance

### Crew-based services (Crew/multi-provider pattern)
Moving/removals, event setup, construction teams

### Cross-cutting: Competitive quoting
Any non-urgent dispatch, scheduled, or crew service benefits from multiple providers submitting quotes.

---

## Implementation Tiers

### Tier 1: Minimum Viable (P2P app)
- Implement TROTT-01 + TROTT-02
- 14 event kinds
- Publish task requests, discover providers, manage lifecycle

### Tier 2: Trusted (+ payments and reputation)
- Add TROTT-03 + TROTT-04
- 21 event kinds
- Ratings, quotes, escrow, payment receipts

### Tier 3: Safe (+ safety infrastructure)
- Add TROTT-05
- 28 event kinds
- Emergency signals, check-ins, disputes

### Tier 4: Full operator
- Add TROTT-06 + TROTT-07
- All 38 event kinds
- Operator coordination, PII handling, navigation, tracking

---

## Repository Structure

```
specs/
├── TROTT-01-core.md
├── TROTT-02-discovery.md
├── TROTT-03-reputation.md
├── TROTT-04-payments.md
├── TROTT-05-safety.md
├── TROTT-06-coordination.md
├── TROTT-07-navigation.md
├── QUICK-REFERENCE.md
├── domains/
│   ├── ridesharing.md
│   ├── locksmith.md
│   ├── delivery.md
│   ├── towing.md
│   ├── emergency-trades.md
│   ├── pet-services.md
│   ├── security.md
│   ├── cleaning.md
│   └── moving.md
└── archive/
    └── NIP-XX-v1-archive.md
```

---

## Next Steps

1. **Write the 7 TROTT spec documents** — Convert this design into formal specifications following official NIP formatting conventions
2. **Write the 9 domain profiles** — Migrate existing domain extension content into the new profile template
3. **Update QUICK-REFERENCE.md** — New event kind table, dependency graph, implementation tiers
4. **Update CLAUDE.md** — Reflect TROTT naming and new structure
5. **Update the reference implementation** — Align `src/domain-profiles/`, `server.js`, and tests with TROTT event kinds
6. **Rename all "NIP-XX" references** — Replace with TROTT-XX throughout the codebase and documentation
7. **Move archived specs** — Original NIP-XX files into `specs/archive/`
