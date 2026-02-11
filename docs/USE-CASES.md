# DonkeyRide Protocol: Use Case Analysis & Generalisation Strategy

## Context

The DonkeyRide protocol is built on primitives that are fundamentally not about ridesharing — they're about
trust-minimised coordination between strangers with asymmetric information, using cryptographic proof instead of
institutional authority. This document analyses what's universal, maps 69 concrete use cases with UK regulatory
considerations, deep-dives into healthcare, and designs a concrete generalisation architecture.

---

## Part 1: Core Protocol Primitives (Domain-Agnostic)

The protocol decomposes into 7 universal primitives:

| # | Primitive                      | What It Solves                             | Implementation                                                 |
|---|--------------------------------|--------------------------------------------|----------------------------------------------------------------|
| 1 | Request/Response Matching      | Finding a counterparty                     | Kind 30500/30501 + geohash or tag-based discovery              |
| 2 | Commitment Stakes (Escrow)     | Preventing ghosting by either party        | Hodl invoices, custodial locks, or federated custody           |
| 3 | Lifecycle State Machine        | Tracking task progress                     | requested → matched → en_route → arrived → active → completed  |
| 4 | Portable Reputation            | Trust without institutions                 | Kind 30520 signed ratings, web-of-trust weighted, time-decayed |
| 5 | Automated Dispute Resolution   | Scaling conflict resolution                | Kind 30543/30545 with confidence scoring                       |
| 6 | Federated Operators with Bonds | Preventing monopoly & operator fraud       | Kind 30511 slashable bonds                                     |
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
real-time WebSocket tracking, streaming payments per minute. The multi-leg trip event (ridesharing domain extension,
kind 30600-30619) handles multi-stop moves.

- State machine: removal_requested → mover_matched → en_route_to_pickup → arrived → loading → in_transit →
  arrived_at_delivery → unloading → completed
- AnyVan charges 15-25% commission; protocol's 1-5% operator fee is transformative
- Market: ~£1.5bn. AnyVan established but unpopular with providers
- Regulatory: Low (standard driving licence under 3.5 tonnes)

#### 3. Mobile Car Wash / Valeting — Protocol Fit: 9/10

Minimal protocol modification. Customer may not be present — photo evidence at completion triggers automatic stake
release. Corporate fleet contracts can be managed via domain extension events.

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

Introduces a three-party model (restaurant → courier → customer). Tipping is supported via TROTT-04 payments. Surge pricing
already implemented.

- Temperature compliance: hot food >63°C, cold food <8°C (Food Safety Act 1990)
- Natasha's Law (2021) — prepacked items must list all ingredients
- Allergen information must be preserved through delivery chain (EU FIC Regulation retained in UK law)
- Market: Very large
- Regulatory: Medium (FSA, food hygiene, allergen law)

#### 10. Security Guard Dispatch — Protocol Fit: 8/10

Ad-hoc security dispatch. Safety check-in events (TROTT-05, kinds 30541-30542) serve double duty — confirming guard safety AND
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
coordination (TROTT-06, kinds 30550-30554).

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

The favourite provider mechanism (via domain extension events) maps to "favourite stylist". Additional charges are handled
via TROTT-04 payment events.

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
tags alongside geohash. The favourite provider mechanism (via domain extension events) maps to "favourite guide" for repeat tourists.
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
,           // Maps to TROTT-03 credential attestation (kind 30522)
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
TROTT CORE (30500-30563)                — All domains use these (7 specs)
├── TROTT-01 (30500-30507) Task lifecycle (request, offer, accept, complete, confirm, cancel, dispute)
├── TROTT-02 (20500, 30510-30512) Discovery (availability, profiles, bonds, trusted lists)
├── TROTT-03 (30520-30522) Reputation (ratings, queries, credentials)
├── TROTT-04 (30530-30536) Payments (quotes, terms, stakes, receipts, streaming)
├── TROTT-05 (30540-30546) Safety & Disputes (emergency, check-ins, disputes, abuse)
├── TROTT-06 (30550-30554) Coordination (operator claims, PII, delegation, compliance)
└── TROTT-07 (20501, 30560-30563) Navigation (routes, ETA, deviation, resources)

