# NIP-XX-disputes: Dispute Resolution and Operator Accountability

`draft` `optional`

## Abstract

This NIP defines the **dispute resolution protocol** for trust-minimised service coordination — including dispute filing, evidence submission, arbiter assignment, resolution outcomes, guardian voting, and operator accountability mechanisms. It covers the full lifecycle from initial complaint through to bond slashing, with cryptographic evidence chains stored on public Nostr relays for transparency and auditability.

## Motivation

When service coordination breaks down — a provider no-shows, a requester refuses to pay, or an operator withholds stakes — there must be a transparent, auditable process for resolution. Traditional platforms act as judge, jury, and executioner. This protocol distributes dispute resolution across multiple roles (participants, operators, arbiters, guardians) with every decision recorded on Nostr.

## Depends On

- **NIP-XX-core**: Core service coordination protocol (state machine, lifecycle events)
- **NIP-XX-stakes**: Commitment stakes (lock, release, forfeit)
- **NIP-32**: Structured labels (for report categorisation)
- **NIP-33**: Parameterised replaceable events
- **NIP-56**: Reporting (standard Nostr reporting)

## Event Kinds

### Dispute Resolution

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30522 | Dispute Filing | No (append-only) | Either party |
| 30523 | Arbiter Assignment | Yes (NIP-33) | Operator |
| 30524 | Dispute Resolution | Yes (NIP-33) | Operator/Arbiter |

### Operator Trust & Accountability

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30525 | Theft Report | No (append-only) | Anyone |
| 30526 | Watchdog Claim | No (append-only) | Verifier |
| 30527 | Operator Slashing | No (append-only) | Guardian network |

### Abuse Detection

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30549 | Suspicious Activity Report | No (append-only) | Operator |
| 30550 | Account Suspension | Yes (NIP-33) | Operator |
| 30551 | Appeal Request | No (append-only) | Either party |

### Guardian Voting

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30553 | Slashing Proposal | No (append-only) | Any guardian |
| 30554 | Guardian Vote | No (append-only) | Guardian |

---

## Event Structures

### Kind 30522: Dispute Filing

Published by either party to initiate a dispute against the other party or against the operator.

```json
{
  "kind": 30522,
  "tags": [
    ["d", "dispute_xyz789"],
    ["domain", "ridesharing"],
    ["e", "<task_event_id>", "<relay>"],
    ["task_id", "task_abc123"],
    ["complainant_pubkey", "<hex>"],
    ["accused_pubkey", "<hex>"],
    ["dispute_type", "payment"],
    ["amount", "1500"],
    ["currency", "GBP"],
    ["evidence_type", "text,photo,gps_trace"],
    ["evidence", "[{\"type\":\"photo\",\"url\":\"https://...\",\"hash\":\"sha256:...\"}]"]
  ],
  "content": "Driver took a route 3x longer than necessary, inflating the fare from £8 to £24."
}
```

**Required tags**: `d`, `complainant_pubkey`, `accused_pubkey`, `dispute_type`
**Optional tags**: `domain`, `e` (task reference), `task_id`, `amount`, `currency`, `evidence_type`, `evidence`

#### Dispute Types

| Type | Description | Typical Evidence |
|------|-------------|-----------------|
| `payment` | Payment-related dispute (overcharge, non-payment, stake withholding) | Payment events, GPS trace, fare calculation |
| `conduct` | Behavioural misconduct (rudeness, unsafe driving, harassment) | Text description, photos, safety events |
| `safety` | Safety incident (accident, threat, emergency) | GPS trace, emergency alert events, photos |
| `quality` | Service quality dispute (incomplete work, property damage) | Photos, milestone events, completion proof |
| `no_show` | Dispute over no-show determination (was it really a no-show?) | GPS trace, timestamps, communication events |

#### Evidence Types

Evidence is submitted as a JSON array in the `evidence` tag. Each evidence item includes:

```json
[
  {
    "type": "text",
    "content": "Description of what happened"
  },
  {
    "type": "photo",
    "url": "https://storage.example.com/evidence/photo1.jpg",
    "hash": "sha256:abc123..."
  },
  {
    "type": "gps_trace",
    "event_ids": ["<status_update_event_1>", "<status_update_event_2>"],
    "summary": "Route deviated 4.2km from optimal"
  },
  {
    "type": "signed_event_chain",
    "event_ids": ["<event_1>", "<event_2>", "<event_3>"],
    "description": "Sequence of events showing timeline"
  },
  {
    "type": "price_quote",
    "event_id": "<quote_event_id>",
    "agreed_amount": "800",
    "charged_amount": "2400",
    "currency": "GBP"
  }
]
```

### Kind 30523: Arbiter Assignment

Published by the operator to assign an arbiter to a dispute. Arbiters may be the operator themselves, a third-party arbiter, or a guardian.

```json
{
  "kind": 30523,
  "tags": [
    ["d", "dispute_xyz789_arbiter"],
    ["domain", "ridesharing"],
    ["e", "<dispute_filing_event_id>", "<relay>"],
    ["dispute_id", "dispute_xyz789"],
    ["arbiter_pubkey", "<hex>"],
    ["arbiter_type", "operator"],
    ["assigned_at", "1698765432"],
    ["deadline", "1698851832"]
  ],
  "content": ""
}
```

**Required tags**: `d`, `dispute_id`, `arbiter_pubkey`
**Optional tags**: `domain`, `e` (dispute filing reference), `arbiter_type`, `assigned_at`, `deadline`

#### Arbiter Types

