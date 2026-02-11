# TROTT Protocol Stress Test — Specs vs 649 Use Cases

**Date**: 2026-02-11
**Protocol Version**: v4.0 (8 TROTT specifications, 51 event kinds)
**Test Universe**: 649 use case domains across 31 UK economic sectors
**Method**: Systematic spec-by-spec validation against full coordination pattern diversity

---

## 1. Methodology

### Approach

Each TROTT specification's primitives — event kinds, tag structures, state machines, and semantic models — were tested against all 649 catalogued use case domains. Rather than walk through each domain individually, we swept the catalogue by **coordination pattern** and **domain characteristic**, flagging patterns of friction or failure.

### Coordination Patterns Tested

Every domain maps to one of 8 coordination patterns:

| Pattern | Example Domains | Count |
|---------|----------------|-------|
| **Dispatch** | Locksmith, emergency plumber, mobile mechanic | ~120 |
| **Relay delivery** | Parcel, food, pharmacy, courier | ~40 |
| **Scheduled** | Cleaning, tutoring, physiotherapy, grooming | ~300 |
| **Trip** | Ridesharing, medical transport, school runs | ~15 |
| **Shift** | Security guard, event staffing, temp worker | ~20 |
| **Crew / Multi-provider** | Moving, event setup, construction teams | ~15 |
| **Round-trip** | Laundry, vehicle servicing, equipment rental | ~15 |
| **Standing-offer** | Market stall, walk-in barber, pop-up shop | ~10 |

Three emerging patterns (broadcast/one-to-many, conditional/triggered, relay chain) were also tested but remain at the operator-logic level rather than protocol level.

### Classification

Each finding is classified as:

- **Gap** — The spec does not support this pattern. New event kinds, tags, or semantic rules are needed.
- **Friction** — The spec supports this pattern but awkwardly. Guidance, clarification, or minor tag additions would help.
- **Clean** — The spec handles this pattern naturally with no changes.

### Source Material

All 8 TROTT specifications (TROTT-01 through TROTT-08), 9 domain profile specifications, 3 implementation profiles (`ridesharing.js`, `locksmith.js`, `delivery.js`), the domain profile schema, and the full 649-domain use case catalogue were read and cross-referenced.

---

## 2. TROTT-01 Core — State Machine Stress Test

**Kinds tested**: 30500-30509 (Task Request, Offer, Accept, Update, Complete, Confirm, Cancel, Dispute, Leg Plan, Recurring Series)

### 2.1 Core State Machine Coverage

The core flow `requested → offers_open → accepted → in_progress → completed → confirmed` was tested against all 8 coordination patterns.

| Pattern | Core Flow Fit | Notes |
|---------|--------------|-------|
| Dispatch | **Clean** | Provider travels to requester, works, done. Natural fit. |
| Relay delivery | **Clean** | Collection → transit → delivery maps to `in_progress` sub-states. |
| Scheduled | **Clean** | Pre-booked time slot; `scheduled_start` tag handles future booking. |
| Trip | **Clean** | Origin → destination; real-time tracking during `in_progress`. |
| Shift | **Friction** | Long-duration `in_progress` with cycling sub-states (see §2.2). |
| Crew | **Friction** | Multi-provider acceptance needs clearer semantics (see §2.4). |
| Round-trip | **Clean** | Two linked tasks via `linked_task` with `round_trip` relationship. |
| Standing-offer | **Friction** | Inverted flow — provider publishes first, requester responds (see §2.7). |

### 2.2 Back-Transitions and Looping Sub-States

**Tested against**: Pest control (treatment → follow-up → re-treatment), security guard (on_station ↔ patrolling ↔ incident), locksmith (work_active → access_method_confirmed on scope change), photography (shoot → edit → reshoot).

**Finding: Friction**

The spec permits domain profiles to insert sub-states within `in_progress` and define transitions between them. Back-transitions (e.g., `work_active → access_method_confirmed` for locksmith re-quote) are supported — the locksmith domain spec already defines this.

However, **looping sub-states** are under-specified. A security guard cycling between `on_station → patrolling → incident → on_station` repeatedly during an 8-hour shift creates an unbounded sequence of Task Update events (kind 30503). The spec does not address:

- Whether the same sub-state can be revisited (implicit: yes, since transitions are defined per-pair, not per-sequence)
- Maximum event count per task (relevant for relay storage and bandwidth)
- Whether looping sub-states should use a different signalling mechanism (e.g., check-in events rather than state transitions)

**Recommendation**: Add guidance that looping sub-states within `in_progress` are explicitly permitted and SHOULD use TROTT-05 Safety Check-in events (kind 30541) rather than Task Update events for periodic status signals. Reserve Task Update for genuine state changes. Add a note: "Domains with cycling sub-states (e.g., security patrols) SHOULD publish check-in events for periodic status and Task Update events only when transitioning between distinct operational phases."

### 2.3 Long-Lived Tasks

**Tested against**: Equipment rental (days/weeks between collection and return), construction projects (weeks/months), pest control guarantee periods (3-12 months), cleaning recurring arrangements (indefinite).

**Finding: Friction**

The core state machine assumes tasks progress through states in minutes-to-hours. Long-lived tasks introduce two problems:

1. **NIP-40 expiration**: Events use `expiration` tags for lifecycle management. A 12-month guarantee period requires an expiration timestamp a year in the future. This is technically valid but semantically unusual — most Nostr events expire in hours or days. Relays may garbage-collect events with very distant expirations.

2. **Task identity persistence**: A task `d` tag must remain resolvable for the full guarantee period. If relays rotate or drop data, the task chain breaks. The spec is silent on relay persistence expectations for long-lived tasks.

3. **Duration tracking tags**: ~110 domains need `expected_duration` and `actual_duration` to track service time for billing and compliance. These tags are not formally defined in the spec, though `rate_unit` in TROTT-04 partially addresses time-based pricing.

**Recommendation**:
- Add `expected_duration` (seconds) and `actual_duration` (seconds) tags to Task Request (kind 30500) and Task Complete (kind 30504) respectively. These are needed by ~110 domains for time-based billing, session tracking, and compliance.
- Add guidance on long-lived tasks: "Tasks with expected durations exceeding 24 hours SHOULD use `scheduled_start` and `scheduled_end` tags. Relay operators SHOULD retain task events for at least 90 days after the task's final state transition. For guarantee periods, use `linked_task` with `guarantee` relationship type to create a follow-up obligation rather than keeping the original task open."
- Add `scheduled_end` tag to complement `scheduled_start` for shift and session-based domains.

### 2.4 Multi-Provider Tasks

**Tested against**: Moving crews (2-6 movers), event staffing (multiple guards), construction teams, festival coordination.

**Finding: Friction**

Kind 30502 (Task Accept) supports multiple `p` tags with confirmation status, enabling multi-provider acceptance. The moving domain spec defines a `crew_assembled` sub-state reached when all required movers confirm. However, several questions are unaddressed:

- **Quorum**: How many providers must accept before the task transitions from `accepted` to `in_progress`? Is this domain-defined? (The moving spec implies all must confirm, but event staffing might accept partial crews.)
- **Partial completion**: If one mover in a crew of 4 abandons mid-task, does the whole task fail? Does the remaining crew complete?
- **Per-provider payment**: TROTT-04 split payments handle per-provider amounts, but the linkage between individual provider acceptance and their payment share is implicit.

**Recommendation**: Add guidance: "For multi-provider tasks, the domain profile SHOULD define the minimum provider count required to proceed (`min_providers` field). Task Accept (kind 30502) MUST include a `provider_count` tag indicating the total required and a `confirmed_count` tag updated as providers accept. The task transitions to `in_progress` when `confirmed_count >= min_providers`. Individual provider withdrawal during `in_progress` SHOULD be handled as a partial cancellation — the remaining crew MAY continue if `confirmed_count` remains above `min_providers`."

### 2.5 Multi-Leg Tasks

**Tested against**: Delivery chains, relay handoffs, round-trip relay (laundry), shared rides (carpooling), furniture delivery with multiple rooms.

**Finding: Clean**

Kind 30508 (Leg Plan) handles multi-stop coordination well. Each passenger in a shared ride gets an independent Task Request with linked Leg Plan. Round-trip tasks use two linked tasks. Delivery chains use sequential leg events. The carpool-specific event kinds (30606-30608) in the ridesharing domain spec extend this cleanly.

