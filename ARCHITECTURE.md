# DonkeyRide Architecture — Decentralisation Analysis

> **Note (v3.0)**: The protocol is domain-agnostic and payment-agnostic. The architecture described below applies to **all** service domains (ridesharing, locksmith, delivery, etc.) and **all** payment rails (Lightning, fiat, ecash). See [`specs/`](./specs/) for the modular NIP specification family.

## Reality Check: Are We Truly Decentralised?

**Short answer**: We are **federated**, not fully decentralised.

**Detailed answer**:
- **Nostr layer**: Decentralised (discovery, reputation, PII exchange, coordination)
- **Operator layer**: Federated (multiple competing operators, each centralised internally)
- **Payment layer**: Flexible (trustless to custodial, user chooses)

This is the right trade-off. Full decentralisation fails legal requirements (GDPR, safety monitoring, insurance). Full centralisation creates platform monopolies. Federation gives us the benefits of both.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         REQUESTER APPLICATION                               │
│  (Open source — anyone can build)                                          │
│                                                                             │
│  • Nostr client (NDK / nostr-tools)                                        │
│  • Payment wallet (NIP-47, Strike, Stripe, or custodial)                   │
│  • GPS location                                                            │
│  • Local storage (encrypted Nostr keys)                                    │
└────────────────┬────────────────────────────────────────────────────────────┘
                 │
                 │ (1) Publish obfuscated service request (geohash precision 5)
                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PUBLIC NOSTR RELAYS                                  │
│  (Decentralised — permissionless — censorship-resistant)                   │
│                                                                             │
│  DATA ON PUBLIC RELAYS:                                                    │
│  ✅ Operator bonds & reputation (kinds 30540, 30528)                       │
│  ✅ Service areas (kind 30565)                                             │
│  ✅ Provider availability — geohash only (kind 20500, ephemeral)           │
│  ✅ Service requests — geohash only (kind 30500)                           │
│  ✅ Ratings & reputation (kinds 30517-30519, 30530)                        │
│  ✅ Dispute outcomes (kind 30524)                                          │
│  ✅ NIP-89 app handlers (kind 31990)                                       │
│                                                                             │
│  DATA NOT ON PUBLIC RELAYS:                                                │
│  ❌ Exact addresses (NIP-17 gift-wrapped, encrypted)                       │
│  ❌ Real-time GPS traces (WebSocket or ephemeral encrypted events)         │
│  ❌ Payment card details (payment provider only)                           │
│  ❌ PII — names, phone numbers (NIP-17 encrypted between parties)          │
│  ❌ Complete service histories (operator DB only)                          │
└────────────────┬────────────────────────────────────────────────────────────┘
                 │
                 │ (2) Providers query for nearby requests
                 │     Filter: {"#g": ["gcpuu"], kind: 30500}
                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PROVIDER APPLICATION                                │
│  (Open source)                                                             │
│                                                                             │
│  • Sees obfuscated service request (~5km area)                             │
│  • Accepts task → publishes kind 30501 to Nostr                            │
│  • Contacts OPERATOR to coordinate                                         │
└────────────────┬────────────────────────────────────────────────────────────┘
                 │
                 │ (3) After acceptance, coordinate via operator + encrypted Nostr
                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    OPERATOR SERVICE (THIN COMPLIANCE LAYER)                 │
