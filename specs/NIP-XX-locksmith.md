# NIP-XX-locksmith: Locksmith Dispatch Domain Extension

`draft` `optional`

**Extends**: NIP-XX-core (Decentralised Service Coordination Protocol)
**Domain Identifier**: `locksmith`
**Allocated Kind Range**: 30600-30619
**Reference Implementation**: `src/domain-profiles/locksmith.js`

---

## Abstract

This document defines the **locksmith dispatch** domain extension to NIP-XX-core. It specifies role aliases, an extended state machine, domain-specific tags, pricing semantics, and rating criteria for coordinating emergency and scheduled locksmith callouts over the Nostr protocol with payment-agnostic financial rails.

The locksmith domain is a near-perfect fit for the NIP-XX protocol. The UK locksmith industry, in particular, is plagued by scam operators who quote low prices over the telephone and demand vastly inflated sums upon arrival — exploiting the customer's urgency and vulnerability. Commitment stakes directly address this by requiring the locksmith to lock funds against the quoted price, creating a verifiable, enforceable price commitment before the customer is in a position of weakness.

## Regulatory Context

**Locksmiths are unregulated in the United Kingdom.** There is no mandatory licensing, no required qualifications, and no statutory register. Anyone may advertise and operate as a locksmith without oversight. This regulatory vacuum makes the protocol's trust layer — commitment stakes, cryptographic reputation, and dispute resolution — especially valuable. The protocol provides the trust mechanisms that regulation otherwise would.

Voluntary industry bodies exist (e.g., the Master Locksmiths Association) but membership is not required by law. Operators MAY choose to verify MLA membership or equivalent credentials, but this is at their discretion.

Operators in other jurisdictions MUST verify local licensing requirements. Some countries and states do regulate locksmithing.

---

## Currency-Neutral Amounts

All monetary amounts in locksmith events are **currency-neutral**. The `amount` value is always in the smallest unit of the specified currency (pence for GBP, cents for USD, satoshis for SAT). Every event with a monetary value MUST include `currency` and `trust_model` tags. See [NIP-XX-payments.md](NIP-XX-payments.md) and [NIP-XX-stakes.md](NIP-XX-stakes.md).

---

## Terminology

| Generic Term (NIP-XX-core) | Locksmith Domain Alias | Description |
|----------------------------|------------------------|-------------|
| Requester | **Customer** | The person locked out or requiring lock services |
| Provider | **Locksmith** | The tradesperson performing the lock work |
| Task | **Callout** | A single locksmith dispatch and service job |
| Operator | Operator | The relay/server coordinating callouts (unchanged) |

Implementations SHOULD accept both the generic terms (`requester_pubkey`, `provider_pubkey`) and the domain-specific aliases (`customer_pubkey`, `locksmith_pubkey`). The `domain` tag MUST be set to `"locksmith"` on all events.

```json
["domain", "locksmith"]
```

---

## Discovery Method

**Method**: `geohash`

Locksmith discovery uses the same geohash-based spatial indexing as ridesharing. Customers broadcast their location (geohash-encoded) and available locksmiths within the relevant geohash tiles are notified.

```json
["geohash", "gcpvj0"]
```

---

## Pricing Model

**Model**: `flatRate` with `quoteNegotiation` enabled

Unlike ridesharing (distance-based metering), locksmith work is priced as a flat rate per job. However, the final price often cannot be determined until the locksmith arrives and assesses the lock, the access method required, and any parts needed.

### Quote Negotiation Flow

1. **Initial estimate** — Customer describes the lockout; operator provides a rough estimate range
2. **Assessment on arrival** — Locksmith arrives, inspects the lock, and determines the access method
3. **Formal quote issued** — Locksmith publishes a quote event with the confirmed price and access method
4. **Customer accepts or declines** — Customer reviews the quote; if declined, no penalty applies (locksmith forfeits their travel-only stake)
5. **Work proceeds** — Upon acceptance, stakes are adjusted to the quoted price and work begins

This flow protects customers from the bait-and-switch pricing that plagues the industry.

```json
{
  "pricing_model": "flatRate",
  "quote_negotiation": true,
  "initial_estimate": 7500,
  "estimate_range": {
    "min": 5000,
    "max": 15000
  },
  "currency": "GBP"
}
```

---

## State Machine

The locksmith domain extends the NIP-XX-core state machine by inserting two additional states between `provider_arrived` and `completed`: **`access_method_confirmed`** and **`work_active`**. A final state **`access_gained`** replaces the generic `completed` to indicate successful entry.

