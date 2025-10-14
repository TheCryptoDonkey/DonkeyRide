continu# NIP-XX: Decentralized Ridesharing Protocol

`draft` `optional`

## Abstract

This NIP defines a protocol for decentralized ridesharing, delivery, and transportation coordination using Nostr events. It enables peer-to-peer ride matching, commitment stakes, streaming payments, reputation management, and dispute resolution without requiring a centralized platform.

## Motivation

Traditional ridesharing platforms (Uber, Lyft) extract 25-30% commission, can arbitrarily deplatform drivers, control payment timing, and create information asymmetry. This specification enables:

- **Direct peer-to-peer coordination** between riders and drivers
- **Economic incentives** through commitment stakes to prevent ghosting
- **Instant settlement** via Lightning Network streaming payments
- **Reputation without manipulation** through cryptographically signed events
- **No deplatforming** - drivers cannot be banned from the protocol
- **Fee competition** between relay operators driving fees toward zero

## Event Kinds

This NIP introduces the following event kinds in the 30500-30599 range:

### Core Ride Events

| Kind  | Description | Replaceable | Publisher |
|-------|-------------|-------------|-----------|
| 30500 | Ride Request | Yes (by d tag) | Rider |
| 30501 | Ride Acceptance | Yes (by d tag) | Driver |
| 30510 | Streaming Payment | No | Rider |
| 30511 | Ride Completion | No | Either party |
| 30512 | Ride Status Update | Yes (by d tag) | Driver |
| 30521 | Cancellation | No | Either party |

### Stake Management Events

| Kind  | Description | Replaceable | Publisher |
|-------|-------------|-------------|-----------|
| 30502 | Stake Lock | Yes (by d tag) | Operator |
| 30503 | Stake Negotiation | Yes (by d tag) | Either party |
| 30520 | Stake Release | No | Operator |
| 30540 | Operator Bond | Yes (by d tag) | Operator |

### Trust & Enforcement Events

| Kind  | Description | Replaceable | Publisher |
|-------|-------------|-------------|-----------|
| 30522 | Dispute | No | Either party |
| 30530 | Reputation Rating | No | Either party |
| 30531 | Reputation Query | Yes (by d tag) | Anyone |
| 30550 | Theft Report | No | Anyone |
| 30551 | Theft Verification | No | Verifier |
| 30560 | Reputation Slash | No | Verifier |
| 30561 | Bond Slash Proposal | No | Guardian |
| 30562 | Guardian Vote | No | Guardian |
| 30563 | Operator Appeal | No | Operator |

### Optional Events

| Kind  | Description | Replaceable | Publisher |
|-------|-------------|-------------|-----------|
| 30505 | Cross-Operator Coordination | Yes (by d tag) | Operator |
| 30555 | Scheduled Ride | Yes (by d tag) | Rider |
| 30565 | Delivery Request | Yes (by d tag) | Sender |
| 30566 | Delivery Acceptance | Yes (by d tag) | Courier |
| 30570 | Verifier Registration | Yes (by d tag) | Verifier |
| 30571 | Verifier Audit | No | Auditor |

## Event Structures

### Ride Request (Kind 30500)

A rider publishes this event to request a ride. The `d` tag contains a unique identifier for this request.

```json
{
  "kind": 30500,
  "pubkey": "<rider-pubkey>",
  "content": "Need ride to catch my train",
  "tags": [
    ["d", "<unique-ride-id>"],
    ["from", "<lat>,<lon>", "<human-readable-address>"],
    ["to", "<lat>,<lon>", "<human-readable-address>"],
    ["price", "<max-sats>"],
    ["rider_stake", "<sats>"],
    ["ride_type", "immediate|scheduled"],
    ["payment_type", "streaming|upfront|postpaid"],
    ["requires_driver_stake", "true|false"],
    ["min_driver_reputation", "<0-100>"],
    ["passenger_count", "<number>"],
    ["luggage", "none|small|medium|large"],
    ["accessibility", "wheelchair|none"],
    ["expiry", "<unix-timestamp>"],

    // Optional for scheduled rides
    ["pickup_time", "<unix-timestamp>"],
    ["schedule_weight", "<1-10>"],

    // Optional preferences
    ["vehicle_type", "sedan|suv|van|bike|scooter"],
    ["quiet_ride", "true"],
    ["music_preference", "none|rider-choice"],

    // Privacy options
    ["relay_hint", "wss://relay.example.com"],
    ["encrypt_location", "true"]
  ]
}
```

