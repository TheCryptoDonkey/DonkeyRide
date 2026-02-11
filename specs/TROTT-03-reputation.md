# TROTT-03: Reputation — Ratings, Trust & Credentials

`draft` `optional`

## Abstract

This specification defines a **domain-agnostic reputation system** for trust-minimised physical service coordination,
comprising three event kinds: **Task Rating** (30520), **Reputation Query** (30521), and **Credential Attestation** (
30522). Ratings are cryptographically signed by the rater's Nostr private key, stored on public relays, and are
therefore portable across operators and domains, unforgeable, and transparent. The specification defines the event
schemas, trust weighting signals, domain-specific rating criteria, and a credential framework compatible with NIP-58
badges — but deliberately does not prescribe a scoring algorithm, leaving that to implementations.

Rating criteria are not hardcoded. Each domain profile defines which criteria are available (e.g. `safety` and
`punctuality` for ridesharing, `workmanship` and `pricing_fairness` for locksmith). The core protocol provides the event
schemas and trust signals; the domain profile provides the semantics.

## Motivation

Traditional platforms control reputation data, creating vendor lock-in and enabling manipulation. A driver with 10,000
five-star rides on one platform starts at zero on another. By storing ratings as signed Nostr events, this protocol
ensures:

- **No lock-in** — A provider's reputation follows their pubkey across operators and applications
- **No manipulation** — Operators cannot fabricate, delete, or modify ratings signed by other pubkeys
- **Transparency** — Anyone can independently compute a provider's reputation from public events
- **Cross-domain portability** — A reliable courier carries that reputation into ridesharing, locksmith dispatch, or any
  other domain
- **Stake-weighted credibility** — Ratings from high-stake tasks carry more weight than low-stake or zero-stake
  interactions
- **Credential composability** — Third-party attestations (background checks, trade certifications, insurance) are
  machine-readable and interoperable with NIP-58 badges

## Depends On

- **TROTT-01**: Core service coordination protocol (task lifecycle, state machine, event kind 30505 Task Confirm)
- **NIP-01**: Basic protocol flow and event format
- **NIP-02**: Contact List / Follow List (for social distance trust weighting)
- **NIP-32**: Structured labels (for provider and outcome labelling)
- **NIP-33**: Parameterised replaceable events (d tag deduplication)
- **NIP-58**: Badges (credential compatibility)

---

## Event Kinds

| Kind  | Name                   | Replaceable  | Publisher                                       | Description                                                              |
|-------|------------------------|--------------|-------------------------------------------------|--------------------------------------------------------------------------|
| 30520 | Task Rating            | Yes (NIP-33) | Either party                                    | One rating per party per task. `d` tag ensures uniqueness.               |
| 30521 | Reputation Query       | Yes (NIP-33) | Anyone (typically operator)                     | Pre-aggregated reputation summary. Convenience cache, not authoritative. |
| 30522 | Credential Attestation | Yes (NIP-33) | Issuer (operator, industry body, peer, or self) | Third-party verification of qualifications, licences, or certifications. |

---

## Event Structures

### Kind 30520: Task Rating

Published by either party after task completion to rate the counterparty. Each party publishes exactly one rating per
task, enforced by the NIP-33 `d` tag format `<task_id>:rating:<rater_role>`. The `e` tag references the Task Confirm
event (kind 30505), providing cryptographic proof that the rater participated in the task being rated.

```json
{
  "kind": 30520,
  "pubkey": "<rater_hex_pubkey>",
  "created_at": 1698765500,
  "tags": [
    [
      "d",
      "task_abc123:rating:requester"
    ],
    [
      "p",
      "<rated_provider_hex_pubkey>"
    ],
    [
      "e",
      "<task_confirm_event_id_30505>",
      "wss://relay.example.com"
    ],
    [
      "domain",
      "ridesharing"
    ],
    [
      "role",
      "provider"
    ],
    [
      "rating",
      "overall",
      "4"
    ],
    [
      "rating",
      "punctuality",
      "5"
    ],
    [
      "rating",
      "safety",
      "4"
    ],
    [
      "rating",
      "vehicle_condition",
      "3"
    ],
    [
      "stake_evidence",
      "1500",
      "GBP"
    ]
  ],
  "content": "Good driver, arrived on time. Vehicle was clean but showing some wear. Excellent communication throughout."
}
```

**Tag reference:**

