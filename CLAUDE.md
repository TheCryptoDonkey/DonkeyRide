# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DonkeyRide is the **reference implementation** of the [TROTT Protocol](https://github.com/TheCryptoDonkey/trott) (**T**rusted **R**eal-world **O**rchestration of **T**asks & **T**rades) — a suite of 8 specifications for trust-minimised physical service coordination built on Nostr (decentralised messaging) with **payment-agnostic** financial rails (Lightning, Cashu, Strike, Stripe, NIP-47, and more). This repo contains the **reference operator server** — a Node.js backend that coordinates tasks and records commitments. It is deliberately **non-custodial**: it never receives, holds, or transmits funds (see "Non-custodial + database-free" below). It is not a ridesharing company; it's a working implementation that generalises across 10+ domains (ridesharing, locksmith dispatch, parcel delivery, court serving, security guard dispatch, emergency trades, cleaning, moving, and more).

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

`server.js` is the monolithic Express server (~2000 lines). It loads the domain profile, initialises `TaskManager`, and sets up all REST endpoints, the WebSocket server, and the Redis connection. All API routes are defined inline.

**Scheduled rides**: a request may carry `scheduled_for` (unix ms, up to `SCHEDULE_MAX_ADVANCE_MS` ahead, default 30 days). A pre-booked ride is browsable on the open list from the moment it's created — a driver can commit early — but only enters live dispatch (WS broadcast + web push) within `SCHEDULE_DISPATCH_LEAD_MS` (default 15 min) of pickup. A sweep (`SCHEDULE_SWEEP_MS`) dispatches rides whose window has opened, sends a `scheduled_reminder` frame (plus web push to an offline committed driver) for accepted bookings, and auto-cancels unmatched bookings `SCHEDULE_EXPIRE_GRACE_MS` (default 1 h) past their time. `scheduledFor` travels in the kind 30078 snapshot, so bookings survive an operator restart. Client task announcements carry a `scheduled_for` tag and extend their NIP-40 expiration to an hour past pickup.

**Geo-dispatch**: ride requests broadcast to online drivers within `DISPATCH_RADIUS_KM` (default 15) of the pickup — unless the driver has declared **working areas** (geohash cells, sent as `areas` on the WS `register_driver` message or `POST /api/drivers/location`), in which case cell membership overrides the radius entirely: the driver receives jobs inside their areas wherever they currently are, and never jobs outside them. `GET /api/rides/open` (alias `/api/tasks/open`) lists every open request — filterable by `?areas=` cells or `?lat/&lon` proximity — so drivers can browse all waiting requesters, not just catch live broadcasts. Its payload mirrors the WS broadcast (no requester identity). **Progressive location disclosure**: every pre-accept payload (broadcast, registration replay, open list) carries only an approximate location (~1 km rounding, `approximate: true`) and no route geometry; exact coordinates exist only on the participant-gated ride detail, i.e. for the driver who accepted.

**Multi-stop trips**: a request may carry `stops` (≤3 intermediate `{lat, lon, address?}` calling points). The route/estimate covers the full detour (OSRM waypoints, straight-line multi-leg fallback). Pre-accept payloads carry only `stopCount`; exact stops follow the same PII treatment as pickup/dropoff (participant-gated, geohash-precision in the 30078 snapshot).

### Payment Providers (Factory Pattern)

`payment-providers/factory.js` — Factory + fallback chain via `ResilientStakeManager`. All providers extend `payment-providers/base.js` with the interface: `lockStake()`, `releaseStake()`, `forfeitStake()`, `healthCheck()`, `getCapabilities()`.

Providers: `cash` (record-only, no custody — fare settles face-to-face, inDrive model), `lnd` (hodl invoices, regtest-proven semantics: release = cancel/refund, forfeit = settle/claim penalty; `confirmStakePaid()` gates enforcement on the payment actually being held), `demo` (mock for testing). Experimental (never verified against their real APIs, legacy both-stakes key convention): `btcpay`, `alby`, `cln`. Planned, not yet implemented: `nwc` (NIP-47 hold invoices), `stripe` (pure fiat), Cashu, M-Pesa — the factory throws a clear error if these are selected.

