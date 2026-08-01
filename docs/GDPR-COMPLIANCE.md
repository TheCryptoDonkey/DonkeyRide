# GDPR Compliance Guide for Operators

**Last Updated**: 2026-02-08
**Applies to**: EU GDPR, UK GDPR, and the Data (Use and Access) Act 2025

---

## Overview

DonkeyRide's three-layer architecture is designed for GDPR compliance. This document explains what data goes where, who is the controller, and what operators must do to comply.

**Key principle**: Data minimisation by design. Public Nostr events contain only pseudonymous identifiers and geohash-level locations. PII is either encrypted between parties (NIP-17) or held by the operator under standard GDPR controller obligations.

> **Implementation status (honest)**: in the current reference implementation, **no PII is published to Nostr at all** — addresses, exact coordinates and proofs stay in the operator's database and over authenticated HTTPS/WSS. The NIP-17/NIP-44 rows below describe the protocol design for P2P deployments; the gift-wrap code paths are **not yet implemented** in this server. Rely on the "no PII on relays" property, not on relay-side encryption, when assessing this implementation.

---

## Three-Layer Compliance Architecture

### Layer 1: Nostr (Public / Pseudonymous)

**What goes on Nostr:**

| Data Type | Example | GDPR Basis | Erasure Method |
|-----------|---------|------------|----------------|
| Pseudonymous pubkeys | `npub1abc...` | Legitimate interest (Art. 6(1)(f)) | Crypto-shredding + NIP-62 |
| Geohash locations | `gcpuuz` (~5km area) | Legitimate interest | NIP-40 expiration |
| Ratings and reputation | "4.8 stars, 342 tasks" | Legitimate interest | Crypto-shredding |
| Operator bonds | "£50,000 bond" | Public accountability | Event replacement |
| Service areas | "London, ridesharing" | Operational data | Event replacement |
| Encrypted PII (NIP-17) | Gift-wrapped address | Consent / contract (Art. 6(1)(a)/(b)) | Crypto-shredding |
| Encrypted coordination (NIP-44) | "I'm outside" | Contract performance | Crypto-shredding |

**GDPR measures:**
- **Data minimisation**: Only pseudonymous identifiers on public events. No exact addresses, no real names, no phone numbers.
- **NIP-40 expiration**: Time-limited events (availability, requests) auto-expire. Relays delete expired events.
- **Crypto-shredding**: Destroy key pair → all encrypted data unreadable (see below).
- **NIP-62 (Request to Vanish)**: Relay-side deletion of all events for a pubkey.

### Layer 2: Operator (Private / Compliant)

**What stays with the operator:**

| Data Type | Retention | GDPR Basis | Erasure |
|-----------|-----------|------------|---------|
| Safety monitoring records | Duration of legal obligation | Legal obligation (Art. 6(1)(c)) | Delete when obligation expires |
| Background check results | 7 years (regulatory) | Legal obligation | Delete after retention period |
| Insurance documentation | Duration of policy | Legal obligation | Delete when expired |
| Compliance audit trails | 7 years (tax law) | Legal obligation (Art. 6(1)(c)) | Delete after retention period |
| GPS traces | 90 days | Legitimate interest | Auto-purge at 90 days |
| Chat messages | 90 days | Contract performance | Auto-purge at 90 days |
| Task photos | 90 days | Contract performance | Auto-purge at 90 days |

**GDPR measures:**
- Standard controller obligations: lawful basis documented for every data type
- Retention policies enforced automatically (90-day purge for operational data)
- Right to erasure honoured for all data except where legal retention overrides (Art. 17(3)(b))
- Data Processing Agreements (DPAs) with all sub-processors

### Layer 3: Payment Providers (Third Party)

**What payment providers hold:**

| Provider | Data Held | GDPR Role | Notes |
|----------|-----------|-----------|-------|
| NIP-47 (trustless) | None — direct wallet-to-wallet | N/A | No payment data touches the operator |
| Strike | Transaction records, KYC if applicable | Independent controller | Strike's own privacy policy applies |
| Stripe | Transaction records, card details | Processor (under DPA) | Stripe's GDPR-compliant infrastructure |
| PayPal | Transaction records, account details | Independent controller | PayPal's own privacy policy applies |

