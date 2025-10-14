# NIP-XX: Relay Stake Management Extension

`draft` `optional`

## Abstract

This NIP extends Nostr relays to provide escrow/stake management services for applications like ridesharing, delivery, and other peer-to-peer markets that require commitment deposits.

## Motivation

Many P2P coordination protocols (ridesharing, delivery, freelancing) need temporary escrow of commitment stakes to prevent ghosting and enforce penalties. Rather than building parallel infrastructure, existing Nostr relays can optionally provide these services as an additional revenue stream.

This creates:
- **Geographic distribution** of escrow services
- **Fee competition** between relay operators
- **Permissionless entry** for new operators
- **User choice** in escrow providers

## Terminology

**Stake Relay**: A Nostr relay that optionally provides stake escrow services in addition to standard event relay functionality.

**Operator**: The entity running a stake relay and providing escrow services.

**Stake**: A refundable security deposit locked during a transaction to ensure commitment.

## Specification

### NIP-11 Extension

Relays advertise stake capabilities in their NIP-11 information document:

```json
{
  "name": "relay.example.com",
  "description": "General purpose relay with stake management",
  "pubkey": "<operator-pubkey>",
  "supported_nips": [1, 2, 11, "XX"],

  "stake_services": {
    "version": "1.0.0",
    "enabled": true,
    "api_endpoint": "https://relay.example.com/api/v1/stakes",
    "websocket_endpoint": "wss://relay.example.com/stakes",

    "fees": {
      "percentage": 0.005,
      "minimum_sats": 1,
      "maximum_sats": 10
    },

    "mechanisms": [
      {
        "type": "custodial",
        "provider": "strike",
        "instant_settlement": true
      },
      {
        "type": "lightning_hodl",
        "requires_node": true,
        "trustless": true
      }
    ],

    "limits": {
      "max_stake_per_user": 10000,
      "max_stake_per_transaction": 5000,
      "min_stake": 50,
      "daily_volume_limit": 1000000
    },

    "trust_model": {
      "custody_type": "custodial|federated|trustless",
      "insurance": {
        "enabled": true,
        "coverage_sats": 100000,
        "provider": "relay-insurance-pool"
      },
      "bonds": {
        "operator_bond": 1000000,
        "bond_address": "bc1q..."
      },
      "reputation": {
        "total_volume": 15234000,
        "successful_releases": 15230,
        "disputes": 4,
        "reputation_score": 99.97
      }
    },

    "geographic_area": {
      "serves": ["US-NY", "US-NJ", "US-CT"],
      "latency_zones": ["north-america-east"]
    },

    "features": [
      "instant_lock",
      "streaming_updates",
      "penalty_enforcement",
      "multi_party_release",
      "dispute_arbitration"
    ],

    "lightning_address": "stakes@relay.example.com"
  }
}
```

### REST API Specification

Stake relays MUST implement the following REST endpoints:

#### 1. Create Stake Session

```http
POST /api/v1/stakes/sessions
Content-Type: application/json
Authorization: Bearer <nostr-auth-token>

{
  "session_id": "ride_abc123",
  "parties": [
    {
      "pubkey": "npub1...",
      "role": "rider",
      "stake_amount": 100
    },
    {
      "pubkey": "npub1...",
      "role": "driver",
      "stake_amount": 150
    }
  ],
  "timeout": 3600,
  "penalty_rules": {
    "early_cancel_percent": 0.5,
    "late_cancel_percent": 0.8,
    "no_show_percent": 1.0
  }
}
```

Response:
```json
{
  "success": true,
  "session_id": "ride_abc123",
  "invoices": [
    {
      "pubkey": "npub1...",
      "amount": 100,
      "invoice": "lnbc100...",
      "expires_at": 1234567890
    },
    {
      "pubkey": "npub1...",
      "amount": 150,
      "invoice": "lnbc150...",
      "expires_at": 1234567890
    }
  ],
  "operator_fee": 1.25,
  "status": "awaiting_payment"
}
```

#### 2. Lock Stake

```http
POST /api/v1/stakes/sessions/{session_id}/lock
Content-Type: application/json
Authorization: Bearer <nostr-auth-token>

{
  "pubkey": "npub1...",
  "payment_proof": {
    "preimage": "...",
    "hash": "..."
  }
}
```

Response:
```json
{
  "success": true,
  "lock_id": "lock_xyz789",
  "amount": 100,
  "locked_at": 1234567890,
  "lock_proof": {
    "signature": "...",
    "mechanism": "strike_hold",
    "provider_tx_id": "..."
  }
}
```

#### 3. Release Stakes (Success)

```http
POST /api/v1/stakes/sessions/{session_id}/release
Content-Type: application/json
Authorization: Bearer <nostr-auth-token>

{
  "completion_proof": {
    "signatures": ["sig1", "sig2"],
    "completion_event_id": "event_..."
  }
}
```

#### 4. Forfeit Stake (Cancellation)

```http
POST /api/v1/stakes/sessions/{session_id}/forfeit
Content-Type: application/json
Authorization: Bearer <nostr-auth-token>

{
  "cancelling_party": "npub1...",
  "reason": "driver_cancelled",
  "cancellation_event_id": "event_..."
}
```

### Authentication

