# NIP-XX-security: Security Guard Dispatch Domain Extension

`draft` `optional`

**Extends**: NIP-XX-core (Decentralised Service Coordination Protocol)
**Domain Identifier**: `security`
**Allocated Kind Range**: 30700-30719
**Reference Implementation**: `src/domain-profiles/security.js`

---

## Abstract

This document defines the **security guard dispatch** domain extension to NIP-XX-core. It specifies role aliases, an extended state machine with shift-based `on_duty` management, domain-specific tags for assignment metadata, hourly pricing semantics, heartbeat check-in integration, and rating criteria for coordinating security guarding services over the Nostr protocol with payment-agnostic financial rails.

Security guarding is a **duration-based** service — unlike ridesharing (point-to-point) or locksmithing (task-to-completion), a guard assignment runs for a defined shift with an explicit start time, end time, and hourly rate. This makes the heartbeat protocol (NIP-XX-safety, kinds 30561-30563) central to the domain: periodic check-ins confirm the guard remains on site, alert, and safe throughout the shift.

## Regulatory Context

**Security guarding is heavily regulated in the United Kingdom.** The Private Security Industry Act 2001 established the **Security Industry Authority (SIA)** as the statutory regulator. It is a **criminal offence** to provide licensable security services without the correct SIA licence. The following activities require an SIA licence:

- **Door supervision** — controlling entry to licensed premises
- **Close protection** — bodyguarding individuals
- **Cash and valuables in transit** — transporting cash or high-value goods
- **Security guarding** — guarding premises, property, or persons (static and patrol)
- **Public space surveillance (CCTV)** — monitoring CCTV in public spaces
- **Key holding** — responding to alarm activations at premises

Operators MUST verify SIA licence status before matching a guard to any assignment where `sia_licence_required` is `true`. The SIA maintains a public licence register that operators SHOULD query programmatically.

Operators in other jurisdictions MUST verify local licensing requirements. Security regulation varies significantly by country and region.

---

## Currency-Neutral Amounts

All monetary amounts in security events are **currency-neutral**. The `amount` value is always in the smallest unit of the specified currency (pence for GBP, cents for USD, satoshis for SAT). Every event with a monetary value MUST include `currency` and `trust_model` tags. See [NIP-XX-payments.md](NIP-XX-payments.md) and [NIP-XX-stakes.md](NIP-XX-stakes.md).

---

## Terminology

| Generic Term (NIP-XX-core) | Security Domain Alias | Description |
|----------------------------|-----------------------|-------------|
| Requester | **Client** | The person or organisation requiring security services |
| Provider | **Guard** | The security operative performing the assignment |
| Task | **Assignment** | A single security guarding shift or engagement |
| Operator | Operator | The relay/server coordinating assignments (unchanged) |

Implementations SHOULD accept both the generic terms (`requester_pubkey`, `provider_pubkey`) and the domain-specific aliases (`client_pubkey`, `guard_pubkey`). The `domain` tag MUST be set to `"security"` on all events.

```json
["domain", "security"]
```

---

## Discovery Method

**Method**: `geohash`

Guard discovery uses the same geohash-based spatial indexing as other domains. Clients broadcast the assignment site location (geohash-encoded) and available guards within the relevant geohash tiles are notified.

```json
["geohash", "gcpvj0"]
```

---

## Pricing Model

**Model**: `hourly` (duration-based)

Security guarding is priced on an hourly rate for the duration of the shift. The total assignment cost is calculated as `hourly_rate x shift_duration_hours`. Operators MAY apply surcharges for unsocial hours, specialist roles, or hazardous environments.

```json
{
  "pricing_model": "hourly",
  "hourly_rate": 1800,
  "currency": "GBP",
  "shift_duration_hours": 8,
  "total_estimate": 14400,
  "surcharges": {
    "night_premium_percent": 25,
    "weekend_premium_percent": 15,
    "close_protection_premium_percent": 100
  }
}
```