**Tag Descriptions:**

- `d`: Unique identifier for this ride request (enables replaceability)
- `from`: Pickup location (lat,lon) with human-readable address
- `to`: Destination location (lat,lon) with human-readable address
- `price`: Maximum price rider is willing to pay in satoshis
- `rider_stake`: Amount rider will stake (typically 10-20% of price)
- `ride_type`: `immediate` (ASAP) or `scheduled` (future time)
- `payment_type`: `streaming` (recommended), `upfront`, or `postpaid`
- `requires_driver_stake`: Whether driver must stake to accept
- `min_driver_reputation`: Minimum acceptable driver reputation score (0-100)
- `expiry`: Unix timestamp when this request expires

### Ride Acceptance (Kind 30501)

A driver publishes this event to accept a ride request.

```json
{
  "kind": 30501,
  "pubkey": "<driver-pubkey>",
  "content": "Ride accepted! ETA 5 minutes",
  "tags": [
    ["d", "<driver-acceptance-id>"],
    ["e", "<ride-request-event-id>"],
    ["p", "<rider-pubkey>"],
    ["driver_stake", "<sats>"],
    ["payment_type", "streaming"],
    ["rate", "<sats-per-interval>"],
    ["interval", "<seconds>"],
    ["driver_reputation", "<0-100>"],
    ["eta", "<seconds>"],
    ["vehicle", "<make-model>"],
    ["license_plate", "<plate>"],
    ["color", "<vehicle-color>"],
    ["lightning", "<lightning-address-or-lnurl>"],

    // Stake mechanism details
    ["stake_mechanism", "custodial|lightning_hodl|federated|smart_contract"],
    ["stake_provider", "wss://relay.example.com"],
    ["stake_lock_id", "<provider-specific-id>"],

    // Driver details
    ["profile_picture", "<url>"],
    ["phone_last_4", "<digits>"],
    ["current_location", "<lat>,<lon>"]
  ]
}
```

**Tag Descriptions:**

- `e`: References the ride request event ID
- `p`: Tags the rider's pubkey for notification
- `driver_stake`: Amount driver is staking (typically 15-30% of ride value)
- `lightning`: Driver's Lightning address for receiving payments
- `stake_mechanism`: How stakes are held (custodial Strike, Lightning hodl invoices, Fedimint, etc.)
- `eta`: Estimated arrival time in seconds

### Commitment Stake Lock (Kind 30502)

Published by the stake relay operator or smart contract to prove stake has been locked.

```json
{
  "kind": 30502,
  "pubkey": "<operator-or-contract-pubkey>",
  "content": "Stake locked successfully",
  "tags": [
    ["d", "<stake-id>"],
    ["e", "<ride-request-id>"],
    ["p", "<staker-pubkey>"],
    ["amount", "<sats>"],
    ["type", "rider_stake|driver_stake"],
    ["status", "locked|released|forfeited"],
    ["mechanism", "custodial|lightning_hodl|federated|smart_contract"],
    ["provider", "strike|mutiny|fedimint|dlc"],
    ["proof", "<provider-specific-proof>"],
    ["lock_time", "<unix-timestamp>"],
    ["timeout", "<unix-timestamp>"],

    // For Lightning hodl invoices
    ["payment_hash", "<hash>"],
    ["invoice", "<bolt11-invoice>"],

    // For smart contracts
    ["chain", "polygon|arbitrum|liquid"],
    ["contract_address", "<address>"],
    ["tx_hash", "<transaction-hash>"]
  ]
}
```

### Streaming Payment (Kind 30510)

Published periodically during the ride to stream payment from rider to driver.

```json
{
  "kind": 30510,
  "pubkey": "<rider-pubkey>",
  "content": "Payment #15: 25 sats",
  "tags": [
    ["e", "<ride-request-id>"],
    ["p", "<driver-pubkey>"],
    ["amount", "<sats>"],
    ["invoice_num", "<sequence-number>"],
    ["total_paid", "<cumulative-sats>"],
    ["distance", "<meters>"],
    ["location", "<lat>,<lon>"],
    ["streaming", "true"],

    // Payment proof
    ["payment_hash", "<lightning-payment-hash>"],
    ["preimage", "<payment-preimage>"],
    ["paid_at", "<unix-timestamp>"]
  ]
}
```

### Ride Status Update (Kind 30512)

