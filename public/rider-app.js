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

const riderNpub = riderPubKey && nip19
  ? nip19.npubEncode(riderPubKey)
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
const streamPanelEl = document.getElementById('stream-panel');
const streamPaidEl = document.getElementById('stream-paid');
const streamRemainingEl = document.getElementById('stream-remaining');
const streamLastEl = document.getElementById('stream-last');
const safetyPanelEl = document.getElementById('safety-panel');
const panicBtn = document.getElementById('panic-button');
const checkinBtn = document.getElementById('checkin-button');
const safetyCountdownEl = document.getElementById('safety-countdown');
const safetyStatusEl = document.getElementById('safety-status');
const panicModalEl = document.getElementById('panic-modal');
const panicConfirmBtn = document.getElementById('panic-confirm-btn');
const panicCancelBtn = document.getElementById('panic-cancel-btn');
const checkinModalEl = document.getElementById('checkin-modal');
const checkinOkBtn = document.getElementById('checkin-ok-btn');
const checkinAlertBtn = document.getElementById('checkin-alert-btn');
const completionPanelEl = document.getElementById('completion-panel');
const completionFareEl = document.getElementById('completion-fare');
const completionDistanceEl = document.getElementById('completion-distance');
const completionDurationEl = document.getElementById('completion-duration');
const completionCloseBtn = document.getElementById('completion-close-btn');
const riderRatingPanel = document.getElementById('rider-rating-panel');
const riderRatingStars = document.getElementById('rider-rating-stars');
const riderRatingSubmitBtn = document.getElementById('rider-rating-submit-btn');
const riderRatingStatusEl = document.getElementById('rider-rating-status');
const riderRatingNotesEl = document.getElementById('rider-rating-notes');
const riderFlagSafetyEl = document.getElementById('rider-flag-safety');
const driverRatingEl = document.getElementById('driver-rating');
const rideCancelBtn = document.getElementById('ride-cancel-btn');
if (rideCancelBtn) {
  rideCancelBtn.classList.add('hidden');
  rideCancelBtn.disabled = true;
}

let riderRatingValue = 0;
let riderRatingSubmitted = false;
const unitSelectEl = document.getElementById('unit-select');
const currencySelectEl = document.getElementById('currency-select');

let streamState = { totalPaid: 0, fare: 0, lastAmount: 0 };

const SAFETY_CHECK_INTERVAL_MS = 120000;
const SAFETY_RESPONSE_TIMEOUT_MS = 20000;

let safetyCheckTimer = null;
let safetyCountdownInterval = null;
let safetyResponseTimer = null;
let nextSafetyDeadline = null;
let pendingSafetyPrompt = false;
let safetyMode = 'idle';
const reputationCache = new Map();

const UNIT_PREFERENCE_KEY = 'donkeyride.pref.unit';
const CURRENCY_PREFERENCE_KEY = 'donkeyride.pref.currency';
const ACTIVE_RIDE_STORAGE_KEY = 'donkeyride.state.activeRideId';
const DEFAULT_UNIT = 'mi';
const DEFAULT_CURRENCY = 'GBP';

let distanceUnit = (window.localStorage.getItem(UNIT_PREFERENCE_KEY) || DEFAULT_UNIT).toLowerCase();
if (distanceUnit !== 'km' && distanceUnit !== 'mi') {
  distanceUnit = DEFAULT_UNIT;
}

let currencyPreference = (window.localStorage.getItem(CURRENCY_PREFERENCE_KEY) || DEFAULT_CURRENCY).toUpperCase();
if (!['USD', 'EUR', 'GBP'].includes(currencyPreference)) {
  currencyPreference = DEFAULT_CURRENCY;
}

if (unitSelectEl) {
  unitSelectEl.value = distanceUnit;
}
if (currencySelectEl) {
  currencySelectEl.value = currencyPreference;
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

function updateDriverReputationDisplay(profile) {
  if (!driverRatingEl) {
    return;
  }
  if (!profile) {
    driverRatingEl.textContent = 'No ratings yet';
    return;
  }
  const rounded = profile.averageRating ? Number(profile.averageRating).toFixed(2) : '0.00';
  driverRatingEl.textContent = `${rounded} (${profile.ratingsCount} ratings)`;
}

function normaliseHexKey(key) {
  if (!key) {
    return null;
  }
  const trimmed = key.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (nip19) {
    try {
      const decoded = nip19.decode(trimmed);
      if (typeof decoded.data === 'string') {
        return decoded.data.toLowerCase();
      }
      if (decoded.data?.data && typeof decoded.data.data === 'string') {
        return decoded.data.data.toLowerCase();
      }
    } catch (error) {
      console.warn('Failed to decode npub', error);
    }
  }
  return null;
}

function rememberActiveRide(rideId) {
  if (!rideId || typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(ACTIVE_RIDE_STORAGE_KEY, rideId);
  } catch (error) {
    console.warn('Failed to persist active ride id', error);
  }
}

function forgetActiveRide() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.removeItem(ACTIVE_RIDE_STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear active ride id', error);
  }
}

