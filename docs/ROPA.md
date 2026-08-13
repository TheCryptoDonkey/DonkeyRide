# Record of Processing Activities (Article 30)

**Status:** template, pre-filled for the reference implementation
**Covers:** DonkeyRide reference operator, default non-custodial posture
**Last reviewed:** 13 August 2026

> Engineering documentation, not legal advice. Rows marked **OPERATOR** must
> be completed by whoever runs the deployment. Article 30 requires this
> record to be **in writing, kept up to date, and produced to the
> supervisory authority on request** — it is not optional paperwork, and
> the small-organisation exemption in Art. 30(5) does **not** apply here
> because the processing is neither occasional, involves special categories,
> and poses a risk to rights and freedoms.

---

## 1. Controller details (Art. 30(1)(a))

| Field | Value |
|---|---|
| Controller name | **OPERATOR** |
| Contact details | **OPERATOR** |
| Representative (Art. 27, if outside UK/EEA) | **OPERATOR** |
| Data Protection Officer | **OPERATOR** — required under Art. 37(1)(b)/(c) if you monitor systematically at scale or process special categories at scale. Both plausibly apply. Take advice. |
| Operator Nostr identity | Published as kind 30511; served at `GET /info` as `operator` |

---

## 2. Processing activities (Art. 30(1)(b)–(f))

Each row: purpose, data subjects, personal data, recipients, retention.

### 2.1 Task coordination — the core service

| | |
|---|---|
| **Purpose** | Match a requester to a provider; price, route and run the job to completion |
| **Lawful basis** | Art. 6(1)(b) performance of a contract |
| **Data subjects** | Requesters, providers |
| **Personal data** | Blind: pubkeys, task state, geohash-5 cells, road-route totals, stop count, fare/settlement mode and timestamps. Managed: additionally exact itinerary, notes, live position, vehicle/credential declarations and optional proof/payment data. |
| **Recipients** | The two participants. Exact routing coordinates go directly from the browser to the configured Valhalla service in blind mode (§4). |
| **Retention** | Coordinator state is **in memory only and erased on restart** by default. Participant devices retain their own encrypted itinerary. |
| **Where** | Coordinator `TaskManager` in-memory maps; NIP-44/NIP-17 ciphertext on configured relays; no PostgreSQL in the default stack |

### 2.2 Durability snapshots

| | |
|---|---|
| **Purpose** | Survive an operator restart without a database — active jobs must not vanish mid-journey |
| **Lawful basis** | Art. 6(1)(b) contract; Art. 6(1)(f) service continuity |
| **Data subjects** | Requesters, providers |
| **Personal data** | Pubkeys, status, geohash-precision location, fare — **all inside NIP-44 ciphertext sealed to the operator's own key**. Visible on the wire: task id (`d` tag) and expiry only. |
| **Recipients** | Relays named in `NOSTR_RELAYS` — which store it without being able to read it. Default: **nowhere**. |
| **Retention** | 24 h NIP-40 expiration (`SNAPSHOT_TTL_SECONDS`); relay retention is outside the operator's control |
| **Excluded deliberately** | Exact itinerary, route geometry, access needs, gender, pickup notes and third-party identity fields — never snapshotted |
| **Switch** | `NOSTR_SNAPSHOTS=false` for an operator with a database |

### 2.3 Access needs — **SPECIAL CATEGORY, Article 9**

This matching feature is managed-mode only. Blind mode leaves the declaration
on the device and does not send it to the coordinator.

| | |
|---|---|
| **Purpose** | Match a requester to a provider who can physically accommodate them |
| **Lawful basis** | Art. 6(1)(a) consent **and Art. 9(2)(a) explicit consent** |
| **Data subjects** | Requesters |
| **Personal data** | Access needs — **data concerning health** under Art. 4(15) (wheelchair, step-free, assistance dog) |
| **Recipients** | Only the provider who accepts the job |
| **Retention** | In memory only; erased on restart; **never published to any relay** |
| **Consent record** | Notice shown before the checkbox — purpose, recipient, non-publication and retention (`AccessNeedsPicker`) |
| **Safeguard** | The domain-profile schema **rejects** an access option carrying a `fareMultiplier` — an access need can never change the price |

**OPERATOR:** you must be able to evidence consent (Art. 7(1)) and make
withdrawal as easy as giving (Art. 7(3)).

### 2.4 Women-only matching

This matching feature is managed-mode only. Blind mode does not send gender
or women-only declarations to the coordinator.

| | |
|---|---|
| **Purpose** | Let a woman request, or a woman provider accept only, women-only jobs |
| **Lawful basis** | Art. 6(1)(a) consent |
| **Data subjects** | Requesters and providers who choose to declare |
| **Personal data** | Self-declared gender. **Not** Article 9 data (see DPIA §5.5), but handled to that standard. |
| **Recipients** | The operator's matcher; the counterparty implicitly |
| **Retention** | In memory; **excluded from the snapshot**, so lost on restart by design |
| **Note** | Ordinary requests carry no gender data at all |

