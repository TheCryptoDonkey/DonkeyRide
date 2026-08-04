# Data Protection Impact Assessment (Article 35)

**Status:** template, pre-filled for the reference implementation
**Covers:** DonkeyRide reference operator, default non-custodial posture
**Last reviewed:** 4 August 2026
**Reviewer:** _(operator to complete)_

> This is engineering documentation, not legal advice. It is pre-filled with
> what is verifiably true of this codebase so that an operator starts from
> facts rather than a blank page. Every row marked **OPERATOR** depends on
> your deployment and your jurisdiction, and the whole document needs review
> by someone qualified before you carry real people.

---

## 1. Is a DPIA mandatory here?

Yes, for any deployment at meaningful scale. Article 35(3) makes one
mandatory for:

| Trigger | Applies? | Why |
|---|---|---|
| 35(3)(b) — large-scale processing of Article 9 special categories | **Yes, at scale** | `accessOptions` (wheelchair, step-free, assistance dog) are data concerning health under Article 4(15). See §5.4. |
| 35(3)(c) — systematic monitoring of a publicly accessible area | **Arguably** | Provider positions are tracked continuously while on shift. |
| 35(3)(a) — automated evaluation with significant effects | **No** | Dispatch is geographic and rule-based. There is no scoring, profiling or automated decision about a person. Reputation is computed **in the client** from signed public events; the operator asserts nothing. |

Supervisory authority "likely high risk" lists (ICO, EDPB) additionally name
**location tracking** and **processing data about vulnerable people**, both
of which apply.

**Conclusion: complete this DPIA before launch.** Article 35(1) requires it
*prior to* processing.

---

## 2. Systematic description of the processing (Art. 35(7)(a))

### 2.1 What the service does

Coordinates a physical service between two people — a requester who needs a
journey or task done, and a provider who does it. The operator matches them,
relays state changes, and prices the job. It is deliberately **non-custodial
and database-free by default**: it never receives funds and keeps no
durable record of a task.

### 2.2 Data flows

```
REQUESTER DEVICE ──┐                        ┌── PROVIDER DEVICE
   keys, history   │                        │   keys, history
   places, audio   │                        │   working areas
                   ▼                        ▼
              ┌─────────────────────────────────┐
              │ OPERATOR (in-memory, ephemeral) │  ← exact coordinates live
              │ coordination only, £0 handled   │    here and ONLY here
              └─────────────────────────────────┘
                   │                        │
                   │ sealed snapshot        │ nothing
                   ▼                        │
              ┌─────────────────────────────────┐
              │ PUBLIC RELAYS (permanent)       │  ← coarse, or encrypted,
              │ ratings, panic, announcements   │    or both
              └─────────────────────────────────┘
                   ▲                        ▲
                   └── NIP-17 gift wraps ───┘   ← operator cannot read
```

### 2.3 Purposes and lawful bases

| Purpose | Data | Lawful basis |
|---|---|---|
| Match a requester to a provider | Pickup/dropoff, pubkeys, service class | Art. 6(1)(b) contract |
| Price the job | Route distance/duration | Art. 6(1)(b) contract |
| Let the parties find each other at the kerb | Exact coordinates, pickup note, passenger name | Art. 6(1)(b) contract |
| Match an access need to a capable provider | Access needs | **Art. 9(2)(a) explicit consent** + Art. 6(1)(a) |
| Women-only pairing | Self-declared gender | Art. 6(1)(a) consent |
| Safety: panic, trip sharing, ride check | Location, guardian contacts | Art. 6(1)(d) vital interests / Art. 6(1)(a) |
| Reputation | Signed ratings | Art. 6(1)(f) legitimate interest (published by the *user*, not the operator) |
| Abuse prevention | Rate-limit buckets keyed by pubkey or IP | Art. 6(1)(f) legitimate interest |

**OPERATOR:** if you enable a custodial payment rail
(`OPERATOR_LICENSED_CUSTODIAN=true`), you acquire AML/KYC obligations and a
legal-obligation basis under Art. 6(1)(c) for records you must then keep.
That changes this table substantially.

---

