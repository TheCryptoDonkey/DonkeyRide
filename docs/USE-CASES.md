# DonkeyRide Protocol: Use Case Analysis & Generalisation Strategy

## Context

The DonkeyRide protocol is built on primitives that are fundamentally not about ridesharing — they're about
trust-minimised coordination between strangers with asymmetric information, using cryptographic proof instead of
institutional authority. This document analyses what's universal, maps 33 concrete use cases with UK regulatory
considerations, deep-dives into healthcare, and designs a concrete generalisation architecture.

---

## Part 1: Core Protocol Primitives (Domain-Agnostic)

The protocol decomposes into 7 universal primitives:

| # | Primitive                      | What It Solves                             | Implementation                                                 |
|---|--------------------------------|--------------------------------------------|----------------------------------------------------------------|
| 1 | Request/Response Matching      | Finding a counterparty                     | Kind 30500/30501 + geohash or tag-based discovery              |
| 2 | Commitment Stakes (Escrow)     | Preventing ghosting by either party        | Hodl invoices, custodial locks, or federated custody           |
| 3 | Lifecycle State Machine        | Tracking task progress                     | requested → matched → en_route → arrived → active → completed  |
| 4 | Portable Reputation            | Trust without institutions                 | Kind 30530 signed ratings, web-of-trust weighted, time-decayed |
| 5 | Automated Dispute Resolution   | Scaling conflict resolution                | Kind 30522/30524 with confidence scoring                       |
| 6 | Federated Operators with Bonds | Preventing monopoly & operator fraud       | Kind 30540 slashable bonds                                     |
| 7 | Privacy-Preserving Discovery   | Finding services without exposing location | Geohash precision levels, encrypted DMs post-match             |

The three-layer architecture holds across every use case:

```
NOSTR (public, permanent)     →  Discovery + Reputation + Operator Bonds
OPERATOR (private, compliant) →  PII + Coordination + Payments + Compliance Data
WEBSOCKET (ephemeral)         →  Real-time tracking + Live updates
```

---

## Part 2: Use Case Catalogue

> **Detailed state machines** for the top 10 use cases (with Mermaid diagrams, payment triggers, and protocol gap analysis) are in [USE-CASE-STATE-MACHINES.md](USE-CASE-STATE-MACHINES.md).

### Tier 1 — Immediate Wins (minimal protocol changes)

#### 1. Locksmith Dispatch — Protocol Fit: 10/10

The single best non-ridesharing application. The UK locksmith industry is plagued by scam operators who quote £50 on the
phone and charge £300+ on arrival. Commitment stakes directly solve this — a locksmith who stakes 15% of their quoted
price via publishStakeLock() cannot price-gouge without forfeiting their stake. Transparent, auditable pricing on Nostr
is transformative.

- State machine: lockout_reported → locksmith_matched → en_route → arrived → access_method_confirmed → work_active →
  access_gained → completed
- The access_method_confirmed state lets the locksmith confirm method (picking, drilling, replacement) with pricing
  updated before work begins
- Locksmiths are unregulated in the UK — no mandatory licensing. The protocol provides the trust layer that regulation
  otherwise would
- Market: ~£700m. Fragmented, trust-deficient, no dominant platform
- Regulatory: Very low. MLA voluntary certification. DBS recommended

#### 2. Man with a Van / Small Removals — Protocol Fit: 9/10

Almost identical to ridesharing. "Man with a van" is ridesharing for goods. Geospatial discovery, two-party matching,
real-time WebSocket tracking, streaming payments per minute. The multi-leg trip event (kind 30535) handles multi-stop
moves.

- State machine: removal_requested → mover_matched → en_route_to_pickup → arrived → loading → in_transit →
  arrived_at_delivery → unloading → completed
- AnyVan charges 15-25% commission; protocol's 1-5% operator fee is transformative
- Market: ~£1.5bn. AnyVan established but unpopular with providers
- Regulatory: Low (standard driving licence under 3.5 tonnes)

#### 3. Mobile Car Wash / Valeting — Protocol Fit: 9/10

Minimal protocol modification. Customer may not be present — photo evidence at completion triggers automatic stake
release. The corporate account event (kind 30576) maps to fleet contracts.

- Market: ~£1.2bn. Weak incumbents
- Regulatory: Very low (Environmental Protection Act for water runoff)

#### 4. Parcel Delivery — Protocol Fit: 9/10

1:1 mapping with ridesharing. Pick up at A, deliver to B, track in real-time. Replace "passenger" with "parcel".

- Adds COLLECTED state between ARRIVED and ACTIVE
- Proof of completion: geotagged photo + digital signature (vs GPS at dropoff)
- New events needed: package description, proof of delivery, chain of custody, condition photos
- Market: Very large. Royal Mail / Hermes alternatives
- Regulatory: Low (Consumer Rights Act 2015, goods-in-transit insurance)

#### 5. Court Process Serving — Protocol Fit: 9/10

Surprisingly excellent. Cryptographically signed, GPS-stamped, timestamped Nostr events provide stronger proof of
service than traditional paper forms. The append-only event chain creates an immutable evidence trail potentially
admissible in court.

- Multiple service attempts documented with full evidence trail
- Process serving is unregulated in England and Wales (CPR Part 6)
- Market: Small-medium (~£100-200m) but no technology platform exists

#### 6. Notary Public — Protocol Fit: 8/10

Mobile notarisation shares the dispatch + document-centric pattern with court process serving. The notary travels to the
client, verifies identity, witnesses signatures, and applies their seal. Cryptographically signed Nostr events provide
an immutable record of the notarisation act — time, location, parties present, document hash.

- State machine: notarisation_requested → notary_matched → en_route → arrived → identity_verified →
  documents_reviewed → notarisation_complete → completed
- Photo proof of identity documents + signed attestation event
- Market: ~£200-400m (UK). Growing demand for mobile notarisation
- Regulatory: Notaries Public are regulated by the Faculty Office of the Archbishop of Canterbury. Must hold a current
  practising certificate. Scrivener notaries (London) are additionally regulated

### Tier 2 — Strong Fit (needs quote/deliverable primitives)

