# DonkeyRide Protocol: Use Case Analysis & Generalisation Strategy

## Context

The DonkeyRide protocol is built on primitives that are fundamentally not about ridesharing — they're about
trust-minimised coordination between strangers with asymmetric information, using cryptographic proof instead of
institutional authority. This document analyses what's universal, maps 20+ concrete use cases with UK regulatory
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
- AnyVan charges 15-25% commission; protocol's 0.5% operator fee is transformative
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

### Tier 2 — Strong Fit (needs quote/deliverable primitives)

#### 6. Roadside Assistance (AA/RAC Alternative) — Protocol Fit: 9/10

A stranded motorist is functionally identical to a rider. Commitment stakes are more valuable here than in ridesharing —
a no-show mechanic leaves someone on a motorway hard shoulder. Streaming payments per minute are ideal for
variable-duration repairs.

- Needs urgency tiers (hard shoulder = life-threatening vs flat tyre in car park)
- Needs skill-matching tags: ['skill', 'electrical'], ['skill', 'tyres'], ['skill', 'towing']
- Market: ~£2bn+. AA/RAC have ~25m members combined. Customer satisfaction chronically poor
- Regulatory: Low-medium (Traffic Commissioner licence for vehicles >3.5t)

#### 7. Emergency Plumber/Electrician — Protocol Fit: 8/10

Emergency trade callouts share the locksmith pattern — urgent, trust-sensitive, prone to price-gouging. Adds a
guarantee_period state tracked as a long-lived replaceable event (NIP-33).

- Gas Safe registration MANDATORY for gas work (criminal offence if unregistered)
- Milestone-based escrow for major work: 30% on parts order, 40% on installation, 30% on commissioning
- Market: Very large (~£4-6bn combined)
- Regulatory: High (Gas Safe, Part P, NICEIC)

#### 8. Food Delivery (Deliveroo / Uber Eats Alternative) — Protocol Fit: 8/10

Introduces a three-party model (restaurant → courier → customer). Tipping already exists (kind 30513). Surge pricing
already implemented.

- Temperature compliance: hot food >63°C, cold food <8°C (Food Safety Act 1990)
- Natasha's Law (2021) — prepacked items must list all ingredients
- Allergen information must be preserved through delivery chain (EU FIC Regulation retained in UK law)
- Market: Very large
- Regulatory: Medium (FSA, food hygiene, allergen law)

#### 9. Security Guard Dispatch — Protocol Fit: 8/10

Ad-hoc security dispatch. Safety check-in events (kinds 30561-30562) serve double duty — confirming guard safety AND
presence on-site (proof of service).

- SIA licence verification mandatory (Private Security Industry Act 2001)
- Market: Large (~£6bn total, ad-hoc segment £500m-1bn)

#### 10. Personal Trainer / Fitness Coaching — Protocol Fit: 8/10

Commitment stakes address the chronic no-show problem. 80% forfeit for cancellation directly from existing STAKE_CONFIG.
Recurring relationships (2-3x/week) need strong scheduling support.

- CIMSPA/REPs registration. DBS if working with under-18s
- Health-related data = special category under UK GDPR
- Market: ~£1-1.5bn

#### 11. Environmental Sampling / Monitoring — Protocol Fit: 8/10

Environmental sampling data used in court (pollution prosecutions, planning appeals) requires legally defensible chain
of custody. Cryptographically signed, GPS-stamped events provide stronger evidence than paper forms.

- MCERTS/UKAS accreditation as credential verification
- Market: Medium (~£200-500m addressable)

#### 12. Blood / Organ / Specimen Transport — Protocol Fit: 8/10

Append-only Nostr events create an immutable chain-of-custody record exceeding traditional paper forms. Time-penalty
mechanisms: automatic forfeit if delivery exceeds agreed window.

- Human Tissue Authority licensing, MHRA, potentially CQC
- Market: ~£200-400m. NHS contracts dominate
- Regulatory: Very high

#### 13. Volunteer Coordination — Protocol Fit: 8/10

Works WITHOUT payments (zero-value sessions). Reputation stakes instead of financial — volunteers who no-show lose
reputation rather than sats. Multiple charities sharing the protocol can share volunteer pools via cross-operator
coordination (kind 30505).

- Market: Non-commercial but massive social impact
- Current tooling: WhatsApp groups and spreadsheets

### Tier 3 — Good Fit (needs more adaptation)

#### 14. Pet Services — Protocol Fit: 7/10

GPS tracking particularly valuable (owner watches walk route). Photo updates during walk via safety check-ins.

- Animal Welfare Act 2006, Animal Welfare Regulations 2018 for boarding
- Market: Medium

#### 15. Tradesperson Marketplace — Protocol Fit: 7/10

Needs quote negotiation primitive (mechanic arrives, assesses, issues quote, customer accepts/declines). Needs milestone
payments.

- Gas Safe, NICEIC/NAPIT, CIS tax scheme
- Market: Large

#### 16. Mobile Hairdresser / Beautician — Protocol Fit: 7/10

Favourite driver event (kind 30577) maps to "favourite stylist". Additional charge event (kind 30516) covers product
costs.

- No mandatory licensing (England/Wales). Scotland requires registration
- Market: ~£800m-1.2bn mobile segment

#### 17. Tutoring / Skills Coaching — Protocol Fit: 7/10

Discovery shifts from geohash to skill tags. Location optional (in-person or video).

- Enhanced DBS mandatory for under-18s
- Market: Medium

#### 18. Childminder / Babysitter — Protocol Fit: 7/10

Handover moments are legally significant — timestamped, signed events create auditable records of when responsibility
transferred.

