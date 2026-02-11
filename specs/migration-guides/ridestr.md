# TROTT Compatibility Guide: Ridestr

`draft`

This guide maps the [ridestr](https://github.com/nicepayments/ridestr) ridesharing protocol to TROTT, identifies areas of alignment, and proposes an incremental migration path. Ridestr is a Nostr-native ridesharing application using Cashu NUT-14 HTLC escrow, geohash discovery, and NIP-44 encryption.

---

## 1. What Already Aligns

Ridestr and TROTT share significant design heritage. The following areas are compatible with minimal or no change:

| Area | Ridestr | TROTT | Status |
|------|---------|-------|--------|
| Geohash discovery | Precision-5, 9-cell neighbour search | TROTT-02: precision-5, geohash `g` tags | **Identical mechanism** |
| NIP-44 encryption | All PII encrypted (addresses, PINs, preimages) | TROTT-06: NIP-44 for PII Envelopes | **Aligned** |
| NIP-40 expiration | `expiration` tag on availability (30 min), offers (15 min) | All time-limited events use `expiration` | **Aligned** |
| Progressive location reveal | Pickup on acceptance, destination after PIN | TROTT-07: progressive disclosure via encrypted location updates | **Aligned** |
| 4-digit PIN verification | 3 attempts, verbal exchange, NIP-44 encrypted submission | TROTT-01: PIN-based completion proof, configurable attempts | **Aligned** |
| HTLC escrow | Cashu NUT-14 with P2PK + payment hash | TROTT-04: `ecash-htlc` trust model, `ecash_lock` lock type | **Directly mappable** |
| Wallet pubkey separation | `wallet_pubkey` distinct from Nostr identity key | TROTT-04 Cashu section: wallet pubkey handshake | **Aligned** |
| NIP-60 wallet sync | Kind 7375 (proofs), kind 17375 (metadata) | TROTT-04 Cashu section: NIP-60 recommended | **Aligned** |

---

## 2. Event Kind Mapping

| Ridestr Kind | Purpose | TROTT Kind | TROTT Name | Notes |
|---|---|---|---|---|
| 30173 | Driver availability | 20500 | Provider Availability | Geohash discovery identical; different kind number. Both use precision-5 `g` tags and NIP-40 `expiration`. |
| 3173 | Ride offer (rider requests ride) | 30500 | Task Request | Structural alignment. Add `domain: ridesharing` and `t: trott-task` tags. Ridestr broadcasts with `t: ride-request`; TROTT uses `t: trott-task`. |
| 3174 | Ride acceptance (driver accepts) | 30501 | Task Offer | Ridestr includes `wallet_pubkey` and `mint_url` here. TROTT puts wallet pubkey in Payment Terms (30531) or Task Offer (30501). |
| 3175 | Ride confirmation (rider confirms with escrow) | 30502 | Task Accept | Ridestr sends `payment_hash` + `escrowToken` here. In TROTT, these go in Stake Lock (30532). Ridestr uses this as the canonical ride ID; TROTT uses the `d` tag on 30500. |
| 30180 | Driver ride state (consolidated) | 30503 | Task Update | **Fundamental difference** (see section 3). Ridestr accumulates all driver actions (`pin_submit`, status changes, settlement) in one parameterised replaceable event. TROTT publishes separate events per transition. |
| 30181 | Rider ride state (consolidated) | 30503 | Task Update | Same consolidation difference. Ridestr accumulates `pin_verify`, `preimage_share`, and location reveals in one event. |
| 3178 | Chat message | 30564 | Task Message | Direct mapping. Both provide task-scoped encrypted chat. TROTT-08 uses NIP-44 encryption to all task participants with `expiration` tags for GDPR compliance. |
| 3179 | Ride cancellation | 30506 | Task Cancel | Direct mapping. Both support cancellation by either party. |
| 30174 | Ride history backup | 30566 | Task Archive Entry | Direct mapping. Both store encrypted-to-self task summaries. TROTT-08 adds structured tags for domain, role, and completion time. |
| 30177 | Profile backup (vehicles, locations, settings) | 30567 + 30513 | User Preferences + Requester Profile | Split mapping. Public fields (rating, languages, area) go to Requester Profile (30513). Private fields (saved locations, payment defaults, UI settings) go to User Preferences (30567). Vehicle data for drivers goes to Provider Profile (30510). |
| 30182 | Admin config | 30550 | Operator Claim | Ridestr uses this for fare rates and mint recommendations. TROTT-06 Operator Claim serves a similar purpose for operator capabilities. |

### Ridestr-Only Kinds (No TROTT Equivalent)

| Ridestr Kind | Purpose | Recommendation |
|---|---|---|
| 30011 | Followed drivers (RoadFlare) | Keep as ridestr-specific. Could publish to TROTT Trusted Provider List (30512) for interop. |
| 30012 | Driver RoadFlare state | Keep as ridestr-specific. |
| 30014 | RoadFlare location | Keep as ridestr-specific private network. |
| 3186-3188 | RoadFlare key exchange | Keep as ridestr-specific. |

### TROTT-08 Coverage

With the addition of TROTT-08 (Messaging & Personal Data), three previously unmapped ridestr kinds now have TROTT equivalents:

- **Chat** (3178 → 30564): Task-scoped encrypted messaging with read receipts (30565) and typing indicators (20502)
- **Ride history** (30174 → 30566): Encrypted-to-self task archive with structured metadata
- **Profile backup** (30177 → 30567 + 30513): Split into public requester profile and private user preferences

This reduces the migration gap to only the RoadFlare-specific kinds (30011-30014, 3186-3188), which serve a niche private-network use case.

---

## 3. Consolidated vs Separate Events

This is the most significant architectural difference between the protocols.

### Ridestr Approach

One parameterised replaceable event (kind 30180 for driver, 30181 for rider) accumulates all state changes in a `history` array:

```json
{
  "kind": 30180,
  "tags": [["d", "<ride_id>"]],
  "content": "<nip44_encrypted({
    history: [
      { type: 'status_change', status: 'en_route', at: 1698765000 },
      { type: 'status_change', status: 'arrived', at: 1698765300 },
      { type: 'pin_submit', pin: '4821', at: 1698765400 },
      { type: 'status_change', status: 'completed', at: 1698766500 }
    ]
  })>"
}
```

**Advantages:** Efficient relay usage (single subscription per ride), natural ordering, compact.

### TROTT Approach

Separate events per lifecycle phase (kinds 30500-30507), each independently signed and verifiable:

- Task Update (30503) for each state transition
- Stake Lock (30532) for escrow
- Stake Release (30533) on completion
- Payment Receipt (30535) for settlement

**Advantages:** Event chain integrity (TROTT-04 `e` tag references), third-party auditability, cross-domain consistency, independent verification of each step.

### Bridging Strategy

A ridestr implementation adopting TROTT can publish **both**:

1. **TROTT events** (30500-30507, 30532-30535) for protocol interoperability and auditability
2. **Consolidated event** (30180/30181) as a domain-specific convenience for existing ridestr clients

The consolidated event would use a kind in the ridesharing domain extension range (30600-30619) rather than the current 30180/30181, to avoid kind conflicts. For example:

- Kind 30610: Driver Ride State (consolidated, ridestr-compatible)
- Kind 30611: Rider Ride State (consolidated, ridestr-compatible)

Existing ridestr clients continue to work while TROTT-aware clients consume the standard event chain.

---

## 4. Cashu as a TROTT-04 Payment Provider

Ridestr's Cashu NUT-14 HTLC flow maps cleanly to TROTT-04's `ecash-htlc` trust model. The cryptographic layer is identical — only the Nostr event wrapper changes.

### Flow Comparison

| Step | Ridestr | TROTT |
|------|---------|-------|
| 1. Driver shares wallet pubkey | Kind 3174 `wallet_pubkey` field | Kind 30501 or 30531 `wallet_pubkey` tag |
| 2. Rider locks HTLC | Kind 3175 `escrowToken` + `payment_hash` | Kind 30532 `escrow_token` + `payment_hash` + `lock_type: ecash_lock` |
| 3. PIN verification | Kind 30180 `pin_submit` / Kind 30181 `pin_verify` | Kind 30503 Task Update (sub-state transition) |
| 4. Preimage release | Kind 30181 `preimage_share` action | NIP-44 encrypted to provider (off-event or in Task Update) |
| 5. Driver claims HTLC | NUT-14 `/v1/swap` (off-protocol) | NUT-14 `/v1/swap` (off-protocol, identical) |
| 6. Settlement record | Kind 30180 `status: completed` | Kind 30533 Stake Release + Kind 30535 Payment Receipt |

### What Does Not Change

- **Preimage/hash model** — identical to ridestr's current implementation
- **NUT-14 HTLC creation** — same `/v1/swap` with HTLC secret format
- **P2PK condition** — same secp256k1 Schnorr signing
- **NUT-07 proof state checks** — same verification mechanism
- **Multi-mint support** — TROTT-04 `mint_url` tag enables same-mint / cross-mint logic

### What Changes

- **Wallet pubkey** moves from kind 3174 content to kind 30501/30531 tags
- **Escrow token** moves from kind 3175 content to kind 30532 event tags
- **Settlement** gains explicit Stake Release (30533) and Payment Receipt (30535) events
- **Trust model** is declared explicitly as `ecash-htlc` on all payment events

---

## 5. Incremental Migration Path

### Phase 1: Tag Alignment (~1 day)

Add TROTT tags to existing ridestr events without changing event structure:

- Add `["domain", "ridesharing"]` to all ride events
- Add `["t", "trott-task"]` to kind 3173 (ride offers)
- Add `["task_id", "<ride_id>"]` to kinds 30180, 30181
- Add `["trust_model", "ecash-htlc"]` to kind 3175 (confirmation with escrow)

**Impact:** Zero breaking changes. Existing ridestr clients ignore unknown tags. TROTT-aware indexers can begin recognising ridestr events.

### Phase 2: Dual-Publish Discovery (~2 days)

Publish both ridestr and TROTT availability events:

- Publish kind 30173 (ridestr) AND kind 20500 (TROTT Provider Availability) for driver availability
- Both use identical geohash tags — the only difference is the kind number
- Add `["domain", "ridesharing"]` and `["t", "trott-provider"]` to kind 20500

**Impact:** TROTT-aware rider apps can discover ridestr drivers. Ridestr rider apps continue using kind 30173.

### Phase 3: Adopt TROTT Payment Events (~1 week)

Publish TROTT-04 events alongside existing Cashu flow:

- Publish kind 30532 (Stake Lock) when HTLC is created, in addition to kind 3175
- Publish kind 30533 (Stake Release) when HTLC is claimed
- Publish kind 30535 (Payment Receipt) as final settlement record
- All with `trust_model: ecash-htlc`, `payment_rail: cashu`, `lock_type: ecash_lock`

**Impact:** Creates an auditable payment chain per TROTT-04. No change to the actual Cashu escrow mechanics.

### Phase 4: Adopt TROTT Lifecycle Events (~2 weeks)

Publish TROTT-01 events for the full task lifecycle:

- Kind 30500 (Task Request) alongside kind 3173
- Kind 30501 (Task Offer) alongside kind 3174
- Kind 30502 (Task Accept) alongside kind 3175
- Kind 30503 (Task Update) for each state transition (alongside consolidated 30180/30181)
- Kind 30506 (Task Cancel) alongside kind 3179

**Impact:** Full TROTT protocol participation. Ridestr rides become visible to any TROTT-compatible client.

### Phase 5: Deprecate Ridestr-Specific Kinds (~1 week)

Once TROTT events are the primary protocol:

- Sunset kinds 3173-3179 (ride-specific regular events)
- Sunset kinds 30173, 30180-30181 (ride-specific replaceable events)
- Keep kinds 30011-30014, 3186-3188 (RoadFlare — ridestr-specific feature, no TROTT equivalent)
- Migrate kind 3178 to TROTT-08 kind 30564 (Task Message) — task-scoped encrypted chat
- Migrate kind 30174 to TROTT-08 kind 30566 (Task Archive Entry) — same encrypted-to-self backup pattern
- Migrate kind 30177 to TROTT-08 kind 30567 (User Preferences) + TROTT-02 kind 30513 (Requester Profile)

**Impact:** Ridestr becomes a TROTT ridesharing client. Legacy ridestr-only clients would need updating.

---

## 6. Effort Assessment

| Phase | Scope | Estimate | Breaking Changes |
|-------|-------|----------|-----------------|
| Phase 1: Tag alignment | Tag additions only | ~1 day | None |
| Phase 2: Dual-publish discovery | Second event publication for availability | ~2 days | None |
| Phase 3: TROTT payment events | Publish 30532/30533/30535 alongside Cashu flow | ~1 week | None |
| Phase 4: TROTT lifecycle events | Publish 30500-30506 for task lifecycle | ~2 weeks | None (dual-publish) |
| Phase 5: Deprecate ridestr kinds | Remove old event types | ~1 week | Yes (legacy clients) |

Phases 1-4 are fully backward-compatible — existing ridestr clients continue to work throughout. Phase 5 is the only breaking change, and it can be deferred indefinitely if both event sets are maintained.

---

## Appendix A: Implementation Divergences (DonkeyRide Reference)

The DonkeyRide reference implementation has known divergences from the TROTT specs that are relevant to ridestr interoperability. These are implementation issues to address in future code work, not spec issues:

1. **`stake-events.js` publishes kind 30510 (Provider Profile) instead of kind 30536 (Streaming Tick)** — streaming payment events use the wrong kind number in the reference implementation.

2. **Streaming event tags use `ride`/`total`/`fare` instead of `task_id`/`cumulative`** — the tag names in `stake-events.js` predate the TROTT spec standardisation and need updating.

3. **Server does not read `features.streaming` flag from domain profiles** — the streaming interval and step count are hardcoded in `server.js` rather than being driven by the domain profile's Payment Configuration.

4. **Pricing has no domain-aware abstraction** — `src/pricing/fiat-conversion.js` is ridesharing-specific and does not read the domain profile's pricing model.

These divergences do not affect the specs or this migration guide — they are tracked for future code alignment.

---

## Appendix B: RoadFlare and TROTT Trusted Networks

Ridestr's RoadFlare feature (kinds 30011-30014, 3186-3188) is a private driver network with encrypted location sharing. This maps conceptually to TROTT-02's **Trusted Provider Networks** (kind 30512, Trusted Provider List) and **Provider Profile** (kind 30510), but the implementation differs:

- RoadFlare uses a shared symmetric key for location encryption; TROTT-02 uses NIP-44 per-recipient encryption
- RoadFlare publishes location on a 2-minute interval to a shared key; TROTT-07 uses ephemeral kind 20501 per-recipient
- RoadFlare has an explicit follow/unfollow social model; TROTT-02 uses NIP-02 contact lists for trust weighting

A future integration could bridge RoadFlare followers to TROTT Trusted Provider Lists, making ridestr's social network interoperable with other TROTT clients.