| Type | Description |
|------|-------------|
| `operator` | The operator resolves the dispute directly (most common for simple disputes) |
| `third_party` | An independent third-party arbiter (for complex disputes or when the operator is accused) |
| `guardian` | A guardian from the guardian network (for disputes involving the operator's conduct) |
| `automated` | Algorithmic resolution based on objective evidence (e.g. GPS proves no-show) |

### Kind 30524: Dispute Resolution

Published by the assigned arbiter to resolve a dispute. The resolution determines stake outcomes.

```json
{
  "kind": 30524,
  "tags": [
    ["d", "dispute_xyz789_resolution"],
    ["domain", "ridesharing"],
    ["e", "<dispute_filing_event_id>", "<relay>"],
    ["dispute_id", "dispute_xyz789"],
    ["outcome", "partial_refund"],
    ["amount", "800"],
    ["currency", "GBP"],
    ["complainant_stake", "released"],
    ["accused_stake", "partial_forfeit"],
    ["forfeit_amount", "800"],
    ["forfeit_currency", "GBP"],
    ["arbiter_pubkey", "<hex>"],
    ["resolved_at", "1698851832"],
    ["reasoning", "GPS evidence confirms route deviation. Fare adjustment to optimal route price."]
  ],
  "content": "Dispute resolved in favour of complainant. Driver's stake partially forfeited to cover fare difference."
}
```

**Required tags**: `d`, `dispute_id`, `outcome`, `arbiter_pubkey`
**Optional tags**: `domain`, `e`, `amount`, `currency`, `complainant_stake`, `accused_stake`, `forfeit_amount`, `forfeit_currency`, `resolved_at`, `reasoning`

#### Resolution Outcomes

| Outcome | Description | Stake Effect |
|---------|-------------|-------------|
| `refund` | Full refund to complainant | Accused stake forfeited, complainant stake released |
| `partial_refund` | Partial refund based on evidence | Partial forfeit of accused stake |
| `penalty` | Penalty applied to accused party | Accused stake forfeited (may exceed refund) |
| `mutual_cancellation` | No fault found, mutual resolution | Both stakes released |
| `dismissed` | Dispute dismissed (insufficient evidence) | Both stakes released |
| `escalation` | Escalated to higher authority (guardian network) | Stakes held pending escalation |

### Kind 30525: Theft Report

Published by anyone to report suspected operator theft (stake withholding after task completion).

```json
{
  "kind": 30525,
  "tags": [
    ["d", "theft_report_001"],
    ["operator", "<accused_operator_pubkey>"],
    ["task_id", "task_abc123"],
    ["amount", "1500"],
    ["currency", "GBP"],
    ["lock_event", "<stake_lock_event_id>"],
    ["completion_event", "<task_completion_event_id>"],
    ["overdue_seconds", "90000"],
    ["reporter_role", "victim"],
    ["evidence", "<ipfs_hash_or_url>"]
  ],
  "content": "Operator failed to release 1500 GBP stake 25 hours after task completion."
}
```

**Required tags**: `d`, `operator`, `lock_event`, `completion_event`, `overdue_seconds`
**Optional tags**: `task_id`, `amount`, `currency`, `reporter_role`, `evidence`

The `reporter_role` indicates who filed the report:

| Role | Description |
|------|-------------|
| `victim` | The party whose stake was withheld |
| `watchdog` | An independent monitor watching operator behaviour |
| `observer` | A third party who noticed the discrepancy |

### Kind 30526: Watchdog Claim

Published by a verifier after independently confirming a theft report.

```json
{
  "kind": 30526,
  "tags": [
    ["d", "watchdog_claim_001"],
    ["e", "<theft_report_event_id>", "<relay>"],
    ["operator", "<accused_operator_pubkey>"],
    ["verified", "true"],
    ["verifier_pubkey", "<hex>"],
    ["verification_method", "event_chain_audit"],
    ["checked_at", "1698770000"]
  ],
  "content": "Independently verified: lock event exists, completion event exists, no release event found after 25 hours."
}
```

**Required tags**: `d`, `e` (theft report reference), `operator`, `verified`, `verifier_pubkey`
**Optional tags**: `verification_method`, `checked_at`

### Kind 30527: Operator Slashing

Published by the guardian network when consensus is reached to slash an operator's bond.

```json
{
  "kind": 30527,
  "tags": [
    ["d", "slash_operator_001"],
    ["operator", "<operator_pubkey>"],
    ["e", "<theft_report_event_id>", "<relay>"],
    ["slash_amount", "50000"],
    ["slash_currency", "GBP"],
    ["guardian_votes", "4/5"],
    ["proposal_event", "<slashing_proposal_event_id>"],
    ["victims", "<victim1_pubkey>,<victim2_pubkey>"],
    ["distribution", "{\"<victim1>\": 25000, \"<victim2>\": 25000}"]
  ],
  "content": "Operator bond slashed after 4/5 guardian vote. Funds distributed to victims."
}
```

**Required tags**: `d`, `operator`, `slash_amount`, `slash_currency`, `guardian_votes`
**Optional tags**: `e`, `proposal_event`, `victims`, `distribution`

### Kind 30549: Suspicious Activity Report

Published by an operator to flag suspicious behaviour for community awareness.

```json
{
  "kind": 30549,
  "tags": [
    ["d", "suspicious_001"],
    ["domain", "ridesharing"],
    ["p", "<suspicious_pubkey>"],
    ["activity_type", "sybil_attack"],
    ["description", "50 new accounts from same IP range rating same provider"],
    ["confidence", "high"],
    ["evidence", "<json_evidence>"]
  ],
  "content": "Suspected reputation farming operation detected."
}
```

**Required tags**: `d`, `p` (suspicious pubkey), `activity_type`
**Optional tags**: `domain`, `description`, `confidence`, `evidence`

### Kind 30550: Account Suspension

Published by an operator to suspend an account on their platform.

```json
{
  "kind": 30550,
  "tags": [
    ["d", "<suspended_pubkey>_suspension"],
    ["domain", "ridesharing"],
    ["p", "<suspended_pubkey>"],
    ["reason", "safety_violation"],
    ["duration", "permanent"],
    ["e", "<related_event_id>", "<relay>"],
    ["effective_from", "1698765432"]
  ],
  "content": "Account suspended due to verified safety violation."
}
```

**Required tags**: `d`, `p` (suspended pubkey), `reason`
**Optional tags**: `domain`, `duration`, `e`, `effective_from`

> **Note**: Account suspensions are operator-specific. A user suspended by one operator can still use other operators. The suspension event is public, allowing other operators to make informed decisions.

### Kind 30551: Appeal Request

Published by a suspended or penalised party to appeal an operator decision.

```json
{
  "kind": 30551,
  "tags": [
    ["d", "appeal_001"],
    ["domain", "ridesharing"],
    ["e", "<suspension_or_resolution_event_id>", "<relay>"],
    ["appellant_pubkey", "<hex>"],
    ["appeal_type", "suspension"],
    ["defence", "mistaken_identity"],
    ["evidence", "<new_evidence_json>"]
  ],
  "content": "I was not the person involved in this incident. GPS evidence shows I was 50km away at the time."
}
```

**Required tags**: `d`, `e` (appealed decision reference), `appellant_pubkey`, `appeal_type`
**Optional tags**: `domain`, `defence`, `evidence`

### Kind 30553: Slashing Proposal

Published by any guardian to propose slashing an operator's bond.

```json
{
  "kind": 30553,
  "tags": [
    ["d", "slash_proposal_001"],
    ["operator", "<operator_pubkey>"],
    ["e", "<theft_report_event_id>", "<relay>"],
    ["proposed_by", "<guardian_pubkey>"],
    ["slash_amount", "50000"],
    ["slash_currency", "GBP"],
    ["bond_event", "<operator_bond_event_id>"],
    ["threshold", "3/5"],
    ["deadline", "1698851832"],
    ["victims", "<victim1_pubkey>,<victim2_pubkey>"],
    ["distribution_proposal", "{\"<victim1>\": 25000, \"<victim2>\": 25000}"]
  ],
  "content": "Proposing bond slash for verified theft. Evidence: lock event with no corresponding release after 48 hours."
}
```

**Required tags**: `d`, `operator`, `proposed_by`, `slash_amount`, `slash_currency`, `threshold`
**Optional tags**: `e`, `bond_event`, `deadline`, `victims`, `distribution_proposal`

### Kind 30554: Guardian Vote

Published by a guardian to vote on a slashing proposal.

```json
{
  "kind": 30554,
  "tags": [
    ["d", "guardian_vote_001"],
    ["e", "<slashing_proposal_event_id>", "<relay>"],
    ["operator", "<operator_pubkey>"],
    ["guardian_pubkey", "<hex>"],
    ["vote", "approve"],
    ["reasoning", "Evidence is clear — lock event exists, completion event exists, no release after 48h."]
  ],
  "content": ""
}
```

**Required tags**: `d`, `e` (proposal reference), `guardian_pubkey`, `vote`
**Optional tags**: `operator`, `reasoning`

The `vote` tag accepts: `approve` (slash the bond), `reject` (do not slash), `abstain`.

---

## Dispute Lifecycle

```
1. Filing          → Complainant publishes kind 30522 with evidence
2. Assignment      → Operator publishes kind 30523 assigning an arbiter
3. Investigation   → Arbiter reviews evidence from both parties
4. Counter-evidence → Accused may publish additional evidence (kind 30522 with e-tag referencing original)
5. Resolution      → Arbiter publishes kind 30524 with outcome
6. Stake effect    → Operator publishes kind 30520 (Stake Release) per resolution outcome
7. Appeal          → Losing party MAY publish kind 30551 within appeal period
```

### Automated Resolution

Simple disputes with objective evidence MAY be resolved automatically:

- **No-show**: GPS trace proves the provider was not at the location → automatic `no_show` state, stake forfeited
- **Route deviation**: GPS trace shows route was 2x+ optimal → automatic partial refund
- **Late arrival**: Timestamps prove provider arrived after deadline → automatic penalty

Automated resolution publishes the same kind 30524 event with `arbiter_type: automated`.

---

## Guardian Network

Guardians are trusted community members who vote on operator bond slashing proposals. They provide accountability for operators who cannot be disciplined through normal dispute resolution (because the operator IS the accused).

### Guardian Requirements

- Long-term participation in the DonkeyRide ecosystem
- Reputation score above a defined threshold
- Geographic distribution (no single jurisdiction majority)
- Independent of any single operator

### Slashing Process

```
1. Theft detected     → Theft report (kind 30525) published by victim/watchdog
2. Verification       → Independent verifiers confirm (kind 30526), 3-of-5 consensus
3. Proposal           → Any guardian proposes slashing (kind 30553)
4. Voting period      → Guardians vote (kind 30554), typically 24-48 hours
5. Threshold reached  → If threshold met (e.g. 3/5 approve), bond is slashed
6. Execution          → Slashing event published (kind 30527), funds distributed to victims
```

### Incentives

The guardian/verifier incentive structure is designed so that honesty is the only profitable strategy:

- **Watchdogs** earn bounties (percentage of recovered funds) for valid theft reports
- **Verifiers** earn fees for accurate verification, lose stakes for false verification
- **Guardians** earn from operator fees, face reputation penalties for unjust votes
- **False accusers** lose reputation and may face counter-penalties

See `WATCHDOG-INCENTIVES.md` for detailed game-theoretic analysis.

---

## NIP-56 Integration

For cross-ecosystem visibility, dispute-related events SHOULD also be published as standard NIP-56 reports (kind 1984) where appropriate. This ensures that Nostr clients outside the DonkeyRide ecosystem can surface safety-critical information about users.

### When to Publish NIP-56 Reports

Not every dispute warrants a NIP-56 report. Reports SHOULD only be published when internal dispute resolution has confirmed misconduct and the severity justifies cross-ecosystem visibility:

| Trigger | Report Type | Severity |
|---------|------------|----------|
| Confirmed theft (kind 30527 slashing) | `fraud` | Critical |
| Verified harassment (kind 30564 safety alert + resolution) | `impersonation` or content-specific | High |
| Repeated safety violations (3+ kind 30559 alerts) | `other` with description | High |
| Account suspension for misconduct (kind 30550) | Appropriate NIP-56 type | Medium |

### Report Format

Reports SHOULD include both standard NIP-56 tags and DonkeyRide-namespaced NIP-32 labels for structured filtering:

```json
{
  "kind": 1984,
  "tags": [
    ["p", "<reported_pubkey>", "fraud"],
    ["e", "<evidence_event_id>", "other"],
    ["L", "com.donkeyride.report"],
    ["l", "confirmed_theft", "com.donkeyride.report"]
  ],
  "content": "Confirmed operator theft via guardian network vote (4/5). Bond slashed. See kind 30527 event for details."
}
```

The `L` and `l` tags (NIP-32 structured labels) allow Nostr clients to filter DonkeyRide-originated reports specifically. The `p` tag's third element uses the standard NIP-56 report type vocabulary (`fraud`, `impersonation`, `other`, etc.).

### What NOT to Report via NIP-56

NIP-56 reports are permanent, public, and visible across the entire Nostr ecosystem. They SHOULD NOT be used for:

- **Simple disputes resolved normally** — A fare disagreement settled via kind 30524 resolution does not warrant a cross-ecosystem report
- **Low ratings** — A 1-star rating is not a safety issue; it belongs in kind 30517/30518/30530, not kind 1984
- **Cancellations** — Requesters and providers cancel for legitimate reasons; this is normal protocol behaviour
- **Unverified accusations** — Reports MUST only be published after internal verification (guardian vote, arbiter resolution, or automated confirmation). Publishing unverified accusations as NIP-56 reports is itself a form of abuse

Operators who publish frivolous NIP-56 reports risk damaging their own reputation (kind 30528) and may face guardian network scrutiny.

---

## See Also

- **NIP-XX-core**: Core protocol (state machine, lifecycle)
- **NIP-XX-stakes**: Commitment stakes (lock, release, forfeit, operator bonds)
- **NIP-XX-payments**: Payment events (payment disputes reference fare and charge events)
- **NIP-XX-reputation**: Ratings and reputation (anti-gaming, cross-domain portability)
- **NIP-XX-safety**: Safety infrastructure (safety incidents trigger disputes)
- **NIP-32**: Structured labels (report categorisation via NIP-32 namespaced labels)
- **NIP-56**: Reporting (standard Nostr reporting)
- **OPERATOR-MISBEHAVIOR-PROTOCOL.md**: Detailed theft detection and enforcement mechanisms
- **WATCHDOG-INCENTIVES.md**: Game-theoretic analysis of watchdog and verifier incentives
