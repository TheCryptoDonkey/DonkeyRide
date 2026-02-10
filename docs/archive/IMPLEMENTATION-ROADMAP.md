# DonkeyRide Implementation Roadmap

**Goal**: Build a working rideshare system step-by-step
**Approach**: Start simple, iterate, add features progressively
**Time Estimate**: 6-8 weeks to MVP

---

## Phase 0: Infrastructure (Week 1 - Days 1-2)

**Goal**: Get Docker infrastructure running

### ✅ What You Already Have
- `docker-compose.yml` - Complete infrastructure
- `start.sh` - Easy startup script
- Database schema ready
- Nostr relay configured
- Mock Lightning ready

### Tasks

#### Day 1: Infrastructure Setup
```bash
# 1. Configure environment
cp .env.example .env
nano .env  # Add your Nostr keys, Lightning address

# 2. Start infrastructure
./start.sh --dev

# 3. Verify all services healthy
docker-compose ps
curl http://localhost:3000/health
curl http://localhost:8080/health  # Mock Lightning
```

**Success criteria**:
- ✅ All Docker services running
- ✅ PostgreSQL accessible
- ✅ Redis accessible
- ✅ Nostr relay responding
- ✅ Mock Lightning API working

#### Day 2: Basic Operator Backend

Create minimal operator backend to test infrastructure:

**File**: `server.js` (minimal version)

```javascript
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const Redis = require('redis');

const app = express();
app.use(cors());
app.use(express.json());

// Database
const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://donkey:devpassword123@localhost:5432/donkeyride'
});

// Redis
const redis = Redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});
redis.connect();

// Health check
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    await redis.ping();

    res.json({
      status: 'healthy',
      services: {
        database: 'connected',
        redis: 'connected',
        nostr: 'configured',
        lightning: process.env.PAYMENT_PROVIDER
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', error: error.message });
  }
});

// Info endpoint
app.get('/info', (req, res) => {
  res.json({
    operator: process.env.OPERATOR_PUBKEY,
    lightning: process.env.OPERATOR_LIGHTNING,
    fee: process.env.OPERATOR_FEE_PERCENT || '0.005',
    payment_provider: process.env.PAYMENT_PROVIDER || 'mock',
    version: '1.0.0'
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`DonkeyRide Operator running on port ${PORT}`);
});
```

**Test**:
```bash
npm install express cors pg redis
node server.js

# Test endpoints
curl http://localhost:3000/health
curl http://localhost:3000/info
```

**Success criteria**:
- ✅ Server starts without errors
- ✅ Health endpoint returns healthy status
- ✅ Can connect to PostgreSQL
- ✅ Can connect to Redis

---

## Phase 1: Core Protocol (Week 1 - Days 3-7)

**Goal**: Implement minimum viable ride flow

### Milestone 1.1: Nostr Client Integration (Day 3)

Integrate Nostr for event publishing/subscribing.

**Install Nostr tools**:
```bash
npm install nostr-tools websocket-polyfill
```

**File**: `src/nostr-client.js`

```javascript
const { SimplePool, nip19 } = require('nostr-tools');
const { finalizeEvent, getPublicKey } = require('nostr-tools/pure');

class NostrClient {
  constructor(relays, privateKey) {
    this.pool = new SimplePool();
    this.relays = relays;
    this.privateKey = privateKey;
    this.pubkey = getPublicKey(this.privateKey);
  }

  // Publish event
  async publish(event) {
    const signedEvent = finalizeEvent(event, this.privateKey);
    await this.pool.publish(this.relays, signedEvent);
    return signedEvent;
  }

  // Subscribe to events
  subscribe(filters, callback) {
    const sub = this.pool.subscribeMany(this.relays, filters, {
      onevent: callback
    });
    return sub;
  }

  // Query events
  async query(filters) {
    return await this.pool.querySync(this.relays, filters);
  }

  close() {
    this.pool.close(this.relays);
  }
}

module.exports = NostrClient;
```

**Test**:
```javascript
const NostrClient = require('./src/nostr-client');

const client = new NostrClient(
  ['ws://localhost:7777'],
  process.env.OPERATOR_NSEC
);

// Test publish
await client.publish({
  kind: 1,
  content: 'Hello from DonkeyRide!',
  tags: [],
  created_at: Math.floor(Date.now() / 1000)
});

console.log('✅ Nostr client working');
```

### Milestone 1.2: Ride Request (Day 4)

Implement ride request creation (Event Kind 30500).

**File**: `src/rides/request.js`

