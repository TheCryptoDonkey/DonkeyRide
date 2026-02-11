# TROTT-08: Messaging & Personal Data

`draft` `optional`

## Abstract

This specification defines **task-scoped messaging, read receipts, personal task archives, and user preference storage**
for the TROTT protocol. It provides encrypted communication between task participants during an active task, persistent
personal records of completed tasks, and portable user settings — all built on Nostr events with NIP-44 encryption.

TROTT-08 is optional. Tasks function fully without messaging (participants can use NIP-17 gift-wrapped direct messages
for ad-hoc communication). This specification adds structured, task-scoped channels that auto-expire per GDPR
requirements.

## Motivation

Real-world service coordination requires communication during active tasks: "I'm at the back entrance", "The parcel is
behind the gate", "Running 5 minutes late". Traditional platforms bundle proprietary chat into their apps, creating
lock-in. This specification standardises task-scoped messaging on Nostr, enabling:

- **Cross-client messaging** — Any TROTT-compatible client can participate in task chat
- **GDPR-compliant auto-expiry** — Messages are time-limited with NIP-40 `expiration` tags
- **Dispute evidence** — Message history is available for dispute resolution (TROTT-05)
- **Personal archives** — Users retain encrypted summaries of their completed tasks
- **Portable preferences** — Settings follow the user's keypair across clients and operators

## Depends On

- **TROTT-01**: Core task lifecycle and state machine
- **NIP-01**: Basic Protocol Flow and Event Format
- **NIP-33**: Parameterised Replaceable Events
- **NIP-40**: Expiration Timestamp
- **NIP-44**: Encrypted Payloads

---

## Event Kinds

| Kind  | Name               | Replaceable      | Publisher              | Description                                    |
|-------|--------------------|------------------|------------------------|------------------------------------------------|
| 30564 | Task Message       | No (append-only) | Either party           | Task-scoped encrypted chat message             |
| 30565 | Message Status     | Yes (NIP-33)     | Recipient              | Read receipt and delivery confirmation         |
| 30566 | Task Archive Entry | Yes (NIP-33)     | Either party (to self) | Personal encrypted summary of a completed task |
| 30567 | User Preferences   | Yes (NIP-33)     | Either party (to self) | Portable user settings backup                  |
| 20502 | Typing Indicator   | No (ephemeral)   | Either party           | Real-time typing signal                        |

> **Note on kind 20502**: This is in the ephemeral event range (20000-29999). Relays MUST NOT persist these events. They
> are transient UX signals only.

---

## Event Structures

### Kind 30564: Task Message

Task-scoped encrypted chat between participants. NIP-44 encrypted to all task participants. Messages are only valid
during an active task.

```json
{
  "kind": 30564,
  "pubkey": "<sender_hex_pubkey>",
  "created_at": 1698766000,
  "tags": [
    ["d", "task_abc123:msg:001"],
    ["domain", "ridesharing"],
    ["task_id", "task_abc123"],
    ["p", "<requester_hex_pubkey>"],
    ["p", "<provider_hex_pubkey>"],
    ["p", "<operator_hex_pubkey>"],
    ["message_type", "text"],
    ["expiration", "1701358000"]
  ],
  "content": "<NIP-44 encrypted to all p-tagged recipients: I'm at the back entrance, look for the red door.>"
}
```

**Required tags**: `d`, `task_id`, `p` (at least one recipient), `message_type`

**Optional tags**: `domain`, `reply_to` (event ID of a previous message), `expiration`

#### Message Types

| Type         | Description                                                                                       |
|--------------|---------------------------------------------------------------------------------------------------|
| `text`       | Free-text message                                                                                 |
| `location`   | Shared location (encrypted content includes lat/lon)                                              |
| `photo`      | Photo reference (encrypted content includes URL; for full media, use Media Attachment kind 30547) |
| `system`     | System-generated message (e.g. "Driver is 2 minutes away", "Task cancelled by requester")         |
| `structured` | Predefined message pattern with machine-parseable content (see Structured Messages below)         |

#### Structured Messages

When `message_type` is `structured`, the message includes a `template` tag identifying a predefined message pattern:

| Template              | Description                                              | Example Content                        |
|-----------------------|----------------------------------------------------------|----------------------------------------|
| `eta_update`          | Provider shares updated arrival estimate                 | `{"eta_minutes": 5}`                   |
| `running_late`        | Provider notifies of delay                               | `{"delay_minutes": 10, "reason": "traffic"}` |
| `access_code`         | Requester shares entry code                              | `{"code": "1234", "type": "gate"}`     |
| `arrival_notification`| Provider has arrived at the location                     | `{"location": "front door"}`           |
| `status_update`       | General status notification                              | `{"status": "Order being prepared"}`   |

Clients that do not recognise a template SHOULD fall back to rendering the message content as plain text. Operators MAY
define additional domain-specific templates.

#### Lifecycle Binding

- Messages are only valid during an active task (from `accepted` through `confirmed`)
- Messages SHOULD include an `expiration` tag set to task completion + 30 days (GDPR)
- After task completion, messages are available for dispute evidence but SHOULD auto-expire
- Implementations MUST NOT allow messaging before task acceptance (use NIP-17 for pre-task enquiries)

