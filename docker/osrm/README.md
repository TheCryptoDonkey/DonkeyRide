# OSRM Navigation Service Setup (Self-Hosted)

**IMPORTANT**: OSRM runs **100% locally** in your Docker container. No external API calls, no 3rd party services. You only need to download open-source map data once.

---

## What OSRM Is

- **Open Source Routing Machine** - MIT licensed
- Runs locally in Docker (no external dependencies)
- Uses OpenStreetMap data (open source, free)
- Fast routing: 100+ routes/second
- Zero API costs

**What happens**:
1. Download map data once (OpenStreetMap export)
2. Process it locally
3. OSRM runs on your server forever
4. All routing calculations happen locally

---

## Quick Start

### 1. Download Map Data

OpenStreetMap data is available from multiple sources. Choose one:

#### Option A: Geofabrik (Recommended - Fast mirrors)

```bash
# Create data directory
mkdir -p docker/osrm/data
cd docker/osrm/data

# Download map (example: New York State - 500MB)
wget http://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf

# Or smaller region (Manhattan - 50MB)
wget http://download.geofabrik.de/north-america/us/new-york/manhattan-latest.osm.pbf
```

**Available regions**: http://download.geofabrik.de/
- Individual US states
- European countries
- Asian regions
- Cities (London, Paris, etc.)

#### Option B: Direct from OpenStreetMap (Official source)

```bash
# Download from OSM Planet
# Warning: Full planet is 60GB+, takes hours
wget https://planet.openstreetmap.org/pbf/planet-latest.osm.pbf

# Better: Use regional extracts
wget https://download.openstreetmap.fr/extracts/north-america/us/new-york-latest.osm.pbf
```

#### Option C: Extract Your Own Region

Use `osmium` tool to extract just your city:

```bash
# Install osmium
brew install osmium-tool  # macOS
sudo apt install osmium-tool  # Linux

# Download larger region first
wget http://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf

# Extract just Manhattan
osmium extract \
  --bbox=-74.0479,40.6829,-73.9067,40.8820 \
  new-york-latest.osm.pbf \
  -o manhattan.osm.pbf

# Now you have a 50MB file instead of 500MB
```

**Bounding box finder**: http://bboxfinder.com/

---

### 2. Prepare Map Data

Process the map data for fast routing:

```bash
cd docker/osrm/data

# Extract (builds graph from OSM data)
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend osrm-extract \
  -p /opt/car.lua /data/new-york-latest.osm.pbf

# Partition (for MLD algorithm)
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend osrm-partition \
  /data/new-york-latest.osrm

# Customize (optimize for car routing)
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend osrm-customize \
  /data/new-york-latest.osrm
```

**Processing time**:
- Manhattan: ~30 seconds
- New York State: ~5 minutes
- California: ~15 minutes
- Full USA: ~2 hours

**Disk space**:
- Manhattan: 150MB total
- New York State: 1.5GB total
- California: 3GB total

---

### 3. Update Docker Compose

The OSRM service is already configured in `docker-compose.yml`. Just update the map filename:

```yaml
osrm-backend:
  image: ghcr.io/project-osrm/osrm-backend:latest
  container_name: donkeyride-osrm
  restart: unless-stopped
  ports:
    - "5000:5000"
  volumes:
    - ./docker/osrm/data:/data
  command: osrm-routed --algorithm mld /data/new-york-latest.osrm --max-table-size 10000
  #                                        ^^^^^^^^^^^^^^^^^^^^^^
  #                                        Update this filename to match your map
  networks:
    - donkeyride-network
```

---

### 4. Start OSRM

```bash
# Start just OSRM
docker-compose up -d osrm-backend

# Or start everything
./start.sh
```

---

## Verify It's Working

### Test Route API

```bash
# Route from Times Square to Central Park
curl "http://localhost:5000/route/v1/driving/-73.9855,40.7580;-73.9712,40.7829?overview=false"
```

Response:
```json
{
  "code": "Ok",
  "routes": [{
    "distance": 3214.5,  // meters
    "duration": 450.2,   // seconds
    "legs": [...]
  }]
}
```

### Test from Operator Backend

