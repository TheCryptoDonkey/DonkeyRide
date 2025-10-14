// ==========================================
// STREAMING PAYMENTS FOR DONKEYRIDE
// Real-time sats flow as you ride!
// ==========================================

// Payment configuration
const PAYMENT_CONFIG = {
    baseRate: 10,        // 10 sats per interval
    distanceRate: 15,    // 15 sats per 100m
    timeRate: 5,         // 5 sats per 30 seconds
    streamInterval: 3000, // Stream every 3 seconds for demo
    maxRideAmount: 2000  // Safety cap at 2000 sats
};

// Ride state
let rideState = {
    isActive: false,
    startTime: null,
    totalPaid: 0,
    streamingInterval: null,
    currentLocation: null,
    startLocation: null,
    distance: 0,
    invoiceCount: 0
};

// ==========================================
// CORE STREAMING LOGIC
// ==========================================

function startStreamingPayments(driverPubkey, driverLightning) {
    console.log('⚡ Starting streaming payments...');
    
    rideState = {
        isActive: true,
        startTime: Date.now(),
        totalPaid: 0,
        streamingInterval: null,
        currentLocation: [53.4794, -2.2453], // Pendulum Hotel
        startLocation: [53.4794, -2.2453],
        destination: [53.4773, -2.2309], // Piccadilly Station
        distance: 0,
        invoiceCount: 0,
        driverPubkey,
        driverLightning
    };
    
    // Update UI to show streaming started
    showStreamingUI();
    
    // Start the payment stream
    rideState.streamingInterval = setInterval(() => {
        streamPayment();
    }, PAYMENT_CONFIG.streamInterval);
    
    // Simulate movement for demo
    simulateMovement();
}

function streamPayment() {
    if (!rideState.isActive) return;
    
    // Calculate payment for this interval
    const payment = calculateIntervalPayment();
    
    // Safety check - don't exceed max
    if (rideState.totalPaid + payment > PAYMENT_CONFIG.maxRideAmount) {
        console.log('⚠️ Max ride amount reached');
        stopStreamingPayments();
        return;
    }
    
    // Create micro-invoice event
    const microInvoice = {
        kind: 30510, // Streaming payment event
        pubkey: riderPubKey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['p', rideState.driverPubkey],
            ['amount', payment.toString()],
            ['total_paid', (rideState.totalPaid + payment).toString()],
            ['distance', rideState.distance.toFixed(0)],
            ['invoice_num', rideState.invoiceCount.toString()],
            ['streaming', 'true']
        ],
        content: `Stream payment #${rideState.invoiceCount}: ${payment} sats`
    };
    
    microInvoice.id = getEventHash(microInvoice);
    microInvoice.sig = getSignature(microInvoice, riderPrivKey);
    
    // Publish to relay
    relay.publish(microInvoice);
    
    // Update state
    rideState.totalPaid += payment;
    rideState.invoiceCount++;
    
    // Update UI
    updateStreamingUI(payment);
    
    console.log(`💸 Streamed ${payment} sats (Total: ${rideState.totalPaid})`);
}

function calculateIntervalPayment() {
    // Base rate + distance + time
    let payment = PAYMENT_CONFIG.baseRate;
    
    // Add distance component (demo: simulate progress)
    const progressPercent = rideState.invoiceCount * 5; // 5% per payment
    payment += Math.floor(PAYMENT_CONFIG.distanceRate * (progressPercent / 100));
    
    // Add time component
    const rideSeconds = (Date.now() - rideState.startTime) / 1000;
    if (rideSeconds > 30) {
        payment += PAYMENT_CONFIG.timeRate;
    }
    
    return payment;
}

function stopStreamingPayments(completed = true) {
    console.log('⏹️ Stopping payment stream');
    
    if (rideState.streamingInterval) {
        clearInterval(rideState.streamingInterval);
    }
    
    rideState.isActive = false;
    
    // Send completion event
    const completionEvent = {
        kind: 30511, // Stream completion
        pubkey: riderPubKey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['p', rideState.driverPubkey],
            ['total_paid', rideState.totalPaid.toString()],
            ['invoices', rideState.invoiceCount.toString()],
            ['completed', completed.toString()],
            ['duration', ((Date.now() - rideState.startTime) / 1000).toString()]
        ],
        content: completed ? 
            `Ride completed! Streamed ${rideState.totalPaid} sats in ${rideState.invoiceCount} payments` :
            `Ride cancelled. Paid ${rideState.totalPaid} sats for partial journey`
    };
    
    completionEvent.id = getEventHash(completionEvent);
    completionEvent.sig = getSignature(completionEvent, riderPrivKey);
    
    relay.publish(completionEvent);
    
    // Update UI
    showCompletionUI(completed);
}

