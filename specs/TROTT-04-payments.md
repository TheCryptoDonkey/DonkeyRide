# TROTT-04: Payments — Quotes, Escrow, Streaming & Settlement

`draft` `optional`

## Abstract

This specification defines the **payment communication layer** for trust-minimised physical service coordination. It comprises seven event kinds covering the full payment lifecycle: quoting (30530), terms agreement (30531), stake locking (30532), stake release (30533), stake forfeiture (30534), payment receipts (30535), and streaming ticks (30536).

**Critical principle**: This specification defines events that *communicate about* payments, not events that *execute* payments. Events track payment state; actual money moves on whatever rail the parties choose (Lightning, Strike, Stripe, NIP-47, Cashu, bank transfer, cash). The protocol is payment-rail-agnostic and currency-neutral — every payment event includes explicit `amount`, `currency`, and `trust_model` tags.

## Motivation

Service coordination requires flexible payment mechanics: competitive quoting, milestone-based escrow, per-second streaming during active tasks, split payments across multiple providers, and transparent settlement. Traditional platforms bundle payment processing with coordination, creating lock-in and opacity. By separating payment communication (this spec) from payment execution (the chosen rail), the protocol supports:

- **Bitcoin-native users** paying in satoshis via NIP-47 hold invoices with no intermediary
- **Fiat users** paying in GBP via Strike, which converts and settles over Lightning
- **Card users** paying via Stripe with operator-managed escrow
- **Ecash users** paying via Cashu tokens locked in a mint
- **Mixed payments** within the same task (e.g. deposit in fiat, streaming in sats)

## Depends On

- **TROTT-01**: Core service coordination protocol (task lifecycle, state machine)
- **NIP-01**: Basic protocol flow and event format
- **NIP-33**: Parameterised replaceable events
- **NIP-40**: Expiration timestamps (for quote validity windows)
- **NIP-44**: Encrypted payloads (for sensitive payment details)
- **NIP-47**: Nostr Wallet Connect (for trustless payment flows)
- **NIP-57**: Lightning Zaps (for tip integration)

---

## Event Kinds

| Kind | Name | Replaceable | Publisher | Description |
|------|------|-------------|-----------|-------------|
| 30530 | Quote | Yes (NIP-33) | Provider | Provider proposes a price for a task. Multiple providers may quote the same task. |
| 30531 | Payment Terms | Yes (NIP-33) | Either party / Operator | Agreed payment structure: milestones, splits, streaming rate. |
| 30532 | Stake Lock | Yes (NIP-33) | Operator | Funds committed. Proof of lock with payment reference. |
| 30533 | Stake Release | No (append-only) | Operator | Funds released to provider on successful completion. |
| 30534 | Stake Forfeit | No (append-only) | Operator | Funds penalised (cancellation, no-show, dispute loss). |
| 30535 | Payment Receipt | No (append-only) | Operator / Provider | Confirmation that money changed hands. Final settlement record. |
| 30536 | Streaming Tick | No (append-only) | Requester / Operator | Periodic proof-of-payment during an ongoing task. |

---

## Currency Neutrality

Every payment event in this specification MUST include the following three tags:

| Tag | Required | Format | Description |
|-----|----------|--------|-------------|
| `amount` | Yes | Integer string | Value in the smallest unit of the specified currency |
| `currency` | Yes | ISO 4217 or crypto code | Currency identifier |
| `trust_model` | Recommended | Enumerated string | Declares the trust assumptions of the payment rail |

### Smallest Unit Convention

Amounts are always expressed in the **smallest unit** of the specified currency:

| Currency | Code | Smallest Unit | Example: GBP 15.00 |
|----------|------|---------------|-------------------|
| British Pound | `GBP` | Pence | `1500` |
| US Dollar | `USD` | Cents | `1500` |
| Euro | `EUR` | Cents | `1500` |
| Bitcoin | `BTC` | Satoshi | `150000` (at ~GBP 0.0001/sat) |
| Satoshi | `SAT` | Satoshi | `150000` |

### Trust Model Taxonomy

Every payment event SHOULD include a `trust_model` tag declaring the custody assumptions:

| Trust Model | Description | Example Provider |
|-------------|-------------|-----------------|
| `trustless` | User wallet to user wallet. No intermediary custody. | NIP-47 + hold invoices |
| `operator-escrow` | Operator holds funds in escrow until completion. | LND (operator node), CLN |
| `third-party-escrow` | Independent third party holds funds in escrow. | Stripe Connect, BTCPay |
| `fiat-escrow` | Fiat payment processor holds funds. | Strike, PayPal |
| `direct` | Direct payment between parties, no escrow. | Cash, bank transfer |
| `prepaid` | Payment collected before service begins. | Pre-paid voucher, Cashu token |

---

## Event Structures

### Kind 30530: Quote

Published by a provider to propose a price for a task. Multiple providers MAY quote the same task, enabling competitive pricing. The `d` tag format allows one quote per provider per task via NIP-33 semantics.

```json
{
  "kind": 30530,
  "pubkey": "<provider_hex_pubkey>",
  "created_at": 1698765000,
  "tags": [
    ["d", "task_abc123:quote:<provider_hex_pubkey>"],
    ["e", "<service_request_event_id_30500>", "wss://relay.example.com"],
    ["p", "<requester_hex_pubkey>"],
    ["domain", "ridesharing"],
    ["amount", "1500"],
    ["currency", "GBP"],
    ["trust_model", "fiat-escrow"],
    ["breakdown", "base_fare", "500", "GBP"],
    ["breakdown", "distance", "750", "GBP"],
    ["breakdown", "time", "250", "GBP"],
    ["valid_until", "1698765600"],
    ["estimated_duration_seconds", "1200"],
    ["estimated_distance_metres", "8500"],
    ["payment_methods", "strike,nip47,cash"]
  ],
  "content": ""
}
```

**Tag reference:**

| Tag | Required | Format | Description |
|-----|----------|--------|-------------|
| `d` | Yes | `<task_id>:quote:<provider_pubkey>` | One quote per provider per task. Provider can update by republishing. |
| `e` | Yes | `<event_id>`, `<relay>` | References the Task Request event (kind 30500). |
| `p` | Yes | `<hex_pubkey>` | The requester who will receive and evaluate this quote. |
| `domain` | Recommended | String | Domain identifier. |
| `amount` | Yes | Integer string | Total quoted price in smallest currency unit. |
| `currency` | Yes | ISO 4217 or crypto code | Currency of the quote. |
| `trust_model` | Recommended | Enumerated string | Trust model of the proposed payment rail. |
| `breakdown` | Optional | `<item>`, `<amount>`, `<currency>` | Transparent pricing breakdown. Multiple tags allowed. |
| `valid_until` | Recommended | Unix timestamp | Quote expiry. After this time the quote is void. |
| `estimated_duration_seconds` | Optional | Integer string | Estimated task duration. |
| `estimated_distance_metres` | Optional | Integer string | Estimated distance (for transit-based tasks). |
| `payment_methods` | Optional | Comma-separated string | Payment methods the provider accepts. |

