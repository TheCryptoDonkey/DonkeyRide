# Watchdog & Verifier Incentives

## The Questions

1. **Why would anyone run a watchdog?**
2. **Who watches the watchers (verifiers)?**
3. **How do we prevent false accusations?**
4. **What's the game theory?**

These are critical for system security. Let's solve them.

---

## Part 1: Watchdog Incentives

### The Problem

Watchdogs monitor operators for theft but cost money to run:
- Server costs
- Development time
- Monitoring infrastructure

Without incentives, who runs them?

### Solution A: Bounty System

**Watchdogs earn fees for valid theft reports.**

```javascript
const BOUNTY_STRUCTURE = {
  // Finder's fee for first valid report
  finder_fee: 0.1,  // 10% of stolen amount

  // Paid from:
  sources: [
    'insurance_pool',      // Primary source
    'operator_bond',       // Secondary
    'community_treasury'   // Fallback
  ],

  // Requirements
  requirements: {
    first_reporter: true,        // Must be first to report
    verified: true,              // Must pass 3-of-5 verification
    not_victim: true            // Can't be the victim (they report anyway)
  }
};
```

#### Example

```
Operator steals 1000 sats
Watchdog detects and reports
3-of-5 verifiers confirm

Watchdog earns: 100 sats (10%)
Victim receives: 900 sats from insurance
Operator loses: 2000 sats (bond)

Watchdog profit: 100 sats
Cost to run: ~20 sats/month
ROI: Positive after 1 detection per 5 months
```

#### Implementation

```javascript
class BountySystem {
  async awardBounty(theftReportId) {
    const report = await relay.get(theftReportId);

    // 1. Check if first report for this session
    const sessionId = report.tags.find(t => t[0] === 'session')[1];
    const priorReports = await relay.list([{
      kinds: [30550],
      '#session': [sessionId],
      until: report.created_at - 1
    }]);

    if (priorReports.length > 0) {
      return { bounty: 0, reason: 'not_first_reporter' };
    }

    // 2. Check if verified
    const consensus = await checkVerificationConsensus(theftReportId);
    if (consensus.consensus !== 'verified') {
      return { bounty: 0, reason: 'not_verified' };
    }

    // 3. Calculate bounty
    const stolenAmount = parseInt(report.tags.find(t => t[0] === 'amount')[1]);
    const bounty = Math.floor(stolenAmount * 0.1);

    // 4. Pay bounty
    await this.sendBounty(report.pubkey, bounty);

    // 5. Publish bounty event
    await this.publishBountyAward(theftReportId, bounty);

    return { bounty, paid: true };
  }
}
```

### Solution B: Self-Interest (Users)

**Users run watchdogs to protect their own stakes.**

```javascript
// Rider/driver runs personal watchdog
class PersonalWatchdog {
  constructor(myPubkey) {
    this.myPubkey = myPubkey;
  }

  async monitor() {
    // Only monitor my own stakes
    const mySessions = await relay.list([{
      kinds: [30502],
      '#party': [this.myPubkey]
    }]);

    // Check if released
    for (const session of mySessions) {
      const released = await this.checkReleased(session.session);
      if (!released && this.isOverdue(session)) {
        await this.reportTheft(session);
      }
    }
  }
}
```

**Why this works:**
- Zero cost (run on your phone/laptop)
- Immediate benefit (protects your money)
- Natural distribution (every user monitors their operator)

### Solution C: Operator Competition

**Operators run watchdogs to discredit competitors.**

```javascript
// Operator A watches Operator B
class CompetitorWatchdog {
  constructor(myOperatorPubkey) {
    this.myOperatorPubkey = myOperatorPubkey;
    this.competitors = [];
  }

  async monitorCompetitors() {
    // Watch all other operators
    for (const competitor of this.competitors) {
      const violations = await this.checkOperator(competitor);

      if (violations.length > 0) {
        // Report immediately - damages competitor reputation
        await this.reportViolations(violations);

        // Marketing opportunity
        await this.publishComparison();
      }
    }
  }

  async publishComparison() {
    // "Our operator has 99.9% uptime, competitor X has theft reports"
    // Published to Nostr, drives users to us
  }
}
```