#### Mediator Visibility

During disputes (TROTT-05), the mediator's pubkey is added to the `p` tags on new messages, giving them read access to
the conversation from that point forward. Historical messages are NOT retroactively shared unless both parties consent.

**Additional optional tags for Task Message (kind 30564)**:

| Tag                  | Format          | Description                                                    |
|----------------------|-----------------|----------------------------------------------------------------|
| `template`           | String          | Structured message template identifier (when `message_type` is `structured`) |
| `language`           | ISO 639-1 code  | Language of the message content (e.g. `en`, `pl`)              |
| `translated_content` | String          | Machine-translated version of the message body                 |
| `retention_category` | Enumerated      | `ephemeral`, `standard`, `evidence`, `clinical`                |

#### Message Retention Categories

| Category    | Retention                           | Use Case                                     |
|-------------|-------------------------------------|----------------------------------------------|
| `ephemeral` | Deleted at task completion           | Casual coordination ("I'm outside")           |
| `standard`  | Task completion + 30 days (default) | Normal task communication                     |
| `evidence`  | Per TROTT-06 data retention policy  | Messages relevant to potential disputes        |
| `clinical`  | Per healthcare regulations          | Clinical notes (operator-managed, NOT on relay)|

If absent, `standard` applies.

#### Language Support

Provider Profile (TROTT-02, kind 30510) and User Preferences (kind 30567) MAY include `language` tags declaring
preferred languages: `["language", "en"]` or `["language", "pl,en"]` for multilingual users. When task participants
declare different languages, operators MAY offer machine translation. The original message language SHOULD be preserved
with a `language` tag on the Task Message; translated text SHOULD be in the `translated_content` field.

---

### Kind 30565: Message Status

Read receipts and delivery confirmation. Parameterised replaceable — only the latest status per reader per task is kept.

```json
{
  "kind": 30565,
  "pubkey": "<reader_hex_pubkey>",
  "created_at": 1698766100,
  "tags": [
    ["d", "task_abc123:msg_status:<reader_hex_pubkey>"],
    ["task_id", "task_abc123"],
    ["last_read", "<event_id_of_last_read_message>"],
    ["last_read_at", "1698766050"]
  ],
  "content": ""
}
```

**Required tags**: `d`, `task_id`, `last_read`, `last_read_at`

The `d` tag format ensures one status event per reader per task via NIP-33 replacement semantics. When the reader opens
a new message, they publish an updated kind 30565 with the new `last_read` event ID, replacing the previous status.

---

### Kind 20502: Typing Indicator (Ephemeral)

A real-time UX signal indicating that a participant is composing a message. Ephemeral — relays MUST NOT persist these
events.

```json
{
  "kind": 20502,
  "pubkey": "<sender_hex_pubkey>",
  "created_at": 1698766050,
  "tags": [
    ["task_id", "task_abc123"],
    ["p", "<recipient_hex_pubkey>"],
    ["typing", "true"]
  ],
  "content": ""
}
```

**Required tags**: `task_id`, `p`, `typing`

The `typing` tag accepts `true` or `false`. Clients SHOULD publish `typing: false` when the user stops typing or sends
the message. Clients SHOULD treat a typing indicator as stale after 5 seconds without a refresh.

---

### Kind 30566: Task Archive Entry

A personal task backup, encrypted to self. Published after task completion. This is the user's durable personal record —
even if relays delete events, the user's archive persists.

```json
{
  "kind": 30566,
  "pubkey": "<user_hex_pubkey>",
  "created_at": 1698767000,
  "tags": [
    ["d", "archive:task_abc123"],
    ["task_id", "task_abc123"],
    ["domain", "ridesharing"],
    ["completed_at", "1698766800"],
    ["role", "requester"]
  ],
  "content": "<NIP-44 encrypted to self: {\"participants\": [{\"pubkey\": \"<provider_hex>\", \"display_name\": \"Sarah\"}], \"timeline\": [{\"state\": \"requested\", \"at\": 1698765000}, {\"state\": \"accepted\", \"at\": 1698765100}, {\"state\": \"in_progress\", \"at\": 1698765300}, {\"state\": \"completed\", \"at\": 1698766800}], \"financial\": {\"total_paid\": 1500, \"currency\": \"GBP\", \"operator_fee\": 75, \"tip\": 200}, \"rating_given\": 5, \"rating_received\": 5, \"domain_metadata\": {\"pickup\": \"10 Downing Street\", \"dropoff\": \"Paddington Station\", \"distance_metres\": 8450}}>"
}
```

**Required tags**: `d`, `task_id`, `role`

**Optional tags**: `domain`, `completed_at`

Content is NIP-44 encrypted to the publisher's own pubkey. It contains:

- Participants (pubkeys + display names if known)
- Timeline (key state transitions with timestamps)
- Financial summary (total paid/received, currency, fees, tip)
- Rating given/received
- Domain-specific metadata (pickup/dropoff for ridesharing, parcel details for delivery, etc.)

