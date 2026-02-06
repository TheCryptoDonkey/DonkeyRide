# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DonkeyRide is an open protocol standard for trust-minimised service coordination built on Nostr (decentralised messaging) and Lightning Network (Bitcoin payments). This repo contains the **reference operator server** — a Node.js backend that coordinates tasks, manages stakes, and processes payments. It is not a ridesharing company; it's a protocol spec with a working implementation that generalises across domains (ridesharing, locksmith dispatch, parcel delivery, etc.).

## Commands

```bash
npm start              # Run operator server (Express on PORT=3000, WebSocket on WS_PORT=3001)
npm run dev            # Development mode with nodemon auto-reload
npm test               # Run all tests (Node.js built-in test runner)
npm run docker:build   # Build Docker image
npm run docker:run     # Run Docker container with .env
```

**Run a single test file:**
```bash
node --test tests/integration/reputation-flow.test.js
node --test tests/integration/domain-profiles.test.js
```

**Nix development environment** (recommended):
```bash
nix develop                # Enter dev shell with Node.js 18, psql, redis-cli, etc.
nix run .#services         # Start all services (PostgreSQL, Redis, strfry, mock-lightning, OSRM)
npm run dev                # Start operator server with auto-reload
npm run dev:nix            # Shortcut: starts services + operator together
```

**Docker Compose** (alternative, also used for production):
```bash
docker compose up                          # Production services
docker compose --profile dev up            # Adds mock-lightning, adminer, redis-commander
```

**Run with a different domain:**
```bash
DOMAIN=locksmith npm start     # Locksmith dispatch server
DOMAIN=delivery npm start      # Parcel delivery server
DOMAIN=ridesharing npm start   # Default ridesharing (same as no DOMAIN)
```

## Architecture

### Domain Profile System

The protocol is **domain-agnostic**. One codebase serves multiple use cases via domain profiles loaded at startup from the `DOMAIN` env var (defaults to `ridesharing`).

```
src/domain-profiles/
├── schema.js          # Profile validation and schema definition
├── loader.js          # Loads profiles by ID, resolution order: built-in → file path
├── index.js           # Barrel export
├── ridesharing.js     # Default: rider/driver, geohash discovery, distance+time pricing
├── locksmith.js       # customer/locksmith, flatRate pricing, quote negotiation
└── delivery.js        # sender/courier, extra COLLECTED state, photo+signature proofs
```

Each profile defines: state machine (states + valid transitions), role names (requester/provider), pricing model, discovery method, completion proof types, rating criteria, feature flags, regulatory bodies, and Nostr event kind mappings.

**To add a new domain:** create `src/domain-profiles/{name}.js` exporting a profile object (~100 lines). The schema validates it on load.

### Task Manager (Generalised State Machine)

`src/task-manager.js` — `TaskManager` is the domain-agnostic lifecycle engine. Parameterised by a domain profile, it manages task creation, state transitions, identity resolution (pubkey/npub), and in-memory storage.

`src/ride-manager.js` — Backward compatibility layer. `RideManager` extends `TaskManager` with the ridesharing profile. All original methods (`createRide`, `acceptRide`, `RideStatus`, etc.) are preserved as aliases. Existing code importing from `ride-manager.js` works without changes.

### Entry Point & Server

`server.js` is the monolithic Express server (~2000 lines). It loads the domain profile, initialises `TaskManager`, sets up all REST endpoints, WebSocket server, Redis connection, and streaming payment timers. All API routes are defined inline.

### Payment Providers (Factory Pattern)

`payment-providers/factory.js` — Factory + fallback chain via `ResilientStakeManager`. All providers extend `payment-providers/base.js` with the interface: `lockStake()`, `releaseStake()`, `forfeitStake()`, `healthCheck()`, `getCapabilities()`.

Providers: `strike` (custodial), `lnd` (trustless hodl invoices), `btcpay` (self-hosted), `alby` (custodial), `cln` (Core Lightning), `demo` (mock for testing).

Selected via `PAYMENT_PROVIDER` env var, with optional `PAYMENT_FALLBACKS` for resilience. **Domain-independent** — works identically across all use cases.

### Navigation Providers (Factory Pattern)

`navigation/factory.js` — Same factory pattern. Providers: `osrm` (self-hosted), `ors` (OpenRouteService API). Selected via `NAVIGATION_PROVIDER` env var. **Domain-independent.**

### Nostr Integration

- **`src/nostr/reputation.js`** — Reputation queries (kind 30530 ratings) via `SimplePool`. 30-second cache. Rating tags are arbitrary — the domain profile defines which criteria to use. **Domain-independent.**
- **`src/nostr/stake-events.js`** — Publishes stake lock/release/penalty events. Uses generic task/ride tags. **Domain-independent.**

### Middleware

- **`middleware/nip98-auth.js`** — NIP-98 HTTP auth. Validates signed `Authorization: Nostr <base64>` headers (kind 27235). Toggle with `ENABLE_NIP98_AUTH`. **Domain-independent.**
- **`middleware/rate-limit.js`** — Rate limiting with separate tiers. Toggle with `ENABLE_RATE_LIMITING`. **Domain-independent.**

### Frontend

`public/` contains vanilla JS web apps: `rider-app.js`, `driver-app.js`, `demo.html`. No build step — served as static files.

### Three-Layer Architecture

```
NOSTR (public, permanent)     →  Discovery + Reputation + Operator Bonds
OPERATOR (private, compliant) →  PII + Coordination + Payments + Compliance
WEBSOCKET (ephemeral)         →  Real-time tracking + Live updates
```

## Testing

Uses Node.js built-in `node:test` module with `node:assert/strict`. Tests are in `tests/integration/`. Tests construct signed Nostr events manually for NIP-98 auth validation.

Key test files:
- `reputation-flow.test.js` — NIP-98 auth validation, rating event publishing, reputation caching
- `domain-profiles.test.js` — Schema validation, profile loading, TaskManager lifecycle across all domains, RideManager backward compatibility

## Environment

Copy `.env.example` for configuration. Key variables:
- `DOMAIN` — Domain profile selection (ridesharing|locksmith|delivery, default: ridesharing)
- `OPERATOR_PUBKEY` / `OPERATOR_PRIVKEY` — Operator Nostr identity
- `PAYMENT_PROVIDER` — Payment backend (strike|lnd|btcpay|alby|cln|demo)
- `NAVIGATION_PROVIDER` — Routing backend (osrm|ors)
- `DATABASE_URL` — PostgreSQL connection
- `REDIS_URL` — Redis connection
- `NOSTR_RELAY` — Relay URL for event publishing
- `ENABLE_NIP98_AUTH` / `ENABLE_RATE_LIMITING` — Security toggles

## Language & Style

All code, comments, documentation, commit messages, and user-facing strings must use **British English** spelling (e.g. colour, initialise, behaviour, licence, organise, authorisation, centre, metre, catalogue, serialise, favour, honour, recognise, customise).

## Protocol Reference

`NIP-XX-ridesharing.md` is the full protocol specification defining all event kinds. `QUICK-REFERENCE.md` has a summary table. `ARCHITECTURE.md` explains the federated model. `TRUST-MECHANISMS.md` details the 6 layers of trust.
