# NIP-XX-payments: Payment Events

`draft` `optional`

## Abstract

This NIP defines **currency-neutral payment events** for service coordination — streaming payments, payment confirmations, tips, surcharges, and payment failures. All events include explicit `amount`, `currency`, and `trust_model` tags, enabling the protocol to work across any payment rail (Lightning, fiat, ecash, or hybrid).

## Motivation

Service coordination requires flexible payment mechanics: per-second streaming during active tasks, tips after completion, wait-time surcharges, and no-show fees. By standardising these as currency-neutral events, the protocol supports everything from a Bitcoin-native user paying in sats via NIP-47 to a fiat user paying in GBP via Strike — with the same event schemas.

## Depends On

- **NIP-XX-core**: Core service coordination protocol (payment agnosticism, currency tags)
- **NIP-XX-stakes**: Commitment stakes (lock, release, forfeit)
- **NIP-47**: Nostr Wallet Connect (for trustless payments)
- **NIP-57**: Lightning Zaps (for tips)

## Event Kinds

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30510 | Streaming Payment | No (append-only) | Requester |
| 30511 | Payment Confirmation | Yes (NIP-33) | Operator |
| 30513 | Provider Tip | No (append-only) | Requester |
| 30514 | Wait Time Charge | No (append-only) | Provider |
| 30515 | No-Show Fee | No (append-only) | Provider/Operator |
| 30516 | Additional Charge | No (append-only) | Provider |
| 30538 | Payment Failure | No (append-only) | Provider/Operator |

---

## Event Structures

### Kind 30510: Streaming Payment

Published by the requester (or the operator on their behalf) during an active task. Streaming payments increment at regular intervals (per-second, per-minute, or per-metre depending on the domain).

```json
{
  "kind": 30510,
  "tags": [
    ["d", "task_abc123_payment_042"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["amount", "25"],
    ["currency", "GBP"],
    ["trust_model", "custodial-third-party"],
    ["payment_hash", "a1b2c3d4..."],
    ["cumulative_total", "1050"],
    ["interval_seconds", "30"],
    ["payment_number", "42"]
  ],
  "content": ""
}
```

**Required tags**: `d`, `task_id`, `amount`, `currency`
**Optional tags**: `domain`, `trust_model`, `payment_hash`, `cumulative_total`, `interval_seconds`, `payment_number`

#### Streaming Models

| Model | Interval | Best For |
|-------|----------|----------|
| Per-time (fine) | Every 30 seconds | Ridesharing (active metering) |
| Per-time (hourly) | Every 3600 seconds | Duration tasks: security guard, companion care, babysitting |
| Per-distance | Every 100 metres | Delivery, man with van |
| Per-milestone | At milestone completion | Emergency trades, multi-stage work |
| Lump sum | At task completion | Locksmith, car wash, process serving |

The streaming model is defined by the domain profile, not by this specification. The `interval_seconds` tag is optional — lump-sum payments omit it.

### Kind 30511: Payment Confirmation

Published by the operator to confirm that a payment has been processed and settled.

```json
{
  "kind": 30511,
  "tags": [
    ["d", "task_abc123_payment_confirmed"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["total_amount", "1500"],
    ["currency", "GBP"],
    ["trust_model", "custodial-third-party"],
    ["operator_fee", "75"],
    ["operator_fee_percent", "5.0"],
    ["provider_received", "1425"],
    ["payment_method", "strike"],
    ["settled_at", "1698765432"],
    ["payment_count", "50"],
    ["e", "<final_streaming_payment_event_id>", "<relay>"]
  ],
  "content": ""
}
```

**Required tags**: `d`, `task_id`, `total_amount`, `currency`
**Optional tags**: `domain`, `trust_model`, `operator_fee`, `operator_fee_percent`, `provider_received`, `payment_method`, `settled_at`, `payment_count`, `e`

### Kind 30513: Provider Tip

Published by the requester to tip the provider after task completion. Tips are separate from the fare and SHOULD go 100% to the provider (no operator fee).

```json
{
  "kind": 30513,
  "tags": [
    ["d", "task_abc123_tip"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["amount", "300"],
    ["currency", "GBP"],
    ["trust_model", "custodial-third-party"],
    ["p", "<provider_pubkey>"],
    ["payment_hash", "d4e5f6..."],
    ["message", "Great service, thank you!"]
  ],
  "content": ""
}
```

**Required tags**: `d`, `task_id`, `amount`, `currency`, `p` (provider pubkey)
**Optional tags**: `domain`, `trust_model`, `payment_hash`, `message`

#### NIP-57 Integration

Tips MAY be implemented as standard **NIP-57 Lightning Zaps** on the task completion event (kind 30508). This makes tips visible across the Nostr ecosystem and leverages existing zap infrastructure.

```json
{
  "kind": 9735,
  "tags": [
    ["e", "<task_completion_event_id>"],
    ["p", "<provider_pubkey>"],
    ["bolt11", "lnbc3000n1..."],
    ["description", "{\"kind\": 9734, ...}"]
  ],
  "content": ""
}
```

When a requester zaps the completion event, every Nostr client that supports NIP-57 will display the tip — extending provider recognition beyond the DonkeyRide ecosystem.

### Kind 30514: Wait Time Charge

Published by the provider when wait time exceeds the grace period (e.g. driver waiting at pickup location).

```json
{
  "kind": 30514,
  "tags": [
    ["d", "task_abc123_wait_charge"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["amount", "200"],
    ["currency", "GBP"],
    ["trust_model", "custodial-third-party"],
    ["wait_minutes", "8"],
    ["grace_minutes", "5"],
    ["rate_per_minute", "67"],
    ["rate_currency", "GBP"]
  ],
  "content": ""
}
```