```javascript
async function createRideRequest(client, db, data) {
  const {
    rider_pubkey,
    pickup_lat,
    pickup_lon,
    pickup_address,
    dropoff_lat,
    dropoff_lon,
    dropoff_address,
    estimated_fare_sats
  } = data;

  // Generate ride ID
  const ride_id = `ride_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Create Nostr event (Kind 30500)
  const event = {
    kind: 30500,
    content: '',
    tags: [
      ['d', ride_id],
      ['rider', rider_pubkey],
      ['pickup_lat', pickup_lat.toString()],
      ['pickup_lon', pickup_lon.toString()],
      ['pickup_address', pickup_address],
      ['dropoff_lat', dropoff_lat.toString()],
      ['dropoff_lon', dropoff_lon.toString()],
      ['dropoff_address', dropoff_address],
      ['estimated_fare', estimated_fare_sats.toString()],
      ['status', 'requested'],
      ['geohash', generateGeohash(pickup_lat, pickup_lon, 5)]
    ],
    created_at: Math.floor(Date.now() / 1000)
  };

  // Publish to Nostr
  const published = await client.publish(event);

  // Store in database
  await db.query(`
    INSERT INTO rides (
      ride_id, rider_pubkey, operator_pubkey,
      pickup_lat, pickup_lon, pickup_address,
      dropoff_lat, dropoff_lon, dropoff_address,
      estimated_fare_sats, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  `, [
    ride_id, rider_pubkey, process.env.OPERATOR_PUBKEY,
    pickup_lat, pickup_lon, pickup_address,
    dropoff_lat, dropoff_lon, dropoff_address,
    estimated_fare_sats, 'requested'
  ]);

  return { ride_id, event: published };
}

function generateGeohash(lat, lon, precision) {
  // Use ngeohash library or implement simple geohash
  // For now, simple implementation
  return `${Math.floor(lat * 100)}_${Math.floor(lon * 100)}`;
}