#### Breakdown Items

The `breakdown` tag provides transparent pricing. Common items:

| Item | Description | Domains |
|------|-------------|---------|
| `base_fare` | Fixed starting fee | Ridesharing, delivery |
| `distance` | Distance-based component | Ridesharing, delivery, towing |
| `time` | Time-based component | Ridesharing, security |
| `labour` | Labour charge | Locksmith, emergency trades, cleaning |
| `parts` | Materials and parts | Locksmith, emergency trades |
| `call_out` | Call-out fee | Locksmith, emergency trades, towing |
| `surcharge` | Peak / holiday / unsociable hours surcharge | All |
| `operator_fee` | Operator's commission | All |

#### Competitive Quoting Example (Locksmith)

Three locksmiths quote the same lockout:

**Quote 1 (experienced, higher price):**
```json
{
  "kind": 30530,
  "pubkey": "<locksmith_a_pubkey>",
  "created_at": 1698765000,
  "tags": [
    ["d", "task_lk42x8:quote:<locksmith_a_pubkey>"],
    ["e", "<lockout_request_event_id>", "wss://relay.example.com"],
    ["p", "<customer_pubkey>"],
    ["domain", "locksmith"],
    ["amount", "12000"],
    ["currency", "GBP"],
    ["trust_model", "operator-escrow"],
    ["breakdown", "call_out", "4000", "GBP"],
    ["breakdown", "labour", "8000", "GBP"],
    ["valid_until", "1698765600"],
    ["payment_methods", "strike,stripe"]
  ],
  "content": "Non-destructive entry. 15 years experience. No damage to your door."
}
```

**Quote 2 (faster, mid price):**
```json
{
  "kind": 30530,
  "pubkey": "<locksmith_b_pubkey>",
  "created_at": 1698765030,
  "tags": [
    ["d", "task_lk42x8:quote:<locksmith_b_pubkey>"],
    ["e", "<lockout_request_event_id>", "wss://relay.example.com"],
    ["p", "<customer_pubkey>"],
    ["domain", "locksmith"],
    ["amount", "9500"],
    ["currency", "GBP"],
    ["trust_model", "operator-escrow"],
    ["breakdown", "call_out", "3500", "GBP"],
    ["breakdown", "labour", "6000", "GBP"],
    ["valid_until", "1698765600"],
    ["payment_methods", "strike,nip47"]
  ],
  "content": "Can be there in 20 minutes. May need to drill if picks fail."
}
```

**Quote 3 (cheapest, longer ETA):**
```json
{
  "kind": 30530,
  "pubkey": "<locksmith_c_pubkey>",
  "created_at": 1698765060,
  "tags": [
    ["d", "task_lk42x8:quote:<locksmith_c_pubkey>"],
    ["e", "<lockout_request_event_id>", "wss://relay.example.com"],
    ["p", "<customer_pubkey>"],
    ["domain", "locksmith"],
    ["amount", "7500"],
    ["currency", "GBP"],
    ["trust_model", "fiat-escrow"],
    ["breakdown", "call_out", "2500", "GBP"],
    ["breakdown", "labour", "5000", "GBP"],
    ["valid_until", "1698766200"],
    ["payment_methods", "stripe"]
  ],
  "content": "45-minute ETA. Will attempt non-destructive first."
}
```

---

### Kind 30531: Payment Terms

Published when the parties agree on the payment structure for a task. Covers simple lump-sum, streaming rates, milestone breakdowns, and multi-provider splits. One Payment Terms event per task.

```json
{
  "kind": 30531,
  "pubkey": "<operator_hex_pubkey>",
  "created_at": 1698765100,
  "tags": [
    ["d", "task_abc123:terms"],
    ["e", "<accepted_quote_event_id_30530>", "wss://relay.example.com"],
    ["domain", "ridesharing"],
    ["payment_type", "streaming"],
    ["total_amount", "1500"],
    ["currency", "GBP"],
    ["trust_model", "fiat-escrow"],
    ["streaming_rate", "25"],
    ["streaming_interval_seconds", "30"],
    ["payment_rail", "strike"],
    ["requester_pubkey", "<requester_hex_pubkey>"],
    ["provider_pubkey", "<provider_hex_pubkey>"],
    ["operator_fee_percent", "5.0"]
  ],
  "content": ""
}
```

**Tag reference:**

| Tag | Required | Format | Description |
|-----|----------|--------|-------------|
| `d` | Yes | `<task_id>:terms` | One terms event per task. |
| `e` | Recommended | `<event_id>`, `<relay>` | References the accepted Quote (kind 30530). |
| `domain` | Recommended | String | Domain identifier. |
| `payment_type` | Yes | Enumerated string | `simple`, `streaming`, `milestone`, `split` |
| `total_amount` | Yes | Integer string | Total agreed price. |
| `currency` | Yes | ISO 4217 or crypto code | Currency. |
| `trust_model` | Recommended | Enumerated string | Trust model. |
| `streaming_rate` | Conditional | Integer string | Amount per interval (required when `payment_type` is `streaming`). |
| `streaming_interval_seconds` | Conditional | Integer string | Seconds between ticks (required when `payment_type` is `streaming`). |
| `milestone` | Conditional | `<id>`, `<description>`, `<amount>`, `<currency>` | Milestone definition (required when `payment_type` is `milestone`). Multiple tags. |
| `split` | Conditional | `<provider_pubkey>`, `<amount>`, `<currency>`, `<role>` | Per-provider split (required when `payment_type` is `split`). Multiple tags. |
| `payment_rail` | Recommended | String | Which payment rail will be used (strike, nip47, stripe, lnd, cash, etc.). |
| `requester_pubkey` | Recommended | Hex pubkey | The paying party. |
| `provider_pubkey` | Recommended | Hex pubkey | The receiving party. |
| `operator_fee_percent` | Optional | Decimal string | Operator commission percentage. |

#### Payment Types

