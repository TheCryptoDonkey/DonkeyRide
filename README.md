# DonkeyRide

DonkeyRide is an installable rider/driver PWA for peer-to-peer journey
coordination. The normal product is the app, not an operator business.

The default build joins an open Nostr network directly:

- drivers publish short-lived, coarse availability beacons under a random
  memory-only identity that changes every online shift;
- riders publish coarse, per-journey rendezvous announcements;
- matching, the exact itinerary, chat and lifecycle updates use NIP-17 gift
  wraps with NIP-44 encryption;
- road distance, duration and geometry come from a Valhalla-compatible router,
  including ordered intermediate stops; and
- `settlement_mode=none` supports informal lifts and other journeys where no
  money changes hands.

No DonkeyRide REST API, WebSocket coordinator, PostgreSQL or Redis is required
for that mode. A taxi firm or regulated operator can deliberately select the
optional managed backend included in this repository.

## Runtime choices

| Mode | Who runs coordination | Data boundary | Intended use |
|---|---|---|---|
| `direct` (default) | Rider and driver PWAs over user-selected Nostr relays | Public coarse discovery; exact details encrypted participant-to-participant | Open networks, informal lifts, independent drivers |
| `managed` (optional) | A selected firm/operator over authenticated HTTPS and WSS | Operator policy decides blind or managed handling and retention | Licensed fleets, roster/admission rules, regulated records |

Switching is explicit in Account → Operator. Relay and road-router URLs are
also device-local settings; changing them does not require rebuilding the app.

## What still sees data

“No DonkeyRide backend” does not mean “no metadata” or “no personal data.”

| Service | What it can observe in direct mode |
|---|---|
| Static PWA host | Ordinary web request metadata, depending on its logging |
| Nostr relays | IP/timing, anonymous per-shift availability pubkeys, coarse cells, per-journey rendezvous keys and encrypted envelope metadata |
| Road router | Exact ordered route points and request metadata, but no DonkeyRide identity or journey id |
| Photon/search provider | The place text a person types and a coarse location bias |
| Map tile provider | Requested map tiles and request metadata |
| Participant devices | Exact journey state and identity secrets, encrypted at rest |

Fresh installations keep one unpublished `nsec-tree` root, AES-GCM encrypted
under a non-exportable WebCrypto key held in IndexedDB. Rider, driver and each
selected managed operator get deterministic but cryptographically unlinkable
child identities. Public availability uses a separate per-shift random key;
journey rendezvous and gift-wrap keys remain random. Existing installations
keep their current identity unless the human explicitly chooses the destructive
"start fresh" migration in Account. Exact journey records are separately
NIP-44 encrypted. A compromised app origin executing code while the app is open
can still use the root and loaded identity, so this is storage protection and
metadata minimisation, not an anonymity or "no PII" claim.
See [privacy modes](./docs/PRIVACY-MODES.md).

## Develop the PWA

```bash
git clone https://github.com/TheCryptoDonkey/DonkeyRide.git
cd DonkeyRide/web
npm install

# Point this at a browser-reachable Valhalla-compatible endpoint.
VITE_PUBLIC_ROUTING_URL=https://router.example npm run dev
```

The default relay set is `wss://relay.damus.io,wss://nos.lol`; it can be set at
build time with `VITE_NOSTR_RELAYS` or changed later in Account.

Build static installable files:

```bash
cd web
VITE_COORDINATION_MODE=direct \
VITE_PUBLIC_ROUTING_URL=https://router.example \
VITE_NOSTR_RELAYS=wss://relay.example,wss://relay2.example \
npm run build
```

Serve `web/dist/` from any HTTPS static host. Rider routes use `index.html`;
`/provide*` and `/drive*` must fall back to `driver.html`. HTTPS is required for
browser geolocation, secure storage and service workers. The complete Caddy
example is in [static PWA deployment](./docs/DEPLOY-PWA.md).

Android drivers can use the PWA or a signed native app whose foreground shift
service keeps the direct Nostr subscription and location watcher alive with the
screen off. Build and publish it alongside the static PWA with:

```bash
scripts/publish-driver-apk.sh direct https://ride.example.com
```

The build writes a versioned APK, checksum and signed-release metadata into the
gitignored `web/public/downloads/` directory. See [native driver apps](./docs/NATIVE-APPS.md).
Neither rider nor driver asks for device location merely on opening: riders
choose **Use my current location**, while drivers start it with **Go Online**.

## Optional managed operator

The Node.js reference operator remains available for a firm that wants to run
one. It provides domain profiles, authenticated REST/WebSocket lifecycle,
admission policy, optional records and optional payment integrations.

```bash
npm install
docker compose -f docker-compose.demo.yml up --build
```

That is not required by the default PWA. PostgreSQL is used only when an
operator explicitly sets `DATABASE_URL`; Redis is used only when it explicitly
sets `REDIS_URL`. Their presence creates operator-held records and therefore a
different privacy/compliance posture. See [operator policy](./docs/OPERATOR-POLICY.md)
and [operator deployment](./guides/OPERATOR-DEPLOYMENT.md).

## Verification

```bash
# Backend/reference-operator unit and integration tests
npm test

# PWA unit tests and production build
cd web
npm test
npm run build

# Static direct-mode: two isolated phones, mocked relay/router/geocoder/GPS,
# no coordinator HTTP or operator WebSocket allowed
npm run test:ui:direct

# Read-only mobile smoke against the deployed PWA (override LIVE_PWA_URL)
npm run test:ui:live

# Optional managed mode: real local operator, two phone sizes
npm run test:ui
```

The direct browser journey covers discovery, no-money matching, encrypted exact
itinerary handoff, road routing, acceptance, arrival, start and completion. A
separate browser check denies location permission and proves manual pickup
remains usable without opening another window. The direct coordination unit
test covers an ordered multi-stop no-money journey and verifies that exact
points and address strings never appear in relay events.

## Repository map

- `web/` — installable rider and driver PWA; direct mode is the default
- `src/`, `server.js` — optional reference operator
- `domain-profiles/` — managed-operator service/state profiles
- `settlement/`, `payment-providers/` — optional operator settlement modules
- `specs/` — TROTT protocol material retained by the reference implementation
- `docs/PRIVACY-MODES.md` — exact component/data boundary
- `docs/DEPLOY-PWA.md` — static production deployment

## Licence

MIT Licence — Copyright (c) 2025–2026 DonkeyRide Community. See [LICENSE](./LICENSE).
Bundled third-party code remains under its own permissive terms; see
[THIRD_PARTY_NOTICES](./THIRD_PARTY_NOTICES.md).
