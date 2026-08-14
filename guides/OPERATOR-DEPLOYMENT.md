# Operator Deployment Guide

**Last Updated**: 2026-02-08

---

## What Is an Operator?

An operator is a **standalone service** (not a Nostr relay) that:
- Coordinates tasks between requesters and providers
- Manages commitment stakes via any supported payment provider
- Publishes events TO existing Nostr relays (as a client)
- Handles safety monitoring, background checks, and compliance
- Earns fees (typically 1-5% of task value, operator-configurable)

## Key Distinction: Operator ≠ Nostr Relay

```
Operators:                          Nostr Relays:
- HTTP/REST services                - WebSocket services
- Stake coordination                - Store and relay events
- Publish TO Nostr relays           - Used by everyone
- Don't store events                - No DonkeyRide-specific logic
- Don't relay events
```

---

## Architecture

```
┌──────────────────────────────────┐
│   Nostr Relay Network            │
│   (Existing infrastructure)      │
│   - relay.damus.io               │
│   - nos.lol                      │
└──────────────────────────────────┘
         ↑                  ↑
         │  Events          │
         │                  │
    ┌────┴─────┐       ┌───┴──────┐
    │Requester │       │ Provider │
    └────┬─────┘       └───┬──────┘
         │                  │
         │  REST API        │
         └────┬─────────────┘
              ↓
    ┌─────────────────────────────┐
    │  DonkeyRide Operator        │
    │  - Express REST API         │
    │  - Payment provider(s)      │
    │  - Publishes to Nostr       │
    │  - Safety + compliance      │
    └─────────────────────────────┘
```

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/TheCryptoDonkey/DonkeyRide.git
cd DonkeyRide
npm install

# 2. Configure
cp .env.example .env
# Edit .env (see Configuration below)

# 3. Choose your domain
DOMAIN=ridesharing npm start   # Default
DOMAIN=locksmith npm start     # Locksmith dispatch
DOMAIN=delivery npm start      # Parcel delivery

# 4. Or use Docker
docker run -d \
  -p 3000:3000 \
  --env-file .env \
  donkeyride/operator:latest
```

---

## Domain Selection

The protocol is **domain-agnostic**. One codebase serves multiple use cases via the `DOMAIN` environment variable.

| Domain | Description | Pricing Model |
|--------|-------------|---------------|
| `ridesharing` | Rider/driver coordination | Distance + time + surge |
| `locksmith` | Locksmith dispatch | Flat rate (quote negotiation) |
| `delivery` | Parcel delivery | Distance-based |

Set `DOMAIN` in your `.env` file or pass it at startup. Each domain loads its own state machine, role names, pricing model, and feature flags.

To add a custom domain, create a profile in `src/domain-profiles/` (~100 lines). See the [use case catalogue](https://github.com/TheCryptoDonkey/trott/blob/main/docs/use-cases.md) for the full catalogue.

---

## Payment Provider Configuration

The operator is **payment-agnostic**. Choose one or more providers based on your trust model preference and target market.

### Provider Options

| Provider | Trust Model | Currencies | Best For |
|----------|------------|------------|----------|
| `nip47` | Trustless | SAT/BTC | Sovereignty-minded users |
| `strike` | Custodial third-party | GBP/USD/EUR/SAT | Fiat UX, everyday use |
| `stripe` | Custodial escrow | Any fiat | Fiat-only markets |
| `lnd` | Custodial (operator) | SAT | Operators with Lightning infra |
| `cln` | Custodial (operator) | SAT | Operators with CLN infra |
| `btcpay` | Custodial (operator) | SAT/BTC | Self-hosted operators |
| `alby` | Custodial third-party | SAT/EUR/USD | Browser wallet users |
| `demo` | Mock | SAT (virtual) | Testing only |

### Configuration

```env
# Primary provider
PAYMENT_PROVIDER=strike

# Fallback chain (optional — automatic failover)
PAYMENT_FALLBACKS=lnd,demo

# Provider-specific credentials
STRIKE_API_KEY=sk_live_...
STRIKE_DEFAULT_CURRENCY=GBP

LND_HOST=localhost:10009
LND_MACAROON_PATH=/path/to/admin.macaroon
LND_TLS_CERT_PATH=/path/to/tls.cert

NIP47_RELAY=wss://relay.example.com
NIP47_CONNECT_STRING=nostr+walletconnect://...

STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_DEFAULT_CURRENCY=GBP
```

The `ResilientStakeManager` tries each provider in order until one succeeds. Health checks run on startup and periodically during operation.

For detailed provider integration guides, see [../docs/PAYMENT-PROVIDERS.md](../docs/PAYMENT-PROVIDERS.md).

---

## GDPR Compliance

Operators are **data controllers** under GDPR. The three-layer architecture is designed for compliance, but operators must complete the following.

### Before Deployment

- [ ] **Data Protection Impact Assessment (DPIA)** — required under Article 35 for processing at scale
- [ ] **Record of Processing Activities (ROPA)** — required under Article 30
- [ ] **Data Protection Officer (DPO)** — appoint if processing personal data at scale
- [ ] **Privacy notice** — explain the three-layer architecture and what data goes where
- [ ] **Lawful basis documented** — for every category of personal data processed
- [ ] **Data Processing Agreements (DPAs)** — with all sub-processors (payment providers, relay operators, screening services)
- [ ] **Retention policies** — automated purge schedules (90 days for operational data, 7 years for tax/regulatory)

### Technical Requirements

- [ ] **NIP-62 compliant relay** — run or use a relay that supports Request to Vanish for operator-published events
- [ ] **Crypto-shredding capability** — ability to destroy user key pairs on erasure request
- [ ] **NIP-40 expiration** — all time-limited events include expiration timestamps
- [ ] **Automated data purge** — 90-day purge for GPS traces, chat messages, photos
- [ ] **Erasure workflow** — documented process for handling Article 17 requests within 30 days
- [ ] **Data export** — ability to provide machine-readable export (Article 20, right to portability)

### Ongoing Obligations

- [ ] Respond to **erasure requests** (Article 17) within 30 days
- [ ] Respond to **access requests** (Article 15) within 30 days
- [ ] Report **data breaches** to supervisory authority within 72 hours
- [ ] **Annual DPIA review** — update as processing changes

For the full compliance guide, see [../docs/GDPR-COMPLIANCE.md](../docs/GDPR-COMPLIANCE.md).

---

## Full Configuration Reference

### Required Variables

```env
OPERATOR_PUBKEY=npub1...          # Your Nostr public key
OPERATOR_NSEC=nsec1...            # Your Nostr private key (KEEP SECRET)
OPERATOR_LIGHTNING=you@getalby.com # Where you receive fees
PAYMENT_PROVIDER=strike            # See provider options above
DOMAIN=ridesharing                 # Domain profile
```

### Optional Variables

```env
# Server
PORT=3000                          # REST API port
WS_PORT=3001                       # WebSocket port
NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol

# Operator economics
OPERATOR_FEE_PERCENT=0.03          # 3% fee (range: 0.01-0.05)
BOND_AMOUNT=5000000                # Operator bond (sats)

# Security
ENABLE_NIP98_AUTH=true             # NIP-98 authentication
ENABLE_RATE_LIMITING=true          # Rate limiting

# Navigation (for domains that use it)
NAVIGATION_PROVIDER=osrm           # osrm|ors
OSRM_URL=http://localhost:5000
ORS_API_KEY=...

# Database
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
```

---

## Economics

Operator economics are currency-neutral. Revenue depends on task volume and fee percentage:

```
At 3% fee, £15 average task value:
100 tasks/day  × £15 × 3% = £45/day  = £1,350/month
1000 tasks/day × £15 × 3% = £450/day = £13,500/month

Costs: ~£10/month VPS (basic), ~£50/month (production with database)
Break-even: ~25 tasks/month at £15 average
```

Fees are competitive. Traditional platforms charge 25-30%. Operators competing on DonkeyRide typically charge 1-5%, with competition driving fees down.

---

## How It Works

1. **Operator announces** — Publishes bond event (kind 30540) to Nostr relays
2. **Clients discover** — Query Nostr relays for operators serving their area and domain
3. **Requester creates task** — Calls operator's REST API
4. **Provider accepts** — Operator coordinates matching
5. **Stakes locked** — Both parties lock commitment stakes via payment provider
6. **Task progresses** — State machine advances through domain-specific states
7. **Task completes** — Stakes released, payment settled, ratings published to Nostr
8. **Clients verify** — Check Nostr to verify operator's actions are consistent

---

## See Also

- **[QUICK-START.md](QUICK-START.md)** — Step-by-step setup guide
- **[../docs/PAYMENT-PROVIDERS.md](../docs/PAYMENT-PROVIDERS.md)** — Payment provider integration guide
- **[../docs/GDPR-COMPLIANCE.md](../docs/GDPR-COMPLIANCE.md)** — Full GDPR compliance guide
- **[Use Cases](https://github.com/TheCryptoDonkey/trott/blob/main/docs/use-cases.md)** — Use case catalogue and domain selection
- **[Trust Mechanisms](https://github.com/TheCryptoDonkey/trott/blob/main/docs/trust-mechanisms.md)** — 6 layers of trust
- **[Architecture](https://github.com/TheCryptoDonkey/trott/blob/main/docs/architecture.md)** — Three-layer federated architecture
- **[Quick Reference](https://github.com/TheCryptoDonkey/trott/blob/main/specs/QUICK-REFERENCE.md)** — Complete event kind reference
