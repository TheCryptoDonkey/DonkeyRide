# TROTT-05: Safety & Disputes

`draft` `optional`

## Abstract

This specification defines the **safety and dispute resolution infrastructure** for trust-minimised physical service coordination. It covers two distinct concerns: **real-time safety** (protection during active tasks) and **post-task disputes** (resolving disagreements after a task ends). Safety events enable participants to summon help, share task details with trusted contacts, and publish periodic proof-of-wellbeing signals. Dispute events enable structured claim filing, evidence submission, and resolution by operators, community mediators, or automated systems.

Together these mechanisms ensure that when things go wrong — whether a safety emergency during service or a billing disagreement afterwards — there is a transparent, auditable process for response and resolution.

## Motivation

Service coordination between strangers carries inherent risk. Traditional platforms provide safety features (panic buttons, trip sharing, driver screening) and dispute resolution (in-app claims, refund workflows) but keep all data proprietary and all decisions opaque. This specification standardises both safety and dispute events on Nostr, enabling:

- **Multi-operator safety** — Emergency signals reach all relevant parties, not just one platform
- **Decentralised emergency response** — Multiple parties (operator, safety contacts, other operators) can respond
- **Transparent dispute resolution** — Every claim, piece of evidence, and ruling is a signed, auditable Nostr event
- **Multiple resolution models** — Operator-mediated, community-voted, mutual, or automated resolution depending on dispute complexity
- **Pattern detection** — Serial bad actors are surfaced through NIP-56 compatible abuse reports with NIP-32 structured labels
- **Privacy-preserving** — Safety contact identities are never revealed to the provider; evidence is NIP-44 encrypted to participants and mediator only

## Depends On

- **TROTT-01**: Core service coordination protocol (state machine, lifecycle events)
- **TROTT-03**: Ratings and reputation (dispute outcomes feed into reputation scores)
- **TROTT-04**: Commitment stakes and payments (dispute resolution triggers fund release/forfeiture)
- **NIP-01**: Basic Nostr protocol
- **NIP-33**: Parameterised replaceable events
- **NIP-44**: Encrypted payloads (for evidence and location data)
- **NIP-56**: Reporting (cross-ecosystem abuse reporting)

## Event Kinds

### Safety Events

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30540 | Emergency Signal | No (append-only) | Either party |
| 30541 | Safety Check-in | Yes (NIP-33) | Either party |
| 30542 | Safety Contact Share | Yes (NIP-33) | Requester |

### Dispute Events

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30543 | Dispute Claim | No (append-only) | Either party |
| 30544 | Dispute Evidence | No (append-only) | Either party / Mediator |
| 30545 | Dispute Resolution | Yes (NIP-33) | Operator / Mediator |
| 30546 | Abuse Report | No (append-only) | Either party / Operator |

---

## Safety Event Structures

### Kind 30540: Emergency Signal

The **panic button** — the highest-priority event in the protocol. Published by either party to signal an immediate safety concern. The event includes encrypted location data and is delivered to the publisher's safety contacts and, where present, the task operator.

```json
{
  "kind": 30540,
  "tags": [
    ["d", "emergency_task_abc123_1698765432"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["severity", "critical"],
    ["triggered_by", "requester"],
    ["e", "<task_event_id>", "<relay>"],
    ["p", "<operator_pubkey>"],
    ["p", "<safety_contact_1_pubkey>"],
    ["p", "<safety_contact_2_pubkey>"],
    ["expiration", "1698769032"]
  ],
  "content": "<NIP-44 encrypted: {\"lat\": 51.5074, \"lon\": -0.1278, \"accuracy_metres\": 5, \"message\": \"Driver has deviated from route and locked doors. I feel unsafe.\"}>"
}
```

**Required tags**: `d`, `severity`, `triggered_by`
**Optional tags**: `domain`, `task_id`, `e` (task reference), `p` (notification targets), `expiration`

The `content` field MUST be NIP-44 encrypted to all `p`-tagged recipients. It contains a JSON object with the signaller's current location and a free-text description. Relays see that an emergency signal exists but cannot read the location or message.

#### Severity Levels

| Severity | Description | Expected Response Time |
|----------|-------------|----------------------|
| `critical` | Immediate danger — physical threat, active emergency | Operator acknowledgement within **60 seconds** |
| `urgent` | Serious concern — route deviation, suspicious behaviour | Operator acknowledgement within **5 minutes** |
| `concern` | Non-emergency unease — uncomfortable situation, request for check-in | Operator acknowledgement within **15 minutes** |

