# GDPR Compliance Guide for Operators

**Last Updated**: 2026-08-13
**Applies to**: EU GDPR, UK GDPR, and the Data (Use and Access) Act 2025

---

## Overview

DonkeyRide's three-layer architecture is designed for GDPR compliance. This document explains what data goes where, who is the controller, and what operators must do to comply.

**Key principle**: Data minimisation by design. PII is either encrypted between parties (NIP-17), sealed to the operator's own key, or held by the operator under standard GDPR controller obligations. What remains readable on a public relay is limited to what genuinely has to reach strangers.

> **Pseudonymous is not anonymous.** A stable pubkey is personal data under Article 4 as soon as anything can be attached to it, and a relay is append-only infrastructure with no delete — so nothing published there can be erased on request under Article 17. That makes *publishing less* the only workable erasure story, and it sets the bar higher than "contains no name or address":
>
> - **Coarse location still identifies.** A pubkey plus a ~1 km geohash cell plus a timestamp, repeated across a person's journeys, resolves to a home. The kind 30078 state snapshot therefore reduces location to a cell **and then seals the whole body** (NIP-44, to the operator's own key), leaving only the task id and a NIP-40 expiry visible. Its only reader is the operator rehydrating at boot.
> - **Watch what joins.** Task events share the task id, so two innocuous events can compose into a travel history. Task announcements (kind 37500) are consequently signed by a **throwaway key**, never the requester's identity key.
> - **`p` tags are a per-person index.** Reputation events need that; payment receipts (kind 30535) do not, and are off by default.
>
> **Implementation status (honest)**: NIP-17 gift wrap is implemented for chat, trip sharing and exact itinerary delivery. With `OPERATOR_DATA_MODE=blind`, exact pickup, drop-off, ordered stops, addresses and meeting notes stay on the requester device until a provider accepts, then travel as a signed NIP-17 envelope to that provider. Device copies are NIP-44 encrypted. The coordinator receives geohash-5 cell centres, routed distance/time totals, task ids, timing and participant pubkeys. The browser-selected router necessarily receives exact route points. `OPERATOR_DATA_MODE=managed` instead sends exact points to the operator over authenticated HTTPS/WSS.
>
> Encryption and pseudonymisation do **not** make this “no PII.” The ICO explicitly treats pseudonymised data as personal data for anyone holding the additional information, and network metadata can remain identifying: [ICO pseudonymisation guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-sharing/anonymisation/pseudonymisation/).

---

## Three-Layer Compliance Architecture

### Layer 1: Nostr (Public / Pseudonymous)

**What goes on Nostr:**

| Data Type | Example | GDPR Basis | Erasure Method |
|-----------|---------|------------|----------------|
| Pseudonymous pubkeys | `npub1abc...` | Legitimate interest (Art. 6(1)(f)) | Crypto-shredding + NIP-62 |
| Geohash locations | `gcpuuz` (~5km area) | Legitimate interest | NIP-40 expiration |
| Ratings and reputation | "4.8 stars, 342 tasks" | Legitimate interest | Crypto-shredding |
| Operator bonds | "£50,000 bond" | Public accountability | Event replacement |
| Service areas | "London, ridesharing" | Operational data | Event replacement |
| Encrypted PII (NIP-17) | Gift-wrapped address | Consent / contract (Art. 6(1)(a)/(b)) | Crypto-shredding |
| Encrypted coordination (NIP-44) | "I'm outside" | Contract performance | Crypto-shredding |

**GDPR measures:**
- **Data minimisation**: Only pseudonymous identifiers on public events. No exact addresses, no real names, no phone numbers.
- **NIP-40 expiration**: Time-limited events (availability, requests) auto-expire. Relays delete expired events.
- **Crypto-shredding**: Destroy key pair → all encrypted data unreadable (see below).
- **NIP-62 (Request to Vanish)**: Relay-side deletion of all events for a pubkey.