```
lockout_reported ──> locksmith_matched ──> en_route ──> arrived
       │                    │                 │            │
       │                    │                 │            v
       │                    │                 │     access_method_confirmed
       │                    │                 │            │
       │                    │                 │            v
       │                    │                 │       work_active
       │                    │                 │            │
       │                    │                 │            v
       │                    │                 │      access_gained
       │                    │                 │
       └────────────────────┴─────────────────┴──── cancelled
                   (from any non-terminal state)

Terminal states: access_gained, cancelled, no_show.
no_show: customer not present when locksmith arrives (triggers automatic stake forfeiture).
```

### State Definitions

| Core State | Locksmith State | Description |
|------------|----------------|-------------|
| `requested` | `lockout_reported` | Customer has reported a lockout or lock service need |
| `matched` | `locksmith_matched` | A locksmith has accepted the callout |
| `provider_en_route` | `en_route` | Locksmith is travelling to the customer's location |
| `provider_arrived` | `arrived` | Locksmith has arrived and is assessing the situation |
| *(extension)* | `access_method_confirmed` | Locksmith has confirmed the access method (picking, drilling, replacement) and issued a formal quote; customer has accepted |
| *(extension)* | `work_active` | Locksmith is actively working on gaining entry |
| `completed` | `access_gained` | Entry has been gained or lock work completed successfully |
| `cancelled` | `cancelled` | Callout was cancelled (valid from any non-terminal state) |

### State Transitions

| From | To | Trigger |
|------|----|---------|
| `lockout_reported` | `locksmith_matched` | Locksmith accepts the callout |
| `lockout_reported` | `cancelled` | Customer cancels before match |
| `locksmith_matched` | `en_route` | Locksmith begins travel |
| `locksmith_matched` | `cancelled` | Either party cancels |
| `en_route` | `arrived` | Locksmith GPS confirms arrival |
| `en_route` | `cancelled` | Either party cancels |
| `arrived` | `access_method_confirmed` | Locksmith issues quote; customer accepts |
| `arrived` | `no_show` | Customer not present within waiting limit |
| `arrived` | `cancelled` | Customer declines quote or either party cancels |
| `access_method_confirmed` | `work_active` | Locksmith begins work |
| `access_method_confirmed` | `cancelled` | Either party cancels (stake penalties may apply) |
| `work_active` | `access_gained` | Lock work completed; entry gained |
| `work_active` | `cancelled` | Exceptional cancellation (dispute likely) |

---

## Domain-Specific Tags

The following tags are specific to the locksmith domain and SHOULD be included on relevant events.

| Tag | Required | Description | Example Values |
|-----|----------|-------------|----------------|
| `lock_type` | RECOMMENDED | Type of lock being serviced | `yale`, `mortice`, `euro_cylinder`, `padlock`, `digital`, `safe`, `vehicle`, `unknown` |
| `service_urgency` | RECOMMENDED | Urgency level of the callout | `emergency` (locked out now), `urgent` (within hours), `scheduled` (pre-booked) |
| `access_method` | After assessment | Method the locksmith will use to gain entry | `picking`, `drilling`, `bumping`, `bypass`, `key_cutting`, `replacement`, `decoding` |
| `quoted_price` | After assessment | Confirmed price in smallest currency unit after on-site assessment | `8500` (integer, e.g. pence for GBP) |

### Tag Examples

**On a callout request (kind 30500):**

```json
{
  "kind": 30500,
  "tags": [
    ["domain", "locksmith"],
    ["d", "callout_abc123"],
    ["geohash", "gcpvj0"],
    ["lock_type", "yale"],
    ["service_urgency", "emergency"],
    ["description", "Locked out of flat, Yale lock, no spare key"],
    ["customer_pubkey", "abc123..."]
  ],
  "content": ""
}
```

**On an access method confirmation (kind 30601):**

```json
{
  "kind": 30601,
  "tags": [
    ["domain", "locksmith"],
    ["d", "callout_abc123"],
    ["access_method", "picking"],
    ["quoted_price", "85000"],
    ["lock_type", "yale"],
    ["estimate_minutes", "15"],
    ["parts_required", "false"]
  ],
  "content": "Standard Yale pick — no damage to door or frame."
}
```

---

## Rating Criteria

After a callout is completed, both parties publish rating events (kind 30530) with domain-specific criteria.