```javascript
// In your operator code
const response = await fetch(`http://osrm-backend:5000/route/v1/driving/${pickup_lon},${pickup_lat};${dropoff_lon},${dropoff_lat}?overview=full`);
const data = await response.json();

const route = data.routes[0];
const distance_meters = route.distance;
const duration_seconds = route.duration;
const geometry = route.geometry; // GeoJSON
```

---

## OSRM API Reference

### Route (Get directions)

```bash
GET /route/v1/{profile}/{coordinates}

# Example
curl "http://localhost:5000/route/v1/driving/-73.985,40.758;-73.968,40.761?overview=full&geometries=geojson"
```

**Parameters**:
- `overview`: `false` | `full` | `simplified`
- `geometries`: `polyline` | `geojson`
- `steps`: `true` to get turn-by-turn instructions
- `alternatives`: `true` to get multiple routes

### Table (Distance matrix)

```bash
GET /table/v1/{profile}/{coordinates}

# Example: Get distances between 3 points
curl "http://localhost:5000/table/v1/driving/-73.985,40.758;-73.968,40.761;-73.950,40.755"
```

Response:
```json
{
  "durations": [
    [0, 123, 456],     // From point 0 to all points
    [123, 0, 333],     // From point 1 to all points
    [456, 333, 0]      // From point 2 to all points
  ],
  "distances": [...]   // Same format, in meters
}
```

### Match (GPS trace to route)

```bash
GET /match/v1/{profile}/{coordinates}

# Match GPS trace to road network
curl "http://localhost:5000/match/v1/driving/-73.985,40.758;-73.983,40.759;-73.982,40.760?overview=full"
```

### Nearest (Find nearest road)

```bash
GET /nearest/v1/{profile}/{coordinate}

# Find nearest road to a point
curl "http://localhost:5000/nearest/v1/driving/-73.985,40.758"
```

---

## Performance Optimization

### 1. Use Shared Memory (Production)

For better performance:

```yaml
osrm-backend:
  image: ghcr.io/project-osrm/osrm-backend:latest
  command: osrm-routed --algorithm mld /data/map.osrm --shared-memory
  shm_size: '2gb'  # Allocate shared memory
  # ... rest of config
```

### 2. Increase Thread Count

```yaml
command: osrm-routed --algorithm mld /data/map.osrm --threads 8
```

### 3. Tune Table Size

For distance matrix with many points:

```yaml
command: osrm-routed --algorithm mld /data/map.osrm --max-table-size 10000
```

---

## Update Maps Automatically

Create update script:

```bash
#!/bin/bash
# update-maps.sh

MAP_URL="http://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf"
MAP_NAME="new-york-latest"
DATA_DIR="/Users/example/WebstormProjects/DonkeyRide/docker/osrm/data"

cd "$DATA_DIR"

# Download latest map
echo "Downloading latest map..."
wget -O "${MAP_NAME}.osm.pbf" "$MAP_URL"

# Process map
echo "Processing map..."
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-extract -p /opt/car.lua "/data/${MAP_NAME}.osm.pbf"

docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-partition "/data/${MAP_NAME}.osrm"

docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-customize "/data/${MAP_NAME}.osrm"

# Restart OSRM
echo "Restarting OSRM..."
cd /Users/example/WebstormProjects/DonkeyRide
docker-compose restart osrm-backend

echo "✅ Maps updated successfully"
```

Run monthly:
```bash
chmod +x update-maps.sh

# Add to crontab (monthly on 1st at 2am)
0 2 1 * * /path/to/update-maps.sh
```

---

## Multi-Region Setup

For multiple cities, run multiple OSRM instances:

```yaml
# docker-compose.yml
services:
  osrm-nyc:
    image: ghcr.io/project-osrm/osrm-backend:latest
    ports: ["5001:5000"]
    volumes: ["./docker/osrm/nyc:/data"]
    command: osrm-routed --algorithm mld /data/map.osrm

  osrm-sf:
    image: ghcr.io/project-osrm/osrm-backend:latest
    ports: ["5002:5000"]
    volumes: ["./docker/osrm/sf:/data"]
    command: osrm-routed --algorithm mld /data/map.osrm

  osrm-london:
    image: ghcr.io/project-osrm/osrm-backend:latest
    ports: ["5003:5000"]
    volumes: ["./docker/osrm/london:/data"]
    command: osrm-routed --algorithm mld /data/map.osrm