DOMAIN EXTENSIONS (30600-30779)         — Domain-specific kinds
├── RIDESHARING (30600-30619)           — Vehicle tracking, trip events
├── LOCKSMITH (30620-30639)             — Quote negotiation, access methods
├── DELIVERY (30640-30659)              — Photo proof, signatures, chain of custody
├── TOWING (30660-30679)                — Vehicle assessment, storage
├── EMERGENCY TRADES (30680-30699)      — Quotes, guarantees, certifications
├── PET SERVICES (30700-30719)          — Activity tracking, pet profiles
├── SECURITY (30720-30739)              — Shift management, patrol logs
├── CLEANING (30740-30759)              — Checklists, recurring schedules
└── MOVING (30760-30779)                — Inventory, crew coordination
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

## Part 5b: Extended Use Case Coverage (Protocol Validation)

The 33 use cases above were the initial catalogue. This section documents an additional ~36 natural-fit use cases
identified through systematic gap analysis. The key finding: **~35 of the 36 work with zero protocol changes** — they
are new tag values on existing domain profiles and coordination patterns. Only ~5 expose genuine new capabilities,
requiring minimal spec additions (2 new optional tags, 1 new enum value).

This validates the protocol's domain-agnostic design: the core primitives (state machine, discovery, reputation, stakes,
payments, safety) genuinely generalise across a wide range of physical service coordination.

### Additional Dispatch Pattern Use Cases

The following 14 use cases follow the existing emergency-trades dispatch pattern (provider travels to customer, performs
on-site work, confirms completion). Each differs only in `trade_type` tag value and regulatory requirements. No new
protocol features are needed.

| # | Use Case | Trade Type Tag | Regulatory Notes (UK) |
|---|----------|---------------|----------------------|
| 34 | Appliance Repair | `appliance_repair` | Gas Safe if gas appliances; otherwise very low |
| 35 | Boiler Servicing | `boiler_service` | Gas Safe Register mandatory (criminal offence) |
| 36 | Chimney Sweep | `chimney_sweep` | Very low. HETAS/Guild of Master Chimney Sweeps voluntary |
| 37 | Gutter Cleaning | `gutter_cleaning` | Working at Height Regulations 2005 for commercial |
| 38 | Pressure Washing | `pressure_washing` | Environmental Protection Act (water runoff) |
| 39 | Garden Maintenance | `garden_maintenance` | Very low. Waste carrier licence for green waste removal |
| 40 | Tree Surgery | `tree_surgery` | Medium. NPTC certification expected. TPO/Conservation Area checks |
| 41 | Pool / Hot Tub Maintenance | `pool_maintenance` | Very low. HSE guidance on chemical handling |
| 42 | Aerial / Satellite Installation | `aerial_installation` | Part P if electrical work involved |
| 43 | Furniture Assembly | `furniture_assembly` | Very low |
| 44 | Piano Tuning | `piano_tuning` | Very low. Aural Skills Diploma voluntary |
| 45 | Carpet / Upholstery Cleaning | `carpet_cleaning` | Very low. NCCA membership voluntary |
| 46 | Oven Cleaning | `oven_cleaning` | Very low |
| 47 | Smart Home Installation | `smart_home` | Part P for electrical circuits; otherwise very low |

All 14 share the dispatch state machine: `requested → provider_matched → en_route → arrived → assessment → work_active → completed`. Photo proof of completion is standard. Quote negotiation (TROTT-04, kind 30530) is used for variable-price work.

### Additional Relay Delivery Pattern Use Cases

The following 5 use cases follow the existing delivery pattern (collect at A, deliver to B, proof of delivery). Each
differs only in `package_type` tag value and compliance requirements.

