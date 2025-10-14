---
marp: true
theme: default
paginate: true
backgroundColor: #fff
backgroundImage: url('https://marp.app/assets/hero-background.svg')
---

<!--
DonkeyRide Presentation
20 minutes total: 15 min slides + 5 min live demo
Use with Marp: https://marp.app/
-->

# **DonkeyRide**
## The $200 Billion Disruption

### Built in 3 hours on a train
### Uber's complete feature set
### Drivers keep 99-100% of fares

*Press → to continue*

---

# **The Problem**

## Uber's Monopoly Tax

```
Average ride: £10
├─ Driver gets: £7 (70%)
├─ Uber takes: £3 (30%)
└─ Result: Driver loses £12,896/year
```

**30% commission** for what?
- Matching riders and drivers ✅
- Payment processing ✅
- Reputation system ✅

**Can we do this without taking 30%?**

---

# **The Shocking Math**

| Metric | Uber | DonkeyRide |
|--------|------|------------|
| **Build Time** | 15 years | 3 hours |
| **Build Cost** | $31 billion | £0 |
| **Employees** | 32,000 | 0 |
| **Market Cap** | $200 billion | Priceless |
| **Driver Earnings** | 70-75% | 99-100% |
| **Platform Fee** | 25-30% | 0-1% |
| **Can Deplatform** | Yes ✅ | Impossible ❌ |

---

# **The Solution: Protocols > Platforms**

## DonkeyRide = Nostr + Lightning

**Nostr** (decentralized pub/sub)
- Events for ride requests, acceptances, tracking
- Cryptographically signed
- Censorship-resistant

**Lightning Network** (instant payments)
- Streaming micropayments
- No intermediaries
- Zero-knowledge proofs with hodl invoices

---

# **Architecture in 3 Layers**

```
┌────────────────────────────────────┐
│  Nostr Relay Network (Existing)   │  ← Just use Damus, nos.lol
│  Stores/relays all events          │
└────────────────────────────────────┘
          ↑           ↑
          │ Events    │
    ┌─────┴────┐  ┌──┴──────┐
    │  Rider   │  │  Driver │
    └─────┬────┘  └──┬──────┘
          │ Stake    │
          │ API      │
          ↓          ↓
┌────────────────────────────────────┐
│  Operator (Optional)               │  ← Earn 0.5% fees
│  - Stake escrow                    │
│  - Anyone can run                  │
│  - Geographic competition          │
└────────────────────────────────────┘
```

---

# **Event Types: The Complete Protocol**

## 30500-30599 Range (30 events total)

**Core Ride Events**
- 30500: Ride Request
- 30501: Ride Acceptance
- 30510: Streaming Payment
- 30511: Ride Completion
- 30512: Status Updates

**Trust & Enforcement**
- 30550: Theft Report
- 30551: Theft Verification
- 30560: Reputation Slash
- 30561-30562: Guardian Voting

---

# **The Commitment Stakes Problem**

## Why We Need Operators

**Problem:** Someone needs to hold escrow to prevent ghosting

```javascript
Rider commits: 100 sats
Driver commits: 150 sats

If driver cancels → Loses 120 sats to rider
If rider cancels → Loses 80 sats to driver

No-show = Financial penalty = Problem solved
```

**Question:** Who holds the stakes without stealing?

---

# **Trust Mechanisms: 6 Layers of Defense**

| Layer | Mechanism | Effectiveness |
|-------|-----------|---------------|
| 1 | **Reputation** | Social pressure |
| 2 | **Operator Bonds** | 1M sats at risk |
| 3 | **Insurance Pool** | Victims compensated |
| 4 | **Progressive Limits** | New operators = low limits |
| 5 | **Multi-sig** | 3-of-5 guardians |
| 6 | **Trustless Hodl** | **Operator can't steal!** ✨ |

**Layer 6 is the game changer...**

---

# **The Innovation: Payment Provider Choice**

## No More Vendor Lock-in!

**We Built:**
- ✅ Base abstraction layer
- ✅ Automatic fallback support
- ✅ 5 provider implementations
- ✅ Environment-based config

**Before:** Locked to Strike (custodial)
**After:** Choose your trust model!

---

# **5 Payment Providers Comparison**

| Provider | Type | Trustless? | Self-hosted? | Easy? |
|----------|------|------------|--------------|-------|
| **Strike** | Custodial | ❌ | ❌ | ✅✅✅ |
| **Alby** | Custodial | ❌ | ❌ | ✅✅ |
| **BTCPay** | Self-hosted | ⚠️ | ✅ | ⚠️ |
| **LND** | **Hodl Invoice** | ✅ | ⚠️ | ⚠️ |
| **CLN** | **Hodl Invoice** | ✅ | ⚠️ | ⚠️ |

**LND & CLN = Operator physically cannot steal funds!**

---

