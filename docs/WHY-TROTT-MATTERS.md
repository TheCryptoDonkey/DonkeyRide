# Why TROTT Matters

**TROTT** (**T**rusted **R**eal-world **O**rchestration of **T**asks & **T**rades) is an open protocol for trust-minimised physical service coordination, built on Nostr. This document explains what problem it solves, why the abstraction holds, and what's genuinely novel about it.

---

## 1. The Coordination Protocol Gap

Every gig platform solves the same seven sub-problems: finding a counterparty, preventing no-shows, tracking progress, building trust, handling disputes, processing payment, and keeping people safe. Uber, TaskRabbit, Instacart, Bark, Deliveroo — each built proprietary infrastructure to do this, from scratch, at enormous cost.

This is the same pattern the internet solved decades ago for other domains. HTTP solved document exchange once — every website doesn't implement its own transport layer. SMTP solved email once — every mail provider doesn't invent a new envelope format. But for physical service coordination, no equivalent protocol exists. Every platform re-invents the wheel.

The waste is concrete. A locksmith dispatch application duplicates roughly 90% of a ridesharing backend: the same discovery mechanism (find someone nearby), the same commitment model (both parties stake something), the same state machine (requested → matched → en route → arrived → working → done), the same reputation system (rate after completion), the same payment flow (escrow, release on completion), the same safety features (panic button, check-ins). Only the domain-specific details differ — "driver" becomes "locksmith", "ride" becomes "callout", GPS trace becomes photo proof.

TROTT extracts this shared infrastructure into a protocol. The thesis is simple: define the seven coordination primitives once, make them composable, and let domain-specific behaviour live in declarative profile configuration rather than custom codebases.

The cost of not having this protocol is not just engineering waste — it's market failure. Each proprietary platform becomes a monopoly within its domain. Uber drivers can't take their reputation to Bolt. TaskRabbit handymen can't take their reviews to Bark. Users and providers are locked in, not by the quality of the service, but by the switching cost of starting from zero elsewhere. A coordination protocol would make these lock-in effects structurally impossible.

---

## 2. The Universal Kernel: Seven Primitives

The protocol decomposes into seven primitives. Each one solves a problem that every physical service coordination scenario shares.

**1. Discovery** (TROTT-02, kinds 20500, 30510-30513) — Finding a counterparty without exposing your exact location. A rider broadcasts to geohash precision 5 (~5 km). A locksmith searches by location. A pet sitter searches by skill tags. The mechanism changes; the primitive doesn't.

**2. Commitment** (TROTT-04, kinds 30530-30538) — Preventing ghosting. Both parties lock a stake before the task begins. If a driver doesn't show, their stake is forfeited. If a customer cancels after a locksmith is en route, same consequence. The amounts and currencies vary; the lock/release/forfeit lifecycle is identical.

**3. Lifecycle** (TROTT-01, kinds 30500-30509) — Tracking task progress through a state machine: `requested → offers_open → accepted → in_progress → completed → confirmed`. Domains insert sub-states within `in_progress` — ridesharing adds `en_route → arrived → trip_active`; delivery adds `collected → in_transit → arrived_at_delivery`. The core state machine engine is the same.

**4. Reputation** (TROTT-03, kinds 30520-30522) — Trust without institutions. Cryptographically signed ratings on Nostr, weighted by social graph (NIP-02 contact lists), time-decayed, portable across operators and domains. A locksmith with 200 five-star ratings from verified Nostr identities needs no trade body endorsement.

**5. Disputes** (TROTT-05, kinds 30540-30547) — Conflict resolution that scales. GPS proves a no-show automatically. Photo evidence supports a damage claim. Complex disputes escalate to human arbitration. The evidence types are domain-specific; the resolution workflow is universal.

**6. Payments** (TROTT-04, kinds 30530-30538) — Currency-neutral, rail-agnostic payment coordination. Every payment event carries `amount`, `currency`, and `trust_model` tags. A ride might be £12.50 GBP via Stripe; a locksmith callout might be 50,000 sats via Lightning. Streaming payments (per-second or per-metre) work across all options.

