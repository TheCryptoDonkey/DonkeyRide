# DonkeyRide Protocol: Use Case Analysis & Generalisation Strategy

## Context

The DonkeyRide protocol is built on primitives that are fundamentally not about ridesharing — they're about
trust-minimised coordination between strangers with asymmetric information, using cryptographic proof instead of
institutional authority. This document analyses what's universal, maps **649 concrete use cases** across 31 economic
sectors with UK regulatory considerations, deep-dives into healthcare, designs a concrete generalisation architecture,
and provides a formal protocol fit scoring rubric with hard boundary analysis.

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

## Part 5c: Comprehensive Sector Catalogue

Systematic sector-by-sector analysis reveals **580 additional natural-fit use cases** across 31 economic sectors. Of
these 580, **~565 require zero protocol changes** — they map directly to existing coordination patterns with different
tag values. This is the strongest possible validation of the protocol's domain-agnostic design.

Each table below uses the following columns:

- **#** — Use case number (continuing from #69 in Part 5b)
- **Use Case** — Service description
- **Pattern** — Coordination pattern (Dispatch, Relay, Scheduled, Trip, Shift, Crew, Round-trip, Standing-offer, Broadcast, Conditional)
- **New Capabilities?** — "None" if the use case works with existing protocol primitives; otherwise a brief note of what is needed
- **Regulatory Notes** — UK regulatory framework considerations

### A. Construction & Property

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 70 | Scaffolding erection | Dispatch | None | CISRS-carded scaffolders required; CDM Regulations 2015 apply; working at height regs |
| 71 | Skip delivery & collection | Round-trip | None | Waste carrier licence required; skip permits for highway placement from local authority |
| 72 | Crane hire with operator | Shift | Operator credential verification | CPCS card required; appointed person for lift planning; BS 7121 compliance |
| 73 | Site security guard | Shift | None | SIA licence required; BS 7499 guarding standards |
| 74 | Demolition contractor | Scheduled | None | Demolition licence; CDM 2015 principal contractor duties; HSE notification for major works |
| 75 | Concrete pumping | Dispatch | None | CPCS concrete pump operator card; site-specific risk assessment required |
| 76 | Underpinning contractor | Scheduled | None | Structural engineer sign-off required; Building Regulations Part A; party wall consent may apply |
| 77 | Damp proofing specialist | Dispatch | None | PCA (Property Care Association) membership recommended; guarantee-backed work |
| 78 | Asbestos removal | Scheduled | Hazmat credential tags | HSE-licensed contractor required for licensable work; CAR 2012 regulations; air monitoring |
| 79 | Plastering | Dispatch | None | NVQ Level 2 minimum recommended; no specific licence required |
| 80 | Rendering specialist | Dispatch | None | None beyond general construction competence |
| 81 | Tiling (wall & floor) | Dispatch | None | None; TTA (Tile Association) membership optional |
| 82 | Flooring installation | Dispatch | None | None; manufacturer warranty may require accredited installer |
| 83 | Roofing repair | Dispatch | None | Working at height regulations; NFRC membership recommended; competent person scheme for Building Regs |
| 84 | Emergency glazing | Dispatch | None | GGF (Glass and Glazing Federation) membership recommended; FENSA for replacement windows |
| 85 | Fencing installation | Scheduled | None | Party wall/boundary confirmation may be needed; no specific licence |
| 86 | Paving & driveway laying | Scheduled | None | Dropped kerb consent from local authority; block paving on permeable surfaces re SUDS regs |
| 87 | Interior design consultation | Scheduled | None | None; no regulated profession in UK |
| 88 | Curtain & blind fitting | Dispatch | None | Child safety regulations for blind cords (BS EN 13120) |
| 89 | Loft conversion assessment | Scheduled | None | Building Regulations Part B (fire), Part L (thermal); party wall considerations for terraced properties |
| 90 | Extension surveying | Scheduled | None | RICS-chartered surveyor recommended; planning permission check required |
| 91 | Building control inspection | Scheduled | None | Approved Inspector or local authority building control; statutory function |
| 92 | Snagging inspection | Scheduled | None | No specific regulation; RPSA (Residential Property Surveyors Association) membership recommended |
| 93 | Party wall surveying | Scheduled | None | Party Wall etc. Act 1996; surveyor must be impartial; statutory appointment process |
| 94 | Boundary surveying | Scheduled | None | RICS-chartered surveyor recommended; Land Registry title plan reference |

### B. Property Management & Real Estate

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 95 | Estate agent property viewing | Scheduled | None | Estate Agents Act 1979; Propertymark or NAEA membership recommended; client money protection |
| 96 | Inventory clerk check-in | Scheduled | None | AIIC (Association of Independent Inventory Clerks) membership recommended |
| 97 | Tenancy check-out inspection | Scheduled | None | TDS (Tenancy Deposit Scheme) compliance; prescribed information obligations |
| 98 | Property photography | Scheduled | None | CPR 2008 (material information in listings); drone photography requires CAA permissions |
| 99 | EPC assessment | Scheduled | None | Assessor must be accredited by approved scheme (Elmhurst, Stroma, etc.); legally required before marketing |
| 100 | Home staging | Scheduled | None | None; no regulated profession |
| 101 | Key holding & emergency access | Standing-offer | None | TDS/inventory implications; SIA licence if combined with security duties |
| 102 | Landlord gas safety check | Scheduled | None | Gas Safe registered engineer mandatory; annual CP12 certificate legally required; Gas Safety (Installation and Use) Regulations 1998 |
| 103 | EICR (Electrical Installation Condition Report) | Scheduled | None | Qualified electrician (Part P competent person scheme); mandatory for rental properties every 5 years |
| 104 | Legionella risk assessment | Scheduled | None | HSE ACOP L8 compliance; landlord duty of care; recommended annually |
| 105 | Fire risk assessment | Scheduled | None | Fire Safety Order 2005; assessor competence per PAS 79; mandatory for HMOs and commercial |
| 106 | Asbestos management survey | Scheduled | None | UKAS-accredited surveyor required; CAR 2012; duty to manage in non-domestic premises |
| 107 | Property valuation | Scheduled | None | RICS Red Book valuation standards; regulated for mortgage purposes |
| 108 | Rent collection visit | Scheduled | None | Client money protection scheme required if agent; county court process for arrears |

### C. Automotive

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 109 | MOT delivery (take car for test) | Round-trip | None | Driver must be insured for vehicle; MOT testing station must be DVSA-authorised |
| 110 | Vehicle transport/delivery | Relay | None | Operator's licence if for hire and reward (over 3.5t); trade plates or valid insurance |
| 111 | Classic car transportation | Relay | None | Specialist enclosed transport; goods vehicle operator's licence considerations |
| 112 | Pre-purchase vehicle inspection | Dispatch | None | No specific regulation; AA/RAC engineer or independent mechanic |
| 113 | Windscreen repair (mobile) | Dispatch | None | GQA-qualified technician recommended; BSI Kitemark for replacement glass |
| 114 | Mobile tyre fitting | Dispatch | None | NTDA (National Tyre Distributors Association) membership recommended; waste tyre disposal regs |
| 115 | Vehicle diagnostics (mobile) | Dispatch | None | IMI-certified technician recommended; no specific licence |
| 116 | Paint touch-up / SMART repair | Dispatch | None | None; VOC emission compliance for spray products |
| 117 | Paintless dent removal (PDR) | Dispatch | None | None; specialist skill, no regulation |
| 118 | Vehicle detailing (mobile) | Dispatch | None | Environmental Agency rules on water run-off and chemical discharge |
| 119 | Car key cutting & programming | Dispatch | None | Auto Locksmith Association membership recommended; DBS check advisable |
| 120 | Dash cam installation | Dispatch | None | Data protection implications (GDPR/ICO guidance on vehicle cameras) |
| 121 | Vehicle wrapping consultation | Scheduled | None | DVLA notification of colour change required; no specific installer licence |
| 122 | Alloy wheel refurbishment (mobile) | Dispatch | None | None; specialist equipment required |
| 123 | Motorcycle courier | Relay | None | Courier insurance required; CBT/full licence as appropriate for vehicle class |
| 124 | Vehicle recovery | Dispatch | None | Operator's licence exemption for recovery vehicles under 5t; PAS 43 standard recommended |
| 125 | Emergency fuel delivery | Dispatch | None | ADR regulations for fuel transport; appropriate containers; petroleum licensing |
| 126 | EV charging point installation | Scheduled | None | Part P competent person scheme; OZEV-approved installer for grant eligibility; IET Wiring Regulations BS 7671 |
| 127 | Vehicle storage delivery/collection | Round-trip | None | Insured for vehicle movement; storage facility T&Cs apply |

### D. Marine & Waterway

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 128 | Boat delivery/transfer | Relay | None | RYA Yachtmaster or equivalent qualification; vessel insurance for delivery skippers |
| 129 | Marine engine servicing | Dispatch | None | Manufacturer-accredited engineer recommended; BMF (British Marine Federation) membership |
| 130 | Hull cleaning & antifouling | Scheduled | None | Biocidal Products Regulation for antifoul paints; Environmental Agency water discharge rules |
| 131 | Boat detailing | Dispatch | None | Marina access permissions; environmental run-off compliance |
| 132 | Sail repair | Dispatch | None | None; specialist sailmaker/loft |
| 133 | Rigging inspection | Scheduled | None | MCA coding standards for commercial vessels; surveyor qualifications |
| 134 | Marine electronics installation | Dispatch | None | NMEA-certified installer recommended; MCA compliance for commercial vessels |
| 135 | Canal boat maintenance | Scheduled | None | Canal & River Trust licence compliance; BSS (Boat Safety Scheme) certificate every 4 years |
| 136 | Harbour pilot services | Dispatch | Pilot credential verification | Pilotage Act 1987; authorised by competent harbour authority; compulsory pilotage areas |
| 137 | Marine surveying | Scheduled | None | IIMS or YDSA qualified surveyor; MCA coding examiner for commercial vessels |
| 138 | Dive inspection (hull/mooring) | Scheduled | None | HSE commercial diving regulations; ADAS-qualified diver; diving at work regs 1997 |
| 139 | Underwater hull cleaning | Scheduled | None | HSE diving at work regulations; Environmental Agency consent for discharge |
| 140 | Marine safety equipment inspection | Scheduled | None | MCA compliance for commercial vessels; SOLAS requirements for life-saving appliances |
| 141 | Liferaft servicing | Scheduled | None | Manufacturer-approved service station; annual or triennial inspection per SOLAS |
| 142 | Boat winterisation | Scheduled | None | None; marina access and storage arrangement |
| 143 | Bilge pump servicing | Dispatch | None | BSS compliance; no specific licence required |

### E. Aviation & Drone

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 144 | Drone surveying | Scheduled | None | CAA flyer ID and operator ID required; GVC (General VLOS Certificate) for commercial ops; airspace authorisation |
| 145 | Drone photography/videography | Scheduled | None | CAA registration; A2 CofC or GVC; privacy considerations under GDPR; no-fly zone compliance |
| 146 | Aerial crop spraying | Scheduled | None | CAA operational authorisation for aerial application; DEFRA/HSE approval for pesticide application; PA1/PA2 certificates |
| 147 | Drone roof inspection | Dispatch | None | CAA flyer ID and operator ID; close-proximity permissions; PfCO legacy or GVC |
| 148 | Drone chimney inspection | Dispatch | None | CAA registration; thermal camera operation competence; HETAS referral if defects found |
| 149 | Helicopter charter dispatch | Dispatch | Air operator credential tags | CAA Air Operator's Certificate (AOC); licensed pilot (ATPL/CPL); ANO 2016 compliance |
| 150 | Aircraft ferry pilot | Relay | Pilot credential verification | Valid pilot licence (PPL/CPL) with appropriate type rating; aircraft insurance for ferry flights |
| 151 | Drone delivery | Relay | Airspace corridor tags | CAA BVLOS authorisation required; specific operational authorisation; UTM integration |
| 152 | Aircraft pre-flight inspection | Scheduled | None | Licensed aircraft engineer (Part 66); Part 145 approved organisation for maintenance |
| 153 | Airfield grass cutting | Scheduled | None | Airside access clearance; aerodrome operator approval; FOD management procedures |
| 154 | Drone powerline inspection | Scheduled | None | CAA authorisation; DNO/National Grid access agreements; BVLOS permissions for long linear inspections |

### F. Agriculture & Rural

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 155 | Combine harvester hire with operator | Shift | None | Operator competence (NPTC/City & Guilds); road transport of wide machinery (STGO notice) |
| 156 | Livestock veterinary callout | Dispatch | None | RCVS-registered veterinary surgeon mandatory; Veterinary Surgeons Act 1966 |
| 157 | Farrier services | Dispatch | None | Farriers Registration Act 1975; must be registered with Farriers Registration Council |
| 158 | Sheep shearing | Dispatch | None | No specific licence; welfare codes apply (Animal Welfare Act 2006) |
| 159 | Agricultural fencing repair | Dispatch | None | None; boundary ownership considerations |
| 160 | Hedge laying | Scheduled | None | Protected species check (nesting birds — Wildlife and Countryside Act 1981); seasonal restrictions |
| 161 | Land drainage | Scheduled | None | Environmental Agency consent for watercourse modifications; IDB (Internal Drainage Board) approval |
| 162 | Soil sampling/testing | Scheduled | None | FACTS-qualified advisor for nutrient management; no specific licence for sampling |
| 163 | Crop scouting/agronomy advice | Scheduled | None | BASIS-qualified agronomist recommended; FACTS for fertiliser recommendations |
| 164 | Silage contracting | Shift | None | Operator competence; road haulage weight limits; silage slurry and agricultural fuel oil regs |
| 165 | Baling contractor | Shift | None | Operator competence; health and safety on farm regs |
| 166 | Muck spreading | Scheduled | None | NVZ (Nitrate Vulnerable Zones) rules; DEFRA spreading calendars; 250kg N/ha limit |
| 167 | Cattle foot trimming | Dispatch | None | Veterinary exemptions under Vet Surgeons Act for paraprofessionals; NACFT membership recommended |
| 168 | Poultry vaccination | Scheduled | None | POM-V or POM-VPS medicines require vet prescription; qualified poultry vaccinators |
| 169 | Beekeeping services (hive inspection/relocation) | Dispatch | None | NBU (National Bee Unit) guidance; notifiable disease obligations; APHA registration |
| 170 | Tree planting | Crew | None | Forestry Commission approval for ELS/woodland creation schemes; tree health biosecurity |
| 171 | Woodland management | Scheduled | None | Forestry Commission felling licence if >5m³ per quarter; UKFS standards; EIA for sensitive areas |
| 172 | Hay/straw delivery | Relay | None | Road haulage regs for wide/high loads; operator's licence if over 3.5t |
| 173 | Water trough repair | Dispatch | None | Water supply regulations if mains-connected; none for field troughs |
| 174 | Agricultural machinery repair (mobile) | Dispatch | None | None; BAGMA (British Agricultural & Garden Machinery Association) membership recommended |
| 175 | Pest bird control (agricultural) | Scheduled | None | General licence GL40/GL41/GL42 conditions; Wildlife and Countryside Act 1981; no protected species |