│  (Multiple operators compete — federated model)                            │
│                                                                             │
│  Operator examples:                                                        │
│  • operator-london.donkeyride.example.com (London market)                  │
│  • operator-nyc.decentralride.example.com (NYC market)                     │
│  • operator-berlin.bitcointaxi.example.com (Berlin market)                 │
│                                                                             │
│  Each operator runs:                                                       │
│  ┌───────────────────────────────────────────────────────────────┐         │
│  │ REST API + WebSocket Server                                   │         │
│  │  • POST /api/v1/tasks/{task_id}/coordinate                    │         │
│  │  • POST /api/v1/stakes/lock                                   │         │
│  │  • POST /api/v1/stakes/release                                │         │
│  │  • WS /realtime/{task_id} (live location streaming)           │         │
│  └───────────────────────────────────────────────────────────────┘         │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────┐         │
│  │ PostgreSQL Database (PRIVATE, GDPR-COMPLIANT)                 │         │
│  │  • GPS traces (90-day retention, then purged)                 │         │
│  │  • Safety monitoring records (legal obligation)               │         │
│  │  • Background check results (7-year retention)                │         │
│  │  • Insurance documentation (regulatory requirement)           │         │
│  │  • Compliance audit trails (tax law, 7-year retention)        │         │
│  └───────────────────────────────────────────────────────────────┘         │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────┐         │
│  │ 24/7 Safety Team (HUMANS)                                     │         │
│  │  • Monitor emergency alerts (kind 30559)                      │         │
│  │  • Review safety check-in failures (kinds 30561-30563)        │         │
│  │  • Call 999/911 when needed                                   │         │
│  │  • Contact emergency contacts via NIP-17                      │         │
│  │  • Sub-60-second response time requirement                    │         │
│  └───────────────────────────────────────────────────────────────┘         │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────┐         │
│  │ Background Check + Insurance Integration                      │         │
│  │  • Checkr, Onfido, or jurisdiction-specific providers         │         │
│  │  • Results published as NIP-58 badges on Nostr                │         │
│  │  • Insurance verification published to Nostr                  │         │
│  └───────────────────────────────────────────────────────────────┘         │
│                                                                             │
│  WHY WE NEED OPERATORS (legally mandated functions):                       │
│  1. 24/7 human safety monitoring (legal requirement)                       │
│  2. Background check coordination (legal requirement)                      │
│  3. Insurance coordination (legal entity required)                         │
│  4. GDPR-compliant data retention and deletion                             │
│  5. Dispute escalation (complex disputes need human arbitration)           │
└────────────────┬────────────────────────────────────────────────────────────┘
                 │
                 │ (4) Exact address exchange (after matching)
                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                NIP-17 GIFT-WRAPPED MESSAGES (NIP-59)                        │