No changes needed.

### 2.6 Task Linking

**Tested against**: Renovation → individual trades (parent/child), pest control → follow-up inspection, emergency fix → full repair, guarantee callbacks.

**Finding: Clean**

The `linked_task` tag with relationship types (`follow_up`, `guarantee`, `escalation`, `recurrence`, `shared_ride`, `round_trip`, `subtask`) covers all tested patterns. The document's recommendation to keep nested/hierarchical tasks at operator logic level (using `subtask` relationship type) rather than protocol level is sound.

No changes needed.

### 2.7 Standing-Offer Flow

**Tested against**: Knife sharpener on Tuesdays, walk-in barber, market stall services, pop-up shops, mobile services with fixed routes.

**Finding: Friction**

The standard flow assumes a requester publishes first (kind 30500) and providers respond with offers (kind 30501). Standing offers invert this — the provider publishes availability and requesters respond. Currently:

- Provider Availability (kind 20500) is ephemeral and expires in seconds — suitable for real-time dispatch but not standing offers.
- Provider Profile (kind 30510) is persistent but describes capabilities, not specific service availability.
- Task Offer (kind 30501) references a Task Request — it cannot exist independently.

~10 domains need persistent, discoverable availability announcements that requesters can browse and respond to.

**Recommendation**: Add a `standing_offer` tag to Provider Availability events. When present, the event SHOULD use a longer `expiration` (hours/days rather than seconds) and MAY omit the ephemeral kind 20500 in favour of a replaceable Provider Profile (kind 30510) with `availability_schedule` tags. Add guidance: "Standing-offer services (e.g., market stall repairs, walk-in grooming) SHOULD publish Provider Profile events with `standing_offer: true`, `availability_schedule` (cron-like or day-of-week format), and `service_area` tags. Requesters discover these via category search (TROTT-02 §Mode 2) and create Task Requests referencing the provider's profile."

### 2.8 Scheduling and Recurrence

**Tested against**: Weekly cleaning, daily dog walking, bi-weekly training, monthly pest inspections, weather-dependent gritting.

**Finding: Friction**

Kind 30509 (Recurring Series) handles series management, and `scheduled_start` / `recurrence` / `recurrence_end` tags on Task Request enable scheduling. However:

- **Exception handling**: "Skip next Tuesday" or "reschedule Wednesday's session to Thursday" are not formally specified. Each instance is a normal Task Request, so cancelling one instance works, but rescheduling requires cancellation + new creation with no formal link.
- **Provider preference locking**: Recurring clients often want the same provider. There is no tag for expressing provider preference on a recurring series (only on individual task requests via `p` tag).

**Recommendation**: Add `preferred_provider` tag to Recurring Series (kind 30509) for provider preference across a series. Add guidance on exception handling: "Individual instances within a recurring series MAY be rescheduled by cancelling the original instance (kind 30506 with reason `rescheduled`) and creating a new Task Request with `linked_task` referencing the series and an updated `scheduled_start`. The `rescheduled` reason code distinguishes this from a genuine cancellation for reputation and billing purposes."

### 2.9 Tag Sufficiency

**Tested against**: All 649 domains for tag coverage.

| Tag | Domains Using | Status |
|-----|--------------|--------|
| `domain` | All 649 | **Clean** |
| `status` | All 649 | **Clean** |
| `linked_task` | ~80 (guarantees, round-trips, subtasks) | **Clean** |
| `beneficiary_pubkey` | ~6 (elderly care, pharmacy, school runs) | **Clean** |
| `scheduled_start` | ~365 (all scheduled + shift + some dispatch) | **Clean** |
| `expected_duration` | ~110 (scheduled sessions, shifts, rentals) | **Gap** — not in spec |
| `actual_duration` | ~110 (same domains, for billing/compliance) | **Gap** — not in spec |
| `scheduled_end` | ~50 (shifts, multi-day tasks, rentals) | **Gap** — not in spec |
| `min_providers` | ~15 (crew, event staffing) | **Gap** — not in spec |
| `standing_offer` | ~10 (market stall, walk-in, pop-up) | **Gap** — not in spec |

### 2.10 Summary

| Finding | Classification | Impact (Domains) |
|---------|---------------|-----------------|
| Duration tracking tags missing | **Gap** | ~110 |
| Looping sub-state guidance missing | **Friction** | ~25 |
| Multi-provider quorum semantics | **Friction** | ~15 |
| Standing-offer flow | **Friction** | ~10 |
| Recurring exception handling | **Friction** | ~65 |
| Long-lived task relay guidance | **Friction** | ~30 |
| Core state machine for all 8 patterns | **Clean** | 649 |
| Task linking for all relationship types | **Clean** | ~80 |
| Multi-leg coordination | **Clean** | ~40 |
| Scheduling tags | **Clean** | ~365 |

---

## 3. TROTT-02 Discovery — Finding Providers

**Kinds tested**: 20500 (Provider Availability), 30510 (Provider Profile), 30511 (Operator Bond), 30512 (Trusted Provider List), 30513 (Requester Profile)

### 3.1 Geographic Discovery

**Tested against**: All location-based domains (~550 of 649).

**Finding: Clean**

The geohash-based discovery system with progressive precision (precision 3 for rural fallback through precision 7 for exact location, NIP-44 encrypted) works across all location-based domains. The nine-cell geohash subscription pattern provides adequate coverage. The progressive location reveal (coarse at discovery → precise after acceptance) preserves privacy correctly.

### 3.2 Virtual and Remote Services

**Tested against**: Video tutoring, phone consultation, remote IT support, online yoga, career coaching (~20 domains).

**Finding: Friction**

These domains have no meaningful physical location. The spec's three discovery modes — geographic broadcast, category/skill search, and trusted provider network — handle this, since Mode 2 (category/skill search) doesn't require geohashes. However, the spec doesn't explicitly address location-optional services:

- Provider Availability (kind 20500) includes geohash tags as seemingly mandatory
- Provider Profile (kind 30510) treats service area as location-defined

**Recommendation**: Add guidance: "Virtual or remote services (e.g., online tutoring, phone consultation) MAY omit geohash tags from Provider Availability and Provider Profile events. Discovery for these services relies on category/skill search (Mode 2) and trusted provider networks (Mode 3). When geohash tags are absent, relay queries SHOULD match on `domain` and skill tags only."

### 3.3 Credential-Filtered Discovery

**Tested against**: "Find me a Gas Safe registered plumber", "SIA-licenced door supervisor", "NMC-registered nurse", "NICEIC-approved electrician" (~50 domains with mandatory credentials).

**Finding: Gap**

Discovery events do not include credential tags. A requester cannot filter providers by credential status during discovery. Currently:

1. Provider publishes Availability (kind 20500) with geohash — no credential data
2. Provider Profile (kind 30510) includes skill tags but no credential references
3. Credential Attestation (kind 30522) is a separate event — not linked from discovery

A requester must: discover providers → query each provider's credentials → filter. This works but is inefficient for regulated domains where credentials are non-negotiable.

**Recommendation**: Add optional `credential` tags to Provider Profile (kind 30510): `["credential", "<credential_type>", "<attestation_event_id>"]`. This enables credential-filtered discovery queries. Operators MAY reject matches where mandatory domain credentials are absent. Add guidance: "Domain profiles declaring mandatory credentials (e.g., `gas_safe` for gas engineers, `sia_licence` for security officers) SHOULD include `credential` tags on Provider Profile events. Operators MUST independently verify credentials via TROTT-03 Credential Attestation (kind 30522) before matching — profile tags are convenience signals, not proof."

### 3.4 Urgency Signals in Discovery

**Tested against**: Hard-shoulder breakdown (life-threatening) vs routine car wash (no urgency), burst pipe at 2am vs scheduled boiler service.

**Finding: Friction**

Task Request (kind 30500) can include urgency context in content, but there is no structured urgency tag in discovery. Providers and operators cannot efficiently prioritise urgent requests.

**Recommendation**: Add optional `urgency` tag to Task Request (kind 30500) with values: `critical` (life-threatening or safety-critical), `urgent` (same-day response needed), `standard` (normal scheduling), `flexible` (no time pressure). This aligns with the severity levels already defined in TROTT-05 Emergency Signal (kind 30540) for consistency.

### 3.5 Quantity in Requests

**Tested against**: "I need 5 security guards for Saturday", "3-person moving crew", event staffing requiring multiple providers.