Driver publishes status updates throughout the ride lifecycle.

```json
{
  "kind": 30512,
  "pubkey": "<driver-pubkey>",
  "content": "Arrived at pickup location",
  "tags": [
    ["d", "<ride-id>"],
    ["e", "<ride-request-id>"],
    ["p", "<rider-pubkey>"],
    ["status", "accepted|enroute_to_pickup|arrived|pickup|enroute|dropoff|completed"],
    ["location", "<lat>,<lon>"],
    ["eta", "<seconds>"],
    ["distance_remaining", "<meters>"],
    ["speed", "<meters-per-second>"],
    ["heading", "<degrees>"]
  ]
}
```

**Status Values:**

- `accepted`: Driver accepted, not yet moving
- `enroute_to_pickup`: Driver heading to pickup location
- `arrived`: Driver arrived at pickup
- `pickup`: Rider is getting in vehicle
- `enroute`: Heading to destination with rider
- `dropoff`: Arriving/arrived at destination
- `completed`: Ride finished

### Ride Completion (Kind 30511)

Published when ride completes successfully.

```json
{
  "kind": 30511,
  "pubkey": "<driver-or-rider-pubkey>",
  "content": "Ride completed successfully",
  "tags": [
    ["e", "<ride-request-id>"],
    ["p", "<other-party-pubkey>"],
    ["status", "completed"],
    ["total_paid", "<sats>"],
    ["total_distance", "<meters>"],
    ["duration", "<seconds>"],
    ["invoices", "<count>"],
    ["release_stakes", "true"],
    ["completed_at", "<unix-timestamp>"]
  ]
}
```

### Stake Release (Kind 30520)

Published by stake operator to prove stakes have been released.

```json
{
  "kind": 30520,
  "pubkey": "<operator-pubkey>",
  "content": "Stakes released - ride completed",
  "tags": [
    ["e", "<ride-request-id>"],
    ["action", "release"],
    ["rider_stake", "<sats>"],
    ["driver_stake", "<sats>"],
    ["rider_release_proof", "<provider-tx-id>"],
    ["driver_release_proof", "<provider-tx-id>"],
    ["released_at", "<unix-timestamp>"]
  ]
}
```

### Cancellation (Kind 30521)

Published when either party cancels the ride.

```json
{
  "kind": 30521,
  "pubkey": "<cancelling-party-pubkey>",
  "content": "Cancelling ride - emergency",
  "tags": [
    ["e", "<ride-request-id>"],
    ["p", "<other-party-pubkey>"],
    ["cancelled_by", "rider|driver"],
    ["reason", "driver_no_show|rider_no_show|emergency|better_offer|other"],
    ["penalty", "<sats>"],
    ["refund", "<sats>"],
    ["refund_to", "<pubkey>"],
    ["time_since_commitment", "<seconds>"],
    ["status_at_cancellation", "<status>"]
  ]
}
```

**Penalty Calculation Guidelines:**

For **immediate rides**:
- < 30 seconds after acceptance: 0% penalty (grace period)
- 30s - 5 minutes: 50% of stake forfeited
- > 5 minutes: 80% of stake forfeited

For **scheduled rides** (based on time until pickup):
- > 24 hours before: 20% penalty
- 12-24 hours: 50% penalty
- 6-12 hours: 80% penalty
- < 6 hours: 100% penalty (full forfeit)

### Dispute (Kind 30522)

Published to initiate dispute resolution.

```json
{
  "kind": 30522,
  "pubkey": "<disputing-party-pubkey>",
  "content": "Driver never arrived despite 'arrived' status",
  "tags": [
    ["e", "<ride-request-id>"],
    ["p", "<other-party-pubkey>"],
    ["dispute_type", "no_show|wrong_destination|unsafe|damaged_property|overcharge|other"],
    ["evidence", "<url-to-evidence>"],
    ["evidence_hash", "<sha256>"],
    ["proposed_resolution", "full_refund|partial_refund|stake_forfeit|no_change"],
    ["stake_at_risk", "<sats>"],
    ["arbiter_requested", "<trusted-arbiter-pubkey>"],
    ["web_of_trust", "true"],
    ["filed_at", "<unix-timestamp>"]
  ]
}
```

### Reputation Rating (Kind 30530)

Published after ride completion to rate the other party.

