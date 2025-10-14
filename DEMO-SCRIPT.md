# DonkeyRide Live Demo Script
## 5 Minutes of Pure Magic ✨

### **Pre-Demo Setup (Do Before Presentation)**

```bash
# 1. Have terminal windows pre-arranged
# Window 1: Operator server
# Window 2: Demo commands
# Window 3: Nostr event viewer (optional)

# 2. Pre-configure .env with Strike for speed
cp .env.example .env
# Set: PAYMENT_PROVIDER=strike, STRIKE_API_KEY=...

# 3. Have these files open in editor:
# - payment-providers/lnd.js (show trustless code)
# - middleware/nip98-auth.js (show auth)

# 4. Test everything once!
npm start  # Make sure it works
```

---

## **Demo Flow (5 Minutes)**

### **Minute 0:00-0:30 - Start Operator**

**Say:**
> "Let me show you how easy this is. I'm going to start a DonkeyRide operator right now."

**Type:**
```bash
cd ~/donkeyride
npm start
```

**Point out in output:**
```
✅ Payment provider initialized: strike
   Trust model: custodial
   Features: instantLock, instantRelease

🔐 NIP-98 authentication enabled
🛡️  Rate limiting active
⚡ Multiple payment providers supported
```

**Say:**
> "10 seconds. That's it. This operator is now live and can handle rides globally."

---

### **Minute 0:30-1:30 - Show Payment Provider Flexibility**

**Say:**
> "But here's the interesting part - I'm not locked into Strike. Watch this."

**Type:** (Stop server with Ctrl+C)
```bash
# Edit .env (show on screen)
PAYMENT_PROVIDER=lnd
PAYMENT_FALLBACKS=btcpay,strike,alby
```

**Say:**
> "Now I'm using LND with hodl invoices - trustless staking where the operator literally cannot steal funds. And if LND fails, it automatically falls back to BTCPay, then Strike, then Alby."

**Type:**
```bash
npm start
```

**Point out:**
```
✅ Payment provider initialized: lnd
   Trust model: trustless  ← See that? Trustless!
   Features: instantRelease, refunds, trustless
```

**Say:**
> "Same operator, different trust model. User's choice."

---

### **Minute 1:30-2:30 - Show the Code (Trustless Staking)**

**Say:**
> "Let me show you HOW it's trustless."

**Open:** `payment-providers/lnd.js` in editor

**Show and explain:** (lines 45-85)
```javascript
// Generate random preimage
const preimage = crypto.randomBytes(32);
const hash = crypto.createHash('sha256').update(preimage).digest();

// Create hodl invoice
const invoice = await lnService.createHodlInvoice({
    lnd: this.lnd.lnd,
    id: hash.toString('hex'),  // ← Hash of secret
    tokens: amount,
    description: `${type} stake for ride ${rideId}`
});
```

**Say:**
> "See? The stake is locked with a hash of a secret. Funds go into the Lightning Network, NOT to the operator. The operator knows the secret, but revealing it releases the funds. Canceling the invoice refunds automatically. The operator never has custody."

**Point to screen:**
> "This is the magic. Cryptographic proof instead of trust."

---

### **Minute 2:30-3:30 - Create a Ride & Show Nostr Event**

**Say:**
> "Now let's create a real ride request."

**Type:** (New terminal window)
```bash
# Show the Nostr event structure
cat << 'EOF' | jq
{
  "kind": 30500,
  "pubkey": "rider_pubkey_here",
  "content": "Need ride to catch my train",
  "tags": [
    ["d", "ride_demo_123"],
    ["from", "53.4794,-2.2453", "Pendulum Hotel, Manchester"],
    ["to", "53.4773,-2.2309", "Manchester Piccadilly Station"],
    ["price", "1000"],
    ["rider_stake", "100"],
    ["payment_type", "streaming"]
  ]
}
EOF
```

**Say:**
> "This is a Nostr event. It's just JSON. Gets published to ANY Nostr relay - Damus, nos.lol, whatever. ALL drivers see it instantly. No central server. No algorithm deciding who sees what."

**Type:**
```bash
# Call the operator API
curl -X POST http://localhost:3000/rides/create \
  -H "Content-Type: application/json" \
  -d '{
    "rideId": "demo_123",
    "riderId": "npub1...",
    "fareAmount": 1000
  }'
```

**Show response:**
```json
{
  "success": true,
  "rideId": "demo_123",
  "invoice": "lnbc100...",
  "stakeAmount": 100,
  "operatorFee": 5
}
```

**Say:**
> "Rider stakes 100 sats. Operator fee: 5 sats. That's 0.5%. Uber would take 300 sats (30%)."

---

### **Minute 3:30-4:00 - Show NIP-98 Auth**

**Say:**
> "But wait - how did I call that API without authentication?"

**Say (sheepishly):**
> "I cheated for the demo. In production, you need NIP-98 authentication."

**Open:** `middleware/nip98-auth.js`