| Criterion Tag | Label | Weight | Description |
|---------------|-------|--------|-------------|
| `overall` | Overall | 0.25 | General satisfaction with the service |
| `punctuality` | Punctuality | 0.20 | Arrived within estimated time window |
| `workmanship` | Workmanship | 0.25 | Quality of the lock work performed |
| `pricing_fairness` | Pricing Fairness | 0.15 | Final price was fair relative to the quote and market rate |
| `tidiness` | Tidiness | 0.15 | Left the property clean and tidy; no unnecessary damage |

### Rating Event Example

```json
{
  "kind": 30530,
  "tags": [
    ["domain", "locksmith"],
    ["task_id", "callout_abc123"],
    ["rated_pubkey", "locksmith_pubkey_xyz"],
    ["overall", "5"],
    ["punctuality", "4"],
    ["workmanship", "5"],
    ["pricing_fairness", "5"],
    ["tidiness", "5"]
  ],
  "content": "Brilliant service. Picked the Yale in under 10 minutes, no damage. Price exactly as quoted."
}
```

---

## Locksmith-Specific Event Kinds (30600-30619)

The following kind range is reserved for locksmith-domain-specific events. Core protocol kinds (30500-30599) are shared across all domains.

| Kind | Name | Status | Replaceable | Publisher |
|------|------|--------|-------------|-----------|
| 30600 | *(Reserved)* | — | — | — |
| 30601 | Quote Negotiation | Draft | Yes (NIP-33) | Locksmith |
| 30602 | Quote Acceptance | Draft | No (append-only) | Customer |
| 30603 | Access Method Confirmation | Draft | Yes (NIP-33) | Locksmith |
| 30604 | *(Reserved)* | — | — | — |
| 30605 | Guarantee Period Start | Draft | Yes (NIP-33) | Locksmith |
| 30606-30619 | *(Reserved for future use)* | — | — | — |

### Kind 30601: Quote Negotiation Event

Published by the locksmith after arriving and assessing the lock. Contains the confirmed access method, parts required, and a binding price quote.

```json
{
  "kind": 30601,
  "tags": [
    ["domain", "locksmith"],
    ["d", "callout_abc123"],
    ["e", "<original_request_event_id>"],
    ["access_method", "drilling"],
    ["quoted_price", "12000"],
    ["currency", "GBP"],
    ["trust_model", "custodial-third-party"],
    ["parts_required", "true"],
    ["parts_description", "Euro cylinder replacement"],
    ["parts_cost", "3500"],
    ["labour_cost", "8500"],
    ["estimate_minutes", "30"],
    ["valid_for_seconds", "600"]
  ],
  "content": "Lock requires drilling — cylinder is anti-pick and cannot be bypassed. Replacement euro cylinder included in quote."
}
```

**Semantics:**
- `quoted_price` is the total binding price (labour + parts) in the smallest unit of the operator's currency
- `valid_for_seconds` indicates how long the quote remains valid (default: 600 seconds / 10 minutes)
- The locksmith's stake is adjusted to cover the quoted price upon acceptance
- If the customer declines, the callout transitions to `cancelled` with no penalty to the customer

### Kind 30602: Quote Acceptance Event

Published by the customer to accept or decline a quote.

```json
{
  "kind": 30602,
  "tags": [
    ["domain", "locksmith"],
    ["e", "<quote_event_id>"],
    ["d", "callout_abc123"],
    ["accepted", "true"],
    ["quoted_price", "12000"],
    ["currency", "GBP"]
  ],
  "content": ""
}
```

### Kind 30603: Access Method Confirmation Event

Published by the locksmith to formally confirm the access method being used, triggering the `access_method_confirmed` state transition.

```json
{
  "kind": 30603,
  "tags": [
    ["domain", "locksmith"],
    ["d", "callout_abc123"],
    ["e", "<quote_acceptance_event_id>"],
    ["access_method", "drilling"],
    ["status", "access_method_confirmed"]
  ],
  "content": "Proceeding with drilling. Estimated 30 minutes."
}
```

### Kind 30605: Guarantee Period Start

Published after completion if the locksmith offers a guarantee on the work (e.g., replacement lock guaranteed for 12 months).

```json
{
  "kind": 30605,
  "tags": [
    ["domain", "locksmith"],
    ["d", "callout_abc123"],
    ["guarantee_days", "365"],
    ["guarantee_scope", "Replacement euro cylinder and fitting"],
    ["locksmith_pubkey", "xyz..."]
  ],
  "content": "12-month guarantee on replacement cylinder and fitting. Contact via Nostr DM for warranty claims."
}
```