- Ofsted registration MANDATORY for >2 hours/day childcare for reward
- Regulatory: Very high

#### 19. Farm Labour Coordination — Protocol Fit: 7/10

Portable reputation is transformative — picker's track record travels between farms. Transparent payment records support
anti-exploitation goals.

- GLAA licensing is criminal law — operating without licence carries up to 10 years imprisonment
- Market: ~£500m-1bn. Weak technology

#### 20. P2P Community Energy — Protocol Fit: 7/10

Streaming payments per kWh as energy flows. Technically elegant but regulatory barrier is massive.

- Ofgem licensing required (Licence Lite regime gradually opening)
- Market: Nascent but potentially very large

#### 21. Equipment / Tool Rental — Protocol Fit: 7/10

Two-phase lifecycle (rental out + return). Stakes become damage deposits.

- Market: Medium

#### 22. Mobile Mechanic — Protocol Fit: 7/10

Needs quote-then-accept flow (assess → quote → accept → repair).

- Market: ~£1-2bn mobile segment

### Tier 4 — Moderate Fit

#### 23. Photography / Videography — Protocol Fit: 6/10

Extended lifecycle spanning days/weeks (shoot + editing + delivery). Needs multi-day session tracking.

#### 24. Building Surveyor — Protocol Fit: 7/10

Deliverable (survey report) extends lifecycle beyond physical visit. Needs deliverable-tracking primitive.

#### 25. Elderly Companion Care — Protocol Fit: 7/10

Non-clinical variant. If companionship only → no CQC. If personal care → CQC mandatory.

- Market: High (ageing population, £6.7bn domiciliary care market)

#### 26. Clinical Healthcare — Protocol Fit: 7/10 (see Part 3 deep dive)

Most complex. Requires significant adaptation. See dedicated section below.

---

## Part 3: Healthcare Deep Dive

### The Market Opportunity

The UK domiciliary care market is £6.7 billion in 2026, growing at 6.8% CAGR. CQC-registered domiciliary care services
grew from 8,414 (2017) to 13,733 (2024) — 63% increase. 2 million people aged 65+ are not getting needed care due to
staff shortages. Skills for Care estimates 440,000 additional care workers needed by 2035.

Private agencies charge 30-40% of the nurse's rate. The protocol's 0.5% operator fee combined with instant Lightning
settlement (vs 30-60 day payment cycles) is a compelling value proposition.

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
ENCRYPTED DMs (NIP-04, post-match)            └─ Full audit trail
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
| Quote Negotiation (~kind 30601)   | Trades, mechanic, surveyor            | Provider issues quote after assessment; customer accepts/declines |
| Multi-Day Session (~kind 30602)   | Photography, farm labour, archaeology | Engagements spanning days/weeks                                   |
| Deliverable Handoff (~kind 30603) | Surveyor, photography, environmental  | Completion triggered by document delivery, not co-location        |
| Bulk Matching (~kind 30604)       | Farm labour, events, volunteers       | One request, many acceptors                                       |
| Guarantee Period (~kind 30605)    | Trades, mechanic                      | Warranty tracking as long-lived replaceable event                 |

### F. Implementation Effort

- Phase 1 (Week 1): Domain profile system + task-manager refactor — ~500 LOC new, ~200 LOC refactored
- Phase 2 (Week 2): Route decomposition + domain endpoint — ~300 LOC extracted from server.js
- Phase 3 (Week 3): Frontend parameterisation — ~800 LOC → ~500 LOC generic + domain overrides
- Phase 4 (per new domain): Profile + routes + domain features — ~500 LOC per domain

---

## Part 5: Consolidated Rankings

### Top 10 by Overall Score (Protocol Fit x Market x Competitive Gap / Regulatory Complexity)

| Rank | Use Case                | Protocol Fit | Market (UK)    | Regulatory | Competitive Gap | Priority    |
|------|-------------------------|--------------|----------------|------------|-----------------|-------------|
| 1    | Locksmith Dispatch      | 10/10        | £700m          | Very Low   | Very Wide       | Immediate   |
| 2    | Man with a Van          | 9/10         | £1.5bn         | Low        | Wide            | Immediate   |
| 3    | Parcel Delivery         | 9/10         | Very Large     | Low        | Moderate        | Immediate   |
| 4    | Mobile Car Wash         | 9/10         | £1.2bn         | Very Low   | Wide            | Immediate   |
| 5    | Court Process Serving   | 9/10         | £100-200m      | Low        | Very Wide       | Immediate   |
| 6    | Roadside Assistance     | 9/10         | £2bn+          | Low-Med    | Moderate        | Near-term   |
| 7    | Emergency Trades        | 8/10         | £4-6bn         | High       | Moderate        | Near-term   |
| 8    | Food Delivery           | 8/10         | Very Large     | Medium     | Moderate        | Near-term   |
| 9    | Volunteer Coordination  | 8/10         | Non-commercial | Medium     | Very Wide       | Near-term   |
| 10   | Security Guard Dispatch | 8/10         | £500m-1bn      | High       | Moderate        | Medium-term |

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

## Key Insight

The protocol's core primitive — cryptographic commitment between strangers with slashable stakes — solves trust problems
that exist in every service marketplace. The industries where trust is most broken (locksmiths, emergency trades,
removals) are where the protocol's value is most immediately obvious. Healthcare is the highest-value long-term
opportunity but requires the most careful regulatory navigation.

The generalisation architecture (domain profiles) means adding a new use case requires ~500 lines of configuration and
routes rather than a fork. The payment providers, reputation system, authentication middleware, and dispute resolution
all work unchanged across every domain.