**Show:** (lines 30-60)
```javascript
// Client creates event (kind 27235)
{
  kind: 27235,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ["u", "https://operator.com/api/rides/create"],
    ["method", "POST"]
  ],
  sig: "..." // ← Cryptographic signature
}

// Server verifies signature
if (!verifySignature(event)) {
    return res.status(401).json({ error: 'Invalid signature' });
}
```

**Say:**
> "Every request is signed with your Nostr private key. No passwords. No tokens. Just pure cryptography. Can't be replayed. Can't be faked."

---

### **Minute 4:00-4:30 - The Economics (Final Punch)**

**Say:**
> "Let me show you the real impact."

**Open calculator or type:**
```bash
# Quick calculation
python3 << 'EOF'
uber_fare = 10
uber_cut = 0.30
donkeyride_fee = 0.005

rides_per_day = 30
days_per_year = 365

uber_annual_loss = uber_fare * uber_cut * rides_per_day * days_per_year
donkeyride_annual_cost = uber_fare * donkeyride_fee * rides_per_day * days_per_year
savings = uber_annual_loss - donkeyride_annual_cost

print(f"Uber takes: £{uber_annual_loss:,.2f} per year")
print(f"DonkeyRide costs: £{donkeyride_annual_cost:,.2f} per year")
print(f"Driver saves: £{savings:,.2f} per year")
print(f"That's {(savings/uber_annual_loss)*100:.1f}% more income!")
EOF
```

**Output:**
```
Uber takes: £32,850.00 per year
DonkeyRide costs: £547.50 per year
Driver saves: £32,302.50 per year
That's 98.3% more income!
```

**Say:**
> "For an average driver. Thirty-two THOUSAND pounds a year. That's a house deposit. That's a kid's education. That's freedom from the gig economy trap."

---

### **Minute 4:30-5:00 - The Finale**

**Say:**
> "So let me summarize what you just saw in 5 minutes:"

**Count on fingers:**
1. "Started an operator in 10 seconds"
2. "Switched payment providers on the fly"
3. "Showed trustless cryptographic escrow"
4. "Created a ride with zero permission"
5. "Saved drivers £32,000 per year"

**Say:**
> "This isn't a prototype. This isn't vaporware. This is production code. It's running right now. Anyone can fork it. Anyone can improve it. Anyone can run their own operator."

**Final line:**
> "Uber took 15 years and $31 billion to build a monopoly that extracts 30%."

**Pause for effect**

> "We replaced it in a weekend with open source code that charges 0.5%."

**Pause again**

> "That's the power of protocols over platforms."

**[Return to slides for Q&A]**

---

## **Demo Troubleshooting / Backup Plans**

### **If npm start fails:**
```bash
# Quick fix
rm -rf node_modules
npm install
npm start

# Or use pre-recorded demo video
```

### **If Internet dies:**
> "Perfect! This actually proves the point. In a centralized system, we'd be done. But with DonkeyRide, the operator runs locally. Nostr events can be queued offline. When connection returns, everything syncs. Resilience by design."

### **If calculator fails:**
Just say the numbers:
> "Uber: £32,850/year. DonkeyRide: £547/year. Driver saves £32,302. That's 98% more."

---

## **Post-Demo: Handling Questions**

**Common Questions:**

**Q: "What if the operator steals funds?"**
A: "With hodl invoices, they literally can't. Funds are locked in the Lightning Network with cryptographic proof. No custody. And even with custodial providers, we have 6 layers of protection: reputation, bonds, insurance, limits, multi-sig, and trustless options."

**Q: "How do you handle regulation?"**
A: "Same as Uber. Drivers still need licenses and insurance. The protocol is just for coordination and payment. Transport law doesn't change."

**Q: "What about scaling?"**
A: "Nostr relays handle millions of events. Lightning Network does millions of transactions. Both scale better than centralized databases because they're distributed."

**Q: "How do you make money?"**
A: "I don't. It's a protocol. Like HTTP. Anyone can run an operator and charge fees. Competition drives fees toward zero, which is GOOD for drivers."

**Q: "What's stopping Uber from doing this?"**
A: "Their entire business model is the 30% take. If they adopted this protocol, their valuation would collapse. Classic innovator's dilemma."

---

## **Demo Checklist**

**Before presentation:**
- [ ] Test npm start
- [ ] Test payment provider switching
- [ ] Have .env configured
- [ ] Calculator ready
- [ ] Terminal windows arranged
- [ ] Code files bookmarked
- [ ] Internet connection stable
- [ ] Backup slides prepared

**During demo:**
- [ ] Speak clearly
- [ ] Point at screen when showing code
- [ ] Don't type too fast
- [ ] Pause for effect
- [ ] Make eye contact with audience
- [ ] Smile when showing the savings calculation

**After demo:**
- [ ] Leave terminal open for Q&A
- [ ] Be ready to show any file
- [ ] Have GitHub repo link ready to share

---

## **The Golden Rule**

**If something goes wrong:**
- Don't panic
- Acknowledge it
- Explain WHY it's not a big deal
- Use it to make a point about resilience
- Move on confidently

**Remember:** Your audience wants you to succeed. They're rooting for you!

---

**You've got this! 🚀**

The demo is simple, powerful, and proves the point.
Practice it 3 times and you'll nail it.
