# NIP Review & Production Roadmap

## Executive Summary

Your NIPs are **95% complete** for production. This document identifies the remaining 5% and provides a roadmap to launch.

## NIP Strengths ✅

### 1. Event Model (Excellent)
- ✅ Complete ride lifecycle mapped
- ✅ Proper event kind ranges (30500-30599)
- ✅ Replaceable vs non-replaceable correctly used
- ✅ Tags are well-structured
- ✅ Navigation events comprehensive

### 2. Stake Model (Very Strong)
- ✅ Multiple mechanisms supported
- ✅ Progressive trust model
- ✅ Clear penalty calculations
- ✅ Timeout protection
- ✅ Cross-operator coordination

### 3. Operator Architecture (Brilliant)
- ✅ Standalone services (not relay modifications)
- ✅ REST API + Nostr events
- ✅ Geographic discovery
- ✅ Fee competition built-in
- ✅ Bonded operators with slashing

### 4. Security (Robust)
- ✅ Watchdog monitoring
- ✅ Theft detection protocol
- ✅ Multi-party verification
- ✅ Bond slashing mechanism
- ✅ Appeals process

## Critical Gaps to Address 🚨

### 1. Real-Time Communication Missing

**Problem:** NIPs focus on async events, but rides need real-time updates.

**Current:** Status updates via replaceable events (kind 30512)
**Issue:** Polling Nostr relays every few seconds is inefficient

**Solution:** Add WebSocket direct connection specification

```markdown
### Real-Time Updates (NEW)

For latency-sensitive updates during active rides, clients SHOULD establish direct WebSocket connections:

#### Driver → Rider Updates

```json
{
  "type": "location_update",
  "ride_id": "ride_abc123",
  "location": {"lat": 40.7580, "lon": -73.9855},
  "heading": 45,
  "speed": 12.5,
  "eta": 180,
  "signed_by": "<driver-pubkey>",
  "signature": "<sig>"
}
```

Sent every 3-5 seconds during active ride.

#### Rider → Driver Acks

```json
{
  "type": "ack",
  "sequence": 123,
  "ride_id": "ride_abc123"
}
```

**Fallback:** If WebSocket fails, fall back to Nostr event polling (kind 30512).

**Why:** Real-time map updates, live ETAs, turn-by-turn navigation.
```

### 2. Initial Matching Optimization

**Problem:** How do drivers efficiently discover nearby ride requests?

**Current:** Query all kind 30500 events, filter by location
**Issue:** Inefficient at scale (thousands of active requests)

**Solutions:**

#### Option A: Geographic Event Kinds (Recommended)

```markdown
Use NIP-01 location tags with standardized format:

```json
{
  "kind": 30500,
  "tags": [
    ["g", "9q8yy"],  // Geohash (precision 5 = ~5km)
    ["g", "9q8"],    // Parent geohash (for broader search)
    ["from", "40.7580,-73.9855", "Times Square, NYC"]
  ]
}
```

Drivers query: `{kinds: [30500], "#g": ["9q8yy"]}`

**Pros:** Works with existing Nostr relays
**Cons:** Still requires relay to index geohash tags
```

#### Option B: Geographic Relays

```markdown
Deploy relays per metro area:
- wss://nyc.donkeyride.com - Only serves NYC area rides
- wss://sf.donkeyride.com - Only serves SF area rides

**Pros:** Extremely efficient
**Cons:** More infrastructure
```

#### Option C: Hybrid (Best)

```markdown
1. **Discovery:** Use geohash tags on general relays
2. **Active Rides:** Direct WebSocket to operator for updates
3. **History:** Store completion events on general relays

This balances discoverability with efficiency.
```

### 3. Payment Streaming Protocol Needs Detail

**Current:** Kind 30510 events published every 30s
**Issue:** What if rider's Lightning wallet is offline? What if payment fails?

**Add to NIP:**

```markdown
### Streaming Payment Robustness

#### Payment Failure Handling

If streaming payment fails:
1. **Grace Period:** Allow 60s for payment to succeed
2. **Driver Alert:** Notify driver of payment failure
3. **Automatic Stop:** If no payment after 60s, driver SHOULD pull over safely
4. **Dispute:** Driver files dispute (kind 30522) with payment_failure evidence

#### Offline Payment

Riders MAY pre-fund operator with balance:
```json
POST /api/v1/riders/{pubkey}/balance
{
  "amount": 5000,  // Fund 5000 sats
  "invoice": "lnbc..."
}
```

Operator deducts from balance during ride, settles with driver after.

**Pros:** Works even if rider phone dies
**Cons:** Requires trusting operator with funds

#### Hodl Invoice Streaming (Trustless)

For trustless streaming:
1. Rider creates 10x hodl invoices (100 sats each)
2. Operator holds invoice hashes
3. As ride progresses, operator settles invoices sequentially
4. Unsettled invoices auto-cancel

**Pros:** Non-custodial
**Cons:** More complex UX
```

