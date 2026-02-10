# NIP-XX-reputation: Ratings and Reputation

`draft` `optional`

## Abstract

This NIP defines a **domain-agnostic reputation system** using cryptographically signed rating events stored on public Nostr relays. Reputation is portable across operators and domains, unforgeable (signed by the rater's private key), and transparent (anyone can query and verify).

Rating criteria are not hardcoded — each domain profile defines which criteria are available (e.g. `safety` and `punctuality` for ridesharing, `workmanship` and `price_transparency` for locksmith). The core protocol provides the event schemas; the domain profile provides the semantics.

## Motivation

Traditional platforms control reputation data, creating vendor lock-in and enabling manipulation. By storing ratings as signed Nostr events, this protocol ensures:

- **No lock-in** — A provider's reputation follows their pubkey across operators
- **No manipulation** — Operators cannot fabricate, delete, or modify ratings signed by other pubkeys
- **Transparency** — Anyone can independently compute a provider's reputation from public events
- **Cross-domain portability** — A reliable courier on DonkeyPack carries that reputation into DonkeyRide

## Depends On

- **NIP-XX-core**: Core service coordination protocol
- **NIP-02**: Follow lists (for WoT-weighted reputation / social proof)
- **NIP-32**: Structured labels (for provider and outcome labelling)
- **NIP-33**: Parameterised replaceable events
- **NIP-85**: Trusted assertions (for computed reputation summaries)
- **NIP-58**: Badges (for verification credentials)

## Event Kinds

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30517 | Provider Rating | No (append-only) | Requester |
| 30518 | Requester Rating | No (append-only) | Provider |
| 30519 | Reputation Summary | Yes (NIP-33) | Anyone (typically operator) |
| 30521 | Reputation Export/Import | Yes (NIP-33) | Anyone |
| 30528 | Operator Reputation | Yes (NIP-33) | Anyone |
| 30530 | Reputation Rating | No (append-only) | Either party |

---

## Event Structures

### Kind 30517: Provider Rating

Published by the requester after task completion to rate the provider.

```json
{
  "kind": 30517,
  "tags": [
    ["d", "task_abc123_provider_rating"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["p", "<provider_hex_pubkey>"],
    ["rated_pubkey", "<provider_hex_pubkey>"],
    ["rating", "overall", "4"],
    ["rating", "punctuality", "5"],
    ["rating", "safety", "4"],
    ["rating", "courtesy", "3"],
    ["safety_flag", "false"]
  ],
  "content": "Good driver, arrived on time. Took a slightly longer route but was polite about it."
}
```

**Required tags**: `d`, `p` (rated pubkey), `rating` (at least one)
**Optional tags**: `domain`, `task_id`, `rated_pubkey`, `safety_flag`

### Kind 30518: Requester Rating

Published by the provider after task completion to rate the requester.

```json
{
  "kind": 30518,
  "tags": [
    ["d", "task_abc123_requester_rating"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["p", "<requester_hex_pubkey>"],
    ["rated_pubkey", "<requester_hex_pubkey>"],
    ["rating", "overall", "5"],
    ["rating", "punctuality", "5"],
    ["rating", "communication", "5"],
    ["safety_flag", "false"]
  ],
  "content": "Ready at pickup, pleasant passenger."
}
```

**Required tags**: `d`, `p` (rated pubkey), `rating` (at least one)
**Optional tags**: `domain`, `task_id`, `rated_pubkey`, `safety_flag`

### Kind 30519: Reputation Summary

A computed summary of a user's reputation across recent ratings. Operators SHOULD publish these periodically for their active users. Anyone MAY publish a summary — consumers decide which publishers they trust.

```json
{
  "kind": 30519,
  "tags": [
    ["d", "<subject_hex_pubkey>"],
    ["domain", "ridesharing"],
    ["p", "<subject_hex_pubkey>"],
    ["average_rating", "4.7"],
    ["total_ratings", "342"],
    ["total_tasks", "358"],
    ["completion_rate", "0.96"],
    ["no_show_count", "2"],
    ["dispute_count", "1"],
    ["member_since", "1680000000"],
    ["last_updated", "1698765432"],
    ["rating_breakdown", "{\"5\": 280, \"4\": 42, \"3\": 12, \"2\": 5, \"1\": 3}"]
  ],
  "content": ""
}
```

**Required tags**: `d` (subject pubkey), `p` (subject pubkey), `average_rating`, `total_ratings`
**Optional tags**: `domain`, `total_tasks`, `completion_rate`, `no_show_count`, `dispute_count`, `member_since`, `last_updated`, `rating_breakdown`

### Kind 30521: Reputation Export/Import

Enables a user to export their reputation data from one operator and import it to another. The exported bundle includes references to the original signed rating events, which can be independently verified.

```json
{
  "kind": 30521,
  "tags": [
    ["d", "<subject_hex_pubkey>_export"],
    ["p", "<subject_hex_pubkey>"],
    ["source_operator", "<operator_pubkey>"],
    ["source_domain", "ridesharing"],
    ["export_timestamp", "1698765432"],
    ["rating_event_ids", "<event_id_1>,<event_id_2>,<event_id_3>"],
    ["relay_hints", "wss://relay.example.com,wss://relay2.example.com"]
  ],
  "content": ""
}
```

**Required tags**: `d`, `p` (subject pubkey), `source_operator`
**Optional tags**: `source_domain`, `export_timestamp`, `rating_event_ids`, `relay_hints`

### Kind 30528: Operator Reputation

A reputation summary for an operator, computed from user ratings of the operator itself (service quality, dispute handling, fee fairness).

```json
{
  "kind": 30528,
  "tags": [
    ["d", "<operator_pubkey>"],
    ["p", "<operator_pubkey>"],
    ["average_rating", "4.2"],
    ["total_ratings", "1205"],
    ["total_tasks_facilitated", "15420"],
    ["dispute_resolution_rate", "0.94"],
    ["average_fee_percent", "5.2"],
    ["active_domains", "ridesharing,locksmith"],
    ["bond_amount", "50000"],
    ["bond_currency", "GBP"]
  ],
  "content": ""
}
```

**Required tags**: `d` (operator pubkey), `p` (operator pubkey), `average_rating`
**Optional tags**: `total_ratings`, `total_tasks_facilitated`, `dispute_resolution_rate`, `average_fee_percent`, `active_domains`, `bond_amount`, `bond_currency`

### Kind 30530: Reputation Rating

A general-purpose rating event used by the current implementation. Both requester and provider publish kind 30530 events with a `rating` tag and a `p` tag pointing to the rated party.

```json
{
  "kind": 30530,
  "tags": [
    ["d", "task_abc123_rating_by_requester"],
    ["ride", "task_abc123"],
    ["role", "rider"],
    ["p", "<provider_hex_pubkey>"],
    ["rating", "4"]
  ],
  "content": "Great service, would use again."
}
```

**Required tags**: `d`, `p` (rated pubkey), `rating`
**Optional tags**: `ride`/`task_id`, `role`

> **Implementation note**: The reference server currently uses kind 30530 for all ratings. Kinds 30517 and 30518 provide finer-grained semantics (distinguishing provider vs requester ratings) and SHOULD be adopted in future versions. Kind 30530 remains valid for backward compatibility.

---

## Rating Criteria

Rating criteria are **defined by domain profiles**, not by this specification. The `rating` tag uses a flexible format:

```
["rating", "<criterion>", "<value>"]
```

Where `<criterion>` is an arbitrary string defined by the domain profile and `<value>` is a numeric score (typically 1-5).

### Examples by Domain

| Domain | Criteria | Weights |
|--------|----------|---------|
| Ridesharing | `overall` (40%), `punctuality` (20%), `safety` (20%), `courtesy` (20%) | Weighted average |
| Locksmith | `overall` (30%), `punctuality` (20%), `price_transparency` (30%), `skill` (20%) | Weighted average |
| Delivery | `overall` (30%), `punctuality` (25%), `package_care` (25%), `communication` (20%) | Weighted average |
| Emergency trades | `overall` (20%), `diagnosis_accuracy` (25%), `workmanship` (25%), `transparency` (20%), `tidiness` (10%) | Weighted average |
| Security guard | `overall` (25%), `alertness` (25%), `professionalism` (25%), `communication` (25%) | Equal weight |

The `overall` criterion SHOULD be present in all domains. Additional criteria are domain-specific. Implementations SHOULD weight recent ratings more heavily (time decay).

---

## Cross-Domain Portability

A provider's reputation follows their Nostr pubkey across operators and domains. This works because:

1. **Ratings are signed by the rater's pubkey** — they cannot be fabricated by operators
2. **Ratings are stored on public Nostr relays** — any operator can query them
3. **The `p` tag indexes ratings by the rated pubkey** — standard Nostr relay filtering

### Importing Reputation

When a provider joins a new operator:

1. The new operator queries relays for kind 30530/30517/30518 events with `#p` matching the provider's pubkey
2. The operator verifies each event's signature independently
3. The operator computes a reputation score from verified events
4. Optionally, the provider publishes a kind 30521 export event with relay hints to help the new operator find events

### Cross-Domain Weighting

Operators MAY apply domain-specific weighting when importing cross-domain reputation. For example, a ridesharing operator might weight delivery ratings at 50% (relevant skills: punctuality, communication) and locksmith ratings at 30% (less overlap).

---

## Social Proof

The protocol integrates with **NIP-02 follow lists** (kind 3) to provide Web of Trust (WoT) weighted reputation scoring. Rather than treating all ratings equally, operators MAY weight ratings based on the social distance between the rater and the person querying the reputation.

### WoT-Weighted Ratings

When computing a provider's reputation for a specific requester, operators SHOULD apply social distance multipliers:

| Social Distance | Weight Multiplier | Description |
|----------------|-------------------|-------------|
| Direct follow (1-hop) | 2.0x | The requester follows the rater's pubkey |
| Follow-of-follow (2-hop) | 1.5x | The rater is followed by someone the requester follows |
| Same community (3-hop) | 1.2x | Connected within 3 hops in the follow graph |
| Stranger | 1.0x | No social connection — baseline weight |

**Example**: A provider has two ratings — a 5-star from someone the requester follows (1-hop) and a 2-star from a stranger. Without WoT weighting, the average is 3.5. With WoT weighting: `(5 × 2.0 + 2 × 1.0) / (2.0 + 1.0) = 4.0`. The trusted rater's opinion carries more weight.

### Sybil Resistance

WoT weighting provides natural Sybil resistance. An attacker creating 100 fake pubkeys to inflate a provider's rating gains no advantage if those fake pubkeys have no social connections to the requester. The fake ratings receive only the baseline 1.0x multiplier, whilst genuine ratings from the requester's social graph carry 1.5-2.0x weight — effectively drowning out the Sybil attack.

This complements the anti-gaming measures in the [Anti-Gaming](#anti-gaming) section. Whilst append-only ratings prevent deletion and task linkage prevents fabrication, WoT weighting ensures that even valid-looking ratings from socially disconnected accounts have diminished influence.

### Implementation Notes

- Operators compute WoT distances by traversing kind 3 follow lists from the requester's pubkey outward.
- For performance, operators SHOULD pre-compute and cache the requester's 1-hop and 2-hop sets. The 3-hop set is expensive to compute and MAY be approximated or omitted.
- WoT-weighted scores are **personalised** — different requesters see different effective ratings for the same provider, based on their social graph. This is a feature, not a bug: it means reputation is contextual and harder to game.
- Operators SHOULD fall back to unweighted (1.0x for all) scoring when the requester has no kind 3 event or an empty follow list.

---

## NIP-85 Integration

Operators SHOULD publish computed reputation summaries as **NIP-85 trusted assertions** (kind 30382). This makes reputation data visible to the broader Nostr ecosystem, not just DonkeyRide-compatible clients.

```json
{
  "kind": 30382,
  "tags": [
    ["d", "<subject_pubkey>"],
    ["p", "<subject_pubkey>"],
    ["assertion", "service_rating", "4.7"],
    ["assertion", "tasks_completed", "342"],
    ["assertion", "completion_rate", "0.96"],
    ["context", "donkeyride:ridesharing"]
  ],
  "content": ""
}
```

Any Nostr client that understands NIP-85 can display these assertions, extending reputation visibility beyond the DonkeyRide ecosystem.

---

## NIP-32 Integration: Structured Labels

Operators and authorised verifiers MAY publish **NIP-32 structured label events** (kind 1985) to categorise providers and task outcomes. Unlike ratings (which are numeric scores), labels are categorical tags — "verified", "top_rated", "gas_safe" — that enable structured filtering across the Nostr ecosystem.

### Provider Labels

Operators publish labels against a provider's pubkey to surface qualifications, status, and achievements:

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

The `L` tag declares the label namespace (`com.donkeyride.provider`). Each `l` tag assigns a specific label within that namespace. Any Nostr client that understands NIP-32 can filter and display these labels.

#### Common Provider Labels

| Label | Description | Applicable Domains |
|-------|-------------|--------------------|
| `verified` | Identity verified by the operator | All |
| `top_rated` | Consistently rated 4.8+ over 50+ tasks | All |
| `background_checked` | Background check passed (complements NIP-58 badge) | All |
| `gas_safe` | Gas Safe registered engineer | Emergency trades |
| `sia_licensed` | SIA licence holder | Security guard |
| `phv_licensed` | Private hire vehicle licensed | Ridesharing |
| `food_hygiene` | Food hygiene certified | Food delivery |
| `insured` | Insurance verified | All |

### Task Outcome Labels

Operators publish labels against task completion events to categorise outcomes for structured analysis:

```json
{
  "kind": 1985,
  "tags": [
    ["L", "com.donkeyride.outcome"],
    ["l", "completed_successfully", "com.donkeyride.outcome"],
    ["l", "above_and_beyond", "com.donkeyride.outcome"],
    ["e", "<task_completion_event_id>"]
  ]
}
```

#### Common Outcome Labels

| Label | Description |
|-------|-------------|
| `completed_successfully` | Task completed within normal parameters |
| `above_and_beyond` | Provider exceeded expectations (noted by requester) |
| `late_completion` | Completed but after the expected deadline |
| `partial_completion` | Only part of the task was fulfilled |
| `disputed_resolution` | Completed after dispute resolution |

### Relationship to Other NIP Integrations

NIP-32 labels complement but do not replace other reputation mechanisms:

- **NIP-58 badges** are awarded to specific providers with rich metadata (images, descriptions). Labels are lightweight categorical tags.
- **NIP-85 assertions** carry computed numeric values (rating averages, completion rates). Labels are boolean flags.
- **Ratings (kinds 30517/30518/30530)** are numeric scores from individual interactions. Labels summarise patterns across many interactions.

Operators SHOULD publish labels alongside badges and assertions to provide multiple views of provider reputation to the broader Nostr ecosystem.

---

## NIP-58 Integration

Verification badges (background check passed, insurance verified, professional licensing) are published as **NIP-58 badge events**:

### Badge Definition (kind 30009)

Published by the operator to define a badge type:

```json
{
  "kind": 30009,
  "tags": [
    ["d", "background_check_passed"],
    ["name", "Background Check Passed"],
    ["description", "This provider has passed an enhanced DBS check via Checkr/Onfido"],
    ["image", "https://example.com/badges/background-check.png"],
    ["thumb", "https://example.com/badges/background-check-thumb.png"]
  ],
  "content": ""
}
```

### Badge Award (kind 8)

Published by the operator to award a badge to a specific provider:

```json
{
  "kind": 8,
  "tags": [
    ["a", "30009:<operator_pubkey>:background_check_passed"],
    ["p", "<provider_pubkey>"],
    ["expiration", "1730000000"]
  ],
  "content": ""
}
```

### Common Badges

| Badge ID | Name | Applicable Domains |
|----------|------|--------------------|
| `background_check_passed` | Background Check Passed | All |
| `insurance_verified` | Insurance Verified | All |
| `sia_licensed` | SIA Licensed | Security guard |
| `gas_safe_registered` | Gas Safe Registered | Emergency trades (gas) |
| `food_hygiene_level2` | Food Hygiene Level 2 | Food delivery |
| `phv_licensed` | PHV Licensed | Ridesharing |
| `dbs_enhanced` | Enhanced DBS Check | All |

Badges are visible across the Nostr ecosystem. A locksmith with a `background_check_passed` badge carries that credential into any context where their pubkey is displayed.

---

## Anti-Gaming

The reputation system is designed to resist manipulation:

1. **Append-only ratings** — Rating events (kinds 30517, 30518, 30530) are non-replaceable. Once published, they cannot be modified or deleted by anyone, including the operator.
2. **Signed by the rater** — Each rating is signed by the rater's Nostr private key. Operators cannot fabricate ratings on behalf of users.
3. **Task linkage** — Ratings reference a specific task ID. Implementations SHOULD verify that the rater was a participant in the referenced task.
4. **Rate limiting** — Implementations SHOULD limit one rating per party per task to prevent flooding.
5. **Time validation** — Implementations SHOULD reject rating events with timestamps too far from the task completion time.
6. **Sybil resistance** — Operators MAY require a minimum stake history or completed task count before publishing ratings. Reputation summaries (kind 30519) SHOULD report total task count alongside rating count.

### What Operators Cannot Do

- **Fabricate ratings** — They don't have the rater's private key
- **Delete ratings** — Events are on public relays, not in the operator's database
- **Modify ratings** — Events are cryptographically signed and append-only
- **Selectively display ratings** — Any client can independently query and compute reputation

### What Operators Can Do

- **Weight ratings** — Apply time decay, domain weighting, or trust scoring to their own reputation summaries
- **Flag suspicious patterns** — Report potential Sybil attacks via kind 30549 (Suspicious Activity)
- **Require badges** — Only match providers with specific NIP-58 verification badges

---

## GDPR Compliance: Crypto-Shredding

Rating events contain pseudonymous identifiers (Nostr pubkeys) which are personal data under GDPR (see *Breyer v Bundesrepublik*, C-582/14). When a user exercises their right to erasure (Article 17):

1. **Destroy the user's key pair** — Without the private key, the pubkey becomes unlinkable to any natural person
2. **NIP-62 Request to Vanish** — Submit deletion requests to relays for all events authored by the pubkey
3. **Ratings by other users** — Events signed by OTHER pubkeys about this user cannot be deleted by the user or operator. Under GDPR, the rating publisher is the data controller for their own events.

Crypto-shredding is endorsed by CNIL (French data protection authority) as an approach that "comes closer to compliance" with Article 17 for blockchain/distributed systems. The EDPB (April 2025 guidelines) recommends storing only hashes, commitments, or ciphertexts on distributed ledgers.

> **Note**: Relay operators may retain event data regardless of deletion requests. The protocol cannot guarantee physical deletion from all relays. Crypto-shredding provides unlinkability rather than physical erasure.

---

## See Also

- **NIP-XX-core**: Core protocol (state machine, lifecycle)
- **NIP-XX-disputes**: Dispute resolution and guardian voting
- **NIP-XX-discovery**: Service discovery (social discovery / BatPhone pattern)
- **NIP-02**: Follow lists (WoT-weighted reputation)
- **NIP-32**: Structured labels (provider and outcome labelling)
- **NIP-85**: Trusted assertions (reputation summaries)
- **NIP-58**: Badges (verification credentials)
- **NIP-56**: Reporting (standard Nostr reporting, complementing internal disputes)
- **docs/GDPR-COMPLIANCE.md**: Full GDPR compliance guide for operators
