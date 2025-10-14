# DonkeyRide Staking Mechanism Explained

## The Core Problem
Without a central authority (like Uber), how do we ensure:
1. Riders don't request fake rides?
2. Drivers don't accept then cancel?
3. Both parties complete the transaction?

## The Solution: Commitment Stakes

### 1. Initial Stakes (Before Ride)

#### Rider Stakes (10% of fare)
```javascript
// When requesting a ride for 1000 sats
Rider Balance: 50,000 sats
Stake Required: 100 sats (10%)

// After requesting:
Rider Balance: 49,900 sats
Locked in Escrow: 100 sats
```

#### Driver Stakes (15% of fare)
```javascript
// When accepting a 1000 sat ride
Driver Balance: 100,000 sats  
Stake Required: 150 sats (15%)

// After accepting:
Driver Balance: 99,850 sats
Locked in Escrow: 150 sats
```

### 2. Where Do Stakes Go?

Stakes are held in **Lightning Network HODL invoices** or **2-of-2 multisig contracts**:

```javascript
// Simplified flow
const escrowContract = {
    riderStake: 100,      // Locked until ride completes
    driverStake: 150,     // Locked until ride completes
    conditions: {
        onComplete: "Return both stakes",
        onRiderCancel: "Driver gets rider's stake",
        onDriverCancel: "Rider gets driver's stake"
    }
};
```

### 3. Stake Resolution Scenarios

#### Scenario A: Successful Ride Completion ✅
```javascript
// Ride completes successfully
Rider pays: 1000 sats (via streaming)
Rider gets back: 100 sats (stake returned)
Net cost to rider: 1000 sats

Driver receives: 1000 sats (payment)
Driver gets back: 150 sats (stake returned)
Net earning for driver: 1000 sats
```

#### Scenario B: Driver Cancels ❌
```javascript
// Driver cancels after accepting
Driver loses: 150 sats (entire stake)
Rider receives: 120 sats (80% of driver's stake)
Protocol fee: 30 sats (20% - prevents gaming)

// Final balances:
Rider: Compensated 120 sats + stake back (100) = +220 sats
Driver: Lost 150 sats
```

#### Scenario C: Rider Cancels ❌
```javascript
// Rider cancels after driver accepts
Rider loses: 100 sats (entire stake)
Driver receives: 80 sats (80% of rider's stake)
Protocol fee: 20 sats (20%)

// Final balances:
Rider: Lost 100 sats
Driver: Compensated 80 sats + stake back (150) = +230 sats
```

### 4. Technical Implementation

#### Using Lightning HODL Invoices
```javascript
// Step 1: Create HODL invoice for stakes
const stakeInvoice = {
    amount: 250,  // Total stakes (100 + 150)
    preimage: generateSecret(),
    hash: sha256(preimage),
    timeout: 3600  // 1 hour
};

// Step 2: Both parties pay into HODL invoice
await rider.payInvoice(stakeInvoice, 100);
await driver.payInvoice(stakeInvoice, 150);

// Step 3: On ride completion
if (rideCompleted) {
    releasePreimage(preimage);  // Unlocks funds
    refundStakes(rider, driver);
}

// Step 4: On cancellation
if (driverCancelled) {
    rider.claim(120);  // From driver's stake
    protocolFee.claim(30);
    driver.loses(150);
}
```

#### Using 2-of-2 Multisig (Alternative)
```javascript
// Create multisig address requiring both signatures
const multisigAddress = createMultisig([riderPubkey, driverPubkey]);

// Both fund the multisig
await rider.sendToMultisig(100);
await driver.sendToMultisig(150);

// Resolution requires both signatures OR timeout conditions
const resolutionTx = {
    inputs: [multisigUTXO],
    outputs: [
        {to: rider, amount: 100},  // Rider stake back
        {to: driver, amount: 150}   // Driver stake back
    ],
    signatures: [riderSig, driverSig]
};
```

### 5. Scheduled Rides (Higher Stakes)

For scheduled rides, stakes DOUBLE because reliability is critical:

```javascript
// 5am Airport ride for 2000 sats
Rider stake: 400 sats (20%)
Driver stake: 600 sats (30%)

// If driver no-shows:
Driver loses: 600 sats (stake)
Driver pays: 2000 sats (penalty = full fare)
Total driver loss: 2600 sats

Rider receives: 2400 sats (compensation)
Protocol/insurance: 200 sats
```

### 6. Reputation-Based Stake Adjustment

```javascript
function calculateStake(baseFare, basePercent, reputation) {
    // New user (0 reputation): 2x stake
    // Good user (100 reputation): 0.5x stake
    
    const multiplier = 2.0 - (reputation / 100);
    const stakePercent = basePercent * multiplier;
    return baseFare * (stakePercent / 100);
}

// Examples:
// New driver (0 rep): 1000 * 30% = 300 sats stake
// Veteran (95 rep): 1000 * 8% = 80 sats stake
```

### 7. The Protocol Fee Question

**Where do the 20% of forfeited stakes go?**

Options:
1. **Burn** - Destroyed, creating deflationary pressure
2. **Insurance Pool** - Covers extreme dispute cases
3. **Development Fund** - Supports protocol development
4. **Distributed** - Shared among relay operators

Current implementation: **Insurance Pool**
```javascript
const insurancePool = {
    balance: 0,
    
    collectPenalty: function(amount) {
        this.balance += amount * 0.2;  // 20% of penalties
    },
    
    handleDispute: function(case) {
        if (case.isValid() && this.balance >= case.amount) {
            this.balance -= case.amount;
            return case.resolve();
        }
    }
};
```

### 8. Why This Works

1. **Immediate Consequences**: Bad behavior costs money instantly
2. **Proportional Risk**: Higher value rides = higher stakes
3. **Market-Driven**: No arbitrary bans, just economic reality
4. **Self-Enforcing**: Smart contracts execute automatically
5. **Reputation Matters**: Good actors pay less over time

### 9. Attack Vectors & Defenses

#### Sybil Attacks (Fake Accounts)
- **Defense**: New accounts require 2x stakes
- **Cost**: Attacking becomes economically unfeasible

#### Griefing (Intentional Cancellations)
- **Defense**: Canceller loses more than victim gains
- **Math**: Attacker loses 100%, victim gets 80%

#### Collusion (Rider + Driver Conspire)
- **Defense**: Streaming payments during ride
- **Reality**: Can't fake actual transportation

### 10. Comparison with Traditional Systems

| System | Trust Mechanism | Cost | Resolution Time |
|--------|----------------|------|-----------------|
| Uber | Corporate authority | 25-30% commission | Days/weeks |
| Cash | Physical presence | 0% but risky | Immediate |
| DonkeyRide | Economic stakes | 0% commission | Instant |

### The Beautiful Part

**No one holds these funds long-term**. They're either:
- Returned (successful ride)
- Redistributed (cancellation)
- Never centrally controlled

The protocol doesn't "own" anything. It just defines the rules that Lightning Network or smart contracts execute automatically.

---

## TL;DR

- **Stakes**: Temporary locks ensuring good behavior
- **Location**: Lightning HODL invoices or multisig contracts  
- **Resolution**: Automatic based on ride outcome
- **No middleman**: Protocol defines rules, crypto enforces them
- **Result**: Trust through economics, not corporations