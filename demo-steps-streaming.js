// ==========================================
// STEP 6: STREAMING PAYMENTS (5 MIN) 
// The Future of Micropayments!
// ==========================================

// Replace the old payment system with this streaming approach

// 1. First, modify the acceptance to indicate streaming
window.acceptRide = async function(requestId, riderPubkey) {
    const lightningAddress = document.getElementById('lightningAddress').value;
    
    const acceptEvent = {
        kind: 30501,
        pubkey: driverPubKey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['e', requestId],
            ['p', riderPubkey],
            ['lightning', lightningAddress],
            ['payment_type', 'streaming'],  // NEW: Streaming payments!
            ['rate', '10'],                 // 10 sats per interval
            ['interval', '3']                // Every 3 seconds
        ],
        content: `Ride accepted! Streaming: 10 sats every 3 seconds`
    };
    
    acceptEvent.id = getEventHash(acceptEvent);
    acceptEvent.sig = getSignature(acceptEvent, driverPrivKey);
    
    relay.publish(acceptEvent);
    console.log('✅ Accepted with streaming payments!');
    
    // Show driver is waiting for payments
    document.getElementById('requestsList').innerHTML = 
        '<div style="background: #48bb78; color: white; padding: 1rem; border-radius: 10px;">' +
        '<h4>💰 Waiting for streaming payments...</h4>' +
        '<div id="driverEarnings" style="font-size: 1.5rem; margin-top: 0.5rem;">0 sats</div>' +
        '</div>';
}

// 2. Streaming payment configuration
const STREAMING_CONFIG = {
    baseRate: 10,           // 10 sats per interval
    interval: 3000,         // Every 3 seconds
    maxAmount: 750          // Safety cap
};

let streamingState = {
    active: false,
    totalPaid: 0,
    paymentCount: 0,
    timer: null
};

// 3. Start streaming when ride is accepted
function startStreamingPayments(driverPubkey, lightningAddress) {
    console.log('⚡ STREAMING PAYMENTS STARTED!');
    
    streamingState.active = true;
    streamingState.startTime = Date.now();
    
    // Show streaming UI
    document.getElementById('riderTrip').innerHTML = `
        <div style="background: linear-gradient(135deg, #667eea, #764ba2); 
                color: white; padding: 1.5rem; border-radius: 15px;">
            <h3>⚡ Streaming Payments Active</h3>
            
            <div style="background: rgba(255,255,255,0.2); padding: 1rem; 
                    border-radius: 10px; margin: 1rem 0; text-align: center;">
                <div style="font-size: 2.5rem; font-weight: bold;">
                    <span id="streamTotal">0</span> sats
                </div>
                <div style="font-size: 0.875rem; opacity: 0.9;">
                    Streaming to driver in real-time
                </div>
            </div>
            
            <div id="streamLog" style="background: rgba(0,0,0,0.2); 
                    padding: 0.5rem; border-radius: 8px; font-family: monospace; 
                    font-size: 0.75rem; max-height: 100px; overflow-y: auto;">
                <!-- Payment stream appears here -->
            </div>
            
            <button onclick="stopStreaming()" class="btn" 
                    style="background: #e53e3e; margin-top: 1rem;">
                ⏹️ End Ride
            </button>
        </div>
    `;
    
    // Start the payment stream
    streamingState.timer = setInterval(() => {
        makeStreamingPayment(driverPubkey);
    }, STREAMING_CONFIG.interval);
}

// 4. Stream individual payments
function makeStreamingPayment(driverPubkey) {
    if (!streamingState.active) return;
    
    const payment = STREAMING_CONFIG.baseRate;
    
    // Safety check
    if (streamingState.totalPaid + payment > STREAMING_CONFIG.maxAmount) {
        stopStreaming(true);
        return;
    }
    
    // Create micro-payment event
    const paymentEvent = {
        kind: 30510,  // Streaming payment event
        pubkey: riderPubKey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['p', driverPubkey],
            ['amount', payment.toString()],
            ['payment_num', streamingState.paymentCount.toString()]
        ],
        content: `Stream #${streamingState.paymentCount}: ${payment} sats`
    };
    
    paymentEvent.id = getEventHash(paymentEvent);
    paymentEvent.sig = getSignature(paymentEvent, riderPrivKey);
    
    relay.publish(paymentEvent);
    
    // Update totals
    streamingState.totalPaid += payment;
    streamingState.paymentCount++;
    
    // Update UI
    document.getElementById('streamTotal').textContent = streamingState.totalPaid;
    
    const log = document.getElementById('streamLog');
    log.innerHTML = `<div style="color: #10b981;">⚡ Payment #${streamingState.paymentCount}: +${payment} sats</div>` + log.innerHTML;
    
    console.log(`💸 Streamed payment #${streamingState.paymentCount}: ${payment} sats`);
    
    // Auto-stop after demo duration
    if (streamingState.paymentCount >= 10) {
        stopStreaming(true);
    }
}

