# NIP-XX-discovery: Service Discovery and Operator Advertising

`draft` `optional`

## Abstract

This NIP defines **geohash-based provider discovery and operator advertising** for trust-minimised service coordination. It specifies how providers broadcast availability, how requesters find nearby providers, and how operators advertise their services to the wider Nostr ecosystem — all whilst preserving location privacy through geohash obfuscation.

## Motivation

Decentralised service coordination requires a discovery mechanism that doesn't depend on a single platform's matching algorithm. By using geohash-based discovery on public Nostr relays, any client can find available providers in any area, compare multiple operators, and select based on transparent criteria (fee, reputation, trust model).

## Depends On

- **NIP-XX-core**: Core service coordination protocol
- **NIP-33**: Parameterised replaceable events
- **NIP-40**: Expiration timestamps
- **NIP-89**: App handler registration
- **NIP-99**: Classified listings (optional, for service advertising)

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

Published by an operator to declare the geographic areas they serve and the domains they support.

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

**Required tags**: `d`, `operator_pubkey`, `g` (at least one geohash)
**Optional tags**: `domain`, `service_name`, `fee_percent`, `supported_domains`, `payment_providers`, `trust_models`, `supported_currencies`, `min_provider_rating`, `safety_monitoring`, `background_checks`, `insurance`, `api_url`, `ws_url`, `expiration`

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

Published by providers to broadcast real-time availability. These are **ephemeral events** — relays MUST NOT persist them. They signal "I'm available for work near geohash X right now."

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

**Required tags**: `g` (current geohash), `provider_pubkey`, `status`
**Optional tags**: `domain`, `operator_pubkey`, `vehicle_type`, `rating`, `completed_tasks`, `expiration`

The `status` tag indicates availability:

| Status | Description |
|--------|-------------|
| `available` | Ready to accept tasks |
| `busy` | Currently on a task (not accepting new work) |
| `offline` | Provider has ended their shift |

Providers SHOULD publish availability events at regular intervals (every 30-60 seconds) whilst on shift. The `expiration` tag (NIP-40) ensures stale events are automatically cleaned up.

---

## Multi-Operator Discovery

When a requester wants to find a service, the discovery flow is:

### Step 1: Find Operators in Area

Query relays for kind 30565 events matching the requester's geohash:

```
Filter: { kinds: [30565], "#g": ["gcpuu"] }
```

This returns all operators serving the requester's ~5km area.

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

### Step 3: Find Available Providers

Query relays for kind 20500 ephemeral events in the area:

```
Filter: { kinds: [20500], "#g": ["gcpuuz"], "#operator_pubkey": ["<chosen_operator>"] }
```

This returns providers currently available through the chosen operator.

### Step 4: Submit Request

The requester publishes a kind 30500 (Service Request) event with their geohash, and connects to the chosen operator's API for coordination.

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

- **Public events** (kinds 30500, 30565, 20500) use geohash precision 5 (~5km), never exact coordinates
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
- **NIP-XX-safety**: Emergency alerts and trip sharing
- **NIP-89**: App handler registration
- **NIP-99**: Classified listings
- **ARCHITECTURE.md**: Three-layer architecture and data flow
