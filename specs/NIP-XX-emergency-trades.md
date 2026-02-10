# NIP-XX-emergency-trades: Emergency Trades Domain Extension

`draft` `optional`

**Extends**: NIP-XX-core (Decentralised Service Coordination Protocol)
**Domain Identifier**: `emergency_trades`
**Allocated Kind Range**: 30660-30679
**Reference Implementation**: `src/domain-profiles/emergency-trades.js`

---

## Abstract

This document defines the **emergency trades** domain extension to NIP-XX-core. It specifies role aliases, an extended state machine with diagnosis and milestone-based repair stages, domain-specific tags for trade type, emergency classification, and certification requirements, milestone pricing semantics, and rating criteria tailored to emergency tradesperson callouts over the Nostr protocol with payment-agnostic financial rails.

The emergency trades domain addresses a critical gap in the home services market. When a pipe bursts at 2 a.m. or the electrics fail, homeowners are at the mercy of whoever answers the phone — often rogue traders who exploit urgency to charge exorbitant rates for substandard work. Commitment stakes, verifiable certification credentials, and milestone-based pricing create transparency and accountability where traditional market dynamics fail. Unlike locksmithing, several emergency trade categories are **legally regulated** in the UK, making certification verification not merely desirable but a legal obligation.

## Regulatory Context

**Emergency trades encompass multiple regulatory regimes in the United Kingdom.** Unlike the unregulated locksmith industry, several trade categories carry mandatory licensing requirements with criminal penalties for non-compliance.

### Gas Work — Gas Safe Register (MANDATORY)

It is a **criminal offence** under the Gas Safety (Installation and Use) Regulations 1998 for anyone not on the Gas Safe Register to carry out gas work. Operators MUST verify Gas Safe registration before matching any callout with `trade_type` = `gas_engineer`. The Gas Safe Register number SHOULD be included as a `certification_id` tag on all gas-related events.

Penalties for unlicensed gas work include unlimited fines and imprisonment. Operators who knowingly match unregistered gas engineers may face accessory liability.

### Electrical Work — NICEIC / NAPIT / Part P

Electrical installation work in England and Wales is governed by Part P of the Building Regulations. Notifiable electrical work (e.g., new circuits, consumer unit replacements, work in bathrooms and kitchens) must be carried out by a competent person registered with an approved scheme (NICEIC, NAPIT, ELECSA, or equivalent) or otherwise inspected by Building Control.

Emergency electrical repairs (e.g., making safe a dangerous fault) are generally not notifiable, but operators SHOULD still verify competent person registration for all electrical callouts.

### Plumbing, Roofing, Glazing — Unregulated

General plumbing, roofing, and glazing are **not regulated** in the UK. No mandatory licensing exists. Voluntary bodies (e.g., Chartered Institute of Plumbing and Heating Engineers, National Federation of Roofing Contractors) offer accreditation but membership is not required by law. The protocol's trust layer — commitment stakes, milestone pricing, and cryptographic reputation — provides the accountability that regulation otherwise would.

### Consumer Rights Act 2015

All emergency trade work is covered by the Consumer Rights Act 2015, which requires that services are performed with reasonable care and skill, within a reasonable time, and for a reasonable price (where no price is agreed in advance). The milestone pricing model in this extension aligns with these statutory protections by establishing agreed prices at each stage before work proceeds.

Operators in other jurisdictions MUST verify local licensing and certification requirements for all trade categories.

---

## Currency-Neutral Amounts

All monetary amounts in emergency trades events are **currency-neutral**. The `amount` value is always in the smallest unit of the specified currency (pence for GBP, cents for USD, satoshis for SAT). Every event with a monetary value MUST include `currency` and `trust_model` tags. See [NIP-XX-payments.md](NIP-XX-payments.md) and [NIP-XX-stakes.md](NIP-XX-stakes.md).

---

## Terminology

