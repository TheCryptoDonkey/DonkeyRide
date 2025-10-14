# Integrating Stake Management Into Nostr Relays

> **Note:** This is an **OPTIONAL** integration approach.
> Operators can (and do) run as **standalone services** without being Nostr relays.
> See `OPERATOR-DEPLOYMENT.md` for the recommended standalone approach.

## The Vision

Instead of running separate infrastructure, Nostr relay operators can **optionally** offer DonkeyRide stake management as an add-on feature to their existing relay.

**Current Architecture (Recommended):**
- Operators = Standalone HTTP/REST services
- Use payment provider abstraction (Strike, LND, BTCPay, etc.)
- Publish events TO Nostr relays (as clients)
- No Nostr relay software needed

**This Document (Optional Enhancement):**
- How existing Nostr relays can ADD stake services
- Leverage existing relay infrastructure
- Combine event storage + stake management

## Why This Works (For Relay Operators)

### Nostr Relays Already Have:
- Geographic distribution
- Uptime monitoring
- Payment systems (paid relays exist)
- Pubkey authentication
- WebSocket infrastructure
- Event validation

### They Just Need To Add:
- Strike API integration (or Lightning)
- Stake lock/release logic
- RESTful API for stake operations
- Fee collection mechanism

## Implementation: NIP-11 Extension

Relays advertise stake capabilities in their info document:

### Standard NIP-11 (Current)
```json
{
  "name": "nostr.example.com",
  "description": "General purpose relay",
  "pubkey": "relay-operator-pubkey",
  "contact": "admin@example.com",
  "supported_nips": [1, 2, 4, 9, 11, 12, 15, 16, 20, 22],
  "software": "strfry",
  "version": "1.0.0"
}
```

### Extended for DonkeyRide (New)
```json
{
  "name": "nostr.example.com",
  "description": "General purpose relay with stake management",
  "pubkey": "relay-operator-pubkey",
  "contact": "admin@example.com",
  "supported_nips": [1, 2, 4, 9, 11, 12, 15, 16, 20, 22, "XX"],
  "software": "strfry-donkeyride",
  "version": "1.0.0",

  // NEW: DonkeyRide capabilities
  "donkeyride": {
    "enabled": true,
    "version": "1.0",
    "stake_api": "https://nostr.example.com/stakes",
    "operator_fee": 0.005,  // 0.5%
    "mechanisms": ["strike", "lightning_hodl"],
    "features": ["escrow", "streaming_payments", "dispute_resolution"],
    "max_stake": 10000,
    "min_stake": 50,
    "geographic_area": {
      "center": [40.7128, -74.0060],
      "radius_km": 50
    },
    "lightning_address": "operator@getalby.com",
    "insurance_available": false,
    "reputation_score": 4.8,
    "total_rides_processed": 15234
  }
}
```

## Client Discovery Flow

```javascript
// Client discovers relays with stake capabilities
async function findStakeRelays(location) {
  const allRelays = [
    'wss://relay.damus.io',
    'wss://nostr.example.com',
    'wss://relay.nostr.band',
    // ... more
  ];

  const stakeRelays = [];

  for (const relay of allRelays) {
    const info = await fetch(`https://${relay}/`);
    const data = await info.json();

    if (data.donkeyride?.enabled) {
      stakeRelays.push({
        url: relay,
        fee: data.donkeyride.operator_fee,
        mechanisms: data.donkeyride.mechanisms,
        api: data.donkeyride.stake_api,
        features: data.donkeyride.features,
        reputation: data.donkeyride.reputation_score
      });
    }
  }

  // Sort by fee (or other criteria)
  return stakeRelays.sort((a, b) => a.fee - b.fee);
}

// Usage
const relays = await findStakeRelays([40.7128, -74.0060]);
console.log('Available stake relays:', relays);

// User chooses lowest fee relay
const bestRelay = relays[0];
console.log(`Using ${bestRelay.url} at ${bestRelay.fee * 100}% fee`);
```

## Relay Implementation

### Option A: Fork Existing Relay Software

```bash
# Fork strfry (C++) or nostr-rs-relay (Rust)
git clone https://github.com/hoytech/strfry
cd strfry

# Add DonkeyRide module
mkdir src/donkeyride
```

```cpp
// src/donkeyride/stakes.cpp
#include "stakes.h"
#include "strike_api.h"

namespace donkeyride {

class StakeManager {
public:
  StakeManager(const Config& config)
    : strike_api_(config.strike_key),
      operator_fee_(config.operator_fee) {}

  StakeLock lockStake(const RideId& ride_id,
                     const PubKey& user_pubkey,
                     uint64_t amount,
                     StakeType type) {
    // Integrate with Strike API
    auto hold = strike_api_.createHold(amount);

    // Store in local DB
    stakes_db_.insert({ride_id, user_pubkey, amount, hold.id});

    return StakeLock{hold.id, amount};
  }

