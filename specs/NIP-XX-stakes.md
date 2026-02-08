# NIP-XX-stakes: Commitment Stakes and Escrow

`draft` `optional`

## Abstract

This NIP defines **commitment stakes** — a payment-agnostic escrow mechanism for trust-minimised service coordination. Both parties lock a currency-neutral value before service begins, creating economic incentives for honest behaviour without requiring trust in any single intermediary.

Stakes are the primary trust primitive in the DonkeyRide protocol. They work identically regardless of the underlying payment rail (Lightning hold invoices, fiat escrow, ecash, or smart contracts). Each stake event declares its trust model explicitly, enabling participants to make informed decisions about counterparty risk.

## Motivation

Service coordination between strangers requires a mechanism to prevent ghosting, no-shows, and abandonment. Traditional platforms solve this with reputation alone, but reputation is insufficient for high-value or first-time interactions. Commitment stakes solve this by making misbehaviour economically costly for both parties.

## Depends On

- **NIP-XX-core**: Core service coordination protocol (state machine, lifecycle events)
- **NIP-33**: Parameterised replaceable events
- **NIP-40**: Expiration timestamps

## Event Kinds

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30502 | Stake Lock | Yes (NIP-33) | Operator |
| 30503 | Stake Negotiation | Yes (NIP-33) | Either party |
| 30506 | Milestone Completion | No (append-only) | Provider |
| 30509 | Commitment Stake | Yes (NIP-33) | Requester/Provider |
| 30520 | Stake Release | No (append-only) | Operator |
| 30540 | Operator Bond | Yes (NIP-33) | Operator |

---

## Event Structures

### Kind 30502: Stake Lock

Published by the operator when a commitment stake is locked for one party. One event per party (requester and provider each get their own lock event).

```json
{
  "kind": 30502,
  "tags": [
    ["d", "task_abc123_requester"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["party", "requester"],
    ["amount", "1500"],
    ["currency", "GBP"],
    ["trust_model", "custodial-third-party"],
    ["payment_hash", "a1b2c3d4e5f6..."],
    ["invoice", "lnbc15000n1..."],
    ["mechanism", "hodl_invoice"],
    ["expiration", "1698769032"]
  ],
  "content": ""
}
```

**Required tags**: `d`, `task_id`, `party`, `amount`, `currency`, `trust_model`, `mechanism`
**Optional tags**: `domain`, `payment_hash`, `invoice`, `expiration`

The `mechanism` tag describes the technical implementation:

| Mechanism | Description |
|-----------|-------------|
| `hodl_invoice` | Lightning hold invoice — settled or cancelled by the operator |
| `nip47` | NIP-47 Nostr Wallet Connect hold invoice — settled directly between user wallets |
| `custodial` | Operator holds funds in their own account |
| `escrow` | Third-party escrow service (e.g. Stripe Connect) |
| `ecash` | Cashu or Fedimint ecash token locked in mint |

### Kind 30503: Stake Negotiation

Published by either party to propose or counter-propose stake terms. Enables negotiation before commitment.

```json
{
  "kind": 30503,
  "tags": [
    ["d", "task_abc123_negotiation"],
    ["domain", "locksmith"],
    ["task_id", "task_abc123"],
    ["e", "<previous_negotiation_event_id>", "<relay>"],
    ["proposed_by", "provider"],
    ["requester_stake", "500"],
    ["provider_stake", "750"],
    ["currency", "GBP"],
    ["trust_model", "custodial-escrow"],
    ["message", "Standard lockout rate — drilling may cost more"],
    ["expiration", "1698765732"]
  ],
  "content": ""
}
```

**Required tags**: `d`, `task_id`, `proposed_by`, `requester_stake`, `provider_stake`, `currency`
**Optional tags**: `domain`, `trust_model`, `e` (previous negotiation), `message`, `expiration`

### Kind 30506: Milestone Completion

Published by the provider when a milestone is reached during multi-stage work. Triggers partial stake release.

```json
{
  "kind": 30506,
  "tags": [
    ["d", "task_abc123_milestone_2"],
    ["domain", "emergency_trades"],
    ["task_id", "task_abc123"],
    ["milestone_id", "2"],
    ["milestone_description", "Leak stopped — temporary repair complete"],
    ["amount", "350"],
    ["currency", "GBP"],
    ["trust_model", "custodial-escrow"],
    ["total_milestones", "4"],
    ["photo_proof", "<url_or_hash>"],
    ["customer_ack", "true"]
  ],
  "content": "Emergency water shutoff and temporary pipe repair. Full replacement in milestone 3."
}
```