## 3. Necessity and proportionality (Art. 35(7)(b))

The strongest proportionality argument available is that most of the data
**does not persist at all**:

| Measure | Effect |
|---|---|
| No database by default (`DATABASE_URL` unset) | Task data is lost on restart. There is no store to breach, subpoena or fail to erase. |
| No Redis | Presence is in-memory and ephemeral. |
| Operator handles £0 | No financial records, no transaction history, no money-transmitter obligations. `/info.regulatory` states this. |
| Reputation computed client-side | The operator holds no rating store and asserts no score. |
| Chat is NIP-17 gift-wrapped | The operator cannot read messages even if compelled. |
| Trip audio never leaves the device | AES-GCM in IndexedDB, auto-deleted after 72 h. |
| History is device-local | The operator cannot produce a journey history because it does not have one. |

**Data minimisation is enforced in code, not policy.** Examples that are
tested, not merely intended:

- Pre-accept payloads carry ~1 km rounded location and no route geometry;
  exact coordinates exist only for the provider who committed.
- The kind 30078 snapshot is NIP-44 sealed to the operator's own key and
  its tags reduced to `d` + `expiration` (`snapshot-privacy.test.js`).
- Access needs, gender, pickup notes and passenger names are **excluded
  from the snapshot entirely** — they do not survive a restart, by design.
- Payment receipts (kind 30535) are off by default and carry no `p` tags.
- The availability beacon is off by default (`VITE_TROTT_P2P_BEACON`).

---

## 4. Consultation

**OPERATOR:** Article 35(9) — seek the views of data subjects or their
representatives where appropriate. For this service that means at minimum
consulting disability groups about the access-needs flow (§5.4) and
women's-safety organisations about the women-only flow (§5.5), both of
which are features *for* the people most at risk from getting them wrong.

---

## 5. Risks to rights and freedoms (Art. 35(7)(c)) and measures (Art. 35(7)(d))

Risk ratings are **residual** — after the listed measures.

### 5.1 A public relay has no delete — Article 17 is impossible for anything published

**Risk: HIGH inherent, LOW residual.**

A relay is append-only infrastructure nobody controls. There is no delete,
no retention policy and no access log. Anything published is beyond erasure
in practice, so a rectification or erasure request cannot be honoured by
removal.

**Measures:**
- Publishing less is the erasure story. Only three things are published in
  the clear, and each has to be public to work: ratings (30520), panic
  signals (30540) and task announcements (37500).
- Everything else is either **sealed** (30078 snapshot, NIP-44 to the
  operator's own key) or **end-to-end encrypted** (NIP-17 chat and trip
  sharing).
- Crypto-shredding: destroying a key pair renders everything encrypted to
  it permanently unreadable. Recognised by CNIL and EDPB as an erasure
  technique for distributed systems (see `GDPR-COMPLIANCE.md`).
- NIP-40 expiration tags on time-limited events.
- `NOSTR_RELAYS` defaults to **nowhere**, so an operator never publishes to
  a third party by accident (`relay-defaults.test.js`).

**Residual:** ratings and panic signals are permanent and attributable. That
is the intended trade — reputation and accountability only work if they
persist — but it must be disclosed in the privacy notice.

### 5.2 The join key: coarse data plus a durable author key equals a travel history

**Risk: HIGH inherent, LOW residual. This is the architectural risk, and it
has materialised twice.**

Every task event shares the task id in its `d` tag, so any two compose. The
danger is never a single field; it is that a **durable signing key** turns
otherwise-harmless coarse events into a per-person index.

Two real incidents, both fixed and both pinned by tests:

1. **Kind 30078 snapshots.** The requester was not even `p`-tagged, but
   they signed their own 37500 announcement under the same task id with
   their identity key. One relay query for `authors:[them]` linked a person
   to every pickup cell, dropoff cell, fare and driver they had ever had.
   → Snapshots sealed; **task announcements now signed by a throwaway key**
   (`web/src/services/events.test.ts`).
2. **Kind 20500 availability beacons.** Providers signed one every 60
   seconds for a whole shift under the identity key that carries their name
   and every rating — a live, named, rated location feed. Nothing in the
   codebase read it. → Off by default.

