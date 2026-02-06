# NIP-XX: Decentralized Ridesharing Protocol

`draft` `optional`

## Abstract

This NIP defines an **open protocol standard** for ridesharing, delivery, and transportation coordination. It specifies event schemas (kinds 30500-30599) that enable interoperability between different ridesharing operators, applications, and implementations.

Like HTTP for the web or SMTP for email, DonkeyRide provides a common data format for ridesharing coordination, allowing:
- **User data portability** - Switch operators while preserving reputation and ride history
- **Cross-operator compatibility** - Apps can connect to multiple operators
- **Operator competition** - Multiple providers compete on service quality and fees
- **Flexible implementation** - From fully decentralized (Nostr-native) to traditional centralized (schema-compatible)

This NIP defines event schemas and interoperability rules. **It does not mandate specific architectures, legal compliance, or business models.** Operators are responsible for compliance with laws in their jurisdiction.

## Disclaimer

**IMPORTANT LEGAL NOTICE:**

1. **Not Legal Advice**: This specification does not constitute legal advice. Operators MUST consult with qualified legal counsel in their jurisdiction before launching ridesharing services.

2. **Protocol Standard Only**: This NIP defines data formats and event schemas for interoperability. It does NOT:
   - Mandate specific implementations
   - Require particular safety features
   - Prescribe legal compliance methods
   - Provide regulatory guidance (except in non-normative Appendix A)

3. **Operator Responsibility**: Each operator is solely responsible for:
   - Compliance with local, state/provincial, national, and international laws
   - User safety and privacy
   - Insurance and liability coverage
   - Background checks and driver screening
   - Tax reporting and financial regulations
   - Data protection (GDPR, CCPA, etc.)

4. **Regulatory Variation**: Ridesharing regulations vary significantly by jurisdiction. What is legal in one location may be illegal in another. Always verify local requirements.

5. **No Warranty**: This specification is provided "as is" without warranty of any kind. The authors and contributors assume no liability for implementations based on this protocol.

6. **Community Standard**: This is an open protocol developed by the community. It can be used, modified, or ignored as operators see fit. Adherence is voluntary.

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
| 30523 | Payment Failure | No | Driver/Operator |

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
| 30524 | Dispute Resolution | No | Operator/Arbiter |
| 30530 | Reputation Rating | No | Either party |
| 30531 | Reputation Query | Yes (by d tag) | Anyone |
| 30550 | Theft Report | No | Anyone |
| 30551 | Theft Verification | No | Verifier |
| 30552 | Reputation Slash | No | Verifier |
| 30553 | Bond Slash Proposal | No | Guardian |
| 30554 | Guardian Vote | No | Guardian |
| 30555 | Operator Appeal | No | Operator |

### Navigation Events

| Kind  | Description | Replaceable | Publisher |
|-------|-------------|-------------|-----------|
| 30580 | Navigation Route | Yes (by d tag) | Driver/Operator |
| 30581 | Navigation Update | Yes (by d tag) | Driver |
| 30582 | Navigation Instruction | No | Driver |
| 30583 | Route Reroute | No | Driver |
| 30584 | Traffic Alert | No | Operator/Service |

### Optional Events

| Kind  | Description | Replaceable | Publisher |
|-------|-------------|-------------|-----------|
| 30505 | Cross-Operator Coordination | Yes (by d tag) | Operator |
| 30556 | Scheduled Ride | Yes (by d tag) | Rider |
| 30557 | Carpool / Shared Ride | Yes (by d tag) | Organizer |
| 30558 | Carpool Join Request | No | Rider |
| 30565 | Delivery Request | Yes (by d tag) | Sender |
| 30566 | Delivery Acceptance | Yes (by d tag) | Courier |
| 30570 | Verifier Registration | Yes (by d tag) | Verifier |
| 30571 | Verifier Audit | No | Auditor |

### Reporting & History Events

| Kind  | Description | Replaceable | Publisher |
|-------|-------------|-------------|-----------|
| 30585 | Driver Earnings Summary | Yes (by d tag) | Driver |
| 30586 | Rider Trip Summary | Yes (by d tag) | Rider |

### Driver Management Events

| Kind  | Description | Replaceable | Publisher |
|-------|-------------|-------------|-----------|
| 30587 | Driver Availability Status | Yes (by d tag) | Driver |
| 30588 | Shift Start/End | No | Driver |
| 30589 | Break/Pause | No | Driver |

### Surge Pricing Events

| Kind  | Description | Replaceable | Publisher |
|-------|-------------|-------------|-----------|
| 30590 | Surge Zone | Yes (by d tag) | Operator |
| 30591 | Demand Signal | Yes (by d tag) | Operator |
| 30592 | Supply Signal | Yes (by d tag) | Operator |

### Multi-Leg Trip Events

| Kind  | Description | Replaceable | Publisher |
|-------|-------------|-------------|-----------|
| 30593 | Multi-Leg Trip Request | Yes (by d tag) | Rider |
| 30594 | Multi-Leg Stop Event | No | Driver |

### Financial Events

| Kind  | Description | Replaceable | Publisher |
|-------|-------------|-------------|-----------|
| 30513 | Tip | No | Rider |
| 30514 | Wait Time Charge (Pickup) | No | Driver |
| 30515 | No-Show Fee | No | Driver |
| 30516 | Additional Charge (Tolls, Parking) | No | Driver |

### Edge Case & Resolution Events

| Kind  | Description | Replaceable | Publisher |
|-------|-------------|-------------|-----------|
| 30517 | Location Clarification | No | Either party |
| 30518 | Destination Change Request | No | Rider |
| 30519 | Destination Change Response | No | Driver |
| 30520 | Vehicle Breakdown | No | Driver |
| 30521 | Medical Emergency | No | Either party |
| 30522 | Accident Report | No | Driver |
| 30523 | Abuse Detection / Rate Limiting | No | Operator |

### Operational Management Events

| Kind  | Description | Replaceable | Publisher |
|-------|-------------|-------------|-----------|
| 30525 | Service Area Definition | Yes (by d tag) | Operator |
| 30526 | Airport Queue Entry | No | Driver |
| 30527 | Airport Queue Position Update | Yes (by d tag) | Operator |
| 30528 | Flat Rate Zone | Yes (by d tag) | Operator |
| 30529 | Saved Location | Yes (by d tag) | User |

### User Experience Events

| Kind  | Description | Replaceable | Publisher |
|-------|-------------|-------------|-----------|
| 30532 | Rider Preferences | Yes (by d tag) | Rider |
| 30533 | Lost Item Report | No | Rider |
| 30534 | Item Found Response | No | Driver |
| 30535 | Referral Code | Yes (by d tag) | User |
| 30536 | Promo Code | Yes (by d tag) | Operator |
| 30537 | Split Payment | No | Rider |
| 30538 | Corporate Account Link | Yes (by d tag) | Employee |
| 30539 | Driver Destination Filter | Yes (by d tag) | Driver |

### Compliance & Legal Events

| Kind  | Description | Replaceable | Publisher |
|-------|-------------|-------------|-----------|
| 30541 | Age Verification | Yes (by d tag) | Operator |
| 30542 | Wheelchair Accessible Vehicle Cert | Yes (by d tag) | Operator |
| 30543 | Driver Fatigue Limit Warning | No | Operator |

### Safety & Emergency Events

| Kind  | Description | Replaceable | Publisher |
|-------|-------------|-------------|-----------|
| 30559 | Emergency Alert / Panic Button | No | Either party |
| 30560 | Trip Share / Follow My Ride | Yes (by d tag) | Rider |
| 30561 | Safety Check-in Request | No | Operator |
| 30562 | Safety Check-in Response | No | Either party |
| 30563 | Unexpected Stop Detected | No | Operator |
| 30564 | Harassment / Threat Report | No | Either party |

### Driver & Vehicle Verification Events

| Kind  | Description | Replaceable | Publisher |
|-------|-------------|-------------|-----------|
| 30595 | Background Check Result | Yes (by d tag) | Screening Provider |
| 30596 | Insurance Verification | Yes (by d tag) | Operator |
| 30597 | Vehicle Inspection Certificate | Yes (by d tag) | Inspector |
| 30598 | Driver License Verification | Yes (by d tag) | Operator |
| 30599 | Training Completion Certificate | Yes (by d tag) | Operator |

## Implementation Flexibility

This NIP defines a **protocol standard**, not a specific implementation. Operators may choose different architectures based on their market, regulatory environment, and business model.

### Implementation Spectrum

#### 1. Nostr-Native (Maximum Decentralization)

**Use Case:** Crypto-native markets, minimal regulation, privacy-focused users

**Architecture:**
```
Rider App ←→ Public Nostr Relays ←→ Driver App
                    ↓
         Minimal Operator Service
         (PII storage + optional safety monitoring)
```

**Nostr Usage:**
- ✅ Ride discovery (kind 30500)
- ✅ Ride matching (kind 30501)
- ✅ Reputation (kind 30530)
- ✅ Operator bonds (kind 30540)
- ✅ Public coordination events

**Operator Responsibilities:**
- Private database for PII (with deletion capabilities)
- Safety features as required by local law
- Optional: Payment coordination

---

#### 2. Hybrid (Nostr Discovery + Private Operations)

**Use Case:** Mainstream markets (NYC, SF, London), full legal compliance

**Architecture:**
```
Rider App ←→ Public Nostr Relays (discovery + reputation)
                    ↓
              Operator Service
         (PII, real-time, payments, safety)
```

**Nostr Usage:**
- ✅ Operator advertisement (kind 30540)
- ✅ Service areas (kind 30525)
- ✅ Public reputation (kind 30530)
- ❌ Individual ride coordination (private operator DB)

**Operator Responsibilities:**
- Full regulatory compliance (CA, NY, EU)
- 24/7 safety monitoring (if legally required)
- Background checks + insurance
- Real-time WebSocket coordination
- GDPR-compliant PII storage

---

#### 3. Schema-Compatible (Traditional Centralized)

**Use Case:** Existing companies wanting interoperability, corporate fleets

**Architecture:**
```
Rider App ←→ Operator API Only
         (No public Nostr events, but DonkeyRide-compatible schemas)
```

**Nostr Usage:**
- ❌ No public Nostr events
- ✅ Exports data in DonkeyRide event format (data portability)

**Operator Responsibilities:**
- Full traditional centralized service
- Uses DonkeyRide schemas for internal APIs
- Allows users to export reputation/history as signed events

**Example:** *Acme Rideshare operates a closed system but allows drivers to export their reputation as signed kind 30530 events, which can be imported into other operators.*

---

### Event Kind Categories: Core vs Extensions

**Core Events (RECOMMENDED for interoperability):**
- Ride lifecycle: 30500-30512
- Stake management: 30502-30503, 30520, 30540
- Reputation: 30530-30531
- Disputes: 30522, 30524

**Extension Events (OPTIONAL - implement as needed):**
- Safety & Emergency: 30559-30564
- Verification: 30595-30599
- Financial: 30513-30516
- Operational: 30525-30529
- UX Features: 30532-30539
- Compliance: 30541-30543
- Edge Cases: 30517-30523

Operators MAY implement only core events or add extensions based on their requirements.

---

### Legal and Regulatory Compliance

**IMPORTANT:** This NIP does not provide legal advice or mandate compliance requirements.

Operators are responsible for:
- ✅ Compliance with laws in their jurisdiction
- ✅ User safety and privacy
- ✅ Data retention and deletion policies
- ✅ Insurance and liability coverage
- ✅ Background checks and screening (if required)
- ✅ Tax reporting and financial regulations

This NIP provides event schemas that CAN support these requirements but does NOT mandate their implementation.

For common regulatory considerations, see **Appendix A: Regulatory Guidance** (non-normative).

---

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

    // Geographic indexing (REQUIRED for efficient driver discovery)
    ["g", "<geohash-5>"],      // Precision 5 (~5km) - primary search
    ["g", "<geohash-4>"],      // Precision 4 (~20km) - broader fallback
    ["g", "<geohash-3>"],      // Precision 3 (~150km) - metro area

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
    ["privacy_level", "public|obfuscated|encrypted"],
    ["radius", "<meters>"],     // For obfuscated privacy (default 500m)
    ["relay_hint", "wss://relay.example.com"],
    ["encrypt_location", "true"]
  ]
}
```

**Tag Descriptions:**

- `d`: Unique identifier for this ride request (enables replaceability)
- `from`: Pickup location (lat,lon) with human-readable address
- `to`: Destination location (lat,lon) with human-readable address
- `g`: Geohash tags for efficient geographic indexing. **REQUIRED** - clients MUST include at least 3 geohash precision levels:
  - Precision 5 (~4.9km × 4.9km): Primary search radius for drivers
  - Precision 4 (~39km × 19.5km): Broader fallback for sparse areas
  - Precision 3 (~156km × 156km): Metro area coverage
- `price`: Maximum price rider is willing to pay in satoshis
- `rider_stake`: Amount rider will stake (typically 10-20% of price)
- `ride_type`: `immediate` (ASAP) or `scheduled` (future time)
- `payment_type`: `streaming` (recommended), `upfront`, or `postpaid`
- `requires_driver_stake`: Whether driver must stake to accept
- `min_driver_reputation`: Minimum acceptable driver reputation score (0-100)
- `privacy_level`: Privacy mode for location disclosure - `public` (full address visible), `obfuscated` (approximate area only), `encrypted` (revealed only after acceptance)
- `radius`: For obfuscated privacy, the radius in meters around the obfuscated location (default 500m)
- `expiry`: Unix timestamp when this request expires

#### Geographic Discovery Using Geohash Tags

Drivers efficiently discover nearby ride requests by querying Nostr relays using geohash filters. This approach scales to thousands of concurrent requests without performance degradation.

**Geohash Precision Levels:**

| Precision | Cell Size | Use Case |
|-----------|-----------|----------|
| 1 | ~5,000km × 5,000km | Continental |
| 2 | ~1,250km × 625km | Regional |
| 3 | ~156km × 156km | Metro area |
| 4 | ~39km × 19.5km | City district |
| 5 | ~4.9km × 4.9km | Neighborhood (primary) |
| 6 | ~1.2km × 0.6km | Street |
| 7 | ~153m × 153m | Block |

**Client Implementation:**

```javascript
import { encode as encodeGeohash } from 'ngeohash';
import { SimplePool } from 'nostr-tools';

// 1. Generate geohashes from driver's current location
function generateGeohashTags(lat, lon) {
  return [
    encodeGeohash(lat, lon, 5), // Primary search (~5km)
    encodeGeohash(lat, lon, 4), // Broader search (~20km)
    encodeGeohash(lat, lon, 3)  // Metro area (~150km)
  ];
}

// 2. Query for nearby ride requests
async function findNearbyRides(driverLat, driverLon, relays) {
  const pool = new SimplePool();
  const geohashes = generateGeohashTags(driverLat, driverLon);

  // Query all precision levels in parallel
  const filters = geohashes.map(geohash => ({
    kinds: [30500],
    '#g': [geohash],
    limit: 50
  }));

  const events = await pool.querySync(relays, filters);

  // Deduplicate and sort by distance
  const uniqueRides = deduplicateByDTag(events);
  const ridesWithDistance = uniqueRides.map(event => ({
    event,
    distance: calculateDistance(
      driverLat, driverLon,
      ...parseLocation(event.tags.find(t => t[0] === 'from')[1])
    )
  }));

  return ridesWithDistance.sort((a, b) => a.distance - b.distance);
}

// 3. Example: Driver app polling for rides every 10 seconds
async function startDriverPolling(driverLat, driverLon) {
  const NOSTR_RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.snort.social'
  ];

  setInterval(async () => {
    const rides = await findNearbyRides(driverLat, driverLon, NOSTR_RELAYS);

    console.log(`Found ${rides.length} nearby rides`);
    rides.slice(0, 5).forEach(ride => {
      console.log(`  - ${ride.distance.toFixed(1)}km away, ${ride.event.tags.find(t => t[0] === 'price')[1]} sats`);
    });
  }, 10000);
}
```

**Relay Indexing:**

Standard Nostr relays already support tag indexing (NIP-01). To efficiently serve geographic queries, relays SHOULD:

1. Index the `g` tag in the database (e.g., `CREATE INDEX idx_events_g_tag ON events((tags->>'g'))`)
2. Return results for geohash prefix queries (e.g., query `"9q8"` matches `"9q8yy"`, `"9q8yz"`, etc.)
3. Limit results per geohash to prevent DoS (e.g., 100 events per geohash)

**Privacy Considerations:**

When using geohash tags with obfuscated privacy:

```javascript
// For obfuscated rides, offset the location slightly
function generateObfuscatedGeohashes(lat, lon, radiusMeters = 500) {
  // Add random offset within radius
  const offsetLat = lat + (Math.random() - 0.5) * (radiusMeters / 111320);
  const offsetLon = lon + (Math.random() - 0.5) * (radiusMeters / (111320 * Math.cos(lat * Math.PI / 180)));

  return [
    encodeGeohash(offsetLat, offsetLon, 5),
    encodeGeohash(offsetLat, offsetLon, 4),
    encodeGeohash(offsetLat, offsetLon, 3)
  ];
}
```

This ensures exact pickup location is not revealed through geohash precision while still enabling efficient discovery.

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

#### Streaming Payment Robustness

Streaming payments introduce unique failure modes that must be handled gracefully to ensure fair outcomes for both drivers and riders.

**Payment Failure Handling**

If a streaming payment fails during an active ride:

1. **Grace Period**: Allow 60 seconds for payment to succeed (network issues, wallet restart, etc.)
2. **Driver Alert**: Notify driver of payment failure via WebSocket/Nostr event
3. **Safe Stop**: If no payment after grace period, driver SHOULD pull over safely
4. **Dispute Protocol**: Driver files dispute (kind 30522) with payment failure evidence

```javascript
// Example: Driver-side payment monitoring
class PaymentMonitor {
  constructor(rideId, expectedInterval = 30000) {
    this.rideId = rideId;
    this.expectedInterval = expectedInterval;
    this.lastPaymentTime = Date.now();
    this.gracePeriod = 60000; // 60 seconds
  }

  onPaymentReceived(paymentEvent) {
    this.lastPaymentTime = Date.now();
    console.log(`Payment received: ${paymentEvent.tags.find(t => t[0] === 'amount')[1]} sats`);
  }

  checkPaymentStatus() {
    const timeSinceLastPayment = Date.now() - this.lastPaymentTime;

    if (timeSinceLastPayment > this.expectedInterval && timeSinceLastPayment < this.gracePeriod) {
      // Within grace period - alert but continue
      this.alertRider('Payment overdue - please check your wallet');
    } else if (timeSinceLastPayment >= this.gracePeriod) {
      // Grace period expired - initiate stop
      this.initiatePaymentFailureProtocol();
    }
  }

  initiatePaymentFailureProtocol() {
    console.warn('Payment failure - pulling over safely');
    this.publishPaymentFailureEvent();
    this.pullOverSafely();
  }
}
```

**Offline Payment Solutions**

For riders with unreliable connectivity, operators MAY offer pre-funded balance:

```javascript
// Rider pre-funds operator with balance
POST /api/v1/riders/{pubkey}/balance
{
  "amount": 50000,  // Fund 50,000 sats
  "invoice": "lnbc50000..."
}

// During ride, operator deducts from balance automatically
// Publishes streaming payment events on rider's behalf
// Settles with driver after ride completion
```

**Pros:**
- Works even if rider's phone dies
- No interrupted rides due to connectivity
- Smoother UX

**Cons:**
- Requires trusting operator with funds
- Custodial risk
- Minimum balance requirements

**Hodl Invoice Streaming (Trustless Alternative)**

For riders who prefer non-custodial solutions:

```javascript
// 1. Rider creates multiple hodl invoices before ride
const invoices = [];
for (let i = 0; i < 20; i++) {
  const invoice = await createHodlInvoice({
    amount: 100, // 100 sats per invoice
    description: `Ride ${rideId} - Payment ${i+1}`,
    expiresIn: 3600 // 1 hour
  });
  invoices.push(invoice);
}

// 2. Rider shares invoice hashes with operator
await operator.lockHodlInvoices(rideId, invoices.map(inv => inv.hash));

// 3. As ride progresses, operator settles invoices sequentially
// Every 30 seconds during ride:
await operator.settleHodlInvoice(rideId, invoices[currentIndex].hash, preimage);

// 4. Unsettled invoices automatically cancel at expiry
```

**Hodl Invoice Flow:**

```
Rider                    Operator                    Driver
  |                          |                          |
  |--20x hodl invoices------>|                          |
  |                          |                          |
  |                     [Ride starts]                   |
  |                          |                          |
  |                    [Every 30s]                      |
  |                          |----settle invoice------->|
  |                          |<---payment received------|
  |                          |                          |
  |<--payment event----------|                          |
  |                          |                          |
  |                    [Ride completes]                 |
  |                          |                          |
  |<--unsettled refund-------|                          |
```

**Pros:**
- Non-custodial (rider keeps funds until service rendered)
- Trustless (operator can't steal unsettled funds)
- Automatic refunds for unsettled invoices

**Cons:**
- More complex UX (rider must create 20+ invoices)
- Requires Lightning node with hodl invoice support
- Higher technical barrier

**Payment Failure Event (Kind 30523)**

When streaming payment fails, driver or operator publishes:

```json
{
  "kind": 30523,
  "pubkey": "<driver-or-operator-pubkey>",
  "content": "Streaming payment failed after 60s grace period",
  "tags": [
    ["e", "<ride-request-id>"],
    ["p", "<rider-pubkey>"],
    ["last_successful_payment", "<sequence-number>"],
    ["total_paid", "<cumulative-sats>"],
    ["distance_at_failure", "<meters>"],
    ["location_at_failure", "<lat>,<lon>"],
    ["failure_time", "<unix-timestamp>"],
    ["grace_period_seconds", "60"],
    ["failure_reason", "no_payment_received|invoice_expired|insufficient_funds|network_error"],
    ["proposed_resolution", "partial_refund|dispute"]
  ]
}
```

**Recommended Default**: Custodial pre-funded balance for MVP, migrate to hodl invoices for v2.

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
    ["filed_at", "<unix-timestamp>"],

    // Evidence for automated scoring
    ["gps_trace", "<url-to-gps-trace>"],
    ["gps_trace_hash", "<sha256>"],
    ["payment_receipts", "<url-to-receipts>"],
    ["witness_events", "<event-id-1>", "<event-id-2>"],
    ["timestamp_evidence", "<unix-timestamp>"]
  ]
}
```

#### Automated Dispute Confidence Scoring

To scale dispute resolution without relying solely on human arbiters, operators and clients SHOULD implement automated confidence scoring. This provides objective criteria for simple cases while escalating complex disputes to human review.

**Scoring Algorithm:**

```javascript
function scoreDisputeConfidence(dispute, rideData, reputationData) {
  let confidence = 0;
  const factors = [];

  // 1. GPS Evidence (40 points max)
  if (dispute.has_gps_trace) {
    const gpsMatch = analyzeGPSTrace(dispute.gps_trace, rideData.expected_route);

    if (gpsMatch.matches_route > 0.9) {
      confidence += 40;
      factors.push({ factor: 'gps_matches_route', value: 40 });
    } else if (gpsMatch.matches_route > 0.7) {
      confidence += 25;
      factors.push({ factor: 'gps_partial_match', value: 25 });
    }

    if (gpsMatch.driver_at_dropoff) {
      confidence += 30;
      factors.push({ factor: 'driver_at_dropoff_location', value: 30 });
    }
  }

  // 2. Payment Evidence (20 points max)
  const paymentAnalysis = analyzePayments(dispute, rideData);

  if (paymentAnalysis.all_payments_confirmed) {
    confidence += 20;
    factors.push({ factor: 'payments_confirmed', value: 20 });
  } else if (paymentAnalysis.partial_payments) {
    const ratio = paymentAnalysis.paid_amount / paymentAnalysis.expected_amount;
    const points = Math.round(ratio * 20);
    confidence += points;
    factors.push({ factor: 'partial_payments', value: points });
  }

  // 3. Reputation (20 points max)
  const disputingReputation = reputationData[dispute.disputing_party];
  const accusedReputation = reputationData[dispute.accused_party];

  if (disputingReputation > 90) {
    confidence += 10;
    factors.push({ factor: 'high_disputer_reputation', value: 10 });
  } else if (disputingReputation < 50) {
    confidence -= 10;
    factors.push({ factor: 'low_disputer_reputation', value: -10 });
  }

  if (accusedReputation < 50) {
    confidence += 10;
    factors.push({ factor: 'low_accused_reputation', value: 10 });
  } else if (accusedReputation > 90) {
    confidence -= 5;
    factors.push({ factor: 'high_accused_reputation', value: -5 });
  }

  // 4. Dispute History (20 points max)
  const disputeHistory = getDisputeHistory(dispute.accused_party);

  if (disputeHistory.count > 5 && disputeHistory.lost_ratio > 0.6) {
    confidence += 20;
    factors.push({ factor: 'repeated_offender', value: 20 });
  } else if (disputeHistory.count > 3 && disputeHistory.lost_ratio > 0.5) {
    confidence += 10;
    factors.push({ factor: 'multiple_disputes', value: 10 });
  }

  // 5. Timing Evidence (10 points max)
  const timingAnalysis = analyzeTimestamps(dispute, rideData);

  if (timingAnalysis.timestamps_consistent) {
    confidence += 10;
    factors.push({ factor: 'consistent_timestamps', value: 10 });
  }

  // 6. Witness Corroboration (10 points max)
  if (dispute.witness_events && dispute.witness_events.length > 0) {
    const witnessScore = analyzeWitnesses(dispute.witness_events, reputationData);
    confidence += witnessScore;
    factors.push({ factor: 'witness_corroboration', value: witnessScore });
  }

  return {
    confidence: Math.max(0, Math.min(confidence, 100)),
    factors,
    recommendation: getRecommendation(confidence)
  };
}

function getRecommendation(confidence) {
  if (confidence >= 85) {
    return 'auto_resolve_for_disputer';
  } else if (confidence >= 70) {
    return 'likely_for_disputer';
  } else if (confidence >= 50) {
    return 'human_review_required';
  } else if (confidence >= 30) {
    return 'likely_for_accused';
  } else {
    return 'auto_resolve_for_accused';
  }
}
```

**Resolution Thresholds:**

| Confidence Score | Action | Arbitration |
|------------------|--------|-------------|
| **85-100** | Auto-resolve for disputer | None - automated |
| **70-84** | Suggest resolution for disputer | Optional arbiter review |
| **50-69** | **Require human arbiter** | Mandatory web-of-trust |
| **30-49** | Suggest resolution for accused | Optional arbiter review |
| **0-29** | Auto-resolve for accused | None - automated |

**Dispute Resolution Event (Kind 30524)**

After dispute scoring and resolution, operator or arbiter publishes:

