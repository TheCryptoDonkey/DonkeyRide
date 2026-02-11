# TROTT Protocol — Quick Reference

**Trusted Real-world Orchestration of Tasks & Trades**

**Protocol Version**: v4.0 (Payment-Agnostic, Modular TROTT Specs)
**Event Kind Range**: 20500-20502 (ephemeral) + 30500-30567 (core) + 30600-30779 (domain extensions)
**Last Updated**: 2026-02-11

---

## Specification Structure

The protocol is organised as a **family of 8 focused specifications**. Each spec stands alone and can be implemented independently. Domain profiles declare which specs they use.

### TROTT Specifications

| Spec | Kinds | Scope |
|------|-------|-------|
| **[TROTT-01: Core](./TROTT-01-core.md)** | 30500-30509 | Task lifecycle, state machine, scheduling, multi-provider, multi-leg, recurring. The minimum viable protocol. |
| **[TROTT-02: Discovery](./TROTT-02-discovery.md)** | 20500, 30510-30513 | Provider availability, geohash search, skill search, trusted provider networks, requester profiles. |
| **[TROTT-03: Reputation](./TROTT-03-reputation.md)** | 30520-30522 | Ratings, trust weighting, credentials, cross-domain reputation portability. |
| **[TROTT-04: Payments](./TROTT-04-payments.md)** | 30530-30538 | Quotes, escrow, streaming, milestones, split payments, tipping, earnings. Currency-neutral. Payment-provider-agnostic. |
| **[TROTT-05: Safety](./TROTT-05-safety.md)** | 30540-30547 | Emergency signals, safety check-ins, dispute resolution, abuse reporting, media attachments. |
| **[TROTT-06: Coordination](./TROTT-06-coordination.md)** | 30550-30555 | Operator participation, PII handling, compliance, delegation, compliance snapshots. **Optional.** |
| **[TROTT-07: Navigation](./TROTT-07-navigation.md)** | 20501, 30560-30563 | Routing, ETA, live tracking, route deviation alerts. **Optional.** |
| **[TROTT-08: Messaging](./TROTT-08-messaging.md)** | 20502, 30564-30567 | Task chat, read receipts, typing indicators, task archive, user preferences. **Optional.** |

### Domain Profile Specifications

| Domain | Kind Range | Coordination Pattern |
|--------|-----------|---------------------|
| **[Ridesharing](./domains/ridesharing.md)** | 30600-30619 | Trip |
| **[Locksmith](./domains/locksmith.md)** | 30620-30639 | Dispatch |
| **[Delivery](./domains/delivery.md)** | 30640-30659 | Relay delivery |
| **[Towing](./domains/towing.md)** | 30660-30679 | Dispatch + Trip |
| **[Emergency Trades](./domains/emergency-trades.md)** | 30680-30699 | Dispatch |
| **[Pet Services](./domains/pet-services.md)** | 30700-30719 | Scheduled |
| **[Security](./domains/security.md)** | 30720-30739 | Shift / Patrol |
| **[Cleaning](./domains/cleaning.md)** | 30740-30759 | Scheduled / Recurring |
| **[Moving](./domains/moving.md)** | 30760-30779 | Crew / Multi-provider |

### Which Specs Does Each Domain Use?

| Domain | 01 Core | 02 Discovery | 03 Reputation | 04 Payments | 05 Safety | 06 Coordination | 07 Navigation | 08 Messaging |
|--------|---------|-------------|---------------|-------------|-----------|-----------------|---------------|--------------|
| Ridesharing | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Locksmith | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Delivery | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Towing | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Emergency Trades | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Pet Services | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Security | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Cleaning | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Moving | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## Core Event Kinds

All domains share these kinds. The `domain` tag identifies which extension applies.

