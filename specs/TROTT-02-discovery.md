# TROTT-02: Discovery — Finding Providers & Advertising Availability

`draft` `optional`

## Abstract

This specification defines **provider discovery and availability advertising** for the TROTT protocol. It specifies how providers broadcast their availability, how requesters find matching providers, and how operators advertise their services. Three complementary discovery modes are defined: **geographic broadcast** (geohash-based), **category and skill search** (tag-based), and **trusted provider networks** (requester-curated lists). A progressive location reveal mechanism ensures that precise coordinates are never exposed in public events.

## Motivation

Decentralised service coordination requires discovery mechanisms that do not depend on a single platform's matching algorithm. TROTT-02 enables any Nostr client to find available providers in any area or category, compare operators on transparent criteria (fee, reputation, trust model), and connect directly — all without a centralised directory.

Not all service domains are geographic. Online tutoring, consulting, and many skilled trades operate virtually or across wide regions. TROTT-02 therefore defines multiple discovery modes, with geographic broadcast as the default for location-bound services and category/skill search for virtual or specialist services.

## Depends On

- **TROTT-01**: Core task lifecycle and state machine (event kinds 30500-30507)
- **NIP-01**: Basic Protocol Flow and Event Format
- **NIP-33**: Parameterised Replaceable Events
- **NIP-40**: Expiration Timestamp
- **NIP-44**: Encrypted Payloads (for progressive location reveal)

---

## Event Kinds

| Kind | Name | Type | Publisher | Description |
|------|------|------|-----------|-------------|
| 20500 | Provider Availability | Ephemeral | Provider | "I'm available now, here" — real-time beacon |
| 30510 | Provider Profile | Parameterised replaceable (NIP-33) | Provider | Capabilities, credentials, domains served, areas covered |
| 30511 | Operator Bond | Parameterised replaceable (NIP-33) | Operator | Operator stake, supported domains, terms, SLA |
| 30512 | Trusted Provider List | Parameterised replaceable (NIP-33) | Requester | Requester's preferred providers with personal ratings |

> **Note on kind 20500**: This is in the ephemeral event range (20000-29999). Relays MUST NOT persist these events. They are transient signals indicating current availability only.

> **Note on kinds 30510-30512**: These kinds are used for discovery-specific purposes as defined in this specification.

---

## Discovery Modes

### Mode 1: Geographic Broadcast

The default discovery mode for location-bound services (ridesharing, locksmith, delivery, towing, pet services). Providers broadcast their current location at coarse geohash precision. Requesters subscribe to geohash cells covering their area.

**How it works:**

1. Provider publishes kind 20500 (Provider Availability) ephemeral events every 30 seconds with a coarse geohash (precision 4-5, approximately 5-40 km)
2. Requester subscribes to kind 20500 events matching their geohash cell and its eight neighbours (9 cells total)
3. Matching providers appear in the requester's client
4. Requester publishes a Task Request (TROTT-01, kind 30500) with geohash tags
5. Available providers in range see the request and may offer or accept

**Geohash precision table:**

| Precision | Approximate Cell Size | Use In TROTT |
|-----------|----------------------|--------------|
| 3 | ~156 km x 156 km | Regional fallback, rural areas |
| 4 | ~39 km x 39 km | City-level discovery, default for availability |
| 5 | ~5 km x 5 km | Neighbourhood-level, default for service areas |
| 6 | ~1.2 km x 1.2 km | Post-acceptance only (NIP-44 encrypted) |
| 7+ | <300 m | In-progress only (NIP-44 encrypted, never public) |

**Nine-cell subscription:**

To avoid edge effects when a provider is near a geohash cell boundary, requesters MUST subscribe to the target cell plus its eight neighbours:

```
┌─────┬─────┬─────┐
│ NW  │  N  │ NE  │
├─────┼─────┼─────┤
│  W  │  *  │  E  │
├─────┼─────┼─────┤
│ SW  │  S  │ SE  │
└─────┴─────┴─────┘

* = requester's cell
```