```json
{
  "kind": 30524,
  "pubkey": "<operator-or-arbiter-pubkey>",
  "content": "Dispute resolved in favor of rider - GPS evidence conclusive",
  "tags": [
    ["e", "<dispute-event-id>"],
    ["ride_id", "<ride-request-id>"],
    ["resolution", "full_refund|partial_refund|stake_forfeit|no_change"],
    ["winner", "<pubkey>"],
    ["loser", "<pubkey>"],

    // Automated scoring results
    ["confidence_score", "92"],
    ["resolution_method", "automated|arbiter|operator"],
    ["factors", "gps_matches_route,payments_confirmed,high_disputer_reputation"],

    // Financial resolution
    ["rider_receives", "<sats>"],
    ["driver_receives", "<sats>"],
    ["rider_stake_action", "returned|forfeited"],
    ["driver_stake_action", "returned|forfeited"],

    // Arbiter details (if human review)
    ["arbiter", "<arbiter-pubkey>"],
    ["arbiter_fee", "<sats>"],
    ["arbiter_reasoning", "<text>"],

    ["resolved_at", "<unix-timestamp>"]
  ]
}
```

**Example Scenarios:**

**Scenario 1: Clear GPS Evidence (Auto-Resolve)**

```javascript
// Dispute: Driver claimed completion, rider says wrong location
const dispute = {
  type: 'wrong_destination',
  gps_trace: '<url>',
  expected_destination: { lat: 40.7580, lon: -73.9855 },
  actual_dropoff: { lat: 40.7580, lon: -73.9855 }
};

// GPS exactly matches expected destination
// Confidence: 90 (40 GPS + 20 payments + 10 disputer rep + 20 accused history)
// Result: Auto-resolve for accused (driver) - dispute rejected
```

**Scenario 2: Payment Failure + No GPS (Auto-Resolve)**

```javascript
// Dispute: Driver says rider didn't pay
const dispute = {
  type: 'payment_failure',
  expected_payments: 10,
  actual_payments: 0,
  driver_reputation: 95,
  rider_reputation: 30
};

// No payments confirmed, driver has high reputation
// Confidence: 88 (20 payments + 10 driver rep - 10 rider rep + 20 rider history)
// Result: Auto-resolve for disputer (driver) - rider must pay
```

**Scenario 3: Conflicting Evidence (Human Review)**

```javascript
// Dispute: Rider says driver was unsafe
const dispute = {
  type: 'unsafe',
  gps_trace: '<shows speeding>',
  witness_events: [],
  driver_reputation: 85,
  rider_reputation: 80
};

// GPS shows some speeding but both have good reputations
// Confidence: 55 (15 GPS partial + 0 payments + 0 rep diff + 0 history)
// Result: Human arbiter required - subjective safety assessment needed
```

**Implementation Example:**

```javascript
// Operator service automatically scores new disputes
async function handleNewDispute(disputeEvent) {
  // 1. Gather evidence
  const rideData = await getRideData(disputeEvent.tags.find(t => t[0] === 'e')[1]);
  const reputationData = await getReputationData([
    disputeEvent.pubkey,
    disputeEvent.tags.find(t => t[0] === 'p')[1]
  ]);

  // 2. Score dispute
  const scoring = scoreDisputeConfidence(disputeEvent, rideData, reputationData);

  // 3. Take action based on confidence
  if (scoring.confidence >= 85) {
    // Auto-resolve for disputer
    await publishResolution({
      dispute: disputeEvent,
      resolution: 'full_refund',
      winner: disputeEvent.pubkey,
      confidence_score: scoring.confidence,
      method: 'automated'
    });
  } else if (scoring.confidence <= 29) {
    // Auto-resolve for accused
    await publishResolution({
      dispute: disputeEvent,
      resolution: 'no_change',
      winner: disputeEvent.tags.find(t => t[0] === 'p')[1],
      confidence_score: scoring.confidence,
      method: 'automated'
    });
  } else {
    // Escalate to human arbiter
    await escalateToArbiter({
      dispute: disputeEvent,
      confidence_score: scoring.confidence,
      suggested_resolution: scoring.recommendation
    });
  }
}
```

**Benefits of Automated Scoring:**

1. **Scalability**: Resolve 60-70% of disputes automatically
2. **Speed**: Instant resolution for clear-cut cases
3. **Consistency**: Objective criteria applied equally
4. **Cost**: No arbiter fees for simple disputes
5. **Transparency**: Scoring factors published on-chain

**Limitations:**

- Cannot handle subjective disputes (safety, comfort)
- Requires quality GPS data
- May be gamed if criteria become public
- Should always allow appeal to human arbiter

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

### Scheduled Ride (Kind 30556)

For rides scheduled in advance (airport pickups, commutes, etc.).

```json
{
  "kind": 30556,
  "pubkey": "<rider-pubkey>",
  "content": "Airport pickup for Monday morning",
  "tags": [
    ["d", "<scheduled-ride-id>"],
    ["from", "<lat>,<lon>", "<address>"],
    ["to", "<lat>,<lon>", "<address>"],
    ["pickup_time", "<unix-timestamp>"],
    ["pickup_window_start", "<unix-timestamp>"],
    ["pickup_window_end", "<unix-timestamp>"],
    ["price", "<sats>"],
    ["rider_stake", "<higher-stake-sats>"],
    ["requires_driver_stake", "true"],
    ["schedule_weight", "<1-10>"],
    ["recurring", "none|daily|weekly|monthly"],
    ["recurrence_pattern", "<rrule>"],
    ["flexibility", "<minutes>"],
    ["commitment_deadline", "<unix-timestamp>"],

    // Scheduling metadata
    ["advance_hours", "24"],
    ["cancellation_policy", "flexible|moderate|strict"],
    ["driver_selection", "auto|manual"],
    ["preferred_drivers", "<pubkey1>", "<pubkey2>"]
  ]
}
```

**Enhanced Scheduled Ride Features:**

**Pickup Windows:**
- `pickup_window_start` / `pickup_window_end`: Allow riders to specify acceptable pickup time range
- Example: Airport ride between 5:00 AM - 5:30 AM

**Cancellation Policies:**
- `flexible`: Cancel up to 1 hour before with 50% refund
- `moderate`: Cancel up to 6 hours before with 50% refund
- `strict`: Cancel up to 24 hours before with 50% refund

**Recurring Rides:**
- Use iCalendar RRULE format for recurrence patterns
- Example: `FREQ=WEEKLY;BYDAY=MO,WE,FR` for commute rides

**Driver Preferences:**
- `preferred_drivers`: List of driver pubkeys for repeat business
- Drivers get notification priority if they're on preferred list

**Important:** Scheduled rides typically require higher stakes (20-30% for riders, 30-50% for drivers) due to the higher commitment level.

### Carpool / Shared Ride (Kind 30557)

For multiple riders sharing one vehicle to split costs.

```json
{
  "kind": 30557,
  "pubkey": "<organizer-pubkey>",
  "content": "Carpool from Manhattan to Brooklyn - 3 seats available",
  "tags": [
    ["d", "<carpool-id>"],
    ["from", "<lat>,<lon>", "<departure-address>"],
    ["to", "<lat>,<lon>", "<destination-address>"],

    // Carpool specifics
    ["seats_total", "4"],
    ["seats_available", "3"],
    ["riders", "<pubkey1>", "<pubkey2>"],  // Current riders
    ["max_riders", "3"],

    // Pricing
    ["price_per_seat", "500"],  // Base price per seat
    ["split_type", "equal|weighted_by_distance|auction"],
    ["total_price", "1500"],  // For all 3 riders

    // Timing
    ["departure_time", "<unix-timestamp>"],
    ["flexibility", "600"],  // 10 minute flexibility

    // Pickup points (multiple stops for different riders)
    ["pickup_points", "40.7580,-73.9855|40.7489,-73.9680|40.7389,-73.9580"],
    ["pickup_addresses", "Times Square|Park Slope|Prospect Heights"],
    ["dropoff_points", "40.6782,-73.9442|40.6792,-73.9442|40.6802,-73.9442"],

    // Stakes
    ["organizer_stake", "150"],  // 10% of total
    ["rider_stake_per_seat", "50"],  // Each rider stakes 10%
    ["driver_stake", "225"],  // Driver stakes 15% of total

    // Geographic indexing
    ["g", "<geohash-5>"],
    ["g", "<geohash-4>"],
    ["g", "<geohash-3>"],

    // Carpool rules
    ["chat_enabled", "true"],
    ["music_preference", "organizer_choice|democratic_vote"],
    ["stops_allowed", "true"],
    ["max_detour_meters", "2000"]
  ]
}
```

**Carpool Payment Splitting:**

**Equal Split (Default):**
```javascript
// Each rider pays the same amount
const pricePerSeat = totalPrice / numberOfRiders;
// Example: $15 ride ÷ 3 riders = $5 per person
```

**Weighted by Distance:**
```javascript
// Each rider pays proportional to their distance
function calculateWeightedSplit(riders, totalPrice) {
  const totalDistance = riders.reduce((sum, r) => sum + r.distance, 0);

  return riders.map(rider => ({
    pubkey: rider.pubkey,
    amount: Math.round((rider.distance / totalDistance) * totalPrice)
  }));
}

// Example:
// Rider A: 5km / 15km total = 33% = $5
// Rider B: 7km / 15km total = 47% = $7
// Rider C: 3km / 15km total = 20% = $3
```

**Auction (Surge Demand):**
```javascript
// Riders bid for remaining seats
// Highest bidders get seats
// Used for high-demand routes (airport during holidays)
```

**Carpool Coordination Flow:**

1. **Organizer** publishes carpool event (30557)
2. **Riders** publish join requests (30558 - new event)
3. **Organizer** accepts riders up to max capacity
4. **Driver** accepts the carpool
5. **All parties** lock stakes
6. **Driver** picks up riders in sequence
7. **Riders** pay proportionally during ride
8. **Driver** drops off riders at their destinations
9. **All parties** rate the experience

**Carpool Join Request (Kind 30558)**

```json
{
  "kind": 30558,
  "pubkey": "<rider-pubkey>",
  "content": "Request to join carpool",
  "tags": [
    ["e", "<carpool-event-id>"],
    ["p", "<organizer-pubkey>"],
    ["pickup_point", "<lat>,<lon>", "<address>"],
    ["dropoff_point", "<lat>,<lon>", "<address>"],
    ["seats_requested", "1"],
    ["bid_amount", "600"],  // For auction-style carpools
    ["rider_reputation", "95"],
    ["rider_stake", "60"]
  ]
}
```

**Benefits of Carpooling:**
- **Cost Savings**: 60-75% cheaper per person
- **Environmental**: Fewer vehicles on road
- **Social**: Meet new people
- **Efficiency**: Fill empty seats

**Challenges:**
- **Coordination**: Multiple pickup/dropoff points
- **Timing**: One late rider affects everyone
- **Disputes**: More complex with multiple parties
- **Privacy**: Less privacy than solo rides

### Navigation & Routing Events

#### Navigation Route (Kind 30580)

Published when optimal route is calculated for a ride.

```json
{
  "kind": 30580,
  "pubkey": "<driver-pubkey>",
  "content": "Optimal route calculated: 8.2km, 12min via Main St",
  "tags": [
    ["d", "<route-id>"],
    ["e", "<ride-request-id>"],
    ["p", "<rider-pubkey>"],
    ["origin", "<lat>,<lon>"],
    ["destination", "<lat>,<lon>"],
    ["distance", "<meters>"],
    ["duration", "<seconds>"],
    ["provider", "osrm|openrouteservice|graphhopper"],
    ["traffic", "true|false"],
    ["has_tolls", "true|false"],
    ["has_highways", "true|false"],

    // Cost analysis
    ["fuel_cost", "<sats>"],
    ["time_cost", "<sats>"],
    ["total_cost", "<sats>"],
    ["profit_margin", "<percentage>"],
    ["score", "<0-100>"],

    // Route metadata
    ["geometry", "<geojson-or-polyline>"],
    ["waypoints", "<count>"],
    ["instructions_count", "<count>"]
  ]
}
```

**Tag Descriptions:**
- `geometry`: Encoded polyline or GeoJSON LineString of route
- `traffic`: Whether route includes real-time traffic data
- `score`: Overall route quality score (0-100) based on time, cost, and efficiency

#### Navigation Update (Kind 30581)

Published periodically during ride to show driver position and progress.

```json
{
  "kind": 30581,
  "pubkey": "<driver-pubkey>",
  "content": "5.2km remaining, ETA 8 minutes",
  "tags": [
    ["d", "<nav-update-id>"],
    ["e", "<ride-request-id>"],
    ["p", "<rider-pubkey>"],
    ["position", "<lat>,<lon>"],
    ["heading", "<degrees>"],
    ["speed", "<meters-per-second>"],
    ["distance_remaining", "<meters>"],
    ["time_remaining", "<seconds>"],
    ["eta", "<unix-timestamp>"],
    ["progress", "<0-100>"],

    // Current instruction
    ["current_instruction", "Turn right in 200m"],
    ["instruction_distance", "<meters>"],
    ["next_instruction", "Continue on Main St"],

    // Traffic
    ["traffic_delay", "<seconds>"],
    ["congestion_level", "none|light|moderate|heavy|severe"]
  ]
}
```

#### Navigation Instruction (Kind 30582)

Published when driver approaches a turn or maneuver.

```json
{
  "kind": 30582,
  "pubkey": "<driver-pubkey>",
  "content": "Turn right onto Main Street",
  "tags": [
    ["e", "<ride-request-id>"],
    ["instruction_type", "turn|merge|exit|arrive|continue|roundabout"],
    ["modifier", "left|right|sharp_left|sharp_right|slight_left|slight_right"],
    ["street_name", "Main Street"],
    ["distance_to_instruction", "<meters>"],
    ["location", "<lat>,<lon>"],
    ["voice_instruction", "In 200 meters, turn right onto Main Street"],
    ["icon", "turn-right"]
  ]
}
```

**Instruction Types:**
- `turn`: Standard turn at intersection
- `merge`: Merge onto highway
- `exit`: Exit from highway/roundabout
- `arrive`: Arrival at destination
- `continue`: Continue on current road
- `roundabout`: Enter/navigate roundabout

#### Route Reroute (Kind 30583)

Published when route is recalculated due to deviation or traffic.

```json
{
  "kind": 30583,
  "pubkey": "<driver-pubkey>",
  "content": "Rerouting due to traffic - new route saves 3 minutes",
  "tags": [
    ["e", "<ride-request-id>"],
    ["p", "<rider-pubkey>"],
    ["reason", "off_route|traffic|user_request|road_closure"],
    ["old_distance", "<meters>"],
    ["new_distance", "<meters>"],
    ["old_duration", "<seconds>"],
    ["new_duration", "<seconds>"],
    ["time_saved", "<seconds>"],
    ["distance_saved", "<meters>"],
    ["current_position", "<lat>,<lon>"],
    ["new_geometry", "<encoded-polyline>"]
  ]
}
```

**Reroute Reasons:**
- `off_route`: Driver deviated from planned route
- `traffic`: Traffic conditions changed significantly
- `user_request`: Driver/rider requested different route
- `road_closure`: Road closure or accident ahead

#### Traffic Alert (Kind 30584)

Published when significant traffic is detected on route.

```json
{
  "kind": 30584,
  "pubkey": "<navigation-service-pubkey>",
  "content": "Heavy traffic on I-95: 15 minute delay",
  "tags": [
    ["e", "<ride-request-id>"],
    ["p", "<driver-pubkey>"],
    ["severity", "low|moderate|high|critical"],
    ["type", "congestion|accident|road_work|weather|event"],
    ["affected_segment", "<start-lat>,<start-lon>", "<end-lat>,<end-lon>"],
    ["delay", "<seconds>"],
    ["distance_ahead", "<meters>"],
    ["alternative_available", "true|false"],
    ["time_savings_alt", "<seconds>"],
    ["description", "Accident blocking 2 lanes"],
    ["source", "osrm|ors|waze|user_reports"]
  ]
}
```

**Traffic Types:**
- `congestion`: Normal traffic congestion
- `accident`: Vehicle accident blocking lanes
- `road_work`: Construction or maintenance
- `weather`: Weather-related delays (snow, flooding)
- `event`: Special event causing delays (sports, concert)

### Delivery Request (Kind 30565)

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

## Ride History & Reporting

For riders to view past trips and drivers to generate tax reports, clients need efficient ways to query ride history.

### Ride History Query (Kind 30531 - Reputation Query Repurposed)

Query for historical rides for a specific user:

```javascript
// Query all rides for a rider
const riderHistory = await pool.list(relays, [{
  kinds: [30500], // Ride requests
  authors: [riderPubkey],
  limit: 100
}]);

// Query all rides for a driver
const driverHistory = await pool.list(relays, [{
  kinds: [30501], // Ride acceptances
  authors: [driverPubkey],
  limit: 100
}]);

// Query completed rides only
const completedRides = await pool.list(relays, [{
  kinds: [30511], // Ride completions
  '#p': [userPubkey], // Tagged in completion
  since: startTimestamp,
  until: endTimestamp
}]);
```

### Driver Earnings Summary (Kind 30585)

Drivers publish periodic earning summaries for their own record-keeping and tax reporting:

```json
{
  "kind": 30585,
  "pubkey": "<driver-pubkey>",
  "content": "Weekly earnings summary",
  "tags": [
    ["d", "earnings-2025-W10"],
    ["period", "2025-03-03", "2025-03-09"],
    ["period_type", "weekly|monthly|quarterly|yearly"],

    // Earnings breakdown
    ["total_rides", "47"],
    ["completed_rides", "45"],
    ["cancelled_rides", "2"],
    ["total_distance_km", "523.4"],
    ["total_duration_hours", "38.5"],

    // Financial summary (in sats)
    ["gross_earnings", "125000"],
    ["platform_fees", "625"],  // 0.5%
    ["net_earnings", "124375"],
    ["tips_received", "5000"],
    ["penalties_paid", "1200"],
    ["stakes_locked", "18000"],
    ["stakes_released", "18000"],

    // Breakdown by ride type
    ["immediate_rides", "40"],
    ["scheduled_rides", "5"],
    ["carpool_rides", "2"],

    // Average metrics
    ["avg_ride_value", "2660"],
    ["avg_distance_km", "11.1"],
    ["avg_duration_min", "48"],
    ["acceptance_rate", "0.85"],

    // Tax-relevant data
    ["tax_year", "2025"],
    ["tax_quarter", "Q1"],
    ["currency", "BTC"],
    ["fiat_equivalent_usd", "45678.90"],  // At period avg rate

    // Supporting documents
    ["detailed_report", "<url-to-csv>"],
    ["report_hash", "<sha256>"]
  ]
}
```

### Rider Trip Summary (Kind 30586)

Riders can publish trip summaries for expense tracking:

```json
{
  "kind": 30586,
  "pubkey": "<rider-pubkey>",
  "content": "Monthly trip summary",
  "tags": [
    ["d", "trips-2025-03"],
    ["period", "2025-03-01", "2025-03-31"],
    ["period_type", "monthly"],

    // Trip statistics
    ["total_rides", "22"],
    ["total_distance_km", "234.5"],
    ["total_duration_hours", "18.2"],
    ["total_spent_sats", "58000"],
    ["avg_ride_cost_sats", "2636"],

    // Breakdown by category
    ["business_rides", "12"],
    ["business_spent_sats", "32000"],
    ["personal_rides", "10"],
    ["personal_spent_sats", "26000"],

    // Payment breakdown
    ["streaming_payments", "580"],  // Number of micro-payments
    ["tips_given", "2000"],
    ["refunds_received", "500"],

    // Supporting data
    ["detailed_trips", "<url-to-export>"],
    ["export_hash", "<sha256>"]
  ]
}
```

### Tax Reporting Helper Functions

```javascript
// Generate comprehensive tax report for driver
async function generateDriverTaxReport(driverPubkey, taxYear, relays) {
  // 1. Get all completed rides
  const completions = await pool.list(relays, [{
    kinds: [30511],
    authors: [driverPubkey],
    since: Date.UTC(taxYear, 0, 1) / 1000,
    until: Date.UTC(taxYear + 1, 0, 1) / 1000
  }]);

  // 2. Get all payments received
  const payments = await pool.list(relays, [{
    kinds: [30510],
    '#p': [driverPubkey],  // Tagged as recipient
    since: Date.UTC(taxYear, 0, 1) / 1000,
    until: Date.UTC(taxYear + 1, 0, 1) / 1000
  }]);

  // 3. Calculate totals
  let totalGross = 0;
  let totalDistance = 0;
  let ridesByMonth = {};

  completions.forEach(event => {
    const amount = parseInt(event.tags.find(t => t[0] === 'total_paid')?.[1] || 0);
    const distance = parseInt(event.tags.find(t => t[0] === 'total_distance')?.[1] || 0);
    const month = new Date(event.created_at * 1000).getMonth();

    totalGross += amount;
    totalDistance += distance;
    ridesByMonth[month] = (ridesByMonth[month] || 0) + 1;
  });

  // 4. Generate report
  return {
    taxYear,
    totalRides: completions.length,
    totalGrossEarnings: totalGross,
    totalDistanceKm: totalDistance / 1000,
    averagePerRide: totalGross / completions.length,
    monthlyBreakdown: ridesByMonth,
    // IRS Form 1099-K equivalent data
    grossPayments: totalGross,
    deductibleExpenses: calculateExpenses(totalDistance),
    netIncome: totalGross - calculateExpenses(totalDistance)
  };
}

function calculateExpenses(totalMeters) {
  const km = totalMeters / 1000;
  const IRS_MILEAGE_RATE_2025 = 0.67; // USD per mile
  const miles = km * 0.621371;
  return Math.round(miles * IRS_MILEAGE_RATE_2025 * 100); // cents
}

// Generate expense report for rider
async function generateRiderExpenseReport(riderPubkey, period, relays) {
  // Get all rides where user was rider
  const requests = await pool.list(relays, [{
    kinds: [30500],
    authors: [riderPubkey],
    since: period.start,
    until: period.end
  }]);

  const rides = [];

  for (const request of requests) {
    // Get completion for this ride
    const completion = await pool.list(relays, [{
      kinds: [30511],
      '#e': [request.id],
      limit: 1
    }]);

    if (completion.length > 0) {
      const ride = {
        date: new Date(request.created_at * 1000),
        from: request.tags.find(t => t[0] === 'from')?.[2] || 'Unknown',
        to: request.tags.find(t => t[0] === 'to')?.[2] || 'Unknown',
        distance: parseInt(completion[0].tags.find(t => t[0] === 'total_distance')?.[1] || 0) / 1000,
        amount: parseInt(completion[0].tags.find(t => t[0] === 'total_paid')?.[1] || 0),
        rideId: request.id
      };
      rides.push(ride);
    }
  }

  return {
    period,
    totalRides: rides.length,
    totalDistance: rides.reduce((sum, r) => sum + r.distance, 0),
    totalCost: rides.reduce((sum, r) => sum + r.amount, 0),
    rides: rides.sort((a, b) => a.date - b.date)
  };
}
```

### CSV Export Format for Tax Software

Drivers can export data in standard format for tax software:

```csv
Date,Ride ID,Distance (km),Duration (min),Gross Earnings (sats),Platform Fee (sats),Net Earnings (sats),Pickup,Dropoff,Payment Method,Business/Personal
2025-03-01,ride_abc123,12.5,35,3000,15,2985,"123 Main St, NYC","456 Park Ave, NYC",Lightning,Business
2025-03-01,ride_def456,8.2,22,2100,11,2089,"789 Broadway, NYC","321 5th Ave, NYC",Lightning,Business
```

**Export Function:**

```javascript
function exportToCSV(rides) {
  const headers = [
    'Date', 'Ride ID', 'Distance (km)', 'Duration (min)',
    'Gross Earnings (sats)', 'Platform Fee (sats)', 'Net Earnings (sats)',
    'Pickup', 'Dropoff', 'Payment Method', 'Business/Personal'
  ];

  const rows = rides.map(ride => [
    new Date(ride.timestamp * 1000).toISOString().split('T')[0],
    ride.id,
    (ride.distance / 1000).toFixed(1),
    Math.round(ride.duration / 60),
    ride.gross,
    ride.fee,
    ride.net,
    ride.pickup,
    ride.dropoff,
    'Lightning',
    ride.category || 'Business'
  ]);

  return [headers, ...rows].map(row => row.join(',')).join('\n');
}
```

### Operator Tax Reporting API

Operators provide API endpoints for drivers to retrieve complete tax data:

```javascript
// GET /api/v1/drivers/{pubkey}/tax-report
GET /api/v1/drivers/npub1.../tax-report?year=2025

Response:
{
  "year": 2025,
  "driver_pubkey": "npub1...",
  "summary": {
    "total_rides": 523,
    "gross_earnings_sats": 1500000,
    "platform_fees_sats": 7500,
    "net_earnings_sats": 1492500,
    "total_distance_km": 5234.5,
    "total_duration_hours": 412.3
  },
  "monthly_breakdown": [
    {"month": 1, "rides": 42, "earnings": 125000},
    {"month": 2, "rides": 38, "earnings": 110000},
    ...
  ],
  "detailed_rides": "https://operator.com/reports/driver-npub1...-2025.csv",
  "irs_1099k_data": {
    "gross_payment_amount": 1500000,
    "payment_card_transactions": 0,
    "third_party_network_transactions": 523
  }
}
```

### Rider Receipt Generation

Individual ride receipts for expense reimbursement:

```json
{
  "receipt_id": "RIDE_2025_03_15_abc123",
  "date": "2025-03-15T14:30:00Z",
  "rider": "npub1...",
  "driver": "npub1...",
  "pickup": {
    "address": "123 Main St, New York, NY 10001",
    "lat": 40.7580,
    "lon": -73.9855,
    "time": "2025-03-15T14:30:00Z"
  },
  "dropoff": {
    "address": "456 Park Ave, New York, NY 10022",
    "lat": 40.7614,
    "lon": -73.9776,
    "time": "2025-03-15T14:52:00Z"
  },
  "ride_details": {
    "distance_km": 3.2,
    "duration_min": 22,
    "route": "via Park Ave & E 42nd St"
  },
  "charges": {
    "base_fare": 2000,
    "distance_charge": 800,
    "time_charge": 200,
    "tip": 200,
    "subtotal": 3200,
    "platform_fee": 16,
    "total": 3216
  },
  "payment": {
    "method": "Lightning Network",
    "status": "Paid",
    "transaction_ids": ["payment_1", "payment_2", "..."],
    "currency": "BTC",
    "fiat_equivalent": "$12.50 USD"
  },
  "receipt_url": "https://receipts.donkeyride.com/RIDE_2025_03_15_abc123",
  "qr_code": "<base64-encoded-qr-code>"
}
```

### Privacy Considerations for History

- **Retention Period**: Clients SHOULD auto-delete ride location details after 90 days
- **Tax Data Only**: After 90 days, keep only: date, distance, amount (no addresses)
- **Encrypted Backups**: Users can export encrypted history for personal records
- **Operator Guidelines**: Operators SHOULD minimize location data retention based on their jurisdiction's requirements (e.g., GDPR mandates data minimization)

## Privacy Considerations

Privacy and safety exist in tension. This section provides guidance on balancing these competing concerns.

### Privacy Levels & Safety Tradeoffs