module.exports = { createRideRequest };
```

**API Endpoint**:
```javascript
app.post('/rides/request', async (req, res) => {
  try {
    const result = await createRideRequest(nostrClient, db, req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**Test**:
```bash
curl -X POST http://localhost:3000/rides/request \
  -H "Content-Type: application/json" \
  -d '{
    "rider_pubkey": "npub1test...",
    "pickup_lat": 40.7580,
    "pickup_lon": -73.9855,
    "pickup_address": "Times Square, NYC",
    "dropoff_lat": 40.7614,
    "dropoff_lon": -73.9776,
    "dropoff_address": "Central Park, NYC",
    "estimated_fare_sats": 5000
  }'
```

### Milestone 1.3: Ride Acceptance (Day 5)

Driver accepts ride (Event Kind 30501).

**File**: `src/rides/accept.js`

```javascript
async function acceptRide(client, db, ride_id, driver_pubkey) {
  // Get ride
  const ride = await db.query('SELECT * FROM rides WHERE ride_id = $1', [ride_id]);
  if (!ride.rows[0]) throw new Error('Ride not found');
  if (ride.rows[0].status !== 'requested') throw new Error('Ride already accepted');

  // Create acceptance event (Kind 30501)
  const event = {
    kind: 30501,
    content: '',
    tags: [
      ['d', `accept_${ride_id}`],
      ['ride_id', ride_id],
      ['driver', driver_pubkey],
      ['rider', ride.rows[0].rider_pubkey],
      ['status', 'accepted']
    ],
    created_at: Math.floor(Date.now() / 1000)
  };

  await client.publish(event);

  // Update database
  await db.query(`
    UPDATE rides
    SET driver_pubkey = $1, status = 'accepted', accepted_at = NOW()
    WHERE ride_id = $2
  `, [driver_pubkey, ride_id]);

  return { ride_id, driver_pubkey, status: 'accepted' };
}

module.exports = { acceptRide };
```

### Milestone 1.4: Ride Lifecycle (Day 6-7)

Implement remaining ride states:

**States**:
1. ✅ `requested` (Day 4)
2. ✅ `accepted` (Day 5)
3. `confirmed` - Rider confirms driver
4. `started` - Driver picks up rider
5. `completed` - Ride finished
6. `cancelled` - Either party cancels

**File**: `src/rides/lifecycle.js`

```javascript
async function confirmRide(client, db, ride_id) {
  // Rider confirms driver (Kind 30504)
  await updateRideStatus(client, db, ride_id, 'confirmed');
}

async function startRide(client, db, ride_id) {
  // Driver starts ride (Kind 30507)
  await updateRideStatus(client, db, ride_id, 'started');
}

async function completeRide(client, db, ride_id) {
  // Driver completes ride (Kind 30508)
  await updateRideStatus(client, db, ride_id, 'completed');
}

async function cancelRide(client, db, ride_id, reason) {
  // Either party cancels (Kind 30506)
  await updateRideStatus(client, db, ride_id, 'cancelled', { reason });
}

async function updateRideStatus(client, db, ride_id, status, metadata = {}) {
  // Publish to Nostr
  const event = {
    kind: 30512, // Status Update
    content: '',
    tags: [
      ['d', `status_${ride_id}_${Date.now()}`],
      ['ride_id', ride_id],
      ['status', status],
      ...Object.entries(metadata).map(([k, v]) => [k, v])
    ],
    created_at: Math.floor(Date.now() / 1000)
  };

  await client.publish(event);

  // Update database
  const statusField = `${status}_at`;
  await db.query(`
    UPDATE rides
    SET status = $1, ${statusField} = NOW(), metadata = $2
    WHERE ride_id = $3
  `, [status, JSON.stringify(metadata), ride_id]);
}

module.exports = { confirmRide, startRide, completeRide, cancelRide };
```

**End of Week 1 Success Criteria**:
- ✅ Infrastructure running smoothly
- ✅ Basic operator backend
- ✅ Nostr integration working
- ✅ Can create ride requests
- ✅ Can accept rides
- ✅ Full ride lifecycle implemented
- ✅ Events published to Nostr
- ✅ Data stored in PostgreSQL

---

## Phase 2: Payments (Week 2)

**Goal**: Integrate Lightning payments (start with mock)

### Milestone 2.1: Mock Lightning Integration (Day 8-9)

**File**: `src/payments/mock-lightning.js`

```javascript
class MockLightningProvider {
  constructor(baseUrl) {
    this.baseUrl = baseUrl || 'http://localhost:8080';
  }

  async createInvoice(amount_sats, memo) {
    const response = await fetch(`${this.baseUrl}/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amount_sats, memo })
    });
    return response.json();
  }

  async createHodlInvoice(amount_sats, payment_hash) {
    const response = await fetch(`${this.baseUrl}/invoice/hodl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amount_sats, hash: payment_hash })
    });
    return response.json();
  }

  async settleHodlInvoice(payment_hash, preimage) {
    const response = await fetch(`${this.baseUrl}/invoice/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_hash, preimage })
    });
    return response.json();
  }

  async checkInvoice(payment_hash) {
    const response = await fetch(`${this.baseUrl}/invoice/${payment_hash}`);
    return response.json();
  }

  async payInvoice(invoice, amount) {
    const response = await fetch(`${this.baseUrl}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice, amount })
    });
    return response.json();
  }
}

module.exports = MockLightningProvider;
```

### Milestone 2.2: Stake Implementation (Day 10-11)

**File**: `src/payments/stakes.js`

```javascript
async function lockStake(lightning, db, ride_id, user_pubkey, amount_sats, user_type) {
  // Create hodl invoice
  const payment_hash = generatePaymentHash();
  const invoice = await lightning.createHodlInvoice(amount_sats, payment_hash);

  // Store in database
  await db.query(`
    UPDATE rides
    SET ${user_type}_stake_sats = $1,
        ${user_type}_stake_invoice = $2,
        ${user_type}_stake_status = 'pending'
    WHERE ride_id = $3
  `, [amount_sats, invoice.invoice, ride_id]);

  // Wait for payment
  // (In real implementation, use webhooks or polling)

  return { invoice: invoice.invoice, payment_hash };
}

async function releaseStake(lightning, db, ride_id, user_type) {
  // Get stake info
  const ride = await db.query(`
    SELECT ${user_type}_stake_invoice, ${user_type}_stake_sats
    FROM rides WHERE ride_id = $1
  `, [ride_id]);

  const { payment_hash } = parseInvoice(ride.rows[0][`${user_type}_stake_invoice`]);

  // Settle hodl invoice (release funds)
  await lightning.settleHodlInvoice(payment_hash, generatePreimage());

  // Update database
  await db.query(`
    UPDATE rides
    SET ${user_type}_stake_status = 'released'
    WHERE ride_id = $1
  `, [ride_id]);
}

function generatePaymentHash() {
  return crypto.randomBytes(32).toString('hex');
}

function generatePreimage() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { lockStake, releaseStake };
```

### Milestone 2.3: Fare Payment (Day 12-13)

**File**: `src/payments/fare.js`

```javascript
async function createFareInvoice(lightning, db, ride_id) {
  const ride = await db.query('SELECT * FROM rides WHERE ride_id = $1', [ride_id]);
  const amount = ride.rows[0].estimated_fare_sats;

  const invoice = await lightning.createInvoice(amount, `Fare for ride ${ride_id}`);

  await db.query(`
    INSERT INTO payments (ride_id, payment_type, invoice, payment_hash, amount_sats, status)
    VALUES ($1, 'fare', $2, $3, $4, 'pending')
  `, [ride_id, invoice.invoice, invoice.payment_hash, amount]);

  return invoice;
}

async function confirmFarePayment(db, payment_hash) {
  await db.query(`
    UPDATE payments
    SET status = 'confirmed', confirmed_at = NOW()
    WHERE payment_hash = $1
  `, [payment_hash]);
}

module.exports = { createFareInvoice, confirmFarePayment };
```

**End of Week 2 Success Criteria**:
- ✅ Mock Lightning integration working
- ✅ Can create and check invoices
- ✅ Stake locking implemented
- ✅ Stake release implemented
- ✅ Fare payment flow working
- ✅ Payments stored in database

---

## Phase 3: WebSocket Real-Time (Week 3)

**Goal**: Real-time location updates and ride status

### Milestone 3.1: WebSocket Server (Day 14-15)

**File**: `src/websocket/server.js`

```javascript
const WebSocket = require('ws');

class WebSocketServer {
  constructor(port) {
    this.wss = new WebSocket.Server({ port });
    this.clients = new Map(); // ride_id => Set of WebSocket connections

    this.wss.on('connection', (ws, req) => {
      ws.on('message', (data) => this.handleMessage(ws, data));
      ws.on('close', () => this.handleClose(ws));
    });
  }

  handleMessage(ws, data) {
    const message = JSON.parse(data);

    switch (message.type) {
      case 'subscribe':
        this.subscribe(ws, message.ride_id, message.user_pubkey);
        break;
      case 'location_update':
        this.broadcastLocation(message.ride_id, message.location);
        break;
      case 'status_update':
        this.broadcastStatus(message.ride_id, message.status);
        break;
    }
  }

  subscribe(ws, ride_id, user_pubkey) {
    ws.ride_id = ride_id;
    ws.user_pubkey = user_pubkey;

    if (!this.clients.has(ride_id)) {
      this.clients.set(ride_id, new Set());
    }
    this.clients.get(ride_id).add(ws);

    ws.send(JSON.stringify({ type: 'subscribed', ride_id }));
  }

  broadcastLocation(ride_id, location) {
    const clients = this.clients.get(ride_id);
    if (!clients) return;

    const message = JSON.stringify({
      type: 'location_update',
      ride_id,
      location,
      timestamp: Date.now()
    });

    clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  broadcastStatus(ride_id, status) {
    const clients = this.clients.get(ride_id);
    if (!clients) return;

    const message = JSON.stringify({
      type: 'status_update',
      ride_id,
      status,
      timestamp: Date.now()
    });

    clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  handleClose(ws) {
    if (ws.ride_id) {
      const clients = this.clients.get(ws.ride_id);
      if (clients) {
        clients.delete(ws);
        if (clients.size === 0) {
          this.clients.delete(ws.ride_id);
        }
      }
    }
  }
}

module.exports = WebSocketServer;
```

### Milestone 3.2: Location Updates (Day 16-17)

**File**: `src/location/tracking.js`

```javascript
async function updateLocation(db, redis, wsServer, data) {
  const { ride_id, pubkey, lat, lon, accuracy, heading, speed } = data;

  // Store in Redis (fast, temporary)
  await redis.set(
    `location:${ride_id}:${pubkey}`,
    JSON.stringify({ lat, lon, accuracy, heading, speed, timestamp: Date.now() }),
    { EX: 3600 } // Expire after 1 hour
  );

  // Store in database (every 10th update or significant change)
  if (shouldPersist(data)) {
    await db.query(`
      INSERT INTO location_updates (ride_id, pubkey, lat, lon, accuracy, heading, speed)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [ride_id, pubkey, lat, lon, accuracy, heading, speed]);
  }

  // Broadcast to WebSocket clients
  wsServer.broadcastLocation(ride_id, { lat, lon, heading, speed, accuracy });

  // Calculate ETA (if OSRM available)
  const eta = await calculateETA(lat, lon, dropoff_lat, dropoff_lon);

  return { success: true, eta };
}