### Layer 2: Managed operator (optional controller mode)

**What stays with the operator:**

| Data Type | Retention | GDPR Basis | Erasure |
|-----------|-----------|------------|---------|
| Safety monitoring records | Duration of legal obligation | Legal obligation (Art. 6(1)(c)) | Delete when obligation expires |
| Background check results | 7 years (regulatory) | Legal obligation | Delete after retention period |
| Insurance documentation | Duration of policy | Legal obligation | Delete when expired |
| Compliance audit trails | 7 years (tax law) | Legal obligation (Art. 6(1)(c)) | Delete after retention period |
| GPS traces | 90 days | Legitimate interest | Auto-purge at 90 days |
| Chat messages | 90 days | Contract performance | Auto-purge at 90 days |
| Task photos | 90 days | Contract performance | Auto-purge at 90 days |

**GDPR measures:**
- Standard controller obligations: lawful basis documented for every data type
- Retention policies enforced automatically (90-day purge for operational data)
- Right to erasure honoured for all data except where legal retention overrides (Art. 17(3)(b))
- Data Processing Agreements (DPAs) with all sub-processors

> The table above describes a **managed operator that has chosen durable
> storage** (`DATABASE_URL` set). The default operator has no database and
> no Redis. In blind mode it also does not receive the exact itinerary. That
> is data minimisation, not exemption from data-protection law: coarse cells,
> pubkeys, IP addresses and timing can still be personal data.

#### Logs are storage, and they were the weak point

Everything the operator prints to stdout is **durable**. Docker's
`json-file` driver writes it to disk and keeps it (3 x 10 MB by default on
the reference deployment) across process restarts. It is therefore:

- outside the "in-memory and ephemeral" claim the architecture rests on,
- outside every `/api` privacy control and the erasure workflow below,
- invisible — nobody reads stdout until something is already wrong.

A production log was found holding both halves of a travel history:

```
✅ Task created: ride_a85b1178 [ridesharing] (npub1ht0jln4…)
OSRM routing error: request to http://localhost:5001/route/v1/driving/
  -0.1278,51.5074;-0.0922,51.5155?overview=full… failed
```

Who (an npub resolves via kind 0 to a name and face), from where, to
where, when — joined by the ride id, in plaintext. Note that neither line
was a deliberate log of anything sensitive: the identity came from a
routine lifecycle message, and the coordinates came from an **error path**,
where `node-fetch` puts the whole request URL into `error.message`. That
is the shape to watch for. Error paths fire when the system is already
degraded and nobody is looking.

**Rules now enforced:**

- The lifecycle logs a task id and never an identity. A task id names a
  job, not a person, and it is what an operator needs to stay operable.
- No error object or raw `error.message` from an HTTP call is ever logged.
  `safeErrorMessage()` in `src/log-redact.js` strips URL paths and queries,
  coordinate pairs, npub/nsec and 64-hex keys, while keeping the scheme and
  host so you can still see *which* service failed. Logging the raw object
  is worse than the message: `console.error('x:', error)` also prints
  `cause` (the URL again) and, on axios-shaped errors, request headers —
  which is how an `ORS_API_KEY` would reach disk.
- Pinned by `tests/integration/log-privacy.test.js`, which asserts against
  the verbatim production leak.

**If you operate a deployment**, treat container logs as a data store: set
retention deliberately, restrict who can `docker logs`, and include them in
your ROPA. They are not exempt because they are "just logs".

### Layer 3: Payment Providers (Third Party)

**What payment providers hold:**

| Provider | Data Held | GDPR Role | Notes |
|----------|-----------|-----------|-------|
| NIP-47 (trustless) | None — direct wallet-to-wallet | N/A | No payment data touches the operator |
| Strike | Transaction records, KYC if applicable | Independent controller | Strike's own privacy policy applies |
| Stripe | Transaction records, card details | Processor (under DPA) | Stripe's GDPR-compliant infrastructure |
| PayPal | Transaction records, account details | Independent controller | PayPal's own privacy policy applies |

