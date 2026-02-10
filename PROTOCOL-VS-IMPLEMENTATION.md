# DonkeyRide: Protocol vs Implementation

## Critical Reframe

**What we are:**
Defining a **protocol standard** (event kinds, data structures, interoperability) for trust-minimised service coordination across multiple domains.

**What we are NOT:**
- Building a specific implementation
- Providing legal guidance
- Requiring Nostr for all use cases
- Mandating specific architecture choices
- Limited to a single service domain

---

## Analogy: We Are Like HTTP, Not Like Google

| Layer | Example | Who Defines | Who Implements | Who Handles Legal |
|-------|---------|-------------|----------------|-------------------|
| **Protocol** | HTTP/HTTPS | W3C, IETF | Anyone | N/A (just specs) |
| **Implementation** | Google.com | Google engineers | Google | Google Legal |
| **Protocol** | **TROTT** | **Us (protocol designers)** | **Anyone** | **N/A (just specs)** |
| **Implementation** | **London Operator** | **Operator engineers** | **Operator** | **Operator Legal** |

**Our job**: Define event kinds so different implementations can interoperate across any service domain
**Operator's job**: Build compliant services in their jurisdiction
**NOT our job**: Tell operators how to comply with local regulations

---

## Implementation Spectrum

Operators can choose their architecture based on their needs:

### **Implementation 1: Maximum Decentralisation (Nostr-Heavy)**

```
Client App  <-->  Public Nostr Relays  <-->  Provider App
                         |
              Minimal Operator Service
              (only PII storage + safety monitoring)
```

**Use Case:**
- Crypto-native market (Bitcoiners, privacy advocates)
- Jurisdictions with minimal regulations
- Small-scale operations
- Any domain (ridesharing, locksmith, delivery, etc.)

**Nostr Usage:**
- Task discovery (TROTT-01, kind 30500)
- Matching (TROTT-01, kind 30502)
- Reputation (TROTT-03, kind 30520)
- Operator bonds (TROTT-02, kind 30511)

**Operator Responsibilities:**
- GDPR-compliant PII storage
- Whatever safety features local law requires
- Payment coordination (if needed)

---

### **Implementation 2: Hybrid (Nostr for Discovery, Private for Operations)**

```
Client App  <-->  Public Nostr Relays (discovery only)
                         |
                   Operator Service
              (handles everything after matching)
              - PII storage
              - Real-time coordination
              - Payments
              - Safety monitoring
              - Background checks
```

**Use Case:**
- Mainstream markets (London, New York, Berlin)
- Full legal compliance (UK, US, EU)
- Better UX (faster real-time updates)
- Multi-domain operators (ridesharing + locksmith + delivery from one platform)

**Nostr Usage:**
- Operator advertisement (TROTT-02, kind 30511)
- Provider profiles (TROTT-02, kind 30510)
- Public reputation (TROTT-03, kind 30520)
- Individual tasks handled privately (operator DB)

**Operator Responsibilities:**
- Full regulatory compliance for their jurisdiction
- GDPR compliance
- Real-time coordination
- Dispute resolution

---

### **Implementation 3: Minimal Nostr (Traditional Centralised, TROTT-Compatible)**

```
Client App  <-->  Operator API Only (traditional centralised)
                         |
              No public Nostr usage
              (but exports data in TROTT event format)
```

**Use Case:**
- Existing service companies wanting interoperability
- Jurisdictions that restrict public service data
- Corporate fleets (employee shuttles, internal logistics)

**Nostr Usage:**
- No public events
- Exports data in TROTT event schema (for portability)

**Operator Responsibilities:**
- Everything (full traditional centralised service)
- Complies with TROTT event schema for data export (users can leave)

**Example:**
> "Acme Services runs a traditional centralised locksmith dispatch in a market where Nostr relays are unavailable, but allows locksmiths to export their reputation data as signed kind 30520 events, which they can import into a different operator."

---

### **Implementation 4: Zero Nostr (Closed System, Schema-Compatible)**

```
Proprietary service platform
Uses TROTT event schemas internally
```

**Use Case:**
- Existing companies adopting standard data formats
- B2B corporate services
- Government-run services

**Nostr Usage:**
- None (fully closed system)

**TROTT Compliance:**
- Uses kind 30500 schema for task requests (internally)
- Allows data export in TROTT format
- Interoperable if they later open up

**Example:**
> "A large platform could adopt TROTT event schemas for their internal APIs, making it easier for providers to export their data and move to competitors — regardless of the service domain."

---

## What the Specification SHOULD Define

### **Must Define (Protocol Layer)**

1. **Event Kind Numbers**: 20500-20501 (ephemeral) + 30500-30563 (core) + 30600-30779 (domain extensions)
2. **Event Schemas**: JSON structure for each event kind
3. **Required Tags**: What tags MUST be present
4. **Optional Tags**: What tags MAY be present
5. **Replaceable vs Non-Replaceable**: Event persistence semantics
6. **Cryptographic Signatures**: How to verify authenticity
7. **Interoperability Rules**: How events from different operators can be understood