**7. Safety** (TROTT-05, kinds 30540-30547) — Emergency signals, periodic check-ins, abuse reporting. A panic button works the same whether the person pressing it is a passenger, a courier, or a security guard.

These seven primitives compose to cover physical service coordination across hundreds of domains. Each maps to a TROTT specification (TROTT-01 through TROTT-08), and a minimal implementation needs only TROTT-01 + TROTT-02 — 14 event kinds.

---

## 3. Why the Abstraction Holds

This isn't an aspirational claim. It was validated sector by sector.

### The evidence

649 use case domains were analysed across 31 economic sectors, from ridesharing to emergency plumbing to court process serving. Of these, approximately 565 need zero protocol changes — the core primitives handle them directly. Around 78 need minor extensions (additional sub-states or proof types achievable through domain profile configuration). Only 6 identified genuine protocol-level gaps across all 649 domains. The full analysis is in [`docs/USE-CASES.md`](USE-CASES.md).

### Five coordination patterns

Every domain maps to one of five coordination patterns:

| Pattern            | Example domains                          | Core characteristic                        |
|--------------------|------------------------------------------|--------------------------------------------|
| **Dispatch**       | Locksmith, emergency plumber, towing     | Provider travels to requester, works, done |
| **Relay delivery** | Parcel delivery, food delivery, courier  | Pick up at A, deliver to B                 |
| **Scheduled**      | Pet sitting, cleaning, tutoring          | Pre-arranged time, location known upfront  |
| **Trip**           | Ridesharing, moving, airport transfer    | Both parties travel together               |
| **Shift**          | Security guard, event staff, temp worker | Sustained presence with periodic check-ins |

Each pattern uses the same seven primitives in different configurations.

### Concrete domain walkthroughs

**Locksmith (dispatch + quote negotiation).** A customer publishes a task request (kind 30500) with `domain: locksmith` and their geohash. Nearby locksmiths see it and publish offers (kind 30501) with quotes. The customer accepts; the locksmith transitions through `en_route → arrived → access_method_confirmed → work_active → access_gained`. The `access_method_confirmed` sub-state lets the locksmith confirm their approach (picking, drilling, replacement) with an updated price before work begins — this is just an additional transition in the profile's state machine. The domain profile is [~100 lines of configuration](../src/domain-profiles/locksmith.js): roles are `customer`/`locksmith`, the task noun is "callout", pricing model is `flatRate`, and `quoteNegotiation` is enabled. No code changes to the engine.

**Delivery (relay + photo proof).** A sender requests collection (kind 30500) with pickup and delivery geohashes. A courier matches and transitions through `en_route_to_pickup → arrived_at_pickup → collected → in_transit → arrived_at_delivery → delivered`. The `collected` sub-state is unique to delivery — the parcel changes custody — but it's just another entry in the profile's `states.transitions` object. Completion proof requires both a geotagged photo and a digital signature (`completionProofTypes: ['gps_arrival', 'photo', 'signature']`). Same engine, different [~100 lines of configuration](../src/domain-profiles/delivery.js).

**Security guard (shift + heartbeat).** A client requests a guard for an 8-hour shift. The officer transitions through `briefed → on_station → patrolling → incident` (cycling between sub-states as needed) before `shift_complete`. The critical difference is the `heartbeat_interval_minutes` tag — the officer must check in every 30 minutes via TROTT-05 safety check-ins (kind 30541). A missed check-in triggers an alert. Payment streams hourly via TROTT-04 streaming ticks (kind 30536). The state machine definition in the [security domain spec](../specs/domains/security.md) uses the same `transitions` object format as every other domain.

All three domains share the same `TaskManager` engine ([`src/task-manager.js`](../src/task-manager.js)), the same payment provider interface ([`payment-providers/base.js`](../payment-providers/base.js)), and the same Nostr event structure. The only differences live in their profile configuration files.

---

## 4. What's Genuinely Novel

