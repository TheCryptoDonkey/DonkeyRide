// ==========================================
// STEP 1: NOSTR CONNECTION & SETUP (1 MIN)
// ==========================================
// Paste this to replace the TODO: Initialize Nostr connection

const { SimplePool, getPublicKey, getEventHash, getSignature, generatePrivateKey, relayInit } = window.NostrTools;

// Generate demo keys (live on stage!)
const riderPrivKey = generatePrivateKey();
const riderPubKey = getPublicKey(riderPrivKey);
const driverPrivKey = generatePrivateKey(); 
const driverPubKey = getPublicKey(driverPrivKey);

// Connect to Nostr relay
const relay = relayInit('wss://relay.damus.io');
let isConnected = false;

async function connectToNostr() {
    try {
        await relay.connect();
        isConnected = true;
        updateStatus();
        console.log('✅ Connected to Nostr!');
    } catch (error) {
        console.error('❌ Connection failed:', error);
    }
}

function updateStatus() {
    const riderStatus = document.getElementById('riderStatus');
    const driverStatus = document.getElementById('driverStatus');
    
    if (isConnected) {
        riderStatus.textContent = 'Connected';
        riderStatus.style.background = '#c6f6d5';
        riderStatus.style.color = '#22543d';
        driverStatus.textContent = 'Connected';
        driverStatus.style.background = '#c6f6d5';
        driverStatus.style.color = '#22543d';
    }
}

// Initialize connection
connectToNostr();

// ==========================================
// STEP 2: MAP SETUP (1 MIN) 
// ==========================================
// Paste this to replace TODO: Set up map

const map = L.map('map').setView([53.4808, -2.2426], 14); // Manchester, UK
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// Add markers - Manchester locations
const hotelMarker = L.marker([53.4794, -2.2453])
    .addTo(map)
    .bindPopup('🏨 Pendulum Hotel, Manchester');

const stationMarker = L.marker([53.4773, -2.2309])
    .addTo(map)  
    .bindPopup('🚂 Manchester Piccadilly Station');

const driverMarker = L.marker([53.4838, -2.2446])
    .addTo(map)
    .bindPopup('🚗 Available Driver');

// ==========================================
// STEP 3: RIDE REQUEST EVENT (3 MIN)
// ==========================================
// Paste this to replace TODO: Handle ride requests

document.getElementById('requestRide').addEventListener('click', async () => {
    if (!isConnected) return;
    
    console.log('🚗 Publishing ride request...');
    
    const rideEvent = {
        kind: 30500,  // Custom kind for ride requests
        pubkey: riderPubKey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['from', '53.4794,-2.2453', 'Pendulum Hotel, Manchester'],
            ['to', '53.4773,-2.2309', 'Manchester Piccadilly Station'],  
            ['price', '750']  // About 50 pence worth of sats
        ],
        content: 'Need ride to catch my train!'
    };
    
    // Sign the event
    rideEvent.id = getEventHash(rideEvent);
    rideEvent.sig = getSignature(rideEvent, riderPrivKey);
    
    // Store the request ID for matching acceptances
    currentRideRequest = rideEvent.id;
    
    // Publish to relay
    relay.publish(rideEvent);
    
    console.log('📡 Published:', rideEvent);
    console.log('🔑 Request ID stored:', currentRideRequest);
    
    // Update UI
    document.getElementById('requestRide').textContent = 'Looking for driver...';
    document.getElementById('requestRide').disabled = true;
});

// ==========================================
// STEP 4: DRIVER SUBSCRIPTION (3 MIN)
// ==========================================
// Paste this to replace TODO: Handle driver functionality

let isDriverOnline = false;
let currentRideRequest = null;

document.getElementById('goOnline').addEventListener('click', () => {
    isDriverOnline = !isDriverOnline;
    const btn = document.getElementById('goOnline');
    
    if (isDriverOnline) {
        btn.textContent = 'Go Offline';
        btn.style.background = '#e53e3e';
        subscribeToRides();
        console.log('🚖 Driver online - listening for rides...');
    } else {
        btn.textContent = 'Go Online'; 
        btn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    }
});

function subscribeToRides() {
    const sub = relay.sub([{
        kinds: [30500],  // Ride request events
        since: Math.floor(Date.now() / 1000) - 60
    }]);
    
    sub.on('event', (event) => {
        if (event.pubkey !== driverPubKey) {  // Don't show our own requests
            displayRideRequest(event);
        }
    });
}

function displayRideRequest(event) {
    const fromTag = event.tags.find(tag => tag[0] === 'from');
    const toTag = event.tags.find(tag => tag[0] === 'to'); 
    const priceTag = event.tags.find(tag => tag[0] === 'price');
    
    const requestDiv = document.createElement('div');
    requestDiv.className = 'ride-request';
    requestDiv.innerHTML = `
        <div class="ride-details"><strong>From:</strong> ${fromTag[2]}</div>
        <div class="ride-details"><strong>To:</strong> ${toTag[2]}</div>
        <div class="price">${parseInt(priceTag[1]).toLocaleString()} sats</div>
        <button onclick="acceptRide('${event.id}', '${event.pubkey}')" class="btn accept">
            Accept Ride
        </button>
    `;
    
    document.getElementById('requestsList').appendChild(requestDiv);
    console.log('🔔 New ride request:', event);
}