function getStoredActiveRideId() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  try {
    return window.localStorage.getItem(ACTIVE_RIDE_STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to read active ride id', error);
    return null;
  }
}

function setRideCancelVisible(visible) {
  if (!rideCancelBtn) {
    return;
  }
  rideCancelBtn.classList.toggle('hidden', !visible);
  rideCancelBtn.disabled = !visible;
}

function renderRideMarkers(ride) {
  if (!map || !ride) {
    return;
  }

  if (pickupMarker) {
    map.removeLayer(pickupMarker);
    pickupMarker = null;
  }
  if (dropoffMarker) {
    map.removeLayer(dropoffMarker);
    dropoffMarker = null;
  }

  if (ride.pickup) {
    pickup = {
      lat: Number(ride.pickup.lat),
      lon: Number(ride.pickup.lon)
    };
    pickupMarker = L.marker([pickup.lat, pickup.lon], {
      icon: L.divIcon({
        className: 'marker-icon pickup-marker',
        html: '📍',
        iconSize: [30, 30]
      })
    }).addTo(map);
  }

  if (ride.dropoff) {
    dropoff = {
      lat: Number(ride.dropoff.lat),
      lon: Number(ride.dropoff.lon)
    };
    dropoffMarker = L.marker([dropoff.lat, dropoff.lon], {
      icon: L.divIcon({
        className: 'marker-icon dropoff-marker',
        html: '🎯',
        iconSize: [30, 30]
      })
    }).addTo(map);
  }

  if (pickup && dropoff) {
    map.fitBounds([
      [pickup.lat, pickup.lon],
      [dropoff.lat, dropoff.lon]
    ], { padding: [50, 50] });
  } else if (pickup) {
    map.setView([pickup.lat, pickup.lon], 14);
  }
}

function buildRatingEvent({ rideId, targetKey, rating, role, notes, safetyFlag }) {
  const targetHex = normaliseHexKey(targetKey);
  if (!targetHex) {
    throw new Error('Unknown rating target');
  }
  if (!riderPubKey || !riderPrivKey) {
    throw new Error('Rider key unavailable for signing');
  }

  const event = {
    kind: 30530,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['ride', rideId],
      ['p', targetHex],
      ['rating', String(rating)],
      ['role', role]
    ],
    content: notes || ''
  };

  if (safetyFlag) {
    event.tags.push(['safety', safetyFlag]);
  }

  event.pubkey = riderPubKey;
  event.id = getEventHash(event);
  event.sig = getSignature(event, riderPrivKey);
  return event;
}