**Finding: Friction**

Task Request (kind 30500) has no `quantity` or `provider_count` tag. Multi-provider requests are implied by the `crew_size` or `number_of_guards` domain-specific tags but not represented at the core level.

**Recommendation**: Add optional `provider_count` tag to Task Request (kind 30500) indicating the number of providers required. Default is 1 if absent. This enables discovery and matching systems to filter for capacity.

### 3.6 Provider Profile Coverage

**Tested against**: All domain-specific metadata requirements (vehicle type, tools, languages, certifications, insurance, availability windows).

**Finding: Clean**

Provider Profile (kind 30510) uses flexible tag structures that accommodate domain-specific metadata. Vehicle type, skill tags, language preferences, and coverage areas are all representable. Domain profiles define which tags are relevant — the core spec doesn't constrain this.

### 3.7 Summary

| Finding | Classification | Impact (Domains) |
|---------|---------------|-----------------|
| Credential-filtered discovery missing | **Gap** | ~50 |
| Virtual service discovery guidance | **Friction** | ~20 |
| Urgency signal in discovery | **Friction** | ~40 |
| Quantity in requests | **Friction** | ~15 |
| Geographic discovery (geohash) | **Clean** | ~550 |
| Skill/category discovery | **Clean** | ~100 |
| Trusted provider networks | **Clean** | All |
| Progressive location reveal | **Clean** | ~550 |
| Provider Profile flexibility | **Clean** | All |

---

## 4. TROTT-03 Reputation — Trust Across Domains

**Kinds tested**: 30520 (Task Rating), 30521 (Reputation Query), 30522 (Credential Attestation)

### 4.1 Cross-Domain Reputation Weighting

**Tested against**: Locksmith → plumber (adjacent trades), security guard → courier (different risk profiles), cleaner → babysitter (different trust requirements).

**Finding: Friction**

The spec recommends 50% weight for adjacent domains, 25% for distant domains — but "adjacent" and "distant" are not formally defined. This matters because:

- A 5-star locksmith has demonstrated punctuality, professionalism, and trustworthiness — these transfer meaningfully to plumbing or electrical work.
- A 5-star courier has demonstrated package care and speed — these don't transfer meaningfully to childcare or healthcare.
- The `overall` rating transfers at reduced weight; domain-specific criteria (`workmanship`, `package_care`, `alertness`) don't transfer at all.

Without a formal adjacency definition, operators will implement inconsistent weighting, making cross-domain reputation unreliable.

**Recommendation**: Add a domain adjacency table or categorisation system. Suggested approach: group domains by trust-transferable characteristics rather than industry:

| Category | Domains | Transferable Criteria |
|----------|---------|----------------------|
| Property access | Locksmith, cleaning, pest control, plumbing, electrical | Trustworthiness, punctuality, tidiness |
| Transport | Ridesharing, delivery, courier, towing, moving | Punctuality, vehicle care, communication |
| Personal service | Tutoring, hairdressing, personal training, massage | Communication, professionalism, reliability |
| Care | Elderly care, pet sitting, babysitting, nursing | Trustworthiness, empathy, reliability |
| Security | Security guard, door supervision, close protection | Alertness, professionalism, reliability |

Domains within the same category are "adjacent" (50% cross-domain weight). Domains in different categories are "distant" (25%). Operators MAY define custom adjacency mappings.

### 4.2 Credential Attestation Type Coverage

**Tested against**: All 649 domains for credential type requirements.

The spec defines 14 credential types. Testing against the full domain catalogue reveals missing types:

| Credential Need | Domains Affected | Current Type | Status |
|----------------|-----------------|--------------|--------|
| Gas Safe registration | Gas engineers | `trade_licence` | **Clean** (covered) |
| SIA licence | Security, door supervision | `trade_licence` | **Clean** (covered) |
| NICEIC/NAPIT registration | Electricians | `trade_licence` | **Clean** (covered) |
| NMC PIN (nursing) | Healthcare | `professional_registration` | **Clean** (covered) |
| HCPC registration | Physio, podiatry, occupational therapy | `professional_registration` | **Clean** (covered) |
| GDC registration | Dentistry | `professional_registration` | **Clean** (covered) |
| DBS check (standard + enhanced) | Childcare, education, healthcare | `background_check` | **Clean** (covered) |
| OISC registration | Immigration advisors | `professional_registration` | **Clean** (covered) |
| SRA authorisation | Solicitors | `professional_registration` | **Clean** (covered) |
| CQC registration | Healthcare providers | `regulatory_licence` | **Friction** — close but distinct from trade_licence |
| Ofsted registration | Childminders (>2 hrs) | `regulatory_licence` | **Friction** — same |
| RCVS registration | Veterinary surgeons | `professional_registration` | **Clean** (covered) |
| Farriers Registration Council | Farriers | `professional_registration` | **Clean** (covered) |
| CAA flyer/operator ID | Drone operators | `aviation_certification` | **Clean** (added) |
| RYA/MCA certification | Marine services | `maritime_certification` | **Clean** (added) |
| UKAS accreditation | Inspection bodies | `inspection_certificate` | **Clean** (added) |

**Finding: Clean** — The existing 14 types plus the 4 recently added types cover all 649 domains adequately. The `trade_licence`, `professional_registration`, and `background_check` types are sufficiently generic to accommodate the full range of UK regulatory bodies.

### 4.3 Credential Expiry Handling

**Tested against**: SIA licence renewal (annual), DBS updates (ongoing), Gas Safe annual re-registration, NMC revalidation (3-yearly), insurance expiry.

**Finding: Friction**

Credential Attestation (kind 30522) includes an `expires` tag. Revocation is handled by publishing a replacement with a past `expires` or explicit `revoked` tag. However:

- **No automated expiry alerting**: When a provider's credential expires during an active task, the spec is silent on what happens. Should the task auto-cancel? Should the operator be notified? Should matching stop?
- **No re-verification trigger**: The spec doesn't define how operators detect upcoming expiries and prompt re-verification.

**Recommendation**: Add guidance: "Operators SHOULD monitor `expires` tags on Credential Attestation events and MUST NOT match providers whose mandatory credentials have expired. When a credential expires during an active task, the operator SHOULD notify the requester but SHOULD NOT auto-cancel — the task may be nearly complete. Operators SHOULD publish an updated Compliance Record (kind 30553) with result `expired` when a provider's credential lapses."

### 4.4 Volume Normalisation

**Tested against**: Provider A with 4.8 stars from 500 ratings vs Provider B with 5.0 stars from 3 ratings.

**Finding: Friction**

The spec defines signals for trust weighting (stake evidence, social distance, recency, task count) but does not provide volume normalisation guidance. Reputation Query (kind 30521) includes `total_ratings` as a tag, but interpretation is left to operators.

**Recommendation**: Add guidance: "Operators SHOULD apply volume normalisation when ranking providers. A common approach is Bayesian averaging: `adjusted_rating = (C × M + R × N) / (C + N)` where `C` is a confidence threshold (e.g., 10), `M` is the domain-wide mean rating, `R` is the provider's raw average, and `N` is the provider's rating count. This pulls low-volume providers towards the mean until sufficient data accumulates. The specific formula is operator-defined, but the principle of penalising low sample sizes is RECOMMENDED."

### 4.5 Negative Reputation Portability

**Tested against**: Provider banned by one operator creates new keypair, provider accumulates abuse reports across domains.

**Finding: Friction**

Abuse Report (kind 30546) is permanent and public via NIP-56 integration. Cross-ecosystem visibility means any Nostr client can surface reports. However:

- A banned provider creating a new keypair starts fresh with zero reputation — the new key has no link to the old one.
- The spec's Sybil resistance layers (stake evidence, social distance, rater reputation) make this expensive but not impossible.

This is an inherent limitation of pseudonymous systems and is acknowledged in the spec. No additional protocol-level solution exists that doesn't compromise pseudonymity.

**Recommendation**: No spec change. Add a note acknowledging the trade-off: "A provider who creates a new keypair starts with zero reputation. The protocol's progressive exposure limits (TRUST-MECHANISMS Layer 4) restrict new identities to low-value tasks until reputation accumulates, making key rotation an expensive strategy for persistent bad actors."

### 4.6 Summary