```json
{
  "kind": 30530,
  "pubkey": "<rater-pubkey>",
  "content": "Great driver, smooth ride",
  "tags": [
    ["p", "<rated-pubkey>"],
    ["e", "<ride-request-id>"],
    ["rating", "<1-5>"],
    ["completion", "true|false"],
    ["weight", "<1-10>"],
    ["tags", "friendly,clean_vehicle,safe_driving"],
    ["negative_tags", "late,aggressive_driving"],

    // Specific criteria
    ["punctuality", "<1-5>"],
    ["communication", "<1-5>"],
    ["vehicle_condition", "<1-5>"],
    ["safety", "<1-5>"],
    ["route_efficiency", "<1-5>"]
  ]
}
```

### Scheduled Ride (Kind 30555)

For rides scheduled in advance (airport pickups, commutes, etc.).

```json
{
  "kind": 30555,
  "pubkey": "<rider-pubkey>",
  "content": "Airport pickup for Monday morning",
  "tags": [
    ["d", "<scheduled-ride-id>"],
    ["from", "<lat>,<lon>", "<address>"],
    ["to", "<lat>,<lon>", "<address>"],
    ["pickup_time", "<unix-timestamp>"],
    ["price", "<sats>"],
    ["rider_stake", "<higher-stake-sats>"],
    ["requires_driver_stake", "true"],
    ["schedule_weight", "<1-10>"],
    ["recurring", "none|daily|weekly|monthly"],
    ["recurrence_pattern", "<rrule>"],
    ["flexibility", "<minutes>"],
    ["commitment_deadline", "<unix-timestamp>"]
  ]
}
```

**Important:** Scheduled rides typically require higher stakes (20-30% for riders, 30-50% for drivers) due to the higher commitment level.

### Delivery Request (Kind 30560)

For package/food delivery using the same infrastructure.

```json
{
  "kind": 30560,
  "pubkey": "<sender-pubkey>",
  "content": "Food delivery from restaurant",
  "tags": [
    ["d", "<delivery-id>"],
    ["from", "<lat>,<lon>", "<pickup-address>"],
    ["to", "<lat>,<lon>", "<delivery-address>"],
    ["delivery_type", "food|package|document|other"],
    ["package_size", "small|medium|large"],
    ["fragile", "true|false"],
    ["temperature", "hot|cold|frozen|none"],
    ["price", "<sats>"],
    ["tip", "<sats>"],
    ["proof_required", "photo|signature|none"],
    ["time_sensitive", "true|false"],
    ["max_delivery_time", "<minutes>"]
  ]
}
```

## Architecture Overview

### Operators vs Nostr Relays

**Important distinction:** Operators are NOT Nostr relays. They are separate services that:
- Provide stake escrow/coordination
- Publish events TO existing Nostr relays
- Earn fees for stake management services

```
┌────────────────────────────────────┐
│  Nostr Relay Network (Existing)   │
│  - Damus, Nostr.band, nos.lol     │
│  - Store and relay events          │
│  - No DonkeyRide-specific code     │
└────────────────────────────────────┘
          ↑           ↑
          │  Events  │
          ↓           ↓
┌──────────────┐  ┌──────────────┐
│  Rider App   │  │  Driver App  │
└──────────────┘  └──────────────┘
          ↓           ↓
          │  Stake   │
          │  API     │
          ↓           ↓
┌────────────────────────────────────┐
│  DonkeyRide Operator (Standalone)  │
│  - Express REST API                │
│  - Strike/Lightning integration    │
│  - Stake lock/release              │
│  - Publishes events to Nostr       │
│  - Earns 0.5% fees                 │
└────────────────────────────────────┘
```

### Operator as Standalone Service

Operators can be deployed independently:

```bash
# Operator is just a Node.js service
docker run -d \
  -e OPERATOR_PUBKEY=npub1... \
  -e STRIKE_API_KEY=sk_... \
  -e NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol \
  -e OPERATOR_FEE=0.005 \
  donkeyride/operator:latest

# No Nostr relay required!
# Just connects TO existing relays
```

### Operator Responsibilities

1. **Provide REST API** for stake operations
2. **Lock/release stakes** via Strike/Lightning
3. **Publish events** to standard Nostr relays
4. **Monitor** ride lifecycle
5. **Enforce** penalties
6. **Earn fees** (0.5% of ride value)

### What Operators Don't Do

❌ Store Nostr events (use existing relays)
❌ Relay events to other clients (use existing relays)
❌ Implement NIP-01/NIP-02/etc (use existing relays)
❌ Run WebSocket servers for events (use existing relays)

