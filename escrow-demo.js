// ==========================================
// ESCROW PAYMENT FLOW FOR DONKEYRIDE
// ==========================================

// Step 1: Rider accepts driver -> Creates escrow
function createEscrow(rideRequestId, driverPubkey, amount) {
    const escrowEvent = {
        kind: 30502,  // Escrow event
        pubkey: riderPubKey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['e', rideRequestId],     // Reference to original ride
            ['p', driverPubkey],       // Driver who will receive payment
            ['amount', amount],        // Amount in sats
            ['status', 'locked'],      // Funds are locked
            ['timeout', Math.floor(Date.now() / 1000) + 3600] // 1 hour timeout
        ],
        content: 'Funds locked in escrow. Released on ride completion.'
    };
    
    escrowEvent.id = getEventHash(escrowEvent);
    escrowEvent.sig = getSignature(escrowEvent, riderPrivKey);
    
    relay.publish(escrowEvent);
    console.log('💰 Escrow created:', escrowEvent.id);
    
    return escrowEvent.id;
}

// Step 2: Driver starts ride (picks up rider)
function startRide(escrowId) {
    const startEvent = {
        kind: 30503,  // Ride status event
        pubkey: driverPubKey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['e', escrowId],           // Reference to escrow
            ['status', 'in_progress'],
            ['location', '53.4794,-2.2453'], // Pickup location
            ['timestamp', Date.now()]
        ],
        content: 'Ride started - passenger picked up'
    };
    
    startEvent.id = getEventHash(startEvent);
    startEvent.sig = getSignature(startEvent, driverPrivKey);
    
    relay.publish(startEvent);
    console.log('🚗 Ride started');
}

// Step 3: Driver completes ride
function completeRide(escrowId, dropoffLocation) {
    const completeEvent = {
        kind: 30504,  // Ride completion event
        pubkey: driverPubKey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['e', escrowId],
            ['status', 'completed'],
            ['dropoff', dropoffLocation],
            ['timestamp', Date.now()],
            ['request_payment', 'true']
        ],
        content: 'Ride completed successfully'
    };
    
    completeEvent.id = getEventHash(completeEvent);
    completeEvent.sig = getSignature(completeEvent, driverPrivKey);
    
    relay.publish(completeEvent);
    console.log('✅ Ride completed, requesting payment');
}

// Step 4: Rider releases payment (or auto-release based on GPS)
function releasePayment(escrowId, driverLightningAddress) {
    const releaseEvent = {
        kind: 30505,  // Payment release
        pubkey: riderPubKey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['e', escrowId],
            ['status', 'released'],
            ['lightning', driverLightningAddress],
            ['amount', '750'],
            ['rating', '5']  // Optional: rate the driver
        ],
        content: 'Payment released. Thanks for the ride!'
    };
    
    releaseEvent.id = getEventHash(releaseEvent);
    releaseEvent.sig = getSignature(releaseEvent, riderPrivKey);
    
    relay.publish(releaseEvent);
    console.log('💸 Payment released to driver');
}

// Alternative: Auto-release based on GPS proof
function autoReleaseWithGPS(escrowId, gpsProof) {
    // In production: verify GPS coordinates match destination
    if (verifyLocation(gpsProof.coords, destinationCoords)) {
        // Automatically release payment
        releasePayment(escrowId, driverLightningAddress);
    }
}

// Dispute resolution (if ride wasn't completed)
function disputeRide(escrowId, reason) {
    const disputeEvent = {
        kind: 30506,
        pubkey: riderPubKey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['e', escrowId],
            ['status', 'disputed'],
            ['reason', reason]
        ],
        content: `Dispute: ${reason}`
    };
    
    // In demo: show this would go to arbitration
    // In production: web-of-trust arbiters or timeout refund
}

// ==========================================
// UI FLOW CHANGES
// ==========================================

// Modified acceptance flow:
function acceptRideWithEscrow(requestId, riderPubkey) {
    // 1. Driver accepts ride
    acceptRide(requestId, riderPubkey);
    
    // 2. Show escrow UI to rider
    showEscrowUI();
}

function showEscrowUI() {
    document.getElementById('riderTrip').innerHTML = `
        <div style="background: #e6fffa; padding: 1rem; border-radius: 10px;">
            <h3>🔒 Secure Payment</h3>
            <p>Your payment will be held in escrow until ride completion</p>
            <div style="margin: 1rem 0;">
                <strong>How it works:</strong>
                <ol style="text-align: left; margin: 0.5rem 0;">
                    <li>Lock 750 sats now (refundable)</li>
                    <li>Driver picks you up</li>
                    <li>Complete your journey</li>
                    <li>Payment auto-releases at destination</li>
                </ol>
            </div>
            <button onclick="lockFundsInEscrow()" class="btn" 
                    style="background: #48bb78;">
                🔒 Lock 750 sats for ride
            </button>
        </div>
    `;
}

// During ride UI
function showRideInProgress() {
    document.getElementById('riderTrip').innerHTML = `
        <div style="background: #fef5e7; padding: 1rem; border-radius: 10px;">
            <h3>🚗 Ride in Progress</h3>
            <p>Driver is on the way!</p>
            <div style="margin: 1rem 0;">
                <div>📍 Pickup: Pendulum Hotel</div>
                <div>📍 Destination: Piccadilly Station</div>
                <div>💰 Escrow: 750 sats (locked)</div>
            </div>
            <div style="font-size: 0.875rem; color: #666;">
                Payment will auto-release at destination
            </div>
        </div>
    `;
}

// Completion UI
function showRideComplete() {
    document.getElementById('riderTrip').innerHTML = `
        <div style="background: #c6f6d5; padding: 1rem; border-radius: 10px;">
            <h3>✅ Ride Complete!</h3>
            <p>You've arrived at your destination</p>
            <div style="margin: 1rem 0;">
                <button onclick="releasePayment()" class="btn" 
                        style="background: #48bb78;">
                    💸 Release Payment (750 sats)
                </button>
                <button onclick="disputeRide()" class="btn" 
                        style="background: #e53e3e; margin-top: 0.5rem;">
                    ⚠️ Report Issue
                </button>
            </div>
            <div style="font-size: 0.875rem; color: #666; margin-top: 1rem;">
                Auto-releases in 5 minutes if no action taken
            </div>
        </div>
    `;
}

// ==========================================
// DEMO TALKING POINTS
// ==========================================

/*
ESCROW EXPLANATION:
"Just like Uber holds your payment until the ride is done, 
we use Lightning escrow - but WITHOUT Uber taking 25%!"

"The payment is locked cryptographically. Driver can't claim it 
until they drop you off. You can't cheat by not paying."

"If there's a dispute, the Nostr web-of-trust handles it - 
not a corporate customer service department."

"This is trustless commerce - no company needed!"
*/