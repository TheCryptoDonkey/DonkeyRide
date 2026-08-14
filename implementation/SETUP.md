# DonkeyRide Setup Guide

> This is the optional operator/developer setup. Riders and drivers normally
> install or open the hosted PWA at <https://ride.trotters.dev>; no DonkeyRide
> backend, PostgreSQL or Redis is required for direct mode. Start with the
> repository [README](../README.md) for the current architecture.

## 🚀 Choose Your Path

### Path 1: Just a User (1 minute)
Open <https://ride.trotters.dev> and install the PWA if you want it on your
home screen. No DonkeyRide server or account approval is required.

### Path 2: Driver or Provider (1 minute)
Open <https://ride.trotters.dev/provide>, or use the signed Android build at
<https://ride.trotters.dev/download.html>.

### Path 3: Managed Operator
Run the optional backend when a firm needs its own admission policy, records or
regulated workflow. Direct-mode users do not need it.

### Path 4: Developer (15 minutes)
Fork it, modify it, make it yours.

---

## Quick Start (PWA development)

The hosted app is the quickest way to try DonkeyRide. For local development:

```bash
# Clone the repo
git clone https://github.com/TheCryptoDonkey/DonkeyRide.git
cd DonkeyRide/web
npm ci

# Point this at a browser-reachable Valhalla-compatible router.
VITE_PUBLIC_ROUTING_URL=https://router.example npm run dev
```

## Full Setup (With Relay Server)

### Prerequisites
- Node.js 20+
- Docker (optional)

### Option 1: Docker (Recommended)

```bash
# 1. Clone repository
git clone https://github.com/TheCryptoDonkey/DonkeyRide.git
cd DonkeyRide

# 2. Create environment file
cp .env.example .env
# Edit .env with your Strike API key and Lightning address

# 3. Start everything
docker-compose up

# 4. Open browser
open http://localhost:3000
```

### Option 2: Manual Setup

```bash
# 1. Clone repository
git clone https://github.com/TheCryptoDonkey/DonkeyRide.git
cd DonkeyRide

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env file:
# - Add your Strike API key
# - Add your Lightning address for fees
# - Set your Nostr pubkey

# 4. Start relay server
npm start

# 5. Open demo in another terminal
python3 -m http.server 8080
# Navigate to http://localhost:8080
```

## Configuration

### Essential Environment Variables

```env
# Required
STRIKE_API_KEY=sk_live_your_api_key_here
OPERATOR_LIGHTNING=you@getalby.com
OPERATOR_PUBKEY=npub1yourpubkey

# Market-Driven Fee Configuration
OPERATOR_FEE_PERCENT=0.005  # Set YOUR fee (0-1% typical)
# Examples:
# 0 = Free relay (community service)
# 0.001 = 0.1% (aggressive pricing) 
# 0.003 = 0.3% (competitive)
# 0.005 = 0.5% (sustainable)
# 0.01 = 1% (premium service)

# Optional (defaults shown)
PORT=3000
WS_PORT=3001
```

### 💰 Fee Strategy Guide

#### For Taxi Drivers Running Own Relay
```env
OPERATOR_FEE_PERCENT=0  # You're driving yourself - no fee!
```

#### For New Market Entrants
```env
# Week 1-2: Free to gain users
OPERATOR_FEE_PERCENT=0

# Week 3-4: Introductory pricing
OPERATOR_FEE_PERCENT=0.001

# Week 5+: Sustainable operations
OPERATOR_FEE_PERCENT=0.003
```

#### For Premium Service Operators
```env
OPERATOR_FEE_PERCENT=0.01  # 1% - Must offer extra value:
# - 24/7 support
# - Insurance coverage
# - Dispute resolution
# - Priority matching
```

### Strike API Setup

1. Go to https://strike.me/developer
2. Create account (KYC required)
3. Generate API key
4. Add to `.env` file

### Lightning Wallet Setup

You need a Lightning address to receive operator fees:

- **Alby**: https://getalby.com (Recommended)
- **Strike**: Use your Strike username
- **Voltage**: https://voltage.cloud
- **Phoenix**: https://phoenix.acinq.co

## Testing the System

### 1. Test Frontend Only
- Open `index.html`
- Click "Request Ride" as rider
- Click "Go Online" then "Accept Ride" as driver
- Watch streaming payments flow