| # | Use Case | Package Type Tag | Notes |
|---|----------|-----------------|-------|
| 48 | Grocery Delivery | `groceries` | Temperature compliance (chilled/frozen). May involve `beneficiary_pubkey` (ordering for someone else) |
| 49 | Pharmacy Delivery | `pharmacy` | GPhC regulations. Controlled drugs require chain of custody. Often uses `beneficiary_pubkey` (patient ≠ orderer) |
| 50 | Document Courier | `documents` | Signature proof on collection and delivery. Legal/financial documents may need chain of custody |
| 51 | Flower Delivery | `flowers` | Time-sensitive (perishable). Often uses `beneficiary_pubkey` (recipient ≠ orderer) |
| 52 | Medical Specimen Transport | `medical_specimen` | MHRA regulations. UN3373 packaging. Temperature-controlled. Strict chain of custody |

Grocery, pharmacy, and flower delivery are the primary drivers for the `beneficiary_pubkey` tag (see TROTT-01) — the
person ordering is often not the person receiving.

### Additional Scheduled Pattern Use Cases

The following 6 use cases follow the existing scheduled pattern (booked appointment, provider visits, session-based
service). Each differs only in `service_type` tag value.

| # | Use Case | Service Type Tag | Notes |
|---|----------|-----------------|-------|
| 53 | Personal Training (at-home) | `personal_training` | Already listed as #11 — included here for pattern completeness |
| 54 | Mobile Massage Therapy | `massage` | Voluntary regulation (CNHC). DBS if working with vulnerable adults |
| 55 | Home Physiotherapy | `physiotherapy` | HCPC registration mandatory. Special category health data under UK GDPR |
| 56 | Music Lessons (in-home) | `music_lessons` | DBS if under-18s. Follows tutoring pattern |
| 57 | Driving Lessons | `driving_lessons` | ADI (Approved Driving Instructor) badge mandatory. DVSA regulated |
| 58 | Yoga / Pilates Instruction | `yoga_pilates` | Very low regulation. Insurance recommended |

All use hourly rate pricing, recurring scheduling (weekly lessons are the norm), and commitment stakes for no-show
protection.

### Additional Trip Pattern Use Cases

| # | Use Case | Notes |
|---|----------|-------|
| 59 | Non-Emergency Medical Transport | Standard ridesharing trip pattern. CQC registration if patient transport services. May use `beneficiary_pubkey` (hospital/GP booking for patient) |
| 60 | School Run Service | Standard ridesharing trip pattern. Enhanced DBS mandatory. Uses `beneficiary_pubkey` (parent books, child is passenger). Recurring scheduling (daily term-time) |

Both use the existing ridesharing state machine with different regulatory requirements and strong use of `beneficiary_pubkey`.

### Additional Shift Pattern Use Cases

| # | Use Case | Assignment Type Tag | Notes |
|---|----------|-------------------|-------|
| 61 | Event Staffing | `event_staffing` | Bartenders, waiters, catering crew. Identical to security shift pattern. Food hygiene certification for food handlers |
| 62 | Temporary Office / Reception Cover | `temp_cover` | Identical to security shift pattern. Duration-based pricing (daily rate). DBS for some roles |

Both follow the security guard dispatch shift pattern with different `assignment_type` values.

### Round-Trip Relay Use Cases (NEW — linked tasks)

The following 3 use cases expose a genuine new pattern: a **round-trip relay** where the provider collects something,
it undergoes processing, and the provider returns it. This is modelled as two linked delivery tasks (outbound collection
+ return delivery) using the new `round_trip` relationship type on `linked_task` tags (see TROTT-01).

| # | Use Case | Notes |
|---|----------|-------|
| 63 | Laundry / Dry Cleaning Collection & Return | Collect dirty items → process at facility → return clean items. 24-48 hour turnaround |
| 64 | Vehicle Collection for Servicing & Return | Collect vehicle → service at garage → return vehicle. Uses towing domain for collection leg |
| 65 | Equipment Rental (Deliver → Collect Back) | Deliver equipment → rental period → collect equipment. Damage deposit as stake |