```

Route based on ride location:

```javascript
const osrmUrls = {
  'NYC': 'http://osrm-nyc:5000',
  'SF': 'http://osrm-sf:5000',
  'London': 'http://osrm-london:5000'
};

const osrmUrl = osrmUrls[ride.city] || 'http://osrm-backend:5000';
```

---

## Troubleshooting

### "Cannot find map file"

```bash
# Check that map was processed
ls -lh docker/osrm/data/*.osrm*

# You should see:
# new-york-latest.osrm
# new-york-latest.osrm.ebg
# new-york-latest.osrm.ebg_nodes
# new-york-latest.osrm.fileIndex
# new-york-latest.osrm.icd
# new-york-latest.osrm.mldgr
# new-york-latest.osrm.partition
```

### "No route found"

Check that coordinates are within the map bounds:

```bash
# Test with coordinates definitely in New York
curl "http://localhost:5000/route/v1/driving/-73.985,40.758;-73.968,40.761"

# If this fails, map data might be corrupted - reprocess
```

### "Out of memory during extraction"

Reduce map size or increase Docker memory:

```bash
# Docker Desktop: Settings → Resources → Memory → 8GB

# Or extract smaller region with osmium
osmium extract --bbox=-74.05,40.68,-73.90,40.88 large-map.osm.pbf -o small-map.osm.pbf
```

### "Slow routing"

1. Use MLD algorithm (already configured)
2. Enable shared memory
3. Use SSD for map storage
4. Increase Docker CPU allocation

---

## Why Self-Hosted OSRM?

### Advantages

✅ **Zero cost** - No API fees ever
✅ **No rate limits** - Unlimited routing
✅ **Privacy** - No data sent to 3rd parties
✅ **Fast** - Local routing (5-10ms response time)
✅ **Reliable** - No network dependency after setup
✅ **Customizable** - Modify routing profiles
✅ **Offline capable** - Works without internet

### vs Commercial APIs

| Feature | OSRM (Self-Hosted) | Google Maps | Mapbox | HERE |
|---------|-------------------|-------------|---------|------|
| **Cost** | Free | $5-20/1000 | $0.60/1000 | $1/1000 |
| **Rate Limit** | None | 25,000/day | 100,000/month | 250,000/month |
| **Privacy** | Full | None | None | None |
| **Latency** | 5-10ms | 50-200ms | 50-200ms | 50-200ms |
| **Offline** | Yes | No | No | No |
| **Custom** | Yes | No | Limited | Limited |

---

## Alternative: GraphHopper

If you want an alternative to OSRM, GraphHopper is also self-hosted:

```yaml
graphhopper:
  image: graphhopper/graphhopper:latest
  ports: ["8989:8989"]
  volumes:
    - ./docker/graphhopper/data:/data
  environment:
    - JAVA_OPTS=-Xmx2g
```

**Comparison**:
- **OSRM**: Faster, simpler, car-focused
- **GraphHopper**: More features (bike, foot, elevation), slightly slower

---

## Resources

- **OSRM GitHub**: https://github.com/Project-OSRM/osrm-backend
- **OSRM Docs**: http://project-osrm.org/docs/
- **OpenStreetMap**: https://www.openstreetmap.org/
- **Geofabrik Downloads**: http://download.geofabrik.de/
- **Osmium Tool**: https://osmcode.org/osmium-tool/
- **Map Extracts**: https://download.openstreetmap.fr/extracts/

---

## Summary

**Setup Steps**:
1. Download map data (once) - 5 minutes
2. Process map data (once) - 5-30 minutes
3. Start OSRM Docker container - 5 seconds
4. Use forever with zero external dependencies

**What runs where**:
- ✅ OSRM: Local Docker container
- ✅ Map data: Your disk
- ✅ Routing calculations: Your CPU
- ❌ Nothing sent to external services

**100% self-hosted, 100% private, 0% external dependencies** ✅