### 2. Test With Local Relay
```bash
# Terminal 1: Start relay
npm start

# Terminal 2: Run tests
npm test

# Check relay health
curl http://localhost:3000/health
```

### 3. Test Multi-Relay Mesh (Market Competition)
```bash
# Start multiple relays with different fees to see competition
# Terminal 1: Budget relay
PORT=3000 OPERATOR_FEE_PERCENT=0.001 npm start

# Terminal 2: Standard relay  
PORT=3100 OPERATOR_FEE_PERCENT=0.005 npm start

# Terminal 3: Premium relay
PORT=3200 OPERATOR_FEE_PERCENT=0.01 npm start

# Terminal 4: Free community relay
PORT=3300 OPERATOR_FEE_PERCENT=0 npm start

# They'll automatically discover each other
# Users can choose based on fee/features!
```

## Project Structure

```
donkeyride/
├── index.html                 # Main demo interface
├── server.js                  # Relay operator server
├── relay-mesh.js              # Multi-relay coordination
├── strike-stake-implementation.js  # Stake management
├── commitment-stakes.js       # Stake logic
├── streaming-payments.js      # Payment streaming
├── reference-implementation.js # Core protocol logic
├── docker-compose.yml         # Docker setup
├── package.json              # Dependencies
├── .env.example              # Environment template
└── docs/
    ├── TROTT-01-core.md       # Protocol specification (see specs/)
    ├── STAKING-EXPLAINED.md   # How staking works
    ├── RUN-YOUR-OWN-RELAY.md  # Relay operator guide
    └── STAKING-MIGRATION-PATH.md  # Decentralization roadmap
```

## Development Mode

### Run with hot reload:
```bash
npm run dev
```

### Run with debug logging:
```bash
DEBUG=* npm start
```

### Run tests:
```bash
npm test
```

## Production Deployment

### Deploy to VPS (DigitalOcean, Linode, etc)

```bash
# SSH to your server
ssh root@your-server

# Clone and setup
git clone https://github.com/TheCryptoDonkey/DonkeyRide.git
cd DonkeyRide
cp .env.example .env
# Edit .env with production values

# Install PM2 for process management
npm install -g pm2

# Start with PM2
pm2 start server.js --name donkeyride-relay
pm2 save
pm2 startup

# Setup Nginx reverse proxy
sudo apt install nginx
sudo nano /etc/nginx/sites-available/donkeyride
```

Nginx config:
```nginx
server {
    listen 80;
    server_name relay.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /ws {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
    }
}
```

### Deploy to Heroku

```bash
# Install Heroku CLI
# Create app
heroku create your-relay-name

# Set environment variables
heroku config:set STRIKE_API_KEY=your_key
heroku config:set OPERATOR_LIGHTNING=you@getalby.com

# Deploy
git push heroku main
```

### Deploy with Docker to any cloud

```bash
# Build image
docker build -t donkeyride-relay .

# Push to registry
docker tag donkeyride-relay:latest your-registry/donkeyride-relay
docker push your-registry/donkeyride-relay

# Deploy anywhere that runs Docker
```

## Troubleshooting

### "Cannot connect to Strike API"
- Check your API key in `.env`
- Ensure you're not rate limited
- Try the Strike sandbox first

### "WebSocket connection failed"
- Check firewall allows port 3001
- Ensure `WS_PORT` in `.env` matches client config

### "No relays discovered"
- Check Nostr relay connections
- Ensure geographic location is set correctly
- Try connecting to default relays first

### "Stakes not locking"
- Verify Strike account has sufficient balance
- Check Strike API webhook configuration
- Review server logs for errors

## Community & Support

- **GitHub**: https://github.com/TheCryptoDonkey/DonkeyRide
- **Discord**: https://discord.gg/donkeyride
- **Telegram**: https://t.me/donkeyride
- **Nostr**: #donkeyride

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Priority Areas:
1. Fedimint integration
2. Mobile app (React Native)
3. More payment providers
4. Better mapping/routing
5. Reputation system improvements

## License

MIT - See [LICENSE](LICENSE) file

## Next Steps

1. **Run the demo** to understand the flow
2. **Setup a local relay** to test staking
3. **Read the NIP** to understand the protocol
4. **Join the community** to find other operators
5. **Deploy your own relay** and start earning fees!

---

Remember: This is a decentralized protocol. No company controls it. You're not just a user - you can be an operator, contributor, or fork it entirely. Welcome to true peer-to-peer ridesharing! 🚗⚡
