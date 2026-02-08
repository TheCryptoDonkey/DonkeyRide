# DonkeyRide Protocol — Quick Reference

**Protocol Version**: v3.0 (Payment-Agnostic, Modular NIPs)
**Event Kind Range**: 30500-30599 (primary) + 30600-30639 (domain extensions)
**Last Updated**: 2026-02-08

---

## Specification Structure

The protocol is organised as a **family of focused specifications**. Each NIP stands alone and can be implemented independently. Domain profiles declare which NIPs they use.

### Modular NIP Specifications

| Spec | Kinds | Scope |
|------|-------|-------|
| **[NIP-XX-core](./NIP-XX-core.md)** | 30500-30512 | Service request, acceptance, status updates, completion, cancellation. The minimum viable protocol. Currency-neutral. |
| **[NIP-XX-stakes](./NIP-XX-stakes.md)** | 30502-30503, 30506, 30509, 30520, 30540 | Commitment stakes — lock, negotiate, milestone, release, forfeit. Trust model tags. Payment-provider-agnostic. |
| **[NIP-XX-reputation](./NIP-XX-reputation.md)** | 30517-30519, 30521, 30528, 30530 | Ratings, reputation summaries, cross-domain portability. References NIP-85 for computed summaries, NIP-58 for badges. |
| **[NIP-XX-disputes](./NIP-XX-disputes.md)** | 30522-30527, 30549-30554 | Disputes, resolutions, theft reports, guardian voting, operator slashing, abuse detection. |
| **[NIP-XX-discovery](./NIP-XX-discovery.md)** | 30540, 30565, 20500 | Service areas, operator bonds, provider availability. Geohash-based discovery. References NIP-89 for app handlers. |
| **[NIP-XX-safety](./NIP-XX-safety.md)** | 30559-30564 | Emergency alerts, trip sharing, safety check-ins, heartbeat protocol, harassment reports. |
| **[NIP-XX-navigation](./NIP-XX-navigation.md)** | 30583-30587 | Routes, turn-by-turn navigation, traffic alerts, reroutes. |
| **[NIP-XX-payments](./NIP-XX-payments.md)** | 30510-30511, 30513-30516, 30523 | Streaming payments, tips, surcharges, no-show fees. Currency-neutral. References NIP-57 for zap-based tips. |

### Domain Extension Specifications

| Spec | Kind Range | Domain |
|------|-----------|--------|
| **[NIP-XX-ridesharing](./NIP-XX-ridesharing.md)** | 30570-30599 | Ridesharing: vehicle tracking, surge pricing, driver management |
| **[NIP-XX-locksmith](./NIP-XX-locksmith.md)** | 30600-30619 | Locksmith: quote negotiation, access methods, workmanship |
| **[NIP-XX-delivery](./NIP-XX-delivery.md)** | 30620-30639 | Delivery: chain of custody, photo proofs, package tracking |
| **[NIP-XX-v1-archive](./NIP-XX-v1-archive.md)** | — | Archive: original monolithic 82-kind spec (preserved for reference) |

### Which NIPs Does Each Domain Use?

| Domain | core | stakes | reputation | disputes | discovery | safety | navigation | payments |
|--------|------|--------|------------|----------|-----------|--------|------------|----------|
| Ridesharing | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Locksmith | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Delivery | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Court serving | ✅ | — | ✅ | — | ✅ | — | ✅ | — |
| Security guard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Emergency trades | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## Core Event Kinds

All domains share these kinds. The `domain` tag identifies which extension applies.

### Task Lifecycle (NIP-XX-core)

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30500 | Service Request | Yes | Requester |
| 30501 | Service Acceptance | Yes | Provider |
| 30504 | Service Confirmation | Yes | Operator |
| 30506 | Service Cancellation | No | Either |
| 30507 | Service Start | Yes | Provider |
| 30508 | Service End | Yes | Provider |
| 30512 | Status Update | Yes | Provider/Operator |

