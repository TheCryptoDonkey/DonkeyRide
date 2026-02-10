# NIP-XX-discovery: Service Discovery and Operator Advertising

`draft` `optional`

## Abstract

This NIP defines **extensible provider discovery and operator advertising** for trust-minimised service coordination. It specifies how providers broadcast availability, how requesters find matching providers, and how operators advertise their services to the wider Nostr ecosystem. Discovery methods range from **geohash-based geographic matching** (for location-bound services like ridesharing and locksmith dispatch) to **skill tags, categories, and availability windows** (for virtual and scheduled services like tutoring, consulting, and skilled trades).

## Motivation

Decentralised service coordination requires a discovery mechanism that doesn't depend on a single platform's matching algorithm. By using structured discovery on public Nostr relays, any client can find available providers in any area or category, compare multiple operators, and select based on transparent criteria (fee, reputation, trust model). Not all service domains are geographic — tutoring, consulting, and many skilled trades operate virtually or across wide regions. The protocol therefore supports multiple discovery methods, with geohash remaining the default for location-bound services.

## Depends On

- **NIP-XX-core**: Core service coordination protocol
- **NIP-02**: Follow lists (for social discovery / BatPhone pattern)
- **NIP-33**: Parameterised replaceable events
- **NIP-40**: Expiration timestamps
- **NIP-89**: App handler registration
- **NIP-99**: Classified listings (optional, for service advertising)

## Discovery Method Taxonomy

The protocol supports multiple discovery methods. Each service domain declares one or more methods via a `discovery_method` tag on service requests (kind 30500). Most location-bound domains use `geohash` as their primary method, but domains MAY declare multiple methods for richer matching.

| Method | Tags Used | Best For |
|--------|-----------|----------|
| `geohash` | `g` (geohash) | Location-based services (ridesharing, locksmith, delivery) |
| `skill_tags` | `t` (NIP-12 hashtags) | Trades and skilled services (plumber, electrician, tutor) |
| `category` | `category`, `subcategory` | Browsable service directories (cleaning, pet care) |
| `availability` | `available_from`, `available_until`, `timezone` | Scheduled/virtual services (tutoring, consulting) |
| `jurisdiction` | `jurisdiction`, `court_id` | Legal services (process serving, notary) |

### Combining Discovery Methods

Domains commonly combine multiple methods. For example:

- **Pet walking** uses `geohash` + `category` — providers must be nearby *and* offer the right service type.
- **Emergency plumber** uses `geohash` + `skill_tags` — providers must be nearby *and* have the relevant qualifications.
- **Online tutoring** uses `skill_tags` + `availability` — no geographic constraint, but the provider must have the right subject expertise and be available at the requested time.
- **Process serving** uses `jurisdiction` + `geohash` — the server must be authorised in the correct court jurisdiction *and* be within travel distance.

### Declaring Discovery Methods

Domain profiles declare their supported discovery method(s) via the `discovery_method` tag on kind 30500 (Service Request):

```json
["discovery_method", "geohash"]
["discovery_method", "geohash,category"]
["discovery_method", "skill_tags,availability"]
```

When multiple methods are declared (comma-separated), relay filters SHOULD match on all specified methods (logical AND). Clients SHOULD display appropriate search interfaces based on the active domain's discovery method(s).

---

## Event Kinds

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30540 | Operator Bond | Yes (NIP-33) | Operator |
| 30565 | Service Area Definition | Yes (NIP-33) | Operator |
| 20500 | Provider Availability (ephemeral) | No (ephemeral) | Provider |

> **Note**: Kind 30540 (Operator Bond) is defined in detail in NIP-XX-stakes. This spec covers its discovery aspects only. Kind 20500 is in the ephemeral range (20000-29999) — relays MUST NOT store these events.

---

## Event Structures

### Kind 30565: Service Area Definition

Published by an operator to declare the areas or service scopes they serve and the domains they support. For location-based services, this includes geohash-defined geographic areas. For virtual services, this declares categories, languages, and availability instead.