// ==========================================
// STEP 5: RIDE ACCEPTANCE (2 MIN)
// ==========================================
// Add this function (can be pasted anywhere in script section)

async function acceptRide(requestId, riderPubkey) {
    const lightningAddress = document.getElementById('lightningAddress').value;
    
    const acceptEvent = {
        kind: 30501,  // Ride acceptance
        pubkey: driverPubKey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['e', requestId],  // Reference to ride request
            ['p', riderPubkey], // Rider's pubkey
            ['lightning', lightningAddress]
        ],
        content: `Ride accepted! Pay: ${lightningAddress}`
    };
    
    acceptEvent.id = getEventHash(acceptEvent);
    acceptEvent.sig = getSignature(acceptEvent, driverPrivKey);
    
    relay.publish(acceptEvent);
    
    console.log('✅ Ride accepted:', acceptEvent);
    
    // Clear requests
    document.getElementById('requestsList').innerHTML = 
        '<div style="color: #38a169; font-weight: bold;">🎉 Ride accepted!</div>';
}

// Listen for ride acceptances (add to subscribeToRides function or as separate)
let currentRideRequest = null; // Store the current ride request ID

const acceptSub = relay.sub([{
    kinds: [30501],
    since: Math.floor(Date.now() / 1000) - 60
}]);

acceptSub.on('event', (event) => {
    console.log('📨 Received acceptance event:', event);
    
    const requestTag = event.tags.find(tag => tag[0] === 'e');
    const lightningTag = event.tags.find(tag => tag[0] === 'lightning');
    
    // Check if this acceptance is for our ride request
    if (requestTag && requestTag[1] === currentRideRequest && lightningTag) {
        console.log('✅ Acceptance matches our request!');
        showPayment(lightningTag[1]);
    }
});

// ==========================================
// STEP 6: LIGHTNING PAYMENT (3 MIN) 
// ==========================================
// Paste this to replace TODO: Process payments

function showPayment(lightningAddress) {
    document.getElementById('requestRide').textContent = 'Request Ride';
    document.getElementById('requestRide').disabled = false;
    
    const tripDiv = document.getElementById('riderTrip');
    tripDiv.style.display = 'block';
    tripDiv.innerHTML = `
        <div style="background: #e6fffa; padding: 1rem; border-radius: 10px; text-align: center;">
            <h3>🎉 Ride Accepted!</h3>
            <p style="margin: 0.5rem 0;"><strong>Driver Lightning:</strong> ${lightningAddress}</p>
            <div id="qrContainer" style="margin-top: 1rem;">
                <canvas id="paymentQR"></canvas>
            </div>
            <p style="margin-top: 0.5rem; font-size: 0.875rem;">
                Scan to pay <strong>750 sats</strong> (~£0.50)
            </p>
            <button onclick="payNow('${lightningAddress}')" class="btn" 
                    style="margin-top: 1rem; background: #f59e0b;">
                💰 Pay Now (Demo)
            </button>
        </div>
    `;
    
    // Generate QR code
    generateQR(lightningAddress);
}

function generateQR(lightningAddress) {
    const lightningUrl = `lightning:${lightningAddress}?amount=750`;
    
    new QRious({
        element: document.getElementById('paymentQR'),
        value: lightningUrl,
        size: 200,
        background: 'white',
        foreground: 'black'
    });
}

function payNow(address) {
    alert(`💸 Payment sent to ${address}!\n\nIn a real app, this would open your Lightning wallet.`);
    console.log('💰 Payment completed!');
}

// ==========================================
// DEMO TALKING POINTS FOR EACH STEP
// ==========================================

/*
STEP 1 (Nostr Connection):
- "No API keys, no OAuth, no permission needed"
- "Just generate a keypair and connect"
- "This relay could be anyone's - totally decentralized"

STEP 2 (Map):
- "Using OpenStreetMap - works great in Manchester" 
- "From Pendulum Hotel to Piccadilly Station"
- "Perfect for catching trains after conferences"

STEP 3 (Ride Request):
- "Publishing a Nostr event - kind 30500 for ride requests"
- "Tags contain pickup, destination, price"  
- "Goes to ALL drivers instantly"

STEP 4 (Driver Sub):
- "Driver subscribes to ride request events"
- "No centralized dispatch system"
- "Driver can't be deplatformed"

STEP 5 (Acceptance):
- "Driver publishes acceptance event"
- "References original request"
- "Includes Lightning address for payment"

STEP 6 (Payment):
- "Real Lightning payment - instant settlement"
- "No 2-week wait, no bank, no credit card fees"
- "Driver gets 100% of fare - no 25% commission"

WRAP-UP:
"Uber: $130B valuation, 14 years, massive team
DonkeyRide: 15 minutes, no company needed, better for drivers AND riders"
*/