// ==========================================
// COMMITMENT STAKES - SOLVING DRIVER CANCELLATIONS
// Drivers stake sats when accepting, forfeit if they cancel
// ==========================================

const STAKE_CONFIG = {
    driverStake: 100,      // Driver stakes 100 sats on acceptance
    riderStake: 50,        // Rider stakes 50 sats on request
    cancellationPenalty: 0.8, // Driver forfeits 80% if they cancel
    noShowPenalty: 1.0,    // Full forfeit for no-show
    graceperiod: 30000,    // 30 seconds to cancel without penalty
};

// Track active commitments
let commitments = new Map();

// ==========================================
// DRIVER ACCEPTS WITH STAKE
// ==========================================

window.acceptRideWithStake = async function(requestId, riderPubkey, rideValue) {
    const lightningAddress = document.getElementById('lightningAddress').value;
    
    // Calculate stake based on ride value
    const stakeAmount = Math.max(100, Math.floor(rideValue * 0.15)); // 15% of fare or 100 sats minimum
    
    const acceptEvent = {
        kind: 30501,
        pubkey: driverPubKey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['e', requestId],
            ['p', riderPubkey],
            ['lightning', lightningAddress],
            ['payment_type', 'streaming'],
            ['stake', stakeAmount.toString()],  // DRIVER COMMITS STAKE
            ['stake_address', 'stake@donkeyride.com'], // Where stake is held
            ['commitment', 'true']
        ],
        content: `Ride accepted! Staked ${stakeAmount} sats. Streaming payments enabled.`
    };
    
    acceptEvent.id = getEventHash(acceptEvent);
    acceptEvent.sig = getSignature(acceptEvent, driverPrivKey);
    
    // Create stake commitment event
    const stakeEvent = {
        kind: 30520, // Stake commitment
        pubkey: driverPubKey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['e', requestId],
            ['amount', stakeAmount.toString()],
            ['type', 'driver_stake'],
            ['status', 'locked'],
            ['expires', (Date.now() + 3600000).toString()] // 1 hour expiry
        ],
        content: `Driver stake: ${stakeAmount} sats locked for ride ${requestId}`
    };
    
    stakeEvent.id = getEventHash(stakeEvent);
    stakeEvent.sig = getSignature(stakeEvent, driverPrivKey);
    
    // Store commitment
    commitments.set(requestId, {
        driver: driverPubKey,
        rider: riderPubkey,
        driverStake: stakeAmount,
        acceptedAt: Date.now(),
        status: 'accepted'
    });
    
    // Publish both events
    relay.publish(acceptEvent);
    relay.publish(stakeEvent);
    
    console.log(`✅ Ride accepted with ${stakeAmount} sats staked!`);
    
    // Update driver UI to show stake
    document.getElementById('requestsList').innerHTML = `
        <div style="background: linear-gradient(135deg, #f59e0b, #d97706); 
                padding: 1rem; border-radius: 10px; color: white; margin-bottom: 1rem;">
            <h4>⚠️ Commitment Active</h4>
            <div style="margin-top: 0.5rem;">
                <div>Staked: <strong>${stakeAmount} sats</strong></div>
                <div style="font-size: 0.75rem; margin-top: 0.5rem; opacity: 0.9;">
                    Complete ride to earn + recover stake<br>
                    Cancel = lose ${Math.floor(stakeAmount * STAKE_CONFIG.cancellationPenalty)} sats
                </div>
            </div>
            <button onclick="cancelWithPenalty('${requestId}')" class="btn" 
                    style="background: rgba(239, 68, 68, 0.8); margin-top: 1rem; font-size: 0.875rem;">
                Cancel (Lose Stake)
            </button>
        </div>
        <div id="driverEarnings" style="background: #48bb78; color: white; 
                padding: 1rem; border-radius: 10px;">
            <h4>💰 Waiting for ride to start...</h4>
        </div>
    `;
}

// ==========================================
// DRIVER CANCELLATION WITH PENALTY
// ==========================================