function buildPanicEvent({ rideId, role, note, targetKey }) {
  const pubkey = riderPubKey;
  const privKey = riderPrivKey;
  if (!pubkey || !privKey) {
    throw new Error('Missing signing key');
  }
  const tags = [
    ['ride', rideId],
    ['role', role]
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
  event.pubkey = pubkey;
  event.id = getEventHash(event);
  event.sig = getSignature(event, privKey);
  return event;
}

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
      fareAmount: fareSats,
      currency: currencyPreference
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

function showStreamPanel(fareSats = null, reset = false) {
  if (!streamPanelEl) {
    return;
  }

  if (typeof fareSats === 'number') {
    streamState.fare = fareSats;
  }

  if (reset) {
    streamState.totalPaid = 0;
    streamState.lastAmount = 0;
  }

  streamPanelEl.classList.remove('hidden');
  updateStreamPanel({
    total_paid_sats: streamState.totalPaid,
    fare_sats: streamState.fare,
    amount_sats: reset ? 0 : streamState.lastAmount
  });
}

function hideStreamPanel() {
  if (!streamPanelEl) {
    return;
  }
  streamPanelEl.classList.add('hidden');
  if (streamPaidEl) streamPaidEl.textContent = '0 sats';
  if (streamRemainingEl) streamRemainingEl.textContent = '—';
  if (streamLastEl) streamLastEl.textContent = '—';
  streamState = { totalPaid: 0, fare: 0, lastAmount: 0 };
}

function updateStreamPanel({ total_paid_sats, fare_sats, amount_sats }) {
  streamState.totalPaid = typeof total_paid_sats === 'number' ? total_paid_sats : streamState.totalPaid;
  streamState.fare = typeof fare_sats === 'number' ? fare_sats : streamState.fare;

  if (typeof amount_sats === 'number') {
    streamState.lastAmount = amount_sats;
  }

  if (streamPanelEl) {
    streamPanelEl.classList.remove('hidden');
  }
  if (streamPaidEl) {
    streamPaidEl.textContent = `${streamState.totalPaid.toLocaleString()} sats`;
  }
  if (streamRemainingEl) {
    const remaining = Math.max(0, streamState.fare - streamState.totalPaid);
    streamRemainingEl.textContent = `${remaining.toLocaleString()} sats`;
  }
  if (streamLastEl) {
    const lastAmount = typeof amount_sats === 'number' ? amount_sats : streamState.lastAmount;
    streamLastEl.textContent = lastAmount != null ? `${lastAmount.toLocaleString()} sats` : '—';
  }
}

function setSafetyStatus(message, tone = 'info') {
  if (!safetyStatusEl) {
    return;
  }
  safetyStatusEl.textContent = message;
  safetyStatusEl.className = `safety-status-text ${tone}`;
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function updateSafetyCountdown() {
  if (!safetyCountdownEl) {
    return;
  }
  if (!nextSafetyDeadline) {
    safetyCountdownEl.textContent = pendingSafetyPrompt ? 'Awaiting response…' : '';
    return;
  }
  const remaining = Math.max(0, nextSafetyDeadline - Date.now());
  if (remaining === 0) {
    safetyCountdownEl.textContent = 'Awaiting response…';
  } else {
    safetyCountdownEl.textContent = `Next check-in in ${formatCountdown(remaining)}`;
  }
}

function clearSafetyTimers() {
  if (safetyCheckTimer) {
    clearTimeout(safetyCheckTimer);
    safetyCheckTimer = null;
  }
  if (safetyCountdownInterval) {
    clearInterval(safetyCountdownInterval);
    safetyCountdownInterval = null;
  }
  if (safetyResponseTimer) {
    clearTimeout(safetyResponseTimer);
    safetyResponseTimer = null;
  }
  nextSafetyDeadline = null;
  pendingSafetyPrompt = false;
}

function showSafetyPanel() {
  if (safetyPanelEl) {
    safetyPanelEl.classList.remove('hidden');
  }
}

function hideSafetyPanel() {
  clearSafetyTimers();
  if (safetyPanelEl) {
    safetyPanelEl.classList.add('hidden');
  }
  hidePanicModal();
  hideCheckinModal();
  if (safetyStatusEl) {
    safetyStatusEl.textContent = '';
    safetyStatusEl.className = 'safety-status-text';
  }
  if (safetyCountdownEl) {
    safetyCountdownEl.textContent = '';
  }
  safetyMode = 'idle';
}

function enableSafetyStandby() {
  showSafetyPanel();
  clearSafetyTimers();
  safetyMode = 'standby';
  setSafetyStatus('Driver en route — safety tools armed.', 'info');
  if (safetyCountdownEl) {
    safetyCountdownEl.textContent = 'Check-ins start when the trip begins';
  }
}

function startSafetyMonitoring() {
  showSafetyPanel();
  safetyMode = 'active';
  setSafetyStatus('Trip in progress — we will check in every 2 minutes.', 'success');
  scheduleSafetyCheck(SAFETY_CHECK_INTERVAL_MS);
}

function stopSafetyMonitoring() {
  clearSafetyTimers();
  safetyMode = 'idle';
  if (safetyCountdownEl) {
    safetyCountdownEl.textContent = '';
  }
  pendingSafetyPrompt = false;
}

function scheduleSafetyCheck(delayMs = SAFETY_CHECK_INTERVAL_MS) {
  if (safetyMode !== 'active') {
    return;
  }
  if (safetyCheckTimer) {
    clearTimeout(safetyCheckTimer);
  }
  safetyCheckTimer = setTimeout(() => promptSafetyCheck('auto'), delayMs);
  nextSafetyDeadline = Date.now() + delayMs;
  if (!safetyCountdownInterval) {
    safetyCountdownInterval = setInterval(updateSafetyCountdown, 1000);
  }
  updateSafetyCountdown();
}

function promptSafetyCheck(source = 'auto') {
  if (safetyMode !== 'active') {
    return;
  }
  pendingSafetyPrompt = true;
  nextSafetyDeadline = null;
  updateSafetyCountdown();
  setSafetyStatus('Quick safety check — confirm you are okay.', 'warning');
  showCheckinModal(source);
  if (safetyResponseTimer) {
    clearTimeout(safetyResponseTimer);
  }
  safetyResponseTimer = setTimeout(() => {
    pendingSafetyPrompt = false;
    setSafetyStatus('No response detected — escalating.', 'alert');
    triggerPanic('rider', 'check-in-timeout');
  }, SAFETY_RESPONSE_TIMEOUT_MS);
}

function showCheckinModal(source = 'auto') {
  if (!checkinModalEl) {
    return;
  }
  checkinModalEl.dataset.source = source;
  checkinModalEl.classList.remove('hidden');
}

function hideCheckinModal() {
  if (checkinModalEl) {
    checkinModalEl.classList.add('hidden');
    delete checkinModalEl.dataset.source;
  }
}

function showPanicModal() {
  if (panicModalEl) {
    panicModalEl.classList.remove('hidden');
  } else {
    triggerPanic('rider', 'modal-unavailable');
  }
}

function hidePanicModal() {
  if (panicModalEl) {
    panicModalEl.classList.add('hidden');
  }
}

async function sendSafetyCheck(status, source, note = '') {
  if (!currentRide || !currentRide.id) {
    return;
  }

  try {
    await fetch(`/api/rides/${currentRide.id}/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        source,
        note,
        by: riderPubKey || riderNpub
      })
    });
  } catch (error) {
    console.warn('Failed to record safety check', error);
  }
}

async function completeSafetyCheck(source = 'manual', note = '') {
  pendingSafetyPrompt = false;
  hideCheckinModal();
  if (safetyResponseTimer) {
    clearTimeout(safetyResponseTimer);
    safetyResponseTimer = null;
  }
  setSafetyStatus('Safety check acknowledged.', 'success');
  await sendSafetyCheck('ok', source, note);
  scheduleSafetyCheck(SAFETY_CHECK_INTERVAL_MS);
}

async function triggerPanic(initiatedBy = 'rider', note = '') {
  if (!currentRide || !currentRide.id) {
    updateStatus('No active ride to flag for emergency.', 'error');
    hidePanicModal();
    return;
  }

  if (panicBtn) {
    panicBtn.disabled = true;
  }

  stopSafetyMonitoring();
  hideCheckinModal();
  setSafetyStatus('Emergency alert dispatched. We froze the ride.', 'alert');

  try {
  const targetKey = currentRide?.driver?.pubkey || currentRide?.driver?.npub;
    const panicEvent = buildPanicEvent({
      rideId: currentRide.id,
      role: 'rider',
      note,
      targetKey
    });

    const response = await fetch(`/api/rides/${currentRide.id}/panic`, {
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
      console.debug('[Rider] Rating relay statuses', payload.relay_statuses);
    }
    const cached = !!payload?.cached_locally;
    const message = cached
      ? 'Emergency alert queued locally — dispatcher offline, retry pending.'
      : 'Emergency services notified. Ride paused.';
    updateStatus(message, 'error');
    setSafetyStatus(message, cached ? 'warning' : 'alert');
  } catch (error) {
    console.error('Failed to send panic alert', error);
    updateStatus(`Failed to send emergency alert: ${error.message}`, 'error');
    if (panicBtn) {
      panicBtn.disabled = false;
    }
  } finally {
    if (panicBtn) {
      panicBtn.disabled = false;
    }
    hidePanicModal();
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
      currency: currencyPreference
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

async function cancelActiveRide(reason = 'rider_cancelled') {
  if (!currentRide || !currentRide.id) {
    updateStatus('No active ride to cancel.', 'info');
    return;
  }

  const controls = [rideCancelBtn, stakeCancelBtn, stakePaidBtn].filter(Boolean);
  controls.forEach((btn) => {
    btn.disabled = true;
  });

  try {
    updateStatus('Cancelling ride...', 'waiting');
    const cancelledBy = (riderPubKey || riderNpub || 'rider').toLowerCase();
    const response = await fetch(`/rides/${currentRide.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cancelledBy,
        reason
      })
    });

    if (!response.ok) {
      if (response.status === 404) {
        forgetActiveRide();
        resetRide();
        updateStatus('Ride session already closed.', 'info');
        return;
      }
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || response.statusText);
    }

    const payload = await response.json().catch(() => ({}));
    const penalty = Number(payload?.penalty || 0);
    const refund = Number(payload?.refund || 0);
    forgetActiveRide();
    hideStreamPanel();
    stopSafetyMonitoring();
    setSafetyStatus('Ride cancelled.', 'info');
    let tone = 'info';
    let message = 'Ride cancelled.';
    if (reason === 'stake_unpaid') {
      message = 'Ride cancelled before stake payment — no sats locked.';
    } else if (refund > 0 && penalty <= 0) {
      message = `Ride cancelled. Stake refunded (${refund.toLocaleString()} sats).`;
      tone = 'success';
    } else if (penalty > 0) {
      message = `Ride cancelled. ${penalty.toLocaleString()} sats forfeited.`;
      if (refund > 0) {
        message += ` Refund: ${refund.toLocaleString()} sats.`;
      }
      tone = 'warning';
    }
    updateStatus(message, tone);
    resetRide();
  } catch (error) {
    console.error('Failed to cancel ride', error);
    updateStatus(`Failed to cancel ride: ${error.message}`, 'error');
  } finally {
    controls.forEach((btn) => {
      if (btn) {
        btn.disabled = false;
      }
    });
  }
}

