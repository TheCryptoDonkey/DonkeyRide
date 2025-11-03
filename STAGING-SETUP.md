# DonkeyRide Staging Setup

Use this guide when graduating from demo mode to a staging cluster that exercises the production payment and reputation flows.

## 1. Lightning Provider Configuration
- Export real provider credentials and choose your primary in `PAYMENT_PROVIDER`.
- Declare an explicit fallback chain in `PAYMENT_FALLBACKS` to mirror production ordering (e.g. `PAYMENT_FALLBACKS=lnd,btcpay,alby`).
- Mirror the list for the stake manager by setting `STAKE_PROVIDERS` with the same order so rider/driver holds use identical backends.
- For every provider you reference, load the matching environment variables (see `payment-providers/` for required keys).

## 2. Enforce Strict Reputation Publishing
- Point `REPUTATION_RELAYS` at the staging relay cluster you control (comma separated WebSocket URLs).
- Set `REPUTATION_STRICT=true` to fail any write that cannot be persisted to your relay mesh.
- Keep a short-lived memory cache by tuning `REPUTATION_CACHE_MS` (e.g. 5000) so UI queries stay snappy while still forcing relay success.

## 3. GDPR-Conscious Identity Flow
- Store only pseudonymous Nostr identifiers in the relay; augment with per-ride metadata inside your own cache/database if extra context is required.
- When staging requires real phone/email contact, hold that data in your operator backend and reference it via ride IDs—not inside nostr events.
- Verify the panic/rating events created by the clients include no personal data beyond npubs and ride IDs.

## 4. Safety & Panic Drill
- With staging keys, run through: rider panic, driver panic, timed safety check timeout. Confirm websocket broadcasts and that `cached_locally` never appears with `REPUTATION_STRICT=true`.
- Exercise the manual cancellation ladder (rider and driver) to confirm stake forfeiture fires through the configured Lightning provider.

## 5. Run the Integration Suite
- Set `NODE_ENV=test` and execute `npm test` to run the NIP-98 and reputation fallback coverage locally.
- For staging verification, re-run the tests after pointing `REPUTATION_RELAYS` to your staging relays and confirm they pass without mock fallbacks.

## 6. Operational Checklist
- Monitor provider health with `GET /info`; ensure `trustModel` and capabilities match the intended backend.
- Capture logs for nostr publish failures—these should be empty once `REPUTATION_STRICT=true` and relays are reachable.
- Verify Redis telemetry or disable via `DISABLE_REDIS=true` if your staging environment does not yet support driver telemetry.