Stake interface is **per-stake**: `releaseStake`/`forfeitStake`/`getStakeStatus` take a stakeId of `${rideId}_${role}`. Non-instant rails (`instantLock: false`) return `awaiting_payment` from the stake endpoints and require a confirm call (`/rides/:id/{rider,driver}-stake/confirm` on the legacy flow, `/api/tasks/:id/{requester,provider}-stake/confirm` on the task flow), which calls the provider's `confirmStakePaid()`.

**Stake persistence**: LND stake state (including hodl preimages) is persisted to the `stakes` table and restored via `setStakeStore()` on boot — a restart must never strand held HTLCs. **Provider unification**: `paymentProvider` IS the stake manager's primary provider (one instance, one state). Fallback providers must share the primary's trust model; per-stake operations route to the provider that created the stake.

Every payment event includes explicit `amount`, `currency`, and `trust_model` tags. Amounts are in the smallest unit of the specified currency (pence for GBP, cents for USD, satoshis for SAT).

Selected via `PAYMENT_PROVIDER` env var, with optional `PAYMENT_FALLBACKS` for resilience. The demo provider refuses to boot with `NODE_ENV=production` unless `ALLOW_DEMO_PAYMENTS=true`. **Domain-independent** — works identically across all use cases.

### Pricing

`src/pricing/fiat-conversion.js` — BTC/fiat price conversion. Exports `getBitcoinPrice()`, `estimateTripCost()`, `fetchBitcoinPrices()`. Used by `server.js` for fare estimates and dual-currency display. **Domain-independent.**

`src/osrm-routing.js` — Legacy routing helper (`getRoute()`), imported directly by `server.js`. Predates the `navigation/` factory; both are still used.

### Navigation Providers (Factory Pattern)

`navigation/factory.js` — Same factory pattern. All providers extend `navigation/base.js`. `navigation/service.js` provides the high-level routing API consumed by server code. Providers: `osrm` (self-hosted), `ors` (OpenRouteService API). Selected via `NAVIGATION_PROVIDER` env var. **Domain-independent.**

### Nostr Integration

- **`src/nostr/kinds.js`** — **Single source of truth for event kinds**, aligned with the TROTT spec v0.9 table. Never hardcode a kind number; import from here. Governance experiments (watchdog/slashing/suspension/appeals/votes) live in an explicit experimental block (39500+) so they can never collide with spec-assigned kinds.
- **`src/nostr/reputation.js`** — Reputation queries (TROTT-03, kind 30520 ratings; kind 30540 emergency signals) via `SimplePool`. 30-second cache. Aggregates verify signatures and dedupe one rating per (rater, task); `p` tags must be hex. Relay reads/writes carry a 5s timeout. **Domain-independent.**
- **`src/nostr/stake-events.js`** — Publishes TROTT-04 payment events: 30532 Escrow Lock, 30533 Settlement (`outcome`: released/forfeited/partial_forfeit), 30535 Payment Receipt. **Domain-independent.**
- **`src/nostr/operator-announce.js`** — Operator discoverability: kind 30511 service announcement at startup, kind 30554 heartbeat every 5 minutes. Advertises `PUBLIC_RELAY_URLS` and `PUBLIC_BASE_URL`.
- **Outbox**: operator-signed events that reach no relay are persisted (`nostr_outbox` table) and retried every 60s — never silently dropped.

### Middleware