### Stake Management (NIP-XX-stakes)

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30502 | Stake Lock | Yes | Operator |
| 30503 | Stake Negotiation | Yes | Either |
| 30506 | Milestone Completion | No | Provider |
| 30509 | Commitment Stake | Yes | Either |
| 30520 | Stake Release | No | Operator |
| 30540 | Operator Bond | Yes | Operator |

> **Note**: Kind 30506 is shared between Service Cancellation (NIP-XX-core) and Milestone Completion (NIP-XX-stakes). Implementations distinguish by the presence of `milestone_id` tag.

### Payments (NIP-XX-payments)

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30510 | Streaming Payment | No | Requester |
| 30511 | Payment Confirmation | Yes | Operator |
| 30513 | Provider Tip | No | Requester |
| 30514 | Wait Time Charge | No | Provider |
| 30515 | No-Show Fee | No | Provider/Operator |
| 30516 | Additional Charge | No | Provider |
| 30523 | Payment Failure | No | Provider/Operator |

### Trust & Reputation (NIP-XX-reputation)

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30517 | Provider Rating | No | Requester |
| 30518 | Requester Rating | No | Provider |
| 30519 | Reputation Summary | Yes | Anyone |
| 30521 | Reputation Export/Import | Yes | Anyone |
| 30528 | Operator Reputation | Yes | Anyone |
| 30530 | Reputation Rating | No | Either |

### Dispute Resolution (NIP-XX-disputes)

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30522 | Dispute Filing | No | Either |
| 30523 | Arbiter Assignment | Yes | Operator |
| 30524 | Dispute Resolution | Yes | Operator/Arbiter |
| 30525 | Theft Report | No | Anyone |
| 30526 | Watchdog Claim | No | Verifier |
| 30527 | Operator Slashing | No | Guardian network |

### Guardian Voting (NIP-XX-disputes)

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30553 | Slashing Proposal | No | Guardian |
| 30554 | Guardian Vote | No | Guardian |

### Abuse Detection (NIP-XX-disputes)

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30549 | Suspicious Activity Report | No | Operator |
| 30550 | Account Suspension | Yes | Operator |
| 30551 | Appeal Request | No | Either |

### Safety & Emergency (NIP-XX-safety)

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30559 | Emergency Alert | No | Either |
| 30560 | Task Sharing | Yes | Requester |
| 30561 | Safety Check-In Request | No | Operator |
| 30562 | Safety Check-In Response | No | Either |
| 30563 | Safety Check-In Escalation | No | Operator |
| 30564 | Harassment Report | No | Either |

### Discovery (NIP-XX-discovery)

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30565 | Service Area Definition | Yes | Operator |
| 20500 | Provider Availability (ephemeral) | No | Provider |

### Navigation (NIP-XX-navigation)

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30583 | Route Suggestion | Yes | Operator |
| 30584 | Turn-by-Turn Navigation | No | Operator |
| 30585 | Traffic Alert | No | Operator |
| 30586 | Reroute Request | No | Provider |
| 30587 | Navigation Feedback | No | Requester |

---

## Core State Machine

```
requested → matched → provider_en_route → provider_arrived → [domain states] → active → completed
    │           │              │                    │                              │
    │           │              │                    ├──────────────────────────────→ no_show
    └───────────┴──────────────┴────────────────────┴──────────────────────────────→ cancelled
```

**Terminal states**: `completed`, `no_show`, `cancelled`

- `completed` — Service finished successfully. Both stakes released.
- `no_show` — One party failed to appear. Absent party's stake forfeited.
- `cancelled` — Mutual cancellation. Both stakes released (within grace period) or cancelling party penalised (after grace period).

---

## Common Tags

| Tag | Description | Example |
|-----|-------------|---------|
| `d` | Unique identifier (NIP-33) | `["d", "task_abc123"]` |
| `domain` | Service domain identifier | `["domain", "ridesharing"]` |
| `amount` | Value in the specified currency | `["amount", "1500"]` |
| `currency` | ISO 4217 fiat or crypto code | `["currency", "GBP"]` |
| `trust_model` | Payment provider trust model | `["trust_model", "custodial-escrow"]` |
| `expiration` | Event expiration time (NIP-40) | `["expiration", "1698769032"]` |
| `linked_task` | Reference to a related task | `["linked_task", "<task_id>", "follow_up"]` |
| `requester_pubkey` | Requester's Nostr pubkey | `["requester_pubkey", "<hex>"]` |
| `provider_pubkey` | Provider's Nostr pubkey | `["provider_pubkey", "<hex>"]` |
| `g` | Geohash for location discovery | `["g", "gcpuuz"]` |