async function cancelStakeFlow() {
  if (!currentRide || !currentRide.id) {
    updateStatus('Ride cancelled before stake payment.', 'info');
    resetRide();
    return;
  }
  await cancelActiveRide('stake_unpaid');
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
        fare_sats: currentRide.estimate?.fare?.sats,
        currency: currencyPreference
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
    currentRide.currency = data.currency || currentRide.currency || currencyPreference;
    streamState = { totalPaid: 0, fare: currentRide.fare || 0, lastAmount: 0 };

    hideStakePanel();
    rememberActiveRide(currentRide.id);
    setRideCancelVisible(true);

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
      updateStatus(`Ready to request ride! Route: ${formatDistance(data.distance_km)}, ~${data.duration_minutes} min`, 'success');
      console.log(`Route preview: ${formatDistance(data.distance_km)} (${data.distance_km.toFixed(1)} km raw), ${data.duration_minutes} min, ${data.points} points`);
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
      stake: session,
      currency: currencyPreference
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
    case 'ride_cancelled': {
      const cancelledBy = (message.cancelledBy || '').toLowerCase();
      const identifiers = [
        (riderPubKey || '').toLowerCase(),
        (riderNpub || '').toLowerCase(),
        'rider'
      ];
      const isSelf = identifiers.includes(cancelledBy);
      const tone = isSelf ? 'info' : 'error';
      const text = isSelf ? 'Ride cancelled.' : 'Ride cancelled by driver.';
      updateStatus(text, tone);
      forgetActiveRide();
      hideStreamPanel();
      stopSafetyMonitoring();
      setSafetyStatus('Ride cancelled.', 'info');
      setRideCancelVisible(false);
      setTimeout(() => resetRide(), 400);
      break;
    }
    case 'stream_payment':
      handleStreamPayment(message);
      break;
    case 'panic_alert':
      handlePanicAlert(message);
      break;
    case 'safety_check_update':
      handleSafetyCheckUpdate(message);
      break;
    case 'rating_submitted':
      if (message.role === 'driver' && currentRide?.driver?.npub) {
        fetchReputationProfile(currentRide.driver.npub).then(profile => updateDriverReputationDisplay(profile));
      }
      break;
  }
}

