# Quick Start Testing Guide

**Get the demo running in 5 minutes**

---

## Prerequisites

- Docker installed and running
- Node.js 18+ installed
- Terminal access

---

## Step-by-Step Commands

### 1. Install Dependencies (1 minute)

```bash
npm install
```

This installs:
- redis
- pg (PostgreSQL client)
- node-fetch
- All existing dependencies

---

### 2. Start Infrastructure (2 minutes)

```bash
./start.sh --dev
```

**What this starts**:
- ✅ Nostr relay (port 7777)
- ✅ PostgreSQL (port 5432)
- ✅ Redis (port 6379)
- ✅ Mock Lightning (port 8080)
- ✅ OSRM navigation (port 5000)
- ✅ Adminer DB UI (port 8081)
- ✅ Redis Commander (port 8082)

**Wait for**: "All services are healthy!"

---

### 3. Generate Test Users (30 seconds)

In a **new terminal**:

```bash
node scripts/setup-test-environment.js
```

**Output**:
```
✅ Generated 10 drivers
✅ Generated 5 riders
✅ Seeded PostgreSQL
✅ Saved to test-users.json
```

---

### 4. Simulate Drivers (30 seconds)

In the **same terminal**:

```bash
node scripts/simulate-drivers.js
```

**Output**:
```
🟢 Driver 1 going online...
🟢 Driver 2 going online...
...
✅ All drivers online and moving!
📍 Drivers are updating locations every 5 seconds
```

**Keep this running!** (Ctrl+C to stop later)

---

### 5. Start Backend Server (30 seconds)

In **another new terminal**:

```bash
npm start
```

**Output**:
```
========================================
DonkeyRide Operator Server
========================================
✅ Payment provider initialized: Mock
✅ Redis connected
✅ BTC prices fetched

Server running at http://localhost:3000
Demo UI at http://localhost:3000/demo.html
========================================

API Endpoints:
GET  /api/drivers/available   - List online drivers
POST /api/trips/estimate       - Estimate trip cost
GET  /api/prices/btc           - Get BTC prices
========================================
```

---

### 6. Test API Endpoints (30 seconds)

In **another new terminal**, test the APIs:

#### Test 1: Get Available Drivers

```bash
curl http://localhost:3000/api/drivers/available | jq
```

**Expected**: JSON with 10 drivers

```json
{
  "drivers": [
    {
      "npub": "npub1...",
      "name": "Driver 1",
      "location": {
        "lat": 40.7580,
        "lon": -73.9855
      },
      "available": true,
      "rating": 4.8,
      "totalRides": 156
    }
  ],
  "count": 10
}
```

---

#### Test 2: Estimate Trip Cost

```bash
curl -X POST http://localhost:3000/api/trips/estimate \
  -H "Content-Type: application/json" \
  -d '{
    "pickup_lat": 40.7580,
    "pickup_lon": -73.9855,
    "dropoff_lat": 40.7829,
    "dropoff_lon": -73.9712,
    "currency": "USD"
  }' | jq
```

**Expected**: Full cost breakdown with dual pricing

```json
{
  "distance": { "km": 2.8 },
  "duration": { "minutes": 6 },
  "fare": {
    "sats": 12222,
    "fiat": 5.50,
    "formatted": "12,222 sats ($5.50)"
  },
  "breakdown": {
    "baseFare": { "fiat": 2.50 },
    "distance": { "fiat": 4.20 },
    "duration": { "fiat": 1.80 }
  },
  "operatorFee": {
    "sats": 61,
    "fiat": 0.03
  },
  "driverEarns": {
    "sats": 12161,
    "fiat": 5.47
  }
}
```

---

#### Test 3: Get BTC Prices

```bash
curl http://localhost:3000/api/prices/btc | jq
```

**Expected**: Current BTC prices

```json
{
  "prices": {
    "USD": 45000,
    "EUR": 42000,
    "GBP": 36000
  },
  "lastUpdate": 1697462400000,
  "source": "CoinGecko"
}
```

---

### 7. View Demo UI

Open in your browser:

```bash
open http://localhost:3000/demo.html
```

Or manually go to: `http://localhost:3000/demo.html`

**You should see**:
- ✅ Map of NYC with 10 driver markers
- ✅ Drivers moving around in real-time
- ✅ Sidebar with controls
- ✅ Currency toggle (USD/EUR/GBP)
- ✅ Trip planner (click two points on map)
- ✅ Cost estimate with dual pricing

**Try this**:
1. Watch drivers move on the map (updates every 5 seconds)
2. Switch currency (USD → EUR → GBP)
3. Click on map to set pickup location
4. Click again to set dropoff location
5. See trip cost in both sats and selected currency

