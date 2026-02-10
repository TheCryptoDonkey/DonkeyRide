# NIP-XX-pet-services: Pet Services Domain Extension

`draft` `optional`

**Extends**: NIP-XX-core (Decentralised Service Coordination Protocol)
**Domain Identifier**: `pet_services`
**Allocated Kind Range**: 30680-30699
**Reference Implementation**: `src/domain-profiles/pet-services.js`

---

## Abstract

This document defines the **pet services** domain extension to NIP-XX-core. It specifies role aliases, category-dependent state machines, domain-specific tags for pet metadata, pricing semantics for hourly and flat-rate services, and rating criteria tailored to animal care coordination over the Nostr protocol with payment-agnostic financial rails.

The pet services domain covers a broad category of in-person animal care: dog walking, cat sitting, dog grooming, pet transport, and exotic animal care. These services share a common trust problem — pet owners must hand over a living being to a stranger and trust that care standards will be maintained when they are not present. Commitment stakes, cryptographic reputation, and verifiable session reports directly address this by creating enforceable accountability before, during, and after each booking.

## Regulatory Context

**The Animal Welfare Act 2006** establishes a duty of care for all persons responsible for an animal, including temporary carers. Any person providing pet services is legally obligated to ensure the animal's welfare needs are met: a suitable environment, a suitable diet, the ability to exhibit normal behaviour, housing with or apart from other animals as appropriate, and protection from pain, suffering, injury, and disease.

**The Animal Welfare (Licensing of Activities Involving Animals) (England) Regulations 2018** require a licence from the local authority for certain activities: boarding (including home boarding and day care), breeding, selling, riding establishments, and exhibiting animals. **Dog walking is NOT a licensable activity** under these regulations, but walkers remain subject to the general duty of care under the 2006 Act.

Operators offering sitting or boarding services through this protocol SHOULD verify that their providers hold the appropriate local authority licence where required. Operators MAY choose to verify DBS (Disclosure and Barring Service) checks for carers working with vulnerable adults' pets, but this is not a statutory requirement.

Operators in other jurisdictions MUST verify local licensing and animal welfare requirements. Regulations vary significantly between countries and regions.

---

## Currency-Neutral Amounts

All monetary amounts in pet services events are **currency-neutral**. The `amount` value is always in the smallest unit of the specified currency (pence for GBP, cents for USD, satoshis for SAT). Every event with a monetary value MUST include `currency` and `trust_model` tags. See [NIP-XX-payments.md](NIP-XX-payments.md) and [NIP-XX-stakes.md](NIP-XX-stakes.md).

---

## Terminology

| Generic Term (NIP-XX-core) | Pet Services Domain Alias | Description |
|----------------------------|--------------------------|-------------|
| Requester | **Pet Owner** | The person requesting care for their pet |
| Provider | **Pet Carer** | The person providing the pet care service |
| Task | **Booking** | A single pet service session or engagement |
| Operator | Operator | The relay/server coordinating bookings (unchanged) |

Implementations SHOULD accept both the generic terms (`requester_pubkey`, `provider_pubkey`) and the domain-specific aliases (`pet_owner_pubkey`, `pet_carer_pubkey`). The `domain` tag MUST be set to `"pet_services"` on all events.

```json
["domain", "pet_services"]
```

---

## Discovery Method

**Method**: `geohash` + `category`

Pet services discovery uses geohash-based spatial indexing combined with a service category filter. Pet owners broadcast their location (geohash-encoded) along with the required service type, and available carers within the relevant geohash tiles who offer that category are notified.

```json
["geohash", "gcpvj0"],
["category", "dog_walking"]
```

### Service Categories

| Category | Description | Pricing Model |
|----------|-------------|---------------|
| `dog_walking` | Individual or group dog walks | `hourly` |
| `cat_sitting` | In-home cat feeding and companionship visits | `hourly` |
| `dog_grooming` | Bathing, clipping, nail trimming, and coat care | `flatRate` |
| `pet_transport` | Transporting pets to vets, groomers, or between locations | `flatRate` |
| `exotic_care` | Specialist care for reptiles, birds, small mammals, and other non-standard pets | `hourly` |

---

## Pricing Model

**Model**: `hourly` or `flatRate` (determined by service category)