The REQ filter for geographic discovery:

```json
{
  "kinds": [20500],
  "#g": ["gcpuuz", "gcpuuy", "gcpuux", "gcpuuv", "gcpuuw", "gcpvn0", "gcpvn1", "gcpvn2", "gcpvn3"],
  "#domain": ["ridesharing"]
}
```

### Mode 2: Category & Skill Search

For services where expertise or specialisation matters more than proximity (emergency trades, tutoring, consulting), or where services span wide geographic areas. Providers declare their skills, credentials, and service categories in their Provider Profile (kind 30510). Requesters search by category, skill tag, or credential.

**How it works:**

1. Provider publishes kind 30510 (Provider Profile) with `domain`, `skill`, `credential`, and `coverage` tags
2. Requester queries relays for Provider Profiles matching their criteria
3. Requester filters results by availability, rating, and location (if applicable)
4. Requester publishes a Task Request or contacts the provider directly

**REQ filter for category search:**

```json
{
  "kinds": [30510],
  "#domain": ["emergency_trades"],
  "#skill": ["plumber"]
}
```

**REQ filter for credential search:**

```json
{
  "kinds": [30510],
  "#credential": ["gas_safe_registered"]
}
```

**Multi-domain providers** are supported. A single Provider Profile MAY list multiple domains and skills:

```json
["domain", "emergency_trades"],
["domain", "locksmith"],
["skill", "plumber"],
["skill", "locksmith"],
["credential", "gas_safe_registered"],
["credential", "mla_approved"]
```

### Mode 3: Trusted Provider Network

Requesters maintain a personal list of preferred providers via kind 30512 (Trusted Provider List). This enables a "BatPhone" pattern where a requester's favourite providers are contacted first, falling back to broadcast discovery only if none are available.

**How it works:**

1. Requester publishes kind 30512 (Trusted Provider List) with `p` tags for each preferred provider, tagged with domain and a personal trust rating
2. When the requester creates a task, the operator checks the trusted list first
3. If a trusted provider is available and matches the request criteria, they are offered the task with priority
4. If no trusted provider is available, the operator falls back to geographic broadcast or category search
5. The requester MAY also instruct the operator to use both modes simultaneously (direct offer to trusted providers + broadcast to all)

**Priority tiers:**

| Tier | Source | Priority |
|------|--------|----------|
| 1. Trusted list | Providers in requester's kind 30512 event | Highest |
| 2. Direct follows | Providers in requester's NIP-02 follow list (kind 3) | High |
| 3. Previous providers | Providers with completed task history (verified via TROTT-06 rating events) | Medium |
| 4. Social proof | Providers followed by requester's follows (2-hop web of trust) | Low |
| 5. Open matching | Any available provider meeting minimum criteria | Default fallback |

---

## Event Structures

### Kind 20500: Provider Availability

Ephemeral beacon published by providers to signal real-time availability. Relays MUST NOT persist these events. Providers SHOULD publish every 30 seconds whilst on shift, with a 30-minute `expiration` tag as a safety net.

#### Geographic Availability (Location-Bound Services)

```json
{
  "kind": 20500,
  "pubkey": "<provider_hex_pubkey>",
  "created_at": 1698765432,
  "tags": [
    ["d", "<provider_hex_pubkey>_availability"],
    ["domain", "ridesharing"],
    ["t", "trott-availability"],
    ["g", "gcpuu"],
    ["g", "gcpu"],
    ["provider_pubkey", "<provider_hex_pubkey>"],
    ["operator_pubkey", "<operator_hex_pubkey>"],
    ["status", "available"],
    ["vehicle_type", "sedan"],
    ["rating", "4.8"],
    ["completed_tasks", "342"],
    ["expiration", "1698767232"]
  ],
  "content": ""
}
```

**Required tags**: `provider_pubkey`, `status`, `expiration`