**Required tags**: `d`, `task_id`, `milestone_id`, `amount`, `currency`
**Optional tags**: `domain`, `trust_model`, `milestone_description`, `total_milestones`, `photo_proof`, `customer_ack`

Milestone escrow works as follows:

1. The total stake is divided across milestones defined by the domain profile
2. Each milestone completion event triggers a partial release of the corresponding portion
3. The customer MAY acknowledge the milestone (`customer_ack` tag) — profiles define whether acknowledgement is required
4. If the provider abandons mid-job, only completed milestones are paid
5. The final milestone releases the remainder of the stake

### Kind 30509: Commitment Stake

Published by either party to signal their willingness to commit a stake. Precedes the operator's lock event.

```json
{
  "kind": 30509,
  "tags": [
    ["d", "task_abc123_provider_commit"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["party", "provider"],
    ["amount", "2000"],
    ["currency", "GBP"],
    ["trust_model", "trustless"],
    ["preferred_mechanism", "nip47"],
    ["wallet_connect", "nostr+walletconnect://<pubkey>?relay=<relay>&secret=<secret>"]
  ],
  "content": ""
}
```

**Required tags**: `d`, `task_id`, `party`, `amount`, `currency`
**Optional tags**: `domain`, `trust_model`, `preferred_mechanism`, `wallet_connect`

### Kind 30520: Stake Release

Published by the operator when a stake is released (on completion) or forfeited (on no-show, misconduct, or dispute resolution).

```json
{
  "kind": 30520,
  "tags": [
    ["d", "task_abc123_requester_release"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["party", "requester"],
    ["amount", "1500"],
    ["currency", "GBP"],
    ["trust_model", "custodial-third-party"],
    ["outcome", "released"],
    ["reason", "completed"],
    ["e", "<stake_lock_event_id>", "<relay>"]
  ],
  "content": ""
}
```

**Required tags**: `d`, `task_id`, `party`, `amount`, `currency`, `outcome`, `reason`
**Optional tags**: `domain`, `trust_model`, `e` (reference to lock event)

The `outcome` tag indicates the financial result:

| Outcome | Description |
|---------|-------------|
| `released` | Full stake returned to the party |
| `forfeited` | Full stake taken as penalty |
| `partial_release` | Portion released (milestone or negotiated settlement) |
| `split` | Stake divided between parties (dispute resolution) |

The `reason` tag provides context:

| Reason | Description |
|--------|-------------|
| `completed` | Service completed successfully |
| `cancelled_mutual` | Both parties agreed to cancel |
| `cancelled_grace` | Cancelled within grace period |
| `no_show` | Party failed to appear — triggers automatic forfeiture |
| `misconduct` | Proven misconduct via dispute resolution |
| `milestone` | Partial release at milestone completion |
| `dispute_resolution` | Stake split per arbiter/guardian ruling |

### Kind 30540: Operator Bond

Published by an operator to demonstrate financial commitment and trustworthiness. Bonds are publicly verifiable and subject to slashing by the guardian network.

```json
{
  "kind": 30540,
  "tags": [
    ["d", "<operator_pubkey>"],
    ["domain", "ridesharing"],
    ["amount", "50000"],
    ["currency", "GBP"],
    ["trust_model", "custodial"],
    ["bond_txid", "a1b2c3d4..."],
    ["bond_address", "bc1q..."],
    ["fee_percent", "5.0"],
    ["service_area", "gcpuuz"],
    ["guardian_threshold", "3/5"],
    ["expiration", "1730000000"]
  ],
  "content": "DonkeyRide London operator — ridesharing and locksmith services"
}
```

**Required tags**: `d` (operator pubkey), `amount`, `currency`
**Optional tags**: `domain`, `trust_model`, `bond_txid`, `bond_address`, `fee_percent`, `service_area`, `guardian_threshold`, `expiration`

---

## Trust Model Taxonomy

Every stake event includes a `trust_model` tag declaring the trust assumptions for that particular interaction. This enables market-driven trust selection — users choose providers based on their risk tolerance.

| Trust Model | Description | Custody | Trustless Stakes |
|-------------|-------------|---------|-----------------|
| `trustless` | User wallet ↔ user wallet via NIP-47. Operator cannot touch funds. | None | Yes |
| `custodial` | Operator holds funds temporarily on their own infrastructure. | Operator | Partial (hodl) |
| `custodial-escrow` | Third party holds funds in escrow until service completion. | Third party | No |
| `custodial-third-party` | Third-party processor holds funds briefly. Operator never has custody. | Processor | No |
| `federated` | Multi-party custody via ecash mint or federation. | Federation | Partial |
| `smart-contract` | Programmatic escrow via smart contract. | Contract | Yes |

