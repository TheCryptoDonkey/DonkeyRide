I f# DonkeyRide Protocol - Frequently Asked Questions

**Last Updated**: 2025-10-16
**Protocol Version**: v1.0

---

## Table of Contents

1. [Basics](#basics)
2. [Decentralization & Architecture](#decentralization--architecture)
3. [Comparison to Uber/Lyft](#comparison-to-uberlyft)
4. [Privacy & Data](#privacy--data)
5. [Economics & Fees](#economics--fees)
6. [Legal & Compliance](#legal--compliance)
7. [Technical Details](#technical-details)
8. [For Developers](#for-developers)
9. [For Operators](#for-operators)
10. [For Drivers](#for-drivers)
11. [For Riders](#for-riders)

---

## Basics

### What is DonkeyRide?

**DonkeyRide is an open protocol standard** for ridesharing coordination - similar to how HTTP is a standard for the web or SMTP is a standard for email.

It's **not** a ridesharing company. It's a specification that defines **82 event schemas** (kinds 30500-30599) that enable interoperability between different ridesharing operators, applications, and implementations.

### Why not just use Uber or Lyft?

Uber and Lyft are centralized platforms with several issues:
- **High fees**: 25-30% commission (drivers keep 70-75%)
- **Platform lock-in**: Can't take your reputation elsewhere
- **Deplatforming risk**: Company can ban you at any time
- **No transparency**: Black box algorithms for surge pricing
- **Privacy concerns**: All your data belongs to one company

DonkeyRide solves these by providing an **open standard** that allows multiple operators to compete, enabling:
- **Lower fees**: Typical 0.5% (drivers keep 99.5%)
- **Reputation portability**: Take your ratings to any operator
- **No deplatforming**: Can switch operators freely
- **Transparent pricing**: Auditable surge algorithms
- **Privacy options**: Choose operators with better privacy policies

### Is this like a blockchain or cryptocurrency?

**No.** DonkeyRide is a protocol standard built on:
- **Nostr**: Decentralized communication protocol (optional, for discovery/reputation)
- **Lightning Network**: Bitcoin payment layer (optional, for instant payments)

But operators can implement DonkeyRide **without** using either Nostr or Lightning - they just need to use compatible event schemas for data portability.

### Who controls DonkeyRide?

**No one.** It's an open protocol standard released under the MIT License.

Anyone can:
- ✅ Implement it freely
- ✅ Modify it for their needs
- ✅ Build commercial services using it
- ✅ Propose improvements via pull requests

There's no company, no governance board, and no patents. It's similar to HTTP or email protocols.

---

## Decentralization & Architecture

### Is DonkeyRide fully decentralized?

**No - it's federated, not fully decentralized.**

**Why federated?**
- Legal compliance requires accountable operators (background checks, insurance, GDPR)
- Real-time coordination works better with centralized operator infrastructure
- Users want Uber-level UX (instant matching, live ETAs, reliable payments)

**What does federated mean?**
- Multiple independent operators compete (like email providers)
- Users can switch operators while keeping their reputation
- No single company has a monopoly
- Operators are responsible for legal compliance in their jurisdiction

Think: **Gmail vs Outlook vs ProtonMail** (federated email) not **Bitcoin** (fully decentralized).

### Do I need to use Nostr?

**No.** Operators can implement DonkeyRide in three ways:

**1. Nostr-Native** (Maximum Decentralization):
- Public Nostr relays for discovery and reputation
- Best for crypto-native markets with minimal regulation

**2. Hybrid** (Recommended for Mainstream):
- Nostr for public discovery/reputation
- Private operator infrastructure for PII, real-time updates, payments
- Best for regulatory compliance (NYC, SF, London)

**3. Schema-Compatible** (Traditional Centralized):
- No Nostr at all - just use DonkeyRide event schemas
- Enables data export/import between operators
- Example: *Uber could adopt this for data portability*

### Why use Nostr at all if it's federated?

**Two main benefits:**

1. **Censorship-resistant reputation**: No single operator controls your ratings
2. **Discoverability**: Riders can find drivers across multiple operators

But Nostr is **optional** - the core value is the **interoperable event schemas** that enable data portability.

### What's the "sidecar" to Nostr relays?

In the **Hybrid model** (recommended for mainstream markets), operators run:

1. **Public Nostr relays** - Discovery, aggregated reputation (no PII)
2. **Private operator services** - PII storage, real-time WebSocket, payments, safety

This gives you:
- ✅ Nostr benefits (censorship-resistant reputation)
- ✅ GDPR compliance (deletable PII in private database)
- ✅ Real-time UX (WebSocket for live location updates)
- ✅ Legal defensibility (accountable operator for background checks)

See [ARCHITECTURE.md](./ARCHITECTURE.md) for diagrams.

---

## Comparison to Uber/Lyft

### Does DonkeyRide have all the features of Uber/Lyft?

**Yes - 100% feature parity.**

DonkeyRide includes all production features:
- ✅ Real-time matching and tracking
- ✅ Upfront pricing and surge pricing
- ✅ Safety features (panic button, trip sharing, check-ins)
- ✅ Background checks and insurance verification
- ✅ Ratings and reviews (driver + rider)
- ✅ Scheduled rides and ride preferences
- ✅ Tipping and split payments
- ✅ Corporate accounts and promo codes
- ✅ Lost & found and customer support
- ✅ Wheelchair accessibility (ADA compliance)

See [PLATFORM-COMPARISON.md](./PLATFORM-COMPARISON.md) for detailed comparison.

### What does DonkeyRide do better than Uber/Lyft?

**Six key advantages:**

1. **10x lower fees** - 0.5% typical vs 25-30%
2. **Data portability** - Export/import reputation between operators
3. **No deplatforming** - Can switch operators, can't be banned from protocol
4. **Transparent pricing** - Auditable surge algorithms
5. **Privacy options** - Anonymous rides possible (Lightning + pseudonyms)
6. **Open source** - Anyone can verify, fork, or improve

### Can Uber/Lyft adopt DonkeyRide?

**Yes!** In fact, we hope they do.

Uber could implement DonkeyRide in "Schema-Compatible" mode:
- Keep their existing infrastructure
- Export user data in DonkeyRide format
- Allow drivers/riders to import reputation to competing operators

This would benefit everyone:
- **Drivers**: Can leave Uber while keeping ratings
- **Riders**: Can switch to lower-fee operators
- **Uber**: Demonstrates commitment to data portability (good PR)

---

## Privacy & Data

### What personal data is stored on public Nostr relays?

**In the recommended Hybrid model: Only aggregated reputation (no PII).**

**Public Nostr Relays Store:**
- ✅ Aggregate rating (4.8 stars, 1,200 rides)
- ✅ Pseudonymous pubkey (not linked to real identity)

**Private Operator Database Stores:**
- ❌ Real name, phone number, email
- ❌ Individual ride details (pickup/dropoff addresses)
- ❌ GPS traces
- ❌ Payment information

See [NIP-XX-ridesharing.md → Appendix D: Privacy & Reputation Event Lifecycle](./NIP-XX-ridesharing.md) for full specification.

### How does GDPR "Right to be Forgotten" work with Nostr?

**Hybrid privacy model** solves this:

1. **Public Nostr data** - Only aggregated reputation (no PII, not subject to GDPR)
2. **Private operator data** - Fully deletable (30-day SLA)
3. **Reputation transfer** - Can move aggregated reputation to new key
4. **Time-windowed reputation** - Auto-expires after 90 days

**Example deletion flow:**
1. User requests account deletion
2. Operator deletes all PII from private database (30 days)
3. Aggregated reputation on Nostr remains (no PII, legal)
4. Optional: Transfer reputation to new pseudonymous key

### Can rides be anonymous?

**Yes, in Nostr-Native mode:**
- Use separate Nostr key for ridesharing (not linked to social identity)
- Pay with Lightning (pseudonymous Bitcoin)
- No KYC required (depends on operator policy)

**Limitations:**
- Operator may require identity verification for legal compliance
- Safety features (emergency contact) require some identity info
- Mainstream markets (NYC, SF) typically require driver background checks

---

## Economics & Fees

### What are the fees?

**Typical: 0.5% operator fee** (drivers keep 99.5%)

But **it depends on the operator** - DonkeyRide is a protocol standard, not a platform. Each operator sets their own fees.

**Comparison:**
- Uber/Lyft: 25-30% commission
- DonkeyRide operators: 0.5-5% typical range

**Why so much lower?**
- No VC debt to repay
- No monopoly pricing power
- Competition between operators
- Lower overhead (open protocol reduces development costs)

### How do drivers get paid?

**Recommended: Lightning Network streaming payments**

- ✅ Instant settlement (seconds)
- ✅ No payment processing fees
- ✅ No chargebacks
- ✅ Trustless (driver receives payment as ride progresses)

**Alternative payment methods:**
- Traditional payment processors (credit cards, ACH)
- Ecash / Fedimint (future extension)
- Operator-held balance (prepaid accounts)

See [NIP-XX-ridesharing.md → Event Kind 30510: Streaming Payment](./NIP-XX-ridesharing.md) for details.

### What about surge pricing?

**Operators decide their own surge algorithm**, but DonkeyRide recommends:

1. **Transparent calculation** - Publish the algorithm publicly
2. **Fair caps** - Maximum 3x multiplier
3. **Auditable** - Publish surge zones via Event Kind 30590

**Example algorithm:**
```
Multiplier = 1 + (active_requests / available_drivers - 1) * 0.5
Capped at 3.0x
```

See [NIP-XX-ridesharing.md → Appendix E: Surge Pricing Guidelines](./NIP-XX-ridesharing.md).

### Can riders tip drivers?

**Yes - and 100% goes to the driver.**

- Event Kind 30513 (Driver Tip)
- No operator fee on tips
- Instant Lightning payment or traditional methods

---

## Legal & Compliance

### Is DonkeyRide legal?

**DonkeyRide is a protocol specification (like HTTP), not a ridesharing service.**

The protocol itself is legal everywhere - it's just event schemas and data formats.

**However, operating a ridesharing service has legal requirements:**
- Background checks for drivers
- Vehicle inspections
- Insurance requirements
- Business licenses
- Tax reporting
- GDPR/CCPA compliance

**Who is responsible?** The **operator**, not the protocol.

### Who is liable if something goes wrong?

**The operator is liable**, just like with Uber/Lyft.

DonkeyRide is a protocol standard (like HTTP) - it doesn't provide insurance, legal protection, or safety services.

**Each operator must:**
- Carry liability insurance
- Comply with local regulations
- Implement safety features
- Handle disputes and arbitration
- Report to authorities as required

### Can DonkeyRide be used for illegal activities?

**The protocol is neutral** - like HTTP, it can be used for legal or illegal purposes.

**Operators are responsible for:**
- Legal compliance in their jurisdiction
- Reporting illegal activity to authorities
- Refusing service for illegal purposes

**DonkeyRide provides tools for compliance:**
- Event Kind 30595: Background Check Verification
- Event Kind 30596: Insurance Verification
- Event Kind 30540: Age Verification
- Event Kind 30562: Harassment Report

See [NIP-XX-ridesharing.md → Appendix A: Regulatory Guidance](./NIP-XX-ridesharing.md).

### What about GDPR and CCPA?

**Fully supported via hybrid privacy model:**

**GDPR Rights:**
- ✅ **Right to Access**: Operators provide full data export API
- ✅ **Right to Deletion**: 30-day deletion SLA for private data
- ✅ **Right to Portability**: Export/import reputation in DonkeyRide format
- ✅ **Right to Rectification**: Update incorrect data via operator

**Data Minimization:**
- Public Nostr relays: Only aggregated reputation (no PII)
- Private operator DB: Detailed data with deletion rights

See [NIP-XX-ridesharing.md → Appendix D: Privacy & Reputation Event Lifecycle](./NIP-XX-ridesharing.md).

---

## Technical Details

### How many event kinds are there?

**82 total** (kinds 30500-30599):

- **Core Events**: 15 (ride lifecycle, payments, stakes)
- **Safety & Emergency**: 6 (panic button, trip sharing, check-ins)
- **Verification**: 5 (background checks, insurance, vehicle)
- **Financial**: 4 (tips, wait time, no-show fees, additional charges)
- **Operational**: 5 (service areas, airport queues, flat rate zones)
- **UX Features**: 8 (preferences, lost & found, split payment, referrals)
- **Compliance**: 3 (age verification, wheelchair cert, fatigue warnings)
- **Advanced**: 36 (scheduled rides, carpooling, surge, delivery, navigation)

See [QUICK-REFERENCE.md](./QUICK-REFERENCE.md) for complete table.

### What is a "replaceable parameterized event"?

**Most DonkeyRide events use NIP-33 (replaceable parameterized events):**

- **Replaceable**: New event replaces old event (not append-only)
- **Parameterized**: Identified by `d` tag (unique identifier)
- **Example**: Driver online status (Kind 30503)
  - New "online" event replaces previous status
  - Only one current status exists per driver

**Why use replaceable events?**
- Prevents spam (only one current value)
- Efficient storage (relays don't keep all history)
- Always get latest state (no need to sort/filter)

### What's the difference between Nostr and Lightning?

**Nostr** (decentralized communication):
- Used for: Discovery, reputation, ride coordination
- Think: Decentralized Twitter/Telegram

**Lightning Network** (Bitcoin payments):
- Used for: Instant ride payments, tips, stakes
- Think: Instant Bitcoin transactions (like Venmo, but decentralized)

**Can I use one without the other?**
- ✅ Yes - DonkeyRide supports multiple payment methods
- ✅ Yes - Operators can skip Nostr (Schema-Compatible mode)

### How does real-time location tracking work?

**Two methods:**

**1. WebSocket (recommended):**
```
Rider App ←→ Operator WebSocket Server ←→ Driver App
(5-10 second updates, instant delivery)
```

**2. Nostr Polling (fallback):**
```
Rider App ←→ Nostr Relays ←→ Driver App
(5-30 second polling, slower but decentralized)
```

See [NIP-XX-ridesharing.md → Appendix F: Real-Time Communication Protocol](./NIP-XX-ridesharing.md).

---

## For Developers

### Can I build a DonkeyRide app?

**Yes!** The protocol is open and free to use.

**You can build:**
- Rider apps (iOS, Android, web)
- Driver apps (iOS, Android, web)
- Operator backends (server infrastructure)
- Analytics tools (monitoring, reporting)
- Alternative UIs (accessibility-focused, etc.)

**No permission needed** - just implement the protocol.

### Are there licensing fees or rate limits?

**No.**

- **License**: MIT (free for commercial use)
- **Rate limits**: None (protocol-level, depends on operator APIs)
- **Patents**: None (public domain protocol)

### Where do I start?

**Three steps:**

1. **Read specification**: [NIP-XX-ridesharing.md](./NIP-XX-ridesharing.md)
2. **Check examples**: See event schemas with JSON examples
3. **Build against test operator**: Set up local test environment

See [QUICK-START.md](./QUICK-START.md) for 5-minute setup guide.

### Can I add custom features?

**Yes - the protocol is extensible:**

**Option 1: Use existing events with custom tags**
```json
{
  "kind": 30500,
  "tags": [
    ["custom_feature", "your_value"]
  ]
}
```

**Option 2: Add new event kinds in your range**
```json
{
  "kind": 40500,
  "content": "Your custom feature"
}
```

**Option 3: Propose additions to protocol**
- Submit pull request to DonkeyRide repository
- Community discussion and review
- Adopted if useful and backward-compatible

### Is there a test network?

**Not yet - coming in v1.1.**

For now, you can:
1. Run local Nostr relay (e.g., strfry, nostream)
2. Use test Lightning wallets (regtest mode)
3. Test operator backend locally (Docker Compose)

See [QUICK-START.md](./QUICK-START.md) for local development setup.

---

## For Operators

### How do I launch a DonkeyRide operator?

**Five steps:**

1. **Choose architecture** (Nostr-Native, Hybrid, or Schema-Compatible)
2. **Build/deploy backend** (Express + Lightning + PostgreSQL recommended)
3. **Build/deploy apps** (Rider + Driver mobile apps)
4. **Legal compliance** (licenses, insurance, background checks)
5. **Launch in single market** (test in one city first)

See [OPERATOR-DEPLOYMENT.md](./OPERATOR-DEPLOYMENT.md) for detailed guide.

### What are the legal requirements?

**Depends on your jurisdiction.**

**Common requirements:**
- Business license for transportation network company (TNC)
- Liability insurance ($1M+ typical)
- Driver background checks (criminal, driving record)
- Vehicle inspections
- Tax reporting (1099 for drivers in US)
- GDPR/CCPA compliance (EU/California)

**Always consult qualified legal counsel** before launching.

See [NIP-XX-ridesharing.md → Appendix A: Regulatory Guidance](./NIP-XX-ridesharing.md) for jurisdiction-specific info (non-normative).

### How much does it cost to operate?

**Rough estimates:**

**Infrastructure:**
- Servers: $500-2,000/month (AWS/GCP)
- Lightning node: $100-500/month (liquidity + hosting)
- Monitoring: $100-300/month (Datadog, Sentry)

**Development:**
- Initial build: $50K-200K (depends on architecture choice)
- Ongoing maintenance: $10K-30K/month (engineers, support)

**Legal/Compliance:**
- Insurance: $50K-200K/year (liability coverage)
- Legal fees: $20K-100K/year (ongoing compliance)
- Background checks: $30-50 per driver

**Marketing:**
- Driver acquisition: $100-500 per driver
- Rider acquisition: $20-100 per rider

### Can I use traditional payment processing instead of Lightning?

**Yes - Lightning is recommended but optional.**

**Alternative payment methods:**
- Credit/debit cards (Stripe, Braintree)
- ACH bank transfers
- Operator-held balance (prepaid accounts)
- Cash (if legal in your jurisdiction)

DonkeyRide focuses on **event schemas**, not payment methods.

### How do I compete with Uber/Lyft?

**Four competitive advantages:**

1. **Lower fees** (0.5% vs 25-30%) - attract drivers
2. **Better driver treatment** (no deplatforming, instant payouts)
3. **Privacy-focused** (minimal data collection, GDPR-friendly)
4. **Local ownership** (keep profits in community, not VC funds)

**Launch strategy:**
- Start in single underserved market (college town, suburb)
- Focus on driver acquisition (lower fees = powerful incentive)
- Build local brand (community-owned alternative to Uber)
- Expand gradually (don't compete head-to-head nationwide)

---

## For Drivers

### How do I sign up as a driver?

**Contact an operator using DonkeyRide:**

DonkeyRide is a protocol, not a platform. Individual operators manage driver onboarding.

**Typical requirements:**
- Valid driver's license
- Vehicle inspection
- Background check
- Insurance verification
- Nostr keypair (for identity)
- Lightning wallet (for payments, optional)

### Can I work for multiple operators at once?

**Yes!** That's a core benefit of DonkeyRide.

**Example:**
- Weekdays: Drive for "Operator A" (0.5% fee)
- Weekends: Drive for "Operator B" (1% fee but better surge)
- Ratings follow you between operators (reputation portability)

See [NIP-XX-ridesharing.md → Appendix G: Cross-Operator Coordination](./NIP-XX-ridesharing.md).

### What if I get deplatformed from an operator?

**You can switch to another operator and keep your reputation.**

**Example:**
1. Operator A bans you (their right as private business)
2. Export your reputation (Event Kind 30521: Reputation Export)
3. Sign up with Operator B
4. Import your reputation (4.8 stars, 1,200 rides)
5. Continue driving with ratings intact

**Note:** Serious safety violations (assault, fraud) may be shared between operators via reputation system.

### How do instant Lightning payouts work?

**Streaming payments during the ride:**

1. Ride starts - rider locks payment in Lightning invoice
2. Every 30 seconds - operator releases portion to driver
3. Ride ends - final payment released automatically
4. Driver receives payment instantly (no withdrawal delays)

**Benefits:**
- ✅ No waiting for weekly payouts (Uber's model)
- ✅ No $0.50-1.50 instant payout fee (Lyft's model)
- ✅ Trustless - rider can't chargeback after ride
- ✅ Free - Lightning has minimal fees (<1 cent)

See [NIP-XX-ridesharing.md → Event Kind 30510: Streaming Payment](./NIP-XX-ridesharing.md).

---

## For Riders

### How do I request a ride?

**Download an app from a DonkeyRide-compatible operator:**

DonkeyRide is the protocol - operators build the apps.

**Look for apps that mention:**
- "Built on DonkeyRide protocol"
- "Supports DonkeyRide reputation export"
- "Nostr-compatible ridesharing"

### Can I use my Uber/Lyft rating on DonkeyRide?

**Not automatically** (Uber/Lyft don't export ratings).

But if Uber/Lyft adopt DonkeyRide schemas for data export, you could import your reputation.

**For now:**
- Start fresh with a DonkeyRide operator
- Build reputation through rides
- Export reputation if switching operators

### How do I switch operators?

**Three steps:**

1. **Export reputation** from current operator (Event Kind 30521)
2. **Sign up** with new operator
3. **Import reputation** (Event Kind 30521)

Your ratings, ride count, and aggregate statistics transfer over.

### Is it safe?

**Same safety features as Uber/Lyft:**

- ✅ Background checks for drivers (Event Kind 30595)
- ✅ Vehicle inspections (Event Kind 30597)
- ✅ Panic button (Event Kind 30559)
- ✅ Trip sharing / Follow My Ride (Event Kind 30560)
- ✅ Safety check-ins (Events 30561-30563)
- ✅ Two-way ratings (driver rates rider, rider rates driver)
- ✅ Insurance verification (Event Kind 30596)

**Additional benefits:**
- Transparent operator policies (open protocol)
- Can choose operators with better safety records
- Harassment reporting (Event Kind 30564)

See [PLATFORM-COMPARISON.md](./PLATFORM-COMPARISON.md) for safety comparison.

### Can I pay with cash or credit card?

**Depends on the operator.**

DonkeyRide protocol supports:
- Lightning Network (instant Bitcoin)
- Traditional payment processing (credit/debit cards)
- Cash (if operator allows)
- Operator-held balance (prepaid accounts)

---

## Additional Questions?

### Where can I learn more?

**Documentation:**
- [NIP-XX-ridesharing.md](./NIP-XX-ridesharing.md) - Complete protocol specification
- [QUICK-REFERENCE.md](./QUICK-REFERENCE.md) - One-page event kind table
- [PLATFORM-COMPARISON.md](./PLATFORM-COMPARISON.md) - Uber vs Lyft vs DonkeyRide
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Federated model explanation
- [QUICK-START.md](./QUICK-START.md) - 5-minute setup guide

**Community:**
- GitHub: https://github.com/donkeyride/donkeyride (submit issues)
- Nostr: `npub1...` (TBD - after NIP submission)

### How can I contribute?

**Ways to help:**

1. **Protocol improvements** - Submit pull requests
2. **Documentation** - Clarify explanations, add examples
3. **Reference implementations** - Build operator backends, mobile apps
4. **Testing** - Report bugs and edge cases
5. **Spread the word** - Tell developers and operators about DonkeyRide

See [README.md → Contributing](./README.md#contributing) for guidelines.

### Is this a VC-backed startup?

**No.** DonkeyRide is an open protocol developed by the community.

There's no company, no funding, no cap table. It's a public good like HTTP or email protocols.

### Will you submit this to Nostr NIP repository?

**Yes - planned for v1.0 launch.**

DonkeyRide will be submitted as **NIP-XX** to the [Nostr NIP repository](https://github.com/nostr-protocol/nips) for community review and adoption.

---

**Questions not answered here?** Open an issue on GitHub or contact via Nostr (after NIP submission).

---

*"The best protocols are the ones everyone can use. Let's build an open future for ridesharing."*