| Privacy Level | Rider Safety | Driver Safety | Verification | Efficiency | Recommended Use |
|---------------|--------------|---------------|--------------|------------|-----------------|
| **Obfuscated (500m)** | Medium | Medium | GPS approximate | High | **Default** - Most rides |
| Public Full Address | Medium | High | GPS + Address match | Very High | Airport, scheduled rides |
| Encrypted Until Accept | Low | Low | No pre-verification | Low | High-privacy scenarios |
| Private Relay Only | High | High | Relay verifies GPS | Medium | Trust-minimized |

**Key Tradeoffs:**

- **More Privacy** = Drivers can't pre-verify routes, slower matching, less efficient
- **Less Privacy** = Faster matching, better driver verification, more efficient rides
- **Balance** = Obfuscated location (500m radius) provides good privacy while enabling efficient discovery

### Location Privacy Options

#### 1. Obfuscated Pickup (RECOMMENDED DEFAULT)

Shows general area to drivers, exact address revealed only after acceptance.

```json
{
  "kind": 30500,
  "tags": [
    ["from", "40.7580,-73.9855", "Midtown Manhattan"],  // Approximate center
    ["privacy_level", "obfuscated"],
    ["radius", "500"],  // Actual pickup within 500m radius
    ["g", "dr5ru"],     // Geohash for obfuscated center
    ["g", "dr5r"],
    ["g", "dr5"]
  ]
}
```

**After driver acceptance:**

Driver receives encrypted exact location via NIP-04 direct message:

```json
{
  "kind": 4,
  "pubkey": "<rider-pubkey>",
  "content": "<encrypted: {\"lat\": 40.758, \"lon\": -73.986, \"address\": \"123 W 45th St, NYC\"}>",
  "tags": [
    ["p", "<driver-pubkey>"],
    ["e", "<ride-request-id>"]
  ]
}
```

**Pros:**
- Balances privacy and efficiency
- Prevents address harvesting
- Still enables efficient driver discovery
- Exact location shared only with committed driver

**Cons:**
- Driver can't fully verify route until after acceptance
- Slight inefficiency compared to public addresses

#### 2. Public Full Address

Full address visible to all drivers before acceptance.

```json
{
  "kind": 30500,
  "tags": [
    ["from", "40.7580,-73.9855", "123 W 45th St, Times Square, NYC"],
    ["privacy_level", "public"],
    ["g", "dr5ru7"],  // Precise geohash (precision 6)
    ["g", "dr5ru"],
    ["g", "dr5r"]
  ]
}
```

**Pros:**
- Drivers can pre-verify routes
- Fastest matching
- Best for scheduled/airport rides

**Cons:**
- Home address visible to all drivers
- Enables address harvesting
- Privacy risk for sensitive locations

**Recommended for:**
- Airport pickups
- Commercial locations
- Scheduled rides with advance notice
- High-value rides where efficiency matters

#### 3. Encrypted Until Acceptance

Location encrypted, only decryptable after driver commits.

```json
{
  "kind": 30500,
  "tags": [
    ["from_encrypted", "<nip04-encrypted-location>"],
    ["privacy_level", "encrypted"],
    ["g", "dr5r"],  // Only broad metro-area geohash
    ["radius_hint", "5000"]  // Drivers know it's within 5km of geohash center
  ]
}
```

**Pros:**
- Maximum privacy
- No address harvesting possible
- Good for sensitive locations

**Cons:**
- Drivers can't verify routes
- Much slower matching
- May require higher stakes to compensate risk

**Recommended for:**
- Sensitive locations (home, medical facilities)
- High-privacy users
- Areas where address harvesting is a concern

#### 4. Private Relay (Trust-Minimized)

Operator verifies location without revealing it publicly.

```json
{
  "kind": 30500,
  "tags": [
    ["privacy_level", "relay_verified"],
    ["operator_hint", "wss://operator.example.com"],  // Operator has encrypted location
    ["g", "dr5"],  // Only metro area
    ["verified", "true"]  // Operator attests location is real
  ]
}
```

**Flow:**
1. Rider sends encrypted location to operator
2. Operator verifies location exists (geocoding)
3. Operator publishes ride request with metro-area geohash only
4. Driver accepts blindly or with broad area knowledge
5. Operator reveals exact location to accepted driver

**Pros:**
- Strong privacy from public
- Operator provides verification
- Prevents fake location spam

**Cons:**
- Requires trusting operator with location
- More complex
- Slower matching

### Privacy Recommendations by Use Case

#### Default Rides (90% of cases)
**Use:** Obfuscated (500m radius)
- `privacy_level: "obfuscated"`
- `radius: 500`
- Geohash precision 5

#### High-Value Rides (Airports, Scheduled)
**Use:** Public full address
- `privacy_level: "public"`
- Full address in `from` tag
- Geohash precision 6-7

#### Sensitive Locations (Home, Medical)
**Use:** Encrypted until acceptance
- `privacy_level: "encrypted"`
- `from_encrypted` tag with NIP-04 encryption
- Geohash precision 3-4 only

#### Maximum Privacy (Rare)
**Use:** Private relay + throwaway keys
- `privacy_level: "relay_verified"`
- New Nostr key per ride
- Burner Lightning address
- Cash settlement option

### Payment Privacy

Use Lightning Network for payment privacy:

**Basic Privacy:**
- Use Lightning addresses (not on-chain)
- Route hints to avoid node exposure
- Separate wallet per region

**Advanced Privacy:**
- Blinded paths (BOLT12) when available
- Separate Lightning node per ride (expensive)
- Hodl invoices from disposable nodes

### Identity Privacy

**Basic Approach:**
```javascript
// Most users: Persistent identity with reputation
const riderKey = generateNostrKey(); // Reused for reputation
```

**Privacy-Focused Approach:**
```javascript
// High-privacy users: Throwaway keys per region
const regionKey = deriveKey(masterKey, region); // NY, SF, etc.

// Extreme: New key per ride (no reputation)
const rideKey = generateEphemeralKey();
```

**Tradeoff:**
- Persistent keys build reputation but link ride history
- Throwaway keys provide privacy but start with zero reputation
- Regional keys balance both (reputation per region)

### Implementation Recommendations

**For Client Developers:**

1. **Default to obfuscated (500m)** for best balance
2. **Warn users** when selecting public full address at home
3. **Suggest public address** for airports and commercial locations
4. **Allow per-ride privacy settings** (not just global)

**For Operators:**

1. **Respect privacy_level tag** in all ride events
2. **Never log exact locations** unless required for dispute
3. **Auto-delete location data** 90 days after ride completion
4. **Offer privacy-enhanced mode** (relay verification) for premium

**Security Best Practices:**

- Rotate Nostr keys quarterly
- Use different keys for rider/driver roles
- Never reuse Lightning invoices
- Clear location history regularly

## Driver Shift Management

Drivers need to signal when they are available to accept rides, when they are on breaks, and when they go offline. This enables efficient ride matching, earnings tracking, and labor law compliance.

### Event Kind 30587: Driver Availability Status (Replaceable)

Current driver availability status. This is a **replaceable event** - drivers update this single event to change their status.

```json
{
  "kind": 30587,
  "pubkey": "<driver-pubkey>",
  "content": "Available in Manhattan - accepting rides",
  "tags": [
    ["d", "availability"],  // Fixed identifier for replaceability

    // Status
    ["status", "online|offline|on_ride|on_break|paused"],
    ["status_since", "<unix-timestamp>"],

    // Geographic availability (multiple zones supported)
    ["zone", "40.7580,-73.9855", "5000"],  // lat,lon,radius_meters
    ["zone", "40.7128,-74.0060", "3000"],
    ["g", "dr5ru"],  // Primary geohash
    ["g", "dr5r"],
    ["g", "dr5"],

    // Ride type preferences
    ["accepting", "immediate|scheduled|carpool|all"],
    ["min_ride_value", "300"],  // Minimum sats to accept
    ["max_ride_distance", "50000"],  // Maximum meters willing to drive

    // Current shift info
    ["shift_id", "<current-shift-event-id>"],
    ["shift_start", "<unix-timestamp>"],
    ["shift_duration_hours", "3.5"],

    // Capacity
    ["vehicle_seats", "4"],
    ["available_seats", "4"],
    ["current_ride", "<ride-id>"],  // If on_ride status

    // Auto-timeout (safety feature)
    ["auto_offline_at", "<unix-timestamp>"],  // Auto-offline if not updated
    ["heartbeat_interval", "300"],  // Update every 5 min

    // Operator coordination
    ["operator", "<operator-pubkey>"],
    ["operator_endpoint", "wss://operator.example.com"]
  ]
}
```

**Status Values:**

- **`online`**: Available to accept new rides
- **`offline`**: Not accepting rides, may still have active ride
- **`on_ride`**: Currently driving a passenger
- **`on_break`**: Online but temporarily not accepting rides
- **`paused`**: Temporarily unavailable (bathroom, gas, etc.)

**Auto-Timeout Safety:**

Drivers SHOULD update this event every 5 minutes while online. If `auto_offline_at` passes without update, operators treat driver as offline (prevents accepting rides with unavailable drivers).

### Event Kind 30588: Shift Start/End (Non-Replaceable)

Permanent record of shift boundaries for earnings tracking and labor law compliance.

```json
{
  "kind": 30588,
  "pubkey": "<driver-pubkey>",
  "content": "Starting evening shift",
  "tags": [
    ["shift_action", "start|end"],
    ["shift_id", "<unique-shift-id>"],
    ["timestamp", "<unix-timestamp>"],

    // Location when starting/ending shift
    ["location", "40.7580,-73.9855"],
    ["g", "dr5ru7"],

    // Vehicle info (for multi-vehicle drivers)
    ["vehicle_id", "honda-civic-2020"],
    ["license_plate", "<encrypted-or-hashed>"],

    // Operator
    ["operator", "<operator-pubkey>"],

    // For shift end events only:
    ["shift_duration_seconds", "14400"],  // 4 hours
    ["rides_completed", "12"],
    ["total_distance_meters", "48000"],
    ["gross_earnings_sats", "15000"],
    ["shift_start_event", "<event-id-of-shift-start>"]
  ]
}
```

**Labor Law Compliance:**

Shift tracking enables:
- Maximum shift duration enforcement (prevent exhausted driving)
- Break time tracking (required in many jurisdictions)
- Overtime calculations
- Worker classification compliance (employee vs contractor)

### Event Kind 30589: Break/Pause (Non-Replaceable)

Records breaks during shifts for labor compliance and earnings tracking.

```json
{
  "kind": 30589,
  "pubkey": "<driver-pubkey>",
  "content": "Taking lunch break",
  "tags": [
    ["break_action", "start|end"],
    ["break_id", "<unique-break-id>"],
    ["break_type", "meal|rest|personal|refuel|maintenance"],
    ["timestamp", "<unix-timestamp>"],

    // Associated shift
    ["shift_id", "<current-shift-id>"],
    ["shift_start_event", "<event-id>"],

    // Location
    ["location", "40.7580,-73.9855"],

    // For break end events:
    ["break_duration_seconds", "1800"],  // 30 min
    ["break_start_event", "<event-id-of-break-start>"]
  ]
}
```

**Break Types:**

- **`meal`**: Meal break (often legally required for long shifts)
- **`rest`**: Short rest period
- **`personal`**: Personal necessity
- **`refuel`**: Refueling vehicle
- **`maintenance`**: Vehicle maintenance/cleaning

### Shift State Machine

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  OFFLINE ──(publish shift start)──> ONLINE                  │
│     │                                   │                    │
│     │                                   ├──(accept ride)──> ON_RIDE ──(complete)──┐
│     │                                   │                    │                    │
│     │                                   ├──(start break)──> ON_BREAK ──(end break)┤
│     │                                   │                    │                    │
│     │                                   ├──(pause)────────> PAUSED ──(unpause)────┤
│     │                                   │                    │                    │
│     │                                   └────────────────────┴────────────────────┘
│     │                                   │
│     └───────────(publish shift end)─────┘
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Querying Driver Availability

Operators and riders query for available drivers:

```javascript
// Find online drivers in Manhattan
const availableDrivers = await pool.list(relays, [{
  kinds: [30587],
  '#status': ['online'],
  '#g': ['dr5ru', 'dr5r'],  // Manhattan geohashes
  limit: 50
}]);

// Filter by recency (only drivers updated in last 10 min)
const activeDrivers = availableDrivers.filter(event => {
  const statusSince = event.tags.find(t => t[0] === 'status_since')?.[1];
  return Date.now() / 1000 - parseInt(statusSince) < 600;
});

// Sort by proximity to pickup location
activeDrivers.sort((a, b) => {
  const distA = calculateDistance(pickupLocation, extractLocation(a));
  const distB = calculateDistance(pickupLocation, extractLocation(b));
  return distA - distB;
});
```

### Operator Shift Management API

Operators provide REST API for shift analytics:

```
GET /api/v1/drivers/{pubkey}/shifts

Response:
{
  "current_shift": {
    "shift_id": "shift_abc123",
    "started_at": "2025-10-16T14:30:00Z",
    "duration_hours": 3.5,
    "status": "online",
    "rides_completed": 8,
    "earnings_sats": 12000,
    "distance_km": 42.3
  },
  "shift_history": [
    {
      "shift_id": "shift_xyz789",
      "started_at": "2025-10-15T14:00:00Z",
      "ended_at": "2025-10-15T22:00:00Z",
      "duration_hours": 8.0,
      "rides_completed": 18,
      "earnings_sats": 28000,
      "breaks": [
        {
          "type": "meal",
          "duration_minutes": 30,
          "started_at": "2025-10-15T18:00:00Z"
        }
      ]
    }
  ],
  "weekly_stats": {
    "total_hours": 42.5,
    "total_rides": 94,
    "total_earnings_sats": 145000,
    "avg_hourly_rate_sats": 3412
  }
}
```

### Shift Duration Limits

For safety and labor law compliance, operators SHOULD enforce maximum shift durations:

```json
{
  "kind": 30587,
  "tags": [
    ["status", "online"],
    ["shift_id", "shift_abc123"],
    ["shift_start", "1729087800"],
    ["shift_duration_hours", "11.5"],
    ["max_shift_duration", "12"],  // Operator policy
    ["shift_warning", "approaching_limit"]  // Alert driver
  ]
}
```

**Recommended Limits:**

- **Maximum continuous shift**: 12 hours
- **Mandatory break**: 30 minutes after 6 hours
- **Minimum off time**: 8 hours between shifts
- **Maximum weekly hours**: 60 hours

**Note**: These are example limits. Actual requirements vary by jurisdiction. Operators should consult local labor laws.

### Heartbeat & Auto-Offline

Drivers SHOULD update their availability event every 5 minutes while online to maintain accurate status:

```javascript
// Driver app heartbeat
setInterval(async () => {
  if (driverStatus === 'online' || driverStatus === 'on_ride') {
    const currentLocation = await GPS.getCurrentPosition();

    await publishEvent({
      kind: 30587,
      tags: [
        ['d', 'availability'],
        ['status', driverStatus],
        ['status_since', Math.floor(Date.now() / 1000).toString()],
        ['zone', `${currentLocation.lat},${currentLocation.lon}`, '5000'],
        ['auto_offline_at', (Math.floor(Date.now() / 1000) + 600).toString()],  // 10 min timeout
        // ... other tags
      ]
    });
  }
}, 300000);  // Every 5 minutes
```

**Operator Auto-Offline Logic:**

```javascript
// Operator monitors driver heartbeats
async function checkDriverTimeouts() {
  const onlineDrivers = await pool.list(relays, [{
    kinds: [30587],
    '#status': ['online', 'on_ride', 'paused']
  }]);

  const now = Math.floor(Date.now() / 1000);

  for (const driver of onlineDrivers) {
    const autoOfflineAt = parseInt(driver.tags.find(t => t[0] === 'auto_offline_at')?.[1] || 0);

    if (autoOfflineAt > 0 && now > autoOfflineAt) {
      // Driver missed heartbeat, mark as offline
      await markDriverOffline(driver.pubkey, 'timeout');
      await notifyDriver(driver.pubkey, 'You were marked offline due to inactivity');
    }
  }
}

// Run every minute
setInterval(checkDriverTimeouts, 60000);
```

### Multi-Operator Availability

Drivers can be online with multiple operators simultaneously:

```json
{
  "kind": 30587,
  "tags": [
    ["d", "availability"],
    ["status", "online"],

    // Multiple operator coordination
    ["operator", "<operator1-pubkey>", "wss://op1.example.com"],
    ["operator", "<operator2-pubkey>", "wss://op2.example.com"],
    ["operator", "<operator3-pubkey>", "wss://op3.example.com"],

    // First-accept wins
    ["multi_operator_mode", "first_accept"],

    // Notify all operators when ride accepted
    ["notify_on_accept", "all"]
  ]
}
```

**Flow:**
1. Driver publishes availability with multiple operators listed
2. Ride request comes in via operator 1
3. Driver accepts ride
4. Driver publishes status update: `["status", "on_ride"]`
5. All operators see status change, stop routing requests to this driver
6. After ride completion, driver status returns to `online`

### Privacy & Location Sharing

Drivers control location precision in availability events:

```json
{
  "kind": 30587,
  "tags": [
    // Option 1: Broad geohash only (more privacy)
    ["g", "dr5r"],  // ~20km area
    ["location_precision", "low"],

    // Option 2: Precise location (better matching)
    ["zone", "40.7580,-73.9855", "5000"],
    ["g", "dr5ru7"],  // ~150m area
    ["location_precision", "high"]
  ]
}
```

**Recommendations:**

- **While online (not on ride)**: Low precision acceptable (saves battery, privacy)
- **During active ride**: High precision required (real-time tracking)
- **Between rides**: Low precision until ride accepted

## Surge Pricing & Dynamic Pricing

During periods of high demand or low supply, operators can implement surge pricing to balance the market. This section specifies transparent, decentralized mechanisms for dynamic pricing.

### Event Kind 30590: Surge Zone (Replaceable)

Operators publish surge multipliers for geographic zones.

```json
{
  "kind": 30590,
  "pubkey": "<operator-pubkey>",
  "content": "Surge pricing active in Midtown Manhattan",
  "tags": [
    ["d", "surge-dr5ru"],  // One event per geohash zone

    // Geographic zone
    ["g", "dr5ru"],  // Geohash (precision 5 = ~5km)
    ["zone_name", "Midtown Manhattan"],
    ["zone_center", "40.7580,-73.9855"],
    ["zone_radius", "5000"],  // meters

    // Surge details
    ["surge_multiplier", "1.8"],  // 1.8x normal price
    ["surge_level", "moderate"],  // low|moderate|high|extreme
    ["surge_reason", "high_demand"],  // high_demand|low_supply|event|weather|peak_hours

    // Market data
    ["active_requests", "45"],
    ["available_drivers", "8"],
    ["demand_supply_ratio", "5.6"],

    // Timing
    ["surge_start", "<unix-timestamp>"],
    ["surge_updated", "<unix-timestamp>"],
    ["expected_duration_min", "30"],

    // Pricing bounds
    ["min_multiplier", "1.0"],
    ["max_multiplier", "5.0"],
    ["current_multiplier", "1.8"],

    // Transparency
    ["calculation_method", "demand_supply_ratio"],
    ["formula", "(active_requests / available_drivers) * 0.3 + 1.0"]
  ]
}
```

**Surge Levels:**

| Level | Multiplier | Trigger Condition | Typical Scenario |
|-------|------------|-------------------|------------------|
| **None** | 1.0x | Supply ≥ Demand | Normal operations |
| **Low** | 1.2x - 1.5x | Demand/Supply ratio 1.5-3.0 | Moderate busy |
| **Moderate** | 1.5x - 2.5x | Demand/Supply ratio 3.0-5.0 | Peak hours, events |
| **High** | 2.5x - 4.0x | Demand/Supply ratio 5.0-10.0 | Major events, bad weather |
| **Extreme** | 4.0x - 5.0x | Demand/Supply ratio > 10.0 | Emergency, holidays |

### Event Kind 30591: Demand Signal (Replaceable)

Aggregated demand data for transparency and multi-operator coordination.

```json
{
  "kind": 30591,
  "pubkey": "<operator-pubkey>",
  "content": "Current demand snapshot for Manhattan",
  "tags": [
    ["d", "demand-dr5r"],  // Broader geohash for metro area

    // Geographic area
    ["g", "dr5r"],
    ["region_name", "Manhattan"],

    // Demand metrics
    ["pending_requests", "45"],
    ["requests_last_5min", "18"],
    ["requests_last_15min", "52"],
    ["avg_wait_time_sec", "420"],  // 7 minutes

    // Trends
    ["demand_trend", "increasing|decreasing|stable"],
    ["trend_percentage", "15"],  // 15% increase over last period

    // Timestamp
    ["updated_at", "<unix-timestamp>"],
    ["sample_period_sec", "300"]  // Data aggregated over 5 min
  ]
}
```

### Event Kind 30592: Supply Signal (Replaceable)

Aggregated supply data (available drivers).

```json
{
  "kind": 30592,
  "pubkey": "<operator-pubkey>",
  "content": "Current driver availability in Manhattan",
  "tags": [
    ["d", "supply-dr5r"],

    // Geographic area
    ["g", "dr5r"],
    ["region_name", "Manhattan"],

    // Supply metrics
    ["online_drivers", "8"],
    ["available_drivers", "5"],  // Not on ride
    ["drivers_on_ride", "3"],
    ["avg_response_time_sec", "120"],  // 2 minutes to accept

    // Capacity
    ["total_capacity_seats", "32"],  // 8 drivers * 4 seats avg
    ["available_capacity", "20"],

    // Trends
    ["supply_trend", "increasing|decreasing|stable"],
    ["drivers_coming_online_15min", "3"],

    // Timestamp
    ["updated_at", "<unix-timestamp>"]
  ]
}
```

### Pricing Models

#### 1. Simple Multiplier (Recommended Default)

Transparent formula based on demand/supply ratio:

```javascript
function calculateSurgeMultiplier(activeRequests, availableDrivers) {
  if (availableDrivers === 0) return 5.0;  // Max surge

  const ratio = activeRequests / availableDrivers;

  // Linear scaling with bounds
  let multiplier = 1.0;

  if (ratio < 1.0) {
    multiplier = 1.0;  // No surge when supply exceeds demand
  } else if (ratio < 3.0) {
    multiplier = 1.0 + (ratio - 1.0) * 0.2;  // Gentle increase
  } else if (ratio < 5.0) {
    multiplier = 1.4 + (ratio - 3.0) * 0.3;  // Moderate increase
  } else if (ratio < 10.0) {
    multiplier = 2.0 + (ratio - 5.0) * 0.4;  // Steep increase
  } else {
    multiplier = 5.0;  // Cap at 5x
  }

  return Math.min(5.0, Math.max(1.0, multiplier));
}
```

#### 2. Time-Based Pricing

Different base rates for different times:

```json
{
  "kind": 30500,
  "tags": [
    ["price_model", "time_based"],
    ["base_price_weekday", "1000"],
    ["base_price_weekend", "1200"],
    ["base_price_peak", "1500"],  // 7-9am, 5-7pm
    ["base_price_night", "1800"],  // 11pm-5am

    // Current applicable price
    ["base_price", "1500"],
    ["time_category", "peak"],

    // Plus surge on top
    ["surge_multiplier", "1.5"],
    ["final_price", "2250"]  // 1500 * 1.5
  ]
}
```

#### 3. Auction-Based Pricing

Riders bid for rides during high demand:

```json
{
  "kind": 30500,
  "tags": [
    ["price_model", "auction"],
    ["suggested_price", "2000"],
    ["rider_bid", "2500"],  // Rider willing to pay 2500 sats
    ["bid_type", "sealed|open"],
    ["auction_deadline", "<unix-timestamp>"],  // Bid expires

    // Market info shown to rider
    ["recent_accepted_bids", "2100,2300,2400"],  // Help rider price
    ["avg_winning_bid", "2250"]
  ]
}
```

**Auction Flow:**
1. Rider publishes ride request with bid
2. Multiple drivers see the bid
3. Drivers accept highest bids first
4. Market naturally finds equilibrium

#### 4. Zone-Based Pricing

Different base rates for different geographic zones:

```json
{
  "kind": 30590,
  "tags": [
    ["pricing_model", "zone_based"],

    // Zone pricing tiers
    ["zone_tier", "premium"],  // premium|standard|economy
    ["base_multiplier", "1.3"],  // Airport, downtown = premium

    // Additional surge on top
    ["surge_multiplier", "1.5"],
    ["total_multiplier", "1.95"]  // 1.3 * 1.5
  ]
}
```

### Rider Experience

When surge pricing is active, riders see transparent information:

```
🔥 High demand in your area

Current price: 2,100 sats (1.8x surge)
Normal price: ~1,200 sats

Why surge?
• 45 riders requesting rides
• 8 drivers available
• Average wait time: 7 minutes

Options:
1. ✅ Accept surge price (2,100 sats) - Ride now
2. ⏰ Wait for surge to decrease - Get notified
3. 💰 Bid higher (2,500 sats) - Priority matching
4. 🚶 Walk to lower-demand area
```

### Surge Notifications

Operators can notify riders when surge decreases:

```json
{
  "kind": 4,  // NIP-04 encrypted DM
  "pubkey": "<operator-pubkey>",
  "content": "<encrypted: Surge in Midtown dropped from 1.8x to 1.2x. Your ride would now cost ~1,400 sats>",
  "tags": [
    ["p", "<rider-pubkey>"],
    ["notification_type", "surge_decrease"],
    ["zone", "dr5ru"],
    ["old_multiplier", "1.8"],
    ["new_multiplier", "1.2"]
  ]
}
```

### Multi-Operator Surge Coordination

When multiple operators serve the same area, they can coordinate surge pricing:

```json
{
  "kind": 30505,  // Cross-Operator Coordination
  "pubkey": "<operator1-pubkey>",
  "tags": [
    ["d", "surge-coordination-dr5ru"],
    ["coordination_type", "surge_pricing"],

    // Share market data
    ["our_demand", "45"],
    ["our_supply", "8"],
    ["our_surge", "1.8"],

    // Request others share
    ["requesting_data", "<operator2-pubkey>", "<operator3-pubkey>"],

    // Suggested coordination
    ["suggest_surge_band", "1.5-2.0"],  // Prevent undercutting race to bottom
    ["g", "dr5ru"]
  ]
}
```

**Benefits of coordination:**
- Prevents destructive price wars
- More stable earnings for drivers
- Better rider experience (consistent pricing)
- Fair competition (compete on service, not just price)

### Surge Caps & Consumer Protection

Operators SHOULD implement maximum surge limits:

```json
{
  "kind": 30590,
  "tags": [
    // Caps
    ["max_surge_multiplier", "5.0"],  // Never exceed 5x
    ["max_price_sats", "50000"],  // Absolute price cap

    // Emergency overrides (natural disasters, etc)
    ["emergency_mode", "false"],
    ["emergency_surge_cap", "2.0"],  // Lower cap during emergencies

    // Transparency
    ["surge_policy_url", "https://operator.com/surge-policy"]
  ]
}
```

**Emergency Mode:**

During emergencies (natural disasters, evacuations), operators SHOULD:
1. Lower or eliminate surge pricing
2. Prioritize essential trips (hospital, safety)
3. Coordinate with emergency services
4. Publish emergency mode status

### Anti-Manipulation Measures