**Required tags**: `d`, `task_id`, `amount`, `currency`, `wait_minutes`
**Optional tags**: `domain`, `trust_model`, `grace_minutes`, `rate_per_minute`, `rate_currency`

### Kind 30515: No-Show Fee

Published by the provider or operator when a no-show is confirmed. This event complements the `no_show` terminal state in the core state machine and the stake forfeiture in NIP-XX-stakes.

```json
{
  "kind": 30515,
  "tags": [
    ["d", "task_abc123_noshow_fee"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["amount", "500"],
    ["currency", "GBP"],
    ["trust_model", "custodial-third-party"],
    ["no_show_party", "requester"],
    ["waited_minutes", "10"],
    ["grace_minutes", "5"],
    ["e", "<stake_forfeit_event_id>", "<relay>"]
  ],
  "content": ""
}
```

**Required tags**: `d`, `task_id`, `amount`, `currency`, `no_show_party`
**Optional tags**: `domain`, `trust_model`, `waited_minutes`, `grace_minutes`, `e`

### Kind 30516: Additional Charge

Published by the provider for charges beyond the original fare (e.g. tolls, cleaning fees, additional stops, equipment surcharges).

```json
{
  "kind": 30516,
  "tags": [
    ["d", "task_abc123_additional_001"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["amount", "250"],
    ["currency", "GBP"],
    ["trust_model", "custodial-third-party"],
    ["charge_type", "toll"],
    ["description", "Dartford Crossing toll"],
    ["receipt", "https://receipts.example.com/toll_12345"],
    ["requires_approval", "true"]
  ],
  "content": ""
}
```

**Required tags**: `d`, `task_id`, `amount`, `currency`, `charge_type`
**Optional tags**: `domain`, `trust_model`, `description`, `receipt`, `requires_approval`

#### Charge Types

| Type | Description | Typical Approval |
|------|-------------|-----------------|
| `toll` | Road toll or congestion charge | Auto-approved |
| `cleaning` | Vehicle/premises cleaning fee | Requires approval |
| `additional_stop` | Extra stop added by requester | Auto-approved |
| `equipment` | Equipment or materials used | Requires approval |
| `parking` | Parking charges incurred | Auto-approved |
| `surcharge` | Peak/holiday/distance surcharge | Auto-approved |

### Kind 30538: Payment Failure

Published by the provider or operator when a payment fails.

```json
{
  "kind": 30538,
  "tags": [
    ["d", "task_abc123_payment_failure"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["amount", "1500"],
    ["currency", "GBP"],
    ["trust_model", "custodial-third-party"],
    ["failure_type", "insufficient_funds"],
    ["payment_method", "strike"],
    ["retry_available", "true"],
    ["retry_deadline", "1698769032"]
  ],
  "content": "Payment failed — insufficient funds. Please retry within 1 hour."
}
```

**Required tags**: `d`, `task_id`, `failure_type`
**Optional tags**: `domain`, `amount`, `currency`, `trust_model`, `payment_method`, `retry_available`, `retry_deadline`

#### Failure Types

| Type | Description |
|------|-------------|
| `insufficient_funds` | Payer's wallet/account has insufficient balance |
| `expired` | Payment invoice or hold expired |
| `network_error` | Payment network unreachable |
| `provider_error` | Payment provider returned an error |
| `rejected` | Payment was rejected by the recipient |
| `timeout` | Payment timed out waiting for confirmation |

---

## Payment Provider Trust Model Matrix

Every payment event includes a `trust_model` tag declaring the trust assumptions. This table summarises the available providers and their characteristics:

| Provider | Trust Model | Currencies | Custody | Trustless Stakes | Best For |
|----------|------------|------------|---------|-----------------|----------|
| NIP-47 (hold invoices) | `trustless` | SAT/BTC | None (user wallets) | Yes | Sovereignty-minded users |
| Strike | `custodial-third-party` | GBP/USD/EUR/SAT | Strike (brief) | No | Fiat UX, everyday use |
| Stripe | `custodial-escrow` | Any fiat | Stripe escrow | No | Fiat-only markets |
| LND (operator) | `custodial` | SAT | Operator node | Yes (hodl) | Operators with Lightning infra |
| Core Lightning | `custodial` | SAT | Operator node | Yes (hold) | Operators with CLN infra |
| BTCPay Server | `custodial` | SAT/BTC | Operator BTCPay | No | Self-hosted operators |
| Alby | `custodial-third-party` | SAT/EUR/USD | Alby | No | Browser wallet users |
| Cashu | `federated` | SAT (ecash) | Mint | Partial | Privacy-focused users |
| Fedimint | `federated` | SAT | Federation | Partial (multisig) | Community-run federations |
| PayPal | `custodial-third-party` | Any fiat | PayPal | No | Maximum accessibility |

---

## NIP-47 Integration

NIP-47 (Nostr Wallet Connect) enables **direct wallet-to-wallet payments** without intermediaries. For streaming payments:

```
1. Requester connects wallet via NIP-47
2. During active task, operator sends pay_invoice requests at regular intervals
3. Requester's wallet auto-approves payments up to the pre-authorised limit
4. Provider receives sats directly into their wallet
5. Operator's role: routing payment requests, not holding funds
```

This achieves `trustless` trust model — the operator facilitates payment flow but never has custody.

---

## See Also

- **NIP-XX-core**: Core protocol (payment agnosticism, currency tags, trust model taxonomy)
- **NIP-XX-stakes**: Commitment stakes (lock, release, forfeit)
- **NIP-47**: Nostr Wallet Connect (trustless payments)
- **NIP-57**: Lightning Zaps (tip integration)
- **docs/PAYMENT-PROVIDERS.md**: Payment provider integration guide