---

## NIP-47 Integration

NIP-47 (Nostr Wallet Connect) enables **trustless stake management** by allowing hold invoices directly between user wallets, removing the operator from the custody chain entirely.

### Hold Invoice Lifecycle

The NIP-47 hold invoice methods map directly to the DonkeyRide stake lifecycle:

| NIP-47 Method | DonkeyRide Operation | Kind |
|---------------|---------------------|------|
| `make_hold_invoice` | Lock stake | 30502 |
| `settle_hold_invoice` | Forfeit stake (pay to counterparty) | 30520 |
| `cancel_hold_invoice` | Release stake (return to payer) | 30520 |

### Flow

```
1. Requester's wallet ←NIP-47→ creates hold invoice for stake amount
2. Provider pays the hold invoice (funds locked, not settled)
3. Operator monitors task lifecycle
4. On completion: operator publishes signed completion event
   → Requester's wallet settles the hold invoice (provider gets paid)
5. On cancellation: operator publishes cancellation event
   → Requester's wallet cancels the hold invoice (funds return to provider)
```

The operator's role is reduced to **triggering settlement** by publishing signed lifecycle events. The operator never has custody of funds.

### Fallback

If either party does not support NIP-47, the operator falls back to its configured payment provider (Strike, LND, etc.) with the corresponding trust model declared on the stake events.

---

## No-Show Forfeiture

When the `no_show` terminal state is reached (see NIP-XX-core), the absent party's stake is automatically forfeited:

1. Provider arrives at the task location (state: `provider_arrived`)
2. Grace period expires (configurable, typically 5 minutes)
3. Requester has not appeared
4. Operator transitions task to `no_show` state
5. Operator publishes kind 30520 (Stake Release) with `outcome: forfeited`, `reason: no_show` for the requester's stake
6. Operator publishes kind 30520 with `outcome: released`, `reason: no_show` for the provider's stake

The same logic applies in reverse if the provider fails to arrive — the provider's stake is forfeited and the requester's stake is released.

This is distinct from `cancelled`, which triggers mutual stake release. The separation of `no_show` and `cancelled` as terminal states ensures that stake forfeiture is driven by state, not by parsing reason strings.

---

## Operator Bond Slashing

Operator bonds (kind 30540) are subject to slashing via the guardian network. Guardians are trusted community members who vote on slashing proposals.

### Slashing Process

1. A participant files a complaint against an operator (via kind 30522, Dispute Filing — see NIP-XX-disputes)
2. If the complaint meets the slashing threshold, guardians are notified
3. Guardians vote on the slashing proposal (kinds 30553-30554 — see NIP-XX-disputes)
4. If the required threshold is met (e.g. 3 of 5 guardians), the bond is slashed
5. Slashed funds are distributed to affected participants

The `guardian_threshold` tag on the operator bond event declares the required voting threshold (e.g. `3/5` means 3 of 5 guardians must agree).

---

## Stake Configuration

Operators define stake parameters per domain profile:

```json
{
  "requester_stake_percent": 10,
  "provider_stake_percent": 15,
  "minimum_stake": { "value": 500, "currency": "GBP" },
  "maximum_stake": { "value": 10000, "currency": "GBP" },
  "cancellation_penalty_percent": 50,
  "no_show_penalty_percent": 100,
  "grace_period_seconds": 300,
  "milestones": [
    { "id": "1", "description": "Diagnosis complete", "percent": 20 },
    { "id": "2", "description": "Work complete", "percent": 60 },
    { "id": "3", "description": "Final inspection", "percent": 20 }
  ]
}
```

The `milestones` array is optional — only domain profiles with milestone-based escrow (emergency trades, man with van) define milestones. Profiles without milestones use binary lock/release semantics.

---

## See Also

- **NIP-XX-core**: Core protocol (state machine, lifecycle, payment agnosticism)
- **NIP-XX-disputes**: Dispute resolution, guardian voting, operator accountability
- **NIP-XX-payments**: Streaming payments, tips, and surcharges
- **NIP-47**: Nostr Wallet Connect (trustless hold invoices)
- **docs/PAYMENT-PROVIDERS.md**: Payment provider integration guide
