# Payment Providers Integration Guide

**Last Updated**: 2026-02-08

---

## Overview

DonkeyRide is **payment-agnostic**. The protocol defines currency-neutral event schemas with explicit `amount`, `currency`, and `trust_model` tags. Any payment provider can be integrated by implementing the base provider interface and declaring its trust model and supported currencies.

### Design Principle: Bitcoin Rails, Fiat UX

Most customers won't care about Lightning or Bitcoin. The ideal flow:

1. Customer sees "pay £12.50" on their card
2. Strike converts to sats, sends over Lightning
3. Provider receives sats (or cashes out to fiat instantly)
4. Neither party had a taxable crypto event
5. The protocol got Lightning's speed and low fees

For users who want full Bitcoin: NIP-47 (Nostr Wallet Connect) lets them connect their own wallet directly. Hold invoices for trustless stakes. No intermediary needed.

---

## Trust Model Taxonomy

Every payment provider declares its trust model. This is surfaced to users on every monetary event so they can make informed choices.

| Trust Model | Description | Operator Custody | Example |
|------------|-------------|-----------------|---------|
| `trustless` | Direct wallet-to-wallet. Operator cannot touch funds. | None | NIP-47 hold invoices |
| `custodial-third-party` | Third party holds funds briefly. Operator never has custody. | None | Strike, PayPal, Alby |
| `custodial-escrow` | Third party holds funds in escrow until task completion. | None | Stripe |
| `custodial` | Operator's own infrastructure holds funds temporarily. | Yes | LND, Core Lightning, BTCPay |
| `federated` | Multi-party custody via ecash mint or federation. | Shared | Cashu, Fedimint |
| `smart-contract` | Programmatic escrow via DLCs or smart contracts. | None | Future |
| `mock` | Virtual funds for testing. | N/A | Demo provider |

---

## Payment Provider Matrix

| Provider | Trust Model | Currencies | Custody | Trustless Stakes | Best For |
|----------|------------|------------|---------|-----------------|----------|
| **NIP-47** (hold invoices) | `trustless` | SAT/BTC | None (user wallets) | Yes | Sovereignty-minded users |
| **Strike** | `custodial-third-party` | GBP/USD/EUR/SAT | Strike (brief) | No | Fiat UX, everyday use |
| **Stripe** | `custodial-escrow` | Any fiat | Stripe escrow | No | Fiat-only markets |
| **LND** (operator) | `custodial` | SAT | Operator node | Yes (hodl) | Operators with Lightning infra |
| **Core Lightning** | `custodial` | SAT | Operator node | Yes (hold) | Operators with CLN infra |
| **BTCPay Server** | `custodial` | SAT/BTC | Operator BTCPay | No | Self-hosted operators |
| **Alby** | `custodial-third-party` | SAT/EUR/USD | Alby | No | Browser wallet users |
| **Cashu** | `federated` | SAT (ecash) | Mint | Partial | Privacy-focused users |
| **Fedimint** | `federated` | SAT | Federation | Partial (multisig) | Community-run federations |
| **PayPal** | `custodial-third-party` | Any fiat | PayPal | No | Maximum accessibility |
| **Bank transfer** | `custodial-third-party` | Any fiat | None (direct) | No | Simple, no intermediary |
| **Demo** | `mock` | SAT (virtual) | None | N/A | Testing only |

---

## Provider Interface

All payment providers extend the base class in `payment-providers/base.js`. The core interface:

### Required Methods

```javascript
class PaymentProvider {
    // Lock a stake for a task
    async lockStake(taskId, userId, amount, type)
    // → Returns: { success, lockId, amount, lockedAt, proof, event }

    // Release a stake after successful completion
    async releaseStake(taskId)
    // → Returns: { success, releaseId, amount, releasedAt, proof, event }

    // Forfeit a stake (penalty for cancellation/no-show)
    async forfeitStake(taskId, cancellingParty, reason)
    // → Returns: { success, penalty, refund, reason, event }

    // Check stake status
    async getStakeStatus(taskId)
    // → Returns: { taskId, status, amount, lockedAt, expiresAt }

    // Health check
    async healthCheck()
    // → Returns: boolean

    // Provider capabilities
    getCapabilities()
    // → Returns: { name, type, trustModel, features, limits }

    // Trust model declaration
    getTrustModel()
    // → Returns: 'trustless' | 'custodial' | 'custodial-escrow' | etc.
}
```