---

## Kind Range Allocation

| Range | Domain | Status |
|-------|--------|--------|
| 30500-30529 | Core protocol + stakes + payments | Active |
| 30530-30549 | Reputation + compliance | Active |
| 30549-30569 | Safety, abuse, discovery | Active |
| 30570-30599 | Ridesharing extension | Active |
| 30600-30619 | Locksmith extension | Reserved |
| 30620-30639 | Delivery extension | Reserved |
| 20500 | Provider availability (ephemeral) | Active |

---

## Minimum Viable Operator

| Category | Kinds | Count |
|----------|-------|-------|
| Task lifecycle | 30500, 30501, 30506, 30507, 30508, 30512 | 6 |
| Stakes | 30502, 30520 | 2 |
| Payments | 30510, 30511 | 2 |
| Trust | 30517, 30518, 30519 | 3 |
| Safety | 30559 | 1 |
| **Total** | | **14** |

---

## Referenced NIPs

| NIP | Name | Usage |
|-----|------|-------|
| NIP-33 | Parameterised Replaceable Events | All replaceable events use `d` tags |
| NIP-40 | Expiration Timestamp | `["expiration", "<unix>"]` on time-limited events |
| NIP-44 | Encrypted Payloads | Private coordination messages |
| NIP-17/59 | Private Messages (Gift Wrap) | PII exchange, emergency contact notifications |
| NIP-47 | Nostr Wallet Connect | Trustless stake management via hold invoices |
| NIP-57 | Lightning Zaps | Tips as standard Nostr zaps |
| NIP-58 | Badges | Verification credentials |
| NIP-85 | Trusted Assertions | Computed reputation summaries |
| NIP-89 | App Handlers | Operator service declaration |

---

## Additional Resources

### Modular Specifications
- **Core**: [NIP-XX-core.md](./NIP-XX-core.md)
- **Stakes**: [NIP-XX-stakes.md](./NIP-XX-stakes.md)
- **Reputation**: [NIP-XX-reputation.md](./NIP-XX-reputation.md)
- **Disputes**: [NIP-XX-disputes.md](./NIP-XX-disputes.md)
- **Discovery**: [NIP-XX-discovery.md](./NIP-XX-discovery.md)
- **Safety**: [NIP-XX-safety.md](./NIP-XX-safety.md)
- **Navigation**: [NIP-XX-navigation.md](./NIP-XX-navigation.md)
- **Payments**: [NIP-XX-payments.md](./NIP-XX-payments.md)

### Domain Extensions
- **Ridesharing**: [NIP-XX-ridesharing.md](./NIP-XX-ridesharing.md)
- **Locksmith**: [NIP-XX-locksmith.md](./NIP-XX-locksmith.md)
- **Delivery**: [NIP-XX-delivery.md](./NIP-XX-delivery.md)

### Documentation
- **Architecture**: [../ARCHITECTURE.md](../ARCHITECTURE.md)
- **Trust Mechanisms**: [../TRUST-MECHANISMS.md](../TRUST-MECHANISMS.md)
- **Payment Providers**: [../docs/PAYMENT-PROVIDERS.md](../docs/PAYMENT-PROVIDERS.md)
- **GDPR Compliance**: [../docs/GDPR-COMPLIANCE.md](../docs/GDPR-COMPLIANCE.md)
- **Use Case State Machines**: [../docs/USE-CASE-STATE-MACHINES.md](../docs/USE-CASE-STATE-MACHINES.md)
- **Original Spec (Archive)**: [NIP-XX-v1-archive.md](./NIP-XX-v1-archive.md)