#### Response Requirements

Operators with `safety_monitoring: true` in their service area definition MUST:

1. Acknowledge `critical` signals within **60 seconds**
2. Attempt to contact the signalling party within **90 seconds** of a `critical` signal
3. Contact emergency services (999/911/112) if the party is unreachable within **3 minutes** of a `critical` signal
4. Log all response actions as signed Nostr events for auditability

### Kind 30541: Safety Check-in

A periodic "I'm OK" signal published by a party during an active task. The domain profile defines whether check-ins are required (e.g. security guard dispatch mandates them; ridesharing does not) and at what interval.

```json
{
  "kind": 30541,
  "tags": [
    ["d", "checkin_task_abc123"],
    ["domain", "security"],
    ["task_id", "task_abc123"],
    ["status", "all_clear"],
    ["interval_minutes", "30"],
    ["next_expected", "1698767232"],
    ["check_in_number", "5"],
    ["expiration", "1698767232"]
  ],
  "content": "<NIP-44 encrypted: {\"lat\": 51.5074, \"lon\": -0.1278, \"note\": \"Completed patrol of east perimeter. All quiet.\"}>"
}
```

**Required tags**: `d`, `task_id`, `status`, `interval_minutes`, `next_expected`
**Optional tags**: `domain`, `check_in_number`, `expiration`

This is a parameterised replaceable event (NIP-33) — each new check-in for a task overwrites the previous one, so operators and safety contacts always see the latest check-in status. The `next_expected` tag is a Unix timestamp indicating when the next check-in is due.

#### Check-in Statuses

| Status | Description |
|--------|-------------|
| `all_clear` | Everything is normal |
| `minor_issue` | Non-urgent issue to note (e.g. suspicious activity, minor incident) |
| `needs_assistance` | Requesting operator assistance (non-emergency) |
| `emergency` | Emergency — equivalent to publishing kind 30540 with `severity: critical` |

#### Missed Check-in Escalation

When a check-in is not received by the `next_expected` timestamp, the following escalation procedure applies:

```
1. next_expected passes with no kind 30541 received
2. Operator attempts contact (push notification, message)
3. If no response within 5 minutes: operator alerts safety contacts
4. If no response within 15 minutes: operator contacts emergency services at last known location
5. On late check-in received: escalation stands down, next cycle resumes
```

Domain profiles MAY customise escalation timings and thresholds. The `interval_minutes` tag on the check-in event indicates the expected frequency — implementations SHOULD use this rather than hardcoding intervals.

### Kind 30542: Safety Contact Share

Published by the requester to share live task details with a trusted person. The event is NIP-44 encrypted to the safety contact's pubkey only — the provider never learns who the safety contact is or that sharing is active. The safety contact receives the provider's identity, the route, and live location updates.

```json
{
  "kind": 30542,
  "tags": [
    ["d", "share_task_abc123"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["p", "<safety_contact_pubkey>"],
    ["share_scope", "location,provider_identity,route,eta"],
    ["e", "<task_event_id>", "<relay>"],
    ["expiration", "1698769032"]
  ],
  "content": "<NIP-44 encrypted to safety contact: {\"provider_pubkey\": \"<hex>\", \"provider_name\": \"Sarah\", \"route_summary\": \"Brixton to Kings Cross\", \"eta_minutes\": 25, \"task_created_at\": 1698765432}>"
}
```

**Required tags**: `d`, `task_id`, `p` (safety contact pubkey, at least one)
**Optional tags**: `domain`, `share_scope`, `e` (task reference), `expiration`

The `expiration` tag (NIP-40) MUST be set to the expected task completion time plus a reasonable buffer (e.g. 30 minutes). The sharing event expires automatically after the task ends — safety contacts lose access to location data without any manual revocation step.

#### Share Scope

The `share_scope` tag is a comma-separated list of data categories shared with the safety contact:

| Scope | Description |
|-------|-------------|
| `location` | Real-time location updates (NIP-44 encrypted) |
| `provider_identity` | Provider's pubkey and display name |
| `route` | Planned route summary (origin, destination, waypoints) |
| `eta` | Estimated time of arrival, updated in real time |
| `status` | Task state transitions (matched, en_route, arrived, active, completed) |

#### Privacy Guarantees