window.cancelWithPenalty = function(requestId) {
    const commitment = commitments.get(requestId);
    if (!commitment) return;
    
    const timeSinceAccept = Date.now() - commitment.acceptedAt;
    const inGracePeriod = timeSinceAccept < STAKE_CONFIG.graceperiod;
    
    const penaltyAmount = inGracePeriod ? 0 : 
        Math.floor(commitment.driverStake * STAKE_CONFIG.cancellationPenalty);
    
    // Create cancellation event
    const cancelEvent = {
        kind: 30521, // Stake cancellation
        pubkey: driverPubKey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['e', requestId],
            ['action', 'driver_cancel'],
            ['penalty', penaltyAmount.toString()],
            ['refund_to', commitment.rider], // Penalty goes to rider
            ['reason', 'driver_initiated']
        ],
        content: `Driver cancelled. Penalty: ${penaltyAmount} sats to rider`
    };
    
    cancelEvent.id = getEventHash(cancelEvent);
    cancelEvent.sig = getSignature(cancelEvent, driverPrivKey);
    
    relay.publish(cancelEvent);
    
    console.log(`❌ Cancelled ride. Lost ${penaltyAmount} sats`);
    
    // Update UI
    document.getElementById('requestsList').innerHTML = `
        <div style="background: #fed7d7; padding: 1rem; border-radius: 10px; color: #742a2a;">
            <h4>❌ Ride Cancelled</h4>
            <div>Penalty paid: <strong>${penaltyAmount} sats</strong></div>
            <div style="font-size: 0.75rem; margin-top: 0.5rem;">
                ${penaltyAmount > 0 ? 'Penalty sent to rider as compensation' : 'Cancelled within grace period'}
            </div>
        </div>
    `;
    
    commitments.delete(requestId);
}

// ==========================================
// RIDER RECEIVES COMPENSATION
// ==========================================

function listenForCancellations() {
    const cancelSub = relay.sub([{
        kinds: [30521], // Cancellation events
        '#refund_to': [riderPubKey],
        since: Math.floor(Date.now() / 1000) - 60
    }]);
    
    cancelSub.on('event', (event) => {
        const penaltyTag = event.tags.find(tag => tag[0] === 'penalty');
        const reasonTag = event.tags.find(tag => tag[0] === 'reason');
        
        if (penaltyTag && parseInt(penaltyTag[1]) > 0) {
            const penalty = parseInt(penaltyTag[1]);
            
            document.getElementById('riderTrip').innerHTML = `
                <div style="background: #fef3c7; padding: 1rem; border-radius: 10px;">
                    <h4 style="color: #92400e;">⚠️ Driver Cancelled</h4>
                    <div style="margin-top: 0.5rem; color: #78350f;">
                        <div>Compensation received: <strong>${penalty} sats</strong></div>
                        <div style="font-size: 0.875rem; margin-top: 0.5rem;">
                            The driver has been penalized for cancelling your accepted ride.
                        </div>
                    </div>
                    <button onclick="document.getElementById('requestRide').disabled = false; 
                            document.getElementById('requestRide').textContent = 'Request Another Ride'" 
                            class="btn" style="margin-top: 1rem;">
                        Try Again
                    </button>
                </div>
            `;
            
            console.log(`💰 Received ${penalty} sats compensation for cancellation`);
        }
    });
}

// ==========================================
// REPUTATION TRACKING
// ==========================================

const reputationSystem = {
    // Track driver behavior
    trackCancellation(driverPubkey, penaltyPaid) {
        const repEvent = {
            kind: 30530, // Reputation event
            pubkey: riderPubKey,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['p', driverPubkey],
                ['action', 'cancelled_after_accept'],
                ['penalty_paid', penaltyPaid.toString()],
                ['rating', '-1'] // Negative reputation
            ],
            content: 'Driver cancelled after accepting'
        };
        
        repEvent.id = getEventHash(repEvent);
        repEvent.sig = getSignature(repEvent, riderPrivKey);
        
        relay.publish(repEvent);
    },
    
    // Calculate driver score
    async getDriverScore(driverPubkey) {
        const events = await relay.list([{
            kinds: [30530],
            '#p': [driverPubkey],
            limit: 100
        }]);
        
        let score = {
            completed: 0,
            cancelled: 0,
            totalStaked: 0,
            totalForfeited: 0,
            reliability: 100
        };
        
        events.forEach(event => {
            const action = event.tags.find(t => t[0] === 'action');
            const penalty = event.tags.find(t => t[0] === 'penalty_paid');
            
            if (action) {
                if (action[1] === 'completed') score.completed++;
                if (action[1] === 'cancelled_after_accept') {
                    score.cancelled++;
                    if (penalty) score.totalForfeited += parseInt(penalty[1]);
                }
            }
        });
        
        // Calculate reliability percentage
        if (score.completed + score.cancelled > 0) {
            score.reliability = Math.floor(
                (score.completed / (score.completed + score.cancelled)) * 100
            );
        }
        
        return score;
    }
};