// Handle ride matched
function handleRideMatched(ride) {
  currentRide.driver = ride.driver;
  currentRide.eta = ride.eta_seconds;
  rememberActiveRide(currentRide.id);
  setRideCancelVisible(false);

  updateStatus(`Driver ${ride.driver.name} is on the way!`, 'success');
  enableSafetyStandby();

  document.getElementById('driver-name').textContent = `🚗 ${ride.driver.name}`;
  const driverRatingLine = document.querySelector('.driver-rating-line');
  if (driverRatingLine) {
    driverRatingLine.classList.remove('hidden');
  }
  document.getElementById('ride-status').textContent = 'Driver en route to pickup';

  updateETA(ride.eta_seconds);

  if (ride.driver?.npub) {
    fetchReputationProfile(ride.driver.npub).then(profile => {
      updateDriverReputationDisplay(profile);
    });
  } else {
    updateDriverReputationDisplay(null);
  }

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
  if (currentRide) {
    currentRide.status = 'arrived';
  }
  document.getElementById('ride-status').textContent = 'Driver arrived - waiting to begin trip';
  document.getElementById('eta-display').textContent = 'Arrived!';
}

// Handle trip started
function handleTripStarted() {
  rememberActiveRide(currentRide?.id);
  setRideCancelVisible(false);
  updateStatus('Trip started! Heading to destination...', 'success');
  document.getElementById('ride-status').textContent = 'Trip in progress';
  const fareSats = currentRide?.estimate?.fare?.sats || currentRide?.fare || streamState.fare;
  streamState = { totalPaid: 0, fare: fareSats || 0, lastAmount: 0 };
  showStreamPanel(streamState.fare, true);
  startSafetyMonitoring();

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
  forgetActiveRide();
  setRideCancelVisible(false);
  updateStatus('Trip completed! Thank you for riding with DonkeyRide!', 'success');
  document.getElementById('ride-status').textContent = 'Completed';
  document.getElementById('eta-display').textContent = '✅ Complete';
  hideStreamPanel();
  streamState = { totalPaid: 0, fare: 0, lastAmount: 0 };
  stopSafetyMonitoring();
  setSafetyStatus('Ride completed safely.', 'success');
  showCompletionPanel(message);
}

function handleStreamPayment(message) {
  if (!currentRide || message.ride_id !== currentRide.id) {
    return;
  }

  if (typeof message.fare_sats === 'number') {
    if (currentRide) {
      currentRide.fare = message.fare_sats;
    }
    streamState.fare = message.fare_sats;
  }
  updateStreamPanel(message);
  const totalDisplay = streamState.totalPaid.toLocaleString();
  document.getElementById('ride-status').textContent = `Trip in progress • ${totalDisplay} sats streamed`;
}