**GDPR measures:**
- Operator must have DPA with each payment provider acting as processor
- Independent controllers (Strike, PayPal) have their own GDPR obligations
- NIP-47 (trustless): no payment data touches the operator at all — the most privacy-preserving option

---

## Crypto-Shredding

### How It Works

When a user exercises the right to erasure (Article 17), the protocol destroys their Nostr key pair. All data encrypted with those keys becomes permanently unreadable — the ciphertext remains on relays but cannot be decrypted.

```
1. User requests erasure
2. Operator destroys user's encryption key pair
3. All NIP-17 gift-wrapped messages: indecipherable
4. All NIP-44 encrypted events: indecipherable
5. Ciphertext remains on relays but is meaningless noise
6. Operator deletes all PII from private database
7. NIP-62 Request to Vanish sent to relays for public events
```

### Regulatory Position

| Authority | Position | Source |
|-----------|----------|--------|
| **CNIL** (France) | Crypto-shredding "comes closer to compliance" with Article 17. Recommended approach for blockchain/distributed systems. | CNIL blockchain guidance |
| **EDPB** | Recommends storing only hashes, commitments, or ciphertexts on-chain. Crypto-shredding is a valid erasure technique for distributed systems. | EDPB Guidelines 02/2025 (April 2025) |
| **ICO** (UK) | Uses "motivated intruder" test — if no motivated intruder can recover the data, it is effectively erased. Destroying the key satisfies this. | ICO anonymisation guidance (March 2025) |

No data protection authority has ruled crypto-shredding insufficient for GDPR compliance when applied to encrypted data on distributed systems.

---

## Pseudonymous Identifiers

### Nostr Pubkeys Are Personal Data

Under GDPR Recital 26 and the CJEU *Breyer* ruling (C-582/14), **pseudonymous identifiers are personal data**. Nostr pubkeys qualify because:

- They can be linked to a natural person by anyone who knows the pubkey-person mapping
- The operator typically has this mapping (from onboarding)
- Even without the mapping, they are "singling out" data under the EDPB definition

**Implications:**
- Publishing events with a pubkey is processing personal data
- The user who publishes is the primary controller (CNIL position)
- The operator is a controller for pubkeys they collect and store
- Relay operators are processors or independent controllers depending on their decision-making role

### Encrypted Data on Relays

| Data Type | Personal Data for Keyholder? | Personal Data for Relay? |
|-----------|------------------------------|--------------------------|
| NIP-44 ciphertext (content) | **Yes** (they can decrypt) | **Likely not** (they cannot access content) |
| Pubkeys on encrypted events | **Yes** | **Yes** (pubkeys are always personal data) |
| Timestamps | **Yes** (part of the profile) | **Yes** (combined with pubkeys) |

Relay operators process personal data (pubkeys, timestamps) regardless of encryption. They should be treated as processors under GDPR.

---

## Right to Erasure Implementation

When a user exercises Article 17, operators must follow this procedure:

### Step 1: Operator Data

Delete all PII from PostgreSQL:
- Exact addresses and GPS traces
- Chat messages and task photos
- Contact details (phone, email)
- Any non-retained operational data

**Exception**: Retain data where legal obligation overrides (Art. 17(3)(b)):
- Payment records (7 years, tax law)
- Safety incident records (legal obligation)
- Background check records (regulatory retention)

### Step 2: Encrypted Nostr Data

Destroy the user's encryption key pair (crypto-shredding):
- All NIP-17 gift-wrapped messages become indecipherable
- All NIP-44 encrypted coordination events become indecipherable
- The ciphertext remains but is meaningless without the key

### Step 3: Public Nostr Events

Submit NIP-62 Request to Vanish to all relays:
- Relays supporting NIP-62 will delete all events for the pubkey
- Request deletion from known third-party relays
- No guarantee of universal deletion (relays are independent)

### Step 4: Ratings and Reputation

Ratings are published by **other users** about this user. Under GDPR:
- The rating publisher is the controller of their own event
- The operator can request relay deletion but cannot force it for events signed by other pubkeys
- Crypto-shredding makes the rated user's identity unresolvable (the pubkey becomes meaningless)

