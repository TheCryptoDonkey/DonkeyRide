# DonkeyRide MVP - Testing Guide

**Run a complete end-to-end ridesharing demo in ~3 minutes!**

---

## Quick Start (4 Simple Steps)

### Step 1: Start Infrastructure (Terminal 1)

```bash
./start.sh --dev
```

Wait for: "All services are healthy!"

---

### Step 2: Generate Test Users (one-time)

If you haven't already:

```bash
node scripts/setup-test-environment.js
```

---

### Step 3: Start Smart Drivers (Terminal 2)

```bash
node scripts/simulate-drivers-smart.js
```

You should see:
```
✅ All drivers online and ready for rides!
📡 Listening for ride requests via WebSocket
🤖 Drivers will auto-accept rides within 10km
```

---

### Step 4: Start Backend (Terminal 3)

```bash
npm start
```

Wait for server to start, then open:

```bash
open http://localhost:3000/rider.html
```

---

## Using the Rider App

### Request a Ride

1. **Click on the map** to set pickup location (blue marker 📍)
2. **Click again** to set dropoff location (red marker 🎯)
3. **Click "Request Ride"** button
4. **Watch the magic happen!**

### What You'll See

```
[Requesting ride...]
  ↓
[Driver accepts within 2 seconds]
  ↓
[Driver marker (🚗) appears on map]
  ↓
[Driver moves towards pickup]
  ↓
[ETA counts down]
  ↓
[Driver arrives at pickup]
  ↓
[Trip starts]
  ↓
[Driver moves to dropoff]
  ↓
[Trip completes]
  ↓
[Payment processed]
  ↓
[Success!]
```

**Total time**: ~1-2 minutes per ride (depending on distance)

---

## What Happens Behind the Scenes

### 1. Ride Request

**Rider clicks "Request Ride"**
```
POST /api/rides/request
{
  pickup_lat: 40.7580,
  pickup_lon: -73.9855,
  dropoff_lat: 40.7829,
  dropoff_lon: -73.9712
}
```

**Backend**:
- Creates ride in RideManager
- Calculates fare estimate
- Broadcasts to all drivers via WebSocket

---

### 2. Driver Accepts

**Smart driver simulator** (within 2 seconds):
- Receives ride request via WebSocket
- Checks distance (must be within 10km)
- Auto-accepts

```
POST /api/rides/ride_abc123/accept
{
  driver_npub: "npub1...",
  driver_name: "Driver 1",
  driver_location: {...},
  driver_rating: 4.8
}
```

**Backend**:
- Matches driver to ride
- Calculates ETA
- Notifies rider via WebSocket

---

### 3. Driver En Route

**Driver simulator**:
- Moves towards pickup at 40 km/h
- Updates location every 2 seconds

```
POST /api/rides/ride_abc123/location
{
  lat: 40.7585,
  lon: -73.9860
}
```

**Backend**:
- Calculates updated ETA
- Broadcasts to rider

**Rider UI**:
- Driver marker moves in real-time
- ETA updates every 2 seconds

---

### 4. Driver Arrives

**Driver simulator**:
- Detects arrival (within 100m of pickup)
- Calls arrive endpoint

```
POST /api/rides/ride_abc123/arrive
```

**Rider UI**:
- Shows "Driver has arrived!"
- Waits 3 seconds (simulation)

---

### 5. Trip Starts

**Driver simulator**:
- Automatically starts trip after 3 seconds

```
POST /api/rides/ride_abc123/start
```

**Rider UI**:
- Updates status: "Trip in progress"
- Route line turns green

---

### 6. Trip Active

**Driver simulator**:
- Moves towards dropoff at 40 km/h
- Updates location every 2 seconds

**Rider UI**:
- Driver marker moves towards destination
- Real-time tracking

---

### 7. Trip Completes

**Driver simulator**:
- Detects arrival at dropoff
- Calls complete endpoint

```
POST /api/rides/ride_abc123/complete
```

**Backend**:
- Processes mock payment
- Updates ride status
- Notifies rider

**Rider UI**:
- Shows completion message
- Displays fare and duration
- Shows success alert
- Resets for next ride

---

## Testing Scenarios

### Scenario 1: Short Trip (1 minute)