**Required for geographic services**: `g` (at least one geohash at precision 4 or 5)

**Optional tags**: `d`, `domain`, `t`, `operator_pubkey`, `vehicle_type`, `rating`, `completed_tasks`

**Status values:**

| Status | Description |
|--------|-------------|
| `available` | Ready to accept tasks |
| `busy` | Currently on a task (visible but not accepting new work) |
| `offline` | Ending shift (final beacon before going offline) |

#### Virtual Availability (Non-Geographic Services)

For domains without geographic requirements (tutoring, consulting, remote support):

```json
{
  "kind": 20500,
  "pubkey": "<provider_hex_pubkey>",
  "created_at": 1698765432,
  "tags": [
    ["d", "<provider_hex_pubkey>_availability"],
    ["domain", "tutoring"],
    ["t", "trott-availability"],
    ["provider_pubkey", "<provider_hex_pubkey>"],
    ["operator_pubkey", "<operator_hex_pubkey>"],
    ["status", "available"],
    ["skill", "maths"],
    ["skill", "physics"],
    ["category", "academic_tutoring"],
    ["available_from", "1698771000"],
    ["available_until", "1698782400"],
    ["timezone", "Europe/London"],
    ["rating", "4.9"],
    ["completed_tasks", "128"],
    ["expiration", "1698767232"]
  ],
  "content": ""
}
```

The `g` tag is OPTIONAL for virtual services. Discovery relies on `skill`, `category`, and availability window tags instead.

#### Combined Availability (Multi-Mode Discovery)

For domains using both geographic and skill-based discovery (e.g. emergency plumber — must be nearby AND qualified):

```json
{
  "kind": 20500,
  "pubkey": "<provider_hex_pubkey>",
  "created_at": 1698765432,
  "tags": [
    ["d", "<provider_hex_pubkey>_availability"],
    ["domain", "emergency_trades"],
    ["t", "trott-availability"],
    ["g", "gcpuu"],
    ["provider_pubkey", "<provider_hex_pubkey>"],
    ["operator_pubkey", "<operator_hex_pubkey>"],
    ["status", "available"],
    ["skill", "plumber"],
    ["skill", "emergency_plumber"],
    ["credential", "gas_safe_registered"],
    ["rating", "4.7"],
    ["completed_tasks", "89"],
    ["expiration", "1698767232"]
  ],
  "content": ""
}
```

### Kind 30510: Provider Profile

A persistent, parameterised replaceable declaration of a provider's capabilities, credentials, and service areas. Unlike kind 20500 (ephemeral availability), this event is stored on relays and represents the provider's long-term profile.

```json
{
  "kind": 30510,
  "pubkey": "<provider_hex_pubkey>",
  "created_at": 1698700000,
  "tags": [
    ["d", "<provider_hex_pubkey>_profile"],
    ["t", "trott-provider"],
    ["provider_pubkey", "<provider_hex_pubkey>"],
    ["domain", "locksmith"],
    ["domain", "emergency_trades"],
    ["skill", "locksmith"],
    ["skill", "plumber"],
    ["credential", "mla_approved"],
    ["credential", "gas_safe_registered"],
    ["credential_proof", "mla_approved", "https://verify.mla.example.com/<id>"],
    ["credential_proof", "gas_safe_registered", "https://verify.gassafe.example.com/<id>"],
    ["coverage_geohash", "gcpuu"],
    ["coverage_geohash", "gcpuv"],
    ["coverage_geohash", "gcpuw"],
    ["coverage_radius_km", "25"],
    ["languages", "en,pl"],
    ["operating_hours", "08:00-22:00"],
    ["timezone", "Europe/London"],
    ["emergency_available", "true"],
    ["rating", "4.8"],
    ["completed_tasks", "431"],
    ["member_since", "1672531200"],
    ["operator_pubkey", "<operator_hex_pubkey>"],
    ["operator_pubkey", "<second_operator_hex_pubkey>"],
    ["expiration", "1730000000"]
  ],
  "content": "Qualified locksmith and plumber serving Greater London. MLA approved. Available for emergencies 24/7."
}
```