---

## Staking Model

The locksmith domain uses asymmetric staking to protect vulnerable customers:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Requester (customer) stake | 10% of estimate | Lower stake — customer is already in a vulnerable position |
| Provider (locksmith) stake | 15% of estimate | Higher stake — deters bait-and-switch pricing |
| Penalty on cancellation | 80% of stake | Strong deterrent against no-shows |

Stakes are initially based on the estimate range. Upon quote acceptance (kind 30602), stakes are recalculated against the confirmed `quoted_price`.

---

## Completion Proof

Locksmith callouts use the following proof types:

| Proof Type | Description |
|------------|-------------|
| `gps_arrival` | GPS coordinates confirming the locksmith arrived at the customer's location |
| `photo` | Optional photo evidence of completed work (e.g., new lock fitted) |

Photo proof is optional but recommended, particularly for jobs involving drilling or lock replacement, as it provides evidence in the event of a dispute.

---

## Dispute Evidence Types

| Evidence Type | Description |
|---------------|-------------|
| `text` | Written description of the dispute |
| `photo` | Photographic evidence (e.g., damage, incomplete work) |
| `gps_trace` | GPS trace showing the locksmith's movements |
| `price_quote` | The original quote event, proving the agreed price |

---

## Relationship to Core Protocol

The locksmith domain uses all core NIP-XX event kinds for task lifecycle management, staking, payments, disputes, and reputation. The domain-specific kinds (30600-30619) extend the core protocol with locksmith-specific semantics — principally around quote negotiation and access method confirmation.

### Shared Core Kinds Used

| Kind | Name | Usage in Locksmith Domain |
|------|------|---------------------------|
| 30500 | Service Request | Customer reports lockout / requests service |
| 30501 | Service Acceptance | Locksmith accepts the callout |
| 30502 | Stake Lock | Operator locks commitment stakes |
| 30510 | Streaming Payment | Not typically used (flat rate, not streaming) |
| 30511 | Payment Confirmation | Final payment confirmation after work complete |
| 30512 | Status Update | State transitions during the callout |
| 30513 | Provider Tip | Customer tips the locksmith |
| 30520 | Stake Release | Operator releases stakes upon completion |
| 30522 | Dispute Filing | Either party files a dispute |
| 30524 | Dispute Resolution | Arbiter resolves the dispute |
| 30530 | Reputation Rating | Post-callout rating with locksmith-specific criteria |

---

## Security Considerations

1. **Location privacy** — Callout requests reveal the customer's home or business address. Implementations SHOULD use NIP-17 gift wrap or NIP-44 encryption for the precise address, with only the geohash visible publicly.
2. **Vulnerability exploitation** — Customers locked out are in a vulnerable state. The quote negotiation flow with commitment stakes is specifically designed to prevent exploitation.
3. **Property access** — Locksmiths gain access to properties. Operators SHOULD consider identity verification requirements even though they are not legally mandated.

---

## Future Work

- **Key cutting events** — Dedicated event kinds for key duplication services
- **Safe opening** — Extended state machine for safe/vault work (longer timeframes)
- **Vehicle lockout** — Vehicle-specific tags (make, model, year) and auto-locksmith specialisation
- **MLA verification** — Optional Master Locksmiths Association credential verification via NIP-XX-core verification kinds
- **Multi-lock jobs** — Support for callouts involving multiple locks at the same property
- **Insurance integration** — Locksmith public liability insurance verification

---

## See Also

- **[NIP-XX-core.md](NIP-XX-core.md)** — Domain-agnostic core protocol (this extension's parent)
- **[NIP-XX-stakes.md](NIP-XX-stakes.md)** — Commitment stakes (lock, release, forfeit)
- **[NIP-XX-payments.md](NIP-XX-payments.md)** — Payment events and streaming models
- **[NIP-XX-reputation.md](NIP-XX-reputation.md)** — Ratings and reputation portability
- **[QUICK-REFERENCE.md](QUICK-REFERENCE.md)** — Summary table of all event kinds
- **[../docs/PAYMENT-PROVIDERS.md](../docs/PAYMENT-PROVIDERS.md)** — Payment provider integration guide
- **Reference implementation**: `src/domain-profiles/locksmith.js`
- **Master Locksmiths Association**: https://www.locksmiths.co.uk/ (voluntary industry body)
- **UK Gov — Locksmith regulation**: No statutory regulation exists as of 2025