| Finding | Classification | Impact (Domains) |
|---------|---------------|-----------------|
| Cross-domain adjacency undefined | **Friction** | All cross-domain queries |
| Credential expiry during active task | **Friction** | ~50 (regulated domains) |
| Volume normalisation guidance missing | **Friction** | All |
| Negative reputation key rotation | **Friction** | All (inherent limitation) |
| Credential type coverage | **Clean** | All 649 |
| Stake evidence for Sybil resistance | **Clean** | All |
| Social distance weighting | **Clean** | All |
| Cross-domain criterion transfer | **Clean** | All |

---

## 5. TROTT-04 Payments — Every Payment Pattern

**Kinds tested**: 30530-30538 (Quote, Payment Terms, Stake Lock, Stake Release, Stake Forfeit, Payment Receipt, Streaming Tick, Task Tip, Earnings Summary)

### 5.1 Pricing Model Coverage

**Tested against**: All pricing models across 649 domains.

| Pricing Model | Domains Using | Event Kinds | Status |
|--------------|--------------|-------------|--------|
| Distance + time | Ridesharing, towing | 30530 + 30536 | **Clean** |
| Flat rate | Car wash, window cleaning | 30530 + 30531 | **Clean** |
| Hourly rate | Security, tutoring, cleaning | 30530 + 30536 (hourly ticks) | **Friction** — see §5.2 |
| Quote negotiation | Locksmith, emergency trades | 30530 + 30531 | **Clean** |
| Milestone | Moving, construction, emergency trades | 30531 (multiple) + 30533 | **Friction** — see §5.3 |
| Per-unit | Energy (per kWh), laundry (per item) | 30530 with `rate_unit` | **Clean** |
| Competitive bidding | Tradesperson marketplace | Multiple 30501 → requester selects | **Clean** |
| Split payment | Moving crew, food delivery | 30531 with split `p` tags | **Clean** |
| Zero-value | Volunteer coordination, community exchange | — | **Friction** — see §5.6 |

### 5.2 Duration Tracking and Hourly Billing

**Tested against**: ~110 domains needing time-based billing (security shifts, tutoring sessions, cleaning, physiotherapy, personal training, companion care).

**Finding: Gap**

This is the **highest-priority gap** across the entire protocol, affecting ~110 domains. The spec defines `rate_unit` on Quote events (kind 30530) with values including `per_hour`, `per_day`, etc. Streaming Tick (kind 30536) can emit hourly ticks. However:

- **No `expected_duration` or `actual_duration` tags**: These are fundamental for time-based billing but not defined anywhere in the spec.
- **Rounding semantics**: If a 1-hour cleaning session runs 1 hour 10 minutes, is the client charged for 1 hour (floor), 1.17 hours (exact), or 2 hours (ceiling)? No guidance exists.
- **Minimum booking duration**: Many services have minimums (e.g., 2-hour minimum for cleaning). No tag represents this.
- **Overtime rates**: Security shifts commonly charge premium rates beyond contracted hours. No mechanism for rate changes mid-task.

**Recommendation**:
- Add `expected_duration` (seconds) tag to Quote (kind 30530) and Payment Terms (kind 30531).
- Add `actual_duration` (seconds) tag to Payment Receipt (kind 30535) and Task Complete (kind 30504).
- Add `minimum_duration` (seconds) tag to Quote (kind 30530).
- Add `overtime_rate` and `overtime_threshold` tags to Payment Terms for rate escalation.
- Add guidance on rounding: "Time-based billing SHOULD round to the nearest whole unit of the declared `rate_unit`. Partial units below 50% of the unit round down; 50% and above round up. Operators MAY define domain-specific rounding rules (e.g., 15-minute increments for cleaning)."

### 5.3 Milestone Payment Semantics

**Tested against**: Emergency trades (diagnosis → emergency fix → full repair), moving (loading → transit → unloading), construction projects.

**Finding: Friction**

The spec describes milestone payments using multiple Payment Terms events (kind 30531) with partial Stake Release (kind 30533). This works but lacks:

- **Milestone sequencing**: No formal ordering of milestones. A 30/40/30 split implies sequence but doesn't enforce it.
- **Milestone approval flow**: Requester must approve each milestone completion before payment releases. This creates a sub-protocol within TROTT-04 that isn't formally specified.
- **Milestone rejection**: If a requester rejects a milestone (e.g., "loading was incomplete"), the spec doesn't define the flow. Does the task dispute? Does the milestone re-open?

**Recommendation**: Add guidance: "Milestone payments use ordered Payment Terms events (kind 30531) with `milestone_sequence` tags (integer, starting from 1). Each milestone completion triggers a Task Update (kind 30503) with `milestone_completed: <sequence>`. The requester approves by publishing a Task Confirm-like acknowledgement or disputes via kind 30543. Stake Release (kind 30533) for a milestone SHOULD reference the specific milestone sequence. Rejected milestones SHOULD trigger rework (provider re-enters that `in_progress` sub-state) rather than immediate dispute escalation."

### 5.4 Graduated Cancellation Fees

**Tested against**: All domains with time-dependent cancellation policies (free within 1 hour of booking, 50% within 24 hours, 100% on the day).

**Finding: Friction**

The spec defines Task Cancel (kind 30506) with reason codes and references TROTT-04 for stake handling. Cancellation policies are domain-defined (e.g., locksmith: no penalty before arrival; security: no penalty >24 hours before shift). However:

- **No structured cancellation schedule**: The graduated fee structure (free → partial → full based on time before scheduled start) is described in domain specs but not formally representable in tags.
- **Cancellation fee calculation**: Operators must implement custom logic for each domain's cancellation policy.

**Recommendation**: Add optional `cancellation_schedule` tag to Payment Terms (kind 30531) with structured format: `["cancellation_schedule", "<hours_before>:<penalty_percent>", ...]` (e.g., `["cancellation_schedule", "24:0", "4:50", "0:100"]` meaning free if >24h, 50% if 4-24h, 100% if <4h). This standardises the pattern used by ~200 scheduled-pattern domains.

### 5.5 Guarantee Hold-Back

**Tested against**: Emergency trades (30-day guarantee), pest control (3-12 months), appliance repair, boiler service, roof repair (~28 domains).

**Finding: Friction**

Guarantee periods are modelled informally as linked tasks with `guarantee` relationship type. No formal mechanism exists to hold back a portion of payment during the guarantee period and release it upon expiry.

**Recommendation**: Add guidance: "For domains requiring guarantee hold-back, the Payment Terms event (kind 30531) SHOULD include a `guarantee_holdback_percent` tag (e.g., `10`) and `guarantee_period_days` tag (e.g., `30`). The held-back portion remains in escrow and is released automatically via Stake Release (kind 30533) after the guarantee period expires without a linked follow-up task being created. If a guarantee claim is made, the held-back amount is subject to TROTT-05 dispute resolution."

### 5.6 Zero-Value Tasks

**Tested against**: Volunteer coordination, community exchange, skill swaps, time banks (~10 domains).

**Finding: Friction**

The spec requires `amount`, `currency`, and `trust_model` tags on all payment events. For zero-value tasks:

- Publishing Quote (kind 30530) with `amount: 0` is semantically valid but awkward.
- Stake Lock (kind 30532) with zero amount serves no commitment purpose.
- Streaming Tick (kind 30536) with zero is meaningless.

**Recommendation**: Add guidance: "Zero-value tasks (e.g., volunteer coordination, community exchange) MAY omit TROTT-04 payment events entirely. Commitment for zero-value tasks relies on TROTT-03 reputation stakes rather than financial stakes. The Task Request (kind 30500) SHOULD include `["amount", "0"]` and `["currency", "NONE"]` to explicitly signal zero-value status. Operators MAY implement reputation-based commitment mechanisms (e.g., reputation score reduction for no-show) as an alternative to financial stakes."

### 5.7 Split Payment Semantics

**Tested against**: Food delivery (restaurant + courier), moving crew (3-6 movers), event staffing (multiple guards), tip distribution.

**Finding: Clean**

Payment Terms (kind 30531) supports multiple `p` tags with individual amounts. The moving domain spec demonstrates this well: each milestone amount is split across crew members with the lead mover receiving a larger share. Tip distribution via Task Tip (kind 30537) supports similar splitting.

### 5.8 Summary