### TROTT-01: Core — Task Lifecycle

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30500 | Task Request | Yes (NIP-33) | Requester |
| 30501 | Task Offer | Yes (NIP-33) | Provider |
| 30502 | Task Accept | Yes (NIP-33) | Either party |
| 30503 | Task Update | Yes (NIP-33) | Provider / Operator |
| 30504 | Task Complete | Yes (NIP-33) | Provider |
| 30505 | Task Confirm | Yes (NIP-33) | Requester |
| 30506 | Task Cancel | Yes (NIP-33) | Either party |
| 30507 | Task Dispute | Yes (NIP-33) | Either party |
| 30508 | Leg Plan | Yes (NIP-33) | Requester / Operator |
| 30509 | Recurring Series | Yes (NIP-33) | Operator |

### TROTT-02: Discovery

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 20500 | Provider Availability | No (ephemeral) | Provider |
| 30510 | Provider Profile | Yes (NIP-33) | Provider |
| 30511 | Operator Bond | Yes (NIP-33) | Operator |
| 30512 | Trusted Provider List | Yes (NIP-33) | Requester |
| 30513 | Requester Profile | Yes (NIP-33) | Requester |

### TROTT-03: Reputation

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30520 | Task Rating | Yes (NIP-33) | Either party |
| 30521 | Reputation Query | Yes (NIP-33) | Anyone |
| 30522 | Credential Attestation | Yes (NIP-33) | Issuer |

### TROTT-04: Payments

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30530 | Quote | Yes (NIP-33) | Provider |
| 30531 | Payment Terms | Yes (NIP-33) | Either / Operator |
| 30532 | Stake Lock | Yes (NIP-33) | Operator |
| 30533 | Stake Release | No (append-only) | Operator |
| 30534 | Stake Forfeit | No (append-only) | Operator |
| 30535 | Payment Receipt | No (append-only) | Operator / Provider |
| 30536 | Streaming Tick | No (append-only) | Requester / Operator |
| 30537 | Task Tip | No (append-only) | Requester |
| 30538 | Earnings Summary | Yes (NIP-33) | Operator |

### TROTT-05: Safety & Disputes

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30540 | Emergency Signal | No (append-only) | Either party |
| 30541 | Safety Check-in | Yes (NIP-33) | Either party |
| 30542 | Safety Contact Share | Yes (NIP-33) | Requester |
| 30543 | Dispute Claim | No (append-only) | Either party |
| 30544 | Dispute Evidence | No (append-only) | Either / Mediator |
| 30545 | Dispute Resolution | Yes (NIP-33) | Operator / Mediator |
| 30546 | Abuse Report | No (append-only) | Either / Operator |
| 30547 | Media Attachment | No (append-only) | Either party |

### TROTT-06: Coordination (Optional)

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30550 | Operator Claim | Yes (NIP-33) | Operator |
| 30551 | PII Envelope | No (append-only) | Operator |
| 30552 | Delegation Grant | Yes (NIP-33) | Either party |
| 30553 | Compliance Record | No (append-only) | Operator |
| 30554 | Operator Heartbeat | Yes (NIP-33) | Operator |
| 30555 | Compliance Snapshot | No (append-only) | Operator |

### TROTT-07: Navigation (Optional)

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 20501 | Location Update | No (ephemeral) | Provider |
| 30560 | Route Summary | Yes (NIP-33) | Operator / Provider |
| 30561 | ETA Update | Yes (NIP-33) | Operator / Provider |
| 30562 | Route Deviation | No (append-only) | Operator |
| 30563 | Navigation Resource | Yes (NIP-33) | Anyone |

### TROTT-08: Messaging & Personal Data (Optional)

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 20502 | Typing Indicator | No (ephemeral) | Either party |
| 30564 | Task Message | No (append-only) | Either party |
| 30565 | Message Status | Yes (NIP-33) | Recipient |
| 30566 | Task Archive Entry | Yes (NIP-33) | Either party |
| 30567 | User Preferences | Yes (NIP-33) | Either party |

**Total: 51 event kinds** (33 parameterised replaceable + 15 append-only + 3 ephemeral)

---

## Core State Machine

```
requested → offers_open → accepted → in_progress → completed → confirmed
    │           │              │           │             │
    │           │              │           │             ├─→ disputed
    │           │              │           │
    │           │              │           ├─→ no_show
    └───────────┴──────────────┴───────────┴─────────────→ cancelled
```

**Terminal states**: `confirmed`, `no_show`, `cancelled`