1. Set pickup and dropoff close together (< 1km)
2. Request ride
3. Driver arrives quickly
4. Trip completes in ~30-60 seconds

**Perfect for rapid testing!**

---

### Scenario 2: Long Trip (2-3 minutes)

1. Set pickup and dropoff far apart (3-5km)
2. Request ride
3. Watch driver navigate across map
4. Trip takes 2-3 minutes

**Great for demos!**

---

### Scenario 3: Multiple Rides

1. Open **2 browser tabs**: `http://localhost:3000/rider.html`
2. Request ride in Tab 1
3. Immediately request ride in Tab 2
4. Watch different drivers accept each ride
5. Both rides proceed simultaneously

**Demonstrates multi-ride capability!**

---

### Scenario 4: No Drivers Available

1. Stop driver simulator (Ctrl+C in Terminal 2)
2. Try to request ride
3. Should show "Requesting ride..." but never match
4. Restart drivers to fix

---

## Console Logs

### Backend Server (Terminal 3)

```
✅ Ride created: ride_abc123 (npub_test_rider)
📢 Broadcast ride request ride_abc123 to 10 drivers
✅ Ride ride_abc123 matched with driver npub1...
🚗 Driver en route to pickup for ride ride_abc123
📍 Driver arrived at pickup for ride ride_abc123
🚀 Trip started for ride ride_abc123
✅ Trip completed for ride ride_abc123 (45s)
```

---

### Smart Driver Simulator (Terminal 2)

```
✋ Driver 1 accepting ride ride_abc123...
✅ Driver 1 accepted ride ride_abc123
   ETA to pickup: 1 min
📍 Driver 1 arrived at pickup
🚀 Driver 1 starting trip
🎯 Driver 1 arrived at dropoff
✅ Driver 1 completed ride ride_abc123
```

---

### Browser Console (Rider UI)

```
DonkeyRide Rider App initialized
Connected to WebSocket
Ride update: {type: 'ride_matched', ...}
Ride update: {type: 'driver_location', ...}
Ride update: {type: 'driver_arrived'}
Ride update: {type: 'trip_started'}
Ride update: {type: 'trip_completed'}
```

---

## API Endpoints Used

| Endpoint | Method | Purpose | When Called |
|----------|--------|---------|-------------|
| `/api/rides/request` | POST | Request ride | Rider clicks button |
| `/api/rides/:id/accept` | POST | Accept ride | Driver auto-accepts |
| `/api/rides/:id/location` | POST | Update location | Every 2 seconds |
| `/api/rides/:id/arrive` | POST | Mark arrival | Driver reaches pickup |
| `/api/rides/:id/start` | POST | Start trip | After pickup |
| `/api/rides/:id/complete` | POST | Complete trip | Arrive at dropoff |
| `/api/rides/:id` | GET | Get ride status | As needed |

---

## WebSocket Events

### Server → Rider

| Event | When | Data |
|-------|------|------|
| `ride_matched` | Driver accepts | Driver info, ETA |
| `driver_location` | Every 2s | Location, ETA |
| `driver_arrived` | At pickup | Arrival confirmation |
| `trip_started` | Trip begins | Trip info |
| `trip_completed` | Trip ends | Fare, duration |

### Server → Drivers

| Event | When | Data |
|-------|------|------|
| `ride_request` | Ride requested | Pickup, dropoff, fare |
| `ride_cancelled` | Ride cancelled | Ride ID |

---

## Troubleshooting

### Problem: No drivers accept ride

**Solution**:
1. Check driver simulator is running (Terminal 2)
2. Make sure drivers are within 10km of pickup
3. Try pickup/dropoff locations closer to Times Square (40.7580, -73.9855)

---

### Problem: WebSocket not connecting

**Solution**:
1. Check backend is running on port 3000
2. Check WebSocket port 3001 is not blocked
3. Check browser console for errors
4. Try refreshing the page

---

### Problem: Driver doesn't move

**Solution**:
1. Check backend console for errors
2. Check driver simulator console for errors
3. Verify Redis is running (`docker ps`)
4. Restart driver simulator

---

### Problem: Ride gets stuck

**Solution**:
1. Refresh rider UI page
2. Restart driver simulator
3. Restart backend server
4. Check for errors in all consoles

---