Prevent artificial surge inflation:

1. **Minimum Sample Size**: Don't apply surge if < 5 active requests
2. **Time Smoothing**: Average demand over 5-15 minutes (prevent spike manipulation)
3. **Driver Behavior Monitoring**: Detect coordinated driver logoffs to trigger surge
4. **Public Data**: Publish demand/supply numbers for community verification

```javascript
// Example anti-manipulation logic
function calculateSurgeWithProtection(requests, drivers, historicalData) {
  // Require minimum sample size
  if (requests.length < 5) {
    return 1.0;  // No surge for small samples
  }

  // Smooth over time (prevent spike manipulation)
  const avgRequests15min = historicalData.getAverage(15 * 60);
  const avgDrivers15min = historicalData.getDriverAverage(15 * 60);

  // Use smoothed values
  return calculateSurgeMultiplier(avgRequests15min, avgDrivers15min);
}
```

### Transparency & Auditability

All surge pricing MUST be auditable:

```javascript
// Riders can verify surge calculation
async function verifySurgePrice(rideRequest, operator) {
  // Get surge event
  const surgeEvent = await pool.list(relays, [{
    kinds: [30590],
    authors: [operator],
    '#g': [extractGeohash(rideRequest)]
  }]);

  // Get demand/supply signals
  const demand = await pool.list(relays, [{kinds: [30591], authors: [operator]}]);
  const supply = await pool.list(relays, [{kinds: [30592], authors: [operator]}]);

  // Recalculate surge independently
  const calculatedMultiplier = calculateSurgeMultiplier(
    parseInt(demand.tags.find(t => t[0] === 'pending_requests')[1]),
    parseInt(supply.tags.find(t => t[0] === 'available_drivers')[1])
  );

  const publishedMultiplier = parseFloat(surgeEvent.tags.find(t => t[0] === 'surge_multiplier')[1]);

  // Verify operator is honest
  if (Math.abs(calculatedMultiplier - publishedMultiplier) > 0.1) {
    console.warn('Operator surge calculation does not match published data!');
    return false;
  }

  return true;
}
```

### Best Practices

**For Operators:**
1. **Be Transparent**: Publish formula, demand/supply data
2. **Be Consistent**: Don't change pricing model frequently
3. **Communicate**: Warn riders before surge, notify when it decreases
4. **Cap Surge**: Never exceed 5x (or jurisdiction limits)
5. **Emergency Protocol**: Lower surge during crises

**For Riders:**
1. **Verify Calculations**: Use tools to check operator math
2. **Compare Operators**: Check multiple operators for best price
3. **Wait if Possible**: Surge often decreases after 15-30 minutes
4. **Use Scheduled Rides**: Book in advance to avoid surge

**For Drivers:**
1. **Chase Surge**: Go online in high-demand areas
2. **Don't Manipulate**: Don't coordinate logoffs to trigger surge (will be detected)
3. **Be Patient**: Stay online through surge for higher earnings

## Multi-Leg Trips (Multiple Stops)

Many real-world trips require multiple stops (grocery store, friend's house, etc.). This section specifies how to handle rides with waypoints.

### Event Kind 30593: Multi-Leg Trip Request (Replaceable)

A ride request with multiple stops/waypoints.

```json
{
  "kind": 30593,
  "pubkey": "<rider-pubkey>",
  "content": "Pick me up, stop at grocery store, then home",
  "tags": [
    ["d", "<multi-leg-trip-id>"],

    // Trip structure
    ["trip_type", "multi_leg"],
    ["total_legs", "3"],

    // Leg 1: Pickup → Stop 1 (grocery store)
    ["leg", "1", "40.7580,-73.9855", "123 W 45th St, NYC", "pickup"],
    ["leg", "1", "40.7489,-73.9680", "Whole Foods, Brooklyn", "stop"],
    ["leg_duration", "1", "15"],  // Estimated stop duration (minutes)
    ["leg_action", "1", "wait"],  // Driver waits or can leave

    // Leg 2: Stop 1 → Stop 2 (friend's house)
    ["leg", "2", "40.7489,-73.9680", "Whole Foods, Brooklyn", "continue"],
    ["leg", "2", "40.7128,-74.0060", "Friend's apt, Manhattan", "stop"],
    ["leg_duration", "2", "5"],  // Quick pickup
    ["leg_action", "2", "wait"],

    // Leg 3: Stop 2 → Final destination
    ["leg", "3", "40.7128,-74.0060", "Friend's apt, Manhattan", "continue"],
    ["leg", "3", "40.6782,-73.9442", "Home, Brooklyn", "dropoff"],

    // Pricing
    ["price_model", "distance_plus_time"],
    ["base_price_per_km", "50"],  // sats per km
    ["wait_time_price_per_min", "10"],  // sats per minute waiting
    ["estimated_total_distance_km", "12.5"],
    ["estimated_total_time_min", "45"],
    ["estimated_wait_time_min", "20"],  // 15 + 5
    ["estimated_total_price", "1025"],  // (12.5*50) + (20*10) + base

    // Stakes (higher for multi-leg due to complexity)
    ["rider_stake", "200"],
    ["requires_driver_stake", "true"],
    ["driver_stake_suggested", "150"],

    // Constraints
    ["max_detour_per_stop_meters", "2000"],
    ["flexible_order", "false"],  // Stops must be in order
    ["allow_skip_stops", "false"],  // All stops required

    // Geographic indexing (for initial pickup)
    ["g", "dr5ru7"],
    ["g", "dr5ru"],
    ["g", "dr5r"]
  ]
}
```

### Leg Structure

Each leg is defined by:
1. **Leg number**: Sequential identifier
2. **Start location**: Where this leg begins
3. **End location**: Where this leg ends
4. **Leg type**: `pickup`, `stop`, `continue`, `dropoff`
5. **Duration**: Estimated time at this stop (if applicable)
6. **Action**: `wait` (driver waits) or `leave` (rider calls when ready)

### Pricing Models for Multi-Leg Trips

#### 1. Distance + Time + Wait Time

Most common model:

```javascript
function calculateMultiLegPrice(legs) {
  let totalDistance = 0;
  let totalDrivingTime = 0;
  let totalWaitTime = 0;

  legs.forEach(leg => {
    totalDistance += leg.distance_meters / 1000;  // km
    totalDrivingTime += leg.estimated_duration_sec / 60;  // min

    if (leg.action === 'wait') {
      totalWaitTime += leg.stop_duration_min;
    }
  });

  const basePricePerKm = 50;  // sats
  const waitPricePerMin = 10;  // sats
  const basePrice = 200;  // sats

  return basePrice +
         (totalDistance * basePricePerKm) +
         (totalWaitTime * waitPricePerMin);
}
```

#### 2. Flat Rate + Stops

Simple per-stop pricing:

```json
{
  "kind": 30593,
  "tags": [
    ["price_model", "flat_plus_stops"],
    ["base_price", "1000"],
    ["price_per_stop", "300"],
    ["total_stops", "2"],
    ["total_price", "1600"]  // 1000 + (2 * 300)
  ]
}
```

#### 3. Negotiated Price

For complex multi-leg trips, rider and driver negotiate:

```json
{
  "kind": 30593,
  "tags": [
    ["price_model", "negotiated"],
    ["rider_offer", "1500"],
    ["driver_counter", "1800"],
    ["agreed_price", "1650"]
  ]
}
```

### Multi-Leg Acceptance

Driver accepts with route confirmation:

```json
{
  "kind": 30501,  // Ride Acceptance
  "pubkey": "<driver-pubkey>",
  "tags": [
    ["e", "<multi-leg-trip-event-id>"],
    ["p", "<rider-pubkey>"],
    ["d", "<acceptance-id>"],

    // Confirm all legs
    ["confirmed_legs", "3"],
    ["total_distance_km", "12.8"],  // Driver's calculated distance
    ["total_time_min", "48"],  // Driver's estimated time
    ["agreed_price", "1025"],

    // Route optimization
    ["route_optimized", "false"],  // Or true if driver suggests changes
    ["suggested_leg_order", "1,2,3"],  // Same as requested

    // ETA
    ["pickup_eta_sec", "420"]
  ]
}
```

### Stop Actions: Wait vs Leave

#### Wait (Driver Stays)

Driver keeps meter running, waits in/near vehicle:

```json
{
  "kind": 30593,
  "tags": [
    ["leg_action", "1", "wait"],
    ["leg_duration", "1", "15"],  // Max 15 min
    ["wait_price_per_min", "10"],
    ["max_wait_time_min", "30"]  // Driver can cancel after 30 min
  ]
}
```

**During stop:**

```json
{
  "kind": 30512,  // Ride Status Update
  "tags": [
    ["status", "waiting_at_stop"],
    ["current_leg", "1"],
    ["stop_location", "40.7489,-73.9680"],
    ["wait_started", "<unix-timestamp>"],
    ["wait_duration_sec", "180"],  // 3 minutes so far
    ["wait_charge_sats", "30"]  // 3 * 10
  ]
}
```

#### Leave (Driver Departs)

Driver drops rider, rider calls when ready for pickup:

```json
{
  "kind": 30593,
  "tags": [
    ["leg_action", "1", "leave"],
    ["leg_duration", "1", "60"],  // Rider needs 1 hour
    ["callback_method", "nostr_dm"],  // How rider signals ready
    ["max_callback_wait_min", "120"]  // Driver waits up to 2 hours
  ]
}
```

**Rider signals ready:**

```json
{
  "kind": 4,  // NIP-04 DM
  "pubkey": "<rider-pubkey>",
  "content": "<encrypted: I'm ready for pickup at the grocery store>",
  "tags": [
    ["p", "<driver-pubkey>"],
    ["ride_id", "<multi-leg-trip-id>"],
    ["action", "ready_for_pickup"],
    ["leg", "1"],
    ["location", "40.7489,-73.9680"]
  ]
}
```

### Route Optimization

For flexible multi-leg trips, driver can suggest optimal order:

```json
{
  "kind": 30593,
  "tags": [
    ["flexible_order", "true"],  // Rider allows reordering

    // Original order
    ["leg", "1", "40.7580,-73.9855", "Pickup", "pickup"],
    ["leg", "1", "40.7489,-73.9680", "Store A", "stop"],
    ["leg", "2", "40.7489,-73.9680", "Store A", "continue"],
    ["leg", "2", "40.7128,-74.0060", "Store B", "stop"],
    ["leg", "3", "40.7128,-74.0060", "Store B", "continue"],
    ["leg", "3", "40.6782,-73.9442", "Home", "dropoff"],

    // Driver suggests more efficient order
    ["suggested_order", "pickup,Store B,Store A,Home"],
    ["suggested_savings_km", "2.5"],
    ["suggested_savings_sats", "125"]
  ]
}
```

### Stop Tracking Events

Track arrival and departure at each stop:

```json
{
  "kind": 30594,  // Multi-Leg Stop Event (New)
  "pubkey": "<driver-pubkey>",
  "content": "Arrived at grocery store (Stop 1 of 2)",
  "tags": [
    ["ride_id", "<multi-leg-trip-id>"],
    ["leg", "1"],
    ["stop_action", "arrived|departed"],
    ["stop_location", "40.7489,-73.9680"],
    ["timestamp", "<unix-timestamp>"],

    // For arrival
    ["estimated_wait_min", "15"],
    ["wait_price_per_min", "10"],

    // For departure
    ["actual_wait_min", "18"],
    ["wait_charge_sats", "180"],
    ["next_leg", "2"],
    ["next_stop_eta_sec", "720"]
  ]
}
```

### Completion & Payment

At the end of multi-leg trip:

```json
{
  "kind": 30511,  // Ride Completion
  "pubkey": "<driver-pubkey>",
  "tags": [
    ["ride_id", "<multi-leg-trip-id>"],
    ["trip_type", "multi_leg"],
    ["total_legs", "3"],
    ["completed_legs", "3"],

    // Distance & time breakdown
    ["total_distance_meters", "12843"],
    ["total_driving_time_sec", "2520"],  // 42 min
    ["total_wait_time_sec", "1140"],  // 19 min
    ["total_duration_sec", "3660"],  // 61 min total

    // Payment breakdown
    ["base_price", "200"],
    ["distance_charge", "642"],  // 12.843 km * 50
    ["wait_time_charge", "190"],  // 19 min * 10
    ["total_paid", "1032"],

    // Per-leg summary
    ["leg_1_distance", "4200"],
    ["leg_1_duration", "840"],
    ["leg_1_wait", "1080"],  // 18 min
    ["leg_2_distance", "5143"],
    ["leg_2_duration", "1020"],
    ["leg_2_wait", "60"],  // 1 min
    ["leg_3_distance", "3500"],
    ["leg_3_duration", "660"],

    // Final location
    ["final_location", "40.6782,-73.9442"],
    ["completion_time", "<unix-timestamp>"]
  ]
}
```

### Cancellation During Multi-Leg Trip

If rider cancels mid-trip:

```json
{
  "kind": 30521,  // Cancellation
  "pubkey": "<rider-pubkey>",
  "tags": [
    ["ride_id", "<multi-leg-trip-id>"],
    ["cancelled_at_leg", "2"],  // Cancelled during leg 2
    ["completed_legs", "1"],

    // Payment for completed portion
    ["distance_so_far", "4200"],
    ["time_so_far", "1920"],  // 32 min
    ["amount_owed", "630"],

    // Penalty for early cancellation
    ["cancellation_penalty", "200"],
    ["total_payment", "830"],

    ["reason", "change_of_plans"]
  ]
}
```

### Complex Multi-Leg Example: Airport → Hotel → Meeting → Dinner → Home

```json
{
  "kind": 30593,
  "content": "Business trip: Airport to hotel, meeting, dinner, then home",
  "tags": [
    ["d", "business-trip-123"],
    ["trip_type", "multi_leg"],
    ["total_legs", "5"],

    // Leg 1: Airport → Hotel (wait 2 hours - check in)
    ["leg", "1", "40.6413,-73.7781", "JFK Airport", "pickup"],
    ["leg", "1", "40.7580,-73.9855", "Hotel Midtown", "stop"],
    ["leg_duration", "1", "120"],  // 2 hour check-in
    ["leg_action", "1", "leave"],  // Driver leaves, comes back

    // Leg 2: Hotel → Meeting (wait 1 hour)
    ["leg", "2", "40.7580,-73.9855", "Hotel Midtown", "continue"],
    ["leg", "2", "40.7489,-73.9680", "Office Brooklyn", "stop"],
    ["leg_duration", "2", "60"],
    ["leg_action", "2", "leave"],

    // Leg 3: Meeting → Dinner (driver waits)
    ["leg", "3", "40.7489,-73.9680", "Office Brooklyn", "continue"],
    ["leg", "3", "40.7128,-74.0060", "Restaurant", "stop"],
    ["leg_duration", "3", "90"],  // 1.5 hour dinner
    ["leg_action", "3", "wait"],  // Driver waits nearby

    // Leg 4: Dinner → Bar (quick stop)
    ["leg", "4", "40.7128,-74.0060", "Restaurant", "continue"],
    ["leg", "4", "40.7200,-74.0100", "Bar", "stop"],
    ["leg_duration", "4", "30"],
    ["leg_action", "4", "wait"],

    // Leg 5: Bar → Home
    ["leg", "5", "40.7200,-74.0100", "Bar", "continue"],
    ["leg", "5", "40.6782,-73.9442", "Home Brooklyn", "dropoff"],

    // Pricing (high complexity = higher price)
    ["price_model", "negotiated"],
    ["rider_offer", "5000"],  // Complex trip, willing to pay premium
    ["total_distance_km", "48"],
    ["total_time_hours", "8"],

    // Stakes (very high for all-day commitment)
    ["rider_stake", "1000"],
    ["driver_stake_suggested", "750"]
  ]
}
```

### Best Practices

**For Riders:**
1. **Be realistic** with wait times - add buffer
2. **Tip well** for multi-leg trips (more complex for driver)
3. **Communicate** if running late at a stop
4. **Use "leave"** for long stops (>30 min) to free up driver
5. **Consider splitting** very long trips into separate rides

**For Drivers:**
1. **Verify route** before accepting - check total time/distance
2. **Charge appropriately** for wait time
3. **Communicate ETAs** at each stop
4. **Be patient** but enforce max wait times
5. **Suggest optimizations** if rider is flexible

**For Operators:**
1. **Higher matching priority** for multi-leg (complexity premium)
2. **Clear pricing display** showing per-leg breakdown
3. **Smart routing** suggestions for flexible trips
4. **Cancellation protection** for drivers (partial payment)

## Safety & Emergency Features

Rider and driver safety is paramount. This section specifies emergency protocols, real-time safety monitoring, and threat response mechanisms required for production deployment.

### Event Kind 30559: Emergency Alert / Panic Button

**CRITICAL**: Legal requirement in California, New York, and most major markets. Must integrate with emergency services.

```json
{
  "kind": 30559,
  "pubkey": "<rider-or-driver-pubkey>",
  "content": "",  // MUST be empty for privacy
  "tags": [
    ["ride_id", "<active-ride-id>"],
    ["emergency_type", "safety_threat|medical|accident|other"],
    ["location", "40.7580,-73.9855"],
    ["timestamp", "<unix-timestamp>"],
    ["silent_mode", "true|false"],  // True for domestic violence situations

    // Auto-notify emergency contacts
    ["emergency_contact", "<contact1-pubkey>"],
    ["emergency_contact", "<contact2-pubkey>"],

    // Operator/Authority escalation
    ["operator", "<operator-pubkey>"],
    ["escalate_to_911", "false"],  // Operator decides based on type
    ["alert_level", "critical"],  // critical|urgent|warning

    // Evidence
    ["audio_recording_id", "<encrypted-recording-hash>"],  // If enabled
    ["location_history", "<last-10-locations-encrypted>"]
  ]
}
```

**Implementation Requirements:**

1. **Mobile App UI**: Large, accessible panic button visible during all rides
2. **Silent Mode**: Option to alert authorities without alerting driver (domestic violence cases)
3. **Automatic Actions**:
   - Immediately notify emergency contacts via push notification + SMS
   - Alert operator 24/7 safety team
   - Begin continuous GPS tracking (every 1 second)
   - Auto-record audio (if legally permitted and user opted-in)
   - Operator evaluates and calls 911 if needed

**Operator Response Protocol:**

```javascript
async function handleEmergencyAlert(alertEvent) {
  const rideId = alertEvent.tags.find(t => t[0] === 'ride_id')[1];
  const location = alertEvent.tags.find(t => t[0] === 'location')[1];
  const emergencyType = alertEvent.tags.find(t => t[0] === 'emergency_type')[1];

  // 1. Immediately notify emergency contacts
  const contacts = alertEvent.tags.filter(t => t[0] === 'emergency_contact');
  for (const contact of contacts) {
    await sendPushNotification(contact[1], {
      title: "EMERGENCY ALERT",
      body: `Your contact is in an emergency. Last location: ${location}`,
      data: { ride_id: rideId, location }
    });
    await sendSMS(contact[1], `EMERGENCY: Track ride at https://operator.com/emergency/${rideId}`);
  }

  // 2. Activate continuous tracking
  await enableContinuousTracking(rideId, interval_seconds: 1);

  // 3. Alert safety team
  await alertSafetyTeam({
    ride_id: rideId,
    emergency_type: emergencyType,
    location,
    require_immediate_action: true
  });

  // 4. Evaluate 911 escalation
  if (emergencyType === 'safety_threat' || emergencyType === 'medical') {
    await call911({
      location,
      situation: emergencyType,
      ride_id: rideId,
      passenger_phone: await getPhoneNumber(alertEvent.pubkey)
    });
  }
}
```

**Implementation Note:**
Operators in certain jurisdictions may be required to implement emergency features:
- **California AB-5**: Requires panic button for rideshare platforms
- **Response Time**: Some jurisdictions require safety team response within 60 seconds
- **Law Enforcement Cooperation**: Jurisdictions may require operators to provide ride data to authorities

Operators SHOULD consult local regulations. This protocol provides event schemas to support compliance but does not mandate specific implementations.

### Event Kind 30560: Trip Share / Follow My Ride

Allow riders to share live trip status with trusted contacts for safety.

```json
{
  "kind": 30560,
  "pubkey": "<rider-pubkey>",
  "content": "Sharing my ride to the airport with Mom",
  "tags": [
    ["d", "trip-share-<ride-id>"],
    ["ride_id", "<ride-id>"],

    // Trusted contacts (can view live location)
    ["trusted_contact", "<contact1-pubkey>", "<contact1-name>"],
    ["trusted_contact", "<contact2-pubkey>", "<contact2-name>"],
    ["trusted_contact", "<contact3-phone-number>"],  // For non-Nostr users

    // Access control
    ["access_token", "<ephemeral-token>"],  // For WebSocket access
    ["share_expiry", "<unix-timestamp>"],  // Auto-expire after ride + 1 hour
    ["permissions", "location|eta|driver_info|vehicle_info"],

    // Sharing URL for non-Nostr contacts
    ["share_url", "https://operator.com/track/<token>"]
  ]
}
```

**Follow Ride Interface for Contacts:**

```javascript
// Trusted contact connects to ride tracking
const ws = new WebSocket(`wss://operator.com/follow-ride/${access_token}`);

ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  // {
  //   type: "location_update",
  //   ride_id: "...",
  //   current_location: { lat, lon },
  //   eta_seconds: 420,
  //   driver_name: "John",
  //   vehicle: "Silver Honda Civic",
  //   license_plate: "ABC-123",
  //   status: "on_route"
  // }

  displayOnMap(update);
};
```

**Privacy Controls:**
- Rider can revoke access at any time
- Contacts cannot communicate with driver (read-only access)
- Location data expires after ride completion
- Driver is notified that ride is being shared (transparency)

### Event Kind 30561: Safety Check-in Request

Operator-initiated check-in when ride exhibits unusual behavior (RideCheck feature).

```json
{
  "kind": 30561,
  "pubkey": "<operator-pubkey>",
  "content": "Safety check-in: Your ride has been stopped for 3 minutes. Is everything OK?",
  "tags": [
    ["p", "<rider-pubkey>"],
    ["p", "<driver-pubkey>"],
    ["ride_id", "<ride-id>"],

    // Trigger reason
    ["trigger", "unexpected_stop|major_deviation|offline_driver|speed_anomaly"],
    ["trigger_details", "Vehicle stopped for 180 seconds at 40.7580,-73.9855"],

    // Response required
    ["requires_response_within_sec", "120"],  // 2 minutes
    ["escalation_if_no_response", "emergency_contacts_then_911"],

    // Response options
    ["response_options", "all_good|need_help|emergency"]
  ]
}
```

**Automated Triggers:**

```javascript
// Operator monitors all active rides
function monitorRideForAnomalies(ride) {
  const checks = [
    // 1. Unexpected stop
    {
      condition: () => ride.speed === 0 && ride.stopped_duration_sec > 180 && !ride.at_destination,
      trigger: 'unexpected_stop',
      severity: 'moderate'
    },

    // 2. Major route deviation
    {
      condition: () => ride.distance_from_route_meters > 5000,
      trigger: 'major_deviation',
      severity: 'high'
    },

    // 3. Driver goes offline mid-ride
    {
      condition: () => ride.driver_last_heartbeat_sec > 300,
      trigger: 'offline_driver',
      severity: 'critical'
    },

    // 4. Excessive speed
    {
      condition: () => ride.speed_mph > 90,
      trigger: 'speed_anomaly',
      severity: 'high'
    },

    // 5. Ride duration 2x expected
    {
      condition: () => ride.elapsed_sec > ride.estimated_duration_sec * 2,
      trigger: 'excessive_duration',
      severity: 'moderate'
    }
  ];

  for (const check of checks) {
    if (check.condition()) {
      sendSafetyCheckIn(ride, check.trigger, check.severity);
    }
  }
}
```

### Event Kind 30562: Safety Check-in Response

```json
{
  "kind": 30562,
  "pubkey": "<rider-or-driver-pubkey>",
  "content": "Everything is fine, just pulled over to check directions",
  "tags": [
    ["e", "<check-in-request-event-id>"],
    ["ride_id", "<ride-id>"],
    ["response", "all_good|need_help|emergency"],
    ["timestamp", "<unix-timestamp>"]
  ]
}
```

**Escalation Protocol:**

```javascript
async function handleCheckInResponse(request, response, timeout_seconds = 120) {
  const response = await waitForResponse(request, timeout_seconds);

  if (!response) {
    // No response after 2 minutes
    console.warn('No safety check-in response - escalating');
    await notifyEmergencyContacts(request.ride_id);

    // Wait 2 more minutes
    await sleep(120000);

    // Still no response → call 911
    if (!await hasResponded(request)) {
      await call911({
        ride_id: request.ride_id,
        situation: 'Rider not responding to safety check-in',
        last_location: await getLastKnownLocation(request.ride_id)
      });
    }
  } else if (response.response === 'need_help') {
    await alertSafetyTeam({ ride_id: request.ride_id, urgency: 'high' });
  } else if (response.response === 'emergency') {
    await call911Immediately(request.ride_id);
  }
}
```

### Event Kind 30563: Unexpected Stop Detected

Automatic detection event (no user action required).

```json
{
  "kind": 30563,
  "pubkey": "<operator-pubkey>",
  "content": "Ride has been stationary for 3+ minutes",
  "tags": [
    ["ride_id", "<ride-id>"],
    ["location", "40.7580,-73.9855"],
    ["stopped_duration_sec", "180"],
    ["expected_stop", "false"],  // Not at destination or known stop
    ["check_in_initiated", "true"],
    ["timestamp", "<unix-timestamp>"]
  ]
}
```

### Event Kind 30564: Harassment / Threat Report

Allow drivers and riders to report threatening behavior.

```json
{
  "kind": 30564,
  "pubkey": "<reporter-pubkey>",
  "content": "<encrypted-description>",  // Encrypted for privacy
  "tags": [
    ["ride_id", "<ride-id>"],
    ["accused", "<accused-pubkey>"],

    // Report type
    ["report_type", "harassment|threats|intoxication|assault|unsafe_driving|other"],
    ["severity", "low|medium|high|critical"],

    // Evidence
    ["audio_recording", "<encrypted-hash>"],  // If available
    ["witness", "<witness-pubkey>"],

    // Immediate action taken
    ["ride_ended_early", "true"],
    ["police_contacted", "false"],

    // Safety status
    ["reporter_safe", "true"],
    ["timestamp", "<unix-timestamp>"]
  ]
}
```

**Operator Response:**

```javascript
async function handleHarassmentReport(report) {
  const severity = report.tags.find(t => t[0] === 'severity')[1];
  const accused = report.tags.find(t => t[0] === 'accused')[1];

  // Immediate suspension for high/critical severity
  if (severity === 'high' || severity === 'critical') {
    await suspendAccount(accused, reason: 'Safety report pending investigation');
  }

  // Notify safety team
  await alertSafetyTeam({
    report_type: 'harassment',
    severity,
    ride_id: report.ride_id,
    requires_investigation: true
  });

  // Offer support to reporter
  await sendMessage(report.pubkey, {
    title: "Safety Report Received",
    body: "We take your safety seriously. The accused has been suspended pending investigation. Would you like to speak with our safety team?"
  });

  // Critical: Contact police if assault or threats
  if (severity === 'critical') {
    await contactLocalAuthorities(report);
  }
}
```

**Reputation Impact:**
- Confirmed harassment: -50 reputation points + permanent ban
- False reports (malicious): -30 reputation points
- First-time minor issues: Warning + temporary suspension

### Best Practices: Safety Features

**For Operators:**
1. **24/7 Safety Team**: Must have humans monitoring emergencies
2. **Response Time SLA**: <60 seconds for emergency alerts
3. **Law Enforcement Partnerships**: Pre-established contacts with local police
4. **Insurance**: Comprehensive liability coverage for safety incidents
5. **Transparency**: Publish safety incident statistics monthly

**For Riders:**
1. **Always share rides** with trusted contacts for late-night/unfamiliar areas
2. **Verify driver** before entering vehicle (check license plate, driver photo)
3. **Sit in back seat** for easier exit if needed
4. **Don't share personal info** with driver
5. **Trust your instincts** - if uncomfortable, end ride immediately

**For Drivers:**
1. **Verify rider** before starting ride (ask "Who are you picking up?")
2. **Dashboard camera** recommended for evidence
3. **Report immediately** if rider threatens or harasses
4. **End ride** if you feel unsafe - your safety comes first
5. **Don't accept cash** rides (circumvents safety systems)

## Driver & Vehicle Verification

Production ridesharing requires comprehensive verification to ensure safety, legal compliance, and reduce liability. This section specifies required background checks, insurance verification, and vehicle inspections.

### Event Kind 30595: Background Check Result

Published by certified screening providers (Checkr, Onfido, etc.) after completing background checks.

```json
{
  "kind": 30595,
  "pubkey": "<screening-provider-pubkey>",
  "content": "Background check completed for driver",
  "tags": [
    ["d", "bgcheck-<driver-pubkey>"],
    ["p", "<driver-pubkey>"],
    ["operator", "<operator-pubkey>"],

    // Check details
    ["check_date", "<unix-timestamp>"],
    ["expiry_date", "<unix-timestamp>"],  // Typically 1 year
    ["status", "pass|conditional_pass|fail"],

    // Check types completed
    ["check_type", "criminal_history"],
    ["check_type", "dmv_record"],
    ["check_type", "sex_offender_registry"],
    ["check_type", "national_database"],

    // Results summary
    ["felonies", "0"],
    ["misdemeanors", "0"],
    ["driving_violations_3yr", "0"],
    ["dui_history", "false"],
    ["license_suspensions", "0"],

    // Provider certification
    ["provider_name", "Checkr"],
    ["provider_license", "<state-license-number>"],
    ["report_id", "<encrypted-report-id>"],
    ["report_url", "<secure-url-for-review>"]
  ]
}
```

**Disqualifying Offenses (Typical Standards):**
- Violent crimes (felonies or within 7 years)
- Sexual offenses (any time)
- DUI within 7 years
- Reckless driving within 3 years
- More than 3 moving violations in 3 years
- License suspension in past 3 years

**Implementation:**
```javascript
async function verifyDriverEligibility(driverPubkey) {
  const bgCheck = await pool.list(relays, [{
    kinds: [30595],
    '#p': [driverPubkey],
    limit: 1
  }]);

  if (!bgCheck || bgCheck.length === 0) {
    return { eligible: false, reason: 'No background check on file' };
  }

  const check = bgCheck[0];
  const expiryDate = parseInt(check.tags.find(t => t[0] === 'expiry_date')[1]);
  const status = check.tags.find(t => t[0] === 'status')[1];

  if (Date.now() / 1000 > expiryDate) {
    return { eligible: false, reason: 'Background check expired' };
  }

  if (status !== 'pass' && status !== 'conditional_pass') {
    return { eligible: false, reason: 'Failed background check' };
  }

  return { eligible: true };
}
```

### Event Kind 30596: Insurance Verification

Drivers must maintain commercial rideshare insurance. Operators verify and publish proof.

```json
{
  "kind": 30596,
  "pubkey": "<operator-pubkey>",
  "content": "Insurance verified for driver",
  "tags": [
    ["d", "insurance-<driver-pubkey>"],
    ["p", "<driver-pubkey>"],

    // Policy details
    ["policy_number_hash", "<sha256-hash>"],  // Hashed for privacy
    ["provider", "Geico|Progressive|State Farm"],
    ["policy_type", "commercial_rideshare"],
    ["coverage_amount_usd", "1000000"],  // $1M liability minimum

    // Coverage periods
    ["effective_date", "<unix-timestamp>"],
    ["expiry_date", "<unix-timestamp>"],

    // Verification
    ["verified_date", "<unix-timestamp>"],
    ["verification_method", "direct_api|certificate_upload|agent_call"],
    ["verified_by", "<operator-staff-pubkey>"],

    // Vehicle covered
    ["vehicle_vin_hash", "<sha256-hash>"],
    ["vehicle_year", "2020"],
    ["vehicle_make", "Honda"],
    ["vehicle_model", "Civic"]
  ]
}
```

**Coverage Requirements:**
- **Minimum Liability**: $1,000,000 per incident
- **Policy Type**: Commercial rideshare (NOT personal auto)
- **Gap Coverage**: Must cover "app on, ride not accepted" periods
- **Validity**: Must not expire within 30 days

**Operator Verification Flow:**
```javascript
async function verifyInsurance(driverPubkey, policyNumber) {
  // Option 1: Direct API integration with insurance company
  const insuranceData = await insuranceProvider.verify({
    policy_number: policyNumber,
    purpose: 'rideshare'
  });

  if (!insuranceData.valid) {
    throw new Error('Invalid insurance policy');
  }

  if (insuranceData.coverage_amount < 1000000) {
    throw new Error('Insufficient coverage amount');
  }

  if (insuranceData.policy_type !== 'commercial_rideshare') {
    throw new Error('Wrong policy type - must be commercial rideshare');
  }

  // Publish verification event
  await publishEvent({
    kind: 30596,
    tags: [
      ['d', `insurance-${driverPubkey}`],
      ['p', driverPubkey],
      ['policy_number_hash', sha256(policyNumber)],
      ['provider', insuranceData.provider],
      ['coverage_amount_usd', insuranceData.coverage_amount.toString()],
      ['expiry_date', insuranceData.expiry_date.toString()],
      ['verified_date', Math.floor(Date.now() / 1000).toString()]
    ]
  });

  return { verified: true };
}
```

### Event Kind 30597: Vehicle Inspection Certificate

Annual safety inspection required for all vehicles.

```json
{
  "kind": 30597,
  "pubkey": "<inspector-pubkey>",
  "content": "Annual vehicle safety inspection passed",
  "tags": [
    ["d", "inspection-<vin-hash>"],
    ["p", "<driver-pubkey>"],

    // Vehicle identification
    ["vehicle_vin_hash", "<sha256-hash>"],
    ["vehicle_year", "2020"],
    ["vehicle_make", "Honda"],
    ["vehicle_model", "Civic"],
    ["license_plate_hash", "<sha256-hash>"],
    ["vehicle_color", "Silver"],

    // Inspection details
    ["inspection_date", "<unix-timestamp>"],
    ["expiry_date", "<unix-timestamp>"],  // Typically 1 year
    ["inspection_type", "safety|emissions|both"],
    ["inspection_station", "<certified-station-id>"],
    ["inspector_license", "<state-license-number>"],

    // Systems checked (all must pass)
    ["brakes", "pass"],
    ["tires", "pass"],
    ["lights", "pass"],
    ["steering", "pass"],
    ["suspension", "pass"],
    ["exhaust", "pass"],
    ["windows", "pass"],
    ["seatbelts", "pass"],
    ["airbags", "pass"],

    // Additional requirements
    ["odometer_reading", "45230"],
    ["vehicle_age_years", "5"],
    ["meets_operator_standards", "true"]
  ]
}
```

**Operator Vehicle Standards:**
```javascript
const vehicleRequirements = {
  max_age_years: 10,  // No vehicles older than 10 years
  min_seats: 4,  // At least 4 passenger seats
  required_features: [
    'working_ac',
    'bluetooth',
    'backup_camera'  // For premium tier
  ],
  prohibited_damage: [
    'body_damage',
    'interior_tears',
    'strong_odors',
    'check_engine_light'
  ]
};
```

### Event Kind 30598: Driver License Verification

Verify driver has valid license in good standing.

```json
{
  "kind": 30598,
  "pubkey": "<operator-pubkey>",
  "content": "Driver's license verified",
  "tags": [
    ["d", "license-<driver-pubkey>"],
    ["p", "<driver-pubkey>"],

    // License details (hashed for privacy)
    ["license_number_hash", "<sha256-hash>"],
    ["issuing_state", "NY"],
    ["license_class", "D"],  // Standard passenger vehicle
    ["expiry_date", "<unix-timestamp>"],

    // Verification
    ["verified_date", "<unix-timestamp>"],
    ["verification_method", "dmv_api|manual_review"],
    ["photo_verified", "true"],  // Photo matches driver selfie
    ["address_verified", "true"],

    // Driving record
    ["years_licensed", "8"],
    ["violations_3yr", "0"],
    ["accidents_3yr", "0"],
    ["suspensions_ever", "false"],

    // Status
    ["status", "active|suspended|expired|revoked"],
    ["eligible_to_drive", "true"]
  ]
}
```

**Multi-State Verification:**
Operators must verify license in state where driver will operate AND any states driver has lived in past 7 years (to catch out-of-state violations).

### Event Kind 30599: Training Completion Certificate

Drivers must complete onboarding and safety training.

```json
{
  "kind": 30599,
  "pubkey": "<operator-pubkey>",
  "content": "Driver training completed",
  "tags": [
    ["d", "training-<driver-pubkey>-<training-type>"],
    ["p", "<driver-pubkey>"],

    // Training details
    ["training_type", "safety|customer_service|app_usage|defensive_driving"],
    ["completion_date", "<unix-timestamp>"],
    ["duration_minutes", "45"],
    ["score_percentage", "95"],
    ["passing_score", "80"],

    // Certification
    ["certificate_id", "<unique-cert-id>"],
    ["instructor", "<instructor-pubkey>"],
    ["valid_until", "<unix-timestamp>"],  // Some training requires annual renewal

    // Topics covered
    ["topic", "emergency_procedures"],
    ["topic", "harassment_prevention"],
    ["topic", "accessibility_requirements"],
    ["topic", "payment_systems"],
    ["topic", "customer_conflict_resolution"]
  ]
}
```

**Required Training Modules:**
1. **Safety Training** (2 hours) - Emergency procedures, de-escalation, first aid basics
2. **Customer Service** (1 hour) - Professional conduct, communication, conflict resolution
3. **App Usage** (30 min) - How to accept rides, navigate, handle payments
4. **ADA Compliance** (45 min) - Legal requirements for assisting disabled passengers
5. **Local Regulations** (30 min) - City-specific rules, airport procedures

### Verification Dashboard for Operators

```javascript
async function getDriverVerificationStatus(driverPubkey) {
  const [bgCheck, insurance, inspection, license, training] = await Promise.all([
    getLatestEvent(30595, driverPubkey),
    getLatestEvent(30596, driverPubkey),
    getLatestEvent(30597, driverPubkey),
    getLatestEvent(30598, driverPubkey),
    getAllEvents(30599, driverPubkey)  // Multiple training certificates
  ]);

  return {
    background_check: checkExpiry(bgCheck, 365), // Valid 1 year
    insurance: checkExpiry(insurance, 30),  // Warn if expires within 30 days
    vehicle_inspection: checkExpiry(inspection, 365),
    license: checkExpiry(license, 90),  // Check quarterly
    training: {
      safety: findTraining(training, 'safety'),
      customer_service: findTraining(training, 'customer_service'),
      app_usage: findTraining(training, 'app_usage'),
      ada_compliance: findTraining(training, 'accessibility_requirements')
    },
    overall_status: calculateOverallStatus(bgCheck, insurance, inspection, license, training),
    can_drive: allVerificationsValid()
  };
}
```

**Auto-Deactivation:**
If any verification expires or becomes invalid, driver is automatically marked offline and cannot accept new rides until re-verified.

## Financial Features

Beyond the base fare, ridesharing involves tips, wait times, no-shows, and additional charges. This section specifies all financial interactions.

### Event Kind 30513: Tip

Tips are optional rider payments to driver beyond the base fare.

```json
{
  "kind": 30513,
  "pubkey": "<rider-pubkey>",
  "content": "Thanks for the smooth ride!",
  "tags": [
    ["e", "<ride-completion-event-id>"],
    ["p", "<driver-pubkey>"],
    ["ride_id", "<ride-id>"],

    // Tip details
    ["tip_amount_sats", "500"],
    ["tip_percentage", "20"],  // 20% of base fare
    ["base_fare_sats", "2500"],

    // Payment
    ["payment_hash", "<lightning-payment-hash>"],
    ["payment_method", "lightning|balance|other"],
    ["payment_timestamp", "<unix-timestamp>"],

    // Context
    ["tip_trigger", "completion|post_ride|delayed"],
    ["suggested_by_app", "false"]  // Did app suggest this tip amount?
  ]
}
```

**Tipping UI Best Practices:**
```javascript
// Calculate suggested tip amounts
function calculateTipSuggestions(baseFare) {
  return {
    low: Math.round(baseFare * 0.10),    // 10%
    medium: Math.round(baseFare * 0.15), // 15%
    high: Math.round(baseFare * 0.20),   // 20%
    custom: true  // Always allow custom amount
  };
}