| Type | Description | When Used |
|------|-------------|-----------|
| `simple` | Lump-sum payment on completion | Locksmith, car wash, process serving |
| `streaming` | Periodic micro-payments during active task | Ridesharing, security guard, babysitting |
| `milestone` | Partial payments at defined milestones | Emergency trades, man with van, multi-stage work |
| `split` | Payment divided across multiple providers | Multi-provider tasks, team dispatch |

#### Milestone Terms Example (Emergency Plumber)

```json
{
  "kind": 30531,
  "pubkey": "<operator_hex_pubkey>",
  "created_at": 1698765100,
  "tags": [
    ["d", "task_pl77w2:terms"],
    ["e", "<accepted_quote_event_id>", "wss://relay.example.com"],
    ["domain", "emergency_trades"],
    ["payment_type", "milestone"],
    ["total_amount", "45000"],
    ["currency", "GBP"],
    ["trust_model", "operator-escrow"],
    ["milestone", "1", "Diagnosis complete", "5000", "GBP"],
    ["milestone", "2", "Emergency repair (stop the leak)", "15000", "GBP"],
    ["milestone", "3", "Permanent fix installed", "20000", "GBP"],
    ["milestone", "4", "Testing and clean-up", "5000", "GBP"],
    ["payment_rail", "stripe"],
    ["requester_pubkey", "<homeowner_pubkey>"],
    ["provider_pubkey", "<plumber_pubkey>"],
    ["operator_fee_percent", "7.5"]
  ],
  "content": ""
}
```

#### Split Terms Example (Two-Person Security Shift)

```json
{
  "kind": 30531,
  "pubkey": "<operator_hex_pubkey>",
  "created_at": 1698765100,
  "tags": [
    ["d", "task_sec88q1:terms"],
    ["domain", "security"],
    ["payment_type", "split"],
    ["total_amount", "48000"],
    ["currency", "GBP"],
    ["trust_model", "operator-escrow"],
    ["split", "<guard_a_pubkey>", "24000", "GBP", "lead_guard"],
    ["split", "<guard_b_pubkey>", "24000", "GBP", "support_guard"],
    ["streaming_rate", "2000"],
    ["streaming_interval_seconds", "3600"],
    ["payment_rail", "strike"],
    ["requester_pubkey", "<client_pubkey>"],
    ["operator_fee_percent", "10.0"]
  ],
  "content": ""
}
```

---

### Kind 30532: Stake Lock

Published by the operator when funds are committed for a task. This event proves that money is locked and unavailable to either party until a release or forfeiture event is published. For trustless flows (NIP-47), the lock corresponds to a hold invoice being accepted.

```json
{
  "kind": 30532,
  "pubkey": "<operator_hex_pubkey>",
  "created_at": 1698765200,
  "tags": [
    ["d", "task_abc123:lock:requester"],
    ["e", "<payment_terms_event_id_30531>", "wss://relay.example.com"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["party", "requester"],
    ["amount", "1500"],
    ["currency", "GBP"],
    ["trust_model", "fiat-escrow"],
    ["payment_rail", "strike"],
    ["lock_type", "escrow_hold"],
    ["payment_hash", "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"],
    ["locked_at", "1698765200"],
    ["expiration", "1698772400"]
  ],
  "content": ""
}
```

**Tag reference:**

| Tag | Required | Format | Description |
|-----|----------|--------|-------------|
| `d` | Yes | `<task_id>:lock:<party>` | One lock event per party per task. `party` is `requester` or `provider`. |
| `e` | Recommended | `<event_id>`, `<relay>` | References the Payment Terms event (kind 30531). |
| `domain` | Recommended | String | Domain identifier. |
| `task_id` | Yes | String | Task identifier. |
| `party` | Yes | `requester` or `provider` | Which party's funds are locked. |
| `amount` | Yes | Integer string | Locked amount. |
| `currency` | Yes | ISO 4217 or crypto code | Currency. |
| `trust_model` | Yes | Enumerated string | Trust model of the lock mechanism. |
| `payment_rail` | Recommended | String | Payment rail used (strike, nip47, stripe, lnd, cln, cashu, etc.). |
| `lock_type` | Recommended | Enumerated string | Technical mechanism (see Lock Types table). |
| `payment_hash` | Conditional | Hex string | Lightning payment hash (required for Lightning-based escrow). |
| `escrow_token` | Conditional | String | Cashu token or ecash proof (required for ecash-based escrow). |
| `locked_at` | Recommended | Unix timestamp | When the lock was confirmed. |
| `expiration` | Recommended | Unix timestamp (NIP-40) | When the lock expires if no release or forfeit occurs. |

#### Lock Types

| Lock Type | Description | Trust Model |
|-----------|-------------|-------------|
| `hold_invoice` | Lightning hold invoice — settled or cancelled by operator | `operator-escrow` |
| `nip47_hold` | NIP-47 hold invoice — settled directly between user wallets | `trustless` |
| `escrow_hold` | Fiat escrow (Stripe Connect, PayPal, etc.) | `third-party-escrow`, `fiat-escrow` |
| `custodial_hold` | Operator holds funds in their own account | `operator-escrow` |
| `ecash_lock` | Cashu or Fedimint token locked in mint | `prepaid` |
| `preauthorisation` | Card pre-authorisation (funds reserved, not captured) | `fiat-escrow` |

#### Provider Stake Lock Example

```json
{
  "kind": 30532,
  "pubkey": "<operator_hex_pubkey>",
  "created_at": 1698765210,
  "tags": [
    ["d", "task_abc123:lock:provider"],
    ["e", "<payment_terms_event_id_30531>", "wss://relay.example.com"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["party", "provider"],
    ["amount", "2000"],
    ["currency", "GBP"],
    ["trust_model", "trustless"],
    ["payment_rail", "nip47"],
    ["lock_type", "nip47_hold"],
    ["payment_hash", "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3"],
    ["locked_at", "1698765210"],
    ["expiration", "1698772400"]
  ],
  "content": ""
}
```

#### Cashu Ecash Lock Example

```json
{
  "kind": 30532,
  "pubkey": "<operator_hex_pubkey>",
  "created_at": 1698765200,
  "tags": [
    ["d", "task_dl99p3:lock:requester"],
    ["domain", "delivery"],
    ["task_id", "task_dl99p3"],
    ["party", "requester"],
    ["amount", "50000"],
    ["currency", "SAT"],
    ["trust_model", "prepaid"],
    ["payment_rail", "cashu"],
    ["lock_type", "ecash_lock"],
    ["escrow_token", "cashuAey..."],
    ["locked_at", "1698765200"],
    ["expiration", "1698772400"]
  ],
  "content": ""
}
```