```json
{
  "kind": 30565,
  "tags": [
    ["d", "<operator_pubkey>_london"],
    ["domain", "ridesharing"],
    ["operator_pubkey", "<hex>"],
    ["g", "gcpuuz"],
    ["g", "gcpuuy"],
    ["g", "gcpuux"],
    ["g", "gcpvn0"],
    ["service_name", "DonkeyRide London"],
    ["fee_percent", "5.0"],
    ["supported_domains", "ridesharing,locksmith"],
    ["payment_providers", "strike,nip47"],
    ["trust_models", "custodial-third-party,trustless"],
    ["supported_currencies", "GBP,SAT"],
    ["min_provider_rating", "4.0"],
    ["safety_monitoring", "true"],
    ["background_checks", "true"],
    ["insurance", "true"],
    ["api_url", "https://london.donkeyride.example.com"],
    ["ws_url", "wss://london.donkeyride.example.com/ws"],
    ["expiration", "1730000000"]
  ],
  "content": "DonkeyRide London — ridesharing and locksmith services with 24/7 safety monitoring."
}
```

**Required tags**: `d`, `operator_pubkey`
**Conditionally required**: `g` (at least one geohash — REQUIRED for location-based services, OPTIONAL for virtual services)
**Optional tags**: `domain`, `service_name`, `fee_percent`, `supported_domains`, `payment_providers`, `trust_models`, `supported_currencies`, `min_provider_rating`, `safety_monitoring`, `background_checks`, `insurance`, `api_url`, `ws_url`, `expiration`, `service_type`, `categories`, `languages`, `timezone`, `operating_hours`

#### Virtual/Non-Geographic Service Areas

For operators serving virtual or non-geographic domains (tutoring, consulting, remote technical support), an alternative form omits geohash tags and instead declares service scope via categories, languages, and availability:

```json
{
  "kind": 30565,
  "tags": [
    ["d", "<operator_pubkey>_virtual"],
    ["domain", "tutoring"],
    ["operator_pubkey", "<hex>"],
    ["service_type", "virtual"],
    ["categories", "maths,physics,chemistry"],
    ["languages", "en,fr"],
    ["timezone", "Europe/London"],
    ["operating_hours", "09:00-21:00"],
    ["service_name", "DonkeyLearn Online Tutoring"],
    ["fee_percent", "8.0"],
    ["supported_domains", "tutoring"],
    ["payment_providers", "strike,stripe"],
    ["trust_models", "custodial-third-party,custodial-escrow"],
    ["supported_currencies", "GBP,USD,EUR"],
    ["min_provider_rating", "4.5"],
    ["api_url", "https://learn.donkeyride.example.com"],
    ["ws_url", "wss://learn.donkeyride.example.com/ws"],
    ["expiration", "1730000000"]
  ],
  "content": "DonkeyLearn — online tutoring in maths, physics, and chemistry for GCSE and A-level students."
}
```

The `service_type` tag distinguishes geographic from virtual service areas:

| Service Type | Description |
|-------------|-------------|
| `geographic` | Location-bound services — requires `g` tags (default if omitted) |
| `virtual` | Remote/online services — no `g` tags required |
| `hybrid` | Services available both in-person and remotely — `g` tags define the in-person area |

The `categories` tag is a comma-separated list of service categories the operator supports. The `languages` tag lists ISO 639-1 language codes. The `operating_hours` tag specifies the operator's service window in the declared `timezone` (IANA identifier).

#### Geohash Precision

The `g` tag uses standard geohash encoding at **precision 5** (~5km × 5km area). This provides sufficient resolution for service matching without revealing exact locations.

| Precision | Cell Size | Use Case |
|-----------|----------|----------|
| 3 | ~156km × 156km | Regional discovery |
| 4 | ~39km × 39km | City-level discovery |
| **5** | **~5km × 5km** | **Standard service area** |
| 6 | ~1.2km × 1.2km | Neighbourhood-level (too precise for public) |

Operators publish one event per service area, with multiple `g` tags covering the area they serve. Relay filtering on `#g` enables efficient geographic queries.

### Kind 20500: Provider Availability (Ephemeral)

