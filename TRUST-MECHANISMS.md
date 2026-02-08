# Solving the Escrow Trust Problem

## The Critical Question

**"What stops an operator from running away with everyone's stakes?"**

This is the most important question for DonkeyRide. If operators can steal funds, the system fails.

## The Trust Problem

```
Requester stakes £10.00
Provider stakes £15.00
Operator holds £25.00
───────────────────────
Total at risk: £25.00

Multiply by 1,000 active tasks:
Operator holds: £25,000

Temptation: Shut down and keep the money
```

But this problem only arises under **custodial** trust models. With NIP-47 (trustless), the operator never has custody at all. The trust mechanisms below address the full spectrum — from fully trustless to custodial arrangements.

## Trust Model Transparency

Before examining the defence layers, understand that every payment event in the protocol declares its trust model via the `trust_model` tag. Users see exactly what trust assumptions apply:

| Provider | Trust Model | Custody | Stake Safety |
|----------|------------|---------|--------------|
| NIP-47 (hold invoices) | `trustless` | None — user wallets only | Operator cannot touch funds |
| Strike | `custodial-third-party` | Strike holds briefly | Operator never has custody |
| Stripe Escrow | `custodial-escrow` | Stripe holds in escrow | Operator never has custody |
| LND (operator node) | `custodial` | Operator's Lightning node | Layers 1-6 apply |
| Cashu | `federated` | Ecash mint | Multi-party custody |
| Fedimint | `federated` | Federation | Multi-sig custody |
| PayPal | `custodial-third-party` | PayPal | Operator never has custody |

**Key insight:** For `trustless` and `custodial-third-party` models, the operator physically cannot steal funds. The trust layers below are most critical for `custodial` models where the operator does hold funds.

## Multi-Layered Solution

No single mechanism solves this. We need **defence in depth**:

```
Layer 1: Reputation (Social trust)           — NIP-85 summaries, NIP-58 badges
Layer 2: Bonds (Financial stake)             — Nostr-published, slashable
Layer 3: Insurance (Coverage)                — Shared risk pool
Layer 4: Progressive Limits (Minimise exposure) — Currency-neutral limits
Layer 5: Multi-Sig (Distributed trust)       — Fedimint, multi-party custody
Layer 6: Trustless (Zero trust)              — NIP-47 hold invoices
```

---

## Layer 1: Reputation System

### How It Works

Every stake operation is published to Nostr as cryptographically signed events:

```json
{
  "kind": 30502,
  "pubkey": "<operator-pubkey>",
  "tags": [
    ["d", "task_abc123_stake"],
    ["action", "stake_locked"],
    ["task_id", "task_abc123"],
    ["amount", "2500"],
    ["currency", "GBP"],
    ["trust_model", "custodial"]
  ]
}
```

```json
{
  "kind": 30520,
  "tags": [
    ["d", "task_abc123_release"],
    ["action", "stake_released"],
    ["task_id", "task_abc123"],
    ["amount", "2500"],
    ["currency", "GBP"]
  ]
}
```

Users verify:
- Did operator release stakes when expected?
- How many tasks completed successfully?
- Any theft reports (kind 30525)?

### NIP-85 Integration

Reputation summaries are published as **NIP-85 trusted assertions** (kind 30382), making operator trustworthiness visible across the Nostr ecosystem — not just within DonkeyRide apps.

### NIP-58 Badges

Operators and providers can earn verifiable **NIP-58 badges**:
- "Background Check Passed"
- "SIA Licensed" (security guard)
- "Gas Safe Registered" (plumber)
- "1,000 Tasks Completed"

These badges are visible across all Nostr clients, not just DonkeyRide.

### UI Display

```
Available Operators:
┌──────────────────┬──────┬────────────────┬──────────────┬───────────────┐
│ Operator         │ Fee  │ Reputation     │ Volume       │ Trust Model   │
├──────────────────┼──────┼────────────────┼──────────────┼───────────────┤
│ london.ride.com  │ 3.0% │ ★★★★★ 99.8%   │ £1.5M        │ trustless     │
│ budget.ride.com  │ 1.0% │ ★★★ 89.2%     │ £10k         │ custodial     │
│ safe.ride.com    │ 5.0% │ ★★★★★ 99.9%   │ £5.0M        │ escrow        │
└──────────────────┴──────┴────────────────┴──────────────┴───────────────┘
```

Users see both reputation and trust model — and can make informed choices.

