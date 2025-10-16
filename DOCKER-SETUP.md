# DonkeyRide Docker Infrastructure Setup

Complete guide for running DonkeyRide reference infrastructure with Docker.

---

## Overview

The DonkeyRide Docker setup includes:

- **Nostr Relay** (strfry) - Event storage and discovery
- **PostgreSQL** - Operator state and ride history
- **Redis** - Caching and real-time state
- **Operator Backend** - Your DonkeyRide operator service
- **OSRM** - Navigation and routing
- **Mock Lightning** - Development Lightning node (dev only)
- **Adminer** - Database UI (dev only)
- **Redis Commander** - Redis UI (dev only)

---

## Prerequisites

### Required
- Docker 20.10+
- Docker Compose 2.0+
- 4GB RAM minimum (8GB recommended)
- 10GB free disk space (more for OSRM maps)

### Check Installation
```bash
docker --version
docker-compose --version
```

### Install Docker (if needed)

**macOS:**
```bash
brew install --cask docker
```

**Linux:**
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

**Windows:**
Download Docker Desktop from https://docker.com/products/docker-desktop

---

## Quick Start (Development)

### 1. Clone Repository

```bash
git clone https://github.com/donkeyride/donkeyride
cd donkeyride
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Operator Identity
OPERATOR_PUBKEY=npub1your_nostr_pubkey
OPERATOR_NSEC=nsec1your_nostr_private_key
OPERATOR_LIGHTNING=you@getalby.com
OPERATOR_FEE_PERCENT=0.005

# Payment Provider (for development, use mock)
PAYMENT_PROVIDER=mock
STRIKE_API_KEY=sk_test_your_strike_key

# Database
DB_PASSWORD=secure_password_here

# Environment
NODE_ENV=development
```

### 3. Start Core Services

```bash
# Start core services (Nostr, PostgreSQL, Redis, Operator)
docker-compose up -d nostr-relay postgres redis operator

# View logs
docker-compose logs -f operator
```

### 4. Start Development Tools

```bash
# Start all services including dev tools
docker-compose --profile dev up -d

# Access:
# - Operator API: http://localhost:3000
# - Adminer (DB UI): http://localhost:8081
# - Redis UI: http://localhost:8082
# - Mock Lightning: http://localhost:8080
```

### 5. Verify Services

```bash
# Check all services are healthy
docker-compose ps

# Test operator API
curl http://localhost:3000/health

# Test Nostr relay
wscat -c ws://localhost:7777
```

---

## Service Details

### Nostr Relay (Port 7777)

**Purpose**: Event storage and discovery

**Health Check**:
```bash
curl http://localhost:7777/
```

**Configuration**: `docker/strfry/strfry.conf`

**View Events**:
```bash
# Install nak (Nostr Army Knife)
go install github.com/fiatjaf/nak@latest

# Query events
nak req -r ws://localhost:7777 -k 30500 --limit 10
```

---

### PostgreSQL (Port 5432)

**Purpose**: Operator state, ride history, reputation

**Connection**:
```bash
docker-compose exec postgres psql -U donkey -d donkeyride
```

**Tables**:
- `operators` - Operator registration and bonds
- `rides` - All ride data
- `payments` - Payment history
- `reputation` - User reputation
- `ratings` - Individual ratings
- `disputes` - Dispute records
- `location_updates` - Real-time tracking
- `events_log` - Audit trail

**Backup**:
```bash
docker-compose exec postgres pg_dump -U donkey donkeyride > backup.sql
```

**Restore**:
```bash
docker-compose exec -T postgres psql -U donkey donkeyride < backup.sql
```

---

### Redis (Port 6379)

**Purpose**: Caching, sessions, real-time state

**CLI Access**:
```bash
docker-compose exec redis redis-cli
```

**Common Commands**:
```bash
# View all keys
KEYS *

# Get value
GET key_name

# Monitor all commands
MONITOR

# Check memory usage
INFO memory
```

---

### Operator Backend (Ports 3000, 3001)

**Purpose**: Core operator logic and WebSocket

**REST API**: http://localhost:3000
**WebSocket**: ws://localhost:3001

**Endpoints**:
```bash
# Health
curl http://localhost:3000/health

# Operator info
curl http://localhost:3000/info

# Active rides
curl http://localhost:3000/rides/active
```

**Logs**:
```bash
docker-compose logs -f operator
```

---

### OSRM Navigation (Port 5000)

**Purpose**: Routing and navigation

**Setup**: See [docker/osrm/README.md](./docker/osrm/README.md)

