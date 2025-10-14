yes, # Operator Misbehavior Detection & Enforcement Protocol

## The Problem

Current spec says:
> "If operator steals funds: reputation destroyed, insurance pays, bond slashed"

But **WHO** detects? **WHO** decides? **HOW** is it enforced?

This document specifies the actual mechanisms.

---

## Theft Detection

### Automatic Detection via Nostr Events

Every stake operation MUST be published to Nostr. Clients watch for violations.

```javascript
// Operator publishes lock event
{
  "kind": 30502,
  "pubkey": "operator_pubkey",
  "tags": [
    ["session", "ride_123"],
    ["action", "locked"],
    ["amount", "250"],
    ["timestamp", "1234567890"]
  ]
}

// 24 hours later, ride completed but no release event...
// → THEFT DETECTED
```

### Watchdog Monitors

Anyone can run a watchdog that monitors operators:

```javascript
class OperatorWatchdog {
  async monitorOperator(operatorPubkey) {
    // Subscribe to all stake events from this operator
    const locks = await sub.getLockEvents(operatorPubkey);
    const releases = await sub.getReleaseEvents(operatorPubkey);

    // Build map of sessions
    const sessions = new Map();

    locks.forEach(lock => {
      sessions.set(lock.sessionId, {
        locked: true,
        lockedAt: lock.timestamp,
        amount: lock.amount,
        released: false
      });
    });

    releases.forEach(release => {
      const session = sessions.get(release.sessionId);
      if (session) {
        session.released = true;
        session.releasedAt = release.timestamp;
      }
    });

    // Find violations
    const now = Date.now() / 1000;
    const violations = [];

    sessions.forEach((session, sessionId) => {
      if (session.locked && !session.released) {
        const ageSeconds = now - session.lockedAt;

        // Grace period: 24 hours
        if (ageSeconds > 86400) {
          violations.push({
            sessionId,
            amount: session.amount,
            overdue: ageSeconds
          });
        }
      }
    });

    return violations;
  }
}
```

### User Detection

Users detect immediately when their stake isn't released:

```javascript
// Ride completed 1 hour ago
const completionTime = Date.now() - 3600000;

// Check if operator released stake
const releases = await relay.list([{
  kinds: [30520],
  authors: [operatorPubkey],
  '#session': [sessionId]
}]);

if (releases.length === 0) {
  // Stake not released - THEFT!
  await fileTheftReport();
}
```

---

## Theft Reporting

### Theft Report Event (Kind 30550)

Anyone can publish a theft report:

```json
{
  "kind": 30550,
  "pubkey": "<reporter-pubkey>",
  "created_at": 1234567890,
  "tags": [
    ["t", "operator_theft"],
    ["operator", "<accused-operator-pubkey>"],
    ["session", "ride_123"],
    ["amount", "250"],
    ["lock_event", "<lock-event-id>"],
    ["completion_event", "<completion-event-id>"],
    ["overdue_seconds", "7200"],
    ["evidence", "ipfs://..."],
    ["reporter_role", "victim|watchdog|observer"]
  ],
  "content": "Operator failed to release 250 sats 2 hours after ride completion"
}
```

### Evidence Requirements

Report MUST include:

1. **Lock event ID** - Proof operator locked stakes
2. **Completion event ID** - Proof transaction completed
3. **No release event** - Absence of release within 24h
4. **Timeline** - Timestamps showing violation

```javascript
class TheftReport {
  async create(sessionId) {
    // Gather evidence
    const lockEvent = await getLockEvent(sessionId);
    const completionEvent = await getCompletionEvent(sessionId);
    const releaseEvents = await getReleaseEvents(sessionId);
    const now = Date.now();

    // Verify theft
    if (releaseEvents.length > 0) {
      throw new Error('Stake was released - no theft');
    }

    if (now - completionEvent.created_at < 86400) {
      throw new Error('Grace period not expired');
    }

    // Package evidence
    const evidence = {
      session_id: sessionId,
      operator: lockEvent.pubkey,
      lock_proof: lockEvent,
      completion_proof: completionEvent,
      release_attempts: releaseEvents,
      overdue_seconds: now - completionEvent.created_at,
      reporter: this.pubkey
    };

    // Store evidence (IPFS or similar)
    const evidenceHash = await storeEvidence(evidence);

    // Publish report
    return this.publishReport(evidence, evidenceHash);
  }
}
```