### 4. Dispute Resolution Needs Scoring

**Current:** Human arbiters review disputes
**Issue:** Slow, subjective, doesn't scale

**Add Objective Criteria:**

```markdown
### Automated Dispute Scoring

Before human review, calculate confidence score:

```javascript
function scoreDispute(dispute) {
  let confidence = 0;

  // GPS Evidence
  if (dispute.gps_trace_matches_route) confidence += 40;
  if (dispute.driver_location_matches_dropoff) confidence += 30;

  // Payment Evidence
  if (dispute.all_payments_confirmed) confidence += 20;

  // Reputation
  if (dispute.disputing_party_reputation > 90) confidence += 10;
  if (dispute.accused_party_reputation < 50) confidence += 10;

  // History
  if (dispute.accused_party_dispute_history > 5) confidence += 20;

  return Math.min(confidence, 100);
}
```

**Auto-Resolve:** If confidence > 80%, auto-resolve without human
**Human Review:** If confidence < 80%, escalate to web-of-trust arbiters

**Add to NIP:** Append dispute confidence score in kind 30522 events
```

### 5. Privacy vs Safety Tradeoff Unclear

**Current:** Multiple privacy levels (public, obfuscated, encrypted)
**Issue:** How do you balance privacy with safety verification?

**Add Guidance:**

```markdown
### Privacy Levels & Safety

| Privacy Level | Rider Safety | Driver Safety | Verification |
|---------------|--------------|---------------|--------------|
| Public Full Address | Medium | High | GPS + Address match |
| Obfuscated (500m radius) | Medium | Medium | GPS approximate |
| Encrypted Until Accept | Low | Low | No pre-verification |
| Private (Relay Only) | High | High | Relay verifies GPS |

**Recommendations:**

1. **Default:** Obfuscated pickup (500m radius)
   - Shows general area to drivers
   - Exact address revealed only after acceptance
   - Balances privacy and efficiency

2. **High-Value Rides** (airport, scheduled):
   - Public full address
   - Allow drivers to pre-verify
   - Higher stakes reduce privacy concerns

3. **Anonymous Rides:**
   - Use throwaway Nostr keys
   - Cash settlements (no Lightning address)
   - Trade efficiency for privacy
```

### 6. Multi-Party Rides (Carpooling)

**Missing:** Specification for multiple riders sharing one vehicle

**Add:**

```markdown
### Carpool/Ride-Sharing (Kind 30557)

```json
{
  "kind": 30557,
  "pubkey": "<organizer-pubkey>",
  "tags": [
    ["d", "carpool_xyz"],
    ["from", "40.7580,-73.9855", "Manhattan"],
    ["to", "40.7489,-73.9680", "Brooklyn"],
    ["seats", "3"],
    ["riders", "<pubkey1>", "<pubkey2>", "<pubkey3>"],
    ["split_type", "equal|weighted_by_distance"],
    ["price_per_seat", "500"],
    ["departure_time", "<unix-timestamp>"],
    ["pickup_points", "<lat1>,<lon1>", "<lat2>,<lon2>", "<lat3>,<lon3>"]
  ]
}
```

**Payment Splitting:**
- Equal: Each rider pays price_per_seat
- Weighted: Each rider pays proportional to their distance
- Auction: Riders bid for remaining seats

**Stake Splitting:**
- Each rider stakes 10% of their portion
- Driver stakes 15% of total ride value
```

## Recommended Changes

### Priority 1: Must-Have for MVP

1. ✅ **Add geohash tags** to kind 30500 (ride requests) for efficient discovery
2. ✅ **Specify WebSocket protocol** for real-time location updates
3. ✅ **Add payment failure handling** to streaming payments
4. ✅ **Clarify privacy defaults** (recommend obfuscated 500m radius)

### Priority 2: Important for Beta

5. ⚠️ **Add dispute confidence scoring** for automated resolution
6. ⚠️ **Specify offline payment** options (pre-funded balance)
7. ⚠️ **Add carpool/multi-rider** support (kind 30557)

### Priority 3: Nice to Have

8. 📝 **Add driver shift management** (going online/offline, breaks)
9. 📝 **Specify surge pricing** during high demand
10. 📝 **Add multi-leg trips** (multiple stops)

