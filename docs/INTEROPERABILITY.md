# Interoperability Analysis: DonkeyRide & Ridestr

**Version**: 1.0
**Date**: 2026-02-10
**Status**: Proposal for discussion

---

## Overview

DonkeyRide and Ridestr are both building decentralised ridesharing on Nostr. We use incompatible event kinds but share
fundamental design patterns. This document analyses both protocols, identifies common ground, and proposes a concrete
path toward interoperability — where both projects benefit.

**DonkeyRide**: Node.js operator server + React SPA, domain-agnostic (ridesharing, locksmith, delivery, security guard,
and more), payment-agnostic (8 providers), 8 modular NIP specifications across kinds 30500-30599.

**Ridestr**: Kotlin Android (Ridestr + Drivestr apps), pure P2P (no server), Cashu NUT-14 HTLC escrow, kinds
30173-30182 + 3173-3188.

Despite different architectures, both projects independently converged on the same Nostr primitives: geohash discovery,
NIP-44 encryption, NIP-40 expiration, and progressive location privacy. This is a strong signal that these patterns are
correct — and that convergence is achievable.

---

## 1. Protocol Comparison

### Event Kind Mapping

| Function                  | DonkeyRide                                  | Ridestr                                               | Notes                                                                                                                                                |
|---------------------------|---------------------------------------------|-------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Service request**       | 30500 (replaceable)                         | 3173 (regular)                                        | DonkeyRide uses NIP-33 replaceable; Ridestr uses regular events. Both support geohash `g` tags for broadcast discovery.                              |
| **Provider availability** | 20500 (ephemeral)                           | 30173 (replaceable)                                   | DonkeyRide uses ephemeral range (relays discard); Ridestr uses replaceable (persists until replaced). Both carry geohash `g` tags at precisions 3-5. |
| **Service acceptance**    | 30501 (replaceable)                         | 3174 (regular)                                        | Ridestr includes `wallet_pubkey` in acceptance content — a pattern DonkeyRide could adopt.                                                           |
| **Service confirmation**  | 30504 (replaceable, operator)               | 3175 (regular, rider)                                 | DonkeyRide's operator confirms the match; Ridestr's rider confirms (no operator). Ridestr embeds `payment_hash` + `escrow_token` here.               |
| **Status updates**        | 30512 (replaceable)                         | 30180/30181 (replaceable)                             | DonkeyRide uses a single status kind; Ridestr uses per-party consolidated state events with history arrays.                                          |
| **Service start**         | 30507 (replaceable)                         | 30180 action `status: "in_progress"`                  | DonkeyRide: dedicated event. Ridestr: action within consolidated state.                                                                              |
| **Service end**           | 30508 (replaceable)                         | 30180 action `status: "completed"` + settlement proof | Same pattern difference as service start.                                                                                                            |
| **Cancellation**          | 30506 (regular)                             | 3179 (regular)                                        | Both are append-only. Ridestr adds 24-hour expiry for dispute window.                                                                                |
| **Chat**                  | WebSocket (ephemeral)                       | 3178 (NIP-44 encrypted)                               | DonkeyRide uses operator WebSocket; Ridestr publishes encrypted events to relays.                                                                    |
| **Ratings**               | 30517/30518/30530                           | —                                                     | **Ridestr has no rating system.**                                                                                                                    |
| **Disputes**              | 30522-30527, 30549-30554                    | —                                                     | **Ridestr has no dispute resolution.**                                                                                                               |
| **Safety**                | 30559-30564                                 | —                                                     | **Ridestr has no safety features.**                                                                                                                  |
| **Stakes/escrow**         | 30502/30503/30509/30520                     | Cashu NUT-14 HTLC via 3175 content                    | DonkeyRide: operator-mediated, payment-agnostic. Ridestr: trustless P2P HTLC.                                                                        |
| **Payments**              | 30510-30516, 30523                          | Settlement proof in 30180                             | DonkeyRide: streaming payments, tips, surcharges as separate events. Ridestr: single settlement action.                                              |
| **Discovery**             | 30565 (service area) + 20500 (availability) | 30173 (availability with geohash)                     | Both use geohash `g` tags. DonkeyRide adds operator service area declarations.                                                                       |
| **Navigation**            | 30583-30587                                 | Valhalla tiles via 30078                              | DonkeyRide: operator-pushed routes. Ridestr: client-side offline routing with Blossom-hosted tiles.                                                  |
| **Profile backup**        | —                                           | 30174 (ride history) + 30177 (profile)                | NIP-44 self-encrypted. DonkeyRide stores this operator-side.                                                                                         |
| **Personal network**      | —                                           | 30011/30012/30013/30014 + 3186-3188 (RoadFlare)       | **Unique to Ridestr.** Encrypted location sharing to approved followers.                                                                             |