| Tag              | Required           | Format                          | Description                                                                                                         |
|------------------|--------------------|---------------------------------|---------------------------------------------------------------------------------------------------------------------|
| `d`              | Yes                | `<task_id>:rating:<rater_role>` | NIP-33 deduplication. `rater_role` is `requester` or `provider`. One rating per party per task.                     |
| `p`              | Yes                | `<hex_pubkey>`                  | The pubkey of the party being rated. Standard Nostr `p` tag for relay indexing.                                     |
| `e`              | Yes                | `<event_id>`, `<relay_hint>`    | References the Task Confirm event (kind 30505). Verifiable proof that the rater participated in this task.          |
| `domain`         | Recommended        | String                          | Which domain this task belonged to. Enables domain-specific filtering.                                              |
| `role`           | Recommended        | `provider` or `requester`       | Whether the rated party was the provider or requester. Enables role-specific reputation queries.                    |
| `rating`         | Yes (at least one) | `<criterion>`, `<value>`        | Multi-value rating tag. `overall` MUST be present. Additional criteria are domain-defined. Values are integers 1-5. |
| `stake_evidence` | Recommended        | `<amount>`, `<currency>`        | How much was at stake in this task. Higher stakes imply greater credibility.                                        |
| `content`        | Optional           | Free text                       | Written review. MAY be empty.                                                                                       |

#### d Tag Format

The `d` tag format `<task_id>:rating:<rater_role>` ensures exactly one rating per party per task via NIP-33
parameterised replaceable event semantics. If a party publishes a second rating for the same task, it replaces the
first.

Examples:

- `task_abc123:rating:requester` — the requester's rating of the provider
- `task_abc123:rating:provider` — the provider's rating of the requester

#### e Tag Linkage

The `e` tag MUST reference a kind 30505 Task Confirm event. Implementations SHOULD verify that:

1. The referenced event exists and has a valid signature
2. The rater's pubkey appears as a participant in the referenced task
3. The task reached a terminal state (`completed`, or in some cases `cancelled` after partial work)
4. The rating's `created_at` timestamp is within a reasonable window of the task completion (implementations SHOULD
   reject ratings published more than 30 days after completion)

This linkage prevents rating fabrication — you cannot rate a task you did not participate in.

#### The `overall` Rating

The `overall` criterion MUST be present on every Task Rating event. It represents the rater's holistic assessment of the
interaction on a 1-5 integer scale:

| Value | Meaning                           |
|-------|-----------------------------------|
| 1     | Unacceptable — serious issues     |
| 2     | Poor — below expectations         |
| 3     | Adequate — met basic expectations |
| 4     | Good — above expectations         |
| 5     | Excellent — outstanding service   |