---

## Verification Process

### Multi-Party Verification

Theft claims are verified by multiple independent parties:

```javascript
// Verification network
const VERIFIERS = [
  'verifier1.com',
  'verifier2.com',
  'verifier3.com',
  'verifier4.com',
  'verifier5.com'
];

class TheftVerifier {
  async verify(theftReportEvent) {
    // 1. Download evidence
    const evidence = await downloadEvidence(
      theftReportEvent.tags.find(t => t[0] === 'evidence')[1]
    );

    // 2. Verify lock event exists
    const lockEvent = await relay.get(evidence.lock_proof.id);
    if (!lockEvent) return { verified: false, reason: 'lock_not_found' };

    // 3. Verify completion event exists
    const completionEvent = await relay.get(evidence.completion_proof.id);
    if (!completionEvent) return { verified: false, reason: 'completion_not_found' };

    // 4. Verify no release event
    const releases = await relay.list([{
      kinds: [30520],
      authors: [evidence.operator],
      '#session': [evidence.session_id]
    }]);

    if (releases.length > 0) {
      return { verified: false, reason: 'stake_was_released' };
    }

    // 5. Verify grace period expired
    const overdueSeconds = Date.now() / 1000 - completionEvent.created_at;
    if (overdueSeconds < 86400) {
      return { verified: false, reason: 'grace_period_not_expired' };
    }

    // 6. Publish verification
    return this.publishVerification(theftReportEvent, true);
  }

  async publishVerification(reportEvent, verified) {
    const verificationEvent = {
      kind: 30551,
      pubkey: this.verifierPubkey,
      tags: [
        ['e', reportEvent.id],
        ['operator', reportEvent.tags.find(t => t[0] === 'operator')[1]],
        ['verified', verified.toString()],
        ['verifier', this.verifierPubkey],
        ['timestamp', Date.now().toString()]
      ],
      content: verified ? 'Theft verified' : 'Theft claim rejected'
    };

    verificationEvent.id = getEventHash(verificationEvent);
    verificationEvent.sig = getSignature(verificationEvent, this.verifierPrivKey);

    await relay.publish(verificationEvent);

    return { verified };
  }
}
```

### Consensus Threshold

Require 3-of-5 verifiers to agree:

```javascript
async function checkVerificationConsensus(theftReportId) {
  // Get all verifications for this report
  const verifications = await relay.list([{
    kinds: [30551],
    '#e': [theftReportId]
  }]);

  // Count verified vs rejected
  let verified = 0;
  let rejected = 0;

  verifications.forEach(v => {
    const result = v.tags.find(t => t[0] === 'verified')[1];
    if (result === 'true') verified++;
    else rejected++;
  });

  // Need 3/5 to verify
  if (verified >= 3) {
    return { consensus: 'verified', votes: { verified, rejected } };
  }

  if (rejected >= 3) {
    return { consensus: 'rejected', votes: { verified, rejected } };
  }

  return { consensus: 'pending', votes: { verified, rejected } };
}
```

---

## Enforcement Mechanisms

### 1. Reputation Slashing (Automatic)

Once 3-of-5 verifiers confirm, reputation automatically destroyed:

```javascript
async function slashReputation(operatorPubkey, theftReportId) {
  // Publish reputation slash event
  const slashEvent = {
    kind: 30560,
    pubkey: 'reputation_oracle',
    tags: [
      ['operator', operatorPubkey],
      ['action', 'reputation_slash'],
      ['reason', 'verified_theft'],
      ['report', theftReportId],
      ['new_score', '0']
    ],
    content: 'Reputation set to 0 due to verified theft'
  };

  // All clients will see this and refuse to use operator
  await relay.publish(slashEvent);
}
```

### 2. Bond Slashing (Multi-Sig)

Operator's bond held in multi-sig, released to victims:

```javascript
class BondSlashing {
  constructor() {
    // Bond held by 5-of-9 federation guardians
    this.guardians = [
      'guardian1_pubkey',
      'guardian2_pubkey',
      // ... 9 total
    ];
    this.threshold = 5;
  }

  async initiateSlashing(operatorPubkey, theftReportId, victimPubkeys, amounts) {
    // 1. Get bond info
    const bond = await getBond(operatorPubkey);
    if (!bond) throw new Error('No bond found');

    // 2. Create slashing transaction
    const slashTx = {
      inputs: [bond.address],
      outputs: victimPubkeys.map((pk, i) => ({
        address: pk,
        amount: amounts[i]
      }))
    };

    // 3. Submit to guardians for signing
    const proposalEvent = {
      kind: 30561,
      tags: [
        ['action', 'bond_slash_proposal'],
        ['operator', operatorPubkey],
        ['report', theftReportId],
        ['bond_amount', bond.amount.toString()],
        ['victims', victimPubkeys.join(',')],
        ['tx', JSON.stringify(slashTx)]
      ],
      content: 'Proposal to slash bond due to verified theft'
    };

    await relay.publish(proposalEvent);

    // 4. Guardians vote
    return this.collectGuardianVotes(proposalEvent.id);
  }

  async collectGuardianVotes(proposalId) {
    // Wait for guardians to sign
    const votes = await relay.list([{
      kinds: [30562],
      '#e': [proposalId]
    }]);

    // Count signatures
    const signatures = votes.filter(v =>
      v.tags.find(t => t[0] === 'vote' && t[1] === 'approve')
    );

    if (signatures.length >= this.threshold) {
      // Execute slashing transaction
      return this.executeSlashing(proposalId, signatures);
    }

    return { status: 'pending', signatures: signatures.length };
  }
}
```

### 3. Insurance Payout (Automated)

Insurance smart contract pays automatically once verified:

```javascript
class InsuranceContract {
  async processClaim(theftReportId) {
    // 1. Verify consensus reached
    const consensus = await checkVerificationConsensus(theftReportId);
    if (consensus.consensus !== 'verified') {
      throw new Error('Theft not verified');
    }

    // 2. Get claim details
    const report = await relay.get(theftReportId);
    const operator = report.tags.find(t => t[0] === 'operator')[1];
    const amount = parseInt(report.tags.find(t => t[0] === 'amount')[1]);
    const victim = report.pubkey;

    // 3. Check operator coverage
    const coverage = this.coverageMap.get(operator);
    if (!coverage) {
      throw new Error('Operator not insured');
    }

    if (amount > coverage.limit) {
      amount = coverage.limit; // Cap at coverage
    }

    // 4. Pay from pool
    if (this.poolBalance >= amount) {
      await this.sendPayment(victim, amount);

      // 5. Remove operator from insurance
      this.coverageMap.delete(operator);

      // 6. Publish payout event
      await this.publishPayout(theftReportId, victim, amount);

      return { paid: true, amount };
    }

    return { paid: false, reason: 'insufficient_pool' };
  }
}
```

---

## Timeline

### Complete Flow

```
Hour 0: Ride completes
Hour 1: User notices stake not released
Hour 1: User files theft report (kind 30550)
Hour 2-6: Verifiers check evidence, publish votes (kind 30551)
Hour 6: 3-of-5 consensus reached → THEFT VERIFIED
Hour 6: Automatic reputation slash (kind 30560)
Hour 6: Insurance claim auto-processed → Victim paid
Hour 7: Bond slashing proposal (kind 30561)
Hour 7-24: Guardians vote (kind 30562)
Hour 24: 5-of-9 signatures → Bond slashed, distributed to victims
```

### Grace Periods

```javascript
const TIMEOUTS = {
  stake_release_grace: 86400,        // 24h - operator must release
  verification_period: 21600,         // 6h - verifiers must vote
  guardian_voting_period: 86400,      // 24h - guardians sign
  appeal_period: 172800,              // 48h - operator can appeal
  insurance_payout: 0                 // Instant once verified
};
```

---

## Operator Defense (Appeals)

Operators can defend against false accusations:

```javascript
// Operator appeal event
{
  "kind": 30563,
  "pubkey": "<operator-pubkey>",
  "tags": [
    ["e", "<theft-report-id>"],
    ["action", "appeal"],
    ["defense", "release_was_published"],
    ["evidence", "<release-event-id>"]
  ],
  "content": "Stake WAS released, here is the event ID"
}
```

