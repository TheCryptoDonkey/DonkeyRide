const API_URL = window.location.origin;
const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:3001`;

const {
  generatePrivateKey,
  getPublicKey: nostrGetPublicKey,
  getEventHash,
  getSignature,
  nip19,
  utils
} = window.NostrTools || {};

if (!window.NostrTools) {
  console.warn('nostr-tools not loaded - driver panic/rating signing disabled');
}

const bytesToHex = utils?.bytesToHex;
const hexToBytes = utils?.hexToBytes;
const DRIVER_PRIV_STORAGE_KEY = 'donkeyride.driverPrivKey';
const DEMO_DRIVER_PRIVKEY = 'EXAMPLE_VALUE';

function ensurePrivBytes(hexKey) {
  if (hexToBytes) {
    return hexToBytes(hexKey);
  }
  const matches = hexKey.match(/.{1,2}/g) || [];
  return new Uint8Array(matches.map(byte => parseInt(byte, 16)));
}

let driverPrivKey = window.localStorage.getItem(DRIVER_PRIV_STORAGE_KEY);

if (!driverPrivKey) {
  if (generatePrivateKey && bytesToHex) {
    const raw = generatePrivateKey();
    driverPrivKey = typeof raw === 'string' ? raw : bytesToHex(raw);
  } else {
    driverPrivKey = DEMO_DRIVER_PRIVKEY;
  }
  window.localStorage.setItem(DRIVER_PRIV_STORAGE_KEY, driverPrivKey);
}

let driverPrivBytes = null;
let driverPubKey = null;

try {
  if (nostrGetPublicKey) {
    driverPrivBytes = ensurePrivBytes(driverPrivKey);
    driverPubKey = nostrGetPublicKey(driverPrivBytes);
  }
} catch (error) {
  console.warn('Driver key derivation failed, falling back to demo key', error);
  driverPrivKey = DEMO_DRIVER_PRIVKEY;
  window.localStorage.setItem(DRIVER_PRIV_STORAGE_KEY, driverPrivKey);
  if (nostrGetPublicKey) {
    driverPrivBytes = ensurePrivBytes(driverPrivKey);
    driverPubKey = nostrGetPublicKey(driverPrivBytes);
  }
}

const driverNpub = driverPubKey && nip19 ? nip19.npubEncode(driverPubKey) : null;

const UNIT_PREFERENCE_KEY = 'donkeyride.pref.unit';
const CURRENCY_PREFERENCE_KEY = 'donkeyride.pref.currency';
const DEFAULT_UNIT = 'mi';
const DEFAULT_CURRENCY = 'GBP';
const CURRENCY_SYMBOLS = {
  GBP: '£',
  USD: '$',
  EUR: '€'
};

let distanceUnit = (window.localStorage.getItem(UNIT_PREFERENCE_KEY) || DEFAULT_UNIT).toLowerCase();
if (distanceUnit !== 'km' && distanceUnit !== 'mi') {
  distanceUnit = DEFAULT_UNIT;
}

let currencyPreference = (window.localStorage.getItem(CURRENCY_PREFERENCE_KEY) || DEFAULT_CURRENCY).toUpperCase();
if (!['USD', 'EUR', 'GBP'].includes(currencyPreference)) {
  currencyPreference = DEFAULT_CURRENCY;
}

function convertDistance(distanceKm) {
  if (typeof distanceKm !== 'number' || Number.isNaN(distanceKm)) {
    return { value: 0, unitLabel: distanceUnit === 'mi' ? 'mi' : 'km' };
  }
  if (distanceUnit === 'mi') {
    return { value: distanceKm * 0.621371, unitLabel: 'mi' };
  }
  return { value: distanceKm, unitLabel: 'km' };
}

function formatDistance(distanceKm, fractionDigits = 1) {
  const { value, unitLabel } = convertDistance(distanceKm);
  const digits = typeof fractionDigits === 'number' ? fractionDigits : 1;
  return `${value.toFixed(digits)} ${unitLabel}`;
}

function getCurrencySymbol(code) {
  return CURRENCY_SYMBOLS[code] || code || '';
}

function normaliseHexKey(key) {
  if (!key || typeof key !== 'string') {
    return null;
  }
  const trimmed = key.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (trimmed.startsWith('npub') && nip19) {
    try {
      const decoded = nip19.decode(trimmed);
      if (typeof decoded.data === 'string') {
        return decoded.data.toLowerCase();
      }
      if (decoded.data?.data && typeof decoded.data.data === 'string') {
        return decoded.data.data.toLowerCase();
      }
    } catch (error) {
      console.warn('Driver app failed to decode npub', error);
    }
  }
  return null;
}

function ensureSigningAvailable(feature) {
  if (!window.NostrTools || !getEventHash || !getSignature) {
    throw new Error(`${feature} unavailable — nostr-tools not loaded`);
  }
  if (!driverPubKey || !driverPrivKey) {
    throw new Error(`${feature} unavailable — driver key missing`);
  }
}

function buildDriverRatingEvent({ rideId, targetKey, rating, notes }) {
  ensureSigningAvailable('Rating');
  const targetHex = normaliseHexKey(targetKey);
  if (!targetHex) {
    throw new Error('Invalid rider key for rating');
  }
  const event = {
    kind: 30530,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['ride', rideId],
      ['p', targetHex],
      ['rating', String(rating)],
      ['role', 'driver']
    ],
    content: notes || ''
  };

  event.pubkey = driverPubKey;
  event.id = getEventHash(event);
  event.sig = getSignature(event, driverPrivKey);
  return event;
}

function buildDriverPanicEvent({ rideId, note, targetKey }) {
  ensureSigningAvailable('Panic');
  const tags = [
    ['ride', rideId],
    ['role', 'driver']
  ];
  const targetHex = normaliseHexKey(targetKey);
  if (targetHex) {
    tags.push(['p', targetHex]);
  }
  const event = {
    kind: 30560,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: note || ''
  };
  event.pubkey = driverPubKey;
  event.id = getEventHash(event);
  event.sig = getSignature(event, driverPrivKey);
  return event;
}

async function fetchReputationProfile(npub) {
  if (!npub) {
    return null;
  }
  const cacheKey = npub.toLowerCase();
  if (reputationCache.has(cacheKey)) {
    return reputationCache.get(cacheKey);
  }
  try {
    const response = await fetch(`/api/reputation/${encodeURIComponent(cacheKey)}`);
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    if (data?.profile) {
      reputationCache.set(cacheKey, data.profile);
      return data.profile;
    }
  } catch (error) {
    console.warn('Failed to fetch reputation', error);
  }
  return null;
}

const DRIVER_PROFILE = {
  npub: driverNpub || 'npub_demo_driver_london',
  name: 'Ayesha Khan',
  rating: 4.96,
  lightning: 'ayesha@getalby.com',
  vehicle: 'Nissan Leaf (EV)',
  homeBase: { lat: 51.5152, lon: -0.1419 }
};

const MOVE_INTERVAL = 2000; // ms between location updates
const MOVE_STEP_METERS = 80; // approx ~145 km/h along route for demo smoothness
const reputationCache = new Map();

class DriverApp {
  constructor() {
    this.map = null;
    this.driverMarker = null;
    this.pickupMarker = null;
    this.dropoffMarker = null;
    this.driverRouteLine = null;
    this.tripRouteLine = null;

    this.ws = null;
    this.wsReconnectTimer = null;

    this.isOnline = false;
    this.autoAccept = false;
    this.pendingRides = new Map();
    this.currentRide = null;
    this.currentStage = null; // 'to_pickup' | 'to_dropoff'

    this.movementTimer = null;
    this.activeRoute = null;
    this.activeRouteMeta = null;
    this.routeDistance = 0;
    this.routeProgress = 0;
    this.stakeSection = document.getElementById('driver-stake-section');
    this.stakeAmountEl = document.getElementById('driver-stake-amount');
    this.stakeInvoiceEl = document.getElementById('driver-stake-invoice');
    this.stakeConfirmBtn = document.getElementById('driver-stake-confirm-btn');
    this.pendingDriverStake = null;

    this.controlsEl = document.getElementById('driver-controls');
    this.arrivedBtn = document.getElementById('driver-arrived-btn');
    this.startTripBtn = document.getElementById('driver-start-trip-btn');
    this.streamPanel = document.getElementById('driver-stream-panel');
    this.streamPaidEl = document.getElementById('driver-stream-paid');
    this.streamRemainingEl = document.getElementById('driver-stream-remaining');
    this.safetyPanel = document.getElementById('driver-safety-panel');
    this.panicBtn = document.getElementById('driver-panic-btn');
    this.safetyStatusEl = document.getElementById('driver-safety-status');
    this.unitSelect = document.getElementById('driver-unit-select');
    this.currencySelect = document.getElementById('driver-currency-select');
    this.feedbackPanel = document.getElementById('driver-feedback-panel');
    this.feedbackStars = document.getElementById('driver-feedback-stars');
    this.feedbackSubmitBtn = document.getElementById('driver-feedback-submit');
    this.feedbackStatusEl = document.getElementById('driver-feedback-status');
    this.feedbackNotesEl = document.getElementById('driver-feedback-notes');
    this.riderReputationEl = document.getElementById('active-rider-reputation');
    this.completeRideBtn = document.getElementById('complete-ride-btn');

    this.pendingArrival = false;
    this.waitingForTripStart = false;
    this.awaitingCompletion = false;
    this.streamState = { total: 0, remaining: 0, fare: 0 };
    this.earnings = { totalFiat: 0, rides: 0, currency: currencyPreference };
    this.ratingValue = 0;
    this.ratingSubmitted = false;
    this.lastCompletedRide = null;
  }

  init() {
    this.initMap();
    this.bindUI();
    this.updateEarningsDisplay({ total: 0, rides: 0 });
    this.setStatusOffline();
    const nameEl = document.getElementById('driver-name');
    const vehicleEl = document.getElementById('driver-vehicle');
    if (nameEl) nameEl.textContent = DRIVER_PROFILE.name;
    if (vehicleEl) vehicleEl.textContent = DRIVER_PROFILE.vehicle;
    if (this.unitSelect) {
      this.unitSelect.value = distanceUnit;
    }
    if (this.currencySelect) {
      this.currencySelect.value = currencyPreference;
    }
  }

  initMap() {
    this.map = L.map('map', {
      zoomControl: true,
      scrollWheelZoom: true
    }).setView([DRIVER_PROFILE.homeBase.lat, DRIVER_PROFILE.homeBase.lon], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);

    this.driverMarker = L.marker([DRIVER_PROFILE.homeBase.lat, DRIVER_PROFILE.homeBase.lon], {
      icon: L.divIcon({
        className: 'marker-icon driver-marker',
        html: '🚖',
        iconSize: [30, 30]
      })
    }).addTo(this.map).bindPopup(`${DRIVER_PROFILE.name} (You)`);
  }

  bindUI() {
    document.getElementById('toggle-online').addEventListener('click', () => {
      this.isOnline ? this.goOffline() : this.goOnline();
    });

    document.getElementById('toggle-auto-accept').addEventListener('click', () => {
      this.toggleAutoAccept();
    });

    if (this.completeRideBtn) {
      this.completeRideBtn.style.display = 'none';
      this.completeRideBtn.addEventListener('click', () => {
        if (this.currentRide || this.awaitingCompletion) {
          this.finishRide();
        }
      });
    }

    if (this.stakeConfirmBtn) {
      this.stakeConfirmBtn.addEventListener('click', () => this.confirmDriverStake());
    }

    if (this.arrivedBtn) {
      this.arrivedBtn.addEventListener('click', () => this.markArrivedManually());
    }

    if (this.startTripBtn) {
      this.startTripBtn.addEventListener('click', () => this.startTripManually());
    }

    if (this.panicBtn) {
      this.panicBtn.addEventListener('click', () => this.triggerDriverPanic());
    }

    if (this.unitSelect) {
      this.unitSelect.addEventListener('change', (event) => {
        const newUnit = (event.target.value || DEFAULT_UNIT).toLowerCase();
        distanceUnit = newUnit === 'km' ? 'km' : 'mi';
        window.localStorage.setItem(UNIT_PREFERENCE_KEY, distanceUnit);
        this.renderRideCards();
        this.refreshActiveRideDisplays();
      });
    }

    if (this.currencySelect) {
      this.currencySelect.addEventListener('change', (event) => {
        const newCurrency = (event.target.value || DEFAULT_CURRENCY).toUpperCase();
        currencyPreference = ['USD', 'EUR', 'GBP'].includes(newCurrency) ? newCurrency : DEFAULT_CURRENCY;
        window.localStorage.setItem(CURRENCY_PREFERENCE_KEY, currencyPreference);
        this.earnings.currency = currencyPreference;
        this.updateEarningsDisplay({
          total: this.earnings.totalFiat,
          rides: this.earnings.rides
        });
      });
    }

    if (this.feedbackStars) {
      this.feedbackStars.addEventListener('click', (event) => this.handleFeedbackStarClick(event));
    }

    if (this.feedbackSubmitBtn) {
      this.feedbackSubmitBtn.addEventListener('click', () => this.submitDriverFeedback());
    }
  }

  goOnline() {
    this.isOnline = true;
    this.setStatusOnline();
    this.connectWebSocket();
    this.showWaitingState();
    this.updateOnlineToggle(true);
    this.setNetworkStatus('Connecting…', '#ffe28a');
  }

  goOffline() {
    this.isOnline = false;
    this.setStatusOffline();
    this.teardownWebSocket();
    this.clearRequests();
    this.clearActiveRide();
    this.showWaitingState();
    this.updateOnlineToggle(false);
    this.setNetworkStatus('Offline', '#888');
    this.hideDriverStakePanel();
    this.pendingDriverStake = null;
  }

  setStatusOnline() {
    const badge = document.getElementById('status-badge');
    const dot = document.getElementById('status-dot');
    badge.textContent = 'ONLINE';
    badge.classList.remove('offline');
    dot.classList.remove('offline');
    dot.classList.add('online');
  }

  setStatusOffline() {
    const badge = document.getElementById('status-badge');
    const dot = document.getElementById('status-dot');
    badge.textContent = 'OFFLINE';
    badge.classList.add('offline');
    dot.classList.remove('online');
    dot.classList.add('offline');
  }

  toggleAutoAccept() {
    this.autoAccept = !this.autoAccept;
    const badge = document.querySelector('#toggle-auto-accept .badge');
    const btn = document.getElementById('toggle-auto-accept');
    badge.textContent = this.autoAccept ? 'ON' : 'OFF';
    badge.classList.toggle('active', this.autoAccept);
    btn.classList.toggle('active', this.autoAccept);

    if (this.autoAccept) {
      // accept the oldest request if pending
      const [ride] = this.pendingRides.values();
      if (ride) {
        this.acceptRide(ride);
      }
    }
  }

  connectWebSocket() {
    if (this.ws) {
      return;
    }

    try {
      this.ws = new WebSocket(WS_URL);
    } catch (error) {
      console.error('Failed to open WebSocket:', error);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log('Driver WebSocket connected');
      this.wsReconnectTimer && clearTimeout(this.wsReconnectTimer);
      this.setNetworkStatus('Connected to dispatcher', '#00ff90');
      this.ws.send(JSON.stringify({
        type: 'register_driver',
        npub: DRIVER_PROFILE.npub
      }));
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleWebSocketMessage(message);
      } catch (err) {
        console.warn('Invalid WebSocket message', err);
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (this.isOnline) {
        this.setNetworkStatus('Reconnecting…', '#ffe28a');
      } else {
        this.setNetworkStatus('Offline', '#666');
      }
      if (this.isOnline) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.setNetworkStatus('Connection error', '#ff6b6b');
      this.ws?.close();
    };
  }

  teardownWebSocket() {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
    this.wsReconnectTimer && clearTimeout(this.wsReconnectTimer);
  }

  scheduleReconnect() {
    this.wsReconnectTimer && clearTimeout(this.wsReconnectTimer);
    this.wsReconnectTimer = setTimeout(() => {
      if (this.isOnline && !this.ws) {
        this.connectWebSocket();
      }
    }, 4000);
  }

  handleWebSocketMessage(message) {
    if (!this.isOnline) {
      return;
    }

    switch (message.type) {
      case 'ride_request':
        this.addRideRequest(message.ride);
        break;
      case 'ride_cancelled':
        this.handleRideCancelled(message);
        break;
      case 'trip_started':
        if (message.ride?.fare) {
          this.streamState.fare = message.ride.fare;
        }
        this.showDriverStreamPanel();
        break;
      case 'stream_payment':
        this.handleStreamPayment(message);
        break;
      case 'rating_submitted':
        if (message.role === 'rider' && this.currentRide?.rider?.npub) {
          fetchReputationProfile(this.currentRide.rider.npub).then((profile) => {
            this.updateRiderReputationDisplay(profile);
          });
        }
        break;
      case 'panic_alert':
        this.handlePanicAlert(message);
        break;
      case 'safety_check_update':
        this.handleSafetyUpdate(message);
        break;
      default:
        break;
    }
  }

  addRideRequest(ride) {
    if (this.currentRide) {
      return; // already busy
    }

    this.pendingRides.set(ride.id, ride);
    this.renderRideCards();

    if (this.autoAccept) {
      this.acceptRide(ride);
    }
  }

  renderRideCards() {
    const container = document.getElementById('request-list');

    if (this.pendingRides.size === 0) {
      container.innerHTML = '<div style="color:#666;">Waiting for ride requests...</div>';
      return;
    }

    container.innerHTML = '';

    this.pendingRides.forEach((ride) => {
      const card = document.createElement('div');
      card.className = 'ride-request';

      const rawDistanceKm = typeof ride.distance === 'number'
        ? ride.distance
        : (ride.estimatedFare?.distance?.km ?? null);
      const distanceDisplay = rawDistanceKm != null
        ? formatDistance(rawDistanceKm)
        : '—';
      const surge = ride.estimatedFare?.breakdown?.surge?.multiplier ?? 1;
      const fareSats = typeof ride.fare === 'number'
        ? ride.fare
        : (ride.estimatedFare?.fare?.sats ?? 0);
      const fareDisplay = ride.estimatedFare?.fare?.formatted
        || (typeof fareSats === 'number' ? `${fareSats.toLocaleString()} sats` : '—');

      card.innerHTML = `
        <h4>${ride.pickup.address || `${ride.pickup.lat.toFixed(3)}, ${ride.pickup.lon.toFixed(3)}`} → ${ride.dropoff.address || `${ride.dropoff.lat.toFixed(3)}, ${ride.dropoff.lon.toFixed(3)}`}</h4>
        <div class="ride-info">
          <div>Distance: <strong>${distanceDisplay}</strong></div>
          <div>Fare: <strong>${fareDisplay}</strong></div>
          <div>Surge: <strong>${surge.toFixed?.(2) ?? '1.0'}x</strong></div>
        </div>
        <div class="ride-actions">
          <button class="btn decline">Decline</button>
          <button class="btn accept">Accept</button>
        </div>
      `;

      const [declineBtn, acceptBtn] = card.querySelectorAll('button');

      declineBtn.addEventListener('click', () => {
        this.pendingRides.delete(ride.id);
        this.renderRideCards();
      });

      acceptBtn.addEventListener('click', () => {
        this.acceptRide(ride);
      });

      container.appendChild(card);
    });

    if (!this.currentRide) {
      this.showWaitingState(true);
    }
  }

  showWaitingState(show = true) {
    const section = document.getElementById('waiting-section');
    const message = document.getElementById('waiting-message');
    section.style.display = show ? 'block' : 'none';
    if (show) {
      message.textContent = this.isOnline
        ? 'Listening for rider requests...'
        : 'Go online to start receiving rider requests';
    }
    document.getElementById('active-ride-section').style.display = 'none';
    document.getElementById('nav-section').style.display = 'none';
  }

  hideWaitingState() {
    document.getElementById('waiting-section').style.display = 'none';
  }

  async acceptRide(ride) {
    if (this.currentRide) {
      return;
    }

    this.pendingRides.delete(ride.id);
    this.renderRideCards();

    try {
      const response = await fetch(`/rides/${ride.id}/driver-accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: DRIVER_PROFILE.npub,
          driverLightning: DRIVER_PROFILE.lightning,
          driverPubkey: driverPubKey
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || response.statusText);
      }

      const session = await response.json();
      this.lastCompletedRide = null;
      this.currentRide = {
        ...ride,
        stage: 'awaiting_stake',
        driverLightning: DRIVER_PROFILE.lightning
      };
      this.currentRide.currency = ride.currency || currencyPreference;
      this.earnings.currency = this.currentRide.currency || currencyPreference;
      this.pendingDriverStake = {
        amount: session.stakeAmount,
        invoice: session.invoice
      };

      if (this.ws) {
        this.ws.send(JSON.stringify({
          type: 'subscribe_ride',
          rideId: ride.id
        }));
      }

      this.hideWaitingState();
      this.showDriverStakePanel(session.invoice, session.stakeAmount);
      this.showSuccess('Stake invoice generated. Pay and confirm to start the ride.');
    } catch (error) {
      console.error('Failed to accept ride', error);
      this.showError(`Failed to accept ride: ${error.message}`);
      this.currentRide = null;
      this.pendingDriverStake = null;
      this.renderRideCards();
    }
  }

  showActiveRidePanel() {
    document.getElementById('active-ride-section').style.display = 'block';
    document.getElementById('nav-section').style.display = 'block';
    this.hideDriverControls();
    if (this.completeRideBtn) {
      this.completeRideBtn.style.display = 'none';
      this.completeRideBtn.disabled = true;
    }
    this.hideDriverStreamPanel();
    this.hideDriverFeedbackPanel();
    this.pendingArrival = false;
    this.waitingForTripStart = false;
    this.streamState = { total: 0, remaining: 0, fare: this.currentRide?.fare || 0 };
    const fareDisplay = typeof this.currentRide.fare === 'number'
      ? `${this.currentRide.fare.toLocaleString()} sats`
      : '-';
    this.updateRideStatus({
      status: 'En route to pickup',
      distance: formatDistance(this.currentRide?.distance || 0),
      eta: this.currentRide.pickupEtaSeconds ? `${Math.round(this.currentRide.pickupEtaSeconds / 60)} min` : '-',
      progress: '0%',
      earnings: fareDisplay
    });
    this.updateNavigationInstructions('pickup');
    this.showSafetyPanel();
  }

  refreshActiveRideDisplays() {
    if (!this.currentRide) {
      return;
    }

    const rideDistanceEl = document.getElementById('ride-distance');
    if (rideDistanceEl) {
      const distanceKm = typeof this.currentRide.distance === 'number'
        ? this.currentRide.distance
        : (this.currentRide.estimatedFare?.distance?.km ?? 0);
      rideDistanceEl.textContent = distanceKm ? formatDistance(distanceKm) : '—';
    }
  }

  startStageToPickup() {
    this.currentStage = 'to_pickup';
    if (this.currentRide) {
      this.currentRide.stage = 'to_pickup';
      this.currentRide.status = 'en_route';
    }
    const route = this.transformRoute(this.currentRide.driver_route) || [
      [this.driverMarker.getLatLng().lat, this.driverMarker.getLatLng().lng],
      [this.currentRide.pickup.lat, this.currentRide.pickup.lon]
    ];

    this.drawDriverRoute(route, '#ff6ec7');
    this.updateNavigationInstructions('pickup');
    this.startMovementAlongRoute(route, () => this.onPickupRouteComplete());
  }

  onPickupRouteComplete() {
    this.stopMovement();
    this.pendingArrival = true;
    if (this.currentRide) {
      this.currentRide.stage = 'arrived';
      this.currentRide.status = 'arrived';
    }
    this.updateRideStatus({
      status: 'Confirm arrival at pickup',
      distance: formatDistance(0),
      eta: '0 min',
      progress: '50%'
    });
    this.showArrivalPrompt();
  }

  markArrivedManually() {
    if (!this.currentRide || !this.pendingArrival) {
      return;
    }

    this.arrivedBtn.disabled = true;

    fetch(`/api/rides/${this.currentRide.id}/arrive`, { method: 'POST' })
      .then(() => {
        this.pendingArrival = false;
        this.waitingForTripStart = true;
        this.showStartTripPrompt();
        this.updateRideStatus({
          status: 'Waiting to start trip',
          eta: '-',
          progress: '60%'
        });
        if (this.arrivedBtn) {
          this.arrivedBtn.style.display = 'none';
        }
      })
      .catch((error) => {
        console.error('Error marking arrival:', error);
        this.arrivedBtn.disabled = false;
      });
  }

  startTripManually() {
    if (!this.currentRide || !this.waitingForTripStart) {
      return;
    }

    this.startTripBtn.disabled = true;

    fetch(`/api/rides/${this.currentRide.id}/start`, { method: 'POST' })
      .then((res) => {
        if (!res.ok) {
          throw new Error(res.statusText);
        }
        return res.json();
      })
      .then((data) => {
        this.waitingForTripStart = false;
        if (data?.ride) {
          this.currentRide = { ...this.currentRide, ...data.ride };
        }
        this.streamState = {
          total: 0,
          remaining: this.currentRide?.fare || 0,
          fare: this.currentRide?.fare || 0
        };
        this.startStageToDropoff();
        if (this.startTripBtn) {
          this.startTripBtn.style.display = 'none';
        }
        this.updateRideStatus({
          status: 'Driving to destination',
          progress: '65%'
        });
        this.showSuccess('Trip started • Streaming payments in progress');
      })
      .catch((error) => {
        console.error('Error starting trip:', error);
        this.startTripBtn.disabled = false;
      });
  }

  startStageToDropoff() {
    this.currentStage = 'to_dropoff';
    if (this.currentRide) {
      this.currentRide.stage = 'to_dropoff';
      this.currentRide.status = 'active';
    }

    const route = this.transformRoute(this.currentRide.route) || [
      [this.currentRide.pickup.lat, this.currentRide.pickup.lon],
      [this.currentRide.dropoff.lat, this.currentRide.dropoff.lon]
    ];

    this.drawTripRoute(route, '#667eea');
    this.hideDriverControls();
    this.showDriverStreamPanel();
    this.updateNavigationInstructions('dropoff');
    this.updateSafetyStatus('Trip monitoring active — we will stream sats.', 'info');
    this.startMovementAlongRoute(route, () => this.promptCompletion());
  }

  promptCompletion() {
    this.awaitingCompletion = true;
    this.stopMovement();
    this.updateRideStatus({
      status: 'Arrived at dropoff — confirm completion',
      distance: formatDistance(0),
      eta: '0 min',
      progress: '95%'
    });
    if (this.completeRideBtn) {
      this.completeRideBtn.style.display = 'block';
      this.completeRideBtn.disabled = false;
    }
  }

  async finishRide() {
    const rideToComplete = this.currentRide || this.lastCompletedRide;
    if (!rideToComplete) {
      return;
    }

    await fetch(`/api/rides/${rideToComplete.id}/complete`, { method: 'POST' }).catch(() => {});

    this.updateRideStatus({
      status: 'Ride complete',
      distance: formatDistance(0),
      eta: '0 min',
      progress: '100%'
    });

    this.stopMovement();
    this.showSuccess('Ride completed!');

    this.lastCompletedRide = { ...rideToComplete };
    this.awaitingCompletion = false;
    if (this.completeRideBtn) {
      this.completeRideBtn.style.display = 'none';
    }
    this.clearActiveRide();
    this.showWaitingState(true);

    this.showDriverFeedbackPanel();

    this.earnings.rides += 1;
    const rideFiat = rideToComplete.estimatedFare?.driverEarns?.fiat ?? 0;
    this.earnings.totalFiat += Number.isFinite(rideFiat) ? rideFiat : 0;
    const rideCurrency = rideToComplete.estimatedFare?.fare?.currency || rideToComplete.currency;
    if (rideCurrency) {
      this.earnings.currency = rideCurrency;
    }
    this.updateEarningsDisplay({
      total: this.earnings.totalFiat,
      rides: this.earnings.rides
    });

    this.currentRide = null;
  }

  clearActiveRide() {
    this.stopMovement();
    this.removeMarker(this.pickupMarker);
    this.removeMarker(this.dropoffMarker);
    this.removePolyline(this.driverRouteLine);
    this.removePolyline(this.tripRouteLine);
    document.getElementById('active-ride-section').style.display = 'none';
    document.getElementById('nav-section').style.display = 'none';
    this.hideDriverStakePanel();
    this.hideDriverControls();
    this.hideDriverStreamPanel();
    this.hideSafetyPanel();
    this.hideDriverFeedbackPanel();
    if (this.completeRideBtn) {
      this.completeRideBtn.style.display = 'none';
    }
    this.updateRiderReputationDisplay(null);
    this.pendingArrival = false;
    this.waitingForTripStart = false;
    this.awaitingCompletion = false;
    this.streamState = { total: 0, remaining: 0, fare: 0 };
  }

  stopMovement() {
    if (this.movementTimer) {
      clearInterval(this.movementTimer);
      this.movementTimer = null;
    }
  }

  startMovementAlongRoute(routeLatLng, onComplete) {
    this.stopMovement();

    this.activeRoute = routeLatLng;
    this.activeRouteMeta = this.prepareRouteMeta(routeLatLng);
    this.routeDistance = this.activeRouteMeta.totalDistance;
    this.routeProgress = 0;

    const stage = this.currentStage;

    const update = async () => {
      this.routeProgress += MOVE_STEP_METERS;

      if (this.routeProgress >= this.routeDistance) {
        this.routeProgress = this.routeDistance;
      }

      const position = this.interpolatePosition(this.routeProgress);
      if (position) {
        this.driverMarker.setLatLng([position.lat, position.lon]);
        this.map.panTo([position.lat, position.lon], { animate: true, duration: 0.4 });
        this.sendLocationUpdate(position.lat, position.lon);
      }

      const distanceRemaining = Math.max(this.routeDistance - this.routeProgress, 0);
      const etaMinutes = Math.max(Math.round((distanceRemaining / MOVE_STEP_METERS) * (MOVE_INTERVAL / 60000)), 0);
      const progressPct = this.routeDistance === 0 ? 100 : Math.round((this.routeProgress / this.routeDistance) * 100);
      const distanceRemainingKm = distanceRemaining / 1000;

      this.updateRideStatus({
        status: stage === 'to_pickup' ? 'En route to pickup' : 'Driving to destination',
        distance: formatDistance(distanceRemainingKm, 2),
        eta: `${etaMinutes} min`,
        progress: `${progressPct}%`
      });

      if (this.routeProgress >= this.routeDistance) {
        this.stopMovement();
        onComplete?.();
      }
    };

    update();
    this.movementTimer = setInterval(update, MOVE_INTERVAL);
  }

  sendLocationUpdate(lat, lon) {
    if (!this.currentRide) return;

    fetch(`/api/rides/${this.currentRide.id}/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lon })
    }).catch(() => {});
  }

  updateRideStatus({ status, distance, eta, progress, earnings }) {
    if (status) document.getElementById('ride-status-text').textContent = status;
    if (distance) document.getElementById('ride-distance').textContent = distance;
    if (eta) document.getElementById('ride-eta').textContent = eta;
    if (progress) document.getElementById('ride-progress').textContent = progress;
    if (earnings) document.getElementById('ride-earnings').textContent = earnings;
  }

  updateRiderReputationDisplay(profile) {
    if (!this.riderReputationEl) {
      return;
    }
    if (!profile) {
      this.riderReputationEl.textContent = 'No history yet';
      return;
    }
    const rounded = profile.averageRating ? Number(profile.averageRating).toFixed(2) : '0.00';
    this.riderReputationEl.textContent = `${rounded} (${profile.ratingsCount} ratings)`;
  }

  updateNavigationInstructions(stage) {
    const container = document.getElementById('instructions-container');
    container.innerHTML = '';

    const steps = stage === 'pickup'
      ? [
          { icon: '🚗', text: 'Head toward pickup point' },
          { icon: '📍', text: 'Meet rider at pickup location' }
        ]
      : [
          { icon: '✅', text: 'Rider onboard' },
          { icon: '🛣️', text: 'Follow route to dropoff' },
          { icon: '🎯', text: 'Complete ride and confirm payment' }
        ];

    steps.forEach((step, index) => {
      const div = document.createElement('div');
      div.className = `nav-card${index === 0 ? ' current' : ''}`;
      div.innerHTML = `
        <div class="nav-step">
          <div class="nav-step-icon">${step.icon}</div>
          <div class="nav-step-text">${step.text}</div>
        </div>
      `;
      container.appendChild(div);
    });
  }

  showDriverStakePanel(invoice, amount) {
    if (!this.stakeSection) {
      return;
    }

    this.stakeSection.style.display = 'block';
    if (this.stakeAmountEl) {
      this.stakeAmountEl.textContent = `${Math.round(amount).toLocaleString()} sats`;
    }
    if (this.stakeInvoiceEl) {
      this.stakeInvoiceEl.textContent = invoice;
    }
    if (this.stakeConfirmBtn) {
      this.stakeConfirmBtn.disabled = false;
      this.stakeConfirmBtn.textContent = '✅ Stake Paid';
    }
  }

  hideDriverStakePanel() {
    if (this.stakeSection) {
      this.stakeSection.style.display = 'none';
    }
    if (this.stakeConfirmBtn) {
      this.stakeConfirmBtn.disabled = false;
      this.stakeConfirmBtn.textContent = '✅ Stake Paid';
    }
  }

  hideDriverControls() {
    if (this.controlsEl) {
      this.controlsEl.style.display = 'none';
    }
    if (this.arrivedBtn) {
      this.arrivedBtn.style.display = 'none';
    }
    if (this.startTripBtn) {
      this.startTripBtn.style.display = 'none';
      this.startTripBtn.disabled = false;
    }
  }

  showArrivalPrompt() {
    if (!this.controlsEl || !this.arrivedBtn || !this.startTripBtn) {
      return;
    }

    this.controlsEl.style.display = 'flex';
    this.arrivedBtn.style.display = 'block';
    this.arrivedBtn.disabled = false;
    this.startTripBtn.style.display = 'none';
  }

  showStartTripPrompt() {
    if (!this.controlsEl || !this.arrivedBtn || !this.startTripBtn) {
      return;
    }

    this.controlsEl.style.display = 'flex';
    this.arrivedBtn.style.display = 'none';
    this.startTripBtn.style.display = 'block';
    this.startTripBtn.disabled = false;
  }

  showDriverStreamPanel() {
    if (!this.streamPanel || !this.currentRide) {
      return;
    }

    this.streamState = this.streamState || { total: 0, remaining: 0 };
    if (this.currentRide.fare) {
      this.streamState.fare = this.currentRide.fare;
    }
    this.streamPanel.style.display = 'block';
    this.updateDriverStreamPanel(this.streamState.total, this.currentRide.fare || 0);
  }

  hideDriverStreamPanel() {
    if (this.streamPanel) {
      this.streamPanel.style.display = 'none';
    }
    if (this.streamPaidEl) {
      this.streamPaidEl.textContent = '0 sats';
    }
    if (this.streamRemainingEl) {
      this.streamRemainingEl.textContent = '-';
    }
    this.streamState = { total: 0, remaining: 0, fare: 0 };
  }

  showDriverFeedbackPanel() {
    if (!this.feedbackPanel) {
      return;
    }
    this.ratingValue = 0;
    this.ratingSubmitted = false;
    this.feedbackPanel.classList.add('active');
    this.updateFeedbackStars();
    if (this.feedbackStatusEl) {
      this.feedbackStatusEl.textContent = '';
    }
    if (this.feedbackSubmitBtn) {
      this.feedbackSubmitBtn.disabled = false;
    }
    if (this.feedbackNotesEl) {
      this.feedbackNotesEl.value = '';
      this.feedbackNotesEl.disabled = false;
    }
    if (this.feedbackStars) {
      this.feedbackStars.querySelectorAll('button').forEach((btn) => {
        btn.disabled = false;
      });
    }
  }

  hideDriverFeedbackPanel() {
    if (this.feedbackPanel) {
      this.feedbackPanel.classList.remove('active');
    }
    this.ratingValue = 0;
    this.ratingSubmitted = false;
    this.updateFeedbackStars();
    if (this.feedbackStatusEl) {
      this.feedbackStatusEl.textContent = '';
    }
  }

  updateFeedbackStars() {
    if (!this.feedbackStars) {
      return;
    }
    const buttons = Array.from(this.feedbackStars.querySelectorAll('button'));
    buttons.forEach((btn) => {
      const btnValue = Number(btn.dataset.rating);
      if (btnValue <= this.ratingValue) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  handleFeedbackStarClick(event) {
    if (this.ratingSubmitted) {
      return;
    }
    const btn = event.target.closest('button[data-rating]');
    if (!btn) {
      return;
    }
    const value = Number(btn.dataset.rating);
    if (Number.isFinite(value)) {
      this.ratingValue = value;
      this.updateFeedbackStars();
      if (this.feedbackStatusEl) {
        this.feedbackStatusEl.textContent = '';
      }
    }
  }

  async submitDriverFeedback() {
    if (this.ratingSubmitted) {
      return;
    }

    const ratingRide = this.currentRide || this.lastCompletedRide;
    if (!ratingRide || !ratingRide.id) {
      if (this.feedbackStatusEl) {
        this.feedbackStatusEl.textContent = 'No completed ride to rate.';
      }
      return;
    }

    if (this.ratingValue < 1) {
      if (this.feedbackStatusEl) {
        this.feedbackStatusEl.textContent = 'Select a star rating first.';
      }
      return;
    }

    try {
      if (this.feedbackSubmitBtn) {
        this.feedbackSubmitBtn.disabled = true;
      }
      if (this.feedbackStatusEl) {
        this.feedbackStatusEl.textContent = 'Submitting feedback…';
      }

      const targetKey = ratingRide?.rider?.pubkey || ratingRide?.rider?.npub;
      const notes = this.feedbackNotesEl?.value || '';
      const ratingEvent = buildDriverRatingEvent({
        rideId: ratingRide.id,
        targetKey,
        rating: this.ratingValue,
        notes
      });

      const response = await fetch(`/api/rides/${ratingRide.id}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: ratingEvent })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || response.statusText);
      }

      const payload = await response.json().catch(() => ({}));
      if (Array.isArray(payload?.relay_statuses) && payload.relay_statuses.length) {
        console.debug('[Driver] Rating relay statuses', payload.relay_statuses);
      }

      this.ratingSubmitted = true;
      if (this.feedbackStatusEl) {
        this.feedbackStatusEl.textContent = payload?.cached_locally
          ? 'Feedback queued locally — will publish when relay reachable.'
          : 'Feedback sent.';
      }
      if (this.feedbackSubmitBtn) {
        this.feedbackSubmitBtn.disabled = true;
      }
      if (this.feedbackNotesEl) {
        this.feedbackNotesEl.disabled = true;
      }
      if (this.feedbackStars) {
        this.feedbackStars.querySelectorAll('button').forEach((btn) => {
          btn.disabled = true;
        });
      }
      const riderNpub = ratingRide?.rider?.npub;
      if (riderNpub) {
        reputationCache.delete(riderNpub.toLowerCase());
        fetchReputationProfile(riderNpub).then((profile) => {
          this.updateRiderReputationDisplay(profile);
        });
      }

      this.lastCompletedRide = null;
    } catch (error) {
      console.error('Failed to submit driver feedback', error);
      if (this.feedbackStatusEl) {
        this.feedbackStatusEl.textContent = `Failed to submit feedback: ${error.message}`;
      }
      if (this.feedbackSubmitBtn) {
        this.feedbackSubmitBtn.disabled = false;
      }
    }
  }

  updateDriverStreamPanel(total, fare) {
    if (!this.streamPanel) {
      return;
    }

    const effectiveFare = fare || this.streamState?.fare || 0;
    this.streamPanel.style.display = 'block';
    if (this.streamPaidEl) {
      this.streamPaidEl.textContent = `${Math.min(total, effectiveFare).toLocaleString()} sats`;
    }
    if (this.streamRemainingEl) {
      const remaining = Math.max(0, effectiveFare - total);
      this.streamRemainingEl.textContent = `${remaining.toLocaleString()} sats`;
    }
  }

  handleStreamPayment(message) {
    if (!this.currentRide || message.ride_id !== this.currentRide.id) {
      return;
    }

    this.showDriverStreamPanel();
    const total = message.total_paid_sats || 0;
    const fare = message.fare_sats || this.currentRide.fare || 0;
    if (this.currentRide && message.fare_sats) {
      this.currentRide.fare = message.fare_sats;
    }
    this.streamState = {
      total,
      remaining: Math.max(0, fare - total),
      fare
    };

    this.updateDriverStreamPanel(total, fare);
    this.updateRideStatus({
      status: 'Driving to destination',
      earnings: `${Math.min(total, fare).toLocaleString()} sats`
    });
  }

  showSafetyPanel(message = 'Safety tools armed.', resetButton = true) {
    if (this.safetyPanel) {
      this.safetyPanel.classList.add('active');
    }
    if (resetButton && this.panicBtn) {
      this.panicBtn.disabled = false;
    }
    this.updateSafetyStatus(message, 'info');
  }

  hideSafetyPanel() {
    if (this.safetyPanel) {
      this.safetyPanel.classList.remove('active');
    }
    if (this.panicBtn) {
      this.panicBtn.disabled = false;
    }
    if (this.safetyStatusEl) {
      this.safetyStatusEl.className = 'driver-safety-status';
      this.safetyStatusEl.textContent = '';
    }
  }

  updateSafetyStatus(message, tone = 'info') {
    if (!this.safetyStatusEl) {
      return;
    }
    const className = tone ? `driver-safety-status ${tone}` : 'driver-safety-status';
    this.safetyStatusEl.className = className;
    this.safetyStatusEl.textContent = message;
  }

  async triggerDriverPanic() {
    this.showSafetyPanel(undefined, false);

    if (!this.currentRide || !this.currentRide.id) {
      this.updateSafetyStatus('No active ride to escalate.', 'alert');
      return;
    }

    if (this.panicBtn) {
      this.panicBtn.disabled = true;
    }
    this.updateSafetyStatus('Sending emergency alert…', 'info');

    try {
      const targetKey = this.currentRide?.rider?.npub || this.currentRide?.rider?.pubkey;
      const panicEvent = buildDriverPanicEvent({
        rideId: this.currentRide.id,
        note: 'driver_manual',
        targetKey
      });

      const response = await fetch(`/api/rides/${this.currentRide.id}/panic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: panicEvent })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || response.statusText);
      }

      const payload = await response.json().catch(() => ({}));
      if (Array.isArray(payload?.relay_statuses) && payload.relay_statuses.length) {
        console.debug('[Driver] Panic relay statuses', payload.relay_statuses);
      }
      this.handlePanicAlert({
        ride_id: this.currentRide.id,
        initiated_by: panicEvent.pubkey,
        relay_statuses: payload?.relay_statuses,
        cached_locally: payload?.cached_locally
      });

      const statusMessage = payload?.cached_locally
        ? 'Emergency alert queued locally — dispatcher offline, retrying.'
        : 'Emergency alert sent. Await instructions.';
      this.updateSafetyStatus(statusMessage, 'alert');
    } catch (error) {
      console.error('Driver panic alert failed', error);
      this.updateSafetyStatus(`Failed to send alert: ${error.message}`, 'alert');
      if (this.panicBtn) {
        this.panicBtn.disabled = false;
      }
    }
  }

  handlePanicAlert(message) {
    const rideId = message?.ride_id;
    const initiator = (message?.initiated_by || '').toLowerCase();
    let alertSource = 'dispatch';
    if (initiator) {
      if (initiator === DRIVER_PROFILE.npub.toLowerCase()) {
        alertSource = 'driver';
      } else {
        alertSource = 'rider';
      }
    }
    const cachedFlag = !!message?.cached_locally;
    const statusCopy = cachedFlag
      ? `Emergency alert queued (${alertSource}). Await relay connectivity.`
      : `Emergency alert triggered by ${alertSource}.`;
    this.showError(`Emergency alert triggered by ${alertSource}. Hold position.`);
    this.showSafetyPanel(undefined, false);
    this.updateSafetyStatus(statusCopy, cachedFlag ? 'warning' : 'alert');

    if (this.currentRide && rideId === this.currentRide.id) {
      this.stopMovement();
      this.hideDriverControls();
      this.hideDriverStreamPanel();
      this.currentRide.status = 'panic';
      this.pendingArrival = false;
      this.waitingForTripStart = false;
      this.updateRideStatus({
        status: 'Emergency — await instructions',
        distance: '-',
        eta: '-',
        earnings: this.streamState?.total
          ? `${Math.min(this.streamState.total, this.streamState.fare || 0).toLocaleString()} sats`
          : '-'
      });
    }
  }

  handleSafetyUpdate(message) {
    if (!message) {
      return;
    }
    if (this.currentRide && message.ride_id && message.ride_id !== this.currentRide.id) {
      return;
    }
    if (message.status === 'ok') {
      this.showSuccess('Rider confirmed safety check.');
      this.updateSafetyStatus('Rider confirmed safety check.', 'success');
    } else if (message.status === 'missed') {
      this.showError('Dispatch flagged a missed safety check — reach out to rider.');
      this.updateSafetyStatus('Dispatch flagged a missed check-in.', 'alert');
    }
  }

  async confirmDriverStake() {
    if (!this.currentRide || !this.pendingDriverStake) {
      return;
    }

    try {
      if (this.stakeConfirmBtn) {
        this.stakeConfirmBtn.disabled = true;
        this.stakeConfirmBtn.textContent = 'Verifying...';
      }

      const stakeResp = await fetch(`/rides/${this.currentRide.id}/driver-stake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentProof: 'demo_proof' })
      });

      if (!stakeResp.ok) {
        const err = await stakeResp.json().catch(() => ({}));
        throw new Error(err.error || stakeResp.statusText);
      }

      const response = await fetch(`/api/rides/${this.currentRide.id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_npub: DRIVER_PROFILE.npub,
          driver_name: DRIVER_PROFILE.name,
          driver_location: {
            lat: this.driverMarker.getLatLng().lat,
            lon: this.driverMarker.getLatLng().lng
          },
          driver_rating: DRIVER_PROFILE.rating
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || response.statusText);
      }

      const result = await response.json();
      this.currentRide = {
        ...this.currentRide,
        ...result.ride
      };
      this.currentRide.fare = result.ride?.fare || this.currentRide.fare;
      this.currentRide.currency = result.ride?.currency || this.currentRide.currency || currencyPreference;
      this.earnings.currency = this.currentRide.currency || currencyPreference;
      this.currentRide.stage = 'to_pickup';
      this.currentRide.status = 'en_route';
      this.currentRide.driver_route = result.driver_route || null;
      this.currentRide.pickupEtaSeconds = result.eta_seconds || null;
      this.pendingDriverStake = null;

      if (this.riderReputationEl) {
        this.riderReputationEl.textContent = 'Loading…';
      }
      const riderNpub = this.currentRide.rider?.npub;
      if (riderNpub) {
        fetchReputationProfile(riderNpub).then((profile) => {
          this.updateRiderReputationDisplay(profile);
        });
      } else {
        this.updateRiderReputationDisplay(null);
      }

      this.hideDriverStakePanel();
      this.showActiveRidePanel();
      this.startStageToPickup();
      this.showSuccess('Stake locked. Heading to pickup.');
    } catch (error) {
      console.error('Driver stake confirmation failed', error);
      this.showError(`Stake confirmation failed: ${error.message}`);
      if (this.stakeConfirmBtn) {
        this.stakeConfirmBtn.disabled = false;
        this.stakeConfirmBtn.textContent = '✅ Stake Paid';
      }
    }
  }

  removeMarker(marker) {
    if (marker) {
      this.map.removeLayer(marker);
    }
  }

  removePolyline(polyline) {
    if (polyline) {
      this.map.removeLayer(polyline);
    }
  }

  drawDriverRoute(route, color) {
    this.removePolyline(this.driverRouteLine);
    this.driverRouteLine = L.polyline(route, {
      color,
      weight: 4,
      opacity: 0.8,
      dashArray: '8,5'
    }).addTo(this.map);

    this.placePickupMarker();
    this.map.fitBounds(this.driverRouteLine.getBounds(), { padding: [40, 40] });
  }

  drawTripRoute(route, color) {
    this.removePolyline(this.tripRouteLine);
    this.tripRouteLine = L.polyline(route, {
      color,
      weight: 5,
      opacity: 0.9
    }).addTo(this.map);

    this.placeDropoffMarker();
    const bounds = this.tripRouteLine.getBounds();
    if (this.driverRouteLine) {
      bounds.extend(this.driverRouteLine.getBounds());
    }
    this.map.fitBounds(bounds, { padding: [40, 40] });
  }

  placePickupMarker() {
    this.removeMarker(this.pickupMarker);
    this.pickupMarker = L.marker([this.currentRide.pickup.lat, this.currentRide.pickup.lon], {
      icon: L.divIcon({
        className: 'marker-icon pickup-marker',
        html: '📍',
        iconSize: [30, 30]
      })
    }).addTo(this.map).bindPopup('Pickup');
  }

  placeDropoffMarker() {
    this.removeMarker(this.dropoffMarker);
    this.dropoffMarker = L.marker([this.currentRide.dropoff.lat, this.currentRide.dropoff.lon], {
      icon: L.divIcon({
        className: 'marker-icon dropoff-marker',
        html: '🎯',
        iconSize: [30, 30]
      })
    }).addTo(this.map).bindPopup('Dropoff');
  }

  prepareRouteMeta(route) {
    let total = 0;
    const segments = [];

    for (let i = 0; i < route.length - 1; i++) {
      const start = route[i];
      const end = route[i + 1];
      const distance = this.haversine(start[0], start[1], end[0], end[1]) * 1000;
      segments.push({
        start,
        end,
        cumulativeStart: total,
        length: distance
      });
      total += distance;
    }

    return { totalDistance: total, segments };
  }

  interpolatePosition(distance) {
    const { segments, totalDistance } = this.activeRouteMeta;
    if (!segments || segments.length === 0) return null;

    if (distance >= totalDistance) {
      const last = segments[segments.length - 1].end;
      return { lat: last[0], lon: last[1] };
    }

    for (const segment of segments) {
      if (distance <= segment.cumulativeStart + segment.length) {
        const ratio = segment.length === 0
          ? 1
          : (distance - segment.cumulativeStart) / segment.length;
        const lat = segment.start[0] + (segment.end[0] - segment.start[0]) * ratio;
        const lon = segment.start[1] + (segment.end[1] - segment.start[1]) * ratio;
        return { lat, lon };
      }
    }

    const last = segments[segments.length - 1].end;
    return { lat: last[0], lon: last[1] };
  }

  transformRoute(route) {
    if (!route || !Array.isArray(route) || route.length === 0) return null;

    return route.map((point) => {
      if (Array.isArray(point) && point.length === 2) {
        return [point[1], point[0]];
      }
      if (point && typeof point.lat === 'number' && typeof point.lon === 'number') {
        return [point.lat, point.lon];
      }
      return null;
    }).filter(Boolean);
  }

  showError(message) {
    this.updateToast(message, 'error');
  }

  showSuccess(message) {
    this.updateToast(message, 'success');
  }

  updateToast(message, type) {
    const statusLabel = document.getElementById('driver-network-status');
    if (!statusLabel) return;

    statusLabel.textContent = message;
    statusLabel.style.color = type === 'error' ? '#ff6b6b' : '#00ff90';
    setTimeout(() => {
      statusLabel.textContent = this.isOnline ? 'Connected' : 'Offline';
      statusLabel.style.color = this.isOnline ? '#00ff90' : '#666';
    }, 4000);
  }

  updateEarningsDisplay({ total, rides }) {
    const symbol = getCurrencySymbol(this.earnings?.currency || currencyPreference);
    const safeTotal = Number.isFinite(total) ? total : 0;
    const avg = rides > 0 ? safeTotal / rides : 0;
    document.getElementById('total-earned').textContent = `${symbol}${safeTotal.toFixed(2)}`;
    document.getElementById('rides-count').textContent = rides;
    document.getElementById('avg-per-ride').textContent = rides > 0 ? `${symbol}${avg.toFixed(2)}` : `${symbol}0.00`;
  }

  handleRideCancelled(message) {
    const rideId = message.ride_id || message?.ride?.id;
    if (this.currentRide && this.currentRide.id === rideId) {
      this.showError('Ride cancelled by rider');
      this.clearActiveRide();
      this.currentRide = null;
      this.showWaitingState(true);
    } else {
      if (rideId) {
        this.pendingRides.delete(rideId);
      }
      this.renderRideCards();
    }
  }

  clearRequests() {
    this.pendingRides.clear();
    this.renderRideCards();
  }

  updateOnlineToggle(isOnline) {
    const btn = document.getElementById('toggle-online');
    if (!btn) return;

    const label = document.getElementById('toggle-online-label');
    const dot = btn.querySelector('.status-dot');
    btn.classList.toggle('active', isOnline);
    if (label) {
      label.textContent = isOnline ? 'Go Offline' : 'Go Online';
    }
    if (dot) {
      dot.classList.toggle('offline', !isOnline);
    }
  }

  setNetworkStatus(text, color) {
    const statusLabel = document.getElementById('driver-network-status');
    if (statusLabel) {
      statusLabel.textContent = text;
      statusLabel.style.color = color;
    }
  }

  hideWaitingSections() {
    document.getElementById('waiting-section').style.display = 'none';
  }

  showWaitingSections() {
    document.getElementById('waiting-section').style.display = 'block';
  }

  // Basic Haversine distance in km
  haversine(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => deg * (Math.PI / 180);
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new DriverApp();
  app.init();
});