### 2.5 Safety — panic, trip sharing, ride check

| | |
|---|---|
| **Purpose** | Raise an alarm; let a user share a journey with chosen contacts; detect a stalled or diverted trip |
| **Lawful basis** | Art. 6(1)(d) vital interests; Art. 6(1)(a) consent for guardian sharing |
| **Data subjects** | Requesters, providers, and **guardians** (third parties whose npubs the user stores) |
| **Personal data** | Panic flag, geohash-5 location, task id; exact location out-of-band to guardians and the counterparty |
| **Recipients** | Public relays (coarse event only); guardians via NIP-17, which the operator cannot read; the counterparty via the participant-gated socket |
| **Retention** | Kind 30540 is **permanent and public** — this is intended, so aggregators can price it in. Exact location is transient. |
| **Safeguard** | The operator refuses to relay a panic event carrying a `location` tag, **but still processes the alert** |

### 2.6 Reputation

| | |
|---|---|
| **Purpose** | Let strangers assess each other |
| **Lawful basis** | Art. 6(1)(f) legitimate interest — **and the publisher is the user, not the operator** (CNIL position) |
| **Data subjects** | Rated providers and requesters |
| **Personal data** | Kind 30520 rating: rater pubkey, subject pubkey (`p` tag), task id, score, feedback tags |
| **Recipients** | Public relays; anyone |
| **Retention** | **Permanent.** No erasure is possible; crypto-shredding does not help because ratings are deliberately unencrypted |
| **Note** | The operator stores no ratings and asserts no score. Aggregation happens **in the client**, with every signature verified there. `GET /api/reputation/:npub` is a fallback for when relays are unreachable. |

### 2.7 End-to-end encrypted messaging

| | |
|---|---|
| **Purpose** | Let participants talk; let a user brief their guardians |
| **Lawful basis** | Art. 6(1)(b) contract |
| **Data subjects** | Participants, guardians |
| **Personal data** | Message content, and whatever the user chooses to put in it |
| **Recipients** | **The other party only.** NIP-17 gift wrap with ephemeral per-message keys. |
| **Operator access** | **None.** The operator cannot read these and could not produce them if compelled. |
| **Retention** | Relay-dependent; the operator holds nothing |

### 2.8 Push notifications