Ranked by "has anyone else done this?":

### 1. Portable reputation across operators AND domains

In the current gig economy, your Uber rating is worthless on Lyft. Your TaskRabbit reviews don't help on Bark. TROTT stores ratings as cryptographically signed Nostr events (kind 30520), tied to your public key. They're weighted by your social graph via NIP-02 contact lists — a rating from someone you follow counts more than one from a stranger. They decay over time so that recent performance matters more.

The genuinely novel part: these ratings follow you across operators *and* across service domains. A locksmith who becomes a courier carries their reputation with them. A requester who switches operators keeps their track record. No existing platform offers this — reputation portability requires an identity layer independent of any single service, which is exactly what Nostr provides.

Credential attestations (kind 30522) extend this further. A locksmith's Master Locksmiths Association membership, a security guard's SIA licence, a plumber's Gas Safe registration — these are published as verifiable credentials on Nostr, visible to any client that queries the provider's public key. The credentials are domain-specific but the attestation mechanism is universal.

### 2. Federated operators with compare-and-choose

TROTT operators are like email providers. Multiple operators compete in each market — `operator-london.example.com`, `operator-nyc.example.com` — each running the open-source reference implementation (or their own). Users compare operators by fee, reputation, trust model, and volume, then choose. Operators publish bonds to Nostr (kind 30511), making their financial commitment auditable.

This is neither the P2P model (which fails legal requirements for safety monitoring, background checks, and GDPR compliance) nor the monopoly model (one platform owns everything). It's the federated model that email proved works — but applied to physical service coordination for the first time.

The economic consequence is structural fee competition. When switching operators is free and reputation travels with you, operators compete on service quality and fees rather than on lock-in. An operator charging 15% commission faces immediate pressure from one charging 3% — because users can switch without losing their ratings, their payment history, or their provider relationships.

### 3. Payment rail agnosticism with explicit trust models

Every payment event in TROTT carries three tags: `amount`, `currency`, and `trust_model`. A user chooses their payment rail: NIP-47 hold invoices (`trustless` — operator never has custody), Strike (`custodial-third-party` — Strike holds funds during conversion), Stripe (`custodial-escrow` — Stripe holds in escrow), Cashu (`federated` — ecash mint), or an operator's own Lightning node (`custodial`).

The trust model is not hidden — it's on every event, visible to anyone querying the relay. Users make informed choices about the trust assumptions they accept. No existing platform gives users this choice or this transparency. The payment provider interface (`lockStake()`, `releaseStake()`, `forfeitStake()`, `healthCheck()`, `getCapabilities()`) is identical across all rails.

### 4. Domain-agnostic state machine with declarative profiles

Adding a new service domain to TROTT requires ~100 lines of configuration, not a new codebase. A domain profile declares: state machine (states + transitions), role names, UI labels, pricing model, discovery method, completion proof types, rating criteria, feature flags, and event kind mappings. The `TaskManager` engine validates transitions against whatever state machine the profile defines — the engine itself is domain-unaware.

The `transitionTo()` method doesn't know whether it's transitioning a ride from `en_route` to `arrived` or a locksmith callout from `arrived` to `access_method_confirmed`. It validates against the loaded profile's transitions and throws if the transition isn't allowed. This is not just configuration — it's a generic coordination engine parameterised by a declarative domain description. The profile schema ([`src/domain-profiles/schema.js`](../src/domain-profiles/schema.js)) validates every profile on load.

### 5. Three-layer data architecture

TROTT splits data across three layers, each with different persistence and privacy properties:

| Layer                         | Data                                      | Properties                        |
|-------------------------------|-------------------------------------------|-----------------------------------|
| **Nostr** (public, permanent) | Discovery, reputation, operator bonds     | Pseudonymous, censorship-resistant |
| **Operator** (private, compliant) | PII, GPS traces, compliance records  | GDPR-erasable, legally compliant  |
| **WebSocket** (ephemeral)     | Real-time location, live updates          | Not persisted, privacy-preserving |