**Required tags**: `d`, `provider_pubkey`

**Recommended tags**: `domain` (at least one), `skill` (at least one)

**Optional tags**: `t`, `credential`, `credential_proof`, `coverage_geohash`, `coverage_radius_km`, `languages`, `operating_hours`, `timezone`, `emergency_available`, `rating`, `completed_tasks`, `member_since`, `operator_pubkey`, `expiration`

**Multi-domain providers**: A provider who serves multiple domains (e.g. locksmith and emergency plumber) includes multiple `domain` and `skill` tags. A single profile covers all domains.

**Multi-operator providers**: A provider who works with multiple operators includes multiple `operator_pubkey` tags. This signals to requesters that the provider is discoverable through several operators.

#### REQ Filters for Provider Profile

**Find all locksmiths in an area:**

```json
{
  "kinds": [30510],
  "#domain": ["locksmith"],
  "#coverage_geohash": ["gcpuu"]
}
```

**Find all providers with a specific credential:**

```json
{
  "kinds": [30510],
  "#credential": ["gas_safe_registered"]
}
```

**Find all providers for a domain (any location):**

```json
{
  "kinds": [30510],
  "#domain": ["tutoring"]
}
```

### Kind 30511: Operator Bond

A persistent declaration of an operator's financial commitment, supported domains, terms, and service-level agreement. This event enables requesters and providers to evaluate operators before choosing one.

```json
{
  "kind": 30511,
  "pubkey": "<operator_hex_pubkey>",
  "created_at": 1698700000,
  "tags": [
    ["d", "<operator_hex_pubkey>_bond"],
    ["t", "trott-operator"],
    ["operator_pubkey", "<operator_hex_pubkey>"],
    ["domain", "ridesharing"],
    ["domain", "locksmith"],
    ["amount", "5000000"],
    ["currency", "GBP"],
    ["trust_model", "custodial-third-party"],
    ["bond_txid", "a1b2c3d4e5f6..."],
    ["bond_address", "bc1q..."],
    ["fee_percent", "5.0"],
    ["service_area_geohash", "gcpuu"],
    ["service_area_geohash", "gcpuv"],
    ["service_area_geohash", "gcpuw"],
    ["service_area_name", "Greater London"],
    ["supported_currencies", "GBP,SAT"],
    ["payment_providers", "strike,nip47"],
    ["trust_models", "custodial-third-party,trustless"],
    ["min_provider_rating", "4.0"],
    ["max_response_seconds", "300"],
    ["auto_confirm_timeout_hours", "24"],
    ["safety_monitoring", "true"],
    ["background_checks", "true"],
    ["insurance_required", "true"],
    ["guardian_threshold", "3/5"],
    ["api_url", "https://london.donkeyride.example.com"],
    ["ws_url", "wss://london.donkeyride.example.com/ws"],
    ["relay_url", "wss://relay.donkeyride.example.com"],
    ["expiration", "1730000000"]
  ],
  "content": "DonkeyRide London — ridesharing and locksmith services with 24/7 safety monitoring and £50,000 operator bond."
}
```

**Required tags**: `d`, `operator_pubkey`, `amount`, `currency`

**Recommended tags**: `domain` (at least one), `fee_percent`, `service_area_geohash` or `service_area_name`, `api_url`

**Optional tags**: `t`, `trust_model`, `bond_txid`, `bond_address`, `supported_currencies`, `payment_providers`, `trust_models`, `min_provider_rating`, `max_response_seconds`, `auto_confirm_timeout_hours`, `safety_monitoring`, `background_checks`, `insurance_required`, `guardian_threshold`, `ws_url`, `relay_url`, `expiration`

