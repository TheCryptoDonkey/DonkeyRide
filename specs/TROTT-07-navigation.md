# TROTT-07: Navigation — Routing, ETA & Real-time Tracking

`draft` `optional`

## Abstract

This specification defines **navigation, routing, ETA estimation, and real-time location tracking** for trust-minimised service coordination. It applies only to domains where providers physically travel or move things — ridesharing, delivery, towing, emergency trades — and is entirely irrelevant for virtual or stationary services. All location data is NIP-44 encrypted; relays can see that a location update exists but cannot read the coordinates. Metric units are used throughout (metres, seconds).

## Motivation

Navigation is a core component of any location-based service coordination protocol. Traditional platforms couple navigation to proprietary mapping services, creating vendor lock-in and opaque routing decisions. This specification standardises navigation events on Nostr, enabling:

- **Provider-agnostic routing** — Any routing engine (OSRM, OpenRouteService, GraphHopper, Valhalla) can generate routes
- **Transparent routing** — Route choices are auditable, relevant for fare disputes (TROTT-05) and distance-based pricing (TROTT-04)
- **Safety-critical deviation detection** — Off-route, wrong-direction, or unexpected-stop events trigger alerts to requesters and safety contacts (TROTT-05)
- **Punctuality measurement** — ETA accuracy feeds into TROTT-03 reputation scoring
- **Privacy-preserving** — All location data is encrypted; only task participants can read coordinates
- **Offline-capable** — Navigation resource discovery enables pre-downloading of routing tiles for areas with poor connectivity

## Depends On

- **TROTT-01**: Core service coordination protocol (state machine, lifecycle events)
- **NIP-01**: Basic Nostr protocol
- **NIP-33**: Parameterised replaceable events
- **NIP-40**: Expiration timestamps
- **NIP-44**: Encrypted payloads (all location data)

## Event Kinds

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30560 | Route Summary | Yes (NIP-33) | Operator / Provider |
| 30561 | ETA Update | Yes (NIP-33) | Operator / Provider |
| 30562 | Route Deviation | No (append-only) | Operator |
| 30563 | Navigation Resource | Yes (NIP-33) | Anyone |
| 20501 | Location Update | No (ephemeral) | Provider |

---

## Event Structures

### Kind 30560: Route Summary

A parameterised replaceable event containing the computed route for a task. Published when the provider accepts a task and updated if the route changes (reroute due to traffic, requester-requested detour, or deviation correction). Since it is replaceable (NIP-33), only the latest route for a given task is current.

```json
{
  "kind": 30560,
  "tags": [
    ["d", "route_task_abc123"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["distance", "8200"],
    ["duration", "720"],
    ["provider_name", "osrm"],
    ["provider_version", "5.27.1"],
    ["origin_geohash", "gcpuuz"],
    ["destination_geohash", "gcpvn0"],
    ["transport_mode", "car"],
    ["stop_count", "0"],
    ["e", "<task_acceptance_event_id>", "<relay>"],
    ["p", "<requester_pubkey>"],
    ["p", "<provider_pubkey>"],
    ["expiration", "1698769032"]
  ],
  "content": "<NIP-44 encrypted to all p-tagged recipients: {\"origin\": {\"lat\": 51.4613, \"lon\": -0.1156}, \"destination\": {\"lat\": 51.5317, \"lon\": -0.1240}, \"waypoints\": [[51.4650, -0.1130], [51.4820, -0.1180], [51.5100, -0.1220]], \"geometry\": {\"type\": \"LineString\", \"coordinates\": [[-0.1156, 51.4613], [-0.1130, 51.4650], ...]}, \"instructions\": [{\"type\": \"depart\", \"text\": \"Head north on Brixton Road\", \"distance\": 500}, {\"type\": \"turn\", \"modifier\": \"right\", \"text\": \"Turn right onto Kennington Road\", \"distance\": 1200}]}>"
}
```

**Required tags**: `d`, `task_id`, `distance`, `duration`, `provider_name`
**Optional tags**: `domain`, `provider_version`, `origin_geohash`, `destination_geohash`, `transport_mode`, `stop_count`, `stop_purposes`, `e` (task reference), `p` (encrypted recipients), `expiration`

