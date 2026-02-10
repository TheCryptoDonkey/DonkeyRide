# DonkeyRide Protocol — Frequently Asked Questions

**Last Updated**: 2026-02-08
**Protocol Version**: v3.0

---

## Table of Contents

1. [Basics](#basics)
2. [Use Cases & Domains](#use-cases--domains)
3. [Payments & Trust Models](#payments--trust-models)
4. [Decentralisation & Architecture](#decentralisation--architecture)
5. [Privacy & GDPR](#privacy--gdpr)
6. [Economics & Fees](#economics--fees)
7. [Legal & Compliance](#legal--compliance)
8. [Technical Details](#technical-details)
9. [For Developers](#for-developers)
10. [For Operators](#for-operators)
11. [For Providers](#for-providers)
12. [For Requesters](#for-requesters)

---

## Basics

### What is DonkeyRide?

**DonkeyRide is an open protocol standard** for trust-minimised service coordination — similar to how HTTP is a standard for the web or SMTP is a standard for email.

It's **not** a company. It's a family of modular TROTT (Trusted Real-world Orchestration of Tasks & Trades) specifications built on Nostr that define how requesters, providers, and operators coordinate services — from ridesharing to locksmith dispatch to parcel delivery.

### Why not just use Uber, TaskRabbit, or Deliveroo?

Traditional platforms are centralised with several issues:
- **High fees**: 25-30% commission (providers keep 70-75%)
- **Platform lock-in**: can't take your reputation elsewhere
- **Deplatforming risk**: company can ban you at any time
- **No transparency**: black-box algorithms for pricing
- **Privacy concerns**: all your data belongs to one company
- **Single-domain**: each platform serves one use case only

DonkeyRide solves these with an **open standard** that allows multiple operators to compete across multiple domains.

### Who controls DonkeyRide?

**No one.** It's an open protocol standard released under the MIT Licence.

Anyone can implement it freely, modify it, build commercial services using it, or propose improvements via pull requests. There's no company, no governance board, and no patents.

---

## Use Cases & Domains

### What services does DonkeyRide support?

The protocol is **domain-agnostic**. Currently:

| Domain | Status | Description |
|--------|--------|-------------|
| Ridesharing | Implemented | Rider/driver, streaming payments, live tracking |
| Locksmith dispatch | Implemented | Quote negotiation, flat-rate pricing |
| Parcel delivery | Implemented | Chain of custody, photo/signature proofs |
| Court serving | Designed | GPS verification, proof of service |
| Security guard | Designed | Shift-based, heartbeat check-ins |
| Emergency trades | Designed | Plumber/electrician, milestone payments |
| Man with van | Designed | Distance-based pricing, inventory |
| Dog walking | Designed | GPS route sharing, photo check-ins |
| Car wash | Designed | Before/after photos, lump-sum payment |
| Companion care | Designed | Session-based, safety monitoring |

### How do I add a new domain?

Create a **domain profile** (~100 lines of JavaScript) that defines:
- State machine (states and valid transitions)
- Role names (requester/provider labels)
- Pricing model (per-time, per-distance, flat rate, milestone)
- Feature flags (which TROTT specs to use)
- Completion proof types (photo, signature, GPS)
- Rating criteria (domain-specific)

No protocol changes needed. See `src/domain-profiles/` for examples.

### Do all domains use all the TROTT specifications?

No. Each domain profile declares which TROTT specs it uses:

| Domain | 01 Core | 02 Discovery | 03 Reputation | 04 Payments | 05 Safety | 06 Coordination | 07 Navigation |
|--------|---------|-------------|---------------|-------------|-----------|-----------------|---------------|
| Ridesharing | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Locksmith | Yes | Yes | Yes | Yes | Yes | Yes | — |
| Delivery | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Court serving | Yes | Yes | Yes | — | — | — | Yes |

---

## Payments & Trust Models

### Do I need Bitcoin to use DonkeyRide?

**No.** The protocol is currency-neutral. Every monetary event includes explicit `amount`, `currency`, and `trust_model` tags.

You can pay in GBP, USD, EUR, or any supported currency. Payment providers like Strike handle the conversion — you see pounds, the protocol uses Lightning's speed, and neither party has a taxable crypto event.

### What payment methods are supported?

| Provider | Currencies | Trust Model | Best For |
|----------|-----------|-------------|----------|
| NIP-47 (hold invoices) | SAT/BTC | Trustless | Sovereignty-minded users |
| Strike | GBP/USD/EUR/SAT | Custodial third-party | Fiat UX, everyday use |
| Stripe | Any fiat | Custodial escrow | Fiat-only markets |
| Cashu / Fedimint | SAT (ecash) | Federated | Privacy-focused users |
| PayPal | Any fiat | Custodial third-party | Maximum accessibility |

Operators choose which payment methods to offer. Users choose from what's available.

### What is a "trust model"?

Every payment event declares its **trust model** — a tag that tells participants exactly where their money is held and what trust assumptions apply:

- **`trustless`** — funds are in Lightning hold invoices. The operator never has custody. Nobody can steal your money.
- **`custodial-third-party`** — a third party (Strike, PayPal) holds funds briefly. The operator never has custody.
- **`custodial-escrow`** — funds sit in Stripe's escrow until the task completes.
- **`custodial`** — the operator's Lightning node holds funds temporarily. Defence layers apply.
- **`federated`** — an ecash mint or Fedimint federation holds funds in multi-party custody.

You always see the trust model before committing to a task.

### What are commitment stakes?

Both parties lock a small amount of money before a task begins. If either party misbehaves (cancels, no-shows), they lose their stake. If both behave, both get their money back.

Stakes are typically 10% for requesters and 15% for providers. See [STAKING-EXPLAINED.md](./STAKING-EXPLAINED.md) for the full explanation.

---

## Decentralisation & Architecture

### Is DonkeyRide fully decentralised?

**No — it's federated, not fully decentralised.**

- **Nostr layer**: Decentralised (discovery, reputation, PII exchange, coordination)
- **Operator layer**: Federated (multiple competing operators, each centralised internally)
- **Payment layer**: Flexible (trustless to custodial, user chooses)

Think: **Gmail vs Outlook vs ProtonMail** (federated email), not **Bitcoin** (fully decentralised).

### Why not fully decentralised?

Legal requirements make full decentralisation impractical:
- **GDPR** requires deletable data storage — can't delete from Nostr relays
- **Safety monitoring** requires 24/7 human teams (legal requirement)
- **Insurance** requires a legal entity to hold the policy
- **Background checks** require a company to integrate with screening providers

The federated model is the sweet spot: decentralised discovery and reputation, federated safety and compliance.

### Do I need to use Nostr?

Nostr is recommended but not required. Operators can implement DonkeyRide in three modes:

1. **Nostr-native** — public relays for everything (crypto-native markets)
2. **Hybrid** (recommended) — Nostr for discovery and reputation, operator for safety and compliance
3. **Schema-compatible** — DonkeyRide event schemas without Nostr (enables data portability)

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full analysis.

---

## Privacy & GDPR

### What data is stored where?

**On public Nostr relays (visible to everyone):**
- Geohash-level availability (~5km precision, not exact addresses)
- Operator service areas and capabilities
- Reputation scores and ratings (pseudonymous)
- Operator bonds and fee structures

**Encrypted on Nostr relays (only parties can read):**
- Exact addresses (NIP-17 gift-wrapped)
- Phone numbers and names (NIP-17 gift-wrapped)
- Coordination messages (NIP-44 encrypted)

**On the operator's private database:**
- Safety monitoring records
- Background check results
- Insurance documentation
- Compliance audit trails

**Never stored anywhere permanently:**
- Real-time GPS traces (ephemeral WebSocket or ephemeral Nostr events)
- Route geometry (deleted after task completion)

### Can I delete my data?

**Yes.** GDPR right to erasure is supported at every layer:

1. **Operator data** — standard deletion on request (30-day SLA)
2. **Encrypted Nostr data** — crypto-shredding: destroy your key pair, and all your encrypted data on relays becomes unreadable
3. **Public Nostr data** — NIP-62 (Request to Vanish) asks relays to delete all events for a pubkey
4. **Payment data** — handled by your payment provider's own deletion policy

See [docs/GDPR-COMPLIANCE.md](./docs/GDPR-COMPLIANCE.md) for the full compliance architecture.

### What is crypto-shredding?

When you destroy your Nostr key pair, all data encrypted with those keys becomes permanently unreadable — even though the ciphertext remains on relays. This is endorsed by CNIL (French data authority) and EDPB as a valid approach to GDPR right to erasure for blockchain/distributed systems.

### Can tasks be anonymous?

**Yes**, depending on the operator's requirements:
- Use a separate Nostr key not linked to your social identity
- Pay via Lightning (pseudonymous) or Cashu (anonymous)
- No KYC required for trustless payment models

**Limitations:** Operators may require identity verification for legal compliance. Safety features (emergency contacts) require some identity information.

---

## Economics & Fees

### What are the fees?

**It depends on the operator** — DonkeyRide is a protocol, not a platform. Each operator sets their own fees.

Typical range: **1-5%** (compared to 25-30% on traditional platforms). Competition between operators drives fees down.

### How do providers get paid?

**Streaming payments** during active tasks — providers receive payment incrementally as the service progresses, not as a lump sum days later.

Payment arrives via the operator's chosen payment rail:
- **NIP-47**: Sats arrive directly in provider's wallet every 30 seconds
- **Strike**: GBP/USD arrives via Lightning conversion
- **Stripe**: Fiat held in escrow, released on completion

### Can requesters tip providers?

**Yes — and 100% goes to the provider** (no operator fee on tips).

Tips can be sent as:
- Kind 30513 (Provider Tip event) via the operator
- NIP-57 Lightning Zap on the task completion event (visible across all Nostr clients)

---

## Legal & Compliance

### Is DonkeyRide legal?

**DonkeyRide is a protocol specification (like HTTP), not a service.**

The protocol itself is legal everywhere. However, **operating a coordination service** has legal requirements that vary by jurisdiction. Each operator is solely responsible for compliance.

### Who is liable if something goes wrong?

**The operator is liable**, just like with Uber/Lyft. DonkeyRide is a protocol standard — it doesn't provide insurance, legal protection, or safety services. Each operator must carry appropriate insurance and comply with local regulations.

### What about GDPR and CCPA?

Fully supported via the three-layer compliance architecture:

- **Public Nostr data**: Only pseudonymous identifiers and geohash-level locations (data minimisation)
- **Encrypted Nostr data**: Crypto-shredding for right to erasure
- **Operator data**: Standard GDPR controller obligations (deletion, portability, rectification)

See [docs/GDPR-COMPLIANCE.md](./docs/GDPR-COMPLIANCE.md) for details.

---

## Technical Details

### How is the protocol structured?

The protocol is a **family of 7 modular TROTT specifications**, each covering a specific concern:

| Spec | Kind Range | Scope |
|------|-----------|-------|
| TROTT-01: Core | 30500-30507 | Task lifecycle (request, offer, accept, complete, confirm, cancel, dispute) |
| TROTT-02: Discovery | 20500, 30510-30512 | Provider availability, geohash search, skill search, trusted networks |
| TROTT-03: Reputation | 30520-30522 | Ratings, trust weighting, credentials, cross-domain portability |
| TROTT-04: Payments | 30530-30536 | Quotes, escrow, streaming, milestones, split payments |
| TROTT-05: Safety | 30540-30546 | Emergency signals, check-ins, disputes, abuse reporting |
| TROTT-06: Coordination | 30550-30554 | Operator participation, PII handling, compliance (optional) |
| TROTT-07: Navigation | 20501, 30560-30563 | Routing, ETA, live tracking, route deviation (optional) |

Plus **9 domain extension specs** for ridesharing, locksmith, delivery, towing, emergency trades, pet services, security, cleaning, and moving.

See [specs/QUICK-REFERENCE.md](./specs/QUICK-REFERENCE.md) for the complete event kind table.

### What event kind range does DonkeyRide use?

- **20500-20501**: Ephemeral events (provider availability, location updates)
- **30500-30563**: Core protocol (TROTT-01 through TROTT-07)
- **30600-30779**: Domain extensions (ridesharing, locksmith, delivery, towing, emergency trades, pet services, security, cleaning, moving)

### What's a "replaceable parameterised event"?

Most DonkeyRide events use **NIP-33** (replaceable parameterised events):
- **Replaceable**: new event replaces old event (not append-only)
- **Parameterised**: identified by `d` tag (unique identifier)
- **Example**: Provider status — new "available" event replaces previous status

This prevents spam, ensures efficient storage, and means clients always get the latest state.

### How does real-time location tracking work?

**Two methods:**

1. **WebSocket** (recommended for UX) — direct provider → operator → requester, 3-5 second updates
2. **Ephemeral Nostr events** (privacy-maximising) — NIP-44 encrypted, operator never sees location data

---

## For Developers

### Can I build a DonkeyRide app?

**Yes.** The protocol is open and free to use. No permission needed, no licensing fees, no rate limits.

You can build: requester apps, provider apps, operator backends, analytics tools, domain-specific extensions, or alternative UIs.

### Where do I start?

1. Read [specs/QUICK-REFERENCE.md](./specs/QUICK-REFERENCE.md) for the protocol overview
2. Read [specs/TROTT-01-core.md](./specs/TROTT-01-core.md) for the core specification
3. Set up local development: [guides/QUICK-START.md](./guides/QUICK-START.md)
4. Run the reference implementation with different domains (`DOMAIN=locksmith npm start`)

### Can I add custom features?

**Yes — the protocol is extensible:**

1. **Custom tags** on existing event kinds (backward-compatible)
2. **New domain profiles** for new service verticals (~100 lines)
3. **New event kinds** in reserved ranges (30600-30639 for domain extensions)
4. **Propose additions** to the protocol via pull requests

---

## For Operators

### How do I launch a DonkeyRide operator?

1. **Choose architecture** (Nostr-native, hybrid, or schema-compatible)
2. **Choose payment providers** (Strike for fiat, NIP-47 for trustless, or both)
3. **Choose domains** (ridesharing, locksmith, delivery, or custom)
4. **Deploy infrastructure** (the reference implementation runs on Node.js + PostgreSQL + Redis)
5. **Legal compliance** (licences, insurance, background checks for your jurisdiction)

See [guides/OPERATOR-DEPLOYMENT.md](./guides/OPERATOR-DEPLOYMENT.md) for the detailed guide.

### Can I use traditional payment processing instead of Lightning?

**Yes.** The protocol supports any payment rail. Strike, Stripe, and PayPal are all supported. Lightning is recommended for speed and low fees but is not required.

### How do I compete with established platforms?

Four competitive advantages:
1. **Lower fees** (1-5% vs 25-30%) — powerful incentive for providers
2. **Multi-domain** — serve ridesharing, locksmith, and delivery from one platform
3. **Trust transparency** — users see exactly where their money is held
4. **Open protocol** — lower development costs, interoperability with other operators

---

## For Providers

### Can I work for multiple operators at once?

**Yes.** That's a core benefit. Your reputation follows you between operators (kind 30521: Reputation Export/Import). You choose which operators to work with based on their fees, trust model, and service areas.

### What if I get deplatformed from an operator?

You can switch to another operator and keep your reputation:
1. Export reputation (kind 30521)
2. Sign up with new operator
3. Import reputation (ratings, task count, badges)
4. Continue working with history intact

### How do instant payouts work?

**Streaming payments during the task:**
1. Task starts — requester's payment is authorised
2. Every 30 seconds — a portion is released to your wallet
3. Task ends — final payment released automatically
4. You receive payment instantly — no waiting for weekly payouts

---

## For Requesters

### How do I request a service?

Download an app from a DonkeyRide-compatible operator. DonkeyRide is the protocol — operators build the apps. Look for apps that mention "built on DonkeyRide" or "Nostr-compatible service coordination".

### How do I switch operators?

Three steps:
1. **Export reputation** from current operator (kind 30521)
2. **Sign up** with new operator
3. **Import reputation** — your ratings and task count transfer

### Is it safe?

Same safety features as traditional platforms, plus additional benefits:
- Emergency button (kind 30559 — panic, medical, accident, threat)
- Trip sharing with trusted contacts (kind 30560)
- Safety check-ins during long tasks (kinds 30561-30563)
- Background checks published as NIP-58 badges (verifiable)
- Harassment reporting (kind 30564)
- 24/7 operator safety monitoring (for operators with `safety_monitoring: true`)
- Choose operators with better safety records (transparent on Nostr)

---

## Additional Questions?

- **Protocol specification**: [specs/QUICK-REFERENCE.md](./specs/QUICK-REFERENCE.md)
- **Architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Trust mechanisms**: [TRUST-MECHANISMS.md](./TRUST-MECHANISMS.md)
- **Quick start**: [guides/QUICK-START.md](./guides/QUICK-START.md)
- **GitHub**: Submit issues for questions not covered here

---

*"The best protocols are the ones everyone can use. Let's build an open future for service coordination."*
