# TROTT Domain Profile: Security

`draft`

**Domain identifier:** `security`
**Coordination pattern:** Shift
**Event kind range:** 30720-30739

## TROTT Specs Used

- TROTT-01: Core **Yes**
- TROTT-02: Discovery (geographic broadcast) **Yes**
- TROTT-03: Reputation **Yes**
- TROTT-04: Payments (streaming -- hourly ticks throughout shift) **Yes**
- TROTT-05: Safety (check-ins -- central to this domain, emergency signal, disputes) **Yes**
- TROTT-06: Coordination (recommended -- SIA licence verification, site briefings) **Yes**
- TROTT-07: Navigation **No** (guard travels to site, but on-site thereafter)

## Roles

- Requester: "Client"
- Provider: "Security Officer"

## State Machine Extension

The security domain uses a shift-based pattern with a sustained `on_station` state and periodic heartbeat check-ins:

```
accepted --> en_route --> briefed --> on_station --> patrolling --> incident --> shift_complete --> confirmed
                            |            |              |              |
                            |            |              +--> on_station (returns from patrol/incident)
                            |            |
                            |            +--> shift_complete (shift duration elapses)
                            |
                            +--> no_show (officer fails to arrive)
```

| Core state | Security state | Description |
|------------|---------------|-------------|
| `accepted` (sub-phase) | `briefed` | Officer has acknowledged the site briefing |
| `in_progress` (primary) | `on_station` | Officer on duty; heartbeat check-ins active |
| `in_progress` (sub-phase) | `patrolling` | Officer conducting a patrol round |
| `in_progress` (sub-phase) | `incident` | Officer handling an incident (documented separately) |
| `completed` | `shift_complete` | Shift concluded; end-of-shift report submitted |

`on_station`, `patrolling`, and `incident` are sub-states within the shift. The officer cycles between them as needed.

## Domain-Specific Tags

| Tag | Description |
|-----|-------------|
| `site_type` | Premises category: `residential`, `commercial`, `construction`, `event`, `retail` |
| `security_level` | Level: `standard`, `high`, `close_protection` |
| `licence_type` | SIA licence sector: `security_guarding`, `door_supervision`, `close_protection`, `cctv` |
| `assignment_type` | Type: `static_guard`, `patrol`, `door_supervision`, `event_security`, `close_protection` |
| `shift_start` | ISO 8601 datetime for shift start |
| `shift_end` | ISO 8601 datetime for shift end |
| `shift_duration_hours` | Duration of the shift in hours |
| `heartbeat_interval_minutes` | Check-in interval (default: 30 minutes) |
| `number_of_guards` | Guards required for this assignment |
| `uniform_required` | Whether uniform is required: `true`/`false` |

## Rating Criteria

| Criterion | Weight |
|-----------|--------|
| `overall` | 0.25 |
| `alertness` | 0.25 |
| `professionalism` | 0.25 |
| `communication` | 0.15 |
| `punctuality` | 0.10 |

## Pricing Model

**Hourly (streaming).** Total = `hourly_rate x shift_duration_hours`. Operators should use TROTT-04 Streaming Tick (30536) for hourly payments throughout the shift. Surcharges for night premium (25%), weekend premium (15%), and close protection premium (100%).

## Cancellation Policy

| Stage | Penalty |
|-------|---------|
| Before match | None |
| More than 24 hours before shift start | None |
| Within 24 hours of shift start | 80% of staked amount |
| Officer abandons shift mid-duty | Full stake forfeit |
| No-show (officer fails to arrive) | 100% of officer stake (automatic) |

Default stakes: Client 10% of total assignment cost, Security Officer 20% of total assignment cost (higher stake -- abandoning a shift leaves the site unprotected).

## PII Requirements

Site address, access codes, alarm procedures, key locations, client emergency contact. All transmitted via TROTT-06 PII Envelope, NIP-44 encrypted to the assigned officer only. Site briefings use `expiration` tag (NIP-40) to auto-prune after the shift window. Retained for task duration plus 30 days.

## Safety Rules

- **Heartbeat check-ins (CRITICAL).** Default interval: 30 minutes. Officer must respond to TROTT-05 Safety Check-in within the deadline. Two consecutive missed check-ins trigger a safety alert. This is safety-critical -- an unresponsive officer may be injured or in danger.
- **Emergency signal:** Officer may trigger panic button at any time via TROTT-05 Emergency Signal.
- **Patrol checkpoints:** GPS-confirmed patrol waypoints create an auditable trail proving physical patrol completion.

## Completion Proof

Combination of:
- **Heartbeat log** -- complete record of check-in requests and responses throughout the shift.
- **Patrol checkpoints** -- GPS-confirmed waypoint events.
- **Shift report** -- end-of-shift summary documenting patrols completed, incidents handled, and handover notes.

## Domain-Specific Event Kinds

| Kind | Name | Description |
|------|------|-------------|
| 30720 | Security Assignment Request | Assignment with shift times, SIA requirements, site details |
| 30721 | Shift Report | End-of-shift summary: hours, patrols, incidents, handover |
| 30722 | Incident Report | Documented incident during shift (append-only) |
| 30723 | Patrol Checkpoint | GPS-confirmed patrol waypoint with status |
| 30724 | Site Briefing | Encrypted site access procedures and instructions |
| 30725-30739 | *(Reserved)* | Future security extensions |

## Regulatory Context

**Security guarding is heavily regulated in the UK.** The **Private Security Industry Act 2001** established the **Security Industry Authority (SIA)** as the statutory regulator. It is a **criminal offence** to provide licensable security services without the correct SIA licence. Licensable activities include: security guarding (static and patrol), door supervision, close protection, cash and valuables in transit, public space CCTV surveillance, and key holding. Operators must independently verify SIA licence status against the SIA public register before matching any officer to a licensable assignment. Self-declaration by the officer is insufficient.