// Tip timing options
const tipOptions = {
  immediate: "Tip now",           // Right after ride
  later: "Tip later",             // Within 24 hours
  post_rating: "After rating"     // After rider rates driver
};
```

**Driver Earnings Impact:**
- Tips are 100% driver's (operators MUST NOT take cut of tips)
- Average tip rate: 15-20% of base fare
- Tips often match or exceed base fare in driver earnings
- No tips = driver churn

### Event Kind 30514: Wait Time Charge (At Pickup)

Charge when driver arrives but rider takes >2 minutes to come out.

```json
{
  "kind": 30514,
  "pubkey": "<driver-pubkey>",
  "content": "Wait time charge for pickup delay",
  "tags": [
    ["ride_id", "<ride-id>"],
    ["p", "<rider-pubkey>"],

    // Wait details
    ["arrival_time", "<unix-timestamp>"],
    ["rider_entered_vehicle", "<unix-timestamp>"],
    ["wait_duration_sec", "420"],  // 7 minutes
    ["grace_period_sec", "120"],  // First 2 min free
    ["billable_wait_sec", "300"],  // 5 minutes charged

    // Pricing
    ["wait_rate_per_min_sats", "10"],
    ["total_wait_charge_sats", "50"],  // 5 min * 10 sats

    // Context
    ["pickup_location", "40.7580,-73.9855"],
    ["location_type", "residential|commercial|airport|other"],
    ["notification_sent", "true"],  // Did driver notify rider?
    ["notification_time", "<unix-timestamp>"]
  ]
}
```

**Wait Time Protocol:**
1. Driver arrives at pickup location
2. Marks "I'm here" in app (starts timer)
3. First 2 minutes: free grace period
4. After 2 minutes: $0.50/minute charge begins
5. At 5 minutes: app notifies rider "You'll be charged wait time"
6. At 10 minutes: driver can cancel (rider pays no-show fee)

### Event Kind 30515: No-Show Fee

Rider doesn't show up after driver waits maximum time.

```json
{
  "kind": 30515,
  "pubkey": "<driver-pubkey>",
  "content": "Rider no-show after 8 minute wait",
  "tags": [
    ["ride_id", "<ride-id>"],
    ["p", "<rider-pubkey>"],

    // No-show details
    ["arrival_time", "<unix-timestamp>"],
    ["wait_duration_sec", "480"],  // 8 minutes
    ["max_wait_time_sec", "600"],  // 10 min max
    ["rider_contacted", "true"],  // Did driver call/message?
    ["rider_responded", "false"],

    // Fee
    ["no_show_fee_sats", "1000"],  // ~$5-7 typical
    ["compensates_driver_for", "time|fuel|opportunity_cost"],

    // Location context
    ["pickup_location", "40.7580,-73.9855"],
    ["distance_driven_to_pickup_km", "4.2"],
    ["pickup_time_min", "8"],

    // Dispute prevention
    ["photo_evidence", "<url-to-photo>"],  // Driver photos empty pickup spot
    ["gps_trace", "<encrypted-location-history>"]
  ]
}
```

**No-Show Fee Protocol:**
1. Driver waits 5+ minutes after arrival
2. Driver calls/messages rider (in-app)
3. No response after 8-10 minutes total
4. Driver marks "No-show" and leaves
5. Rider charged no-show fee ($5-10)
6. Driver compensated for time/fuel
7. Rider can dispute within 24 hours

**Preventing Abuse:**
- Driver must be within 50 meters of pickup location
- Driver must wait minimum 5 minutes
- GPS trace proves driver was at correct location
- Photo evidence helps disputes

### Event Kind 30516: Additional Charge (Tolls, Parking, etc.)

Pass-through charges incurred during ride.

```json
{
  "kind": 30516,
  "pubkey": "<driver-pubkey>",
  "content": "Bridge toll incurred during ride",
  "tags": [
    ["ride_id", "<ride-id>"],
    ["p", "<rider-pubkey>"],

    // Charge details
    ["charge_type", "toll|parking|airport_fee|congestion_charge|other"],
    ["amount_sats", "750"],  // ~$4 toll
    ["timestamp", "<unix-timestamp>"],
    ["location", "40.7580,-73.9855"],

    // Evidence
    ["receipt_url", "<encrypted-photo-of-receipt>"],
    ["toll_plaza", "George Washington Bridge"],
    ["direction", "Manhattan to New Jersey"],

    // Approval
    ["pre_approved", "false"],  // Was rider notified before toll?
    ["added_to_fare", "true"],
    ["rider_notified", "true"]
  ]
}
```

**Common Additional Charges:**
- **Tolls**: Bridges, tunnels (common in NYC, SF, Boston)
- **Airport Fees**: Special charges for airport pickups/dropoffs
- **Parking**: If driver must pay to park for pickup (rare, disputed)
- **Congestion Charges**: London-style congestion pricing zones
- **Cleaning Fees**: If rider damages vehicle (vomit, spills)

**Implementation:**
```javascript
// Pre-notify rider of tolls
async function notifyUpcomingToll(rideId, tollInfo) {
  await sendNotification(riderId, {
    title: "Toll Ahead",
    body: `${tollInfo.name} - ${tollInfo.amount_usd} will be added to your fare`,
    type: "toll_notice",
    requires_action: false
  });

  // Rider can request alternate route (no toll)
  // App offers: "Avoid toll? (+8 min, +2 miles)"
}

