# DonkeyRide MVP Implementation Plan

**Goal**: Build a working end-to-end ridesharing demo in ~2-3 hours

---

## What the MVP Will Do

### User Flow
1. **Rider** opens simple web UI
2. **Rider** sees map with 10 moving drivers
3. **Rider** clicks "Request Ride" (pickup/dropoff on map)
4. **System** broadcasts ride request to all drivers via WebSocket
5. **Driver** (automated) accepts ride within seconds
6. **Rider** sees "Driver John is coming!" with real-time updates
7. **Driver** drives to pickup location (simulated movement)
8. **Rider** sees "Driver arrived!" notification
9. **Driver** starts trip, drives to dropoff
10. **Rider** sees live tracking during trip
11. **Trip** completes, payment processes (mocked)
12. **Both** see completion confirmation

**Total time**: ~2-3 minutes per ride demo

---

## MVP Features

### ✅ Must Have (Core)
- [x] Ride request API
- [ ] Driver auto-accept (first available)
- [ ] Real-time position updates (WebSocket)
- [ ] Ride status tracking (requested → matched → pickup → active → completed)
- [ ] Simple rider UI (one page)
- [ ] Simulated driver movement to pickup/dropoff
- [ ] Mock payment flow
- [ ] Trip completion

### 🔄 Nice to Have (If Time)
- [ ] Multiple rides simultaneously
- [ ] Driver selection (pick specific driver)
- [ ] Rating system
- [ ] Trip history
- [ ] Cost breakdown display

### ❌ Not in MVP (Future)
- Real Lightning payments
- Dispute resolution
- Nostr event publishing
- Multi-operator routing
- Real navigation (OSRM)
- Mobile apps

---

## Architecture

```
┌─────────────────┐
│   Rider UI      │  (Browser at http://localhost:3000/rider.html)
│   (HTML+JS)     │
└────────┬────────┘
         │ HTTP + WebSocket
         ↓
┌─────────────────┐
│  Backend API    │  (Express server on port 3000)
│  (server.js)    │
└────────┬────────┘
         │ In-memory + Redis
         ↓
┌─────────────────┐
│ Driver Simulator│  (Node script)
│ (auto-accepts)  │
└─────────────────┘
```

---

## Implementation Steps

### Step 1: Ride Request API (30 min)

**New endpoints**:
```javascript
POST /api/rides/request
{
  "pickup_lat": 40.7580,
  "pickup_lon": -73.9855,
  "dropoff_lat": 40.7829,
  "dropoff_lon": -73.9712,
  "rider_npub": "npub1..."
}

Response:
{
  "ride_id": "ride_abc123",
  "status": "requested",
  "estimated_fare": 5000  // sats
}
```

**What it does**:
- Generate unique ride_id
- Calculate fare estimate
- Store ride in memory (activeRides Map)
- Broadcast to all connected drivers via WebSocket
- Return ride_id to rider

---

### Step 2: Driver Auto-Accept (30 min)

**Update simulate-drivers.js**:
- Connect to WebSocket server
- Listen for ride requests
- First available driver auto-accepts
- Simulate movement to pickup location

**Flow**:
```javascript
// Driver receives ride request
ws.on('message', (msg) => {
  if (msg.type === 'ride_request') {
    // Accept if available and within 5km
    if (available && distance < 5) {
      acceptRide(msg.ride_id);
    }
  }
});
```

---

### Step 3: Simple Rider UI (45 min)

**Create `public/rider.html`**:

```html
<!DOCTYPE html>
<html>
<head>
  <title>DonkeyRide - Request a Ride</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
</head>
<body>
  <div id="app">
    <!-- Map -->
    <div id="map" style="height: 60vh;"></div>

    <!-- Controls -->
    <div id="controls">
      <button id="request-ride">Request Ride</button>
      <div id="status">Click on map to set pickup and dropoff</div>
    </div>

    <!-- Ride Info -->
    <div id="ride-info" style="display: none;">
      <h3>Your Ride</h3>
      <p id="driver-name"></p>
      <p id="ride-status"></p>
      <p id="eta"></p>
    </div>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="/rider-app.js"></script>
</body>
</html>
```

**Features**:
- Click map to set pickup (first click)
- Click map to set dropoff (second click)
- "Request Ride" button
- Real-time status updates
- Driver location tracking
- ETA display

---

### Step 4: WebSocket Real-Time Updates (30 min)

**Backend WebSocket messages**:

