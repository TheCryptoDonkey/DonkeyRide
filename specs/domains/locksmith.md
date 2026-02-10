# TROTT Domain Profile: Locksmith

`draft`

**Domain identifier:** `locksmith`
**Coordination pattern:** Dispatch
**Event kind range:** 30620-30639

## TROTT Specs Used

- TROTT-01: Core **Yes**
- TROTT-02: Discovery (geographic broadcast + skill search) **Yes**
- TROTT-03: Reputation **Yes**
- TROTT-04: Payments (competitive quoting, escrowed) **Yes**
- TROTT-05: Safety (disputes) **Yes**
- TROTT-06: Coordination (recommended) **Yes**
- TROTT-07: Navigation **No** (dispatch only; no transport phase)

## Roles

- Requester: "Customer"
- Provider: "Locksmith"

## State Machine Extension

The locksmith domain expands the TROTT-01 `in_progress` phase to include an on-site assessment and formal quote before work begins:

```
accepted --> en_route --> arrived --> access_method_confirmed --> work_active --> completed --> confirmed
                                          |
                                          +--> cancelled (customer declines quote; no penalty to customer)
```

| Core state | Locksmith state | Description |
|------------|-----------------|-------------|
| `in_progress` (phase 1) | `access_method_confirmed` | Locksmith has assessed the lock, issued a quote, and customer has accepted |
| `in_progress` (phase 2) | `work_active` | Locksmith is actively working on gaining entry |

Additional terminal state: `no_show` -- customer not present when locksmith arrives.

## Domain-Specific Tags

| Tag | Description |
|-----|-------------|
| `lock_type` | Type of lock: `yale`, `mortice`, `euro_cylinder`, `padlock`, `digital`, `safe`, `vehicle`, `unknown` |
| `access_type` | Method of entry: `picking`, `drilling`, `bumping`, `bypass`, `key_cutting`, `replacement`, `decoding` |
| `property_type` | Property category: `residential`, `commercial`, `vehicle` |
| `service_urgency` | Urgency: `emergency`, `urgent`, `scheduled` |
| `quoted_price` | Confirmed price after on-site assessment (smallest currency unit) |
| `parts_required` | Whether replacement parts are needed: `true`/`false` |

## Rating Criteria

| Criterion | Weight |
|-----------|--------|
| `overall` | 0.25 |
| `punctuality` | 0.20 |
| `workmanship` | 0.25 |
| `pricing_fairness` | 0.15 |
| `tidiness` | 0.15 |

## Pricing Model

**Flat rate with quote negotiation.** An initial estimate range is provided at dispatch. The locksmith issues a binding quote (TROTT-04 Quote, kind 30530) after on-site assessment. Customer accepts or declines before work begins. If declined, the callout transitions to `cancelled` with no penalty to the customer.

## Cancellation Policy

| Stage | Penalty |
|-------|---------|
| Before match | None |
| After match, before arrival | 80% of staked amount |
| Customer declines on-site quote | None to customer; locksmith forfeits travel-only stake |
| After work begins | Full stake forfeit for cancelling party |
| No-show (customer absent) | 100% of customer stake (automatic) |

Default stakes: Customer 10% of estimate, Locksmith 15% of estimate. Stakes recalculated against confirmed `quoted_price` upon acceptance.

## PII Requirements

Customer address (precise location for dispatch). Transmitted via TROTT-06 PII Envelope. Retained for task duration plus 30 days. Public events use geohash only.

## Safety Rules

- **Check-ins:** Not required (short-duration task).
- **Location privacy:** Customer address is especially sensitive -- reveals both home location and the fact that they are locked out. Geohash only in public events.

## Completion Proof

GPS arrival confirmation at the customer's location. Optional photo evidence of completed work (recommended for drilling or lock replacement). Customer confirms via TROTT-01 Task Confirm.

## Domain-Specific Event Kinds

| Kind | Name | Description |
|------|------|-------------|
| 30620 | Quote Negotiation | Locksmith issues binding quote after on-site assessment |
| 30621 | Quote Acceptance | Customer accepts or declines the quote |
| 30622 | Access Method Confirmation | Formal confirmation of access method, triggering work |
| 30623 | Guarantee Period Start | Locksmith offers a guarantee on the completed work |
| 30624-30639 | *(Reserved)* | Future locksmith extensions |

## Regulatory Context

**Locksmiths are unregulated in the United Kingdom.** No mandatory licensing, qualifications, or statutory register exists. Anyone may advertise as a locksmith without oversight. This makes the protocol's trust mechanisms -- commitment stakes, verifiable reputation, and quote negotiation -- especially valuable. Voluntary bodies such as the Master Locksmiths Association (MLA) exist but membership is not required by law.