Published by providers to broadcast real-time availability. These are **ephemeral events** — relays MUST NOT persist them. They signal "I'm available for work right now" with discovery-relevant metadata.

#### Location-Based Availability

For geographic discovery methods (`geohash`), providers broadcast their current area:

```json
{
  "kind": 20500,
  "tags": [
    ["g", "gcpuuz"],
    ["domain", "ridesharing"],
    ["provider_pubkey", "<hex>"],
    ["operator_pubkey", "<operator_hex>"],
    ["status", "available"],
    ["vehicle_type", "standard"],
    ["rating", "4.8"],
    ["completed_tasks", "342"],
    ["expiration", "1698765732"]
  ],
  "content": ""
}
```

#### Extended Availability (Multiple Discovery Methods)

For domains using non-geohash or combined discovery methods, providers include additional tags:

```json
{
  "kind": 20500,
  "tags": [
    ["g", "gcpuuz"],
    ["domain", "pet_walking"],
    ["provider_pubkey", "<hex>"],
    ["status", "available"],
    ["t", "dog_walking"],
    ["t", "large_dogs"],
    ["category", "pet_services"],
    ["subcategory", "dog_walking"],
    ["available_from", "1698765600"],
    ["available_until", "1698787200"],
    ["timezone", "Europe/London"],
    ["expiration", "1698765732"]
  ],
  "content": ""
}
```

**Required tags**: `provider_pubkey`, `status`
**Conditionally required**: `g` (REQUIRED for location-based services, OPTIONAL for virtual services)
**Optional tags**: `domain`, `operator_pubkey`, `vehicle_type`, `rating`, `completed_tasks`, `expiration`, `t` (NIP-12 hashtags for skill/service tags), `category`, `subcategory`, `available_from`, `available_until`, `timezone`, `jurisdiction`, `court_id`

The `status` tag indicates availability:

| Status | Description |
|--------|-------------|
| `available` | Ready to accept tasks |
| `busy` | Currently on a task (not accepting new work) |
| `offline` | Provider has ended their shift |

Providers SHOULD publish availability events at regular intervals (every 30-60 seconds) whilst on shift. The `expiration` tag (NIP-40) ensures stale events are automatically cleaned up.

#### Virtual Service Discovery

For domains that do not require geographic proximity (online tutoring, virtual consulting, remote technical support), the `g` tag is OPTIONAL. Discovery relies instead on skill tags, categories, and availability windows.

A virtual-only provider availability event:

```json
{
  "kind": 20500,
  "tags": [
    ["domain", "tutoring"],
    ["provider_pubkey", "<hex>"],
    ["operator_pubkey", "<operator_hex>"],
    ["status", "available"],
    ["t", "maths"],
    ["t", "physics"],
    ["t", "a_level"],
    ["category", "academic_tutoring"],
    ["subcategory", "sciences"],
    ["available_from", "1698771000"],
    ["available_until", "1698782400"],
    ["timezone", "Europe/London"],
    ["rating", "4.9"],
    ["completed_tasks", "128"],
    ["expiration", "1698771060"]
  ],
  "content": ""
}
```

Clients discovering virtual providers filter on `#t` (skill tags), `#category`, or time-range overlap rather than `#g` (geohash). Relay implementations SHOULD support filtering on these tags for efficient virtual service discovery.

---

## Multi-Operator Discovery

When a requester wants to find a service, the discovery flow varies by discovery method. The steps below describe the general pattern, with method-specific filter examples.

### Step 1: Find Operators

Query relays for kind 30565 events matching the requester's discovery criteria.

**Geographic discovery** (geohash):
```
Filter: { kinds: [30565], "#g": ["gcpuu"] }
```
This returns all operators serving the requester's ~5km area.

**Category-based discovery**:
```
Filter: { kinds: [30565], "#domain": ["pet_walking"] }
```
Client-side filtering on `categories` tag narrows results to matching service types.

**Virtual/skill-based discovery**:
```
Filter: { kinds: [30565], "#domain": ["tutoring"] }
```
Client-side filtering on `categories`, `languages`, and `timezone` tags narrows results.