#### Tag Definitions

| Tag | Unit / Format | Description |
|-----|---------------|-------------|
| `distance` | Metres (integer) | Total route distance |
| `duration` | Seconds (integer) | Estimated travel time |
| `provider_name` | String | Routing engine identifier (e.g. `osrm`, `ors`, `graphhopper`, `valhalla`) |
| `provider_version` | Semver string | Routing engine version (for reproducibility) |
| `origin_geohash` | Geohash (precision 5-6) | Approximate origin (public — does not reveal exact address) |
| `destination_geohash` | Geohash (precision 5-6) | Approximate destination (public — does not reveal exact address) |
| `transport_mode` | String | `car`, `bicycle`, `foot`, `motorcycle`, `van`, `truck` |
| `stop_count` | Integer | Number of intermediate stops (0 for direct routes) |
| `stop_purposes` | Comma-separated strings | Purpose of each stop (e.g. `pickup,dropoff` for multi-stop delivery) |

#### Encrypted Content

The `content` field is NIP-44 encrypted to all `p`-tagged recipients (requester and provider). It contains the detailed route data:

| Field | Description |
|-------|-------------|
| `origin` | Exact origin coordinates (`lat`, `lon`) |
| `destination` | Exact destination coordinates (`lat`, `lon`) |
| `waypoints` | Array of `[lat, lon]` coordinate pairs along the route |
| `geometry` | GeoJSON LineString for map rendering |
| `instructions` | Turn-by-turn instruction array |
| `stops` | Array of intermediate stop objects (if `stop_count > 0`), each with `lat`, `lon`, `purpose`, `estimated_arrival` |

Relays see the public tags (distance, duration, geohash-precision origin/destination) but cannot read exact coordinates or the route geometry. This enables relay-level filtering (e.g. "routes in London") without exposing private location data.

#### Multi-Stop Routes

For multi-stop tasks (e.g. multi-drop delivery, carpool with multiple passengers), the `stop_count` and `stop_purposes` tags indicate the route structure:

```json
{
  "kind": 30560,
  "tags": [
    ["d", "route_task_multi_001"],
    ["domain", "delivery"],
    ["task_id", "task_multi_001"],
    ["distance", "24500"],
    ["duration", "2400"],
    ["provider_name", "ors"],
    ["transport_mode", "van"],
    ["stop_count", "3"],
    ["stop_purposes", "collection,delivery,delivery"],
    ["origin_geohash", "gcpuuz"],
    ["destination_geohash", "gcpwq2"],
    ["p", "<requester_pubkey>"],
    ["p", "<provider_pubkey>"]
  ],
  "content": "<NIP-44 encrypted: {\"stops\": [{\"lat\": 51.47, \"lon\": -0.12, \"purpose\": \"collection\", \"estimated_arrival\": 1698766200}, {\"lat\": 51.50, \"lon\": -0.09, \"purpose\": \"delivery\", \"estimated_arrival\": 1698767400}, {\"lat\": 51.53, \"lon\": -0.07, \"purpose\": \"delivery\", \"estimated_arrival\": 1698768600}], ...}>"
}
```

### Kind 30561: ETA Update

A replaceable event that provides the current estimated time of arrival. Each new ETA update for a task overwrites the previous one — the latest event is always the current estimate. ETA accuracy is measured against the actual arrival time and feeds into TROTT-03 punctuality reputation.

```json
{
  "kind": 30561,
  "tags": [
    ["d", "eta_task_abc123"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["eta", "1698766152"],
    ["eta_minutes", "12"],
    ["confidence", "high"],
    ["remaining_distance", "4200"],
    ["remaining_duration", "720"],
    ["p", "<requester_pubkey>"],
    ["expiration", "1698766752"]
  ],
  "content": ""
}
```

**Required tags**: `d`, `task_id`, `eta`, `eta_minutes`
**Optional tags**: `domain`, `confidence`, `remaining_distance`, `remaining_duration`, `p` (requester pubkey), `expiration`

