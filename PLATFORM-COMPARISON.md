# Service Platform Feature Comparison

**DonkeyRide vs Traditional Platforms — Comprehensive Analysis**

Last Updated: 2026-02-08
Protocol Version: v3.0

---

## Overview

DonkeyRide is a **multi-domain** service coordination protocol. This comparison covers ridesharing (vs Uber/Lyft), task services (vs TaskRabbit), and delivery (vs Deliveroo/DoorDash). Traditional platforms are single-domain and centralised. DonkeyRide serves all domains from one protocol.

---

## Core Service Features

| Feature | Uber/Lyft | TaskRabbit | Deliveroo | DonkeyRide |
|---------|-----------|------------|-----------|------------|
| **Service matching** | Yes | Yes | Yes | Yes (kind 30500-30501) |
| **Real-time GPS tracking** | Yes | No | Yes | Yes (WebSocket + kind 30512) |
| **ETA calculation** | Yes | No | Yes | Yes (OSRM/ORS, provider-agnostic) |
| **In-app payments** | Yes (card) | Yes (card) | Yes (card) | Yes (any currency, any rail) |
| **Two-way ratings** | Yes (1-5) | Yes (1-5) | Yes (1-5) | Yes (kinds 30517-30518, domain-specific criteria) |
| **Service history** | Yes | Yes | Yes | Yes (operator DB) |
| **Fare/quote estimates** | Yes | Yes | Yes | Yes (domain profile defines pricing model) |
| **Multiple payment methods** | Card, PayPal | Card | Card | **Any** (NIP-47, Strike, Stripe, Cashu, PayPal) |
| **Scheduled services** | Yes | Yes | No | Yes |
| **Multi-domain** | No | No | No | **Yes** (ridesharing, locksmith, delivery, 7+ more) |

---

## Payment & Trust

| Feature | Traditional Platforms | DonkeyRide |
|---------|---------------------|------------|
| **Payment currencies** | Fiat only (local currency) | Any (GBP, USD, EUR, SAT, BTC, ecash) |
| **Trust model visibility** | Hidden | **Declared on every event** (`trust_model` tag) |
| **Trustless option** | No | **Yes** (NIP-47 hold invoices — operator never has custody) |
| **Commitment stakes** | No (trust the platform) | **Yes** (both parties stake, automatic forfeiture) |
| **Streaming payments** | No (lump sum after) | **Yes** (per-second/per-metre during task) |
| **Instant provider payouts** | Fee ($0.50-1.50) | **Free** (Lightning settlement in seconds) |
| **Provider tip policy** | 100% to provider | 100% to provider (NIP-57 zaps or kind 30513) |
| **Payment processing cost** | 2.9% (card networks) | ~0.1% (Lightning) or card rates if fiat |

---

## Safety & Security

| Feature | Uber | Lyft | TaskRabbit | DonkeyRide |
|---------|------|------|------------|------------|
| **Emergency button** | Yes | Yes | No | Yes (kind 30559) |
| **Trip/task sharing** | Yes | Yes | No | Yes (kind 30560, NIP-17 encrypted) |
| **Safety check-ins** | Yes (RideCheck) | No | No | Yes (kinds 30561-30563) |
| **Heartbeat monitoring** | No | No | No | **Yes** (session-based, auto-escalation) |
| **24/7 safety support** | Yes | Yes | No | Operator-dependent |
| **Background checks** | Yes | Yes | Yes | Yes (NIP-58 badges, verifiable on Nostr) |
| **Insurance verification** | Yes | No | No | Yes (published to Nostr) |
| **Harassment reporting** | Yes | Yes | Yes | Yes (kind 30564) |
| **Anonymous profiles** | No | No | No | **Yes** (Nostr pseudonyms) |

---

## Provider Features

| Feature | Uber/Lyft | TaskRabbit | Deliveroo | DonkeyRide |
|---------|-----------|------------|-----------|------------|
| **Platform fee** | 25-30% | 15-30% | 25-35% | **1-5%** (operator sets) |
| **Instant payouts** | Yes (fee) | No | No | **Yes (free)** |
| **Deplatforming protection** | No (at-will) | No (at-will) | No (at-will) | **Yes** (switch operators, keep reputation) |
| **Reputation portability** | No | No | No | **Yes** (kind 30521, cryptographically signed) |
| **Multi-operator** | No | No | No | **Yes** (work for multiple operators simultaneously) |
| **Tipping (100% kept)** | Yes | Yes | Yes | Yes |
| **Wait time compensation** | Yes | No | No | Yes (kind 30514, configurable) |
| **No-show fees** | Yes | No | No | Yes (kind 30515, automatic) |
| **Transparent earnings** | Limited | Limited | Limited | **Yes** (signed receipts on Nostr) |

---

## Requester Features