  void releaseStake(const RideId& ride_id) {
    auto stake = stakes_db_.get(ride_id);
    strike_api_.releaseHold(stake.hold_id);
    stakes_db_.remove(ride_id);
  }

  void forfeitStake(const RideId& ride_id,
                   const PubKey& beneficiary) {
    auto stake = stakes_db_.get(ride_id);
    uint64_t penalty = stake.amount * 0.8;

    strike_api_.transferHold(stake.hold_id, beneficiary, penalty);
    stakes_db_.remove(ride_id);
  }

private:
  StrikeAPI strike_api_;
  StakesDB stakes_db_;
  double operator_fee_;
};

} // namespace donkeyride
```

### Option B: Plugin Architecture

```javascript
// relay-plugin.js - for Node.js based relays
module.exports = {
  name: 'donkeyride-stakes',
  version: '1.0.0',

  async onLoad(relay) {
    // Add REST API endpoints to relay
    relay.app.post('/stakes/create', createStake);
    relay.app.post('/stakes/:id/lock', lockStake);
    relay.app.post('/stakes/:id/release', releaseStake);
    relay.app.post('/stakes/:id/forfeit', forfeitStake);

    // Extend NIP-11 info
    relay.info.donkeyride = {
      enabled: true,
      operator_fee: 0.005,
      stake_api: `${relay.baseURL}/stakes`,
      mechanisms: ['strike']
    };
  },

  async createStake(req, res) {
    const { rideId, amount, pubkey } = req.body;

    // Use Strike API
    const hold = await strike.createHold(amount);

    // Store locally
    await db.stakes.insert({
      rideId,
      pubkey,
      amount,
      holdId: hold.id,
      createdAt: Date.now()
    });

    res.json({ success: true, holdId: hold.id });
  }
};
```

### Option C: Sidecar Service (Easiest) ✅ RECOMMENDED

> **NEW:** The sidecar now supports multiple payment providers!

```yaml
# docker-compose.yml
version: '3'
services:
  relay:
    image: scsibug/nostr-rs-relay
    ports:
      - "8080:8080"
    volumes:
      - ./config.toml:/config.toml

  donkeyride:
    image: donkeyride/stake-manager
    ports:
      - "3000:3000"
    environment:
      # Payment Provider (choose one or configure fallbacks)
      - PAYMENT_PROVIDER=lnd
      - PAYMENT_FALLBACKS=btcpay,strike

      # LND config (for trustless staking)
      - LND_HOST=host.docker.internal:10009
      - LND_CERT_PATH=/lnd/tls.cert
      - LND_MACAROON_PATH=/lnd/admin.macaroon

      # BTCPay config (backup)
      - BTCPAY_URL=${BTCPAY_URL}
      - BTCPAY_API_KEY=${BTCPAY_API_KEY}

      # Strike config (backup)
      - STRIKE_API_KEY=${STRIKE_API_KEY}

      # Operator settings
      - OPERATOR_FEE=0.005
      - RELAY_URL=ws://relay:8080
    volumes:
      - ~/.lnd/tls.cert:/lnd/tls.cert:ro
      - ~/.lnd/data/chain/bitcoin/mainnet/admin.macaroon:/lnd/admin.macaroon:ro
    depends_on:
      - relay

  nginx:
    image: nginx
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - relay
      - donkeyride