### Price Calculation Example

An 8-hour static guard shift at a commercial site (GBP):
- Hourly rate: 1,800p (£18.00/hour)
- Shift duration: 8 hours
- Subtotal: 8 x 1,800 = 14,400p (£144.00)
- Night premium (25%): +3,600p (£36.00)
- **Total: 18,000p (£180.00)**

### Streaming Payments

For long shifts, operators SHOULD use streaming payments (kind 30510) to pay the guard incrementally throughout the shift. The recommended streaming interval is hourly — one payment per hour worked. This protects both parties: the client is not committed to paying for hours not yet worked, and the guard receives compensation as they earn it.

---

## State Machine

The security domain extends the NIP-XX-core state machine by inserting an **`on_duty`** state representing the active guarding period and a **`shift_ended`** state for the formal end-of-shift process. The `on_duty` state is a **duration state** — the guard remains in this state for the full shift, with periodic heartbeat check-ins confirming continued presence and alertness.

```
assignment_requested ──> guard_matched ──> en_route ──> arrived ──> on_duty
         │                    │               │            │            │
         │                    │               │            │            v
         │                    │               │            │       shift_ended
         │                    │               │            │
         └────────────────────┴───────────────┴────────────┴──── cancelled
                        (from any non-terminal state)

Terminal states: shift_ended, cancelled, no_show.
no_show: guard does not arrive at the assignment site within the agreed window (triggers automatic stake forfeiture).
```

### State Definitions

| Core State | Security State | Description |
|------------|---------------|-------------|
| `requested` | `assignment_requested` | Client has submitted a security assignment request |
| `matched` | `guard_matched` | A guard has accepted the assignment |
| `provider_en_route` | `en_route` | Guard is travelling to the assignment site |
| `provider_arrived` | `arrived` | Guard has arrived at the site and is preparing to commence duty |
| *(extension)* | `on_duty` | Guard is actively on duty; heartbeat check-ins are active |
| *(extension)* | `shift_ended` | Shift has concluded; end-of-shift report submitted |
| `cancelled` | `cancelled` | Assignment was cancelled (valid from any non-terminal state) |

### State Transitions

| From | To | Trigger |
|------|----|---------|
| `assignment_requested` | `guard_matched` | Guard accepts the assignment |
| `assignment_requested` | `cancelled` | Client cancels before match |
| `guard_matched` | `en_route` | Guard begins travel to the site |
| `guard_matched` | `cancelled` | Either party cancels |
| `en_route` | `arrived` | Guard GPS confirms arrival at the assignment site |
| `en_route` | `cancelled` | Either party cancels |
| `arrived` | `on_duty` | Guard commences duty; site briefing acknowledged |
| `arrived` | `no_show` | Guard fails to commence duty within the agreed window |
| `arrived` | `cancelled` | Either party cancels (stake penalties may apply) |
| `on_duty` | `shift_ended` | Shift duration elapses; guard submits end-of-shift report |
| `on_duty` | `cancelled` | Exceptional early termination (dispute likely) |

### Heartbeat During `on_duty`

Whilst in the `on_duty` state, the operator publishes periodic check-in requests (kind 30561) at the interval configured in the domain profile or overridden by the assignment's `heartbeat_interval_minutes` tag. The default interval for security is **30 minutes**.

The guard MUST respond with a check-in response (kind 30562) before the deadline. Missed check-ins trigger the escalation procedure defined in NIP-XX-safety (kind 30563). See the [Heartbeat Protocol section of NIP-XX-safety](NIP-XX-safety.md) for full details.

```json
{
  "heartbeat": {
    "enabled": true,
    "intervalMinutes": 30,
    "missedThreshold": 2,
    "alarmAction": "safety_alert"
  }
}
```

A guard who misses two consecutive check-ins triggers a safety alert. This is a critical safety feature — a guard who stops responding may be injured, incapacitated, or in danger.

