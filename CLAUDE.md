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
DOMAIN=locksmith npm start           # Locksmith dispatch server
DOMAIN=delivery npm start            # Parcel delivery server
DOMAIN=towing npm start              # Vehicle recovery
DOMAIN=emergency-trades npm start    # Emergency trade callouts
DOMAIN=pet-services npm start        # Dog walking, sitting, grooming
DOMAIN=security npm start            # Security officer assignments
DOMAIN=cleaning npm start            # Domestic and specialist cleaning
DOMAIN=moving npm start              # House and office moves
DOMAIN=ridesharing npm start         # Default ridesharing (same as no DOMAIN)
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
├── delivery.js        # sender/courier, extra COLLECTED state, photo+signature proofs
├── towing.js          # motorist/recovery operator, binding on-site quote before loading
├── emergency-trades.js# householder/tradesperson, milestone pricing, trade as a requirement
├── pet-services.js    # pet owner/carer, check-in→session→check-out, carer stakes higher
├── security.js        # client/officer, shift cycling station↔patrol↔incident, SIA gated
├── cleaning.js        # client/cleaner, one session per task, symmetric stakes
└── moving.js          # client/mover, loading→transit→unloading milestones
```

Each profile defines: state machine (states + valid transitions), role names (requester/provider), UI labels (origin/destination/task noun/instructions), pricing model, discovery method, completion proof types, rating criteria, feature flags, regulatory bodies, and Nostr event kind mappings.

**Every profile must be drivable end to end.** A profile can validate perfectly and still be unusable: `startTrip`/`completeTrip` go through `validateTransition` like anything else, so a domain whose extra states sit between arrival and work must still leave an edge into `ACTIVE` and `COMPLETED`. `tests/integration/spec-domains.test.js` walks EVERY built-in profile through the full lifecycle for exactly this reason, and pins the state keys the engine reaches for by name (`REQUESTED`, `MATCHED`, `PROVIDER_EN_ROUTE`, `PROVIDER_ARRIVED`, `ACTIVE`, `COMPLETED`, `CANCELLED`, `NO_SHOW`).

**Requirements vs price bands.** `serviceOptions` scale the whole rate card (recovery method, crew size); `accessOptions` never touch the fare and fail closed (trade qualifications, SIA licence categories, "reactive dog", "key-held access"). A domain whose profile sets `labels.accessRequesterTitle`/`accessProviderTitle` replaces the journey-flavoured default copy in `AccessNeedsPicker` — asking a gas engineer what they need "for this journey" reads wrong.

**Multi-provider is not supported.** `moving` models a crew of 2-6 in the spec; this engine records ONE provider per task, so the lead mover is the provider of record and the crew split is settled among themselves. Per-mover acceptance and TROTT-04 split payments need multi-provider support in `TaskManager` first.

**To add a new domain:** create `src/domain-profiles/{name}.js` exporting a profile object (~120 lines), register it in `loader.js`'s `BUILTIN_PROFILES`, and add it to `LIFECYCLE_PATHS` in `spec-domains.test.js`. The schema validates it on load.

### Task Manager (Generalised State Machine)

`src/task-manager.js` — `TaskManager` is the domain-agnostic lifecycle engine. Parameterised by a domain profile, it manages task creation, state transitions, identity resolution (pubkey/npub), and in-memory storage.

`src/ride-manager.js` — Backward compatibility layer. `RideManager` extends `TaskManager` with the ridesharing profile. All original methods (`createRide`, `acceptRide`, `RideStatus`, etc.) are preserved as aliases. Existing code importing from `ride-manager.js` works without changes.

### Entry Point & Server

`server.js` is the monolithic Express server (~2000 lines). It loads the domain profile, initialises `TaskManager`, and sets up all REST endpoints, the WebSocket server, and the Redis connection. All API routes are defined inline.

**Upfront-price guarantee (do not break this)**: `routeAndPrice()` is the SINGLE routing+pricing path, used by both `POST /api/trips/estimate` and `POST /api/rides/request`. The number the rider approves on the confirm screen IS the number recorded on the ride. (These endpoints once routed independently — the quote priced a straight line at 30 km/h, the ride priced the OSRM road route with a 45 km/h fallback — so every fare came in over the quote by roughly the ratio of road to crow-flies.) `FALLBACK_SPEED_KMH` is one constant for both. `breakdownSats()` returns base/distance/time rows in sats that sum to the quoted fare EXACTLY (rounding lands on the distance row); the client renders these and must never synthesise a breakdown from percentages. `tests/integration/quote-integrity.test.js` pins all of it.

**Request expiry and escalation**: an unmatched immediate request is re-offered every `REQUEST_RETRY_MS` (default 30 s) on a radius that widens ×1.5 per attempt up to `DISPATCH_RADIUS_MAX_KM` (default 2× the base), emitting a `searching` WS frame each time (attempt, radius, providers notified, time left). At `REQUEST_EXPIRE_MS` (default 5 min) it is cancelled with reason `no_providers` and the rider gets a "no drivers available" screen with retry/book-later — never an indefinite spinner. Pre-booked rides keep their own much longer clock (`sweepImmediateRequest` returns early for them).

**Demand pricing (surge)**: OFF unless `SURGE_ENABLED=true` — turning it on for existing operators would silently raise fares. `surgeFor(pickup)` compares waiting requests to available providers within `SURGE_RADIUS_KM`, needs at least `SURGE_MIN_DEMAND` waiting, is stepped to 0.1 and capped at `SURGE_MAX`. Zero supply never surges (that is a search about to fail, not demand). The multiplier is disclosed in the estimate and echoed back as `surge_multiplier` on request; the server honours `min(live, quoted)`, so a quote can never reprice upward on tap. The uplift is the driver's — a non-custodial operator takes no cut of a fare it never holds.

**Access needs**: domain profiles may define `accessOptions` (wheelchair, step-free, child seat, assistance dog, pet friendly, extra luggage). These are REQUIREMENTS, not a price band — the schema rejects an `accessOptions` entry carrying a `fareMultiplier`, because needing a ramp must never cost more. `access_needs` on a request filters dispatch/replay/open-list (`?access=`) via `accessEligible`, fail closed exactly like women-only, and accept returns 403 naming what is missing. In memory only; deliberately absent from the kind 30078 snapshot (health-adjacent data never reaches a relay).

**Late cancellation**: Mode-A native — reputational, never financial. A cancellation is `lateCancellation` when a provider had committed, `CANCEL_GRACE_MS` (default 2 min) has passed, and the job had not started. The fact travels on the cancel frame; the WRONGED party's client may then sign a kind 30520 event flagged `late_cancel` (rating 1), exactly as `no_show` works. `/rate` accepts both flags on a cancelled ride and nothing else. Both aggregators surface `lateCancelCount`. The operator never asserts it and levies no fee.

**Scheduled rides**: a request may carry `scheduled_for` (unix ms, up to `SCHEDULE_MAX_ADVANCE_MS` ahead, default 30 days). A pre-booked ride is browsable on the open list from the moment it's created — a driver can commit early — but only enters live dispatch (WS broadcast + web push) within `SCHEDULE_DISPATCH_LEAD_MS` (default 15 min) of pickup. A sweep (`SCHEDULE_SWEEP_MS`) dispatches rides whose window has opened, sends a `scheduled_reminder` frame (plus web push to an offline committed driver) for accepted bookings, and auto-cancels unmatched bookings `SCHEDULE_EXPIRE_GRACE_MS` (default 1 h) past their time. `scheduledFor` travels in the kind 30078 snapshot, so bookings survive an operator restart. Client task announcements carry a `scheduled_for` tag and extend their NIP-40 expiration to an hour past pickup.

**Geo-dispatch**: ride requests broadcast to online drivers within `DISPATCH_RADIUS_KM` (default 15) of the pickup — unless the driver has declared **working areas** (geohash cells, sent as `areas` on the WS `register_driver` message or `POST /api/drivers/location`), in which case cell membership overrides the radius entirely: the driver receives jobs inside their areas wherever they currently are, and never jobs outside them. `GET /api/rides/open` (alias `/api/tasks/open`) lists every open request — filterable by `?areas=` cells or `?lat/&lon` proximity — so drivers can browse all waiting requesters, not just catch live broadcasts. Its payload mirrors the WS broadcast (no requester identity). **Progressive location disclosure**: every pre-accept payload (broadcast, registration replay, open list) carries only an approximate location (~1 km rounding, `approximate: true`) and no route geometry; exact coordinates exist only on the participant-gated ride detail, i.e. for the driver who accepted.

**Moving the pickup**: riders walk. `POST /api/rides/:id/pickup` (alias `/api/tasks/:id/pickup`) lets the **requester** move the meeting point until the provider arrives (allowed in requested/matched/en_route; 409 after). Before anyone commits the move is unbounded and the fare is re-estimated from the new route; once a provider has committed the move is capped at `PICKUP_ADJUST_MAX_KM` (default 1) and **the agreed fare never changes** — a short walk must not re-price a job in either direction. The route is recalculated either way, the committed provider gets a `pickup_updated` WS frame (participant-gated exact coordinates), and `TaskManager.updatePickup` persists + re-snapshots.

**Service classes**: domain profiles may define `serviceOptions` (ridesharing ships Standard/Comfort/XL). The chosen class scales the WHOLE rate card via `rateCardOptions(currency, multiplier)`, so the breakdown still sums to the quote; `POST /api/trips/estimate` returns per-class prices. Anything above the default class must be declared by the provider (`service_options` on WS `register_driver`, `POST /api/drivers/location`, push subscribe and accept): an XL request is invisible on broadcast/replay/open-list/push to an undeclared driver, and accept returns 403 (`optionEligible`, fail closed exactly like women-only).

**Favourite providers**: a request may carry `preferred_providers` (≤10 hex pubkeys, device-local list on the rider side). For `FAVOURITE_HEAD_START_MS` (default 45 s) the job is dispatched, listed and acceptable ONLY to those providers (`inFavouriteWindow`/`favouriteEligible`; accept returns 403 with `opens_in_seconds`) — a head start others can out-tap is not a head start — then the sweep opens it to everyone. In memory for the life of the request; never snapshotted. Not applied to pre-booked rides.

**Waiting time (Mode A)**: after `arrive`, `start` adds `max(0, waited - FREE_WAITING_MINUTES)` at the rate card's own per-minute rate to `ride.fare` and records `ride.waiting`. The operator holds no money, so this is not a charge it levies — it recalculates the number both parties settle peer-to-peer, with the timer visible to both before it costs anything. Priced only AFTER `startTrip()` validates the transition (a second `/start` must never stack a second charge) and only once (`!ride.waiting`).

**Pickup notes**: `pickup_note` on request, or `note` on `POST /api/rides/:id/pickup` (a note-only edit needs no coordinates and touches neither route nor price). Participant-gated free text capped at 140 chars: in memory, never in a pre-accept payload, never in the kind 30078 snapshot.

**Participant alerts**: `pushToParticipant` reaches whichever party is NOT currently watching the ride socket (`participantSocketOpen` via the WS-authenticated pubkey) — matched (with vehicle + ETA), arrived, cancelled-by-the-other-party, pickup moved/note added. Push subscriptions carry `role`, so a rider device is never swept into job dispatch.

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

  **Identity as people, not keys** (`web/src/services/profiles.ts`, `PersonCard`): names and avatars come from the counterparty's OWN kind 0 metadata, read from public relays and signature-verified in the client — the operator never asserts an identity, exactly as it never asserts a rating. A key with no metadata falls back to a short `npub1abc…wxyz` identifier. `NameEditor` on the profile page publishes your own kind 0 (preserving fields set in other Nostr clients). Every screen that used to print a truncated npub now shows a person.

  **Progressive disclosure on the active screens** (`web/src/components/layout/Sheet.tsx`): both active-task pages render a capped `Sheet` (status, the person, the current action, a running waiting meter) with everything else — meeting up, chat, safety, payment — behind `SheetSection` disclosures that remember their open state. They previously stacked up to thirteen always-open panels beneath a `flex-1` map, which on a phone left no map and pushed the primary action below the fold. `StatusBadge` renders a translated sentence keyed off the stable STATE KEY ("Kwame is on the way"), not the raw uppercased enum.

  **Driver dispatch UX**: the incoming-job card leads with fare, **distance/ETA to the pickup** (`web/src/utils/pickup-distance.ts` — the number a driver actually decides on) and an `AcceptCountdown` ring that releases the offer rather than holding it silently. Declining is remembered for the session (`dispatchService.declineAvailable`), so the 30 s open-list reconcile no longer re-offers a job the driver just turned down; `clearDeclined()` brings them back. The dashboard headlines the driver's OWN day — today's earnings, trips, hours online (`web/src/utils/shift.ts`) and a £/hour figure withheld until a meaningful stretch has run — instead of platform-wide ride counts. Jobs are ranked nearest-first with fare breaking ties.

  **Receipts and rebook** (`Receipt`, `HistoryPage`): a past trip opens a real receipt — base/distance/time rows, waiting time, tip, any demand multiplier, who drove, which rail — and offers the same journey again in one tap. Device-local like the rest; the operator holds no copy.

  The provider app's dispatch singleton (`web/src/services/dispatch.ts`) keeps an **available-jobs list**: every broadcast lands in it (nothing dropped while another job is on screen) and it reconciles against `GET /api/tasks/open` every 30 s, rendered on the dashboard. `/provide/areas` (`WorkingAreasPage`) lets the driver draw polygon working areas on the map; `geohash-kit`'s `polygonToGeohashes` covers each polygon with ≤64 multi-precision cells (`web/src/utils/working-areas.ts`, persisted in localStorage) which register with the dispatcher and filter both broadcasts and the open-jobs list. **Destination mode** (`web/src/utils/destination-mode.ts`, dashboard control) is a purely client-side corridor filter: only jobs whose approximate dropoff makes ≥1 km progress toward (or ends within 2 km of) the driver's chosen destination are shown — the destination never leaves the device; jobs are stored unfiltered so clearing the mode instantly restores them.

  Prices render **fiat-first** (`DualPrice`: the local currency leads, sats secondary) and the account page speaks plain English ("Account ID", "recovery key") with npub/nsec visible but secondary — normie adoption is the goal. CI (`.github/workflows/ci.yml`) runs backend tests on Node 18 and 20 plus web typecheck/tests/build on every push and PR.

  **i18n** (`web/src/i18n/`): a framework-free `t()`/`td()` runtime — flat en/sw dictionaries, `{param}` interpolation, per-key English fallback, `useT()` re-renders on switch. Locale auto-detects Swahili from the browser (KES market) with a manual toggle on the profile page (`donkeyride.locale`). `td()` translates server-sent domain labels (`dyn.*` keys — driver→dereva, ride→safari) and passes unknown domains through. First-pass Kiswahili needs native review before a Kenyan pilot. The i18n test suite enforces placeholder parity and no orphan sw keys. **Saved places** (`web/src/utils/places.ts`): pinned Home/Work plus recents in `AddressSearch`, device-local like everything else.

  **Rider parity features**: a **service-class picker** on the request screen (real per-class prices from the estimate, not a guessed multiplier), a **meeting note** field ("black gate, side entrance") editable again from the active page, **favourite providers** (`web/src/utils/favourites.ts`, starred on the completion page, sent as `preferred_providers` so they get first refusal), **rider Web Push** (`enableTaskPush`, permission asked on the request tap; `sw.js` routes by payload `url`), and a **waiting timer** (`WaitingTimer`) shown to both sides from arrival. Driver side: **trip sharing is no longer rider-only** — `TripSharePanel role="provider"` names the passenger instead of the car, completion sends the all-clear and panic forwards to the driver's own guardians; the **profile page shows your own standing** (client-verified, exactly as a stranger sees it); and the driver declares which **vehicle classes** they can take in `VehicleEditor`, plus sees the rider's note and pickup address on the active job.

  **Pickup that behaves like Uber/Bolt**: the rider never searches for the spot they are standing on. `HomePage` takes the GPS fix as the pickup the moment it lands (never the London fallback — a denied/pending fix leaves it unset), names it with `web/src/utils/reverse-geocode.ts` (Photon reverse, same key-less backend as the address search, ~11 m cache), and makes **"Where to?"** the only field. The pickup row shows `Current location · <street>` with a Change control (search, tap the map, drag the pin, or "use my current location"); picking a destination without a fix asks for the pickup instead of bouncing back. After requesting, `PickupAdjuster` on the rider's active page plus a draggable pickup pin move the meeting point until arrival (see "Moving the pickup"); the driver's active page toasts the change loudly and refetches. The rider's headline number while the car approaches is now **arrival ETA** (`eta_seconds` on the provider's `location_update`, previously dropped in normalisation), not the trip length.

  **Women-only matching** (self-declared, Bolt W4W-style, both directions): a declared-woman rider can flag a request `women_only`; a declared-woman driver can opt to receive only such requests. Pairing is enforced across live broadcast, registration replay, web push and the open list (`?gender=woman`), and accept returns 403 without the declaration (`sanitiseGender`/`genderEligible` in `server.js`). Fail closed for the request side; ordinary requests carry no gender data; the flag is deliberately **excluded from the Nostr snapshot** (special-category data never reaches relays — the constraint is lost on operator restart by design). Client: `web/src/utils/gender.ts` (device-local), `WomenSafetyCard` on the profile page, honest self-attestation copy everywhere.

  **No-show accountability** (Mode-A native — reputational, not financial): the wronged party ticks "didn't show up" while cancelling; the client signs a kind 30520 event flagged `no_show` (carrying rating 1 so every aggregator prices it in), publishes it to public relays and best-effort mirrors it to `POST /rate` — which accepts exactly this event class on a cancelled ride. Both aggregators surface `noShowCount`; `ReputationBadge` shows it pre-accept. Never operator-asserted.

  **Trip audio recording** (`web/src/services/trip-audio.ts`, `TripAudioRecorder` on both active pages): opt-in mic recording that never leaves the phone — AES-GCM encrypted with a key derived from the user's own key + task id, stored in IndexedDB (in-memory fallback), auto-deleted after 72 h unless exported. Consent-forward: jurisdiction-honest notice before starting, and the counterparty is automatically notified over the E2E chat, so every recording is all-party-informed. Operator-blind.

  **Web Push job alerts** (VAPID, no Firebase): a backgrounded driver app gets a push instead of the WS frame. Operator side: `src/push.js` (in-memory subscriptions — endpoint URLs are device PII, never persisted), `GET /api/push/vapid-key`, `POST|DELETE /api/push/subscribe`, and `pushRideRequestToOfflineDrivers` in `server.js` (same area/radius semantics as WS dispatch; skips drivers with an open socket; payload is E2E encrypted per RFC 8291 and carries no rider identity or exact coordinates). Client side: `web/src/services/push.ts` subscribes on Go online (the permission prompt rides that tap), re-subscribes on area changes, unsubscribes on Go offline; `sw.js` shows the notification and focuses `/provide` on tap. Keys: `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` (ephemeral dev keys generated at boot when unset).

  **Native driver wraps** (`docs/NATIVE-APPS.md`): the rider app stays PWA-first; the driver app is wrapped by Capacitor for Android AND iOS (`web/android`, `web/ios`, appId `app.donkeyride.driver`). The platforms are NOT equal and the docs say so: Android runs a foreground-service location watcher (which also keeps the WebView and dispatch socket alive) plus UnifiedPush for off-shift alerts; iOS runs `ShiftLocationPlugin.swift` (the app's own CLLocationManager plugin — the community plugin is excluded there via `ios.includePlugins: []` because it does not compile against Capacitor 8) and has NO off-shift alert rail at all. Toolchain floor: Capacitor 8 hides `CAPPluginCall.reject` behind a Swift 6.1 flag, so on Xcode 16.2 the iOS plugin reports failures as a resolved `{error}` payload and `native-location.ts` reads both shapes. Builds clean for the simulator; unverified on hardware.

  **UnifiedPush in the Android wrap** (`docs/ANDROID-PUSH.md`): the Push API does not exist in an Android WebView, so the wrapped driver app takes a second transport — the driver's own distributor (ntfy or any other), no Firebase. It yields an ordinary Web Push subscription, so **the operator is unchanged**: same `/api/push/subscribe` payload, same RFC 8291 encryption, same VAPID keys. `web/src/services/unified-push.ts` bridges to `UnifiedPushPlugin.java`/`DonkeyPushService.java`; `push.ts` picks the transport and `dispatch.ts` never learns which one. Fails loudly by design — no distributor installed means a dashboard notice, never a silent fallback to Google's transport, and a message that will not decrypt is dropped rather than shown as "something happened". `getPushState()`/`onPushStateChange()` drive that notice. NOT yet verified on real hardware.

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
- `spec-domains.test.js` — The six spec-derived domains: every built-in profile driven through a full lifecycle, engine state keys pinned, rating weights summing to 1.0, requirements never carrying a fare multiplier
- `http-api.test.js` — Full HTTP lifecycle (request→accept→arrive→start→complete→rate) with signed NIP-98 requests, role authorisation (403s), cancellation, driver presence/geo-dispatch, task-store rehydration
- `open-rides.test.js` — Open-request browsing (`/api/rides/open` filters, identity redaction) and working-area dispatch over a real WebSocket (areas override radius, replay on register, REST-declared areas)
- `multi-stop.test.js` — Multi-stop validation, detour-covering estimates, stop-count-only pre-accept payloads, participant-gated exact stops
- `rider-experience.test.js` — Rider push role separation and matched/arrived alerts, participant-gated pickup notes, service-class pricing + visibility + accept guard, favourite head start (hidden, unacceptable, then open), waiting time added once past the free period
- `pickup-change.test.js` — Moving the pickup: re-priced pre-commitment, fare-preserving and provider-notified post-commitment, distance cap, requester-only, frozen after arrival
- `women-only.test.js` — Women-only pairing over broadcast/replay/open list, fail-closed for undeclared drivers, accept 403 without the declaration
- `quote-integrity.test.js` — The upfront-price guarantee: quote fare == recorded fare (plain, multi-stop and per-class), breakdown rows sum exactly and track the rate card rather than fixed percentages
- `request-expiry.test.js` — Widening retry, capped radius, honest `no_providers` close-out, pre-booked rides unaffected, matched rides no longer retried
- `cancellation.test.js` — Grace window, late-cancellation flagging, wronged-party `late_cancel` report accepted, ordinary ratings still refused on a cancelled ride
- `access-needs.test.js` — Access needs never change the fare, fail closed on list and accept, every need must be met, absent from the Nostr snapshot
- `surge.test.js` — Off by default, capped, zero supply never surges, and a quote can never reprice upward on tap

**Frontend:** Uses vitest with `@testing-library/react` and jsdom. Run with `npm run web:test`.

## Environment

Copy `.env.example` for configuration. Key variables:
- `DOMAIN` — Domain profile selection (ridesharing|locksmith|delivery|towing|emergency-trades|pet-services|security|cleaning|moving, default: ridesharing)
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
- `REQUEST_RETRY_MS` / `REQUEST_EXPIRE_MS` / `DISPATCH_RADIUS_MAX_KM` — unmatched-request retry, expiry and the widening-search ceiling
- `SURGE_ENABLED` / `SURGE_MAX` / `SURGE_RADIUS_KM` / `SURGE_MIN_DEMAND` — demand pricing (OFF by default)
- `CANCEL_GRACE_MS` — how long after matching a party may cancel with nothing recorded against them
- `FALLBACK_SPEED_KMH` — straight-line speed when the router is unreachable (ONE constant for quote and fare alike)

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