Pet services pricing varies by category. Duration-based services (walking, sitting, exotic care) use an hourly rate. One-off services (grooming, transport) use a flat rate per session. Operators MAY apply surcharges for additional pets, special needs, or unsociable hours.

### Hourly Pricing (Walking, Sitting, Exotic Care)

```json
{
  "pricing_model": "hourly",
  "rate_per_hour": 1500,
  "currency": "GBP",
  "minimum_hours": 1,
  "additional_pet_surcharge": 500,
  "bank_holiday_surcharge_percent": 50,
  "special_needs_surcharge": 300
}
```

### Flat Rate Pricing (Grooming, Transport)

```json
{
  "pricing_model": "flatRate",
  "base_fee": 3500,
  "currency": "GBP",
  "size_tiers": [
    { "max_weight_kg": 10, "multiplier": 1.0, "label": "small" },
    { "max_weight_kg": 25, "multiplier": 1.3, "label": "medium" },
    { "max_weight_kg": 45, "multiplier": 1.6, "label": "large" },
    { "max_weight_kg": 999, "multiplier": 2.0, "label": "giant" }
  ]
}
```

### Price Calculation Example

A 1.5-hour dog walk with one additional dog (GBP):
- Base rate: 1.5 hours x 1,500p = 2,250p (£22.50)
- Additional pet surcharge: 500p (£5.00)
- Total: **2,750p (£27.50)**

A grooming session for a 30 kg dog (GBP):
- Base fee: 3,500p (£35.00)
- Size multiplier (large tier): x 1.6
- Total: **5,600p (£56.00)**

---

## State Machine

The pet services domain defines **two state machine variants** depending on the service category. Walking and grooming services follow a standard linear flow. Sitting and extended care services introduce an **`on_duty`** state representing an ongoing multi-hour or multi-day engagement.

### Walking / Grooming State Machine

```
booking_requested ──> carer_matched ──> en_route ──> arrived ──> walk_active ──> walk_completed
       │                    │               │            │            │
       │                    │               │            │            │
       └────────────────────┴───────────────┴────────────┴────────────┴──── cancelled
                             (from any non-terminal state)

Terminal states: walk_completed, cancelled, no_show.
no_show: pet owner not present when carer arrives (triggers automatic stake forfeiture).
```

### Sitting / Extended Care State Machine

```
booking_requested ──> carer_matched ──> en_route ──> arrived ──> on_duty ──> sitting_completed
       │                    │               │            │           │
       │                    │               │            │           │
       └────────────────────┴───────────────┴────────────┴───────────┴──── cancelled
                             (from any non-terminal state)

Terminal states: sitting_completed, cancelled, no_show.
no_show: pet owner not present when carer arrives (triggers automatic stake forfeiture).
```

### State Definitions

| Core State | Pet Services State | Description |
|------------|-------------------|-------------|
| `requested` | `booking_requested` | Pet owner has submitted a service request with pet details |
| `matched` | `carer_matched` | A pet carer has accepted the booking |
| `provider_en_route` | `en_route` | Carer is travelling to the pet owner's location |
| `provider_arrived` | `arrived` | Carer has arrived and is meeting the pet |
| *(extension)* | `walk_active` | Carer is actively walking/grooming the pet (walking/grooming flow) |
| *(extension)* | `on_duty` | Carer is on an ongoing sitting or extended care engagement (sitting flow) |
| `completed` | `walk_completed` | Walk or grooming session finished; pet returned to owner |
| `completed` | `sitting_completed` | Sitting engagement concluded; pet returned to owner |
| `cancelled` | `cancelled` | Booking was cancelled (valid from any non-terminal state) |
| `no_show` | `no_show` | Pet owner not present when carer arrives; triggers automatic stake forfeiture |

### State Transitions (Walking / Grooming)

| From | To | Trigger |
|------|----|---------|
| `booking_requested` | `carer_matched` | Carer accepts the booking |
| `booking_requested` | `cancelled` | Pet owner cancels before match |
| `carer_matched` | `en_route` | Carer begins travel |
| `carer_matched` | `cancelled` | Either party cancels |
| `en_route` | `arrived` | Carer GPS confirms arrival |
| `en_route` | `cancelled` | Either party cancels |
| `arrived` | `walk_active` | Carer collects pet and begins walk/grooming session |
| `arrived` | `no_show` | Pet owner not present within waiting limit |
| `arrived` | `cancelled` | Either party cancels |
| `walk_active` | `walk_completed` | Walk/grooming session finished; pet returned |
| `walk_active` | `cancelled` | Exceptional cancellation (emergency — dispute likely) |