The processing phase between collection and return is the provider's own workflow and does not need protocol-level state
tracking. The `round_trip` linked-task relationship connects the outbound and return legs.

### Waste / Clearance Use Cases (dispatch variant)

| # | Use Case | Notes |
|---|----------|-------|
| 66 | Skip Hire / Delivery | Standard dispatch. Deliver skip → collect full skip. Photo proof of placement and collection |
| 67 | Junk Removal | Standard dispatch. Photo proof of clearance. Waste carrier licence (Environment Agency) required |
| 68 | House Clearance | Standard dispatch with inventory. Photo proof before/after. Waste carrier licence required |
| 69 | Scrap Metal Collection | Standard dispatch. Scrap Metal Dealers Act 2013 — dealer must be registered with local authority |

All follow the standard dispatch pattern with photo proof of completion. Skip hire uses the round-trip relay pattern
(deliver → collect) while the others are one-shot dispatch.

### Use Case Coverage Summary

| Pattern | Existing (33) | New (+36) | Total |
|---------|--------------|-----------|-------|
| Dispatch | 8 | 18 | 26 |
| Relay (delivery) | 3 | 5 | 8 |
| Scheduled | 7 | 5 | 12 |
| Trip | 2 | 2 | 4 |
| Shift | 2 | 2 | 4 |
| Crew / multi-provider | 1 | 0 | 1 |
| Round-trip relay (NEW) | 0 | 3 | 3 |
| Other (energy, healthcare, etc.) | 10 | 1 | 11 |
| **Total** | **33** | **36** | **69** |

### What Doesn't Need Changing

Of the 36 new use cases, **~33 require no protocol changes at all** — they are new tag values on existing domain profiles:

- **14 dispatch use cases**: New `trade_type` values on the emergency-trades pattern
- **5 delivery use cases**: New `package_type` values on the delivery pattern
- **5 scheduled use cases**: New `service_type` values on the scheduled pattern
- **2 trip use cases**: Standard ridesharing pattern with different regulatory requirements
- **2 shift use cases**: New `assignment_type` values on the security shift pattern
- **4 waste/clearance use cases**: Standard dispatch with photo proof
- **1 round-trip delivery** (equipment rental): Modelled as two linked delivery tasks

Only **3 use cases** (laundry, vehicle servicing, equipment rental) expose the round-trip relay pattern, and only **6
use cases** (grocery, pharmacy, flower delivery, medical transport, school runs, driving lessons for minors) drive the
`beneficiary_pubkey` tag. Both additions are minimal (1 new enum value, 1 new optional tag).

This validates the protocol's design thesis: domain-agnostic core primitives with domain-specific tag values mean new
use cases are configuration, not code.

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

Counts include the base ridesharing protocol plus all 69 use cases (70 domains total, including the 36 new use cases
from Part 5b).

| Capability | Domains Requiring (Yes) | Domains Optional (Opt) | Total Demand |
|------------|------------------------|----------------------|--------------|
| Location-based discovery | 66 | 4 | 70 |
| Duration tracking | ~30 | 0 | ~30 |
| Photo proof | ~40 | 6 | ~46 |
| Recurring scheduling | ~18 | ~7 | ~25 |
| Flat rate pricing | ~20 | 0 | ~20 |
| Navigation | ~20 | 0 | ~20 |
| Hourly pricing | ~16 | 0 | ~16 |
| Milestone payments | ~10 | 0 | ~10 |
| Quote negotiation | ~20 | 0 | ~20 |
| Signature proof | ~12 | 0 | ~12 |
| Guarantee period | ~8 | 0 | ~8 |
| Beneficiary pubkey (NEW) | ~6 | 0 | ~6 |
| Round-trip relay (NEW) | ~5 | 0 | ~5 |
| Streaming payments | 4 | 0 | 4 |
| Virtual support | 1 | 3 | 4 |
| Heartbeat protocol | 2 | 0 | 2 |
| Three-party coordination | 1 | 0 | 1 |