// Add to final fare
async function addAdditionalCharges(rideId) {
  const additionalCharges = await pool.list(relays, [{
    kinds: [30516],
    '#ride_id': [rideId]
  }]);

  const totalAdditional = additionalCharges.reduce((sum, charge) => {
    return sum + parseInt(charge.tags.find(t => t[0] === 'amount_sats')[1]);
  }, 0);

  return totalAdditional;
}
```

### Round Trip / Wait-and-Return Pricing

Use multi-leg trip structure (Kind 30593) with explicit wait pricing:

```json
{
  "kind": 30593,
  "tags": [
    ["trip_type", "round_trip"],
    ["total_legs", "2"],

    // Leg 1: Outbound
    ["leg", "1", "40.7580,-73.9855", "Home", "pickup"],
    ["leg", "1", "40.7489,-73.9680", "Pharmacy", "stop"],
    ["leg_action", "1", "wait"],
    ["leg_duration", "1", "10"],  // Wait 10 min
    ["wait_price_per_min", "10"],

    // Leg 2: Return
    ["leg", "2", "40.7489,-73.9680", "Pharmacy", "continue"],
    ["leg", "2", "40.7580,-73.9855", "Home", "dropoff"],

    // Pricing
    ["price_model", "round_trip_with_wait"],
    ["base_price", "2000"],
    ["wait_charge", "100"],  // 10 min * 10 sats
    ["total_price", "2100"]
  ]
}
```

## Operational Features

Production ridesharing requires geographic boundaries, specialized facilities (airports), and quality-of-life features for regular users.

### Event Kind 30525: Service Area Definition

Operators define geographic boundaries where they provide service.

```json
{
  "kind": 30525,
  "pubkey": "<operator-pubkey>",
  "content": "NYC Metropolitan Area Service Zone",
  "tags": [
    ["d", "service-area-nyc"],
    ["operator", "<operator-pubkey>"],

    // Geographic definition
    ["geohashes", "dr5r", "dr5u", "dr5v", "dr5x"],  // Manhattan, Brooklyn, Queens
    ["boundary_polygon", "<geojson-polygon>"],  // Precise boundary
    ["active", "true"],

    // Service levels
    ["service_level", "full|limited|premium_only"],
    ["special_zones", "airport|downtown|residential|commercial"],

    // Operational constraints
    ["min_drivers_required", "10"],  // Minimum drivers to operate
    ["surge_enabled", "true"],
    ["flat_rate_zones_enabled", "true"]
  ]
}
```

**Implementation:**
```javascript
async function isLocationInServiceArea(lat, lon, operator) {
  const serviceArea = await pool.list(relays, [{
    kinds: [30525],
    authors: [operator],
    '#active': ['true']
  }]);

  const geohash = encodeGeohash(lat, lon, 4);
  const geohashes = serviceArea[0].tags
    .filter(t => t[0] === 'geohashes')
    .map(t => t[1]);

  return geohashes.some(gh => geohash.startsWith(gh));
}
```

### Event Kind 30526: Airport Queue Management

Airports require special first-in-first-out (FIFO) queuing systems for fairness.

```json
{
  "kind": 30526,
  "pubkey": "<driver-pubkey>",
  "content": "Entered JFK airport queue",
  "tags": [
    ["airport_code", "JFK"],
    ["queue_lot", "A"],  // Physical holding lot
    ["entry_time", "<unix-timestamp>"],
    ["driver", "<driver-pubkey>"],
    ["vehicle", "<vehicle-vin-hash>"],
    ["operator", "<operator-pubkey>"],

    // Queue status
    ["initial_position", "45"],
    ["estimated_wait_min", "90"],
    ["rides_ahead", "44"]
  ]
}
```

**Event Kind 30527: Queue Position Update**

```json
{
  "kind": 30527,
  "pubkey": "<operator-pubkey>",
  "content": "Queue position updated",
  "tags": [
    ["d", "queue-jfk-<driver-pubkey>"],
    ["airport_code", "JFK"],
    ["driver", "<driver-pubkey>"],

    // Current status
    ["queue_position", "23"],
    ["estimated_wait_min", "45"],
    ["rides_ahead", "22"],
    ["updated_at", "<unix-timestamp>"],

    // Actions
    ["can_leave_queue", "true"],  // Driver can leave anytime
    ["forfeits_position_if_leaves", "true"]
  ]
}
```

**Queue Protocol:**
1. Driver enters airport geofence → auto-added to queue
2. Must be in designated holding lot (GPS verified)
3. Position updates every ride dispatch
4. Top of queue → driver gets next ride request
5. Driver has 30 seconds to accept (or skip to back of queue)
6. Leaving queue forfeits position

### Event Kind 30528: Flat Rate Zone

Some routes have fixed pricing regardless of traffic/distance (common for airports).

```json
{
  "kind": 30528,
  "pubkey": "<operator-pubkey>",
  "content": "JFK to Manhattan flat rate",
  "tags": [
    ["d", "flatrate-jfk-manhattan"],
    ["operator", "<operator-pubkey>"],

    // Route definition
    ["origin_zone", "jfk_airport"],
    ["origin_geohash", "dr72"],
    ["destination_zone", "manhattan"],
    ["destination_geohash", "dr5r"],

    // Pricing
    ["flat_rate_sats", "12000"],  // ~$60 typical
    ["includes_tolls", "true"],
    ["excludes_tips", "true"],

    // Conditions
    ["active", "true"],
    ["time_restrictions", "none"],  // Or "peak_only", "off_peak_only"
    ["passenger_limit", "4"]  // If more passengers, different rate
  ]
}
```

### Event Kind 30529: Saved Location

Users save frequent locations for quick ride booking.

```json
{
  "kind": 30529,
  "pubkey": "<user-pubkey>",
  "content": "Home address",
  "tags": [
    ["d", "saved-home"],
    ["nickname", "Home"],
    ["location", "40.7580,-73.9855"],
    ["address", "123 Main St, NYC"],
    ["location_type", "home|work|gym|friend|other"],

    // Privacy
    ["visibility", "private"],  // Never share with public
    ["encrypted", "true"],  // Encrypt lat/lon

    // Usage
    ["use_count", "45"],
    ["last_used", "<unix-timestamp>"]
  ]
}
```

## Edge Case Handling

Real-world rides encounter many edge cases that must be handled gracefully.

### Event Kind 30517: Location Clarification

Driver and rider mismatch on pickup location.

```json
{
  "kind": 30517,
  "pubkey": "<driver-or-rider-pubkey>",
  "content": "Location clarification needed",
  "tags": [
    ["ride_id", "<ride-id>"],
    ["p", "<other-party-pubkey>"],

    // Issue
    ["issue_type", "wrong_address|pin_mismatch|gps_error|ambiguous_location"],
    ["current_location", "40.7580,-73.9855"],
    ["expected_location", "40.7581,-73.9856"],
    ["distance_meters", "150"],

    // Clarification
    ["message", "I'm at 123 Main Street, are you at Main Street or Main Avenue?"],
    ["correct_location", "40.7580,-73.9855"],
    ["photo_url", "<url-to-location-photo>"],

    // Resolution
    ["resolved", "false"],
    ["resolution_time_sec", "0"]
  ]
}
```

**Protocol:**
1. Driver/rider notices mismatch within 5 minutes → no penalty
2. Send location clarification request
3. Other party confirms or corrects
4. If resolved within 5 min → no fees
5. If takes >5 min → wait time charges apply

### Event Kind 30518: Destination Change Request

Rider wants to change destination mid-ride.

```json
{
  "kind": 30518,
  "pubkey": "<rider-pubkey>",
  "content": "Change destination to different location",
  "tags": [
    ["ride_id", "<ride-id>"],
    ["p", "<driver-pubkey>"],

    // Change details
    ["original_destination", "40.7580,-73.9855", "123 Main St"],
    ["new_destination", "40.7489,-73.9680", "456 Elm St"],
    ["reason", "change_of_plans|wrong_address|emergency"],

    // Price adjustment
    ["original_price", "2000"],
    ["new_price", "2500"],
    ["price_adjustment", "+500"],
    ["recalculation_method", "distance|time|negotiated"],

    // Approval
    ["requires_driver_approval", "true"],
    ["driver_can_decline", "true"],
    ["timestamp", "<unix-timestamp>"]
  ]
}
```

**Event Kind 30519: Destination Change Response**

```json
{
  "kind": 30519,
  "pubkey": "<driver-pubkey>",
  "tags": [
    ["e", "<destination-change-request-id>"],
    ["ride_id", "<ride-id>"],
    ["response", "accepted|declined"],
    ["decline_reason", "too_far|end_of_shift|unsafe_area"],
    ["counter_offer_price", "2800"],  // If negotiating
    ["timestamp", "<unix-timestamp>"]
  ]
}
```

### Event Kind 30520: Vehicle Breakdown

Vehicle becomes inoperable during ride.

```json
{
  "kind": 30520,
  "pubkey": "<driver-pubkey>",
  "content": "Vehicle breakdown - flat tire",
  "tags": [
    ["ride_id", "<ride-id>"],
    ["p", "<rider-pubkey>"],

    // Breakdown details
    ["breakdown_type", "flat_tire|engine_failure|electrical|ran_out_of_gas|accident"],
    ["location", "40.7580,-73.9855"],
    ["severity", "minor|major|vehicle_inoperable"],

    // Progress
    ["distance_completed_meters", "2400"],
    ["distance_total_meters", "8000"],
    ["percentage_complete", "30"],

    // Financial settlement
    ["partial_payment_sats", "800"],  // Pay for distance covered
    ["no_penalty", "true"],  // Not driver's fault

    // Resolution
    ["replacement_vehicle", "true"],
    ["replacement_eta_min", "15"],
    ["replacement_driver", "<new-driver-pubkey>"],
    ["rider_can_cancel_no_fee", "true"]
  ]
}
```

### Event Kind 30521: Medical Emergency

Driver or rider has medical emergency during ride.

```json
{
  "kind": 30521,
  "pubkey": "<reporter-pubkey>",
  "content": "",  // Empty for privacy
  "tags": [
    ["ride_id", "<ride-id>"],
    ["emergency_party", "driver|rider"],
    ["emergency_type", "heart_attack|seizure|unconscious|diabetic|injury|breathing"],
    ["location", "40.7580,-73.9855"],

    // Emergency response
    ["911_called", "true"],
    ["911_call_time", "<unix-timestamp>"],
    ["ambulance_dispatched", "true"],
    ["ems_eta_min", "8"],

    // Ride status
    ["ride_terminated", "true"],
    ["vehicle_safe", "true"],  // Pulled over safely
    ["other_party_safe", "true"],

    // Financial
    ["full_stake_refund", "true"],
    ["partial_fare_charged", "false"],
    ["operator_covers_cost", "true"]
  ]
}
```

### Event Kind 30522: Accident Report

Vehicle accident during ride (replaces earlier placeholder).

```json
{
  "kind": 30522,
  "pubkey": "<driver-pubkey>",
  "content": "Accident report - rear-ended at stoplight",
  "tags": [
    ["ride_id", "<ride-id>"],
    ["p", "<rider-pubkey>"],

    // Accident details
    ["accident_type", "collision|pedestrian|property_damage|single_vehicle"],
    ["location", "40.7580,-73.9855"],
    ["timestamp", "<unix-timestamp>"],
    ["severity", "minor|moderate|major|totaled"],

    // Injuries
    ["injuries", "true"],
    ["injured_parties", "rider|driver|other_driver|pedestrian"],
    ["ambulance_called", "true"],

    // Official reports
    ["police_called", "true"],
    ["police_report_number", "NYPD-2025-12345"],
    ["officer_name", "Officer Smith"],
    ["officer_badge", "12345"],

    // Insurance
    ["insurance_notified", "true"],
    ["insurance_claim_id", "<claim-number>"],
    ["insurance_company", "Geico"],

    // Damage assessment
    ["vehicle_damage", "major|minor|totaled"],
    ["vehicle_driveable", "false"],
    ["other_vehicle_damage", "minor"],

    // Liability
    ["fault_determination", "pending|driver|other_party|no_fault|shared"],
    ["driver_at_fault", "false"],

    // Evidence
    ["photos", "<url1>", "<url2>", "<url3>"],
    ["dashcam_footage", "<encrypted-url>"],
    ["witness", "<witness-pubkey>"],

    // Ride resolution
    ["ride_terminated", "true"],
    ["rider_injury_compensation", "pending"],
    ["replacement_ride_arranged", "true"]
  ]
}
```

### Event Kind 30523: Abuse Detection / Rate Limiting

Detect and prevent platform abuse (e.g., fake requests, serial cancellations).

```json
{
  "kind": 30523,
  "pubkey": "<operator-pubkey>",
  "content": "Abuse pattern detected",
  "tags": [
    ["accused", "<user-pubkey>"],
    ["abuse_type", "multiple_cancellations|fake_requests|payment_fraud|location_spoofing"],

    // Pattern details
    ["incident_count", "7"],
    ["time_window_hours", "24"],
    ["pattern_severity", "low|medium|high|critical"],

    // Examples
    ["incidents", "<ride-id-1>", "<ride-id-2>", "<ride-id-3>"],

    // Action taken
    ["action", "warning|cooldown|stake_increase|temporary_suspension|permanent_ban"],
    ["cooldown_duration_hours", "24"],
    ["increased_stake_sats", "5000"],  // From 1000 to 5000
    ["effective_until", "<unix-timestamp>"],

    // Appeal
    ["can_appeal", "true"],
    ["appeal_deadline", "<unix-timestamp>"]
  ]
}
```

**Common Abuse Patterns:**
- **Serial Cancellations**: 5+ cancellations in 24 hours → 24-hour cooldown
- **Fake Requests**: Multiple requests with no intent to ride → stake increase
- **No-Show Pattern**: Repeated no-shows → higher stake requirement
- **Payment Fraud**: Attempting to use invalid payment methods → suspension
- **Location Spoofing**: GPS manipulation → permanent ban

## User Experience Features

Quality-of-life features that improve daily usage and retention.

### Event Kind 30532: Rider Preferences

Persistent rider preferences for consistent experience.

```json
{
  "kind": 30532,
  "pubkey": "<rider-pubkey>",
  "content": "My ride preferences",
  "tags": [
    ["d", "preferences"],

    // Comfort preferences
    ["temperature_preference", "68F|20C"],
    ["temperature_tolerance", "strict|flexible"],
    ["conversation_level", "none|minimal|friendly"],
    ["music_preference", "off|quiet|ok"],

    // Accessibility & health
    ["accessibility_needs", "none|wheelchair|walker|service_animal"],
    ["pet_allergy", "dogs|cats|none"],
    ["fragrance_sensitivity", "high|medium|low"],
    ["motion_sickness", "true"],  // Prefer smooth drivers

    // Vehicle preferences
    ["preferred_vehicle_type", "any|sedan|suv|van"],
    ["minimum_vehicle_rating", "4.5"],

    // Communication
    ["contact_method", "in_app_only|phone_ok|sms_ok"],
    ["language", "en|es|fr|zh"]
  ]
}
```

### Event Kind 30533: Lost Item Report

Rider reports lost item in vehicle.

```json
{
  "kind": 30533,
  "pubkey": "<rider-pubkey>",
  "content": "Lost my iPhone in the back seat",
  "tags": [
    ["ride_id", "<ride-id>"],
    ["p", "<driver-pubkey>"],

    // Item details
    ["item_description", "Black iPhone 13 Pro with blue case"],
    ["location_left", "back_seat_left|back_seat_right|trunk|front_seat"],
    ["value_estimate_sats", "100000"],  // For insurance

    // Contact
    ["contact_method", "nostr_dm|phone|operator"],
    ["urgency", "high|medium|low"],
    ["reward_offered_sats", "5000"],

    // Status
    ["found", "false"],
    ["reported_time", "<unix-timestamp>"]
  ]
}
```

### Event Kind 30534: Item Found Response

Driver confirms finding item.

```json
{
  "kind": 30534,
  "pubkey": "<driver-pubkey>",
  "tags": [
    ["e", "<lost-item-report-id>"],
    ["ride_id", "<ride-id>"],
    ["p", "<rider-pubkey>"],

    // Confirmation
    ["item_found", "true"],
    ["found_location", "back_seat"],
    ["item_description_match", "true"],

    // Return options
    ["return_method", "next_ride|dropoff|mail|operator_pickup"],
    ["return_fee_sats", "1000"],  // Optional delivery fee
    ["available_for_pickup", "<unix-timestamp>"],
    ["dropoff_location", "40.7580,-73.9855"],

    // If mailed
    ["tracking_number", "<usps-tracking>"],
    ["estimated_delivery", "<unix-timestamp>"]
  ]
}
```

### Event Kind 30535: Referral Code

User generates referral code to invite friends.

```json
{
  "kind": 30535,
  "pubkey": "<referrer-pubkey>",
  "content": "Refer a friend and get $10 credit",
  "tags": [
    ["d", "referral-<code>"],
    ["referral_code", "JOHN2025"],
    ["operator", "<operator-pubkey>"],

    // Discount for referee (new user)
    ["referee_discount_type", "percentage|fixed|free_ride"],
    ["referee_discount_sats", "2000"],  // $10 credit

    // Reward for referrer
    ["referrer_reward_sats", "2000"],  // $10 credit
    ["referrer_reward_after", "referee_first_ride"],

    // Limits
    ["max_uses", "unlimited"],
    ["uses_count", "3"],
    ["expiry", "<unix-timestamp>"],

    // Conditions
    ["min_ride_value", "1000"],  // Referee's first ride must be >$5
    ["active", "true"]
  ]
}
```

### Event Kind 30536: Promo Code

Operator-created promotional discounts.

```json
{
  "kind": 30536,
  "pubkey": "<operator-pubkey>",
  "tags": [
    ["d", "promo-SUMMER2025"],
    ["promo_code", "SUMMER2025"],

    // Discount
    ["discount_type", "percentage|fixed|free_ride"],
    ["discount_amount_sats", "1000"],  // $5 off
    ["discount_percentage", "20"],  // Or 20% off

    // Constraints
    ["min_fare_sats", "2000"],  // Minimum $10 ride
    ["max_discount_sats", "5000"],  // Cap at $25 discount
    ["first_ride_only", "false"],
    ["applicable_ride_types", "all|immediate|scheduled|carpool"],

    // Validity
    ["max_uses_per_user", "1"],
    ["max_uses_total", "10000"],
    ["uses_count", "847"],
    ["expiry", "<unix-timestamp>"],
    ["active", "true"]
  ]
}
```

### Event Kind 30537: Split Payment

Multiple riders split the fare.

```json
{
  "kind": 30537,
  "pubkey": "<organizer-pubkey>",
  "content": "Split fare 3 ways",
  "tags": [
    ["ride_id", "<ride-id>"],

    // Payers
    ["payer", "<pubkey1>", "1000", "confirmed"],
    ["payer", "<pubkey2>", "1000", "pending"],
    ["payer", "<pubkey3>", "1000", "confirmed"],

    // Split details
    ["split_type", "equal|custom|percentage"],
    ["total_fare_sats", "3000"],
    ["organizer_pays", "1000"],

    // Status
    ["all_confirmed", "false"],
    ["payment_deadline", "<unix-timestamp>"],  // 15 min to confirm
    ["default_payer", "<organizer-pubkey>"]  // Pays if others don't
  ]
}
```

### Event Kind 30538: Corporate Account

Link employee to company account for business rides.

```json
{
  "kind": 30538,
  "pubkey": "<employee-pubkey>"],
  "tags": [
    ["d", "corp-<employee-id>"],
    ["corporate_account_id", "<company-nostr-pubkey>"],
    ["employee_id", "<company-employee-id>"],
    ["operator", "<operator-pubkey>"],

    // Expense management
    ["expense_category", "client_meeting|commute|business_travel|personal"],
    ["requires_receipt", "true"],
    ["receipt_email", "accounting@company.com"],

    // Limits
    ["daily_limit_sats", "50000"],  // $250/day
    ["monthly_limit_sats", "500000"],  // $2500/month
    ["current_month_spent", "125000"],

    // Restrictions
    ["allowed_hours", "6am-10pm_weekdays"],
    ["allowed_locations", "<geohash1>", "<geohash2>"],  // Office areas
    ["manager_approval_required_over_sats", "20000"],

    // Status
    ["active", "true"],
    ["activated_date", "<unix-timestamp>"]
  ]
}
```

### Event Kind 30539: Driver Destination Filter

Driver sets destination filter (end of shift, heading home).

```json
{
  "kind": 30539,
  "pubkey": "<driver-pubkey>",
  "tags": [
    ["d", "destination-filter"],

    // Destination area
    ["destination_geohash", "dr5r"],  // Brooklyn
    ["destination_radius_km", "5"],
    ["destination_address_hint", "Near Brooklyn Heights"],

    // Filter settings
    ["active", "true"],
    ["reason", "end_of_shift|returning_home|prefer_area"],
    ["strict", "false"],  // True = only rides to that area

    // Timing
    ["activated_at", "<unix-timestamp>"],
    ["expires_at", "<unix-timestamp>"],  // Auto-disable after 2 hours
    ["auto_disable_on_accept", "true"]
  ]
}
```

## Compliance & Legal Events (Optional)

This section defines event schemas that MAY be used by operators to support compliance with various legal requirements. Implementation of these events is OPTIONAL and depends on the operator's jurisdiction and business model.

Common regulatory areas that may require compliance:
- Age restrictions (prevent unaccompanied minors)
- Accessibility laws (ADA in US, similar laws globally)
- Driver fatigue regulations
- Data privacy laws (GDPR, CCPA, etc.)

See **Appendix A: Regulatory Guidance** for jurisdiction-specific information (non-normative).

### Event Kind 30541: Age Verification

This event MAY be used by operators to verify user age and prevent unaccompanied minors from using rideshare services.

```json
{
  "kind": 30541,
  "pubkey": "<operator-pubkey>",
  "content": "Age verification completed",
  "tags": [
    ["d", "age-verification-<user-pubkey>"],
    ["p", "<user-pubkey>"],

    // Verification result
    ["age_verified", "true"],
    ["age_category", "18+|13-17_with_guardian|minor_unaccompanied"],
    ["date_of_birth_verified", "true"],  // DOB confirmed, not stored

    // Verification method
    ["verification_method", "id_scan|credit_card|oauth|manual_review"],
    ["verified_date", "<unix-timestamp>"],
    ["verified_by", "<operator-or-service-pubkey>"],
    ["verification_service", "Onfido|Jumio|Stripe_Identity"],

    // Validity
    ["expiry_date", "<unix-timestamp>"],  // Re-verify annually
    ["status", "verified|expired|pending|rejected"]
  ]
}
```

**Age Requirements (Typical):**
- **18+**: Can ride alone
- **13-17**: Must have parent/guardian account linked (parental consent)
- **<13**: Cannot use service

**Verification Methods:**
1. **ID Scan**: Driver's license, passport (verify DOB without storing)
2. **Credit Card**: Credit card on file = 18+ (not foolproof)
3. **OAuth**: Login with verified services (Google, Facebook with age gate)
4. **Manual Review**: Operator staff reviews uploaded ID

### Event Kind 30542: Wheelchair Accessible Vehicle Certification

ADA compliance requires accessible vehicles and proper driver training.

```json
{
  "kind": 30542,
  "pubkey": "<operator-pubkey>",
  "content": "Wheelchair accessible vehicle certified",
  "tags": [
    ["d", "wheelchair-cert-<vehicle-vin-hash>"],
    ["p", "<driver-pubkey>"],
    ["vehicle_vin_hash", "<sha256-hash>"],

    // Accessibility features
    ["accessibility_type", "ramp|lift|space_only"],
    ["max_wheelchair_weight_lbs", "300"],
    ["wheelchair_tie_downs", "4_point"],
    ["can_accommodate", "manual_wheelchair|power_wheelchair|scooter"],

    // Certification
    ["certification_date", "<unix-timestamp>"],
    ["certified_by", "<inspector-pubkey>"],
    ["certification_agency", "<state-agency>"],
    ["ada_compliant", "true"],
    ["expiry_date", "<unix-timestamp>"],  // Annual re-certification

    // Driver training
    ["driver_ada_trained", "true"],
    ["driver_training_date", "<unix-timestamp>"],
    ["driver_training_cert", "<cert-id>"],

    // Equipment checks
    ["ramp_functional", "true"],
    ["lift_functional", "true"],
    ["tie_downs_functional", "true"],
    ["last_inspection", "<unix-timestamp>"]
  ]
}
```

**Implementation Note (ADA Compliance):**

In jurisdictions with accessibility laws (e.g., ADA in US), operators may be required to:
- Provide wheelchair-accessible vehicles (minimum % varies by jurisdiction)
- Not charge additional fees for accessible vehicles
- Not refuse wheelchair requests (may constitute illegal discrimination)
- Match response times for accessible requests

Operators implementing wheelchair accessibility SHOULD:
- Track vehicle accessibility certification (kind 30542)
- Monitor request fulfillment rates
- Implement reputation penalties for refusals (if legally appropriate)

Consult local accessibility laws for specific requirements.

### Event Kind 30543: Driver Fatigue Limit Warning

Prevent exhausted driving by enforcing maximum consecutive hours.

```json
{
  "kind": 30543,
  "pubkey": "<operator-pubkey>",
  "content": "Driver approaching maximum shift duration",
  "tags": [
    ["p", "<driver-pubkey>"],
    ["shift_id", "<current-shift-id>"],

    // Fatigue tracking
    ["consecutive_hours_driven", "10.5"],
    ["max_hours_allowed", "12"],
    ["hours_remaining", "1.5"],

    // Warning level
    ["warning_level", "caution|critical|max_reached"],
    ["mandatory_offline_in_minutes", "90"],

    // Rest requirements
    ["mandatory_rest_hours", "8"],
    ["can_resume_driving_at", "<unix-timestamp>"],

    // Override (emergency only)
    ["emergency_override_possible", "false"],
    ["override_requires_approval", "true"]
  ]
}
```

**Fatigue Limits (Safety Regulations):**
- **Maximum consecutive hours**: 12 hours
- **Mandatory break**: 30 minutes after 6 hours
- **Minimum rest period**: 8 hours between shifts
- **Maximum weekly hours**: 60 hours (prevent chronic fatigue)

**Enforcement:**
```javascript
async function enforceDriverFatigueLimit(driverPubkey) {
  const currentShift = await getCurrentShift(driverPubkey);
  const shiftDuration = (Date.now() / 1000) - currentShift.start_time;
  const hoursWorked = shiftDuration / 3600;

  if (hoursWorked >= 11) {
    await sendFatigueWarning(driverPubkey, 'critical');
  }

  if (hoursWorked >= 12) {
    // Force offline
    await markDriverOffline(driverPubkey, reason: 'fatigue_limit_reached');
    await publishEvent({
      kind: 30543,
      tags: [
        ['p', driverPubkey],
        ['warning_level', 'max_reached'],
        ['mandatory_rest_hours', '8'],
        ['can_resume_driving_at', (Date.now() / 1000 + 28800).toString()]
      ]
    });

    // Cannot go back online for 8 hours
    await setDriverCooldown(driverPubkey, 8 * 3600);
  }
}
```

### Data Retention & Privacy Compliance

**Note**: Operators in jurisdictions with data protection laws (GDPR, CCPA, etc.) should implement appropriate data retention and user rights. This section provides example schemas and retention periods but does not constitute legal advice.

For detailed regulatory guidance, see **Appendix A: Regulatory Guidance** (non-normative).

#### Example Data Types & Retention Periods

| Data Type | Retention Period | Legal Basis | Can User Delete? |
|-----------|-----------------|-------------|------------------|
| **Location Data (precise)** | 90 days | Business necessity | Yes |
| **Location Data (aggregated)** | 7 years | Analytics | No |
| **Payment Records** | 7 years | Tax law | No |
| **Dispute Records** | Statute of limitations + 1 year | Legal defense | No |
| **Background Checks** | Employment + 3 years | Compliance | No |
| **Insurance Records** | 7 years | Compliance | No |
| **Accident Reports** | 10 years | Insurance/legal | No |
| **User Profiles** | Until deletion + 30 days | Account management | Yes |
| **Chat Messages** | 90 days | Safety | Yes |
| **Photos (in-app)** | 90 days | Safety | Yes |

#### Example Implementation: Data Subject Rights (GDPR/CCPA)

For operators in GDPR/CCPA jurisdictions, example API endpoints to support user rights:

**1. Right to Access**
Users MAY request all their data:
```
GET /api/v1/users/{pubkey}/data-export

Returns: ZIP file with JSON containing:
- All ride history
- All payments
- All disputes
- All messages
- All preferences
```

**2. Right to Deletion ("Right to be Forgotten")**
```
DELETE /api/v1/users/{pubkey}

Deletes:
- Location history (after 90 days)
- Messages
- Preferences
- Profile data

Retains (legal requirement):
- Payment records (7 years)
- Tax data (7 years)
- Dispute records (legal requirement)
- Accident reports (legal requirement)
```

**3. Right to Rectification**
Users can correct inaccurate data:
```
PATCH /api/v1/users/{pubkey}/profile
{
  "name": "Corrected Name",
  "email": "new@email.com"
}
```

**4. Right to Portability**
Data export in machine-readable format (JSON, CSV)

#### Breach Notification

**If data breach occurs:**
1. **Internal detection**: Within 1 hour
2. **User notification**: Within 72 hours
3. **Authority notification**: Within 72 hours (GDPR) or varies (CCPA)
4. **Public disclosure**: If >500 users affected (CCPA)

**Breach Notification Template:**
```
Subject: Important Security Notice - Data Breach

Dear [User],

We are writing to inform you of a data security incident that may have affected your personal information.

What happened:
[Brief description of breach]

What information was involved:
[Types of data: location, payment, profile, etc.]

What we are doing:
[Remediation steps]

What you can do:
[Recommended actions]

Contact:
security@operator.com
```

#### Data Minimization

**Only collect what's necessary:**
- ❌ Don't store full ride GPS traces forever
- ✅ Store aggregated/anonymized data for analytics
- ❌ Don't store full credit card numbers
- ✅ Store last 4 digits + tokenized payment method
- ❌ Don't store exact home addresses on public relays
- ✅ Use geohash approximations or encrypt sensitive locations

## Privacy & Nostr Considerations

**CRITICAL PRIVACY ISSUE**: Nostr relay data is public and permanent. Most ride data MUST NOT be published to public relays.

### What SHOULD be on Public Nostr Relays

✅ **Safe for Public Relays:**
1. **Operator Bonds** (Kind 30540) - Transparency
2. **Reputation Scores** (aggregated) - Web of trust
3. **Service Area Definitions** (Kind 30525) - Discovery
4. **Flat Rate Zones** (Kind 30528) - Pricing transparency
5. **Surge Pricing Signals** (Kinds 30590-30592) - Market transparency
6. **Background Check Status** (pass/fail only, not details)
7. **Insurance Status** (valid/expired, not policy details)
8. **Training Certifications** (completed/not, not content)

### What MUST NOT be on Public Nostr Relays

❌ **NEVER publish to public relays:**
1. **Exact Location Data** - Home addresses, work locations, GPS traces
2. **Real Names** - Use pseudonyms or public keys only
3. **Phone Numbers** - Privacy risk
4. **Payment Details** - Lightning invoices, payment hashes
5. **Ride History** - Complete movement patterns
6. **Personal Identifiers** - Driver's license numbers, SSN, passport
7. **Medical Information** - Emergency medical data
8. **Full Addresses** - Only geohash approximations
9. **License Plate Numbers** - Hashed only
10. **VIN Numbers** - Hashed only

### Architecture: Public Relays vs Private Operator Storage

```
┌─────────────────────────────────────────────────────────────┐
│                    PUBLIC NOSTR RELAYS                      │
│  (Anyone can read, data is permanent)                       │
├─────────────────────────────────────────────────────────────┤
│  • Operator bonds & reputation                              │
│  • Service areas & pricing zones                            │
│  • Surge pricing signals                                    │
│  • Driver availability (obfuscated location)                │
│  • Ride requests (obfuscated pickup, encrypted details)     │
│  • Aggregated statistics                                    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  PRIVATE OPERATOR DATABASE                  │
│  (Operator controls access, can delete per GDPR)            │
├─────────────────────────────────────────────────────────────┤
│  • Exact GPS traces                                         │
│  • Full names, addresses, phone numbers                     │
│  • Payment details                                          │
│  • Background check details                                 │
│  • Ride history                                             │
│  • Chat messages                                            │
│  • Photos (safety, lost & found)                            │
│  • Medical information (if any)                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│               ENCRYPTED DIRECT MESSAGES (NIP-04)            │
│  (Encrypted end-to-end between parties)                     │
├─────────────────────────────────────────────────────────────┤
│  • Exact pickup address (after match)                       │
│  • Phone numbers (for calling)                              │
│  • In-ride communication                                    │
│  • Lost & found details                                     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│            WEBSOCKET (Ephemeral, Not Stored)                │
│  (Real-time only, not persisted)                            │
├─────────────────────────────────────────────────────────────┤
│  • Live location updates during ride                        │
│  • Live ETA updates                                         │
│  • Turn-by-turn navigation                                  │
└─────────────────────────────────────────────────────────────┘
```

### Privacy-Preserving Patterns

#### 1. Obfuscated Locations

**Instead of exact coordinates:**
```json
{
  "kind": 30500,
  "tags": [
    ["from", "40.7580,-73.9855", "Midtown Manhattan"],  // 500m radius
    ["privacy_level", "obfuscated"],
    ["radius", "500"]
  ]
}
```

**After driver accepts, send exact location via encrypted DM:**
```json
{
  "kind": 4,  // NIP-04 encrypted DM
  "pubkey": "<rider-pubkey>",
  "content": "<encrypted: {lat: 40.758123, lon: -73.985456, address: '123 W 45th St'}>",
  "tags": [["p", "<driver-pubkey>"]]
}
```

#### 2. Hashed Identifiers

**Never publish plaintext:**
```json
{
  "tags": [
    ["license_plate_hash", "a7b3c..."],  // SHA-256 hash
    ["vin_hash", "8e3f1..."],
    ["policy_number_hash", "9d2c5..."]
  ]
}
```

#### 3. Aggregated Statistics Only

**Instead of individual rides:**
```json
{
  "kind": 30585,  // Driver Earnings Summary
  "tags": [
    ["total_rides", "47"],  // ✅ Aggregated count
    ["total_earnings", "125000"],  // ✅ Aggregated amount
    // ❌ No individual ride details
    // ❌ No specific locations
    // ❌ No rider identities
  ]
}
```

#### 4. Time-Limited Data

**Auto-delete after period:**
```javascript
// Ride request expires after 15 minutes
{
  "kind": 30500,
  "tags": [
    ["expiry", (Date.now() / 1000 + 900).toString()],  // 15 min
    ["auto_delete", "true"]
  ]
}

// Clients SHOULD ignore events past expiry
// Relays MAY delete expired events (but can't be enforced)
```

#### 5. Encrypted Everything Sensitive

**Use NIP-04 for all PII:**
```javascript
import { nip04 } from 'nostr-tools';