### Step 2: Compare Operators

The requester (or their client app) compares operators on:

| Criterion | Source |
|-----------|--------|
| Fee percentage | `fee_percent` tag on kind 30565 |
| Supported payment methods | `payment_providers` tag |
| Trust models available | `trust_models` tag |
| Safety infrastructure | `safety_monitoring`, `background_checks`, `insurance` tags |
| Operator reputation | Kind 30528 events for the operator's pubkey |
| Operator bond size | Kind 30540 events for the operator's pubkey |
| Service categories | `categories` tag (for category/virtual discovery) |
| Languages supported | `languages` tag (for virtual discovery) |

### Step 3: Find Available Providers

Query relays for kind 20500 ephemeral events matching the discovery method:

**Geographic discovery**:
```
Filter: { kinds: [20500], "#g": ["gcpuuz"], "#operator_pubkey": ["<chosen_operator>"] }
```

**Skill-based discovery**:
```
Filter: { kinds: [20500], "#t": ["maths"], "#operator_pubkey": ["<chosen_operator>"] }
```

**Category-based discovery**:
```
Filter: { kinds: [20500], "#category": ["pet_services"], "#operator_pubkey": ["<chosen_operator>"] }
```

This returns providers currently available through the chosen operator that match the requester's criteria.

### Step 4: Submit Request

The requester publishes a kind 30500 (Service Request) event with appropriate discovery tags (geohash for geographic services, skill tags for skill-based services, etc.) and connects to the chosen operator's API for coordination.

---

## NIP-02 Integration: Social Discovery (BatPhone Pattern)

Beyond geographic and skill-based discovery, the protocol leverages **NIP-02 follow lists** (kind 3) as a persistent social signal for provider matching. When a requester follows a provider's pubkey on Nostr, this acts as a "favourite provider" bookmark — visible to any operator, across all domains, without requiring platform-specific favourites lists.

### Priority Matching

When a requester publishes a kind 30500 (Service Request), operators SHOULD check the requester's follow list (kind 3 event) and prioritise matching with providers the requester follows. This produces a natural "BatPhone" pattern — requesters who have established trust with specific providers are matched with them first, reducing friction and improving satisfaction for both parties.

### Discovery Tiers

Operators SHOULD apply the following priority tiers when matching a requester with available providers:

| Tier | Source | Priority | Description |
|------|--------|----------|-------------|
| 1. Direct follows | Providers in requester's kind 3 follow list | Highest | Requester has explicitly chosen to follow this provider |
| 2. Previous providers | Providers with completed task history | Second | Prior successful interactions (kind 30517/30530 events exist) |
| 3. Social proof | Providers followed by requester's follows (2-hop WoT) | Third | Trusted by people the requester trusts |
| 4. Open matching | Any available provider meeting minimum criteria | Default fallback | Standard matching by proximity, rating, and availability |

If a Tier 1 provider is available and meets the request criteria (correct domain, service area, skills), the operator SHOULD offer that provider first before falling back to lower tiers. Tier ordering is a SHOULD, not a MUST — operators MAY adjust weighting based on urgency, proximity, or other factors.

### NIP-02 Follow as "Favourite Provider"

When a requester follows a provider's pubkey (adding a `p` tag to their kind 3 event), this serves as a **persistent "favourite provider" signal** with several advantages over platform-specific favourites:

- **Cross-operator** — The follow list is on public relays, visible to every operator. Switching operators preserves your favourites automatically.
- **Cross-domain** — Following a locksmith who also drives for a ridesharing operator means they are prioritised in both domains.
- **Cross-client** — Any Nostr client can display the follow relationship. The provider sees they are followed; the requester sees the provider in their social feed.
- **Bilateral** — If the provider also follows the requester, both parties have signalled mutual trust, which operators MAY weight even more heavily.

### Implementation

Operators implement social discovery as follows:

1. **On request creation**: When a kind 30500 event is received, the operator queries relays for the requester's kind 3 event:
   ```
   Filter: { kinds: [3], authors: ["<requester_pubkey>"], limit: 1 }
   ```