│  (End-to-end encrypted — three-layer wrapping)                             │
│                                                                             │
│  Requester → Provider (encrypted, relay can't read):                       │
│  {                                                                          │
│    "exact_pickup": { "lat": 51.5074, "lon": -0.1278,                      │
│                       "address": "123 King Street, London SW1A 1AA" },     │
│    "phone": "+44-20-7946-0958",                                            │
│    "name": "John"                                                          │
│  }                                                                          │
│                                                                             │
│  Provider → Requester (encrypted):                                         │
│  {                                                                          │
│    "name": "Sarah",                                                        │
│    "phone": "+44-7700-900123",                                             │
│    "vehicle": { "make": "Toyota", "model": "Prius",                       │
│                  "colour": "Silver", "plate": "AB12 CDE" },               │
│    "eta_seconds": 180                                                      │
│  }                                                                          │
│                                                                             │
│  Three-layer wrapping (NIP-17 + NIP-59):                                   │
│  • Rumour (kind 14) → Seal (kind 13) → Gift Wrap (kind 1059)              │
│  • Relay cannot read content, sender, or recipient                         │
│  • Timestamps obfuscated                                                   │
│  • Operator never sees PII                                                 │
└────────────────┬────────────────────────────────────────────────────────────┘
                 │
                 │ (5) During task — live location streaming
                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   WEBSOCKET (EPHEMERAL, NOT PERSISTED)                      │
│  (Direct provider → operator → requester, real-time only)                  │
│                                                                             │
│  wss://operator-london.donkeyride.example.com/realtime/task_abc123         │
│                                                                             │
│  Provider sends every 3-5 seconds:                                         │
│  { "lat": 51.5074, "lon": -0.1278,                                        │
│    "heading": 45, "speed": 12.5, "eta": 180 }                             │
│                                                                             │
│  Requester sees live map updates                                           │
│  Data is NOT stored (privacy)                                              │
│                                                                             │
│  Alternative (privacy-maximising):                                         │
│  NIP-44 encrypted ephemeral Nostr events (kind 20000-29999)               │
│  Higher latency, but operator never sees location data                     │
└────────────────┬────────────────────────────────────────────────────────────┘
                 │
                 │ (6) Payment during task
                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PAYMENT PROVIDERS (FLEXIBLE)                             │
│  (User chooses trust model — trustless to custodial)                       │
│                                                                             │
│  OPTION A — Trustless (NIP-47, hold invoices):                             │
│  Requester Wallet ←NIP-47→ Provider Wallet                                 │
│  Operator role: triggers settlement, NEVER has custody                     │
│                                                                             │
│  OPTION B — Custodial third-party (Strike):                                │
│  Requester pays £12.50 → Strike converts → sats over Lightning → Provider │
│  Strike holds funds briefly during conversion                              │
│  Operator role: routing payment requests                                   │
│                                                                             │
│  OPTION C — Custodial escrow (Stripe):                                     │
│  Requester pays £12.50 → Stripe escrow → Released on completion            │
│  Operator role: confirming completion                                      │
│                                                                             │
│  OPTION D — Federated (Cashu/Fedimint):                                    │
│  Ecash tokens locked in federation → Released on completion                │
│  Operator role: confirming completion                                      │
│                                                                             │
│  Streaming payments (per-second/per-metre) work across all options          │
│  Tips go 100% to provider (NIP-57 zaps or kind 30513)                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Decentralisation Scorecard

| Function | Current | Proposed | Change |
|----------|---------|----------|--------|
| **Discovery** | Nostr (decentralised) | No change | — |
| **Reputation** | Nostr (decentralised) | + NIP-85 summaries, NIP-58 badges | Enhancement |
| **Stake custody** | Operator Lightning node (centralised) | **NIP-47 user wallets (trustless)** | Decentralised |
| **PII exchange** | Operator DB (centralised) | **NIP-17 gift wrap (encrypted)** | Decentralised |
| **Coordination** | Operator WebSocket (centralised) | **NIP-44 encrypted Nostr events** | Decentralised |
| **Live tracking** | Operator WebSocket | **Ephemeral Nostr (optional)** | Optional |
| **Safety monitoring** | Operator humans | No change | Legally required |
| **Background checks** | Operator + third party | No change | Legally required |
| **Payments** | Lightning only | **Multiple providers, trust model transparency** | Flexible |

### What Moved Off the Operator

Three functions that were centralised in the operator are now decentralised:

**1. Stake custody → NIP-47 (Nostr Wallet Connect)**

```
BEFORE:  Requester Wallet → Operator Lightning Node → Provider Wallet
         (operator has temporary custody)

AFTER:   Requester Wallet ←NIP-47→ Provider Wallet
         (hold invoice directly between parties)
         Operator role: triggers settlement by publishing signed completion event
         Operator custody: NONE
```

NIP-47 already supports `make_hold_invoice`, `settle_hold_invoice`, `cancel_hold_invoice` — our exact lock/release/forfeit lifecycle.

For fiat users via Strike: Strike holds funds (not the operator). Trust model: `custodial-third-party`.

**2. PII exchange → NIP-17 + NIP-59 (Gift Wrap)**

```
BEFORE:  Requester → Operator DB → Provider
         (operator sees and stores all PII)

AFTER:   Requester → [NIP-59 Gift Wrap] → Nostr Relay → Provider
         (operator can't read it, relay can't read it)
```

Three-layer wrapping hides sender, recipient, and timestamps from relay operators. The operator never sees exact addresses, phone numbers, or real names.

**3. Coordination messages → Encrypted Nostr events**

Status updates, ETAs, "I'm outside" messages — previously went through the operator's WebSocket. These become NIP-44 encrypted events published to Nostr, removing the operator from the conversation.

---

## Where We're Centralised (and Why)

### 1. Operator Service (Biggest Centralisation)

**What operators control:**
- Safety monitoring and emergency response
- Background check coordination
- Insurance documentation
- GDPR-compliant data retention and deletion
- Complex dispute escalation

**Why we need operators:**
- **GDPR/CCPA compliance** — need deletable data storage and right-to-erasure
- **Legal liability** — someone needs to be legally responsible for safety
- **Insurance** — commercial policies require a legal entity
- **Background checks** — screening services require a company to integrate
- **24/7 safety team** — humans monitoring emergency alerts (legal requirement)

**Mitigation (federated model):**
- Multiple operators compete (London, NYC, Berlin, etc.)
- Operators can't manipulate reputation (stored on Nostr with cryptographic signatures)
- Users can switch operators freely
- Operators are bonded (kind 30540, slashable if malicious)
- Operators are auditable (all critical events on public Nostr)
- Anyone can run an operator (open source reference implementation)

### 2. Background Check Providers

Checkr, Onfido, or jurisdiction-specific screening services. Required for legal compliance.

**Mitigation:** Results published as NIP-58 badges on Nostr — verification is decentralised even if the checking isn't.

### 3. Insurance Providers

Commercial liability insurance requires a legal entity.

**Mitigation:** Verification published to Nostr. Multiple insurers can compete.

---

## Could We Be MORE Decentralised?

### Attempt 1: Fully P2P (No Operators)

```
Requester ←→ Nostr Relays ←→ Provider
             (only communication layer)
```

**Problems:**
1. GDPR compliance — can't delete from Nostr relays
2. Safety monitoring — no 24/7 team to respond to emergencies (legal requirement)
3. Background checks — who integrates with screening providers? Who pays?
4. Insurance — who holds the liability policy? (legal requirement)
5. Dispute resolution — web-of-trust is too slow for urgent disputes

**Verdict:** Not viable for production services (fails legal/safety requirements)

### Attempt 2: Cashu/Fedimint for Stakes

```
Instead of operators or NIP-47 for stakes:
Use Cashu ecash mints or Fedimint federations for stake escrow
```

**Pros:** More private (ecash is anonymous), multi-party custody (federation)
**Cons:** Still need operators for safety, checks, insurance. Newer technology.

**Verdict:** Viable complementary option (already supported as `federated` trust model)

### Attempt 3: Ephemeral Nostr for Live Tracking

```
Instead of operator WebSocket for GPS streaming:
Use NIP-44 encrypted ephemeral events (kind 20000-29999)
```

**Pros:** Operator never sees real-time location. Fully privacy-preserving.
**Cons:** Higher latency than direct WebSocket. May affect UX.

**Verdict:** Offered as an option — privacy-maximising users choose ephemeral Nostr, UX-maximising users choose operator WebSocket.

### Attempt 4: Guardian Network for Disputes

Guardian voting (kinds 30553-30554) enables decentralised dispute resolution. Simple disputes (GPS proves no-show) can be automated. Complex disputes still need human arbitration.

**Verdict:** Viable for simple disputes. Complex cases still need operators.

---

## The Honest Answer

**We are NOT 100% decentralised. We are FEDERATED.**

```
Decentralised:  Nostr (discovery + reputation + PII exchange + coordination)
Decentralised:  NIP-47 / Strike / Payment providers (payments + stakes)
Federated:      Operators (safety monitoring + background checks + insurance)
```

**This is the best we can do while:**
1. Complying with GDPR/CCPA (need deletable PII storage)
2. Meeting safety regulations (need 24/7 human monitoring)
3. Meeting insurance requirements (need legal entity)
4. Passing background checks (need company integration)
5. Providing good UX (real-time location streaming)

**We exceed traditional platforms because:**
- Multiple operators compete (not a monopoly)
- Operators can't manipulate reputation (Nostr-based, cryptographically signed)
- Users can switch operators (not locked-in)
- Operators are bonded and auditable (slashable if malicious)
- Open protocol (anyone can build apps/operators)
- Lower fees (operator competition drives fees down)
- Payment choice (trustless to custodial, user decides)

**Comparison to other federated services:**
- **Email**: Federated (Gmail, ProtonMail, self-hosted) — **we are here**
- **Mastodon**: Federated (multiple instances) — **we are here**
- **Bitcoin**: Fully decentralised (no operators) — we are not here
- **Nostr**: Fully decentralised (relays are simple) — only for our discovery layer

---

## See Also

- **[specs/QUICK-REFERENCE.md](./specs/QUICK-REFERENCE.md)** — Event kind table and protocol structure
- **[TRUST-MECHANISMS.md](./TRUST-MECHANISMS.md)** — 6 layers of trust (reputation, bonds, insurance, limits, multi-sig, trustless)
- **[docs/GDPR-COMPLIANCE.md](./docs/GDPR-COMPLIANCE.md)** — GDPR compliance architecture
- **[docs/PAYMENT-PROVIDERS.md](./docs/PAYMENT-PROVIDERS.md)** — Payment provider integration guide