### G. Professional Services

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 176 | Accountant home visit | Scheduled | None | ICAEW/ACCA/CIMA chartered or certified; AML supervision registration mandatory |
| 177 | Tax advisor consultation | Scheduled | None | Must be supervised for AML (HMRC or professional body); no reserved title but competence expected |
| 178 | Financial advisor home visit | Scheduled | None | FCA-authorised and regulated; approved persons regime; suitability requirements |
| 179 | Immigration advisor consultation | Scheduled | None | OISC-registered at appropriate level, or solicitor/barrister; Immigration and Asylum Act 1999 |
| 180 | Patent attorney consultation | Scheduled | None | Registered with IPReg (Intellectual Property Regulation Board); Chartered Institute of Patent Attorneys |
| 181 | Will writing (home visit) | Scheduled | None | No specific regulation (not reserved legal activity) but IPW or SWW membership recommended; consider solicitor for complex estates |
| 182 | Power of attorney consultation | Scheduled | None | Certificate provider role regulated by Mental Capacity Act 2005; OPG registration |
| 183 | Mediation services | Scheduled | None | CMC (Civil Mediation Council) accredited; Family Mediation Council for family matters; not a reserved legal activity |
| 184 | Arbitration services | Scheduled | None | Arbitration Act 1996; CIArb membership recommended; binding decisions |
| 185 | In-person translation/interpreting | Dispatch | None | NRPSI (National Register of Public Service Interpreters) for legal/medical; ITI/CIOL membership |
| 186 | Sign language interpretation | Dispatch | None | NRCPD-registered (National Registers of Communication Professionals working with Deaf and Deafblind People) |
| 187 | Private investigation | Scheduled | None | No specific UK licence (unlike US); data protection registration with ICO; RIPA considerations; ABI membership recommended |
| 188 | Debt collection visit | Dispatch | None | FCA authorisation for consumer credit; OFT legacy guidance; no harassment (Protection from Harassment Act 1997) |
| 189 | Bailiff/enforcement agent visit | Dispatch | None | County court certificated under Courts Act 2003; Taking Control of Goods Regulations 2013; HCEO for High Court writs |
| 190 | Property inventory assessment | Scheduled | None | AIIC membership recommended; no statutory regulation |
| 191 | Insurance loss adjusting | Dispatch | None | CILA (Chartered Institute of Loss Adjusters) qualification; FCA oversight where advising |
| 192 | Quantity surveying (site visit) | Scheduled | None | RICS-chartered recommended; no reserved title |
| 193 | Health and safety inspection | Scheduled | None | NEBOSH/IOSH qualified; CDM duties if construction; HSE guidance |
| 194 | Fire safety inspection | Scheduled | None | Competent person per Fire Safety Order 2005; IFE (Institution of Fire Engineers) membership; PAS 79 methodology |
| 195 | Acoustic surveying | Scheduled | None | IOA (Institute of Acoustics) membership recommended; Building Regulations Part E |
| 196 | Energy audit (commercial) | Scheduled | None | ESOS (Energy Savings Opportunity Scheme) lead assessor for qualifying organisations; DEA for display certificates |
| 197 | Accessibility audit | Scheduled | None | NRAC (National Register of Access Consultants) membership recommended; Equality Act 2010 compliance |
| 198 | Ergonomic assessment (workplace) | Scheduled | None | HSE DSE regulations; CIEHF (Chartered Institute of Ergonomics and Human Factors) membership recommended |
| 199 | Planning consultant site visit | Scheduled | None | RTPI (Royal Town Planning Institute) chartered recommended; no reserved title |
| 200 | Architectural site visit | Scheduled | None | ARB-registered architect (protected title under Architects Act 1997); RIBA chartered |
| 201 | Structural engineering inspection | Scheduled | None | IStructE chartered recommended; Building Regulations sign-off authority if approved inspector |

### H. IT & Technology

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 202 | On-site computer repair | Dispatch | None | ICO registration if handling personal data; WEEE compliance for disposed components |
| 203 | Network cabling installation | Dispatch | None | None; BS EN 50173 cabling standards recommended |
| 204 | CCTV installation | Dispatch | None | SIA licence required for public space surveillance; ICO CCTV code of practice; Surveillance Camera Commissioner guidance |
| 205 | Alarm system installation | Dispatch | None | NSI or SSAIB approved installer for insurance-recognised systems; police URN for monitored alarms |
| 206 | WiFi survey/optimisation | Dispatch | None | None; Ofcom compliance for wireless equipment (already CE/UKCA marked) |
| 207 | Data recovery | Dispatch | None | ICO registration if accessing personal data; chain of custody for forensic recovery |
| 208 | Server rack installation | Scheduled | None | None; electrical safety regs if hard-wiring (Part P) |
| 209 | AV / home cinema setup | Dispatch | None | Part P for fixed electrical work; none for equipment setup |
| 210 | Mobile phone screen repair | Dispatch | None | WEEE compliance for waste screens; manufacturer warranty implications |
| 211 | Printer/copier repair | Dispatch | None | None; toner disposal under hazardous waste regs |
| 212 | Smart home troubleshooting | Dispatch | None | Part P for any electrical modifications; data protection for connected devices |
| 213 | On-site photography (commercial/property) | Scheduled | None | None; property owner consent; potential drone regs if aerial shots |
| 214 | 3D scanning service | Scheduled | None | None; data ownership considerations for scanned assets |
| 215 | Fibre optic installation | Scheduled | None | Openreach PIA access or wayleave agreements; street works licence for civil works; DCMS Building Regulations for new builds |
| 216 | PA system setup (event) | Dispatch | None | Noise at Work Regulations 2005; local authority noise limits for events; premises licence conditions |
| 217 | Digital signage installation | Scheduled | None | Planning permission for external signage (Town and Country Planning Act); advertising consent |
| 218 | EV charger maintenance | Scheduled | None | Part P competent person; manufacturer service schedule; OZEV grant conditions if applicable |

### I. Creative & Design

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 219 | Mural painting | Dispatch | None | Planning permission may be required for external murals; listed building consent where applicable |
| 220 | Signwriting | Dispatch | None | Planning permission for commercial signage; Advertisement Regulations 2007 |
| 221 | Graphic recording (live illustration) | Shift | None | None — unregulated creative service |
| 222 | Calligraphy services | Dispatch | None | None — unregulated creative service |
| 223 | Portrait sitting | Scheduled | None | None — unregulated creative service |
| 224 | Tattoo artist (guest spot) | Scheduled | None | Local authority registration required; hygiene standards under Local Government (Miscellaneous Provisions) Act 1982 |
| 225 | Face/body painting | Shift | None | Cosmetic product safety (EC Regulation 1223/2009); allergy disclosure |
| 226 | Prop making | Dispatch | None | Fire safety compliance for public venue props; BS 5852 flammability where applicable |
| 227 | Set construction | Crew | None | CDM Regulations 2015 for larger builds; structural safety |
| 228 | Scenic painting | Dispatch | None | COSHH compliance for paints and solvents |
| 229 | Window display design | Scheduled | None | None — may require planning consent for illuminated displays |
| 230 | Exhibition stand building | Crew | None | Venue health and safety requirements; temporary structure regulations |
| 231 | Cake decorating (on-site) | Dispatch | None | Food hygiene rating; registered food business (Food Safety Act 1990) |
| 232 | Ice sculpture creation | Dispatch | None | Food safety if for consumption display; manual handling risk assessment |
| 233 | Floral arrangement (on-site) | Dispatch | None | None — unregulated creative service |
| 234 | Interior styling consultation | Scheduled | None | None — unregulated advisory service |
| 235 | Colour consultation | Scheduled | None | None — unregulated advisory service |

### J. Events & Entertainment

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 236 | DJ booking | Scheduled | None | PRS for Music / PPL licence for public performance; noise limits per local authority |
| 237 | Live band booking | Scheduled | None | PRS/PPL licence; Temporary Event Notice (TEN) or premises licence for live music over limits |
| 238 | Solo musician booking | Scheduled | None | PRS/PPL licence; Live Music Act 2012 exemptions for small venues under 500 capacity |
| 239 | MC/host booking | Scheduled | None | None — unregulated service |
| 240 | Comedian booking | Scheduled | None | Premises licence if part of regulated entertainment; Licensing Act 2003 |
| 241 | Magician booking | Scheduled | None | DBS check advisable for children's events; public liability insurance |
| 242 | Caricaturist | Scheduled | None | None — unregulated creative service |
| 243 | Photo booth operation | Dispatch | None | PAT testing for electrical equipment; GDPR for image capture and storage |
| 244 | Event AV technician | Shift | None | PAT testing; EAW Regulations 2005 for noise exposure |
| 245 | Event lighting technician | Shift | None | BS 7671 wiring regulations; temporary electrical installation standards |
| 246 | Stage hand | Shift | None | Manual handling regulations; working at height regulations |
| 247 | Event security steward | Shift | None | SIA licence mandatory (Private Security Industry Act 2001) |
| 248 | Marquee erection | Crew | None | Temporary structure regulations; wind loading calculations; public liability |
| 249 | Bouncy castle delivery/setup | Dispatch | None | PIPA (Perennial Inflatable Play Apparatus) inspection; BS EN 14960; public liability insurance |
| 250 | Balloon decoration | Dispatch | None | None — helium handling safety where applicable |
| 251 | Event catering setup | Crew | None | Food hygiene rating; registered food business; premises licence for alcohol |
| 252 | Mobile bar service | Scheduled | None | Personal licence holder required; Temporary Event Notice or premises licence (Licensing Act 2003) |
| 253 | Fireworks display | Scheduled | None | Explosives Regulations 2014; professional operator certification; local authority notification; HSE guidance |
| 254 | Drone light show | Scheduled | None | CAA operational authorisation; PFCO/GVC certification; airspace clearance; ANO 2016 |
| 255 | Event waste management | Shift | None | Waste carrier licence (Environment Agency); duty of care regulations |
| 256 | Portaloo delivery/service | Round-trip | None | Waste carrier licence for effluent removal; water supply regulations |
| 257 | Event first aid provision | Shift | None | HSE event safety guidance (Purple Guide); first aid qualification (HSE approved) |
| 258 | Crowd management | Shift | None | SIA licence if door supervision; Purple Guide compliance for large events |
| 259 | Event parking attendant | Shift | None | SIA licence if on private land enforcement; high-visibility PPE |
| 260 | Cloakroom attendant | Shift | None | None — GDPR considerations for any personal data handling |

### K. Health & Wellness

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 261 | Mobile physiotherapy | Scheduled | None | HCPC registration mandatory; CSP membership typical; professional indemnity insurance |
| 262 | Osteopathy home visit | Scheduled | None | GOsC registration mandatory (Osteopaths Act 1993); professional indemnity insurance |
| 263 | Chiropractor home visit | Scheduled | None | GCC registration mandatory (Chiropractors Act 1994); professional indemnity insurance |
| 264 | Sports massage | Scheduled | None | Unregulated but CNHC voluntary registration recommended; public liability insurance |
| 265 | Reflexology | Scheduled | None | Unregulated; CNHC voluntary registration; local authority registration in some boroughs |
| 266 | Acupuncture (domiciliary) | Scheduled | None | Local authority registration required (London Local Authorities Act 1991 or equivalent); sharps disposal |
| 267 | Nutritionist consultation | Scheduled | None | Unregulated title; CNHC voluntary register; AfN accreditation recommended |
| 268 | Dietitian home visit | Scheduled | None | HCPC registration mandatory (protected title); professional indemnity insurance |
| 269 | Speech therapy (home visit) | Scheduled | None | HCPC registration mandatory; DBS check for work with children/vulnerable adults |
| 270 | Occupational therapy (home visit) | Scheduled | None | HCPC registration mandatory; DBS enhanced check |
| 271 | Mental health first aid | Dispatch | None | MHFA England certification; not a regulated health intervention |
| 272 | Counselling (in-person) | Scheduled | None | BACP/UKCP/NCS accreditation recommended; unregulated but SCoPEd framework applies |
| 273 | Mobile dentistry | Scheduled | None | GDC registration mandatory; CQC registration for regulated dental activity; infection control (HTM 01-05) |
| 274 | Mobile optician | Scheduled | None | GOC registration mandatory (Opticians Act 1989); domiciliary visit record requirements |
| 275 | Hearing aid fitting (domiciliary) | Scheduled | None | HCPC registration for audiologists; HSE registered for dispensers; medical device regulations |
| 276 | Podiatry/chiropody (domiciliary) | Scheduled | None | HCPC registration mandatory (protected title); sharps disposal; infection control |
| 277 | Wound care nurse | Scheduled | None | NMC registration mandatory; PGDs for prescription medications; clinical waste disposal |
| 278 | Vaccination (domiciliary) | Scheduled | None | NMC/HCPC registration; PGD or PSD authorisation; cold chain management; anaphylaxis kit |
| 279 | Blood draw (phlebotomy) | Scheduled | None | NHS/private lab accreditation; UKAS standards; sharps and clinical waste disposal |
| 280 | Health screening | Scheduled | None | CQC registration if diagnostic; UKAS accreditation for lab work; GDPR health data (Article 9) |
| 281 | CPR/first aid training | Scheduled | None | HSE approved training organisation; Ofqual regulated qualifications where certificated |
| 282 | Manual handling training | Scheduled | None | HSE compliance (Manual Handling Operations Regulations 1992); qualified instructor |
| 283 | Workplace wellness assessment | Scheduled | None | HSE guidance; occupational health professional qualification expected |
| 284 | Ergonomic workstation assessment | Scheduled | None | DSE Regulations 1992; qualified assessor (no statutory registration) |
| 285 | DSE assessment | Scheduled | None | Health and Safety (Display Screen Equipment) Regulations 1992; employer duty |
| 286 | Noise assessment | Scheduled | None | Control of Noise at Work Regulations 2005; calibrated equipment required |
| 287 | Drug/alcohol testing | Scheduled | None | Chain of custody procedures; UKAS accredited laboratory; GDPR special category data |
| 288 | Occupational health screening | Scheduled | None | CQC registration if regulated activity; NMC/GMC registered professionals; GDPR Article 9 |
| 289 | Medical equipment delivery | Relay | None | Medical device regulations (UK MDR 2002); cold chain if applicable; MHRA compliance |
| 290 | Wheelchair repair | Dispatch | None | Medical device servicing standards; manufacturer accreditation recommended |
| 291 | Stairlift installation | Dispatch | None | BS 5776:1996 stairlift standard; Building Regulations Part M; electrical safety (BS 7671) |
| 292 | Mobility aid assessment | Scheduled | None | HCPC registered occupational therapist; Wheelchair Service standards |