| Generic Term (NIP-XX-core) | Emergency Trades Domain Alias | Description |
|----------------------------|-------------------------------|-------------|
| Requester | **Homeowner** | The person reporting an emergency and requiring trade services |
| Provider | **Tradesperson** | The qualified professional performing the repair work |
| Task | **Callout** | A single emergency callout, diagnosis, and repair job |
| Operator | Operator | The relay/server coordinating callouts (unchanged) |

Implementations SHOULD accept both the generic terms (`requester_pubkey`, `provider_pubkey`) and the domain-specific aliases (`homeowner_pubkey`, `tradesperson_pubkey`). The `domain` tag MUST be set to `"emergency_trades"` on all events.

```json
["domain", "emergency_trades"]
```

---

## Discovery Method

**Method**: `geohash` + `skill_tags`

Emergency trades discovery uses geohash-based spatial indexing combined with skill tag filtering. Homeowners broadcast their location (geohash-encoded) alongside the required trade type and emergency classification. Available tradespersons within the relevant geohash tiles whose `skill_tags` match the required `trade_type` are notified.

```json
["geohash", "gcpvj0"],
["skill_tags", "plumber"],
["trade_type", "plumber"],
["emergency_type", "water_leak"]
```

The dual-filter approach ensures that a plumber is not matched to an electrical emergency and vice versa. Tradespersons advertising multiple skills (e.g., a plumber who also handles blocked drains) SHOULD publish multiple `skill_tags`.

---

## Pricing Model

**Model**: `milestone`

Unlike flat-rate pricing (locksmith) or distance-based metering (ridesharing), emergency trade work is priced in **milestones**. The total cost is often unknown at dispatch — a water leak might require a simple washer replacement or a full re-pipe. Milestone pricing breaks the job into discrete, priced stages, each requiring explicit homeowner approval before proceeding.

### Milestone Stages

1. **Diagnosis** — Tradesperson arrives, assesses the problem, identifies the root cause. Fixed callout fee.
2. **Emergency fix** — Immediate containment or temporary repair (stop the leak, isolate the circuit, board the window). Priced after diagnosis.
3. **Full repair** (optional) — Permanent repair or replacement. Priced separately, may be scheduled for a later date.

### Milestone Flow

1. **Callout dispatched** — Homeowner reports emergency; operator provides an estimated callout fee range
2. **Diagnosis priced** — Tradesperson arrives, diagnoses the issue, and publishes a diagnosis report (kind 30661) with a confirmed diagnosis fee
3. **Emergency fix quoted** — Tradesperson publishes a repair quote (kind 30662) with milestones: emergency fix cost and optional full repair cost
4. **Homeowner accepts** — Homeowner reviews and accepts the quote (kind 30663); stakes are adjusted per milestone
5. **Emergency fix completed** — Tradesperson completes the emergency containment; milestone completion event published (kind 30665)
6. **Full repair** (optional) — If the homeowner elects to proceed, the full repair milestone begins. If not, a follow-up callout may be linked via `linked_task`

```json
{
  "pricing_model": "milestone",
  "milestones": [
    {
      "stage": "diagnosis",
      "amount": 7500,
      "currency": "GBP",
      "description": "Callout and diagnosis fee"
    },
    {
      "stage": "emergency_fix",
      "amount": 15000,
      "currency": "GBP",
      "description": "Isolate burst pipe, temporary repair"
    },
    {
      "stage": "full_repair",
      "amount": 45000,
      "currency": "GBP",
      "description": "Replace corroded section, full test",
      "optional": true
    }
  ]
}
```

---

## State Machine

The emergency trades domain extends the NIP-XX-core state machine with diagnosis, emergency fix, and optional full repair stages. The `full_repair` state is optional — many emergency callouts are resolved at the emergency fix stage, with permanent repairs scheduled as a separate linked callout.