---

## Domain-Specific Tags

The following tags are specific to the security domain and SHOULD be included on relevant events.

| Tag | Required | Description | Example Values |
|-----|----------|-------------|----------------|
| `assignment_type` | REQUIRED | Type of security assignment | `static_guard`, `patrol`, `door_supervision`, `event_security`, `close_protection` |
| `shift_start` | REQUIRED | ISO 8601 datetime for shift start | `"2025-11-15T18:00:00Z"` |
| `shift_end` | REQUIRED | ISO 8601 datetime for shift end | `"2025-11-16T06:00:00Z"` |
| `shift_duration_hours` | REQUIRED | Duration of the shift in hours | `12` (integer) |
| `site_type` | RECOMMENDED | Type of site being guarded | `residential`, `commercial`, `event`, `construction` |
| `sia_licence_required` | REQUIRED | Whether an SIA licence is required for this assignment | `"true"`, `"false"` |
| `uniform_required` | RECOMMENDED | Whether the guard must wear a uniform or specific attire | `"true"`, `"false"` |

### Additional Optional Tags

| Tag | Description | Example Values |
|-----|-------------|----------------|
| `sia_licence_type` | Specific SIA licence sector required | `"door_supervision"`, `"close_protection"`, `"security_guarding"` |
| `site_name` | Name of the site (encrypted via NIP-44) | NIP-44 encrypted |
| `patrol_route` | Defined patrol waypoints (encrypted via NIP-44) | NIP-44 encrypted JSON array of coordinates |
| `number_of_guards` | Guards required for this assignment | `"2"` (integer as string) |
| `hazard_notes` | Known hazards at the site | `"Guard dogs on premises after 22:00"` |
| `client_contact` | Emergency contact for the client (encrypted via NIP-44) | NIP-44 encrypted |
| `relief_guard_pubkey` | Pubkey of the guard taking over the next shift | Hex pubkey |
| `heartbeat_interval_minutes` | Override the default check-in interval for this assignment | `"15"` |

### Tag Examples

**On an assignment request (kind 30500):**

```json
{
  "kind": 30500,
  "tags": [
    ["domain", "security"],
    ["d", "assignment_sec001"],
    ["geohash", "gcpvj0"],
    ["assignment_type", "static_guard"],
    ["shift_start", "2025-11-15T18:00:00Z"],
    ["shift_end", "2025-11-16T06:00:00Z"],
    ["shift_duration_hours", "12"],
    ["site_type", "construction"],
    ["sia_licence_required", "true"],
    ["sia_licence_type", "security_guarding"],
    ["uniform_required", "true"],
    ["client_pubkey", "abc123..."],
    ["description", "Overnight static guard for construction site. Main gate access only."]
  ],
  "content": ""
}
```

**On a patrol checkpoint (kind 30703):**

```json
{
  "kind": 30703,
  "tags": [
    ["domain", "security"],
    ["d", "assignment_sec001_checkpoint_004"],
    ["e", "<assignment_event_id>"],
    ["task_id", "assignment_sec001"],
    ["checkpoint_number", "4"],
    ["checkpoint_name", "East perimeter gate"],
    ["location_lat", "51.5080"],
    ["location_lon", "-0.1285"],
    ["timestamp", "1700092800"],
    ["status", "all_clear"]
  ],
  "content": "East perimeter secure. Gate locked. No signs of disturbance."
}
```

---

## Rating Criteria

After an assignment is completed, both parties publish rating events (kind 30530) with domain-specific criteria.

| Criterion Tag | Label | Weight | Description |
|---------------|-------|--------|-------------|
| `overall` | Overall | 0.25 | General satisfaction with the security service |
| `alertness` | Alertness | 0.25 | Guard remained attentive and responsive throughout the shift |
| `professionalism` | Professionalism | 0.25 | Conduct, appearance, and adherence to instructions |
| `communication` | Communication | 0.15 | Kept client informed; clear incident reporting |
| `punctuality` | Punctuality | 0.10 | Arrived on time and completed the full shift |

