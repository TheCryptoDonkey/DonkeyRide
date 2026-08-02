# DonkeyRide — Reference Implementation of the TROTT Protocol

> **The reference operator server for trust-minimised service coordination on Nostr**

[![Licence: MIT](https://img.shields.io/badge/Licence-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Protocol: TROTT](https://img.shields.io/badge/Protocol-TROTT_v4.0-blue.svg)](https://github.com/TheCryptoDonkey/trott)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)

---

## What is DonkeyRide?

DonkeyRide is the **reference implementation** of the [TROTT Protocol](https://github.com/TheCryptoDonkey/trott) (**T**rusted **R**eal-world **O**rchestration of **T**asks & **T**rades). It's a Node.js operator server that coordinates tasks, manages stakes, and processes payments across multiple service domains.

**For the protocol specification** (TROTT-01 through TROTT-08, domain profiles, implementor guides), see the [trott repository](https://github.com/TheCryptoDonkey/trott).

### Implemented Domains

| Domain | Env Var | Description |
|--------|---------|-------------|
| **Ridesharing** | `DOMAIN=ridesharing` | Rider/driver coordination, stake escrow, live tracking |
| **Locksmith** | `DOMAIN=locksmith` | Customer/locksmith dispatch, quote negotiation, flat-rate pricing |
| **Delivery** | `DOMAIN=delivery` | Sender/courier, chain of custody, photo/signature proofs |

Six additional domains have [TROTT domain profiles](https://github.com/TheCryptoDonkey/trott/tree/main/domains) but await implementation profiles: towing, emergency trades, pet services, security, cleaning, and moving.

---

## Quick Start

### Option A: Nix (recommended)
```bash
git clone https://github.com/TheCryptoDonkey/DonkeyRide
cd DonkeyRide
nix develop

# Start all services (PostgreSQL, Redis, Nostr relay, mock Lightning)
nix run .#services

# In another terminal
npm install && npm run dev
```

### Option B: Docker
```bash
git clone https://github.com/TheCryptoDonkey/DonkeyRide
cd DonkeyRide
docker compose --profile dev up
```

### Run with a different domain
```bash
DOMAIN=locksmith npm start     # Locksmith dispatch
DOMAIN=delivery npm start      # Parcel delivery
DOMAIN=ridesharing npm start   # Default (ridesharing)
```

---

## Commands

```bash
npm start              # Run operator server (Express on PORT=3000, WebSocket on WS_PORT=3001)
npm run dev            # Development mode with nodemon auto-reload
npm test               # Run all tests (Node.js built-in test runner)
npm run web:dev        # React frontend dev server (Vite, in web/)
npm run web:build      # Build React frontend (tsc + vite build)
npm run web:test       # Run frontend tests (vitest)
npm run docker:build   # Build Docker image
npm run docker:run     # Run Docker container with .env
```

**Frontend dependencies are separate** — run `npm install` in `web/` before using `web:*` commands.

---

## Architecture

DonkeyRide uses a **three-layer federated architecture**:

```
NOSTR (public, permanent)     →  Discovery + Reputation + State snapshots (durability)
OPERATOR (thin, non-custodial)→  Coordination only. No database, no custody of funds.
SETTLEMENT                    →  Peer-to-peer (cash / wallet-to-wallet). Operator moves nothing.
```

The operator is a **thin compliance layer** — handling only what the law mandates. Everything else runs on decentralised rails:

- **Stake custody** → operator-configured rail, from record-only cash (no custody at all) to hodl invoices; NIP-47 wallet-to-wallet planned
- **PII exchange** → operator-held over authenticated HTTPS/WSS today; NIP-17 gift-wrapped P2P exchange is specified but not yet implemented in this server (no PII is published to relays either way)
- **Coordination** → NIP-44 encrypted Nostr events
- **Discovery** → Geohash-based on public relays
- **Reputation** → Cryptographically signed on Nostr

See the [architecture documentation](https://github.com/TheCryptoDonkey/trott/blob/main/docs/architecture.md) for the full analysis.

### Payment Providers

The implementation is **payment-agnostic**. Every monetary event includes explicit `amount`, `currency`, and `trust_model` tags.

Implemented today:

| Provider | Trust Model | Currencies | Status |
|----------|------------|------------|--------|
| Cash (record-only) | `social` | Any | Working — the operator never touches money |
| LND (hodl invoices) | `trustless` | SAT/BTC | Semantics proven on regtest: release cancels (refund), forfeit settles (real penalty) |
| Demo | `demo` | Any | Testing and demos only |
| BTCPay / Alby / CLN | `custodial` | SAT/BTC | Experimental — never verified against their real APIs |

Planned (the factory rejects these with a clear error rather than pretending): NIP-47/NWC hold invoices (`trustless`), Cashu ecash, Stripe (pure fiat), M-Pesa (mobile money).

Selected via `PAYMENT_PROVIDER` env var. See [docs/PAYMENT-PROVIDERS.md](./docs/PAYMENT-PROVIDERS.md) for integration details.

---

## Documentation

### Implementation Docs (this repo)
- **[docs/PAYMENT-PROVIDERS.md](./docs/PAYMENT-PROVIDERS.md)** — Payment provider integration guide
- **[docs/GDPR-COMPLIANCE.md](./docs/GDPR-COMPLIANCE.md)** — GDPR compliance architecture
- **[docs/API-STRESS-TEST.md](./docs/API-STRESS-TEST.md)** — API stress test results
- **[DOCKER-SETUP.md](./DOCKER-SETUP.md)** — Docker deployment guide
- **[MULTI-OPERATOR-SETUP.md](./MULTI-OPERATOR-SETUP.md)** — Multi-operator configuration

### Protocol Docs (trott repo)
- **[TROTT Specifications](https://github.com/TheCryptoDonkey/trott)** — Full protocol specification
- **[Quick Reference](https://github.com/TheCryptoDonkey/trott/blob/main/specs/QUICK-REFERENCE.md)** — Event kind table and structure overview
- **[Implementor Guides](https://github.com/TheCryptoDonkey/trott/tree/main/guides)** — Step-by-step build guides for each domain
- **[Architecture](https://github.com/TheCryptoDonkey/trott/blob/main/docs/architecture.md)** — Three-layer federated architecture
- **[Trust Mechanisms](https://github.com/TheCryptoDonkey/trott/blob/main/docs/trust-mechanisms.md)** — 6 layers of trust

---

## Environment

Copy `.env.example` for configuration. Key variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DOMAIN` | Domain profile | `ridesharing` |
| `PAYMENT_PROVIDER` | Payment backend | `demo` |
| `NAVIGATION_PROVIDER` | Routing backend | `osrm` |
| `OPERATOR_PUBKEY` | Operator Nostr identity | — |
| `DATABASE_URL` | PostgreSQL connection | — |
| `REDIS_URL` | Redis connection | — |
| `NOSTR_RELAY` | Relay URL | — |

---

## Contributing

We welcome contributions to the reference implementation.

- **Submit issues** — found a bug or gap?
- **Add domain profiles** — implement a new domain in `src/domain-profiles/` (~100 lines)
- **Improve the frontend** — React/TypeScript SPA in `web/`
- **Add payment providers** — extend `payment-providers/base.js`

**For protocol specification contributions**, submit PRs to the [trott repository](https://github.com/TheCryptoDonkey/trott).

### Guidelines
1. Use **British English** spelling throughout
2. Maintain **backward compatibility** with the `RideManager` interface
3. Keep core code **domain-agnostic** — domain-specific logic belongs in the profile
4. Run `npm test` before submitting

---

## Licence

MIT Licence — Copyright (c) 2025-2026 DonkeyRide Community

See [LICENCE](./LICENCE) for the full text.

---

**Protocol specs?** See the [trott repository](https://github.com/TheCryptoDonkey/trott).

**Questions?** See the [FAQ](https://github.com/TheCryptoDonkey/trott/blob/main/docs/faq.md) or open an issue.