**GDPR measures:**
- Operator must have DPA with each payment provider acting as processor
- Independent controllers (Strike, PayPal) have their own GDPR obligations
- NIP-47 (trustless): no payment data touches the operator at all — the most privacy-preserving option

---

## Crypto-Shredding

### How It Works

When a user exercises the right to erasure (Article 17), the protocol destroys their Nostr key pair. All data encrypted with those keys becomes permanently unreadable — the ciphertext remains on relays but cannot be decrypted.

```
1. User requests erasure
2. Operator destroys user's encryption key pair
3. All NIP-17 gift-wrapped messages: indecipherable
4. All NIP-44 encrypted events: indecipherable
5. Ciphertext remains on relays but is meaningless noise
6. Operator deletes all PII from private database
7. NIP-62 Request to Vanish sent to relays for public events
```

### Regulatory Position

| Authority | Position | Source |
|-----------|----------|--------|
| **CNIL** (France) | Crypto-shredding "comes closer to compliance" with Article 17. Recommended approach for blockchain/distributed systems. | CNIL blockchain guidance |
| **EDPB** | Recommends storing only hashes, commitments, or ciphertexts on-chain. Crypto-shredding is a valid erasure technique for distributed systems. | EDPB Guidelines 02/2025 (April 2025) |
| **ICO** (UK) | Uses "motivated intruder" test — if no motivated intruder can recover the data, it is effectively erased. Destroying the key satisfies this. | ICO anonymisation guidance (March 2025) |

Crypto-shredding reduces accessibility but is not a magic change of legal
status. If a participant or operator still holds a key or other re-identifying
information, the data remains personal data for that party. Operators must
assess erasure and anonymisation against their actual threat model and current
regulator guidance rather than treating ciphertext as automatically anonymous.

---

## Pseudonymous Identifiers

### Nostr Pubkeys Are Personal Data

Under GDPR Recital 26 and the CJEU *Breyer* ruling (C-582/14), **pseudonymous identifiers are personal data**. Nostr pubkeys qualify because:

- They can be linked to a natural person by anyone who knows the pubkey-person mapping
- The operator typically has this mapping (from onboarding)
- Even without the mapping, they are "singling out" data under the EDPB definition

**Implications:**
- Publishing events with a pubkey is processing personal data
- The user who publishes is the primary controller (CNIL position)
- The operator is a controller for pubkeys they collect and store
- Relay operators are processors or independent controllers depending on their decision-making role

### Encrypted Data on Relays

| Data Type | Personal Data for Keyholder? | Personal Data for Relay? |
|-----------|------------------------------|--------------------------|
| NIP-44 ciphertext (content) | **Yes** (they can decrypt) | **Likely not** (they cannot access content) |
| Pubkeys on encrypted events | **Yes** | **Yes** (pubkeys are always personal data) |
| Timestamps | **Yes** (part of the profile) | **Yes** (combined with pubkeys) |

Relay operators process personal data (pubkeys, timestamps) regardless of encryption. They should be treated as processors under GDPR.

---

## Special Category Data (Article 9)

**This system processes Article 9 data.** It is easy to miss because it
never looks like health data in the code — it looks like a dispatch filter.

`accessOptions` in a domain profile (`wheelchair`, `step-free`,
`assistance dog`) are **data concerning health** under Article 4(15): they
relate to a person's physical condition and reveal disability status.
Article 9(1) prohibits processing them unless an Article 9(2) condition
applies. In this context that is **Article 9(2)(a), explicit consent** —
the requester volunteers the need in order to be matched with a vehicle
that can carry them.

Consequences, and how they are met:

| Requirement | Status |
|---|---|
| Never published to a relay (no erasure possible there) | **Done** — `access_needs` is deliberately excluded from the kind 30078 snapshot; pinned by `tests/integration/access-needs.test.js` |
| Never in a pre-accept payload (broadcast, replay, open list) | **Done** — disclosed only to the provider who has committed |
| In-memory only, lost on restart | **Done** — no database in the default posture |
| Never priced | **Done** — the profile schema *rejects* an `accessOptions` entry carrying a `fareMultiplier`; needing a ramp must not cost more |
| Fails closed | **Done** — an undeclared provider cannot see or accept the job |
| Not in logs | **Done** — see "Logs are storage" above |
| **Explicit consent captured and recorded** | **Done** — `AccessNeedsPicker` states, before the checkbox, what the data says, what it is used for, that only the assigned provider sees it, that it is never published and that it is deleted when the job ends. Pinned by `AccessNeedsPicker.test.tsx`. **Operator must still be able to evidence consent (Art. 7(1)) and make withdrawal as easy as giving (Art. 7(3)).** |
| **DPIA covering Article 9 processing** | **Drafted** — [`DPIA.md`](DPIA.md) §5.4. Article 35(3)(b) makes one mandatory at scale; the operator completes the deployment-specific rows |

**Self-declared gender** (women-only matching) is *not* Article 9 data on
the ordinary reading — Article 9(1) lists racial or ethnic origin,
political opinions, religious or philosophical beliefs, trade union
membership, genetic data, biometric data for unique identification, health,
sex life and sexual orientation. Gender is ordinary personal data under
Article 6. It is nonetheless handled to the same standard here (in-memory,
excluded from the snapshot, fail-closed, absent from ordinary requests)
because the harm from disclosure is comparable and the safety feature is
worthless if people cannot trust it.

**Third-party identity fields are not collected.** The former
`passenger: {name, note}` path has been removed and legacy clients have those
fields ignored. A journey can carry an anonymous seat/stop count and can use
`settlement_mode=none`; participants exchange any necessary human context in
their encrypted chat rather than registering another person's identity with
the coordinator.

## Right to Erasure Implementation

When a user exercises Article 17, operators must follow this procedure:

### Step 1: Operator Data

Delete all PII from PostgreSQL:
- Exact addresses and GPS traces
- Chat messages and task photos
- Contact details (phone, email)
- Any non-retained operational data

**Exception**: Retain data where legal obligation overrides (Art. 17(3)(b)):
- Payment records (7 years, tax law)
- Safety incident records (legal obligation)
- Background check records (regulatory retention)

### Step 2: Encrypted Nostr Data

Destroy the user's encryption key pair (crypto-shredding):
- All NIP-17 gift-wrapped messages become indecipherable
- All NIP-44 encrypted coordination events become indecipherable
- The ciphertext remains but is meaningless without the key

### Step 3: Public Nostr Events

Submit NIP-62 Request to Vanish to all relays:
- Relays supporting NIP-62 will delete all events for the pubkey
- Request deletion from known third-party relays
- No guarantee of universal deletion (relays are independent)

### Step 4: Ratings and Reputation

Ratings are published by **other users** about this user. Under GDPR:
- The rating publisher is the controller of their own event
- The operator can request relay deletion but cannot force it for events signed by other pubkeys
- Crypto-shredding makes the rated user's identity unresolvable (the pubkey becomes meaningless)

### Step 5: Payment Records

Retain for 7 years per tax law (Art. 17(3)(b) override). These are the operator's own records, not Nostr events.

---

## Data Controller Analysis

| Function | Controller | Rationale |
|----------|-----------|-----------|
| Publishing events to Nostr | **The user** | CNIL position: the user who publishes is the controller |
| Collecting PII for coordination | **The operator** | Operator decides means and purposes |
| Safety monitoring | **The operator** | Legal obligation |
| Background checks | **The operator** + screening provider | Joint controllers or controller-processor |
| Relay storage | **Relay operator** | Processor or independent controller |
| Payment processing | **Payment provider** (independent) or processor (under DPA) | Depends on contractual relationship |
| NIP-17 encrypted messages | **Sender and recipient** | End-to-end encrypted, operator has no access |