> **Note**: Approximate counts (~) reflect that some new use cases share capabilities with existing ones. Exact counts
> depend on final domain profile definitions.

---

## Part 7: Gap Analysis

This section identifies every capability that appears in the capability matrix but is **not currently supported** by
any active specification. These gaps represent the requirements for future spec work.

### Currently Supported (in active specs)

The following capabilities are fully specified and implemented:

| Capability | Spec | Kind(s) | Status |
|------------|------|---------|--------|
| Location-based discovery | TROTT-02 | 20500, 30510-30512 | Active |
| Streaming payments | TROTT-04 | 30536 | Active |
| Flat rate pricing | TROTT-01 | 30500 (amount tag) | Active |
| Photo proof | TROTT-delivery | 30640-30659 | Draft |
| Signature proof | TROTT-delivery | 30640-30659 | Draft |
| Navigation | TROTT-07 | 20501, 30560-30563 | Active |
| Milestone payments | TROTT-04 | 30530-30536 | Active |
| Quote negotiation | TROTT-locksmith | 30620-30639 | Draft |
| Heartbeat protocol | TROTT-05 | 30541-30542 | Active |

### Gaps — Not Yet Specified

The following capabilities are needed by multiple domains but have **no active spec coverage**. These are prioritised
by demand (number of domains requiring them). The expanded use case catalogue (Part 5b) reinforced existing gaps and
surfaced two new ones.

#### Gap 1: Duration / Time-Block Tracking — Demand: ~30 domains (reinforced)

**What it is**: The ability to track service duration and use it for pricing, compliance, and lifecycle management.
Many services are time-based (hourly rate) rather than task-completion-based. The protocol needs a standard way to
record session start/end times, calculate billable duration, and trigger time-based payments.

**Why it matters**: ~30 of 70 domains need duration tracking — it is the second most demanded capability after location.
Without it, hourly-rate services (personal training, security guards, tutoring, companion care, massage therapy,
physiotherapy, yoga instruction) cannot be properly priced or audited. The new scheduled-pattern use cases (music
lessons, driving lessons, massage, physiotherapy) further reinforce this demand.

**Current state**: The v1 archive spec included `duration` tags on service requests and `shift_duration` tags on
driver management events. These were not carried forward into the modular specs.

**Spec work needed**: Add `duration`, `expected_duration`, and `actual_duration` tags to TROTT-01. Define
time-based pricing semantics alongside the existing amount/currency tags. This is planned for Phase 3-4 of the spec
universalisation work.

#### Gap 2: Recurring / Subscription Scheduling — Demand: ~25 domains (partially closed)

**What it is**: The ability to schedule repeating tasks (e.g. weekly dog walks, monthly window cleaning, bi-weekly
personal training). Includes recurrence rules (frequency, day-of-week, time), series management (cancel one vs cancel
all), and favourite provider binding.

**Why it matters**: Most real-world service relationships are recurring. A protocol that only handles one-off dispatch
misses the dominant usage pattern for ~25 of 70 domains. Recurring scheduling also enables subscription-style pricing
and provider income predictability. The new use cases (driving lessons, music lessons, yoga instruction, boiler
servicing) further reinforce this demand.

**Current state**: TROTT-01 now defines scheduling tags (`scheduled_start`, `recurrence`, `recurrence_end`) on Task
Request (kind 30500) and a Recurring Series event (kind 30509) for series lifecycle management. This partially closes
the gap — the basic infrastructure exists. Remaining work is around exception handling (skip one instance), provider
preference binding, and subscription-style bulk pricing.

**Spec work needed**: Extend kind 30509 with exception handling (skip/reschedule individual instances), provider
preference locking, and subscription discount semantics. Medium effort remaining.