### Kind Range Comparison

```
DonkeyRide:  20500 ........... 30500━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━30599 ... 30600━━30639
             ephemeral        core/stakes/pay/rep/disputes/safety/nav/discovery   domain extensions

Ridestr:     3173━━━━3188 ... 30011━━30014 ... 30078 ... 30173━━━━30182
             ride lifecycle   RoadFlare        tiles     availability/backup/state/admin
```

No kind number conflicts exist between the two protocols.

### Tag Comparison

| Tag                     | DonkeyRide                                               | Ridestr                                                                    | Compatible?                                                                                                                |
|-------------------------|----------------------------------------------------------|----------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------|
| `d` (NIP-33 identifier) | Task ID, operator pubkey, subject pubkey                 | `rideshare-availability`, confirmation event ID, `rideshare-history`, etc. | Yes — same NIP-33 semantics                                                                                                |
| `g` (geohash)           | Precisions 3-5 on discovery events                       | Precisions 3-5 on availability (30173) and broadcast offers (3173)         | **Identical**                                                                                                              |
| `p` (pubkey reference)  | Rated pubkey, notification targets                       | Recipient of offers, followed drivers                                      | Yes — same semantics                                                                                                       |
| `e` (event reference)   | Task reference, dispute reference                        | Availability, offer, acceptance, confirmation references                   | Yes — same semantics                                                                                                       |
| `expiration` (NIP-40)   | On time-limited events                                   | On all transient events (5 min to 24 hours)                                | **Identical**                                                                                                              |
| `domain`                | Service domain identifier (ridesharing, locksmith, etc.) | Not used                                                                   | DonkeyRide-specific; no conflict                                                                                           |
| `amount` / `currency`   | As tags on event envelope                                | As JSON content fields                                                     | **Structural difference** — DonkeyRide puts monetary data in tags for relay-side filtering; Ridestr embeds in content JSON |
| `trust_model`           | On all payment events                                    | Not used                                                                   | DonkeyRide-specific                                                                                                        |
| `transition`            | Not used                                                 | References last state event from other party                               | Ridestr-specific; enables A-to-B state chain validation                                                                    |
| `t` (hashtag)           | Not used                                                 | `rideshare`, `ride-request`, `roadflare` markers                           | Ridestr-specific                                                                                                           |
| `status`                | As a tag on 30512                                        | Public tag on RoadFlare location (30014)                                   | Compatible semantics                                                                                                       |

### State Machine Comparison

**DonkeyRide** — separate events per state transition:

```
30500 (request) → 30501 (acceptance) → 30504 (confirmation) → 30512 (en_route)
→ 30512 (arrived) → 30507 (start) → 30508 (end)
```

**Ridestr** — distinct events for handshake, consolidated events for ride execution:

```
3173 (offer) → 3174 (acceptance) → 3175 (confirmation) → 30180/30181 (state updates)
```

Both support the same logical states (requested → matched → en_route → arrived → active → completed), but Ridestr's
consolidated approach reduces relay writes during the active ride phase.

---

## 2. Common Ground

These patterns were independently adopted by both projects, confirming them as best practice for Nostr-based service
coordination.

### Geohash Discovery (`g` tags)

Both projects use `g` tags at geohash precisions 3-5 for geographic filtering:

- **Precision 3** (~156km × 156km): Broad regional search
- **Precision 4** (~39km × 19.5km): City-level coverage
- **Precision 5** (~4.9km × 4.9km): Neighbourhood-level discovery

Both publish multiple `g` tags at different precisions on the same event, enabling relay-side `#g` filtering at the
consumer's preferred granularity. Ridestr's `getSearchAreaGeohashes()` computes 9 cells (centre + 8 neighbours) at
precision 4 — the same approach DonkeyRide uses.

### NIP-44 Encryption

Both projects use NIP-44 (not the deprecated NIP-04) for all encrypted payloads:

- **Ride details**: Pickup/destination coordinates encrypted to the other party
- **Self-encrypted backups**: Ridestr encrypts profile and ride history to self; DonkeyRide uses NIP-44 for PII exchange
- **Neither project uses NIP-04 anywhere**

### NIP-40 Expiration

Both use the `expiration` tag (not `expiry`) per NIP-40:

- Ridestr: 5 minutes (RoadFlare key shares) to 24 hours (cancellations)
- DonkeyRide: On all time-limited events

### NIP-33 Parameterised Replaceable Events

Both use `d`-tagged replaceable events for state that should be updated in-place (availability, ride state, profiles),
and regular events for append-only records (offers, cancellations, ratings).

### Progressive Location Privacy

Both implement the same staged disclosure pattern:

1. **Discovery**: Approximate location only (geohash precision 3-5, ~5-150km)
2. **After match**: Precise pickup location shared (NIP-44 encrypted to matched party)
3. **After verification**: Destination revealed (Ridestr: after PIN verify; DonkeyRide: after stake lock)
4. **During ride**: Real-time location via ephemeral/private channel

This is the correct approach for privacy-preserving service coordination, and both projects arrived at it independently.

### No NIP-04

Neither project uses the deprecated NIP-04 encryption. Both exclusively use NIP-44. This alignment matters for any
shared event kinds — there is no encryption compatibility issue.

---

## 3. What Ridestr Gains from DonkeyRide's NIPs

DonkeyRide's modular NIP structure means Ridestr can adopt individual specifications without changing its core
lifecycle. Each NIP below is independent — they reference tasks by event ID, not by DonkeyRide-specific state.

### 3.1 Reputation (NIP-XX-reputation)

**The gap**: Ridestr has no rating system. The only trust mechanism is the personal RoadFlare network (known drivers). A
rider's first ride with an unknown driver has zero trust signal.

**What the NIP provides**:

| Kind  | Purpose            | Ridestr benefit                                                                                                        |
|-------|--------------------|------------------------------------------------------------------------------------------------------------------------|
| 30517 | Provider Rating    | Riders rate drivers after rides. Domain-defined criteria (overall, punctuality, safety, courtesy).                     |
| 30518 | Requester Rating   | Drivers rate riders. Same structure as 30517 with roles reversed.                                                      |
| 30519 | Reputation Summary | Computed aggregates (average rating, total rides, completion rate). Can be published by anyone — no operator required. |
| 30530 | General Rating     | Simpler single-value rating. Lighter-weight alternative for P2P contexts.                                              |
| 30521 | Reputation Export  | Cross-app portability. A driver's Ridestr ratings follow them to DonkeyRide (and vice versa).                          |

**Why it works for P2P**: Ratings are standalone Nostr events referencing a task by event ID. They require no operator,
no server, and no schema changes to Ridestr's existing events. A Ridestr user publishes a kind 30530 event after a ride,
referencing the confirmation event ID — done.

**Estimated effort**: ~200 lines of Kotlin. Publish a signed event after ride completion, query ratings from relays when
viewing a driver's profile.

**Cross-app portability**: This is the killer feature. If both projects use the same rating kinds, a driver with 200
five-star Ridestr rides carries that reputation into DonkeyRide automatically. Neither project can achieve this alone.

### 3.2 Safety (NIP-XX-safety)

**The gap**: Ridestr has no panic button, no trip sharing, no safety check-ins. The `AccountSafetyScreen` handles event
deletion — not rider/driver safety during rides.

**What the NIP provides**:

| Kind  | Purpose           | Ridestr benefit                                                                                                                    |
|-------|-------------------|------------------------------------------------------------------------------------------------------------------------------------|
| 30559 | Emergency Alert   | Panic button. Publishes location + alert type (panic/medical/accident/threat). Can notify emergency contacts via NIP-17 gift wrap. |
| 30560 | Task Sharing      | Share live ride progress with trusted contacts. Recipients see real-time status without needing the app.                           |
| 30564 | Harassment Report | Report threatening behaviour with structured evidence. Creates an auditable trail.                                                 |

**Why it works for P2P**: All three events are self-contained — they reference a ride by event ID and publish to relays.
No operator is needed to receive or process them. Emergency contacts are notified via NIP-17 (which both projects
already support in principle via NIP-44).

**Estimated effort**: ~300 lines of Kotlin. UI: a panic button on the active ride screen, a "share ride" toggle, a
report form.

**The human case**: This is the most important adoption. A rider in distress needs to broadcast their location to
trusted contacts. Currently Ridestr has no mechanism for this. Kind 30559 is 20 lines of event construction.

### 3.3 Dispute Resolution (NIP-XX-disputes)

**The gap**: Ridestr's Cashu HTLC escrow prevents the most obvious dispute (driver takes payment without completing the
ride), but doesn't cover: ride quality disputes, incorrect fare, driver took a longer route, rider damaged vehicle, or
he-said-she-said situations.

**What the NIP provides**:

| Kind        | Purpose            | Ridestr benefit                                                                   |
|-------------|--------------------|-----------------------------------------------------------------------------------|
| 30522       | Dispute Filing     | Structured complaint with evidence (text, photos, GPS trace, signed event chain). |
| 30524       | Dispute Resolution | Resolution with outcome (refund, penalty, dismissal) and reasoning.               |
| 30525       | Theft Report       | Report escrow misbehaviour with cryptographic evidence.                           |
| 30553/30554 | Guardian Voting    | Community-based arbitration without central authority.                            |

**Why it works for P2P**: The guardian voting model (30553/30554) is purpose-built for P2P contexts. No operator is
required — a set of mutually trusted guardians vote on disputes. Ridestr could designate community moderators as
guardians, using the same Nostr identities they already have.

**Estimated effort**: ~500 lines of Kotlin. The guardian voting UI is the most complex part; the dispute filing itself
is straightforward event construction.

---

## 4. What DonkeyRide Has Learned from Ridestr

### 4.1 Cashu NUT-14 HTLC Escrow

Ridestr's payment flow is genuinely trustless in a way DonkeyRide's operator-mediated model is not:

1. Rider generates a 32-byte preimage, computes `payment_hash = SHA256(preimage)`
2. Rider locks Cashu tokens as NUT-14 HTLC: spendable only with the preimage AND the driver's `wallet_pubkey` signature
3. Driver can only claim tokens after receiving the preimage (shared after PIN verification)
4. If the ride doesn't complete, tokens return to the rider after the HTLC timeout (2 hours)

**No intermediary touches the funds at any point.** The mint enforces the HTLC conditions cryptographically. This is a
stronger trust model than custodial escrow.

DonkeyRide already supports NIP-47 (Nostr Wallet Connect) as a trustless payment option, but Cashu HTLC achieves
trustlessness without requiring Lightning infrastructure. We should consider adding a `cashu` payment provider that
implements NUT-14 HTLC as an additional mechanism, and recognise Cashu HTLC as a first-class `trust_model` value (e.g.
`trustless-ecash`).

### 4.2 Separate `wallet_pubkey`