**SLA tags**: The `max_response_seconds` tag declares the operator's maximum time to match a request with a provider. The `auto_confirm_timeout_hours` tag declares how long the operator waits for requester confirmation before auto-confirming. These are commitments — operators who consistently fail to meet their SLA risk reputation damage and bond slashing.

#### REQ Filters for Operator Bonds

**Find operators serving an area:**

```json
{
  "kinds": [30511],
  "#service_area_geohash": ["gcpuu"]
}
```

**Find operators supporting a specific domain:**

```json
{
  "kinds": [30511],
  "#domain": ["locksmith"]
}
```

**Find all operators (compare globally):**

```json
{
  "kinds": [30511],
  "#t": ["trott-operator"]
}
```

#### Operator Comparison

Requesters (or their client applications) compare operators on the following criteria:

| Criterion | Tag | Description |
|-----------|-----|-------------|
| Fee | `fee_percent` | Operator's commission percentage |
| Bond size | `amount` + `currency` | Financial commitment at stake |
| Trust models | `trust_models` | Available trust levels (trustless, custodial, etc.) |
| Payment methods | `payment_providers` | Supported payment rails |
| Currencies | `supported_currencies` | Accepted currencies |
| Safety | `safety_monitoring`, `background_checks`, `insurance_required` | Safety infrastructure |
| SLA | `max_response_seconds`, `auto_confirm_timeout_hours` | Service-level commitments |
| Domains | `domain` tags | Which service types are supported |
| Guardian oversight | `guardian_threshold` | Bond slashing governance model |

### Kind 30512: Trusted Provider List

A requester's personal list of preferred providers, with per-provider domain and trust rating. This enables the "BatPhone" pattern where favourite providers are contacted first.

```json
{
  "kind": 30512,
  "pubkey": "<requester_hex_pubkey>",
  "created_at": 1698700000,
  "tags": [
    ["d", "<requester_hex_pubkey>_trusted_providers"],
    ["t", "trott-trusted-providers"],
    ["p", "<provider_1_pubkey>", "locksmith", "5"],
    ["p", "<provider_2_pubkey>", "ridesharing", "4"],
    ["p", "<provider_3_pubkey>", "locksmith", "4"],
    ["p", "<provider_4_pubkey>", "emergency_trades", "5"],
    ["p", "<provider_5_pubkey>", "ridesharing", "3"]
  ],
  "content": ""
}
```

Each `p` tag has four elements:

| Position | Description | Example |
|----------|-------------|---------|
| 1 | Provider's hex pubkey | `<hex>` |
| 2 | Domain for which this provider is trusted | `locksmith` |
| 3 | Personal trust rating (1-5) | `5` |

**Required tags**: `d`

**Required per provider**: `p` (with domain and rating)

**Optional tags**: `t`

A provider MAY appear multiple times with different domains (e.g. trusted as a locksmith AND as a ridesharing driver).

#### REQ Filter

Operators query for a requester's trusted provider list when processing task requests:

```json
{
  "kinds": [30512],
  "authors": ["<requester_hex_pubkey>"],
  "limit": 1
}
```

#### Usage Flow

1. Requester publishes or updates their Trusted Provider List (30512) at any time
2. Requester creates a Task Request (TROTT-01, kind 30500)
3. Operator fetches the requester's kind 30512 event
4. Operator cross-references the trusted providers against current availability (kind 20500 events)
5. If a trusted provider is available and matches the request criteria:
   - Operator sends the task directly to the trusted provider (highest priority)
   - If the trusted provider declines or does not respond within `max_response_seconds`, fall back to broader discovery
6. If no trusted providers are available, fall back to geographic broadcast or category search
7. The requester MAY include `["discovery_mode", "trusted_first"]` or `["discovery_mode", "broadcast_and_trusted"]` on the Task Request to control the behaviour:

| Discovery Mode | Behaviour |
|---------------|-----------|
| `trusted_first` | Try trusted providers first, then fall back to broadcast (default) |
| `broadcast_and_trusted` | Simultaneously offer to trusted providers AND broadcast to all |
| `trusted_only` | Only offer to trusted providers; cancel if none available |
| `broadcast_only` | Skip trusted provider list; use geographic/category discovery only |

---

## Progressive Location Reveal

TROTT enforces a **progressive location reveal** protocol to protect participant privacy. Precise coordinates are never published in public events. Location precision increases only as the task progresses and trust is established.

### Precision by Task Phase

| Task Phase | Location Precision | Mechanism | Visible To |
|------------|-------------------|-----------|------------|
| **Availability** (kind 20500) | ~5-40 km (geohash precision 4-5) | Public `g` tag | Anyone |
| **Task Request** (kind 30500) | ~1-5 km (geohash precision 5) | Public `g` tag | Anyone |
| **Task Accepted** (kind 30502) | ~150 m (geohash precision 6-7) | NIP-44 encrypted to matched parties | Requester + Provider only |
| **In Progress** (kind 30503) | Precise coordinates | NIP-44 encrypted or operator WebSocket | Requester + Provider + Operator only |

### Privacy Rules

1. **Kind 20500 (Provider Availability)** events MUST NOT contain coordinates more precise than geohash precision 5 (~5 km). The `g` tag MUST use precision 4 or 5. Latitude/longitude tags MUST NOT appear on public availability events.

2. **Kind 30500 (Task Request)** events SHOULD use geohash precision 5. If `location_lat` and `location_lon` tags are present on a public event, they MUST be rounded to at least 2 decimal places (~1.1 km precision).

3. **Kind 30502 (Task Accept)** events MAY include precise coordinates, but these MUST be encrypted using NIP-44 to the counterparty's pubkey. The precise location is exchanged via NIP-17 gift-wrapped direct messages or via the operator's private API, never in plain text on public relays.

4. **Kind 30503 (Task Update)** events during the `in_progress` phase transmit real-time location via the operator's WebSocket connection or NIP-44 encrypted ephemeral events. These MUST NOT be published as plain text on public relays.

### Location Reveal Example

**Step 1 — Public availability (~5 km precision):**

```json
{
  "kind": 20500,
  "tags": [
    ["g", "gcpuu"],
    ["status", "available"]
  ]
}
```

**Step 2 — Public task request (~5 km precision):**

```json
{
  "kind": 30500,
  "tags": [
    ["g", "gcpuu"],
    ["g", "gcpu"],
    ["status", "requested"]
  ]
}
```

**Step 3 — Post-acceptance, encrypted to matched provider (~150 m precision):**

Precise pickup coordinates are sent via NIP-17 gift wrap:

```json
{
  "kind": 14,
  "tags": [
    ["p", "<provider_hex_pubkey>"],
    ["subject", "task_abc123_location"]
  ],
  "content": "{\"pickup_lat\": \"51.507382\", \"pickup_lon\": \"-0.127834\", \"pickup_address\": \"10 Downing Street, London SW1A 2AA\"}"
}
```

(Wrapped in kind 1059 gift wrap per NIP-17, encrypted via NIP-44.)

**Step 4 — In progress, via operator WebSocket:**

Real-time GPS coordinates are streamed over the operator's authenticated WebSocket, never published to Nostr relays.

---

## Multi-Operator Discovery Flow

When a requester wants to find a service, the full discovery flow is:

### Step 1: Find Operators

Query relays for Operator Bond events (kind 30511) matching the requester's area and domain:

```json
{
  "kinds": [30511],
  "#service_area_geohash": ["gcpuu"],
  "#domain": ["ridesharing"]
}
```

This returns all operators serving the requester's area for the requested domain.

### Step 2: Compare Operators

The client presents operators for comparison on fee, bond size, trust models, safety features, and SLA. The requester selects an operator (or the client auto-selects based on preferences).

### Step 3: Find Available Providers

