# DonkeyRide Protocol

> **An open protocol standard for ridesharing coordination - like HTTP for the web or SMTP for email**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Protocol Version](https://img.shields.io/badge/Protocol-v1.0-blue.svg)](./NIP-XX-ridesharing.md)
[![Event Kinds](https://img.shields.io/badge/Event_Kinds-82-green.svg)](./QUICK-REFERENCE.md)

---

## What is DonkeyRide?

**DonkeyRide is an open protocol standard** for ridesharing, delivery, and transportation coordination. It defines **82 event schemas** (kinds 30500-30599) that enable interoperability between different ridesharing operators, applications, and implementations.

Think of it like:
- **HTTP** for the web - anyone can build a browser or server
- **SMTP** for email - you can switch providers and keep your address
- **DonkeyRide** for ridesharing - switch operators while preserving your reputation

### Not a Platform, a Standard

DonkeyRide is **not** a ridesharing company. It's a **protocol specification** that allows:
- Multiple operators to compete on service quality and fees
- Users to switch providers while keeping their reputation
- Developers to build compatible apps without permission
- Drivers to avoid platform lock-in and deplatforming

---

## Key Features

### For Users
- ✅ **Data Portability** - Take your reputation to any operator
- ✅ **Operator Choice** - Switch providers like switching email hosts
- ✅ **Privacy Options** - Anonymous rides possible (Nostr pseudonyms)
- ✅ **Transparent Pricing** - Auditable surge algorithms
- ✅ **Feature Parity** - Matches Uber/Lyft 100% (see [comparison](./PLATFORM-COMPARISON.md))

### For Drivers
- ✅ **Lower Fees** - 0.5% typical (vs Uber's 25-30%)
- ✅ **No Deplatforming** - Can switch operators, protocol can't ban you
- ✅ **Reputation Ownership** - Your ratings follow you
- ✅ **Free Instant Payouts** - Lightning Network (vs $0.50-1.50 fee)
- ✅ **Transparent Earnings** - Cryptographically signed receipts

### For Operators
- ✅ **New Market Entry** - Build on existing protocol, don't start from scratch
- ✅ **Flexible Implementation** - Choose your architecture (Nostr-native, hybrid, or schema-only)
- ✅ **Regulatory Compliance** - Event schemas support GDPR, ADA, background checks, etc.
- ✅ **Compete on Service** - Not on vendor lock-in

### For Developers
- ✅ **Open Protocol** - Free to use, no licensing fees, no rate limits
- ✅ **82 Event Kinds** - Complete coverage of ridesharing scenarios
- ✅ **Extensible** - Add custom event kinds for new features
- ✅ **Interoperable** - Apps work across multiple operators

---

## Protocol Overview

### Event Kinds (30500-30599)

**Core Events** (15):
- Ride lifecycle, payments, stakes, status updates

**Safety & Emergency** (6):
- Emergency alerts, trip sharing, safety check-ins, harassment reports

**Verification** (5):
- Background checks, insurance, vehicle inspection, licenses, training

**Financial** (4):
- Tips, wait time fees, no-show fees, additional charges

**Operational** (5):
- Service areas, airport queues, flat rate zones, saved locations

**UX Features** (8):
- Preferences, lost & found, referrals, promo codes, split payment, corporate accounts

**Compliance** (3):
- Age verification, wheelchair certification, fatigue warnings

**Advanced** (36):
- Scheduled rides, carpooling, multi-leg trips, surge pricing, driver management, navigation, delivery, trust & enforcement, history & reporting

**Total**: 82 event kinds covering all production scenarios

👉 See [QUICK-REFERENCE.md](./QUICK-REFERENCE.md) for complete event kind table

---

## Implementation Patterns

DonkeyRide supports **flexible implementation** based on your market and requirements:

### 1. Nostr-Native (Maximum Decentralization)
**Use Case**: Crypto-native markets, minimal regulation

```
Rider App ←→ Public Nostr Relays ←→ Driver App
                   ↓
        Minimal Operator Service
        (PII storage + optional safety)
```

**Advantages**: Most decentralized, censorship-resistant
**Challenges**: Real-time updates via polling (slower UX)

---

### 2. Hybrid (Nostr Discovery + Private Operations)
**Use Case**: Mainstream markets (NYC, SF, London), full legal compliance

```
Rider App ←→ Public Nostr Relays (discovery + reputation)
                   ↓
             Operator Service
        (PII, real-time, payments, safety)
```

**Advantages**: Best UX (real-time WebSocket), GDPR-compliant, legally defensible
**Challenges**: More operator responsibility

---

### 3. Schema-Compatible (Traditional Centralized)
**Use Case**: Existing companies wanting interoperability, corporate fleets

```
Rider App ←→ Operator API Only
    (No public Nostr, but DonkeyRide-compatible schemas)
```

**Advantages**: Full control, existing infrastructure reuse
**Challenges**: Less decentralized, but still enables data portability

**Example**: *Uber could adopt DonkeyRide schemas for data export, allowing drivers to move to competitors*

---

## Documentation

### Getting Started
- **[FAQ.md](./FAQ.md)** - Common questions answered
- **[QUICK-REFERENCE.md](./QUICK-REFERENCE.md)** - One-page event kind table
- **[PLATFORM-COMPARISON.md](./PLATFORM-COMPARISON.md)** - Uber vs Lyft vs DonkeyRide feature comparison

### Protocol Specification
- **[NIP-XX-ridesharing.md](./NIP-XX-ridesharing.md)** - Complete protocol specification (~8,000 lines)
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Federated model explanation
- **[PROTOCOL-VS-IMPLEMENTATION.md](./PROTOCOL-VS-IMPLEMENTATION.md)** - Protocol standard positioning

### Production Readiness
- **[PRODUCTION-READINESS-FINAL.md](./PRODUCTION-READINESS-FINAL.md)** - 100% readiness assessment
- **[GAP-RESOLUTION-COMPLETE.md](./GAP-RESOLUTION-COMPLETE.md)** - All gaps fixed
- **[REFRAMING-COMPLETE.md](./REFRAMING-COMPLETE.md)** - Protocol vs platform reframing

### Implementation Guides
- **[QUICK-START.md](./QUICK-START.md)** - 5-minute setup guide
- **[OPERATOR-DEPLOYMENT.md](./OPERATOR-DEPLOYMENT.md)** - Deployment guide
- **[IMPLEMENTATION-SUMMARY.md](./IMPLEMENTATION-SUMMARY.md)** - What we built

### Explainers
- **[STAKING-EXPLAINED.md](./STAKING-EXPLAINED.md)** - Commitment stakes mechanism
- **[TRUST-MECHANISMS.md](./TRUST-MECHANISMS.md)** - 6 layers of trust
- **[WATCHDOG-INCENTIVES.md](./WATCHDOG-INCENTIVES.md)** - Game theory for monitoring
- **[OPERATOR-MISBEHAVIOR-PROTOCOL.md](./OPERATOR-MISBEHAVIOR-PROTOCOL.md)** - Theft detection & slashing
- **[WHY-UBER-STILL-EXISTS.md](./WHY-UBER-STILL-EXISTS.md)** - Market analysis
- **[UBER-FEATURE-PARITY.md](./UBER-FEATURE-PARITY.md)** - Feature comparison

---

## Quick Start

### For Protocol Reviewers
```bash
# Read the main specification
open NIP-XX-ridesharing.md

# See feature comparison
open PLATFORM-COMPARISON.md

# Check production readiness
open PRODUCTION-READINESS-FINAL.md
```

### For Developers

**Option A: Nix (recommended)**
```bash
# Clone and enter dev shell (requires Nix with flakes enabled)
git clone https://github.com/donkeyride/donkeyride
cd donkeyride
nix develop

# Start all services (PostgreSQL, Redis, Nostr relay, mock Lightning)
nix run .#services

# In another terminal, start the operator server
npm install && npm run dev
```

**Option B: Docker**
```bash
git clone https://github.com/donkeyride/donkeyride
cd donkeyride

# Start infrastructure + operator
docker compose --profile dev up
```

### For Operators
```bash
# Read deployment guide
open OPERATOR-DEPLOYMENT.md

# Review legal considerations
open NIP-XX-ridesharing.md  # See Appendix A: Regulatory Guidance

# Check architecture options
open ARCHITECTURE.md
```

---

## Feature Parity with Uber/Lyft

DonkeyRide achieves **100% feature parity** with industry leaders:

| Category | Uber | Lyft | DonkeyRide |
|----------|------|------|------------|
| **Core Features** | ✅ Excellent | ✅ Excellent | ✅ Excellent |
| **Safety** | ✅ Excellent | ✅ Good | ✅ Excellent |
| **Driver Economics** | ❌ Poor (25-30% fee) | ❌ Poor (25-30% fee) | ✅ **Excellent (0.5%)** |
| **Transparency** | ❌ Black box | ❌ Black box | ✅ **Open** |
| **Privacy** | ❌ Poor | ❌ Poor | ✅ **Excellent** |
| **Decentralization** | ❌ Monopoly | ❌ Monopoly | ✅ **Federated** |

**Unique DonkeyRide Advantages:**
- ✅ 10x lower fees (0.5% vs 25-30%)
- ✅ Data portability (export/import reputation)
- ✅ Censorship resistance (can't ban from protocol)
- ✅ Open source (anyone can verify/fork)
- ✅ Privacy-first (Lightning, pseudonyms)
- ✅ Transparent pricing (auditable algorithms)

👉 See full comparison: [PLATFORM-COMPARISON.md](./PLATFORM-COMPARISON.md)

---

## Protocol Status

**Version**: 1.0
**Status**: ✅ **100% Production-Ready**
**Event Kinds**: 82 (30500-30599 range)
**Specification**: ~8,000 lines
**Last Updated**: 2025-10-16

### Completeness

- ✅ All 82 event kinds defined with JSON examples
- ✅ Safety & emergency features (panic button, trip sharing, safety check-ins)
- ✅ Verification systems (background checks, insurance, vehicle inspection)
- ✅ Financial features (tips, wait time, no-show fees)
- ✅ Edge case handling (location errors, breakdowns, accidents, abuse)
- ✅ UX features (preferences, lost & found, split payment, corporate accounts)
- ✅ Compliance support (age verification, ADA, GDPR/CCPA)
- ✅ Dispute resolution (arbiter selection, payment failure recovery)
- ✅ Privacy model (GDPR-compliant, reputation portability)

---

## Governance

**Community Standard**: DonkeyRide is an open protocol developed by the community.

- **No company controls it** - Anyone can implement
- **Voluntary adoption** - Use as-is, modify, or ignore
- **Open contribution** - Submit improvements via pull requests
- **No patents** - Public domain / MIT licensed

---

## Legal Disclaimer

**IMPORTANT**: This is a **protocol specification**, not legal advice.

### Protocol vs Service

**What DonkeyRide Is:**
- ✅ Open communication protocol (like HTTP)
- ✅ Event schema definitions
- ✅ Interoperability standard
- ✅ Educational reference implementation

**What DonkeyRide Is NOT:**
- ❌ A ridesharing company
- ❌ A payment processor
- ❌ Legal compliance service
- ❌ Operational ridesharing platform

### Operator Responsibility

Each operator is **solely responsible** for:
- Legal compliance in their jurisdiction
- User safety and privacy
- Insurance and liability coverage
- Background checks and driver screening
- Tax reporting and financial regulations
- Data protection (GDPR, CCPA, etc.)

### No Warranty

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND. See [MIT License](#license) for details.

**Always consult qualified legal counsel** before operating ridesharing services.

👉 See [NIP-XX-ridesharing.md → Appendix A: Regulatory Guidance](./NIP-XX-ridesharing.md) for jurisdiction-specific information (non-normative).

---

## Contributing

We welcome contributions to the protocol specification!

### Ways to Contribute
- **Submit issues** - Found a gap or ambiguity?
- **Propose improvements** - Better event schemas or protocols?
- **Add implementations** - Built an operator or app?
- **Improve docs** - Clarify explanations or add examples

### Guidelines
1. Read [PROTOCOL-VS-IMPLEMENTATION.md](./PROTOCOL-VS-IMPLEMENTATION.md) first
2. Keep protocol **implementation-agnostic** (no mandated solutions)
3. Maintain **backward compatibility** when possible
4. Add **examples** for clarity
5. Update **QUICK-REFERENCE.md** if adding/changing event kinds

---

## Community

### Submit Protocol to Nostr NIP Repository
DonkeyRide will be submitted as **NIP-XX** to the [Nostr NIP repository](https://github.com/nostr-protocol/nips) for community review.

### Discussion
- **GitHub Issues**: For protocol improvements and clarifications
- **Nostr**: `npub1...` (TBD - after NIP submission)

---

## License

**MIT License**

Copyright (c) 2025 DonkeyRide Community

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## Acknowledgments

DonkeyRide builds on:
- **[Nostr Protocol](https://github.com/nostr-protocol/nips)** - Decentralized communication layer
- **[Lightning Network](https://lightning.network/)** - Instant Bitcoin payments
- **[NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md)**, **[NIP-02](https://github.com/nostr-protocol/nips/blob/master/02.md)**, **[NIP-04](https://github.com/nostr-protocol/nips/blob/master/04.md)**, **[NIP-33](https://github.com/nostr-protocol/nips/blob/master/33.md)** - Foundational Nostr specifications

Special thanks to the Nostr and Bitcoin communities for creating the decentralized infrastructure this protocol leverages.

---

**Questions?** See [FAQ.md](./FAQ.md) or open an issue.

**Ready to build?** Start with [QUICK-START.md](./QUICK-START.md).

**Want to operate?** Read [OPERATOR-DEPLOYMENT.md](./OPERATOR-DEPLOYMENT.md).

---

*"The best protocols are the ones everyone can use. Let's build an open future for ridesharing."*