// ==========================================
// UI COMPONENTS
// ==========================================

function showStreamingUI() {
    document.getElementById('riderTrip').innerHTML = `
        <div id="streamingPanel" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                padding: 1.5rem; border-radius: 15px; color: white;">
            <h3 style="margin-bottom: 1rem;">⚡ Streaming Payments Active</h3>
            
            <div style="background: rgba(255,255,255,0.2); padding: 1rem; border-radius: 10px; margin-bottom: 1rem;">
                <div style="font-size: 2rem; font-weight: bold; text-align: center;">
                    <span id="totalPaid">0</span> sats
                </div>
                <div style="text-align: center; opacity: 0.9; font-size: 0.875rem;">
                    Total Paid
                </div>
            </div>
            
            <div id="paymentStream" style="max-height: 150px; overflow-y: auto; 
                    background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: 8px; 
                    font-family: monospace; font-size: 0.75rem;">
                <!-- Streaming payments will appear here -->
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 1rem;">
                <div style="background: rgba(255,255,255,0.1); padding: 0.5rem; border-radius: 5px;">
                    <div style="font-size: 0.75rem; opacity: 0.8;">Distance</div>
                    <div><span id="distance">0</span>m</div>
                </div>
                <div style="background: rgba(255,255,255,0.1); padding: 0.5rem; border-radius: 5px;">
                    <div style="font-size: 0.75rem; opacity: 0.8;">Time</div>
                    <div><span id="rideTime">0:00</span></div>
                </div>
            </div>
            
            <button onclick="stopStreamingPayments(false)" class="btn" 
                    style="background: rgba(229, 62, 62, 0.9); margin-top: 1rem;">
                ⏹️ End Ride Early
            </button>
        </div>
    `;
}