- `confirmed` — Requester confirms completion. Stakes released. Ratings may follow.
- `no_show` — One party failed to appear. Absent party's stake forfeited.
- `cancelled` — Cancellation. Stakes released (within grace period) or cancelling party penalised.

**Intermediate state**: `disputed` — Escalated to TROTT-05 dispute resolution. **Not terminal**: resolves to `confirmed`, `cancelled`, or `no_show`.

Domain profiles MAY insert sub-states within `in_progress` (e.g. `provider_en_route → provider_arrived → trip_active` for ridesharing).

---

## Common Tags

| Tag | Description | Example |
|-----|-------------|---------|
| `d` | Unique task identifier (NIP-33) | `["d", "task_abc123"]` |
| `domain` | Service domain identifier | `["domain", "ridesharing"]` |
| `status` | Current task state | `["status", "in_progress"]` |
| `t` | Protocol tag (always `trott-task`) | `["t", "trott-task"]` |
| `amount` | Value in the specified currency | `["amount", "1500"]` |
| `currency` | ISO 4217 fiat or crypto code | `["currency", "GBP"]` |
| `trust_model` | Payment trust model | `["trust_model", "operator-escrow"]` |
| `expiration` | Event expiration time (NIP-40) | `["expiration", "1698769032"]` |
| `linked_task` | Reference to a related task | `["linked_task", "<task_id>", "follow_up"]` |
| `g` | Geohash for location discovery | `["g", "gcpuuz"]` |
| `p` | Pubkey reference | `["p", "<hex>"]` |

---

## Kind Range Allocation

| Range | Purpose | Spec |
|-------|---------|------|
| 20500-20502 | Ephemeral events (availability, location, typing) | TROTT-02, TROTT-07, TROTT-08 |
| 30500-30509 | Core task lifecycle, multi-leg, recurring | TROTT-01 |
| 30510-30513 | Discovery, requester profiles | TROTT-02 |
| 30514-30519 | Reserved (future discovery/core) | — |
| 30520-30522 | Reputation | TROTT-03 |
| 30523-30529 | Reserved (future reputation) | — |
| 30530-30538 | Payments, tipping, earnings | TROTT-04 |
| 30539 | Reserved (future payments) | — |
| 30540-30547 | Safety, disputes, media | TROTT-05 |
| 30548-30549 | Reserved (future safety) | — |
| 30550-30555 | Coordination, compliance | TROTT-06 |
| 30556-30559 | Reserved (future coordination) | — |
| 30560-30563 | Navigation | TROTT-07 |
| 30564-30567 | Messaging & personal data | TROTT-08 |
| 30568-30599 | Reserved (future core expansion) | — |
| 30600-30619 | Ridesharing extension | TROTT-ridesharing |
| 30620-30639 | Locksmith extension | TROTT-locksmith |
| 30640-30659 | Delivery extension | TROTT-delivery |
| 30660-30679 | Towing extension | TROTT-towing |
| 30680-30699 | Emergency trades extension | TROTT-emergency-trades |
| 30700-30719 | Pet services extension | TROTT-pet-services |
| 30720-30739 | Security guard dispatch extension | TROTT-security |
| 30740-30759 | Cleaning extension | TROTT-cleaning |
| 30760-30779 | Moving extension | TROTT-moving |
| 30780-30999 | Reserved for future domains | — |

---

## Implementation Tiers

### Tier 1: Minimal P2P (14 kinds)

| Category | Kinds | Count |
|----------|-------|-------|
| Task lifecycle (TROTT-01) | 30500-30507 | 8 |
| Discovery (TROTT-02) | 20500, 30510-30512 | 4 |
| Reputation (TROTT-03) | 30520 | 1 |
| Safety (TROTT-05) | 30540 | 1 |
| **Total** | | **14** |

### Tier 2: + Payments & Full Reputation (23 kinds)

Add TROTT-04 (30530-30538) for payment flows including tipping and earnings summaries, plus TROTT-03 (30521-30522) for reputation queries and credentials.

### Tier 3: + Safety & Disputes (31 kinds)

Add TROTT-05 (30541-30547) for check-ins, disputes, abuse reporting, and media attachments.