### State Transitions (Sitting / Extended Care)

| From | To | Trigger |
|------|----|---------|
| `booking_requested` | `carer_matched` | Carer accepts the booking |
| `booking_requested` | `cancelled` | Pet owner cancels before match |
| `carer_matched` | `en_route` | Carer begins travel |
| `carer_matched` | `cancelled` | Either party cancels |
| `en_route` | `arrived` | Carer GPS confirms arrival |
| `en_route` | `cancelled` | Either party cancels |
| `arrived` | `on_duty` | Carer takes charge of pet; sitting engagement begins |
| `arrived` | `no_show` | Pet owner not present within waiting limit |
| `arrived` | `cancelled` | Either party cancels |
| `on_duty` | `sitting_completed` | Sitting engagement concluded; pet returned to owner |
| `on_duty` | `cancelled` | Exceptional cancellation (emergency — dispute likely) |

---

## Domain-Specific Tags

The following tags are specific to the pet services domain and SHOULD be included on relevant events.

### Pet Metadata Tags

| Tag | Required | Description | Example Values |
|-----|----------|-------------|----------------|
| `pet_species` | REQUIRED | Species of the pet | `dog`, `cat`, `rabbit`, `bird`, `reptile`, `fish`, `horse`, `other` |
| `pet_breed` | RECOMMENDED | Breed or mix description | `labrador_retriever`, `british_shorthair`, `cockatiel`, `mixed` |
| `pet_name` | RECOMMENDED | Name of the pet | `Biscuit`, `Luna` |
| `pet_age` | RECOMMENDED | Age in years (decimal) | `3.5`, `0.8`, `12` |
| `pet_weight_kg` | RECOMMENDED | Weight in kilograms (decimal) | `28.5`, `4.2` |
| `pet_temperament` | RECOMMENDED | General behavioural disposition | `friendly`, `nervous`, `reactive` |
| `special_needs` | OPTIONAL | Special requirements for the pet's care | `medication`, `diet`, `mobility` |
| `service_type` | REQUIRED | Category of service requested | `walking`, `sitting`, `grooming`, `transport`, `training` |

### Booking Tags

| Tag | Required | Description | Example Values |
|-----|----------|-------------|----------------|
| `duration_hours` | REQUIRED (hourly) | Requested duration in hours | `1`, `1.5`, `8` |
| `recurring` | OPTIONAL | Whether this is a recurring booking | `true`, `false` |
| `recurrence_pattern` | OPTIONAL | Recurrence schedule if recurring | `weekdays`, `mon_wed_fri`, `daily`, `weekly` |
| `number_of_pets` | RECOMMENDED | Total number of pets for this booking | `1`, `2`, `3` |
| `pet_profile_event_id` | RECOMMENDED | Reference to the pet's reusable profile (kind 30681) | Event ID hex string |

### Tag Examples

**On a booking request (kind 30500):**

```json
{
  "kind": 30500,
  "tags": [
    ["domain", "pet_services"],
    ["d", "booking_dog123"],
    ["geohash", "gcpvj0"],
    ["category", "dog_walking"],
    ["service_type", "walking"],
    ["pet_species", "dog"],
    ["pet_breed", "labrador_retriever"],
    ["pet_name", "Biscuit"],
    ["pet_age", "3.5"],
    ["pet_weight_kg", "28.5"],
    ["pet_temperament", "friendly"],
    ["duration_hours", "1"],
    ["recurring", "true"],
    ["recurrence_pattern", "weekdays"],
    ["pet_owner_pubkey", "abc123..."],
    ["pet_profile_event_id", "event456..."]
  ],
  "content": ""
}
```

**On a sitting booking request (kind 30500):**

```json
{
  "kind": 30500,
  "tags": [
    ["domain", "pet_services"],
    ["d", "booking_cat456"],
    ["geohash", "gcpvj0"],
    ["category", "cat_sitting"],
    ["service_type", "sitting"],
    ["pet_species", "cat"],
    ["pet_breed", "british_shorthair"],
    ["pet_name", "Luna"],
    ["pet_age", "5"],
    ["pet_weight_kg", "4.2"],
    ["pet_temperament", "nervous"],
    ["special_needs", "medication"],
    ["duration_hours", "48"],
    ["number_of_pets", "2"],
    ["pet_owner_pubkey", "def789..."]
  ],
  "content": "Luna needs thyroid medication twice daily — details in pet profile."
}
```