Ridestr uses a dedicated wallet keypair (stored in Android's `EncryptedSharedPreferences`) that is entirely separate
from the Nostr identity key:

- **Nostr key**: Signs events, encrypts messages (NIP-44 ECDH)
- **Wallet key**: Signs HTLC claim witnesses (Schnorr), serves as P2PK spending condition

This separation protects against a class of attacks where compromising the payment key doesn't compromise the user's
Nostr identity (and vice versa). DonkeyRide's NIP-47 integration already achieves key separation at the wallet level,
but Ridestr's explicit `wallet_pubkey` tag in acceptance events makes this a visible protocol-level feature.

We should consider a `wallet_pubkey` tag in our commitment stake events (30509), allowing providers to declare a
separate payment key regardless of the payment mechanism.

### 4.3 RoadFlare (Social Discovery)

RoadFlare is a personal driver network — a "favourites" system with encrypted real-time location sharing:

1. Rider follows a driver (kind 30011, public `p` tag)
2. Driver approves and shares a dedicated RoadFlare private key (kind 3186, NIP-44 encrypted, 5-minute expiry)
3. Driver broadcasts location (kind 30014) encrypted to the RoadFlare pubkey — all approved followers can decrypt using
   the shared private key
4. Key rotation for muting: new keypair excludes muted followers

The clever part is ECDH commutativity: the driver encrypts with `ECDH(driver_identity_priv, roadflare_pub)`, followers
decrypt with `ECDH(roadflare_priv, driver_identity_pub)` — same shared secret, no need for per-follower encryption.

This "social graph as discovery" complements geohash-based discovery. DonkeyRide could adopt a similar pattern for
repeat-service relationships — a rider who regularly uses the same driver should be able to see their availability
directly, without scanning the geohash pool.

### 4.4 Consolidated State Events

Ridestr uses a single replaceable event per party (30180 for driver, 30181 for rider) with an accumulating `history`
array, rather than separate events for each state transition. The `transition` tag references the last event from the
other party, creating a verifiable A-to-B chain.

**Advantages**:

- Fewer relay writes during active rides (one replacement vs. multiple new events)
- Complete ride history in a single event (no need to query and reassemble)
- Built-in state chain integrity via `transition` tags

**Trade-offs**:

- Larger events as history accumulates
- Relay must support NIP-33 replacement correctly (most do, but it's a dependency)
- Harder to subscribe to specific state transitions (must diff the history array)

DonkeyRide's separate-event model has its own advantages (easier relay-side filtering, simpler subscription logic,
smaller individual events), but we should consider whether a consolidated option would benefit high-frequency use cases.

---

## 5. Adoption Path

Concrete steps for Ridestr to adopt DonkeyRide NIPs, ordered by value and effort.

### Phase 1: Reputation (Lowest effort, highest impact)

**Goal**: Riders and drivers can rate each other; ratings are portable across apps.

**Steps**:

1. After ride completion, prompt user to rate (1-5 stars + optional text)
2. Publish kind 30530 event:
   ```json
   {
     "kind": 30530,
     "tags": [
       ["d", "<unique_id>"],
       ["p", "<rated_pubkey>"],
       ["rating", "4"],
       ["task_id", "<confirmation_event_id>"],
       ["role", "requester"],
       ["domain", "ridesharing"]
     ],
     "content": "Great driver, knew the shortcuts"
   }
   ```
3. When viewing a driver's profile, query relays for kind 30530 events where `#p` matches the driver's pubkey
4. Compute average rating client-side (or publish kind 30519 summary)

**Effort**: ~200 lines of Kotlin. One new event kind to publish, one relay query to consume.

**Compatibility**: DonkeyRide's reputation module (`src/nostr/reputation.js`) already queries kind 30530 with a
30-second cache. Ridestr ratings would appear in DonkeyRide immediately — and vice versa.

### Phase 2: Safety Events (Medium effort, critical for user protection)

**Goal**: Panic button, ride sharing with trusted contacts.

**Steps**:

1. Add a panic button to the active ride screen. On press, publish kind 30559:
   ```json
   {
     "kind": 30559,
     "tags": [
       ["d", "<unique_id>"],
       ["alert_type", "panic"],
       ["triggered_by", "requester"],
       ["lat", "51.5074"],
       ["lon", "-0.1278"],
       ["e", "<confirmation_event_id>"],
       ["p", "<emergency_contact_1>"],
       ["p", "<emergency_contact_2>"]
     ],
     "content": "Emergency during ride"
   }
   ```
2. Add a "share ride" toggle that publishes kind 30560, referencing the ride and listing trusted contact pubkeys
3. Add a harassment report form that publishes kind 30564 with structured evidence

**Effort**: ~300 lines of Kotlin. Three new event kinds, plus UI for emergency contacts management.

**Note**: Emergency contact notification via NIP-17 gift wrap is optional but recommended. At minimum, publishing the
emergency alert to relays creates an auditable record.

### Phase 3: Dispute Resolution (Higher effort, completes the trust stack)

**Goal**: Structured dispute filing and community-based resolution.

**Steps**:

1. Add a "report issue" button on the ride history screen. Publish kind 30522 with evidence
2. Implement guardian designation — allow users to nominate trusted community members
3. Implement kind 30553 (slashing proposal) and 30554 (guardian vote) for community arbitration
4. Display dispute outcomes (kind 30524) in ride history

**Effort**: ~500 lines of Kotlin. The guardian voting UI is the most complex element. Consider a phased approach: start
with dispute filing only, add guardian voting later.

### Phase 4: Shared Event Kind Range (Longer-term convergence)

See Section 6.

---

## 6. Convergence Vision

### The Opportunity

Both projects occupy non-overlapping kind ranges. No migration is forced by adopting shared kinds for reputation,
safety, and disputes. The question is whether the core lifecycle events should converge.

### Near-Term: Shared Ancillary Kinds

Adopt the same kinds for cross-cutting concerns without changing either project's core lifecycle:

| Function             | Shared Kind(s)      | Status         |
|----------------------|---------------------|----------------|
| Ratings              | 30517, 30518, 30530 | Ready to adopt |
| Reputation summaries | 30519, 30521        | Ready to adopt |
| Emergency alerts     | 30559               | Ready to adopt |
| Trip sharing         | 30560               | Ready to adopt |
| Harassment reports   | 30564               | Ready to adopt |
| Dispute filing       | 30522               | Ready to adopt |
| Dispute resolution   | 30524               | Ready to adopt |
| Guardian voting      | 30553, 30554        | Ready to adopt |

This gives both ecosystems **cross-app reputation portability** and **shared safety infrastructure** while preserving
each project's core lifecycle and payment model.

### Medium-Term: Cross-Protocol Discovery

If both projects publish provider availability with geohash `g` tags (DonkeyRide: kind 20500, Ridestr: kind 30173), a
relay-aware client could query both kinds and present a unified driver pool to riders. This requires:

1. A shared availability schema (geohash tags are already identical)
2. Client-side awareness of both kind numbers
3. A convention for which kind to respond to when accepting

A `service_protocol` tag could identify the originating protocol, allowing a multi-protocol client to route the
acceptance correctly.

### Long-Term: Unified Kind Range

The most ambitious outcome: a single NIP specification that both projects implement, with a shared kind range for the
complete lifecycle. This would require:

1. **Agreement on core lifecycle events** — whether to use separate events (DonkeyRide) or consolidated state (Ridestr),
   or support both patterns
2. **Agreement on payment tags** — DonkeyRide uses envelope tags (`amount`, `currency`, `trust_model`); Ridestr uses
   content JSON fields
3. **Agreement on the role of operators** — DonkeyRide's model includes operators; Ridestr is pure P2P. A unified spec
   would need to make operators optional

This is a significant undertaking, but the shared foundations (geohash, NIP-44, NIP-40, progressive privacy) mean the
gap is smaller than it appears. The modular structure of DonkeyRide's NIPs helps — Ridestr could adopt the ancillary
NIPs immediately while the core lifecycle converges over time.

### What Convergence Unlocks

- **Network effects**: A driver rated on Ridestr carries their reputation to DonkeyRide. A safety report filed on
  DonkeyRide is visible to Ridestr clients. Neither project can achieve this alone.
- **Relay efficiency**: Shared kinds mean relays serve both ecosystems with the same subscriptions. Operators running
  both protocols benefit from unified infrastructure.
- **Ecosystem credibility**: A unified Nostr ridesharing protocol, backed by two independent implementations, is far
  more credible to the Nostr community than two competing ad-hoc proposals.
- **User choice**: Riders choose their preferred client (Android P2P vs. web-based with operator support) while drivers
  serve both pools. Competition happens at the app layer, not the protocol layer.

---

## Appendix A: Complete Kind Reference

### DonkeyRide Event Kinds (30500-30599 + 20500)

| Kind  | Name                                        | Spec                |
|-------|---------------------------------------------|---------------------|
| 20500 | Provider Availability (ephemeral)           | Discovery           |
| 30500 | Service Request                             | Core                |
| 30501 | Service Acceptance                          | Core                |
| 30502 | Stake Lock                                  | Stakes              |
| 30503 | Stake Negotiation                           | Stakes              |
| 30504 | Service Confirmation                        | Core                |
| 30506 | Service Cancellation                        | Core                |
| 30507 | Service Start                               | Core                |
| 30508 | Service End                                 | Core                |
| 30509 | Commitment Stake                            | Stakes              |
| 30510 | Streaming Payment                           | Payments            |
| 30511 | Payment Confirmation                        | Payments            |
| 30512 | Status Update                               | Core                |
| 30513 | Provider Tip                                | Payments            |
| 30514 | Wait Time Charge                            | Payments            |
| 30515 | No-Show Fee                                 | Payments            |
| 30516 | Additional Charge                           | Payments            |
| 30517 | Provider Rating                             | Reputation          |
| 30518 | Requester Rating                            | Reputation          |
| 30519 | Reputation Summary                          | Reputation          |
| 30520 | Stake Release                               | Stakes              |
| 30521 | Reputation Export/Import                    | Reputation          |
| 30522 | Dispute Filing                              | Disputes            |
| 30523 | Arbiter Assignment / Payment Failure        | Disputes + Payments |
| 30524 | Dispute Resolution                          | Disputes            |
| 30525 | Theft Report                                | Disputes            |
| 30526 | Watchdog Claim                              | Disputes            |
| 30527 | Operator Slashing                           | Disputes            |
| 30528 | Operator Reputation                         | Reputation          |
| 30530 | Reputation Rating                           | Reputation          |
| 30537 | Milestone Completion                        | Stakes              |
| 30540 | Operator Bond                               | Stakes + Discovery  |
| 30549 | Suspicious Activity Report                  | Disputes            |
| 30550 | Account Suspension                          | Disputes            |
| 30551 | Appeal Request                              | Disputes            |
| 30553 | Slashing Proposal                           | Disputes            |
| 30554 | Guardian Vote                               | Disputes            |
| 30559 | Emergency Alert                             | Safety              |
| 30560 | Task Sharing                                | Safety              |
| 30561 | Safety Check-In Request                     | Safety              |
| 30562 | Safety Check-In Response                    | Safety              |
| 30563 | Safety Check-In Escalation                  | Safety              |
| 30564 | Harassment Report                           | Safety              |
| 30565 | Service Area Definition                     | Discovery           |
| 30583 | Route Suggestion                            | Navigation          |
| 30584 | Turn-by-Turn Navigation                     | Navigation          |
| 30585 | Traffic Alert                               | Navigation          |
| 30586 | Reroute Request                             | Navigation          |
| 30587 | Navigation Feedback                         | Navigation          |

### Ridestr Event Kinds

| Kind  | Name                          | Type        | Purpose                                                   |
|-------|-------------------------------|-------------|-----------------------------------------------------------|
| 3173  | Ride Offer                    | Regular     | Rider requests a ride (direct or broadcast)               |
| 3174  | Ride Acceptance               | Regular     | Driver accepts, includes `wallet_pubkey`                  |
| 3175  | Ride Confirmation             | Regular     | Rider confirms, includes `payment_hash` + `escrow_token`  |
| 3178  | Rideshare Chat                | Regular     | NIP-44 encrypted messages during ride                     |
| 3179  | Ride Cancellation             | Regular     | Either party cancels (24-hour expiry)                     |
| 3186  | RoadFlare Key Share           | Regular     | Driver shares RoadFlare private key to follower           |
| 3187  | RoadFlare Follow Notification | Regular     | Rider notifies driver of follow                           |
| 3188  | RoadFlare Key Acknowledgement | Regular     | Rider confirms key receipt                                |
| 30011 | Followed Drivers              | Replaceable | Rider's favourite driver list                             |
| 30012 | Driver RoadFlare State        | Replaceable | Driver's RoadFlare keypair + followers                    |
| 30013 | Shareable Driver List         | Replaceable | Public recommended driver list for sharing                |
| 30014 | RoadFlare Location            | Replaceable | Driver location encrypted to RoadFlare key (5-min expiry) |
| 30078 | Tile Availability             | Replaceable | Valhalla routing tile metadata on Blossom servers         |
| 30173 | Driver Availability           | Replaceable | Driver's status + approximate location + geohash tags     |
| 30174 | Ride History Backup           | Replaceable | NIP-44 self-encrypted ride history                        |
| 30177 | Unified Profile Backup        | Replaceable | NIP-44 self-encrypted vehicles, locations, settings       |
| 30180 | Driver Ride State             | Replaceable | Consolidated driver actions with history array            |
| 30181 | Rider Ride State              | Replaceable | Consolidated rider actions with history array             |
| 30182 | Admin Config                  | Replaceable | Platform-wide settings (fare rates, mints, app versions)  |

### Ridestr Deprecated Kinds

| Kind  | Former Name             | Replaced By                        |
|-------|-------------------------|------------------------------------|
| 3176  | PIN Submission          | 30180 `pin_submit` action          |
| 3177  | Pickup Verification     | 30181 `pin_verify` action          |
| 3180  | Driver Status           | 30180 `status` action              |
| 3181  | Precise Location Reveal | 30181 `location_reveal` action     |
| 3185  | RoadFlare Request       | 3173 with `["t", "roadflare"]` tag |
| 20173 | Ephemeral Availability  | 30173 (never implemented)          |
| 30175 | Vehicle Backup          | 30177 (unified profile)            |
| 30176 | Saved Locations Backup  | 30177 (unified profile)            |

---

## Appendix B: Ridestr Payment Flow Detail

For reference, the complete Cashu NUT-14 HTLC escrow sequence:

```
Rider                           Cashu Mint                        Driver
  │                                 │                                │
  ├─ Generate preimage (32 bytes)   │                                │
  ├─ Compute payment_hash = SHA256  │                                │
  │                                 │                                │
  ├─── Kind 3173 (offer) ─────────────────────────────────────────→ │
  │                                 │                                │
  │ ←─── Kind 3174 (accept + wallet_pubkey) ────────────────────── ┤
  │                                 │                                │
  ├─ Create NUT-14 HTLC ──────────→│                                │
  │   conditions:                   │                                │
  │   - preimage of payment_hash    │                                │
  │   - driver wallet_pubkey sig    │                                │
  │   - 2-hour refund timeout       │                                │
  │ ←─ HTLC token (cashuA-encoded)  │                                │
  │                                 │                                │
  ├─── Kind 3175 (confirm + hash + token) ─────────────────────→   │
  │                                 │                                │
  │    ... ride happens, PIN verified ...                            │
  │                                 │                                │
  ├─── Kind 30181 (preimage_share, NIP-44 encrypted) ────────────→ │
  │                                 │                                │
  │                                 │ ←─ Claim: preimage + sig ──── ┤
  │                                 ├─ Verify HTLC conditions       │
  │                                 ├─ Swap: HTLC proofs → plain ─→ │
  │                                 │                                │
  │                                 │   Kind 30180 (settlement) ──→ │
```

**Key properties**:

- Rider cannot reclaim until timeout (2 hours) — driver has time to claim
- Driver cannot claim without preimage — shared only after PIN verification
- Mint never learns ride details — only enforces cryptographic conditions
- No operator or intermediary touches the funds at any point

---

*This document was prepared by the DonkeyRide team as a basis for technical discussion. We welcome feedback,
corrections, and counter-proposals from the Ridestr team.*