---

### Kind 30533: Stake Release

Published by the operator when locked funds are released to the provider upon successful task completion. This is the happy path — the task completed, both parties are satisfied, and the provider receives payment.

```json
{
  "kind": 30533,
  "pubkey": "<operator_hex_pubkey>",
  "created_at": 1698766500,
  "tags": [
    ["d", "task_abc123:release:provider"],
    ["e", "<stake_lock_event_id_30532>", "wss://relay.example.com"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["party", "provider"],
    ["amount", "1425"],
    ["currency", "GBP"],
    ["trust_model", "fiat-escrow"],
    ["release_reason", "completed"],
    ["gross_amount", "1500"],
    ["operator_fee", "75"],
    ["operator_fee_percent", "5.0"],
    ["released_at", "1698766500"],
    ["payment_rail", "strike"],
    ["settlement_reference", "str_pi_3Nk..."]
  ],
  "content": ""
}
```

**Tag reference:**

| Tag | Required | Format | Description |
|-----|----------|--------|-------------|
| `d` | Yes | `<task_id>:release:<party>` | Release identifier. |
| `e` | Yes | `<event_id>`, `<relay>` | References the Stake Lock event (kind 30532) being released. |
| `domain` | Recommended | String | Domain identifier. |
| `task_id` | Yes | String | Task identifier. |
| `party` | Yes | `requester` or `provider` | Which party receives the released funds. |
| `amount` | Yes | Integer string | Net amount released (after fees). |
| `currency` | Yes | ISO 4217 or crypto code | Currency. |
| `trust_model` | Recommended | Enumerated string | Trust model. |
| `release_reason` | Yes | Enumerated string | Why funds are being released (see Release Reasons). |
| `gross_amount` | Recommended | Integer string | Total amount before operator fees. |
| `operator_fee` | Optional | Integer string | Operator fee deducted. |
| `operator_fee_percent` | Optional | Decimal string | Operator fee as a percentage. |
| `released_at` | Recommended | Unix timestamp | When the release was executed. |
| `payment_rail` | Recommended | String | Payment rail used. |
| `settlement_reference` | Optional | String | External settlement reference from the payment rail. |

#### Release Reasons

| Reason | Description |
|--------|-------------|
| `completed` | Task completed successfully. Full release to provider. |
| `cancelled_mutual` | Both parties agreed to cancel. Funds returned to requester. |
| `cancelled_grace` | Cancelled within the grace period. No penalty. |
| `milestone` | Partial release at milestone completion. |
| `dispute_resolved` | Released per dispute resolution outcome. |
| `expired` | Lock expired without resolution. Funds returned to original party. |

#### Requester Stake Return on Completion

When a task completes successfully, the requester's stake is also released (returned to the requester):

```json
{
  "kind": 30533,
  "pubkey": "<operator_hex_pubkey>",
  "created_at": 1698766500,
  "tags": [
    ["d", "task_abc123:release:requester"],
    ["e", "<requester_lock_event_id_30532>", "wss://relay.example.com"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["party", "requester"],
    ["amount", "1500"],
    ["currency", "GBP"],
    ["trust_model", "fiat-escrow"],
    ["release_reason", "completed"],
    ["released_at", "1698766500"],
    ["payment_rail", "strike"]
  ],
  "content": ""
}
```

#### Milestone Partial Release Example

```json
{
  "kind": 30533,
  "pubkey": "<operator_hex_pubkey>",
  "created_at": 1698767000,
  "tags": [
    ["d", "task_pl77w2:release:milestone_2"],
    ["e", "<stake_lock_event_id_30532>", "wss://relay.example.com"],
    ["domain", "emergency_trades"],
    ["task_id", "task_pl77w2"],
    ["party", "provider"],
    ["amount", "13875"],
    ["currency", "GBP"],
    ["trust_model", "operator-escrow"],
    ["release_reason", "milestone"],
    ["milestone_id", "2"],
    ["milestone_description", "Emergency repair (stop the leak)"],
    ["gross_amount", "15000"],
    ["operator_fee", "1125"],
    ["cumulative_released", "18875"],
    ["total_milestones", "4"],
    ["released_at", "1698767000"],
    ["payment_rail", "stripe"]
  ],
  "content": ""
}
```

---

### Kind 30534: Stake Forfeit

Published by the operator when locked funds are penalised due to cancellation, no-show, or dispute loss. The forfeited amount goes to the non-offending party (or is split per dispute resolution).

```json
{
  "kind": 30534,
  "pubkey": "<operator_hex_pubkey>",
  "created_at": 1698766500,
  "tags": [
    ["d", "task_abc123:forfeit:requester"],
    ["e", "<stake_lock_event_id_30532>", "wss://relay.example.com"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["party", "requester"],
    ["forfeit_amount", "1500"],
    ["currency", "GBP"],
    ["trust_model", "fiat-escrow"],
    ["forfeit_reason", "no_show"],
    ["refund_amount", "0"],
    ["refund_to", "provider"],
    ["forfeited_at", "1698766500"],
    ["payment_rail", "strike"],
    ["grace_period_seconds", "300"],
    ["waited_seconds", "600"]
  ],
  "content": ""
}
```

**Tag reference:**

| Tag | Required | Format | Description |
|-----|----------|--------|-------------|
| `d` | Yes | `<task_id>:forfeit:<party>` | Forfeit identifier. |
| `e` | Yes | `<event_id>`, `<relay>` | References the Stake Lock event (kind 30532) being forfeited. |
| `domain` | Recommended | String | Domain identifier. |
| `task_id` | Yes | String | Task identifier. |
| `party` | Yes | `requester` or `provider` | Which party's funds are forfeited. |
| `forfeit_amount` | Yes | Integer string | Amount forfeited. |
| `currency` | Yes | ISO 4217 or crypto code | Currency. |
| `trust_model` | Recommended | Enumerated string | Trust model. |
| `forfeit_reason` | Yes | Enumerated string | Why funds are forfeited (see Forfeit Reasons). |
| `refund_amount` | Recommended | Integer string | Amount refunded to the forfeiting party (may be partial). |
| `refund_to` | Recommended | `requester`, `provider`, or `operator` | Who receives the forfeited funds. |
| `forfeited_at` | Recommended | Unix timestamp | When the forfeiture was executed. |
| `payment_rail` | Recommended | String | Payment rail used. |
| `grace_period_seconds` | Optional | Integer string | Grace period that was configured. |
| `waited_seconds` | Optional | Integer string | How long the non-offending party waited. |

