# Regulatory Posture: Non-Custodial Coordinator

**Applies to**: the default DonkeyRide reference operator.

The reference operator is an **information-society coordination service**, not a
payment institution, e-money institution, or money transmitter. This document
states how the software enforces that, so an operator can assess its own
position before deploying.

## The operator never touches money

A money transmitter / payment institution is defined by **receiving, holding,
or controlling funds** for the purpose of transferring them. The reference
operator does none of these:

- **Default rail is `cash` (record-only).** The fare settles directly between
  rider and driver (face to face, or wallet to wallet). The operator only
  records that settlement happened. `custody: 'none'`.
- **The operator takes no cut of a fare.** `OPERATOR_FEE_PERCENT` defaults to
  `0`. Because the operator never holds the fare, it cannot deduct from it.
  Every settlement record carries `operator_transmitted: 0` and
  `settlement: 'peer-to-peer'`.
- **Custodial rails are not available in the reference operator.** Runtime
  policy allows only record-only `cash`, plus `demo` outside production. It
  rejects `lnd`, `btcpay`, `alby`, `cln` and unknown providers regardless of
  environment variables or self-declared licensing. Regulated custody belongs
  in a separate, reviewed integration; it cannot be switched on here.
- **`/info.regulatory`** advertises the posture in machine-readable form:
  `{ role: 'coordinator', money_transmitter: false, custody: 'none',
  settlement: 'peer-to-peer' }`.

Commitments in the reference model are **social/reputational records**, not
funds the operator escrows. Cancellation and dispute routes release every
record-only commitment, move zero money and may tell the non-cancelling party
that a late cancellation is reportable. They do not impose a debt or execute a
forfeiture.

### Settlement rails (all non-custodial)

The rider pays the driver directly on a rail of their choosing; the operator
only advertises the driver's accepted rails, resolves a payable artefact, and
records or verifies proof. `settlement/` rails:

- **Lightning** (`lnaddress`) — the driver's Lightning Address; the rider pays
  from their own wallet (QR/deeplink or a connected NWC wallet). Verified by the
  payment preimage. The operator resolves the address to an invoice but never
  pays it — paying from an operator float would make it custodial.
- **Tando** (`tando`) — the driver's Kenyan number resolves to
  `2547…@bitcoin.co.ke`, an ordinary Lightning Address that settles to the
  driver's M-Pesa. The rider pays Lightning; the driver gets shillings. Tando
  (not the operator) performs the conversion and momentary custody. This is the
  **recommended** way to give M-Pesa payouts with a cryptographic receipt.
- **M-Pesa** (`mpesa`) — direct "Send Money" to the driver's number; the rider
  enters the confirmation code and the driver confirms receipt. The operator
  runs **no** paybill/till/STK-push and initiates no B2C disbursement — any of
  those would route funds through an operator shortcode and make it an
  aggregator. The trade-off is that a self-reported SMS code is a weak,
  human-attested receipt, not cryptographic proof; prefer Tando where possible.
- **Cash** — in person; the driver confirms on receipt.

NWC (NIP-47) is a client-side capability: the rider connects their own wallet
and it pays the driver's invoice. The operator never holds the connection
secret or the funds.

## The operator holds no database

The default operator runs with **no PostgreSQL and no Redis**:

- **Durability lives on Nostr.** The operator publishes a kind 30078 state
  snapshot on every task mutation and rehydrates active tasks from its own
  snapshots on restart. No operator-side database is required.
- **The snapshot is sealed, not merely coarse.** Location is reduced to a
  geohash cell before anything leaves memory, and the whole body is then
  encrypted (NIP-44) to the operator's own key; only the task id and a NIP-40
  expiry are visible on the wire. This matters for GDPR because coarse
  location is **not** anonymous location: a pseudonymous key plus a ~1 km cell
  plus a timestamp, repeated across journeys, is personal data under Article 4
  and identifies a home. A relay is append-only, so nothing published there
  can be erased under Article 17 — which makes "publish less" the only
  workable erasure story. The snapshot has one reader (this operator, at
  boot), so it is written for that reader alone.
- **Blind mode does not receive the exact itinerary.** The browser routes the
  ordered points directly with the configured Valhalla service. The coordinator
  receives geohash-5 cell centres and distance/time totals. Once matched, the
  requester sends exact points, addresses and notes to the provider as a signed
  NIP-17 envelope; each device stores its copy NIP-44-encrypted.
- **Redis** was only ever an optional presence cache for demo bot fleets; real
  driver presence is in-memory. It is disabled by default.

This is minimisation, not “no PII.” The coordinator still processes IP
addresses, timing, task ids, coarse location and pseudonymous pubkeys, and the
selected router necessarily processes exact route points. Encryption and
pseudonymisation do not automatically remove data-protection obligations.

## Journeys without money

`settlement_mode=none` is a first-class coordination contract. The server
records a zero fare and disables payment methods, stakes, payment instructions,
settlement proofs and tips. Ordered stops and road routing still work. No
passenger/child/third-party name field exists; legacy `passenger` input is
ignored.

## Separate regulated products are separate software

A firm that deliberately accepts additional data responsibilities may opt into:

- `OPERATOR_DATA_MODE=managed` — exact journey points travel through the
  operator's authenticated API and are available to its lifecycle logic.
- `DATABASE_URL` — durable operator-side storage (e.g. to retain PII for the
  legally required period). This is the operator's controller obligation.
There is no equivalent custody opt-in. A regulated custody, escrow or
conditional-bond product requires a separate adapter and release, written
jurisdiction-specific perimeter advice, consumer-terms review and independent
security assessment. The reference operator cannot be converted by setting an
environment flag.

For a UK commercial ride-bond pilot, [UK-RIDE-BOND-GATE.md](UK-RIDE-BOND-GATE.md)
is a blocking engineering release gate.

## Not legal advice

This describes what the software does. Whether a given deployment is a regulated
activity depends on jurisdiction and how the operator runs it. Operators are
responsible for their own legal position.