function handlePanicAlert(message) {
  showSafetyPanel();
  stopSafetyMonitoring();
  hideCheckinModal();
  const initiator = (message?.initiated_by || '').toLowerCase();
  const riderIdentifiers = [
    (riderPubKey || '').toLowerCase(),
    (riderNpub || '').toLowerCase(),
    'rider'
  ];
  const isSelf = riderIdentifiers.includes(initiator);
  const actorLabel = isSelf ? 'You' : 'Driver';
  setSafetyStatus(`Emergency alert triggered by ${actorLabel}. Support is on the way.`, 'alert');
  updateStatus('Emergency safety flow active. Stakes frozen until resolved.', 'error');
}

function handleSafetyCheckUpdate(message) {
  if (!message) {
    return;
  }
  showSafetyPanel();
  if (message.status === 'ok') {
    setSafetyStatus('Safety check acknowledged by dispatch.', 'success');
  } else if (message.status === 'missed') {
    setSafetyStatus('Dispatch flagged a missed check-in.', 'alert');
  }
}

function showCompletionPanel(message) {
  if (!completionPanelEl) {
    resetRide();
    return;
  }

  const fareSats = message?.payment?.amount_sats
    || message?.ride?.payment?.amount_sats
    || currentRide?.fare
    || currentRide?.estimate?.fare?.sats
    || 0;
  const fareDisplay = currentRide?.fareCost
    || (fareSats ? `${fareSats.toLocaleString()} sats` : '-');
  const distanceValue = currentRide?.distance
    || currentRide?.estimate?.distance?.km
    || message?.ride?.distance_km
    || 0;
  const durationSeconds = message?.ride?.duration;

  if (completionFareEl) {
    completionFareEl.textContent = fareDisplay;
  }
  if (completionDistanceEl) {
    completionDistanceEl.textContent = formatDistance(Number(distanceValue || 0));
  }
  if (completionDurationEl) {
    if (typeof durationSeconds === 'number') {
      const minutes = Math.max(1, Math.round(durationSeconds / 60));
      completionDurationEl.textContent = `${minutes} min`;
    } else {
      completionDurationEl.textContent = '-';
    }
  }

  riderRatingSubmitted = false;
  setRiderRating(0);
  if (riderRatingNotesEl) {
    riderRatingNotesEl.value = '';
    riderRatingNotesEl.disabled = false;
  }
  if (riderFlagSafetyEl) {
    riderFlagSafetyEl.checked = false;
    riderFlagSafetyEl.disabled = false;
  }
  if (riderRatingStars) {
    riderRatingStars.querySelectorAll('button').forEach((btn) => {
      btn.disabled = false;
    });
  }
  if (riderRatingSubmitBtn) {
    riderRatingSubmitBtn.disabled = false;
  }
  if (riderRatingStatusEl) {
    riderRatingStatusEl.textContent = '';
  }

  completionPanelEl.classList.remove('hidden');
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
  document.getElementById('ride-distance').textContent = formatDistance(distanceVal);
  document.getElementById('ride-status').textContent = 'Waiting for driver...';
  const driverNameEl = document.getElementById('driver-name');
  const driverRatingLine = document.querySelector('.driver-rating-line');
  if (driverNameEl) {
    if (currentRide?.driver?.name) {
      driverNameEl.textContent = `🚗 ${currentRide.driver.name}`;
    } else {
      driverNameEl.textContent = 'Searching for driver…';
    }
  }
  if (driverRatingLine) {
    driverRatingLine.classList.toggle('hidden', !currentRide?.driver);
  }
  setRideCancelVisible(!currentRide?.driver);
  updateDriverReputationDisplay(null);
}

function refreshDistanceDisplays() {
  if (!currentRide) {
    return;
  }

  const distanceKm = typeof currentRide.distance === 'number'
    ? currentRide.distance
    : (currentRide.estimate?.distance?.km || currentEstimate?.distance?.km || 0);
  const rideDistanceEl = document.getElementById('ride-distance');
  if (rideDistanceEl) {
    rideDistanceEl.textContent = formatDistance(distanceKm);
  }

  if (completionPanelEl && !completionPanelEl.classList.contains('hidden') && completionDistanceEl) {
    completionDistanceEl.textContent = formatDistance(distanceKm);
  }
}