#### Tag Definitions

| Tag | Unit / Format | Description |
|-----|---------------|-------------|
| `eta` | Unix timestamp | Absolute estimated time of arrival |
| `eta_minutes` | Integer | Minutes until arrival (for display convenience) |
| `confidence` | Enum | Confidence level of the estimate |
| `remaining_distance` | Metres (integer) | Distance remaining to destination |
| `remaining_duration` | Seconds (integer) | Time remaining to destination |

#### Confidence Levels

| Confidence | Description | Typical Scenario |
|------------|-------------|-----------------|
| `high` | ETA accurate to within 2 minutes | Provider is on route, no traffic disruption |
| `medium` | ETA accurate to within 5 minutes | Moderate traffic, minor deviations |
| `low` | ETA accurate to within 15 minutes | Heavy traffic, significant rerouting, or poor GPS signal |
| `unknown` | ETA is a rough estimate only | Provider has not started moving, or GPS unavailable |

#### Punctuality Measurement

ETA accuracy is measured by comparing the `eta` timestamp from the most recent kind 30561 event (published before arrival) with the actual arrival timestamp (kind 30503 Task Update to `provider_arrived` or equivalent lifecycle event). The difference feeds into the provider's TROTT-03 `punctuality` reputation criterion:

| Accuracy | Rating Impact |
|----------|---------------|
| Arrived within 2 minutes of ETA | Positive (punctuality +1) |
| Arrived within 5 minutes of ETA | Neutral (no impact) |
| Arrived more than 5 minutes late | Negative (punctuality -1, proportional to delay) |
| Arrived more than 15 minutes late | Strongly negative (punctuality -2) |

### Kind 30562: Route Deviation

A safety-critical event published by the operator when the provider deviates from the planned route. Deviation events are sent to the requester and, if present, the requester's safety contacts (TROTT-05 kind 30542). They are **not public** — only task participants and safety contacts receive them.

```json
{
  "kind": 30562,
  "tags": [
    ["d", "deviation_task_abc123_1698766000"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["deviation_type", "off_route"],
    ["deviation_distance", "450"],
    ["e", "<route_summary_event_id>", "<relay>"],
    ["p", "<requester_pubkey>"],
    ["p", "<safety_contact_pubkey>"],
    ["expiration", "1698769032"]
  ],
  "content": "<NIP-44 encrypted to all p-tagged recipients: {\"provider_lat\": 51.4950, \"provider_lon\": -0.0800, \"expected_lat\": 51.5000, \"expected_lon\": -0.1100, \"bearing\": 95, \"speed_kmh\": 42, \"message\": \"Provider has deviated 450 metres from the planned route heading east.\"}>"
}
```

**Required tags**: `d`, `task_id`, `deviation_type`, `deviation_distance`
**Optional tags**: `domain`, `e` (route summary reference), `p` (notification targets), `expiration`

#### Deviation Types

| Type | Description | Severity |
|------|-------------|----------|
| `off_route` | Provider has left the planned route | Medium — may be a shortcut or a concern |
| `wrong_direction` | Provider is travelling away from the destination | High — likely an error or a safety concern |
| `stopped_unexpectedly` | Provider has been stationary for an unexpected duration | Medium — may be traffic or a concern |
| `excessive_speed` | Provider is travelling significantly above the speed limit | High — safety concern |
| `returned_to_route` | Provider has returned to the planned route after a deviation | Low — informational, resolves a previous deviation |

#### Escalation

Deviation events integrate with TROTT-05 safety infrastructure:

1. `off_route` and `stopped_unexpectedly` — Sent to the requester as an informational alert. No automatic escalation.
2. `wrong_direction` — Sent to the requester AND safety contacts. If no `returned_to_route` event follows within 3 minutes, the operator SHOULD automatically publish a TROTT-05 kind 30540 emergency signal with `severity: urgent`.
3. `excessive_speed` — Sent to the requester AND safety contacts immediately. Logged for the provider's TROTT-03 safety reputation.

#### Dispute Evidence

