# DonkeyRide Staking Mechanism Explained

## The Core Problem

Without a central authority (like Uber), how do we ensure:
1. Requesters don't submit fake service requests?
2. Providers don't accept then cancel?
3. Both parties complete the transaction?

## The Solution: Commitment Stakes

Both parties lock a small amount of money before the task begins. If either party misbehaves, they lose their stake. If both behave, both get their money back.

The protocol is **currency-neutral** — stakes work in GBP, USD, EUR, BTC, or any supported currency. The `trust_model` tag on every stake event tells participants exactly where their money is held.

---

### 1. Initial Stakes (Before Task)

#### Requester Stakes (10% of estimated fare)
```
Requesting a service estimated at £10.00:
  Requester balance:  £500.00
  Stake required:     £1.00 (10%)

  After requesting:
  Requester balance:  £499.00
  Locked in escrow:   £1.00
```

#### Provider Stakes (15% of estimated fare)
```
Accepting a £10.00 service:
  Provider balance:   £1,000.00
  Stake required:     £1.50 (15%)

  After accepting:
  Provider balance:   £998.50
  Locked in escrow:   £1.50
```

### 2. Where Do Stakes Go?

It depends on the **trust model** — the user chooses:

| Trust Model | Where Stakes Are Held | Can Operator Steal? |
|------------|----------------------|---------------------|
| `trustless` (NIP-47) | Lightning Network hold invoices, user wallets | No — operator never has custody |
| `custodial-third-party` (Strike) | Strike holds funds during conversion | No — operator never has custody |
| `custodial-escrow` (Stripe) | Stripe escrow account | No — operator never has custody |
| `custodial` (operator LND node) | Operator's Lightning node | Possible — see [TRUST-MECHANISMS.md](./TRUST-MECHANISMS.md) |
| `federated` (Cashu/Fedimint) | Ecash mint or federation | Requires federation collusion |

**Recommended for most users:** `trustless` (NIP-47) or `custodial-third-party` (Strike). The operator never touches your money.

### 3. Stake Resolution Scenarios

#### Scenario A: Successful Completion

```
Task completes successfully:
  Requester pays:     £10.00 (service fee)
  Requester gets back: £1.00 (stake returned)
  Net cost:           £10.00

  Provider receives:  £10.00 (payment)
  Provider gets back:  £1.50 (stake returned)
  Net earning:        £10.00 (minus operator fee)
```

#### Scenario B: Provider Cancels

```
Provider cancels after accepting:
  Provider loses:     £1.50 (entire stake)
  Requester receives: £1.20 (80% of provider's stake)
  Operator fee:       £0.30 (20% — prevents gaming)

  Final:
  Requester: compensated £1.20 + stake back (£1.00) = +£2.20
  Provider:  lost £1.50
```

#### Scenario C: Requester Cancels

```
Requester cancels after provider accepts:
  Requester loses:    £1.00 (entire stake)
  Provider receives:  £0.80 (80% of requester's stake)
  Operator fee:       £0.20 (20%)

  Final:
  Requester: lost £1.00
  Provider:  compensated £0.80 + stake back (£1.50) = +£2.30
```

#### Scenario D: No-Show

```
Requester doesn't appear (no_show state):
  Requester loses:    £1.00 (stake automatically forfeited)
  Provider receives:  £0.80 (80% of forfeited stake)
  No-show fee:        £5.00 (kind 30515, additional charge)
  Provider gets back:  £1.50 (own stake returned)

  Final:
  Requester: lost £1.00 stake + £5.00 no-show fee
  Provider:  compensated for wasted time
```

### 4. How Each Trust Model Works

#### NIP-47 (Trustless — Recommended)

The operator **never has custody**. Stakes flow directly between user wallets via Nostr Wallet Connect:

```
1. Provider's wallet creates a hold invoice via NIP-47
2. Requester's wallet pays → funds LOCKED in Lightning Network
3. Task completes → operator publishes signed completion event
4. Completion triggers settlement (NIP-47 settle_hold_invoice)
5. Or timeout → automatic refund (NIP-47 cancel_hold_invoice)

Operator's role: publishes completion event — never touches funds
```

#### Strike (Fiat UX)

For users who want to pay in pounds, dollars, or euros:

```
1. Requester pays £1.00 stake via Strike
2. Strike holds £1.00 (not the operator)
3. Task completes → operator confirms → Strike releases
4. Provider receives payment (GBP or sats, their choice)

Operator's role: confirms completion — never holds funds
Trust model: custodial-third-party
```

#### Operator Lightning Node (Custodial)

For operators running their own Lightning infrastructure:

```
1. Requester pays hold invoice → operator's LND node holds funds
2. Provider pays hold invoice → operator's LND node holds funds
3. Task completes → operator settles both invoices
4. Cancellation → operator releases/forfeits as appropriate

Operator's role: holds funds temporarily — trust layers 1-6 apply
Trust model: custodial
```

### 5. Milestone Escrow

For multi-stage tasks (emergency plumber, multi-stop delivery), stakes can be released in milestones:

```
Emergency plumber job — £200 total:
  Milestone 1: Diagnosis (20%)     → £40 released on diagnosis
  Milestone 2: Parts sourced (30%) → £60 released when parts arrive
  Milestone 3: Work complete (50%) → £100 released on completion

Each milestone triggers a kind 30537 event.
Provider doesn't wait until the end to get paid.
Requester can verify each stage before funds release.
```

### 6. Scheduled Tasks (Higher Stakes)

For scheduled tasks, stakes increase because reliability is critical:

```
5am airport pickup for £20.00:
  Requester stake:  £4.00 (20% — doubled)
  Provider stake:   £6.00 (30% — doubled)

  If provider no-shows:
  Provider loses:   £6.00 (stake)
  Provider pays:    £20.00 (penalty = full fare)
  Total loss:       £26.00

  Requester receives compensation for the missed pickup.
```

### 7. Reputation-Based Stake Adjustment

Trusted users stake less. New users stake more.

```
New user (0 tasks completed):   2× base stake
Established (50+ tasks, 4.5+):  1× base stake
Veteran (200+ tasks, 4.8+):     0.5× base stake
```

This means a veteran provider with hundreds of completed tasks and excellent ratings stakes half as much as a new provider — they've earned the trust.

### 8. The Protocol Fee Question

**Where does the 20% of forfeited stakes go?**

Current implementation: **Insurance Pool**
- Funds disputes where both parties have legitimate claims
- Covers edge cases (breakdown, accident, force majeure)
- Governed by operator policy

### 9. Why This Works

1. **Immediate consequences** — bad behaviour costs money instantly
2. **Proportional risk** — higher-value tasks require higher stakes
3. **Market-driven** — no arbitrary bans, just economic reality
4. **Trust model choice** — users pick their risk tolerance
5. **Reputation matters** — good actors stake less over time
6. **Currency-neutral** — works in any currency, any payment rail

### 10. Comparison with Traditional Systems

| System | Trust Mechanism | Fee | Settlement |
|--------|----------------|-----|------------|
| Uber/Lyft | Corporate authority | 25-30% | Days/weeks |
| Cash | Physical presence | 0% but risky | Immediate |
| DonkeyRide (trustless) | Economic stakes + NIP-47 | Operator fee (1-5%) | Instant |
| DonkeyRide (fiat) | Economic stakes + Strike | Operator fee (1-5%) | Seconds |

---

## TL;DR

- **Stakes**: Temporary locks ensuring good behaviour
- **Location**: Depends on trust model — hold invoices, Strike, Stripe, or operator node
- **Resolution**: Automatic based on task outcome
- **No-show**: Automatic forfeiture when `no_show` state is reached
- **Milestones**: Partial release at each stage for multi-step tasks
- **Trust choice**: Users see the trust model and choose their risk tolerance
- **Result**: Trust through economics, not corporations

---

## See Also

- **[specs/NIP-XX-stakes.md](./specs/NIP-XX-stakes.md)** — Stake event kinds and lifecycle
- **[TRUST-MECHANISMS.md](./TRUST-MECHANISMS.md)** — 6 layers of trust (defence in depth)
- **[specs/NIP-XX-payments.md](./specs/NIP-XX-payments.md)** — Payment events and streaming payments
- **[docs/PAYMENT-PROVIDERS.md](./docs/PAYMENT-PROVIDERS.md)** — Payment provider integration guide