**Example (Good):**
```markdown
### Task Request (Kind 30500)

A task request event MUST include:
- `d` tag: Unique task identifier
- `domain` tag: Service domain identifier (e.g. "ridesharing", "locksmith", "delivery")
- `location_lat` / `location_lon` tags: Service location

A task request event MAY include:
- `privacy_level` tag: "public" | "obfuscated" | "encrypted"
- `amount` / `currency` tags: Estimated cost in smallest currency unit
- `trust_model` tag: Payment trust model

Implementations MUST respect the privacy_level tag when publishing to relays.
```

---

### **Must NOT Define (Implementation Layer)**

1. "Operators MUST have 24/7 safety monitoring"
2. "Background checks MUST use Checkr or Onfido"
3. "Insurance MUST be a specific minimum"
4. "Emergency button MUST call a specific number"
5. "Operators MUST delete GPS data after 90 days"
6. "Operators MUST comply with GDPR"

**Why?**
- These are JURISDICTION-SPECIFIC (varies by country/state)
- These are OPERATOR CHOICES (business decisions)
- These are LEGAL REQUIREMENTS (we're not lawyers)

**Instead, Provide Guidance:**
```markdown
### Implementation Note: Safety Features

Operators implementing TROTT in regulated jurisdictions may need to implement:
- Emergency alert systems (TROTT-05, kind 30540)
- Safety check-in protocols (TROTT-05, kind 30541)
- Background check verification (TROTT-03, kind 30522)
- Operator bonds (TROTT-02, kind 30511)

Refer to local regulations for your jurisdiction and service domain.

The TROTT protocol provides event kinds for these features but does not mandate their use.
```

---

### **Should Recommend (Best Practices)**

Use "SHOULD" (not "MUST") for best practices:

```markdown
### Privacy Best Practices

Operators SHOULD:
- Obfuscate exact locations on public relays (use geohash precision 5 ~ 5km)
- Store PII in private databases with deletion capabilities
- Use NIP-17 gift-wrapped messages for exact addresses and personal details
- Use NIP-44 encryption for all private coordination payloads
- Implement data retention policies appropriate for their jurisdiction

Operators MAY:
- Publish all task data publicly (in jurisdictions without privacy laws)
- Use fully private coordination (no public Nostr events)
- Implement custom privacy levels based on user preferences
```

---

## Updated Specification Structure

### **Section 1: Core Protocol (Mandatory)**
- Event kind numbers (TROTT-01: kinds 30500-30507)
- Event schemas
- Tag definitions
- Signature requirements
- Interoperability rules

### **Section 2: Implementation Patterns (Optional)**
- Nostr-heavy pattern (maximum decentralisation)
- Hybrid pattern (Nostr discovery + private ops)
- Private pattern (schema-compatible only)
- Migration pattern (export/import between operators)

### **Section 3: Extension Specifications (Optional)**
- Discovery (TROTT-02: kinds 20500, 30510-30512)
- Reputation (TROTT-03: kinds 30520-30522)
- Payments (TROTT-04: kinds 30530-30536)
- Safety & Disputes (TROTT-05: kinds 30540-30546)
- Coordination (TROTT-06: kinds 30550-30554)
- Navigation (TROTT-07: kinds 20501, 30560-30563)

**Each extension marked as:**
```markdown
**Implementation Status**: OPTIONAL
**Use Case**: Operators in jurisdictions requiring safety features, payment escrow, etc.
**Interoperability**: If implemented, MUST follow this schema
```

### **Section 4: Domain Extensions (Per-Domain)**
- Ridesharing (kinds 30600-30619)
- Locksmith (kinds 30620-30639)
- Delivery (kinds 30640-30659)
- Towing, Emergency Trades, Pet Services, Security, Cleaning, Moving (kinds 30660-30779)

### **Section 5: Regulatory Guidance (Informational)**
- Common legal requirements by jurisdiction
- Event kinds that help with compliance
- **DISCLAIMER: Not legal advice, consult local solicitors**

---

## Key Changes to Make

### **1. Change Language Throughout Specs**

**Before:**
> "Operators MUST implement emergency button (kind 30540) to comply with local safety regulations."

**After:**
> "Operators MAY implement emergency alerts (TROTT-05, kind 30540). Operators in certain jurisdictions may be legally required to provide emergency features."

---

### **2. Add Implementation Flexibility Statement (Top of Specs)**

```markdown
## Implementation Flexibility

This specification defines a protocol standard for trust-minimised service coordination.
It is domain-agnostic — the same core protocol serves ridesharing, locksmith dispatch,
parcel delivery, and any other service domain. Implementations may:

1. **Nostr-Native**: Use public Nostr relays for all coordination
2. **Hybrid**: Use Nostr for discovery, private infrastructure for operations
3. **Schema-Compatible**: Use TROTT event schemas internally without public Nostr events
4. **Partial**: Implement only core events (TROTT-01, kinds 30500-30507) and skip optional extensions

The goal is INTEROPERABILITY, not prescriptive architecture.

Operators are responsible for:
- Legal compliance in their jurisdiction
- User safety and privacy
- Data retention and deletion
- Insurance and liability
- Background checks and screening

This specification provides event schemas to enable these features but does not mandate
specific implementations.
```

---

### **3. Remove Legal Prescriptions**

**Remove from specs:**
- "24/7 safety team with <60 sec response time"
- "Specific minimum insurance requirement"
- "Annual background checks required"
- "90-day data retention policy"
- "GDPR compliance mandatory"

**Replace with:**
- Event kind 30522 (Credential Attestation) — schema definition for verifiable credentials
- Event kind 30511 (Operator Bond) — schema definition for financial commitment
- "Operators should consult local regulations for their jurisdiction and service domain"

---

### **4. Add "Regulatory Appendix" (Non-Normative)**

```markdown
## Appendix A: Common Regulatory Requirements (Non-Normative)

This section is INFORMATIONAL only and does not constitute legal advice.

### United Kingdom
- **Ridesharing**: Private hire vehicle licensing (Local Authority)
- **Locksmith**: No mandatory licensing (MLA voluntary)
- **Emergency Trades**: Gas Safe (gas), NICEIC (electrical)
- **Security**: SIA licensing (Private Security Industry Act 2001)
- **Data Privacy**: UK GDPR — right to deletion, data portability
- **Consider**: TROTT-05 safety events, TROTT-03 credential attestation

### European Union
- **GDPR**: Right to deletion, data portability
- **Data Minimisation**: Avoid storing unnecessary data
- **Implementation**: Store PII privately, offer export, use NIP-17 for encrypted PII exchange

### United States
- **California**: AB-5 (worker classification), CCPA (privacy)
- **New York**: TLC regulations (ridesharing), specific licensing per domain
- **Consider**: TROTT-05 safety events, TROTT-03 credential attestation

### Emerging Markets
- **Minimal Regulations**: May not require background checks or insurance
- **Privacy**: May not have GDPR-equivalent laws
- **Implementation**: Simpler, more Nostr-native approaches may be viable

**Operators MUST consult with legal counsel in their jurisdiction.**
```

---

## Competitive Advantage: Standard Protocol

By being a STANDARD (not a specific implementation), the TROTT protocol can:

**Enable Competition**
- Anyone can build a compatible operator for any service domain
- Users can switch operators (data portability via kind 30521)
- Apps can multi-home (connect to multiple operators)

**Geographic Flexibility**
- Heavy regulations (UK, EU, US): Use hybrid model with full compliance
- Light regulations (emerging markets): Use Nostr-native model
- No regulations: Fully decentralised P2P

**Domain Flexibility**
- One operator can serve multiple domains (ridesharing + locksmith + delivery)
- Domain profiles parameterise the protocol — ~100 lines per new domain
- Shared reputation across domains (a reliable driver is likely a reliable courier)

**Business Model Flexibility**
- 0.5% fee operators (our vision)
- 5% fee operators (still better than 25% on traditional platforms)
- Free operators (community-run, donation-funded)
- Corporate operators (employee shuttles, internal logistics)

**Avoid Legal Liability**
- We don't operate services — no liability
- We don't handle PII — no GDPR risk
- We don't mandate compliance — not providing legal advice
- We just define data formats — like HTTP

---

## The New Positioning

**What we built:**
> "TROTT (Trusted Real-world Orchestration of Tasks & Trades) is an open protocol standard for trust-minimised service coordination, defining event schemas (kinds 20500-20501, 30500-30563, 30600-30779) that enable interoperability between different operators, applications, and implementations across any service domain. Like HTTP for the web or SMTP for email, TROTT provides a common language for service coordination — from ridesharing to locksmith dispatch to parcel delivery — allowing users to switch providers whilst preserving their reputation and task history."

**Not:**
> "DonkeyRide is a decentralised ridesharing platform that competes with Uber."

**Instead:**
> "DonkeyRide is the reference implementation of the TROTT protocol — an open standard that enables multiple service operators to compete across multiple domains whilst ensuring user data portability and cross-operator reputation."

---

## Next Steps

1. **Update spec abstracts** — Clarify we're a protocol standard, not a single-domain platform
2. **Add implementation flexibility section** — Show the spectrum
3. **Change MUST to MAY** for jurisdiction-specific features
4. **Move legal content to appendix** — Make it non-normative
5. **Add interoperability examples** — Show how operators can federate
6. **Remove liability language** — We're not lawyers

This reframe makes the TROTT protocol:
- Legally safer (we're not mandating anything)
- More flexible (operators choose architecture and domains)
- More adoptable (any service company could adopt our schemas)
- More credible (we're standard-setters, not platform-builders)