### Currency-Neutral Amounts

The payment provider interface accepts currency-neutral amounts. The `amount` parameter is always a numeric value in the smallest unit of the specified currency (pence for GBP, cents for USD, satoshis for SAT):

```javascript
// GBP: £15.00 = 1500 (pence)
await provider.lockStake(taskId, userId, 1500, 'requester');

// SAT: 15,000 sats
await provider.lockStake(taskId, userId, 15000, 'requester');
```

The currency is determined by the operator's configuration, not by the provider interface. Events published to Nostr include the `currency` tag explicitly.

### Milestone Escrow

For multi-stage tasks (emergency trades, man with van), the interface supports partial release:

```javascript
// Release portion of stake at milestone
async partialRelease(taskId, amount, milestoneId)
// → Returns: { success, released, remaining, milestoneId }

// List milestones and their payment status
async getMilestones(taskId)
// → Returns: [{ milestoneId, description, amount, status }]
```

Each milestone triggers a kind 30537 event. The domain profile defines milestones for the use case. The final milestone releases the remainder.

---

## NIP-47 Integration (Trustless)

NIP-47 (Nostr Wallet Connect) enables **direct wallet-to-wallet payments** without any intermediary holding funds. This is the most decentralised payment option.

### How It Works

```
1. Requester connects wallet via NIP-47
2. Provider's wallet creates a hold invoice (make_hold_invoice)
3. Requester's wallet pays the hold invoice → funds locked in Lightning
4. Task progresses...
5. Operator publishes signed completion event
6. Completion triggers settlement (settle_hold_invoice)
7. Provider receives sats directly into their wallet
```

### NIP-47 Lifecycle Mapping

| DonkeyRide Operation | NIP-47 Method | When |
|----------------------|---------------|------|
| Lock stake | `make_hold_invoice` | Task accepted |
| Release stake | `settle_hold_invoice` | Task completed |
| Forfeit stake | `cancel_hold_invoice` | Cancellation/no-show |
| Streaming payment | `pay_invoice` (recurring) | During active task |

### Operator Role

The operator facilitates payment flow but never has custody:
- Triggers settlement by publishing a signed completion event (kind 30508)
- Sends `pay_invoice` requests at regular intervals during streaming
- Requester's wallet auto-approves payments up to pre-authorised limit
- If operator disappears mid-task: hold invoices time out and funds return automatically

### Configuration

```env
PAYMENT_PROVIDER=nip47
NIP47_RELAY=wss://relay.example.com
NIP47_CONNECT_STRING=nostr+walletconnect://...
```

---

## Strike Integration (Fiat UX)

Strike provides fiat UX on Lightning rails. Customers pay in their local currency; the conversion to Lightning happens transparently.

### How It Works

```
1. Requester pays £12.50 via Strike
2. Strike converts GBP → sats at current rate
3. Sats sent over Lightning to provider
4. Provider receives sats (or cashes out to GBP instantly via Strike)
5. Neither party had a taxable crypto event
```

### Trust Model

Trust model: `custodial-third-party`. Strike holds funds during conversion (milliseconds to seconds). The operator never has custody.

### Configuration

```env
PAYMENT_PROVIDER=strike
STRIKE_API_KEY=sk_live_...
STRIKE_DEFAULT_CURRENCY=GBP
```

---

## Stripe Integration (Pure Fiat)

Stripe provides pure fiat payment with escrow capability. Best for markets where Lightning adoption is low.

### How It Works

```
1. Requester pays £12.50 via Stripe checkout
2. Stripe holds £12.50 in escrow (Stripe Connect)
3. Task completes → operator confirms via Stripe API
4. Stripe releases funds to provider's Stripe account
```

