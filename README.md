# DonkeyRide — Open Protocol for Trust-Minimised Service Coordination

> **An open protocol standard for service coordination — like HTTP for the web or SMTP for email**

[![Licence: MIT](https://img.shields.io/badge/Licence-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Protocol Version](https://img.shields.io/badge/Protocol-v4.0-blue.svg)](./specs/QUICK-REFERENCE.md)
[![Event Kind Range](https://img.shields.io/badge/Event_Kinds-20500--30779-green.svg)](./specs/QUICK-REFERENCE.md)

---

## What is DonkeyRide?

**DonkeyRide is an open protocol standard** for trust-minimised service coordination between strangers. It defines the **TROTT Protocol** (**T**rusted **R**eal-world **O**rchestration of **T**asks & **T**rades) — a family of 7 modular specifications built on Nostr covering task lifecycle, discovery, reputation, payments, safety, coordination, and navigation — enabling interoperability across operators, applications, and use cases.

Think of it like:
- **HTTP** for the web — anyone can build a browser or server
- **SMTP** for email — you can switch providers and keep your address
- **DonkeyRide** for services — switch operators while preserving your reputation

### Not a Platform, a Standard

DonkeyRide is **not** a company. It's a **protocol specification** that allows:
- Multiple operators to compete on service quality and fees
- Users to switch providers while keeping their reputation
- Developers to build compatible apps without permission
- Providers to avoid platform lock-in and deplatforming

### Use Cases

The protocol is **domain-agnostic**. One specification serves many service verticals:

| Domain | Status | Description |
|--------|--------|-------------|
| **Ridesharing** | Implemented | Rider/driver coordination, streaming payments, live tracking |
| **Locksmith dispatch** | Implemented | Customer/locksmith, quote negotiation, flat-rate pricing |
| **Parcel delivery** | Implemented | Sender/courier, chain of custody, photo/signature proofs |
| Court serving | Designed | Process server dispatch, proof of service, GPS verification |
| Security guard | Designed | Shift-based dispatch, heartbeat check-ins, patrol verification |
| Emergency trades | Designed | Plumber/electrician, urgent callout, milestone payments |
| Man with van | Designed | Furniture moving, distance-based pricing, inventory tracking |
| Dog walking | Designed | Pet care, GPS route sharing, photo check-ins |
| Car wash | Designed | On-demand detailing, before/after photos, lump-sum payment |
| Companion care | Designed | Session-based, heartbeat monitoring, safety check-ins |

Each domain is defined by a **domain profile** (~100 lines) that configures the shared state machine, role names, pricing model, and feature flags. Adding a new domain requires no protocol changes.

---

## Key Features

### Currency-Neutral Payments

The protocol is **payment-agnostic**. Every monetary event includes explicit `amount`, `currency`, and `trust_model` tags, enabling the same protocol to work across any payment rail:

| Provider | Trust Model | Currencies | Best For |
|----------|------------|------------|----------|
| NIP-47 (hold invoices) | `trustless` | SAT/BTC | Sovereignty-minded users |
| Strike | `fiat-escrow` | GBP/USD/EUR/SAT | Fiat UX, everyday use |
| Stripe | `operator-escrow` | Any fiat | Fiat-only markets |
| Cashu / Fedimint | `ecash-htlc` | SAT (ecash) | Privacy-focused users |

**Design principle: Bitcoin rails, fiat UX.** A customer sees "pay £12.50" on their card. Strike converts to sats over Lightning. The provider receives payment instantly. Neither party had a taxable crypto event, and the protocol got Lightning's speed and low fees.

### For Requesters
- **Data portability** — take your reputation to any operator
- **Operator choice** — switch providers like switching email hosts
- **Privacy options** — pseudonymous service via Nostr keys
- **Trust transparency** — see every provider's trust model before committing
- **Transparent pricing** — auditable algorithms, no black-box surge

### For Providers
- **Lower fees** — operators compete (typically 1-5% vs 25-30% on traditional platforms)
- **No deplatforming** — switch operators freely, the protocol can't ban you
- **Reputation ownership** — your ratings are cryptographically signed on Nostr
- **Instant settlement** — Lightning payments arrive in seconds, not days
- **Transparent earnings** — cryptographically signed receipts

### For Operators
- **New market entry** — build on existing protocol, don't start from scratch
- **Flexible payment rails** — choose your payment provider and trust model
- **Regulatory compliance** — GDPR, background checks, insurance built into the architecture
- **Compete on service** — not on vendor lock-in
- **Thin compliance layer** — the operator handles safety, checks, and insurance; everything else runs on decentralised rails

### For Developers
- **Open protocol** — free to use, no licensing fees, no rate limits
- **Modular specs** — implement only the TROTT specs your use case needs
- **Extensible** — add domain extensions for new service verticals
- **Interoperable** — apps work across multiple operators

---

## Architecture

DonkeyRide uses a **three-layer federated architecture**:

```
NOSTR (public, permanent)     →  Discovery + Reputation + PII Exchange + Coordination
                                  Decentralised — no single point of failure

OPERATOR (private, compliant) →  Safety Monitoring + Background Checks + Insurance
                                  Federated — multiple operators compete

PAYMENT PROVIDERS             →  Stakes + Streaming Payments + Settlement
                                  Flexible — trustless to custodial, user chooses
```

The operator is a **thin compliance layer** — handling only what the law mandates (24/7 safety monitoring, background checks, insurance). Everything else runs on decentralised rails:

- **Stake custody** → NIP-47 (user wallet to user wallet, operator never touches funds)
- **PII exchange** → NIP-17 gift-wrapped messages (relay can't read, operator can't read)
- **Coordination** → NIP-44 encrypted Nostr events (status updates, ETAs)
- **Discovery** → Geohash-based on public relays (kinds 20500, 30510-30512)
- **Reputation** → Cryptographically signed on Nostr (kinds 30520-30522)

**We are federated, not fully decentralised.** This is the right trade-off — it gives us GDPR compliance, legal liability, safety monitoring, and good UX whilst preserving the benefits of decentralised discovery, reputation, and payments.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full analysis.

---

## TROTT Protocol Specifications

The protocol is organised as a **family of 7 focused specifications**. Each spec stands alone and can be implemented independently. Domain profiles declare which specs they use.

| Spec | Kinds | Scope |
|------|-------|-------|
| [TROTT-01: Core](./specs/TROTT-01-core.md) | 30500-30507 | Task lifecycle, state machine, scheduling, multi-provider. The minimum viable protocol. |
| [TROTT-02: Discovery](./specs/TROTT-02-discovery.md) | 20500, 30510-30512 | Provider availability, geohash search, skill search, trusted provider networks. |
| [TROTT-03: Reputation](./specs/TROTT-03-reputation.md) | 30520-30522 | Ratings, trust weighting, credentials, cross-domain reputation portability. |
| [TROTT-04: Payments](./specs/TROTT-04-payments.md) | 30530-30536 | Quotes, escrow, streaming, milestones, split payments. Currency-neutral. |
| [TROTT-05: Safety](./specs/TROTT-05-safety.md) | 30540-30546 | Emergency signals, safety check-ins, dispute resolution, abuse reporting. |
| [TROTT-06: Coordination](./specs/TROTT-06-coordination.md) | 30550-30554 | Operator participation, PII handling, compliance, delegation. **Optional.** |
| [TROTT-07: Navigation](./specs/TROTT-07-navigation.md) | 20501, 30560-30563 | Routing, ETA, live tracking, route deviation alerts. **Optional.** |

### Domain Profiles

| Domain | Kind Range | Coordination Pattern |
|--------|-----------|---------------------|
| [Ridesharing](./specs/domains/ridesharing.md) | 30600-30619 | Trip |
| [Locksmith](./specs/domains/locksmith.md) | 30620-30639 | Dispatch |
| [Delivery](./specs/domains/delivery.md) | 30640-30659 | Relay delivery |
| [Towing](./specs/domains/towing.md) | 30660-30679 | Dispatch + Trip |
| [Emergency Trades](./specs/domains/emergency-trades.md) | 30680-30699 | Dispatch |
| [Pet Services](./specs/domains/pet-services.md) | 30700-30719 | Scheduled |
| [Security](./specs/domains/security.md) | 30720-30739 | Shift / Patrol |
| [Cleaning](./specs/domains/cleaning.md) | 30740-30759 | Scheduled / Recurring |
| [Moving](./specs/domains/moving.md) | 30760-30779 | Crew / Multi-provider |

**Total: 39 event kinds** (26 parameterised replaceable + 11 append-only + 2 ephemeral) across 7 core specs and 9 domain profiles.

See [specs/QUICK-REFERENCE.md](./specs/QUICK-REFERENCE.md) for the complete event kind table.

---

## Quick Start

### For Protocol Reviewers
```bash
# Read the quick reference
open specs/QUICK-REFERENCE.md

# Read the core specification
open specs/TROTT-01-core.md

# See architecture analysis
open ARCHITECTURE.md
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

**Run with a different domain:**
```bash
DOMAIN=locksmith npm start     # Locksmith dispatch
DOMAIN=delivery npm start      # Parcel delivery
DOMAIN=ridesharing npm start   # Default (ridesharing)
```

### For Operators
```bash
# Read deployment guide
open guides/OPERATOR-DEPLOYMENT.md

# Check architecture options
open ARCHITECTURE.md

# Review trust mechanisms
open TRUST-MECHANISMS.md
```

---

## Documentation

### Protocol Specification
- **[specs/QUICK-REFERENCE.md](./specs/QUICK-REFERENCE.md)** — One-page event kind table and structure overview
- **[specs/TROTT-01-core.md](./specs/TROTT-01-core.md)** — Core service coordination protocol
- **[specs/](./specs/)** — All TROTT specifications and domain profiles

### Architecture & Trust
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Three-layer federated architecture, decentralisation scorecard
- **[TRUST-MECHANISMS.md](./TRUST-MECHANISMS.md)** — 6 layers of trust (reputation, bonds, insurance, limits, multi-sig, trustless)
- **[STAKING-EXPLAINED.md](./STAKING-EXPLAINED.md)** — Commitment stakes mechanism explained

### Guides
- **[guides/QUICK-START.md](./guides/QUICK-START.md)** — 5-minute setup guide
- **[guides/OPERATOR-DEPLOYMENT.md](./guides/OPERATOR-DEPLOYMENT.md)** — Production deployment guide
- **[docs/PAYMENT-PROVIDERS.md](./docs/PAYMENT-PROVIDERS.md)** — Payment provider integration guide

### Compliance & Safety
- **[docs/GDPR-COMPLIANCE.md](./docs/GDPR-COMPLIANCE.md)** — GDPR compliance architecture
- **[docs/USE-CASE-STATE-MACHINES.md](./docs/USE-CASE-STATE-MACHINES.md)** — 10 domain state machines with real-world analysis

### Explainers
- **[FAQ.md](./FAQ.md)** — Common questions answered
- **[PLATFORM-COMPARISON.md](./PLATFORM-COMPARISON.md)** — DonkeyRide vs traditional platforms
- **[WATCHDOG-INCENTIVES.md](./WATCHDOG-INCENTIVES.md)** — Game theory for monitoring
- **[OPERATOR-MISBEHAVIOR-PROTOCOL.md](./OPERATOR-MISBEHAVIOR-PROTOCOL.md)** — Theft detection and slashing

---

## Governance

**Community standard**: DonkeyRide is an open protocol developed by the community.

- **No company controls it** — anyone can implement
- **Voluntary adoption** — use as-is, modify, or ignore
- **Open contribution** — submit improvements via pull requests
- **No patents** — MIT licensed

---

## Contributing

We welcome contributions to the protocol specification.

### Ways to Contribute
- **Submit issues** — found a gap or ambiguity?
- **Propose improvements** — better event schemas or protocols?
- **Add implementations** — built an operator or app?
- **Add domain profiles** — new service vertical? Create a domain profile (~100 lines)
- **Improve docs** — clarify explanations or add examples

### Guidelines
1. Keep protocol **implementation-agnostic** (no mandated solutions)
2. Maintain **backward compatibility** when possible
3. Add **examples** for clarity
4. Update **specs/QUICK-REFERENCE.md** if adding or changing event kinds
5. Use **British English** spelling throughout

---

## Legal Disclaimer

**IMPORTANT**: This is a **protocol specification**, not legal advice.

**What DonkeyRide is:**
- An open communication protocol (like HTTP)
- Event schema definitions for service coordination
- An interoperability standard
- An educational reference implementation

**What DonkeyRide is not:**
- A service company
- A payment processor
- A legal compliance service
- An operational platform

Each operator is **solely responsible** for legal compliance in their jurisdiction, user safety, insurance, background checks, tax reporting, and data protection.

**Always consult qualified legal counsel** before operating coordination services.

---

## Licence

**MIT Licence**

Copyright (c) 2025-2026 DonkeyRide Community

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

## Acknowledgements

DonkeyRide builds on:
- **[Nostr Protocol](https://github.com/nostr-protocol/nips)** — Decentralised communication layer
- **[Lightning Network](https://lightning.network/)** — Instant Bitcoin payments
- **[NIP-33](https://github.com/nostr-protocol/nips/blob/master/33.md)**, **[NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md)**, **[NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md)**, **[NIP-47](https://github.com/nostr-protocol/nips/blob/master/47.md)** — Foundational Nostr specifications

Special thanks to the Nostr and Bitcoin communities for creating the decentralised infrastructure this protocol leverages.

---

**Questions?** See [FAQ.md](./FAQ.md) or open an issue.

**Ready to build?** Start with [guides/QUICK-START.md](./guides/QUICK-START.md).

**Want to operate?** Read [guides/OPERATOR-DEPLOYMENT.md](./guides/OPERATOR-DEPLOYMENT.md).

---

*"The best protocols are the ones everyone can use. Let's build an open future for service coordination."*