#### 7. Roadside Assistance (AA/RAC Alternative) — Protocol Fit: 9/10

A stranded motorist is functionally identical to a rider. Commitment stakes are more valuable here than in ridesharing —
a no-show mechanic leaves someone on a motorway hard shoulder. Streaming payments per minute are ideal for
variable-duration repairs.

- Needs urgency tiers (hard shoulder = life-threatening vs flat tyre in car park)
- Needs skill-matching tags: ['skill', 'electrical'], ['skill', 'tyres'], ['skill', 'towing']
- Market: ~£2bn+. AA/RAC have ~25m members combined. Customer satisfaction chronically poor
- Regulatory: Low-medium (Traffic Commissioner licence for vehicles >3.5t)

#### 8. Emergency Plumber/Electrician — Protocol Fit: 8/10

Emergency trade callouts share the locksmith pattern — urgent, trust-sensitive, prone to price-gouging. Adds a
guarantee_period state tracked as a long-lived replaceable event (NIP-33).

- Gas Safe registration MANDATORY for gas work (criminal offence if unregistered)
- Milestone-based escrow for major work: 30% on parts order, 40% on installation, 30% on commissioning
- Market: Very large (~£4-6bn combined)
- Regulatory: High (Gas Safe, Part P, NICEIC)

#### 9. Food Delivery (Deliveroo / Uber Eats Alternative) — Protocol Fit: 8/10

Introduces a three-party model (restaurant → courier → customer). Tipping already exists (kind 30513). Surge pricing
already implemented.

- Temperature compliance: hot food >63°C, cold food <8°C (Food Safety Act 1990)
- Natasha's Law (2021) — prepacked items must list all ingredients
- Allergen information must be preserved through delivery chain (EU FIC Regulation retained in UK law)
- Market: Very large
- Regulatory: Medium (FSA, food hygiene, allergen law)

#### 10. Security Guard Dispatch — Protocol Fit: 8/10

Ad-hoc security dispatch. Safety check-in events (kinds 30561-30562) serve double duty — confirming guard safety AND
presence on-site (proof of service).

- SIA licence verification mandatory (Private Security Industry Act 2001)
- Market: Large (~£6bn total, ad-hoc segment £500m-1bn)

#### 11. Personal Trainer / Fitness Coaching — Protocol Fit: 8/10

Commitment stakes address the chronic no-show problem. 80% forfeit for cancellation directly from existing STAKE_CONFIG.
Recurring relationships (2-3x/week) need strong scheduling support.

- CIMSPA/REPs registration. DBS if working with under-18s
- Health-related data = special category under UK GDPR
- Market: ~£1-1.5bn

#### 12. Environmental Sampling / Monitoring — Protocol Fit: 8/10

Environmental sampling data used in court (pollution prosecutions, planning appeals) requires legally defensible chain
of custody. Cryptographically signed, GPS-stamped events provide stronger evidence than paper forms.

- MCERTS/UKAS accreditation as credential verification
- Market: Medium (~£200-500m addressable)

#### 13. Blood / Organ / Specimen Transport — Protocol Fit: 8/10

Append-only Nostr events create an immutable chain-of-custody record exceeding traditional paper forms. Time-penalty
mechanisms: automatic forfeit if delivery exceeds agreed window.

- Human Tissue Authority licensing, MHRA, potentially CQC
- Market: ~£200-400m. NHS contracts dominate
- Regulatory: Very high

#### 14. Volunteer Coordination — Protocol Fit: 8/10

Works WITHOUT payments (zero-value sessions). Reputation stakes instead of financial — volunteers who no-show lose
reputation rather than money. Multiple charities sharing the protocol can share volunteer pools via cross-operator
coordination (kind 30505).

- Market: Non-commercial but massive social impact
- Current tooling: WhatsApp groups and spreadsheets

### Tier 3 — Good Fit (needs more adaptation)

#### 15. Pet Services — Protocol Fit: 7/10

GPS tracking particularly valuable (owner watches walk route). Photo updates during walk via safety check-ins.

- Animal Welfare Act 2006, Animal Welfare Regulations 2018 for boarding
- Market: Medium

#### 16. Dog Grooming — Protocol Fit: 7/10

Distinct from general pet services. The groomer either travels to the client (mobile grooming van) or the client brings
the dog to the groomer. Photo proof of before/after condition protects both parties. Commitment stakes address the
chronic no-show problem — groomers lose significant income from last-minute cancellations because appointment slots
cannot easily be refilled.

- State machine: grooming_requested → groomer_matched → en_route → arrived → pet_assessed → grooming_active →
  grooming_complete → completed
- Before/after photo proof standard practice
- Needs duration-based pricing (small dog 45 min vs large dog 2+ hours)
- Market: ~£400-600m (UK). Highly fragmented, mostly sole traders
- Regulatory: Very low. Animal Welfare Act 2006 applies. No mandatory licensing for groomers

#### 17. Tradesperson Marketplace — Protocol Fit: 7/10

Needs quote negotiation primitive (mechanic arrives, assesses, issues quote, customer accepts/declines). Needs milestone
payments.

- Gas Safe, NICEIC/NAPIT, CIS tax scheme
- Market: Large

#### 18. Mobile Hairdresser / Beautician — Protocol Fit: 7/10

Favourite driver event (kind 30577) maps to "favourite stylist". Additional charge event (kind 30516) covers product
costs.

- No mandatory licensing (England/Wales). Scotland requires registration
- Market: ~£800m-1.2bn mobile segment

#### 19. Tutoring / Skills Coaching — Protocol Fit: 7/10

Discovery shifts from geohash to skill tags. Location optional (in-person or video).

- Enhanced DBS mandatory for under-18s
- Market: Medium

#### 20. Childminder / Babysitter — Protocol Fit: 7/10

Handover moments are legally significant — timestamped, signed events create auditable records of when responsibility
transferred.

- Ofsted registration MANDATORY for >2 hours/day childcare for reward
- Regulatory: Very high

#### 21. Farm Labour Coordination — Protocol Fit: 7/10