```
emergency_reported ──> tradesperson_matched ──> en_route ──> arrived
       │                      │                   │            │
       │                      │                   │            v
       │                      │                   │        diagnosed
       │                      │                   │            │
       │                      │                   │            v
       │                      │                   │      emergency_fix
       │                      │                   │            │
       │                      │                   │            ├──> full_repair ──> completed
       │                      │                   │            │
       │                      │                   │            └──> completed
       │                      │                   │
       └──────────────────────┴───────────────────┴──── cancelled
                    (from any non-terminal state)

Terminal states: completed, cancelled, no_show.
no_show: homeowner not present when tradesperson arrives (triggers automatic stake forfeiture).
```

### State Definitions

| Core State | Emergency Trades State | Description |
|------------|----------------------|-------------|
| `requested` | `emergency_reported` | Homeowner has reported an emergency requiring a tradesperson |
| `matched` | `tradesperson_matched` | A tradesperson with the appropriate skills has accepted the callout |
| `provider_en_route` | `en_route` | Tradesperson is travelling to the homeowner's location |
| `provider_arrived` | `arrived` | Tradesperson has arrived and is assessing the situation |
| *(extension)* | `diagnosed` | Tradesperson has completed diagnosis, identified root cause, and issued a repair quote; homeowner has accepted |
| *(extension)* | `emergency_fix` | Tradesperson is performing the emergency containment or temporary repair |
| *(extension)* | `full_repair` | Tradesperson is performing the permanent repair (optional stage) |
| `completed` | `completed` | Work has been completed successfully |
| `cancelled` | `cancelled` | Callout was cancelled (valid from any non-terminal state) |

### State Transitions

| From | To | Trigger |
|------|----|---------|
| `emergency_reported` | `tradesperson_matched` | Tradesperson accepts the callout |
| `emergency_reported` | `cancelled` | Homeowner cancels before match |
| `tradesperson_matched` | `en_route` | Tradesperson begins travel |
| `tradesperson_matched` | `cancelled` | Either party cancels |
| `en_route` | `arrived` | Tradesperson GPS confirms arrival |
| `en_route` | `cancelled` | Either party cancels |
| `arrived` | `diagnosed` | Tradesperson publishes diagnosis report; homeowner accepts repair quote |
| `arrived` | `no_show` | Homeowner not present within waiting limit |
| `arrived` | `cancelled` | Homeowner declines quote or either party cancels |
| `diagnosed` | `emergency_fix` | Tradesperson begins emergency containment work |
| `diagnosed` | `cancelled` | Either party cancels (stake penalties may apply) |
| `emergency_fix` | `full_repair` | Emergency fix complete; homeowner elects to proceed with full repair |
| `emergency_fix` | `completed` | Emergency fix complete; no full repair needed or homeowner declines full repair |
| `full_repair` | `completed` | Full repair completed |
| `full_repair` | `cancelled` | Exceptional cancellation (dispute likely) |

### Linked Follow-Up Callouts

When an emergency callout completes at the `emergency_fix` stage and the homeowner wishes to schedule the full repair separately, the operator creates a new callout linked to the original via the `linked_task` tag:

```json
["linked_task", "<emergency_callout_id>", "follow_up"]
```

The linked callout inherits the tradesperson match (if the homeowner prefers the same tradesperson) but follows its own independent state machine. Reputation from linked callouts is aggregated in the tradesperson's profile.

---

## Domain-Specific Tags

The following tags are specific to the emergency trades domain and SHOULD be included on relevant events.

| Tag | Required | Description | Example Values |
|-----|----------|-------------|----------------|
| `trade_type` | REQUIRED | Type of tradesperson required | `plumber`, `electrician`, `gas_engineer`, `locksmith`, `roofer`, `glazier` |
| `emergency_type` | REQUIRED | Classification of the emergency | `water_leak`, `power_outage`, `gas_leak`, `broken_window`, `blocked_drain` |
| `certification_required` | CONDITIONAL | Required certification (mandatory for gas and notifiable electrical work) | `gas_safe`, `niceic`, `part_p` |
| `certification_id` | CONDITIONAL | Tradesperson's certification registration number | `123456` (e.g., Gas Safe registration number) |
| `parts_needed` | After diagnosis | Whether replacement parts are required | `true`, `false` |
| `parts_cost` | After diagnosis | Cost of parts in smallest currency unit | `3500` (integer) |
| `skill_tags` | On provider profile | Trade skills the tradesperson offers | `plumber`, `gas_engineer`, `electrician` |
| `linked_task` | On follow-up | Reference to the original emergency callout | `<callout_id>`, `follow_up` |