### L. Education & Training

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 293 | Home schooling tutor | Scheduled | None | DBS enhanced check; no mandatory teaching qualification but recommended; safeguarding training |
| 294 | SEN support | Scheduled | None | DBS enhanced check; SEND Code of Practice 2015; relevant qualifications (e.g. NASENCO) |
| 295 | Exam invigilation | Shift | None | DBS check; JCQ (Joint Council for Qualifications) regulations for formal exams |
| 296 | Educational psychologist visit | Scheduled | None | HCPC registration mandatory (protected title); DBS enhanced check |
| 297 | Career coaching | Scheduled | None | Unregulated; CDI (Career Development Institute) registration recommended |
| 298 | Interview coaching | Scheduled | None | None — unregulated advisory service |
| 299 | Public speaking coaching | Scheduled | None | None — unregulated advisory service |
| 300 | Language lesson (in-person) | Scheduled | None | DBS check if teaching under-18s; no mandatory qualification |
| 301 | Musical instrument tuition | Scheduled | None | DBS enhanced check if teaching under-18s; safeguarding training recommended |
| 302 | Art lesson (in-home) | Scheduled | None | DBS enhanced check if teaching under-18s; COSHH for materials where applicable |
| 303 | Swimming lesson (private) | Scheduled | None | STA or ASA qualified; National Rescue Award for pool lifeguarding; DBS enhanced check |
| 304 | Horse riding lesson | Scheduled | None | BHS qualified instructor; riding establishment licence (Riding Establishments Acts 1964/1970); public liability |
| 305 | Golf lesson | Scheduled | None | PGA qualified professional recommended; public liability insurance |
| 306 | Tennis coaching | Scheduled | None | LTA accredited coach recommended; DBS check for juniors; public liability insurance |
| 307 | Cricket coaching | Scheduled | None | ECB qualified coach recommended; DBS check for juniors; safeguarding |
| 308 | Sailing instruction | Scheduled | None | RYA qualified instructor; risk assessment; appropriate safety equipment and insurance |
| 309 | First aid certification training | Scheduled | None | HSE approved training organisation; Ofqual regulated qualifications; revalidation cycle |
| 310 | Fire marshal training | Scheduled | None | Regulatory Reform (Fire Safety) Order 2005; qualified trainer; Ofqual accreditation for certification |

### M. Legal & Compliance

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 311 | Will witnessing | Dispatch | None | Wills Act 1837 requirements; witness must not be a beneficiary; no special qualification |
| 312 | Statutory declaration witnessing | Dispatch | None | Statutory Declarations Act 1835; must be witnessed by solicitor, commissioner for oaths, or JP |
| 313 | Oath administration | Dispatch | None | Commissioners for Oaths Act 1889; must be administered by authorised person |
| 314 | Legal document delivery | Relay | None | Chain of custody documentation; Civil Procedure Rules for service of documents |
| 315 | Compliance audit | Scheduled | None | Sector-specific regulatory framework; qualified auditor (e.g. ISO lead auditor) |
| 316 | Data protection audit | Scheduled | None | UK GDPR / Data Protection Act 2018; ICO guidance; qualified DPO or auditor |
| 317 | Right to work check | Dispatch | None | Immigration, Asylum and Nationality Act 2006; Home Office prescribed document checks |
| 318 | Age verification (licensed premises) | Dispatch | None | Licensing Act 2003; Challenge 25 policy; approved ID schemes |
| 319 | Licence inspection | Scheduled | None | Sector-specific (premises licence, alcohol, gambling); relevant licensing authority |
| 320 | Trading standards inspection | Scheduled | None | Consumer Rights Act 2015; Weights and Measures Act 1985; CTSI framework |
| 321 | Weights and measures verification | Scheduled | None | Weights and Measures Act 1985; UKAS accredited laboratory; approved verifier |
| 322 | Immigration document checking | Scheduled | None | Immigration Rules; OISC registration if providing immigration advice (level 1+) |

### N. Inspection & Certification

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 323 | Gas safety inspection (CP12) | Scheduled | None | Gas Safe Register mandatory; Gas Safety (Installation and Use) Regulations 1998 |
| 324 | Electrical installation inspection (EICR) | Scheduled | None | Qualified electrician (BS 7671); registered competent person scheme; Electrical Safety Standards (England) 2020 for landlords |
| 325 | PAT testing | Scheduled | None | IET Code of Practice; competent person (no statutory registration); Electricity at Work Regulations 1989 |
| 326 | Fire alarm inspection | Scheduled | None | BS 5839 compliance; BAFE registered; Regulatory Reform (Fire Safety) Order 2005 |
| 327 | Fire extinguisher inspection | Scheduled | None | BS 5306 compliance; BAFE SP101 registered; annual service requirement |
| 328 | Emergency lighting inspection | Scheduled | None | BS 5266 compliance; monthly and annual testing requirements |
| 329 | Sprinkler system inspection | Scheduled | None | BS EN 12845; LPCB or FIRAS approved; insurer requirements |
| 330 | Legionella testing | Scheduled | None | HSE L8 / ACOP guidance; UKAS accredited sampling; Health and Safety at Work Act 1974 |
| 331 | Air quality testing | Scheduled | None | UKAS accredited; COSHH Regulations 2002; workplace exposure limits |
| 332 | Water quality testing | Scheduled | None | Water Supply (Water Quality) Regulations 2016; UKAS accredited laboratory |
| 333 | Radon testing | Scheduled | None | PHE/UKHSA guidance; UKAS accredited measurement; Building Regulations Approved Document C |
| 334 | Food hygiene inspection | Scheduled | None | Food Safety Act 1990; CIEH qualified; local authority enforcement |
| 335 | Kitchen extraction cleaning certification | Scheduled | None | TR/19 compliance (BESA); insurance requirement; fire risk reduction |
| 336 | Lift/elevator inspection | Scheduled | None | LOLER 1998; SAFed accredited inspection body; thorough examination every 6/12 months |
| 337 | Pressure vessel inspection | Scheduled | None | Pressure Systems Safety Regulations 2000; written scheme of examination; competent person |
| 338 | Crane inspection (LOLER) | Scheduled | None | LOLER 1998; SAFed or equivalent competent person; thorough examination before first use and periodically |
| 339 | Forklift inspection (LOLER) | Scheduled | None | LOLER 1998; PUWER 1998; thorough examination every 12 months |
| 340 | Scaffolding inspection | Scheduled | None | Work at Height Regulations 2005; NASC guidance; competent person inspection every 7 days |
| 341 | Asbestos air monitoring | Scheduled | None | Control of Asbestos Regulations 2012; UKAS accredited (ISO 17025); HSE analyst scheme |
| 342 | Noise level assessment | Scheduled | None | Control of Noise at Work Regulations 2005; calibrated equipment; competent assessor |
| 343 | Vibration assessment | Scheduled | None | Control of Vibration at Work Regulations 2005; calibrated equipment; HSE guidance |
| 344 | Thermal imaging survey | Scheduled | None | Qualified thermographer (ITC/PCN Level 2 recommended); no statutory registration |
| 345 | Damp survey | Scheduled | None | PCA (Property Care Association) qualified; CSRT/CSSW certification recommended |
| 346 | Timber survey | Scheduled | None | PCA qualified; CSRT/CSSW certification; reporting to PCA standards |
| 347 | Drainage survey (CCTV) | Scheduled | None | WRc standards for sewer survey; competent operator; NADC membership recommended |
| 348 | Japanese knotweed survey | Scheduled | None | PCA accredited surveyor; RICS guidance; Environmental Protection Act 1990 (controlled waste) |
| 349 | Tree survey (BS5837) | Scheduled | None | Qualified arboriculturist; BS 5837:2012 compliance; TPO and conservation area checks |

### O. Environmental & Waste

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 350 | Waste collection (commercial) | Dispatch | None | Environment Agency waste carrier licence; duty of care waste transfer notes |
| 351 | Hazardous waste disposal | Dispatch | None | Hazardous Waste Regulations 2005; consignment notes; licensed facility; ADR for transport |
| 352 | Clinical waste collection | Dispatch | None | Controlled waste; HTM 07-01 guidance; Environment Agency permit; ADR transport |
| 353 | Asbestos removal | Scheduled | None | HSE licensed contractor (licensable work); Control of Asbestos Regulations 2012; 14-day notification |
| 354 | Contaminated land assessment | Scheduled | None | Part 2A Environmental Protection Act 1990; SuRF-UK framework; qualified contaminated land specialist |
| 355 | Environmental impact assessment | Scheduled | None | Town and Country Planning (EIA) Regulations 2017; chartered environmentalist recommended |
| 356 | Ecological survey | Scheduled | None | CIEEM membership recommended; Natural England licence for protected species handling |
| 357 | Bat survey | Scheduled | None | Natural England Class Survey Licence mandatory; Wildlife and Countryside Act 1981; seasonal constraints |
| 358 | Newt survey (great crested) | Scheduled | None | Natural England Class Survey Licence mandatory; Habitats Regulations 2017; seasonal window (March-June) |
| 359 | Badger survey | Scheduled | None | Protection of Badgers Act 1992; Natural England licence for sett interference |
| 360 | Bird nesting survey | Scheduled | None | Wildlife and Countryside Act 1981; seasonal constraints (nesting season March-August) |
| 361 | Arboricultural impact assessment | Scheduled | None | BS 5837:2012; qualified arboriculturist; TPO and conservation area checks |
| 362 | Flood risk assessment | Scheduled | None | NPPF requirements; Environment Agency standing advice; chartered engineer/hydrologist |
| 363 | Noise impact assessment | Scheduled | None | BS 4142:2014+A1:2019; calibrated equipment; competent acoustician (IOA membership) |
| 364 | Air quality monitoring | Scheduled | None | LAQM Technical Guidance (TG22); UKAS accredited; Defra methodology |
| 365 | Odour assessment | Scheduled | None | IAQM guidance; field olfactometry or sniff testing; Environment Agency H4 guidance |
| 366 | Land remediation | Scheduled | None | Environmental Permitting Regulations 2016; CL:AIRE Definition of Waste Code of Practice |
| 367 | Invasive species treatment | Scheduled | None | Wildlife and Countryside Act 1981 (Schedule 9); Environmental Protection Act 1990; qualified operative |

### P. Funeral & End-of-Life

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 368 | Funeral transport | Trip | None | No specific licence required (not public hire); dignity and respect standards; NAFD/SAIF membership recommended |
| 369 | Body preparation | Dispatch | None | Unregulated but BIE (British Institute of Embalmers) standards recommended; infection control |
| 370 | Embalming | Dispatch | None | BIE qualification recommended; COSHH for formaldehyde; unregulated profession |
| 371 | Gravedigger services | Scheduled | None | Local authority cemetery regulations; ICCM guidance; manual handling; confined space regulations |
| 372 | Memorial mason | Scheduled | None | BRAMM (British Register of Accredited Memorial Masons) registration; local authority approval for churchyards/cemeteries |
| 373 | Funeral flower delivery | Relay | None | None — standard delivery; time-critical scheduling |
| 374 | Order of service printing | Relay | None | None — standard print and deliver |
| 375 | Wake catering | Scheduled | None | Food hygiene rating; registered food business; premises licence if serving alcohol |
| 376 | Estate clearance | Dispatch | None | Waste carrier licence for disposal; second-hand goods handling; duty of care |
| 377 | Probate document collection | Relay | None | Chain of custody; identification verification; Solicitors Regulation Authority if legal advice involved |