Portable reputation is transformative — picker's track record travels between farms. Transparent payment records support
anti-exploitation goals.

- GLAA licensing is criminal law — operating without licence carries up to 10 years imprisonment
- Market: ~£500m-1bn. Weak technology

#### 22. P2P Community Energy — Protocol Fit: 7/10

Streaming payments per kWh as energy flows. Technically elegant but regulatory barrier is massive.

- Ofgem licensing required (Licence Lite regime gradually opening)
- Market: Nascent but potentially very large

#### 23. Equipment / Tool Rental — Protocol Fit: 7/10

Two-phase lifecycle (rental out + return). Stakes become damage deposits.

- Market: Medium

#### 24. Mobile Mechanic — Protocol Fit: 7/10

Needs quote-then-accept flow (assess → quote → accept → repair).

- Market: ~£1-2bn mobile segment

#### 25. Window Cleaning — Protocol Fit: 7/10

Follows the mobile car wash pattern but introduces height-work considerations and recurring scheduling. Most window
cleaning is repeat business — the same cleaner visits every 4-8 weeks. Commitment stakes protect both parties: the
cleaner who turns up to a locked gate loses income, the customer who waits in all morning for a no-show loses time.

- State machine: clean_requested → cleaner_matched → en_route → arrived → work_active → completed
- Before/after photo proof for dispute resolution
- Recurring scheduling is the dominant pattern (monthly/bi-monthly)
- Height work may require Working at Height Regulations 2005 compliance for commercial premises
- Market: ~£500-800m (UK). Extremely fragmented — mostly sole traders and small firms
- Regulatory: Very low. Working at Height Regulations for commercial. Consumer Rights Act 2015

#### 26. Pest Control — Protocol Fit: 7/10

Shares the emergency trades pattern — urgent dispatch, on-site assessment, quote, treatment. Often requires multiple
visits (initial treatment + follow-up inspection). The guarantee period primitive is essential — pest control companies
typically guarantee treatment for 3-12 months.

- State machine: pest_reported → controller_matched → en_route → arrived → inspection → quote_issued →
  quote_accepted → treatment_active → treatment_complete → follow_up_scheduled → verified_clear → completed
- Multi-visit lifecycle (treatment + follow-up inspection)
- Guarantee period: 3-12 months depending on pest type
- Photo/video evidence of infestation and treatment
- Market: ~£600m-1bn (UK). Mix of national chains and independents
- Regulatory: Low-medium. BPCA membership voluntary but widely expected. Use of pesticides regulated under
  Plant Protection Products Regulation. Some treatments require RSPH Level 2 qualification

#### 27. Tour Guide — Protocol Fit: 7/10

Duration-based service with strong location and scheduling components. Discovery shifts to skill/language/speciality
tags alongside geohash. The favourite provider event (kind 30577) maps to "favourite guide" for repeat tourists.
Streaming payments per hour work naturally for variable-duration tours.

- State machine: tour_requested → guide_matched → en_route → met_at_point → tour_active → tour_complete → completed
- Duration-based pricing (hourly rate, streaming payments)
- Discovery by speciality tags: ['speciality', 'history'], ['language', 'mandarin'], etc.
- Location-based but not navigation-dependent (walking tours, museum tours)
- Market: ~£200-500m (UK). Highly seasonal. Fragmented with few dominant platforms
- Regulatory: Very low. Blue Badge (official tourist guide qualification) is voluntary but prestigious.
  No mandatory licensing in the UK

#### 28. Ski / Surf Instructor — Protocol Fit: 7/10

Follows the personal trainer pattern — hourly rate, commitment stakes for no-shows, recurring lessons. Discovery
combines geohash (resort/beach location) with skill level tags. Safety events are particularly relevant given the
inherent risk of the activity.

- State machine: lesson_requested → instructor_matched → en_route → met_at_point → lesson_active →
  lesson_complete → completed
- Hourly/half-day/full-day pricing tiers
- Skill-level matching: ['level', 'beginner'], ['level', 'intermediate'], ['level', 'advanced']
- Safety check-in events critical (avalanche risk, sea conditions)
- Equipment rental as linked task
- Market: ~£100-300m (UK, seasonal). Larger globally
- Regulatory: Low. BASI (British Association of Snowsport Instructors) for ski. ISA/Surfing England for surf.
  No mandatory licensing but industry certifications expected. DBS if working with under-18s

### Tier 4 — Moderate Fit

#### 29. Photography / Videography — Protocol Fit: 6/10

Extended lifecycle spanning days/weeks (shoot + editing + delivery). Needs multi-day session tracking.

#### 30. Building Surveyor — Protocol Fit: 7/10

Deliverable (survey report) extends lifecycle beyond physical visit. Needs deliverable-tracking primitive.

#### 31. Elderly Companion Care — Protocol Fit: 7/10

Non-clinical variant. If companionship only → no CQC. If personal care → CQC mandatory.

- Market: High (ageing population, £6.7bn domiciliary care market)

#### 32. Clinical Healthcare — Protocol Fit: 7/10 (see Part 3 deep dive)

Most complex. Requires significant adaptation. See dedicated section below.

#### 33. Mystery Shopping — Protocol Fit: 6/10

Unusual model — the "provider" (mystery shopper) visits a business and reports back to the "requester" (brand/retailer).
The service is inherently covert, which creates unique protocol requirements: the shopper's identity must never be
linked to the task on public Nostr relays. Deliverable is a structured report rather than a physical service.

- State machine: assignment_posted → shopper_matched → visit_scheduled → visit_completed → report_submitted →
  report_reviewed → completed
- Virtual/deliverable-based: the visit is physical but the output is a digital report
- No real-time tracking (covert operation — tracking would blow cover)
- Discovery by location + skill tags (retail experience, restaurant knowledge)
- Milestone payments: partial on visit completion, remainder on report acceptance
- Market: ~£200-400m (UK). Dominated by agencies (Ipsos, BVA BDRC)
- Regulatory: Very low. Data Protection Act 2018 applies to personal data collected.
  Market Research Society Code of Conduct (voluntary)

---

## Part 3: Healthcare Deep Dive

### The Market Opportunity