### Certification Requirements by Trade Type

| Trade Type | Certification Required | Legal Basis |
|------------|----------------------|-------------|
| `gas_engineer` | `gas_safe` — **MANDATORY** | Gas Safety (Installation and Use) Regulations 1998 |
| `electrician` | `niceic` or `part_p` — **RECOMMENDED** (mandatory for notifiable work) | Part P Building Regulations |
| `plumber` | None — voluntary | No statutory regulation |
| `roofer` | None — voluntary | No statutory regulation |
| `glazier` | None — voluntary | No statutory regulation |
| `locksmith` | None — voluntary | No statutory regulation |

### Tag Examples

**On an emergency callout request (kind 30660):**

```json
{
  "kind": 30660,
  "tags": [
    ["domain", "emergency_trades"],
    ["d", "callout_def456"],
    ["geohash", "gcpvj0"],
    ["trade_type", "plumber"],
    ["emergency_type", "water_leak"],
    ["skill_tags", "plumber"],
    ["description", "Burst pipe under kitchen sink, water spraying everywhere"],
    ["homeowner_pubkey", "abc123..."]
  ],
  "content": ""
}
```

**On a gas emergency callout request (kind 30660) with mandatory certification:**

```json
{
  "kind": 30660,
  "tags": [
    ["domain", "emergency_trades"],
    ["d", "callout_ghi789"],
    ["geohash", "gcpvj0"],
    ["trade_type", "gas_engineer"],
    ["emergency_type", "gas_leak"],
    ["certification_required", "gas_safe"],
    ["skill_tags", "gas_engineer"],
    ["description", "Strong smell of gas in kitchen, meter running with all appliances off"],
    ["homeowner_pubkey", "abc123..."]
  ],
  "content": "National Gas Emergency number (0800 111 999) already called. Gas supply turned off at meter."
}
```

---

## Rating Criteria

After a callout is completed, both parties publish rating events (kind 30530) with domain-specific criteria.

| Criterion Tag | Label | Weight | Description |
|---------------|-------|--------|-------------|
| `overall` | Overall | 0.20 | General satisfaction with the service |
| `response_time` | Response Time | 0.20 | Speed of arrival after accepting the callout |
| `diagnosis_accuracy` | Diagnosis Accuracy | 0.20 | Correctness of the initial diagnosis and identification of root cause |
| `workmanship` | Workmanship | 0.20 | Quality of the repair work performed |
| `pricing_transparency` | Pricing Transparency | 0.10 | Milestone prices were clear, fair, and honoured as quoted |
| `tidiness` | Tidiness | 0.10 | Left the property clean and tidy; minimised disruption |

### Rating Event Example

```json
{
  "kind": 30530,
  "tags": [
    ["domain", "emergency_trades"],
    ["task_id", "callout_def456"],
    ["rated_pubkey", "tradesperson_pubkey_xyz"],
    ["overall", "5"],
    ["response_time", "5"],
    ["diagnosis_accuracy", "4"],
    ["workmanship", "5"],
    ["pricing_transparency", "5"],
    ["tidiness", "4"]
  ],
  "content": "Arrived within 30 minutes. Diagnosed burst compression fitting quickly. Emergency fix stopped the leak; full repair booked for next week. Fair pricing throughout."
}
```

---

## Emergency Trades-Specific Event Kinds (30660-30679)

The following kind range is reserved for emergency-trades-domain-specific events. Core protocol kinds (30500-30599) are shared across all domains.