function shouldPersist(data) {
  // Persist every 10th update or if significant change
  return Math.random() < 0.1;
}

async function calculateETA(from_lat, from_lon, to_lat, to_lon) {
  try {
    const response = await fetch(
      `${process.env.OSRM_URL}/route/v1/driving/${from_lon},${from_lat};${to_lon},${to_lat}?overview=false`
    );
    const data = await response.json();
    return data.routes[0].duration; // seconds
  } catch (error) {
    return null;
  }
}

module.exports = { updateLocation };
```

**End of Week 3 Success Criteria**:
- ✅ WebSocket server running
- ✅ Clients can subscribe to ride updates
- ✅ Location updates broadcast in real-time
- ✅ Status updates broadcast in real-time
- ✅ Location stored in Redis + PostgreSQL
- ✅ ETA calculated with OSRM

---

## Phase 4: Mobile Apps (Week 4-5)

**Goal**: Build rider and driver mobile apps

### Technology Choice

**Recommended**: React Native (single codebase for iOS + Android)

```bash
npx react-native init DonkeyRide
cd DonkeyRide
npm install @react-native-community/geolocation react-native-maps nostr-tools
```

### Milestone 4.1: Rider App (Week 4)

**Screens**:
1. Home - Map with current location
2. Request Ride - Select pickup/dropoff
3. Waiting - Searching for driver
4. Ride Active - Track driver in real-time
5. Complete - Rate driver

### Milestone 4.2: Driver App (Week 4)

**Screens**:
1. Dashboard - Go online/offline
2. Incoming Requests - Accept/decline
3. En Route to Pickup - Navigation
4. Ride Active - Navigate to dropoff
5. Complete - Rate rider

**End of Week 4-5 Success Criteria**:
- ✅ Rider app can request rides
- ✅ Driver app can accept rides
- ✅ Real-time location tracking works
- ✅ Basic navigation working
- ✅ Payments integrated
- ✅ Apps connect to backend API

---

## Phase 5: Polish & Production (Week 6-8)

### Week 6: Features
- Ratings system
- Dispute filing
- Push notifications
- Ride history
- Profile management

### Week 7: Testing
- Integration tests
- Load testing
- Security audit
- Bug fixes

### Week 8: Deployment
- Deploy to production
- SSL certificates
- Domain setup
- Monitoring
- First real rides!

---

## Summary: What to Build When

### Week 1: Foundation
- Day 1-2: Infrastructure + basic server
- Day 3: Nostr integration
- Day 4: Ride requests
- Day 5: Ride acceptance
- Day 6-7: Full ride lifecycle

### Week 2: Payments
- Day 8-9: Mock Lightning integration
- Day 10-11: Stakes
- Day 12-13: Fare payments
- Day 14: End-to-end payment flow

### Week 3: Real-Time
- Day 15-16: WebSocket server
- Day 17-18: Location tracking
- Day 19-20: ETA calculation
- Day 21: Polish

### Week 4-5: Mobile
- Week 4: Rider app (5 screens)
- Week 5: Driver app (5 screens)

### Week 6-8: Polish
- Week 6: Additional features
- Week 7: Testing
- Week 8: Production deployment

---

## Next Immediate Steps

1. **Right Now**: Start Phase 0, Day 1
   ```bash
   ./start.sh --dev
   ```

2. **Today**: Get infrastructure healthy

3. **Tomorrow**: Build basic operator server

4. **This Week**: Complete Phase 1 (Core Protocol)

---

## Dependencies Between Phases

**Must Complete in Order**:
- Phase 0 → Phase 1 (need infrastructure for protocol)
- Phase 1 → Phase 2 (need rides before payments)
- Phase 2 → Phase 3 (payments before real-time)
- Phase 3 → Phase 4 (backend before apps)

**Can Parallelize**:
- Rider app + Driver app (Week 4-5)
- Testing + Feature additions (Week 6-7)

---

## Success Metrics

### MVP (End of Week 5)
- ✅ Backend API running
- ✅ Mobile apps functional
- ✅ Can complete end-to-end ride
- ✅ Payments working (mock)
- ✅ Real-time tracking working

### Production (End of Week 8)
- ✅ Deployed to production
- ✅ Real Lightning integration
- ✅ 10+ successful test rides
- ✅ Security audit passed
- ✅ Monitoring in place

---

**Ready to start? Begin with Phase 0, Day 1! 🚀**
