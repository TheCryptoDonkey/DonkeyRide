# TROTT Domain Profile: Pet Services

`draft`

**Domain identifier:** `pet-services`
**Coordination pattern:** Scheduled
**Event kind range:** 30700-30719

## TROTT Specs Used

- TROTT-01: Core **Yes**
- TROTT-02: Discovery (geographic broadcast + category search) **Yes**
- TROTT-03: Reputation **Yes**
- TROTT-04: Payments (simple quote, streaming for extended sitting) **Yes**
- TROTT-05: Safety (emergency vet incidents, disputes) **Yes**
- TROTT-06: Coordination (optional) **Yes**
- TROTT-07: Navigation **No** (carer travels to pet, but routing not critical)

## Roles

- Requester: "Pet Owner"
- Provider: "Pet Carer"

## State Machine Extension

The pet services domain uses two variants. Walking/grooming follows a linear flow; sitting/extended care introduces an ongoing `active` state:

**Walking / grooming:**
```
accepted --> scheduled --> en_route --> arrived --> check_in --> active --> check_out --> confirmed
```

**Sitting / extended care:**
```
accepted --> scheduled --> en_route --> arrived --> check_in --> active --> check_out --> confirmed
```

| Core state | Pet services state | Description |
|------------|-------------------|-------------|
| `accepted` | `scheduled` | Booking confirmed for a future date/time |
| `in_progress` (dispatch) | `en_route` | Carer is travelling to the pet owner's location |
| `in_progress` (arrival) | `arrived` | Carer has arrived at the pet owner's location |
| `in_progress` (phase 1) | `check_in` | Carer arrives and collects the pet or begins session |
| `in_progress` (phase 2) | `active` | Walk, grooming, or sitting session underway |
| `completed` | `check_out` | Pet returned to owner; session report submitted |

Additional terminal state: `no_show` -- pet owner not present when carer arrives.

## Domain-Specific Tags

| Tag | Description |
|-----|-------------|
| `pet_type` | Species: `dog`, `cat`, `rabbit`, `bird`, `reptile`, `fish`, `other` |
| `pet_count` | Number of pets for this booking |
| `service_type` | Category: `walking`, `sitting`, `grooming`, `transport`, `training` |
| `special_needs` | Requirements: `medication`, `diet`, `mobility`, `anxiety`, `none` |
| `pet_breed` | Breed or mix description |
| `pet_name` | Name of the pet |
| `pet_weight_kg` | Weight in kilograms |
| `pet_temperament` | Disposition: `friendly`, `nervous`, `reactive` |
| `duration_hours` | Requested session duration |
| `recurring` | Standing booking: `true`/`false` |
| `recurrence_pattern` | Schedule: `daily`, `weekdays`, `mon_wed_fri`, `weekly`, `fortnightly` |

## Rating Criteria

| Criterion | Weight |
|-----------|--------|
| `overall` | 0.25 |
| `reliability` | 0.20 |
| `pet_handling` | 0.25 |
| `communication` | 0.15 |
| `photos_updates` | 0.15 |

## Pricing Model

**Hourly or flat rate** depending on service category. Walking, sitting, and exotic care use hourly rates. Grooming and transport use flat rates with size-based tiers. Surcharges for additional pets, special needs, and bank holidays.

## Cancellation Policy

| Stage | Penalty |
|-------|---------|
| Before match | None |
| More than 24 hours before scheduled time | None |
| Within 24 hours of scheduled time | 80% of staked amount |
| No-show (owner absent) | 100% of owner stake (automatic) |

Default stakes: Pet Owner 10% of booking fee, Pet Carer 20% of booking fee (higher stake as carer has custody of a living animal).

## PII Requirements

Pet owner's home address (for collection/sitting visits). Pet medical information and vet details (encrypted). Transmitted via TROTT-06 PII Envelope. Vet contact details shared only with matched carer via NIP-44. Retained for task duration plus 30 days.

## Safety Rules

- **Check-ins:** Optional for walking/grooming. Recommended every 2 hours for extended sitting engagements exceeding 4 hours.
- **Emergency vet incidents:** Carer must publish an emergency report immediately. Triggers push notification to pet owner.
- **Welfare check-ins:** For sitting engagements, carer publishes session reports (feeding, play, welfare observations) at each visit.

## Completion Proof

Photo evidence of the pet during and/or after the session. GPS trace for walking services (verifies the walk took place). Session report documenting duration, distance walked, feeding, and behavioural notes.

## Domain-Specific Event Kinds

| Kind | Name | Description |
|------|------|-------------|
| 30700 | Pet Service Request | Booking request with pet metadata and service category |
| 30701 | Pet Profile | Reusable pet profile: breed, weight, temperament, medical, vet |
| 30702 | Session Report | Walk/sitting report: duration, distance, photos, behavioural notes |
| 30703 | Medication Administered | Auditable log of medication given during sitting engagement |
| 30704 | Emergency Vet Report | Pet required emergency veterinary attention during booking |
| 30705-30719 | *(Reserved)* | Future pet services extensions |

## Regulatory Context

The **Animal Welfare Act 2006** establishes a duty of care for all persons responsible for an animal, including temporary carers. The **Animal Welfare (Licensing of Activities Involving Animals) (England) Regulations 2018** require a local authority licence for boarding (including home boarding and day care). **Dog walking is not a licensable activity**, but walkers remain subject to the general duty of care. Operators offering sitting or boarding services should verify appropriate local authority licensing where required.