```

```nginx
# nginx.conf - makes it look like one service
server {
  listen 80;

  # Nostr relay WebSocket
  location / {
    proxy_pass http://relay:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }

  # DonkeyRide REST API
  location /stakes {
    proxy_pass http://donkeyride:3000;
  }

  # Combined NIP-11 info
  location = / {
    if ($http_accept = "application/nostr+json") {
      return 200 '{"name":"combined-relay","donkeyride":{"enabled":true}}';
    }
  }
}
```

## Advantages of Integration

### For Relay Operators
✅ Additional revenue stream (0.5% of rides)
✅ Leverage existing infrastructure
✅ Attract DonkeyRide traffic
✅ Differentiation from other relays
✅ Simple add-on (especially sidecar approach)

### For Users
✅ One less server to discover
✅ Geographic optimization (same relay for events + stakes)
✅ Simplified setup
✅ Better latency (local to relay)

### For The Network
✅ Leverage existing Nostr infrastructure
✅ More operator distribution
✅ Easier onboarding (relay operators already understand Nostr)
✅ Network effects (more relays = more stake services)

## Challenges

### 1. Relay Complexity
**Problem:** Relays should be simple event storage
**Solution:** Make it optional, plugin-based

### 2. Regulatory Concerns
**Problem:** Holding money = MSB/payment processor regulations
**Solution:**
- Use Strike/third-party APIs (they handle compliance)
- Or offer only Lightning hodl invoices (non-custodial)
- Operators choose risk level

### 3. Different Skill Sets
**Problem:** Relay ops know Rust/C++, not payment APIs
**Solution:**
- Provide sidecar Docker image (no code needed)
- Or simple plugin system
- Or managed service (relay operator just configures)

### 4. Trust Model Changes
**Problem:** Users must trust relay with money, not just events
**Solution:**
- Reputation system (track relay stake performance)
- Insurance options
- Multi-sig coordination between relays
- Gradual migration to trustless (Lightning hodl)

## Migration Path

### Phase 1: Separate Services (Current)
```
Nostr relay + DonkeyRide operator = 2 services
```

### Phase 2: Sidecar Integration
```
Relay operators add Docker sidecar
Looks like one service to users
Easy rollback if issues
```

### Phase 3: Native Integration
```
Popular relay software adds native support
strfry-donkeyride, nostr-rs-relay-donkeyride
More efficient, better UX
```

### Phase 4: Standard Feature
```
Most relays offer stakes as standard feature
Like paid relays (NIP-42), stake management becomes common
DonkeyRide ubiquitous
```

## Example: Relay Operator Perspective

```bash
# Current situation: Running strfry relay
docker run -d strfry/strfry

# Revenue: $5/month (if paid relay, many are free)
# Users: 1,000
# Effort: Low

# Add DonkeyRide sidecar:
docker run -d donkeyride/stake-manager \
  -e STRIKE_API_KEY=$KEY \
  -e OPERATOR_FEE=0.005

# New revenue:
# - Keep relay revenue: $5/month
# - Add stake fees: 100 rides/day × 1000 sats × 0.005 = 500 sats/day
# - Total new: ~$15/month
# - 3x revenue increase!

# Effort: 5 minutes to add sidecar
```

## The Killer Feature

**Any existing Nostr relay can become a DonkeyRide operator with one Docker command.**

### Easy Start (Strike)
```bash
docker run -d \
  -e PAYMENT_PROVIDER=strike \
  -e STRIKE_API_KEY=your_key \
  -e OPERATOR_FEE=0.005 \
  -e RELAY_URL=ws://localhost:8080 \
  donkeyride/stake-sidecar

# Now earning fees from rideshare!
```

### Trustless Start (LND) ✨
```bash
docker run -d \
  -e PAYMENT_PROVIDER=lnd \
  -e LND_HOST=localhost:10009 \
  -e LND_CERT_PATH=/lnd/tls.cert \
  -e LND_MACAROON_PATH=/lnd/admin.macaroon \
  -e OPERATOR_FEE=0.005 \
  -v ~/.lnd/tls.cert:/lnd/tls.cert:ro \
  -v ~/.lnd/data/chain/bitcoin/mainnet/admin.macaroon:/lnd/admin.macaroon:ro \
  donkeyride/stake-sidecar

# Trustless staking - you can't steal even if you wanted to!
```

### Resilient Start (Multi-provider)
```bash
docker run -d \
  -e PAYMENT_PROVIDER=lnd \
  -e PAYMENT_FALLBACKS=btcpay,strike,alby \
  [... configure all providers ...] \
  donkeyride/stake-sidecar

# Auto-failover if any provider goes down!
```

Instantly 100+ Nostr relays can become stake providers = massive distribution.
**And now with trustless options!**

## Comparison: Separate vs Integrated

| Aspect | Separate | Integrated |
|--------|----------|------------|
| Setup | 2 services | 1 service (or +sidecar) |
| Discovery | 2 lookups | 1 lookup |
| Latency | Could be far apart | Same location |
| Operator effort | Manage 2 systems | One system |
| Revenue streams | 1 | 2 |
| Code complexity | Lower | Higher (but plugin helps) |

## Recommendation

Start with **Option C (Sidecar)** because:

1. ✅ Easy for relay operators (one Docker command)
2. ✅ No code changes to relay software
3. ✅ Proven pattern (used by monitoring, caching, etc.)
4. ✅ Easy rollback if issues
5. ✅ Can migrate to native integration later

Then gradually move toward native integration as it proves successful.

## Next Steps

1. Build `donkeyride/stake-sidecar` Docker image
2. Write docs for relay operators
3. Partner with 5-10 relays for pilot
4. Gather feedback
5. Iterate
6. Scale to all major relays

---

**The punchline:** There are already ~1,000 Nostr relays running. If even 100 add DonkeyRide stakes, you instantly have 100 competing operators with global distribution. No single service to build. Just plugin code.

This is brilliant - you're leveraging existing infrastructure instead of building parallel infrastructure!