### Step 5: Payment Records

Retain for 7 years per tax law (Art. 17(3)(b) override). These are the operator's own records, not Nostr events.

---

## Data Controller Analysis

| Function | Controller | Rationale |
|----------|-----------|-----------|
| Publishing events to Nostr | **The user** | CNIL position: the user who publishes is the controller |
| Collecting PII for coordination | **The operator** | Operator decides means and purposes |
| Safety monitoring | **The operator** | Legal obligation |
| Background checks | **The operator** + screening provider | Joint controllers or controller-processor |
| Relay storage | **Relay operator** | Processor or independent controller |
| Payment processing | **Payment provider** (independent) or processor (under DPA) | Depends on contractual relationship |
| NIP-17 encrypted messages | **Sender and recipient** | End-to-end encrypted, operator has no access |

---

## Operator Compliance Checklist

### Before Deployment

- [ ] **Data Protection Impact Assessment (DPIA)** — required under Article 35 for processing at scale
- [ ] **Record of Processing Activities (ROPA)** — required under Article 30
- [ ] **Data Protection Officer (DPO)** — appoint if processing personal data at scale
- [ ] **Privacy notice** — explain the three-layer architecture and what data goes where
- [ ] **Lawful basis documented** — for every category of personal data processed
- [ ] **Data Processing Agreements** — with all sub-processors (payment providers, relay operators, screening services)
- [ ] **Retention policies** — automated purge schedules (90 days for operational data, 7 years for tax/regulatory)

### Technical Requirements

- [ ] **NIP-62 compliant relay** — run a relay that supports Request to Vanish for operator-published events
- [ ] **Crypto-shredding capability** — ability to destroy user key pairs on erasure request
- [ ] **NIP-40 expiration** — all time-limited events include expiration timestamps
- [ ] **Automated data purge** — 90-day purge for GPS traces, chat messages, photos
- [ ] **Erasure workflow** — documented process for handling Article 17 requests within 30 days
- [ ] **Data export** — ability to provide machine-readable export (Article 20, right to portability)

### Ongoing Obligations

- [ ] **Respond to erasure requests** within 30 days
- [ ] **Respond to access requests** (Article 15) within 30 days
- [ ] **Report data breaches** to ICO/supervisory authority within 72 hours
- [ ] **Annual DPIA review** — update as processing changes
- [ ] **Maintain ROPA** — keep up to date as new data categories are added

---

## UK GDPR and Data (Use and Access) Act 2025

The UK GDPR is substantively aligned with EU GDPR. Key differences and clarifications from the Data (Use and Access) Act 2025:

- **ICO's "motivated intruder" test** — data is effectively anonymised if no motivated intruder with reasonable means could re-identify the data subject. Destroying encryption keys satisfies this test.
- **Pseudonymisation** — the DUA 2025 clarifies that pseudonymised data (including Nostr pubkeys) remains personal data, consistent with the EU position.
- **Crypto-shredding** — not explicitly mentioned in the DUA 2025, but the ICO's anonymisation guidance (March 2025) implicitly endorses it by focusing on whether data can be re-identified in practice.
- **No material divergence** — for DonkeyRide operators, the same compliance architecture works for both EU and UK GDPR.

---

## See Also

- **[Architecture](https://github.com/TheCryptoDonkey/trott/blob/main/docs/architecture.md)** — Three-layer federated architecture
- **[TROTT-01: Core](https://github.com/TheCryptoDonkey/trott/blob/main/specs/TROTT-01-core.md)** — Core protocol (NIP-40 expiration, NIP-44 encryption)
- **[TROTT-05: Safety](https://github.com/TheCryptoDonkey/trott/blob/main/specs/TROTT-05-safety.md)** — Safety events (NIP-17 trip sharing)
- **[TROTT-03: Reputation](https://github.com/TheCryptoDonkey/trott/blob/main/specs/TROTT-03-reputation.md)** — Reputation and crypto-shredding
- **[guides/OPERATOR-DEPLOYMENT.md](../guides/OPERATOR-DEPLOYMENT.md)** — Deployment guide (includes GDPR setup)