---

## Rating Criteria

After a booking is completed, both parties publish rating events (kind 30530) with domain-specific criteria.

| Criterion Tag | Label | Weight | Description |
|---------------|-------|--------|-------------|
| `overall` | Overall | 0.25 | General satisfaction with the service |
| `reliability` | Reliability | 0.20 | Arrived on time, completed the full session, followed instructions |
| `pet_handling` | Pet Handling | 0.25 | Skill and gentleness in handling the animal; pet was calm and happy |
| `communication` | Communication | 0.15 | Kept owner informed; responsive to messages; flagged any concerns |
| `photos_updates` | Photos & Updates | 0.15 | Quality and frequency of photo updates and session reports |

### Rating Event Example

```json
{
  "kind": 30530,
  "tags": [
    ["domain", "pet_services"],
    ["task_id", "booking_dog123"],
    ["rated_pubkey", "carer_pubkey_xyz"],
    ["overall", "5"],
    ["reliability", "5"],
    ["pet_handling", "5"],
    ["communication", "4"],
    ["photos_updates", "5"]
  ],
  "content": "Brilliant service. Biscuit was exhausted and happy after the walk. Lovely photos sent during the session. Would book again without hesitation."
}
```

---

## Pet Services-Specific Event Kinds (30680-30699)

The following kind range is reserved for pet-services-domain-specific events. Core protocol kinds (30500-30599) are shared across all domains.

| Kind | Name | Status | Replaceable | Publisher |
|------|------|--------|-------------|-----------|
| 30680 | Pet Service Request | Draft | Yes (NIP-33) | Pet Owner |
| 30681 | Pet Profile | Draft | Yes (NIP-33) | Pet Owner |
| 30682 | Walk/Session Report | Draft | No (append-only) | Pet Carer |
| 30683 | Medication Administered | Draft | No (append-only) | Pet Carer |
| 30684 | *(Reserved)* | — | — | — |
| 30685 | Emergency Vet Report | Draft | No (append-only) | Pet Carer |
| 30686-30699 | *(Reserved for future use)* | — | — | — |

### Kind 30680: Pet Service Request Event

Published by the pet owner to request a specific service. Extends core kind 30500 with pet-specific metadata and service category details. Operators MAY use this kind instead of or alongside the generic 30500 to carry richer pet service semantics.

```json
{
  "kind": 30680,
  "tags": [
    ["domain", "pet_services"],
    ["d", "booking_dog123"],
    ["e", "<optional_pet_profile_event_id>"],
    ["geohash", "gcpvj0"],
    ["category", "dog_walking"],
    ["service_type", "walking"],
    ["pet_species", "dog"],
    ["pet_breed", "labrador_retriever"],
    ["pet_name", "Biscuit"],
    ["pet_weight_kg", "28.5"],
    ["pet_temperament", "friendly"],
    ["duration_hours", "1"],
    ["recurring", "true"],
    ["recurrence_pattern", "weekdays"],
    ["expiration", "1697900000"],
    ["currency", "GBP"],
    ["trust_model", "custodial-third-party"]
  ],
  "content": "Biscuit is friendly with other dogs. Prefers off-lead walks in open spaces. Recall is reliable."
}
```

**Semantics:**
- The `expiration` tag (per NIP-40) indicates when this request becomes invalid
- The `e` tag MAY reference a kind 30681 Pet Profile event for the pet's full details
- The `recurring` and `recurrence_pattern` tags indicate whether this is a standing booking
- Implementations SHOULD prefer the Pet Profile (kind 30681) for static pet metadata, with only session-specific details in the request

### Kind 30681: Pet Profile Event

Published by the pet owner as a **reusable profile** for their pet. Referenced by booking requests via the `e` tag. This avoids repeating pet metadata on every booking and allows carers to review a pet's history before accepting.