// 5. Stop streaming
function stopStreaming(completed = false) {
    clearInterval(streamingState.timer);
    streamingState.active = false;
    
    const message = completed ? 
        '✅ Journey Complete!' : 
        '⏹️ Ride Ended';
    
    document.getElementById('riderTrip').innerHTML = `
        <div style="background: #c6f6d5; padding: 1.5rem; border-radius: 15px;">
            <h3 style="color: #22543d;">${message}</h3>
            <div style="margin-top: 1rem; color: #2d3748;">
                <div>Total Streamed: <strong>${streamingState.totalPaid} sats</strong></div>
                <div>Payments Made: <strong>${streamingState.paymentCount}</strong></div>
                <div>Average: <strong>${Math.floor(streamingState.totalPaid / streamingState.paymentCount)} sats/payment</strong></div>
            </div>
            <div style="margin-top: 1rem; padding: 0.75rem; 
                    background: rgba(0,0,0,0.05); border-radius: 8px; 
                    font-size: 0.875rem; color: #4a5568;">
                💡 <strong>What just happened:</strong><br>
                • You paid ${streamingState.totalPaid} sats across ${streamingState.paymentCount} micro-payments<br>
                • Driver was earning in real-time as they drove<br>
                • No trust needed - payment flowed with service<br>
                • If driver stopped, payments would stop automatically
            </div>
        </div>
    `;
    
    console.log('🏁 Streaming complete!', {
        total: streamingState.totalPaid,
        payments: streamingState.paymentCount
    });
}

// 6. Driver receives streaming payments
const driverStreamSub = relay.sub([{
    kinds: [30510],
    '#p': [driverPubKey],
    since: Math.floor(Date.now() / 1000) - 60
}]);

let driverEarnings = 0;
driverStreamSub.on('event', (event) => {
    const amountTag = event.tags.find(tag => tag[0] === 'amount');
    if (amountTag) {
        const amount = parseInt(amountTag[1]);
        driverEarnings += amount;
        
        // Update driver UI
        if (document.getElementById('driverEarnings')) {
            document.getElementById('driverEarnings').innerHTML = 
                `${driverEarnings} sats<br>` +
                `<span style="font-size: 0.75rem;">⚡ +${amount} sats received!</span>`;
        }
        
        console.log(`💰 Driver received: ${amount} sats (Total: ${driverEarnings})`);
    }
});

// 7. Modify acceptance listener to handle streaming
const acceptanceListener = relay.sub([{
    kinds: [30501],
    since: Math.floor(Date.now() / 1000) - 60
}]);

acceptanceListener.on('event', (event) => {
    const requestTag = event.tags.find(tag => tag[0] === 'e');
    const paymentTypeTag = event.tags.find(tag => tag[0] === 'payment_type');
    const lightningTag = event.tags.find(tag => tag[0] === 'lightning');
    
    if (requestTag && requestTag[1] === currentRideRequest) {
        if (paymentTypeTag && paymentTypeTag[1] === 'streaming') {
            console.log('🎉 Ride accepted with STREAMING payments!');
            startStreamingPayments(event.pubkey, lightningTag[1]);
        }
    }
});

// ==========================================
// DEMO TALKING POINTS FOR STREAMING
// ==========================================

/*
OPENING:
"Here's the problem with traditional ride payments - you pay after 
the ride. What if the driver doesn't complete it? What if the rider 
doesn't pay? Uber solves this by being the middleman."

"But watch this - we're going to stream payments in real-time!"

DURING STREAMING:
"Look at this! Every 3 seconds, 10 sats flow from rider to driver."

"The driver is earning AS THEY DRIVE. Not waiting 2 weeks for Uber 
to pay them. Real-time earnings!"

"If the driver stops driving, payments stop. If the rider stops 
paying, the ride stops. Perfect incentive alignment!"

KEY POINTS:
- "No escrow needed - payment flows with service"
- "No trust required - code enforces fairness"
- "Driver gets paid instantly, continuously"
- "Rider only pays for actual distance traveled"

COMPARISON:
"Uber: Holds your card, charges after, pays driver in 2 weeks, takes 25%"
"DonkeyRide: Streams sats every 3 seconds, driver paid instantly, 0% commission"

CLOSING:
"This is only possible with Lightning. Try doing this with credit cards - 
the fees would be more than the payment! But with Lightning, we can 
stream pennies with near-zero fees."

"The future isn't one big payment at the end. It's thousands of tiny 
payments flowing in real-time. This is the streaming economy!"
*/