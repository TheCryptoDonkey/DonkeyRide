# NIP-XX-safety: Safety Infrastructure

`draft` `optional`

## Abstract

This NIP defines the **safety infrastructure** for trust-minimised service coordination — emergency alerts, trip sharing with trusted contacts, periodic check-ins, check-in escalation, and harassment reporting. These events enable operators to provide 24/7 safety monitoring and enable participants to share live task progress with people they trust.

## Motivation

Service coordination between strangers carries inherent safety risks. Traditional platforms provide safety features (panic buttons, trip sharing, driver screening) but keep all safety data proprietary. This NIP standardises safety events on Nostr, enabling:

- **Multi-operator safety** — Emergency alerts reach all relevant parties, not just one platform
- **Decentralised emergency response** — Multiple parties (operator, emergency contacts, other operators) can respond
- **Transparent safety records** — Safety incidents are publicly auditable (whilst preserving privacy of details)
- **Session-based heartbeat** — For time-based services (security guard dispatch), missed check-ins automatically trigger escalation

## Depends On

- **NIP-XX-core**: Core service coordination protocol
- **NIP-17 + NIP-59**: Private messages (gift wrap) for emergency contact notifications
- **NIP-44**: Encrypted payloads for sensitive safety data

## Event Kinds

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30559 | Emergency Alert | No (append-only) | Either party |
| 30560 | Task Sharing | Yes (NIP-33) | Requester |
| 30561 | Safety Check-In Request | No (append-only) | Operator |
| 30562 | Safety Check-In Response | No (append-only) | Either party |
| 30563 | Safety Check-In Escalation | No (append-only) | Operator |
| 30564 | Harassment Report | No (append-only) | Either party |

---

## Event Structures

### Kind 30559: Emergency Alert

Published by either party to trigger an emergency response. This is the **panic button** — the highest-priority event in the protocol.

```json
{
  "kind": 30559,
  "tags": [
    ["d", "emergency_task_abc123"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["alert_type", "panic"],
    ["triggered_by", "requester"],
    ["lat", "51.5074"],
    ["lon", "-0.1278"],
    ["accuracy_metres", "5"],
    ["e", "<task_event_id>", "<relay>"],
    ["p", "<operator_pubkey>"],
    ["p", "<emergency_contact_1_pubkey>"],
    ["p", "<emergency_contact_2_pubkey>"]
  ],
  "content": "Emergency — I feel unsafe. Driver has deviated from route and locked doors."
}
```

**Required tags**: `d`, `alert_type`, `triggered_by`, `lat`, `lon`
**Optional tags**: `domain`, `task_id`, `accuracy_metres`, `e` (task reference), `p` (notification targets)

#### Alert Types

| Type | Description | Expected Response |
|------|-------------|-------------------|
| `panic` | General panic — participant feels unsafe | Operator safety team contacts participant within 60 seconds |
| `medical` | Medical emergency (participant or third party) | Operator contacts emergency services (999/911) |
| `accident` | Vehicle accident or physical injury | Operator contacts emergency services + insurance |
| `threat` | Active threat from the other party or third party | Operator contacts police, suspends accused party |

#### Response Requirements

Operators with `safety_monitoring: true` in their service area definition (kind 30565) MUST:

1. Acknowledge emergency alerts within **60 seconds**
2. Attempt to contact the alerting party within **90 seconds**
3. Contact emergency services if the party is unreachable within **3 minutes**
4. Log all response actions as signed Nostr events for auditability

### Kind 30560: Task Sharing

Published by the requester to share live task progress with trusted contacts. The sharing event grants read access to task status updates and location data.

```json
{
  "kind": 30560,
  "tags": [
    ["d", "share_task_abc123"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["p", "<trusted_contact_1_pubkey>"],
    ["p", "<trusted_contact_2_pubkey>"],
    ["share_type", "live"],
    ["share_scope", "status,location,eta"],
    ["expiration", "1698769032"]
  ],
  "content": ""
}
```