- **`middleware/nip98-auth.js`** — NIP-98 HTTP auth. Validates signed `Authorization: Nostr <base64>` headers (kind 27235). Single-use auth events on mutating requests (replay rejected); optional `payload` tag is verified against the body hash. Toggle with `ENABLE_NIP98_AUTH`. **Domain-independent.**
- **`middleware/rate-limit.js`** — Rate limiting. When `ENABLE_RATE_LIMITING` is not `false`, all mutating `/api|/rides` routes share the authenticated limiter; hot read routes carry `publicRateLimiter`. `trust proxy` is set for correct per-IP buckets behind Caddy/nginx. **Domain-independent.**
- **WebSocket auth** — when `ENABLE_NIP98_AUTH=true`, sockets must send `{type:'auth', event:<kind 27235, method GET>}` first; `subscribe_ride` is participant-only; `register_driver`/`driver_location` use the verified pubkey (spoofing rejected).

### Frontend

Two frontends exist:

- **`public/`** — Legacy vanilla JS web apps (`rider-app.js`, `driver-app.js`, `demo.html`). No build step — served as static files by Express.
- **`web/`** — React/TypeScript SPA (Vite + Tailwind CSS). Domain-agnostic — fetches profile from `/api/domains/current` and renders labels, features, and state machine from the active domain. Pages under `web/src/pages/requester/` and `web/src/pages/provider/` with shared components in `web/src/components/`. Routes use `/request/*` and `/provide/*` (with `/ride/*` and `/drive/*` as backward-compatible redirects). Uses `react-leaflet` for maps, `nostr-tools` v2 for Nostr integration, and `geohash-kit` for working-area polygon coverage. Built output goes to `web/dist/`.

  The provider app's dispatch singleton (`web/src/services/dispatch.ts`) keeps an **available-jobs list**: every broadcast lands in it (nothing dropped while another job is on screen) and it reconciles against `GET /api/tasks/open` every 30 s, rendered on the dashboard. `/provide/areas` (`WorkingAreasPage`) lets the driver draw polygon working areas on the map; `geohash-kit`'s `polygonToGeohashes` covers each polygon with ≤64 multi-precision cells (`web/src/utils/working-areas.ts`, persisted in localStorage) which register with the dispatcher and filter both broadcasts and the open-jobs list. **Destination mode** (`web/src/utils/destination-mode.ts`, dashboard control) is a purely client-side corridor filter: only jobs whose approximate dropoff makes ≥1 km progress toward (or ends within 2 km of) the driver's chosen destination are shown — the destination never leaves the device; jobs are stored unfiltered so clearing the mode instantly restores them.

  Prices render **fiat-first** (`DualPrice`: the local currency leads, sats secondary) and the account page speaks plain English ("Account ID", "recovery key") with npub/nsec visible but secondary — normie adoption is the goal. CI (`.github/workflows/ci.yml`) runs backend tests on Node 18 and 20 plus web typecheck/tests/build on every push and PR.

  **Web Push job alerts** (VAPID, no Firebase): a backgrounded driver app gets a push instead of the WS frame. Operator side: `src/push.js` (in-memory subscriptions — endpoint URLs are device PII, never persisted), `GET /api/push/vapid-key`, `POST|DELETE /api/push/subscribe`, and `pushRideRequestToOfflineDrivers` in `server.js` (same area/radius semantics as WS dispatch; skips drivers with an open socket; payload is E2E encrypted per RFC 8291 and carries no rider identity or exact coordinates). Client side: `web/src/services/push.ts` subscribes on Go online (the permission prompt rides that tap), re-subscribes on area changes, unsubscribes on Go offline; `sw.js` shows the notification and focuses `/provide` on tap. Keys: `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` (ephemeral dev keys generated at boot when unset).

  **Federated job discovery**: rider task announcements (kind 37500) carry `operator` + `api` tags, and while online the driver app also subscribes to them on the public relays (`web/src/services/federation.ts`) — jobs coordinated by OTHER operators land in the same available-jobs list badged "via Nostr · host". Relevance mirrors dispatch (working areas win, else radius against the decoded geohash centre); own-operator jobs are excluded; the `api` tag is untrusted (https-only origins, localhost dev exempt) and job details are fetched from that operator's public open endpoint, never taken from the relay event. Phase-1 accept is a hand-off to the owning operator's driver app (the account travels via the recovery key); phase 2 would be in-place cross-operator lifecycle. **First-run onboarding** (`web/src/components/onboarding/Onboarding.tsx`): a role-aware 3-slide intro shown once per device, covering the no-account pitch, direct payment, and — for drivers — notifications plus the iOS add-to-home-screen step push requires.

  **Pickup verification code** (`web/src/services/pickup-code.ts`, `PickupCode` on both active pages, match → trip start): both phones derive the same 4-digit PIN + word from the pair's NIP-44 ECDH conversation key + ride id — requires one of the two private keys, so the operator cannot derive it and an impostor car cannot show it. No server state, nothing published.

  **Trip sharing** (`web/src/services/trip-share.ts`, `TripSharePanel` on the rider's active page): flock's share → all-clear → alert pattern over the same NIP-17 gift-wrap rail as chat. The rider saves trusted-contact npubs (device-local) and sends them an E2E encrypted trip note (driver npub, approximate route) as a plain kind 14 DM — readable in ANY NIP-17 DM client, no DonkeyRide account needed. Completion auto-sends an all-clear to everyone the trip was shared with; a panic also fires them an alert with last known location. Contacts flagged **"Every trip"** are auto-shared the moment a driver is matched (`autoShareTrip`, once per task). Operator-blind throughout. Deliberately message-based, not live tracking; full flock-circle integration (group envelope keys) stays in the Flock app.

  **Ride check** (`web/src/utils/ride-check.ts`, `RideCheckPrompt` on the rider's active page): the rider's own phone watches the in-progress trip against `routeGeometry` — a sustained (2 min) deviation >500 m or a >5 min stop raises "Everything OK?"; if the trip was shared and the rider doesn't respond within 60 s, guardians are alerted automatically (`sendRideCheckAlert`). Pure anchor-based detection (slow creep never fires; a single wild GPS fix never fires; the `useLocation` London fallback is never ingested). Nothing leaves the device unless escalation fires. Panic surfaces a locale-mapped emergency number as a `tel:` link (`web/src/utils/emergency.ts`).

  **In-app chat** (`web/src/services/chat.ts`, `ChatPanel` on both active-task pages) is end-to-end encrypted NIP-17 gift-wrapped DMs exchanged directly between the participants over public relays — the operator never carries or sees a message. The unwrap is verified (seal signature + seal/rumor pubkey match — checks `nostr-tools`' own `unwrapEvent` skips); the ride id threads via the rumor's `subject` tag inside the encryption, and a self-addressed wrap makes history replay after refresh. **Reputation is never self-reported and never operator-trusted**: accept ignores any `driver_rating`, `TaskManager` stores no default rating, `/api/drivers/available` reports `rating: null` for anonymised live drivers, and `ReputationBadge` renders a **client-verified** aggregate — `web/src/services/reputation.ts` reads kind 30520/30540 events from public relays directly, verifies every signature in the client, and dedupes one rating per (rater, task); `GET /api/reputation/:npub` is only the fallback when relays are unreachable. Rider sees the driver at match; driver sees the requester on the incoming-job screen, including any emergency signals.

**Frontend data flow** centres on three React contexts (`web/src/context/`):
  - `DomainContext` — active domain profile (labels, features, state machine)
  - `IdentityContext` — Nostr keypair and identity management
  - `TaskContext` — current task state and lifecycle

**PII module** (`web/src/modules/pii/`) — isolated components for sensitive data: `LiveTracker`, `MapSection`, `LocationProvider`, `RetentionNotice`. Keeps PII-handling code separate from general UI for GDPR compliance.

### Three-Layer Architecture

```
NOSTR (public, permanent)     →  Discovery + Reputation + Operator Bonds + State snapshots (durability)
OPERATOR (thin, non-custodial)→  Coordination only (in-memory, ephemeral). NEVER touches funds.
WEBSOCKET (ephemeral)         →  Real-time tracking + Live updates
```

### Non-custodial + database-free (production default)

The default production operator runs with **no database and no Redis** and is
**non-custodial** — it is a coordination service, not a payment institution:

- **No money.** Every provider declares `getCustodyModel()`; the boot gate
  (`adoptPaymentProvider`) refuses any `custodial` rail unless
  `OPERATOR_LICENSED_CUSTODIAN=true`. Default rail is `cash` (record-only,
  custody `none`): fares settle peer-to-peer, the operator moves £0
  (`operator_transmitted: 0` on every settlement). `/info.regulatory` states
  the posture (`money_transmitter: false`, `settlement: peer-to-peer`).
  `OPERATOR_FEE_PERCENT` defaults to 0 — the operator takes no cut of a fare it
  never holds. Custodial Lightning rails (lnd/btcpay/alby/cln) exist for
  licensed Mode-B operators only.
- **No database.** `DATABASE_URL` is optional. Durability comes from Nostr: the
  operator publishes a PII-free kind 30078 state snapshot (geohash-level
  location only, never exact coordinates or addresses) on every task mutation
  via `setSnapshotPublisher`, and rehydrates non-terminal tasks from its own
  snapshots on boot (`rehydrateFromNostr`). Exact PII is in-memory and
  ephemeral — lost on restart by design (a GDPR feature, not a bug). The
  Nostr outbox falls back to an in-memory buffer when there is no DB.
- **No Redis.** Driver presence is in-memory and ephemeral. Redis only ever fed
  demo bot fleets and is off by default (`DISABLE_REDIS=true`).
- Operators who legitimately need durable PII (a licensed Mode-B firm under
  GDPR controller obligations) opt in by setting `DATABASE_URL`; the store is
  then used automatically. It is never in OUR loop.

### Settlement rails (`settlement/`) — how riders actually pay

Distinct from `payment-providers/` (custodial escrow stakes, gated off by
default). Settlement rails are **non-custodial**: the rider pays the driver
DIRECTLY and the operator only advertises, resolves, and verifies. Every rail
reports `custody() === 'none'`.

- `settlement/lnaddress.js` — Lightning wallet-to-wallet via LNURL-pay
  (LUD-16/06/21). Resolves the driver's Lightning Address to a bolt11 invoice
  the rider pays from their own wallet; verifies by preimage
  (`SHA256(preimage)===payment_hash`, offline via `ln-service.parsePaymentRequest`)
  or LUD-21 verify URL. **Also carries Tando** (a `2547…@bitcoin.co.ke` address
  that settles to M-Pesa) — proven live against bitcoin.co.ke.
- `settlement/mpesa.js` — record-only direct Send Money (driver's number, rider
  enters the confirmation code). No paybill/STK/B2C (those are custodial).
- `settlement/cashu.js` — record-only ecash: the rider sends the Cashu token to
  the driver over the E2E chat (the token IS the money, so it must never pass
  through the operator — `verify` refuses a pasted token outright). Driver may
  advertise an optional NUT-18 payment request (`creq...`, public-safe).
- `settlement/cash.js`, `settlement/index.js` (registry: getRail/validateHandle/
  normaliseHandle/isPublicSafe/listRails). Tando normalises a bare Kenyan number
  to a bitcoin.co.ke Lightning Address.
- Endpoints: `GET /api/settlement/rails`, `POST /api/rides/:id/payment-methods`
  (driver), `GET /api/rides/:id/payment-options` (participant),
  `POST /api/rides/:id/pay-instruction` (rider), `POST /api/rides/:id/settle`
  (rider), `POST /api/rides/:id/confirm-received` (driver). M-Pesa number is
  per-ride PII (in-memory, never relayed); Lightning handles are public-safe.
- NWC (NIP-47) is a **frontend** capability (rider's own wallet pays the
  driver's invoice); the operator never holds the connection secret.
- **Amounts**: `pay-instruction` sends **sats** to Lightning rails (lnaddress/
  lightning/tando) and the **fiat** figure (derived on demand via `satsToFiat`,
  so it survives Nostr rehydration) to fiat rails (mpesa/cash). `ride.fare` is
  always sats; there is no stored `fareFiat`.
- **Currencies**: `USD|EUR|GBP|KES` (`DEFAULT_FIAT_CURRENCY`, default GBP). KES is
  first-class for M-Pesa/Tando — CoinGecko has no KES, so BTC/KES is derived as
  BTC/USD × USD/KES (open.er-api.com). The default fare rate card is USD-quoted and
  auto-converted to the ride currency; operators set `FARE_BASE`/`FARE_PER_KM`/
  `FARE_PER_MINUTE` + `FARE_CURRENCY` for a local market (used verbatim).

### TROTT Protocol Specifications

The protocol is defined by the TROTT specifications and domain profiles in the [trott repository](https://github.com/TheCryptoDonkey/trott). See the [QUICK-REFERENCE](https://github.com/TheCryptoDonkey/trott/blob/main/specs/QUICK-REFERENCE.md) for the complete event kind table; this implementation's kinds are pinned in `src/nostr/kinds.js` and must track that table.

The protocol supports both **P2P** (no operator) and **operator-coordinated** models. A minimal implementation needs only TROTT-01 + TROTT-02 (14 event kinds).

### GDPR Compliance

The three-layer architecture supports GDPR compliance: public Nostr events use only pseudonymous identifiers, encrypted events use NIP-17 gift wrap for PII (erasable via crypto-shredding), and the operator database follows standard controller obligations. See `docs/GDPR-COMPLIANCE.md` for the full compliance guide.

## Testing

**Backend:** Uses Node.js built-in `node:test` module with `node:assert/strict`. Tests are in `tests/integration/`. Tests construct signed Nostr events manually for NIP-98 auth validation.

Key test files:
- `reputation-flow.test.js` — NIP-98 auth validation, rating event publishing, reputation caching
- `domain-profiles.test.js` — Schema validation, profile loading, TaskManager lifecycle across all domains, RideManager backward compatibility
- `http-api.test.js` — Full HTTP lifecycle (request→accept→arrive→start→complete→rate) with signed NIP-98 requests, role authorisation (403s), cancellation, driver presence/geo-dispatch, task-store rehydration
- `open-rides.test.js` — Open-request browsing (`/api/rides/open` filters, identity redaction) and working-area dispatch over a real WebSocket (areas override radius, replay on register, REST-declared areas)
- `multi-stop.test.js` — Multi-stop validation, detour-covering estimates, stop-count-only pre-accept payloads, participant-gated exact stops

**Frontend:** Uses vitest with `@testing-library/react` and jsdom. Run with `npm run web:test`.

## Environment

Copy `.env.example` for configuration. Key variables:
- `DOMAIN` — Domain profile selection (ridesharing|locksmith|delivery, default: ridesharing)
- `OPERATOR_PUBKEY` / `OPERATOR_PRIVKEY` — Operator Nostr identity
- `PAYMENT_PROVIDER` — Payment backend (cash|lnd|btcpay|alby|cln|demo)
- `DEFAULT_FIAT_CURRENCY` — Ride pricing currency (USD|EUR|GBP|KES, default GBP; set KES for M-Pesa/Tando markets)
- `FARE_BASE` / `FARE_PER_KM` / `FARE_PER_MINUTE` / `FARE_CURRENCY` — Rate card (USD-quoted default, auto-converted; set FARE_CURRENCY to price verbatim in a local currency)
- `NAVIGATION_PROVIDER` — Routing backend (osrm|ors)
- `DATABASE_URL` — PostgreSQL connection (OPTIONAL; omit for the default non-custodial, DB-free operator)
- `REDIS_URL` — Redis connection (OPTIONAL; presence is in-memory. `DISABLE_REDIS=true` to skip)
- `OPERATOR_LICENSED_CUSTODIAN` — set true ONLY if you are a licensed payment institution running a custodial rail
- `PUBLIC_RELAY_URLS` / `PUBLIC_BASE_URL` — advertised to clients for Nostr discovery
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
