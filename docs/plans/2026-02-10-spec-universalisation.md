# NIP Specification Universalisation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the DonkeyRide NIP specifications generic enough to cover all viable service coordination use cases,
resolve internal inconsistencies, document every potential domain with fit analysis, and create an interoperability
framework that any third-party project could adopt.

**Architecture:** Spec-first approach — all changes are to markdown specification files in `specs/`. No code changes.
Each task modifies one or more `.md` files and verifies internal consistency (no broken cross-references, no kind
collisions, no undefined tags). The specs should be readable by someone who has never seen DonkeyRide and wants to build
an independent implementation.

**Tech Stack:** Markdown specs in `specs/`, documentation in `docs/`. All event kinds use NIP-33 (parameterised
replaceable events) or append-only semantics. All monetary amounts are currency-neutral with `amount`, `currency`,
`trust_model` tags.

**Context files the implementer MUST read before starting any task:**

- `specs/QUICK-REFERENCE.md` — Current event kind table and cross-references
- `specs/NIP-XX-core.md` — Core protocol spec (the parent of all extensions)
- `CLAUDE.md` — Project conventions (British English, payment agnosticism, NIP-40 expiration, etc.)

---

## Phase 1: Fix Critical Kind Collisions

These MUST be resolved before any other spec work, because everything downstream depends on a clean, unambiguous kind
allocation.

### Task 1: Resolve kind 30506 dual-purpose (cancellation + milestone)

**Files:**

- Modify: `specs/NIP-XX-core.md` (kind 30506 definition, ~lines 100-101, 281-297)
- Modify: `specs/NIP-XX-stakes.md` (kind 30506 milestone definition, ~lines 26-27, 100-133)
- Modify: `specs/QUICK-REFERENCE.md` (kind table entries)

**Problem:** Kind 30506 is defined as "Service Cancellation" in NIP-XX-core and "Milestone Completion" in NIP-XX-stakes.
The QUICK-REFERENCE even has a note: "Kind 30506 is shared... distinguish by presence of `milestone_id` tag." This is
fragile — a relay filtering on kind 30506 gets a mix of semantically unrelated events.

**Step 1: Assign a new kind for Milestone Completion**

Choose kind **30505** (currently unused in core — the ridesharing spec defines 30505 as "Cross-Operator Coordination"but
that's a domain extension, not core). Actually, 30505 is used by ridesharing. Use **30531** instead (currently unused,
in the reputation/compliance range 30530-30549). Wait — let's keep milestone in the stakes range. Kind **30508**is "
Service End". Let's use **30536** — it's in the reputation range but unused, and milestones are trust-adjacent. Actually
the cleanest approach: keep 30506 as cancellation only (it's already in NIP-XX-core), and move milestone to **30509** —
but 30509 is "Commitment Stake".

The cleanest solution: assign **30537** to Milestone Completion. It's in the 30530-30549 range (core
extensions/compliance), currently unused, and milestones are a trust/compliance concept.

In `specs/NIP-XX-core.md`, remove the dual-purpose note about 30506. Keep 30506 as Service Cancellation only.

In `specs/NIP-XX-stakes.md`:

- Change kind 30506 to **30537** in the event kinds table
- Update the "Kind 30537: Milestone Completion" event structure section
- Update all references

In `specs/QUICK-REFERENCE.md`:

- Remove the collision note
- Add kind 30537 to the stakes table
- Keep 30506 as cancellation only

**Step 2: Verify no other spec references kind 30506 as milestone**

Search all `specs/*.md` files for "30506" and "milestone". Update any cross-references.

**Step 3: Commit**

```bash
git add specs/NIP-XX-core.md specs/NIP-XX-stakes.md specs/QUICK-REFERENCE.md
git commit -m "fix: resolve kind 30506 collision — milestone moves to 30537"
```

---

### Task 2: Resolve kind 30523 dual-purpose (arbiter assignment + payment failure)

**Files:**

- Modify: `specs/NIP-XX-disputes.md` (kind 30523 arbiter assignment, ~lines 24-28, 129-161)
- Modify: `specs/NIP-XX-payments.md` (kind 30523 payment failure, ~lines 30, 235-270)
- Modify: `specs/NIP-XX-core.md` (kind 30523 in dispute table, ~lines 140-141)
- Modify: `specs/QUICK-REFERENCE.md`

**Problem:** Kind 30523 is defined as "Arbiter Assignment" in NIP-XX-disputes and NIP-XX-core, but as "Payment Failure"
in NIP-XX-payments. Two completely different event types sharing the same kind.

**Step 1: Assign a new kind for Payment Failure**

