# DonkeyRide Operator Quick Start Guide

## Get Started in 5 Minutes

### Step 1: Install Dependencies

```bash
git clone https://github.com/donkeyride/donkeyride.git
cd donkeyride
npm install
```

**Using Nix** (recommended — handles all system dependencies):
```bash
nix develop                # Enter dev shell with Node.js, PostgreSQL, Redis, etc.
nix run .#services         # Start all services
npm run dev                # Start operator with auto-reload
```

---

### Step 2: Configure Your Operator

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` and set your configuration.

**Minimum Required:**
```env
OPERATOR_PUBKEY=npub1...           # Your Nostr public key
OPERATOR_NSEC=nsec1...             # Your Nostr private key (KEEP SECRET)
OPERATOR_LIGHTNING=you@getalby.com # Where you receive fees
PAYMENT_PROVIDER=demo              # Start with demo, upgrade later
DOMAIN=ridesharing                 # Choose your domain (see Step 3)
```

---

### Step 3: Choose Your Domain

DonkeyRide is a **multi-domain** protocol. One codebase serves different use cases via the `DOMAIN` environment variable:

```bash
DOMAIN=ridesharing npm start   # Rider/driver coordination (default)
DOMAIN=locksmith npm start     # Locksmith dispatch
DOMAIN=delivery npm start      # Parcel delivery
```

Each domain loads its own state machine, role names, pricing model, and feature flags. The rest of the infrastructure (payment providers, authentication, reputation) works identically across all domains.

| Domain | Requester | Provider | Pricing Model |
|--------|-----------|----------|---------------|
| `ridesharing` | Rider | Driver | Distance + time + surge |
| `locksmith` | Customer | Locksmith | Flat rate (quote negotiation) |
| `delivery` | Sender | Courier | Distance-based |

To add a custom domain, create a profile in `src/domain-profiles/` (~100 lines). See the [use case catalogue](https://github.com/TheCryptoDonkey/trott/blob/main/docs/use-cases.md) for 20+ analysed domains.

---

### Step 4: Choose Your Payment Provider

The protocol is **payment-agnostic**. Start with `demo` for testing, then choose a production provider:

#### Option A: Demo (Testing)
```env
PAYMENT_PROVIDER=demo
```
Virtual funds, no real money. Perfect for development.

#### Option B: Cash (Easiest Production Setup — No Custody)
```env
PAYMENT_PROVIDER=cash
```
The fare settles face-to-face in cash. The operator records the settlement but never touches the money — the model that powers inDrive across cash-first markets.

**Trust model:** `social` — commitments and forfeits are recorded against each party's pubkey; nothing is held.

> **Planned rails (not yet implemented — the factory rejects them with a clear
> error):** `nwc` (NIP-47 wallet-to-wallet hold invoices), `stripe` (pure
> fiat), Cashu ecash, M-Pesa mobile money.

#### Option C: LND (Operator Lightning Node)
```env
PAYMENT_PROVIDER=lnd
LND_HOST=localhost:10009
LND_CERT_PATH=~/.lnd/tls.cert
LND_MACAROON_PATH=~/.lnd/data/chain/bitcoin/mainnet/admin.macaroon
```
Trustless hodl invoices. Operator runs their own Lightning node.

**Trust model:** `custodial` — operator's node holds funds temporarily. Hodl invoices prevent theft.

#### Option F: BTCPay Server (Self-hosted)
```env
PAYMENT_PROVIDER=btcpay
BTCPAY_URL=https://btcpay.example.com
BTCPAY_API_KEY=...
BTCPAY_STORE_ID=...
```

#### Option G: Core Lightning
```env
PAYMENT_PROVIDER=cln
CLN_SOCKET=/path/to/lightning-rpc
```

For the full payment provider guide (trust models, capabilities, adding custom providers), see [../docs/PAYMENT-PROVIDERS.md](../docs/PAYMENT-PROVIDERS.md).

---

### Step 5: Configure Fallbacks (Optional but Recommended)

For maximum resilience, configure backup providers:

```env
PAYMENT_PROVIDER=lnd                   # Primary
PAYMENT_FALLBACKS=btcpay,demo          # Backups (comma-separated)

# Configure credentials for all providers
BTCPAY_URL=...
LND_HOST=...
```

If LND fails, the `ResilientStakeManager` automatically falls back to BTCPay, then demo.

---

### Step 6: Start Your Operator

```bash
npm start
```

You should see:
```
========================================
DonkeyRide Operator Server
========================================
Domain: ridesharing
Payment provider: lnd (custodial)
Features: instantRelease, refunds