- The provider NEVER receives the safety contact's pubkey — the `p` tag is visible on the Nostr event, but the provider's client has no reason to query for kind 30542 events (only the requester publishes them)
- The safety contact receives data encrypted to their pubkey only — even the operator cannot read the content unless they are an explicit `p`-tagged recipient
- Live location updates to safety contacts are sent as **NIP-17 gift-wrapped messages** (NIP-59), hiding both sender and recipient metadata from relays

---

## Dispute Event Structures

### Kind 30543: Dispute Claim

Published by either party to initiate a formal dispute. The claim describes the grievance, the amount in contention (if financial), and requests a specific resolution model.

```json
{
  "kind": 30543,
  "tags": [
    ["d", "dispute_task_abc123"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["e", "<task_event_id>", "<relay>"],
    ["complainant_pubkey", "<hex>"],
    ["accused_pubkey", "<hex>"],
    ["dispute_type", "pricing"],
    ["amount_disputed", "1600"],
    ["currency", "GBP"],
    ["resolution_model", "operator"]
  ],
  "content": "Driver took a route 3x longer than the navigation suggested, inflating the fare from £8 to £24. GPS evidence attached separately."
}
```

**Required tags**: `d`, `complainant_pubkey`, `accused_pubkey`, `dispute_type`, `resolution_model`
**Optional tags**: `domain`, `task_id`, `e` (task reference), `amount_disputed`, `currency`

#### Dispute Types

| Type | Description | Typical Evidence |
|------|-------------|-----------------|
| `no_show` | One party failed to appear after commitment | GPS logs, timestamps, communication records |
| `quality` | Service quality below reasonable standard | Photos, milestone events, completion proof |
| `pricing` | Overcharge, underpayment, or fare manipulation | GPS trace, fare calculation, agreed quote |
| `damage` | Property damage during service | Photos, video, before/after evidence |
| `safety` | Safety incident during or after the task | Emergency signal events, GPS trace, photos |
| `fraud` | Deliberate deception (fake identity, fake completion) | Signed event chains, screenshots, receipts |

#### Resolution Models

| Model | Description | Speed | Trust Assumption |
|-------|-------------|-------|-----------------|
| `operator` | The task operator reviews evidence and issues a ruling | Fast (hours) | Centralised — trust the operator |
| `community` | A panel of 3-5 high-reputation community members votes on the outcome | Medium (24-48h) | Distributed — trust the majority of qualified voters |
| `mutual` | NIP-02 mutual follows of both parties mediate; both parties must accept the mediator | Slow (days) | Social — trust shared social connections |
| `automated` | GPS, timestamp, and signed event evidence triggers an automatic ruling with no human intervention | Instant | Algorithmic — trust the evidence chain |

The `resolution_model` tag is a request, not a mandate. The operator MAY override the requested model based on dispute complexity or policy (e.g. escalating an `automated` dispute to `operator` review if the evidence is ambiguous).

### Kind 30544: Dispute Evidence

Published by either party or the assigned mediator to submit evidence for an open dispute. All evidence is NIP-44 encrypted to the dispute participants (complainant, accused) and the mediator/operator. Evidence is never published in plain text.

```json
{
  "kind": 30544,
  "tags": [
    ["d", "evidence_dispute_task_abc123_001"],
    ["domain", "ridesharing"],
    ["dispute_id", "dispute_task_abc123"],
    ["e", "<dispute_claim_event_id>", "<relay>"],
    ["submitted_by", "<hex_pubkey>"],
    ["evidence_type", "gps_log"],
    ["evidence_hash", "sha256:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2"],
    ["timestamp", "1698765432"],
    ["location_lat", "51.5074"],
    ["location_lon", "-0.1278"],
    ["p", "<complainant_pubkey>"],
    ["p", "<accused_pubkey>"],
    ["p", "<mediator_pubkey>"]
  ],
  "content": "<NIP-44 encrypted to all p-tagged recipients: {\"type\": \"gps_log\", \"data_url\": \"https://evidence.example.com/gps_abc123.json\", \"summary\": \"Route deviation of 4.2km from optimal path. Expected 8.2km, actual 12.4km.\"}>"
}
```

**Required tags**: `d`, `dispute_id`, `e` (dispute claim reference), `submitted_by`, `evidence_type`, `evidence_hash`
**Optional tags**: `domain`, `timestamp`, `location_lat`, `location_lon`, `p` (encrypted recipients)

#### Evidence Types

| Type | Description |
|------|-------------|
| `photo` | Photographic evidence (geotagged where possible) |
| `video` | Video evidence |
| `audio` | Audio recording |
| `gps_log` | GPS trace or location log |
| `screenshot` | Screenshot of relevant communication or interface |
| `message_log` | Communication log between parties |
| `receipt` | Financial receipt, invoice, or payment confirmation |
| `timestamp_proof` | Signed event chain proving timeline of actions |

