# DonkeyRide Operator Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Install Dependencies

```bash
npm install
```

This will install:
- Express, CORS, WebSocket
- Nostr Tools
- LN Service (for LND)
- C-Lightning Client (for CLN)

---

### Step 2: Configure Your Operator

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` and set your configuration.

**Minimum Required:**
```bash
OPERATOR_PUBKEY=npub1...      # Your Nostr public key
OPERATOR_NSEC=nsec1...        # Your Nostr private key (KEEP SECRET!)
OPERATOR_LIGHTNING=you@getalby.com  # Where you receive fees
PAYMENT_PROVIDER=strike       # Choose: strike|lnd|btcpay|alby|cln
```

---

### Step 3: Choose Your Payment Provider

You have 5 options. Pick what works for you:

#### Option A: Strike (Easiest) ⚡
**Best for:** Getting started quickly

```bash
# .env
PAYMENT_PROVIDER=strike
STRIKE_API_KEY=sk_live_...   # Get from dashboard.strike.me
```

**Pros:** Easy setup, instant settlement
**Cons:** Custodial, requires KYC for large amounts

---

#### Option B: LND (Most Trustless) 🔒
**Best for:** Maximum security, can't steal funds

```bash
# .env
PAYMENT_PROVIDER=lnd
LND_HOST=localhost:10009
LND_CERT_PATH=/home/user/.lnd/tls.cert
LND_MACAROON_PATH=/home/user/.lnd/data/chain/bitcoin/mainnet/admin.macaroon
```

**Pros:** Trustless hodl invoices, operator physically cannot steal
**Cons:** Requires running LND node

**Prerequisites:**
- Running LND node
- Funded channels
- Admin macaroon

---

#### Option C: BTCPay Server (Self-hosted) 🏠
**Best for:** Full control, privacy

```bash
# .env
PAYMENT_PROVIDER=btcpay
BTCPAY_URL=https://btcpay.example.com
BTCPAY_API_KEY=...
BTCPAY_STORE_ID=...
```

**Pros:** Self-hosted, open source, no third party
**Cons:** Requires BTCPay Server setup

**Prerequisites:**
- Running BTCPay Server instance
- Lightning node connected to BTCPay
- API key with invoice permissions

---

#### Option D: Alby (User-friendly) 😊
**Best for:** Simple, good UX

```bash
# .env
PAYMENT_PROVIDER=alby
ALBY_API_KEY=...
```

**Pros:** Easy, browser extension, WebLN support
**Cons:** Custodial

---

#### Option E: Core Lightning (Trustless Alternative) ⚡🔒
**Best for:** Alternative to LND

```bash
# .env
PAYMENT_PROVIDER=cln
CLN_SOCKET=/home/user/.lightning/bitcoin/lightning-rpc
```

**Pros:** Trustless, lightweight
**Cons:** Requires CLN node with hold plugin

---

### Step 4: Configure Fallbacks (Optional but Recommended)

For maximum resilience, configure backup providers:

```bash
# .env
PAYMENT_PROVIDER=lnd                    # Primary
PAYMENT_FALLBACKS=btcpay,strike,alby   # Backups

# Configure credentials for all providers
LND_HOST=...
BTCPAY_URL=...
STRIKE_API_KEY=...
ALBY_API_KEY=...
```

If LND fails, automatically falls back to BTCPay, then Strike, then Alby.

---

### Step 5: Start Your Operator

```bash
npm start
```

You should see:
```
========================================
DonkeyRide Operator Server
========================================
✅ Payment provider initialized: lnd
   Trust model: trustless
   Features: instantRelease, refunds, automaticRefund, trustless

Operator: npub1abc...
Lightning: operator@getalby.com
Fee: 0.5%
Payment Provider: lnd (hodl)
API Port: 3000
WebSocket Port: 3001
========================================