**Effectiveness**:
- Prevents repeat scams
- Builds trust gradually
- Does not prevent exit scams (need bonds for that)

---

## Layer 2: Operator Bonds

### How It Works

Operators post a **bond** — their own funds at risk — that gets slashed if they steal.

```json
{
  "kind": 30540,
  "pubkey": "<operator-pubkey>",
  "tags": [
    ["d", "<operator_pubkey>_bond"],
    ["bond_amount", "50000"],
    ["currency", "GBP"],
    ["trust_model", "custodial"],
    ["bond_proof", "<signature>"],
    ["expiration", "1730000000"]
  ],
  "content": "Operator bond: £50,000 provably locked"
}
```

### Bond Size Requirements

The bond must cover maximum daily exposure, denominated in the operator's settlement currency:

```
100 tasks/day × £25 average stake = £2,500/day
Required bond: £5,000 (2× daily volume)

1,000 tasks/day × £25 average stake = £25,000/day
Required bond: £50,000 (2× daily volume)
```

### Slashing

If an operator steals:
- Bond is slashed 100% via guardian network (kinds 30553-30554)
- Funds distributed to victims
- Operator loses more than they stole

**Who enforces slashing?**
- Guardian network (kinds 30553-30554) — multi-party voting
- Fedimint guardians (for `federated` trust model)
- Automated for simple cases (GPS proves no-show, stake auto-forfeits)

**Effectiveness**:
- Makes theft unprofitable (lose bond > gain from theft)
- Scales with volume
- Requires capital (barrier to entry for operators)
- Needs trusted slashing mechanism

---

## Layer 3: Insurance Pool

### How It Works

Operators pay premiums into a shared pool. If any operator steals, victims are compensated from the pool.

```
Premium = 0.1% of monthly volume

Lower reputation = higher premium:
  excellent (99%+):  1.0× base
  good:              1.5× base
  acceptable:        2.0× base
  caution:           3.0× base
```

**Effectiveness**:
- Victims made whole
- Socialises risk across operators
- Pool could be drained (need reinsurance for catastrophic events)
- Requires governance

---

## Layer 4: Progressive Limits

### How It Works

New operators start with very low limits. Limits increase as reputation grows. All limits are denominated in the operator's settlement currency.

```
New operator (< 10 tasks):
  Max stake per user:    £10
  Max total exposure:    £100
  Max daily volume:      £500

Established (10-100 tasks):
  Max stake per user:    £50
  Max total exposure:    £1,000
  Max daily volume:      £5,000
  Requires bond:         Yes

Veteran (100+ tasks, 99%+ success):
  Max stake per user:    £500
  Max total exposure:    £10,000
  Max daily volume:      £50,000
  Requires bond:         Yes
  Requires insurance:    Yes
```

**Effectiveness**:
- Limits damage from new operators
- Gradual trust building
- No capital requirements (good for new entrants)
- Limits growth for legitimate new operators

---

## Layer 5: Multi-Sig Coordination

### How It Works

For large amounts, stakes are held in multi-party custody rather than by a single operator.

**Option A: Fedimint**

Fedimint federations provide multi-sig custody for ecash stakes. A 3-of-5 federation means no single party can steal funds.

```
Trust model: "federated"
Federation: 5 guardians (3-of-5 threshold)
Stake locked in federation → 3 signatures required to release
```

**Option B: Multi-operator coordination**

For high-value tasks, multiple operators coordinate via multi-sig:

```
High-value task (£5,000 stake):
  Operators: 5 (3-of-5 threshold)
  Multi-sig address holds the stake
  3 operators must agree to release
```

**Effectiveness**:
- No single operator can steal
- Good for high-value tasks
- Complex coordination overhead
- Higher fees (multiple parties)

---

## Layer 6: Trustless Mechanisms

### NIP-47 Hold Invoices

Completely trustless — operator physically cannot steal.

```
1. Provider creates hold invoice via NIP-47
2. Requester pays → Funds LOCKED IN LIGHTNING NETWORK (not with operator)
3. Task completes → Operator publishes signed completion event
4. Completion event triggers settlement (NIP-47 settle_hold_invoice)
5. Or timeout → Automatic refund (NIP-47 cancel_hold_invoice)
```

NIP-47 maps directly to the DonkeyRide stake lifecycle:
- `make_hold_invoice` → lock stake
- `settle_hold_invoice` → release stake
- `cancel_hold_invoice` → forfeit/refund stake