**Measures:** every new published event must answer *"who reads this, and
what can be joined to it?"* — the three rules in `CLAUDE.md` under "What may
be left on a public relay". Ephemeral kinds are not a defence (relays do not
store them; subscribers can). `p` tags are a per-person index and are used
only where indexing by subject is the point.

**Residual:** requires ongoing discipline on every new event kind. Assign an
owner.

### 5.3 Logs as unaccounted storage

**Risk: HIGH inherent, LOW residual. Materialised; fixed 4 August 2026.**

Everything printed to stdout is durable — Docker's `json-file` driver keeps
it on disk across restarts, outside the erasure workflow and outside every
`/api` control. Production logs were found holding an npub and, from a
routing **error path**, exact pickup and dropoff coordinates under the same
ride id: a complete travel history one layer below the relay.

**Measures:**
- Lifecycle logging carries a task id and no identity.
- `safeErrorMessage()` (`src/log-redact.js`) strips URL paths and queries,
  coordinate pairs, npub/nsec and 64-hex keys from anything logged, keeping
  scheme and host for operability. Applied at every routing error site.
- Never log a raw error object: it prints `cause` (the URL again) and, on
  axios-shaped errors, request headers.
- Pinned by `tests/integration/log-privacy.test.js` against the verbatim
  production leak.

**OPERATOR:** treat container logs as a data store. Set retention
deliberately, restrict who can run `docker logs`, and list them in your
ROPA. Note that error paths fire when the system is degraded and nobody is
watching — that is precisely when they are least likely to be noticed.

### 5.4 Special category data: access needs

**Risk: HIGH inherent, MEDIUM residual.**

Wheelchair, step-free and assistance-dog options are **data concerning
health** under Article 4(15): ticking one discloses a disability. Article
9(1) prohibits processing without an Article 9(2) condition.

**Measures:**
- **Explicit consent, Art. 9(2)(a)**, captured at the point of asking. The
  requester sees what the data says about them, what it is used for, who
  receives it, that it is never published and that it is deleted when the
  job ends — *before* the checkbox (`AccessNeedsPicker.test.tsx`).
- Excluded from the kind 30078 snapshot entirely — health-adjacent data
  never reaches a relay, and does not survive a restart.
- Absent from every pre-accept payload; disclosed only to the provider who
  committed.
- **Never priced.** The profile schema *rejects* an `accessOptions` entry
  carrying a `fareMultiplier`. Needing a ramp must never cost more — this is
  an Article 5(1)(a) fairness control as much as an accessibility one, and
  a discrimination risk if it ever regressed.
- Fails closed: an undeclared provider cannot see or accept the job.
- Not logged (§5.3).

**Residual:** the provider who takes the job learns the need — unavoidable,
since they must meet it. Consent covers this and the notice says so.

**OPERATOR:** if you offer a domain whose `accessOptions` include anything
further (medical equipment, a named condition), reassess. Also note Art.
9(2)(a) consent must be **as easy to withdraw as to give**.

### 5.5 Self-declared gender and women-only matching

**Risk: MEDIUM inherent, LOW residual.**

Gender is **not** Article 9 data on the ordinary reading — Art. 9(1) lists
racial or ethnic origin, political opinions, religious or philosophical
beliefs, trade union membership, genetic data, biometric data for unique
identification, health, sex life and sexual orientation. It is ordinary
personal data under Article 6.

It is nonetheless handled to the Article 9 standard here, because the harm
from disclosure is comparable and a safety feature nobody trusts is
worthless.

**Measures:** device-local declaration; excluded from the snapshot (lost on
restart by design); ordinary requests carry no gender data at all; fails
closed; honest self-attestation copy — no screen claims verification.

### 5.6 Safety features create permanent public records

**Risk: MEDIUM inherent, LOW residual.**

A kind 30540 panic signal must be public and attached to the pubkey so
aggregators can price it in. But a permanent public record of precisely
where a frightened person stood helps whoever they are frightened of.