### Trust Model

Trust model: `custodial-escrow`. Stripe holds funds in escrow until the operator confirms completion. The operator never has custody of payment funds.

### Configuration

```env
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_DEFAULT_CURRENCY=GBP
```

---

## Adding a New Payment Provider

To add a new provider:

### Step 1: Create Provider Class

Create `payment-providers/{name}.js` extending the base class:

```javascript
const PaymentProvider = require('./base');

class MyProvider extends PaymentProvider {
    constructor(config) {
        super(config);
        this.providerName = 'myprovider';
        this.type = 'custodial-third-party';
    }

    getTrustModel() {
        return 'custodial-third-party';
    }

    async lockStake(taskId, userId, amount, type) {
        this.validateStakeParams(taskId, amount);
        // ... provider-specific lock logic
        return {
            success: true,
            lockId: '...',
            amount,
            lockedAt: Date.now(),
            proof: { /* provider-specific */ },
            event: this.createStakeEvent('locked', { taskId, userId, amount, type })
        };
    }

    async releaseStake(taskId) { /* ... */ }
    async forfeitStake(taskId, cancellingParty, reason) { /* ... */ }
    async getStakeStatus(taskId) { /* ... */ }
    async healthCheck() { /* ... */ }
}

module.exports = MyProvider;
```

### Step 2: Register in Factory

Add the provider to `payment-providers/factory.js`:

```javascript
const providers = {
    // ... existing providers
    myprovider: () => require('./myprovider'),
};
```

### Step 3: Declare Capabilities

Override `getCapabilities()` to declare supported features, currencies, and limits:

```javascript
getCapabilities() {
    return {
        name: 'myprovider',
        type: 'custodial-third-party',
        trustModel: 'custodial-third-party',
        supportedCurrencies: ['GBP', 'USD', 'EUR'],
        features: {
            instantLock: true,
            instantRelease: true,
            partialForfeit: false,
            batchOperations: false,
            refunds: true,
            milestoneEscrow: false
        },
        limits: {
            minStake: 100,      // £1.00 (in pence)
            maxStake: 10000000, // £100,000
            maxDailyVolume: 50000000
        }
    };
}
```

---

## Configuration

### Environment Variables

```env
# Primary payment provider
PAYMENT_PROVIDER=strike          # strike|lnd|btcpay|alby|cln|nip47|stripe|demo

# Fallback chain (optional)
PAYMENT_FALLBACKS=lnd,demo       # Comma-separated fallback providers

# Provider-specific configuration
STRIKE_API_KEY=sk_live_...
LND_HOST=localhost:10009
LND_MACAROON_PATH=/path/to/admin.macaroon
LND_TLS_CERT_PATH=/path/to/tls.cert
BTCPAY_URL=https://btcpay.example.com
BTCPAY_API_KEY=...
ALBY_ACCESS_TOKEN=...
CLN_SOCKET_PATH=/path/to/lightning-rpc
NIP47_RELAY=wss://relay.example.com
STRIPE_SECRET_KEY=sk_live_...
```

### Resilient Stake Manager

The `ResilientStakeManager` in `payment-providers/factory.js` provides automatic failover:

```javascript
// If Strike fails, try LND, then demo
PAYMENT_PROVIDER=strike
PAYMENT_FALLBACKS=lnd,demo
```

The factory tries each provider in order until one succeeds. Health checks run on startup and periodically during operation.

---

## See Also

- **[specs/NIP-XX-payments.md](../specs/NIP-XX-payments.md)** — Payment event kinds and streaming models
- **[specs/NIP-XX-stakes.md](../specs/NIP-XX-stakes.md)** — Stake lifecycle and milestone escrow
- **[TRUST-MECHANISMS.md](../TRUST-MECHANISMS.md)** — 6 layers of trust
- **[payment-providers/base.js](../payment-providers/base.js)** — Base provider interface (source code)
- **[payment-providers/factory.js](../payment-providers/factory.js)** — Factory and resilient fallback (source code)