#### Forfeit Reasons

| Reason | Description | Typical Refund |
|--------|-------------|---------------|
| `no_show` | Party failed to appear after commitment | 0% refund to offending party, 100% to counterparty |
| `late_cancellation` | Cancelled after grace period | Domain-defined penalty (typically 50%) |
| `abandonment` | Provider left during active task | 0% refund to provider, full refund to requester |
| `misconduct` | Proven misconduct via dispute resolution | 0% refund to offending party |
| `dispute_loss` | Lost a formal dispute | Per arbiter ruling |
| `repeated_no_show` | Recurring no-show pattern (escalated penalty) | 0% refund, potential account suspension |

#### Cancellation Policies

Cancellation policies are **domain-defined**, not specified by this protocol. Common patterns:

| Domain | Grace Period | Post-Grace Penalty | No-Show Penalty |
|--------|-------------|-------------------|-----------------|
| Ridesharing | 2 minutes after match | 50% of stake | 100% of stake |
| Locksmith | 5 minutes after acceptance | 30% of quoted price | 100% of call-out fee |
| Delivery | Before collection | Free cancellation | 100% of stake |
| Security | 24 hours before shift | 50% of shift value | 100% of shift value |
| Emergency trades | 10 minutes after acceptance | Call-out fee only | 100% of stake |

#### Late Cancellation Forfeit Example

```json
{
  "kind": 30534,
  "pubkey": "<operator_hex_pubkey>",
  "created_at": 1698766200,
  "tags": [
    ["d", "task_r7k9m2:forfeit:requester"],
    ["e", "<stake_lock_event_id_30532>", "wss://relay.example.com"],
    ["domain", "ridesharing"],
    ["task_id", "task_r7k9m2"],
    ["party", "requester"],
    ["forfeit_amount", "750"],
    ["currency", "GBP"],
    ["trust_model", "fiat-escrow"],
    ["forfeit_reason", "late_cancellation"],
    ["refund_amount", "750"],
    ["refund_to", "provider"],
    ["forfeited_at", "1698766200"],
    ["payment_rail", "strike"],
    ["grace_period_seconds", "120"],
    ["waited_seconds", "480"]
  ],
  "content": "Requester cancelled 8 minutes after match (2-minute grace period)."
}
```

#### Dispute Loss Forfeit Example

```json
{
  "kind": 30534,
  "pubkey": "<operator_hex_pubkey>",
  "created_at": 1698770000,
  "tags": [
    ["d", "task_lk42x8:forfeit:provider"],
    ["e", "<stake_lock_event_id_30532>", "wss://relay.example.com"],
    ["e", "<dispute_resolution_event_id>", "wss://relay.example.com"],
    ["domain", "locksmith"],
    ["task_id", "task_lk42x8"],
    ["party", "provider"],
    ["forfeit_amount", "12000"],
    ["currency", "GBP"],
    ["trust_model", "operator-escrow"],
    ["forfeit_reason", "dispute_loss"],
    ["refund_amount", "0"],
    ["refund_to", "requester"],
    ["forfeited_at", "1698770000"]
  ],
  "content": "Dispute resolved in favour of requester. Provider damaged door frame during entry."
}
```

---

### Kind 30535: Payment Receipt

Published by the operator (or provider in direct-payment scenarios) as final confirmation that money has changed hands. This is the settlement record — the immutable proof that payment was made.

```json
{
  "kind": 30535,
  "pubkey": "<operator_hex_pubkey>",
  "created_at": 1698766600,
  "tags": [
    ["d", "task_abc123:receipt"],
    ["e", "<stake_release_event_id_30533>", "wss://relay.example.com"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["payer", "<requester_hex_pubkey>"],
    ["payee", "<provider_hex_pubkey>"],
    ["amount", "1425"],
    ["currency", "GBP"],
    ["trust_model", "fiat-escrow"],
    ["gross_amount", "1500"],
    ["operator_fee", "75"],
    ["payment_rail", "strike"],
    ["settlement_reference", "str_pi_3Nk..."],
    ["settled_at", "1698766600"],
    ["payment_count", "50"],
    ["receipt_type", "final"]
  ],
  "content": ""
}
```

**Tag reference:**

| Tag | Required | Format | Description |
|-----|----------|--------|-------------|
| `d` | Yes | `<task_id>:receipt` or `<task_id>:receipt:<sequence>` | Receipt identifier. Multiple receipts for milestone/streaming tasks. |
| `e` | Recommended | `<event_id>`, `<relay>` | References the triggering event (Stake Release, Streaming Tick, or Forfeit). |
| `domain` | Recommended | String | Domain identifier. |
| `task_id` | Yes | String | Task identifier. |
| `payer` | Yes | Hex pubkey | Who paid. |
| `payee` | Yes | Hex pubkey | Who received payment. |
| `amount` | Yes | Integer string | Net amount received by the payee. |
| `currency` | Yes | ISO 4217 or crypto code | Currency. |
| `trust_model` | Recommended | Enumerated string | Trust model. |
| `gross_amount` | Recommended | Integer string | Amount before fees. |
| `operator_fee` | Optional | Integer string | Operator fee. |
| `payment_rail` | Recommended | String | Payment rail used. |
| `settlement_reference` | Optional | String | External reference from the payment rail. |
| `settled_at` | Recommended | Unix timestamp | When settlement was confirmed. |
| `payment_count` | Optional | Integer string | For streaming tasks: total number of streaming ticks. |
| `receipt_type` | Recommended | `final`, `milestone`, `partial` | Type of receipt. |

---

### Kind 30536: Streaming Tick

Published during an active task at regular intervals to provide periodic proof-of-payment. Each tick includes a cumulative total for auditability — if any tick is lost, the cumulative field allows reconstruction.

```json
{
  "kind": 30536,
  "pubkey": "<operator_hex_pubkey>",
  "created_at": 1698765830,
  "tags": [
    ["d", "task_abc123:tick:042"],
    ["e", "<payment_terms_event_id_30531>", "wss://relay.example.com"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["tick_number", "42"],
    ["amount", "25"],
    ["currency", "GBP"],
    ["trust_model", "fiat-escrow"],
    ["cumulative", "1050"],
    ["interval_seconds", "30"],
    ["payment_proof", "str_pi_tick_42..."],
    ["payment_rail", "strike"],
    ["provider_lat", "51.5074"],
    ["provider_lon", "-0.1278"]
  ],
  "content": ""
}
```

