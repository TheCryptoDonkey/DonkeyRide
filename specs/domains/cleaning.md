# TROTT Domain Profile: Cleaning

`draft`

**Domain identifier:** `cleaning`
**Coordination pattern:** Scheduled / recurring
**Event kind range:** 30740-30759

## TROTT Specs Used

- TROTT-01: Core **Yes**
- TROTT-02: Discovery (geographic broadcast + category search) **Yes**
- TROTT-03: Reputation **Yes**
- TROTT-04: Payments (simple quote, streaming for long sessions) **Yes**
- TROTT-05: Safety (optional -- first-visit check-ins, disputes) **Yes**
- TROTT-06: Coordination (optional) **Yes**
- TROTT-07: Navigation **No**

## Roles

- Requester: "Client"
- Provider: "Cleaner"

## State Machine Extension

The cleaning domain uses a straightforward scheduled pattern:

```
accepted --> scheduled --> arrived --> in_progress --> completed --> confirmed
                             |
                             +--> no_show (client not home / no access)
```

| Core state | Cleaning state | Description |
|------------|---------------|-------------|
| `accepted` (sub-phase) | `scheduled` | Session booked for a specific date and time |
| `in_progress` (phase 1) | `arrived` | Cleaner has arrived at the property |
| `in_progress` (phase 2) | `in_progress` | Cleaning underway |
| `completed` | `completed` | Cleaning finished; client may inspect |

Recurring bookings create separate task instances per session, each following the same state machine independently.

## Domain-Specific Tags

| Tag | Description |
|-----|-------------|
| `property_type` | Property category: `flat`, `house`, `office`, `commercial`, `airbnb` |
| `property_size` | Size indicator: `studio`, `1bed`, `2bed`, `3bed`, `4bed+`, `small_office`, `large_office` |
| `cleaning_type` | Service category: `regular`, `deep`, `end_of_tenancy`, `commercial`, `post_construction`, `spring` |
| `supplies` | Who provides cleaning supplies: `client`, `provider` |
| `access_method` | How the cleaner gains entry: `client_present`, `key_held`, `lockbox`, `concierge` |
| `recurring` | Standing booking: `true`/`false` |
| `recurrence_pattern` | Schedule: `weekly`, `biweekly`, `monthly`, `fortnightly` |
| `estimated_hours` | Expected session duration in hours |
| `rooms` | Specific rooms to clean (optional; comma-separated) |

## Rating Criteria

| Criterion | Weight |
|-----------|--------|
| `overall` | 0.25 |
| `thoroughness` | 0.25 |
| `punctuality` | 0.20 |
| `trustworthiness` | 0.15 |
| `attention_to_detail` | 0.15 |

## Pricing Model

**Hourly or fixed per session.** Regular cleaning typically uses hourly rates. Specialist cleans (deep clean, end-of-tenancy) use fixed quotes based on property size and type. Surcharges for supplies provided by cleaner, ironing, laundry, and oven cleaning.

Example hourly: `hourly_rate x estimated_hours`. Example fixed: flat rate per `property_size` and `cleaning_type` combination.

## Cancellation Policy

| Stage | Penalty |
|-------|---------|
| Before match | None |
| More than 24 hours before scheduled time | None |
| Within 24 hours of scheduled time | 80% of staked amount |
| No-show (client not home / no access) | 100% of client stake (automatic) |
| Cancelling recurring arrangement | No penalty; affects future sessions only, not completed ones |

Default stakes: Client 10% of session fee, Cleaner 10% of session fee (symmetric -- both parties have roughly equal commitment in a recurring relationship).

## PII Requirements

Client's home or office address, access method (key location, lockbox code, concierge details). Encrypted via NIP-44. For recurring clients with key-held access, access details are shared once and referenced thereafter. Retained for task duration plus 30 days; recurring arrangements retain PII for the duration of the arrangement.

## Safety Rules

- **Check-ins:** Not required for regular clients with an established history. Optional check-in at arrival for first visits with a new client.
- **Key held access:** When cleaners hold keys, the key arrangement should be documented in TROTT-06 PII Envelope for accountability.

## Completion Proof

**For first visits and specialist cleans:** Optional before-and-after photographs. GPS arrival confirmation.

**For regular recurring sessions:** GPS arrival and departure timestamps suffice. Client confirms via TROTT-01 Task Confirm or auto-confirms after 24 hours for trusted recurring arrangements.

## Domain-Specific Event Kinds

| Kind | Name | Description |
|------|------|-------------|
| 30740 | Cleaning Request | Booking request with property details and cleaning type |
| 30741 | Recurring Schedule | Standing arrangement: frequency, day, time, duration |
| 30742 | Session Report | Summary of work completed, any issues noted |
| 30743 | Supply Request | Cleaner requests specific supplies from client |
| 30744 | Property Inventory | Documented property condition for end-of-tenancy cleans |
| 30745-30759 | *(Reserved)* | Future cleaning extensions |

## Regulatory Context

Domestic cleaning is **unregulated in the UK**. No licensing or certification is required. Operators may wish to verify DBS (Disclosure and Barring Service) checks for cleaners working in private homes, though this is not a statutory requirement. Self-employed cleaners are responsible for their own tax affairs (HMRC registration). Employers of cleaners must comply with the National Minimum Wage Act 1998 and relevant employment legislation. Commercial cleaning may require COSHH (Control of Substances Hazardous to Health) compliance for certain products.