const encryptedAddress = await nip04.encrypt(
  senderPrivkey,
  recipientPubkey,
  JSON.stringify({
    address: "123 Main St, NYC",
    apartment: "4B",
    instructions: "Call when you arrive"
  })
);
```

### Privacy Best Practices

**For Riders:**
1. **Use pseudonyms**: Don't put real name in Nostr profile
2. **Obfuscate home**: Always use obfuscated pickup for home
3. **Separate keys**: Different Nostr keys for rideshare vs social
4. **Review permissions**: Regularly audit what apps can access
5. **Delete old rides**: Request data deletion after 90 days

**For Drivers:**
1. **Separate identities**: Rideshare key ≠ personal Nostr key
2. **Minimize exposure**: Don't publish personal info to public relays
3. **Use operator database**: Store sensitive data with operator, not relays
4. **Dashboard cam**: Protect yourself but respect rider privacy
5. **Delete after trips**: Don't keep rider data longer than necessary

**For Operators:**
1. **Data minimization**: Only collect what's legally required
2. **Encryption at rest**: All PII encrypted in database
3. **Access controls**: Strict limits on who can access rider/driver data
4. **Audit logs**: Log all data access for compliance
5. **Regular purges**: Auto-delete location data after 90 days
6. **GDPR compliance**: Honor deletion requests within 30 days
7. **Breach response plan**: Incident response within 1 hour

### Privacy Tradeoffs

| Feature | Privacy-Preserving Option | Privacy-Reducing Option | Tradeoff |
|---------|--------------------------|------------------------|----------|
| **Driver Discovery** | Broad geohash only (dr5r = ~20km) | Precise location (dr5ru7 = ~150m) | Efficiency vs exposure |
| **Pickup Location** | Obfuscated (500m radius) | Exact address | Speed vs home address exposure |
| **Ride History** | Operator database only | Public relay events | Portability vs privacy |
| **Payments** | Encrypted invoices | Public payment hashes | Auditability vs financial privacy |
| **Reputation** | Aggregated scores | Detailed review history | Transparency vs attack surface |
| **Service Discovery** | Operator registry | Public Nostr relay | Decentralization vs metadata exposure |

### Regulatory Compliance Summary

| Jurisdiction | Key Requirements | Compliance Actions |
|--------------|------------------|-------------------|
| **California (CPRA)** | Right to deletion, breach notification, no selling data | GDPR-level compliance, 72hr breach notice |
| **EU (GDPR)** | Right to be forgotten, data minimization, consent | Full compliance required for EU users |
| **UK (UK GDPR)** | Similar to EU GDPR | Same as EU |
| **New York (SHIELD Act)** | Data security safeguards | Encryption, access controls |
| **Federal (US)** | No federal privacy law yet | Follow strictest state law (CA) |

## Real-Time Communication

While Nostr events provide the foundation for ride coordination, **real-time updates during active rides** require lower latency than polling Nostr relays every few seconds. This section specifies direct WebSocket connections for latency-sensitive updates.

### When to Use WebSockets vs Nostr Events

| Update Type | Protocol | Frequency | Latency |
|-------------|----------|-----------|---------|
| Ride request/acceptance | Nostr Events | One-time | Not critical |
| Stake locks/releases | Nostr Events | One-time | Not critical |
| **Live location tracking** | **WebSocket** | **3-5 seconds** | **< 500ms** |
| **Live ETA updates** | **WebSocket** | **5-10 seconds** | **< 500ms** |
| **Turn-by-turn navigation** | **WebSocket** | **Real-time** | **< 200ms** |
| Status changes | Nostr Events (fallback) | Ad-hoc | 1-3 seconds |
| Ratings/disputes | Nostr Events | One-time | Not critical |

### WebSocket Connection Establishment

Once a ride is accepted and both parties have locked stakes, the driver and rider SHOULD establish a direct WebSocket connection for the duration of the ride.

**Connection Flow:**

```javascript
// 1. Driver includes WebSocket endpoint in ride acceptance
{
  "kind": 30501,
  "tags": [
    ["e", "<ride-request-id>"],
    ["websocket", "wss://driver.example.com/ride/<ride-id>"],
    ["websocket_token", "<ephemeral-auth-token>"],
    ["websocket_expiry", "<unix-timestamp>"]
  ]
}

// 2. Rider connects to driver's WebSocket endpoint
const ws = new WebSocket('wss://driver.example.com/ride/<ride-id>');

ws.onopen = () => {
  // Authenticate with token from ride acceptance event
  ws.send(JSON.stringify({
    type: 'auth',
    token: '<ephemeral-auth-token>',
    pubkey: '<rider-pubkey>',
    signature: '<sig-of-token>'
  }));
};
```

**Alternative: Operator-Mediated WebSocket**

If drivers cannot expose WebSocket endpoints (NAT, mobile networks), operators MAY provide relay WebSocket service:

```javascript
// Driver connects to operator WebSocket
const driverWs = new WebSocket('wss://operator.example.com/ride/<ride-id>/driver');

// Rider connects to same operator WebSocket
const riderWs = new WebSocket('wss://operator.example.com/ride/<ride-id>/rider');

// Operator forwards messages between driver and rider
```

### Real-Time Message Formats

All WebSocket messages MUST be JSON and SHOULD be signed to prevent tampering.

#### Location Update (Driver → Rider)

Sent every 3-5 seconds during active ride:

```json
{
  "type": "location_update",
  "ride_id": "ride_abc123",
  "timestamp": 1678901234,
  "location": {
    "lat": 40.7580,
    "lon": -73.9855
  },
  "heading": 45,
  "speed": 12.5,
  "altitude": 10.2,
  "accuracy": 5,
  "eta_seconds": 180,
  "distance_remaining": 2400,
  "current_instruction": "Turn right on Main St in 200m",
  "signed_by": "<driver-pubkey>",
  "signature": "<schnorr-signature-of-message>"
}
```

**Signature Calculation:**

```javascript
import { schnorr } from '@noble/secp256k1';

function signLocationUpdate(driverPrivkey, message) {
  const { type, ride_id, timestamp, location, heading, speed, eta_seconds } = message;

  // Create deterministic payload
  const payload = JSON.stringify({
    type, ride_id, timestamp, location, heading, speed, eta_seconds
  });

  const hash = sha256(payload);
  const signature = schnorr.sign(hash, driverPrivkey);

  return {
    ...message,
    signed_by: getPublicKey(driverPrivkey),
    signature: bytesToHex(signature)
  };
}
```

#### Acknowledgment (Rider → Driver)

Rider acknowledges receipt of location updates:

```json
{
  "type": "ack",
  "ride_id": "ride_abc123",
  "timestamp": 1678901234,
  "last_received_seq": 123,
  "status": "ok"
}
```

#### ETA Update (Driver → Rider)

When ETA changes significantly (> 1 minute):

```json
{
  "type": "eta_update",
  "ride_id": "ride_abc123",
  "timestamp": 1678901234,
  "eta_seconds": 420,
  "eta_change": 60,
  "reason": "traffic",
  "signed_by": "<driver-pubkey>",
  "signature": "<sig>"
}
```

#### Navigation Alert (Driver → Rider)

For significant route changes:

```json
{
  "type": "navigation_alert",
  "ride_id": "ride_abc123",
  "timestamp": 1678901234,
  "alert_type": "reroute",
  "message": "Taking alternate route due to accident - saves 3 minutes",
  "new_eta_seconds": 300,
  "new_distance": 3200,
  "signed_by": "<driver-pubkey>",
  "signature": "<sig>"
}
```

#### Emergency Alert (Either Party)

For safety emergencies:

```json
{
  "type": "emergency",
  "ride_id": "ride_abc123",
  "timestamp": 1678901234,
  "emergency_type": "safety_concern",
  "location": {"lat": 40.7580, "lon": -73.9855},
  "message": "Request immediate assistance",
  "signed_by": "<sender-pubkey>",
  "signature": "<sig>"
}
```

### Fallback to Nostr Events

If WebSocket connection fails or is unavailable, clients MUST fall back to polling Nostr relays for kind 30512 (Ride Status Update) events:

```javascript
class RideTracking {
  constructor(rideId, driverPubkey, nostrRelays) {
    this.rideId = rideId;
    this.driverPubkey = driverPubkey;
    this.relays = nostrRelays;
    this.websocket = null;
    this.usingFallback = false;
  }

  async start() {
    try {
      // Attempt WebSocket connection
      this.websocket = await this.connectWebSocket();
      this.websocket.onerror = () => this.fallbackToNostr();
    } catch (error) {
      // WebSocket failed, use Nostr fallback
      await this.fallbackToNostr();
    }
  }

  async fallbackToNostr() {
    console.log('WebSocket unavailable, falling back to Nostr event polling');
    this.usingFallback = true;

    // Poll for status updates every 5 seconds
    this.pollInterval = setInterval(async () => {
      const pool = new SimplePool();
      const events = await pool.list(this.relays, [{
        kinds: [30512],
        authors: [this.driverPubkey],
        '#d': [this.rideId],
        limit: 1
      }]);

      if (events.length > 0) {
        this.onLocationUpdate(this.parseNostrEvent(events[0]));
      }
    }, 5000);
  }

  parseNostrEvent(event) {
    // Convert Nostr event to location update format
    return {
      type: 'location_update',
      location: this.parseTag(event.tags, 'location'),
      heading: parseInt(this.parseTag(event.tags, 'heading')),
      speed: parseFloat(this.parseTag(event.tags, 'speed')),
      eta_seconds: parseInt(this.parseTag(event.tags, 'eta'))
    };
  }
}
```

### Connection Lifecycle

1. **Ride Accepted** → Driver publishes WebSocket endpoint in acceptance event
2. **Stakes Locked** → Rider connects to WebSocket
3. **Ride Active** → Driver sends location updates every 3-5 seconds
4. **Ride Completed** → Either party sends `type: "ride_complete"` message, both disconnect
5. **Connection Lost** → Both parties fall back to Nostr event polling

### Security Considerations

- **Authentication**: WebSocket connections MUST require token-based authentication
- **Signatures**: Location updates SHOULD be signed to prevent spoofing
- **Rate Limiting**: Operators SHOULD rate-limit WebSocket connections (max 1/second per update)
- **Timeouts**: Connections SHOULD timeout after 10 seconds of inactivity
- **Encryption**: WebSocket connections MUST use TLS (wss://)

### Performance Guidelines

- **Update Frequency**: 3-5 seconds for location, 5-10 seconds for ETA
- **Message Size**: Keep messages < 1KB for low latency
- **Compression**: Use WebSocket compression for bandwidth efficiency
- **Reconnection**: Implement exponential backoff for reconnection attempts

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

---

## Appendix A: Regulatory Guidance (Non-Normative)

**DISCLAIMER**: This appendix is informational only and does not constitute legal advice. Operators MUST consult with legal counsel in their jurisdiction. Laws vary significantly by country, state/province, and city. This information may be outdated.

### Purpose of This Appendix

This appendix provides examples of common regulatory requirements that ridesharing operators may face. The DonkeyRide protocol provides event schemas (event kinds) that CAN support compliance with these regulations, but does NOT mandate their use.

### Common Regulatory Areas

#### 1. Safety & Emergency Requirements

**Jurisdictions with Requirements:**
- **California (AB-5)**: Requires panic button / emergency alert system
- **New York (TLC)**: Requires emergency contact system
- **European Union**: General safety requirements for passenger transport

**Relevant Event Kinds:**
- 30559: Emergency Alert / Panic Button
- 30560: Trip Share / Follow My Ride
- 30561-30563: Safety Check-in System
- 30564: Harassment / Threat Report

**Implementation Considerations:**
- 24/7 safety monitoring team (may be legally required)
- <60 second response time (best practice, legally required in some jurisdictions)
- 911/emergency services integration
- Law enforcement cooperation protocols

---

#### 2. Driver Screening & Background Checks

**Jurisdictions with Requirements:**
- **United States (Federal)**: No federal requirement, varies by state
- **California**: Criminal background check, driving record check
- **New York (TLC)**: Comprehensive background check including fingerprinting
- **European Union**: Varies by country (e.g., UK requires DBS check)

**Relevant Event Kinds:**
- 30595: Background Check Result
- 30598: Driver License Verification

**Typical Screening Elements:**
- Criminal history (felonies, violent crimes, sex offender registry)
- Driving record (DUIs, reckless driving, license suspensions)
- Identity verification
- Age verification (21+ in most jurisdictions)

**Common Providers:**
- Checkr (US)
- Onfido (Global)
- Sterling (US)
- Country-specific providers (e.g., DBS in UK)

---

#### 3. Insurance Requirements

**Jurisdictions with Requirements:**
- **California**: $1M commercial liability minimum
- **New York (TLC)**: $1.25M liability coverage
- **European Union**: Varies by country (typically €1M-€5M)

**Relevant Event Kinds:**
- 30596: Insurance Verification

**Coverage Types:**
- Commercial rideshare liability
- Uninsured/underinsured motorist
- Personal injury protection (PIP) in no-fault states
- Comprehensive and collision (vehicle damage)

**Implementation:**
- Verify insurance before allowing driver online
- Auto-deactivate drivers with expired insurance
- Coordinate with insurance providers for per-ride coverage

---

#### 4. Vehicle Inspection & Safety

**Jurisdictions with Requirements:**
- **California**: Annual vehicle inspection
- **New York (TLC)**: Semi-annual TLC inspection
- **European Union**: Annual MOT (UK) or equivalent

**Relevant Event Kinds:**
- 30597: Vehicle Inspection Certificate

**Common Inspection Items:**
- Brakes, tires, suspension
- Lights, signals, wipers
- Emissions (in applicable jurisdictions)
- Interior cleanliness and safety
- Maximum vehicle age restrictions (e.g., 10-15 years in some cities)

---

#### 5. Accessibility Requirements (ADA / Disability Laws)

**Jurisdictions with Requirements:**
- **United States (ADA)**: Requires accessible service, no extra fees
- **European Union (EU Directive)**: Similar accessibility requirements
- **United Kingdom (Equality Act 2010)**: Cannot refuse assistance dogs, wheelchair users

**Relevant Event Kinds:**
- 30542: Wheelchair Accessible Vehicle Certification

**Requirements:**
- Minimum % of fleet must be wheelchair accessible (varies: 0%-20% depending on jurisdiction)
- Cannot charge extra for accessible vehicles
- Cannot refuse requests (may constitute illegal discrimination)
- Response time parity (accessible requests ≤ regular requests)
- Driver training on accessibility equipment

---

#### 6. Age Verification & Minor Protection

**Jurisdictions with Requirements:**
- **United States**: Most states prohibit unaccompanied minors (<18)
- **European Union**: GDPR restricts data collection from minors (<16)
- **California**: Requires parental consent for minors

**Relevant Event Kinds:**
- 30541: Age Verification

**Common Implementations:**
- 18+ required for unaccompanied rides
- 13-17 may ride with parental consent account
- <13 prohibited
- ID verification (driver's license, passport) for age confirmation

---

#### 7. Driver Fatigue & Work Hour Limits

**Jurisdictions with Requirements:**
- **European Union (Working Time Directive)**: Max 48 hours/week
- **California**: No specific rideshare limits, but general labor laws apply
- **New York (TLC)**: No specific limits, but driver welfare requirements

**Relevant Event Kinds:**
- 30543: Driver Fatigue Limit Warning

**Common Limits (Voluntary Best Practices):**
- 12 hours maximum consecutive driving
- 8 hours minimum rest between shifts
- 60-70 hours maximum per week
- Mandatory breaks after 6 hours

---

#### 8. Data Privacy & Protection

**Jurisdictions with Requirements:**
- **European Union (GDPR)**: Comprehensive data protection, user rights
- **California (CCPA/CPRA)**: Similar to GDPR
- **United Kingdom (UK GDPR)**: Similar to EU GDPR
- **Brazil (LGPD)**: Similar framework

**Key Requirements:**
- **Right to Access**: User can export all their data
- **Right to Deletion**: User can request deletion (with exceptions for legal/tax records)
- **Right to Rectification**: User can correct inaccurate data
- **Right to Portability**: Data export in machine-readable format
- **Data Minimization**: Only collect necessary data
- **Breach Notification**: 72-hour notification requirement (GDPR)
- **Consent**: Explicit opt-in for non-essential data collection

**Implementation:**
- Store PII in deletable databases (NOT on public Nostr relays)
- Implement data export APIs
- Retention policies (e.g., 90 days for location, 7 years for payments)
- Encryption at rest and in transit
- Access controls and audit logs

---

#### 9. Tax & Financial Reporting

**Jurisdictions with Requirements:**
- **United States (IRS)**: 1099-K reporting for drivers earning $600+/year
- **European Union**: VAT collection and reporting in applicable jurisdictions
- **United Kingdom**: Self-assessment tax reporting for drivers

**Relevant Event Kinds:**
- 30585: Driver Earnings Summary
- 30586: Rider Trip Summary

**Implementation:**
- Track all payments (rides, tips, fees)
- Generate annual tax summaries for drivers
- Report to tax authorities as required
- Retain payment records for 7 years (typical requirement)

---

#### 10. Tipping Regulations

**Jurisdictions with Requirements:**
- **United States (California AB-5)**: Tips must go 100% to worker
- **European Union**: Varies by country
- **New York**: Tips are driver income, cannot be taken by platform

**Relevant Event Kinds:**
- 30513: Tip

**Implementation:**
- 100% of tips to driver (0% operator fee)
- Transparent tip display to rider
- Separate tip from base fare in tax reporting

---

### Regulatory Compliance Checklist

Operators should consult this checklist when launching in a new jurisdiction:

**Pre-Launch:**
- [ ] Engage local attorney specializing in rideshare/transportation
- [ ] Obtain required business licenses and permits
- [ ] Secure commercial rideshare insurance policy
- [ ] Integrate with background check provider
- [ ] Set up vehicle inspection process (if required)
- [ ] Implement GDPR/CCPA compliance (if applicable)
- [ ] Establish 24/7 safety monitoring (if required)
- [ ] Create driver training program (safety, ADA, customer service)
- [ ] Set up tax reporting systems
- [ ] Draft Terms of Service and Privacy Policy

**Ongoing:**
- [ ] Annual driver background checks
- [ ] Insurance policy renewals
- [ ] Vehicle inspection renewals
- [ ] Driver training refreshers
- [ ] Data retention policy enforcement (auto-delete old data)
- [ ] Safety audit reports
- [ ] Tax reporting (annual 1099-K or equivalent)
- [ ] Regulatory monitoring (laws change frequently)

---

### Resources

**Legal Databases:**
- LexisNexis (US)
- Westlaw (US)
- EUR-Lex (EU)
- National legal databases for specific countries

**Industry Associations:**
- IATA (International Air Transport Association) - for airport operations
- IRU (International Road Transport Union)
- Country-specific rideshare associations

**Regulatory Bodies:**
- California CPUC (Public Utilities Commission)
- NYC TLC (Taxi & Limousine Commission)
- London Transport for London (TfL)
- European Commission (DG MOVE - Mobility and Transport)

---

### Final Note

**This appendix is non-normative and does not mandate any specific implementation.**

The DonkeyRide protocol provides event schemas that CAN support regulatory compliance, but operators are free to:
- Implement only the event kinds relevant to their jurisdiction
- Add custom event kinds for jurisdiction-specific requirements
- Operate in jurisdictions with minimal regulations using a simpler implementation

**Always consult with qualified legal counsel before launching ridesharing operations.**

---

## Appendix B: Dispute Arbiter Selection Protocol

**Status**: Normative - Recommended for interoperability

### Problem

Event Kind 30522 (Dispute) allows tagging arbiters, but the protocol doesn't specify:
- How arbiters are selected
- What if parties disagree on arbiter choice?
- How are arbiters compensated?
- What if arbiter doesn't respond?

### Arbiter Selection Mechanisms

Operators MAY implement one or more of these mechanisms:

#### Option 1: Mutual Agreement (Recommended)

**Flow:**
1. Disputing party publishes Kind 30522 with proposed arbiter(s)
2. Other party has 24 hours to approve or counter-propose
3. If agreement reached → arbiter proceeds
4. If no agreement → escalate to Option 2 or 3

**Event Structure:**
```json
{
  "kind": 30522,
  "pubkey": "<disputing-party-pubkey>",
  "tags": [
    ["ride_id", "<ride-id>"],
    ["accused", "<other-party-pubkey>"],
    ["proposed_arbiter", "<arbiter1-pubkey>"],
    ["proposed_arbiter", "<arbiter2-pubkey>"],
    ["proposed_arbiter", "<arbiter3-pubkey>"],
    ["arbiter_selection_method", "mutual_agreement"],
    ["response_deadline", "<unix-timestamp>"]
  ]
}
```

**Response from other party:**
```json
{
  "kind": 30522,
  "pubkey": "<accused-party-pubkey>",
  "tags": [
    ["e", "<original-dispute-id>"],
    ["approved_arbiter", "<arbiter2-pubkey>"],
    ["arbiter_selection_method", "mutual_agreement"]
  ]
}
```

---

#### Option 2: Web-of-Trust Scoring

**Mechanism:**
- Each party maintains a trust network (NIP-02 follow lists)
- Arbiter candidates are scored based on:
  - Mutual trust connections
  - Reputation score (from kind 30530 events)
  - Previous arbitration history
  - No conflict of interest (not followed by accused, not competitor)

**Scoring Algorithm (Example):**
```javascript
function scoreArbiter(arbiter, party1, party2) {
  let score = 0;

  // Mutual follows
  if (party1.follows(arbiter) && party2.follows(arbiter)) score += 50;
  else if (party1.follows(arbiter) || party2.follows(arbiter)) score += 20;

  // Reputation (0-100)
  score += arbiter.reputation * 0.3;

  // Arbitration experience
  score += Math.min(arbiter.completed_arbitrations * 2, 20);

  // Success rate
  score += arbiter.arbitration_success_rate * 0.1;

  // Conflicts of interest (penalties)
  if (arbiter.hasBusinessWith(party1) || arbiter.hasBusinessWith(party2)) {
    score -= 100; // Disqualify
  }

  return score;
}

// Select top 3 arbiters
const arbiters = allArbiters
  .map(a => ({arbiter: a, score: scoreArbiter(a, rider, driver)}))
  .sort((a, b) => b.score - a.score)
  .slice(0, 3);