Operator: npub1abc...
Fee: 3%
API Port: 3000
WebSocket Port: 3001
========================================
NIP-98 authentication enabled
Rate limiting active
========================================
```

**Development mode** (auto-reload on changes):
```bash
npm run dev
```

**Docker:**
```bash
docker compose up                      # Production
docker compose --profile dev up        # Development (adds mock services)
```

---

### Step 7: Test Your Operator

#### Check Operator Info
```bash
curl http://localhost:3000/info
```

Response:
```json
{
  "operator": "npub1...",
  "lightning": "operator@getalby.com",
  "fee": "3%",
  "domain": "ridesharing",
  "activeTasks": 0,
  "paymentProvider": {
    "name": "lnd",
    "trustModel": "custodial-third-party",
    "features": {
      "instantRelease": true,
      "refunds": true
    }
  }
}
```

#### Health Check
```bash
curl http://localhost:3000/health
```

#### Run Tests
```bash
npm test                               # All backend tests
npm run web:test                       # Frontend tests (run npm install in web/ first)
```

---

## Configuration Examples

### Minimal (Demo — Testing Only)
```env
OPERATOR_PUBKEY=npub1...
OPERATOR_NSEC=nsec1...
PAYMENT_PROVIDER=demo
DOMAIN=ridesharing
```

### Cash-First (No Custody — Simplest Real Deployment)
```env
OPERATOR_PUBKEY=npub1...
OPERATOR_NSEC=nsec1...
OPERATOR_LIGHTNING=you@getalby.com
OPERATOR_FEE_PERCENT=0.03
PAYMENT_PROVIDER=cash
DOMAIN=ridesharing
NOSTR_RELAYS=wss://relay.trotters.cc
ENABLE_NIP98_AUTH=true
ENABLE_RATE_LIMITING=true
```

### Multi-Domain (Ridesharing + Locksmith)
```bash
# Terminal 1: Ridesharing on port 3000
PORT=3000 WS_PORT=3001 DOMAIN=ridesharing npm start

# Terminal 2: Locksmith on port 3002
PORT=3002 WS_PORT=3003 DOMAIN=locksmith npm start
```

### Production (Multiple Providers + Fallbacks)
```env
OPERATOR_PUBKEY=npub1...
OPERATOR_NSEC=nsec1...
OPERATOR_LIGHTNING=you@getalby.com
OPERATOR_FEE_PERCENT=0.03
BOND_AMOUNT=5000000

DOMAIN=ridesharing
PAYMENT_PROVIDER=lnd
PAYMENT_FALLBACKS=btcpay,demo
LND_HOST=localhost:10009
LND_CERT_PATH=~/.lnd/tls.cert
LND_MACAROON_PATH=~/.lnd/data/chain/bitcoin/mainnet/admin.macaroon

PORT=3000
WS_PORT=3001
NOSTR_RELAYS=wss://relay.trotters.cc

NAVIGATION_PROVIDER=osrm
OSRM_URL=http://localhost:5000

DATABASE_URL=postgresql://donkeyride:password@localhost:5432/donkeyride
REDIS_URL=redis://localhost:6379

ENABLE_NIP98_AUTH=true
ENABLE_RATE_LIMITING=true
```

---

## Troubleshooting

### "Failed to initialise payment provider"
- Check your API keys and credentials
- Ensure Lightning nodes are running (for LND/CLN)
- Verify paths to cert/macaroon files
- Check file permissions

### "NIP-98 auth failed"
- Ensure Authorization header format: `Nostr <base64-event>`
- Check event timestamp is within 60 seconds
- Verify URL and method tags match request
- Confirm signature is valid

### "Rate limit exceeded"
- Wait for rate limit window to reset
- Check `X-RateLimit-Reset` header
- Reduce request frequency

### LND Connection Failed
```bash
lncli getinfo                          # Test LND connection
ls -la ~/.lnd/tls.cert                 # Check cert path
ls -la ~/.lnd/data/chain/bitcoin/mainnet/admin.macaroon  # Check macaroon
```

---

## Security Best Practices

1. **Keep nsec secret** — never commit to git, never share
2. **Use strong bonds** — demonstrates commitment to users
3. **Enable NIP-98 auth** — always use `ENABLE_NIP98_AUTH=true`
4. **Configure rate limiting** — prevent abuse
5. **Use fallbacks** — don't rely on a single payment provider
6. **Monitor logs** — watch for suspicious activity
7. **Automate data purge** — 90-day retention for operational data (GDPR)
8. **Backup keys** — store nsec safely offline

---

## Next Steps

1. Get operator running with `demo` provider
2. Test with the React frontend (`npm run web:dev`)
3. Switch to a production payment provider (`cash` for no-custody, `lnd` for Lightning stakes)
4. Configure GDPR compliance ([../docs/GDPR-COMPLIANCE.md](../docs/GDPR-COMPLIANCE.md))
5. Publish operator bond event (kind 30540) to Nostr
6. Start earning fees

---

## Further Reading

- **[OPERATOR-DEPLOYMENT.md](OPERATOR-DEPLOYMENT.md)** — Full deployment guide (GDPR, economics, architecture)
- **[../docs/PAYMENT-PROVIDERS.md](../docs/PAYMENT-PROVIDERS.md)** — Payment provider integration guide
- **[../docs/GDPR-COMPLIANCE.md](../docs/GDPR-COMPLIANCE.md)** — GDPR compliance guide
- **[Trust Mechanisms](https://github.com/TheCryptoDonkey/trott/blob/main/docs/trust-mechanisms.md)** — 6 layers of trust
- **[Quick Reference](https://github.com/TheCryptoDonkey/trott/blob/main/specs/QUICK-REFERENCE.md)** — Protocol event kinds reference
- **[Architecture](https://github.com/TheCryptoDonkey/trott/blob/main/docs/architecture.md)** — Three-layer federated architecture