Operators are **pure stake coordinators**, not infrastructure providers.

## Stake Mechanisms

This protocol supports multiple stake mechanisms to accommodate different trust/privacy preferences:

### 1. Custodial (Strike, Wallet of Satoshi, etc.)

Fastest to implement, lowest friction for users:

```json
{
  "stake_mechanism": "custodial",
  "stake_provider": "strike",
  "stake_lock_id": "hold_abc123"
}
```

**Pros:** Easy UX, instant locks, widely available
**Cons:** Custodial risk, KYC requirements for large amounts

### 2. Lightning Hodl Invoices

Non-custodial, trustless using Lightning Network:

```json
{
  "stake_mechanism": "lightning_hodl",
  "payment_hash": "<hash>",
  "invoice": "lnbc...",
  "hodl_invoice_provider": "lnd|cln|eclair"
}
```

**Pros:** Non-custodial, trustless, instant
**Cons:** Requires Lightning node, more complex

### 3. Federated (Fedimint, Cashu)

Distributed trust model:

```json
{
  "stake_mechanism": "federated",
  "federation_id": "<federation-pubkey>",
  "stake_proof": "<ecash-token>",
  "guardian_count": "5",
  "threshold": "3"
}
```

**Pros:** Privacy, distributed trust, fast
**Cons:** Federation must be trusted

### 4. Smart Contracts (DLCs, Polygon, etc.)

Fully trustless but slower:

```json
{
  "stake_mechanism": "smart_contract",
  "chain": "polygon|arbitrum|liquid",
  "contract_address": "0x...",
  "tx_hash": "0x...",
  "escrow_type": "dlc|timelock"
}
```

**Pros:** Completely trustless, auditable
**Cons:** Gas fees, slower finality

## Operator Economics

Operators provide stake management services and earn fees through market competition.

### Operator Announcement (Kind 30540 - Operator Bond)

Operators announce their services by publishing a bond event:

```json
{
  "kind": 30540,
  "pubkey": "<operator-pubkey>",
  "content": "NYC DonkeyRide Operator - Stakes & Coordination",
  "tags": [
    ["d", "operator-bond"],
    ["operator_url", "https://nyc.donkeyride.com"],
    ["api_endpoint", "https://nyc.donkeyride.com/api/v1"],
    ["location", "40.7128,-74.0060", "New York, NY"],
    ["service_area_km", "50"],
    ["fee_percent", "0.005"],
    ["bond_amount", "1000000"],
    ["bond_address", "bc1q..."],
    ["bond_proof", "signature"],
    ["stake_mechanisms", "custodial_strike,lightning_hodl"],
    ["features", "streaming_payments,penalty_enforcement"],
    ["nostr_relays", "wss://relay.damus.io,wss://nos.lol"],
    ["lightning_address", "operator@getalby.com"],
    ["reputation_score", "99.8"],
    ["total_rides", "15420"],
    ["status", "active"]
  ]
}
```

**Key fields:**
- `operator_url`: HTTP endpoint (not a Nostr relay!)
- `api_endpoint`: REST API for stake operations
- `bond_amount`: Operator's bond (slashed if theft)
- `nostr_relays`: Which relays operator publishes to

### Client Discovery & Selection

Clients discover operators by querying Nostr relays for operator bond events:

```javascript
// 1. Query Nostr relays for operators
async function discoverOperators(nostrRelays, userLocation) {
  const pool = new SimplePool();

  const operators = await pool.list(nostrRelays, [{
    kinds: [30540], // Operator bonds
    limit: 100
  }]);

  return operators.map(event => ({
    pubkey: event.pubkey,
    url: event.tags.find(t => t[0] === 'operator_url')[1],
    api: event.tags.find(t => t[0] === 'api_endpoint')[1],
    fee: parseFloat(event.tags.find(t => t[0] === 'fee_percent')[1]),
    bond: parseInt(event.tags.find(t => t[0] === 'bond_amount')[1]),
    reputation: parseFloat(event.tags.find(t => t[0] === 'reputation_score')[1])
  }));
}

// 2. Select best operator
function selectOperator(operators, preferences) {
  if (preferences.lowestFee) {
    return operators.sort((a,b) => a.fee - b.fee)[0];
  }

  // Default: balance fee, reputation, and bond
  return operators.sort((a,b) => {
    const scoreA = (a.reputation * 0.5) + ((1 - a.fee) * 0.3) + ((a.bond / 1000000) * 0.2);
    const scoreB = (b.reputation * 0.5) + ((1 - b.fee) * 0.3) + ((b.bond / 1000000) * 0.2);
    return scoreB - scoreA;
  })[0];
}

// 3. Use selected operator's REST API
const session = await fetch(`${operator.api}/stakes/sessions`, {
  method: 'POST',
  body: JSON.stringify({ /* ride details */ })
});
```