The UK domiciliary care market is £6.7 billion in 2026, growing at 6.8% CAGR. CQC-registered domiciliary care services
grew from 8,414 (2017) to 13,733 (2024) — 63% increase. 2 million people aged 65+ are not getting needed care due to
staff shortages. Skills for Care estimates 440,000 additional care workers needed by 2035.

Private agencies charge 30-40% of the nurse's rate. The protocol's 1-5% operator fee combined with instant settlement
(vs 30-60 day payment cycles) is a compelling value proposition.

### The CQC Question — Can You Avoid Registration?

CQC explicitly exempts introductory agencies from registration. The regulated activity of personal care "does not apply
to the introduction of carers to an individual by a person having no ongoing role in the direction or control of the
service provided."

An introductory agency can: charge a one-off fee, verify credentials, check satisfaction.

An introductory agency cannot: manage the care worker's schedule, determine how care is delivered, direct the care
worker, gather information to direct the care worker.

The Uber v Aslam warning: The Supreme Court [2021] UKSC 5 ruled that Uber drivers are workers because Uber controls
fares, uses ratings to determine work allocation, and restricts communication. If the operator sets prices, controls
work allocation via ratings, or penalises declining visits — nurses become workers, and CQC registration is triggered.

### Clinical Data Architecture

Clinical data never touches Nostr relays. Only coordination metadata does:

```
PUBLIC NOSTR RELAYS (safe)                    PRIVATE OPERATOR DB (encrypted, audited)
├─ Nurse availability (geohashed)             ├─ Patient details (AES-256 at rest)
├─ Nurse reputation (aggregated scores)       ├─ Clinical notes (7yr retention)
├─ Operator bonds                             ├─ Medication administration records
├─ Service area definitions                   ├─ Vital signs history
└─ Scheduling coordination (time only)        ├─ Visit photographs
                                              ├─ Consent records
ENCRYPTED DMs (NIP-17, post-match)            └─ Full audit trail
├─ Exact patient address
├─ Patient name and contact                   NHS SPINE (if NHS-adjacent)
└─ Visit-specific instructions                ├─ Summary Care Record updates
                                              ├─ GP notifications
                                              └─ Prescription data
```

### HL7 FHIR Integration

Clinical events map to UK Core FHIR R4 profiles:

| Clinical Event   | FHIR Resource            | UK Core Profile                             |
|------------------|--------------------------|---------------------------------------------|
| Home visit       | Encounter                | UKCore-Encounter                            |
| Blood pressure   | Observation              | UKCore-Observation-VitalSigns-BloodPressure |
| Medication given | MedicationAdministration | UKCore-MedicationAdministration             |
| Care plan update | CarePlan                 | UKCore-CarePlan                             |
| Referral         | ServiceRequest           | UKCore-ServiceRequest                       |

The operator bridges between protocol coordination and FHIR-based clinical data exchange.

### Safeguarding — Non-Negotiable Requirements

- Care Act 2014 s42: Duty to make enquiries where abuse/neglect suspected
- Children Act 2004 s11: Duty to safeguard children in health services
- Mental Capacity Act 2005: Capacity assessments must be recordable; protocol cannot assume third-party requests imply
  patient consent
- Duty of Candour (Regulation 20): Open and honest when safety incidents occur
- The protocol must: provide encrypted safeguarding alert channels, enable immediate escalation outside normal workflow,
  support audit trails
- The protocol must not: store safeguarding concerns on public Nostr relays, allow alleged abusers to see reports,
  create accountability gaps

### Professional Registration

- NMC PIN verification via public online register (no real-time API currently available — genuine friction point)
- Revalidation every 3 years: 450 practice hours, 35 hours CPD, 5 reflective accounts
- Protocol opportunity: automatic practice hour tracking, verified patient feedback as revalidation evidence
- Professional indemnity insurance mandatory since 2016 (£100-500/yr from Hiscox, MPS, RCN)

### Recommended Phased Approach

| Phase | Target                                          | CQC Status                                | Focus                               |
|-------|-------------------------------------------------|-------------------------------------------|-------------------------------------|
| 1     | Private domiciliary care, personal care workers | No CQC (introductory agency model)        | Prove coordination protocol works   |
| 2     | Add registered nurses, clinical governance      | CQC registered for "treatment of disease" | Build FHIR integration              |
| 3     | NHS ICS supplementary coordination              | Full DCB0129/DCB0160/DSPT compliance      | Cross-organisational community care |

### Genuine Blockers

1. CQC registration: Any ongoing control over care delivery requires it. Introductory exemption is narrow
2. No NMC verification API: Manual processes add friction
3. Uber v Aslam precedent: Price-setting + rating-based allocation = workers, not self-employed
4. NHS integration: DCB0129, DCB0160, DSPT, FHIR, NHS Spine — each a multi-month effort
5. Professional culture: NHS community nursing is hierarchical and relationship-driven

---

## Part 4: Generalisation Architecture

### Design Principle: Domain Profiles

Rather than forking the codebase per use case, parameterise it. Each use case is a "domain profile" loaded at startup
via DOMAIN env var. One codebase, many use cases.

### A. Domain Profile Schema

```javascript
// src/domain-profiles/schema.js — each profile defines:
{
    id: 'ridesharing',                    // Domain identifier
        states
:
    { ...
    }
,                       // State machine states + valid transitions
    discoveryMethod: 'geohash',           // 'geohash' | 'skillTags' | 'availability'
        pricingModel
:
    'distance_time_surge',  // 'distance/time' | 'hourly' | 'milestone' | 'flatRate'
        stakingModel
:
    { ...
    }
,                // Stake calculation rules per party
    completionProofTypes: ['gps_trace'],  // 'gps_trace' | 'photo' | 'signature' | 'clinical_sign_off'
        disputeEvidenceTypes
:
    [...],          // What counts as evidence
        ratingCriteria
:
    [...],                // Domain-specific rating tags + weights
        verificationKinds
:
    { ...
    }
,           // Maps to kinds 30595-30599
    dataRetention: { ...
    }
,               // Per-field retention policies
    encryptionRequired: false,            // Mandatory for healthcare
        regulatoryBodies
:
    { ...
    }
,            // CQC, Gas Safe, SIA, etc.
    features: { ...
    }
,                    // Feature flags (navigation, tips, safety alerts, etc.)
    eventKinds: { ...
    }                   // Maps domain operations to Nostr kinds
}
```