function updateStreamingUI(payment) {
    // Update total
    document.getElementById('totalPaid').textContent = rideState.totalPaid;
    
    // Add payment to stream
    const streamDiv = document.getElementById('paymentStream');
    const paymentLine = document.createElement('div');
    paymentLine.style.cssText = 'margin: 2px 0; opacity: 0; transition: opacity 0.3s;';
    paymentLine.innerHTML = `⚡ +${payment} sats | Invoice #${rideState.invoiceCount} | ${new Date().toLocaleTimeString()}`;
    
    streamDiv.insertBefore(paymentLine, streamDiv.firstChild);
    
    // Animate in
    setTimeout(() => paymentLine.style.opacity = '1', 10);
    
    // Keep only last 5 payments visible
    while (streamDiv.children.length > 5) {
        streamDiv.removeChild(streamDiv.lastChild);
    }
    
    // Update distance (simulated)
    rideState.distance += 50 + Math.random() * 50;
    document.getElementById('distance').textContent = Math.floor(rideState.distance);
    
    // Update time
    const elapsed = Math.floor((Date.now() - rideState.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    document.getElementById('rideTime').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function showCompletionUI(completed) {
    const panel = completed ? {
        bg: '#c6f6d5',
        title: '✅ Journey Complete!',
        msg: 'You\'ve arrived at Manchester Piccadilly Station'
    } : {
        bg: '#fed7d7',
        title: '⏹️ Ride Ended Early',
        msg: 'You\'ve ended the ride before destination'
    };
    
    document.getElementById('riderTrip').innerHTML = `
        <div style="background: ${panel.bg}; padding: 1.5rem; border-radius: 15px;">
            <h3 style="color: #2d3748; margin-bottom: 1rem;">${panel.title}</h3>
            <p style="color: #4a5568; margin-bottom: 1rem;">${panel.msg}</p>
            
            <div style="background: white; padding: 1rem; border-radius: 10px; margin: 1rem 0;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                    <span>Total Payments:</span>
                    <strong>${rideState.invoiceCount} invoices</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                    <span>Total Paid:</span>
                    <strong>${rideState.totalPaid} sats</strong>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span>Distance:</span>
                    <strong>${Math.floor(rideState.distance)}m</strong>
                </div>
            </div>
            
            <div style="background: rgba(0,0,0,0.05); padding: 0.75rem; border-radius: 8px; 
                    font-size: 0.875rem; color: #4a5568;">
                💡 <strong>How it worked:</strong><br>
                You paid ${rideState.totalPaid} sats across ${rideState.invoiceCount} micro-payments.
                Driver was paid in real-time as they drove. No trust needed!
            </div>
        </div>
    `;
}

// ==========================================
// DRIVER SIDE - RECEIVING STREAMS
// ==========================================

function listenForStreamingPayments() {
    const streamSub = relay.sub([{
        kinds: [30510], // Streaming payment events
        '#p': [driverPubKey],
        since: Math.floor(Date.now() / 1000) - 60
    }]);
    
    streamSub.on('event', (event) => {
        const amountTag = event.tags.find(tag => tag[0] === 'amount');
        const totalTag = event.tags.find(tag => tag[0] === 'total_paid');
        
        if (amountTag && totalTag) {
            updateDriverEarnings(parseInt(amountTag[1]), parseInt(totalTag[1]));
        }
    });
}

function updateDriverEarnings(payment, total) {
    // Update driver panel to show streaming income
    const earningsDiv = document.getElementById('driverEarnings');
    if (!earningsDiv) {
        // Create earnings display
        const requestsList = document.getElementById('requestsList');
        requestsList.innerHTML = `
            <div id="driverEarnings" style="background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); 
                    padding: 1rem; border-radius: 10px; color: white; margin-bottom: 1rem;">
                <h4>💰 Streaming Income</h4>
                <div style="font-size: 1.5rem; font-weight: bold;">
                    <span id="driverTotal">0</span> sats
                </div>
                <div id="driverStream" style="font-size: 0.75rem; opacity: 0.9; margin-top: 0.5rem;">
                    <!-- Payments appear here -->
                </div>
            </div>
        ` + requestsList.innerHTML;
    }
    
    document.getElementById('driverTotal').textContent = total;
    const streamText = document.getElementById('driverStream');
    streamText.textContent = `⚡ +${payment} sats received (Invoice #${Math.floor(total/payment)})`;
}

// ==========================================
// SIMULATION HELPERS
// ==========================================

function simulateMovement() {
    // Animate marker movement on map
    let progress = 0;
    const moveInterval = setInterval(() => {
        if (!rideState.isActive || progress >= 100) {
            clearInterval(moveInterval);
            if (progress >= 100) {
                stopStreamingPayments(true);
            }
            return;
        }
        
        progress += 5;
        // Update map marker position (simplified)
        console.log(`📍 Journey progress: ${progress}%`);
    }, 3000);
}

// ==========================================
// INTEGRATION WITH MAIN FLOW
// ==========================================

// Modified accept ride function for streaming
window.acceptRideWithStreaming = function(requestId, riderPubkey) {
    const lightningAddress = document.getElementById('lightningAddress').value;
    
    const acceptEvent = {
        kind: 30501,
        pubkey: driverPubKey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['e', requestId],
            ['p', riderPubkey],
            ['lightning', lightningAddress],
            ['payment_type', 'streaming'], // Indicate streaming payments
            ['rate', PAYMENT_CONFIG.baseRate.toString()],
            ['interval', (PAYMENT_CONFIG.streamInterval/1000).toString()]
        ],
        content: `Ride accepted! Streaming payments: ${PAYMENT_CONFIG.baseRate} sats every ${PAYMENT_CONFIG.streamInterval/1000}s`
    };
    
    acceptEvent.id = getEventHash(acceptEvent);
    acceptEvent.sig = getSignature(acceptEvent, driverPrivKey);
    
    relay.publish(acceptEvent);
    
    console.log('✅ Ride accepted with streaming payments');
    
    // Update driver UI
    document.getElementById('requestsList').innerHTML = 
        '<div class="success-msg">🎉 Ride accepted! Waiting for streaming payments...</div>';
    
    // Start listening for payments
    listenForStreamingPayments();
}

// ==========================================
// DEMO TALKING POINTS
// ==========================================

/*
STREAMING PAYMENTS PITCH:

"Watch this - instead of paying at the end and hoping the driver 
completes the ride, we stream sats in real-time!"

"Every 3 seconds, a micro-payment flows from rider to driver. 
If the driver stops driving, payments stop. If the rider stops 
paying, the ride stops."

"This is TRUE peer-to-peer commerce. No escrow, no trust, 
just aligned incentives through code."

"The driver is earning IN REAL TIME. Not waiting 2 weeks for 
Uber to pay them. Every second they drive, sats hit their wallet."

"Notice the total? Multiple small invoices instead of one big 
payment. This is the future of micropayments on Lightning."

KEY POINTS:
- No trust needed - payment flows with service
- Driver gets paid immediately
- Rider only pays for distance actually traveled  
- No company holding funds
- Works even if one party disconnects mid-ride

COMPARISON:
"Uber: Hold your credit card, charge after, pay driver in 2 weeks
NostrRide: Stream sats every 3 seconds, driver paid instantly"
*/