This solves a genuine tension: GDPR requires data deletion, but trust requires audit trails. The three-layer architecture provides both — pseudonymous ratings on Nostr are permanent and auditable, while PII in the operator database is erasable via standard GDPR processes. NIP-17 gift wrap (NIP-44 encryption + NIP-59 three-layer wrapping) enables encrypted PII exchange where even relays cannot read the content.

No existing platform architecture cleanly separates these concerns. Traditional platforms store everything in one database. Fully decentralised systems struggle with GDPR compliance. TROTT's three-layer model is a structural solution to a problem that regulation and decentralisation jointly create.

Concretely: a requester's exact address is exchanged via NIP-17 gift wrap — encrypted end-to-end with three-layer wrapping (rumour → seal → gift wrap) so that neither the relay operator nor the TROTT operator can read it. The operator's database stores GPS traces with a 90-day retention policy (configurable per domain via the `dataRetention` profile field). Pseudonymous ratings on Nostr are permanent. A GDPR deletion request removes the operator's private data without touching the public reputation layer — because the public layer never contained PII in the first place.

---

## 5. Comparison

|                            | TROTT                              | Uber / Lyft             | TaskRabbit / Bark       | Stripe (payments only)    |
|----------------------------|------------------------------------|-------------------------|-------------------------|---------------------------|
| **Reputation portability** | Cross-operator, cross-domain       | Locked to platform      | Locked to platform      | N/A                       |
| **Payment rail choice**    | Lightning, Strike, Stripe, Cashu   | Card only               | Card only               | Card / bank               |
| **Data portability**       | Nostr keypair, take your identity  | Platform owns data      | Platform owns data      | Merchant owns data        |
| **Domain support**         | 649+ via profiles                  | Transport only          | ~50 task categories     | Any (payments only)       |
| **Operator switching**     | Free, keep reputation              | Start from zero         | Start from zero         | N/A                       |
| **Trust model transparency** | Explicit on every event          | Hidden                  | Hidden                  | Documented but not per-tx |
| **PII privacy**            | NIP-17 encrypted, operator-blind   | Platform sees all       | Platform sees all       | Merchant manages          |
| **Audit trail**            | Public Nostr events, signed        | Platform-internal       | Platform-internal       | Dashboard logs            |
| **P2P possible**           | Yes (TROTT-01 + TROTT-02 only)     | No                      | No                      | No                        |
| **Regulatory compliance**  | Operator layer handles GDPR, safety | Platform handles all   | Platform handles all    | Merchant responsibility   |

---

## 6. The Trust Architecture

TROTT doesn't rely on a single trust mechanism. Six layers stack progressively, each addressing a different attack vector.

**Layer 1 — Reputation** (TROTT-03). Cryptographically signed ratings on Nostr, weighted by social graph (NIP-02), with time decay. Prevents repeat scams. Doesn't prevent exit scams — an operator can build reputation then defect.

**Layer 2 — Operator bonds** (TROTT-02, kind 30511). Operators lock capital as a bond, published to Nostr. Bond size scales with daily volume (2x daily exposure). If an operator steals £2,500 in stakes, their £5,000 bond is slashed — net loss of £2,500. Makes theft unprofitable.

**Layer 3 — Insurance pool**. Operators pay premiums into a shared pool (0.1% of monthly volume, scaled by reputation). If any operator steals, victims are compensated. Socialises risk across the network.

**Layer 4 — Progressive limits**. New operators start with a £10 maximum stake and £100 total exposure. Limits increase with reputation. A new malicious operator can steal at most £100 before being permanently excluded — not worth the effort.

**Layer 5 — Multi-sig custody**. For high-value tasks, stakes are held in multi-party custody (Fedimint federation or multi-operator coordination). A 3-of-5 threshold means no single party can steal.

**Layer 6 — Trustless** (NIP-47). The operator physically cannot steal. Hold invoices lock funds in the Lightning Network — the operator's role is to trigger settlement by publishing a signed completion event. Timeout causes automatic refund. Zero custody risk.