**Why this works:**
- Competitors have incentive to expose bad actors
- Natural market policing
- Operators with best watchdogs = most trustworthy

### Solution D: Protocol Treasury

**Treasury funds public good watchdogs.**

```javascript
const TREASURY_FUNDING = {
  // Treasury earns from:
  sources: [
    'operator_fees',        // 0.01% of all rides
    'donations',           // Community donations
    'grants'               // Bitcoin/Nostr grants
  ],

  // Treasury pays:
  expenses: [
    'watchdog_operations',  // Run 5 public watchdogs
    'verifier_operations',  // Pay 5 verifiers
    'insurance_pool',       // Seed insurance
    'development'           // Protocol development
  ]
};

// Example math:
// 1M rides/year × 1000 sats avg × 0.0001 = 100k sats/year
// Cost to run 5 watchdogs: 50k sats/year
// Sustainable!
```

### Recommended: Hybrid Approach

Use **all four** incentive mechanisms:

```
Layer 1: Self-Interest
→ Every user monitors their own stakes (free)

Layer 2: Competition
→ Operators monitor competitors (free)

Layer 3: Bounties
→ Professional watchdogs earn from reports (paid)

Layer 4: Treasury
→ Public good watchdogs (funded)
```

Result: Multiple overlapping monitoring systems, no single point of failure.

---

## Part 2: Who Watches The Watchers?

### The Problem

Verifiers have power - they decide if theft occurred. What if they:
- Make mistakes?
- Collude with operators?
- Accept bribes?
- Generate false accusations?

### Solution A: Public Accountability

**All verifier votes are on Nostr = fully auditable.**

```javascript
// Anyone can check verifier accuracy
class VerifierAuditor {
  async auditVerifier(verifierPubkey) {
    // Get all their verifications
    const verifications = await relay.list([{
      kinds: [30551],
      authors: [verifierPubkey]
    }]);

    const stats = {
      total: verifications.length,
      verified: 0,
      rejected: 0,
      errors: []
    };

    for (const v of verifications) {
      // Check if their vote matched consensus
      const reportId = v.tags.find(t => t[0] === 'e')[1];
      const consensus = await getConsensus(reportId);
      const theirVote = v.tags.find(t => t[0] === 'verified')[1] === 'true';

      if (consensus === 'verified' && theirVote) {
        stats.verified++;
      } else if (consensus === 'rejected' && !theirVote) {
        stats.rejected++;
      } else {
        stats.errors.push({
          report: reportId,
          theirVote,
          consensus,
          type: 'vote_mismatch'
        });
      }
    }

    // Calculate accuracy
    stats.accuracy = (stats.verified + stats.rejected) / stats.total;

    return stats;
  }
}
```

**Publish verifier scores:**

```javascript
Verifier Leaderboard:
┌─────────────────┬─────────┬───────┬──────────┐
│ Verifier        │ Votes   │ Acc.  │ Trust    │
├─────────────────┼─────────┼───────┼──────────┤
│ verifier1.com   │ 1,234   │ 99.9% │ ⭐⭐⭐⭐⭐    │
│ verifier2.com   │ 856     │ 99.5% │ ⭐⭐⭐⭐⭐    │
│ verifier3.com   │ 234     │ 85.2% │ ⭐⭐       │ ← Suspicious!
│ verifier4.com   │ 1,567   │ 99.8% │ ⭐⭐⭐⭐⭐    │
└─────────────────┴─────────┴───────┴──────────┘
```

Users choose which verifiers to trust based on track record.

### Solution B: Staked Verifiers

**Verifiers stake money. Lose it for false verifications.**

