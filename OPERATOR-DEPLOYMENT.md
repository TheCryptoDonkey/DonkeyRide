# Operator Deployment Guide

## What Is An Operator?

An operator is a **standalone service** (not a Nostr relay) that:
- Provides REST API for stake management
- Locks/releases stakes via Strike or Lightning
- Publishes events TO existing Nostr relays
- Earns fees (typically 0.5% of ride value)

## Key Distinction: Operator ≠ Nostr Relay

```
❌ WRONG: Operator is a Nostr relay
✅ RIGHT: Operator uses Nostr relays

Operators:
- HTTP/REST services
- Stake coordination
- Publish TO Nostr relays (as clients)
- Don't store events
- Don't relay events

Nostr Relays:
- WebSocket services
- Store and relay events
- Used by everyone
- No DonkeyRide-specific logic
```

## Architecture

```
┌──────────────────────────────────┐
│   Nostr Relay Network            │
│   (Existing infrastructure)      │
│   - relay.damus.io               │
│   - nos.lol                      │
└──────────────────────────────────┘
         ↑                  ↑
         │  Events          │
         │                  │
    ┌────┴─────┐       ┌───┴────┐
    │  Rider   │       │ Driver │
    └────┬─────┘       └───┬────┘
         │                  │
         │  Stake API       │
         └────┬─────────────┘
              ↓
    ┌─────────────────────────────┐
    │  DonkeyRide Operator        │
    │  - Express REST API         │
    │  - Strike integration       │
    │  - Publishes to Nostr       │
    └─────────────────────────────┘
```

## Quick Start

```bash
# Run operator service
docker run -d \
  -p 3000:3000 \
  -e OPERATOR_PUBKEY=npub1... \
  -e OPERATOR_NSEC=nsec1... \
  -e STRIKE_API_KEY=sk_... \
  -e OPERATOR_FEE=0.005 \
  -e NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol \
  donkeyride/operator:latest

# That's it! No Nostr relay needed.
```

## How It Works

1. **Operator announces** - Publishes bond event (kind 30540) to Nostr
2. **Clients discover** - Query Nostr relays for operators
3. **Clients use** - Call operator's REST API for stakes
4. **Operator publishes** - Lock/release events to Nostr
5. **Clients verify** - Check Nostr to verify operator's actions

## Configuration

Required variables:
```bash
OPERATOR_PUBKEY=npub1...
OPERATOR_NSEC=nsec1...
STRIKE_API_KEY=sk_...
OPERATOR_FEE=0.005
NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol
LIGHTNING_ADDRESS=you@getalby.com
BOND_AMOUNT=1000000
```

## Economics

```
100 rides/day × 1000 sats × 0.5% = 500 sats/day ≈ $0.20/day
1000 rides/day = $2/day = $60/month
10000 rides/day = $20/day = $600/month

Costs: ~$10/month VPS
Break-even: ~200 rides/month
```

See `server.js` for reference implementation.
