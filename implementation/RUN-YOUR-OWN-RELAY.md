# Run Your Own DonkeyRide Relay

## Why Run a Relay?

- **Earn Fees**: 0.5% of every ride processed through your relay
- **Support Decentralization**: Help the network stay distributed
- **Serve Your Community**: Provide low-latency service to local users
- **Stay Sovereign**: Control your own infrastructure

## Quick Start (5 Minutes)

### 1. Clone and Configure
```bash
git clone https://github.com/donkeyride/relay
cd relay
cp .env.example .env
```

### 2. Edit `.env` with your details:
```env
OPERATOR_PUBKEY=npub1yournostrpubkey
OPERATOR_LIGHTNING=you@getalby.com
STRIKE_API_KEY=your_strike_api_key
```

### 3. Run with Docker
```bash
docker-compose up -d
```

That's it! Your relay is running at `http://localhost:3000`

## Manual Setup (Without Docker)

### Prerequisites
- Node.js 18+
- Strike API key (free at https://strike.me/developer)
- Lightning address for receiving fees

### Installation
```bash
npm install
npm start
```

## How It Works

### Fee Structure
```
Ride Fare: 1000 sats
├── Driver: 995 sats (99.5%)
└── Relay Operator: 5 sats (0.5%)
```

### Your Relay Handles:
1. **Stake Management**: Lock/release rider and driver stakes
2. **Payment Coordination**: Route streaming payments
3. **Dispute Resolution**: Apply penalties for cancellations
4. **Event Broadcasting**: Publish to Nostr network

## Relay Discovery

### Register Your Relay
Add your relay to the network by publishing a Nostr event:

```javascript
{
  "kind": 30400, // Relay announcement
  "tags": [
    ["relay_url", "https://your-domain.com"],
    ["relay_type", "donkeyride_stake"],
    ["fee_percent", "0.5"],
    ["location", "New York, USA"],
    ["strike_enabled", "true"],
    ["fedimint_enabled", "false"] // Future
  ],
  "content": "DonkeyRide relay serving NYC area"
}
```

### Users Choose Relays Based On:
- **Geographic proximity** (lower latency)
- **Fee percentage** (competitive market)
- **Uptime/reliability** (tracked on-chain)
- **Stake mechanisms supported**

## Advanced Configuration

### Multiple Stake Providers
```javascript
// config.js
module.exports = {
  providers: [
    { type: 'strike', apiKey: process.env.STRIKE_KEY },
    { type: 'voltage', apiKey: process.env.VOLTAGE_KEY },
    { type: 'fedimint', mintUrl: process.env.MINT_URL }
  ]
}
```

### Custom Fee Structure
```javascript
// Dynamic fees based on time/demand
function calculateOperatorFee(fareAmount, timeOfDay) {
  const baseFee = 0.005; // 0.5%
  const surgeFee = isPeakHours(timeOfDay) ? 0.002 : 0;
  return fareAmount * (baseFee + surgeFee);
}
```

### Geographic Filtering
```javascript
// Only serve rides in your area
const SERVE_AREA = {
  center: [40.7128, -74.0060], // NYC
  radiusKm: 50
};

function shouldAcceptRide(pickup) {
  return distanceKm(pickup, SERVE_AREA.center) <= SERVE_AREA.radiusKm;
}
```

## Monitoring & Maintenance

### Health Monitoring
```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "uptime": 86400,
  "activeRides": 12,
  "totalProcessed": 1523,
  "earnings": 7615
}
```

### Grafana Dashboard
```yaml
# docker-compose.yml addition
grafana:
  image: grafana/grafana
  ports:
    - "3002:3000"
  volumes:
    - ./grafana:/etc/grafana/provisioning
```

## Scaling Your Relay

### Small (Personal/Friends)
- Single server: $5/month VPS
- Handles: ~100 rides/day
- Earnings: ~50 sats/day

### Medium (City District)
- Load balanced: $20/month
- Handles: ~1000 rides/day
- Earnings: ~500 sats/day

### Large (Major City)
- Kubernetes cluster: $100/month
- Handles: ~10,000 rides/day
- Earnings: ~5000 sats/day

## Security Best Practices

### 1. API Key Management
```bash
# Never commit keys!
echo ".env" >> .gitignore

# Use secrets management
docker secret create strike_key ./strike.key
```

### 2. Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');

app.use(rateLimit({
  windowMs: 60000, // 1 minute
  max: 100 // 100 requests per minute
}));
```

### 3. Stake Limits
```javascript
const MAX_STAKE = 10000; // sats
const MAX_DAILY_VOLUME = 1000000; // sats

if (stake > MAX_STAKE) {
  throw new Error('Stake exceeds maximum');
}
```

## Competitive Advantages

### Why Users Choose Your Relay:

1. **Lower Fees**: Offer 0.3% instead of 0.5%
2. **Better Uptime**: 99.9% availability
3. **Faster Processing**: Local infrastructure
4. **Additional Features**:
   - SMS notifications
   - Multi-language support
   - Insurance options
   - Loyalty rewards

## Business Models

### Basic Relay (0.5% fee)
```
100 rides/day × 1000 sats/ride × 0.005 = 500 sats/day
= ~$0.50/day passive income
```

### Premium Relay (Added Services)
- Priority matching: +0.2%
- Dispute arbitration: +0.1%
- Insurance pool: +0.2%
- Total: 1% fees = 1000 sats/day

### Federation Operator
Run multiple relays across regions:
```
10 relays × 500 sats/day = 5000 sats/day
= ~$5/day = $150/month
```

## Join the Network

### Discord Community
Join other relay operators: https://discord.gg/donkeyride

### Relay Registry
List your relay: https://donkeyride.network/relays

### Get Support
- GitHub Issues: https://github.com/donkeyride/relay/issues
- Telegram: https://t.me/donkeyride_operators

## FAQ

**Q: Do I need Strike API access?**
A: For now yes, but we're adding Fedimint and other providers soon.

**Q: Can I run multiple relays?**
A: Yes! Many operators run regional clusters.

**Q: What if Strike goes down?**
A: Your relay can fallback to direct Lightning or other providers.

**Q: How do users find my relay?**
A: Through Nostr relay discovery events and geographic proximity.

**Q: Can I change my fee percentage?**
A: Yes, but announce changes 24h in advance via Nostr.

## The Vision

Instead of Uber taking 25% to run their servers, hundreds of independent operators each take 0.5% to run relay infrastructure. 

**Result**: 
- Drivers earn 99.5% (vs 75% with Uber)
- No single point of failure
- Community-owned infrastructure
- Competitive fee market

## Start Today

```bash
# One command to join the revolution
curl -sSL https://donkeyride.network/install.sh | bash
```

Welcome to the decentralized rideshare network! 🚗⚡