---

## Operator Compliance Checklist

### Before Deployment

- [x] **Data Protection Impact Assessment (DPIA)** — [`DPIA.md`](DPIA.md) is pre-filled for the reference implementation; complete every row marked **OPERATOR** and have it reviewed. Mandatory under Art. 35(3)(b) — this service processes Article 9 data.
- [x] **Record of Processing Activities (ROPA)** — [`ROPA.md`](ROPA.md) is pre-filled; complete the controller details and the transfer decisions in §4. Art. 30(5)'s small-organisation exemption does **not** apply here.
- [ ] **Data Protection Officer (DPO)** — appoint if processing personal data at scale
- [ ] **Privacy notice** — explain the three-layer architecture and what data goes where
- [ ] **Lawful basis documented** — for every category of personal data processed
- [ ] **Data Processing Agreements** — with all sub-processors (payment providers, relay operators, screening services)
- [ ] **Retention policies** — automated purge schedules (90 days for operational data, 7 years for tax/regulatory)

### Technical Requirements

- [ ] **NIP-62 compliant relay** — run a relay that supports Request to Vanish for operator-published events
- [ ] **Crypto-shredding capability** — ability to destroy user key pairs on erasure request
- [ ] **NIP-40 expiration** — all time-limited events include expiration timestamps
- [ ] **Automated data purge** — 90-day purge for GPS traces, chat messages, photos
- [ ] **Erasure workflow** — documented process for handling Article 17 requests within 30 days
- [ ] **Data export** — ability to provide machine-readable export (Article 20, right to portability)

### Ongoing Obligations

- [ ] **Respond to erasure requests** within 30 days
- [ ] **Respond to access requests** (Article 15) within 30 days
- [ ] **Report data breaches** to ICO/supervisory authority within 72 hours
- [ ] **Annual DPIA review** — update as processing changes
- [ ] **Maintain ROPA** — keep up to date as new data categories are added

---

## UK GDPR and Data (Use and Access) Act 2025

The UK GDPR is substantively aligned with EU GDPR. Key differences and clarifications from the Data (Use and Access) Act 2025:

- **ICO's "motivated intruder" test** — data is effectively anonymised if no motivated intruder with reasonable means could re-identify the data subject. Destroying encryption keys satisfies this test.
- **Pseudonymisation** — the DUA 2025 clarifies that pseudonymised data (including Nostr pubkeys) remains personal data, consistent with the EU position.
- **Crypto-shredding** — not explicitly mentioned in the DUA 2025, but the ICO's anonymisation guidance (March 2025) implicitly endorses it by focusing on whether data can be re-identified in practice.
- **No material divergence** — for DonkeyRide operators, the same compliance architecture works for both EU and UK GDPR.

---

## See Also

- **[DPIA.md](DPIA.md)** — Article 35 impact assessment, pre-filled
- **[ROPA.md](ROPA.md)** — Article 30 record of processing activities, pre-filled
- **[Architecture](https://github.com/TheCryptoDonkey/trott/blob/main/docs/architecture.md)** — Three-layer federated architecture
- **[TROTT-01: Core](https://github.com/TheCryptoDonkey/trott/blob/main/specs/TROTT-01-core.md)** — Core protocol (NIP-40 expiration, NIP-44 encryption)
- **[TROTT-05: Safety](https://github.com/TheCryptoDonkey/trott/blob/main/specs/TROTT-05-safety.md)** — Safety events (NIP-17 trip sharing)
- **[TROTT-03: Reputation](https://github.com/TheCryptoDonkey/trott/blob/main/specs/TROTT-03-reputation.md)** — Reputation and crypto-shredding
- **[guides/OPERATOR-DEPLOYMENT.md](../guides/OPERATOR-DEPLOYMENT.md)** — Deployment guide (includes GDPR setup)