### Valid Defenses

1. **Release was published** - Provide release event ID
2. **Double reporting** - Claim already resolved
3. **Grace period not expired** - Timeline dispute
4. **System error** - Technical failure

### Appeal Process

```javascript
async function processAppeal(appealEvent) {
  // 1. Get original report
  const reportId = appealEvent.tags.find(t => t[0] === 'e')[1];
  const report = await relay.get(reportId);

  // 2. Check defense evidence
  const defense = appealEvent.tags.find(t => t[0] === 'defense')[1];

  if (defense === 'release_was_published') {
    const releaseEventId = appealEvent.tags.find(t => t[0] === 'evidence')[1];
    const releaseEvent = await relay.get(releaseEventId);

    if (releaseEvent && releaseEvent.tags.find(t => t[0] === 'session')[1] === report.session) {
      // Valid defense! Release was published
      return { appeal_valid: true, reason: 'release_found' };
    }
  }

  // 3. Submit to verifiers for re-verification
  return reVerify(reportId, appealEvent);
}
```

---

## Client Implementation

### What Clients Should Do

```javascript
class StakeClient {
  async selectOperator(operators) {
    for (const op of operators) {
      // 1. Check for verified theft reports
      const thefts = await relay.list([{
        kinds: [30550],
        '#operator': [op.pubkey]
      }]);

      const verifiedThefts = [];
      for (const theft of thefts) {
        const consensus = await checkVerificationConsensus(theft.id);
        if (consensus.consensus === 'verified') {
          verifiedThefts.push(theft);
        }
      }

      if (verifiedThefts.length > 0) {
        console.log(`Operator ${op.url} has verified theft - SKIP`);
        continue;
      }

      // 2. Check reputation slash events
      const slashes = await relay.list([{
        kinds: [30560],
        '#operator': [op.pubkey]
      }]);

      if (slashes.length > 0) {
        console.log(`Operator ${op.url} reputation slashed - SKIP`);
        continue;
      }

      // 3. Check bond status
      const bond = await getBond(op.pubkey);
      if (!bond || bond.slashed) {
        console.log(`Operator ${op.url} has no valid bond - SKIP`);
        continue;
      }

      // This operator is clean
      return op;
    }

    throw new Error('No trustworthy operators available');
  }
}
```

---

## Governance

### Who Are The Verifiers?

**Option A: Trusted Entities**
- Established companies (Strike, River, etc.)
- Well-known developers
- Reputation tracked on Nostr

**Option B: Staked Validators**
- Anyone can become verifier by staking
- Stake slashed for false verifications
- Economic incentive for honesty

**Option C: Web of Trust**
- Each user selects their trusted verifiers
- Different users may trust different sets
- No central authority

### Who Are The Guardians?

Bond slashing guardians should be:
- Long-term Nostr contributors
- Bitcoin core developers
- Respected community members
- Geographically distributed
- Multi-sig prevents collusion

### How Do They Get Paid?

```javascript
// Verifiers earn fees from insurance pool
const VERIFIER_FEE = 10; // sats per verification

// Guardians earn from operator fees
const GUARDIAN_FEE = 5; // sats per month per operator
```

---

## Summary

### Detection
✅ Automatic via Nostr event monitoring
✅ Anyone can run watchdog
✅ Victims detect immediately

### Reporting
✅ Standardized event format (kind 30550)
✅ Evidence requirements clear
✅ Public and auditable

### Verification
✅ Multi-party (5 verifiers)
✅ Consensus threshold (3-of-5)
✅ Objective criteria

### Enforcement
✅ Reputation: Automatic slash
✅ Insurance: Instant payout
✅ Bonds: Multi-sig guardian vote

### Appeals
✅ Operators can defend
✅ Evidence reviewed
✅ Re-verification possible

### Timeline
✅ 24h grace period
✅ 6h verification
✅ Instant insurance payout
✅ 24h bond slashing

This isn't hand-wavy - it's a complete, implementable protocol with concrete mechanisms, event types, and code examples.

**The key:** Everything is transparent, verifiable, and happens on Nostr. No central authority, no black boxes, no "trust us."