### Rating Event Example

```json
{
  "kind": 30530,
  "tags": [
    ["domain", "security"],
    ["task_id", "assignment_sec001"],
    ["rated_pubkey", "guard_pubkey_xyz"],
    ["overall", "5"],
    ["alertness", "5"],
    ["professionalism", "5"],
    ["communication", "4"],
    ["punctuality", "5"]
  ],
  "content": "Excellent service. Guard was alert and professional throughout the 12-hour overnight shift. Detailed shift report submitted promptly. Minor delay in responding to one radio check but otherwise outstanding."
}
```

---

## Security-Specific Event Kinds (30700-30719)

The following kind range is reserved for security-domain-specific events. Core protocol kinds (30500-30599) are shared across all domains.

| Kind | Name | Status | Replaceable | Publisher |
|------|------|--------|-------------|-----------|
| 30700 | Security Assignment Request | Draft | Yes (NIP-33) | Client |
| 30701 | Shift Report | Draft | Yes (NIP-33) | Guard |
| 30702 | Incident Report | Draft | No (append-only) | Guard |
| 30703 | Patrol Checkpoint | Draft | No (append-only) | Guard |
| 30704 | *(Reserved)* | — | — | — |
| 30705 | Site Briefing | Draft | Yes (NIP-33) | Client / Operator |
| 30706-30719 | *(Reserved for future use)* | — | — | — |

### Kind 30700: Security Assignment Request

Extends core kind 30500 with security-specific metadata. Published by the client or operator to create a security assignment with full shift details, site information, and licensing requirements.

```json
{
  "kind": 30700,
  "tags": [
    ["domain", "security"],
    ["d", "assignment_sec001"],
    ["e", "<core_request_event_id>"],
    ["assignment_type", "patrol"],
    ["shift_start", "2025-11-15T22:00:00Z"],
    ["shift_end", "2025-11-16T06:00:00Z"],
    ["shift_duration_hours", "8"],
    ["site_type", "commercial"],
    ["sia_licence_required", "true"],
    ["sia_licence_type", "security_guarding"],
    ["uniform_required", "true"],
    ["number_of_guards", "1"],
    ["hourly_rate", "2000"],
    ["currency", "GBP"],
    ["trust_model", "custodial-third-party"],
    ["heartbeat_interval_minutes", "30"],
    ["geohash", "gcpvj0"]
  ],
  "content": "Overnight patrol of commercial estate. 4 buildings, external perimeter patrol every 2 hours. Key holding included."
}
```

**Semantics:**
- `assignment_type` determines the licensing requirements and expected guard behaviour
- `shift_start` and `shift_end` define the exact duty window; the guard MUST be on site by `shift_start`
- `hourly_rate` is in the smallest unit of the specified currency
- `heartbeat_interval_minutes` overrides the domain default for this specific assignment

### Kind 30701: Shift Report

Published by the guard at the end of the shift. Summarises the shift, notable events, and handover notes for the next guard or the client.

```json
{
  "kind": 30701,
  "tags": [
    ["domain", "security"],
    ["d", "assignment_sec001"],
    ["e", "<assignment_event_id>"],
    ["task_id", "assignment_sec001"],
    ["shift_start_actual", "2025-11-15T21:55:00Z"],
    ["shift_end_actual", "2025-11-16T06:05:00Z"],
    ["hours_worked", "8.17"],
    ["patrols_completed", "4"],
    ["incidents_reported", "1"],
    ["checkpoints_logged", "16"],
    ["all_clear", "false"],
    ["handover_notes", "Incident at 02:30 — see incident report. East gate lock requires maintenance."]
  ],
  "content": "Shift completed. One incident logged at 02:30 (attempted unauthorised access, east gate). Individual challenged and departed. Police not required. All other patrols uneventful. Recommend east gate lock inspection — mechanism stiff."
}
```