The `evidence_hash` tag contains a SHA-256 hash of the original evidence file, prefixed with `sha256:`. This allows any party to verify that evidence has not been tampered with after submission, even if the evidence file is stored off-chain (e.g. on IPFS or a private server).

### Kind 30545: Dispute Resolution

Published by the operator, community panel, or mediator to issue a ruling on a dispute. The resolution determines stake outcomes (via TROTT-04) and feeds into reputation scores (via TROTT-03).

```json
{
  "kind": 30545,
  "tags": [
    ["d", "resolution_dispute_task_abc123"],
    ["domain", "ridesharing"],
    ["dispute_id", "dispute_task_abc123"],
    ["e", "<dispute_claim_event_id>", "<relay>"],
    ["ruling", "partial_refund"],
    ["at_fault", "<accused_pubkey>"],
    ["mediator", "<mediator_pubkey>"],
    ["resolution_model", "operator"],
    ["refund_amount", "1600"],
    ["refund_currency", "GBP"],
    ["complainant_stake_outcome", "released"],
    ["accused_stake_outcome", "partial_forfeit"],
    ["forfeit_amount", "1600"],
    ["forfeit_currency", "GBP"],
    ["resolved_at", "1698851832"]
  ],
  "content": "GPS evidence confirms route deviation of 4.2km. Fare adjusted to the optimal route price. Difference refunded to requester from provider's stake."
}
```

**Required tags**: `d`, `dispute_id`, `ruling`, `mediator`, `resolution_model`
**Optional tags**: `domain`, `e` (dispute claim reference), `at_fault`, `refund_amount`, `refund_currency`, `complainant_stake_outcome`, `accused_stake_outcome`, `forfeit_amount`, `forfeit_currency`, `resolved_at`

#### Rulings

| Ruling | Description | Stake Effect |
|--------|-------------|-------------|
| `full_refund` | Complainant receives full refund | Accused stake forfeited; complainant stake released |
| `partial_refund` | Complainant receives partial refund based on evidence | Partial forfeit of accused stake; complainant stake released |
| `no_refund` | Dispute dismissed — insufficient evidence or no fault found | Both stakes released |
| `provider_compensated` | Provider was wronged — compensated from requester's stake | Requester stake forfeited; provider stake released |
| `mutual_release` | No fault found; mutual agreement to release | Both stakes released |
| `task_voided` | Task declared void — as if it never happened | Both stakes released; all associated payment events annulled |

#### Cross-Specification Effects

When a kind 30545 resolution is published:

1. **TROTT-04 (Stakes/Payments)**: The operator publishes corresponding stake release/forfeit events per the ruling's stake outcomes
2. **TROTT-03 (Reputation)**: The resolution outcome is factored into both parties' reputation scores — `at_fault` rulings reduce the at-fault party's score; frivolous claims (dismissed disputes) reduce the complainant's score
3. **Kind 30546 (Abuse Report)**: If the resolution reveals a pattern of misconduct, the operator SHOULD publish an abuse report

### Kind 30546: Abuse Report

An NIP-56 compatible report that surfaces confirmed misconduct to the broader Nostr ecosystem. Includes NIP-32 structured labels for categorisation and pattern detection. Published only after internal verification (dispute resolution, multiple complaints, or automated detection) — never for unverified accusations.

```json
{
  "kind": 30546,
  "tags": [
    ["d", "abuse_report_<accused_pubkey>_1698851832"],
    ["domain", "ridesharing"],
    ["p", "<accused_pubkey>", "fraud"],
    ["e", "<dispute_resolution_event_id>", "<relay>"],
    ["L", "trott-abuse"],
    ["l", "fraud", "trott-abuse"],
    ["l", "serial_offender", "trott-abuse"],
    ["report_type", "fraud"],
    ["incident_count", "3"],
    ["first_incident", "1698000000"],
    ["last_incident", "1698851832"],
    ["resolution_references", "<event_id_1>,<event_id_2>,<event_id_3>"]
  ],
  "content": "Confirmed fare manipulation across 3 tasks over 10 days. GPS evidence in each case shows deliberate route inflation. Dispute resolutions all found provider at fault."
}
```

**Required tags**: `d`, `p` (accused pubkey with NIP-56 report type), `L` (label namespace), `l` (at least one label), `report_type`
**Optional tags**: `domain`, `e` (evidence/resolution references), `incident_count`, `first_incident`, `last_incident`, `resolution_references`