**Required tags**: `d`, `task_id`, `p` (at least one trusted contact)
**Optional tags**: `domain`, `share_type`, `share_scope`, `expiration`

#### Share Types

| Type | Description |
|------|-------------|
| `live` | Real-time updates pushed to contacts via NIP-17 gift-wrapped messages |
| `on_request` | Contacts can query current status but don't receive automatic updates |
| `completion_only` | Contact notified only when task completes (or if emergency occurs) |

#### NIP-17 Integration

Live location and status updates are sent to emergency contacts as **NIP-17 gift-wrapped messages** (NIP-59). This ensures:

- The relay cannot read the content (three-layer encryption)
- The sender and recipient are hidden from the relay
- Timestamps are obfuscated

```json
{
  "kind": 14,
  "tags": [
    ["p", "<emergency_contact_pubkey>"],
    ["subject", "DonkeyRide — Live trip update"]
  ],
  "content": "{\"task_id\": \"task_abc123\", \"status\": \"active\", \"provider_name\": \"Sarah\", \"lat\": 51.5074, \"lon\": -0.1278, \"eta_minutes\": 12}"
}
```

This inner event is sealed (kind 13) and gift-wrapped (kind 1059) per NIP-17/NIP-59 before publishing.

### Kind 30561: Safety Check-In Request

Published by the operator to request a check-in from a participant. Used for session-based services (security guard dispatch) and periodic monitoring during long tasks.

```json
{
  "kind": 30561,
  "tags": [
    ["d", "checkin_request_task_abc123_005"],
    ["domain", "security_guard"],
    ["task_id", "task_abc123"],
    ["p", "<provider_pubkey>"],
    ["check_in_number", "5"],
    ["requested_at", "1698765432"],
    ["deadline", "1698765732"],
    ["missed_count", "0"]
  ],
  "content": ""
}
```

**Required tags**: `d`, `task_id`, `p` (target party), `deadline`
**Optional tags**: `domain`, `check_in_number`, `requested_at`, `missed_count`

### Kind 30562: Safety Check-In Response

Published by the participant in response to a check-in request.

```json
{
  "kind": 30562,
  "tags": [
    ["d", "checkin_response_task_abc123_005"],
    ["domain", "security_guard"],
    ["task_id", "task_abc123"],
    ["e", "<check_in_request_event_id>", "<relay>"],
    ["status", "all_clear"],
    ["lat", "51.5074"],
    ["lon", "-0.1278"],
    ["responded_at", "1698765500"],
    ["note", "All quiet. Completed patrol of east perimeter."]
  ],
  "content": ""
}
```

**Required tags**: `d`, `task_id`, `e` (request reference), `status`
**Optional tags**: `domain`, `lat`, `lon`, `responded_at`, `note`

#### Check-In Statuses

| Status | Description |
|--------|-------------|
| `all_clear` | Everything normal |
| `minor_issue` | Non-urgent issue to note (e.g. suspicious activity, minor incident) |
| `needs_assistance` | Requesting operator assistance (non-emergency) |
| `emergency` | Emergency — equivalent to triggering kind 30559 |

### Kind 30563: Safety Check-In Escalation

Published by the operator when a participant misses a check-in deadline. Triggers escalation procedures.

```json
{
  "kind": 30563,
  "tags": [
    ["d", "checkin_escalation_task_abc123"],
    ["domain", "security_guard"],
    ["task_id", "task_abc123"],
    ["p", "<provider_pubkey>"],
    ["e", "<missed_check_in_request_event_id>", "<relay>"],
    ["missed_count", "2"],
    ["escalation_level", "safety_team"],
    ["escalated_at", "1698765800"],
    ["last_known_lat", "51.5074"],
    ["last_known_lon", "-0.1278"],
    ["action_taken", "Attempting phone contact. Safety team alerted."]
  ],
  "content": ""
}
```

