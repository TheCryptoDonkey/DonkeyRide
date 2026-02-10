# Social Graph, Reputation & Network Effects Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform DonkeyRide from a coordination engine into a social-graph-powered network with portable reputation,
NIP-aligned ecosystem visibility, and 10+ domain profiles.

**Architecture:** Six phases building on each other. Phase 1 fixes broken foundations. Phase 2 adds the social graph
layer (NIP-02, NIP-58, NIP-85). Phase 3 makes DonkeyRide visible to the broader Nostr ecosystem. Phase 4 expands domain
profiles. Phase 5 completes reputation portability. Phase 6 adds advanced federation and alternative payment rails.

**Tech Stack:** Node.js (backend, nostr-tools v1), React/TypeScript (frontend, nostr-tools v2), Nostr event kinds,
NIP-44 encryption, NIP-17 gift wrap.

---

## Phase 1: Fix Broken Foundations (P0)

### Task 1: Fix reputation.js domain leak

The `enforceRideParticipation()` function hardcodes `rider`/`driver` role names. This breaks ratings for locksmith,
delivery, and all future domains.

**Files:**

- Modify: `src/nostr/reputation.js:302-355`
- Modify: `tests/integration/reputation-flow.test.js`
- Test: `tests/integration/reputation-flow.test.js`

**Step 1: Write failing test for locksmith rating**

In `tests/integration/reputation-flow.test.js`, add a test that creates a task via `TaskManager('locksmith')`, completes
it, and attempts to publish a rating using role `'customer'` instead of `'rider'`. Currently this will fail because
`enforceRideParticipation` only understands `'rider'`/`'driver'`.

```javascript
test('publishRating works with locksmith domain roles', () => {
    const tm = new TaskManager('locksmith');
    const task = tm.createTask('npub_customer_test', {lat: 51.5, lng: -0.1}, null, 7500);
    tm.acceptTask(task.id, 'npub_locksmith_test', {name: 'Test Locksmith'});

    const event = {
        kind: 30530,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['ride', task.id],
            ['p', 'locksmith_hex_pubkey'],
            ['rating', '5'],
            ['role', 'customer']
        ],
        content: '',
        pubkey: 'customer_hex_pubkey'
    };
    // Should not throw "Rating initiator does not match rider"
    // Currently throws because enforceRideParticipation only knows 'rider'/'driver'
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/integration/reputation-flow.test.js`
Expected: FAIL — "Rating initiator does not match rider" or role lookup error

**Step 3: Refactor enforceRideParticipation to be domain-agnostic**

Replace hardcoded `rider`/`driver` references in `src/nostr/reputation.js:302-355` with generic role resolution. The
function should:

1. Accept an optional `profile` parameter (or extract roles from the task object)
2. Use `task.requester` / `task.provider` (domain-agnostic fields set by TaskManager)
3. Fall back to `task.rider` / `task.driver` for backward compatibility
4. Map the `role` tag value against the domain profile's `roles.requester` / `roles.provider`

Key changes to `enforceRideParticipation(eventPubkey, ride, role)`:

- Line 303: `ride?.rider?.pubkey` → `ride?.requester?.pubkey || ride?.rider?.pubkey`
- Line 304: `ride?.rider?.npub` → `ride?.requester?.npub || ride?.rider?.npub`
- Line 305: `ride?.driver?.pubkey` → `ride?.provider?.pubkey || ride?.driver?.pubkey`
- Line 306: `ride?.driver?.npub` → `ride?.provider?.npub || ride?.driver?.npub`
- Line 308: `role === 'rider'` → role matches requester role (check against known requester roles: 'rider', '
  customer', 'sender', or match dynamically)
- Error messages: replace "rider"/"driver" with "requester"/"provider" (keep backward compat by also matching legacy
  names)

**Step 4: Run all tests**

Run: `node --test tests/integration/reputation-flow.test.js && node --test tests/integration/domain-profiles.test.js`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/nostr/reputation.js tests/integration/reputation-flow.test.js
git commit -m "fix: make reputation system domain-agnostic (remove rider/driver hardcoding)"
```

---

### Task 2: Implement weighted reputation averaging

The `buildProfileResponse()` function (line 203-232) computes a simple average. Domain profiles define weighted
criteria (e.g., ridesharing: punctuality 20%, safety 20%) but these are completely ignored.

**Files:**

- Modify: `src/nostr/reputation.js:203-232`
- Test: `tests/integration/reputation-flow.test.js`

**Step 1: Write failing test for weighted averaging**

```javascript
test('getProfile returns weighted average when criteria tags present', async () => {
    // Publish rating events with per-criterion tags
    // e.g., ['rating', '5'], ['punctuality', '3'], ['safety', '5'], ['courtesy', '4']
    // With ridesharing weights: overall 40%, punctuality 20%, safety 20%, courtesy 20%
    // Expected weighted average: 5*0.4 + 3*0.2 + 5*0.2 + 4*0.2 = 2.0 + 0.6 + 1.0 + 0.8 = 4.4
    // Simple average of overall rating alone: 5.0
    // Test asserts weighted !== simple
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/integration/reputation-flow.test.js`
Expected: FAIL — weighted average not implemented, returns simple average

**Step 3: Implement weighted averaging in buildProfileResponse**

Modify `buildProfileResponse` to:

1. Accept an optional `ratingCriteria` parameter (array from domain profile)
2. For each rating event, extract all criterion tags defined in the profile
3. Compute weighted average: `sum(criterion_value * criterion_weight) / sum(weights)`
4. Fall back to simple `rating` tag average when no criteria tags present
5. Return both `averageRating` (weighted) and `criteriaBreakdown` (per-criterion averages)

**Step 4: Run all tests**

Run: `node --test tests/integration/reputation-flow.test.js`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/nostr/reputation.js tests/integration/reputation-flow.test.js
git commit -m "feat: implement weighted reputation averaging from domain profile criteria"
```

---

## Phase 2: Social Graph Foundation (P1)

### Task 3: Add NIP-58 badge definitions and awarding

Operators issue badges to verified providers. Badges are visible across the entire Nostr ecosystem (Primal, Damus,
Amethyst, etc.).

**Files:**

- Create: `src/nostr/badges.js`
- Test: `tests/integration/badges.test.js`
- Modify: `src/domain-profiles/schema.js` (add `badgeDefinitions` field)

**Step 1: Write failing test**

```javascript
test('publishBadgeDefinition creates valid kind 30009 event', () => {
    // Badge: "100 Deliveries Completed"
    // Tags: ['d', 'deliveries_100'], ['name', '100 Deliveries'], ['description', '...'], ['image', '...']
});

test('awardBadge creates valid kind 8 event with p-tag for recipient', () => {
    // Tags: ['a', '30009:<operator_pubkey>:deliveries_100'], ['p', '<provider_pubkey>']
});
```

**Step 2: Implement src/nostr/badges.js**

Module should export:

- `publishBadgeDefinition({ id, name, description, image, thumb })` — creates kind 30009 event
- `awardBadge(badgeId, recipientPubkeys)` — creates kind 8 event
- `revokeBadge(badgeId, recipientPubkey)` — creates updated kind 8 excluding the pubkey
- `queryBadgesFor(pubkey)` — queries relays for kind 8 events with `#p` filter

Standard badge definitions per domain profile:

- Ridesharing: `rides_10`, `rides_100`, `rides_1000`, `five_star_driver`, `phv_licensed`
- Locksmith: `callouts_10`, `callouts_100`, `mla_certified`, `dbs_checked`, `gas_safe`
- Delivery: `deliveries_10`, `deliveries_100`, `deliveries_1000`, `insured_courier`
- Generic: `verified_identity`, `background_check`, `insurance_verified`

**Step 3: Add badgeDefinitions to domain profile schema**

In `src/domain-profiles/schema.js`, add optional `badgeDefinitions` field with default `[]`. Each badge:
`{ id, name, description, milestoneType, milestoneThreshold }`.

**Step 4: Run all tests**

Run: `node --test tests/integration/badges.test.js && node --test tests/integration/domain-profiles.test.js`

**Step 5: Commit**

```bash
git add src/nostr/badges.js tests/integration/badges.test.js src/domain-profiles/schema.js
git commit -m "feat: add NIP-58 badge definitions and awarding for provider credentials"
```

---

### Task 4: Add NIP-85 trusted assertions for reputation

Operator publishes computed reputation scores as NIP-85 kind 30382 events, making provider reputation visible to every
Nostr client.

**Files:**

- Create: `src/nostr/assertions.js`
- Test: `tests/integration/assertions.test.js`

**Step 1: Write failing test**

```javascript
test('publishUserAssertion creates valid kind 30382 event', () => {
    // Tags: ['d', '<provider_pubkey>'], ['rank', '87'], ['task_count', '142'],
    //        ['avg_rating', '4.7'], ['domain', 'ridesharing']
});
```

**Step 2: Implement src/nostr/assertions.js**

Module should export:

- `publishUserAssertion(providerPubkey, metrics)` — creates kind 30382 event
    - metrics: `{ rank, taskCount, avgRating, domain, criteriaBreakdown, badgeCount }`
- `publishTaskAssertion(taskEventId, metrics)` — creates kind 30383 event
- `computeProviderRank(providerPubkey)` — calculates 0-100 rank from task history
- `scheduleAssertionUpdates(intervalMs)` — periodically re-publishes assertions

The rank algorithm: `min(100, taskCount * 0.3 + avgRating * 15 + badgeCount * 5 + streakBonus)`

**Step 3: Run tests**

**Step 4: Commit**

```bash
git add src/nostr/assertions.js tests/integration/assertions.test.js
git commit -m "feat: publish NIP-85 trusted assertions for provider reputation"
```

---

### Task 5: Social graph integration — NIP-02 follow lists

The "BatPhone" feature: users can follow trusted providers, and discovery is weighted by social graph.

**Files:**

- Create: `src/nostr/social-graph.js`
- Test: `tests/integration/social-graph.test.js`
- Modify: `web/src/context/IdentityContext.tsx` (add follow list management)

**Step 1: Write failing test**

```javascript
test('getFollowedProviders returns providers from user contact list', async () => {
    // Mock kind 3 event with p-tags for known provider pubkeys
    // Assert returned list matches followed providers
});

test('weightProvidersByFollowGraph returns higher scores for followed providers', async () => {
    // Given: user follows A, user's follow B follows C
    // Provider list: [A, C, D]
    // Expected scores: A = 1.0 (direct follow), C = 0.5 (friend-of-friend), D = 0.0
});
```

**Step 2: Implement src/nostr/social-graph.js**

Module should export:

- `getContactList(pubkey)` — fetches kind 3 event, returns array of followed pubkeys
- `getFollowedProviders(userPubkey, providerPubkeys)` — intersection of follows and available providers
- `computeSocialScore(userPubkey, targetPubkey, depth)` — WoT score (0-1)
    - depth 1: direct follow = 1.0
    - depth 2: friend-of-friend = 0.5
    - depth 3: 3rd degree = 0.25
- `weightProvidersByFollowGraph(userPubkey, providers)` — returns providers sorted by social score
- `getMutualFollows(userPubkey, targetPubkey)` — returns shared follows ("X people you follow also follow this
  provider")
- `suggestFollow(providerPubkey)` — helper that returns NIP-02 event template for adding a follow

**Step 3: Frontend integration**

In `web/src/context/IdentityContext.tsx`, add:

- `followedProviders` state (loaded on identity init)
- `followProvider(npub)` / `unfollowProvider(npub)` methods
- `isFollowing(npub)` helper

Post-task-completion prompt: "Would you like to save this provider to your contacts?"

**Step 4: Run tests**

**Step 5: Commit**

```bash
git add src/nostr/social-graph.js tests/integration/social-graph.test.js
git commit -m "feat: add NIP-02 social graph integration for provider discovery"
```

---

### Task 6: Add social-weighted provider discovery to API

Wire the social graph into the provider matching endpoint.

**Files:**

- Modify: `server.js` (provider listing endpoint)
- Create: `src/discovery/social-weighted.js`
- Test: `tests/integration/social-graph.test.js`

**Step 1: Implement social-weighted discovery**

When `/api/providers/available` returns providers, include:

- `socialScore` — 0-1 based on follow graph distance
- `mutualFollows` — count of shared follows
- `mutualFollowNames` — array of shared follow display names (first 3)
- Sort providers: `score = (reputation * 0.6) + (socialScore * 0.3) + (proximity * 0.1)`

**Step 2: Add "Add to contacts" prompt**

After task completion (`/api/tasks/:id/complete`), response includes `suggestFollow: true` and provider npub for the
client to offer the follow prompt.

**Step 3: Run tests and commit**

---

## Phase 3: Ecosystem Visibility (P2)

### Task 7: Register as NIP-89 application handler

Publish kind 31990 events declaring DonkeyRide as the handler for kinds 30500-30574.

**Files:**

- Create: `src/nostr/app-handler.js`
- Test: `tests/integration/app-handler.test.js`

**Step 1: Implement src/nostr/app-handler.js**

Module should export:

- `publishHandlerInfo(operatorPubkey, operatorPrivkey, config)` — creates kind 31990 event
    - `config.supportedKinds` — array of event kinds (default: 30500-30574)
    - `config.webUrl` — web app URL with `<bech32>` placeholder
    - `config.name` — app name (from domain profile)
    - `config.description` — from domain profile
- `publishHandlerRecommendation(userPubkey, handlerEventAddress)` — kind 31989

Tags for kind 31990:

```javascript
['d', 'donkeyride'],
    ['k', '30500'], ['k', '30501'], ['k', '30502'], // ... all supported kinds
    ['web', 'https://app.donkeyride.com/task/<bech32>', 'nevent'],
    ['name', 'DonkeyRide'],
    ['about', profile.description]
```

**Step 2: Call on server startup**

In `server.js`, after loading the domain profile, call `publishHandlerInfo()` if `OPERATOR_PRIVKEY` is configured.

**Step 3: Test and commit**

---

### Task 8: Publish provider availability as NIP-99 classified listings

Providers publish their availability as kind 30402 events, discoverable by any Nostr marketplace client.

**Files:**

- Create: `src/nostr/listings.js`
- Test: `tests/integration/listings.test.js`

**Step 1: Implement src/nostr/listings.js**

Module should export:

- `publishProviderListing(providerPubkey, details)` — creates kind 30402 event
    - Tags: `['d', '<provider_pubkey>_<domain>']`, `['title', 'Licensed Locksmith — North London']`,
      `['g', '<geohash>']`, `['price', '7500', 'GBP', 'callout']`, `['t', 'locksmith']`,
      `['t', 'emergency']`, `['status', 'active']`, `['location', 'North London, UK']`
    - Content: Markdown description of service offering
- `deactivateListing(providerPubkey)` — publishes updated listing with `['status', 'sold']`
- `queryListingsInArea(geohash, domain)` — queries relays for kind 30402 with `#g` and `#t` filters

**Step 2: Test and commit**

---

### Task 9: Integrate NIP-56 reporting into dispute pipeline

Standard Nostr reports (kind 1984) should feed into DonkeyRide's existing dispute system.

**Files:**

- Create: `src/nostr/reporting.js`
- Modify: `src/nostr/dispute-events.js`
- Test: `tests/integration/reporting.test.js`

**Step 1: Implement src/nostr/reporting.js**

Module should export:

- `publishReport(reporterPubkey, targetPubkey, eventId, reportType, reason)` — creates kind 1984 event
    - Report types: `'no_show'`, `'safety'`, `'fraud'`, `'overcharging'`, `'harassment'`, `'other'`
    - Include NIP-32 label tags for domain-specific qualification
- `queryReportsFor(pubkey)` — queries relays for kind 1984 with `#p` filter
- `getReportCount(pubkey)` — returns count and breakdown by type
- `bridgeToDispute(reportEvent)` — converts NIP-56 report into DonkeyRide dispute filing (kind 30522)

**Step 2: Wire into reputation profile**

In `buildProfileResponse()`, include `reportCount` and `reportTypes` from NIP-56 queries alongside existing panic count.

**Step 3: Test and commit**

---

### Task 10: Add NIP-32 labelling for providers and tasks

Structured labels for categorising providers, tasks, and outcomes.

**Files:**

- Create: `src/nostr/labels.js`
- Test: `tests/integration/labels.test.js`

**Step 1: Implement src/nostr/labels.js**

Module should export:

- `publishLabel(target, namespace, value)` — creates kind 1985 event
    - Namespaces: `'com.donkeyride/provider-tier'`, `'com.donkeyride/service-quality'`, `'com.donkeyride/verification'`
    - Values: `'verified'`, `'insured'`, `'licensed'`, `'gold'`, `'silver'`, `'bronze'`
- `queryLabelsFor(pubkey, namespace)` — queries relays for kind 1985 with `#p` and `#L` filters
- `autoLabelProvider(providerPubkey, taskHistory)` — computes tier labels from task count + rating

Tier thresholds:

- Bronze: 10+ tasks, 3.5+ avg
- Silver: 50+ tasks, 4.0+ avg
- Gold: 200+ tasks, 4.5+ avg

**Step 2: Test and commit**

---

## Phase 4: Domain Profile Expansion (P3)

### Task 11: Add towing/roadside assistance domain profile

**Files:**

- Create: `src/domain-profiles/towing.js`
- Modify: `src/domain-profiles/loader.js` (register new profile)
- Test: `tests/integration/domain-profiles.test.js`

Pattern: Nearly identical to locksmith. Key differences:

- `id: 'towing'`, `name: 'DonkeyTow'`
- Roles: `requester: 'motorist'`, `provider: 'operator'`
- States: Add `'vehicle_assessed'` between arrived and active (operator checks vehicle before starting work)
- Pricing: `'quote'` (varies by situation — flat tyre vs dead battery vs tow-to-garage)
- Completion proof: `['gps_arrival', 'photo']` (photo of fixed vehicle or vehicle on truck)
- Rating criteria: overall, response_time, professionalism, pricing_fairness
- Regulatory: AA, RAC (voluntary)
- Event kind range: 30640-30659 (reserved)

**Step 1: Write towing.js (~100 lines, following locksmith.js pattern)**
**Step 2: Register in loader.js**
**Step 3: Add tests in domain-profiles.test.js**
**Step 4: Test full lifecycle with TaskManager('towing')**
**Step 5: Commit**

---

### Task 12: Add home cleaning domain profile

**Files:**

- Create: `src/domain-profiles/cleaning.js`
- Test: `tests/integration/domain-profiles.test.js`

Pattern: Similar to locksmith but with photo before/after proof.

- `id: 'cleaning'`, `name: 'DonkeySweep'`
- Roles: `requester: 'homeowner'`, `provider: 'cleaner'`
- States: Add `'inspection_complete'` after arrived (cleaner assesses scope before starting)
- Pricing: `'hourly'` or `'flatRate'`
- Completion proof: `['photo_before', 'photo_after', 'requester_sign_off']`
- Rating criteria: overall, thoroughness, punctuality, trustworthiness
- Event kind range: 30660-30679

---

### Task 13: Add pet walking domain profile

**Files:**

- Create: `src/domain-profiles/pet-walking.js`
- Test: `tests/integration/domain-profiles.test.js`

Pattern: Nearly identical to ridesharing (GPS trace is the walk route).

- `id: 'pet_walking'`, `name: 'DonkeyWalk'`
- Roles: `requester: 'owner'`, `provider: 'walker'`
- States: Standard (requested → matched → en_route → arrived → active → completed)
- Pricing: `'hourly'`
- Completion proof: `['gps_trace', 'photo']` (GPS trace of walk + photo of pet)
- Rating criteria: overall, reliability, animal_handling, punctuality, communication
- Features: `photos: true`, `streaming: false`, `requiresDestination: false`
- Event kind range: 30680-30699

---

### Task 14: Add handyman/repairs domain profile

**Files:**

- Create: `src/domain-profiles/handyman.js`
- Test: `tests/integration/domain-profiles.test.js`

Pattern: Similar to locksmith with quote negotiation.

- `id: 'handyman'`, `name: 'DonkeyFix'`
- Roles: `requester: 'homeowner'`, `provider: 'tradesperson'`
- States: Add `'scope_confirmed'` and `'quote_accepted'` between arrived and active
- Pricing: `'quote'`
- Completion proof: `['photo_before', 'photo_after', 'requester_sign_off']`
- Rating criteria: overall, workmanship, punctuality, pricing_fairness, tidiness
- Features: `quoteNegotiation: true`, `photos: true`
- Event kind range: 30700-30719

---

### Task 15: Add moving/hauling domain profile

**Files:**

- Create: `src/domain-profiles/moving.js`
- Test: `tests/integration/domain-profiles.test.js`

Pattern: Hybrid of delivery (A→B with tracking) and locksmith (quote negotiation).

- `id: 'moving'`, `name: 'DonkeyHaul'`
- Roles: `requester: 'client'`, `provider: 'mover'`
- States: `collection_requested` → `mover_matched` → `en_route_to_pickup` → `arrived_at_pickup` → `loading` →
  `in_transit` → `arrived_at_destination` → `unloading` → `completed`
- Pricing: `'quote'` (based on volume + distance)
- Completion proof: `['inventory_checklist', 'photo_before', 'photo_after', 'requester_sign_off']`
- Rating criteria: overall, care_with_belongings, punctuality, efficiency, communication
- Features: `photos: true`, `signatures: true`, `quoteNegotiation: true`
- Event kind range: 30720-30739

---

### Task 16: Add court/process serving domain profile

**Files:**

- Create: `src/domain-profiles/process-serving.js`
- Test: `tests/integration/domain-profiles.test.js`

Pattern: Unique — completion proof is a legal document.

- `id: 'process_serving'`, `name: 'DonkeyServe'`
- Roles: `requester: 'instructing_party'`, `provider: 'process_server'`
- States: `instruction_received` → `server_assigned` → `en_route_to_subject` → `arrived_at_address` →
  `service_attempted` → `affidavit_filed`
- Add failure states: `service_failed` → `re_instruction` (can loop back)
- Pricing: `'flatRate'` per attempt
- Completion proof: `['affidavit_of_service', 'photo', 'gps_arrival', 'timestamp']`
- Rating criteria: overall, success_rate, professionalism, discretion, compliance
- Encryption: `encryptionRequired: true` (legal documents are sensitive)
- Event kind range: 30740-30759

---

### Task 17: Add emergency plumber domain profile

**Files:**

- Create: `src/domain-profiles/plumber.js`
- Test: `tests/integration/domain-profiles.test.js`

Pattern: Almost identical to locksmith.

- `id: 'plumber'`, `name: 'DonkeyFlow'`
- Roles: `requester: 'homeowner'`, `provider: 'plumber'`
- States: Same as locksmith with `'issue_diagnosed'` instead of `'access_method_confirmed'`
- Regulatory: Gas Safe Register (required for gas work), CIPHE (voluntary)
- Event kind range: 30760-30779

---

## Phase 5: Reputation Portability (P4)

### Task 18: Implement kind 30517/30518 — separate provider and requester ratings

Replace the single kind 30530 with distinct rating event kinds per role.

**Files:**

- Modify: `src/nostr/reputation.js`
- Test: `tests/integration/reputation-flow.test.js`

Currently all ratings use kind 30530. The spec defines:

- Kind 30517: Provider rating (published by requester about provider)
- Kind 30518: Requester rating (published by provider about requester)

Maintain backward compatibility: continue accepting kind 30530 for reading, but publish new ratings as 30517/30518.

---

### Task 19: Implement kind 30519 — reputation summaries

Operator publishes computed reputation summaries as addressable events.

**Files:**

- Modify: `src/nostr/reputation.js`
- Test: `tests/integration/reputation-flow.test.js`

Kind 30519 event structure:

```javascript
{
    kind: 30519,
        tags
:
    [
        ['d', '<provider_pubkey>'],
        ['domain', 'ridesharing'],
        ['task_count', '142'],
        ['avg_rating', '4.7'],
        ['criteria', 'punctuality', '4.5'],
        ['criteria', 'safety', '4.9'],
        ['criteria', 'courtesy', '4.6'],
        ['badge_count', '3'],
        ['report_count', '0'],
        ['first_task', '<unix_timestamp>'],
        ['last_task', '<unix_timestamp>']
    ]
}
```

Publish on: task completion (debounced), badge award, periodic refresh.

---

### Task 20: Implement kind 30521 — reputation export/import

Enable cross-operator reputation portability.

**Files:**

- Create: `src/nostr/reputation-portability.js`
- Test: `tests/integration/reputation-portability.test.js`

**Note:** Kind 30521 currently collides with stake penalty. This needs resolving:

- Option A: Move reputation export to an unused kind (e.g., 30531)
- Option B: Disambiguate via `d` tag prefix (`rep_export_` vs `stake_penalty_`)
- **Recommended: Option A** — assign kind 30531 for reputation export, update spec

Export event structure:

```javascript
{
    kind: 30531, // or 30521 with disambiguation
        tags
:
    [
        ['d', '<provider_pubkey>_<source_operator>'],
        ['p', '<provider_pubkey>'],
        ['source_operator', '<operator_pubkey>'],
        ['domain', 'ridesharing'],
        ['task_count', '142'],
        ['avg_rating', '4.7'],
        ['summary', '30519:<operator_pubkey>:<d_tag>'] // reference to full summary
    ]
}
```

Import flow: New operator queries kind 30531 events with `#p` filter for a provider, validates source operator's
reputation (kind 30528), and incorporates imported scores with a decay factor.

---

## Phase 6: Advanced Network Effects (P5)

### Task 21: NIP-69 alignment for P2P marketplace interoperability

Align DonkeyRide's task event structure with NIP-69 conventions where possible, enabling cross-client discovery.

**Files:**

- Modify: `src/nostr/stake-events.js`
- Create: `src/nostr/interop.js`

Add NIP-69-compatible tags to task events:

- `['s', '<status>']` (pending/in-progress/success/canceled/expired)
- `['bond', '<amount>']` (stake amount)
- `['f', '<currency>']` (ISO 4217)
- `['g', '<geohash>']` (already present)
- `['expiration', '<unix>']` (already present via NIP-40)

This doesn't change the core protocol, just adds compatible tags for cross-client discovery.

---

### Task 22: Integrate Vertex WoT scores

Query Vertex's NIP-90 DVM for PageRank-style trust scores to weight provider discovery.

**Files:**

- Create: `src/nostr/wot-vertex.js`
- Test: `tests/integration/wot-vertex.test.js`

Module should export:

- `queryVertexRank(pubkey)` — sends NIP-90 job request (kind 5300), awaits result (kind 6300)
- `batchQueryRanks(pubkeys)` — batch version
- `cacheRanks(duration)` — cache Vertex responses for configurable duration

Fallback: If Vertex is unavailable, fall back to local follow-graph computation from Task 5.

---

### Task 23: Implement NIP-29 groups for operator provider networks

Operators create relay-based groups for verified providers.

**Files:**

- Create: `src/nostr/provider-groups.js`
- Test: `tests/integration/provider-groups.test.js`

Module should export:

- `createProviderGroup(groupId, metadata)` — kind 9007 (create group)
- `addProviderToGroup(groupId, providerPubkey)` — kind 9000 (put-user)
- `removeProviderFromGroup(groupId, providerPubkey)` — kind 9001 (remove-user)
- `getGroupMembers(groupId)` — kind 39002 query
- `handleJoinRequest(groupId, providerPubkey)` — kind 9021 processing

Groups are restricted: join requires operator approval (background check).

---

### Task 24: Add NIP-60/61 Cashu ecash payment rail

Alternative payment method using ecash tokens for stakes.

**Files:**

- Create: `payment-providers/cashu.js`
- Test: `tests/integration/cashu-provider.test.js`

Implement the standard payment provider interface:

- `lockStake()` — lock Cashu tokens (P2PK-locked to a condition)
- `releaseStake()` — unlock tokens to provider
- `forfeitStake()` — unlock tokens to requester (penalty)
- `healthCheck()` — verify mint connectivity
- `getCapabilities()` — returns `{ trustModel: 'federated', currency: 'SAT' }`

Integrates with NIP-87 for mint discovery.

---

### Task 25: Implement multi-operator federation (kind 30565 + 20500)

Operators publish service area definitions; providers broadcast ephemeral availability.

**Files:**

- Create: `src/nostr/federation.js`
- Test: `tests/integration/federation.test.js`

Module should export:

- `publishServiceArea(config)` — kind 30565 event
    - Tags: `['d', '<operator_pubkey>']`, `['g', '<geohash>']` (multiple for coverage area),
      `['domain', 'ridesharing']`, `['domain', 'locksmith']`, `['fee', '0.05']`,
      `['trust_model', 'custodial-escrow']`, `['url', '<api_endpoint>']`
- `publishProviderAvailability(providerPubkey, location)` — kind 20500 ephemeral event
    - Tags: `['g', '<geohash>']`, `['domain', 'ridesharing']`, `['status', 'available']`,
      `['operator', '<operator_pubkey>']`
- `discoverOperatorsInArea(geohash)` — queries kind 30565 with `#g` filter
- `discoverProvidersInArea(geohash, domain)` — queries kind 20500 with `#g` and `#domain` filters

This enables clients to discover and compare operators in their area, breaking single-operator centralisation.

---

### Task 26: Add recurring provider relationship primitive

Support the "maintenance contract" and "repeat booking" patterns.

**Files:**

- Create: `src/recurring-tasks.js`
- Modify: `src/domain-profiles/schema.js` (add `supportsRecurring` feature flag)
- Test: `tests/integration/recurring-tasks.test.js`

New concepts:

- `RecurringContract` — links a requester to a provider for repeated tasks
    - `{ contractId, requesterPubkey, providerPubkey, domain, frequency, nextScheduled }`
- `createRecurringContract(requester, provider, schedule)` — creates contract
- `instantiateNextTask(contractId)` — creates next task from contract template
- `cancelRecurringContract(contractId)` — terminates recurring relationship

Event kind: 30590 (recurring contract definition), addressable by `d` tag.

---

## Execution Notes

### Testing Strategy

- Backend: `node --test tests/integration/<file>.test.js` (Node.js built-in test runner)
- Frontend: `npm run web:test` (vitest)
- Run all: `npm test && npm run web:test`

### Commit Convention

- `fix:` for P0 bug fixes
- `feat:` for new features
- `refactor:` for structural changes
- Always reference the task number: `feat(reputation): add weighted averaging [Task 2]`

### Dependencies

- Phase 1 has no dependencies — start immediately
- Phase 2 depends on Phase 1 (reputation must be domain-agnostic first)
- Phase 3 depends on Phase 2 (badges/assertions must exist before publishing them)
- Phase 4 is independent — can run in parallel with Phases 2-3
- Phase 5 depends on Phase 1-2 (needs weighted reputation + assertions)
- Phase 6 depends on Phase 2-3 (needs social graph + ecosystem visibility)

### Parallelisation

Tasks that can run in parallel:

- Tasks 11-17 (all domain profiles) — completely independent of each other
- Tasks 7-10 (ecosystem visibility) — independent of each other, depend on Phase 2
- Tasks 3 and 4 (badges and assertions) — independent of each other
- Task 5 and Tasks 7-10 can start as soon as Phase 1 is done

### Kind Range Allocation Update

| Range       | Domain                            | Status   |
|-------------|-----------------------------------|----------|
| 30500-30529 | Core protocol + stakes + payments | Active   |
| 30530-30549 | Reputation + compliance           | Active   |
| 30549-30569 | Safety, abuse, discovery          | Active   |
| 30570-30599 | Ridesharing extension             | Active   |
| 30600-30619 | Locksmith extension               | Reserved |
| 30620-30639 | Delivery extension                | Reserved |
| 30640-30659 | Towing extension                  | **NEW**  |
| 30660-30679 | Cleaning extension                | **NEW**  |
| 30680-30699 | Pet walking extension             | **NEW**  |
| 30700-30719 | Handyman extension                | **NEW**  |
| 30720-30739 | Moving/hauling extension          | **NEW**  |
| 30740-30759 | Process serving extension         | **NEW**  |
| 30760-30779 | Plumber extension                 | **NEW**  |
| 20500       | Provider availability (ephemeral) | Active   |