#### Gap 3: Hourly Rate Pricing — Demand: ~16 domains (reinforced)

**What it is**: A pricing model where the provider charges per hour (or per fraction). Distinct from streaming payments
(which are per-second micro-payments) — hourly pricing involves agreed rates with duration-based invoicing at session
end.

**Why it matters**: ~16 domains use hourly pricing as their primary model: security guards, personal trainers, tutors,
hairdressers, companion care, pet services, childminders, farm labour, tour guides, ski/surf instructors, clinical
healthcare, massage therapists, physiotherapists, yoga instructors, music teachers, and event staff.

**Current state**: The `amount` and `currency` tags on service requests can encode an hourly rate, but there was no
standard tag for `rate_unit` to distinguish hourly from flat or distance-based pricing. **Update**: TROTT-04 now
defines an optional `rate_unit` tag on Quote events (kind 30530) with values `per_hour`, `per_day`, `per_item`,
`per_kg`, `per_km`, `flat`. This partially closes the gap.

**Spec work needed**: Define hourly rate semantics including minimum booking duration, overtime rates, and rounding
rules. Low effort remaining.

#### Gap 4: Beneficiary Pubkey — Demand: ~6 domains (NEW)

**What it is**: An optional `beneficiary_pubkey` tag on Task Request (kind 30500) identifying a third party who is the
actual recipient of the service, distinct from the requester who is paying.

**Why it matters**: ~6 domains have "order on behalf of" scenarios: grocery delivery for elderly parents, pharmacy
delivery to patients, flower delivery to recipients, school runs (parent books, child rides), non-emergency medical
transport (GP/hospital books, patient travels), and driving lessons for teenagers.

**Current state**: **Closed**. TROTT-01 now defines `beneficiary_pubkey` as an optional party tag. TROTT-06 defines
PII handling guidance for beneficiaries.

**Spec work needed**: None — implemented.

#### Gap 5: Round-Trip Relay — Demand: ~5 domains (NEW)

**What it is**: A coordination pattern where the provider collects something, it undergoes processing, and the provider
returns it. Laundry collection & return, vehicle collection for servicing & return, and equipment rental (deliver →
use → collect back) are the primary use cases.

**Why it matters**: Round-trip relays are a natural extension of the delivery pattern but require linking two tasks
(outbound + return) in a way that preserves independent lifecycle management for each leg.

**Current state**: **Closed**. TROTT-01 now defines `round_trip` as a `linked_task` relationship type alongside
`follow_up`, `guarantee`, `escalation`, `recurrence`, and `shared_ride`.

**Spec work needed**: None — implemented.

#### Gap 6: Guarantee / Warranty Period — Demand: ~8 domains (reinforced)

**What it is**: A post-completion warranty period during which the provider guarantees their work. If the work fails
within the guarantee period, a linked follow-up task is created referencing the original, with the provider obligated
to remediate at no additional cost.

**Why it matters**: Essential for trades (plumbing, electrical, pest control, mobile mechanic, boiler servicing,
appliance repair, smart home installation, aerial installation) and security (guard dispatch post-incident review).
Without guarantee tracking, there is no protocol-level mechanism to hold providers accountable for the durability of
their work. The new dispatch use cases add ~3 more domains to this demand.

**Current state**: Modelled informally as linked tasks with a `guarantee` relationship type in the state machine
documents. No formal spec exists. The `linked_task` tag provides a building block.

**Spec work needed**: Define a guarantee period event type with duration, terms, and activation conditions. Specify
how guarantee claims create linked tasks with preferential matching to the original provider.

#### Gap 7: Virtual / Remote Service Support — Demand: ~4 domains (unchanged)

**What it is**: Support for services delivered remotely (video tutoring, virtual personal training, online mystery
shopping reports). Discovery shifts from geohash to skill/availability tags. No navigation needed. Session management
replaces location tracking.