**Tag reference:**

| Tag | Required | Format | Description |
|-----|----------|--------|-------------|
| `d` | Yes | `<task_id>:tick:<sequence>` | Unique per tick. Sequence is zero-padded for ordering. |
| `e` | Recommended | `<event_id>`, `<relay>` | References the Payment Terms event (kind 30531). |
| `domain` | Recommended | String | Domain identifier. |
| `task_id` | Yes | String | Task identifier. |
| `tick_number` | Yes | Integer string | Sequence number (1-indexed). Monotonically increasing. |
| `amount` | Yes | Integer string | Amount for this individual tick. |
| `currency` | Yes | ISO 4217 or crypto code | Currency. |
| `trust_model` | Recommended | Enumerated string | Trust model. |
| `cumulative` | Yes | Integer string | Running total of all ticks so far (including this one). Enables auditability. |
| `interval_seconds` | Recommended | Integer string | Configured interval between ticks. |
| `payment_proof` | Optional | String | External proof of payment (Lightning preimage, Stripe PI reference, etc.). |
| `payment_rail` | Recommended | String | Payment rail used. |
| `provider_lat` | Optional | Decimal string | Provider latitude at time of tick (for transit-based services). |
| `provider_lon` | Optional | Decimal string | Provider longitude at time of tick. |

#### Streaming Models by Domain

| Domain | Typical Interval | Rate Basis | Example |
|--------|-----------------|------------|---------|
| Ridesharing | 30 seconds | Distance + time | GBP 0.25/tick while moving, GBP 0.10/tick while stationary |
| Security guard | 3600 seconds (hourly) | Time | GBP 15.00/hour |
| Babysitting | 3600 seconds (hourly) | Time | GBP 12.00/hour |
| Delivery | Per 100 metres | Distance | GBP 0.05/100m |
| Cleaning | 1800 seconds (half-hourly) | Time | GBP 7.50/half-hour |

#### Auditable Cumulative Field

The `cumulative` field on each tick MUST equal the sum of all `amount` values from tick 1 through the current tick (inclusive). This enables:

1. **Gap detection** — If tick 41 has cumulative 1025 and tick 43 has cumulative 1075, tick 42 (amount 25) is missing
2. **Final reconciliation** — The last tick's cumulative MUST match the total in the Payment Receipt (kind 30535)
3. **Dispute evidence** — Either party can present the tick stream as evidence in a dispute

#### Hourly Streaming Example (Security Guard)

```json
{
  "kind": 30536,
  "pubkey": "<operator_hex_pubkey>",
  "created_at": 1698769200,
  "tags": [
    ["d", "task_sec88q1:tick:003"],
    ["e", "<payment_terms_event_id>", "wss://relay.example.com"],
    ["domain", "security"],
    ["task_id", "task_sec88q1"],
    ["tick_number", "3"],
    ["amount", "1500"],
    ["currency", "GBP"],
    ["trust_model", "operator-escrow"],
    ["cumulative", "4500"],
    ["interval_seconds", "3600"],
    ["payment_rail", "strike"],
    ["provider_lat", "51.5155"],
    ["provider_lon", "-0.1416"]
  ],
  "content": ""
}
```

---

## Payment Flows

This section defines the five standard payment flows with sequence diagrams and event references.

### Flow 1: Simple Quote & Pay

The simplest flow — a single quote, acceptance, task completion, and final payment. No escrow.

```
Requester               Provider                Operator
    |                       |                       |
    |── Task Request ──→ |                       |
    |   (kind 30500)        |                       |
    |                       |                       |
    |                  ←── Quote ──                  |
    |                  (kind 30530)                  |
    |                       |                       |
    |── Accept Quote ─────→ |                       |
    |   (kind 30501)        |                       |
    |                       |                       |
    |                  ←── Task Update (in_progress) ──|
    |                  (kind 30503)                  |
    |                       |                       |
    |              ... task in progress ...          |
    |                       |                       |
    |                  ←── Task Complete ──          |
    |                  (kind 30504)                  |
    |                       |                       |
    |── Direct Payment ───→ |                       |
    |   (off-protocol)      |                       |
    |                       |                       |
    |                       |              ←── Payment Receipt ──
    |                       |              (kind 30535)
```

**Events published**: 30500, 30530, 30501, 30503, 30504, 30535

This flow uses `trust_model: direct` — no escrow, no operator custody. Suitable for low-value tasks or where parties have established trust.

#### Simple Flow Event Example (Payment Receipt)

```json
{
  "kind": 30535,
  "pubkey": "<provider_hex_pubkey>",
  "created_at": 1698766600,
  "tags": [
    ["d", "task_cw12x5:receipt"],
    ["domain", "locksmith"],
    ["task_id", "task_cw12x5"],
    ["payer", "<customer_pubkey>"],
    ["payee", "<locksmith_pubkey>"],
    ["amount", "7500"],
    ["currency", "GBP"],
    ["trust_model", "direct"],
    ["payment_rail", "cash"],
    ["settled_at", "1698766600"],
    ["receipt_type", "final"]
  ],
  "content": ""
}
```

---

### Flow 2: Escrowed

The standard escrow flow — both parties lock stakes, service is performed, and funds are released on completion.

```
Requester               Provider                Operator
    |                       |                       |
    |── Task Request ──→ |                       |
    |   (kind 30500)        |                       |
    |                       |                       |
    |                  ←── Quote ──                  |
    |                  (kind 30530)                  |
    |                       |                       |
    |── Accept Quote ─────→ |                       |
    |   (kind 30501)        |                       |
    |                       |                       |
    |                       |              ←── Payment Terms ──
    |                       |              (kind 30531)
    |                       |                       |
    |              ←── Stake Lock (requester) ──     |
    |              (kind 30532)                      |
    |                       |                       |
    |                  ←── Stake Lock (provider) ──  |
    |                  (kind 30532)                  |
    |                       |                       |
    |              ... both stakes locked ...        |
    |                       |                       |
    |                  ←── Task Update (in_progress) ──|
    |                  (kind 30503)                  |
    |                       |                       |
    |              ... task in progress ...          |
    |                       |                       |
    |                  ←── Task Complete ──          |
    |                  (kind 30504)                  |
    |                       |                       |
    |              ←── Stake Release (requester) ──  |
    |              (kind 30533, returned)             |
    |                       |                       |
    |                  ←── Stake Release (provider) ──
    |                  (kind 30533, paid)             |
    |                       |                       |
    |              ←── Payment Receipt ──            |
    |              (kind 30535)                      |
```