### B. Refactoring Strategy

What changes:

| File                    | Current                                     | Change                                                                 | Impact                   |
|-------------------------|---------------------------------------------|------------------------------------------------------------------------|--------------------------|
| src/ride-manager.js     | Hardcoded RideStatus, ride-specific methods | → src/task-manager.js with domain-parameterised states                 | ~50% of methods renamed  |
| server.js (~2000 lines) | All routes inline                           | Extract domain-specific routes to src/routes/{domain}.js               | -400 LOC, cleaner core   |
| Frontend (public/)      | Separate rider/driver apps                  | Domain-aware unified app OR domain-specific apps in public/components/ | Depends on UI divergence |

What stays unchanged (already generic):

| File                         | Why It's Already Generic                                              |
|------------------------------|-----------------------------------------------------------------------|
| payment-providers/factory.js | Domain-agnostic — works identically for all use cases                 |
| payment-providers/base.js    | Interface (lockStake, releaseStake, forfeitStake) is universal        |
| src/nostr/reputation.js      | Rating tags are already arbitrary — domain profile defines which ones |
| middleware/nip98-auth.js     | Cryptographic auth is domain-independent                              |
| middleware/rate-limit.js     | Rate limiting is domain-independent                                   |
| navigation/factory.js        | Factory pattern already supports multiple providers                   |

### C. Event Kind Strategy (Hybrid)

Shared core kinds + domain extension ranges:

```
SHARED CORE (30500-30529)               — All domains use these
├── 30500 Service Request (+ domain tag)
├── 30501 Service Acceptance
├── 30510 Streaming Payment
├── 30511 Service Completion
├── 30512 Status Update
├── 30513 Tip
├── 30520/21 Stake Lock/Release/Cancel
├── 30522/24 Dispute/Resolution
└── 30530 Reputation Rating

RIDESHARING (30540-30559)               — Vehicle tracking, navigation, safety
DELIVERY (30560-30579)                  — Photo proof, signatures, temperature
HEALTHCARE (30580-30599)                — Clinical sign-off, consent, safeguarding
TRADES (30600-30619)                    — Quotes, guarantees, certifications
```

Each domain request event carries a ['domain', 'ridesharing'] tag for relay filtering.

### D. Database Schema

Transform from in-memory rides to a multi-domain tasks table:

```sql
CREATE TABLE tasks
(
    id               VARCHAR(50) PRIMARY KEY,
    domain_id        VARCHAR(50), -- Which domain profile
    requester_pubkey VARCHAR(64),
    provider_pubkey  VARCHAR(64),
    status           VARCHAR(50), -- From domain.states
    initial_location JSONB,       -- {lat, lon} or {address} or domain-specific
    requirements     JSONB,       -- Domain-specific (dropoff, cuisine, specialty, etc.)
    estimated_cost   DECIMAL,
    completion_proof JSONB,       -- {type, data, timestamp}
    created_at       TIMESTAMP,
    completed_at     TIMESTAMP
);

CREATE TABLE domain_compliance
(
    id              SERIAL PRIMARY KEY,
    domain_id       VARCHAR(50),
    provider_pubkey VARCHAR(64),
    check_type      VARCHAR(100), -- 'nmc_registration', 'gas_safe', 'sia_licence'
    check_status    VARCHAR(50),
    expiry_date     TIMESTAMP,
    provider_data   JSONB
);
```

### E. New Protocol Primitives Needed

Gaps identified across all use cases:

| Primitive                         | Needed By                             | Description                                                       |
|-----------------------------------|---------------------------------------|-------------------------------------------------------------------|
| Quote Negotiation (~kind 30601)   | Locksmith, trades, mechanic, surveyor | Provider issues quote after assessment; customer accepts/declines |
| Inventory/Manifest (~kind 30602)  | Man with van, delivery                | Itemised manifest with condition tracking and dispute evidence     |
| Multi-Attempt Loop (~kind 30603)  | Court serving, roadside assistance    | Structured retry loop with attempt records and escalation          |
| Three-Party Coordination (~kind 30604) | Food delivery, marketplace       | Restaurant → courier → customer coordination with split payments   |
| Heartbeat Protocol (~kind 30605)  | Security guard, companion care        | Session-based check-ins with auto-escalation on missed heartbeat   |
| Guarantee Period (~kind 30606)    | Emergency trades, mechanic            | Warranty tracking as long-lived replaceable event                  |

