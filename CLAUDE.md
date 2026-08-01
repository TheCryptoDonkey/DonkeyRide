# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DonkeyRide is the **reference implementation** of the [TROTT Protocol](https://github.com/TheCryptoDonkey/trott) (**T**rusted **R**eal-world **O**rchestration of **T**asks & **T**rades) — a suite of 8 specifications for trust-minimised physical service coordination built on Nostr (decentralised messaging) with **payment-agnostic** financial rails (Lightning, Cashu, Strike, Stripe, NIP-47, and more). This repo contains the **reference operator server** — a Node.js backend that coordinates tasks, manages stakes, and processes payments. It is not a ridesharing company; it's a working implementation that generalises across 10+ domains (ridesharing, locksmith dispatch, parcel delivery, court serving, security guard dispatch, emergency trades, cleaning, moving, and more).

**Protocol specifications** (TROTT-01 through TROTT-08, domain profiles, implementor guides) live in the dedicated [trott repository](https://github.com/TheCryptoDonkey/trott). This repo focuses on implementation only.

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

**Run a single test file:**
```bash
node --test tests/integration/reputation-flow.test.js
node --test tests/integration/domain-profiles.test.js
```

**Frontend dependencies are separate** — run `npm install` in `web/` before using `web:*` commands.

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

Each profile defines: state machine (states + valid transitions), role names (requester/provider), UI labels (origin/destination/task noun/instructions), pricing model, discovery method, completion proof types, rating criteria, feature flags, regulatory bodies, and Nostr event kind mappings.

**Spec-only domains:** Six additional domains have TROTT domain profiles but not yet implementation profiles — towing, emergency trades, pet services, security, cleaning, and moving. See the [trott domain profiles](https://github.com/TheCryptoDonkey/trott/tree/main/domains) for their state machines and domain-specific tags. These await `src/domain-profiles/` implementations.

**To add a new domain:** create `src/domain-profiles/{name}.js` exporting a profile object (~100 lines). The schema validates it on load.

### Task Manager (Generalised State Machine)

`src/task-manager.js` — `TaskManager` is the domain-agnostic lifecycle engine. Parameterised by a domain profile, it manages task creation, state transitions, identity resolution (pubkey/npub), and in-memory storage.

`src/ride-manager.js` — Backward compatibility layer. `RideManager` extends `TaskManager` with the ridesharing profile. All original methods (`createRide`, `acceptRide`, `RideStatus`, etc.) are preserved as aliases. Existing code importing from `ride-manager.js` works without changes.

### Entry Point & Server

`server.js` is the monolithic Express server (~2000 lines). It loads the domain profile, initialises `TaskManager`, sets up all REST endpoints, WebSocket server, Redis connection, and streaming payment timers. All API routes are defined inline.

### Payment Providers (Factory Pattern)

`payment-providers/factory.js` — Factory + fallback chain via `ResilientStakeManager`. All providers extend `payment-providers/base.js` with the interface: `lockStake()`, `releaseStake()`, `forfeitStake()`, `healthCheck()`, `getCapabilities()`.

Providers: `cash` (record-only, no custody — fare settles face-to-face, inDrive model), `lnd` (custodial, operator hodl invoices), `btcpay` (custodial, self-hosted), `alby` (custodial-third-party), `cln` (custodial, Core Lightning), `demo` (mock for testing). Planned, not yet implemented: `nwc` (NIP-47 hold invoices), `stripe` (pure fiat), Cashu, M-Pesa — the factory throws a clear error if these are selected.

Every payment event includes explicit `amount`, `currency`, and `trust_model` tags. Amounts are in the smallest unit of the specified currency (pence for GBP, cents for USD, satoshis for SAT).

Selected via `PAYMENT_PROVIDER` env var, with optional `PAYMENT_FALLBACKS` for resilience. **Domain-independent** — works identically across all use cases.

### Pricing

`src/pricing/fiat-conversion.js` — BTC/fiat price conversion. Exports `getBitcoinPrice()`, `estimateTripCost()`, `fetchBitcoinPrices()`. Used by `server.js` for fare estimates and dual-currency display. **Domain-independent.**

`src/osrm-routing.js` — Legacy routing helper (`getRoute()`), imported directly by `server.js`. Predates the `navigation/` factory; both are still used.

### Navigation Providers (Factory Pattern)

`navigation/factory.js` — Same factory pattern. All providers extend `navigation/base.js`. `navigation/service.js` provides the high-level routing API consumed by server code. Providers: `osrm` (self-hosted), `ors` (OpenRouteService API). Selected via `NAVIGATION_PROVIDER` env var. **Domain-independent.**

### Nostr Integration

- **`src/nostr/reputation.js`** — Reputation queries (TROTT-03, kind 30520 ratings) via `SimplePool`. 30-second cache. Rating tags are arbitrary — the domain profile defines which criteria to use. **Domain-independent.**
- **`src/nostr/stake-events.js`** — Publishes stake lock/release/penalty events. Uses generic task/ride tags. **Domain-independent.**

### Middleware

- **`middleware/nip98-auth.js`** — NIP-98 HTTP auth. Validates signed `Authorization: Nostr <base64>` headers (kind 27235). Toggle with `ENABLE_NIP98_AUTH`. **Domain-independent.**
- **`middleware/rate-limit.js`** — Rate limiting with separate tiers. Toggle with `ENABLE_RATE_LIMITING`. **Domain-independent.**

### Frontend

Two frontends exist:

- **`public/`** — Legacy vanilla JS web apps (`rider-app.js`, `driver-app.js`, `demo.html`). No build step — served as static files by Express.
- **`web/`** — React/TypeScript SPA (Vite + Tailwind CSS). Domain-agnostic — fetches profile from `/api/domains/current` and renders labels, features, and state machine from the active domain. Pages under `web/src/pages/requester/` and `web/src/pages/provider/` with shared components in `web/src/components/`. Routes use `/request/*` and `/provide/*` (with `/ride/*` and `/drive/*` as backward-compatible redirects). Uses `react-leaflet` for maps and `nostr-tools` v2 for Nostr integration. Built output goes to `web/dist/`.

**Frontend data flow** centres on three React contexts (`web/src/context/`):
  - `DomainContext` — active domain profile (labels, features, state machine)
  - `IdentityContext` — Nostr keypair and identity management
  - `TaskContext` — current task state and lifecycle

**PII module** (`web/src/modules/pii/`) — isolated components for sensitive data: `LiveTracker`, `MapSection`, `LocationProvider`, `RetentionNotice`. Keeps PII-handling code separate from general UI for GDPR compliance.

### Three-Layer Architecture

```
NOSTR (public, permanent)     →  Discovery + Reputation + Operator Bonds
OPERATOR (private, compliant) →  PII + Coordination + Payments + Compliance
WEBSOCKET (ephemeral)         →  Real-time tracking + Live updates
```

### TROTT Protocol Specifications

The protocol is defined as **8 TROTT specifications** plus **9 domain profiles**, using 39 event kinds. Specifications live in the [trott repository](https://github.com/TheCryptoDonkey/trott). See the [QUICK-REFERENCE](https://github.com/TheCryptoDonkey/trott/blob/main/specs/QUICK-REFERENCE.md) for the complete event kind table.

The protocol supports both **P2P** (no operator) and **operator-coordinated** models. A minimal implementation needs only TROTT-01 + TROTT-02 (14 event kinds).

### GDPR Compliance

The three-layer architecture supports GDPR compliance: public Nostr events use only pseudonymous identifiers, encrypted events use NIP-17 gift wrap for PII (erasable via crypto-shredding), and the operator database follows standard controller obligations. See `docs/GDPR-COMPLIANCE.md` for the full compliance guide.

## Testing

**Backend:** Uses Node.js built-in `node:test` module with `node:assert/strict`. Tests are in `tests/integration/`. Tests construct signed Nostr events manually for NIP-98 auth validation.

Key test files:
- `reputation-flow.test.js` — NIP-98 auth validation, rating event publishing, reputation caching
- `domain-profiles.test.js` — Schema validation, profile loading, TaskManager lifecycle across all domains, RideManager backward compatibility
- `http-api.test.js` — Full HTTP lifecycle (request→accept→arrive→start→complete→rate) with signed NIP-98 requests, role authorisation (403s), cancellation, driver presence/geo-dispatch, task-store rehydration

**Frontend:** Uses vitest with `@testing-library/react` and jsdom. Run with `npm run web:test`.

## Environment

Copy `.env.example` for configuration. Key variables:
- `DOMAIN` — Domain profile selection (ridesharing|locksmith|delivery, default: ridesharing)
- `OPERATOR_PUBKEY` / `OPERATOR_PRIVKEY` — Operator Nostr identity
- `PAYMENT_PROVIDER` — Payment backend (cash|lnd|btcpay|alby|cln|demo)
- `NAVIGATION_PROVIDER` — Routing backend (osrm|ors)
- `DATABASE_URL` — PostgreSQL connection
- `REDIS_URL` — Redis connection
- `NOSTR_RELAY` — Relay URL for event publishing
- `ENABLE_NIP98_AUTH` / `ENABLE_RATE_LIMITING` — Security toggles

## Language & Style

All code, comments, documentation, commit messages, and user-facing strings must use **British English** spelling (e.g. colour, initialise, behaviour, licence, organise, authorisation, centre, metre, catalogue, serialise, favour, honour, recognise, customise).

## Key Design Constraints

- **Backward compatibility:** All changes to `TaskManager` must preserve the `RideManager` interface — existing code importing from `ride-manager.js` must continue to work unchanged.
- **Domain-agnosticism:** Core code (payment providers, navigation, middleware, Nostr integration) must work identically across all domain profiles. Domain-specific logic belongs in the profile, not in shared code.
- **Payment agnosticism:** All monetary amounts are currency-neutral (smallest unit of specified currency). Every payment event includes `amount`, `currency`, and `trust_model` tags. Never assume sats or any specific currency.
- **NIP-40 expiration:** Use `expiration` tag (not `expiry`) for all time-limited events, per NIP-40 specification.
- **NIP-44 encryption:** Use NIP-44 for encrypted payloads and NIP-17 (gift wrap) for private PII exchange. NIP-04 is deprecated — do not use it.
- **Social graph integration:** The protocol references NIP-02 (contact lists for trust weighting), NIP-32 (labelling for domain/trade categorisation), and NIP-56 (reporting for abuse flagging). These are optional but recommended for enhanced trust signals.
- **Generic location tags:** Domain profiles use `location_lat`/`location_lon` tags (not geohash-only) for location data. Geohash discovery (TROTT-02) remains the primary public discovery mechanism.
- **No linter configured:** There is no ESLint or Prettier setup. Follow existing code style.
- **Two Nostr library versions:** Backend uses `nostr-tools` v1 (`^1.17.0`); the React frontend uses `nostr-tools` v2 (`^2.10.4`). APIs differ between versions — check which context you're in.
- **Dual API paths:** `/api/tasks/*` and `/api/rides/*` are interchangeable (server rewrites tasks→rides). Frontend uses `/api/tasks/`; backend handlers use `/api/rides/`. Similarly `/api/providers/*` aliases `/api/drivers/*`.

## Protocol Reference

The TROTT Protocol (**T**rusted **R**eal-world **O**rchestration of **T**asks & **T**rades) is defined as **8 TROTT specifications** and **9 domain profiles** in the [trott repository](https://github.com/TheCryptoDonkey/trott).

**Implementation-specific docs in this repo:**
- `docs/PAYMENT-PROVIDERS.md` — Payment provider integration guide
- `docs/GDPR-COMPLIANCE.md` — GDPR compliance guide
- `docs/API-STRESS-TEST.md` — API stress test results

**Protocol docs in the trott repo:**
- [Architecture](https://github.com/TheCryptoDonkey/trott/blob/main/docs/architecture.md) — Federated model
- [Trust Mechanisms](https://github.com/TheCryptoDonkey/trott/blob/main/docs/trust-mechanisms.md) — 6 layers of trust
- [Use Cases](https://github.com/TheCryptoDonkey/trott/blob/main/docs/use-cases.md) — Supported domains
- [Interoperability](https://github.com/TheCryptoDonkey/trott/blob/main/docs/interoperability.md) — Cross-domain integration