**Required tags**: `d`, `task_id`, `p` (missing party), `missed_count`, `escalation_level`
**Optional tags**: `domain`, `e`, `escalated_at`, `last_known_lat`, `last_known_lon`, `action_taken`

#### Escalation Levels

| Level | Trigger | Action |
|-------|---------|--------|
| `operator_contact` | 1 missed check-in | Operator attempts phone/message contact |
| `safety_team` | 2 missed check-ins | Safety team alerted, active monitoring |
| `emergency_services` | 3 missed check-ins or no response after 15 minutes | Emergency services contacted at last known location |

### Kind 30564: Harassment Report

Published by either party to report harassment or threatening behaviour.

```json
{
  "kind": 30564,
  "tags": [
    ["d", "harassment_task_abc123"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["p", "<accused_pubkey>"],
    ["reporter_pubkey", "<hex>"],
    ["harassment_type", "verbal_abuse"],
    ["severity", "moderate"],
    ["evidence_type", "text"],
    ["evidence", "[{\"type\":\"text\",\"content\":\"Description of what was said\"}]"]
  ],
  "content": "Provider made repeated threatening comments during the ride."
}
```

**Required tags**: `d`, `p` (accused), `reporter_pubkey`, `harassment_type`
**Optional tags**: `domain`, `task_id`, `severity`, `evidence_type`, `evidence`

#### Harassment Types

| Type | Description |
|------|-------------|
| `verbal_abuse` | Threatening, abusive, or discriminatory language |
| `sexual_harassment` | Unwanted sexual comments or advances |
| `physical_threat` | Threatening physical violence |
| `stalking` | Unwanted following or tracking after task completion |
| `discrimination` | Discrimination based on protected characteristics |

---

## Heartbeat Protocol

For time-based services (security guard dispatch, companion care), the protocol supports a **session-based heartbeat** — periodic check-ins that automatically escalate when missed.

### Configuration

The heartbeat is configured in the domain profile:

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

### Flow

```
1. Task enters on_duty / active state
2. Operator publishes kind 30561 (Check-In Request) every {intervalMinutes}
3. Provider responds with kind 30562 (Check-In Response) before deadline
4. If deadline passes with no response:
   a. missed_count increments
   b. If missed_count < missedThreshold: operator attempts contact
   c. If missed_count >= missedThreshold: operator publishes kind 30563 (Escalation)
   d. If escalation_level reaches emergency_services: operator contacts 999/911
5. On response after missed check-in: missed_count resets, escalation stands down
```

### Reuse of Safety Events

The heartbeat protocol reuses the safety check-in events (kinds 30561-30563) rather than defining new event kinds. This is intentional — the check-in mechanism is the same whether triggered by a heartbeat timer or a manual safety concern.

---

## Operator Requirements

Operators declaring `safety_monitoring: true` in their service area MUST:

1. **24/7 safety team** — Human operators available at all times to respond to emergency alerts
2. **Sub-60-second acknowledgement** — Emergency alerts acknowledged within 60 seconds
3. **Emergency services escalation** — Ability to contact emergency services (999/911/112) in the participant's jurisdiction
4. **Emergency contact notification** — Ability to notify emergency contacts via NIP-17 gift-wrapped messages
5. **Heartbeat monitoring** — For domains with heartbeat enabled, automated check-in scheduling and missed check-in detection
6. **Incident logging** — All safety events and responses logged as signed Nostr events for auditability

---

## See Also

- **NIP-XX-core**: Core protocol (state machine, lifecycle)
- **NIP-XX-discovery**: Service area definition (safety_monitoring flag)
- **NIP-XX-disputes**: Dispute resolution (for post-incident complaints)
- **NIP-17 + NIP-59**: Private messages (gift wrap) for emergency contact notifications
- **NIP-44**: Encrypted payloads for sensitive safety data