The model is federated — not centralised, not fully P2P. Operators are necessary for legally mandated functions (24/7 safety monitoring, background checks, GDPR-compliant data retention, insurance coordination, complex dispute escalation). But operators cannot lock users in: reputation lives on Nostr (cryptographically signed, not operator-controlled), switching operators is free, and anyone can run an operator using the open-source reference implementation.

The key insight is that users choose their position on the trust spectrum. Don't trust custodial arrangements? Use NIP-47 hold invoices — the operator physically cannot touch your funds. Want insurance coverage? Choose an insured operator with a published bond. Want the lowest fees? Accept more risk with a newer operator. Want fiat? Use Strike, where the operator never has custody anyway. Every payment event's `trust_model` tag makes this choice visible and auditable.

Exit scam economics make the maths clear: steal £2,500, lose a £5,000 bond plus all accumulated reputation plus criminal liability. The game theory discourages defection at every scale. And critically, the system becomes antifragile — each attack strengthens it by destroying attacker reputation, improving detection, increasing bond requirements, and driving users towards trustless options. See [`TRUST-MECHANISMS.md`](../TRUST-MECHANISMS.md) for the full analysis.

---

## 7. For Builders

### Minimal implementation

A minimal TROTT implementation needs 14 event kinds:

| Category                  | Kinds              | Count |
|---------------------------|--------------------|-------|
| Task lifecycle (TROTT-01) | 30500-30507        | 8     |
| Discovery (TROTT-02)      | 20500, 30510-30512 | 4     |
| Reputation (TROTT-03)     | 30520              | 1     |
| Safety (TROTT-05)         | 30540              | 1     |

This gives you task creation, provider matching, state transitions, discovery, basic reputation, and emergency signals — enough for a working P2P coordination system.

### Adding a domain

Create a profile file (~100 lines) that exports an object declaring: `id`, `name`, `states` (values, transitions, terminal, initial), `roles` (requester, provider), `labels`, `pricingModel`, `discoveryMethod`, `completionProofTypes`, `ratingCriteria`, and `features`. The schema validator ([`src/domain-profiles/schema.js`](../src/domain-profiles/schema.js)) checks it on load. Set `DOMAIN=yourdomain` and start the server.

### Running an operator

The reference implementation is a Node.js server with Express REST API + WebSocket. Out of the box you get: task coordination, payment provider integration (8 providers), navigation routing, NIP-98 authentication, rate limiting, and a React frontend that adapts to the loaded domain profile. See [`specs/QUICK-REFERENCE.md`](../specs/QUICK-REFERENCE.md) for the complete event kind table.

### Progressive adoption

| Tier | Event kinds | What you get                                                    |
|------|-------------|-----------------------------------------------------------------|
| 1    | 14          | P2P task coordination, discovery, basic reputation, safety      |
| 2    | 23          | + Payment flows, tipping, earnings, credentials                 |
| 3    | 31          | + Safety check-ins, disputes, abuse reporting, media            |
| 4    | 51          | + Operator coordination, compliance, navigation, messaging      |

Start at Tier 1. Add capabilities as your use case demands.

---

## Further Reading

- **Protocol specifications**: [`specs/TROTT-01-core.md`](../specs/TROTT-01-core.md) through [`specs/TROTT-08-messaging.md`](../specs/TROTT-08-messaging.md)
- **Event kind table**: [`specs/QUICK-REFERENCE.md`](../specs/QUICK-REFERENCE.md)
- **Use case analysis (649 domains)**: [`docs/USE-CASES.md`](USE-CASES.md)
- **Architecture**: [`ARCHITECTURE.md`](../ARCHITECTURE.md)
- **Trust mechanisms**: [`TRUST-MECHANISMS.md`](../TRUST-MECHANISMS.md)
- **Payment providers**: [`docs/PAYMENT-PROVIDERS.md`](PAYMENT-PROVIDERS.md)
- **GDPR compliance**: [`docs/GDPR-COMPLIANCE.md`](GDPR-COMPLIANCE.md)