| Finding | Classification | Impact (Domains) |
|---------|---------------|-----------------|
| Duration tracking tags missing | **Gap** | ~110 |
| Hourly billing semantics missing | **Gap** | ~66 |
| Graduated cancellation schedule | **Friction** | ~200 |
| Milestone sequencing/approval | **Friction** | ~28 |
| Guarantee hold-back | **Friction** | ~28 |
| Zero-value task guidance | **Friction** | ~10 |
| All pricing models representable | **Clean** | All 649 |
| Split payments | **Clean** | ~30 |
| Streaming payments | **Clean** | ~25 |
| Quote negotiation | **Clean** | ~80 |
| Rate unit flexibility | **Clean** | All |

---

## 6. TROTT-05 Safety — Every Safety Pattern

**Kinds tested**: 30540-30547 (Emergency Signal, Safety Check-in, Safety Contact Share, Dispute Claim, Dispute Evidence, Dispute Resolution, Abuse Report, Media Attachment)

### 6.1 Check-In Interval Configuration

**Tested against**: Security guard (30-minute heartbeat), ridesharing (continuous tracking, no heartbeat), companion care (hourly), multi-day construction (daily), pet sitting (2-hourly).

**Finding: Friction**

Safety Check-in (kind 30541) supports configurable intervals, and domain profiles declare `heartbeat_interval_minutes`. However:

- **No standard tag for interval declaration**: The interval is defined in the domain profile but not published in any event. A check-in event's `next_expected` tag implies the interval, but there is no explicit declaration of the expected cadence for third-party monitoring.
- **Missed check-in escalation timing**: The spec defines escalation (5 min → 15 min → emergency services) but this is a single escalation path. Some domains need different timing (security: aggressive escalation; pet sitting: gentler).

**Recommendation**: Add optional `checkin_interval_seconds` and `checkin_escalation_profile` tags to Task Accept (kind 30502) or Operator Claim (kind 30550). Suggested escalation profiles: `critical` (security: 5 min / 10 min / 15 min), `standard` (default: 5 min / 15 min / 30 min), `relaxed` (pet sitting, cleaning: 15 min / 30 min / 60 min). This lets operators tune safety monitoring to the domain's risk profile.

### 6.2 Emergency Escalation Paths

**Tested against**: Lone worker (locksmith at night), vulnerable person (elderly care), child safeguarding (babysitter), security guard under threat.

**Finding: Friction**

Emergency Signal (kind 30540) has three severity levels (`critical`, `urgent`, `concern`) with operator SLA targets (60s / 5 min / 15 min). This works for most domains but:

- **Vulnerable person escalation**: Elderly care and childcare domains require specific escalation to safeguarding contacts (social services, designated safeguarding lead) — not just 999. The spec's escalation path (operator → signaller contact → emergency services) doesn't include domain-specific safeguarding.
- **Child-specific protections**: Babysitting, tutoring, and education domains have mandatory reporting obligations under the Children Act 2004. The Emergency Signal doesn't distinguish child-safeguarding concerns from physical danger.

**Recommendation**: Add optional `escalation_contacts` tag to Task Request (kind 30500) for domain-specific escalation: `["escalation_contacts", "<pubkey>", "<role>"]` where role is `safeguarding_lead`, `social_services`, `emergency_services`, or `next_of_kin`. Add guidance: "Domains involving vulnerable persons (elderly care, childcare, healthcare) SHOULD declare domain-specific escalation contacts in addition to the standard emergency escalation path. Operators providing services to vulnerable persons MUST have documented safeguarding procedures."

### 6.3 Dispute Evidence Types

**Tested against**: GPS traces (ridesharing), photos (delivery), clinical records (healthcare), acoustic measurements (noise assessment), video (security incidents), financial documents (trades).

**Finding: Clean**

Dispute Evidence (kind 30544) supports evidence types: `photo`, `video`, `audio`, `gps_log`, `screenshot`, `message_log`, `receipt`, `timestamp_proof`. Media Attachment (kind 30547) extends this with file-level metadata (hash, encryption, purpose tags). This covers all tested domains.

The only gap is clinical evidence (healthcare notes, medication records) — but these are handled outside the protocol via the operator's private database and would be submitted as `document` type evidence encrypted to dispute participants.

### 6.4 Automated Dispute Resolution

**Tested against**: GPS-proven no-show, time-penalty for late delivery, route deviation for fare disputes.

**Finding: Clean**

The four automated resolution triggers (no-show provider, no-show requester, route deviation >2x, late arrival >2x ETA) are well-defined. The spec correctly notes these are examples, not exhaustive — operators MAY define additional automated triggers.

**However**: Automated triggers should be domain-configurable. A 2x route deviation threshold makes sense for ridesharing but not for delivery (where detours to collect multiple parcels are normal). This is implicitly operator-defined but should be explicit.

**Recommendation**: Add guidance: "Automated dispute resolution thresholds (e.g., route deviation multiplier, late arrival threshold) SHOULD be published in the Operator Bond (kind 30511) or Payment Terms (kind 30531) so that participants know the rules before accepting a task."

### 6.5 Operator-as-Bad-Actor

**Tested against**: Scenarios where the operator itself is accused of fraud, PII misuse, or unfair dispute resolution.

**Finding: Friction (known limitation)**

The spec acknowledges this limitation — when the operator is the accused party, they cannot mediate their own dispute. The available paths are:

- Community resolution (3-5 member panel from high-reputation users)
- Mutual resolution (both parties agree on a mediator from mutual follows)
- Switch operators (participants can migrate to a different operator or go P2P)

The spec does not provide an explicit "operator dispute" flow. This is a structural limitation of any operator-mediated system.

**Recommendation**: Add guidance: "When a dispute involves the operator as an accused party, the operator MUST recuse from resolution. Community resolution (TROTT-05 §Community Resolution) is the recommended fallback. Participants MAY switch operators mid-dispute by publishing a new Operator Claim (kind 30550) from a different operator. The dispute evidence chain is transferable because it resides on Nostr relays, not in the operator's private database."

### 6.6 Summary

| Finding | Classification | Impact (Domains) |
|---------|---------------|-----------------|
| Check-in interval not declared in events | **Friction** | ~25 (shift, care domains) |
| Vulnerable person escalation paths | **Friction** | ~30 (care, childcare, education) |
| Automated resolution thresholds not published | **Friction** | All dispute-capable domains |
| Operator-as-bad-actor recusal | **Friction** | All (known limitation) |
| Emergency Signal severity levels | **Clean** | All |
| Dispute evidence types | **Clean** | All |
| Media attachments | **Clean** | All |
| Safety Contact Share | **Clean** | All |
| Abuse Report (NIP-56) | **Clean** | All |

---

## 7. TROTT-06 Coordination — Operator Requirements

**Kinds tested**: 30550-30555 (Operator Claim, PII Envelope, Delegation Grant, Compliance Record, Operator Heartbeat, Compliance Snapshot)

### 7.1 Regulatory Diversity

**Tested against**: SIA (security), Gas Safe (plumbing), NMC (nursing), GLAA (farm labour), CQC (healthcare), Ofsted (childcare), NICEIC (electrical), RCVS (veterinary), Farriers Registration Council, CAA (aviation), MCA (maritime).

**Finding: Clean**

Compliance Record (kind 30553) is sufficiently flexible. The `type` tag supports `provider_credential_verified`, `insurance_confirmed`, `right_to_work`, `dbs_check`, `vehicle_check`, `pii_erasure_complete`, `gas_safe`, `sia_licence`, `phv_licence`. New types can be added without spec changes — the type field is a string, not an enum.

### 7.2 Data Retention Variance

**Tested against**: 30-day GPS traces (ridesharing), 7-year financial records (HMRC), 25-year clinical records (healthcare), 6-year consumer rights claims (cleaning, trades).

**Finding: Friction**

PII Envelope (kind 30551) includes `retention_policy` (enum) and optional `retention_days` tags. The predefined policies are:

- `task_duration_only` — deleted immediately after task
- `task_duration_plus_90_days` — 90-day retention
- `regulatory_minimum` — as required by applicable law
- `custom` — operator-defined, specified in `retention_days`

The `regulatory_minimum` option is problematic because different data types within the same task may have different retention periods (e.g., financial records: 7 years; GPS traces: 90 days; clinical notes: 25 years). A single `retention_days` tag per PII Envelope doesn't capture per-field variance.

**Recommendation**: Add guidance: "When data fields within a single PII Envelope have different retention requirements (e.g., financial records vs GPS traces), the operator SHOULD publish separate PII Envelope events per retention category, each with its own `retention_days` and `pii_fields` tags. The `pii_fields` tag on each envelope lists only the fields covered by that envelope's retention policy." This is already technically possible but should be explicitly recommended.