| Kind | Name | Status | Replaceable | Publisher |
|------|------|--------|-------------|-----------|
| 30660 | Emergency Callout Request | Draft | Yes (NIP-33) | Homeowner |
| 30661 | Diagnosis Report | Draft | Yes (NIP-33) | Tradesperson |
| 30662 | Repair Quote | Draft | Yes (NIP-33) | Tradesperson |
| 30663 | Quote Acceptance | Draft | No (append-only) | Homeowner |
| 30664 | *(Reserved)* | — | — | — |
| 30665 | Milestone Completion | Draft | No (append-only) | Tradesperson |
| 30666 | *(Reserved)* | — | — | — |
| 30667 | Guarantee Start | Draft | Yes (NIP-33) | Tradesperson |
| 30668-30679 | *(Reserved for future use)* | — | — | — |

### Kind 30660: Emergency Callout Request

Published by the homeowner to report an emergency and request a tradesperson. Extends core kind 30500 with trade-specific tags.

```json
{
  "kind": 30660,
  "tags": [
    ["domain", "emergency_trades"],
    ["d", "callout_def456"],
    ["geohash", "gcpvj0"],
    ["trade_type", "plumber"],
    ["emergency_type", "water_leak"],
    ["skill_tags", "plumber"],
    ["description", "Burst pipe under kitchen sink, water spraying everywhere"],
    ["homeowner_pubkey", "abc123..."],
    ["expiration", "1700000000"]
  ],
  "content": "Water is pooling on the kitchen floor. Main stopcock turned off but there is still residual flow."
}
```

**Semantics:**
- The `expiration` tag (per NIP-40) indicates when the callout request expires if unmatched
- `trade_type` and `emergency_type` are REQUIRED for matching
- `certification_required` MUST be included for gas work and SHOULD be included for notifiable electrical work
- The homeowner's precise address is transmitted via NIP-17 gift wrap or NIP-44 encryption, with only the geohash visible publicly

### Kind 30661: Diagnosis Report

Published by the tradesperson after arriving and assessing the emergency. Contains the root cause analysis, severity assessment, photos of the damage, and a description of the recommended repair approach.

```json
{
  "kind": 30661,
  "tags": [
    ["domain", "emergency_trades"],
    ["d", "callout_def456"],
    ["e", "<original_request_event_id>"],
    ["trade_type", "plumber"],
    ["diagnosis", "Corroded compression fitting on 15mm copper pipe under sink"],
    ["severity", "moderate"],
    ["photo_hash", "sha256:abc123..."],
    ["parts_needed", "true"],
    ["parts_description", "15mm compression coupling, PTFE tape"],
    ["parts_cost", "1200"],
    ["currency", "GBP"],
    ["emergency_containable", "true"],
    ["full_repair_required", "true"]
  ],
  "content": "Compression fitting has corroded through. Water contained by turning off stopcock. Emergency fix: temporary repair with epoxy putty. Full repair: replace fitting and 30cm section of pipe."
}
```

**Semantics:**
- `severity` values: `critical` (immediate danger — gas leak, live electrics exposed), `moderate` (significant damage but contained), `minor` (inconvenience, no ongoing damage)
- `photo_hash` references photographic evidence uploaded via an out-of-band mechanism (e.g., NIP-94 file metadata)
- `emergency_containable` indicates whether the tradesperson can perform an immediate temporary fix
- `full_repair_required` indicates whether permanent repair is needed beyond the emergency fix

### Kind 30662: Repair Quote

Published by the tradesperson after diagnosis. Contains milestone-based pricing for the emergency fix and (optionally) the full repair.

```json
{
  "kind": 30662,
  "tags": [
    ["domain", "emergency_trades"],
    ["d", "callout_def456"],
    ["e", "<diagnosis_report_event_id>"],
    ["trade_type", "plumber"],
    ["milestone", "diagnosis", "7500", "Callout and diagnosis fee"],
    ["milestone", "emergency_fix", "15000", "Temporary repair with epoxy putty"],
    ["milestone", "full_repair", "45000", "Replace fitting and pipe section"],
    ["total_amount", "67500"],
    ["currency", "GBP"],
    ["trust_model", "custodial-third-party"],
    ["parts_cost", "1200"],
    ["labour_cost", "66300"],
    ["valid_for_seconds", "900"],
    ["full_repair_optional", "true"],
    ["estimated_duration_minutes", "45"]
  ],
  "content": "Emergency fix will stop the leak within 20 minutes using epoxy putty. Full repair requires replacing the corroded section — recommend scheduling within 7 days as the putty is a temporary measure."
}
```