Route deviation events serve as evidence in TROTT-05 disputes. When a `pricing` dispute is filed (the provider took a longer route to inflate the fare), the signed kind 30562 events and the original kind 30560 route summary provide cryptographic proof of the deviation.

### Kind 30563: Navigation Resource

A discovery event for offline routing data. Published by anyone (operators, community members, or routing data providers) to advertise downloadable routing tiles for a geographic area. This enables providers to pre-download routing data for their service area, supporting offline navigation in areas with poor mobile connectivity.

```json
{
  "kind": 30563,
  "tags": [
    ["d", "navresource_osrm_london_car_2026q1"],
    ["resource_type", "routing_tiles"],
    ["engine", "osrm"],
    ["engine_version", "5.27.1"],
    ["coverage", "gcpuuz,gcpuuy,gcpuux,gcpvn0,gcpvn1,gcpvn2"],
    ["transport_mode", "car"],
    ["format", "osrm_mld"],
    ["size_bytes", "524288000"],
    ["url", "https://tiles.routing.example.com/london-car-2026q1.osrm.tar.gz"],
    ["hash", "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["published_at", "1704067200"],
    ["valid_until", "1711929600"],
    ["publisher_pubkey", "<hex>"],
    ["expiration", "1711929600"]
  ],
  "content": "OSRM routing tiles for Greater London (car profile). Coverage: zones 1-6. Updated quarterly."
}
```

**Required tags**: `d`, `resource_type`, `engine`, `coverage`, `format`, `url`, `hash`
**Optional tags**: `engine_version`, `transport_mode`, `size_bytes`, `published_at`, `valid_until`, `publisher_pubkey`, `expiration`

#### Resource Types

| Type | Description |
|------|-------------|
| `routing_tiles` | Pre-processed routing graph data for a routing engine |
| `map_tiles` | Visual map tiles for display (e.g. vector tiles, raster tiles) |
| `elevation_data` | Elevation/terrain data for gradient-aware routing |
| `speed_profiles` | Historical speed data for traffic-aware routing |
| `address_index` | Geocoding/reverse-geocoding index for address lookup |

#### Coverage Format

The `coverage` tag contains a comma-separated list of geohashes (precision 5) defining the geographic area covered by the resource. Clients can match their service area's geohashes against the coverage to determine whether a resource is relevant.

#### Marketplace Semantics

Navigation resource events create a decentralised marketplace of routing data:

- **Operators** publish resources for their service areas, ensuring their providers have access to high-quality routing data
- **Community contributors** publish open-source routing data from OpenStreetMap extracts
- **Commercial providers** publish premium routing data (traffic-aware, frequently updated) — the `url` may require authentication
- **Clients** discover resources by filtering on `#engine`, `#coverage`, and `#transport_mode`

### Kind 20501: Location Update (Ephemeral)

An ephemeral event containing the provider's current location during an active task. Relays MUST NOT persist these events (kind range 20000-29999). ALL location data in the `content` field is NIP-44 encrypted — relays can see that a location update exists but cannot read the coordinates.

```json
{
  "kind": 20501,
  "tags": [
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["provider_pubkey", "<hex>"],
    ["p", "<requester_pubkey>"],
    ["tracking_consent", "explicit"],
    ["expiration", "1698765462"]
  ],
  "content": "<NIP-44 encrypted to requester: {\"lat\": 51.4950, \"lon\": -0.1100, \"accuracy_metres\": 8, \"bearing\": 355, \"speed_kmh\": 32, \"altitude_metres\": 45, \"timestamp\": 1698765432}>"
}
```

**Required tags**: `task_id`, `provider_pubkey`, `p` (requester pubkey), `tracking_consent`
**Optional tags**: `domain`, `expiration`

#### Encrypted Content Fields

| Field | Unit | Description |
|-------|------|-------------|
| `lat` | Decimal degrees | Latitude |
| `lon` | Decimal degrees | Longitude |
| `accuracy_metres` | Metres | GPS accuracy radius |
| `bearing` | Degrees (0-360) | Direction of travel (0 = north, 90 = east) |
| `speed_kmh` | Kilometres per hour | Current speed |
| `altitude_metres` | Metres above sea level | Altitude (optional) |
| `timestamp` | Unix timestamp | Time of the GPS fix |

