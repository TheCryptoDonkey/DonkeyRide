/**
 * DonkeyRide MVP - Rider App
 *
 * Simple UI for requesting and tracking rides
 */

// Configuration
const API_URL = window.location.origin;
const WS_URL = `ws://${window.location.hostname}:3001`;

// Nostr demo keys (persist per browser for consistent identity)
const {
  generatePrivateKey,
  getPublicKey: nostrGetPublicKey,
  getEventHash,
  getSignature,
  nip19,
  utils
} = window.NostrTools || {};
const bytesToHex = utils?.bytesToHex;
const hexToBytes = utils?.hexToBytes;

if (!window.NostrTools) {
  console.warn('nostr-tools not loaded - NIP-98 signing unavailable');
}

const DEMO_PRIV_HEX = 'f4b31f1248bfa5e603a1c1d73c6f9d1286f5fb7c1d3aa4c9bd4a62d2a6a4a2f1'; // 32 bytes demo key
let storedPrivKey = window.localStorage.getItem('donkeyride.riderPrivKey');

if (!storedPrivKey) {
  if (generatePrivateKey && bytesToHex) {
    const raw = generatePrivateKey();
    storedPrivKey = typeof raw === 'string' ? raw : bytesToHex(raw);
  } else if (typeof crypto !== 'undefined' && crypto.getRandomValues && bytesToHex) {
    const raw = new Uint8Array(32);
    crypto.getRandomValues(raw);
    storedPrivKey = bytesToHex(raw);
  } else {
    storedPrivKey = DEMO_PRIV_HEX;
  }
  window.localStorage.setItem('donkeyride.riderPrivKey', storedPrivKey);
}

let riderPrivKey = storedPrivKey || DEMO_PRIV_HEX;
let riderPubKey = null;
let riderPrivBytes = null;
const ensurePrivBytes = (hexKey) => {
  if (hexToBytes) {
    return hexToBytes(hexKey);
  }
  const matches = hexKey.match(/.{1,2}/g) || [];
  return new Uint8Array(matches.map(byte => parseInt(byte, 16)));
};

try {
  if (nostrGetPublicKey) {
    riderPrivBytes = ensurePrivBytes(riderPrivKey);
    riderPubKey = nostrGetPublicKey(riderPrivBytes);
  }
} catch (err) {
  console.warn('Failed to derive pubkey, falling back to demo key:', err);
  storedPrivKey = DEMO_PRIV_HEX;
  window.localStorage.setItem('donkeyride.riderPrivKey', storedPrivKey);
  if (nostrGetPublicKey) {
    riderPrivBytes = ensurePrivBytes(storedPrivKey);
    riderPubKey = nostrGetPublicKey(riderPrivBytes);
  }
}

if (!riderPubKey && nostrGetPublicKey) {
  riderPrivKey = DEMO_PRIV_HEX;
  riderPrivBytes = ensurePrivBytes(riderPrivKey);
  riderPubKey = nostrGetPublicKey(riderPrivBytes);
  window.localStorage.setItem('donkeyride.riderPrivKey', DEMO_PRIV_HEX);
}

const riderNpub = riderPrivKey && nostrGetPublicKey
  ? (riderPubKey && nip19 ? nip19.npubEncode(riderPubKey) : null)
  : 'npub1demo0kqz9sc8d0c8dfzhh7l6kdfl8c8v0krls28m3uwg5k6nvqusyzd0g6';
console.log('[DonkeyRide] Rider key', riderPrivKey, riderPubKey, riderNpub);

// State
let map;
let ws;
let pickup = null;
let dropoff = null;
let pickupMarker = null;
let dropoffMarker = null;
let driverMarker = null;
let routeLine = null;
let driverRouteLine = null;  // Route from driver to pickup
let currentRide = null;
let currentEstimate = null;
let riderStakeState = null;

const stakePanelEl = document.getElementById('stake-panel');
const stakeAmountEl = document.getElementById('stake-amount');
const stakeInvoiceEl = document.getElementById('stake-invoice');
const stakeRiderShareEl = document.getElementById('stake-rider-share');
const stakeOperatorShareEl = document.getElementById('stake-operator-share');
const stakePaidBtn = document.getElementById('stake-paid-btn');
const stakeCancelBtn = document.getElementById('stake-cancel-btn');