**Events published**: 30500, 30530, 30501, 30531, 30532 (x2), 30503, 30504, 30533 (x2), 30535

---

### Flow 3: Streaming

For tasks billed by time or distance, payments stream during the active task. Useful for ridesharing, security shifts, and cleaning.

```
Requester               Provider                Operator
    |                       |                       |
    |── Task Request ──→ |                       |
    |   (kind 30500)        |                       |
    |                       |                       |
    |                  ←── Quote ──                  |
    |                  (kind 30530)                  |
    |                       |                       |
    |── Accept Quote ─────→ |                       |
    |                       |                       |
    |                       |              ←── Payment Terms ──
    |                       |              (kind 30531, payment_type: streaming)
    |                       |                       |
    |              ←── Stake Lock (requester) ──     |
    |              (kind 30532)                      |
    |                  ←── Stake Lock (provider) ──  |
    |                  (kind 30532)                  |
    |                       |                       |
    |                  ←── Task Update (in_progress) ──|
    |                  (kind 30503)                  |
    |                       |                       |
    |              ←── Streaming Tick #1 ──          |
    |              (kind 30536, cumulative: 25)      |
    |                       |                       |
    |              ←── Streaming Tick #2 ──          |
    |              (kind 30536, cumulative: 50)      |
    |                       |                       |
    |              ... ticks continue ...            |
    |                       |                       |
    |              ←── Streaming Tick #N ──          |
    |              (kind 30536, cumulative: 1250)    |
    |                       |                       |
    |                  ←── Task Complete ──          |
    |                  (kind 30504)                  |
    |                       |                       |
    |              ←── Stake Release (both) ──       |
    |              (kind 30533 x2)                   |
    |                       |                       |
    |              ←── Payment Receipt ──            |
    |              (kind 30535, total matches         |
    |               final cumulative)                |
```

**Events published**: 30500, 30530, 30501, 30531, 30532 (x2), 30503, 30536 (xN), 30504, 30533 (x2), 30535

#### Streaming Reconciliation

On task completion, the Payment Receipt's `amount` MUST equal the final Streaming Tick's `cumulative` value (minus operator fees). If they differ, either party MAY file a dispute.

---

### Flow 4: Milestone

For multi-stage tasks, the total payment is divided across milestones. Each milestone triggers a partial release. The provider receives payment incrementally as work progresses.

```
Requester               Provider                Operator
    |                       |                       |
    |── Task Request ──→ |                       |
    |   (kind 30500)        |                       |
    |                       |                       |
    |                  ←── Quote ──                  |
    |                  (kind 30530)                  |
    |                       |                       |
    |── Accept Quote ─────→ |                       |
    |                       |                       |
    |                       |              ←── Payment Terms ──
    |                       |              (kind 30531, payment_type: milestone,
    |                       |               milestone tags define stages)
    |                       |                       |
    |              ←── Stake Lock (full amount) ──   |
    |              (kind 30532)                      |
    |                       |                       |
    |                  ←── Task Update (in_progress) ──|
    |                  (kind 30503)                  |
    |                       |                       |
    |          ... Milestone 1: Diagnosis ...        |
    |                       |                       |
    |              ←── Stake Release (M1) ──         |
    |              (kind 30533, milestone_id: 1,     |
    |               release_reason: milestone)       |
    |                       |                       |
    |          ... Milestone 2: Emergency repair ... |
    |                       |                       |
    |              ←── Stake Release (M2) ──         |
    |              (kind 30533, milestone_id: 2)     |
    |                       |                       |
    |          ... Milestone 3: Permanent fix ...    |
    |                       |                       |
    |              ←── Stake Release (M3) ──         |
    |              (kind 30533, milestone_id: 3)     |
    |                       |                       |
    |          ... Milestone 4: Testing ...          |
    |                       |                       |
    |              ←── Stake Release (M4, final) ──  |
    |              (kind 30533, milestone_id: 4)     |
    |                       |                       |
    |                  ←── Task Complete ──          |
    |                  (kind 30504)                  |
    |                       |                       |
    |              ←── Payment Receipt ──            |
    |              (kind 30535, receipt_type: final,  |
    |               total = sum of all milestones)   |
```

**Events published**: 30500, 30530, 30501, 30531, 30532, 30503, 30533 (x4 milestones), 30504, 30535

#### Abandoned Milestone Task

If the provider abandons after milestone 2 of 4:

```
    |              ←── Stake Release (M1) ──         |
    |              (kind 30533, milestone_id: 1)     |
    |                       |                       |
    |              ←── Stake Release (M2) ──         |
    |              (kind 30533, milestone_id: 2)     |
    |                       |                       |
    |          ... provider abandons ...             |
    |                       |                       |
    |              ←── Stake Forfeit (M3+M4) ──      |
    |              (kind 30534, forfeit_reason:      |
    |               abandonment, refund_to:          |
    |               requester)                       |
```

Milestones 1 and 2 are paid (work was done). Milestones 3 and 4 are forfeited back to the requester.

---

### Flow 5: Split

For tasks involving multiple providers, the payment is divided according to pre-agreed splits. Each provider receives their portion independently.

```
Requester               Provider A              Provider B              Operator
    |                       |                       |                       |
    |── Task Request ──→ |                       |                       |
    |   (kind 30500)        |                       |                       |
    |                       |                       |                       |
    |                       |                       |              ←── Payment Terms ──
    |                       |                       |              (kind 30531,
    |                       |                       |               payment_type: split,
    |                       |                       |               split tags per provider)
    |                       |                       |                       |
    |              ←── Stake Lock (requester) ──     |                       |
    |              (kind 30532, full amount)          |                       |
    |                       |                       |                       |
    |              ... task in progress ...          |                       |
    |                       |                       |                       |
    |                  ←── Task Complete ──          |                       |
    |                  (kind 30504)                  |                       |
    |                       |                       |                       |
    |                       |              ←── Stake Release (Provider A) ── |
    |                       |              (kind 30533)                      |
    |                       |                       |                       |
    |                       |                  ←── Stake Release (Provider B) ──
    |                       |                  (kind 30533)                  |
    |                       |                       |                       |
    |              ←── Payment Receipt ──            |                       |
    |              (kind 30535, receipt_type: final)  |                       |
```

**Events published**: 30500, 30531, 30532, 30504, 30533 (x providers), 30535

#### Split Release Examples