**Semantics:**
- `shift_start_actual` and `shift_end_actual` record the true times, which may differ slightly from the scheduled times
- `hours_worked` is the billable duration (decimal hours)
- `all_clear` indicates whether the shift passed without incidents
- `handover_notes` are specifically for the next guard taking over the site

### Kind 30702: Incident Report

Published by the guard during or after the shift to document any incident. Incident reports are append-only — once published, they form part of the permanent record for the assignment.

```json
{
  "kind": 30702,
  "tags": [
    ["domain", "security"],
    ["d", "incident_sec001_001"],
    ["e", "<assignment_event_id>"],
    ["task_id", "assignment_sec001"],
    ["incident_type", "unauthorised_access"],
    ["severity", "moderate"],
    ["timestamp", "1700100600"],
    ["location_lat", "51.5080"],
    ["location_lon", "-0.1285"],
    ["police_called", "false"],
    ["injuries", "false"],
    ["photo_hash", "sha256:a1b2c3d4e5f6..."]
  ],
  "content": "02:30 — Individual attempted to climb east perimeter fence. Challenged verbally. Individual descended and left the area heading north on foot. Description: male, approximately 180cm, dark clothing, no distinguishing features. No damage to fence. Photograph of footprints taken."
}
```

**Incident Types:**

| Type | Description |
|------|-------------|
| `unauthorised_access` | Attempted or actual unauthorised entry |
| `trespass` | Person found on site without authorisation |
| `theft` | Theft or attempted theft |
| `vandalism` | Damage to property |
| `suspicious_activity` | Activity warranting note but not immediate action |
| `alarm_activation` | Alarm triggered (intruder, fire, or other) |
| `fire` | Fire or smoke detected |
| `medical` | Medical incident on site |
| `disturbance` | Public order disturbance or altercation |
| `other` | Any other notable incident |

### Kind 30703: Patrol Checkpoint

Published by the guard upon reaching a defined patrol waypoint. Provides a GPS-confirmed record of the patrol route and timing. Checkpoints create an auditable trail proving the guard physically completed their patrol rounds.

```json
{
  "kind": 30703,
  "tags": [
    ["domain", "security"],
    ["d", "assignment_sec001_checkpoint_007"],
    ["e", "<assignment_event_id>"],
    ["task_id", "assignment_sec001"],
    ["checkpoint_number", "7"],
    ["checkpoint_name", "Main entrance"],
    ["patrol_round", "2"],
    ["location_lat", "51.5074"],
    ["location_lon", "-0.1278"],
    ["accuracy_metres", "3"],
    ["timestamp", "1700096400"],
    ["status", "all_clear"]
  ],
  "content": "Main entrance secure. Doors locked. CCTV operational."
}
```

**Semantics:**
- `checkpoint_number` is the sequential number within the current patrol round
- `patrol_round` identifies which patrol circuit this checkpoint belongs to
- `accuracy_metres` indicates the GPS accuracy at the time of logging
- Operators MAY define expected checkpoint locations and flag deviations from the patrol route

### Kind 30705: Site Briefing

Published by the client or operator before the shift begins. Contains essential information the guard needs to perform the assignment safely and effectively. Sensitive details (access codes, alarm procedures, key locations) SHOULD be encrypted using NIP-44.

```json
{
  "kind": 30705,
  "tags": [
    ["domain", "security"],
    ["d", "briefing_sec001"],
    ["e", "<assignment_event_id>"],
    ["task_id", "assignment_sec001"],
    ["p", "<guard_pubkey>"],
    ["site_type", "commercial"],
    ["site_name", "Meridian Business Park"],
    ["briefing_type", "pre_shift"],
    ["expiration", "1700136000"]
  ],
  "content": "<NIP-44 encrypted: site access procedures, alarm codes, key holder contacts, known hazards, patrol route map, emergency assembly point, client-specific instructions>"
}
```