```javascript
class StakedVerifier {
  // Must stake to become verifier
  async registerAsVerifier() {
    const VERIFIER_STAKE = 100000; // 100k sats

    // Lock stake in escrow
    const stakeProof = await lockStake(this.pubkey, VERIFIER_STAKE);

    // Publish verifier registration
    const registration = {
      kind: 30570,
      pubkey: this.pubkey,
      tags: [
        ['verifier_stake', VERIFIER_STAKE.toString()],
        ['stake_proof', stakeProof],
        ['reputation', '100']
      ],
      content: 'Registered as verifier'
    };

    await relay.publish(registration);
  }

  // Stake slashed for errors
  async slashForError(verifierPubkey, errorType) {
    const slashAmount = {
      'false_positive': 10000,  // Wrongly verified theft
      'false_negative': 5000,   // Missed actual theft
      'collusion': 100000        // Full stake
    };

    const amount = slashAmount[errorType];

    // Slash stake
    await this.slashStake(verifierPubkey, amount);

    // Publish slash event
    await this.publishSlash(verifierPubkey, errorType, amount);
  }
}
```

**Game theory:**
- Honest verification → Keep stake + earn fees
- False verification → Lose stake
- Collusion → Lose entire 100k sat stake

**Economic incentive**: Be honest.

### Solution C: Verifier Competition

**Multiple verifier sets. Users choose which to trust.**

```javascript
// User selects their verifier set
const MY_TRUSTED_VERIFIERS = [
  'strike.me',           // I trust Strike
  'river.com',          // I trust River
  'btcpayserver.org',   // I trust BTCPay
  'fiatjaf.com',        // I trust this dev
  'jb55.com'            // I trust this dev
];

// Check if my verifiers agree
async function getMyConsensus(theftReportId) {
  const verifications = await relay.list([{
    kinds: [30551],
    '#e': [theftReportId],
    authors: MY_TRUSTED_VERIFIERS
  }]);

  // Need 3-of-5 of MY verifiers
  const verified = verifications.filter(v =>
    v.tags.find(t => t[0] === 'verified')[1] === 'true'
  );

  return verified.length >= 3 ? 'verified' : 'not_verified';
}
```

**Web of Trust:** Different users trust different verifiers.

- No single verifier set controls everything
- Users can switch verifier sets
- Market decides which verifiers are trustworthy

### Solution D: Verifier-of-Verifiers

**Meta-auditors check verifier accuracy.**

```javascript
class VerifierAuditor {
  // Audits publish accuracy reports
  async publishAudit(verifierPubkey) {
    const accuracy = await this.auditVerifier(verifierPubkey);

    const auditReport = {
      kind: 30571,
      pubkey: this.auditorPubkey,
      tags: [
        ['verifier', verifierPubkey],
        ['total_votes', accuracy.total.toString()],
        ['accuracy', accuracy.accuracy.toString()],
        ['errors', accuracy.errors.length.toString()],
        ['recommendation', accuracy.accuracy > 0.95 ? 'trusted' : 'untrusted']
      ],
      content: JSON.stringify(accuracy.errors)
    };

    await relay.publish(auditReport);
  }
}
```

**Who audits the auditors?**
- Anyone can audit (data is public)
- Community consensus emerges
- Bad actors identified quickly

### Solution E: Slashing for Collusion

**If verifiers collude with operators, their stake is slashed.**