**Provider A (lead guard):**
```json
{
  "kind": 30533,
  "pubkey": "<operator_hex_pubkey>",
  "created_at": 1698795600,
  "tags": [
    ["d", "task_sec88q1:release:provider_a"],
    ["e", "<stake_lock_event_id>", "wss://relay.example.com"],
    ["domain", "security"],
    ["task_id", "task_sec88q1"],
    ["party", "provider"],
    ["p", "<guard_a_pubkey>"],
    ["amount", "21600"],
    ["currency", "GBP"],
    ["trust_model", "operator-escrow"],
    ["release_reason", "completed"],
    ["gross_amount", "24000"],
    ["operator_fee", "2400"],
    ["split_role", "lead_guard"],
    ["released_at", "1698795600"],
    ["payment_rail", "strike"]
  ],
  "content": ""
}
```

**Provider B (support guard):**
```json
{
  "kind": 30533,
  "pubkey": "<operator_hex_pubkey>",
  "created_at": 1698795600,
  "tags": [
    ["d", "task_sec88q1:release:provider_b"],
    ["e", "<stake_lock_event_id>", "wss://relay.example.com"],
    ["domain", "security"],
    ["task_id", "task_sec88q1"],
    ["party", "provider"],
    ["p", "<guard_b_pubkey>"],
    ["amount", "21600"],
    ["currency", "GBP"],
    ["trust_model", "operator-escrow"],
    ["release_reason", "completed"],
    ["gross_amount", "24000"],
    ["operator_fee", "2400"],
    ["split_role", "support_guard"],
    ["released_at", "1698795600"],
    ["payment_rail", "strike"]
  ],
  "content": ""
}
```

---

## NIP-47 Integration (Trustless Payments)

NIP-47 (Nostr Wallet Connect) enables **direct wallet-to-wallet payments** without intermediary custody. The operator orchestrates the payment flow by publishing signed events, but never holds funds.

### Trustless Escrow via Hold Invoices

```
1. Requester connects wallet via NIP-47 connection string
2. Operator requests hold invoice creation via make_hold_invoice
3. Provider pays the hold invoice (funds locked in requester's wallet, not settled)
4. Operator publishes Stake Lock (kind 30532) with trust_model: trustless
5. Task proceeds normally
6. On completion:
   a. Operator publishes Task Complete (kind 30504)
   b. Operator triggers settle_hold_invoice via NIP-47
   c. Requester's wallet settles (provider receives payment)
   d. Operator publishes Stake Release (kind 30533)
7. On cancellation:
   a. Operator triggers cancel_hold_invoice via NIP-47
   b. Funds return to provider
   c. Operator publishes Stake Release (kind 30533, release_reason: cancelled_mutual)
```

### NIP-47 Method Mapping

| NIP-47 Method | TROTT-04 Event | Direction |
|---------------|----------------|-----------|
| `make_hold_invoice` | Stake Lock (30532) | Lock funds |
| `settle_hold_invoice` | Stake Release (30533) | Release to counterparty |
| `cancel_hold_invoice` | Stake Release (30533) | Return to original holder |
| `pay_invoice` | Streaming Tick (30536) | Per-tick payment |

### Trustless Streaming via NIP-47

For streaming payments, each tick corresponds to a `pay_invoice` call:

```
1. Payment Terms (30531) defines streaming_rate and interval
2. During active task, operator sends pay_invoice via NIP-47 at each interval
3. Requester's wallet auto-approves up to pre-authorised limit
4. Each successful payment triggers a Streaming Tick (30536) event
5. Provider receives sats directly — operator never has custody
```

---

## Relay Filter Patterns

### Querying Quotes for a Task

```json
{
  "kinds": [30530],
  "#e": ["<service_request_event_id>"]
}
```

### Querying Payment Terms for a Task

```json
{
  "kinds": [30531],
  "#d": ["task_abc123:terms"]
}
```

### Querying All Stake Locks for a Task

```json
{
  "kinds": [30532],
  "#task_id": ["task_abc123"]
}
```

### Querying All Payment Events for a Task

```json
{
  "kinds": [30530, 30531, 30532, 30533, 30534, 30535, 30536],
  "#task_id": ["task_abc123"]
}
```

### Querying Streaming Ticks for a Task (Ordered)

```json
{
  "kinds": [30536],
  "#task_id": ["task_abc123"]
}
```

Results are ordered by `created_at`. The `tick_number` tag enables reconstruction of the correct sequence even if relay ordering differs.

---

## Event Chain Integrity

Payment events form an auditable chain via `e` tag references:

```
Task Request (30500)
    └── Quote (30530) references request via e tag
        └── Payment Terms (30531) references accepted quote via e tag
            ├── Stake Lock (30532) references terms via e tag
            │   ├── Stake Release (30533) references lock via e tag
            │   │   └── Payment Receipt (30535) references release via e tag
            │   └── Stake Forfeit (30534) references lock via e tag
            └── Streaming Tick (30536) references terms via e tag
```

Any participant or third party can reconstruct the complete payment history for a task by following the `e` tag chain from the Payment Receipt back to the original Task Request. Every event in the chain is cryptographically signed and independently verifiable.

---

## GDPR Compliance

Payment events contain pseudonymous identifiers (pubkeys) and financial data. Under GDPR:

1. **Payment events are business records** — Operators have a legitimate interest (Article 6(1)(f)) and legal obligation (tax law) to retain payment records for the statutory period (typically 6 years in the UK)
2. **Right to erasure** — Does not override legal retention requirements for financial records. After the retention period, crypto-shredding (destroying the key pair) renders pubkeys unlinkable.
3. **Encrypted details** — Sensitive payment details (card numbers, bank details) MUST be exchanged via NIP-44 encrypted payloads, never in plaintext event tags.
4. **Amount visibility** — The `amount` and `currency` tags on public events reveal transaction values. Operators requiring amount privacy SHOULD use NIP-44 encryption for the amount fields and publish only a commitment hash publicly.

---

## See Also

- **TROTT-01**: Core protocol (task lifecycle, state machine, Task Request kind 30500, Task Complete kind 30504)
- **TROTT-03**: Reputation (stake evidence tag for rating credibility)
- **NIP-01**: Basic protocol flow and event format
- **NIP-33**: Parameterised replaceable events (d tag deduplication)
- **NIP-40**: Expiration timestamps (quote validity, lock expiry)
- **NIP-44**: Encrypted payloads (sensitive payment details)
- **NIP-47**: Nostr Wallet Connect (trustless payment flows)
- **NIP-57**: Lightning Zaps (tip integration on completion events)