| Feature | Uber/Lyft | TaskRabbit | Deliveroo | DonkeyRide |
|---------|-----------|------------|-----------|------------|
| **Price comparison** | No | No | No | **Yes** (compare multiple operators) |
| **Surge transparency** | No (black box) | N/A | No (black box) | **Yes** (auditable algorithms) |
| **Data portability** | No | No | No | **Yes** (export reputation to other operators) |
| **Privacy (anonymous use)** | No | No | No | **Yes** (pseudonymous Nostr keys) |
| **Trust model choice** | None | None | None | **Yes** (trustless to custodial, user decides) |
| **Operator choice** | One platform | One platform | One platform | **Multiple operators** (compete on fees, trust, service) |
| **GDPR right to erasure** | Limited | Limited | Limited | **Full** (crypto-shredding + operator deletion) |

---

## Trust & Transparency

| Feature | Traditional Platforms | DonkeyRide |
|---------|---------------------|------------|
| **Open source** | No | **Yes** (protocol + reference implementation) |
| **Transparent pricing** | No (proprietary algorithms) | **Yes** (auditable on Nostr) |
| **Reputation portability** | No | **Yes** (cryptographically signed on Nostr) |
| **Dispute resolution** | Internal (opaque) | **Public** (kinds 30522-30524, auditable) |
| **Operator competition** | No (monopoly per domain) | **Yes** (multiple operators per market) |
| **Deplatforming risk** | High (arbitrary bans) | **Low** (switch operators freely) |
| **Data ownership** | Platform owns data | **User owns data** |
| **Operator accountability** | Internal metrics | **Public bonds** (kind 30540, slashable) |

---

## Decentralisation & Censorship

| Aspect | Uber/Lyft/TaskRabbit | DonkeyRide |
|--------|---------------------|------------|
| **Architecture** | Centralised | **Federated** (multiple operators) |
| **Single point of failure** | Yes | No (protocol continues if one operator fails) |
| **Government censorship** | High risk | Medium (can ban operators, not protocol) |
| **Payment censorship** | Yes (card networks can block) | **No** (Lightning/NIP-47 — censorship-resistant) |
| **Permission to operate** | Yes (platform approval) | No (protocol is permissionless) |
| **Run your own operator** | No | **Yes** (open source) |

---

## Cross-Domain Comparison

Traditional platforms serve one domain each. DonkeyRide serves all from one protocol:

| Capability | Uber | TaskRabbit | Deliveroo | AA/RAC | DonkeyRide |
|-----------|------|-----------|-----------|--------|------------|
| Ridesharing | Yes | — | — | — | Yes |
| Locksmith | — | Yes | — | Yes | Yes |
| Delivery | UberEats | — | Yes | — | Yes |
| Court serving | — | — | — | — | Yes |
| Security guard | — | — | — | — | Yes |
| Emergency trades | — | Yes | — | Yes | Yes |
| **Reputation across domains** | — | — | — | — | **Yes** |
| **Single account** | — | — | — | — | **Yes** (one Nostr key) |
| **Shared safety infra** | — | — | — | — | **Yes** |

A provider with excellent ridesharing reputation can use it when offering locksmith services. A requester's reliable payment history transfers across domains.

---

## Summary Scorecard

| Category | Traditional Platforms | DonkeyRide |
|----------|---------------------|------------|
| **Core features** | Excellent | Excellent |
| **Safety** | Good-Excellent | Excellent |
| **Provider economics** | Poor (25-30% fee) | **Excellent (1-5% fee)** |
| **Payment flexibility** | Card only | **Any currency, any rail** |
| **Trust transparency** | None | **Full (trust model on every event)** |
| **Privacy** | Poor | **Excellent** |
| **Decentralisation** | Centralised monopoly | **Federated** |
| **Multi-domain** | Single domain | **10+ domains** |
| **Developer ecosystem** | Restricted | **Open** |
| **Network effects** | **Excellent** (established) | Growing |

---

## The Honest Assessment

**DonkeyRide's advantages:**
- 5-25x lower fees (competition drives costs down)
- Payment choice and trust transparency
- Multi-domain from one protocol
- Data portability and reputation ownership
- Censorship resistance
- Open source and permissionless

**DonkeyRide's disadvantages:**
- Fewer current users (network effects take time)
- Newer brand (less recognition)
- Operator-dependent feature quality (federated means variable)
- Requires operators to invest in safety, insurance, compliance

**For providers**: DonkeyRide is a clear economic win (keep 95-99% vs 70-75%).
**For requesters**: Better prices, privacy, and transparency — but availability depends on local operators.
**For operators**: Lower barrier to entry, multi-domain capability, open protocol reduces development costs.
**For developers**: Open protocol with no licensing fees, rate limits, or approval processes.

---

**Last Updated**: 2026-02-08
**DonkeyRide Version**: Protocol v3.0 (Modular NIPs, Payment-Agnostic)