```javascript
// Detect collusion patterns
class CollusionDetector {
  async detectCollusion(verifierPubkey, operatorPubkey) {
    // Get all verifications by this verifier for this operator
    const verifications = await relay.list([{
      kinds: [30551],
      authors: [verifierPubkey],
      '#operator': [operatorPubkey]
    }]);

    // Check if they ALWAYS reject theft claims against this operator
    const rejections = verifications.filter(v =>
      v.tags.find(t => t[0] === 'verified')[1] === 'false'
    );

    // If 100% rejection rate but other verifiers say theft = COLLUSION
    if (rejections.length === verifications.length && verifications.length > 5) {
      // Check consensus from other verifiers
      let otherVerifiersAgree = 0;

      for (const v of verifications) {
        const reportId = v.tags.find(t => t[0] === 'e')[1];
        const otherVerifications = await relay.list([{
          kinds: [30551],
          '#e': [reportId],
          authors: { not: [verifierPubkey] }
        }]);

        const othersVerified = otherVerifications.filter(ov =>
          ov.tags.find(t => t[0] === 'verified')[1] === 'true'
        ).length;

        if (othersVerified >= 3) {
          otherVerifiersAgree++;
        }
      }

      // If other verifiers consistently disagree = collusion detected
      if (otherVerifiersAgree > verifications.length * 0.7) {
        return {
          collusion: true,
          evidence: verifications.map(v => v.id),
          confidence: otherVerifiersAgree / verifications.length
        };
      }
    }

    return { collusion: false };
  }
}
```

If collusion detected:
- Verifier stake slashed 100%
- Removed from verifier set
- Operator also penalized
- Both reputations destroyed

---

## Part 3: Preventing False Accusations

### The Problem

What if someone falsely accuses an honest operator to damage their reputation?

### Solution A: Evidence Requirements

**Reports without evidence are ignored.**

```javascript
class TheftReportValidator {
  async validate(reportEvent) {
    const required = [
      'session',           // Session ID
      'operator',          // Accused operator
      'amount',           // Amount allegedly stolen
      'lock_event',       // Proof stake was locked
      'completion_event', // Proof transaction completed
      'overdue_seconds'   // How long overdue
    ];

    // Check all required tags present
    for (const tag of required) {
      if (!reportEvent.tags.find(t => t[0] === tag)) {
        return { valid: false, reason: `missing_${tag}` };
      }
    }

    // Verify lock event exists
    const lockEventId = reportEvent.tags.find(t => t[0] === 'lock_event')[1];
    const lockEvent = await relay.get(lockEventId);
    if (!lockEvent) {
      return { valid: false, reason: 'lock_event_not_found' };
    }

    // Verify completion event exists
    const completionEventId = reportEvent.tags.find(t => t[0] === 'completion_event')[1];
    const completionEvent = await relay.get(completionEventId);
    if (!completionEvent) {
      return { valid: false, reason: 'completion_event_not_found' };
    }

    // Verify events are signed by correct parties
    if (lockEvent.pubkey !== reportEvent.tags.find(t => t[0] === 'operator')[1]) {
      return { valid: false, reason: 'lock_event_wrong_operator' };
    }

    return { valid: true };
  }
}
```

Invalid reports are automatically rejected before verification.

### Solution B: Verification Consensus

**Need 3-of-5 independent verifiers to confirm.**