**Why it matters**: Post-pandemic, many services have hybrid delivery (in-person or virtual). Tutoring is the primary
virtual domain, but personal training, tour guides (virtual museum tours), and volunteer coordination all have virtual
components.

**Current state**: The protocol assumes location-based discovery (geohash) for all services. There is no mechanism for
virtual-only or hybrid service discovery. The v1 archive had no virtual support either.

**Spec work needed**: Extend TROTT-02 to support non-geographic discovery (skill tags, availability windows,
language tags). Add virtual session management (video link exchange, screen sharing proof, session recording consent).
This is planned for Phase 3-4 of the spec universalisation work.

#### Gap 8: Three-Party Coordination — Demand: 1 domain (unchanged)

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

| Priority | Gap | Domains Affected | Spec Effort | Status |
|----------|-----|-----------------|-------------|--------|
| 1 | Duration tracking | ~30 | Medium | Reinforced — highest priority |
| 2 | Recurring scheduling | ~25 | Medium (remaining) | Partially closed (kind 30509 exists) |
| 3 | Hourly rate pricing | ~16 | Low (remaining) | Partially closed (`rate_unit` tag added to TROTT-04) |
| 4 | Beneficiary pubkey | ~6 | — | **Closed** (added to TROTT-01, TROTT-06) |
| 5 | Round-trip relay | ~5 | — | **Closed** (added to TROTT-01 linked tasks) |
| 6 | Guarantee period | ~8 | Low | Reinforced |
| 7 | Virtual service support | ~4 | Medium | Unchanged |
| 8 | Three-party coordination | 1 | High | Unchanged |

> **Note**: Gaps 4 and 5 have been closed by spec additions in TROTT-01, TROTT-04, and TROTT-06. Gaps 1-3 and 6 are
> reinforced by the expanded use case catalogue. Gaps 7-8 are longer-term and depend on domain extension specs being
> written first.

---

## Key Insight

The protocol's core primitive — cryptographic commitment between strangers with slashable stakes — solves trust problems
that exist in every service marketplace. The industries where trust is most broken (locksmiths, emergency trades,
removals) are where the protocol's value is most immediately obvious. Healthcare is the highest-value long-term
opportunity but requires the most careful regulatory navigation.

The generalisation architecture (domain profiles) means adding a new use case requires ~100 lines of configuration
rather than a fork. The payment providers, reputation system, authentication middleware, and dispute resolution
all work unchanged across every domain.

The expanded catalogue of **69 use cases** (up from 33) validates this design thesis: **~33 of the 36 new use cases
require zero protocol changes** — they are new tag values on existing coordination patterns. Only 2 new optional tags
(`beneficiary_pubkey` and `rate_unit`) and 1 new enum value (`round_trip`) were needed to cover all identified gaps.

The capability matrix reveals that **location-based discovery** (66/70 domains) and **duration tracking** (~30/70
domains) remain the two most universally needed capabilities. Location discovery is already well-specified; duration
tracking is the highest-priority remaining gap. **Recurring scheduling** (~25/70 domains) has been partially closed
by kind 30509 (Recurring Series) but needs further work on exception handling.

---

## See Also

- **[USE-CASE-STATE-MACHINES.md](USE-CASE-STATE-MACHINES.md)** — Detailed state machines for top 10 use cases (Mermaid diagrams, payment triggers, protocol gaps)
- **[PAYMENT-PROVIDERS.md](PAYMENT-PROVIDERS.md)** — Payment provider integration (currency-neutral, trust model taxonomy)
- **[GDPR-COMPLIANCE.md](GDPR-COMPLIANCE.md)** — GDPR compliance architecture (crypto-shredding, three-layer data model)
- **[../ARCHITECTURE.md](../ARCHITECTURE.md)** — Three-layer federated architecture
- **[../specs/QUICK-REFERENCE.md](../specs/QUICK-REFERENCE.md)** — Complete event kind reference table