#### Tracking Consent

The `tracking_consent` tag declares the basis for location sharing:

| Value | Description |
|-------|-------------|
| `explicit` | Provider has explicitly consented to location sharing for this task |
| `task_terms` | Location sharing is a condition of the task terms (declared in the service request) |
| `operator_policy` | Location sharing is required by the operator's terms of service |

Location tracking MUST be active only during the task lifecycle (from acceptance to completion/cancellation). Implementations MUST cease publishing kind 20501 events when the task reaches a terminal state.

#### Alternative Transport: WebSocket

When an operator is present (TROTT-06), live location data MAY be sent via the operator's WebSocket endpoint (`ephemeral_endpoint` on kind 30550) instead of via ephemeral Nostr events. Both approaches achieve the same result:

| Transport | Latency | Privacy | Infrastructure |
|-----------|---------|---------|---------------|
| Ephemeral Nostr events (kind 20501) | ~1-3 seconds (relay round-trip) | NIP-44 encrypted; relay cannot read | Standard Nostr relays (no extra infrastructure) |
| WebSocket (TROTT-06 Layer 3) | ~50-200ms | TLS encrypted; operator can read | Operator must run WebSocket server |

Operators providing `live_tracking` as a declared service (kind 30550) SHOULD prefer WebSocket for lower latency. P2P tasks (no operator) MUST use ephemeral Nostr events.

---

## Location Visibility by Task Stage

Location data visibility changes as the task progresses through its lifecycle:

| Task Stage | Provider Location Visible To | Requester Location Visible To |
|-----------|------------------------------|-------------------------------|
| `requested` (pre-acceptance) | Nobody | Nobody |
| `matched` / `accepted` | Requester (geohash precision only) | Nobody |
| `provider_en_route` | Requester (exact, via kind 20501) | Provider (pickup location only, via NIP-17) |
| `provider_arrived` | Requester + safety contacts (exact) | Provider (pickup location) |
| `active` / `in_progress` | Requester + safety contacts (exact) | Provider (route destination) |
| `completed` | Nobody | Nobody |
| `cancelled` | Nobody | Nobody |

After task completion or cancellation, ALL location sharing ceases immediately. Kind 20501 events are ephemeral (not persisted by relays). GPS traces retained by the operator for dispute evidence follow the retention policy declared in the TROTT-06 PII Envelope (kind 30551).

---

## Units and Conventions

All navigation events use the **International System of Units (SI)** and metric measurements:

| Measurement | Unit | Tag Examples |
|-------------|------|-------------|
| Distance | Metres | `distance`, `remaining_distance`, `deviation_distance` |
| Duration | Seconds | `duration`, `remaining_duration` |
| Speed | Kilometres per hour | `speed_kmh` (in encrypted content only) |
| Altitude | Metres above sea level | `altitude_metres` (in encrypted content only) |
| Bearing | Degrees (0-360) | `bearing` (in encrypted content only) |
| GPS accuracy | Metres | `accuracy_metres` (in encrypted content only) |
| Coordinates | Decimal degrees (WGS 84) | `lat`, `lon` (in encrypted content only) |

Implementations MUST NOT use imperial units (miles, feet, mph) in event tags or encrypted content fields. Client applications MAY convert to local units for display purposes.

---

## Navigation Provider Transparency

Route summary events (kind 30560) include `provider_name` and `provider_version` tags to ensure routing decisions are transparent and reproducible:

| Provider | Self-Hosted | Traffic-Aware | Licence |
|----------|-------------|---------------|---------|
| OSRM | Yes | Yes (with traffic data) | BSD-2 (open source) |
| OpenRouteService | Yes or API | Yes | LGPL-3 (open source) |
| GraphHopper | Yes or API | Yes | Apache 2.0 (open source) |
| Valhalla | Yes | Yes | MIT (open source) |

The protocol is routing-engine agnostic. Operators declare which engine they use; participants can verify route calculations independently by feeding the same origin/destination into the declared engine.