**For fiat users:** Strike or similar providers hold funds during conversion — the operator never has custody. Trust model: `custodial-third-party`.

**Effectiveness**:
- **Completely trustless** — zero custody risk
- Automatic refunds on timeout
- Requires Lightning-capable wallets
- More complex UX than custodial options

---

## Recommended Strategy

Use **multiple layers** based on the trust model and amount:

### Trustless (NIP-47)
```
✓ Layer 6: Hold invoices (zero custody risk)
✓ Layer 1: Reputation (for service quality, not fund safety)
```
No further layers needed — operator cannot steal.

### Custodial-Third-Party (Strike, PayPal)
```
✓ Layer 1: Reputation
✓ Layer 4: Progressive Limits
```
Third party holds funds, not the operator. Low risk.

### Custodial (Operator Lightning Node)

**Small (< £50)**:
```
✓ Layer 1: Reputation
✓ Layer 4: Progressive Limits
```
Theft not worth reputational damage.

**Medium (£50-£200)**:
```
✓ Layer 1: Reputation
✓ Layer 2: Operator Bonds (required)
✓ Layer 3: Insurance (required)
✓ Layer 4: Progressive Limits
```
Bond + insurance covers losses.

**Large (> £200)**:
```
✓ Layer 5: Multi-Sig (3-of-5 operators or Fedimint)
OR
✓ Layer 6: NIP-47 Hold Invoices (trustless)
```
Zero trust in single operator.

---

## Real-World Scenarios

### Scenario: New Malicious Operator

```
1. New operator joins
2. Progressive limits: £10 max stake
3. Steals from 10 users = £100
4. Reputation destroyed
5. No future business
6. Profit: £100

Conclusion: Not worth it — reputation loss far exceeds gain
```

### Scenario: Exit Scam

```
1. Build reputation (6 months, 500 tasks)
2. Process 100 simultaneous tasks
3. Hold £2,500 in stakes
4. Steal everything

But:
- Posted £5,000 bond → Lose £5,000 to steal £2,500 (net -£2,500)
- Insurance pays victims
- Reputation destroyed forever
- Criminal liability

Conclusion: Unprofitable
```

### Scenario: Trustless User

```
1. User selects NIP-47 (trustless) payment method
2. Stakes locked as hold invoices in Lightning Network
3. Operator has zero custody at any point
4. Task completes → Operator publishes signed event → Auto-settles
5. Task cancelled → Timeout → Auto-refunds

Theft vector: NONE
```

---

## Key Insight

The layers create an **antifragile** system:

Each attack makes it stronger by:
- Destroying attacker reputation
- Improving detection
- Increasing bond requirements
- Driving users to trustless options

**Most importantly:** Users have choice.

Don't trust custodial? Use NIP-47 hold invoices (`trustless`).
Want insurance? Choose insured operators.
Want the lowest fees? Accept more risk.
Want fiat? Use Strike (`custodial-third-party`).

This is dramatically better than traditional platforms:
- Trust one company with everything
- No alternatives
- No recourse
- No visibility into trust model

---

## Implementation Priority

1. **Phase 1**: Reputation + Progressive Limits (MVP)
2. **Phase 2**: Add Bonds requirement
3. **Phase 3**: NIP-47 trustless option
4. **Phase 4**: Launch Insurance pool
5. **Phase 5**: Multi-sig / Fedimint for high-value

Start simple, add layers as the network grows.

---

## See Also

- **[specs/NIP-XX-stakes.md](./specs/NIP-XX-stakes.md)** — Commitment stake event kinds and lifecycle
- **[specs/NIP-XX-disputes.md](./specs/NIP-XX-disputes.md)** — Dispute resolution and guardian voting
- **[specs/NIP-XX-reputation.md](./specs/NIP-XX-reputation.md)** — Reputation system and NIP-85 integration
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Three-layer federated architecture
- **[STAKING-EXPLAINED.md](./STAKING-EXPLAINED.md)** — Commitment stakes explained for non-technical readers
- **[docs/PAYMENT-PROVIDERS.md](./docs/PAYMENT-PROVIDERS.md)** — Payment provider integration guide
- **[WATCHDOG-INCENTIVES.md](./WATCHDOG-INCENTIVES.md)** — Game theory for monitoring
- **[OPERATOR-MISBEHAVIOR-PROTOCOL.md](./OPERATOR-MISBEHAVIOR-PROTOCOL.md)** — Theft detection and slashing