#### NIP-56 Compatibility

The `p` tag's third element uses the standard NIP-56 report type vocabulary (`fraud`, `impersonation`, `other`, etc.), ensuring that any Nostr client supporting NIP-56 can surface the report. The `L` and `l` tags (NIP-32 structured labels) provide TROTT-specific categorisation within the `trott-abuse` namespace.

#### Abuse Label Taxonomy

| Label | Description |
|-------|-------------|
| `fraud` | Deliberate deception for financial gain (fare manipulation, fake completion, identity fraud) |
| `spam` | Repeated frivolous requests, fake availability, or system abuse |
| `harassment` | Verbal abuse, threats, sexual harassment, stalking, or discrimination |
| `safety_violation` | Dangerous behaviour (reckless driving, intoxication, unsafe working conditions) |
| `serial_offender` | Pattern of repeated misconduct across multiple tasks (applied alongside a primary label) |
| `sybil_attack` | Fake accounts used for reputation farming, self-rating, or volume inflation |

#### Pattern Detection

Operators SHOULD monitor for patterns that indicate serial misconduct:

- **3+ disputes** against the same pubkey within 30 days, each resolved with `at_fault` ruling
- **Repeated emergency signals** (kind 30540) naming the same provider across different requesters
- **Anomalous rating patterns** — sudden influx of 5-star ratings from newly created pubkeys (Sybil indicator)
- **Stake forfeiture frequency** — pubkey with no-show forfeitures exceeding 10% of their task history

When a pattern is detected, the operator publishes kind 30546 with the `serial_offender` label alongside the primary abuse category.

#### What NOT to Report as Abuse

Abuse reports are permanent, public, and visible across the Nostr ecosystem. They MUST NOT be used for:

- **Simple disputes resolved normally** — A fare disagreement settled via kind 30545 does not warrant a cross-ecosystem report
- **Low ratings** — A 1-star rating is not abuse; it belongs in TROTT-03 rating events
- **Cancellations** — Requesters and providers cancel for legitimate reasons
- **Unverified accusations** — Reports MUST only be published after internal verification

---

## Resolution Models in Detail

### Operator Resolution

The fastest model. The task operator reviews the evidence and issues a ruling unilaterally.

```
1. Complainant publishes kind 30543 (Dispute Claim) with resolution_model: operator
2. Operator reviews evidence (kind 30544 events)
3. Operator MAY request additional evidence from either party
4. Operator publishes kind 30545 (Dispute Resolution) with ruling
5. Stakes are released/forfeited per the ruling (TROTT-04)
```

**Appropriate for**: Simple disputes with clear evidence (GPS-provable route deviation, timestamped no-show, photo evidence of damage).

**Limitation**: The operator is judge, jury, and executioner. If the operator itself is accused, this model is inappropriate — escalate to `community` or `mutual`.

### Community Resolution

A panel of 3-5 high-reputation community members votes on the outcome. Panellists are selected by the operator from users with:

- Reputation score above a domain-defined threshold (e.g. 4.5+ average across 100+ tasks)
- No relationship with either party (not in either party's NIP-02 follow list)
- Active participation in the domain within the past 90 days

```
1. Complainant publishes kind 30543 with resolution_model: community
2. Operator selects 3-5 qualified panellists
3. Panellists receive encrypted evidence (kind 30544 events, NIP-44 encrypted to each panellist)
4. Each panellist publishes a signed vote (kind 30544 with evidence_type: vote)
5. Operator tallies votes and publishes kind 30545 with the majority ruling
6. Stakes are released/forfeited per the ruling (TROTT-04)
```

**Appropriate for**: Complex disputes where the evidence is ambiguous, or disputes involving high-value stakes.

**Voting threshold**: Simple majority (e.g. 3-of-5 or 2-of-3). Ties result in `mutual_release`.

### Mutual Resolution

Both parties agree on a mediator from their shared social graph. The mediator must appear in the NIP-02 follow lists of both the complainant and the accused (a mutual follow).

```
1. Complainant publishes kind 30543 with resolution_model: mutual
2. Operator identifies mutual follows from both parties' kind 3 events
3. Both parties must accept the mediator (signed acknowledgement)
4. Mediator reviews evidence and publishes kind 30545 with ruling
5. Stakes are released/forfeited per the ruling (TROTT-04)
```

**Appropriate for**: Disputes between parties who share social connections and prefer a trusted human mediator over an operator.

**Fallback**: If no mutual follows exist or neither party accepts a mediator, the dispute escalates to `community` resolution.

### Automated Resolution

GPS, timestamp, and signed event evidence triggers an automatic ruling with no human intervention. This is the fastest resolution model and is appropriate only when objective evidence is sufficient.

```
1. Complainant publishes kind 30543 with resolution_model: automated
2. Operator's automated system evaluates the evidence chain:
   a. GPS trace events (kind 30503 Task Update status transitions)
   b. Timestamps on lifecycle events (kind 30503 in_progress, kind 30504 complete)
   c. Route deviation data (TROTT-07 kind 30562 events, if available)
   d. Check-in records (kind 30541)
3. If evidence meets the threshold for automated ruling:
   → Operator publishes kind 30545 with ruling and resolution_model: automated
4. If evidence is insufficient for automated ruling:
   → Operator escalates to resolution_model: operator
```

**Triggers for automatic rulings**:

| Trigger | Evidence Required | Automatic Ruling |
|---------|-------------------|-----------------|
| No-show (provider) | No kind 30503 (Task Update to `in_progress`) within grace period; requester GPS at location | `full_refund` — provider stake forfeited |
| No-show (requester) | Provider GPS at location; no requester acknowledgement within grace period | `provider_compensated` — requester stake forfeited |
| Route deviation >2x | GPS trace shows actual distance >2x optimal route distance | `partial_refund` — fare adjusted to optimal route price |
| Late arrival | Timestamp on kind 30503 (arrival) exceeds agreed ETA by >2x | `partial_refund` — proportional to delay severity |

---

## Dispute Lifecycle

```
1. Filing       → Complainant publishes kind 30543 (Dispute Claim)
2. Evidence     → Both parties publish kind 30544 (Dispute Evidence)
3. Assignment   → Operator assigns mediator/panel per resolution_model
4. Review       → Mediator/panel/algorithm reviews evidence
5. Ruling       → Mediator publishes kind 30545 (Dispute Resolution)
6. Stake effect → Operator publishes stake release/forfeit events (TROTT-04)
7. Reputation   → Resolution outcome feeds into both parties' TROTT-03 reputation
8. Abuse (if warranted) → Operator publishes kind 30546 if pattern detected
```

### Time Limits

| Phase | Maximum Duration |
|-------|-----------------|
| Evidence submission | 72 hours from filing |
| Operator resolution | 24 hours from evidence deadline |
| Community voting | 48 hours from panel assignment |
| Mutual mediation | 7 days from mediator acceptance |
| Automated resolution | Immediate (within 60 seconds of filing) |

If a resolution is not published within the time limit, the dispute defaults to `mutual_release` — both stakes are released and no party is penalised. This prevents indefinite fund lockup.

---

## Domain Profile Integration

Domain profiles declare safety and dispute parameters:

```json
{
  "safety": {
    "check_in_required": true,
    "check_in_interval_minutes": 30,
    "missed_check_in_escalation_minutes": 5,
    "safety_contact_share_enabled": true,
    "emergency_signal_enabled": true
  },
  "disputes": {
    "resolution_models": ["operator", "community", "automated"],
    "evidence_submission_hours": 72,
    "auto_resolution_enabled": true,
    "community_panel_size": 5,
    "community_min_reputation": 4.5,
    "community_min_tasks": 100
  }
}
```

Domains that do not involve physical co-location (e.g. virtual tutoring) MAY disable check-in requirements and safety contact sharing. Domains with high safety risk (e.g. security guard dispatch, ridesharing) SHOULD require check-ins and enable all safety features.

---

## See Also

- **TROTT-01**: Core — Task lifecycle and state machine
- **TROTT-02**: Discovery — Operator Bond (30511) subject to slashing for proven misconduct
- **TROTT-03**: Reputation — Dispute outcomes feed into reputation scores
- **TROTT-04**: Payments — Dispute resolution triggers stake release/forfeiture
- **TROTT-06**: Coordination — Operator as dispute mediator
- **TROTT-07**: Navigation — Route deviation evidence for automated disputes
- **NIP-01**: Basic Nostr protocol
- **NIP-02**: Follow lists (mutual follow discovery for mutual resolution model)
- **NIP-33**: Parameterised replaceable events
- **NIP-44**: Encrypted payloads (evidence encryption)
- **NIP-56**: Reporting (cross-ecosystem abuse reporting)
- **NIP-32**: Structured labels (abuse categorisation)