**Quick Test**:
```bash
# Route from point A to B (Manhattan example)
curl "http://localhost:5000/route/v1/driving/-73.985,40.758;-73.968,40.761?overview=false"
```

**Note**: OSRM requires map data preparation before use.

---

### Mock Lightning (Port 8080) - Dev Only

**Purpose**: Simulate Lightning payments in development

**API**: http://localhost:8080

**Create Invoice**:
```bash
curl -X POST http://localhost:8080/invoice \
  -H "Content-Type: application/json" \
  -d '{"amount": 5000, "memo": "Test payment"}'
```

**Pay Invoice**:
```bash
curl -X POST http://localhost:8080/pay \
  -H "Content-Type: application/json" \
  -d '{"invoice": "lnbc..."}'
```

**Check Balance**:
```bash
curl http://localhost:8080/balance
```

---

## Production Setup

### 1. Update Environment

```env
NODE_ENV=production
PAYMENT_PROVIDER=lnd  # or strike, btcpay
ENABLE_NIP98_AUTH=true
ENABLE_RATE_LIMITING=true
```

### 2. Start Production Services

```bash
# Start without dev tools
docker-compose up -d

# Exclude dev services (no --profile dev)
```

### 3. Configure Reverse Proxy (Nginx)

```nginx
# /etc/nginx/sites-available/donkeyride

upstream operator_api {
    server localhost:3000;
}

upstream operator_ws {
    server localhost:3001;
}

upstream nostr_relay {
    server localhost:7777;
}

server {
    listen 80;
    server_name api.donkeyride.example.com;

    # SSL (certbot)
    # listen 443 ssl http2;
    # ssl_certificate /etc/letsencrypt/live/api.donkeyride.example.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/api.donkeyride.example.com/privkey.pem;

    # REST API
    location / {
        proxy_pass http://operator_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket
    location /ws {
        proxy_pass http://operator_ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }
}

server {
    listen 80;
    server_name relay.donkeyride.example.com;

    # Nostr relay
    location / {
        proxy_pass http://nostr_relay;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

Enable and restart:
```bash
sudo ln -s /etc/nginx/sites-available/donkeyride /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 4. SSL Certificates

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificates
sudo certbot --nginx -d api.donkeyride.example.com -d relay.donkeyride.example.com
```

### 5. Monitoring

```bash
# Install monitoring stack (Prometheus + Grafana)
# See guides/MONITORING.md for detailed setup
```

---

## Common Tasks

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f operator

# Last 100 lines
docker-compose logs --tail=100 operator
```

### Restart Service

```bash
docker-compose restart operator
```

### Stop All Services

```bash
docker-compose down
```

### Stop and Remove Data

```bash
# WARNING: Deletes all data!
docker-compose down -v
```

### Update Services

```bash
# Pull latest images
docker-compose pull

# Rebuild custom images
docker-compose build

# Restart with new images
docker-compose up -d
```

### Database Migrations

```bash
# Run migration script
docker-compose exec operator node migrations/001_add_column.js

# Or connect directly to PostgreSQL
docker-compose exec postgres psql -U donkey -d donkeyride -f /path/to/migration.sql
```

---

## Development Workflow

### 1. Start Infrastructure

```bash
# Start all services
docker-compose --profile dev up -d
```

### 2. Develop Locally

```bash
# Stop operator container (develop on host instead)
docker-compose stop operator

# Run operator on host with hot reload
npm install
npm run dev

# Operator will connect to Docker services (PostgreSQL, Redis, etc.)
```

### 3. Test Changes

```bash
# Run tests
npm test

# Integration tests
npm run test:integration
```

### 4. View Logs

```bash
# Real-time operator logs
docker-compose logs -f operator

# Real-time Nostr relay logs
docker-compose logs -f nostr-relay
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check logs
docker-compose logs service_name

# Check if port is already in use
lsof -i :3000

# Kill conflicting process
kill -9 $(lsof -t -i :3000)
```

### Database Connection Failed

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check connection
docker-compose exec postgres pg_isready -U donkey

# Reset database
docker-compose down -v postgres
docker-compose up -d postgres
```

### Nostr Relay Not Responding

```bash
# Check logs
docker-compose logs nostr-relay

# Check WebSocket connection
wscat -c ws://localhost:7777

# Rebuild database
docker-compose down -v nostr-relay
docker-compose up -d nostr-relay
```

### Out of Memory

```bash
# Check Docker resource usage
docker stats

# Increase Docker memory limit
# Docker Desktop: Settings → Resources → Memory → Increase to 8GB