```json
{
  "kind": 30681,
  "tags": [
    ["domain", "pet_services"],
    ["d", "pet_biscuit_abc123"],
    ["pet_species", "dog"],
    ["pet_breed", "labrador_retriever"],
    ["pet_name", "Biscuit"],
    ["pet_age", "3.5"],
    ["pet_weight_kg", "28.5"],
    ["pet_temperament", "friendly"],
    ["special_needs", "none"],
    ["vaccinations_up_to_date", "true"],
    ["neutered", "true"],
    ["microchipped", "true"],
    ["microchip_number_hash", "sha256:abc123..."],
    ["vet_practice", "Woodlands Veterinary Surgery"],
    ["emergency_vet_phone_hash", "sha256:def456..."],
    ["pet_owner_pubkey", "abc123..."]
  ],
  "content": "Biscuit is a friendly 3-year-old Labrador. Good recall, fine with other dogs and children. No allergies. Loves water — avoid the canal unless you want a wet dog."
}
```

**Semantics:**
- This is a NIP-33 replaceable event (keyed on `d` tag) — the owner updates it as the pet's details change
- Sensitive information (microchip number, vet phone) SHOULD be hashed or encrypted using NIP-44
- The profile is public to allow carers to assess before accepting, but precise veterinary details SHOULD use NIP-17 gift wrap for the matched carer only
- Multiple pets are represented as separate Pet Profile events

### Kind 30682: Walk/Session Report Event

Published by the pet carer after completing a walk, sitting visit, or grooming session. Provides the pet owner with a summary of the session including photo proof, distance walked, and any notes.

```json
{
  "kind": 30682,
  "tags": [
    ["domain", "pet_services"],
    ["e", "<booking_request_event_id>"],
    ["d", "booking_dog123"],
    ["service_type", "walking"],
    ["duration_minutes", "62"],
    ["distance_metres", "4800"],
    ["photo_hash", "sha256:a1b2c3d4e5f6..."],
    ["photo_count", "4"],
    ["poo_collected", "true"],
    ["water_provided", "true"],
    ["behaviour_notes", "friendly_with_others"],
    ["gps_trace_hash", "sha256:9876543210..."],
    ["timestamp_start", "1697800000"],
    ["timestamp_end", "1697803720"]
  ],
  "content": "Lovely walk along the canal towpath. Biscuit played with a spaniel for 10 minutes in the meadow. Good recall throughout. Two poos collected. Drank well from portable bowl."
}
```

**Semantics:**
- The `photo_hash` tag references photo evidence of the pet during the session (proof of care)
- The `gps_trace_hash` provides a verifiable record of the route walked
- Multiple photos are indicated by `photo_count`; individual hashes MAY be appended as additional `photo_hash` tags
- For sitting visits, this report documents each visit with feeding, play, and welfare observations

### Kind 30683: Medication Administered Event

Published by the pet carer when they administer medication to a pet during a sitting or extended care engagement. Creates an auditable medication log for the pet owner and veterinary reference.

```json
{
  "kind": 30683,
  "tags": [
    ["domain", "pet_services"],
    ["e", "<booking_request_event_id>"],
    ["d", "booking_cat456"],
    ["pet_name", "Luna"],
    ["medication_name", "Felimazole"],
    ["dose", "2.5mg"],
    ["route", "oral"],
    ["administered_at", "1697810000"],
    ["next_due", "1697853600"],
    ["photo_hash", "sha256:med123..."],
    ["notes", "Administered in food — Luna ate the full portion"]
  ],
  "content": "Evening dose of Felimazole given in wet food at 18:00. Luna ate everything. No adverse reaction observed."
}
```

**Semantics:**
- Each medication administration is a separate event, creating a complete audit trail
- The `photo_hash` MAY provide evidence of the medication being given (particularly important for controlled substances or insulin)
- The `next_due` tag helps carers and owners track the medication schedule
- Medication details (name, dose, route) SHOULD be verified against the pet profile or owner's written instructions

### Kind 30685: Emergency Vet Report Event

Published by the pet carer if a pet requires emergency veterinary attention during a booking. This is a critical event that triggers immediate notification to the pet owner.