### Cross-Operator Coordination (Kind 30505)

When rider uses one operator and driver uses another:

```json
{
  "kind": 30505,
  "pubkey": "<coordinator-pubkey>",
  "tags": [
    ["d", "coordination-ride_123"],
    ["e", "ride_123"],
    ["rider_operator", "https://operator1.com"],
    ["driver_operator", "https://operator2.com"],
    ["coordination_type", "dual_operator"],
    ["total_fee", "0.8"],
    ["fee_split", "0.4,0.4"]
  ],
  "content": "Coordinating across two operators"
}
```

**Note**: Cross-operator coordination is optional and complex. Most rides use single operator.

## Reputation System

Reputation is calculated from kind 30530 events with time decay and web-of-trust weighting.

### Calculation Algorithm

```javascript
function calculateReputation(events, webOfTrust, currentTime) {
  let weightedSum = 0;
  let totalWeight = 0;

  events.forEach(event => {
    const rating = parseInt(event.tags.find(t => t[0] === 'rating')[1]);
    const completion = event.tags.find(t => t[0] === 'completion')[1] === 'true';
    const eventWeight = parseInt(event.tags.find(t => t[0] === 'weight')?.[1] || '1');

    // Completed rides worth more
    const completionMultiplier = completion ? 1.0 : 0.5;

    // Web of trust weighting
    const trustScore = webOfTrust.getTrustScore(event.pubkey);
    const trustMultiplier = trustScore / 100;

    // Time decay (90 day half-life)
    const ageMs = currentTime - (event.created_at * 1000);
    const decayMs = 90 * 24 * 60 * 60 * 1000;
    const ageMultiplier = Math.max(0.5, 1.0 - (ageMs / decayMs));

    const finalWeight = eventWeight * completionMultiplier * trustMultiplier * ageMultiplier;

    weightedSum += (rating * 20) * finalWeight; // Convert 1-5 to 0-100 scale
    totalWeight += finalWeight;
  });

  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 50; // Default 50
}
```

### Web of Trust Integration

Use NIP-02 (Contact List) to build web of trust:

- 1st degree connections: 80% trust weight
- 2nd degree connections: 60% trust weight
- Unknown users: 30% trust weight

This prevents Sybil attacks and rating manipulation.

## Privacy Considerations

### Location Privacy

Riders can choose privacy levels:

**Public Pickup:** Full address visible to all drivers
```json
["from", "40.7580,-73.9855", "Times Square, NYC"]
```

**Obfuscated Pickup:** Approximate area only
```json
["from", "40.7580,-73.9855", "Midtown Manhattan"]
["radius", "500"]
```

**Encrypted Pickup:** Encrypted until driver accepts
```json
["from_encrypted", "<nip04-encrypted-location>"]
["p", "<potential-driver-pubkey>"]
```

### Payment Privacy

Use Lightning Network for payment privacy. Consider:

- Separate Lightning nodes per ride
- Blinded paths (BOLT12)
- Route hints to avoid exposing node

### Identity Privacy

Riders/drivers can use:

- Separate Nostr keys per region
- No profile metadata
- Burner Lightning addresses (LNURLw)

## Implementation Guidelines

### For Client Developers

1. **Stake Management**: Implement at least one stake mechanism (custodial recommended for MVP)
2. **Reputation**: Cache reputation scores locally, update hourly
3. **Location Updates**: Publish status updates every 10-30 seconds during rides
4. **Streaming Payments**: Default to 30-second intervals
5. **Error Handling**: Listen for dispute events, prompt users to respond

### For Relay Operators

1. **Stake Custody**: Use established providers (Strike, Wallet of Satoshi) initially
2. **Geographic Filtering**: Index rides by geohash for efficient queries
3. **Fee Competition**: Monitor competitor fees, adjust dynamically
4. **Uptime**: Target 99.9%+ uptime for reputation
5. **Dispute Mediation**: Offer optional paid arbitration service