# **How Hodl Invoices Work**

## Trustless Staking 🔐

```javascript
1. Generate random preimage (secret)
2. Hash it → payment_hash
3. Create Lightning invoice with that hash
4. User pays → Funds locked IN LIGHTNING NETWORK
   (NOT with operator!)
5. On completion: Reveal preimage → Settlement
6. On timeout: Auto-refund after 1 hour
```

**Key insight:** Operator never has custody!
Funds locked in Lightning Network cryptography.

**Even if operator is malicious, they can't steal.**

---

# **Security: NIP-98 Authentication**

## No Passwords. Just Cryptography.

```javascript
// Client creates auth event (kind 27235)
{
  kind: 27235,
  created_at: 1234567890,  // 60 second window
  tags: [
    ["u", "https://operator.com/api/rides/create"],
    ["method", "POST"]
  ],
  content: "",
  pubkey: "npub1...",
  sig: "..." // ← Cryptographic signature
}
```

**Benefits:**
- No passwords to steal
- No sessions to hijack
- Replay attack protection
- Timestamp freshness

---

# **Rate Limiting: Spam Protection**

## 4-Tier Progressive Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| Public (`/info`) | 30 req | 1 min |
| Authenticated | 10 req | 1 min |
| Ride Creation | 5 req | 5 min |
| Stake Operations | 20 req | 1 min |

**Adaptive:** Violators get progressively stricter limits
**Headers:** `X-RateLimit-*` for client awareness

---

# **Configuration: Your Choice**

## Strike (Easy Start)
```bash
PAYMENT_PROVIDER=strike
STRIKE_API_KEY=sk_live_...
```

## LND (Trustless!)
```bash
PAYMENT_PROVIDER=lnd
LND_HOST=localhost:10009
LND_CERT_PATH=~/.lnd/tls.cert
```

## Multi-Provider (Resilient!)
```bash
PAYMENT_PROVIDER=lnd
PAYMENT_FALLBACKS=btcpay,strike,alby
```

**If primary fails → Automatic fallback!**

---

# **The Code**

## Seriously. This is it.

```
payment-providers/
├── base.js         240 lines  ← Interface
├── factory.js      270 lines  ← Factory with fallbacks
├── strike.js       370 lines  ← Strike implementation
├── lnd.js          360 lines  ← Trustless hodl invoices
├── btcpay.js       340 lines  ← Self-hosted
├── alby.js         200 lines  ← User-friendly
└── core-lightning.js 220 lines ← CLN alternative

middleware/
├── nip98-auth.js   260 lines  ← Crypto auth
└── rate-limit.js   220 lines  ← Spam protection
```

**Total: ~2,700 lines**

---

# **What Uber Built in 15 Years**

- 32,000 employees
- $31 billion invested
- 5+ million lines of code
- Proprietary infrastructure
- Legal team
- Regulatory compliance
- Data centers
- 24/7 support

**We replaced it with 2,700 lines of open source code.**

---

# **Let me show you...**

---

<!-- DEMO SLIDE -->
# **🎬 LIVE DEMO**

## 5 Minutes

**I'm going to:**

1. Start an operator (10 seconds)
2. Show payment provider switching
3. Create a ride request (Nostr event)
4. Lock stakes
5. Show trustless hodl invoice
6. Complete & release

**Then we'll calculate what Uber would charge vs DonkeyRide**

*Switching to terminal...*

---

<!-- POST-DEMO SLIDES -->

# **What You Just Saw**