**Semantics:**
- Each `milestone` tag contains: stage name, amount in smallest currency unit, and description
- `valid_for_seconds` indicates how long the quote remains valid (default: 900 seconds / 15 minutes)
- `full_repair_optional` signals that the homeowner may decline the full repair milestone
- Stakes are adjusted per milestone upon acceptance
- The tradesperson's stake covers the current active milestone, not the full total

### Kind 30663: Quote Acceptance

Published by the homeowner to accept or decline the repair quote.

```json
{
  "kind": 30663,
  "tags": [
    ["domain", "emergency_trades"],
    ["e", "<repair_quote_event_id>"],
    ["d", "callout_def456"],
    ["accepted", "true"],
    ["milestones_accepted", "diagnosis", "emergency_fix"],
    ["total_accepted", "22500"],
    ["currency", "GBP"]
  ],
  "content": ""
}
```

**Semantics:**
- `milestones_accepted` lists which milestones the homeowner has agreed to pay for
- The homeowner may accept the emergency fix but decline the full repair, opting to schedule it separately
- If `accepted` is `false`, the callout transitions to `cancelled` with no penalty to the homeowner (the tradesperson retains their diagnosis callout fee)

### Kind 30665: Milestone Completion

Published by the tradesperson upon completing a milestone stage. References core kind 30537 (completion proof) for evidence.

```json
{
  "kind": 30665,
  "tags": [
    ["domain", "emergency_trades"],
    ["d", "callout_def456"],
    ["e", "<quote_acceptance_event_id>"],
    ["milestone_stage", "emergency_fix"],
    ["milestone_amount", "15000"],
    ["currency", "GBP"],
    ["photo_hash", "sha256:def456..."],
    ["description", "Epoxy putty applied to corroded fitting, leak stopped"],
    ["completion_proof", "<kind_30537_event_id>"],
    ["next_milestone", "full_repair"],
    ["status", "emergency_fix_complete"]
  ],
  "content": "Emergency fix complete. Leak fully contained. Recommend full repair within 7 days — epoxy putty is rated for temporary use only."
}
```

**Semantics:**
- Each milestone completion triggers a partial stake release for the completed stage
- `completion_proof` references a core kind 30537 event containing photographic or other evidence
- `next_milestone` indicates the next stage (if applicable); omitted if no further milestones
- The homeowner receives a prompt to confirm milestone completion or raise a dispute

### Kind 30667: Guarantee Start

Published after completion if the tradesperson offers a guarantee on the work performed.

```json
{
  "kind": 30667,
  "tags": [
    ["domain", "emergency_trades"],
    ["d", "callout_def456"],
    ["guarantee_days", "365"],
    ["guarantee_scope", "Full pipe section replacement and compression fitting"],
    ["guarantee_excludes", "Damage caused by freezing or third-party interference"],
    ["tradesperson_pubkey", "xyz..."],
    ["trade_type", "plumber"],
    ["certification_id", ""],
    ["expiration", "1731536000"]
  ],
  "content": "12-month guarantee on replacement pipework and fitting. Contact via Nostr DM for warranty claims. Does not cover freeze damage or work by other tradespeople on the same section."
}
```

**Semantics:**
- `guarantee_days` specifies the guarantee period in days
- `guarantee_scope` describes exactly what is covered
- `guarantee_excludes` lists exclusions (optional but recommended)
- The `expiration` tag (per NIP-40) is set to the guarantee end date, after which the event may be pruned by relays

---

## Staking Model