Additional domain-specific criteria are optional and defined by the domain profile (
see [Domain-Specific Rating Criteria](#domain-specific-rating-criteria)).

#### Requester Rating a Provider (Ridesharing Example)

```json
{
  "kind": 30520,
  "pubkey": "<requester_hex_pubkey>",
  "created_at": 1698765500,
  "tags": [
    ["d", "task_r7k9m2:rating:requester"],
    ["p", "<driver_hex_pubkey>"],
    ["e", "<confirm_event_id>", "wss://relay.donkeyride.com"],
    ["domain", "ridesharing"],
    ["role", "provider"],
    ["rating", "overall", "5"],
    ["rating", "punctuality", "5"],
    ["rating", "safety", "5"],
    ["rating", "vehicle_condition", "4"],
    ["rating", "communication", "5"],
    ["stake_evidence", "1200", "GBP"]
  ],
  "content": "Excellent ride. Arrived promptly, drove safely, and took the fastest route. Car was comfortable."
}
```

#### Provider Rating a Requester (Locksmith Example)

```json
{
  "kind": 30520,
  "pubkey": "<locksmith_hex_pubkey>",
  "created_at": 1698770100,
  "tags": [
    ["d", "task_lk42x8:rating:provider"],
    ["p", "<customer_hex_pubkey>"],
    ["e", "<confirm_event_id>", "wss://relay.donkeyride.com"],
    ["domain", "locksmith"],
    ["role", "requester"],
    ["rating", "overall", "4"],
    ["rating", "punctuality", "3"],
    ["stake_evidence", "750", "GBP"]
  ],
  "content": "Customer was friendly but took 10 minutes to answer the door after I arrived."
}
```

#### Delivery Domain Example

```json
{
  "kind": 30520,
  "pubkey": "<sender_hex_pubkey>",
  "created_at": 1698780200,
  "tags": [
    ["d", "task_dl99p3:rating:requester"],
    ["p", "<courier_hex_pubkey>"],
    ["e", "<confirm_event_id>", "wss://relay.donkeypack.com"],
    ["domain", "delivery"],
    ["role", "provider"],
    ["rating", "overall", "4"],
    ["rating", "punctuality", "5"],
    ["rating", "package_care", "3"],
    ["rating", "communication", "4"],
    ["stake_evidence", "500", "GBP"]
  ],
  "content": "Fast delivery. Package arrived with a small dent on one corner but contents were undamaged."
}
```

---

### Kind 30521: Reputation Query

A pre-aggregated reputation summary for a given pubkey. Published by operators or aggregators as a convenience cache —
consumers SHOULD verify by independently querying and computing from kind 30520 events when stakes are high. Anyone MAY
publish a Reputation Query; consumers decide which publishers they trust.

This event is a NIP-33 parameterised replaceable event. The publisher updates it periodically as new ratings arrive.

```json
{
  "kind": 30521,
  "pubkey": "<operator_hex_pubkey>",
  "created_at": 1698800000,
  "tags": [
    ["d", "<subject_hex_pubkey>:reputation:ridesharing"],
    ["p", "<subject_hex_pubkey>"],
    ["domain", "ridesharing"],
    ["role", "provider"],
    ["average_rating", "4.7"],
    ["total_ratings", "342"],
    ["total_tasks", "358"],
    ["completion_rate", "0.96"],
    ["no_show_count", "2"],
    ["dispute_count", "1"],
    ["average_stake", "1200", "GBP"],
    ["member_since", "1680000000"],
    ["last_updated", "1698800000"],
    ["rating_breakdown", "5:280,4:42,3:12,2:5,1:3"],
    ["criteria_averages", "punctuality:4.8,safety:4.9,vehicle_condition:4.3,communication:4.7"]
  ],
  "content": ""
}
```

**Tag reference:**

| Tag                 | Required    | Description                                                                                   |
|---------------------|-------------|-----------------------------------------------------------------------------------------------|
| `d`                 | Yes         | `<subject_pubkey>:reputation:<domain>`. Unique per subject per domain per publisher.          |
| `p`                 | Yes         | Subject pubkey (the person whose reputation this summarises).                                 |
| `domain`            | Recommended | Which domain this summary covers. Omit for cross-domain aggregate.                            |
| `role`              | Recommended | `provider` or `requester` — which role is being summarised.                                   |
| `average_rating`    | Yes         | Weighted average overall rating (decimal, 1.0-5.0).                                           |
| `total_ratings`     | Yes         | Number of ratings included in the computation.                                                |
| `total_tasks`       | Recommended | Total tasks completed (may differ from total_ratings if not all tasks are rated).             |
| `completion_rate`   | Recommended | Decimal 0.0-1.0 representing successful completion proportion.                                |
| `no_show_count`     | Recommended | Number of no-show incidents.                                                                  |
| `dispute_count`     | Recommended | Number of disputes filed against this pubkey.                                                 |
| `average_stake`     | Optional    | Average stake amount across rated tasks, with currency.                                       |
| `member_since`      | Optional    | Unix timestamp of the subject's first task.                                                   |
| `last_updated`      | Optional    | Unix timestamp of the most recent rating included.                                            |
| `rating_breakdown`  | Optional    | Distribution of overall ratings. Format: `5:<count>,4:<count>,3:<count>,2:<count>,1:<count>`. |
| `criteria_averages` | Optional    | Per-criterion averages. Format: `<criterion>:<average>,...`.                                  |

#### Volume Normalisation

Operators SHOULD apply volume normalisation when ranking providers by reputation. A provider with 5.0 stars from 3
ratings is not necessarily more trustworthy than a provider with 4.7 stars from 500 ratings.

A recommended approach is Bayesian averaging:

```
adjusted_rating = (C × M + R × N) / (C + N)
```

Where:
- `C` is a confidence threshold (e.g. 10 ratings)
- `M` is the domain-wide mean rating
- `R` is the provider's raw average rating
- `N` is the provider's total rating count

This pulls low-volume providers towards the domain mean until sufficient data accumulates. The specific formula and
confidence threshold are operator-defined, but the principle of penalising low sample sizes is RECOMMENDED.

Reputation Query events (kind 30521) include `total_ratings` as a tag, enabling consumers to apply their own volume
normalisation.

#### Cross-Domain Reputation Query

An operator MAY publish a cross-domain summary by omitting the `domain` tag:

```json
{
  "kind": 30521,
  "pubkey": "<aggregator_hex_pubkey>",
  "created_at": 1698800000,
  "tags": [
    ["d", "<subject_hex_pubkey>:reputation:all"],
    ["p", "<subject_hex_pubkey>"],
    ["role", "provider"],
    ["average_rating", "4.5"],
    ["total_ratings", "512"],
    ["total_tasks", "540"],
    ["completion_rate", "0.95"],
    ["domains_active", "ridesharing,delivery,locksmith"],
    ["domain_breakdown", "ridesharing:4.7:342,delivery:4.3:120,locksmith:4.2:50"]
  ],
  "content": ""
}
```

The `domain_breakdown` tag provides per-domain averages: `<domain>:<average>:<count>,...`.

---

### Kind 30522: Credential Attestation

Published by an issuer to attest that a pubkey holds a specific qualification, licence, certification, or other
verifiable credential. Credential Attestations are NIP-33 parameterised replaceable events, allowing the issuer to
update or revoke credentials by publishing a new event with the same `d` tag.

```json
{
  "kind": 30522,
  "pubkey": "<issuer_hex_pubkey>",
  "created_at": 1698700000,
  "tags": [
    ["d", "<subject_hex_pubkey>:credential:gas_safe_registration"],
    ["p", "<subject_hex_pubkey>"],
    ["credential_type", "trade_licence"],
    ["credential_name", "Gas Safe Registration"],
    ["credential_id", "GS-548721"],
    ["issued", "1680000000"],
    ["expires", "1711536000"],
    ["domain", "emergency_trades"],
    ["verification_url", "https://www.gassaferegister.co.uk/find-an-engineer/?id=548721"],
    ["issuer_type", "industry_body"]
  ],
  "content": ""
}
```

**Tag reference:**

| Tag                | Required    | Description                                                                                              |
|--------------------|-------------|----------------------------------------------------------------------------------------------------------|
| `d`                | Yes         | `<subject_pubkey>:credential:<credential_type_slug>`. Unique per subject per credential type per issuer. |
| `p`                | Yes         | Subject pubkey (the person holding the credential).                                                      |
| `credential_type`  | Yes         | Category of credential (see Credential Types table).                                                     |
| `credential_name`  | Yes         | Human-readable name of the credential.                                                                   |
| `credential_id`    | Recommended | External identifier (licence number, registration ID, certificate number).                               |
| `issued`           | Recommended | Unix timestamp when the credential was issued.                                                           |
| `expires`          | Recommended | Unix timestamp when the credential expires. Omit for non-expiring credentials.                           |
| `domain`           | Recommended | Primary domain this credential is relevant to.                                                           |
| `verification_url` | Optional    | URL where the credential can be independently verified.                                                  |
| `issuer_type`      | Recommended | Category of issuer (see Issuer Trust Hierarchy).                                                         |

#### Credential Types

| Type                      | Description                                | Examples                                |
|---------------------------|--------------------------------------------|-----------------------------------------|
| `trade_licence`           | Professional trade registration            | Gas Safe, NICEIC, OFTEC                 |
| `background_check`        | Criminal record / identity verification    | DBS Enhanced, Checkr, Onfido            |
| `insurance`               | Professional indemnity or public liability | Verified public liability insurance     |
| `vehicle_licence`         | Vehicle-related licensing                  | PHV licence, HGV licence, MOT           |
| `security_licence`        | Security industry authorisation            | SIA Door Supervisor, SIA CCTV           |
| `health_certification`    | Health and hygiene qualifications          | Food Hygiene Level 2, First Aid         |
| `professional_membership` | Membership of a professional body          | Master Locksmiths Association, RICS     |
| `training_certificate`    | Completion of specific training            | Manual handling, working at height      |
| `peer_endorsement`        | Informal endorsement by another user       | Vouched for by trusted community member |
| `inspection_certificate`  | Formal inspection pass certificate         | EICR, EPC, gas safety CP12, PAT testing |
| `environmental_licence`   | Environmental or waste handling authority   | Waste carrier licence, asbestos licence |
| `maritime_certification`  | Marine and waterway qualifications         | RYA Yachtmaster, MCA certification      |
| `aviation_certification`  | Aviation and drone qualifications          | CAA Flyer ID, GVC, A2 CofC             |
| `self_declared`           | Self-reported qualification (unverified)   | Claimed years of experience             |

#### Issuer Trust Hierarchy

The issuer's pubkey determines the weight of the credential. Implementations SHOULD apply the following trust hierarchy:

| Issuer Type        | Trust Level | Description                                                  | Examples                                                  |
|--------------------|-------------|--------------------------------------------------------------|-----------------------------------------------------------|
| `operator`         | Highest     | Operator has verified the credential against primary sources | Background check via DBS, insurance certificate inspected |
| `industry_body`    | High        | Recognised trade or regulatory body                          | Gas Safe Register, SIA, Master Locksmiths Association     |
| `peer_attestation` | Medium      | Another user with established reputation vouches             | Experienced locksmith attests a new locksmith's skills    |
| `self_declared`    | Lowest      | The subject claims the credential themselves                 | "10 years experience as a plumber"                        |

Implementations SHOULD display the issuer type prominently so consumers can make informed trust decisions.

#### NIP-58 Compatibility

Credential Attestations are designed to complement NIP-58 badges. An operator MAY publish both:

1. A **kind 30522 Credential Attestation** (machine-readable, queryable, with expiry and verification URL)
2. A **kind 30009 + kind 8 NIP-58 badge** (human-readable, displayable across Nostr clients)

The Credential Attestation carries richer metadata (credential_id, verification_url, expires) whilst the NIP-58 badge
provides visual display across the ecosystem. Together they provide both programmatic and visual credential
presentation.

#### Operator-Issued Credential Example

```json
{
  "kind": 30522,
  "pubkey": "<operator_hex_pubkey>",
  "created_at": 1698700000,
  "tags": [
    ["d", "<driver_hex_pubkey>:credential:phv_licence"],
    ["p", "<driver_hex_pubkey>"],
    ["credential_type", "vehicle_licence"],
    ["credential_name", "TfL Private Hire Vehicle Licence"],
    ["credential_id", "PHV-2024-88421"],
    ["issued", "1680000000"],
    ["expires", "1743465600"],
    ["domain", "ridesharing"],
    ["verification_url", "https://tfl.gov.uk/modes/taxis-and-minicabs/check-a-licence"],
    ["issuer_type", "operator"]
  ],
  "content": ""
}
```

#### Peer Attestation Example

```json
{
  "kind": 30522,
  "pubkey": "<experienced_locksmith_hex_pubkey>",
  "created_at": 1698700000,
  "tags": [
    ["d", "<new_locksmith_hex_pubkey>:credential:peer_endorsement_locksmith"],
    ["p", "<new_locksmith_hex_pubkey>"],
    ["credential_type", "peer_endorsement"],
    ["credential_name", "Locksmith Skills Endorsement"],
    ["domain", "locksmith"],
    ["issuer_type", "peer_attestation"]
  ],
  "content": "I have worked alongside this locksmith for 3 years. They are skilled with both traditional and electronic locks."
}
```

#### Self-Declared Credential Example

```json
{
  "kind": 30522,
  "pubkey": "<subject_hex_pubkey>",
  "created_at": 1698700000,
  "tags": [
    ["d", "<subject_hex_pubkey>:credential:self_declared_experience"],
    ["p", "<subject_hex_pubkey>"],
    ["credential_type", "self_declared"],
    ["credential_name", "15 Years Plumbing Experience"],
    ["domain", "emergency_trades"],
    ["issuer_type", "self_declared"]
  ],
  "content": "Self-employed plumber since 2011. Specialising in central heating and bathroom installations."
}
```

#### Credential Revocation

To revoke a credential, the issuer publishes a replacement event with the same `d` tag and an `expires` timestamp in the
past, or with a `revoked` tag:

```json
{
  "kind": 30522,
  "pubkey": "<operator_hex_pubkey>",
  "created_at": 1698900000,
  "tags": [
    ["d", "<subject_hex_pubkey>:credential:gas_safe_registration"],
    ["p", "<subject_hex_pubkey>"],
    ["credential_type", "trade_licence"],
    ["credential_name", "Gas Safe Registration"],
    ["credential_id", "GS-548721"],
    ["revoked", "1698900000"],
    ["revocation_reason", "Registration lapsed — not renewed"],
    ["issuer_type", "industry_body"]
  ],
  "content": ""
}
```

#### Credential Expiry Monitoring

Operators SHOULD monitor `expires` tags on Credential Attestation events for providers in their network. When a
provider's mandatory credential approaches expiry (within 30 days), the operator SHOULD notify the provider and request
re-verification.

Operators MUST NOT match providers whose mandatory credentials have expired. When a credential expires during an active
task, the operator SHOULD notify the requester but SHOULD NOT auto-cancel the task — the work may be nearly complete.
The operator SHOULD publish an updated Compliance Record (TROTT-06, kind 30553) with result `expired` when a provider's
credential lapses.

Providers SHOULD proactively publish updated Credential Attestation events when renewing credentials, referencing the
original attestation's `d` tag to replace the expiring event.

---

## Domain-Specific Rating Criteria

Each domain profile defines which rating criteria are available beyond the mandatory `overall` criterion. The criteria
fall into two categories: **universal** criteria that transfer across domains and **domain-specific** criteria that are
meaningful only within their domain.

> **Note:** The criteria listed here summarise those defined authoritatively in each domain's profile specification (
`specs/domains/*.md`).

### Universal Criteria

These criteria carry the same semantics regardless of domain. Implementations SHOULD transfer universal criteria ratings
across domains when computing cross-domain reputation.

| Criterion       | Description                                           |
|-----------------|-------------------------------------------------------|
| `punctuality`   | Arrived or was ready on time                          |
| `communication` | Quality, clarity, and responsiveness of communication |
| `reliability`   | Followed through on commitments                       |
| `honesty`       | Transparent about pricing, timelines, and issues      |

### Domain Criteria Tables

#### Ridesharing

| Criterion           | Universal | Description                                             |
|---------------------|-----------|---------------------------------------------------------|
| `overall`           | --        | Holistic assessment (1-5)                               |
| `punctuality`       | Yes       | Arrived at pickup on time                               |
| `safety`            | No        | Driving safety and adherence to traffic laws            |
| `vehicle_condition` | No        | Cleanliness, comfort, and roadworthiness of the vehicle |
| `communication`     | Yes       | Responsiveness and clarity before and during the ride   |

#### Locksmith

| Criterion          | Universal | Description                                                  |
|--------------------|-----------|--------------------------------------------------------------|
| `overall`          | --        | Holistic assessment (1-5)                                    |
| `punctuality`      | Yes       | Arrived at the customer's location on time                   |
| `workmanship`      | No        | Quality of lock work performed                               |
| `pricing_fairness` | No        | Whether the final price matched the quote and was reasonable |
| `tidiness`         | No        | Left the work area clean and undamaged                       |

#### Delivery

| Criterion       | Universal | Description                                     |
|-----------------|-----------|-------------------------------------------------|
| `overall`       | --        | Holistic assessment (1-5)                       |
| `punctuality`   | Yes       | Collected and delivered on time                 |
| `package_care`  | No        | Package arrived undamaged and in good condition |
| `communication` | Yes       | Updates during transit, responsiveness          |

#### Cleaning

| Criterion             | Universal | Description                               |
|-----------------------|-----------|-------------------------------------------|
| `overall`             | --        | Holistic assessment (1-5)                 |
| `thoroughness`        | No        | Completeness and depth of cleaning        |
| `punctuality`         | Yes       | Arrived on time, finished within estimate |
| `trustworthiness`     | No        | Comfort level with cleaner in the home    |
| `attention_to_detail` | No        | Noticed and addressed small details       |

#### Security

| Criterion         | Universal | Description                                  |
|-------------------|-----------|----------------------------------------------|
| `overall`         | --        | Holistic assessment (1-5)                    |
| `alertness`       | No        | Attentiveness during duty                    |
| `professionalism` | No        | Conduct, uniform, bearing                    |
| `communication`   | Yes       | Clarity of handover notes and status updates |
| `punctuality`     | Yes       | Arrived for the shift on time                |

### Cross-Domain Transfer Rules

When computing reputation across domains:

1. **Universal criteria** (punctuality, communication, reliability, honesty) — Transfer at full weight
2. **Domain-specific criteria** — Do NOT transfer. A locksmith's `workmanship` rating is meaningless in a ridesharing
   context.
3. **`overall` rating** — Transfers at a reduced weight determined by the operator (recommended 50% for adjacent
   domains, 25% for distant domains)

Implementations SHOULD document their cross-domain weighting policy transparently.

#### Domain Adjacency Categories

To determine whether domains are "adjacent" or "distant" for cross-domain reputation weighting, operators SHOULD group
domains by trust-transferable characteristics:

| Category          | Example Domains                                         | Transferable Criteria                        |
|-------------------|---------------------------------------------------------|----------------------------------------------|
| Property access   | Locksmith, cleaning, pest control, plumbing, electrical | Trustworthiness, punctuality, tidiness       |
| Transport         | Ridesharing, delivery, courier, towing, moving          | Punctuality, vehicle care, communication     |
| Personal service  | Tutoring, hairdressing, personal training, massage      | Communication, professionalism, reliability  |
| Care              | Elderly care, pet sitting, babysitting, nursing         | Trustworthiness, empathy, reliability        |
| Security          | Security guard, door supervision, close protection      | Alertness, professionalism, reliability      |
| Trades            | Plumbing, electrical, roofing, glazing, gas engineering | Workmanship, pricing fairness, tidiness      |
| Inspection        | Building surveyor, PAT testing, fire risk, gas safety   | Thoroughness, accuracy, professionalism      |

Domains within the same category are considered "adjacent" (recommended 50% cross-domain weight for the `overall`
rating). Domains in different categories are considered "distant" (recommended 25%). Operators MAY define custom
adjacency mappings appropriate to their market.

---

## Trust Weighting Signals

This specification defines the **signals** that implementations SHOULD consider when computing weighted reputation
scores. It deliberately does not prescribe a specific algorithm — implementations choose their own weighting formulae.
The signals are:

### 1. Stake Evidence

The `stake_evidence` tag on kind 30520 events indicates how much was at stake in the rated task. A rating from a task
with GBP 2,000 at stake carries more credibility than one with GBP 50 at stake, because the rater had more skin in the
game.

**Signal**: Higher stake amounts imply greater rater commitment and thus greater rating credibility.

### 2. Social Distance (NIP-02 Follow Graph)

The social distance between the person querying reputation and the rater, measured via NIP-02 follow lists (kind 3
events):

| Social Distance          | Description                                          |
|--------------------------|------------------------------------------------------|
| 1-hop (direct follow)    | The querier follows the rater's pubkey               |
| 2-hop (follow-of-follow) | The rater is followed by someone the querier follows |
| 3-hop (same community)   | Connected within 3 hops in the follow graph          |
| No connection            | No path exists in the follow graph                   |

**Signal**: Ratings from socially proximate raters are more trustworthy to the querier than ratings from strangers. This
provides natural Sybil resistance — fake accounts with no social connections have diminished influence.

### 3. Rater Reputation (Recursive)

The rater's own reputation as computed from kind 30520 events. A rating from a rater with 500 completed tasks and a 4.8
average carries more weight than one from a rater with 2 tasks and no history.

**Signal**: Established raters are more credible than new or low-volume raters.

### 4. Recency

The `created_at` timestamp of the rating event. Recent ratings reflect the current state of the provider's service
quality more accurately than old ratings.

**Signal**: More recent ratings are more relevant. Implementations SHOULD apply time decay.

### 5. Task Count (Rater Volume)

The total number of ratings published by the rater. A rater who has completed 200 tasks and rates consistently is
providing a larger statistical sample than a first-time rater.

**Signal**: Higher-volume raters provide more statistically reliable ratings.

### Sybil Resistance

The combination of these signals provides layered Sybil resistance:

- **Stake evidence** — Fake ratings cannot claim high stakes without actually locking funds
- **Social distance** — Fake accounts have no social connections, reducing their influence on personalised scores
- **Rater reputation** — New accounts have no rating history, reducing their credibility as raters
- **Task linkage** — Each rating MUST reference a valid Task Confirm event (kind 30505), preventing fabrication of
  ratings for non-existent tasks

An attacker would need to create many funded accounts, build social graphs, complete real tasks, and accumulate genuine
rater reputation before their fraudulent ratings carry meaningful weight.

---

## Anti-Gaming Measures

### Structural Protections

1. **One rating per party per task** — Enforced by the NIP-33 `d` tag format. A second rating for the same task replaces
   the first, not appends.
2. **Signed by the rater** — Each rating is signed by the rater's Nostr private key. Operators cannot fabricate ratings
   on behalf of users.
3. **Task linkage** — The `e` tag references a specific Task Confirm event (kind 30505). Implementations MUST verify
   that the rater was a participant in the referenced task.
4. **Time validation** — Implementations SHOULD reject rating events with `created_at` timestamps more than 30 days
   after the referenced task's completion.
5. **Append-only storage** — Rating events are stored on public Nostr relays. Operators cannot selectively remove
   unfavourable ratings.

### What Operators Cannot Do

- **Fabricate ratings** — They do not possess the rater's private key
- **Delete ratings** — Events exist on public relays outside the operator's control
- **Modify ratings** — Events are cryptographically signed; any modification invalidates the signature
- **Selectively display ratings** — Any client can independently query relays and compute reputation

### What Operators Can Do

- **Weight ratings** — Apply time decay, stake weighting, or social distance multipliers in their own Reputation Query (
  kind 30521) computations
- **Flag suspicious patterns** — Report potential Sybil attacks or rating manipulation
- **Require credentials** — Only match providers holding specific Credential Attestations (kind 30522)

---

## Relay Filter Patterns

### Querying Ratings for a Specific Pubkey

```json
{
  "kinds": [
    30520
  ],
  "#p": [
    "<subject_hex_pubkey>"
  ]
}
```

### Querying Ratings for a Specific Pubkey in a Specific Domain

```json
{
  "kinds": [
    30520
  ],
  "#p": [
    "<subject_hex_pubkey>"
  ],
  "#domain": [
    "ridesharing"
  ]
}
```

### Querying Provider Ratings Only

```json
{
  "kinds": [
    30520
  ],
  "#p": [
    "<subject_hex_pubkey>"
  ],
  "#role": [
    "provider"
  ]
}
```

### Querying Reputation Summaries

```json
{
  "kinds": [
    30521
  ],
  "#p": [
    "<subject_hex_pubkey>"
  ]
}
```

### Querying Credentials for a Specific Pubkey

```json
{
  "kinds": [
    30522
  ],
  "#p": [
    "<subject_hex_pubkey>"
  ]
}
```

### Querying All Credentials Issued by a Specific Operator

```json
{
  "kinds": [
    30522
  ],
  "authors": [
    "<operator_hex_pubkey>"
  ]
}
```

---

## Cross-Domain Portability

A provider's reputation follows their Nostr pubkey across operators and domains. This works because:

1. **Ratings are signed by the rater's pubkey** — they cannot be fabricated by operators
2. **Ratings are stored on public Nostr relays** — any operator can query them
3. **The `p` tag indexes ratings by the rated pubkey** — standard Nostr relay filtering
4. **The `domain` tag enables domain-specific filtering** — operators can query all ratings or filter by domain

### Importing Reputation to a New Operator

When a provider joins a new operator:

1. The new operator queries relays for kind 30520 events with `#p` matching the provider's pubkey
2. The operator verifies each event's signature independently
3. For each rating, the operator verifies the `e` tag references a valid Task Confirm event
4. The operator applies its own weighting policy (stake evidence, social distance, recency, cross-domain transfer rules)
5. The operator publishes a kind 30521 Reputation Query summarising the computed reputation

### Cross-Domain Weighting Example

A ridesharing operator imports a locksmith's ratings:

- **Universal criteria** (punctuality, communication) — Transferred at full weight
- **Domain-specific criteria** (workmanship, pricing_fairness) — Ignored (not relevant to ridesharing)
- **Overall rating** — Transferred at 50% weight (adjacent service domain)
- **Stake evidence** — Applied at full weight (stake credibility is domain-independent)

---

## GDPR Compliance

Rating events contain pseudonymous identifiers (Nostr pubkeys) which are personal data under GDPR (see *Breyer v
Bundesrepublik*, C-582/14). When a user exercises their right to erasure (Article 17):

1. **Destroy the user's key pair** — Without the private key, the pubkey becomes an unlinkable pseudonym
2. **Relay deletion requests** — Submit NIP-09 deletion requests to relays for all events authored by the pubkey
3. **Ratings by other users** — Events signed by OTHER pubkeys about this user cannot be deleted by the user or
   operator. The rating publisher is the data controller for their own events.
4. **Credential revocation** — Issuers SHOULD revoke Credential Attestations (kind 30522) when informed that the subject
   has exercised their right to erasure

Crypto-shredding (destroying the private key) provides unlinkability rather than physical erasure. The EDPB (April 2025
guidelines) acknowledges this as an approach that "comes closer to compliance" for distributed systems.

---

## See Also

- **TROTT-01**: Core protocol (task lifecycle, state machine, Task Confirm event kind 30505)
- **TROTT-04**: Payments (stake evidence for rating credibility, tip behaviour)
- **NIP-01**: Basic protocol flow and event format
- **NIP-02**: Contact List / Follow List (social distance trust weighting)
- **NIP-32**: Structured labels (provider and outcome labelling)
- **NIP-33**: Parameterised replaceable events (d tag deduplication)
- **NIP-58**: Badges (visual credential display across the Nostr ecosystem)
