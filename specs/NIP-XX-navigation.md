# NIP-XX-navigation: Navigation and Routing

`draft` `optional`

## Abstract

This NIP defines **navigation and routing events** for location-based service coordination — route suggestions, turn-by-turn navigation, traffic alerts, reroute requests, and navigation feedback. These events enable providers to receive intelligent routing during active tasks and allow requesters to track progress in real time.

## Motivation

Navigation is a core component of any location-based service. Traditional platforms couple navigation to proprietary mapping services. This NIP standardises navigation events on Nostr, enabling:

- **Provider-agnostic routing** — Any routing engine (OSRM, OpenRouteService, GraphHopper) can generate routes
- **Transparent routing** — Route choices are auditable (relevant for fare disputes)
- **Cost-optimised navigation** — Routes can be scored by profit, fuel efficiency, and time
- **Privacy-preserving** — Route data is ephemeral or NIP-44 encrypted, never stored permanently on public relays

## Depends On

- **NIP-XX-core**: Core service coordination protocol
- **NIP-44**: Encrypted payloads (for route data privacy)

## Event Kinds

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30583 | Route Suggestion | Yes (NIP-33) | Operator |
| 30584 | Turn-by-Turn Navigation | No (append-only) | Operator |
| 30585 | Traffic Alert | No (append-only) | Operator |
| 30586 | Reroute Request | No (append-only) | Provider |
| 30587 | Navigation Feedback | No (append-only) | Requester |

---

## Event Structures

### Kind 30583: Route Suggestion

Published by the operator to suggest a route (or routes) for the provider. Includes cost analysis and alternative options.

```json
{
  "kind": 30583,
  "tags": [
    ["d", "task_abc123_route"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["origin_lat", "51.5074"],
    ["origin_lon", "-0.1278"],
    ["destination_lat", "51.5155"],
    ["destination_lon", "-0.0922"],
    ["distance_metres", "8200"],
    ["duration_seconds", "720"],
    ["route_score", "85"],
    ["provider", "osrm"],
    ["alternatives_count", "2"],
    ["estimated_amount", "1500"],
    ["currency", "GBP"]
  ],
  "content": "{\"geometry\": {\"type\": \"LineString\", \"coordinates\": [[...]]}, \"instructions\": [...], \"alternatives\": [...]}"
}
```

**Required tags**: `d`, `task_id`, `origin_lat`, `origin_lon`, `destination_lat`, `destination_lon`, `distance_metres`, `duration_seconds`
**Optional tags**: `domain`, `route_score`, `provider`, `alternatives_count`, `estimated_amount`, `currency`

#### Route Geometry

Route geometry is encoded as a **GeoJSON LineString** in the `content` field. This is a standard format understood by all mapping libraries (Leaflet, Mapbox, Google Maps).

```json
{
  "geometry": {
    "type": "LineString",
    "coordinates": [
      [-0.1278, 51.5074],
      [-0.1250, 51.5080],
      [-0.1200, 51.5090]
    ]
  },
  "instructions": [
    {"type": "depart", "text": "Head north on King Street", "distance": 500},
    {"type": "turn", "modifier": "right", "text": "Turn right onto High Street", "distance": 1200},
    {"type": "arrive", "text": "Arrive at destination", "distance": 0}
  ]
}
```

### Kind 30584: Turn-by-Turn Navigation

Published by the operator during active navigation to provide real-time instructions to the provider.

```json
{
  "kind": 30584,
  "tags": [
    ["d", "task_abc123_nav_042"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["instruction_type", "turn"],
    ["instruction_text", "Turn right onto High Street in 200 metres"],
    ["instruction_modifier", "right"],
    ["distance_to_instruction", "200"],
    ["distance_remaining", "5200"],
    ["time_remaining_seconds", "480"],
    ["progress_percent", "37"]
  ],
  "content": ""
}
```

**Required tags**: `d`, `task_id`, `instruction_type`, `instruction_text`
**Optional tags**: `domain`, `instruction_modifier`, `distance_to_instruction`, `distance_remaining`, `time_remaining_seconds`, `progress_percent`

#### Instruction Types

| Type | Description |
|------|-------------|
| `depart` | Starting the route |
| `turn` | Turn instruction (with `modifier`: left, right, slight_left, slight_right, sharp_left, sharp_right, u_turn) |
| `continue` | Continue on current road |
| `merge` | Merge onto another road |
| `roundabout` | Enter roundabout (with exit number) |
| `arrive` | Arriving at destination |

### Kind 30585: Traffic Alert

Published by the operator to alert the provider about traffic conditions ahead.