**Semantics:**
- The `content` field SHOULD be NIP-44 encrypted, readable only by the assigned guard
- `expiration` (per NIP-40) ensures the briefing is automatically pruned after the shift window
- `briefing_type` distinguishes between `pre_shift` (initial briefing) and `update` (mid-shift information changes)
- Site briefings are replaceable (NIP-33) — the client can update the briefing if circumstances change before or during the shift

---

## Staking Model

The security domain uses asymmetric staking weighted towards the provider to deter abandonment during a shift:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Requester (client) stake | 10% of total assignment cost | Deters fake assignment requests |
| Provider (guard) stake | 20% of total assignment cost | Higher stake — abandoning a shift leaves the site unprotected |
| Penalty on cancellation | 80% of stake | Strong deterrent against no-shows and early departure |

Stakes are calculated against the full assignment cost (`hourly_rate x shift_duration_hours`). For multi-day assignments, operators MAY calculate stakes on a per-shift basis rather than the total engagement value.

---

## Completion Proof

Security assignments use the following proof types:

| Proof Type | Description |
|------------|-------------|
| `gps_arrival` | GPS coordinates confirming the guard arrived at the assignment site |
| `heartbeat_log` | Complete log of check-in requests and responses throughout the shift |
| `patrol_checkpoints` | GPS-confirmed patrol checkpoint events (kind 30703) |
| `shift_report` | End-of-shift report (kind 30701) summarising the shift |

The combination of heartbeat responses and patrol checkpoints provides strong evidence that the guard was physically present and actively working throughout the shift. This is significantly more robust than a simple arrival/departure proof.

---

## Dispute Evidence Types

| Evidence Type | Description |
|---------------|-------------|
| `text` | Written description of the dispute |
| `photo` | Photographic evidence (e.g., guard absent from post, site damage) |
| `gps_trace` | GPS trace showing the guard's movements during the shift |
| `heartbeat_log` | Check-in log showing missed check-ins or prolonged absences |
| `incident_report` | Incident report events filed during the shift |
| `cctv` | CCTV footage reference or hash (external to protocol) |

---

## Relationship to Core Protocol

The security domain uses all core NIP-XX event kinds for task lifecycle management, staking, payments, disputes, and reputation. The domain-specific kinds (30700-30719) extend the core protocol with security-specific semantics — principally around shift management, patrol logging, incident reporting, and site briefings. The heartbeat protocol (kinds 30561-30563 from NIP-XX-safety) is central to this domain.

### Shared Core Kinds Used

| Kind | Name | Usage in Security Domain |
|------|------|--------------------------|
| 30500 | Service Request | Client requests a security assignment |
| 30501 | Service Acceptance | Guard accepts the assignment |
| 30502 | Stake Lock | Operator locks commitment stakes |
| 30510 | Streaming Payment | Hourly payments throughout the shift |
| 30511 | Payment Confirmation | Final payment confirmation after shift completion |
| 30512 | Status Update | State transitions during the assignment |
| 30513 | Provider Tip | Client tips the guard |
| 30520 | Stake Release | Operator releases stakes upon shift completion |
| 30522 | Dispute Filing | Either party files a dispute |
| 30524 | Dispute Resolution | Arbiter resolves the dispute |
| 30530 | Reputation Rating | Post-assignment rating with security-specific criteria |
| 30559 | Emergency Alert | Guard triggers panic button during shift |
| 30561 | Safety Check-In Request | Operator requests periodic check-in from guard |
| 30562 | Safety Check-In Response | Guard responds to check-in request |
| 30563 | Safety Check-In Escalation | Operator escalates missed check-ins |

---

## SIA Licence Verification

Operators SHOULD verify SIA licence status before matching a guard to a licensable assignment. The SIA provides a public licence register.

### Verification Tags

