# TROTT Domain Profile: Emergency Trades

`draft`

**Domain identifier:** `emergency-trades`
**Coordination pattern:** Dispatch
**Event kind range:** 30680-30699

## TROTT Specs Used

- TROTT-01: Core **Yes**
- TROTT-02: Discovery (geographic broadcast + skill search) **Yes**
- TROTT-03: Reputation **Yes**
- TROTT-04: Payments (milestone payments, competitive quoting) **Yes**
- TROTT-05: Safety (emergency signal, disputes) **Yes**
- TROTT-06: Coordination (recommended -- especially for certification verification) **Yes**
- TROTT-07: Navigation **No** (dispatch only)

## Roles

- Requester: "Householder"
- Provider: "Tradesperson"

## State Machine Extension

The emergency trades domain expands the TROTT-01 `in_progress` phase into diagnosis and milestone-based repair stages:

```
accepted --> provider_en_route --> diagnosis --> quote_provided --> quote_accepted --> work_active --> work_complete --> confirmed
                            |                                                     |
                            +--> cancelled (householder declines; diagnosis fee retained)
                                                                                  +--> full_repair (optional) --> confirmed
```

| Core state               | Emergency trades state | Description                                              |
|--------------------------|------------------------|----------------------------------------------------------|
| `in_progress` (dispatch) | `provider_en_route`    | Tradesperson is travelling to the householder's location |
| `in_progress` (phase 1)  | `diagnosis`            | Tradesperson assessing the problem on site               |
| `in_progress` (phase 2)  | `quote_provided`       | Tradesperson has issued milestone-based repair quote     |
| `in_progress` (phase 3)  | `quote_accepted`       | Householder has accepted the repair quote                |
| `in_progress` (phase 4)  | `work_active`          | Emergency containment or repair underway                 |
| `in_progress` (phase 5)  | `work_complete`        | Emergency fix done; optional full repair follows         |

The `full_repair` stage is optional. Many emergencies resolve at the emergency fix stage, with permanent repairs
scheduled as a separate linked task.

**Terminal states**: `confirmed`, `cancelled`, `no_show`. A `no_show` occurs when the householder is absent after
commitment (see Cancellation Policy). Triggers automatic stake forfeiture per TROTT-01.

## Domain-Specific Tags

| Tag                | Description                                                                                       |
|--------------------|---------------------------------------------------------------------------------------------------|
| `trade_type`       | Required trade: `plumber`, `electrician`, `gas_engineer`, `roofer`, `glazier`, `drain_specialist` |
| `emergency_level`  | Severity: `critical`, `moderate`, `minor`                                                         |
| `certification`    | Required certification: `gas_safe`, `niceic`, `napit`, `part_p`                                   |
| `certification_id` | Tradesperson's certification registration number                                                  |
| `parts_needed`     | Whether parts are required: `true`/`false`                                                        |
| `parts_cost`       | Cost of parts (smallest currency unit)                                                            |
| `linked_task`      | Reference to original emergency callout for follow-up repairs                                     |

## Rating Criteria

| Criterion              | Weight |
|------------------------|--------|
| `overall`              | 0.20   |
| `response_time`        | 0.20   |
| `diagnosis_accuracy`   | 0.20   |
| `workmanship`          | 0.20   |
| `pricing_transparency` | 0.10   |
| `tidiness`             | 0.10   |

## Pricing Model

**Milestone-based.** The total cost is unknown at dispatch. Work is broken into discrete, priced stages, each requiring
explicit householder approval:

1. **Diagnosis** -- fixed callout fee for assessment
2. **Emergency fix** -- priced after diagnosis; immediate containment or temporary repair
3. **Full repair** (optional) -- permanent repair, may be scheduled separately

Each milestone triggers a partial TROTT-04 Stake Release. Householder may accept some milestones and decline others.

## Payment Configuration

| Property               | Value                                              |
|------------------------|----------------------------------------------------|
| Primary `payment_type` | `milestone`                                        |
| Streaming              | Not applicable                                     |
| Milestones             | Diagnosis → Emergency fix → Full repair (optional) |

Emergency trades use TROTT-04 milestone payments (kind 30533 with `release_reason: milestone`). The total cost is
unknown at dispatch; each milestone is independently quoted and requires explicit householder approval before work
proceeds. Each completed milestone triggers a partial Stake Release.

### Default Stakes

| Party             | Percentage | Basis                                |
|-------------------|------------|--------------------------------------|
| Householder       | 10%        | Diagnosis fee (initial)              |
| Tradesperson      | 15%        | Diagnosis fee (initial)              |
| Per-milestone     | 12%        | Milestone amount (recalculated)      |
| Gas work override | 20%        | Milestone amount (tradesperson only) |

## Cancellation Policy

| Stage                             | Penalty                                                    |
|-----------------------------------|------------------------------------------------------------|
| Before match                      | None                                                       |
| After match, before arrival       | 80% of initial stake                                       |
| Householder declines repair quote | Diagnosis fee retained by tradesperson; no further penalty |
| After work begins                 | Full milestone stake forfeit for cancelling party          |
| No-show (householder absent)      | 100% of householder stake (automatic)                      |

Stake amounts are defined in the Default Stakes table above.

## PII Requirements

Householder's home address (precise location for dispatch). Encrypted via NIP-44; geohash only in public events.
Especially sensitive as the address combined with the emergency type may reveal security vulnerabilities (e.g. broken
window). Retained for task duration plus 30 days.

## Safety Rules

- **Check-ins:** Not required for standard callouts.
- **Gas emergencies:** Implementations must display a prominent reminder to call the **National Gas Emergency Service (
  0800 111 999)** and to evacuate if the smell is strong. The protocol is not a substitute for emergency services.
- **Certification verification:** Operator must refuse to match `trade_type=gas_engineer` without a verified
  `certification_id` on the Gas Safe Register.

## Completion Proof

Photo evidence of diagnosis and completed repair work. Before-and-after photographs recommended at each milestone
completion. Written description of work performed, materials used, and follow-up recommendations.

For gas work: confirmation of Gas Safe notification and gas tightness test.

## Domain-Specific Event Kinds

| Kind        | Name                      | Description                                                    |
|-------------|---------------------------|----------------------------------------------------------------|
| 30680       | Emergency Callout Request | Householder reports emergency with trade type and severity     |
| 30681       | Diagnosis Report          | Root cause analysis, severity, photos, parts assessment        |
| 30682       | Repair Quote              | Milestone-based pricing: diagnosis, emergency fix, full repair |
| 30683       | Quote Acceptance          | Householder accepts/declines with milestones selected          |
| 30684       | Milestone Completion      | Stage completed with photo proof and description               |
| 30685       | Guarantee Start           | Tradesperson offers guarantee on completed work                |
| 30686-30699 | *(Reserved)*              | Future emergency trades extensions                             |

## Regulatory Context

**Gas work -- Gas Safe Register (MANDATORY).** It is a criminal offence under the Gas Safety (Installation and Use)
Regulations 1998 to carry out gas work without Gas Safe registration. Penalties include unlimited fines and
imprisonment.

**Electrical work -- NICEIC / NAPIT / Part P.** Notifiable electrical work in England and Wales (new circuits, consumer
unit replacements, work in bathrooms/kitchens) must be carried out by a person registered with an approved competent
person scheme (NICEIC, NAPIT, ELECSA) or inspected by Building Control.

**Plumbing, roofing, glazing -- unregulated.** No mandatory licensing in the UK. The protocol's trust layer provides the
accountability that regulation otherwise would.

All work is covered by the **Consumer Rights Act 2015**, requiring reasonable care, skill, time, and price.