Query relays for Provider Availability events (kind 20500) matching the chosen operator:

```json
{
  "kinds": [20500],
  "#g": ["gcpuuz", "gcpuuy", "gcpuux", "gcpuuv", "gcpuuw", "gcpvn0", "gcpvn1", "gcpvn2", "gcpvn3"],
  "#operator_pubkey": ["<chosen_operator_hex_pubkey>"],
  "#domain": ["ridesharing"]
}
```

### Step 4: Submit Request

Requester publishes a Task Request (TROTT-01, kind 30500) and connects to the chosen operator's API for coordination:

```json
{
  "kind": 30500,
  "tags": [
    ["d", "task_abc123"],
    ["domain", "ridesharing"],
    ["status", "requested"],
    ["t", "trott-task"],
    ["g", "gcpuu"],
    ["operator_pubkey", "<chosen_operator_hex_pubkey>"],
    ["requester_pubkey", "<requester_hex_pubkey>"],
    ["amount", "1500"],
    ["currency", "GBP"],
    ["expiration", "1698769032"]
  ],
  "content": "Need a ride to Paddington"
}
```

### Step 5: Operator Matches

The operator checks the requester's trusted provider list (kind 30512), cross-references with available providers, and matches according to the discovery priority tiers.

---

## NIP-02 Integration: Social Discovery

Beyond the explicit Trusted Provider List (kind 30512), TROTT-02 leverages **NIP-02 follow lists** (kind 3) as implicit trust signals. When a requester follows a provider's pubkey on Nostr, this acts as a "favourite provider" bookmark — visible to any operator, across all domains.

### Implementation

1. When a Task Request (kind 30500) arrives, the operator queries the requester's follow list:

   ```json
   {
     "kinds": [3],
     "authors": ["<requester_hex_pubkey>"],
     "limit": 1
   }
   ```

2. The operator extracts `p` tags and cross-references with available providers
3. Providers who appear in the follow list receive Tier 2 priority (after explicit Trusted Provider List, before history-based matching)
4. If both the requester follows the provider AND the provider follows the requester (mutual follow), the operator MAY increase priority further

### Caching

Operators SHOULD cache NIP-02 follow list lookups with a TTL of 5-10 minutes. Follow lists change infrequently relative to task requests. For 2-hop social proof (Tier 4), operators MAY limit fan-out to the requester's most recent 50 follows to bound lookup cost.

---

## Relay Recommendations

### Discovery Relay Architecture

For optimal discovery performance, the following relay architecture is RECOMMENDED:

| Relay Type | Event Kinds | Purpose |
|------------|------------|---------|
| **Public discovery relays** | 20500, 30510, 30511, 30512 | Widely replicated, high availability. Used for finding providers and operators. |
| **Operator relays** | 30500-30507 (TROTT-01 lifecycle) | Authoritative task state. Operated by each TROTT operator. |
| **General Nostr relays** | 3 (NIP-02 follows), 30530+ (reputation) | Social graph and reputation data. |

### Relay Selection

- **Provider Availability (kind 20500)**: Publish to 2-3 public discovery relays with high uptime. Ephemeral events should reach requesters quickly.
- **Provider Profile (kind 30510)**: Publish to 3+ public relays for durability. This is a persistent advertisement.
- **Operator Bond (kind 30511)**: Publish to 3+ public relays. This is a high-stakes commitment that must be widely visible.
- **Trusted Provider List (kind 30512)**: Publish to the requester's preferred relays. Operators query these when processing task requests.

### Ephemeral Event Handling

Relays receiving kind 20500 events:
- MUST NOT persist them to storage
- SHOULD forward them immediately to active subscriptions
- SHOULD honour the `expiration` tag as a maximum lifetime hint
- MAY rate-limit to prevent abuse (recommended: 2 events per pubkey per minute)

---

## Privacy Considerations

### What is NEVER on Public Relays