2. **Extract follows**: Parse the `p` tags from the kind 3 event to build the requester's follow set.
3. **Cross-reference**: Compare the follow set against currently available providers (from kind 20500 ephemeral events or the operator's internal availability list).
4. **Tier assignment**: Assign each available provider to the appropriate discovery tier and sort by tier priority, then by standard criteria (rating, proximity, etc.) within each tier.
5. **Caching**: Operators SHOULD cache kind 3 lookups with a TTL of 5-10 minutes. Follow lists change infrequently relative to task requests.

For **Tier 3 (2-hop social proof)**, the operator additionally fetches kind 3 events for each pubkey in the requester's follow list and checks whether any available providers appear in those second-degree follow lists. Due to the fan-out cost, operators MAY limit 2-hop lookups to the requester's most recent N follows (e.g. 50) or skip Tier 3 entirely under high load.

---

## NIP-89 Integration

Operators SHOULD publish **NIP-89 app handler events** (kind 31990) to declare support for service coordination event kinds. This enables Nostr clients to offer "open with DonkeyRide" when encountering service coordination events.

```json
{
  "kind": 31990,
  "tags": [
    ["d", "<operator_pubkey>_handler"],
    ["k", "30500"],
    ["k", "30501"],
    ["k", "30512"],
    ["web", "https://london.donkeyride.example.com/task/<bech32>", "nevent"],
    ["web", "https://london.donkeyride.example.com/", "naddr"]
  ],
  "content": "{\"name\": \"DonkeyRide London\", \"about\": \"Service coordination — ridesharing and locksmith\", \"picture\": \"https://...\"}"
}
```

When a Nostr client encounters a kind 30500 event, it can look up registered handlers (kind 31990 with `k` tag matching `30500`) and offer the user a list of operators that can fulfil the request.

---

## NIP-99 Integration

Operators MAY publish **NIP-99 classified listing events** (kind 30402) for service advertising in the broader Nostr marketplace. This surfaces DonkeyRide services alongside other Nostr-native listings.

```json
{
  "kind": 30402,
  "tags": [
    ["d", "<operator_pubkey>_listing"],
    ["title", "Ridesharing — DonkeyRide London"],
    ["summary", "Trust-minimised ridesharing with 24/7 safety monitoring. 5% fee."],
    ["location", "London, UK"],
    ["g", "gcpuuz"],
    ["price", "0", "GBP"],
    ["t", "ridesharing"],
    ["t", "donkeyride"],
    ["t", "service-coordination"]
  ],
  "content": "Full description of services offered..."
}
```

---

## Privacy Considerations

### Location Obfuscation

- **Geographic public events** (kinds 30500, 30565, 20500) use geohash precision 5 (~5km), never exact coordinates
- **Virtual services** avoid location data entirely — discovery uses skill tags, categories, and availability instead
- **Exact addresses** are exchanged only via NIP-17 encrypted gift-wrapped messages after matching
- **Provider availability** events are ephemeral — relays do not persist them
- **GPS traces** during active tasks go via the operator's WebSocket (or NIP-44 encrypted ephemeral events), never in plain text on public relays

### What Is Never on Public Relays

- Exact street addresses
- Real-time GPS coordinates (only geohash areas)
- Phone numbers or real names
- Payment card details
- Route traces

### What IS on Public Relays

- Geohash-level availability (~5km precision)
- Operator service areas and capabilities
- Reputation scores and ratings
- Operator bonds and fee structures

---

## See Also

- **NIP-XX-core**: Core protocol (state machine, lifecycle)
- **NIP-XX-stakes**: Operator bonds (kind 30540)
- **NIP-XX-reputation**: Ratings, reputation, and social proof (WoT-weighted scoring)
- **NIP-XX-safety**: Emergency alerts and trip sharing
- **NIP-02**: Follow lists (social discovery / BatPhone pattern)
- **NIP-89**: App handler registration
- **NIP-99**: Classified listings
- **ARCHITECTURE.md**: Three-layer architecture and data flow