The emergency trades domain uses asymmetric staking with milestone-based adjustments:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Homeowner initial stake | 10% of diagnosis fee | Low barrier — homeowner is in an emergency situation |
| Tradesperson initial stake | 15% of diagnosis fee | Deters no-shows and ensures arrival commitment |
| Per-milestone stake adjustment | 12% of milestone amount | Stakes recalculated at each milestone acceptance |
| Cancellation penalty (pre-diagnosis) | 80% of initial stake | Strong deterrent against frivolous callouts |
| Cancellation penalty (post-diagnosis) | Diagnosis fee retained by tradesperson | Tradesperson compensated for time and travel |

Stakes are initially based on the diagnosis callout fee. Upon quote acceptance (kind 30663), stakes are recalculated for each accepted milestone. Milestone completion (kind 30665) triggers partial stake release for the completed stage.

### Gas Work Staking Override

For callouts where `certification_required` = `gas_safe`, the tradesperson stake is increased to **20% of milestone amount**. This higher stake reflects the elevated risk and regulatory severity of gas work — a rogue gas engineer poses a genuine safety hazard.

---

## Completion Proof

Emergency trades callouts use the following proof types:

| Proof Type | Description |
|------------|-------------|
| `gps_arrival` | GPS coordinates confirming the tradesperson arrived at the homeowner's location |
| `photo` | Photographic evidence of diagnosis and completed repair work |
| `description` | Written description of work performed, materials used, and any follow-up recommendations |

Photo proof is **strongly recommended** for all emergency trades work. For milestone-based jobs, photo evidence SHOULD be provided at each milestone completion (kind 30665) — before and after shots demonstrating the problem and the repair.

### Gas Work Proof Requirements

For gas work (`trade_type` = `gas_engineer`), the following additional proof is RECOMMENDED:

| Proof Type | Description |
|------------|-------------|
| `gas_safe_notification` | Confirmation that the work has been notified to Gas Safe Register (legally required for certain gas work) |
| `gas_tightness_test` | Confirmation that a gas tightness test was performed after the repair |

---

## Dispute Evidence Types

| Evidence Type | Description |
|---------------|-------------|
| `text` | Written description of the dispute |
| `photo` | Photographic evidence (e.g., substandard work, damage, incomplete repair) |
| `gps_trace` | GPS trace showing the tradesperson's movements |
| `milestone_quote` | The original repair quote event, proving agreed milestone prices |
| `diagnosis_report` | The diagnosis report event, proving the assessed root cause |
| `certification_proof` | Evidence of (or lack of) required certification |

---

## Relationship to Core Protocol

The emergency trades domain uses all core NIP-XX event kinds for task lifecycle management, staking, payments, disputes, and reputation. The domain-specific kinds (30660-30679) extend the core protocol with emergency-trades-specific semantics — principally around diagnosis reporting, milestone-based quoting, and guarantee management.

### Shared Core Kinds Used

| Kind | Name | Usage in Emergency Trades Domain |
|------|------|----------------------------------|
| 30500 | Service Request | Homeowner reports emergency (extended by kind 30660) |
| 30501 | Service Acceptance | Tradesperson accepts the callout |
| 30502 | Stake Lock | Operator locks commitment stakes (adjusted per milestone) |
| 30510 | Streaming Payment | Not typically used (milestone-based, not streaming) |
| 30511 | Payment Confirmation | Payment confirmation at each milestone completion |
| 30512 | Status Update | State transitions during the callout |
| 30513 | Provider Tip | Homeowner tips the tradesperson |
| 30520 | Stake Release | Operator releases stakes upon milestone or final completion |
| 30522 | Dispute Filing | Either party files a dispute |
| 30524 | Dispute Resolution | Arbiter resolves the dispute |
| 30530 | Reputation Rating | Post-callout rating with emergency-trades-specific criteria |
| 30537 | Completion Proof | Photo and description evidence (referenced by kind 30665) |

---

## Security Considerations