---

## What You'll Have Running

| Terminal | Command | Status |
|----------|---------|--------|
| 1 | `./start.sh --dev` | Docker services |
| 2 | `node scripts/simulate-drivers.js` | Driver simulation |
| 3 | `npm start` | Backend server |
| 4 | (testing terminal) | curl commands |

---

## Visual Confirmation Checklist

### ✅ Infrastructure Started
- [ ] See "All services are healthy!"
- [ ] Docker shows 7 containers running

### ✅ Test Users Generated
- [ ] See "✅ Saved to test-users.json"
- [ ] File `test-users.json` exists

### ✅ Drivers Online
- [ ] See "✅ All drivers online and moving!"
- [ ] Output shows location updates

### ✅ Backend Running
- [ ] See "Server running at http://localhost:3000"
- [ ] No error messages

### ✅ API Working
- [ ] `/api/drivers/available` returns 10 drivers
- [ ] `/api/trips/estimate` returns cost breakdown
- [ ] `/api/prices/btc` returns prices

### ✅ Demo UI Working
- [ ] Page loads without errors
- [ ] Map displays with NYC view
- [ ] 10 driver markers visible
- [ ] Drivers move every 5 seconds
- [ ] Currency toggle works
- [ ] Can plan trip and see cost

---

## Troubleshooting

### Problem: "Docker not found"
**Solution**: Install Docker Desktop and start it

---

### Problem: "Port 3000 already in use"
**Solution**: Kill existing process:
```bash
lsof -ti:3000 | xargs kill -9
```

---

### Problem: "No drivers found"
**Solution**: Make sure driver simulator is running:
```bash
node scripts/simulate-drivers.js
```

---

### Problem: "Redis connection failed"
**Solution**: Restart infrastructure:
```bash
./start.sh --dev --rebuild
```

---

### Problem: "Can't fetch BTC prices"
**Solution**:
- Check internet connection
- Prices will fall back to hardcoded values
- Try manual refresh: `curl -X POST http://localhost:3000/api/prices/refresh`

---

### Problem: Demo UI shows "No drivers available"
**Solution**:
1. Check driver simulator is running (Terminal 2)
2. Check backend is running (Terminal 3)
3. Test API directly: `curl http://localhost:3000/api/drivers/available`
4. Check browser console for errors (F12)

---

## Stopping Everything

### Stop Backend Server
In Terminal 3: `Ctrl+C`

### Stop Driver Simulator
In Terminal 2: `Ctrl+C`

### Stop Infrastructure
In Terminal 1: `Ctrl+C` then:
```bash
docker-compose down
```

Or keep it running for next time!

---

## Optional: View Data in DB

### View PostgreSQL (Adminer)
```bash
open http://localhost:8081
```

Login:
- System: PostgreSQL
- Server: postgres
- Username: donkey
- Password: (from .env)
- Database: donkeyride

---

### View Redis (Redis Commander)
```bash
open http://localhost:8082
```

You'll see:
- `driver:online:npub1...` - Online driver data
- `driver:location:npub1...` - Driver locations

---

## Success Criteria

You've successfully tested everything if:

1. ✅ All 3 terminals running without errors
2. ✅ API endpoints return valid data
3. ✅ Demo UI shows moving drivers on map
4. ✅ Trip cost estimates work with dual pricing
5. ✅ Currency toggle works (USD/EUR/GBP)

---

## Next Steps

### Immediate
- ✅ Backend API complete
- ✅ Test environment working
- ✅ Demo UI functional

### Week 1 (Core Protocol)
- Implement full ride lifecycle
- Add Nostr event publishing
- WebSocket real-time updates
- Payment integration

### Week 4 (React Apps)
- Create React Native rider app
- Create React Native driver app
- Connect to these APIs

---

## Quick Reference

### URLs
- Backend API: http://localhost:3000
- Demo UI: http://localhost:3000/demo.html
- WebSocket: ws://localhost:3001
- Adminer (DB): http://localhost:8081
- Redis UI: http://localhost:8082
- Nostr Relay: ws://localhost:7777
- Mock Lightning: http://localhost:8080

### Files Created
- `test-users.json` - Generated test data
- `test-users.env` - Environment format keys

### Logs
- Docker: `docker-compose logs -f`
- Backend: Terminal 3
- Drivers: Terminal 2

---

**Time to complete**: ~5 minutes
**Terminals needed**: 4 (infra, drivers, backend, testing)
**Prerequisites**: Docker + Node.js

**Ready? Run these commands in order!** 🚀