🔐 NIP-98 authentication enabled
🛡️  Rate limiting active
⚡ Multiple payment providers supported
========================================
```

---

### Step 6: Test Your Operator

#### Check Operator Info
```bash
curl http://localhost:3000/info
```

Response:
```json
{
  "operator": "npub1...",
  "lightning": "operator@getalby.com",
  "fee": "0.5%",
  "activeRides": 0,
  "paymentProvider": {
    "name": "lnd",
    "type": "hodl",
    "trustModel": "trustless",
    "features": {
      "instantRelease": true,
      "refunds": true,
      "trustless": true
    }
  }
}
```

#### Test Authenticated Request (NIP-98)
You'll need Nostr tools to create signed requests.

See `middleware/nip98-auth.js` for helper functions:
- `generateAuthEvent(url, method, privateKey)`
- `createAuthHeader(event)`

---

## 🔧 Configuration Examples

### Minimal (Strike)
```bash
OPERATOR_PUBKEY=npub1...
OPERATOR_NSEC=nsec1...
OPERATOR_LIGHTNING=you@getalby.com
PAYMENT_PROVIDER=strike
STRIKE_API_KEY=sk_live_...
```

### Production (LND + Fallbacks)
```bash
OPERATOR_PUBKEY=npub1...
OPERATOR_NSEC=nsec1...
OPERATOR_LIGHTNING=you@getalby.com
OPERATOR_FEE_PERCENT=0.005
BOND_AMOUNT=1000000
BOND_ADDRESS=bc1q...

# Primary: Trustless LND
PAYMENT_PROVIDER=lnd
LND_HOST=localhost:10009
LND_CERT_PATH=~/.lnd/tls.cert
LND_MACAROON_PATH=~/.lnd/data/chain/bitcoin/mainnet/admin.macaroon

# Fallbacks
PAYMENT_FALLBACKS=btcpay,strike
BTCPAY_URL=https://btcpay.myoperator.com
BTCPAY_API_KEY=...
BTCPAY_STORE_ID=...
STRIKE_API_KEY=sk_live_...

# Server
PORT=3000
WS_PORT=3001
NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol

# Security
ENABLE_NIP98_AUTH=true
ENABLE_RATE_LIMITING=true
```

---

## 🐛 Troubleshooting

### "Failed to initialize payment provider"
- Check your API keys
- Ensure Lightning nodes are running
- Verify paths to cert/macaroon files
- Check file permissions

### "NIP-98 auth failed"
- Ensure Authorization header format: `Nostr <base64-event>`
- Check event timestamp is within 60 seconds
- Verify URL and method tags match request
- Confirm signature is valid

### "Rate limit exceeded"
- Wait for rate limit window to reset
- Check X-RateLimit-Reset header
- Reduce request frequency

### LND Connection Failed
```bash
# Test LND connection
lncli getinfo

# Check cert path
ls -la ~/.lnd/tls.cert

# Check macaroon path
ls -la ~/.lnd/data/chain/bitcoin/mainnet/admin.macaroon

# Verify permissions
chmod 600 ~/.lnd/tls.cert
chmod 600 ~/.lnd/data/chain/bitcoin/mainnet/admin.macaroon
```

### BTCPay Connection Failed
```bash
# Test BTCPay API
curl -H "Authorization: Bearer ${API_TOKEN}" \
  https://btcpay.example.com/api/v1/health

# Check store ID
curl -H "Authorization: Bearer ${API_TOKEN}" \
  https://btcpay.example.com/api/v1/stores
```

---

## 📊 Monitoring Your Operator

### Health Check
```bash
curl http://localhost:3000/health
```

### Active Rides
```bash
curl http://localhost:3000/info | jq '.activeRides'
```

### Provider Status
```bash
curl http://localhost:3000/info | jq '.paymentProvider'
```

---

## 🔐 Security Best Practices

1. **Keep nsec secret** - Never commit to git, never share
2. **Use strong bonds** - 1M+ sats shows commitment
3. **Enable auth** - Always use NIP-98 authentication
4. **Configure rate limiting** - Prevent abuse
5. **Use fallbacks** - Don't rely on single provider
6. **Monitor logs** - Watch for suspicious activity
7. **Update regularly** - Keep dependencies current
8. **Backup keys** - Store nsec safely offline

---

## 🎯 Next Steps

1. ✅ Get operator running
2. ✅ Test with small stakes
3. ✅ Configure monitoring
4. ✅ Join operator network
5. ✅ Publish operator bond event (kind 30540)
6. ✅ Start earning fees!

---

## 📚 Further Reading

- `IMPLEMENTATION-SUMMARY.md` - What we built
- `NIP-XX-ridesharing.md` - Full protocol spec
- `OPERATOR-DEPLOYMENT.md` - Deployment guide
- `TRUST-MECHANISMS.md` - Security deep dive
- `WATCHDOG-INCENTIVES.md` - Game theory

---

## 🆘 Need Help?

- GitHub Issues: https://github.com/donkeyride/donkeyride/issues
- Nostr: Search for #donkeyride
- Documentation: Check the docs/ folder

---

**Welcome to the decentralized rideshare revolution! 🚀**

You're now running an unstoppable, censorship-resistant operator that can't deplatform drivers and lets them keep 99-100% of fares.