```json
{
  "kind": 30585,
  "tags": [
    ["d", "task_abc123_traffic_001"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["severity", "high"],
    ["alert_type", "congestion"],
    ["delay_seconds", "900"],
    ["lat", "51.5100"],
    ["lon", "-0.1150"],
    ["alternative_available", "true"],
    ["time_savings_seconds", "600"],
    ["distance_change_metres", "500"]
  ],
  "content": "Heavy congestion on A40 westbound — 15-minute delay. Alternative route saves 10 minutes (+500m)."
}
```

**Required tags**: `d`, `task_id`, `severity`, `alert_type`
**Optional tags**: `domain`, `delay_seconds`, `lat`, `lon`, `alternative_available`, `time_savings_seconds`, `distance_change_metres`

#### Alert Types

| Type | Description |
|------|-------------|
| `congestion` | Traffic congestion / slow-moving traffic |
| `accident` | Road traffic accident |
| `closure` | Road closure (planned or emergency) |
| `construction` | Road works |
| `weather` | Weather-related hazard (ice, flooding) |
| `event` | Large event causing traffic (concert, football match) |

#### Severity Levels

| Severity | Description |
|----------|-------------|
| `low` | Minor delay (< 5 minutes) |
| `medium` | Moderate delay (5-15 minutes) |
| `high` | Significant delay (> 15 minutes) |
| `critical` | Route blocked, reroute required |

### Kind 30586: Reroute Request

Published by the provider to request a new route (e.g. road blocked, passenger requests a stop, provider knows a better route).

```json
{
  "kind": 30586,
  "tags": [
    ["d", "task_abc123_reroute_001"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["reason", "traffic"],
    ["current_lat", "51.5090"],
    ["current_lon", "-0.1200"],
    ["requested_via_lat", "51.5120"],
    ["requested_via_lon", "-0.1050"]
  ],
  "content": "Requesting reroute — traffic ahead on current route."
}
```

**Required tags**: `d`, `task_id`, `reason`
**Optional tags**: `domain`, `current_lat`, `current_lon`, `requested_via_lat`, `requested_via_lon`

#### Reroute Reasons

| Reason | Description |
|--------|-------------|
| `traffic` | Traffic conditions have changed |
| `road_closure` | Road ahead is closed |
| `passenger_request` | Requester has asked for a detour/stop |
| `deviation` | Provider has deviated from route (automatic) |
| `better_route` | Provider knows a better route |

### Kind 30587: Navigation Feedback

Published by the requester after task completion to provide feedback on the route taken.

```json
{
  "kind": 30587,
  "tags": [
    ["d", "task_abc123_nav_feedback"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["route_quality", "4"],
    ["deviation_detected", "false"],
    ["feedback_type", "positive"],
    ["actual_duration_seconds", "750"],
    ["estimated_duration_seconds", "720"]
  ],
  "content": "Good route, arrived on time."
}
```

**Required tags**: `d`, `task_id`
**Optional tags**: `domain`, `route_quality` (1-5), `deviation_detected`, `feedback_type`, `actual_duration_seconds`, `estimated_duration_seconds`

---

## ETA Calculation

ETA (estimated time of arrival) is calculated by the routing provider and updated in real time as the provider moves. The protocol is **provider-agnostic** — any routing engine can generate ETAs:

| Provider | Self-Hosted | Traffic-Aware | Licence |
|----------|-------------|---------------|---------|
| OSRM | Yes | Yes | BSD-2 (open source) |
| OpenRouteService | Yes or API | Yes | LGPL-3 (open source) |
| GraphHopper | Yes or API | Yes | Apache 2.0 (open source) |

ETA updates are communicated via kind 30512 (Status Update) with `eta_seconds` and `distance_remaining_metres` tags (defined in NIP-XX-core).

---

## Privacy

Route data is sensitive — it reveals exact travel patterns. The protocol protects route privacy as follows:

1. **Route geometry** is included in the `content` field of kind 30583 events. These events SHOULD be NIP-44 encrypted when published to Nostr relays, or sent via the operator's private API/WebSocket.
2. **Turn-by-turn instructions** (kind 30584) are typically sent via the operator's WebSocket, not published to public Nostr relays.
3. **Traffic alerts** (kind 30585) MAY be published publicly (they don't contain personal data) but SHOULD include only the approximate area, not exact provider location.
4. **Route data is ephemeral** — operators SHOULD NOT persist route geometry beyond the active task duration. GPS traces are retained only per the operator's GDPR-compliant retention policy (typically 90 days).

---

## See Also

- **NIP-XX-core**: Core protocol (status updates with ETA)
- **NIP-XX-discovery**: Service area definitions
- **NIP-44**: Encrypted payloads for route data privacy
- **implementation/NAVIGATION-README.md**: Navigation provider configuration and API reference