# Or reduce running services
docker-compose stop mock-lightning adminer redis-commander
```

### OSRM Routing Errors

```bash
# Check OSRM logs
docker-compose logs osrm-backend

# Verify map data exists
ls -lh docker/osrm/data/*.osrm*

# If missing, prepare map data:
# See docker/osrm/README.md
```

---

## Performance Tuning

### PostgreSQL

```sql
-- Check slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Analyze tables
ANALYZE rides;
ANALYZE payments;

-- Vacuum
VACUUM ANALYZE;
```

### Redis

```bash
# Check memory usage
docker-compose exec redis redis-cli INFO memory

# Set max memory policy (already configured in docker-compose.yml)
# maxmemory 256mb
# maxmemory-policy allkeys-lru
```

### Nostr Relay

Edit `docker/strfry/strfry.conf`:

```conf
# Increase threads
numThreads = 8

# Reduce max event size if needed
maxEventSize = 65536  # 64 KB

# Enable compression
compression {
    enabled = true
}
```

---

## Backup Strategy

### Automated Daily Backups

```bash
#!/bin/bash
# /usr/local/bin/donkeyride-backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/donkeyride"

# PostgreSQL
docker-compose exec -T postgres pg_dump -U donkey donkeyride | gzip > "$BACKUP_DIR/postgres_$DATE.sql.gz"

# Strfry DB
docker-compose exec -T nostr-relay tar czf - /app/strfry-db > "$BACKUP_DIR/strfry_$DATE.tar.gz"

# Redis snapshot
docker-compose exec redis redis-cli BGSAVE
sleep 5
docker cp donkeyride-redis:/data/dump.rdb "$BACKUP_DIR/redis_$DATE.rdb"

# Cleanup old backups (keep 7 days)
find "$BACKUP_DIR" -name "*.gz" -mtime +7 -delete
find "$BACKUP_DIR" -name "*.rdb" -mtime +7 -delete

echo "Backup completed: $DATE"
```

Add to crontab:
```bash
# Daily backup at 2 AM
0 2 * * * /usr/local/bin/donkeyride-backup.sh >> /var/log/donkeyride-backup.log 2>&1
```

---

## Security Checklist

- [ ] Change default passwords in `.env`
- [ ] Enable NIP-98 authentication (`ENABLE_NIP98_AUTH=true`)
- [ ] Enable rate limiting (`ENABLE_RATE_LIMITING=true`)
- [ ] Use HTTPS in production (Nginx + Let's Encrypt)
- [ ] Restrict PostgreSQL to localhost or internal network
- [ ] Restrict Redis to localhost or internal network
- [ ] Use real Lightning node (not mock) in production
- [ ] Set up firewall rules (ufw/iptables)
- [ ] Enable Docker user namespace remapping
- [ ] Rotate operator keys regularly
- [ ] Monitor logs for suspicious activity
- [ ] Set up automated backups
- [ ] Keep Docker images updated

---

## Monitoring & Alerts

### Health Checks

```bash
# Check all services
docker-compose ps

# Check operator health
curl http://localhost:3000/health

# Check Nostr relay
wscat -c ws://localhost:7777
```

### Prometheus Metrics

```yaml
# docker-compose.yml - add to operator service
environment:
  - ENABLE_METRICS=true

# Expose metrics endpoint
# GET /metrics
```

### Grafana Dashboards

```bash
# Add Grafana to docker-compose.yml
# Import DonkeyRide dashboard from grafana.com
```

---

## Next Steps

1. **Set up OSRM maps**: See [docker/osrm/README.md](./docker/osrm/README.md)
2. **Configure payment provider**: Edit `.env` and set up Lightning node
3. **Test end-to-end flow**: Create test ride requests
4. **Deploy to production**: Follow production setup above
5. **Set up monitoring**: Add Prometheus + Grafana
6. **Configure backups**: Set up automated backup script

---

## Resources

- **Docker Docs**: https://docs.docker.com/
- **Docker Compose**: https://docs.docker.com/compose/
- **Strfry Relay**: https://github.com/hoytech/strfry
- **OSRM**: http://project-osrm.org/
- **PostgreSQL**: https://www.postgresql.org/docs/
- **Redis**: https://redis.io/docs/

---

## Support

- **GitHub Issues**: https://github.com/donkeyride/donkeyride/issues
- **Documentation**: Check the `guides/` folder
- **Nostr**: Search for #donkeyride

---

**Your DonkeyRide infrastructure is ready to roll! 🚗⚡**