```javascript
// To rider
{
  type: 'ride_matched',
  ride_id: 'ride_123',
  driver: { name: 'John', location: {...} }
}

{
  type: 'driver_location',
  ride_id: 'ride_123',
  location: { lat: 40.7580, lon: -73.9855 },
  eta_seconds: 180
}

{
  type: 'driver_arrived',
  ride_id: 'ride_123'
}

{
  type: 'trip_started',
  ride_id: 'ride_123'
}

{
  type: 'trip_completed',
  ride_id: 'ride_123',
  fare: 5000
}
```

**To all drivers**:
```javascript
{
  type: 'ride_request',
  ride_id: 'ride_123',
  pickup: { lat: 40.7580, lon: -73.9855 },
  dropoff: { lat: 40.7829, lon: -73.9712 },
  fare: 5000
}
```

---

### Step 5: Ride Status State Machine (20 min)

```javascript
const RideStatus = {
  REQUESTED: 'requested',       // Rider requested, waiting for driver
  MATCHED: 'matched',           // Driver accepted
  DRIVER_EN_ROUTE: 'en_route',  // Driver going to pickup
  DRIVER_ARRIVED: 'arrived',    // Driver at pickup
  ACTIVE: 'active',             // Trip in progress
  COMPLETED: 'completed',       // Trip finished
  CANCELLED: 'cancelled'        // Cancelled by rider/driver
};

// State transitions
requested → matched → en_route → arrived → active → completed
```

---

### Step 6: Simulated Driver Movement (20 min)

**Movement algorithm**:
```javascript
function moveTowardsDestination(current, destination, speedKmh, intervalSec) {
  const distance = calculateDistance(current, destination);
  const maxMove = (speedKmh / 3600) * intervalSec; // km

  if (distance <= maxMove) {
    // Arrived!
    return destination;
  }

  // Move towards destination
  const ratio = maxMove / distance;
  return {
    lat: current.lat + (destination.lat - current.lat) * ratio,
    lon: current.lon + (destination.lon - current.lon) * ratio
  };
}
```

**Update every 2 seconds** during active ride.

---

### Step 7: Mock Payment (10 min)

```javascript
async function processPayment(ride) {
  // Mock Lightning payment
  console.log(`Processing payment: ${ride.fare} sats`);

  // Simulate delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  return {
    success: true,
    payment_hash: 'mock_hash_' + Date.now(),
    preimage: 'mock_preimage'
  };
}
```

---

## File Structure

```
/DonkeyRide/
├── server.js                      # Update with ride APIs
├── public/
│   ├── rider.html                 # NEW: Simple rider UI
│   ├── rider-app.js               # NEW: Rider app logic
│   └── demo.html                  # Existing demo
├── scripts/
│   ├── simulate-drivers.js        # UPDATE: Add auto-accept
│   └── simulate-drivers-smart.js  # NEW: Smart simulator
└── src/
    └── ride-manager.js            # NEW: Ride state management
```

---

## API Endpoints (Full List)

```
# Existing
GET  /api/drivers/available
POST /api/trips/estimate
GET  /api/prices/btc

# New for MVP
POST /api/rides/request          # Request a ride
POST /api/rides/:id/accept       # Driver accepts
POST /api/rides/:id/arrive       # Driver arrived at pickup
POST /api/rides/:id/start        # Start trip
POST /api/rides/:id/complete     # Complete trip
GET  /api/rides/:id              # Get ride status
GET  /api/rides/:id/location     # Get current driver location
```

---

## WebSocket Events

```
# Client → Server
{type: 'subscribe_ride', ride_id: '...'}

# Server → Client (Rider)
{type: 'ride_matched', driver: {...}}
{type: 'driver_location', location: {...}, eta: 120}
{type: 'driver_arrived'}
{type: 'trip_started'}
{type: 'trip_completed', fare: 5000}

# Server → Client (Drivers)
{type: 'ride_request', ride_id: '...', pickup: {...}, dropoff: {...}}
{type: 'ride_cancelled', ride_id: '...'}
```

---

## Testing Scenarios

### Scenario 1: Happy Path
1. Start backend: `npm start`
2. Start driver simulator: `node scripts/simulate-drivers-smart.js`
3. Open rider UI: `http://localhost:3000/rider.html`
4. Click map twice (pickup/dropoff)
5. Click "Request Ride"
6. Watch driver accept and drive to pickup
7. Watch trip progress to dropoff
8. See completion confirmation