### Q. Fashion & Personal

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 378 | Personal shopper | Scheduled | None | None — unregulated advisory service |
| 379 | Wardrobe consultation | Scheduled | None | None — unregulated advisory service |
| 380 | Bespoke tailoring (home visit) | Scheduled | None | None — unregulated craft service |
| 381 | Alterations and repairs (collection/delivery) | Round-trip | None | None — unregulated craft service |
| 382 | Shoe repair collection/delivery | Round-trip | None | None — unregulated craft service |
| 383 | Jewellery repair | Round-trip | None | Hallmarking Act 1973 if working with precious metals; responsible custody |
| 384 | Watch repair | Round-trip | None | Responsible custody; insurance for high-value items |
| 385 | Personal styling | Scheduled | None | None — unregulated advisory service |
| 386 | Make-up artist (event) | Dispatch | None | Cosmetic product safety (EC Regulation 1223/2009); allergy patch testing recommended |
| 387 | Bridal hair styling | Scheduled | None | None — hairdressing is unregulated in England; hygiene standards expected |
| 388 | Bridal make-up | Scheduled | None | Cosmetic product safety (EC Regulation 1223/2009); allergy patch testing recommended |
| 389 | Henna artist | Dispatch | None | Cosmetic product safety; avoid para-phenylenediamine (PPD) in black henna; allergy disclosure |
| 390 | Nail technician (mobile) | Dispatch | None | Local authority registration in some boroughs; COSHH for acrylics and chemicals; ventilation |
| 391 | Eyelash technician (mobile) | Dispatch | None | Cosmetic product safety; adhesive allergy patch testing; public liability insurance |
| 392 | Brow technician (mobile) | Dispatch | None | Local authority registration for threading/waxing in some areas; cosmetic product safety |
| 393 | Tanning (mobile spray tan) | Dispatch | None | Cosmetic product safety (EC Regulation 1223/2009); ventilation and extraction; DHA concentration limits |
| 394 | Teeth whitening (mobile) | Dispatch | None | GDC registration mandatory — only dentists/dental professionals may legally perform (EU Cosmetics Directive; Dentists Act 1984) |
| 395 | Ear piercing | Dispatch | None | Local authority registration required (Local Government (Miscellaneous Provisions) Act 1982); infection control |
| 396 | Personal colour analysis | Scheduled | None | None — unregulated advisory service |
| 397 | Image consulting | Scheduled | None | None — unregulated advisory service |

### R. Animal & Equine

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 398 | Horse box transport | Trip | None | Goods vehicle operator's licence over 3.5t; valid driving licence (C1/C); horse passport required; welfare in transport regulations |
| 399 | Equine dentist | Dispatch | None | Category 3 treatments restricted to RCVS-registered vets; BAEDT/BEVA qualified for routine work; Veterinary Surgeons Act 1966 |
| 400 | Equine physiotherapy | Scheduled | None | Must work on veterinary referral (Veterinary Surgeons Act 1966); RAMP or ACPAT registered |
| 401 | Farrier emergency callout | Dispatch | None | Farriers Registration Act 1975; registered with Farriers Registration Council; emergency surcharge typical |
| 402 | Livestock transport | Trip | None | APHA-authorised transporter; Type 1/Type 2 authorisation per journey length; welfare in transport regulations; TRACES certification for cross-border |
| 403 | Animal behaviourist | Scheduled | None | ABTC-registered recommended; no statutory regulation; veterinary referral for clinical cases; ASAB guidelines |
| 404 | Pet sitting (in-home) | Shift | None | Animal Welfare (Licensing of Activities Involving Animals) Regulations 2018 may apply; DBS check advisable; public liability insurance |
| 405 | Pet taxi | Trip | None | Animal Welfare (Licensing of Activities Involving Animals) Regulations 2018; appropriate vehicle ventilation and containment; pet transport insurance |
| 406 | Aquarium maintenance | Scheduled | None | None specific; OATA membership recommended for specialist fish; water disposal per local authority |
| 407 | Aviary cleaning | Scheduled | None | Animal Welfare Act 2006; bird flu biosecurity protocols per APHA if applicable |
| 408 | Reptile specialist vet | Dispatch | None | RCVS-registered veterinary surgeon; specialist certificate in zoological medicine recommended |
| 409 | Poultry keeping advice | Scheduled | None | APHA registration for flocks over 50 birds; bird flu biosecurity; none for small domestic flocks |
| 410 | Dog training (in-home) | Scheduled | None | ABTC-registered recommended; no statutory regulation; DBS check if children present; public liability insurance |
| 411 | Puppy socialisation class | Broadcast | None | ABTC-registered recommended; appropriate venue risk assessment; public liability insurance; vaccination requirements for attendees |
| 412 | Cat sitting | Shift | None | Animal Welfare Act 2006; no specific licence for in-home sitting; DBS check advisable |
| 413 | Pet photography | Scheduled | None | None specific; public liability insurance; animal handling awareness |
| 414 | Animal chiropractic | Scheduled | None | Must work on veterinary referral (Veterinary Surgeons Act 1966); McTimoney or equivalent qualification; RAMP registered |
| 415 | Wildlife rescue callout | Dispatch | None | Wildlife and Countryside Act 1981; Natural England licence for handling protected species; RSPCA/local wildlife trust coordination |