## Performance Expectations

| Metric | Expected Value |
|--------|---------------|
| Time to driver acceptance | 2-3 seconds |
| Location update frequency | Every 2 seconds |
| Driver speed | 40 km/h |
| ETA accuracy | ±30 seconds |
| Total ride time (1km) | ~1 minute |
| Total ride time (5km) | ~2-3 minutes |

---

## Success Checklist

Your MVP is working if:

- [ ] Rider UI loads without errors
- [ ] Can set pickup and dropoff on map
- [ ] "Request Ride" button enables when both set
- [ ] Driver accepts within 5 seconds
- [ ] Driver marker appears on map
- [ ] Driver moves towards pickup in real-time
- [ ] ETA counts down
- [ ] "Driver arrived" notification shows
- [ ] Trip starts automatically
- [ ] Driver moves towards dropoff
- [ ] Trip completes with success message
- [ ] Can request another ride immediately

---

## Next Steps

Once MVP works:

### Immediate Improvements
- [ ] Show all online drivers on map (not just matched driver)
- [ ] Allow rider to cancel ride
- [ ] Show ride history
- [ ] Add driver selection (choose specific driver)
- [ ] Show fare breakdown

### Phase 2
- [ ] Publish events to Nostr protocol
- [ ] Multi-operator routing
- [ ] Real Lightning payments
- [ ] Driver rating system
- [ ] Dispute handling

### Phase 3
- [ ] React Native mobile apps
- [ ] Production deployment
- [ ] Real GPS navigation (OSRM)
- [ ] Analytics dashboard
- [ ] Operator management UI

---

## Demo Script (for showing others)

```
[Open rider.html in browser]

"This is DonkeyRide - a federated ridesharing protocol built on Nostr and Lightning.

Let me request a ride.

[Click map for pickup]
Here's my pickup location.

[Click map for dropoff]
And here's where I want to go.

[Click Request Ride]
Now I'll request the ride...

[Wait 2 seconds]
Within seconds, a driver accepts! You can see Driver 3 is now heading to my location.

The system calculates the ETA in real-time - currently showing 2 minutes.

[Watch driver move]
You can see the driver moving across the map in real-time. All updates happen via WebSocket.

[Driver arrives]
Driver has arrived at the pickup!

[Trip starts]
Trip is starting now... heading to the destination.

[Driver moves to dropoff]
You can track the entire journey in real-time.

[Trip completes]
Trip completed! Payment processed via Lightning.

The entire ride took about 2 minutes to demonstrate.

What's powerful is that this uses:
- Open Nostr protocol for coordination
- WebSocket for real-time updates
- Lightning Network for payments
- And any operator can run their own backend

No centralized control, no platform lock-in!"
```

---

## Architecture Diagram

```
┌──────────────┐
│  Rider UI    │ (Browser)
│ (rider.html) │
└──────┬───────┘
       │ HTTP + WebSocket
       ↓
┌──────────────┐
│ Backend API  │ (Express on port 3000)
│ (server.js)  │
└──────┬───────┘
       │ RideManager (in-memory)
       │ WebSocket (port 3001)
       ↓
┌────────────────┐
│ Smart Drivers  │ (Node script)
│ (10 simulators)│
└────────────────┘
```

---

## URLs

- **Rider UI**: http://localhost:3000/rider.html
- **Demo UI** (old): http://localhost:3000/demo.html
- **API Health**: http://localhost:3000/health
- **Ride Stats**: http://localhost:3000/api/rides/stats
- **Adminer** (DB): http://localhost:8081
- **Redis UI**: http://localhost:8082

---

## Quick Test

Run this in a new terminal to test the API directly:

```bash
# Request a ride
curl -X POST http://localhost:3000/api/rides/request \
  -H "Content-Type: application/json" \
  -d '{
    "pickup_lat": 40.7580,
    "pickup_lon": -73.9855,
    "dropoff_lat": 40.7829,
    "dropoff_lon": -73.9712
  }'

# Check ride stats
curl http://localhost:3000/api/rides/stats | jq
```

---

**Time to complete first ride**: ~1-2 minutes
**Setup time**: ~2 minutes
**Total demo time**: ~5 minutes

**Ready to test! 🚀**

Open: http://localhost:3000/rider.html