✅ Operator started in 10 seconds
✅ No API keys from Uber
✅ No permission needed
✅ Cryptographically authenticated
✅ Trustless staking (can't steal!)
✅ Instant settlement
✅ 100% to driver

**Uber would have taken £3 from that £10 ride.**
**DonkeyRide took £0.05 (0.5%).**

**That's 60x less!**

---

# **The Economics: Real Numbers**

## Average UK Uber Driver

```
📊 Current Reality (with Uber):
30 rides/day × 365 days = 10,950 rides/year
Average fare: £10
Uber's cut (30%): £3 per ride
Annual loss: £32,850

📈 With DonkeyRide:
Same 10,950 rides
Average fare: £10
Operator fee (0.5%): £0.05 per ride
Annual savings: £32,302

Driver keeps an extra £32,302 per year!
```

---

# **Network Effects**

## What Happens at Scale

**Current:** 5 million Uber drivers globally

**If they all switched:**
- Save $161 billion/year collectively
- Average $32k more per driver
- No single company to deplatform them
- No algorithmic suppression
- No arbitrary rule changes

**The network gets STRONGER as it grows**
Not because of VC money, but because of protocols.

---

# **For Taxi Drivers: You Can Be Your Own Uber**

## Already Have Everything You Need!

✅ PHV/Taxi license (legal to drive passengers)
✅ Commercial insurance (required)
✅ Vehicle (check)

**What you need to add:**
1. Run operator on Raspberry Pi (£35)
2. Keep 100% of fares
3. Never get deplatformed

**Annual savings:** £12,896 (typical UK driver)
**Setup time:** 5 minutes

---

# **The Bigger Picture**

## This Isn't Just About Rides

**Same protocol works for:**
- 🍕 Food delivery (UberEats = 30% fee)
- 📦 Package delivery (similar)
- 🏠 Task marketplace (TaskRabbit)
- 💼 Freelancing (Upwork = 20%)
- 🏨 Accommodation (Airbnb = 15%)

**Any peer-to-peer market with:**
- Commitment stakes
- Reputation
- Payments

**Total addressable market: Hundreds of billions**

---

# **Why This Works: The Protocol Advantage**

## Protocols vs Platforms

**Platforms (Uber):**
- Extract rent (30%)
- Can deplatform
- Control algorithms
- Change rules
- Require permission

**Protocols (DonkeyRide):**
- No rent (0-1%)
- Censorship-resistant
- Transparent
- Immutable
- Permissionless

**HTTP didn't charge websites 30%. Neither should we.**

---

# **Technical Innovation Summary**

**What makes this possible in 2024:**

1. **Nostr** - Decentralized pub/sub (2023)
2. **Lightning** - Instant micropayments (2017)
3. **Hodl Invoices** - Trustless escrow (2020)
4. **NIP-98** - HTTP auth standard (2023)
5. **Modern JS** - WebSockets, async/await

**Standing on the shoulders of giants**

But combining them in this specific way? **Novel.**

---

# **Open Questions / Challenges**

**Bootstrapping:**
- How do you get first 100 drivers?
- How do riders discover operators?

**Regulation:**
- Still need proper licenses/insurance
- Protocol is transport-agnostic

**UX:**
- Need better mobile apps
- Onboarding to Nostr/Lightning

**Scaling:**
- Nostr relay capacity
- Lightning routing

**These are solvable. Uber had all these too.**

---

# **Development Roadmap**

**Phase 1: Complete** ✅
- Payment provider abstraction
- NIP-98 authentication
- Rate limiting
- 5 provider implementations

**Phase 2: Next (2-3 weeks)**
- Reputation service
- Client SDK
- Mobile apps
- Testing infrastructure

**Phase 3: Soon (4-6 weeks)**
- Watchdog automation
- Insurance pool
- Multi-sig bonds
- Privacy features

---

# **How You Can Help**

**Developers:**
- Implement more payment providers
- Build mobile apps (React Native, Flutter)
- Write client SDKs (Python, Rust, Go)
- Create operator monitoring tools

**Drivers:**
- Test the system
- Give feedback
- Spread the word
- Run your own operator

**Operators:**
- Deploy and operate
- Compete on fees (drive to 0%)
- Build reputation

**Investors/VCs:**
- You can't invest. It's a protocol. 🙃

---

# **The Vision**

## A World Where...

- Drivers keep 99% of fares
- Nobody can be deplatformed
- Competition drives fees to zero
- Open source > proprietary
- Protocols > platforms
- Permissionless > gatekeepers

**This is possible TODAY.**

**Not in 5 years. Not when we raise $50M.**

**Right now. With what we've built.**

---

# **Call to Action**

## Next Steps

**Try it:**
```bash
git clone https://github.com/donkeyride/donkeyride
cd donkeyride
npm install
cp .env.example .env
npm start
```

**Join us:**
- GitHub: github.com/donkeyride
- Nostr: Search #donkeyride
- Documentation: See repo

**Build it:**
- Forks welcome
- MIT licensed
- No permission needed

---

# **Final Thought**

## Uber: $200 Billion Company
## DonkeyRide: A Weekend Project

**One extracted $32 billion from drivers.**

**One gives it back.**

**Which future do you want to build?**

---

# **Thank You**

## Questions?

**Contact:**
- Nostr: [Your npub]
- GitHub: @donkeyride
- Email: [Your email]

**Resources:**
- Demo: github.com/donkeyride/donkeyride
- Protocol Spec: NIP-XX-ridesharing.md
- Docs: Full documentation in repo

**Let's build the future of peer-to-peer markets.**

---

<!--
SPEAKER NOTES / TIMING GUIDE

Slide 1-2 (2 min): Hook with the problem
Slide 3-5 (3 min): Solution overview
Slide 6-10 (3 min): Technical deep dive
Slide 11-15 (3 min): Innovations we built
Slide 16-17 (2 min): The code
Slide 18 (2 min): Transition to demo

DEMO (5 min): Live coding

Slide 20-25 (4 min): Impact & economics
Slide 26-30 (3 min): Bigger picture
Slide 31-35 (3 min): Wrap up & CTA

Total: ~25 minutes (buffer for questions)
-->