Guards MAY publish their SIA licence details as part of their profile. Operators MAY require this before permitting a guard to accept assignments.

```json
{
  "tags": [
    ["sia_licence_number", "1234567890123456"],
    ["sia_licence_sector", "security_guarding"],
    ["sia_licence_expiry_date", "2026-06-30"],
    ["sia_licence_verified", "true"],
    ["sia_licence_verified_by", "<operator_pubkey>"]
  ]
}
```

**Important:** Licence verification is the **operator's responsibility**. The protocol facilitates sharing licence information, but the operator MUST independently verify the licence against the SIA register. A guard's self-declared licence status is not sufficient.

### Licensable Activities

| Assignment Type | SIA Licence Required | Licence Sector |
|-----------------|---------------------|----------------|
| `static_guard` | Yes | Security Guarding |
| `patrol` | Yes | Security Guarding |
| `door_supervision` | Yes | Door Supervision |
| `event_security` | Yes | Security Guarding or Door Supervision |
| `close_protection` | Yes | Close Protection |

---

## Security Considerations

1. **Site location privacy** — Assignment requests reveal the location of the site being guarded, which itself is sensitive security information. Implementations MUST use NIP-17 gift wrap or NIP-44 encryption for precise addresses, with only the geohash visible publicly.
2. **Site briefing sensitivity** — Site briefings contain alarm codes, access procedures, and key locations. These MUST be NIP-44 encrypted and SHOULD use the `expiration` tag (NIP-40) to ensure automatic deletion after the shift.
3. **Guard safety** — Guards working alone, particularly at night, face personal safety risks. The heartbeat protocol is a safety-critical feature in this domain, not merely an operational convenience.
4. **Licence fraud** — Guards may misrepresent their SIA licence status. Operators MUST independently verify licences against the SIA register; self-declaration is insufficient.
5. **Shift handover** — During guard changeovers, there is a vulnerability window. The `relief_guard_pubkey` tag and shift report handover notes help coordinate seamless transitions.

---

## Future Work

- **Multi-guard assignments** — Coordinating multiple guards on a single site with role allocation (e.g., gate, patrol, control room)
- **Key holding integration** — Alarm response and key holding services with automatic dispatch on alarm activation
- **CCTV monitoring** — Integration with remote CCTV monitoring services and alert escalation
- **Lone worker compliance** — Enhanced lone worker safety features beyond the basic heartbeat (BS 8484 compliance)
- **Geofencing** — Automatic alerts if a guard leaves the assignment site perimeter during an active shift
- **SIA register API** — Automated, real-time SIA licence verification via API integration
- **Insurance verification** — Public liability and employer's liability insurance verification
- **Shift scheduling** — Multi-shift and rota management for ongoing security contracts

---

## See Also

- **[NIP-XX-core.md](NIP-XX-core.md)** — Domain-agnostic core protocol (this extension's parent)
- **[NIP-XX-safety.md](NIP-XX-safety.md)** — Safety infrastructure (heartbeat protocol, emergency alerts, check-ins)
- **[NIP-XX-stakes.md](NIP-XX-stakes.md)** — Commitment stakes (lock, release, forfeit)
- **[NIP-XX-payments.md](NIP-XX-payments.md)** — Payment events and streaming models
- **[NIP-XX-reputation.md](NIP-XX-reputation.md)** — Ratings and reputation portability
- **[QUICK-REFERENCE.md](QUICK-REFERENCE.md)** — Summary table of all event kinds
- **[../docs/PAYMENT-PROVIDERS.md](../docs/PAYMENT-PROVIDERS.md)** — Payment provider integration guide
- **Reference implementation**: `src/domain-profiles/security.js`
- **Security Industry Authority**: https://www.sia.homeoffice.gov.uk/ (UK statutory regulator)
- **Private Security Industry Act 2001**: https://www.legislation.gov.uk/ukpga/2001/12/contents