function setRiderRating(value) {
  riderRatingValue = value;
  if (!riderRatingStars) {
    return;
  }
  const buttons = Array.from(riderRatingStars.querySelectorAll('button'));
  buttons.forEach((btn) => {
    const btnValue = Number(btn.dataset.rating);
    if (btnValue <= value) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  if (riderRatingStatusEl) {
    riderRatingStatusEl.textContent = '';
  }
}

async function submitRiderRating() {
  if (riderRatingSubmitted) {
    return;
  }
  if (!currentRide || !currentRide.id) {
    riderRatingStatusEl.textContent = 'No ride to rate yet.';
    return;
  }
  if (riderRatingValue < 1) {
    riderRatingStatusEl.textContent = 'Tap stars to select a rating.';
    return;
  }

  try {
    riderRatingSubmitBtn.disabled = true;
    riderRatingStatusEl.textContent = 'Submitting feedback…';

    const targetKey = currentRide?.driver?.npub || currentRide?.driver?.pubkey;
    const notes = riderRatingNotesEl?.value || '';
    const safetyFlag = riderFlagSafetyEl?.checked ? 'safety_issue' : null;
    const event = buildRatingEvent({
      rideId: currentRide.id,
      targetKey,
      rating: riderRatingValue,
      role: 'rider',
      notes,
      safetyFlag
    });

    const response = await fetch(`/api/rides/${currentRide.id}/rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || response.statusText);
    }

    const payload = await response.json().catch(() => ({}));
    if (Array.isArray(payload?.relay_statuses) && payload.relay_statuses.length) {
      console.debug('[Rider] Panic relay statuses', payload.relay_statuses);
    }

    riderRatingSubmitted = true;
    riderRatingSubmitBtn.disabled = true;
    if (riderRatingNotesEl) riderRatingNotesEl.disabled = true;
    if (riderFlagSafetyEl) riderFlagSafetyEl.disabled = true;
    if (riderRatingStars) {
      riderRatingStars.querySelectorAll('button').forEach((btn) => {
        btn.disabled = true;
      });
    }
    riderRatingStatusEl.textContent = payload?.cached_locally
      ? 'Feedback queued locally — we will publish when relays are reachable.'
      : 'Thank you! Your feedback was sent.';
    setTimeout(() => {
      riderRatingStatusEl.textContent = '';
    }, 4000);
    if (currentRide?.driver?.npub) {
      reputationCache.delete(currentRide.driver.npub.toLowerCase());
      fetchReputationProfile(currentRide.driver.npub).then(profile => updateDriverReputationDisplay(profile));
    }
  } catch (error) {
    console.error('Failed to submit rider rating', error);
    riderRatingStatusEl.textContent = `Could not submit feedback: ${error.message}`;
    riderRatingSubmitBtn.disabled = false;
  }
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
  forgetActiveRide();
  setRideCancelVisible(false);
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
  const driverRatingLine = document.querySelector('.driver-rating-line');
  if (driverRatingLine) {
    driverRatingLine.classList.add('hidden');
  }
  const driverNameEl = document.getElementById('driver-name');
  if (driverNameEl) {
    driverNameEl.textContent = '';
  }
  if (driverRatingEl) {
    driverRatingEl.textContent = '-';
  }

  updateStatus('Click on the map to set pickup (blue) and dropoff (red) locations', 'info');
  hideStakePanel();
  hideStreamPanel();
  hideSafetyPanel();
  if (completionPanelEl) {
    completionPanelEl.classList.add('hidden');
  }
  riderRatingSubmitted = false;
  setRiderRating(0);
  if (riderRatingStatusEl) {
    riderRatingStatusEl.textContent = '';
  }
  if (riderRatingSubmitBtn) {
    riderRatingSubmitBtn.disabled = false;
  }
  if (riderRatingNotesEl) {
    riderRatingNotesEl.value = '';
    riderRatingNotesEl.disabled = false;
  }
  if (riderFlagSafetyEl) {
    riderFlagSafetyEl.checked = false;
    riderFlagSafetyEl.disabled = false;
  }
  if (riderRatingStars) {
    riderRatingStars.querySelectorAll('button').forEach(btn => {
      btn.disabled = false;
    });
  }
  streamState = { totalPaid: 0, fare: 0, lastAmount: 0 };
  if (stakePaidBtn) {
    stakePaidBtn.disabled = false;
    stakePaidBtn.textContent = '✅ I’ve paid the stake';
  }

  // Reset map view
  map.setView([51.5074, -0.1278], 14);
}

async function restoreActiveRide() {
  const storedId = getStoredActiveRideId();
  if (!storedId || currentRide) {
    return;
  }

  try {
    const response = await fetch(`/api/rides/${storedId}`);
    if (!response.ok) {
      throw new Error(`Ride lookup failed (${response.status})`);
    }
    const data = await response.json();
    const ride = data?.ride;
    if (!data?.success || !ride) {
      throw new Error('Ride not found');
    }

    if (ride.status === 'completed' || ride.status === 'cancelled') {
      forgetActiveRide();
      return;
    }

    currentRide = {
      ...ride,
      id: ride.id || storedId,
      stage: ride.status
    };
    currentRide.fare = ride.fare || currentRide.fare;
    currentRide.fareCost = currentRide.fare
      ? `${Number(currentRide.fare).toLocaleString()} sats`
      : currentRide.fareCost || currentRide.estimate?.fare?.formatted || '-';
    currentRide.currency = ride.currency || currentRide.currency || currencyPreference;
    pickup = ride.pickup || null;
    dropoff = ride.dropoff || null;
    streamState = {
      totalPaid: ride.streaming?.totalPaid || 0,
      fare: ride.streaming?.fare || currentRide.fare || 0,
      lastAmount: ride.streaming?.lastAmount || 0
    };

    updateLocationDisplay();
    renderRideMarkers(ride);
    if (ride.route && ride.route.length > 0) {
      currentRide.route = ride.route;
      drawRoute(ride.route);
    }

    rememberActiveRide(currentRide.id);
    showRideInfo();
    const requestBtn = document.getElementById('request-btn');
    if (requestBtn) {
      requestBtn.disabled = true;
      requestBtn.textContent = 'Ride Requested';
    }
    connectWebSocket(currentRide.id);

    switch (ride.status) {
      case 'requested':
      case 'waiting_driver':
        setRideCancelVisible(true);
        updateStatus('Ride request pending — waiting for driver.', 'waiting');
        document.getElementById('ride-status').textContent = 'Waiting for driver...';
        break;
      case 'matched':
      case 'en_route':
        handleRideMatched(ride);
        break;
      case 'arrived':
        handleRideMatched(ride);
        handleDriverArrived();
        break;
      case 'active':
        handleRideMatched(ride);
        document.getElementById('ride-status').textContent = 'Trip in progress';
        if (ride.streaming) {
          streamState = {
            totalPaid: ride.streaming.totalPaid || 0,
            fare: ride.streaming.fare || ride.fare || currentRide.fare || 0,
            lastAmount: ride.streaming.lastAmount || 0
          };
          showStreamPanel(streamState.fare, false);
          updateStreamPanel({
            total_paid_sats: streamState.totalPaid,
            fare_sats: streamState.fare,
            amount_sats: streamState.lastAmount
          });
        }
        startSafetyMonitoring();
        break;
      default:
        updateStatus('Ride request restored.', 'info');
        break;
    }
  } catch (error) {
    console.warn('Failed to restore active ride', error);
    forgetActiveRide();
  }
}

// Event listeners
document.getElementById('request-btn').addEventListener('click', requestRide);
if (stakePaidBtn) {
  stakePaidBtn.addEventListener('click', confirmStakePayment);
}
if (stakeCancelBtn) {
  stakeCancelBtn.addEventListener('click', cancelStakeFlow);
}
if (rideCancelBtn) {
  rideCancelBtn.addEventListener('click', () => cancelActiveRide('rider_cancelled_pre_match'));
}
if (unitSelectEl) {
  unitSelectEl.addEventListener('change', (event) => {
    const newUnit = (event.target.value || DEFAULT_UNIT).toLowerCase();
    distanceUnit = newUnit === 'km' ? 'km' : 'mi';
    window.localStorage.setItem(UNIT_PREFERENCE_KEY, distanceUnit);
    refreshDistanceDisplays();
  });
}
if (currencySelectEl) {
  currencySelectEl.addEventListener('change', (event) => {
    const newCurrency = (event.target.value || DEFAULT_CURRENCY).toUpperCase();
    currencyPreference = ['USD', 'EUR', 'GBP'].includes(newCurrency) ? newCurrency : DEFAULT_CURRENCY;
    window.localStorage.setItem(CURRENCY_PREFERENCE_KEY, currencyPreference);
  });
}
if (panicBtn) {
  panicBtn.addEventListener('click', showPanicModal);
}
if (panicConfirmBtn) {
  panicConfirmBtn.addEventListener('click', () => triggerPanic('rider', 'manual-activate'));
}
if (panicCancelBtn) {
  panicCancelBtn.addEventListener('click', hidePanicModal);
}
if (checkinBtn) {
  checkinBtn.addEventListener('click', () => completeSafetyCheck('manual-button'));
}
if (checkinOkBtn) {
  checkinOkBtn.addEventListener('click', () => {
    const source = checkinModalEl?.dataset.source || 'prompt';
    completeSafetyCheck(source);
  });
}
if (checkinAlertBtn) {
  checkinAlertBtn.addEventListener('click', () => triggerPanic('rider', 'manual-escalated'));
}
if (completionCloseBtn) {
  completionCloseBtn.addEventListener('click', () => {
    if (completionPanelEl) {
      completionPanelEl.classList.add('hidden');
    }
    resetRide();
  });
}
if (riderRatingStars) {
  riderRatingStars.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-rating]');
    if (!btn || riderRatingSubmitted) {
        return;
    }
    const value = Number(btn.dataset.rating);
    if (Number.isFinite(value)) {
      setRiderRating(value);
    }
  });
}
if (riderRatingSubmitBtn) {
  riderRatingSubmitBtn.addEventListener('click', submitRiderRating);
}

// Initialize
initMap();
restoreActiveRide();
console.log('DonkeyRide Rider App initialized');