| | |
|---|---|
| **Purpose** | Reach a backgrounded app with a job offer or a task update |
| **Lawful basis** | Art. 6(1)(b) contract; consent via the browser permission prompt |
| **Personal data** | Push endpoint URL — **device-addressing PII** — plus role and coarse targeting. Sensitive matching declarations are managed-mode only. |
| **Recipients** | The push service named in the endpoint (Google, Mozilla, Apple, or the driver's own UnifiedPush distributor) — **§4 applies** |
| **Retention** | **In memory only, never persisted, never published.** Cleared when the driver goes offline. |
| **Payload** | RFC 8291 encrypted; carries no requester identity and no exact coordinates |

### 2.9 Abuse prevention

| | |
|---|---|
| **Purpose** | Rate limiting |
| **Lawful basis** | Art. 6(1)(f) legitimate interest |
| **Personal data** | Authenticated pubkey where available, otherwise **IP address** (personal data — *Breyer*, C-582/14) |
| **Retention** | In-memory bucket, expires with the window. Not logged. |

### 2.10 Operational logs

| | |
|---|---|
| **Purpose** | Diagnose faults |
| **Lawful basis** | Art. 6(1)(f) legitimate interest |
| **Personal data** | **Intended: none.** Task ids, states, error classes, the operator's own pubkey. |
| **Controls** | Lifecycle logging carries no identity; `safeErrorMessage()` strips URL paths and queries, coordinate pairs, npub/nsec and 64-hex keys from anything logged (`src/log-redact.js`, pinned by `tests/integration/log-privacy.test.js`) |
| **Retention** | Docker `json-file`, 3 × 10 MB rolling on the reference deployment. **OPERATOR: set this deliberately and restrict who can read it.** |
| **History** | Logs previously contained npubs and exact coordinates from a routing error path. Fixed 4 August 2026 — see DPIA §5.3. |

### 2.11 Settlement records

| | |
|---|---|
| **Purpose** | Let the parties record that a fare was paid directly, peer-to-peer |
| **Lawful basis** | Art. 6(1)(b) contract |
| **Personal data** | Lightning address (public-safe); **M-Pesa number (per-ride PII)**; Cashu payment request; confirmation code |
| **Recipients** | The counterparty |
| **Retention** | In memory. M-Pesa numbers are **never relayed**. |
| **Note** | The operator moves £0 — `operator_transmitted: 0` on every settlement. Kind 30535 receipts are **off by default** and carry no `p` tags when enabled. |

### 2.12 Data the operator never holds

Recorded here because "we do not have it" is the answer to most access and
erasure requests, and you should be able to say so with confidence:

| Data | Where it actually lives |
|---|---|
| Journey history | Requester's and provider's own devices |
| Saved places (Home, Work, recents) | Device |
| Favourite providers | Device |
| Trip audio recordings | Device — AES-GCM in IndexedDB, auto-deleted after 72 h |
| Guardian contact lists | Device |
| Chat message content | Encrypted between the parties |
| Working areas, destination mode | Device |
| Reputation scores | Computed in the client from public events |
| Any money | Nowhere — settlement is peer-to-peer |

---

## 3. Recipients (Art. 30(1)(d))

| Recipient | Receives | Relationship |
|---|---|---|
| The counterparty | Whatever the job requires | Not a processor — a party to the contract |
| Relays in `NOSTR_RELAYS` | Sealed snapshots only | See §4 |
| Relays in `PUBLIC_RELAY_URLS` | Client-published events (ratings, panic, gift wraps, kind 0, task announcements) | Published by the **user** as controller of their own events |
| Routing backend (OSRM/ORS) | Coordinate pairs | Processor. **Self-host to avoid this entirely** — the reference deployment does. |
| Push services | Encrypted payload to a device endpoint | Processor / independent controller |
| Payment rails | Only if a custodial rail is enabled — **off by default** | Independent controllers |

---

## 4. Transfers outside the UK/EEA (Art. 30(1)(e), Chapter V)

**This is the weakest point in the record and needs an operator decision.**

Public relays are third-party hosts in unknown jurisdictions. There is no
contract with them, no Article 28 processor agreement, and no Chapter V
transfer mechanism. `relay.damus.io` and `nos.lol` are US-hosted.

Two distinct cases, and they are **not** the same:

| | Operator publishing | Client publishing |
|---|---|---|
| What | Kind 30078 snapshots | Ratings, panic, gift wraps, kind 0 |
| Who decides | **The operator** | **The user** |
| Position | The operator is the controller and is making a transfer | The user is the controller of their own signed events (CNIL); the operator provides a relay list |
| Mitigation | `NOSTR_RELAYS` defaults to **nowhere**. Name only relays you control. Content is sealed, so a relay receives ciphertext it cannot read — which materially weakens any argument that personal data was transferred at all. | Disclose in the privacy notice that publishing is inherently public and international, and that it cannot be undone |

**OPERATOR actions:**
1. Point `NOSTR_RELAYS` at a relay you control, in a jurisdiction you have
   assessed. The reference deployment uses `wss://relay.trotters.cc`.
2. Decide whether `PUBLIC_RELAY_URLS` should keep third-party relays.
   Removing them makes reputation invisible to anyone not pointed at you —
   which defeats portable reputation — so the default keeps them. Document
   the decision either way.
3. Self-host routing. A hosted routing API receives every pickup and
   dropoff you process.
4. Cover all of the above in the privacy notice, in plain language.

---

## 5. Retention summary (Art. 30(1)(f))

| Category | Retention |
|---|---|
| Blind coordinator task data (pubkeys, coarse cells, state, totals) | Until process restart |
| Exact itinerary and notes | Encrypted participant storage/relay retention; absent from blind coordinator |
| Managed access needs and gender | Until process restart; never relayed |
| Sealed snapshots | 24 h expiry, sealed throughout |
| Push subscriptions | Until the driver goes offline |
| Rate-limit buckets | Window duration |
| Operational logs | 30 MB rolling — **OPERATOR to set** |
| Ratings and panic signals | **Permanent and public** — no erasure possible |
| Device-local data | The user's own; they delete it |

---

## 6. Security measures (Art. 30(1)(g), Art. 32)

- NIP-98 signed HTTP authentication; single-use auth events on mutating
  requests (replay rejected); body hash verified
- WebSocket authentication; `subscribe_ride` is participant-only; the
  socket verifies participation whenever it has an identity
- **Refuses to boot** with `NODE_ENV=production` and auth unset
- **Refuses to boot** a custodial payment rail without
  `OPERATOR_LICENSED_CUSTODIAN=true`
- Rate limiting on all mutating routes; `trust proxy` set for correct
  per-IP buckets behind a reverse proxy
- NIP-44 for encrypted payloads, NIP-17 gift wrap for private exchange.
  NIP-04 is deprecated and unused.
- TLS termination at the reverse proxy; service ports bound to loopback
- Data minimisation enforced by tests, not policy — see the privacy suite:
  `snapshot-privacy`, `panic-privacy`, `log-privacy`, `relay-defaults`,
  `access-needs`, `payment-receipt`, `women-only`, and
  `web/src/services/events.test.ts`

**OPERATOR:** add your host hardening, patching, access control, backup and
breach-detection measures. Article 33 requires notification of a breach to
the supervisory authority within **72 hours**.

## See also

- `DPIA.md` — Article 35 impact assessment
- `GDPR-COMPLIANCE.md` — controller analysis, crypto-shredding, erasure workflow
- `REGULATORY-POSTURE.md` — why the operator is not a money transmitter