**Expected time**: 2-3 minutes

---

### Scenario 2: Multiple Rides
1. Open 2 browser windows
2. Request ride in both
3. Different drivers accept
4. Both rides proceed simultaneously

---

### Scenario 3: No Drivers Available
1. Stop driver simulator
2. Request ride
3. See "No drivers available" message
4. Timeout after 30 seconds

---

## Success Criteria

MVP is successful if:

- [ ] Rider can request a ride via UI
- [ ] Driver automatically accepts within 5 seconds
- [ ] Rider sees driver location in real-time
- [ ] Driver moves to pickup location
- [ ] Trip starts when driver arrives
- [ ] Driver moves to dropoff location
- [ ] Trip completes with payment confirmation
- [ ] All updates happen in real-time (< 3 second delay)
- [ ] Works reliably for 10+ consecutive rides

---

## Timeline

| Task | Time | Cumulative |
|------|------|------------|
| Ride Request API | 30 min | 0:30 |
| Driver Auto-Accept | 30 min | 1:00 |
| Rider UI | 45 min | 1:45 |
| WebSocket Updates | 30 min | 2:15 |
| State Machine | 20 min | 2:35 |
| Driver Movement | 20 min | 2:55 |
| Mock Payment | 10 min | 3:05 |
| Testing & Polish | 25 min | 3:30 |

**Total**: ~3.5 hours

---

## Implementation Order

1. ✅ Create this plan
2. **Backend first** (ride APIs, WebSocket)
3. **Driver simulator** (auto-accept, movement)
4. **Rider UI** (simple interface)
5. **Integration** (wire everything together)
6. **Testing** (end-to-end scenarios)

---

## What We Already Have

✅ Infrastructure (Docker, Redis, PostgreSQL, Nostr)
✅ Driver location tracking
✅ Cost estimation
✅ BTC price fetching
✅ Demo UI (for viewing drivers)
✅ Test user generation

**We're ~60% there!** Just need to add ride lifecycle.

---

## What's After MVP

Once MVP works:

1. **Add Nostr publishing** (broadcast events to protocol)
2. **Multi-operator routing** (use multi-operator setup)
3. **Real Lightning payments** (integrate with mock-lightning)
4. **Mobile apps** (React Native)
5. **Production hardening** (error handling, validation)

---

## Development Setup

```bash
# Terminal 1: Infrastructure
./start.sh --dev

# Terminal 2: Generate test users (if not done)
node scripts/setup-test-environment.js

# Terminal 3: Backend
npm start

# Terminal 4: Smart driver simulator
node scripts/simulate-drivers-smart.js

# Browser: Rider UI
open http://localhost:3000/rider.html
```

---

## Key Technical Decisions

### 1. In-Memory State (Not Database)
- Faster for MVP
- Good enough for demo
- Can add persistence later

### 2. Auto-Accept (Not Manual)
- Simplifies demo
- Shows working system immediately
- Can add driver UI later

### 3. Mock Payments (Not Real Lightning)
- Focus on ride flow first
- Lightning integration is independent
- Can swap in later

### 4. WebSocket (Not Polling)
- Real-time is crucial for UX
- More impressive demo
- Scales better

### 5. Simple UI (Not React)
- Faster to build
- Less complexity
- Can rebuild in React later

---

## Expected Demo Flow (Video Script)

```
[Open rider.html]

"Here's DonkeyRide - a federated ridesharing protocol.
You can see 10 drivers moving around New York City in real-time.

Let me request a ride.
I'll click here for my pickup location... [click]
And here for my destination... [click]

Now I'll request the ride... [click button]

Within seconds, a driver accepts!
You can see Driver 3 is now heading to my pickup location.

The system is calculating the route in real-time.
ETA: 2 minutes.

[Wait for driver to arrive]

Driver arrived! Now the trip is starting.

You can see the driver following the route to my destination.
All of this is happening over WebSocket - completely real-time.

[Wait for completion]

Trip completed! Payment processed via Lightning (mocked for now).

The entire ride took about 2 minutes to demonstrate.

What's cool is that all of this is:
- Using an open protocol (Nostr)
- Federated (multiple operators)
- Real-time (WebSocket)
- Bitcoin-native (Lightning payments)

And anyone can run their own operator and earn fees!"
```

---

## Let's Build It! 🚀

**Next**: Implement ride request API endpoint

Ready to start?