- Exact street addresses
- Real-time GPS coordinates (latitude/longitude with more than 2 decimal places)
- Phone numbers or real names
- Payment card details or financial account identifiers
- Route traces or navigation data

### What IS on Public Relays

- Coarse geohash availability (~5-40 km precision)
- Operator service areas and capabilities
- Provider skills, credentials, and coverage areas
- Operator bonds, fee structures, and SLA terms
- Personal trust ratings (kind 30512) — these reveal which providers a requester prefers, which the requester opts into by publishing

### Provider Tracking Mitigation

To prevent long-term tracking of provider movements via kind 20500 events:
- Providers SHOULD vary their publication interval slightly (25-35 seconds, not exactly 30)
- Providers SHOULD use geohash precision 4 (~39 km) when not actively seeking tasks, and precision 5 (~5 km) only when actively available
- Relays MUST NOT persist ephemeral events
- Operators SHOULD NOT log or retain provider availability beacons beyond the current session

---

## Combining Discovery Modes

Domains commonly combine multiple discovery modes. The `discovery_method` tag on Task Request events (TROTT-01, kind 30500) declares which modes apply:

| Domain | Discovery Modes | Explanation |
|--------|----------------|-------------|
| Ridesharing | `geohash` | Provider must be nearby |
| Locksmith | `geohash` | Provider must be nearby |
| Delivery | `geohash` | Provider must be near collection point |
| Emergency plumber | `geohash,skill` | Must be nearby AND qualified |
| Pet walking | `geohash,category` | Must be nearby AND offer right service |
| Online tutoring | `skill,availability` | Must have right expertise AND be available |
| Process serving | `jurisdiction,geohash` | Must be authorised in correct court AND within travel distance |
| Security guard | `geohash,credential` | Must be nearby AND hold SIA licence |

The `discovery_method` tag uses a comma-separated list. When multiple modes are specified, relay filters SHOULD match on all (logical AND):

```json
["discovery_method", "geohash,skill"]
```

---

## Referenced NIPs

| NIP | Name | Usage in TROTT-02 |
|-----|------|-------------------|
| **NIP-01** | Basic Protocol Flow | Event format, relay communication, REQ filters |
| **NIP-02** | Contact List / Follow List | Social discovery, implicit trust signals (BatPhone pattern) |
| **NIP-33** | Parameterised Replaceable Events | Provider Profile, Operator Bond, Trusted Provider List |
| **NIP-40** | Expiration Timestamp | Availability beacon expiration, bond expiration |
| **NIP-44** | Encrypted Payloads | Post-acceptance precise location exchange |
| **NIP-17 + NIP-59** | Private Messages (Gift Wrap) | PII exchange (addresses, phone numbers) |
| **NIP-89** | App Handlers | Operators MAY publish kind 31990 to declare TROTT support |

---

## See Also

- **TROTT-01**: Core — Task lifecycle and state machine
- **TROTT-03**: Reputation — Ratings, trust weighting, and credentials
- **TROTT-04**: Payments — Quotes, escrow, streaming, milestones, and split payments
- **TROTT-05**: Safety — Emergency signals, check-ins, disputes, and abuse reporting
- **TROTT-06**: Coordination — Operator participation, PII handling, and compliance
- **TROTT-07**: Navigation — Routing, ETA, live tracking, and route deviation

### Domain Extensions

- **TROTT-ridesharing**: Ridesharing domain extension (geohash discovery)
- **TROTT-locksmith**: Locksmith dispatch domain extension (geohash discovery)
- **TROTT-delivery**: Parcel delivery domain extension (geohash discovery)
- **TROTT-towing**: Vehicle recovery domain extension (geohash discovery)
- **TROTT-emergency-trades**: Emergency trades domain extension (geohash + skill discovery)
- **TROTT-pet-services**: Pet services domain extension (geohash + category discovery)
- **TROTT-security**: Security guard dispatch domain extension (geohash + credential discovery)
