# DonkeyRide Scripts

Utility scripts for testing and development.

---

## Available Scripts

### 1. setup-test-environment.js

**Purpose**: Generate test users with Nostr keys and seed database

**What it does**:
- Generates 10 test drivers with Nostr keys (nsec/npub)
- Generates 5 test riders with Nostr keys
- Creates random locations around NYC (Times Square)
- Seeds PostgreSQL with reputation data
- Saves to `test-users.json` and `test-users.env`

**Usage**:
```bash
node scripts/setup-test-environment.js
```

**Output files**:
- `test-users.json` - Full test data in JSON format
- `test-users.env` - Environment variable format

**Requirements**:
- PostgreSQL running (via Docker)
- Database connection configured in `.env`

**Run once**: At the start of testing

---

### 2. simulate-drivers.js

**Purpose**: Simulate online drivers with real-time location updates

**What it does**:
- Loads test drivers from `test-users.json`
- Brings all 10 drivers online
- Publishes online status to Nostr (Kind 30503)
- Stores locations in Redis for fast lookup
- Simulates realistic movement (30 km/h)
- Updates locations every 5 seconds
- Handles graceful shutdown (Ctrl+C)

**Usage**:
```bash
node scripts/simulate-drivers.js
```

**Keep running**: This script should stay running while testing