```json
{
  "kind": 30685,
  "tags": [
    ["domain", "pet_services"],
    ["e", "<booking_request_event_id>"],
    ["d", "booking_dog123"],
    ["pet_name", "Biscuit"],
    ["emergency_type", "injury"],
    ["severity", "moderate"],
    ["description", "Cut paw on broken glass during walk"],
    ["vet_attended", "true"],
    ["vet_practice", "Woodlands Veterinary Surgery"],
    ["vet_reference", "WVS-2025-4567"],
    ["timestamp", "1697805000"],
    ["gps_lat", "51.5074"],
    ["gps_lon", "-0.1278"],
    ["photo_hash", "sha256:emergency789..."]
  ],
  "content": "Biscuit stepped on broken glass near the canal lock. Bleeding from right front paw. Applied pressure and carried to the car. Taken to Woodlands Veterinary Surgery — they cleaned and bandaged the wound. No stitches required. Vet advised rest for 48 hours and a check-up in 5 days."
}
```

**Semantics:**
- This event SHOULD trigger immediate push notification to the pet owner via the operator
- The `severity` tag uses values: `minor` (no vet needed), `moderate` (vet visit), `serious` (emergency vet), `critical` (life-threatening)
- The `emergency_type` tag categorises the incident: `injury`, `illness`, `escape`, `ingestion`, `heat_stress`, `collapse`, `other`
- Veterinary costs and liability are handled through the dispute and payment systems
- Implementations SHOULD require the carer to publish this event within a reasonable timeframe of the incident

---

## Staking Model

The pet services domain uses asymmetric staking to reflect the vulnerability imbalance — the pet owner is entrusting a living being to the carer:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Requester (pet owner) stake | 10% of booking fee | Deters fake bookings and no-shows |
| Provider (pet carer) stake | 20% of booking fee | Higher stake — carer has custody of a living animal |
| Penalty on cancellation | 80% of stake | Strong deterrent against last-minute cancellations |

For extended sitting engagements (bookings exceeding 24 hours), operators MAY require the carer stake to be proportional to the total booking value rather than just the daily rate.

---

## Completion Proof

Pet services bookings use the following proof types:

| Proof Type | Service Types | Description |
|------------|---------------|-------------|
| `gps_arrival` | All | GPS coordinates confirming the carer arrived at the pet owner's location |
| `photo` | All | Photo evidence of the pet during and/or after the session |
| `gps_trace` | Walking | GPS trace of the walk route taken |
| `session_report` | All | Kind 30682 Walk/Session Report documenting the session |

Photo proof is strongly recommended for all service types. For walking services, the GPS trace provides verifiable evidence that the walk actually took place and covered a reasonable distance.

---

## Dispute Evidence Types

| Evidence Type | Description |
|---------------|-------------|
| `text` | Written description of the dispute |
| `photo` | Photographic evidence (e.g., pet condition, injury) |
| `gps_trace` | GPS trace showing the carer's movements during the booking |
| `session_report` | The kind 30682 Walk/Session Report for the booking |
| `medication_log` | Kind 30683 Medication Administered events for the engagement |
| `vet_report` | Kind 30685 Emergency Vet Report or external veterinary documentation |
| `pet_profile` | Kind 30681 Pet Profile showing the pet's pre-existing conditions and known behaviour |

---

## Recurring Bookings

Pet services frequently involve recurring engagements (e.g., daily dog walks, weekly grooming). The protocol supports this through the `recurring` and `recurrence_pattern` tags on booking requests.

### Recurrence Semantics

- Each occurrence of a recurring booking is a **separate task** with its own lifecycle, staking, and payment
- The `recurring` tag on a booking request indicates the owner's intent for an ongoing arrangement
- The operator creates individual task instances for each scheduled occurrence
- Either party may cancel the recurring arrangement without affecting already-completed sessions
- Stakes are locked and released per-session, not for the entire recurring period

### Recurrence Patterns

| Pattern | Description |
|---------|-------------|
| `daily` | Every day |
| `weekdays` | Monday to Friday |
| `weekends` | Saturday and Sunday |
| `mon_wed_fri` | Monday, Wednesday, and Friday |
| `tue_thu` | Tuesday and Thursday |
| `weekly` | Once per week (same day) |
| `fortnightly` | Once per fortnight |
| `custom` | Custom schedule (described in content) |

---

## Relationship to Core Protocol

The pet services domain uses all core NIP-XX event kinds for task lifecycle management, staking, payments, disputes, and reputation. The domain-specific kinds (30680-30699) extend the core protocol with pet-specific semantics — principally around pet profiles, session reporting, medication tracking, and emergency veterinary incidents.