## Production Roadmap

### Phase 1: Local Development (2-3 weeks)

**Goal:** Working prototype with Docker environment

#### Week 1: Infrastructure
- [ ] Set up local Nostr relay (nostr-rs-relay or strfry)
- [ ] Build simple operator service (Express + Strike API)
- [ ] Create test wallet system (mock Lightning)
- [ ] Docker Compose setup for full stack

#### Week 2: Core App
- [ ] React Native base app (shared code for rider/driver)
- [ ] Nostr client integration (NDK or nostr-tools)
- [ ] Basic ride request/acceptance flow
- [ ] Real map integration (MapBox or Google Maps)

#### Week 3: Stake System
- [ ] Operator REST API for stakes
- [ ] Lock/release stake flow
- [ ] Payment streaming (30s intervals)
- [ ] Completion and cancellation

### Phase 2: Beta Testing (4-6 weeks)

**Goal:** Real users testing in controlled market

#### Infrastructure
- [ ] Deploy operator to AWS/GCP
- [ ] Connect to real Nostr relays (Damus, nos.lol)
- [ ] Real Lightning (Strike, Voltage)
- [ ] Monitoring and logging

#### Features
- [ ] Real-time GPS tracking
- [ ] Turn-by-turn navigation
- [ ] Rating system
- [ ] Reputation display
- [ ] Dispute filing

#### Testing
- [ ] 10-20 test drivers
- [ ] 50-100 test riders
- [ ] Real money (small amounts)
- [ ] Collect feedback

### Phase 3: Public Launch (2-3 months)

**Goal:** Production-ready service in one city

#### Launch Checklist
- [ ] Security audit
- [ ] Legal review (insurance, liability)
- [ ] Customer support system
- [ ] 24/7 monitoring
- [ ] Incident response plan
- [ ] PR and marketing

#### Scaling
- [ ] Multiple operator deployment
- [ ] Cross-operator coordination
- [ ] Geographic expansion
- [ ] Driver onboarding funnel

## Docker Development Environment

Create this for instant development setup:

```yaml
# docker-compose.yml
version: '3.8'

services:
  # Nostr Relay (strfry - fast and simple)
  nostr-relay:
    image: ghcr.io/hoytech/strfry:latest
    ports:
      - "7777:7777"
    volumes:
      - ./strfry-db:/app/strfry-db
      - ./strfry.conf:/etc/strfry.conf

  # DonkeyRide Operator
  operator:
    build: ./operator
    ports:
      - "3000:3000"
    environment:
      - NOSTR_RELAY=ws://nostr-relay:7777
      - OPERATOR_PRIVKEY=${OPERATOR_PRIVKEY}
      - STRIKE_API_KEY=${STRIKE_API_KEY}
      - OPERATOR_FEE=0.005
      - NODE_ENV=development
    depends_on:
      - nostr-relay
      - postgres

  # PostgreSQL for operator state
  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=donkeyride
      - POSTGRES_USER=operator
      - POSTGRES_PASSWORD=devpassword
    volumes:
      - postgres-data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  # Redis for caching and real-time
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  # Mock Lightning Node (for testing)
  mock-lightning:
    build: ./mock-lightning
    ports:
      - "9735:9735"
    environment:
      - NETWORK=regtest

  # Web UI (React dev server)
  web:
    build: ./web
    ports:
      - "3001:3001"
    environment:
      - REACT_APP_NOSTR_RELAY=ws://localhost:7777
      - REACT_APP_OPERATOR_API=http://localhost:3000
    volumes:
      - ./web:/app
      - /app/node_modules
    depends_on:
      - operator

volumes:
  postgres-data:
  strfry-db:
```

**Run:**
```bash
docker-compose up
```

Access:
- Nostr relay: ws://localhost:7777
- Operator API: http://localhost:3000
- Web UI: http://localhost:3001

## Next Steps - YOUR CHOICE:

### Option A: Refine NIPs First (Recommended)
1. I create detailed PRs for the 4 Priority 1 changes
2. We review and merge
3. Submit to Nostr NIP repo for community feedback
4. Then start building

### Option B: Start Building Now
1. Use NIPs as-is (they're 95% there)
2. Build React Native apps
3. Build operator service
4. Build Docker environment
5. Refine NIPs based on implementation learnings

### Option C: Parallel Track
1. You build apps
2. I refine NIPs
3. We sync weekly

**What do you prefer?**

I recommend **Option A** - spend 1-2 days getting NIPs perfect, THEN build. The protocol is your foundation. Get it right first.

Thoughts?