### S. Seasonal & Weather

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 416 | Snow clearing/gritting | Conditional | Weather-triggered activation | Highways Act 1980 (occupiers' liability for paths/car parks); Occupiers' Liability Acts; salt/grit storage per Environment Agency |
| 417 | Gutter clearing (autumn) | Scheduled | None | Working at Height Regulations 2005; no specific licence |
| 418 | Christmas light installation | Scheduled | None | BS 7671 for electrical work; working at height regulations; planning consent for commercial displays |
| 419 | Christmas tree delivery | Relay | None | Road haulage regs for oversized loads; waste disposal for post-season collection |
| 420 | Garden winterisation | Scheduled | None | None specific; pesticide/herbicide use per Plant Protection Products Regulation |
| 421 | BBQ cleaning (spring) | Scheduled | None | None specific; COSHH for chemical cleaning agents |
| 422 | Patio furniture assembly (spring) | Dispatch | None | None specific |
| 423 | Pond maintenance (seasonal) | Scheduled | None | Wildlife and Countryside Act 1981 for protected species (newts); Environmental Agency if connected to watercourse |
| 424 | Heating system service (pre-winter) | Scheduled | None | Gas Safe registration mandatory for gas systems; OFTEC for oil; manufacturer warranty requirements |
| 425 | Air conditioning service (pre-summer) | Scheduled | None | F-gas Regulation for refrigerant handling; qualified F-gas engineer |
| 426 | Holiday home preparation | Scheduled | None | None specific; gas safety check if rental property |
| 427 | Storm damage assessment | Dispatch | None | Structural engineer or RICS surveyor for serious damage; insurance claim requirements; tree work per Forestry Commission |
| 428 | Flood damage assessment | Dispatch | None | Environment Agency flood risk guidance; RICS surveyor for structural assessment; specialist drying contractors; insurance claim requirements |

### T. Accessibility & Disability

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 429 | Wheelchair ramp installation | Scheduled | None | Building Regulations Part M; planning permission if permanent external modification; DDA/Equality Act 2010 |
| 430 | Grab rail fitting | Dispatch | None | Building Regulations Part M; BS 8300 access standards; Disabled Facilities Grant may apply |
| 431 | Wet room conversion assessment | Scheduled | None | Building Regulations Part M and Part G (sanitation); Disabled Facilities Grant criteria |
| 432 | Stairlift fitting | Scheduled | None | BS 5776:1996; Building Regulations Part M; electrical safety (BS 7671); Disabled Facilities Grant may apply |
| 433 | Home adaptation assessment | Scheduled | None | RCOT-registered occupational therapist typically; Disabled Facilities Grant criteria under Housing Grants, Construction and Regeneration Act 1996 |
| 434 | Assistive technology installation | Scheduled | None | Medical devices regulated by MHRA under UK MDR 2002; data protection under UK GDPR for connected devices |
| 435 | Hearing loop installation | Scheduled | None | BS 8300 and BS EN 60118-4 compliance; Equality Act 2010 for public premises; Building Regulations Part M |
| 436 | Braille transcription | Relay | None | No specific regulation; accuracy standards per UKAAF guidelines; copyright licensing may apply |
| 437 | Audio description services | Scheduled | None | Ofcom guidelines for broadcast; ADRC-UK quality standards |
| 438 | BSL interpretation | Scheduled | None | NRCPD registration expected for qualified interpreters; Equality Act 2010 reasonable adjustment obligations |
| 439 | Mobility scooter repair | Dispatch | None | Medical devices regulation under MHRA; Class 2/3 scooter classification under Use of Invalid Carriages on Highways Regulations 1988 |
| 440 | Prosthetics adjustment | Scheduled | None | Must be HCPC-registered prosthetist; Medical Devices Regulations 2002; CQC registration if providing regulated healthcare activity |
| 441 | Home oxygen delivery | Relay | Temperature-controlled delivery state | MHRA-regulated medical gas; ADR regulations for transport; Home Oxygen Service assessment via NHS framework |
| 442 | CPAP equipment servicing | Scheduled | None | MHRA medical device regulation; CQC registration if maintaining medical equipment commercially |
| 443 | Visual impairment orientation training | Scheduled | None | HCPC-registered rehabilitation officer or certified orientation and mobility specialist; DBS enhanced check |

### U. Storage & Logistics

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 444 | Self-storage delivery | Relay | None | Standard goods-in-transit insurance; storage facility operator licensing per local authority |
| 445 | Document storage/retrieval | Relay | None | UK GDPR and Data Protection Act 2018 for personal data; BS 10008 for evidential weight of electronic documents |
| 446 | Archive scanning | Scheduled | None | UK GDPR compliance for personal data; BS 10008 for legal admissibility; copyright clearance may be required |
| 447 | Pallet collection | Relay | None | Operator licensing under Goods Vehicle Operators' Licensing; driver CPC for vehicles over 3.5t |
| 448 | Freight forwarding coordination | Relay | Multi-party coordination states | BIFA membership expected; customs broker authorisation; HMRC registration for customs declarations |
| 449 | Customs clearance agent | Scheduled | None | HMRC customs broker authorisation; CDS enrolment; AEO status advantageous; professional indemnity insurance |
| 450 | Container loading/unloading | Shift | None | Health and Safety at Work Act 1974; Manual Handling Operations Regulations 1992; HSE approved code of practice |
| 451 | Warehouse picking | Shift | None | Health and Safety at Work Act 1974; Manual Handling Regulations; forklift operators require ITSSAR/RTITB accreditation |
| 452 | Last-mile delivery | Relay | None | No specific licensing for standard parcels; Consumer Contracts Regulations 2013 |
| 453 | Same-day courier | Relay | None | Standard goods-in-transit insurance; vehicle insurance for hire and reward; no operator licence needed under 3.5t |
| 454 | Overnight courier | Relay | None | Standard courier regulations; goods-in-transit insurance; driver hours per EU Drivers' Hours Regulation (retained law) |
| 455 | Temperature-controlled delivery | Relay | Temperature monitoring telemetry | ATP certification for international; Food Safety Act 1990 for food items; MHRA GDP compliance for pharmaceuticals |
| 456 | Oversized item delivery | Relay | Dimensional/weight metadata | STGO notification for abnormal loads; police notification for very large loads; escort vehicle may be required |
| 457 | White glove delivery | Relay | None | Standard delivery insurance; goods-in-transit liability; Consumer Rights Act 2015 |
| 458 | Furniture delivery and assembly | Relay | None | Consumer Rights Act 2015; public liability insurance; waste packaging disposal |
| 459 | Appliance delivery and installation | Relay | None | Gas Safe registered installer for gas appliances; Part P for electrical; WEEE Regulations for old appliance disposal |
| 460 | IT equipment decommissioning | Relay | Data sanitisation certification state | WEEE Regulations 2013; UK GDPR for data destruction; ADISA certification for data destruction |

### V. Government & Civic

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 461 | Electoral canvas support | Shift | None | Electoral Commission guidance; Representation of the People Act 1983; data handling per UK GDPR |
| 462 | Census enumeration | Shift | None | Census Act 1920; ONS operational procedures; DBS check required |
| 463 | Planning notice delivery | Relay | Proof-of-delivery with photo evidence | Town and Country Planning Act 1990; statutory notification requirements; proof of service required |
| 464 | Council pest control | Dispatch | None | Prevention of Damage by Pests Act 1949; BPCA membership expected; COSHH for pesticides |
| 465 | Council tree inspection | Scheduled | None | Qualified arboriculturist; Tree Preservation Orders per Town and Country Planning Act 1990; Highways Act 1980 for street trees |
| 466 | Street lighting repair | Dispatch | None | Highways Act 1980 s97; electrical work per BS 7671; working at height regulations |
| 467 | Pothole repair coordination | Dispatch | None | Highways Act 1980 s41 duty to maintain; New Roads and Street Works Act 1991 for coordination |
| 468 | Graffiti removal | Dispatch | None | Anti-social Behaviour, Crime and Policing Act 2014; Environmental Protection Act 1990; COSHH for chemical removers |
| 469 | Fly-tipping clearance | Dispatch | None | Environmental Protection Act 1990 s33; Environment Agency registered waste carrier required |
| 470 | Public consultation facilitation | Scheduled | None | Localism Act 2011; Gunning Principles for lawful consultation; Equality Act 2010 PSED |
| 471 | Community mediation | Scheduled | None | No statutory regulation; CMC standards recommended; DBS check for mediators |
| 472 | Neighbourhood warden patrol | Shift | None | Community Safety Accreditation Scheme (Police Reform Act 2002); DBS enhanced check |
| 473 | Civil enforcement officer | Shift | None | Traffic Management Act 2004 for parking; DBS check; body-worn camera per ICO guidance |
| 474 | Democratic outreach | Scheduled | None | Electoral Commission guidance; Representation of the People Act 1983; political impartiality requirements |

### W. P2P & Sharing Economy

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 475 | Tool lending | Standing-offer | Deposit/return inspection states | Product liability for defective tools; insurance for damage/injury; PAT testing for electrical tools |
| 476 | Kitchen equipment lending | Standing-offer | Deposit/return inspection states | Food safety regulations if used for commercial food preparation; PAT testing for electrical items |
| 477 | Camping gear lending | Standing-offer | Deposit/return inspection states | Product safety per General Product Safety Regulations 2005; fire safety for tents/sleeping bags |
| 478 | Sports equipment lending | Standing-offer | Deposit/return inspection states | Product liability for safety equipment; insurance for injury claims |
| 479 | Parking space sharing | Standing-offer | Calendar/availability management | Planning permission may be required for change of use; landlord/freeholder consent |
| 480 | Driveway sharing | Standing-offer | Calendar/availability management | Potential planning considerations for commercial use; insurance implications for property damage |
| 481 | Garden sharing | Standing-offer | Calendar/availability management | Planning permission for change of use; landlord consent; Occupiers' Liability Act 1957/1984 |
| 482 | Workshop space sharing | Standing-offer | Calendar/availability management | Health and Safety at Work Act 1974; fire safety; planning permission for commercial use |
| 483 | Co-working desk booking | Standing-offer | Calendar/availability management | Business rates may apply; planning permission for commercial use; fire safety compliance |
| 484 | Darkroom sharing | Standing-offer | Calendar/availability management | COSHH for photographic chemicals; ventilation requirements; waste chemical disposal |
| 485 | Recording studio booking | Standing-offer | Calendar/availability management | Planning permission for change of use; noise regulations per Environmental Protection Act 1990 |
| 486 | Rehearsal room booking | Standing-offer | Calendar/availability management | Noise regulations; planning permission; fire safety; Equality Act 2010 accessibility requirements |
| 487 | Boat sharing | Standing-offer | Deposit/return inspection states | RYA qualifications for certain vessels; marine insurance required; Canal & River Trust licence |
| 488 | Caravan lending | Standing-offer | Deposit/return inspection states | Road traffic insurance; MOT if applicable; gas safety certificate |
| 489 | Motorhome lending | Standing-offer | Deposit/return inspection states | Vehicle insurance for hire and reward; MOT; gas safety certificate; DVLA registration |
| 490 | Electric vehicle lending | Standing-offer | Deposit/return inspection states | Vehicle insurance for hire and reward; MOT; DVLA registration |
| 491 | Bicycle lending | Standing-offer | Deposit/return inspection states | No specific licensing; product liability for defective equipment; insurance recommended |
| 492 | Cargo bike lending | Standing-offer | Deposit/return inspection states | No specific licensing for standard cargo bikes; EAPC Regulations 2015 for electric assist |

### X. B2B & Commercial

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 493 | Commercial cleaning | Shift | None | COSHH compliance; BICSc standards recommended; public liability insurance; Modern Slavery Act 2015 for supply chains |
| 494 | Office deep clean | Scheduled | None | COSHH compliance; fire safety during works; DBS check recommended |
| 495 | Commercial pest control | Dispatch | None | BPCA membership expected; COSHH for pesticides; Prevention of Damage by Pests Act 1949 |
| 496 | Commercial waste collection | Scheduled | None | Environment Agency registered waste carrier licence; duty of care transfer notes; Environmental Protection Act 1990 |
| 497 | Commercial window cleaning | Scheduled | None | Working at Height Regulations 2005; HSE guidance; water-fed pole or rope access qualifications |
| 498 | Commercial carpet cleaning | Scheduled | None | COSHH for cleaning agents; TACCA membership recommended |
| 499 | Commercial HVAC servicing | Scheduled | None | F-gas Regulation for refrigerant handling; Gas Safe registration for gas systems; TM44 air conditioning inspections |
| 500 | Commercial fire risk assessment | Scheduled | None | Regulatory Reform (Fire Safety) Order 2005; competent person (IFE or equivalent); enforcement by fire authority |
| 501 | Commercial health and safety audit | Scheduled | None | Health and Safety at Work Act 1974; Management of Health and Safety at Work Regulations 1999; NEBOSH or equivalent |
| 502 | Office furniture installation | Scheduled | None | Manual Handling Operations Regulations 1992; Display Screen Equipment Regulations 1992 |
| 503 | Office relocation coordination | Scheduled | Multi-party coordination states | BAR commercial membership; goods-in-transit insurance; IT infrastructure decommissioning per UK GDPR |
| 504 | Commercial painting/decorating | Scheduled | None | COSHH for paints and solvents; Working at Height Regulations; VOC content limits |
| 505 | Commercial landscaping | Scheduled | None | Pesticide application per Plant Protection Products Regulation; planning permission for significant changes |
| 506 | Fleet vehicle servicing | Scheduled | None | Operator licence compliance (O-licence); DVSA standards; MOT requirements |
| 507 | Fleet vehicle valeting | Scheduled | None | Trade effluent consent for wash water; COSHH for cleaning products |
| 508 | Commercial laundry | Relay | None | Fire safety; COSHH for detergents; trade effluent consent; infection control for healthcare linen |
| 509 | Linen supply/collection | Relay | None | Infection control per HTM 01-04 for healthcare; Textile Services Association standards |
| 510 | Trade waste collection | Scheduled | None | Environment Agency waste carrier licence; duty of care transfer notes; separate collection requirements |
| 511 | Confidential shredding | Relay | Data destruction certification state | UK GDPR; BS EN 15713 for secure destruction; BSIA member recommended; destruction certificate required |
| 512 | IT asset disposal | Relay | Data sanitisation certification state | WEEE Regulations 2013; UK GDPR data destruction; ADISA certification recommended |
| 513 | Commercial refrigeration servicing | Scheduled | None | F-gas Regulation; Food Safety Act 1990 temperature requirements; HACCP compliance support |
| 514 | Commercial kitchen deep clean | Scheduled | None | Food Safety Act 1990; Food Hygiene Regulations; HACCP support; COSHH for cleaning agents |
| 515 | Air duct cleaning | Scheduled | None | HVCA TR/19 guidance; Regulatory Reform (Fire Safety) Order 2005; COSHH |
| 516 | Water cooler servicing | Scheduled | None | Water Supply (Water Fittings) Regulations 1999; Drinking Water Inspectorate standards |
| 517 | Vending machine servicing | Scheduled | None | Food Hygiene Regulations for food/drink machines; PAT testing for electrical safety |
| 518 | Commercial drainage maintenance | Scheduled | None | Water Industry Act 1991; Building Regulations Part H; confined space regulations |

### Y. Sport & Recreation

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 519 | Sports pitch marking | Scheduled | None | Sport governing body pitch dimension specifications; COSHH for line marking materials |
| 520 | Sports pitch maintenance | Scheduled | None | Sport governing body standards (FA, RFU, ECB); COSHH for treatments; Environment Agency for pesticide use |
| 521 | Gym equipment servicing | Scheduled | None | BS EN ISO 20957; LOLER for weight machines; manufacturer maintenance schedules |
| 522 | Swimming pool maintenance | Scheduled | None | HSG 179 (HSE pool water treatment guidance); COSHH for pool chemicals; PWTAG standards |
| 523 | Sports court resurfacing | Scheduled | None | Sport governing body surface standards; SAPCA membership recommended |
| 524 | Climbing wall inspection | Scheduled | None | NICAS/ABC standards; LOLER/PUWER for mechanical equipment; Adventure Activities Licensing Regulations 2004 |
| 525 | Adventure activity instruction | Scheduled | None | AALA licence required for under-18 commercial provision; NGB qualifications; DBS enhanced check |
| 526 | Kayak instruction | Scheduled | None | British Canoeing qualifications; AALA licence for under-18s; DBS enhanced check; first aid |
| 527 | Paddleboard instruction | Scheduled | None | British Canoeing or Water Skills Academy qualifications; AALA licence for under-18s; DBS check |
| 528 | Mountain guide | Scheduled | None | Mountain Training qualifications (ML, MIA, MIC, IFMGA); AALA licence for under-18s; CRoW Act 2000 |
| 529 | Hiking guide | Scheduled | None | Mountain Training Lowland Leader or above; DBS check for groups with children; CRoW Act 2000 |
| 530 | Cycling guide | Scheduled | None | British Cycling or CTC qualifications; DBS check; Highway Code compliance |
| 531 | Fishing guide | Scheduled | None | Environment Agency rod licence required; ghillie qualifications vary by fishery; Salmon and Freshwater Fisheries Act 1975 |
| 532 | Shooting instruction | Scheduled | None | Shotgun/firearms certificate per Firearms Act 1968; Home Office approval for shooting ground; CPSA/BASC qualified |
| 533 | Archery instruction | Scheduled | None | Archery GB qualified instructor; DBS check; AALA licence if under-18 commercial provision |
| 534 | Fencing instruction | Scheduled | None | British Fencing qualified coach; DBS check; FIE equipment standards |
| 535 | Martial arts instruction | Scheduled | None | NGB coaching qualifications (varies by discipline); DBS enhanced check; CIMSPA recognition |
| 536 | Personal boxing coaching | Scheduled | None | England Boxing or equivalent NGB coaching qualification; DBS enhanced check; first aid |
| 537 | Sports physiotherapy | Scheduled | None | HCPC registration required; CSP membership expected; professional indemnity insurance |
| 538 | Sports taping | Dispatch | None | Must be qualified sports therapist (SST) or physiotherapist (HCPC); professional indemnity insurance |
| 539 | Pitch/facility hire coordination | Standing-offer | Calendar/availability management | Local authority or private facility hire terms; public liability insurance; Equality Act 2010 accessibility |

### Z. Energy & Utilities

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 540 | Solar panel installation | Scheduled | None | MCS certification required for FIT/SEG eligibility; Building Regulations Part L and Part P; DNO notification |
| 541 | Solar panel cleaning | Scheduled | None | Working at Height Regulations 2005; manufacturer guidance on cleaning methods |
| 542 | Battery storage installation | Scheduled | None | MCS certification; Building Regulations Part P; DNO notification/application; BS 7671 |
| 543 | Heat pump installation | Scheduled | None | MCS certification required for RHI/BUS eligibility; F-gas qualification; Building Regulations Part L |
| 544 | Heat pump servicing | Scheduled | None | F-gas Regulation for refrigerant; MCS-certified maintenance; manufacturer service schedules |
| 545 | Underfloor heating installation | Scheduled | None | Building Regulations Part L and Part P; BS 7671 for electric; BS EN 1264 for water-based |
| 546 | Boiler installation | Scheduled | None | Gas Safe registration mandatory; Building Regulations Part J and Part L; condensate drain compliance |
| 547 | Boiler power flush | Scheduled | None | Gas Safe registration if disturbing gas connections; BS 7593; COSHH for chemical flushing agents |
| 548 | Radiator installation | Scheduled | None | Gas Safe registration if modifying gas boiler system; Building Regulations Part L; BS 7593 |
| 549 | Smart meter installation | Scheduled | None | Ofgem-regulated; MOCoPA accredited engineer; consumer consent; Smart Energy Code |
| 550 | Water softener installation | Scheduled | None | Water Supply (Water Fittings) Regulations 1999; WRAS-approved products; Building Regulations Part G |
| 551 | Water leak detection | Dispatch | None | WIAPS recommended; water company coordination for mains leaks; Building Regulations Part H |
| 552 | Drainage unblocking | Dispatch | None | Building Regulations Part H; public sewer responsibility per Water Industry Act 1991; confined space regulations |
| 553 | Septic tank emptying | Scheduled | None | Environment Agency registration; septic tank general binding rules; Environmental Permitting Regulations 2016 |
| 554 | Oil tank delivery | Relay | None | ADR regulations for petroleum products; OFTEC standards; Control of Pollution (Oil Storage) Regulations 2001 |
| 555 | LPG delivery | Relay | None | ADR regulations for compressed gas transport; UKLPG Code of Practice; Gas Safety Regulations 1998 |
| 556 | Generator hire with operator | Shift | None | Electrical safety per BS 7671; noise regulations; fuel storage regulations |
| 557 | Temporary power supply | Shift | None | BS 7671 for temporary electrical installations; DNO connection agreement if grid-connected |

### AA. Niche & Specialist

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 558 | Antique restoration | Round-trip | None | Consumer Rights Act 2015; insurance for high-value items in transit |
| 559 | Furniture restoration | Round-trip | None | Consumer Rights Act 2015 |
| 560 | Clock/watch restoration | Round-trip | None | Insurance advisable for high-value timepieces |
| 561 | Picture framing | Round-trip | None | None specific |
| 562 | Bookbinding/repair | Round-trip | None | None specific |
| 563 | Knife sharpening | Round-trip | None | Offensive Weapons Act 2019 — restrictions on sending bladed articles; age verification |
| 564 | Tool sharpening | Round-trip | None | None specific |
| 565 | Lawnmower repair | Round-trip | None | None specific |
| 566 | Sewing machine repair | Round-trip | None | None specific |
| 567 | Typewriter repair | Round-trip | None | None specific |
| 568 | Organ tuning | Scheduled | None | Access to churches/venues may require DBS check |
| 569 | Harpsichord tuning | Scheduled | None | None specific |
| 570 | Piano moving | Dispatch | None | Goods in transit insurance; specialist vehicle requirements |
| 571 | Safe moving | Dispatch | None | Goods in transit insurance; heavy lifting H&S regulations |
| 572 | Hot tub delivery | Dispatch | None | Goods in transit insurance; specialist vehicle/crane may be required |
| 573 | Swimming pool construction consultation | Scheduled | None | Planning permission may apply; Building Regulations Part H (drainage) |
| 574 | Borehole drilling consultation | Scheduled | None | Environment Agency abstraction licence may be required |
| 575 | Wine cellar installation | Scheduled | None | Building Regulations may apply; structural considerations |
| 576 | Home brewing consultation | Scheduled | None | HMRC rules on home brewing (no licence needed for personal use) |
| 577 | Cheese making instruction | Scheduled | None | Food Standards Agency registration if selling produce |
| 578 | Pottery instruction | Scheduled | None | None specific |
| 579 | Blacksmithing experience | Scheduled | None | Health & Safety at Work Act 1974; public liability insurance |
| 580 | Glass blowing experience | Scheduled | None | Health & Safety at Work Act 1974; public liability insurance |
| 581 | Woodworking instruction | Scheduled | None | Health & Safety at Work Act 1974; public liability insurance |
| 582 | Upholstery (collection/delivery) | Round-trip | None | Fire safety regulations (Furniture and Furnishings (Fire) (Safety) Regulations 1988) |
| 583 | Leather repair | Round-trip | None | None specific |
| 584 | Luggage repair | Round-trip | None | None specific |
| 585 | Handbag repair | Round-trip | None | None specific |
| 586 | Hat making/millinery | Scheduled | None | None specific |
| 587 | Bespoke shoemaking consultation | Scheduled | None | None specific |
| 588 | Chimney pot replacement | Scheduled | None | Building Regulations; working at height regulations; listed building consent if applicable |
| 589 | Weathervane installation | Scheduled | None | Working at height regulations; planning permission on listed buildings |
| 590 | Lightning conductor installation | Scheduled | None | BS EN 62305 compliance; Building Regulations Part P; competent person scheme |
| 591 | Flagpole installation | Scheduled | None | Planning permission may apply (over 4.6m); advertisement consent if commercial |
| 592 | Sundial installation | Scheduled | None | Planning permission on listed buildings |
| 593 | Water feature installation | Scheduled | None | Building Regulations Part H if mains-connected; electrical safety for pumps |
| 594 | Green roof consultation | Scheduled | None | Planning permission may apply; Building Regulations (structural load) |
| 595 | Living wall installation | Scheduled | None | Planning permission on listed buildings; structural assessment may be needed |
| 596 | Beehive installation | Scheduled | None | NBU best practice guidelines; no licence required |
| 597 | Bat box installation | Scheduled | None | Wildlife and Countryside Act 1981 — protected species; Natural England guidance |
| 598 | Owl box installation | Scheduled | None | Wildlife and Countryside Act 1981 if near active nests; working at height regulations |
| 599 | Hedgehog house installation | Scheduled | None | Wildlife and Countryside Act 1981 (hedgehogs are protected) |
| 600 | Composting system installation | Scheduled | None | Environmental Permitting Regulations if large-scale; none for domestic |

### AB. Cultural & Ceremonial

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 601 | Wedding officiant (humanist) | Scheduled | None | Not legally binding in England/Wales (legal ceremony required separately); legally recognised in Scotland |
| 602 | Funeral celebrant | Scheduled | None | No statutory regulation; voluntary registration with professional bodies |
| 603 | Naming ceremony officiant | Scheduled | None | No legal standing; no regulation |
| 604 | Vow renewal officiant | Scheduled | None | No legal standing; no regulation |
| 605 | Religious ceremony celebrant | Scheduled | None | Must comply with denomination requirements; registered building for legally binding ceremonies |
| 606 | Cultural event MC | Scheduled | None | Premises licence or TEN if applicable; public liability insurance |
| 607 | Ceremonial guard of honour | Scheduled | None | SIA licence if providing security function; otherwise none specific |
| 608 | Piper/bagpiper | Scheduled | None | Noise nuisance regulations; council event permissions if outdoors |
| 609 | Town crier | Scheduled | None | Local authority permission for public spaces |
| 610 | Toastmaster | Scheduled | None | None specific |
| 611 | Herald | Scheduled | None | None specific |
| 612 | Traditional craft demonstration | Scheduled | None | Public liability insurance; risk assessment for live demonstrations |

### AC. Food & Drink

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 613 | Private chef (in-home) | Scheduled | None | Food hygiene certificate (Level 2 minimum); FSA registration if operating as food business; allergen regulations (Natasha's Law) |
| 614 | Meal prep service | Scheduled | None | FSA registration; food hygiene certificate; allergen labelling (Natasha's Law); food safety management (HACCP) |
| 615 | Cooking instruction (in-home) | Scheduled | None | Food hygiene certificate advisable; public liability insurance |
| 616 | Wine tasting (in-home) | Scheduled | None | Personal licence not required for private events; alcohol duty paid on purchased stock |
| 617 | Beer tasting experience | Scheduled | None | No premises licence needed for private in-home tastings |
| 618 | Cocktail making instruction | Scheduled | None | No premises licence needed for private in-home instruction |
| 619 | Barista training | Scheduled | None | Food hygiene certificate advisable |
| 620 | Food styling | Scheduled | None | None specific |
| 621 | Cake making instruction | Scheduled | None | Food hygiene certificate advisable; allergen awareness |
| 622 | Bread making instruction | Scheduled | None | Food hygiene certificate advisable; allergen awareness |
| 623 | BBQ catering | Dispatch | None | FSA registration; food hygiene certificate; gas safety if using LPG; fire risk assessment |
| 624 | Hog roast catering | Dispatch | None | FSA registration; food hygiene certificate; fire risk assessment; specialist vehicle requirements |
| 625 | Pizza oven catering | Dispatch | None | FSA registration; food hygiene certificate; fire risk assessment; gas safety if applicable |
| 626 | Afternoon tea catering | Dispatch | None | FSA registration; food hygiene certificate; allergen labelling (Natasha's Law) |
| 627 | Food truck booking | Scheduled | None | FSA registration; street trading licence from local authority; food hygiene rating; vehicle insurance |

### AD. Childcare & Family

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 628 | Emergency babysitting | Dispatch | None | Enhanced DBS check required; Ofsted registration if caring for children under 8 for more than 2 hours |
| 629 | Night nanny | Scheduled | None | Enhanced DBS check; Ofsted registration for regular arrangements; paediatric first aid certificate advisable |
| 630 | Newborn photographer | Scheduled | None | Enhanced DBS check advisable; public liability insurance; newborn safety training recommended |
| 631 | Maternity nurse | Scheduled | None | Enhanced DBS check; NMC registration if qualified nurse; paediatric first aid certificate |
| 632 | Postnatal doula | Scheduled | None | Enhanced DBS check; no statutory regulation (voluntary registration with Doula UK or similar) |
| 633 | Antenatal instructor (home visit) | Scheduled | None | Enhanced DBS check; professional indemnity insurance |
| 634 | Baby massage instructor | Scheduled | None | Enhanced DBS check; IAIM or equivalent certification advisable |
| 635 | Baby first aid instructor | Scheduled | None | Enhanced DBS check; first aid instructor qualification (Ofqual-regulated); public liability insurance |
| 636 | Child party entertainer | Scheduled | None | Enhanced DBS check required; public liability insurance; risk assessment for activities |
| 637 | Face painter (children's party) | Scheduled | None | Enhanced DBS check required; cosmetic product safety regulations; allergy-safe products |
| 638 | Balloon artist (children's party) | Scheduled | None | Enhanced DBS check required; public liability insurance; choking hazard awareness |
| 639 | Children's disco DJ | Scheduled | None | Enhanced DBS check required; PAT testing on electrical equipment; noise level compliance |
| 640 | Santa visit | Scheduled | None | Enhanced DBS check required; public liability insurance |

### AE. Digital-Physical Bridge

| # | Use Case | Pattern | New Capabilities? | Regulatory Notes |
|---|----------|---------|-------------------|-----------------|
| 641 | QR code installation | Scheduled | None | Planning permission if affixed to listed buildings or in conservation areas |
| 642 | NFC tag programming/installation | Scheduled | None | Data protection (UK GDPR) if tags collect personal data; Wireless Telegraphy Act 2006 |
| 643 | Digital menu board installation | Scheduled | None | Building Regulations Part P (electrical); advertising consent if externally visible |
| 644 | Interactive kiosk installation | Scheduled | None | Building Regulations Part P; accessibility requirements (Equality Act 2010); UK GDPR if processing personal data |
| 645 | Beacon installation (Bluetooth) | Scheduled | None | UK GDPR and PECR if tracking individuals; Wireless Telegraphy Act 2006 compliance |
| 646 | Digital signage content update (on-site) | Dispatch | None | ASA codes; planning permission for external signage |
| 647 | IoT sensor installation | Scheduled | None | Building Regulations Part P; UK GDPR if sensors collect personal data |
| 648 | Smart lock installation | Scheduled | None | Building Regulations; fire safety considerations (means of escape); insurance implications |
| 649 | EV chargepoint installation | Scheduled | None | OZEV grant scheme compliance; Building Regulations Part P; IET Wiring Regulations (BS 7671); DNO notification |

### Sector Catalogue Summary

| Sector | Count | Dominant Pattern |
|--------|-------|-----------------|
| A. Construction & Property | 25 | Dispatch/Scheduled |
| B. Property Management & Real Estate | 14 | Scheduled |
| C. Automotive | 19 | Dispatch |
| D. Marine & Waterway | 16 | Scheduled/Dispatch |
| E. Aviation & Drone | 11 | Scheduled |
| F. Agriculture & Rural | 21 | Dispatch/Scheduled |
| G. Professional Services | 26 | Scheduled |
| H. IT & Technology | 17 | Dispatch |
| I. Creative & Design | 17 | Dispatch/Scheduled |
| J. Events & Entertainment | 25 | Scheduled/Shift |
| K. Health & Wellness | 32 | Scheduled |
| L. Education & Training | 18 | Scheduled |
| M. Legal & Compliance | 12 | Scheduled/Dispatch |
| N. Inspection & Certification | 27 | Scheduled |
| O. Environmental & Waste | 18 | Scheduled/Dispatch |
| P. Funeral & End-of-Life | 10 | Scheduled/Relay |
| Q. Fashion & Personal | 20 | Dispatch/Round-trip |
| R. Animal & Equine | 18 | Dispatch/Scheduled |
| S. Seasonal & Weather | 13 | Scheduled |
| T. Accessibility & Disability | 15 | Scheduled |
| U. Storage & Logistics | 17 | Relay |
| V. Government & Civic | 14 | Dispatch/Shift |
| W. P2P & Sharing Economy | 18 | Standing-offer |
| X. B2B & Commercial | 26 | Scheduled |
| Y. Sport & Recreation | 21 | Scheduled |
| Z. Energy & Utilities | 18 | Scheduled |
| AA. Niche & Specialist | 43 | Round-trip/Scheduled |
| AB. Cultural & Ceremonial | 12 | Scheduled |
| AC. Food & Drink | 15 | Scheduled |
| AD. Childcare & Family | 13 | Scheduled |
| AE. Digital-Physical Bridge | 9 | Scheduled |
| **Total** | **580** | |

Of the 580 new use cases, **~565 require zero protocol changes** — they are new tag values on existing coordination
patterns. Only ~15 surface minor capability needs (credential verification tags, multi-party coordination, temperature
monitoring, data sanitisation states), most of which are domain-specific operator logic rather than protocol-level
additions.

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

#### Gap 6: Deliverable Tracking — Demand: ~50 domains (NEW)

**What it is**: A standard mechanism for tracking the submission and acceptance of deliverables — reports, certificates,
assessments, or other documents produced as service output. Many services produce a document rather than (or in addition
to) a physical change: a building surveyor produces a survey report, a PAT tester produces a certificate, a fire risk
assessor produces an assessment document, a photographer delivers edited images, a solicitor delivers signed documents.

**Why it matters**: The comprehensive sector catalogue (Part 5c) reveals that ~50 use cases across the inspection,
professional services, and creative sectors produce deliverables as their primary output. Without a standard deliverable
proof type, these services cannot use the protocol's completion proof mechanism to trigger stake release.

**Current state**: **Partially closed**. The `deliverable` completion proof type has been added to the Completion Proof
Types table in TROTT-01. The deliverable itself is referenced by hash or URL in the `proof_data` tag, using the same
mechanism as photo proof. This provides a standard way for providers to declare "here is the document I produced" and
for requesters to verify receipt before confirming completion.

**Spec work needed**: The basic mechanism exists. Remaining work is around deliverable acceptance workflows (requester
reviews document, requests revisions, accepts final version) which could be modelled as sub-states within `in_progress`.
Low effort.

#### Gap 7: Certification Standardisation — Demand: ~50 domains (NEW)

**What it is**: Standardised `credential_type` values for the high-volume inspection and certification sector. The
existing Credential Types table in TROTT-03 (kind 30522) defines 10 generic types (trade_licence, background_check,
etc.) but lacks specific types for the ~27 inspection use cases and the marine/aviation sectors.

**Why it matters**: The inspection & certification sector alone contributes 27 use cases to the catalogue, each
requiring providers to hold specific certifications (Gas Safe, UKAS accreditation, LOLER competent person, etc.). The
marine and aviation sectors add another ~27 use cases with domain-specific qualifications (RYA Yachtmaster, CAA GVC,
MCA certification). Standardised credential types enable automated provider matching — an operator can filter for
providers holding the required certification without manual verification.

**Current state**: **Partially closed**. Four new credential types have been added to the kind 30522 Credential Types
table in TROTT-03: `inspection_certificate`, `environmental_licence`, `maritime_certification`, and
`aviation_certification`. These cover the highest-volume sectors identified by the catalogue.

**Spec work needed**: The four new types cover the majority of demand. Additional types may be needed as domain
profiles are implemented (e.g. `construction_competence`, `food_hygiene`), but these can be added incrementally.
Low effort remaining.

#### Gap 8: Guarantee / Warranty Period — Demand: ~28 domains (reinforced)

**What it is**: A post-completion warranty period during which the provider guarantees their work. If the work fails
within the guarantee period, a linked follow-up task is created referencing the original, with the provider obligated
to remediate at no additional cost.

**Why it matters**: Essential for trades (plumbing, electrical, pest control, mobile mechanic, boiler servicing,
appliance repair, smart home installation, aerial installation) and security (guard dispatch post-incident review).
Without guarantee tracking, there is no protocol-level mechanism to hold providers accountable for the durability of
their work. The expanded catalogue significantly reinforces this demand.

**Current state**: Modelled informally as linked tasks with a `guarantee` relationship type in the state machine
documents. No formal spec exists. The `linked_task` tag provides a building block.

**Spec work needed**: Define a guarantee period event type with duration, terms, and activation conditions. Specify
how guarantee claims create linked tasks with preferential matching to the original provider.

#### Gap 9: Beneficiary Pubkey — Demand: ~6 domains (CLOSED)

**Current state**: **Closed**. TROTT-01 now defines `beneficiary_pubkey` as an optional party tag. TROTT-06 defines
PII handling guidance for beneficiaries.

#### Gap 10: Round-Trip Relay — Demand: ~5 domains (CLOSED)

**Current state**: **Closed**. TROTT-01 now defines `round_trip` as a `linked_task` relationship type.

#### Gap 11: Three-Party Coordination — Demand: 1 domain (unchanged)

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

| Priority | Gap | Demand | Spec Effort | Status |
|----------|-----|--------|-------------|--------|
| 1 | Duration tracking | ~110 | Medium | Reinforced — highest priority |
| 2 | Quote negotiation | ~80 | Already in spec (kind 30530) | Mostly closed |
| 3 | Hourly rate pricing | ~66 | Low (remaining) | Partially closed (`rate_unit` tag added to TROTT-04) |
| 4 | Recurring scheduling | ~65 | Medium (remaining) | Partially closed (kind 30509 exists) |
| 5 | Deliverable tracking (NEW) | ~50 | Low | New — `deliverable` completion proof type added to TROTT-01 |
| 6 | Certification standardisation (NEW) | ~50 | Low | New — 4 credential types added to TROTT-03 kind 30522 |
| 7 | Guarantee period | ~28 | Low | Reinforced |
| 8 | Beneficiary pubkey | ~6 | — | **Closed** (added to TROTT-01, TROTT-06) |
| 9 | Round-trip relay | ~5 | — | **Closed** (added to TROTT-01 linked tasks) |
| 10 | Three-party coordination | 1 | High | Unchanged |

> **Note**: The expanded 649-use-case catalogue significantly increases demand estimates. Gaps 8 and 9 have been closed
> by spec additions in TROTT-01, TROTT-04, and TROTT-06. **Gaps 5 and 6 are new** — surfaced by the volume of
> inspection, professional service, and creative service use cases in the comprehensive sector catalogue. Gap 5 has been
> partially closed by adding `deliverable` as a completion proof type in TROTT-01. Gap 6 has been partially closed by
> adding 4 new credential types (`inspection_certificate`, `environmental_licence`, `maritime_certification`,
> `aviation_certification`) to the kind 30522 Credential Types table in TROTT-03.

---

## Part 8: Protocol Fit Scoring Rubric

The following rubric provides a formal, repeatable method for evaluating whether a use case is a natural fit for the TROTT protocol. It is designed to be used during domain triage — before committing to a domain profile or spec work.

### Scoring Dimensions

| # | Dimension | Weight | 1 (Low Fit) | 5 (High Fit) |
|---|-----------|--------|-------------|---------------|
| 1 | Trust deficit | 25% | Parties know each other well | Total strangers, high stakes |
| 2 | Task discreteness | 20% | Continuous, indefinite engagement | Clear start, clear end |
| 3 | Stranger interaction | 15% | Always the same provider | Different provider every time |
| 4 | Verifiable completion | 15% | Purely subjective outcome | GPS, photo, signature proof |
| 5 | Time-boundedness | 10% | Months or years | Minutes or hours |
| 6 | Location relevance | 5% | Fully virtual | Location IS the service |
| 7 | Payment clarity | 5% | Unknowable until done | Fixed price or clear formula |
| 8 | Ghosting risk | 5% | No risk of non-attendance | Chronic industry problem |

### How to Use

Score each dimension from 1 to 5 based on the descriptions above. Multiply each score by its weight (expressed as a decimal — e.g. 25% = 0.25). Sum the weighted scores to produce a weighted average between 1.0 and 5.0. Multiply by 2 to produce a score out of 10. The weights sum to 100%, so the maximum weighted average is 5.0 (all dimensions scoring 5), yielding a maximum score of 10.0/10.

### Worked Examples

**Example 1: Locksmith dispatch — Score: 9.9/10**

| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Trust deficit | 5 | 0.25 | 1.25 |
| Task discreteness | 5 | 0.20 | 1.00 |
| Stranger interaction | 5 | 0.15 | 0.75 |
| Verifiable completion | 5 | 0.15 | 0.75 |
| Time-boundedness | 5 | 0.10 | 0.50 |
| Location relevance | 5 | 0.05 | 0.25 |
| Payment clarity | 4 | 0.05 | 0.20 |
| Ghosting risk | 5 | 0.05 | 0.25 |
| **Weighted average** | | | **4.95** |
| **Score (x2)** | | | **9.9/10** |

Rationale: Total stranger enters your home under duress (locked out). High stakes, high trust deficit. The task is perfectly discrete (lock opened = done). You use a different locksmith each time. GPS arrival and photo proof are verifiable. The engagement lasts 30 minutes to 2 hours. Location IS the service. Payment is quoted upfront but may vary if the access method changes (hence 4, not 5). Ghosting and scam quotes are the defining industry problem. This is as close to a perfect protocol fit as exists.

**Example 2: Novel writing assistance — Score: 2.8/10**

| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Trust deficit | 2 | 0.25 | 0.50 |
| Task discreteness | 1 | 0.20 | 0.20 |
| Stranger interaction | 1 | 0.15 | 0.15 |
| Verifiable completion | 1 | 0.15 | 0.15 |
| Time-boundedness | 1 | 0.10 | 0.10 |
| Location relevance | 1 | 0.05 | 0.05 |
| Payment clarity | 2 | 0.05 | 0.10 |
| Ghosting risk | 3 | 0.05 | 0.15 |
| **Weighted average** | | | **1.40** |
| **Score (x2)** | | | **2.8/10** |

Rationale: You typically choose a writing assistant through recommendation or portfolio review, not emergency dispatch (trust deficit 2). The engagement spans months with no clear "done" state — the novel is always revisable (discreteness 1). You build a long-term working relationship with one person (stranger interaction 1). Quality is entirely subjective — no GPS trace proves a good chapter (verifiable completion 1). The engagement runs for months or years (time-boundedness 1). The work is fully virtual (location relevance 1). Scope is unknowable at the outset (payment clarity 2). There is some risk of a commissioned writer disappearing mid-project, but this is managed through milestones and contracts rather than real-time coordination (ghosting risk 3).

**Example 3: Gym membership — Score: 3.3/10**

| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Trust deficit | 1 | 0.25 | 0.25 |
| Task discreteness | 2 | 0.20 | 0.40 |
| Stranger interaction | 1 | 0.15 | 0.15 |
| Verifiable completion | 2 | 0.15 | 0.30 |
| Time-boundedness | 1 | 0.10 | 0.10 |
| Location relevance | 3 | 0.05 | 0.15 |
| Payment clarity | 5 | 0.05 | 0.25 |
| Ghosting risk | 1 | 0.05 | 0.05 |
| **Weighted average** | | | **1.65** |
| **Score (x2)** | | | **3.3/10** |

Rationale: You trust the gym brand and its premises — there is no stranger entering your home (trust deficit 1). Each visit is loosely discrete, but the membership itself is a continuous, indefinite relationship (task discreteness 2). You go to the same gym with the same staff (stranger interaction 1). An entry scan proves attendance but not workout quality (verifiable completion 2). The membership runs for months or years (time-boundedness 1). You do travel to a specific location, but it is facility access rather than a dispatched service (location relevance 3). The monthly fee is completely fixed and transparent (payment clarity 5). The gym building does not fail to show up — there is no ghosting risk whatsoever (ghosting risk 1). The protocol's core value proposition (trust between strangers) simply does not apply.

### Threshold Bands

| Score Range | Classification | Description |
|-------------|---------------|-------------|
| **8.0 -- 10.0** | Natural fit | Protocol primitives directly solve the trust problem. The use case exhibits high trust deficit, discrete tasks, stranger interaction, and verifiable completion. Implement as a domain profile with minimal adaptation. |
| **6.0 -- 7.9** | Good fit with adaptation | Works well but may need domain-specific extensions (additional sub-states, custom proof types, or regulatory credential checks). Worth building if market demand justifies the spec work. |
| **4.0 -- 5.9** | Partial fit | Some protocol value (e.g. reputation portability or payment escrow) but significant limitations. Often a sign that only a component of the use case fits — extract that component rather than forcing the whole use case into the protocol. |
| **2.0 -- 3.9** | Poor fit | Protocol adds little value. The use case likely violates 2+ foundational assumptions (e.g. no discrete tasks AND no stranger interaction). Better served by other coordination models (employment contracts, subscription platforms, marketplaces). |
| **0.0 -- 1.9** | Does not fit | Violates foundational assumptions across the board. Attempting to use the protocol would produce worse outcomes than existing alternatives. |

---

## Part 9: Hard Boundaries — What Doesn't Fit

The protocol is powerful but not universal. The following use cases fundamentally cannot be served by TROTT, regardless of adaptation effort. Each explanation references the scoring rubric dimensions to make the reasoning auditable.

### 1. Ongoing employment relationships

No terminal state, no task discreteness, employer control axis. The Supreme Court's decision in *Uber BV v Aslam* [2021] UKSC 5 demonstrated that price-setting combined with rating-based work allocation creates an employment relationship. The protocol's task-completion state machine (`requested -> ... -> confirmed`) assumes a discrete engagement with a clear endpoint. An ongoing employment relationship has no `confirmed` state — it is indefinite by design. Attempting to model employment as a series of protocol tasks risks misclassifying workers as independent contractors. **Fails: task discreteness (1), stranger interaction (1), time-boundedness (1).**

### 2. Continuous process manufacturing

No discrete tasks, no matching phase, no completion events. A chemical plant, oil refinery, or steel mill runs 24/7 as a continuous process with no natural start/end points for the protocol's state machine. There is no requester dispatching a provider — the workforce is permanently on-site. The protocol's entire lifecycle model (request, match, coordinate, complete, confirm) is structurally incompatible with continuous operations. **Fails: task discreteness (1), stranger interaction (1), time-boundedness (1).**

### 3. Pure financial instruments

No physical service component, no location relevance, no completion proof. Trading equities, bonds, derivatives, or foreign exchange involves digital transactions between counterparties with no physical presence requirement. The protocol's three-layer architecture (Nostr discovery, operator coordination, WebSocket tracking) provides no value over existing financial infrastructure. Securities trading has its own well-established protocols (FIX, SWIFT) and regulatory frameworks (FCA, SEC) that are purpose-built for this domain. **Fails: location relevance (1), verifiable completion (1), stranger interaction (varies).**

### 4. Mass-produced commodity goods

No per-unit coordination needed between strangers. Purchasing a pack of biscuits from a supermarket, buying petrol at a filling station, or ordering stationery online involves standardised goods at posted prices with no trust negotiation. The requester does not need to find, vet, and coordinate with a specific provider — they simply select from available inventory. There is no ghosting risk (the shelf is stocked or it is not) and no trust deficit (the product is identical regardless of who sells it). **Fails: trust deficit (1), stranger interaction (1), ghosting risk (1).**

### 5. Government sovereign functions

Monopoly authority precludes competitive matching. You cannot choose which police force responds to your 999 call, which court hears your case, or which border agent processes your passport. The protocol's core model — multiple competing providers offering services to requesters — is structurally incompatible with sovereign monopoly functions. There is no "discovery" phase when the provider is determined by jurisdiction, and no "offer" phase when the provider cannot decline. Some adjacent functions (e.g. outsourced prisoner transport, contracted court interpreter services) may fit, but the sovereign function itself does not. **Fails: stranger interaction (1, single mandated provider), task discreteness (varies), trust deficit (1, legally mandated trust).**

### 6. Long-duration subjective creative work

No verifiable completion point, no objective "done" state. "Write me a symphony," "design my brand identity," or "produce my album" are creative engagements where quality is inherently subjective and the endpoint is determined by artistic judgement rather than measurable criteria. The protocol relies on verifiable completion (GPS traces, photos, signatures, timestamps) to trigger stake release — but no cryptographic proof can attest that a piece of music is "finished." Individual deliverables within a creative project (e.g. a recording session, a photo shoot) may fit, but the creative project as a whole does not. **Fails: verifiable completion (1), task discreteness (1), time-boundedness (1).**

### 7. Pure digital goods with zero marginal cost

No scarcity, no location, no physical handover. Selling a PDF, streaming a song, or distributing software involves digital goods that can be copied infinitely at zero marginal cost. There is no provider who must physically travel somewhere, no stake needed to prevent ghosting (the file is either delivered or it is not), and no location-dependent service. Existing digital distribution platforms (app stores, streaming services, marketplaces) solve this problem effectively. The protocol's overhead (discovery, matching, stakes, real-time coordination) adds friction without adding trust. **Fails: location relevance (1), ghosting risk (1), stranger interaction (1).**

### 8. Relationship-dependent therapy

The therapeutic relationship IS the product. Cognitive behavioural therapy, psychotherapy, counselling, and psychoanalysis depend on a sustained, trusted relationship between therapist and client built over weeks, months, or years. The protocol is designed for stranger coordination — efficiently matching people who have never met. In therapy, matching is only the first step; the ongoing relationship is where all the value resides. Switching providers (a core protocol feature) would be actively harmful. Commitment stakes are inappropriate when the "risk" is not ghosting but therapeutic rupture. **Fails: stranger interaction (1), task discreteness (1), time-boundedness (1).**

### Key Insight

A use case fails the protocol when it lacks two or more of the five foundational assumptions:

1. **Discrete tasks** — a clear start and a clear end
2. **Stranger interaction** — the parties do not have a pre-existing relationship
3. **Verifiable completion** — objective evidence that the work was done
4. **Time-bounded** — the engagement completes in minutes, hours, or at most days
5. **Asymmetric roles** — a requester needs something and a provider delivers it

Any use case missing one assumption can often be adapted (e.g. virtual tutoring lacks location relevance but fits on every other dimension). When two or more assumptions fail simultaneously, the protocol's fundamental model breaks down — the state machine has no terminal state, the discovery mechanism has no matching criteria, the stake mechanism has no completion trigger, or the reputation system has no discrete event to rate.

---

## Part 10: Boundary Cases

The most interesting analytical work happens at the protocol's boundaries — use cases that partially fit, where honest assessment reveals which components benefit from TROTT and which do not.

### 1. Auction / Bidding — 6/10 (service) / 2/10 (goods)

Service auctions ("who can clean my house cheapest this Saturday?") map directly to the quoting phase: a Task Request (kind 30500) receives multiple Task Offers (kind 30501), each with competing `amount` and `currency` tags. The requester selects the best offer and publishes a Task Accept (kind 30502). This is the protocol's native competitive quoting flow. Goods auctions (eBay-style bidding on physical objects) lack the physical service component — there is no provider travelling to a location, no real-time coordination, and no in-progress state. The delivery leg of a goods auction is a protocol fit; the auction itself is not.

### 2. Subscription Services — 8/10 (recurring scheduled) / 2/10 (facility access)

Recurring scheduled services (weekly house cleaning, monthly pest inspection, fortnightly dog grooming) are an excellent fit. The Recurring Series event (kind 30509) manages the series lifecycle, each instance is an independent Task Request with a `linked_task` recurrence relationship, and commitment stakes protect both parties against no-shows. Facility access subscriptions (gym membership, streaming service, co-working space) score poorly — there is no discrete task, no stranger interaction, no provider dispatch, and no completion event. The subscription is a payment relationship, not a coordination relationship.

### 3. Marketplaces — 3/10 (overall) / 9/10 (delivery component)

A marketplace like Etsy or eBay coordinates the sale of goods, not the delivery of services. The listing, negotiation, and payment phases involve goods commerce that the protocol is not designed for — there is no provider en route, no real-time tracking, and no physical service completion. However, the delivery leg (collect the parcel from the seller, transport it, deliver to the buyer with signature proof) is a textbook relay delivery task. The protocol's value to marketplaces is as a logistics layer, not as the marketplace itself. A marketplace operator could integrate TROTT specifically for the last-mile delivery component while handling goods commerce through conventional means.

### 4. Long-Duration Projects — 3/10 (project) / 8/10 (individual trades)

A house renovation is not a discrete task — it spans weeks or months, involves dozens of decisions, and has no single completion event. The protocol's state machine cannot represent "renovate my kitchen" as a single task. However, each individual trade callout within the renovation — the plumber installing the sink, the electrician wiring the cooker, the plasterer skimming the walls — is a perfect protocol fit. The insight is decomposition: a project management tool handles the project; TROTT handles each provider engagement within it. The `linked_task` tag with a project-specific identifier provides traceability from individual tasks back to the parent project, without requiring the protocol itself to model project management.

### 5. Wedding Planning — 4/10 (planning) / 8/10 (vendor engagements)

Wedding planning as a whole is a months-long, emotionally charged, subjective project with no clear "done" state until the day itself. The protocol cannot represent "plan my wedding" as a task. But each vendor engagement within the wedding — the florist delivering arrangements at 09:00, the photographer arriving at 11:00, the caterer setting up at 14:00, the band performing from 19:00 to 23:00 — is a discrete, time-bounded, location-specific task with verifiable completion (arrived on time, delivered as specified, performed for the agreed duration). Stakes are particularly valuable here: a no-show florist on the morning of a wedding is catastrophic and difficult to replace at short notice. The commitment stake mechanism directly addresses the highest-anxiety failure mode in wedding logistics.

### 6. Insurance-Like Models — 5/10 (overall) / 9/10 (emergency dispatch)

Home emergency cover (British Gas HomeCare, HomeServe) is a retainer — the customer pays a monthly fee for the promise of future service. The retainer itself is not a protocol fit: there is no discrete task, no matching phase, and no completion event until something breaks. However, the moment a pipe bursts at 02:00 and the customer calls for an emergency plumber, the engagement becomes a textbook dispatch task: urgent matching, provider en route, arrival, assessment, quote, repair, completion, confirmation. The protocol's value is in the dispatch and coordination layer, not in the insurance/retainer layer. An insurance provider could use TROTT as its dispatch backbone while handling the retainer, risk pooling, and premium calculations through conventional insurance infrastructure.

### 7. Retainer Relationships — 3/10 (retainer) / 7/10 (individual engagements)

A solicitor on retainer, an accountant on annual contract, or an IT support company on a managed service agreement — these are ongoing relationships where the client pays for availability and priority access. The retainer itself is a relationship, not a task. However, each specific engagement triggered by the retainer (witness this will, review this contract, fix this server, file this return) is a discrete task with a clear start, identifiable provider, verifiable deliverable, and natural endpoint. The score is 7/10 rather than 8/10 for individual engagements because the provider is typically pre-determined (the whole point of a retainer is guaranteed access to a specific provider), reducing the stranger interaction and discovery dimensions.

---

## Part 11: Potential New Coordination Patterns

The protocol currently defines seven coordination patterns: **dispatch**, **relay delivery**, **scheduled**, **trip**, **shift/patrol**, **crew/multi-provider**, and **round-trip**. These patterns, combined with 9 domain profiles, cover the 649 documented use cases. The following six patterns have been identified at the boundaries of the current protocol as potential future additions.

These are documented for future consideration only. They are NOT immediate spec work.

### 1. Barter / Swap

**Description:** Bidirectional simultaneous exchange where both parties are simultaneously requester and provider. "I'll fix your plumbing if you fix my electrics." Each party stakes their own service commitment, and completion of one leg is contingent on (or at least linked to) completion of the other.

**Estimated use case count:** ~5 (skill swaps, time banks, community exchange, tool lending circles, reciprocal childcare).

**Protocol change required:** Low. Model as two linked tasks with a new `barter` relationship type on the `linked_task` tag. Each task follows its own normal lifecycle (request, accept, in_progress, completed, confirmed) but the two tasks reference each other bidirectionally. Stake release on task A could be gated on confirmation of task B, though this is operator logic rather than protocol-level enforcement.

### 2. Relay Chain

**Description:** Multi-hop delivery through multiple independent providers in sequence. A parcel passes through 3 couriers to reach a remote destination — courier 1 covers the first 50 miles, hands off to courier 2 at a depot, courier 2 covers the next 100 miles, and courier 3 handles last-mile delivery. Each handover is a chain-of-custody event.

**Estimated use case count:** ~5 (long-distance parcel relay, rural last-mile delivery, cross-border courier chains, multi-modal freight, humanitarian aid distribution).

**Protocol change required:** Medium. The existing Leg Plan (kind 30508) handles multi-leg journeys with a single provider. Relay chains need a chain-of-custody handover event between independent providers — each handover is a mini-completion/acceptance cycle. The `linked_task` tag with an `escalation` or new `relay_handover` relationship type could connect the legs, but the handover protocol (signatures, condition verification, custody transfer) needs formal definition.

### 3. Broadcast / One-to-Many

**Description:** A single provider serving multiple requesters simultaneously. A yoga instructor teaching a class, a tour guide leading a group, a surf instructor with 6 students, an event DJ performing for 200 attendees. The provider publishes availability; multiple requesters independently book slots in the same session.

**Estimated use case count:** ~10 (group fitness classes, guided tours, group music lessons, shared workshops, cooking classes, group surf/ski lessons, public lectures, open studio sessions, community events, group therapy sessions).

**Protocol change required:** Low. Model as multiple independent tasks sharing a provider and a time slot, structurally identical to how shared rides are handled — each requester's task is independent (own lifecycle, own payment, own rating) but linked via `linked_task` with a `shared_session` relationship type. The provider's Task Offer (kind 30501) could include a `capacity` tag indicating how many requesters can join. The existing `shared_ride` pattern in TROTT-01 already demonstrates this model.

### 4. Standing Offer

**Description:** A permanently available service at a fixed price, not triggered by a specific request. "I sharpen knives every Tuesday at the farmers' market." "I offer passport photos, walk-ins welcome, 9-5 weekdays." The provider advertises persistent availability; requesters arrive ad hoc without pre-matching.

**Estimated use case count:** ~8 (market stall services, walk-in repairs, pop-up shops, street food vendors, mobile services with fixed routes, community skill shares, tool library lending, recurring open workshops).

**Protocol change required:** Low-medium. The Provider Profile (kind 30510) already advertises capabilities and service areas, but it describes the provider rather than a specific standing offer. A standing offer needs a persistent availability event — distinct from both the ephemeral Provider Availability (kind 20500, which signals current real-time availability) and the Task Request (kind 30500, which is a one-off request). This could be modelled as a long-lived Task Offer (kind 30501) with no referencing Task Request, combined with a `standing_offer` tag. The key distinction is that requesters respond to the offer rather than the provider responding to a request — the flow is inverted.

### 5. Conditional / Triggered

**Description:** Task activation dependent on an external event or condition. "If temperature drops below -2C overnight, grit my driveway." "If my house alarm triggers while I'm on holiday, send a security guard." "If my flight is cancelled, book me a taxi home." The task exists in a dormant state until an external trigger activates it.

**Estimated use case count:** ~5 (weather-triggered gritting/snow clearance, alarm-triggered security response, event-triggered transport, IoT-triggered maintenance, threshold-triggered environmental monitoring).

**Protocol change required:** Medium. Needs a dormant/conditional state in the state machine (before `requested`) and an external oracle integration to trigger activation. The oracle could be a weather API, an IoT sensor, a flight status API, or any external data source. The protocol would need to define how conditions are expressed (condition tags on a dormant Task Request), how oracles are authenticated (signed trigger events), and how activation transitions the task from dormant to `requested`. This is the most architecturally novel pattern — it introduces external dependencies into a protocol that currently assumes human-initiated task creation.

### 6. Nested / Hierarchical

**Description:** A parent task that spawns child tasks. A house renovation spawning individual trade callouts. An event setup spawning catering, AV, security, and decoration tasks. A fleet maintenance schedule spawning individual vehicle service tasks. The parent tracks overall progress; children are independently coordinated.

**Estimated use case count:** ~15 (house renovation, event management, fleet maintenance, facility management, construction project management, wedding logistics, office relocation, restaurant opening, festival coordination, school maintenance programme, property portfolio management, franchise rollout, seasonal changeover, disaster recovery, supply chain coordination).

**Recommendation:** Keep tasks flat at the protocol level. Nesting is operator logic, not protocol logic. The `linked_task` tag with relationship types (`follow_up`, `escalation`, `recurrence`, `shared_ride`, `round_trip`, `guarantee`) already provides sufficient linkage between related tasks. A parent-child hierarchy can be modelled by having all child tasks reference a common parent identifier via `linked_task` with a `subtask` relationship type — but the protocol itself should not enforce hierarchical state propagation (e.g. "if the parent is cancelled, cancel all children"). That logic belongs in the operator's coordination layer, where project-specific business rules determine cascading behaviour. Adding hierarchical state management to the protocol would introduce significant complexity for a pattern that is better served by project management tools sitting above the protocol.

### Closing Note

These six patterns are documented for future consideration, not immediate specification work. The protocol's existing seven patterns (dispatch, relay delivery, scheduled, trip, shift/patrol, crew/multi-provider, and round-trip) cover the 649 documented use cases across 9 domain profiles. New coordination patterns should only be formalised into the protocol specification when real-world demand demonstrates that the pattern cannot be adequately modelled using existing primitives. The bar for adding a new pattern is deliberately high: each new pattern increases implementation complexity for every TROTT client. The preferred approach is to demonstrate the pattern works using existing building blocks (linked tasks, custom tags, operator logic) before promoting it to a first-class protocol concept.

---

## Key Insight

The protocol's core primitive — cryptographic commitment between strangers with slashable stakes — solves trust problems
that exist in every service marketplace. The industries where trust is most broken (locksmiths, emergency trades,
removals) are where the protocol's value is most immediately obvious. Healthcare is the highest-value long-term
opportunity but requires the most careful regulatory navigation.

The generalisation architecture (domain profiles) means adding a new use case requires ~100 lines of configuration
rather than a fork. The payment providers, reputation system, authentication middleware, and dispute resolution
all work unchanged across every domain.

The expanded catalogue of **649 use cases** (up from 69) validates this design thesis: **~565 of the 580 new use cases
require zero protocol changes** — they map directly to existing coordination patterns with different tag values. Only
1 new completion proof type (`deliverable`) and 4 new credential type values were needed. The remaining ~15 use cases
surface potential new coordination patterns (barter, relay chain, broadcast, standing offer, conditional, nested) that
are documented for future consideration but do not require immediate spec work.

The capability matrix reveals that **location-based discovery** and **duration tracking** remain the two most universally
needed capabilities. Location discovery is already well-specified; duration tracking is the highest-priority remaining
gap. The protocol fit scoring rubric (Part 8) provides a formal, repeatable method for evaluating new use cases — any
domain scoring 8+/10 is a natural fit requiring only a domain profile definition.

---

## See Also

- **[USE-CASE-STATE-MACHINES.md](USE-CASE-STATE-MACHINES.md)** — Detailed state machines for top 10 use cases (Mermaid diagrams, payment triggers, protocol gaps)
- **[PAYMENT-PROVIDERS.md](PAYMENT-PROVIDERS.md)** — Payment provider integration (currency-neutral, trust model taxonomy)
- **[GDPR-COMPLIANCE.md](GDPR-COMPLIANCE.md)** — GDPR compliance architecture (crypto-shredding, three-layer data model)
- **[../ARCHITECTURE.md](../ARCHITECTURE.md)** — Three-layer federated architecture
- **[../specs/QUICK-REFERENCE.md](../specs/QUICK-REFERENCE.md)** — Complete event kind reference table