### 7.3 PII Sensitivity Levels

**Tested against**: Address (ridesharing, locksmith), medical records (healthcare), child information (babysitting), financial details (trades), two home addresses (moving).

**Finding: Friction**

All PII is NIP-44 encrypted end-to-end. The spec treats all PII uniformly — same encryption, same handling. However, some domains have heightened sensitivity:

- **Moving**: Two home addresses + timing reveals exactly when the origin property is empty (burglary risk).
- **Healthcare**: Clinical data is "special category" under UK GDPR Article 9, requiring additional safeguards.
- **Childcare**: Child information triggers additional obligations under the Children Act 2004.
- **Locksmith**: Location + "locked out" context reveals security vulnerability.

The encryption is adequate, but risk awareness varies.

**Recommendation**: Add optional `sensitivity_level` tag to PII Envelope (kind 30551) with values: `standard`, `heightened` (e.g., two addresses, security-relevant timing), `special_category` (UK GDPR Article 9: health, biometric, genetic data), `child_data` (Children Act 2004 obligations). This enables operators to apply appropriate additional safeguards (e.g., enhanced access logging, restricted delegation, shorter retention) without protocol changes.

### 7.4 Delegation Patterns

**Tested against**: Security company using freelance guards, cleaning company subcontracting, construction company managing subcontractors.

**Finding: Clean**

Delegation Grant (kind 30552) supports scoped, time-limited authority delegation with explicit kind restrictions. The spec correctly prohibits delegation of ratings (kind 30520), disputes (kind 30543), and emergency signals (kind 30540).

### 7.5 Multi-Operator Tasks

**Tested against**: Moving crew where guards come from one operator and movers from another, event setup with multiple service providers each from different operators.

**Finding: Gap**

The spec does not address multi-operator coordination for a single task. Each task has at most one Operator Claim (kind 30550). If a moving job needs movers from Operator A and security from Operator B, this requires two separate tasks — which is the correct architectural answer but is not explicitly stated.

**Recommendation**: Add guidance: "Multi-service engagements requiring providers from different operators SHOULD be modelled as separate tasks, each with its own Operator Claim, linked via `linked_task` tags with `coordinated` relationship type. Cross-operator coordination (e.g., shared scheduling, combined billing) is an operator-level concern, not a protocol-level one. The protocol does not support multiple Operator Claims on a single task."

### 7.6 Summary

| Finding | Classification | Impact (Domains) |
|---------|---------------|-----------------|
| Multi-operator tasks not addressed | **Gap** | ~15 |
| Per-field retention variance guidance | **Friction** | ~30 (regulated domains) |
| PII sensitivity level differentiation | **Friction** | ~50 |
| Regulatory credential types | **Clean** | All 649 |
| Delegation scoping | **Clean** | All |
| Compliance Record flexibility | **Clean** | All |
| Operator Heartbeat | **Clean** | All |
| Compliance Snapshot | **Clean** | All |

---

## 8. TROTT-07 Navigation — Route Diversity

**Kinds tested**: 20501 (Location Update), 30560 (Route Summary), 30561 (ETA Update), 30562 (Route Deviation), 30563 (Navigation Resource)

### 8.1 Non-Route Domains

**Tested against**: Locksmith (one-way travel, no tracking during work), security (stationary on-site), cleaning (known address), tutoring (known address).

**Finding: Clean**

TROTT-07 is explicitly optional. The domain spec matrix shows only ridesharing, delivery, towing, and moving use navigation. All other domains correctly omit it. No friction — the spec handles optionality well.

### 8.2 Multi-Stop Routes

**Tested against**: Multi-drop courier, furniture delivery with loading stops, shared rides with multiple pickups.

**Finding: Clean**

Route Summary (kind 30560) includes `stop_count`, `stop_purposes`, and encrypted stop arrays in content. Combined with Leg Plan (kind 30508 from TROTT-01), multi-stop routes are well-supported.

### 8.3 Pedestrian and Cycle Routes

**Tested against**: Walking tour guide, cycle courier, running coach, pedestrian delivery.

**Finding: Friction**

Route Summary (kind 30560) includes `transport_mode` tag with values: `car`, `bicycle`, `foot`, `motorcycle`, `van`, `truck`. The routing engines (OSRM, ORS, GraphHopper, Valhalla) all support multi-modal routing. However:

- **No guidance on which engine supports which mode**: OSRM's bicycle and pedestrian profiles are less mature than its car profile. ORS has better pedestrian routing.
- **Speed expectations differ dramatically**: Walking tour at 4 km/h vs car ride at 50 km/h. ETA accuracy (TROTT-07 §punctuality measurement) should account for transport mode.

**Recommendation**: Add guidance: "ETA accuracy thresholds (TROTT-07 §Punctuality) SHOULD be transport-mode-aware. Suggested thresholds: car/van/truck — within 2 minutes for 'high' confidence; bicycle — within 5 minutes; foot — within 10 minutes. Operators SHOULD select routing engines appropriate to the transport mode."

### 8.4 Maritime and Aviation Routes

**Tested against**: Boat delivery, helicopter charter, drone delivery (~27 domains).

**Finding: Friction**

Road-based routing engines (OSRM, ORS, GraphHopper, Valhalla) cannot route maritime or aviation paths. The spec assumes road networks:

- Route Summary references distance in metres along roads
- ETA assumes road-speed calculations
- Route Deviation assumes road corridors

Maritime and aviation domains need different routing — great-circle distances, tidal/wind factors, airspace restrictions.

**Recommendation**: Add guidance: "Maritime and aviation domains SHOULD use domain-specific routing rather than road-based engines. Route Summary (kind 30560) supports any `provider_name` value — maritime operators may use marine chart routing; aviation operators may use flight planning tools. The `transport_mode` tag SHOULD be extended with `boat`, `aircraft`, and `drone` values. Distance and duration tags remain in metres and seconds regardless of transport mode."

### 8.5 Geofence Alerts

**Tested against**: Security guard site boundary, construction CDM zone, pet walking area restrictions.

**Finding: Friction**

Route Deviation (kind 30562) detects deviation from a planned route but does not support geofence containment — "alert if the provider leaves this area" rather than "alert if the provider deviates from this path."

~20 domains would benefit from geofence alerting (security patrols, construction sites, pet walking zones, event perimeters).

**Recommendation**: Add optional `geofence` tag to Task Request (kind 30500) or Operator Claim (kind 30550): `["geofence", "<geojson_polygon_hash>"]` with the actual polygon in NIP-44 encrypted content. Route Deviation (kind 30562) SHOULD add `geofence_breach` as a deviation type alongside `off_route`, `wrong_direction`, `stopped_unexpectedly`, `excessive_speed`, and `returned_to_route`.

### 8.6 Summary

| Finding | Classification | Impact (Domains) |
|---------|---------------|-----------------|
| Maritime/aviation routing guidance | **Friction** | ~27 |
| Geofence containment alerting | **Friction** | ~20 |
| Pedestrian/cycle ETA thresholds | **Friction** | ~15 |
| Multi-stop routes | **Clean** | ~40 |
| Transport mode tags | **Clean** | All navigation domains |
| Optionality for non-route domains | **Clean** | ~400+ |
| Route Deviation alerting | **Clean** | All navigation domains |
| Location Update privacy | **Clean** | All navigation domains |

---

## 9. TROTT-08 Messaging — Communication Patterns

**Kinds tested**: 20502 (Typing Indicator), 30564 (Task Message), 30565 (Message Status), 30566 (Task Archive Entry), 30567 (User Preferences)

### 9.1 Three-Party Messaging

**Tested against**: Food delivery (customer ↔ courier, customer ↔ restaurant, courier ↔ restaurant), marketplace delivery (buyer ↔ seller, buyer ↔ courier).

**Finding: Friction**

Task Message (kind 30564) is scoped to a task and encrypted to all `p`-tagged recipients. In a two-party task, this works cleanly. In a three-party scenario (food delivery):

- The customer may need to message the restaurant ("change my order") — but the restaurant is not a party to the courier's task.
- The courier may need to message the restaurant ("order not ready") — again, restaurant is external.
- The current model requires separate tasks (customer ↔ restaurant, customer ↔ courier) with separate message streams.

This is the same three-party coordination gap identified in the use case catalogue (Gap 2). It affects only ~5 domains (food delivery, marketplace delivery) and is low priority.