> **Detailed gap analysis** with Mermaid diagrams showing where each gap appears in the state machine: [USE-CASE-STATE-MACHINES.md](USE-CASE-STATE-MACHINES.md#protocol-gaps-identified).

### F. Implementation Effort

- Phase 1 (Week 1): Domain profile system + task-manager refactor — ~500 LOC new, ~200 LOC refactored
- Phase 2 (Week 2): Route decomposition + domain endpoint — ~300 LOC extracted from server.js
- Phase 3 (Week 3): Frontend parameterisation — ~800 LOC → ~500 LOC generic + domain overrides
- Phase 4 (per new domain): Profile + routes + domain features — ~500 LOC per domain

---

## Part 5: Consolidated Rankings

### Top 10 by Overall Score (Protocol Fit x Market x Competitive Gap / Regulatory Complexity)

| Rank | Use Case                | Protocol Fit | Market (UK)    | Regulatory | Competitive Gap | Protocol Gaps Surfaced | State Machine | Priority    |
|------|-------------------------|--------------|----------------|------------|-----------------|------------------------|---------------|-------------|
| 1    | Locksmith Dispatch      | 10/10        | £700m          | Very Low   | Very Wide       | Quote negotiation | [DonkeyKnock](USE-CASE-STATE-MACHINES.md#2-locksmith-donkeyknock) | Immediate   |
| 2    | Man with a Van          | 9/10         | £1.5bn         | Low        | Wide            | Inventory/manifest, requote loop | [DonkeyHaul](USE-CASE-STATE-MACHINES.md#4-man-with-van-donkeyhaul) | Immediate   |
| 3    | Parcel Delivery         | 9/10         | Very Large     | Low        | Moderate        | Chain of custody | [DonkeyPack](USE-CASE-STATE-MACHINES.md#3-parcel-delivery-donkeypack) | Immediate   |
| 4    | Mobile Car Wash         | 9/10         | £1.2bn         | Very Low   | Wide            | None (simple) | [DonkeyShine](USE-CASE-STATE-MACHINES.md#5-mobile-car-wash-donkeyshine) | Immediate   |
| 5    | Court Process Serving   | 9/10         | £100-200m      | Low        | Very Wide       | Multi-attempt loop | [DonkeyServe](USE-CASE-STATE-MACHINES.md#6-court-process-serving-donkeyserve) | Immediate   |
| 6    | Roadside Assistance     | 9/10         | £2bn+          | Low-Med    | Moderate        | Diagnostic fork | [DonkeyRescue](USE-CASE-STATE-MACHINES.md#7-roadside-assistance-donkeyrescue) | Near-term   |
| 7    | Emergency Trades        | 8/10         | £4-6bn         | High       | Moderate        | Milestone escrow, guarantee period | [DonkeyFix](USE-CASE-STATE-MACHINES.md#9-emergency-trades-donkeyfix) | Near-term   |
| 8    | Food Delivery           | 8/10         | Very Large     | Medium     | Moderate        | Three-party coordination | [DonkeyEats](USE-CASE-STATE-MACHINES.md#8-food-delivery-donkeyeats) | Near-term   |
| 9    | Volunteer Coordination  | 8/10         | Non-commercial | Medium     | Very Wide       | Zero-value sessions | — | Near-term   |
| 10   | Security Guard Dispatch | 8/10         | £500m-1bn      | High       | Moderate        | Heartbeat protocol | [DonkeyGuard](USE-CASE-STATE-MACHINES.md#10-security-guard-dispatch-donkeyguard) | Medium-term |

### Strategic Sequencing

Deploy first (minimal protocol changes, low regulation, trust is the product):

1. Locksmith — trust deficit IS the problem, protocol IS the solution
2. Man with a van — almost identical to ridesharing
3. Mobile car wash — simple state machine, large market

Deploy second (needs quote/deliverable primitives):

4. Emergency trades — high value, high consumer pain
5. Roadside assistance — high urgency
6. Parcel delivery — 1:1 protocol mapping

Deploy third (needs three-party coordination or regulatory work):

7. Food delivery — three-party model, food safety law
8. Security — SIA licensing integration
9. Pet services — animal welfare compliance

Long-term / moonshots:

10. Healthcare — highest value but heaviest regulatory burden (see phased approach in Part 3)
11. P2P energy — transformative if Ofgem barriers lift
12. Blood/specimen transport — chain of custody on Nostr could become industry standard

---

## Part 6: Capability Matrix

This matrix maps which protocol capabilities each domain requires. Use it to prioritise spec work — capabilities needed by many domains should be implemented first.

**Legend**: Yes = required, Opt = optional/beneficial, No = not applicable

| # | Domain | Location | Streaming Pay | Flat Rate | Hourly | Milestone | Photo Proof | Signature | Duration | Recurring | Virtual | Navigation | Quote | Three-Party | Heartbeat | Guarantee |
|---|--------|----------|---------------|-----------|--------|-----------|-------------|-----------|----------|-----------|---------|------------|-------|-------------|-----------|-----------|
| — | Ridesharing (base protocol) | Yes | Yes | No | No | No | No | No | Yes | No | No | Yes | No | No | No | No |
| 1 | Locksmith Dispatch | Yes | No | Yes | No | Yes | Yes | No | No | No | No | No | Yes | No | No | Yes |
| 2 | Man with a Van | Yes | No | No | No | Yes | Yes | Yes | Yes | No | No | Yes | Yes | No | No | No |
| 3 | Mobile Car Wash | Yes | No | Yes | No | No | Yes | No | No | Opt | No | Yes | No | No | No | No |
| 4 | Parcel Delivery | Yes | No | Yes | No | No | Yes | Yes | No | No | No | Yes | No | No | No | No |
| 5 | Court Process Serving | Yes | No | Yes | No | No | Yes | No | No | No | No | Yes | No | No | No | No |
| 6 | Notary Public | Yes | No | Yes | No | No | Yes | Yes | No | No | No | Yes | No | No | No | No |
| 7 | Roadside Assistance | Yes | Yes | No | No | No | Yes | No | Yes | No | No | Yes | Yes | No | No | No |
| 8 | Emergency Plumber/Electrician | Yes | No | No | No | Yes | Yes | No | Yes | No | No | Yes | Yes | No | No | Yes |
| 9 | Food Delivery | Yes | No | Yes | No | No | Yes | No | No | No | No | Yes | No | Yes | No | No |
| 10 | Security Guard Dispatch | Yes | Yes | No | Yes | No | Yes | No | Yes | Opt | No | No | No | No | Yes | No |
| 11 | Personal Trainer | Yes | No | No | Yes | No | No | No | Yes | Yes | Opt | No | No | No | No | No |
| 12 | Environmental Sampling | Yes | No | Yes | No | No | Yes | Yes | No | Opt | No | Yes | No | No | No | No |
| 13 | Blood/Specimen Transport | Yes | No | Yes | No | No | Yes | Yes | Yes | No | No | Yes | No | No | No | No |
| 14 | Volunteer Coordination | Yes | No | No | No | No | Opt | No | Yes | Yes | Opt | No | No | No | No | No |
| 15 | Pet Services | Yes | No | No | Yes | No | Yes | No | Yes | Yes | No | Yes | No | No | No | No |
| 16 | Dog Grooming | Yes | No | No | No | No | Yes | No | Yes | Yes | No | No | No | No | No | No |
| 17 | Tradesperson Marketplace | Yes | No | No | No | Yes | Yes | No | Yes | No | No | No | Yes | No | No | Yes |
| 18 | Mobile Hairdresser | Yes | No | No | Yes | No | Opt | No | Yes | Yes | No | No | No | No | No | No |
| 19 | Tutoring / Skills Coaching | Opt | No | No | Yes | No | No | No | Yes | Yes | Yes | No | No | No | No | No |
| 20 | Childminder / Babysitter | Yes | No | No | Yes | No | No | No | Yes | Yes | No | No | No | No | No | No |
| 21 | Farm Labour | Yes | No | No | Yes | No | Opt | No | Yes | Yes | No | No | No | No | No | No |
| 22 | P2P Community Energy | Opt | Yes | No | No | No | No | No | Yes | Yes | No | No | No | No | No | No |
| 23 | Equipment / Tool Rental | Yes | No | Yes | No | No | Yes | Yes | Yes | Opt | No | No | No | No | No | No |
| 24 | Mobile Mechanic | Yes | No | No | No | Yes | Yes | No | Yes | No | No | Yes | Yes | No | No | Yes |
| 25 | Window Cleaning | Yes | No | Yes | No | No | Yes | No | No | Yes | No | No | No | No | No | No |
| 26 | Pest Control | Yes | No | No | No | Yes | Yes | No | No | Opt | No | Yes | Yes | No | No | Yes |
| 27 | Tour Guide | Yes | No | No | Yes | No | Opt | No | Yes | No | Opt | No | No | No | No | No |
| 28 | Ski / Surf Instructor | Yes | No | No | Yes | No | No | No | Yes | Opt | No | No | No | No | No | No |
| 29 | Photography / Videography | Yes | No | No | No | Yes | Yes | No | Yes | No | No | No | No | No | No | No |
| 30 | Building Surveyor | Yes | No | Yes | No | No | No | No | No | No | No | Yes | No | No | No | No |
| 31 | Elderly Companion Care | Yes | No | No | Yes | No | No | No | Yes | Yes | No | No | No | No | Yes | No |
| 32 | Clinical Healthcare | Yes | No | No | Yes | No | No | Yes | Yes | Yes | No | Yes | No | No | No | No |
| 33 | Mystery Shopping | Yes | No | Yes | No | Yes | Yes | No | No | Opt | No | No | No | No | No | No |

### Capability Demand Summary

Counts include the base ridesharing protocol plus all 33 numbered use cases (34 domains total).

| Capability | Domains Requiring (Yes) | Domains Optional (Opt) | Total Demand |
|------------|------------------------|----------------------|--------------|
| Location-based discovery | 32 | 2 | 34 |
| Duration tracking | 23 | 0 | 23 |
| Photo proof | 21 | 4 | 25 |
| Navigation | 16 | 0 | 16 |
| Recurring scheduling | 12 | 7 | 19 |
| Flat rate pricing | 12 | 0 | 12 |
| Hourly pricing | 11 | 0 | 11 |
| Milestone payments | 8 | 0 | 8 |
| Quote negotiation | 7 | 0 | 7 |
| Signature proof | 7 | 0 | 7 |
| Guarantee period | 5 | 0 | 5 |
| Streaming payments | 4 | 0 | 4 |
| Virtual support | 1 | 3 | 4 |
| Heartbeat protocol | 2 | 0 | 2 |
| Three-party coordination | 1 | 0 | 1 |

---

## Part 7: Gap Analysis

This section identifies every capability that appears in the capability matrix but is **not currently supported** by
any active specification. These gaps represent the requirements for future spec work.

### Currently Supported (in active specs)

The following capabilities are fully specified and implemented:

| Capability | Spec | Kind(s) | Status |
|------------|------|---------|--------|
| Location-based discovery | NIP-XX-discovery | 30540, 30565, 20500 | Active |
| Streaming payments | NIP-XX-payments | 30510 | Active |
| Flat rate pricing | NIP-XX-core | 30500 (amount tag) | Active |
| Photo proof | NIP-XX-delivery | 30620-30639 | Draft |
| Signature proof | NIP-XX-delivery | 30620-30639 | Draft |
| Navigation | NIP-XX-navigation | 30583-30587 | Active |
| Milestone payments | NIP-XX-stakes | 30537 | Active |
| Quote negotiation | NIP-XX-locksmith | 30600-30619 | Draft |
| Heartbeat protocol | NIP-XX-safety | 30561-30562 | Active |

### Gaps — Not Yet Specified

The following capabilities are needed by multiple domains but have **no active spec coverage**. These are prioritised
by demand (number of domains requiring them).

#### Gap 1: Duration / Time-Block Tracking — Demand: 23 domains

**What it is**: The ability to track service duration and use it for pricing, compliance, and lifecycle management.
Many services are time-based (hourly rate) rather than task-completion-based. The protocol needs a standard way to
record session start/end times, calculate billable duration, and trigger time-based payments.

**Why it matters**: 23 of 34 domains need duration tracking — it is the second most demanded capability after location.
Without it, hourly-rate services (personal training, security guards, tutoring, companion care) cannot be properly
priced or audited.

**Current state**: The v1 archive spec included `duration` tags on service requests and `shift_duration` tags on
driver management events. These were not carried forward into the modular specs.

**Spec work needed**: Add `duration`, `expected_duration`, and `actual_duration` tags to NIP-XX-core. Define
time-based pricing semantics alongside the existing amount/currency tags. This is planned for Phase 3-4 of the spec
universalisation work.

#### Gap 2: Recurring / Subscription Scheduling — Demand: 19 domains (12 required + 7 optional)

**What it is**: The ability to schedule repeating tasks (e.g. weekly dog walks, monthly window cleaning, bi-weekly
personal training). Includes recurrence rules (frequency, day-of-week, time), series management (cancel one vs cancel
all), and favourite provider binding.

**Why it matters**: Most real-world service relationships are recurring. A protocol that only handles one-off dispatch
misses the dominant usage pattern for 19 of 34 domains. Recurring scheduling also enables subscription-style pricing
and provider income predictability.

**Current state**: The v1 archive spec included a `recurring` tag with values `none|daily|weekly|monthly` on service
request events. This was not carried forward into the modular specs. The favourite provider event (kind 30577) provides
a building block but does not handle scheduling.

**Spec work needed**: Define a recurring task template event type with recurrence rules (RFC 5545 RRULE subset),
series identifiers, and exception handling. This is planned for Phase 3-4 of the spec universalisation work.

#### Gap 3: Hourly Rate Pricing — Demand: 11 domains

**What it is**: A pricing model where the provider charges per hour (or per fraction). Distinct from streaming payments
(which are per-second micro-payments) — hourly pricing involves agreed rates with duration-based invoicing at session
end.

**Why it matters**: 11 domains use hourly pricing as their primary model: security guards, personal trainers, tutors,
hairdressers, companion care, pet services, childminders, farm labour, tour guides, ski/surf instructors, and clinical
healthcare.

**Current state**: The `amount` and `currency` tags on service requests can encode an hourly rate, but there is no
standard tag for `pricing_model` or `rate_unit` to distinguish hourly from flat or distance-based pricing.

**Spec work needed**: Add `pricing_model` and `rate_unit` tags to NIP-XX-core. Define hourly rate semantics including
minimum booking duration, overtime rates, and rounding rules.

#### Gap 4: Virtual / Remote Service Support — Demand: 4 domains (1 required + 3 optional)

**What it is**: Support for services delivered remotely (video tutoring, virtual personal training, online mystery
shopping reports). Discovery shifts from geohash to skill/availability tags. No navigation needed. Session management
replaces location tracking.

**Why it matters**: Post-pandemic, many services have hybrid delivery (in-person or virtual). Tutoring is the primary
virtual domain, but personal training, tour guides (virtual museum tours), and volunteer coordination all have virtual
components.

**Current state**: The protocol assumes location-based discovery (geohash) for all services. There is no mechanism for
virtual-only or hybrid service discovery. The v1 archive had no virtual support either.

**Spec work needed**: Extend NIP-XX-discovery to support non-geographic discovery (skill tags, availability windows,
language tags). Add virtual session management (video link exchange, screen sharing proof, session recording consent).
This is planned for Phase 3-4 of the spec universalisation work.

#### Gap 5: Guarantee / Warranty Period — Demand: 5 domains

**What it is**: A post-completion warranty period during which the provider guarantees their work. If the work fails
within the guarantee period, a linked follow-up task is created referencing the original, with the provider obligated
to remediate at no additional cost.

**Why it matters**: Essential for trades (plumbing, electrical, pest control, mobile mechanic) and security (guard
dispatch post-incident review). Without guarantee tracking, there is no protocol-level mechanism to hold providers
accountable for the durability of their work.

**Current state**: Modelled informally as linked tasks with a `guarantee` relationship type in the state machine
documents. No formal spec exists. The `linked_task` tag provides a building block.

**Spec work needed**: Define a guarantee period event type with duration, terms, and activation conditions. Specify
how guarantee claims create linked tasks with preferential matching to the original provider.

#### Gap 6: Three-Party Coordination — Demand: 1 domain

**What it is**: Coordination involving three distinct roles (e.g. restaurant + courier + customer in food delivery).
The current protocol assumes a two-party model (requester + provider). Three-party coordination requires a `vendor`
role, split payments, and late-binding provider matching.

**Why it matters**: Food delivery is a massive market and the only domain currently requiring three-party coordination.
However, marketplace models (where a platform intermediates between vendor and service provider) could emerge in other
domains.

**Current state**: Identified as a protocol gap in the state machine analysis. No spec work has begun.

**Spec work needed**: Define a vendor role alongside requester and provider. Specify split payment semantics. Define
late-binding provider matching (courier matched when food is ready, not when order is placed).

### Gap Priority Matrix

| Priority | Gap | Domains Affected | Spec Effort | Phase |
|----------|-----|-----------------|-------------|-------|
| 1 | Duration tracking | 23 | Medium | Phase 3 |
| 2 | Recurring scheduling | 19 | High | Phase 3-4 |
| 3 | Hourly rate pricing | 11 | Low | Phase 3 |
| 4 | Guarantee period | 5 | Low | Phase 4 |
| 5 | Virtual service support | 4 | Medium | Phase 4 |
| 6 | Three-party coordination | 1 | High | Phase 5+ |

> **Note**: Gaps 1-4 are planned for Phase 3-4 of the spec universalisation work. See the task list in the
> repository for tracking. Gaps 5-6 are longer-term and depend on domain extension specs being written first.

---

## Key Insight

The protocol's core primitive — cryptographic commitment between strangers with slashable stakes — solves trust problems
that exist in every service marketplace. The industries where trust is most broken (locksmiths, emergency trades,
removals) are where the protocol's value is most immediately obvious. Healthcare is the highest-value long-term
opportunity but requires the most careful regulatory navigation.

The generalisation architecture (domain profiles) means adding a new use case requires ~100 lines of configuration
rather than a fork. The payment providers, reputation system, authentication middleware, and dispute resolution
all work unchanged across every domain.

The capability matrix reveals that **location-based discovery** (32/34 domains) and **duration tracking** (23/34
domains) are the two most universally needed capabilities. Location discovery is already well-specified; duration
tracking is the highest-priority gap. **Recurring scheduling** (19/34 domains) is the second-largest gap and the
most complex to specify correctly.

---

## See Also

- **[USE-CASE-STATE-MACHINES.md](USE-CASE-STATE-MACHINES.md)** — Detailed state machines for top 10 use cases (Mermaid diagrams, payment triggers, protocol gaps)
- **[PAYMENT-PROVIDERS.md](PAYMENT-PROVIDERS.md)** — Payment provider integration (currency-neutral, trust model taxonomy)
- **[GDPR-COMPLIANCE.md](GDPR-COMPLIANCE.md)** — GDPR compliance architecture (crypto-shredding, three-layer data model)
- **[../ARCHITECTURE.md](../ARCHITECTURE.md)** — Three-layer federated architecture
- **[../specs/QUICK-REFERENCE.md](../specs/QUICK-REFERENCE.md)** — Complete event kind reference table