Move Payment Failure to **30538** (unused, in the compliance/extension range). Keep 30523 as Arbiter Assignment (it's
the disputes spec's original claim).

In `specs/NIP-XX-payments.md`:

- Change kind 30523 to **30538** in the event kinds table
- Update the event structure section heading and content
- Update all references

In `specs/QUICK-REFERENCE.md`:

- Remove 30523 from the payments table
- Add kind 30538 as Payment Failure in the payments table
- Keep 30523 as Arbiter Assignment only

**Step 2: Verify no other spec references kind 30523 as payment failure**

Search all `specs/*.md` for "30523" and "payment_failure" or "Payment Failure".

**Step 3: Commit**

```bash
git add specs/NIP-XX-disputes.md specs/NIP-XX-payments.md specs/NIP-XX-core.md specs/QUICK-REFERENCE.md
git commit -m "fix: resolve kind 30523 collision — payment failure moves to 30538"
```

---

### Task 3: Resolve kinds 30553/30554 collision (guardian voting + ridesharing edge cases)

**Files:**

- Modify: `specs/NIP-XX-ridesharing.md` (kinds 30553-30554, ~lines 264-268)
- Modify: `specs/QUICK-REFERENCE.md`

**Problem:** Kind 30553 is "Slashing Proposal" in NIP-XX-disputes and "Location Clarification" in NIP-XX-ridesharing.
Kind 30554 is "Guardian Vote" in NIP-XX-disputes and "Pickup Delay Notification" in NIP-XX-ridesharing. The disputes
spec has the stronger claim (guardian voting is fundamental infrastructure). The ridesharing edge cases should move.

**Step 1: Reassign the ridesharing edge case kinds**

In `specs/NIP-XX-ridesharing.md`, move:

- "Location Clarification" from 30553 → **30573** (in the ridesharing UX range 30570-30599, currently 30573 is "Referral
  Code" — move referral code to 30574, and cascade: 30574 "Promo Code" → 30576 "Corporate Account" is already taken, so
  shift as follows):

Actually, the simplest approach: use the reserved range. There are gaps in the ridesharing extension. Let's put:

- Location Clarification → **30539** — no, that's core range.

Better: keep them in the ridesharing extension range (30570-30599). Currently unused kinds in that range: look at the
spec — 30570 through 30599 are mostly assigned. But there are no kinds 30590-30599 explicitly assigned beyond
30590-30594 and 30595-30599. Let's check:

- 30590: Surge Pricing Zone ✓
- 30591: Surge Pricing History ✓
- 30592: Demand Heatmap ✓
- 30593: Ride History Summary ✓
- 30594: Tax Report ✓
- 30595-30599: Verification kinds ✓

All taken! But the edge cases section in ridesharing currently lists 30553-30558. These need to be moved. The cleanest
approach: **insert a new "Edge Cases" sub-range at the end of the reserved delivery extension range**, or better yet,
these are ridesharing-specific so they belong in 30570-30599. Since all individual numbers are taken, we should
consolidate some of the less critical ridesharing kinds.

Actually, the best approach: the ridesharing spec has 82 kinds claiming the entire 30500-30599 range, but many of those
are core kinds it merely inherits. The ridesharing-SPECIFIC kinds should be clearly separated. The edge cases at
30553-30558 collide with core dispute kinds (30553-30554) and core safety kinds (30555-30558 don't collide — 30559 is
Emergency Alert). Wait, let me check:

- 30555: Driver Break Request (ridesharing) — doesn't collide with any core kind
- 30556: Ride Extension Request — doesn't collide
- 30557: Destination Change — doesn't collide
- 30558: Route Update — doesn't collide

Only 30553 and 30554 collide. So the fix is simple: move just these two ridesharing kinds to unused slots in the
30570-30599 range. Looking at the actual spec, I see gaps between the named kinds. Let me look more carefully:

Ridesharing kinds explicitly assigned: 30505, 30514-30516, 30529, 30532-30535, 30541-30543, 30544-30545, 30552-30558,
30565-30569, 30570-30577, 30578-30582, 30583-30587, 30588-30589, 30590-30592, 30593-30594, 30595-30599.

Unassigned in 30530-30550 range (excluding core kinds): 30531, 30536, 30539, 30546-30548 (delivery shared),
30550 (core). (Note: 30538 was assigned to Payment Failure in Task 2.)

But we want to stay in the ridesharing-only range. Unassigned in 30570-30599: none — all 30 are assigned.

Solution: since 30553 "Location Clarification" and 30554 "Pickup Delay Notification" are edge cases, and we need to free
those kinds for guardian voting (core disputes), the simplest fix is to **merge these into existing ridesharing kinds**:

- "Location Clarification" can be handled as a content variant of kind 30512 (Status Update) with a `clarification` tag
- "Pickup Delay Notification" can be handled as a content variant of kind 30512 (Status Update) with a
  `delay_notification` tag

This is actually better protocol design — using the generic Status Update kind with domain-specific tags rather than
inventing new kinds for every edge case.

In `specs/NIP-XX-ridesharing.md`:

- Remove kinds 30553 and 30554 from the Edge Cases table
- Add a section explaining how location clarification and pickup delay are handled via kind 30512 Status Update with
  specific tags (`["update_type", "location_clarification"]` and `["update_type", "pickup_delay"]`)
- Update the total kind count (82 → 80)

In `specs/QUICK-REFERENCE.md`:

- Remove the ridesharing entries for 30553/30554
- Ensure 30553/30554 only appear as Slashing Proposal / Guardian Vote

**Step 2: Commit**

```bash
git add specs/NIP-XX-ridesharing.md specs/QUICK-REFERENCE.md
git commit -m "fix: resolve kinds 30553/30554 collision — ridesharing edge cases use status updates"
```

---

### Task 4: Audit all kind allocations and update QUICK-REFERENCE

**Files:**

- Modify: `specs/QUICK-REFERENCE.md` (comprehensive audit)
- Read: all `specs/NIP-XX-*.md` files

**Step 1: Build a master kind allocation spreadsheet**

Read every spec file and extract every kind number mentioned. Build a complete list:

- Kind number → Name → Spec file → Replaceable? → Publisher
- Flag any remaining duplicates

**Step 2: Update QUICK-REFERENCE.md**

Ensure the QUICK-REFERENCE tables are 100% consistent with the individual spec files after Tasks 1-3. Update the Kind
Range Allocation table. Remove any stale collision notes.

**Step 3: Verify the "Which NIPs Does Each Domain Use?" matrix is accurate**

Cross-reference each domain extension spec against the modular NIPs to ensure the checkmarks are correct.

**Step 4: Commit**

```bash
git add specs/QUICK-REFERENCE.md
git commit -m "docs: audit and reconcile all kind allocations in QUICK-REFERENCE"
```

---

## Phase 2: Create Comprehensive Use-Case Catalogue

### Task 5: Write the Use-Case Catalogue document

**Files:**

- Create: `docs/USE-CASE-CATALOGUE.md`

**Step 1: Write the document**

Create a comprehensive catalogue of every service domain that fits the DonkeyRide protocol. For each domain, document:

1. **Domain name and identifier** (e.g., `towing`, `pet_walking`)
2. **Fit score** (1-10) with justification
3. **Roles** (requester/provider mapping)
4. **Discovery method** (geohash, skill_tags, category, etc.)
5. **Pricing model** (streaming, flat_rate, hourly, milestone, distance_weight, quote)
6. **State machine** (which core states apply, which need extensions)
7. **Key features needed** (navigation, photos, signatures, heartbeat, recurring, duration, etc.)
8. **Proof types** (GPS, photo, signature, document, etc.)
9. **Rating criteria** (domain-specific)
10. **Regulatory context** (UK-focused where applicable)
11. **Which modular NIPs it needs** (core, stakes, reputation, disputes, discovery, safety, navigation, payments)
12. **What's missing** (any gaps in current specs that block this domain)

Cover at minimum these domains:

**Already implemented (10/10 fit):**

- Ridesharing
- Locksmith dispatch
- Parcel delivery

**High fit (8-10/10) — location-based, one-off:**

- Towing / roadside assistance
- Emergency plumber / electrician / gas engineer
- Man with van / removals
- Car wash / mobile valeting
- Court / process serving
- Gardening / landscaping

**Good fit (7-8/10) — location-based, may need duration/recurring:**

- Pet walking / pet sitting
- Cleaning (domestic / commercial)
- Security guard dispatch
- Companion care / home care
- Babysitting / childminding
- Personal training / fitness
- Dog grooming
- Window cleaning
- Pest control

**Moderate fit (5-7/10) — needs virtual/non-location support:**

- Online tutoring
- Tech support (remote)
- Consulting
- Translation / interpreting
- Photography (event)

**Novel/niche (fit varies):**

- Food delivery (hot food, groceries)
- Laundry pickup/delivery
- Tool/equipment rental
- Ski instructor / surf instructor
- Tour guide
- Mystery shopping
- Notary public

**Step 2: Add a summary matrix**

Create a visual matrix showing which capabilities each domain needs:

```
Domain | Location | Streaming | Flat | Hourly | Milestone | Photo | Signature | Duration | Recurring | Virtual
-------|----------|-----------|------|--------|-----------|-------|-----------|----------|-----------|--------
```

**Step 3: Identify the capability gaps**

At the end of the document, list every capability that appears in the matrix but is NOT currently supported by any spec.
These become the requirements for Phase 3 and 4.

**Step 4: Commit**

```bash
git add docs/USE-CASE-CATALOGUE.md
git commit -m "docs: comprehensive use-case catalogue with fit scores and gap analysis"
```

---

## Phase 3: Generalise the Core Spec

### Task 6: Generalise discovery beyond geohash-only

**Files:**

- Modify: `specs/NIP-XX-discovery.md`
- Modify: `specs/NIP-XX-core.md` (discovery references)

**Step 1: Add discovery method taxonomy to NIP-XX-discovery.md**

Currently the spec says "geohash-based provider discovery". Add support for multiple discovery methods. Each domain
profile declares its discovery method(s):

```json
[
  "discovery_method",
  "geohash"
]
[
  "discovery_method",
  "skill_tags"
]
[
  "discovery_method",
  "category"
]
[
  "discovery_method",
  "availability"
]
```

| Method         | Tags Used                                       | Best For                                                   |
|----------------|-------------------------------------------------|------------------------------------------------------------|
| `geohash`      | `g` (geohash)                                   | Location-based services (ridesharing, locksmith, delivery) |
| `skill_tags`   | `t` (NIP-12 hashtags)                           | Trades and skilled services (plumber, electrician, tutor)  |
| `category`     | `category`, `subcategory`                       | Browsable service directories (cleaning, pet care)         |
| `availability` | `available_from`, `available_until`, `timezone` | Scheduled/virtual services (tutoring, consulting)          |
| `jurisdiction` | `jurisdiction`, `court_id`                      | Legal services (process serving, notary)                   |

Most domains will use `geohash` as their primary method, but domains MAY declare multiple methods. For example, a pet
walking service uses `geohash` + `category` (dog walking vs cat sitting vs exotic pets).

**Step 2: Update kind 20500 (Provider Availability) to support non-geohash discovery**

Add optional tags for skill-based and category-based discovery:

```json
{
  "kind": 20500,
  "tags": [
    [
      "g",
      "gcpuuz"
    ],
    [
      "domain",
      "pet_walking"
    ],
    [
      "provider_pubkey",
      "<hex>"
    ],
    [
      "status",
      "available"
    ],
    [
      "t",
      "dog_walking"
    ],
    [
      "t",
      "large_dogs"
    ],
    [
      "category",
      "pet_services"
    ],
    [
      "subcategory",
      "dog_walking"
    ],
    [
      "available_from",
      "1698765600"
    ],
    [
      "available_until",
      "1698787200"
    ],
    [
      "timezone",
      "Europe/London"
    ]
  ]
}
```

The `g` tag remains REQUIRED for location-based services but is OPTIONAL for virtual services. Add a section explaining
virtual service discovery (no geohash, category + availability + timezone instead).

**Step 3: Update kind 30565 (Service Area Definition) for non-geographic operators**

Add an alternative form for virtual/non-geographic service areas:

```json
{
  "kind": 30565,
  "tags": [
    [
      "d",
      "<operator_pubkey>_virtual"
    ],
    [
      "domain",
      "tutoring"
    ],
    [
      "operator_pubkey",
      "<hex>"
    ],
    [
      "service_type",
      "virtual"
    ],
    [
      "categories",
      "maths,physics,chemistry"
    ],
    [
      "languages",
      "en,fr"
    ],
    [
      "timezone",
      "Europe/London"
    ],
    [
      "operating_hours",
      "09:00-21:00"
    ]
  ]
}
```

**Step 4: Update NIP-XX-core.md to reference the expanded discovery**

In the core spec, update the "see also" references and any sections that assume geohash-only discovery.

**Step 5: Commit**

```bash
git add specs/NIP-XX-discovery.md specs/NIP-XX-core.md
git commit -m "feat: generalise discovery beyond geohash — add skill, category, availability methods"
```

---

### Task 7: Generalise the core state machine

**Files:**

- Modify: `specs/NIP-XX-core.md` (state machine section, ~lines 172-200)

**Step 1: Make `provider_en_route` and `provider_arrived` optional**

Currently the core spec shows:

```
requested → matched → provider_en_route → provider_arrived → active → completed
```

Change this to define **required states** and **optional states**:

Required states (all domains): `requested`, `matched`, `active`, `completed`, `cancelled`, `no_show`

Optional states (domain declares which to use):

- `provider_en_route` — physical transit to task location (skip for virtual/on-site)
- `provider_arrived` — physical arrival at task location (skip for virtual/on-site)

Add a note: "Domains where the provider is already at the location (e.g., security guard at a fixed post) or where there
is no physical location (e.g., virtual tutoring) MAY skip `provider_en_route` and `provider_arrived`, transitioning
directly from `matched` to `active`."

Update the state diagram to show the optional states clearly:

```
requested ──→ matched ──→ [provider_en_route] ──→ [provider_arrived] ──→ active ──→ completed
    │             │              │                       │                  │
    │             │              │                       ├──────────────→ no_show
    └─────────────┴──────────────┴───────────────────────┴──────────────→ cancelled

States in [brackets] are optional — domain profiles declare which states are used.
Domains MAY transition directly from matched → active when physical transit is not applicable.
```

**Step 2: Add generic state names for domain aliases**

Add a table mapping core state names to common domain aliases:

| Core State          | Alias Pattern                           | Examples                                    |
|---------------------|-----------------------------------------|---------------------------------------------|
| `requested`         | `{task_noun}_requested`                 | `lockout_reported`, `delivery_requested`    |
| `matched`           | `{provider}_matched`                    | `locksmith_matched`, `courier_matched`      |
| `provider_en_route` | `{provider}_en_route`                   | `en_route`, `courier_en_route`              |
| `provider_arrived`  | `{provider}_arrived`                    | `arrived`, `courier_arrived`                |
| `active`            | `work_active`, `in_progress`, `on_duty` | `work_active`, `in_transit`, `on_duty`      |
| `completed`         | `{domain}_completed`                    | `access_gained`, `delivered`, `shift_ended` |

**Step 3: Commit**

```bash
git add specs/NIP-XX-core.md
git commit -m "feat: make en_route/arrived optional in core state machine for non-location services"
```

---

### Task 8: Generalise tag naming in core spec

**Files:**

- Modify: `specs/NIP-XX-core.md` (Common Tags Reference, ~lines 486-510; kind 30500 structure, ~lines 205-234)

**Step 1: Rename location tags to be generic**

In the kind 30500 (Service Request) event structure, change:

- `origin_lat` / `origin_lon` → `location_lat` / `location_lon` (generic primary location)
- `destination_lat` / `destination_lon` → `destination_lat` / `destination_lon` (keep — "destination" is generic enough)
- `origin_geohash` → `g` (standard Nostr geohash tag)

Add a note: "Domain extensions define aliases: ridesharing uses `pickup_lat`/`dropoff_lat`, delivery uses
`collection_lat`/`delivery_lat`. Implementations MUST accept both the generic and domain-aliased forms."

**Step 2: Update the Common Tags Reference table**

Replace ridesharing-specific tag names with generic ones:

| Tag               | Description                           | Domain Aliases                                                                     |
|-------------------|---------------------------------------|------------------------------------------------------------------------------------|
| `location_lat`    | Primary task location latitude        | `pickup_lat` (ridesharing), `collection_lat` (delivery), `lockout_lat` (locksmith) |
| `location_lon`    | Primary task location longitude       | (same pattern)                                                                     |
| `destination_lat` | Destination latitude (if applicable)  | `dropoff_lat` (ridesharing), `delivery_lat` (delivery)                             |
| `destination_lon` | Destination longitude (if applicable) | (same pattern)                                                                     |

Add: "The `location_*` tags are REQUIRED for geohash-discovered services and OPTIONAL for virtual/category-discovered
services."

**Step 3: Commit**

```bash
git add specs/NIP-XX-core.md
git commit -m "feat: genericise location tags — origin→location with domain aliases"
```

---

### Task 9: Generalise proof types

**Files:**

- Modify: `specs/NIP-XX-core.md` (add a Completion Proof section)

**Step 1: Add a Completion Proof Types section to NIP-XX-core.md**

Currently proof types are only mentioned in domain extensions. Add a core section defining the proof type taxonomy:

```markdown
## Completion Proof Types

Domain profiles declare which proof types are required for task completion. The core protocol defines the following
proof types:

| Proof Type | Description | Applicable To |
|------------|-------------|---------------|
| `gps_trace` | GPS route trace during active task | Location-based transit (ridesharing, delivery) |
| `gps_arrival` | GPS coordinates confirming arrival | All location-based services |
| `photo` | Geotagged photographic evidence | Physical services (locksmith, delivery, cleaning) |
| `photo_before_after` | Before and after photos | Transformation services (cleaning, repair, grooming) |
| `signature` | Digital signature from counterparty | Delivery, legal services |
| `document` | Document or file handover | Legal services, virtual services |
| `checkin` | Heartbeat check-in confirmations | Duration services (security guard, companion care) |
| `video` | Video evidence | High-value or safety-critical services |
| `receipt` | External receipt or confirmation | Purchases, toll payments |
| `counterparty_ack` | Explicit acknowledgement from the other party | All services (universal fallback) |

Domain profiles specify required proof types as an array:

```json
["completion_proof", "gps_arrival", "photo"]
```

```

**Step 2: Commit**

```bash
git add specs/NIP-XX-core.md
git commit -m "feat: add completion proof type taxonomy to core spec"
```

---

## Phase 4: Add Missing Primitives

### Task 10: Add recurring/subscription model to core spec

**Files:**

- Modify: `specs/NIP-XX-core.md` (add Recurring Tasks section)
- Modify: `specs/NIP-XX-stakes.md` (recurring stake semantics)

**Step 1: Add a Recurring Tasks section to NIP-XX-core.md**

Add after the "Linked Tasks" section:

```markdown
## Recurring Tasks

Tasks MAY be configured as recurring, creating a series of linked tasks on a schedule. The recurrence is defined on the
initial task request (kind 30500) using recurrence tags:

| Tag | Description | Example |
|-----|-------------|---------|
| `recurrence` | Recurrence frequency | `["recurrence", "weekly"]` |
| `recurrence_until` | End date (unix timestamp) | `["recurrence_until", "1730000000"]` |
| `recurrence_days` | Days of week (comma-separated) | `["recurrence_days", "mon,wed,fri"]` |
| `recurrence_time` | Preferred time (HH:MM, local timezone) | `["recurrence_time", "09:00"]` |
| `recurrence_timezone` | Timezone for scheduling | `["recurrence_timezone", "Europe/London"]` |
| `recurrence_exceptions` | Dates to skip (comma-separated ISO dates) | `["recurrence_exceptions", "2026-03-15,2026-03-22"]` |

### Recurrence Frequencies

| Frequency | Description |
|-----------|-------------|
| `daily` | Every day |
| `weekdays` | Monday to Friday |
| `weekly` | Once per week |
| `biweekly` | Every two weeks |
| `monthly` | Once per month |

### Recurring Task Lifecycle

1. Requester publishes a kind 30500 with recurrence tags
2. Provider accepts the series (kind 30501 with `["accepts_recurrence", "true"]`)
3. The operator creates individual task instances ahead of schedule (each a new kind 30500 with a
   `["linked_task", "<series_id>", "recurrence"]` tag)
4. Each instance follows the normal task lifecycle independently
5. Either party MAY cancel the series by publishing a kind 30506 with `["cancels_recurrence", "<series_id>"]`

### Recurring Stake Semantics

For recurring tasks, stakes are locked per-instance, not for the entire series. The initial acceptance locks the first
instance's stakes. Subsequent instances lock stakes automatically before each scheduled occurrence.
```

**Step 2: Update NIP-XX-stakes.md**

Add a brief section on recurring stake semantics referencing the core spec.

**Step 3: Commit**

```bash
git add specs/NIP-XX-core.md specs/NIP-XX-stakes.md
git commit -m "feat: add recurring/subscription task model to core spec"
```

---

### Task 11: Add duration/time-block model to core spec

**Files:**

- Modify: `specs/NIP-XX-core.md` (add Duration Tasks section)
- Modify: `specs/NIP-XX-safety.md` (cross-reference heartbeat)
- Modify: `specs/NIP-XX-payments.md` (hourly billing model)

**Step 1: Add a Duration Tasks section to NIP-XX-core.md**

Add after the Recurring Tasks section:

```markdown
## Duration Tasks (Time-Block Services)

Some services are billed by duration rather than by completion of a discrete task. Examples: security guard dispatch (
8-hour shift), babysitting (4 hours), companion care (overnight). Duration tasks use the following additional tags on
the service request (kind 30500):

| Tag | Description | Example |
|-----|-------------|---------|
| `service_model` | `instant` (default), `duration`, `scheduled` | `["service_model", "duration"]` |
| `scheduled_start` | Planned start time (unix timestamp) | `["scheduled_start", "1698765600"]` |
| `scheduled_duration_seconds` | Planned duration in seconds | `["scheduled_duration_seconds", "28800"]` |
| `hourly_rate` | Rate per hour (smallest currency unit) | `["hourly_rate", "1500"]` |
| `heartbeat_required` | Whether periodic check-ins are required | `["heartbeat_required", "true"]` |
| `heartbeat_interval_minutes` | Minutes between check-ins | `["heartbeat_interval_minutes", "30"]` |

### Duration Task State Machine

Duration tasks extend the core state machine with an `on_duty` state:

```

requested → matched → [provider_en_route] → [provider_arrived] → on_duty → completed

```

The `on_duty` state maps to `active` in the core state machine but has different semantics:
- `active` (instant services): provider is performing work, task will complete when work is done
- `on_duty` (duration services): provider is present and available, task completes when the scheduled duration expires

### Heartbeat Integration

Duration tasks SHOULD use the heartbeat protocol (NIP-XX-safety, kinds 30561-30563) with the `heartbeat_interval_minutes` from the task request. Missed check-ins trigger the standard escalation procedure.

### Billing

Duration tasks use hourly billing via kind 30510 (Streaming Payment) with `interval_seconds` set to 3600 (1 hour). The `cumulative_total` tag tracks the running total. See NIP-XX-payments for details.
```

**Step 2: Add a cross-reference in NIP-XX-safety.md**

In the Heartbeat Protocol section, add a note: "Duration tasks (see NIP-XX-core) configure heartbeat parameters directly
on the service request. The operator uses these parameters to schedule check-in requests automatically."

**Step 3: Add hourly billing clarification in NIP-XX-payments.md**

In the Streaming Models table, ensure "Per-time | Every 30 seconds" is updated to include hourly:

```
| Per-time (seconds) | Every 30 seconds | Ridesharing |
| Per-time (hourly) | Every 60 minutes | Security guard, companion care, babysitting |
```

**Step 4: Commit**

```bash
git add specs/NIP-XX-core.md specs/NIP-XX-safety.md specs/NIP-XX-payments.md
git commit -m "feat: add duration/time-block service model to core spec"
```

---

### Task 12: Add virtual service support to core spec

**Files:**

- Modify: `specs/NIP-XX-core.md` (add Virtual Services section)
- Modify: `specs/NIP-XX-discovery.md` (already partially done in Task 6)

**Step 1: Add a Virtual Services section to NIP-XX-core.md**

Add after Duration Tasks:

```markdown
## Virtual Services

Services that do not require physical co-location (online tutoring, remote tech support, consulting) are supported as
virtual tasks. Virtual tasks:

- MUST include `["service_model", "virtual"]` on the service request
- MUST NOT include `location_lat` / `location_lon` tags (no physical location)
- SHOULD include `["meeting_method", "video_call|phone|chat|async"]`
- MAY include `["meeting_url", "<url>"]` (encrypted via NIP-44 or NIP-17)
- Skip `provider_en_route` and `provider_arrived` states (transition directly from `matched` to `active`)
- Use `counterparty_ack` as the default completion proof type

### Virtual Service Discovery

Virtual services are discovered via category tags and availability windows rather than geohash. See NIP-XX-discovery for
the `category` and `availability` discovery methods.

### Example: Virtual Tutoring Request

```json
{
  "kind": 30500,
  "tags": [
    ["d", "session_abc123"],
    ["domain", "tutoring"],
    ["service_model", "virtual"],
    ["meeting_method", "video_call"],
    ["category", "education"],
    ["subcategory", "maths"],
    ["t", "gcse_maths"],
    ["scheduled_start", "1698765600"],
    ["scheduled_duration_seconds", "3600"],
    ["hourly_rate", "3500"],
    ["currency", "GBP"],
    ["timezone", "Europe/London"]
  ],
  "content": "GCSE maths tutoring — need help with algebra and trigonometry"
}
```

```

**Step 2: Commit**

```bash
git add specs/NIP-XX-core.md
git commit -m "feat: add virtual service support to core spec"
```

---

## Phase 5: Social Graph and Network Effects

### Task 13: Add NIP-02 follow list integration (the "BatPhone" pattern)

**Files:**

- Modify: `specs/NIP-XX-discovery.md` (add social discovery section)
- Modify: `specs/NIP-XX-reputation.md` (add social proof section)

**Step 1: Add a Social Discovery section to NIP-XX-discovery.md**

After the NIP-99 Integration section, add:

```markdown
## NIP-02 Integration: Social Discovery (BatPhone Pattern)

Requesters MAY leverage their Nostr follow lists (NIP-02, kind 3) for **social-first discovery** — finding providers
they've previously used, providers followed by people they trust, or providers within their social graph.

### Priority Matching

When a requester publishes a service request (kind 30500), operators SHOULD check the requester's follow list (kind 3)
and prioritise matching with providers the requester follows. This creates a "BatPhone" effect — trusted providers are
offered the task first.

### Discovery Tiers

| Tier | Source | Priority |
|------|--------|----------|
| 1. **Direct follows** | Providers in the requester's kind 3 follow list | Highest — offered task first |
| 2. **Previous providers** | Providers the requester has completed tasks with before | Second — offered if tier 1 unavailable |
| 3. **Social proof** | Providers followed by people the requester follows (2-hop WoT) | Third — preferred over strangers |
| 4. **Open matching** | Any available provider meeting minimum criteria | Default fallback |

### NIP-02 Follow as "Favourite Provider"

When a requester follows a provider's pubkey (kind 3 event), this serves as a persistent "favourite provider" signal.
Unlike the ridesharing-specific kind 30577 (Favourite Driver), this works across all Nostr clients and all domains.

### Implementation

Operators query the requester's kind 3 event from relays:
```

Filter: { kinds: [3], authors: ["<requester_pubkey>"] }

```

Extract `p` tags and cross-reference with available providers. If any match, offer them the task before opening to general matching.
```

**Step 2: Add a Social Proof section to NIP-XX-reputation.md**

After the Cross-Domain Portability section, add:

```markdown
## Social Proof

Reputation from the requester's social graph carries more weight than reputation from strangers. Operators MAY weight
ratings based on social distance:

| Social Distance | Weight Multiplier | Description |
|----------------|-------------------|-------------|
| Direct follow (1-hop) | 2.0x | The requester follows the rater |
| Follow-of-follow (2-hop) | 1.5x | The requester follows someone who follows the rater |
| Same community (3-hop) | 1.2x | Connected within 3 hops in the follow graph |
| Stranger | 1.0x | No social connection |

This is a form of **Web of Trust** (WoT) — ratings from trusted people matter more than ratings from strangers. It
provides natural Sybil resistance, since fake accounts typically lack social connections.
```

**Step 3: Commit**

```bash
git add specs/NIP-XX-discovery.md specs/NIP-XX-reputation.md
git commit -m "feat: add NIP-02 social discovery and WoT-weighted reputation"
```

---

### Task 14: Add NIP-32 labelling and NIP-56 reporting integration

**Files:**

- Modify: `specs/NIP-XX-reputation.md` (add NIP-32 section)
- Modify: `specs/NIP-XX-disputes.md` (expand NIP-56 section)

**Step 1: Add NIP-32 Labelling section to NIP-XX-reputation.md**

After the NIP-58 Integration section, add:

```markdown
## NIP-32 Integration: Structured Labels

Operators and community members MAY publish **NIP-32 label events** (kind 1985) to categorise providers, tasks, and
outcomes with structured labels visible across the Nostr ecosystem.

### Provider Labels

```json
{
  "kind": 1985,
  "tags": [
    ["L", "com.donkeyride.provider"],
    ["l", "verified", "com.donkeyride.provider"],
    ["l", "top_rated", "com.donkeyride.provider"],
    ["l", "gas_safe", "com.donkeyride.provider"],
    ["p", "<provider_pubkey>"]
  ]
}
```

### Task Outcome Labels

```json
{
  "kind": 1985,
  "tags": [
    [
      "L",
      "com.donkeyride.outcome"
    ],
    [
      "l",
      "completed_successfully",
      "com.donkeyride.outcome"
    ],
    [
      "l",
      "above_and_beyond",
      "com.donkeyride.outcome"
    ],
    [
      "e",
      "<task_completion_event_id>"
    ]
  ]
}
```

Labels provide machine-readable metadata that any Nostr client can use for filtering and display.

```

**Step 2: Expand NIP-56 Reporting in NIP-XX-disputes.md**

The existing NIP-56 section is minimal. Expand it:

```markdown
## NIP-56 Integration: Cross-Ecosystem Reporting

Safety-critical dispute outcomes SHOULD be published as **NIP-56 report events** (kind 1984) for visibility across the broader Nostr ecosystem. This ensures that users flagged for serious misconduct are visible to all Nostr clients, not just DonkeyRide-compatible ones.

### When to Publish NIP-56 Reports

| Trigger | Report Type | Severity |
|---------|------------|----------|
| Confirmed theft (kind 30527 slashing) | `fraud` | Critical |
| Verified harassment (kind 30564 + resolution) | `impersonation` or content-specific | High |
| Repeated safety violations (3+ kind 30559 alerts) | `other` with description | High |
| Account suspension for misconduct (kind 30550) | Appropriate NIP-56 type | Medium |

### Report Format

```json
{
  "kind": 1984,
  "tags": [
    ["p", "<reported_pubkey>", "fraud"],
    ["e", "<evidence_event_id>", "other"],
    ["L", "com.donkeyride.report"],
    ["l", "confirmed_theft", "com.donkeyride.report"]
  ],
  "content": "Confirmed operator theft via guardian network vote (4/5). Bond slashed. See kind 30527 event for details."
}
```

### What NOT to Report via NIP-56

- Simple disputes resolved normally (use internal dispute kinds)
- Low ratings (not a safety concern)
- Cancellations (expected behaviour)
- Unverified accusations (must be confirmed via dispute resolution first)

```

**Step 3: Commit**

```bash
git add specs/NIP-XX-reputation.md specs/NIP-XX-disputes.md
git commit -m "feat: add NIP-32 labelling and expand NIP-56 reporting integration"
```

---

## Phase 6: Interoperability Framework

### Task 15: Write the Interoperability Guide

**Files:**

- Create: `docs/INTEROPERABILITY.md`

**Step 1: Write the document**

Create a comprehensive interoperability guide explaining how third-party projects can adopt the NIP-XX specifications.
Structure:

1. **Why Interoperability Matters** — Users keep their identity, reputation, and payment preferences across apps.
   Providers don't need to register on every platform. Operators compete on service quality, not lock-in.

2. **Levels of Interoperability**
    - **Level 1: Data portability** — Accept NIP-XX event schemas. Users can export/import reputation.
    - **Level 2: Cross-operator discovery** — Publish kind 30565 service areas and kind 20500 availability. Users find
      providers across operators.
    - **Level 3: Full federation** — Cross-operator task handoff (kind 30505). Shared dispute resolution. Guardian
      network participation.

3. **Minimum Implementation for a Third-Party Client**
    - Subscribe to kinds 30500-30512 on public relays
    - Accept both generic (`requester_pubkey`) and domain-aliased (`rider_pubkey`) tags
    - Include `domain` tags on all published events
    - Include `amount`, `currency`, `trust_model` on all monetary events
    - Use NIP-33 `d` tags for all replaceable events
    - Use NIP-40 `expiration` tags on time-limited events

4. **Minimum Implementation for a Third-Party Operator**
    - Publish kind 30565 (Service Area) with `supported_domains`, `fee_percent`, `trust_models`
    - Publish kind 31990 (NIP-89 App Handler) declaring supported kinds
    - Publish kind 30540 (Operator Bond) if accepting stakes
    - Accept kind 30500 requests from any client
    - Publish kind 30519 (Reputation Summary) for active users
    - Participate in kind 30553/30554 guardian voting (optional but recommended)

5. **How a Ridesharing App Would Adopt This Protocol**
    - Concrete example: "Imagine building a ridesharing app. Here's what you implement..."
    - List the ~18 kinds for MVP ridesharing
    - Show how an independent app and DonkeyRide share the same provider pool
    - Show how a driver's reputation carries across apps

6. **How a General-Purpose Nostr Client Can Display Service Events**
    - Kind 30500 (Service Request): show as a "looking for service" card
    - Kind 30519 (Reputation Summary): show as a profile badge
    - Kind 30540 (Operator Bond): show as an operator trust indicator
    - Kind 30559 (Emergency Alert): show as a high-priority notification

7. **Event Kind Registry**
    - Formal request to register kinds 30500-30699 in the Nostr NIP kind registry
    - Reference the modular NIP structure

**Step 2: Commit**

```bash
git add docs/INTEROPERABILITY.md
git commit -m "docs: comprehensive interoperability guide for third-party adoption"
```

---

### Task 16: Write new domain extension spec — Towing

**Files:**

- Create: `specs/NIP-XX-towing.md`
- Modify: `specs/QUICK-REFERENCE.md` (add towing to the tables)

**Step 1: Write NIP-XX-towing.md**

Follow the exact structure of NIP-XX-locksmith.md as a template. Use kind range **30640-30659**.

Domain identifier: `towing`
Roles: Requester = `motorist`, Provider = `recovery_operator`
Task noun: `callout`
Discovery: geohash
Pricing: flatRate with quoteNegotiation (same pattern as locksmith — price depends on vehicle type, distance, and
whether a flatbed or dolly is needed)

State machine: extends core with `vehicle_assessed` between arrived and active (like locksmith's
`access_method_confirmed`)

```
breakdown_reported → operator_matched → en_route → arrived → vehicle_assessed → recovery_active → recovered
```

Domain-specific tags: `vehicle_make`, `vehicle_model`, `vehicle_year`, `vehicle_colour`, `vehicle_plate`,
`breakdown_type` (flat_tyre, engine, electrical, accident, fuel, locked_out, other), `requires_flatbed`,
`destination_garage`

Domain-specific kinds:

- 30641: Recovery Quote (like locksmith 30601)
- 30642: Quote Acceptance
- 30643: Vehicle Assessment Confirmation
- 30645: Recovery Completion (with photo proof of vehicle at destination)

Rating criteria: overall (0.25), response_time (0.25), professionalism (0.20), care_of_vehicle (0.20),
pricing_fairness (0.10)

**Step 2: Update QUICK-REFERENCE.md**

Add towing to the domain extension table and the "Which NIPs Does Each Domain Use?" matrix.

**Step 3: Commit**

```bash
git add specs/NIP-XX-towing.md specs/QUICK-REFERENCE.md
git commit -m "feat: add towing/roadside assistance domain extension spec"
```

---

### Task 17: Write new domain extension spec — Emergency Trades

**Files:**

- Create: `specs/NIP-XX-emergency-trades.md`
- Modify: `specs/QUICK-REFERENCE.md`

**Step 1: Write NIP-XX-emergency-trades.md**

Kind range: **30660-30679**

Domain identifier: `emergency_trades`
Roles: Requester = `homeowner`, Provider = `tradesperson`
Task noun: `callout`
Discovery: geohash + skill_tags (plumber, electrician, gas_engineer, general)
Pricing: milestone (diagnosis → emergency fix → full repair)

State machine: extends core with milestone states

```
emergency_reported → tradesperson_matched → en_route → arrived → diagnosed → emergency_fix → [full_repair] → completed
```

The `full_repair` state is optional — some jobs are emergency-only (stop the leak) with a follow-up task linked via
`["linked_task", "<emergency_id>", "follow_up"]`.

Domain-specific tags: `trade_type` (plumber, electrician, gas_engineer, locksmith, roofer, glazier), `emergency_type` (
water_leak, power_outage, gas_leak, broken_window, blocked_drain), `certification_required` (gas_safe, niceic, part_p),
`parts_needed`, `parts_cost`

Domain-specific kinds:

- 30661: Diagnosis Report (with photo + description)
- 30662: Repair Quote (milestone-based)
- 30663: Quote Acceptance
- 30665: Milestone Completion (references core kind 30537)
- 30667: Guarantee Start (like locksmith 30605)

Rating criteria: overall (0.20), response_time (0.20), diagnosis_accuracy (0.20), workmanship (0.20),
pricing_transparency (0.10), tidiness (0.10)

**Step 2: Update QUICK-REFERENCE.md**

**Step 3: Commit**

```bash
git add specs/NIP-XX-emergency-trades.md specs/QUICK-REFERENCE.md
git commit -m "feat: add emergency trades domain extension spec (plumber, electrician, etc.)"
```

---

### Task 18: Write new domain extension spec — Pet Services

**Files:**

- Create: `specs/NIP-XX-pet-services.md`
- Modify: `specs/QUICK-REFERENCE.md`

**Step 1: Write NIP-XX-pet-services.md**

Kind range: **30680-30699**

Domain identifier: `pet_services`
Roles: Requester = `pet_owner`, Provider = `pet_carer`
Task noun: `booking`
Discovery: geohash + category (dog_walking, cat_sitting, dog_grooming, pet_transport, exotic_care)
Pricing: hourly (walking, sitting) or flatRate (grooming, transport)
Service model: duration + recurring

State machine: extends core (uses `on_duty` for sitting, standard for walking/grooming)

Domain-specific tags: `pet_species`, `pet_breed`, `pet_name`, `pet_age`, `pet_weight_kg`, `pet_temperament` (friendly,
nervous, reactive), `special_needs` (medication, diet, mobility), `service_type` (walking, sitting, grooming, transport,
training)

Domain-specific kinds:

- 30681: Pet Profile (published by pet owner — reusable across bookings)
- 30682: Walk/Session Report (photo proof, distance walked, notes)
- 30683: Medication Administered (timestamp, medication name, dose)
- 30685: Emergency Vet Report

Rating criteria: overall (0.25), reliability (0.20), pet_handling (0.25), communication (0.15), photos_updates (0.15)

**Step 2: Update QUICK-REFERENCE.md**

**Step 3: Commit**

```bash
git add specs/NIP-XX-pet-services.md specs/QUICK-REFERENCE.md
git commit -m "feat: add pet services domain extension spec (walking, sitting, grooming)"
```

---

### Task 19: Write new domain extension spec — Security Guard Dispatch

**Files:**

- Create: `specs/NIP-XX-security.md`
- Modify: `specs/QUICK-REFERENCE.md`

**Step 1: Write NIP-XX-security.md**

Kind range: **30700-30719**

Domain identifier: `security`
Roles: Requester = `client`, Provider = `guard`
Task noun: `assignment`
Discovery: geohash
Pricing: hourly (duration-based)
Service model: duration (shift-based)

State machine: extends core with `on_duty` and shift management

```
assignment_requested → guard_matched → en_route → arrived → on_duty → shift_ended
```

The `on_duty` state uses the heartbeat protocol (NIP-XX-safety, kinds 30561-30563) with configurable intervals (
typically 30-minute check-ins).

Domain-specific tags: `assignment_type` (static_guard, patrol, door_supervision, event_security, close_protection),
`shift_start`, `shift_end`, `shift_duration_hours`, `site_type` (residential, commercial, event, construction),
`sia_licence_required` (true/false), `uniform_required`

Domain-specific kinds:

- 30701: Shift Report (end-of-shift summary)
- 30702: Incident Report (during shift)
- 30703: Patrol Checkpoint (GPS-confirmed patrol waypoint)
- 30705: Site Briefing (pre-shift information)

Rating criteria: overall (0.25), alertness (0.25), professionalism (0.25), communication (0.15), punctuality (0.10)

Regulatory context: SIA licensing mandatory in the UK for most guarding activities.

**Step 2: Update QUICK-REFERENCE.md**

**Step 3: Commit**

```bash
git add specs/NIP-XX-security.md specs/QUICK-REFERENCE.md
git commit -m "feat: add security guard dispatch domain extension spec"
```

---

## Phase 7: Final Consistency Pass

### Task 20: Update all cross-references across all spec files

**Files:**

- Modify: all `specs/NIP-XX-*.md` files
- Modify: `specs/QUICK-REFERENCE.md`

**Step 1: Update "See Also" sections**

Every spec file has a "See Also" section at the end. After all the changes in Phases 1-6, update every cross-reference
to ensure:

- New specs are referenced where relevant
- The "Depends On" sections are accurate
- The "Referenced NIPs" table in NIP-XX-core.md is complete (add NIP-02, NIP-32, NIP-56 if not already there)

**Step 2: Update "Which NIPs Does Each Domain Use?" matrix in QUICK-REFERENCE.md**

Add rows for: towing, emergency_trades, pet_services, security. Tick the modular NIPs each uses.

**Step 3: Update the Kind Range Allocation table**

```
| 30640-30659 | Towing extension | Active |
| 30660-30679 | Emergency trades extension | Active |
| 30680-30699 | Pet services extension | Active |
| 30700-30719 | Security guard extension | Active |
| 30720-30799 | Reserved for future domains | TBD |
```

**Step 4: Final consistency check**

Read every spec file and verify:

- No kind number appears in two different specs with different meanings
- All `amount` tags have corresponding `currency` tags
- All time-limited events use `expiration` (not `expiry`) per NIP-40
- All encrypted payloads reference NIP-44 (not NIP-04)
- British English throughout (colour, behaviour, licence, etc.)

**Step 5: Commit**

```bash
git add specs/
git commit -m "docs: final consistency pass — cross-references, matrices, and kind allocation"
```

---

### Task 21: Update CLAUDE.md with new specs

**Files:**

- Modify: `CLAUDE.md`

**Step 1: Update the Architecture section**

Add the new domain extension specs to the "Modular NIP Specifications" description. Update the "Allocated Kind Ranges"if
mentioned. Add the new documentation files to the "Protocol Reference" section.

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with new domain extensions and spec changes"
```

---

## Summary

| Phase                    | Tasks | What It Achieves                                                 |
|--------------------------|-------|------------------------------------------------------------------|
| 1: Fix Collisions        | 1-4   | Clean, unambiguous kind allocation                               |
| 2: Use-Case Catalogue    | 5     | Every potential domain documented with fit analysis              |
| 3: Generalise Core       | 6-9   | Discovery, state machine, tags, and proofs work for ALL services |
| 4: Missing Primitives    | 10-12 | Recurring, duration, and virtual services supported              |
| 5: Social Graph          | 13-14 | NIP-02 "BatPhone", WoT reputation, NIP-32/NIP-56 integration     |
| 6: Interop + New Domains | 15-19 | Interop guide + 4 new domain extensions                          |
| 7: Final Consistency     | 20-21 | Everything cross-referenced, validated, and documented           |

**Total: 21 tasks across 7 phases.**

After completion, the NIP specifications will:

- Cover 20+ service domains (currently 3)
- Support location, virtual, duration, and recurring services (currently location-only)
- Have zero kind collisions (currently 3)
- Include a comprehensive interoperability guide for third-party adoption
- Integrate NIP-02, NIP-32, and NIP-56 for social graph and network effects
- Be readable by any developer who wants to build an independent, interoperable implementation