1. **Location privacy** — Callout requests reveal the homeowner's home address. Implementations MUST use NIP-17 gift wrap or NIP-44 encryption for the precise address, with only the geohash visible publicly. This is especially sensitive as it reveals both the homeowner's address and the existence of a property emergency (e.g., a broken window exposes a security vulnerability).
2. **Vulnerability exploitation** — Homeowners facing a burst pipe or gas leak are under extreme time pressure. The milestone pricing model with commitment stakes is specifically designed to prevent exploitation by requiring transparent, agreed pricing at each stage.
3. **Property access** — Tradespersons gain access to homes, often to vulnerable areas (boiler cupboards, consumer units, under-floor spaces). Operators SHOULD implement identity verification.
4. **Certification fraud** — Rogue traders may claim certifications they do not hold. Operators MUST verify Gas Safe registration independently (the Gas Safe Register provides a public lookup) and SHOULD verify NICEIC/NAPIT registration for electrical work.
5. **Gas safety** — Unqualified gas work poses a genuine risk to life (carbon monoxide poisoning, gas explosions). Operators who match gas callouts without verifying Gas Safe registration may face criminal accessory liability. Implementations MUST refuse to match `trade_type` = `gas_engineer` callouts without a verified `certification_id`.
6. **Emergency severity triage** — For `emergency_type` = `gas_leak`, implementations SHOULD display a prominent reminder to call the National Gas Emergency Service (0800 111 999) and to evacuate if the smell is strong. The protocol is not a substitute for emergency services.

---

## Future Work

- **Multi-trade callouts** — Support for emergencies requiring multiple trades (e.g., a flood requiring both a plumber and an electrician to make safe)
- **Insurance verification** — Tradesperson public liability insurance verification via NIP-XX-core verification kinds
- **Building control notification** — Automated Part P notification for notifiable electrical work
- **Recurring maintenance** — Scheduled maintenance contracts (e.g., annual boiler service) as recurring linked callouts
- **Parts sourcing** — Integration with trade parts suppliers for real-time pricing and availability
- **Apprentice supervision** — Tags for indicating supervised apprentice work, with the supervising tradesperson's certification referenced
- **Thermal imaging evidence** — Support for thermal imaging photos as a diagnostic evidence type (useful for leak detection and electrical fault finding)
- **Emergency service integration** — Protocol-level reminders and links to statutory emergency services (Gas Emergency, 999) where appropriate

---

## See Also

- **[NIP-XX-core.md](NIP-XX-core.md)** — Domain-agnostic core protocol (this extension's parent)
- **[NIP-XX-stakes.md](NIP-XX-stakes.md)** — Commitment stakes (lock, release, forfeit, milestone escrow)
- **[NIP-XX-payments.md](NIP-XX-payments.md)** — Payment events and streaming models
- **[NIP-XX-reputation.md](NIP-XX-reputation.md)** — Ratings and reputation portability
- **[NIP-XX-discovery.md](NIP-XX-discovery.md)** — Service discovery (geohash + skill tag matching)
- **[NIP-XX-disputes.md](NIP-XX-disputes.md)** — Dispute resolution (workmanship and pricing disputes)
- **[NIP-XX-safety.md](NIP-XX-safety.md)** — Safety infrastructure (gas leak emergency alerts)
- **[NIP-XX-locksmith.md](NIP-XX-locksmith.md)** — Locksmith domain extension (closely related trade domain)
- **[QUICK-REFERENCE.md](QUICK-REFERENCE.md)** — Summary table of all event kinds
- **[../docs/PAYMENT-PROVIDERS.md](../docs/PAYMENT-PROVIDERS.md)** — Payment provider integration guide
- **Reference implementation**: `src/domain-profiles/emergency-trades.js`
- **Gas Safe Register**: https://www.gassaferegister.co.uk/ (mandatory for gas work)
- **NICEIC**: https://www.niceic.com/ (electrical competent person scheme)
- **NAPIT**: https://www.napit.org.uk/ (electrical competent person scheme)
- **Consumer Rights Act 2015**: https://www.legislation.gov.uk/ukpga/2015/15