**Recommendation**: No spec change needed now. Document the pattern: "Three-party messaging (e.g., food delivery) SHOULD use separate task message streams per party-pair. The operator routes messages between tasks as needed. A customer-to-restaurant message is scoped to the order task; a customer-to-courier message is scoped to the delivery task."

### 9.2 Structured Messages

**Tested against**: "I'm outside" (ridesharing), "Running 5 minutes late" (all scheduled), "Access code is 1234" (cleaning, security), "Your order is ready" (food delivery).

**Finding: Friction**

Task Message (kind 30564) supports `message_type` values: `text`, `location`, `photo`, `system`. Common structured messages like ETA updates, access codes, and status notifications are sent as free-text, making them harder to parse programmatically.

**Recommendation**: Add `structured` as a `message_type` value. Structured messages include a `template` tag (e.g., `eta_update`, `access_code`, `status_notification`, `running_late`) with machine-readable content. This enables clients to render standardised UI elements (e.g., countdown timer for ETA, secure code display for access codes) rather than raw text. Add guidance: "Operators SHOULD use structured messages for common patterns (ETA updates, access codes, arrival notifications). Clients that do not recognise a template SHOULD fall back to rendering the message content as plain text."

### 9.3 Language Barriers

**Tested against**: Provider speaks Polish, requester speaks English (common in cleaning, construction, care work).

**Finding: Friction**

The spec does not address language. User Preferences (kind 30567) stores UI settings but does not include language preference. Provider Profile (kind 30510) has no language tags.

**Recommendation**: Add optional `language` tag to Provider Profile (kind 30510) and User Preferences (kind 30567): `["language", "en"]` or `["language", "pl,en"]` for multilingual providers. Add guidance: "Operators MAY offer machine translation for task messages when participants declare different languages. The original message language SHOULD be preserved with a `language` tag on Task Message (kind 30564); translated text, if provided, SHOULD be in a separate `translated_content` field."

### 9.4 Archival and Retention Variance

**Tested against**: Clinical notes (25-year retention), casual chat (ephemeral), dispute evidence (7-year financial records).

**Finding: Friction**

Task Archive Entry (kind 30566) uses `expiration` (NIP-40) for lifecycle management. Task Messages default to task completion + 30 days. However:

- Clinical notes may need 25-year retention — this is handled outside the protocol (operator's private database, not Nostr events).
- Dispute evidence messages should persist longer than casual chat.
- The spec doesn't differentiate retention by message purpose.

**Recommendation**: Add optional `retention_category` tag to Task Message (kind 30564) with values: `ephemeral` (auto-delete at task completion), `standard` (task + 30 days, the default), `evidence` (retained per TROTT-06 data retention policy), `clinical` (retained per healthcare regulations, operator-managed). This enables operators to apply appropriate retention without protocol changes.

### 9.5 Summary

| Finding | Classification | Impact (Domains) |
|---------|---------------|-----------------|
| Three-party messaging | **Friction** | ~5 |
| Structured message templates | **Friction** | ~200 |
| Language preference tags | **Friction** | ~100 |
| Retention category differentiation | **Friction** | ~30 |
| Task-scoped messaging | **Clean** | All |
| Read receipts | **Clean** | All |
| Task Archive | **Clean** | All |
| User Preferences | **Clean** | All |

---

## 10. Cross-Cutting Findings

### 10.1 Aggregate Gap/Friction/Clean Count

| Spec | Gaps | Frictions | Clean | Total Findings |
|------|------|-----------|-------|----------------|
| TROTT-01 Core | 1 | 5 | 4 | 10 |
| TROTT-02 Discovery | 1 | 3 | 5 | 9 |
| TROTT-03 Reputation | 0 | 4 | 4 | 8 |
| TROTT-04 Payments | 2 | 4 | 5 | 11 |
| TROTT-05 Safety | 0 | 4 | 5 | 9 |
| TROTT-06 Coordination | 1 | 2 | 5 | 8 |
| TROTT-07 Navigation | 0 | 3 | 5 | 8 |
| TROTT-08 Messaging | 0 | 4 | 4 | 8 |
| **Totals** | **5** | **29** | **37** | **71** |

### 10.2 Findings by Severity and Domain Impact

**Gaps** (5 total — spec does not support the pattern):

| Gap | Spec | Domains Affected |
|-----|------|-----------------|
| Duration tracking tags (`expected_duration`, `actual_duration`, `scheduled_end`) | TROTT-01, TROTT-04 | ~110 |
| Hourly billing semantics (rounding, minimums, overtime) | TROTT-04 | ~66 |
| Credential-filtered discovery | TROTT-02 | ~50 |
| Multi-operator task coordination guidance | TROTT-06 | ~15 |
| Multi-provider quorum semantics | TROTT-01 | ~15 |

**Top Frictions** (29 total — works but awkwardly; top 10 by impact):

| Friction | Spec | Domains Affected |
|----------|------|-----------------|
| Graduated cancellation fee schedules | TROTT-04 | ~200 |
| Structured message templates | TROTT-08 | ~200 |
| Language preference tags | TROTT-08 | ~100 |
| Recurring scheduling exception handling | TROTT-01 | ~65 |
| Cross-domain reputation adjacency undefined | TROTT-03 | All cross-domain |
| Volume normalisation guidance | TROTT-03 | All |
| PII sensitivity levels | TROTT-06 | ~50 |
| Credential expiry during active tasks | TROTT-03 | ~50 |
| Urgency signal in discovery | TROTT-02 | ~40 |
| Per-field data retention variance | TROTT-06 | ~30 |

### 10.3 Previously Identified Gaps — Status Update

The use case catalogue identified 6 gaps. Cross-referencing with this stress test:

| Previous Gap | Status | Stress Test Finding |
|-------------|--------|-------------------|
| Gap 1: No-show differentiation | **Closed** | `no_show` terminal state in TROTT-01; confirmed working. |
| Gap 2: Three-party coordination | **Open, low priority** | Confirmed as friction in TROTT-08 (§9.1). Only ~5 domains. Workaround: separate tasks per party-pair. |
| Gap 3: Milestone escrow / partial release | **Partially closed** | Described in TROTT-04 but lacks milestone sequencing and approval flow (§5.3). |
| Gap 4: Re-quote / back-transitions | **Closed** | Locksmith domain spec defines back-transitions. Core spec supports arbitrary domain-defined transitions. |
| Gap 5: Session heartbeat / check-ins | **Partially closed** | TROTT-05 defines mechanism. Stress test found missing interval declaration and configurable escalation profiles (§6.1). |
| Gap 6: Linked / follow-up tasks | **Closed** | `linked_task` tag with 7 relationship types covers all tested patterns. |

### 10.4 New Gaps Discovered

This stress test identified 5 gaps and 29 frictions not previously catalogued:

**New gaps**:
1. Duration tracking tags (highest priority — ~110 domains)
2. Hourly billing semantics (~66 domains)
3. Credential-filtered discovery (~50 domains)
4. Multi-operator task guidance (~15 domains)
5. Multi-provider quorum semantics (~15 domains)

**New notable frictions**:
1. Graduated cancellation schedules (~200 domains)
2. Structured message templates (~200 domains)
3. Standing-offer flow (~10 domains)
4. Geofence containment alerting (~20 domains)
5. Maritime/aviation routing (~27 domains)
6. Looping sub-state guidance (~25 domains)
7. Vulnerable person escalation (~30 domains)

### 10.5 Cross-Spec Patterns

Several findings recur across multiple specs:

1. **"Domain profiles need more fields"** — Duration, urgency, quantity, language, sensitivity level, check-in interval, cancellation schedule, geofence. Each is a simple tag addition but collectively they represent a richer task description model than the spec currently documents.

2. **"Guidance needed, not new kinds"** — Many frictions are resolved by adding normative guidance rather than new event kinds. The protocol has enough kinds; it needs clearer semantic rules for edge cases.

3. **"Operators carry the complexity"** — Multi-operator coordination, graduated fees, milestone approval, retention variance — these are operator-level concerns that the protocol should document but not prescribe. The three-layer architecture correctly places this complexity in the operator layer.

---

## 11. Recommendations and Spec Patches

### Priority 1: Duration Tracking (TROTT-01 + TROTT-04)

**Impact**: ~110 domains
**Change**: Add tags to existing event kinds

| Tag | Event Kind | Description |
|-----|-----------|-------------|
| `expected_duration` | 30500 (Task Request), 30530 (Quote) | Expected service duration in seconds |
| `actual_duration` | 30504 (Task Complete), 30535 (Payment Receipt) | Actual service duration in seconds |
| `scheduled_end` | 30500 (Task Request) | Scheduled end time (Unix timestamp) |
| `minimum_duration` | 30530 (Quote) | Minimum billable duration in seconds |
| `overtime_rate` | 30531 (Payment Terms) | Rate applied beyond expected duration |
| `overtime_threshold` | 30531 (Payment Terms) | Seconds beyond `expected_duration` before overtime applies |

Add rounding guidance: round to nearest whole `rate_unit`; partial units <50% round down, ≥50% round up.

### Priority 2: Credential-Filtered Discovery (TROTT-02)

**Impact**: ~50 domains
**Change**: Add optional tags to Provider Profile

| Tag | Event Kind | Description |
|-----|-----------|-------------|
| `credential` | 30510 (Provider Profile) | `["credential", "<type>", "<attestation_event_id>"]` |

Operators MUST independently verify via TROTT-03 — profile tags are discovery aids, not proof.

### Priority 3: Discovery Enrichment (TROTT-02)

**Impact**: ~40-55 domains
**Change**: Add optional tags to Task Request and Provider Profile

| Tag | Event Kind | Description |
|-----|-----------|-------------|
| `urgency` | 30500 (Task Request) | `critical`, `urgent`, `standard`, `flexible` |
| `provider_count` | 30500 (Task Request) | Number of providers required (default 1) |
| `language` | 30510 (Provider Profile), 30567 (User Preferences) | ISO 639-1 language code(s) |

### Priority 4: Payment Pattern Enrichment (TROTT-04)

**Impact**: ~200 domains (cancellation), ~28 domains (milestones, guarantees)
**Change**: Add optional tags and guidance

| Tag | Event Kind | Description |
|-----|-----------|-------------|
| `cancellation_schedule` | 30531 (Payment Terms) | `["cancellation_schedule", "24:0", "4:50", "0:100"]` |
| `milestone_sequence` | 30531 (Payment Terms) | Integer ordering of milestones |
| `guarantee_holdback_percent` | 30531 (Payment Terms) | Percentage held back for guarantee period |
| `guarantee_period_days` | 30531 (Payment Terms) | Duration of guarantee hold-back |

### Priority 5: Safety Enrichment (TROTT-05)

**Impact**: ~30 domains
**Change**: Add optional tags and guidance

| Tag | Event Kind | Description |
|-----|-----------|-------------|
| `checkin_interval_seconds` | 30502 (Task Accept) | Expected check-in cadence |
| `checkin_escalation_profile` | 30502 (Task Accept) | `critical`, `standard`, `relaxed` |
| `escalation_contacts` | 30500 (Task Request) | Domain-specific escalation pubkeys and roles |

### Priority 6: Navigation Extensions (TROTT-07)

**Impact**: ~27 domains (maritime/aviation), ~20 domains (geofence)
**Change**: Extend existing tags and add guidance

- Add `boat`, `aircraft`, `drone` to `transport_mode` values
- Add `geofence_breach` to Route Deviation types
- Add transport-mode-aware ETA accuracy thresholds

### Priority 7: Messaging Enrichment (TROTT-08)

**Impact**: ~200 domains (structured messages), ~30 domains (retention)
**Change**: Add optional tags

| Tag | Event Kind | Description |
|-----|-----------|-------------|
| `template` | 30564 (Task Message) | Structured message template identifier |
| `retention_category` | 30564 (Task Message) | `ephemeral`, `standard`, `evidence`, `clinical` |
| `translated_content` | 30564 (Task Message) | Machine-translated message body |

### Priority 8: Coordination Guidance (TROTT-06)

**Impact**: ~50 domains (PII sensitivity), ~15 domains (multi-operator)
**Change**: Add optional tags and normative guidance

| Tag | Event Kind | Description |
|-----|-----------|-------------|
| `sensitivity_level` | 30551 (PII Envelope) | `standard`, `heightened`, `special_category`, `child_data` |

Add guidance for multi-operator tasks (separate linked tasks), per-field retention variance (separate PII Envelopes), and credential expiry handling.

### Priority 9: Reputation Guidance (TROTT-03)

**Impact**: All cross-domain queries
**Change**: Add normative guidance (no new tags needed)

- Domain adjacency table for cross-domain reputation weighting
- Volume normalisation recommendation (Bayesian averaging)
- Credential expiry monitoring guidance

### Priority 10: Core Guidance (TROTT-01)

**Impact**: ~25-65 domains
**Change**: Add normative guidance

- Looping sub-states should use TROTT-05 check-ins, not state transitions
- Multi-provider quorum: `min_providers` field in domain profiles, `provider_count` / `confirmed_count` tags on Task Accept
- Recurring exception handling: `rescheduled` reason code for Task Cancel
- Long-lived task relay retention guidance
- Standing-offer pattern via Provider Profile with `standing_offer` tag

---

## Appendix A: Tag Summary

All new tags recommended by this stress test. None require new event kinds — all are optional additions to existing kinds.

| Tag | Kind(s) | Type | Priority |
|-----|---------|------|----------|
| `expected_duration` | 30500, 30530 | Integer (seconds) | 1 |
| `actual_duration` | 30504, 30535 | Integer (seconds) | 1 |
| `scheduled_end` | 30500 | Integer (Unix timestamp) | 1 |
| `minimum_duration` | 30530 | Integer (seconds) | 1 |
| `overtime_rate` | 30531 | Integer (smallest currency unit) | 1 |
| `overtime_threshold` | 30531 | Integer (seconds) | 1 |
| `credential` | 30510 | Array [type, attestation_id] | 2 |
| `urgency` | 30500 | Enum (critical/urgent/standard/flexible) | 3 |
| `provider_count` | 30500, 30502 | Integer | 3 |
| `language` | 30510, 30567 | ISO 639-1 code(s) | 3 |
| `cancellation_schedule` | 30531 | Array [hours:percent, ...] | 4 |
| `milestone_sequence` | 30531 | Integer | 4 |
| `guarantee_holdback_percent` | 30531 | Integer (0-100) | 4 |
| `guarantee_period_days` | 30531 | Integer | 4 |
| `checkin_interval_seconds` | 30502 | Integer | 5 |
| `checkin_escalation_profile` | 30502 | Enum (critical/standard/relaxed) | 5 |
| `escalation_contacts` | 30500 | Array [pubkey, role] | 5 |
| `transport_mode` (extended) | 30560 | Enum (add boat/aircraft/drone) | 6 |
| `geofence_breach` | 30562 | Deviation type value | 6 |
| `template` | 30564 | String (template identifier) | 7 |
| `retention_category` | 30564 | Enum (ephemeral/standard/evidence/clinical) | 7 |
| `translated_content` | 30564 | String | 7 |
| `sensitivity_level` | 30551 | Enum (standard/heightened/special_category/child_data) | 8 |
| `standing_offer` | 30510 | Boolean | 10 |
| `availability_schedule` | 30510 | Cron-like string | 10 |

**Total new tags: 25**
**New event kinds: 0**
**Backwards compatibility: Full** — all tags are optional additions.

---

## Appendix B: Domains by Coordination Pattern

| Pattern | Count | Example Domains |
|---------|-------|----------------|
| Dispatch | ~120 | Locksmith, plumber, electrician, mobile mechanic, pest control, window cleaning, carpet cleaning, appliance repair |
| Scheduled | ~300 | Cleaning, tutoring, physiotherapy, personal training, hairdressing, music lessons, yoga, dentistry, driving lessons |
| Relay delivery | ~40 | Parcel, food, pharmacy, groceries, flowers, medical specimens, document courier |
| Shift | ~20 | Security guard, event staffing, temp worker, night watchman |
| Trip | ~15 | Ridesharing, medical transport, school runs, airport transfer |
| Crew / Multi-provider | ~15 | Moving, event setup, construction teams, tree planting |
| Round-trip | ~15 | Laundry, vehicle servicing, equipment rental, watch repair, furniture restoration |
| Standing-offer | ~10 | Market stall, walk-in barber, pop-up shop, mobile knife sharpener |
| **Total** | **~535** | *(Remaining ~114 are variants that cross patterns)* |