function generateRideId() {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `ride_${Date.now().toString(36)}_${randomPart}`;
}

function buildNip98Header(url, method) {
  if (!riderPrivKey || !riderPubKey || !window.NostrTools) {
    throw new Error('NIP-98 signing unavailable - nostr-tools not loaded');
  }

  const event = {
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', url],
      ['method', method.toUpperCase()]
    ],
    content: '',
    pubkey: riderPubKey
  };

  let signed;
  try {
    const id = getEventHash(event);
    const sig = getSignature(event, riderPrivKey);
    signed = { ...event, id, sig };
    console.debug('[DonkeyRide] NIP-98 signed event', signed);
  } catch (err) {
    console.error('Failed to finalize NIP-98 event', err);
    throw err;
  }

  const encoded = window.btoa(JSON.stringify(signed));
  return `Nostr ${encoded}`;
}

async function createRideSession(rideId, fareSats) {
  const path = '/rides/create';
  const absoluteUrl = `${window.location.protocol}//${window.location.host}${path}`;
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');

  if (riderPrivKey && riderPubKey) {
    try {
      headers.set('Authorization', buildNip98Header(absoluteUrl, 'POST'));
    } catch (err) {
      console.error('Failed to build NIP-98 header', err);
      throw err;
    }
  }

  if (!headers.has('Authorization')) {
    console.error('[DonkeyRide] Authorization header missing despite signing attempt', {
      privKeyPresent: !!riderPrivKey,
      pubKeyPresent: !!riderPubKey,
      nostrTools: !!window.NostrTools
    });
    throw new Error('Unable to sign stake request (NIP-98 header missing)');
  }

  const response = await fetch(path, {
    method: 'POST',
    headers,
    credentials: 'same-origin',
    body: JSON.stringify({
      rideId,
      riderId: riderPubKey || riderNpub,
      fareAmount: fareSats
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.error('[DonkeyRide] Stake request rejected', err, response.status);
    throw new Error(err.error || err.details || response.statusText);
  }

  const data = await response.json();
  return data;
}

function showStakePanel(session, estimate) {
  if (!stakePanelEl) {
    return;
  }

  stakePanelEl.classList.remove('hidden');
  stakeAmountEl.textContent = `${session.stakeAmount.toLocaleString()} sats`;
  stakeInvoiceEl.textContent = session.invoice;
  stakeRiderShareEl.textContent = `${session.stakeAmount.toLocaleString()} sats`;
  const operatorFiat = estimate?.operatorFee?.formatted || '';
  stakeOperatorShareEl.textContent = operatorFiat || `${session.operatorFee?.toLocaleString?.() || 0} sats`;
}

function hideStakePanel() {
  if (stakePanelEl) {
    stakePanelEl.classList.add('hidden');
  }
}

async function fetchTripEstimate() {
  const response = await fetch('/api/trips/estimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pickup_lat: pickup.lat,
      pickup_lon: pickup.lon,
      dropoff_lat: dropoff.lat,
      dropoff_lon: dropoff.lon,
      currency: 'USD'
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || response.statusText);
  }

  return response.json();
}

async function confirmStakePayment() {
  if (!currentRide || !currentRide.id) {
    return;
  }

  try {
    if (stakePaidBtn) {
      stakePaidBtn.disabled = true;
      stakePaidBtn.textContent = 'Verifying payment...';
    }
    updateStatus('Locking rider stake...', 'waiting');

    const response = await fetch(`/rides/${currentRide.id}/rider-stake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentProof: 'demo_proof' })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || response.statusText);
    }

    await submitRideRequest();
  } catch (error) {
    console.error('Stake lock failed', error);
    updateStatus(`Failed to lock stake: ${error.message}`, 'error');
    if (stakePaidBtn) {
      stakePaidBtn.disabled = false;
      stakePaidBtn.textContent = '✅ I’ve paid the stake';
    }
  }
}

function cancelStakeFlow() {
  updateStatus('Ride cancelled before stake payment.', 'info');
  resetRide();
}

async function submitRideRequest() {
  if (!pickup || !dropoff || !currentRide) {
    return;
  }

  try {
    updateStatus('Stake locked. Finding drivers...', 'waiting');

    const response = await fetch('/api/rides/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickup_lat: pickup.lat,
        pickup_lon: pickup.lon,
        dropoff_lat: dropoff.lat,
        dropoff_lon: dropoff.lon,
        rider_npub: riderNpub,
        ride_id: currentRide.id,
        fare_sats: currentRide.estimate?.fare?.sats
      })
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to broadcast ride');
    }

    currentRide.stage = 'searching';
    currentRide.status = data.status;
    currentRide.distance = parseFloat(data.distance_km);
    currentRide.route = data.route;
    currentRide.estimate = data.estimate || currentRide.estimate;
    currentRide.fare = currentRide.estimate?.fare?.sats;
    currentRide.fareCost = currentRide.estimate?.fare?.formatted;

    hideStakePanel();

    if (data.route && data.route.length > 0) {
      drawRoute(data.route);
    }

    connectWebSocket(data.ride_id);
    showRideInfo();
    updateStatus(`Ride requested! Notified ${data.drivers_notified} drivers...`, 'waiting');
    const btn = document.getElementById('request-btn');
    if (btn) {
      btn.innerHTML = 'Ride Requested';
    }
  } catch (error) {
    console.error('Error submitting ride request', error);
    updateStatus(`Failed to request ride: ${error.message}`, 'error');
    if (stakePaidBtn) {
      stakePaidBtn.disabled = false;
      stakePaidBtn.textContent = '✅ I’ve paid the stake';
    }
  }
}
// Map setup
function initMap() {
  // Create map centered on London
  map = L.map('map').setView([51.5074, -0.1278], 14);

  // Add tile layer
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);

  // Click handler for setting locations
  map.on('click', handleMapClick);

  // Load and show online drivers
  loadDrivers();
  setInterval(loadDrivers, 5000);
}

// Handle map clicks
function handleMapClick(e) {
  if (currentRide) {
    return; // Ignore clicks during active ride
  }

  const { lat, lng } = e.latlng;

  if (!pickup) {
    // Set pickup
    pickup = { lat, lon: lng };

    if (pickupMarker) {
      map.removeLayer(pickupMarker);
    }

    pickupMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'marker-icon pickup-marker',
        html: '📍',
        iconSize: [30, 30]
      })
    }).addTo(map);

    updateStatus('Now click on the map to set dropoff location', 'info');
    updateLocationDisplay();

  } else if (!dropoff) {
    // Set dropoff
    dropoff = { lat, lon: lng };

    if (dropoffMarker) {
      map.removeLayer(dropoffMarker);
    }

    dropoffMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'marker-icon dropoff-marker',
        html: '🎯',
        iconSize: [30, 30]
      })
    }).addTo(map);

    // Enable request button
    document.getElementById('request-btn').disabled = false;
    updateLocationDisplay();

    // Preview the route
    previewRoute();
  }
}

// Preview route when dropoff is selected
async function previewRoute() {
  if (!pickup || !dropoff) {
    return;
  }

  updateStatus('Calculating route...', 'info');

  try {
    const response = await fetch('/api/routes/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_lat: pickup.lat,
        from_lon: pickup.lon,
        to_lat: dropoff.lat,
        to_lon: dropoff.lon
      })
    });

    const data = await response.json();

    if (data.success && data.route && data.route.length > 0) {
      // Draw the OSRM route
      drawRoute(data.route);
      updateStatus(`Ready to request ride! Route: ${data.distance_km.toFixed(1)}km, ~${data.duration_minutes} min`, 'success');
      console.log(`Route preview: ${data.distance_km.toFixed(1)}km, ${data.duration_minutes} min, ${data.points} points`);
    } else {
      // Fallback to straight line if OSRM not available
      drawStraightLine();
      updateStatus('Ready to request ride!', 'success');
    }

  } catch (error) {
    console.error('Error previewing route:', error);
    // Fallback to straight line
    drawStraightLine();
    updateStatus('Ready to request ride!', 'success');
  }
}

// Draw straight line fallback
function drawStraightLine() {
  if (!pickup || !dropoff) {
    return;
  }

  if (routeLine) {
    map.removeLayer(routeLine);
  }

  routeLine = L.polyline([
    [pickup.lat, pickup.lon],
    [dropoff.lat, dropoff.lon]
  ], {
    color: '#2196f3',
    weight: 3,
    opacity: 0.7,
    dashArray: '10, 10'
  }).addTo(map);

  // Fit map to show both markers
  map.fitBounds([
    [pickup.lat, pickup.lon],
    [dropoff.lat, dropoff.lon]
  ], { padding: [50, 50] });
}

// Draw OSRM route on map
function drawRoute(routeCoordinates) {
  if (routeLine) {
    map.removeLayer(routeLine);
  }

  // Convert OSRM coordinates [lon, lat] to Leaflet format [lat, lon]
  const latLngPoints = routeCoordinates.map(coord => [coord[1], coord[0]]);

  routeLine = L.polyline(latLngPoints, {
    color: '#2196f3',
    weight: 4,
    opacity: 0.8
  }).addTo(map);

  // Fit map to show the route
  map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
}

// Update location display
function updateLocationDisplay() {
  const locationsDiv = document.getElementById('locations');
  const pickupCoords = document.getElementById('pickup-coords');
  const dropoffCoords = document.getElementById('dropoff-coords');

  if (pickup || dropoff) {
    locationsDiv.classList.remove('hidden');
  }

  if (pickup) {
    pickupCoords.textContent = `${pickup.lat.toFixed(4)}, ${pickup.lon.toFixed(4)}`;
  }

  if (dropoff) {
    dropoffCoords.textContent = `${dropoff.lat.toFixed(4)}, ${dropoff.lon.toFixed(4)}`;
  }
}

// Load online drivers
async function loadDrivers() {
  try {
    const response = await fetch(`${API_URL}/api/drivers/available`);
    const data = await response.json();

    // Show drivers on map (only if no active ride)
    if (!currentRide && data.drivers) {
      data.drivers.forEach(driver => {
        // Just show count in console for now
      });
    }
  } catch (error) {
    console.error('Failed to load drivers:', error);
  }
}

// Request ride (initiate stake flow)
async function requestRide() {
  if (!pickup || !dropoff) {
    updateStatus('Select pickup and dropoff first.', 'info');
    return;
  }

  if (currentRide && currentRide.stage === 'waiting_rider_payment') {
    updateStatus('Stake invoice already generated. Complete payment to continue.', 'waiting');
    return;
  }

  if (currentRide && currentRide.stage === 'searching') {
    updateStatus('Ride already requested. Hang tight!', 'info');
    return;
  }

  const btn = document.getElementById('request-btn');
  btn.disabled = true;
  btn.innerHTML = 'Calculating fare...<span class="loading"></span>';

  try {
    updateStatus('Calculating fare and generating stake invoice...', 'waiting');

    const estimate = await fetchTripEstimate();
    currentEstimate = estimate;

    const rideId = generateRideId();
    const session = await createRideSession(rideId, estimate.fare.sats);

    currentRide = {
      id: rideId,
      stage: 'waiting_rider_payment',
      estimate,
      stake: session
    };
    riderStakeState = session;

    showStakePanel(session, estimate);
    updateStatus('Stake invoice generated. Pay to continue.', 'waiting');

    btn.innerHTML = 'Waiting for stake...';
  } catch (error) {
    console.error('Ride stake preparation failed', error);
    updateStatus(`Failed to prepare ride: ${error.message}`, 'error');
    btn.disabled = false;
    btn.textContent = 'Request Ride';
  }
}

// Connect to WebSocket
function connectWebSocket(rideId) {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('Connected to WebSocket');

    // Subscribe to ride updates
    ws.send(JSON.stringify({
      type: 'subscribe_ride',
      rideId: rideId
    }));
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    handleRideUpdate(message);
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  ws.onclose = () => {
    console.log('WebSocket closed');
  };
}

// Handle ride updates
function handleRideUpdate(message) {
  console.log('Ride update:', message);

  switch (message.type) {
    case 'ride_matched':
      handleRideMatched(message.ride);
      break;

    case 'driver_location':
      handleDriverLocation(message);
      break;

    case 'driver_arrived':
      handleDriverArrived();
      break;

    case 'driver_stake_locked':
      updateStatus('Driver stake locked. Ride will begin shortly.', 'success');
      break;

    case 'trip_started':
      handleTripStarted();
      break;

    case 'trip_completed':
      handleTripCompleted(message);
      break;
  }
}

// Handle ride matched
function handleRideMatched(ride) {
  currentRide.driver = ride.driver;
  currentRide.eta = ride.eta_seconds;

  updateStatus(`Driver ${ride.driver.name} is on the way!`, 'success');

  document.getElementById('driver-name').textContent = `🚗 ${ride.driver.name}`;
  document.getElementById('ride-status').textContent = 'Driver en route to pickup';

  updateETA(ride.eta_seconds);

  // Add driver marker
  if (driverMarker) {
    map.removeLayer(driverMarker);
  }

  driverMarker = L.marker([ride.driver.location.lat, ride.driver.location.lon], {
    icon: L.divIcon({
      className: 'marker-icon driver-marker',
      html: '🚗',
      iconSize: [30, 30]
    })
  }).addTo(map);

  // Draw driver-to-pickup route if available
  if (ride.driver_route && ride.driver_route.length > 0) {
    // Convert OSRM coordinates [lon, lat] to Leaflet format [lat, lon]
    const driverRoutePoints = ride.driver_route.map(coord => [coord[1], coord[0]]);

    if (driverRouteLine) {
      map.removeLayer(driverRouteLine);
    }

    driverRouteLine = L.polyline(driverRoutePoints, {
      color: '#ff9800',  // Orange for driver route
      weight: 4,
      opacity: 0.7,
      dashArray: '8, 5'  // Dashed line to distinguish from trip route
    }).addTo(map);

    console.log(`Drawing driver route with ${ride.driver_route.length} points`);

    // Fit map to show driver, route, and pickup
    const bounds = L.latLngBounds([
      [ride.driver.location.lat, ride.driver.location.lon],
      [pickup.lat, pickup.lon]
    ]);
    map.fitBounds(bounds, { padding: [50, 50] });
  }
}

// Handle driver location update
function handleDriverLocation(message) {
  if (!driverMarker) {
    return;
  }

  // Update driver marker position
  driverMarker.setLatLng([message.location.lat, message.location.lon]);

  // Update ETA
  if (message.eta_seconds) {
    updateETA(message.eta_seconds);
  }

  // Pan map to keep driver visible
  if (!map.getBounds().contains([message.location.lat, message.location.lon])) {
    map.panTo([message.location.lat, message.location.lon]);
  }
}

// Handle driver arrived
function handleDriverArrived() {
  updateStatus('Driver has arrived at pickup!', 'success');
  document.getElementById('ride-status').textContent = 'Driver arrived - Starting trip...';
  document.getElementById('eta-display').textContent = 'Arrived!';
}

// Handle trip started
function handleTripStarted() {
  updateStatus('Trip started! Heading to destination...', 'success');
  document.getElementById('ride-status').textContent = 'Trip in progress';

  // Remove driver route line (no longer needed)
  if (driverRouteLine) {
    map.removeLayer(driverRouteLine);
    driverRouteLine = null;
  }

  // Update route line to show trip route (from pickup to dropoff)
  if (routeLine) {
    map.removeLayer(routeLine);
  }

  // Use the original trip route if we have it stored
  if (currentRide.route && currentRide.route.length > 0) {
    const tripRoutePoints = currentRide.route.map(coord => [coord[1], coord[0]]);
    routeLine = L.polyline(tripRoutePoints, {
      color: '#4caf50',
      weight: 4,
      opacity: 0.8
    }).addTo(map);

    // Fit map to show the trip route
    map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
  } else if (driverMarker && dropoff) {
    // Fallback to straight line if no route available
    routeLine = L.polyline([
      driverMarker.getLatLng(),
      [dropoff.lat, dropoff.lon]
    ], {
      color: '#4caf50',
      weight: 4,
      opacity: 0.8
    }).addTo(map);
  }
}

// Handle trip completed
function handleTripCompleted(message) {
  updateStatus('Trip completed! Thank you for riding with DonkeyRide!', 'success');
  document.getElementById('ride-status').textContent = 'Completed';
  document.getElementById('eta-display').textContent = '✅ Complete';

  // Show completion details
  setTimeout(() => {
    alert(`Trip completed!\n\nFare: ${currentRide.fareCost}\nDuration: ${message.ride.duration}s\n\nThank you for using DonkeyRide!`);

    // Reset for next ride
    resetRide();
  }, 2000);
}

// Update ETA display
function updateETA(seconds) {
  const minutes = Math.ceil(seconds / 60);
  const etaDisplay = document.getElementById('eta-display');

  if (minutes <= 1) {
    etaDisplay.textContent = '< 1 min';
  } else {
    etaDisplay.textContent = `${minutes} min`;
  }
}

// Show ride info panel
function showRideInfo() {
  document.getElementById('ride-info').classList.remove('hidden');
  const fareText = currentRide.fareCost || currentRide.estimate?.fare?.formatted || '-';
  const distanceVal = typeof currentRide.distance === 'number'
    ? currentRide.distance
    : (currentRide.estimate?.distance?.km || 0);
  document.getElementById('ride-fare').textContent = fareText;
  document.getElementById('ride-distance').textContent = `${distanceVal.toFixed(1)} km`;
  document.getElementById('ride-status').textContent = 'Waiting for driver...';
}

// Update status message
function updateStatus(message, type = 'info') {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = type;
  setHeaderStatus(message, type);
}

function setHeaderStatus(message, type = 'info') {
  const dot = document.getElementById('header-status-dot');
  const text = document.getElementById('header-status-text');

  if (!dot || !text) return;

  dot.className = `status-light ${type}`;
  text.textContent = message;
}

// Reset for next ride
function resetRide() {
  currentRide = null;
  currentEstimate = null;
  riderStakeState = null;

  // Clear markers
  if (pickupMarker) {
    map.removeLayer(pickupMarker);
    pickupMarker = null;
  }

  if (dropoffMarker) {
    map.removeLayer(dropoffMarker);
    dropoffMarker = null;
  }

  if (driverMarker) {
    map.removeLayer(driverMarker);
    driverMarker = null;
  }

  if (routeLine) {
    map.removeLayer(routeLine);
    routeLine = null;
  }

  if (driverRouteLine) {
    map.removeLayer(driverRouteLine);
    driverRouteLine = null;
  }

  pickup = null;
  dropoff = null;

  // Close WebSocket
  if (ws) {
    ws.close();
    ws = null;
  }

  // Reset UI
  document.getElementById('locations').classList.add('hidden');
  document.getElementById('ride-info').classList.add('hidden');
  document.getElementById('request-btn').disabled = true;
  document.getElementById('request-btn').textContent = 'Request Ride';
  document.getElementById('request-btn').innerHTML = 'Request Ride';

  updateStatus('Click on the map to set pickup (blue) and dropoff (red) locations', 'info');
  hideStakePanel();
  if (stakePaidBtn) {
    stakePaidBtn.disabled = false;
    stakePaidBtn.textContent = '✅ I’ve paid the stake';
  }

  // Reset map view
  map.setView([51.5074, -0.1278], 14);
}

// Event listeners
document.getElementById('request-btn').addEventListener('click', requestRide);
if (stakePaidBtn) {
  stakePaidBtn.addEventListener('click', confirmStakePayment);
}
if (stakeCancelBtn) {
  stakeCancelBtn.addEventListener('click', cancelStakeFlow);
}

// Initialize
initMap();
console.log('DonkeyRide Rider App initialized');