One malicious reporter can't damage an operator:
- Report filed
- 5 verifiers check evidence
- Only 1 verifies (the false accuser's colluding verifier)
- 4 reject
- Consensus = "not verified"
- Operator reputation unaffected

### Solution C: Counter-Evidence

**Operators can immediately disprove false accusations.**

```javascript
// Operator publishes counter-evidence
{
  "kind": 30563,
  "pubkey": "<operator-pubkey>",
  "tags": [
    ["e", "<false-report-id>"],
    ["action", "counter_evidence"],
    ["release_event", "<release-event-id>"],
    ["defense", "stake_was_released_on_time"]
  ],
  "content": "False accusation - here is the release event"
}
```

Verifiers check both sides:
- Original report says: "No release event"
- Counter-evidence says: "Here's the release event: [ID]"
- Verifiers fetch release event
- Release event exists and is valid
- Report rejected as false

### Solution D: Penalties for False Reports

**False reporters lose reputation and fees.**

```javascript
// If report is verified as FALSE
async function penalizeFalseReporter(reporterId) {
  // 1. Slash reputation
  const slashEvent = {
    kind: 30560,
    tags: [
      ['p', reporterId],
      ['action', 'reputation_slash'],
      ['reason', 'false_theft_report'],
      ['new_score', '0']
    ]
  };

  await relay.publish(slashEvent);

  // 2. If reporter was a watchdog with stake, slash it
  const watchdogStake = await getWatchdogStake(reporterId);
  if (watchdogStake) {
    await slashStake(reporterId, watchdogStake.amount);
  }

  // 3. Ban from bounties
  await blacklistFromBounties(reporterId);
}
```

**Economic incentive**: Don't file false reports.

---

## The Complete Game Theory

### For Watchdogs

```
Honest monitoring:
+ Earn bounties (100 sats per detection)
+ Build reputation
+ Protect users
- Server costs (20 sats/month)
→ Net positive

False accusations:
+ No benefit (verifiers reject)
- Lose reputation
- Lose stake (if staked)
- Banned from bounties
→ Net negative

Conclusion: Be honest
```

### For Verifiers

```
Honest verification:
+ Earn fees (10 sats per verification)
+ Build reputation
+ Keep stake
- Review time (5 min/verification)
→ Net positive

False verification:
+ Bribe from operator? (risky)
- Lose entire stake (100k sats)
- Reputation destroyed
- Detected by other verifiers
→ Net very negative

Collusion with operator:
+ Share operator theft? (maybe 1k sats)
- Lose 100k sat stake when detected
- Pattern analysis catches collusion
- Criminal charges
→ Net very negative

Conclusion: Be honest
```

### For Operators

```
Honest operation:
+ Earn fees (0.5% of rides)
+ Build reputation
+ Keep bond
+ Get insurance coverage
→ Sustainable business

Stealing stakes:
+ Steal maybe 25k sats
- Lose 50k sat bond
- Insurance covers victims (no gain)
- Reputation destroyed forever
- Criminal charges
- Can never operate again
→ Net very negative

Bribing verifiers:
+ Avoid punishment for theft?
- Multiple verifiers needed (expensive)
- Collusion detected (pattern analysis)
- All verifiers lose stakes
- Still lose more than stolen
→ Net very negative

Conclusion: Be honest
```

---

## Summary: The Incentive Stack

```
Level 1: Self-Interest
→ Users monitor their own stakes (free)

Level 2: Competition
→ Operators monitor competitors (free)

Level 3: Bounties
→ Professional watchdogs earn fees (paid)

Level 4: Public Good
→ Treasury funds watchdogs (sustainable)

Level 5: Staked Verifiers
→ Lose stake for dishonesty (skin in game)

Level 6: Public Accountability
→ All votes on Nostr (auditable)

Level 7: Multiple Verifier Sets
→ Users choose who to trust (decentralized)

Level 8: Counter-Evidence
→ Operators can defend (fair process)

Level 9: Economic Penalties
→ False accusations punished (deterrent)
```

**Result**: A system where honesty is the only profitable strategy.

## Implementation Recommendations

### Phase 1: MVP
```
✓ Self-interest monitoring (users watch their stakes)
✓ Basic bounties (10% of recovered amount)
✓ 5 trusted verifiers (hand-selected, reputation-based)
✓ No stakes yet (trust-based)
```

### Phase 2: Decentralization
```
✓ Add verifier stakes (100k sats required)
✓ Open verification (anyone can become verifier)
✓ Public auditing (accuracy scores published)
✓ Collusion detection
```

### Phase 3: Full Market
```
✓ Multiple verifier sets (web of trust)
✓ Verifier marketplace (compete on accuracy/fees)
✓ Automated slashing (smart contracts)
✓ Meta-auditors (audit the auditors)
```

Start simple, add layers as network grows.

## Conclusion

**Watchdog incentives:** Bounties + self-interest + competition = sufficient monitoring

**Watcher accountability:** Public voting + stakes + multiple verifiers + auditing = honest verification

**The key insight:** Make honesty more profitable than dishonesty at every level.

This isn't theoretical - it's the same game theory that secures Bitcoin. Economic incentives aligned with desired behavior = robust system.