### Tier 4: Full Operator (51 kinds)

Add TROTT-06 (30550-30555) for operator coordination and compliance snapshots, TROTT-07 (20501, 30560-30563) for navigation, and TROTT-08 (20502, 30564-30567) for messaging, task archives, and user preferences.

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

            TROTT-08: Messaging (optional, depends on TROTT-01)
```

---

## Referenced NIPs

| NIP | Name | Usage |
|-----|------|-------|
| NIP-01 | Basic Protocol Flow | Event format, relay communication |
| NIP-02 | Contact List / Follow List | Social discovery, WoT-weighted reputation |
| NIP-17/59 | Private Messages (Gift Wrap) | PII exchange, emergency contact notifications |
| NIP-32 | Structured Labels | Provider verification labels, domain categorisation |
| NIP-33 | Parameterised Replaceable Events | All replaceable events use `d` tags |
| NIP-40 | Expiration Timestamp | `["expiration", "<unix>"]` on time-limited events |
| NIP-44 | Encrypted Payloads | Private coordination messages, PII |
| NIP-47 | Nostr Wallet Connect | Trustless stake management via hold invoices |
| NIP-56 | Reporting | Cross-ecosystem safety reporting |
| NIP-57 | Lightning Zaps | Tips as standard Nostr zaps |
| NIP-58 | Badges | Verification credentials |
| NIP-60 | Wallet Sync | Cashu token storage and synchronisation |
| NIP-89 | App Handlers | Operator service declaration |
| NIP-94 | File Metadata | Media attachment metadata guidance |

---

## Additional Resources

### TROTT Specifications
- **Core**: [TROTT-01-core.md](./TROTT-01-core.md)
- **Discovery**: [TROTT-02-discovery.md](./TROTT-02-discovery.md)
- **Reputation**: [TROTT-03-reputation.md](./TROTT-03-reputation.md)
- **Payments**: [TROTT-04-payments.md](./TROTT-04-payments.md)
- **Safety**: [TROTT-05-safety.md](./TROTT-05-safety.md)
- **Coordination**: [TROTT-06-coordination.md](./TROTT-06-coordination.md)
- **Navigation**: [TROTT-07-navigation.md](./TROTT-07-navigation.md)
- **Messaging**: [TROTT-08-messaging.md](./TROTT-08-messaging.md)

### Domain Profiles
- **Ridesharing**: [domains/ridesharing.md](./domains/ridesharing.md)
- **Locksmith**: [domains/locksmith.md](./domains/locksmith.md)
- **Delivery**: [domains/delivery.md](./domains/delivery.md)
- **Towing**: [domains/towing.md](./domains/towing.md)
- **Emergency Trades**: [domains/emergency-trades.md](./domains/emergency-trades.md)
- **Pet Services**: [domains/pet-services.md](./domains/pet-services.md)
- **Security**: [domains/security.md](./domains/security.md)
- **Cleaning**: [domains/cleaning.md](./domains/cleaning.md)
- **Moving**: [domains/moving.md](./domains/moving.md)

### Migration Guides
- **Ridestr**: [migration-guides/ridestr.md](./migration-guides/ridestr.md)

### Documentation
- **Protocol Design**: [../docs/plans/2026-02-10-trott-protocol-design.md](../docs/plans/2026-02-10-trott-protocol-design.md)
- **Architecture**: [../ARCHITECTURE.md](../ARCHITECTURE.md)
- **Trust Mechanisms**: [../TRUST-MECHANISMS.md](../TRUST-MECHANISMS.md)
- **Payment Providers**: [../docs/PAYMENT-PROVIDERS.md](../docs/PAYMENT-PROVIDERS.md)
- **GDPR Compliance**: [../docs/GDPR-COMPLIANCE.md](../docs/GDPR-COMPLIANCE.md)
- **Use Case State Machines**: [../docs/USE-CASE-STATE-MACHINES.md](../docs/USE-CASE-STATE-MACHINES.md)
- **Original Spec (Archive)**: [archive/NIP-XX-v1-archive.md](./archive/NIP-XX-v1-archive.md)