---

## Connection to Other Specifications

Navigation events are consumed by and feed into multiple other TROTT specifications:

| Specification | Relationship |
|---------------|-------------|
| **TROTT-01** (Core) | Task acceptance (kind 30501) triggers route calculation. Route summary published immediately after acceptance. |
| **TROTT-03** (Reputation) | ETA accuracy (kind 30561 vs actual arrival) feeds into the `punctuality` reputation criterion. Route deviation history feeds into the `safety` criterion. |
| **TROTT-04** (Payments) | Route distance (kind 30560 `distance` tag) is used for distance-based pricing models. Route deviations may trigger fare adjustments. |
| **TROTT-05** (Safety) | Route deviations (kind 30562) trigger safety alerts. `wrong_direction` deviations escalate to emergency signals (kind 30540). Location data from kind 20501 is shared with safety contacts via kind 30542. |
| **TROTT-06** (Coordination) | Operator's WebSocket endpoint (kind 30550 `ephemeral_endpoint`) provides an alternative transport for real-time location data. Operators declaring `live_tracking` or `navigation` services consume and produce navigation events. |

### Lifecycle Integration Flow

```
1. Requester publishes kind 30500 (Task Request)     → TROTT-01
2. Provider publishes kind 30501 (Acceptance)            → TROTT-01
3. Operator/provider publishes kind 30560 (Route)        → TROTT-07
4. Operator/provider publishes kind 30561 (ETA)          → TROTT-07 (repeating)
5. Provider publishes kind 20501 (Location)              → TROTT-07 (continuous)
6. If deviation: operator publishes kind 30562            → TROTT-07 + TROTT-05
7. Provider publishes kind 30503 (Task Update → in_progress)  → TROTT-01
8. ETA accuracy measured (step 4 vs step 7)              → TROTT-03
9. Route distance used for fare calculation               → TROTT-04
10. Provider publishes kind 30504 (Task Complete)        → TROTT-01
11. Location sharing ceases                               → TROTT-07
```

---

## Privacy Considerations

Navigation data is among the most sensitive data in the protocol — it reveals exact travel patterns, home addresses, workplace locations, and daily routines. The specification protects this data at multiple levels:

1. **All coordinates are NIP-44 encrypted** — The `content` field of kind 30560, 30562, and 20501 events is encrypted to task participants only. Relays see the event metadata but cannot read locations.
2. **Public tags use geohash precision only** — `origin_geohash` and `destination_geohash` on route summaries reveal only a ~5km area, not exact addresses.
3. **Ephemeral location events** — Kind 20501 events are in the ephemeral range (20000-29999); relays MUST NOT persist them.
4. **Automatic expiration** — All navigation events include `expiration` tags (NIP-40). Stale events are automatically discarded by relays.
5. **Tracking consent is explicit** — Every kind 20501 event declares the consent basis. There is no covert tracking.
6. **Location sharing is lifecycle-bound** — Sharing begins at task acceptance and ceases at task completion. No pre-task or post-task tracking.

### What Relays Can See

- That a route summary exists for a task (but not the coordinates or geometry)
- That location updates are being published (but not the coordinates)
- The approximate origin and destination area (geohash precision 5, ~5km)
- The route distance and duration (these are public tags for relay filtering)
- The routing engine used

### What Relays Cannot See

- Exact origin or destination addresses
- Waypoint coordinates
- Real-time provider location
- Route geometry (the actual path)
- Speed, bearing, or altitude

---

## See Also

- **TROTT-01**: Core service coordination protocol (lifecycle triggers route calculation)
- **TROTT-03**: Ratings and reputation (ETA accuracy feeds into punctuality)
- **TROTT-04**: Payments (distance used for pricing)
- **TROTT-05**: Safety and disputes (deviation triggers alerts; route evidence in disputes)
- **TROTT-06**: Coordination — the operator layer (WebSocket as alternative location transport)
- **NIP-01**: Basic Nostr protocol
- **NIP-33**: Parameterised replaceable events
- **NIP-40**: Expiration timestamps
- **NIP-44**: Encrypted payloads (all location data)