**Measures:**
- Panic events carry geohash-5 and **never exact coordinates**. The
  operator refuses to relay an event carrying a `location` tag — *but still
  processes the alert*, because a privacy rule must never break the safety
  path (`panic-privacy.test.js`).
- Exact position goes where it acts: NIP-17 to the user's guardians, and
  the participant-gated task socket for the counterparty — out-of-band on
  the request body, never inside the signed event.
- 30540 carries a `d` tag of the task id; without one, every alert a person
  raises would share `d=""` and silently replace the last.

### 5.7 Providers are identifiable and their working pattern is inferable

**Risk: MEDIUM inherent, MEDIUM residual.**

Providers are the most exposed population: they work under a durable key
that carries their name, their ratings and their livelihood. Riders are
comparatively transient.

**Measures:** beacon off by default (§5.2); provider position held in
memory only; credentials shown as an unverified *claim* with expiry
enforced; earnings exported to the driver's own device, never retained.

**Residual:** a provider's ratings accumulate publicly under one key, which
is the point of portable reputation but does allow long-term inference.
Disclose it in provider onboarding.

### 5.8 Third-party data: booking for someone else

**Risk: MEDIUM inherent, LOW residual.**

`passenger: {name, note}` processes someone who is not your user and who
cannot consent through your UI.

**Measures:** capped length, in-memory, excluded from every pre-accept
payload and from the snapshot, participant-gated.

**OPERATOR:** the Article 14 notice obligation is practically the
requester's, not yours, but take advice before scaling this.

### 5.9 Operator compromise while jobs are live

**Risk: MEDIUM inherent, MEDIUM residual.**

In-memory is excellent for erasure and useless against a live attacker: an
operator running active jobs holds exact coordinates and both identities for
those jobs, in RAM.

**Measures:** NIP-98 signed HTTP auth; participant-gated task access and
sockets; rate limiting; no funds to steal; the blast radius is bounded to
*currently active* tasks rather than all history.

**OPERATOR:** this is where your ordinary security obligations live —
Article 32. Host hardening, access control, patching, breach detection.

### 5.10 An unauthenticated deployment is an open deployment

**Risk: HIGH inherent, LOW residual.**

`authoriseRideActor` and `subscribe_ride` can only check participation when
there is a signature to check. Without one they admit anyone holding a task
id — and task ids are on public relays.

**Measures:** the server **refuses to boot** with `NODE_ENV=production` and
`ENABLE_NIP98_AUTH` unset (`ALLOW_UNAUTHENTICATED=true` for a throwaway
demo), and the socket verifies participation whenever it has an identity,
toggle or not.

### 5.11 Transfers outside the UK/EEA

**Risk: MEDIUM inherent, MEDIUM residual. See ROPA §4.**

Public relays are third-party hosts in unknown jurisdictions, with no
contract and no Article 28 processor agreement. Client-published events
(ratings, panic, gift wraps, kind 0) reach them by design.

**Measures:** the *operator's* relay list defaults to nowhere and should
name only relays you control. Client publications are made by the user as
controller of their own events (CNIL position), which is the strongest
available characterisation — but see ROPA §4 before relying on it.

---

## 6. Outcome

| | |
|---|---|
| Residual risk overall | **Acceptable for the reference implementation**, subject to the OPERATOR items above |
| Prior consultation with the supervisory authority required (Art. 36)? | **No** — Art. 36(1) is triggered only by *high* residual risk after mitigation. No risk above remains high. **OPERATOR: re-assess if you enable a custodial rail, a database, or a domain with richer special-category options.** |
| Review trigger | Any new published event kind; any new `accessOptions` entry; enabling `DATABASE_URL`, a custodial rail, or `VITE_TROTT_P2P_BEACON`; any new logging of user data |
| Next scheduled review | **OPERATOR** — annually at minimum |

## See also

- `GDPR-COMPLIANCE.md` — controller analysis, crypto-shredding, erasure workflow
- `ROPA.md` — Article 30 record of processing activities
- `CLAUDE.md` § "What may be left on a public relay" — the three rules that keep §5.2 from recurring
- `REGULATORY-POSTURE.md` — why the operator is not a money transmitter