// ==========================================
// DISPLAY DRIVER COMMITMENT IN UI
// ==========================================

function displayRideRequestWithStake(event) {
    const fromTag = event.tags.find(tag => tag[0] === 'from');
    const toTag = event.tags.find(tag => tag[0] === 'to');
    const priceTag = event.tags.find(tag => tag[0] === 'price');
    
    const rideValue = parseInt(priceTag[1]);
    const requiredStake = Math.max(100, Math.floor(rideValue * 0.15));
    
    const requestDiv = document.createElement('div');
    requestDiv.className = 'ride-request';
    requestDiv.innerHTML = `
        <div class="ride-details"><strong>From:</strong> ${fromTag[2]}</div>
        <div class="ride-details"><strong>To:</strong> ${toTag[2]}</div>
        <div class="ride-details">
            <span class="price">${rideValue} sats</span>
        </div>
        <div style="background: #fef3c7; padding: 0.5rem; border-radius: 5px; 
                margin: 0.5rem 0; font-size: 0.875rem; color: #92400e;">
            ⚠️ Accepting requires ${requiredStake} sats stake
            <div style="font-size: 0.75rem; margin-top: 0.25rem;">
                Forfeit ${Math.floor(requiredStake * 0.8)} sats if you cancel
            </div>
        </div>
        <button onclick="acceptRideWithStake('${event.id}', '${event.pubkey}', ${rideValue})" 
                class="btn accept">
            Accept & Stake ${requiredStake} sats
        </button>
    `;
    
    document.getElementById('requestsList').appendChild(requestDiv);
}

// ==========================================
// SMART MATCHING BASED ON STAKES
// ==========================================

function smartRideMatching(rides, driverLocation) {
    // Sort rides by profitability considering stakes
    return rides.sort((a, b) => {
        const aValue = parseInt(a.tags.find(t => t[0] === 'price')[1]);
        const bValue = parseInt(b.tags.find(t => t[0] === 'price')[1]);
        
        const aStake = Math.max(100, Math.floor(aValue * 0.15));
        const bStake = Math.max(100, Math.floor(bValue * 0.15));
        
        // Factor in distance (simplified)
        const aDistance = Math.random() * 5; // Mock distance
        const bDistance = Math.random() * 5;
        
        // Calculate profit considering stake risk
        const aProfit = aValue - (aStake * 0.1) - (aDistance * 10);
        const bProfit = bValue - (bStake * 0.1) - (bDistance * 10);
        
        return bProfit - aProfit;
    });
}

// ==========================================
// DEMO TALKING POINTS
// ==========================================

/*
THE PROBLEM:
"How many times has your Uber driver accepted your ride, made you wait, 
then cancelled when a better ride came along? Frustrating, right?"

THE SOLUTION:
"Watch this - when our driver accepts a ride, they stake 100 sats. 
It's like a commitment deposit."

DEMONSTRATION:
"Driver accepts the ride... BAM! 100 sats locked."
"If they complete the ride, they get it back plus earnings."
"But if they cancel... [click cancel] ... 80 sats go to the rider!"

KEY POINTS:
- "Drivers think twice before accepting if they're not committed"
- "Riders get compensated for the inconvenience"
- "Better rides might still be worth cancelling for, but there's a cost"
- "No ratings manipulation - just economic incentives"

ADVANCED FEATURES:
- "Stake scales with ride value - bigger rides, bigger commitment"
- "Grace period for genuine mistakes"
- "Reputation affects required stake amount"
- "Two-way stakes possible - riders stake too for no-shows"

THE BIGGER PICTURE:
"This isn't possible with Uber because Uber controls everything. 
In our system, the protocol enforces fairness through economic incentives, 
not corporate policies that change whenever they want."

"Notice: No customer service needed. No appeals process. No arbitrary 
deactivations. Just code and economic incentives aligned perfectly."
*/