**Requirements**:
- `test-users.json` exists (run setup-test-environment.js first)
- Nostr relay running (ws://localhost:7777)
- Redis running

**Ctrl+C to stop**: Gracefully takes drivers offline

---

## Testing Workflow

### First Time Setup

```bash
# 1. Start infrastructure
./start.sh --dev

# 2. Generate test users (once)
node scripts/setup-test-environment.js

# 3. Simulate drivers (keep running)
node scripts/simulate-drivers.js

# 4. Start backend (in another terminal)
npm start

# 5. Test
open http://localhost:3000/demo.html
```

---

### Subsequent Testing

If infrastructure is already running:

```bash
# 1. Simulate drivers
node scripts/simulate-drivers.js

# 2. Start backend (in another terminal)
npm start

# 3. Test
open http://localhost:3000/demo.html
```

---

## Script Dependencies

Both scripts require:
- `nostr-tools` - Nostr key generation and signing
- `redis` - Driver location storage
- `pg` - PostgreSQL client

Install with:
```bash
npm install
```

---

## Environment Variables

Scripts use these from `.env`:

```bash
# Nostr relay
NOSTR_RELAY=ws://localhost:7777

# Redis
REDIS_URL=redis://localhost:6379

# PostgreSQL
DATABASE_URL=postgresql://donkey:password@localhost:5432/donkeyride
```

---

## Test Data

### Generated Drivers

- **Count**: 10
- **Location**: Within 5km of Times Square, NYC
- **Reputation**: Random (4.5-5.0 stars)
- **Rides**: Random (10-110 completed rides)
- **Names**: "Driver 1", "Driver 2", etc.

### Generated Riders

- **Count**: 5
- **Location**: Within 5km of Times Square, NYC
- **Reputation**: Random (4.5-5.0 stars)
- **Rides**: Random (5-55 completed rides)
- **Names**: "Rider 1", "Rider 2", etc.

---

## Output Files

### test-users.json

Full test data:
```json
{
  "drivers": [
    {
      "privateKey": "...",
      "publicKey": "...",
      "nsec": "nsec1...",
      "npub": "npub1...",
      "name": "Driver 1",
      "location": { "lat": 40.7580, "lon": -73.9855 },
      "reputation": {
        "totalRides": 156,
        "averageRating": 4.8,
        "rating5Count": 125
      }
    }
  ],
  "riders": [...]
}
```

### test-users.env

Environment format (for easy copying to `.env`):
```bash
DRIVER_1_NSEC=nsec1...
DRIVER_1_NPUB=npub1...
RIDER_1_NSEC=nsec1...
RIDER_1_NPUB=npub1...
```

---

## Nostr Events Published

### Driver Online (Kind 30503)

```json
{
  "kind": 30503,
  "content": "",
  "tags": [
    ["d", "driver_status_<pubkey>"],
    ["status", "online"],
    ["lat", "40.7580"],
    ["lon", "-73.9855"],
    ["available", "true"]
  ]
}
```

### Location Update (Kind 30512)

```json
{
  "kind": 30512,
  "content": "",
  "tags": [
    ["d", "driver_loc_<pubkey>_<timestamp>"],
    ["type", "location_update"],
    ["lat", "40.7585"],
    ["lon", "-73.9860"],
    ["heading", "45"],
    ["speed", "30"]
  ]
}
```

Published occasionally (10% of updates) to avoid spam.

---

## Redis Keys

### Driver Online Status

```
driver:online:npub1...
```

Value:
```json
{
  "npub": "npub1...",
  "name": "Driver 1",
  "location": { "lat": 40.7580, "lon": -73.9855 },
  "available": true,
  "lastUpdate": 1697462400000
}
```

Expires after 1 hour.

---

### Driver Location

```
driver:location:npub1...
```

Value:
```json
{
  "lat": 40.7585,
  "lon": -73.9860,
  "heading": 45,
  "speed": 30,
  "timestamp": 1697462400000
}
```

Expires after 1 minute.

---

## PostgreSQL Tables

### reputation

Seeded by setup script:
```sql
INSERT INTO reputation (pubkey, user_type, total_rides, average_rating, rating_5_count)
VALUES ('npub1...', 'driver', 156, 4.8, 125);
```

---

## Movement Simulation

### Algorithm

Drivers perform a random walk:

1. Choose random angle (0-360°)
2. Move in that direction
3. Distance = (speed / 3600) × (interval / 1000) km
4. Update lat/lon using spherical geometry

### Parameters

- **Speed**: 30 km/h (realistic city driving)
- **Update interval**: 5 seconds
- **Movement per update**: ~42 meters

### Coordinates

Uses proper spherical coordinates:
```javascript
const latOffset = (distance / 111) * Math.cos(angle);
const lonOffset = (distance / (111 * Math.cos(lat * PI / 180))) * Math.sin(angle);
```

---

## Troubleshooting

### "Cannot find module 'nostr-tools'"

**Solution**: Install dependencies
```bash
npm install
```

---

### "ECONNREFUSED" (Redis)

**Solution**: Start infrastructure
```bash
./start.sh --dev
```

---

### "Connection failed" (PostgreSQL)

**Solution**: Check DATABASE_URL in `.env` and ensure PostgreSQL is running

---

### "test-users.json not found" (simulate-drivers.js)

**Solution**: Run setup script first
```bash
node scripts/setup-test-environment.js
```

---

### Drivers not showing in demo UI

**Solution**:
1. Check simulator is running (Terminal 2)
2. Check backend is running (Terminal 3)
3. Test API: `curl http://localhost:3000/api/drivers/available`
4. Check browser console for errors

---

## Advanced Usage

### Generate More Drivers

Edit `setup-test-environment.js`:
```javascript
const DRIVER_COUNT = 20;  // Default: 10
const RIDER_COUNT = 10;   // Default: 5
```

---

### Change Starting Location

Edit `setup-test-environment.js`:
```javascript
const CENTER_LAT = 51.5074;  // London
const CENTER_LON = -0.1278;
```

---

### Adjust Movement Speed

Edit `simulate-drivers.js`:
```javascript
const MOVEMENT_SPEED_KMH = 50;  // Default: 30
```

---

### Change Update Frequency

Edit `simulate-drivers.js`:
```javascript
const MOVEMENT_INTERVAL = 10000;  // Default: 5000 (5 seconds)
```

---

## Script Logs

### setup-test-environment.js

```
========================================
DonkeyRide Test Environment Setup
========================================

📡 Connected to PostgreSQL
🔑 Generating test users...

🚗 Generated 10 drivers
👤 Generated 5 riders
📊 Seeded PostgreSQL with reputation data
💾 Saved to test-users.json
💾 Saved to test-users.env

✅ Test environment ready!
========================================
```

---

### simulate-drivers.js

```
========================================
DonkeyRide Driver Simulator
========================================

📡 Connected to Nostr relays: ws://localhost:7777
📊 Connected to Redis: redis://localhost:6379

🚗 Bringing 10 drivers online...

🟢 Driver 1 going online...
✅ Driver 1 is now online
🟢 Driver 2 going online...
✅ Driver 2 is now online
...

✅ All drivers online and moving!

📍 Drivers are updating locations every 5 seconds
🗺️  View them at: http://localhost:3000/demo

Press Ctrl+C to stop simulation
```

---

## Development

### Adding New Scripts

1. Create script in `scripts/` directory
2. Add shebang: `#!/usr/bin/env node`
3. Make executable: `chmod +x scripts/your-script.js`
4. Document in this README

---

### Script Template

```javascript
#!/usr/bin/env node

/**
 * Script Name
 *
 * Description of what this script does
 */

require('dotenv').config();

async function main() {
  console.log('Script starting...');

  // Your code here

  console.log('✅ Done!');
}

main().catch(console.error);
```

---

## Future Scripts

Potential additions:

- `simulate-rides.js` - Simulate complete ride flow
- `benchmark-api.js` - Load test API endpoints
- `seed-database.js` - Seed with historical ride data
- `generate-analytics.js` - Create test analytics data
- `reset-environment.js` - Clean up test data

---

**See also**: QUICK-START-TESTING.md for full testing workflow