### For Drivers

1. **Multi-Relay**: Connect to multiple relays to see all available rides
2. **Fee Optimization**: Accept rides through lowest-fee relay
3. **Reputation**: Maintain high scores to access better rides and lower stakes
4. **Stake Management**: Keep sufficient balance for driver stakes

### For Riders

1. **Reputation Check**: Verify driver reputation before accepting
2. **Relay Selection**: Choose relay by fee, reputation, and features
3. **Stake Buffer**: Keep extra sats for stake requirements
4. **Payment Backup**: Have backup Lightning wallet in case primary fails

## Security Considerations

### Stake Security

- **Timeout Protection**: Stakes auto-release after 24 hours if no completion/cancellation
- **Multi-Sig Escrow**: For high-value rides, use 2-of-3 multi-sig
- **Fraud Prevention**: Require GPS verification for completion claims

### Sybil Resistance

- **Web of Trust**: Weight ratings by trust score
- **Stake Requirement**: Minimum stake prevents free spam
- **Time Decay**: Old reputation decays, forcing consistent good behavior
- **Cross-Relay**: Reputation follows pubkey across all relays

### Location Spoofing

- **Multiple Confirmations**: Require GPS + cell tower + WiFi location
- **Speed Checks**: Flag impossible movements
- **Relay Verification**: Relay can optionally verify location via IP geolocation

### Payment Security

- **Streaming Default**: Small payments reduce risk
- **Hodl Invoices**: Lock funds until service completion
- **Dispute Window**: 24-hour window to file disputes

## Migration Path from Centralized Platforms

### Phase 1: Custodial Stakes (Current)
- Use Strike/Wallet of Satoshi
- Minimal UX friction
- Onboard existing drivers

### Phase 2: Lightning Hodl Invoices
- Non-custodial stakes
- Requires Lightning node
- Better for power users

### Phase 3: Federated Stakes
- Fedimint/Cashu integration
- Distributed trust
- Privacy improvements

### Phase 4: Fully Decentralized
- DLCs and smart contracts
- Zero trust assumptions
- Complete decentralization

## Example Workflows

### Simple Ride Flow

1. **Rider** publishes ride request (30500)
2. **Driver** sees request, publishes acceptance (30501)
3. **Relay** locks both stakes (30502 x2)
4. **Driver** publishes "enroute to pickup" (30512)
5. **Driver** publishes "arrived" (30512)
6. **Rider** confirms pickup
7. **Driver** starts driving, publishes "enroute" (30512)
8. **Rider** streams payments every 30s (30510)
9. **Driver** publishes "dropoff" (30512)
10. **Both** publish completion (30511)
11. **Relay** releases stakes (30520)
12. **Both** rate each other (30530)

### Cancellation Flow

1. **Rider** requests ride (30500)
2. **Driver** accepts (30501)
3. **Both** stakes locked (30502)
4. **Driver** can't make it, cancels (30521)
5. **Relay** calculates penalty (80% of driver stake)
6. **Relay** pays penalty to rider
7. **Relay** refunds rider's full stake
8. **Rider** rates driver negatively (30530)

### Dispute Flow

1. **Ride** completes but rider claims wrong destination
2. **Rider** files dispute (30522) with GPS evidence
3. **Event** tags trusted arbiter from web of trust
4. **Arbiter** reviews evidence
5. **Arbiter** publishes resolution event
6. **Relay** distributes stakes per resolution

## References

- [NIP-01: Basic Protocol](https://github.com/nostr-protocol/nips/blob/master/01.md)
- [NIP-02: Contact List and Petnames](https://github.com/nostr-protocol/nips/blob/master/02.md)
- [NIP-04: Encrypted Direct Messages](https://github.com/nostr-protocol/nips/blob/master/04.md)
- [NIP-33: Parameterized Replaceable Events](https://github.com/nostr-protocol/nips/blob/master/33.md)
- [BOLT11: Lightning Invoices](https://github.com/lightning/bolts/blob/master/11-payment-encoding.md)
- [Hodl Invoices](https://wiki.ion.radar.tech/tech/research/hodl-invoice)

## Implementations

Reference implementations:

- JavaScript: https://github.com/donkeyride/donkeyride
- Python: TBD
- Rust: TBD

## License

Public Domain

## Authors

- DonkeyRide Community

---

**Note:** This is a draft specification. Implementations should be considered experimental until this NIP is formally accepted.