#### REQ Filter

A user can retrieve their full task history:

```json
{
  "kinds": [30566],
  "authors": ["<user_hex_pubkey>"]
}
```

---

### Kind 30567: User Preferences

User settings backup, encrypted to self. Complements Requester Profile (30513) which has public fields. This kind stores
purely private settings.

```json
{
  "kind": 30567,
  "pubkey": "<user_hex_pubkey>",
  "created_at": 1698700000,
  "tags": [
    ["d", "preferences:<user_hex_pubkey>"]
  ],
  "content": "<NIP-44 encrypted to self: {\"ui\": {\"theme\": \"dark\", \"units\": \"metric\", \"language\": \"en\"}, \"notifications\": {\"push_enabled\": true, \"email_enabled\": false}, \"payment\": {\"default_rail\": \"strike\", \"default_currency\": \"GBP\"}, \"privacy\": {\"auto_share_location\": false, \"show_rating_publicly\": true}, \"domain_preferences\": {\"ridesharing\": {\"quiet_ride\": true, \"preferred_vehicle\": \"sedan\"}, \"pet_services\": {\"pet_name\": \"Biscuit\", \"pet_type\": \"dog\", \"pet_breed\": \"cockapoo\", \"special_instructions\": \"Nervous around other dogs\"}}}>"
}
```

**Required tags**: `d`

Content is NIP-44 encrypted to the publisher's own pubkey. Private settings include:

- UI preferences (theme, units, language)
- Notification settings
- Default payment rail and currency
- Privacy settings (auto-share location, show rating publicly)
- Per-domain preferences (quiet ride preference, pet care instructions, etc.)

---

## Relay Filter Patterns

### Querying Messages for a Task

```json
{
  "kinds": [30564],
  "#task_id": ["task_abc123"]
}
```

### Querying Read Status for a Task

```json
{
  "kinds": [30565],
  "#task_id": ["task_abc123"]
}
```

### Querying a User's Task Archive

```json
{
  "kinds": [30566],
  "authors": ["<user_hex_pubkey>"]
}
```

### Querying a User's Preferences

```json
{
  "kinds": [30567],
  "authors": ["<user_hex_pubkey>"],
  "limit": 1
}
```

---

## GDPR Compliance

- **Task Messages (30564)**: SHOULD include `expiration` tags. After task completion + 30 days, messages auto-expire.
  Operators MUST NOT persist message content beyond the declared retention period.
- **Task Archive (30566)**: Encrypted to self — the user is both controller and data subject. Only the user can read or
  delete their archive.
- **User Preferences (30567)**: Encrypted to self — no PII is exposed to relays. The user can delete by publishing a
  replacement with empty content.
- **Typing Indicators (20502)**: Ephemeral — never persisted. No GDPR concern.
- **Right to erasure**: Users can request relay deletion of kinds 30564-30567 per NIP-09 (event deletion). For kind
  30564 messages, both parties' consent is RECOMMENDED before deletion (messages may be needed as dispute evidence).

---

## Privacy Considerations

### What is NEVER in Plain Text

- Message content (always NIP-44 encrypted to `p`-tagged recipients)
- Archive content (always NIP-44 encrypted to self)
- Preference content (always NIP-44 encrypted to self)
- Location data within messages (encrypted in message content)

### What IS Visible on Relays

- That a message exists between two pubkeys for a given task (metadata)
- The message type (text, location, photo, system)
- The task identifier
- Typing indicator existence (ephemeral, but visible in transit)

### Metadata Minimisation

Implementations SHOULD:

- Use NIP-17 gift wrap for the most sensitive messages (hides sender and recipient metadata)
- Avoid publishing typing indicators over public relays (prefer operator WebSocket for real-time signals)
- Set `expiration` tags aggressively on all messaging events

---

## Referenced NIPs

| NIP           | Name                             | Usage in TROTT-08                              |
|---------------|----------------------------------|------------------------------------------------|
| **NIP-01**    | Basic Protocol Flow              | Event format, relay communication              |
| **NIP-09**    | Event Deletion                   | Right to erasure for messages and archives     |
| **NIP-17/59** | Private Messages (Gift Wrap)     | Pre-task enquiries, sensitive message wrapping |
| **NIP-33**    | Parameterised Replaceable Events | Message status, archive entries, preferences   |
| **NIP-40**    | Expiration Timestamp             | Auto-expiry on messages and archives           |
| **NIP-44**    | Encrypted Payloads               | All content encryption                         |

---

## See Also

- **TROTT-01**: Core — Task lifecycle and state machine (message lifecycle binding)
- **TROTT-02**: Discovery — Requester Profile (30513) complements User Preferences (30567)
- **TROTT-05**: Safety — Dispute Evidence (30544) may reference task messages
- **TROTT-06**: Coordination — Operator as message relay via WebSocket (Layer 3)

### Domain Extensions

All domain extensions benefit from task-scoped messaging. No domain-specific messaging kinds are required — the generic
Task Message (30564) serves all domains.