```

**Event Structure:**
```json
{
  "kind": 30522,
  "tags": [
    ["arbiter", "<top-scored-arbiter-pubkey>", "score:85"],
    ["arbiter", "<second-arbiter-pubkey>", "score:72"],
    ["arbiter", "<third-arbiter-pubkey>", "score:68"],
    ["arbiter_selection_method", "web_of_trust"]
  ]
}
```

---

#### Option 3: Random Selection from Bonded Arbiter Pool

**Mechanism:**
- Operators maintain a pool of bonded arbiters (kind 30570: Verifier Registration)
- Arbiters must post bond (e.g., 100,000 sats) and maintain reputation > 80
- Random selection using verifiable randomness (block hash)

**Bonded Arbiter Registration:**
```json
{
  "kind": 30570,
  "pubkey": "<arbiter-pubkey>",
  "tags": [
    ["d", "arbiter-<pubkey>"],
    ["arbiter_type", "dispute_resolution"],
    ["bond_amount_sats", "100000"],
    ["bond_txid", "<lightning-invoice-hash>"],
    ["operator", "<operator-pubkey>"],
    ["reputation_minimum", "80"],
    ["specialization", "ride_disputes"],
    ["languages", "en,es,fr"],
    ["availability", "24/7"]
  ]
}
```

**Random Selection:**
```javascript
// Deterministic random selection
const blockHash = await getRecentBitcoinBlockHash();
const seed = sha256(blockHash + ride_id + dispute_timestamp);
const randomIndex = parseInt(seed.slice(0, 8), 16) % bondedArbiters.length;
const selectedArbiter = bondedArbiters[randomIndex];
```

**Event Structure:**
```json
{
  "kind": 30522,
  "tags": [
    ["arbiter", "<randomly-selected-arbiter-pubkey>"],
    ["arbiter_selection_method", "random_bonded_pool"],
    ["randomness_source", "bitcoin_block:800000"],
    ["selection_seed", "<sha256-hash>"]
  ]
}
```

---

#### Option 4: Operator-Designated Arbiters

**Mechanism:**
- Operator provides list of approved arbiters
- Disputing party selects from list or requests random assignment
- Operator guarantees arbiter quality and compensation

**Operator Arbiter List:**
```json
{
  "kind": 30540,
  "pubkey": "<operator-pubkey>",
  "tags": [
    ["approved_arbiter", "<arbiter1-pubkey>", "reputation:95"],
    ["approved_arbiter", "<arbiter2-pubkey>", "reputation:92"],
    ["approved_arbiter", "<arbiter3-pubkey>", "reputation:88"],
    ["arbiter_compensation", "1000_sats_per_dispute"],
    ["arbiter_response_time_sla", "24_hours"]
  ]
}
```

---

### Arbiter Compensation

Arbiters SHOULD be compensated to ensure quality and responsiveness.

**Common Models:**

1. **Flat Fee per Dispute**
   - Example: 1,000 sats per dispute resolved
   - Paid by losing party or split 50/50

2. **Percentage of Dispute Amount**
   - Example: 5% of disputed stake amount
   - Incentivizes fair resolution (both parties more likely to accept)

3. **Operator-Funded**
   - Operator pays arbiters from general fund
   - Cost of doing business (like customer support)

4. **Reputation-Based Bonus**
   - Base fee + bonus for high satisfaction ratings
   - Encourages quality arbitration

**Payment Event:**
```json
{
  "kind": 30524,
  "pubkey": "<arbiter-pubkey>",
  "tags": [
    ["e", "<dispute-event-id>"],
    ["resolution", "favor_rider"],
    ["arbiter_fee_sats", "1000"],
    ["fee_paid_by", "driver"],
    ["payment_hash", "<lightning-payment-hash>"]
  ]
}
```

---

### Arbiter Non-Response Protocol

**If arbiter doesn't respond within SLA (e.g., 72 hours):**

1. **Penalize non-responsive arbiter:**
   - Slash arbiter bond (e.g., 10,000 sats)
   - Lower reputation score
   - Temporary suspension from arbiter pool

2. **Escalate to backup arbiter:**
   - Select next arbiter from ranked list
   - Repeat selection process with exclusion of non-responsive arbiter

3. **Operator intervention:**
   - After 2 failed arbiter attempts, operator may:
     - Resolve dispute directly
     - Refund both parties
     - Assign emergency arbiter

**Arbiter Timeout Event:**
```json
{
  "kind": 30554,
  "pubkey": "<operator-pubkey>",
  "tags": [
    ["e", "<dispute-event-id>"],
    ["arbiter", "<non-responsive-arbiter-pubkey>"],
    ["timeout_reason", "no_response_72h"],
    ["bond_slash_amount", "10000"],
    ["reputation_penalty", "-10"],
    ["escalation_action", "assign_backup_arbiter"]
  ]
}
```

---

### Recommended Implementation

For **interoperability**, operators SHOULD support:
1. **Mutual Agreement** (Option 1) - Best user experience
2. **Fallback to Operator-Designated** (Option 4) - If no agreement

For **decentralization**, operators MAY support:
1. **Web-of-Trust Scoring** (Option 2) - Most decentralized
2. **Random Bonded Pool** (Option 3) - Most fair

---

## Appendix C: Payment Failure Recovery Protocol

**Status**: Normative - Recommended for production implementations

### Problem

Kind 30523 (Payment Failure) exists, but protocol doesn't specify:
- What happens after payment fails?
- How many retries?
- Does driver keep driving or pull over?
- How to gracefully recover?

### Payment Failure Types

1. **Temporary Failure** (recoverable)
   - Rider's Lightning node offline
   - Network connectivity issue
   - Channel capacity temporarily exhausted
   - Invoice generation failure

2. **Persistent Failure** (requires intervention)
   - Insufficient balance
   - Wallet locked/encrypted
   - Channel force-closed
   - Fraudulent payment attempt

---

### Recovery Flow

#### Stage 1: Silent Retry (0-60 seconds)

**First failure detected:**
- Operator retries payment automatically
- No notification to driver or rider
- Attempt 3 retries with 20-second intervals
- Driver continues driving normally

```javascript
async function handlePaymentFailure(payment) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await sleep(20000); // 20 second backoff

    const result = await retryPayment(payment);
    if (result.success) {
      // Recovered silently
      return { recovered: true, stage: 'silent_retry' };
    }
  }

  // Escalate to Stage 2
  return { recovered: false, stage: 'silent_retry' };
}
```

---

#### Stage 2: Rider Notification (60-180 seconds)

**After 3 failed retries:**
- Notify rider of payment issue
- Provide clear error message and resolution steps
- Driver continues driving (grace period)
- Give rider 2 minutes to fix issue

**Rider Notification Event:**
```json
{
  "kind": 4,
  "pubkey": "<operator-pubkey>",
  "tags": [
    ["p", "<rider-pubkey>"],
    ["ride_id", "<ride-id>"],
    ["alert_type", "payment_failure"],
    ["severity", "warning"]
  ],
  "content": "Payment failed. Please check your Lightning wallet. You have 2 minutes to resolve before driver is notified."
}
```

**Rider Actions:**
- Check Lightning node status
- Verify channel liquidity
- Switch to backup payment method
- Add funds to wallet

---

#### Stage 3: Driver Notification (180-300 seconds)

**After 2 minutes, if still failing:**
- Notify driver of payment issue
- Request driver to pull over safely
- Pause ride meter (no additional charges while stopped)
- Give rider additional 2 minutes

**Driver Notification Event:**
```json
{
  "kind": 4,
  "pubkey": "<operator-pubkey>",
  "tags": [
    ["p", "<driver-pubkey>"],
    ["ride_id", "<ride-id>"],
    ["alert_type", "payment_failure"],
    ["action_required", "pull_over_safely"]
  ],
  "content": "Rider payment failed. Please pull over safely. Ride meter paused. Support team notified."
}
```

**Driver Status Update:**
```json
{
  "kind": 30512,
  "pubkey": "<driver-pubkey>",
  "tags": [
    ["d", "status-<ride-id>"],
    ["ride_id", "<ride-id>"],
    ["status", "paused_payment_issue"],
    ["location", "<current-lat>,<current-lon>"],
    ["paused_at", "<unix-timestamp>"]
  ]
}
```

---

#### Stage 4: Support Intervention (300+ seconds)

**After 5 minutes total:**
- Operator support team contacts rider
- Options offered:
  1. **Switch payment method** (credit card, cash, operator balance)
  2. **Partial payment** (pay for distance covered, end ride)
  3. **Operator fronting** (operator covers, bill rider later)
  4. **Ride termination** (driver paid from stake, rider refunded)

**Support Resolution Event:**
```json
{
  "kind": 30523,
  "pubkey": "<operator-pubkey>",
  "tags": [
    ["ride_id", "<ride-id>"],
    ["payment_failure_reason", "insufficient_balance"],
    ["recovery_method", "operator_fronted"],
    ["operator_fronted_amount", "2500"],
    ["rider_billed_later", "true"],
    ["ride_status", "resumed"]
  ]
}
```

---

### Alternative Payment Methods

#### Option 1: Pre-Funded Operator Balance

**Setup:**
Riders MAY pre-fund an operator balance for emergencies:

```json
POST /api/v1/riders/{pubkey}/balance
{
  "amount_sats": 10000,
  "invoice": "lnbc10000..."
}
```

**Automatic Fallback:**
- If streaming payment fails, deduct from balance
- Notify rider of balance usage
- Prompt to top up after ride

---

#### Option 2: Hodl Invoice Streaming (Trustless)

**Setup:**
- Rider creates 10-20 hodl invoices at ride start (100 sats each)
- Operator holds invoice hashes
- Settle invoices sequentially as ride progresses
- Unsettled invoices auto-cancel at ride end

**Advantages:**
- Non-custodial (operator can't steal funds)
- Graceful degradation (if 1 invoice fails, try next)
- No trust required

**Disadvantage:**
- More complex UX
- Requires hodl invoice support

---

#### Option 3: Stake Deduction Fallback

**If payment fails:**
- Deduct from rider's stake (if sufficient)
- Continue ride
- Rider must top up stake before next ride
- Driver still gets paid

**Event:**
```json
{
  "kind": 30520,
  "pubkey": "<operator-pubkey>",
  "tags": [
    ["ride_id", "<ride-id>"],
    ["stake_deduction_reason", "payment_failure_fallback"],
    ["amount_deducted_sats", "500"],
    ["rider_stake_remaining", "1500"]
  ]
}
```

---

### Complete Failure Handling

**If all recovery methods fail (rare):**

1. **Immediate ride termination**
2. **Driver paid from stake** (driver not penalized)
3. **Rider stake forfeited** (penalty for payment failure)
4. **Dispute resolution available** (if rider claims wallet malfunction)

**Termination Event:**
```json
{
  "kind": 30521,
  "pubkey": "<operator-pubkey>",
  "tags": [
    ["ride_id", "<ride-id>"],
    ["cancellation_reason", "unrecoverable_payment_failure"],
    ["driver_compensation_sats", "2000"],
    ["compensation_source", "rider_stake"],
    ["rider_stake_forfeited", "true"],
    ["dispute_eligible", "true"]
  ]
}
```

---

### Implementation Recommendations

**For Production Operators:**

1. **Implement at least Stage 1-3** (retry, notify, pull over)
2. **Support pre-funded balance** OR **stake deduction fallback**
3. **Provide 24/7 support** for Stage 4 intervention
4. **Monitor payment failure rates** (>5% = wallet/network issue)
5. **Test failure scenarios** regularly

**For Nostr-Native Implementations:**

1. **Rely on hodl invoice streaming** (most trustless)
2. **Publish payment failure events** to public relays (transparency)
3. **Allow peer recovery** (other riders/drivers can front payment)

---

### Metrics & Monitoring

Operators SHOULD track:
- **Payment failure rate** (per rider, per driver, overall)
- **Recovery success rate** (by stage)
- **Average time to recovery**
- **Stake forfeitures** (indicates fraud or chronic issues)

**High failure rates may indicate:**
- Poor Lightning network connectivity
- Inadequate rider education
- Wallet compatibility issues
- Fraudulent activity

---

## Appendix D: Privacy & Reputation Event Lifecycle

**Status**: Normative - GDPR/CCPA compliance guidance

### Problem

**GDPR "Right to be Forgotten" vs Nostr's Permanence:**
- Reputation events (kind 30530) published to public Nostr relays
- Relays MAY store events permanently
- Users cannot force relays to delete events
- Accumulation of reputation data over time = de-anonymization risk

**This creates tension:**
- Users have legal right to data deletion (GDPR Article 17)
- Nostr relays are not controlled by operators
- Reputation is core to trust model (can't just delete)

---

### Solution: Hybrid Privacy Model

#### Public Nostr Relays: Aggregated Reputation Only

**Publish to public relays:**
```json
{
  "kind": 30530,
  "pubkey": "<rated-party-pubkey>",
  "tags": [
    // NO ride-specific details
    // NO timestamps (prevents correlation)
    // NO reviewer identity (prevents retaliation)

    ["rating_type", "aggregate"],
    ["role", "driver"],
    ["avg_rating", "4.7"],
    ["total_rides", "237"],
    ["completion_rate", "98.5"],
    ["response_time_avg_sec", "45"],

    // Aggregated over time window
    ["time_window", "last_90_days"],
    ["last_updated", "<unix-timestamp>"]
  ]
}
```

**Characteristics:**
- **Aggregated** (not individual ride ratings)
- **No PII** (no names, addresses, exact timestamps)
- **Time-windowed** (rolling 90-day average)
- **Replaceable** (kind 30xxx = latest state only)

---

#### Private Operator Database: Detailed Reputation

**Store privately (with GDPR deletion rights):**
- Individual ride ratings
- Detailed review text
- Reviewer identity
- Exact timestamps
- GPS traces associated with ratings

**User Rights:**
- **Right to Access**: Export all ratings received/given
- **Right to Deletion**: Delete all private reputation data
- **Right to Rectification**: Dispute false ratings

**Data Retention:**
- Individual ratings: 90 days (then delete)
- Aggregated statistics: 7 years (for tax/legal, but anonymized)
- Disputed ratings: Statute of limitations + 1 year

---

### Reputation Event Expiry

**Time-Windowed Reputation:**

All reputation events on public relays SHOULD include expiry tags:

```json
{
  "kind": 30530,
  "tags": [
    ["expiry", "<unix-timestamp>"],  // Auto-expire after 90 days
    ["time_window", "last_90_days"],
    ["last_updated", "<unix-timestamp>"]
  ]
}
```

**Relays MAY:**
- Automatically delete expired events (optional)
- Clients MUST ignore expired events
- Reputation recalculated every 90 days (rolling window)

**Effect:**
- Stale reputation data automatically becomes irrelevant
- Users can "start fresh" after 90 days of inactivity
- Reduces de-anonymization risk from accumulating data

---

### Pseudonymous Nostr Keys

**Best Practice: Separate Keys for Ridesharing**

Users SHOULD use separate Nostr keys for ridesharing vs social media:

```
Social Nostr Key (npub1abc...):
  - Used for Twitter-like posts
  - Linked to real identity
  - Publicly known

Ridesharing Nostr Key (npub1xyz...):
  - Used only for DonkeyRide
  - Not linked to real identity
  - Pseudonymous
```

**Benefits:**
- Prevents correlation between social activity and ride history
- Reputation is portable (can export and import to new key)
- Reduces doxxing risk

---

### GDPR Compliance Strategy

#### Step 1: Data Minimization (Nostr Relays)

**What to publish to public relays:**
- ✅ Aggregated reputation (no individual rides)
- ✅ Obfuscated locations (geohash precision 5 = ~5km)
- ✅ Operator bonds and service areas
- ✅ Dispute outcomes (anonymized)

**What NOT to publish:**
- ❌ Exact addresses
- ❌ Real-time GPS traces
- ❌ Payment details
- ❌ Individual ride ratings
- ❌ Personal identifiers (names, phone, email)

---

#### Step 2: Deletable Private Storage

**Operator private database:**
- All PII stored with encryption at rest
- User-controlled deletion (via API or UI)
- Deletion SLA: 30 days (GDPR compliant)

**Deletion API:**
```
DELETE /api/v1/users/{pubkey}
Authorization: Nostr-Signature

Deletes:
- Exact GPS traces (after 90 days)
- Individual ratings received/given
- Messages, photos
- Preferences, saved locations
- All PII

Retains (anonymized):
- Payment records (7 years, tax law)
- Aggregated statistics
- Dispute records (legal requirement)
```

---

#### Step 3: Transparent Data Access

**User can export all data:**
```
GET /api/v1/users/{pubkey}/data-export
Authorization: Nostr-Signature

Returns ZIP with:
- ride-history.json (all rides, exact locations)
- ratings-received.json (individual ratings)
- ratings-given.json
- messages.json
- payments.json
- disputes.json
- reputation-events.json (signed Nostr events)
```

**Portable Reputation:**
Users can export signed reputation events and import to another operator:

```bash
# Export from Operator A
curl -H "Authorization: Bearer ${API_TOKEN}" \
  https://operator-a.com/api/v1/users/npub1.../reputation-export \
  > my-reputation.json

# Import to Operator B
curl -X POST \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -d @my-reputation.json \
  https://operator-b.com/api/v1/users/npub1.../reputation-import
```

---

### Reputation Anonymization After Deletion

**Challenge:**
User requests deletion, but their reputation events are on public Nostr relays.

**Solution:**
1. **Replace with Anonymized Aggregate:**
   - User requests deletion
   - Operator publishes final "anonymized aggregate" event
   - Event contains only: role, avg_rating, total_rides (no identity)
   - Old events remain but user identity removed from future events

2. **Reputation Transfer:**
   - User can transfer reputation to NEW Nostr key
   - Old key becomes inactive
   - New key inherits aggregated reputation (not individual ratings)

```json
{
  "kind": 30530,
  "pubkey": "<old-key>",
  "tags": [
    ["reputation_transferred_to", "<new-key>"],
    ["avg_rating", "4.7"],
    ["total_rides", "237"],
    ["anonymized", "true"],
    ["original_key_deleted", "true"]
  ]
}
```

---

### Recommendations for Operators

**To comply with GDPR/CCPA:**

1. ✅ **Publish only aggregated reputation to public Nostr relays**
2. ✅ **Store detailed reputation privately with deletion rights**
3. ✅ **Implement 90-day data retention for GPS/ratings**
4. ✅ **Support data export in machine-readable format**
5. ✅ **Allow reputation transfer to new keys**
6. ✅ **Use time-windowed reputation (rolling 90 days)**
7. ✅ **Encourage pseudonymous keys (separate from social)**

**Document in Privacy Policy:**
- What data goes on Nostr relays (permanent)
- What data is deletable (operator database)
- How to exercise deletion rights
- Reputation anonymization process

---

**This hybrid model allows:**
- ✅ GDPR/CCPA compliance (deletable PII)
- ✅ Trust model works (reputation exists)
- ✅ Data portability (export/import)
- ✅ Nostr benefits (transparency, interoperability)

---

## Appendix E: Surge Pricing Guidelines (Informational)

**Status**: Informational - Not mandated, transparency recommended

### Purpose

Surge pricing (dynamic pricing based on supply/demand) is common in ridesharing. This appendix provides transparency guidelines and example algorithms to prevent price manipulation and maintain trust.

### Transparency Requirements

Operators implementing surge pricing SHOULD:
1. **Publish algorithm publicly** (not a black box like Uber/Lyft)
2. **Display current multiplier** to riders before booking
3. **Log multipliers on Nostr** (Kind 30590-30592) for auditing
4. **Cap maximum multiplier** (e.g., 3x) to prevent price gouging

### Example Surge Algorithm

**Simple Supply/Demand Ratio:**
```javascript
function calculateSurgeMultiplier(zone) {
  const activeRequests = countRideRequests(zone);
  const availableDrivers = countAvailableDrivers(zone);

  if (availableDrivers === 0) return 3.0; // Max surge

  const ratio = activeRequests / availableDrivers;

  // No surge if supply meets demand
  if (ratio <= 1.0) return 1.0;

  // Linear surge: 2 requests per driver = 2x
  const multiplier = 1 + (ratio - 1) * 0.5;

  // Cap at 3x
  return Math.min(multiplier, 3.0);
}
```

**Event Publication:**
```json
{
  "kind": 30590,
  "pubkey": "<operator-pubkey>",
  "tags": [
    ["d", "surge-zone-manhattan"],
    ["geohash", "dr5ru"],
    ["zone_name", "Manhattan"],
    ["multiplier", "2.5"],
    ["active_requests", "50"],
    ["available_drivers", "15"],
    ["calculation_method", "supply_demand_ratio"],
    ["max_multiplier", "3.0"],
    ["timestamp", "<unix-timestamp>"]
  ]
}
```

### Advanced: Time-Weighted Algorithm

```javascript
function calculateSurgeMultiplier(zone) {
  const now = Date.now() / 1000;
  const requests = getRideRequests(zone, last_5_minutes);
  const drivers = getAvailableDrivers(zone);

  // Weight recent requests higher
  const weightedDemand = requests.reduce((sum, req) => {
    const age = now - req.timestamp;
    const weight = Math.max(0, 1 - (age / 300)); // Decay over 5 min
    return sum + weight;
  }, 0);

  const ratio = weightedDemand / drivers.length;
  const multiplier = 1 + Math.sqrt(ratio) * 0.7;

  return Math.min(multiplier, 3.0);
}
```

### Fair Surge Practices

**DO:**
- ✅ Notify riders of surge before booking
- ✅ Allow riders to "wait for lower price" (notify when surge drops)
- ✅ Cap maximum surge (3x recommended)
- ✅ Explain surge to riders ("High demand: 2x surge")
- ✅ Publish historical surge data (transparency)

**DON'T:**
- ❌ Hide surge multiplier until after ride
- ❌ Manipulate supply (hold drivers offline to create artificial surge)
- ❌ Unlimited surge (price gouging)
- ❌ Discriminatory pricing (same rider, different prices)

### Anti-Manipulation Safeguards

**Prevent operator fraud:**
1. **Audit trails**: All surge events on public Nostr relays
2. **Whistleblower reports**: Drivers can report fake surge
3. **Community monitoring**: Anyone can query surge history
4. **Bond slashing**: Operators lose bond for proven manipulation

**Example audit query:**
```javascript
// Check if operator created fake surge
const surgeEvents = await relay.query({
  kinds: [30590],
  authors: [operator_pubkey],
  since: yesterday,
  until: now
});

// Compare to actual ride requests
const rideRequests = await relay.query({
  kinds: [30500],
  '#operator': [operator_pubkey],
  since: yesterday,
  until: now
});

// If surge claimed "50 requests" but only 10 exist → fraud
```

### Recommended Implementation

**For production operators:**
1. Start with **simple supply/demand ratio** (easy to explain)
2. **Cap at 2-3x** maximum (prevent price shock)
3. **Publish all surge events** to public relays (transparency)
4. **Monitor for complaints** (high surge = risk of reputation damage)
5. **Consider flat rate zones** for airports (predictable pricing)

**For Nostr-native implementations:**
1. **Fully transparent algorithm** (open source)
2. **Community-auditable** (surge data on public relays)
3. **Driver-controlled** (drivers can opt out of surge zones)
4. **Rider choice** (can wait for normal pricing)

---

## Appendix F: Real-Time Communication Protocol (Informational)

**Status**: Informational - Implementation-specific guidance

### Purpose

Real-time location updates during active rides require low-latency communication. This appendix provides guidance on WebSocket protocols for live tracking, while maintaining Nostr as fallback.

### Architecture

**Hybrid Approach (Recommended):**
```
┌─────────────┐              ┌──────────────┐              ┌─────────────┐
│   Driver    │──WebSocket──▶│   Operator   │──WebSocket──▶│    Rider    │
│     App     │     3-5s     │   Service    │    Real-time │     App     │
└─────────────┘              └──────────────┘              └─────────────┘
      │                              │
      │                              │
      ▼                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         NOSTR RELAYS (Fallback)                         │
│  Kind 30512 (Status Update) - Published every 30s if WebSocket fails   │
└─────────────────────────────────────────────────────────────────────────┘
```

### WebSocket Message Format

**Location Update (Driver → Operator → Rider):**
```json
{
  "type": "location_update",
  "ride_id": "ride_abc123",
  "timestamp": 1698765432,
  "location": {
    "lat": 40.758123,
    "lon": -73.985456,
    "accuracy": 10,
    "altitude": 50.2,
    "heading": 45,
    "speed": 12.5
  },
  "eta_seconds": 180,
  "distance_remaining_meters": 2400,
  "signed_by": "<driver-pubkey>",
  "signature": "<nostr-sig>"
}
```

**Acknowledgment (Rider → Operator):**
```json
{
  "type": "ack",
  "ride_id": "ride_abc123",
  "sequence": 123,
  "timestamp": 1698765433
}
```

**Connection Setup:**
```javascript
// Rider connects to operator's WebSocket
const ws = new WebSocket('wss://operator.com/rides/ride_abc123/live');

// Authenticate with Nostr signature
ws.send(JSON.stringify({
  type: 'auth',
  ride_id: 'ride_abc123',
  pubkey: rider_pubkey,
  signature: await signNostrEvent(auth_event)
}));

// Receive location updates
ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  if (update.type === 'location_update') {
    updateMapMarker(update.location);
    updateETA(update.eta_seconds);
  }
};

// Fallback to Nostr if WebSocket fails
ws.onerror = () => {
  console.log('WebSocket failed, falling back to Nostr polling');
  pollNostrForUpdates(ride_id);
};
```

### Security Considerations

**Authentication:**
- WebSocket connections MUST authenticate with Nostr signatures
- Each message signed by sender (prevents spoofing)
- Operator verifies signatures before forwarding

**Authorization:**
- Only rider + driver + emergency contacts can access ride WebSocket
- Operator enforces access control (checks ride participants)

**Privacy:**
- WebSocket data is ephemeral (not stored)
- Only active ride participants receive updates
- End-to-end encryption optional (for ultra-privacy scenarios)

### Fallback to Nostr

**If WebSocket fails:**
1. Driver publishes Kind 30512 (Status Update) every 30 seconds
2. Rider polls Nostr relay for updates
3. Higher latency (~30s) but still functional

**Automatic fallback:**
```javascript
class RideTracking {
  constructor(rideId) {
    this.rideId = rideId;
    this.useWebSocket = true;
    this.setupWebSocket();
  }

  setupWebSocket() {
    this.ws = new WebSocket(`wss://operator.com/rides/${this.rideId}/live`);

    this.ws.onerror = () => {
      console.log('WebSocket failed, falling back to Nostr');
      this.useWebSocket = false;
      this.startNostrPolling();
    };
  }

  startNostrPolling() {
    this.pollInterval = setInterval(async () => {
      const update = await relay.query({
        kinds: [30512],
        '#ride_id': [this.rideId],
        limit: 1
      });

      this.updateUI(update);
    }, 5000); // Poll every 5 seconds
  }
}
```

### Performance Optimization

**Update Frequency:**
- **High movement** (>20 mph): Every 3 seconds
- **Low movement** (<10 mph): Every 5 seconds
- **Stationary**: Every 30 seconds
- **Nostr fallback**: Every 30 seconds

**Bandwidth Savings:**
- Delta updates (only send changed fields)
- Compression (gzip WebSocket messages)
- Throttling (no updates if position unchanged)

### Trip Sharing (Follow My Ride)

**For trusted contacts:**
```javascript
// Rider generates secure token
const shareToken = generateSecureToken(ride_id, contact_pubkey);

// Contact connects with read-only access
const ws = new WebSocket(`wss://operator.com/rides/${ride_id}/follow/${shareToken}`);

// Receives same location updates (but can't send)
ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  displayRideTracking(update);
};
```

### Implementation Recommendations

**For production operators:**
1. **Implement WebSocket for UX** (real-time tracking)
2. **Always provide Nostr fallback** (reliability)
3. **Sign all messages** (security)
4. **Rate limit connections** (prevent DoS)
5. **Monitor connection quality** (auto-switch to fallback)

**For Nostr-native implementations:**
1. **Start with Nostr-only** (simpler, decentralized)
2. **Add WebSocket later** (optimization, not requirement)
3. **Both methods work** (protocol is flexible)

---

## Appendix G: Cross-Operator Coordination Protocol (Future Extension)

**Status**: Future Extension - Not required for v1.0

### Purpose

As the DonkeyRide ecosystem grows, riders may request trips that cross operator territories (e.g., NYC → New Jersey, different operators). This appendix outlines a protocol for cross-operator coordination.

**Note**: Single-operator implementations should launch first. Cross-operator features can be added in v1.1+ based on real-world needs.

### Scenario: Multi-Operator Ride

**Example:**
- Rider in Manhattan (Operator A) requests ride to Newark, NJ (Operator B territory)
- Driver registered with Operator A
- Destination is in Operator B's service area

### Option 1: Operator Referral

**Flow:**
1. Operator A recognizes destination is in Operator B territory
2. Operator A publishes referral event (Kind 30505)
3. Operator B accepts referral
4. Ride completes under Operator B coordination
5. Operators settle fees

**Referral Event:**
```json
{
  "kind": 30505,
  "pubkey": "<operator-a-pubkey>",
  "tags": [
    ["d", "referral-<ride-id>"],
    ["ride_id", "<ride-id>"],
    ["destination_operator", "<operator-b-pubkey>"],
    ["rider", "<rider-pubkey>"],
    ["driver", "<driver-pubkey>"],
    ["referral_fee_sats", "50"],
    ["estimated_fare", "5000"],
    ["handoff_location", "40.7489,-74.0292", "Hudson River crossing"]
  ]
}
```

### Option 2: Shared Coordination

**Flow:**
1. Both operators coordinate the ride jointly
2. Stake held by originating operator (Operator A)
3. Fees split based on distance in each territory
4. Both operators liable for their portion

**Coordination Event:**
```json
{
  "kind": 30505,
  "pubkey": "<operator-a-pubkey>",
  "tags": [
    ["d", "coord-<ride-id>"],
    ["ride_id", "<ride-id>"],
    ["coordinating_operator", "<operator-b-pubkey>"],
    ["coordination_type", "shared"],
    ["operator_a_distance_km", "15"],
    ["operator_b_distance_km", "10"],
    ["operator_a_fee", "37.5"],  // 60% of distance
    ["operator_b_fee", "25"],     // 40% of distance
    ["total_fee_sats", "62.5"]   // 0.5% of 12,500 sats fare
  ]
}
```

### Option 3: Driver Multi-Operator Registration

**Simplest approach:**
- Drivers register with multiple operators
- Each operator handles rides in their territory
- No cross-operator coordination needed

**Driver registration:**
```json
{
  "kind": 30587,
  "pubkey": "<driver-pubkey>",
  "tags": [
    ["d", "availability-driver123"],
    ["status", "online"],
    ["operators", "<operator-a-pubkey>", "<operator-b-pubkey>"],
    ["service_areas", "dr5r", "dr5u"],  // NYC + NJ geohashes
    ["preferred_operator", "<operator-a-pubkey>"]
  ]
}
```

### Stake Handling Across Operators

**Challenge:** Rider stakes with Operator A, but ride ends in Operator B territory.

**Solution 1: Pre-Transfer**
- Operator A transfers stake custody to Operator B at handoff point
- Requires trust between operators

**Solution 2: Escrow**
- Third-party escrow (bonded arbiter) holds stake
- Releases to appropriate operator after completion

**Solution 3: Smart Contract (Future)**
- DLC (Discreet Log Contract) holds stake
- Releases based on GPS proof of delivery

### Reputation Portability

**Already supported:**
- Reputation events (Kind 30530) are signed by user
- Can be exported/imported between operators
- No additional protocol needed

### Dispute Resolution Across Operators

**If dispute spans multiple operators:**
1. Originating operator (Operator A) handles dispute
2. Operator B provides evidence if needed
3. Arbiter selected by Operator A
4. Resolution binding on both operators

### Implementation Recommendations

**For v1.0 (Single-Operator):**
- ❌ Don't implement cross-operator coordination yet
- ✅ Focus on single-market, single-operator deployment
- ✅ Learn from real-world usage patterns

**For v1.1+ (Multi-Operator):**
- ✅ Start with Option 3 (driver multi-registration) - simplest
- ✅ Add Option 1 (referrals) if demand exists
- ⚠️ Option 2 (shared coordination) only if complex trips common

**Design Principle:**
Keep it simple. Most rides stay within one operator's territory. Cross-operator features should be added only when proven necessary.

---

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