All API requests MUST be authenticated using NIP-98 HTTP Auth:

```http
Authorization: Nostr <base64-encoded-nostr-event>
```

Where the event is kind 27235 with appropriate tags.

### Nostr Event Publication

When stakes change state, the relay publishes events:

#### Stake Lock Event (Kind 30502)
```json
{
  "kind": 30502,
  "pubkey": "<operator-pubkey>",
  "tags": [
    ["d", "ride_abc123_rider"],
    ["session", "ride_abc123"],
    ["party", "<user-pubkey>"],
    ["amount", "100"],
    ["status", "locked"],
    ["mechanism", "custodial"],
    ["proof", "<lock-proof-hash>"],
    ["relay", "wss://relay.example.com"]
  ],
  "content": "Stake locked successfully"
}
```

#### Stake Release Event (Kind 30520)
```json
{
  "kind": 30520,
  "pubkey": "<operator-pubkey>",
  "tags": [
    ["session", "ride_abc123"],
    ["action", "release"],
    ["amount", "250"],
    ["operator_fee", "1.25"]
  ],
  "content": "Stakes released - transaction completed"
}
```

## Implementation Options

### Option A: Sidecar Container (Recommended)

```yaml
# docker-compose.yml
version: '3'
services:
  relay:
    image: scsibug/nostr-rs-relay
    ports:
      - "8080:8080"

  stake-manager:
    image: donkeyride/stake-sidecar
    ports:
      - "3000:3000"
    environment:
      - STRIKE_API_KEY=${STRIKE_API_KEY}
      - OPERATOR_FEE=0.005
      - RELAY_URL=ws://relay:8080

  nginx:
    image: nginx
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
```

**Pros:**
- No code changes to relay
- Easy to deploy
- Easy to roll back
- Can be added to any relay

### Option B: Plugin/Module

For relay software that supports plugins:

```javascript
// relay-plugin.js
module.exports = {
  name: 'donkeyride-stakes',
  version: '1.0.0',

  async onLoad(relay) {
    relay.app.post('/stakes/create', handleCreate);
    relay.app.post('/stakes/:id/lock', handleLock);

    relay.info.stake_services = {
      enabled: true,
      operator_fee: 0.005
    };
  }
};
```

### Option C: Native Integration

Fork existing relay software and add stake management natively.

## Discovery Flow

```javascript
async function findStakeRelays() {
  const relays = ['wss://relay.damus.io', 'wss://nos.lol'];
  const stakeRelays = [];

  for (const relay of relays) {
    const info = await fetch(`https://${relay}/`);
    const data = await info.json();

    if (data.stake_services?.enabled) {
      stakeRelays.push({
        url: relay,
        fee: data.stake_services.fees.percentage,
        reputation: data.stake_services.trust_model.reputation.reputation_score
      });
    }
  }

  return stakeRelays.sort((a, b) => a.fee - b.fee);
}
```

## Security Considerations

### Operator Misbehavior

Detection and enforcement of operator theft is specified in detail in the **Operator Misbehavior Protocol** (see `OPERATOR-MISBEHAVIOR-PROTOCOL.md`).

**Summary:**
1. **Automatic Detection**: Watchdogs monitor lock/release events, flag missing releases after 24h
2. **Standardized Reporting**: Theft reports (kind 30550) with cryptographic evidence
3. **Multi-Party Verification**: 3-of-5 independent verifiers must confirm (kind 30551)
4. **Layered Enforcement**:
   - Reputation slashed to 0 (immediate)
   - Insurance pays victims (immediate)
   - Operator bond slashed via multi-sig (24h guardian vote)
5. **Appeals Process**: Operators can defend with evidence
6. **Public Record**: All steps on Nostr, fully auditable

This creates a system where theft is:
- Quickly detected (< 1 hour)
- Publicly verified (6 hours)
- Automatically punished (immediate)
- Economically unprofitable (lose more than stolen)

### Progressive Trust

New operators should start with low limits:
- First 10 rides: 100 sats max per stake
- 10-100 rides: 500 sats max
- 100+ rides with 99% success: 5000 sats max

### Multiple Trust Layers

Combine:
1. **Reputation** - Social trust
2. **Bonds** - Financial stake
3. **Insurance** - Coverage
4. **Progressive Limits** - Minimize exposure
5. **Multi-Sig** - Distributed trust (for large amounts)
6. **Trustless** - Lightning hodl invoices

See `TRUST-MECHANISMS.md` for detailed analysis of each layer.

## Migration Path

### Phase 1: Custodial (Current)
- Use Strike/custody APIs
- Easy UX
- Fees ~0.5%

### Phase 2: Hybrid
- Offer custodial + Lightning hodl
- Users choose
- Fees ~0.3%

### Phase 3: Trustless
- Pure hodl invoices or DLCs
- Zero custody
- Fees ~0.1%

## References

- [NIP-11: Relay Information Document](https://github.com/nostr-protocol/nips/blob/master/11.md)
- [NIP-42: Authentication](https://github.com/nostr-protocol/nips/blob/master/42.md)
- [NIP-98: HTTP Auth](https://github.com/nostr-protocol/nips/blob/master/98.md)
- [Lightning Hodl Invoices](https://wiki.ion.radar.tech/tech/research/hodl-invoice)

## License

Public Domain