### Shared Core Kinds Used

| Kind | Name | Usage in Pet Services Domain |
|------|------|------------------------------|
| 30500 | Service Request | Pet owner requests a service with pet details |
| 30501 | Service Acceptance | Carer accepts the booking |
| 30502 | Stake Lock | Operator locks commitment stakes |
| 30510 | Streaming Payment | Used for extended sitting engagements (daily payment streaming) |
| 30511 | Payment Confirmation | Final payment confirmation after session complete |
| 30512 | Status Update | State transitions during the booking |
| 30513 | Provider Tip | Pet owner tips the carer |
| 30520 | Stake Release | Operator releases stakes upon completion |
| 30522 | Dispute Filing | Either party files a dispute (e.g., pet injury, no-show) |
| 30524 | Dispute Resolution | Arbiter resolves the dispute |
| 30530 | Reputation Rating | Post-booking rating with pet-services-specific criteria |

---

## Security Considerations

1. **Location privacy** — Booking requests reveal the pet owner's home address. Implementations SHOULD use NIP-17 gift wrap or NIP-44 encryption for precise addresses, with only the geohash visible publicly.
2. **Pet profile sensitivity** — Pet profiles may reveal valuable information (pedigree breeds, exotic animals). Owners SHOULD consider what details to make public versus encrypted.
3. **Property access** — Sitting services often require the carer to access the owner's home. Operators SHOULD consider enhanced identity verification (including DBS checks where appropriate) for services involving home access.
4. **Veterinary information** — Vet practice details, microchip numbers, and medication information are sensitive. These SHOULD be encrypted using NIP-44 and shared only with the matched carer via NIP-17 gift wrap.
5. **Animal welfare** — The carer has sole custody of a living being during the booking. The emergency vet report (kind 30685) and medication log (kind 30683) provide accountability mechanisms, but operators SHOULD also consider maximum booking durations and welfare check-in requirements.

---

## Future Work

- **Multi-pet booking** — Support for a single carer handling multiple pets from different owners in one session (e.g., group dog walks)
- **Training services** — Extended state machine for dog training sessions with progress tracking
- **Overnight boarding** — Dedicated state machine for multi-night stays with daily welfare reports
- **Pet insurance integration** — Verification of pet insurance and automatic claims for incidents during bookings
- **Vaccination verification** — Automated verification of vaccination status via veterinary API integration
- **Behavioural assessments** — Standardised behavioural assessment events for initial meet-and-greet sessions
- **IoT collar integration** — GPS collar data as additional proof-of-walk evidence
- **Carer licensing verification** — Automated local authority licence verification for boarding carers
- **Emergency contact chain** — Multi-party notification for emergency vet events (owner, emergency contact, vet)

---

## See Also

- **[NIP-XX-core.md](NIP-XX-core.md)** — Domain-agnostic core protocol (this extension's parent)
- **[NIP-XX-stakes.md](NIP-XX-stakes.md)** — Commitment stakes (lock, release, forfeit)
- **[NIP-XX-payments.md](NIP-XX-payments.md)** — Payment events and streaming models
- **[NIP-XX-reputation.md](NIP-XX-reputation.md)** — Ratings and reputation portability
- **[NIP-XX-discovery.md](NIP-XX-discovery.md)** — Service discovery (geohash + category matching)
- **[NIP-XX-disputes.md](NIP-XX-disputes.md)** — Dispute resolution (pet injury and service quality disputes)
- **[NIP-XX-safety.md](NIP-XX-safety.md)** — Safety infrastructure (emergency vet incidents)
- **[QUICK-REFERENCE.md](QUICK-REFERENCE.md)** — Summary table of all event kinds
- **[../docs/PAYMENT-PROVIDERS.md](../docs/PAYMENT-PROVIDERS.md)** — Payment provider integration guide
- **Reference implementation**: `src/domain-profiles/pet-services.js`
- **Animal Welfare Act 2006**: https://www.legislation.gov.uk/ukpga/2006/45/contents
- **Animal Welfare (Licensing of Activities Involving Animals) (England) Regulations 2018**: https://www.legislation.gov.uk/uksi/2018/486/contents
- **DBS checks**: https://www.gov.uk/government/organisations/disclosure-and-barring-service
