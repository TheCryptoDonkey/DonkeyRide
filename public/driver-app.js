const API_URL = window.location.origin;
const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:3001`;

const DRIVER_PROFILE = {
  npub: 'npub_demo_driver_london',
  name: 'Ayesha Khan',
  rating: 4.96,
  lightning: 'ayesha@getalby.com',
  vehicle: 'Nissan Leaf (EV)',
  homeBase: { lat: 51.5152, lon: -0.1419 }
};

const MOVE_INTERVAL = 2000; // ms between location updates
const MOVE_STEP_METERS = 80; // approx ~145 km/h along route for demo smoothness

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
    this.earnings = { totalFiat: 0, rides: 0 };

    this.stakeSection = document.getElementById('driver-stake-section');
    this.stakeAmountEl = document.getElementById('driver-stake-amount');
    this.stakeInvoiceEl = document.getElementById('driver-stake-invoice');
    this.stakeConfirmBtn = document.getElementById('driver-stake-confirm-btn');
    this.pendingDriverStake = null;
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

    document.getElementById('complete-ride-btn').addEventListener('click', () => {
      if (this.currentRide) {
        this.finishRide();
      }
    });

    if (this.stakeConfirmBtn) {
      this.stakeConfirmBtn.addEventListener('click', () => this.confirmDriverStake());
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

      const distanceKm = typeof ride.distance === 'number'
        ? ride.distance.toFixed(1)
        : (ride.estimatedFare?.distance?.km != null
          ? ride.estimatedFare.distance.km.toFixed(1)
          : '?');
      const surge = ride.estimatedFare?.breakdown?.surge?.multiplier ?? 1;
      const fareSats = typeof ride.fare === 'number'
        ? ride.fare
        : (ride.estimatedFare?.fare?.sats ?? 0);

      card.innerHTML = `
        <h4>${ride.pickup.address || `${ride.pickup.lat.toFixed(3)}, ${ride.pickup.lon.toFixed(3)}`} → ${ride.dropoff.address || `${ride.dropoff.lat.toFixed(3)}, ${ride.dropoff.lon.toFixed(3)}`}</h4>
        <div class="ride-info">
          <div>Distance: <strong>${distanceKm} km</strong></div>
          <div>Fare: <strong>${fareSats.toLocaleString()} sats</strong></div>
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
          driverLightning: DRIVER_PROFILE.lightning
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || response.statusText);
      }

      const session = await response.json();
      this.currentRide = {
        ...ride,
        stage: 'awaiting_stake',
        driverLightning: DRIVER_PROFILE.lightning
      };
      this.pendingDriverStake = {
        amount: session.stakeAmount,
        invoice: session.invoice
      };

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
    const fareDisplay = typeof this.currentRide.fare === 'number'
      ? `${this.currentRide.fare.toLocaleString()} sats`
      : '-';
    this.updateRideStatus({
      status: 'En route to pickup',
      distance: '-',
      eta: this.currentRide.pickupEtaSeconds ? `${Math.round(this.currentRide.pickupEtaSeconds / 60)} min` : '-',
      progress: '0%',
      earnings: fareDisplay
    });
    this.updateNavigationInstructions('pickup');
  }

  startStageToPickup() {
    this.currentStage = 'to_pickup';
    const route = this.transformRoute(this.currentRide.driver_route) || [
      [this.driverMarker.getLatLng().lat, this.driverMarker.getLatLng().lng],
      [this.currentRide.pickup.lat, this.currentRide.pickup.lon]
    ];

    this.drawDriverRoute(route, '#ff6ec7');
    this.startMovementAlongRoute(route, () => this.arriveAtPickup());
  }

  async arriveAtPickup() {
    await fetch(`/api/rides/${this.currentRide.id}/arrive`, { method: 'POST' }).catch(() => {});
    this.updateRideStatus({
      status: 'Waiting at pickup',
      eta: '0 min',
      progress: '50%'
    });
    this.updateNavigationInstructions('dropoff');
    this.startStageToDropoff();
  }

  startStageToDropoff() {
    this.currentStage = 'to_dropoff';

    const route = this.transformRoute(this.currentRide.route) || [
      [this.currentRide.pickup.lat, this.currentRide.pickup.lon],
      [this.currentRide.dropoff.lat, this.currentRide.dropoff.lon]
    ];

    this.drawTripRoute(route, '#667eea');

    fetch(`/api/rides/${this.currentRide.id}/start`, { method: 'POST' }).catch(() => {});

    this.startMovementAlongRoute(route, () => this.finishRide());
  }

  async finishRide() {
    if (!this.currentRide) return;

    await fetch(`/api/rides/${this.currentRide.id}/complete`, { method: 'POST' }).catch(() => {});

    this.updateRideStatus({
      status: 'Ride complete',
      distance: '0 km',
      eta: '0 min',
      progress: '100%'
    });

    this.stopMovement();
    this.showSuccess('Ride completed!');

    this.clearActiveRide();
    this.showWaitingState(true);

    this.earnings.rides += 1;
    const rideFiat = this.currentRide.estimatedFare?.driverEarns?.fiat ?? 0;
    this.earnings.totalFiat += rideFiat;
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

      this.updateRideStatus({
        status: stage === 'to_pickup' ? 'En route to pickup' : 'Driving to destination',
        distance: `${(distanceRemaining / 1000).toFixed(2)} km`,
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
      this.currentRide.stage = 'active';
      this.currentRide.driver_route = result.driver_route || null;
      this.currentRide.pickupEtaSeconds = result.eta_seconds || null;
      this.pendingDriverStake = null;

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
    document.getElementById('total-earned').textContent = `£${total.toFixed(2)}`;
    document.getElementById('rides-count').textContent = rides;
    document.getElementById('avg-per-ride').textContent = rides > 0 ? `£${(total / rides).toFixed(2)}` : '£0.00';
  }

  handleRideCancelled(message) {
    if (this.currentRide && this.currentRide.id === message.ride_id) {
      this.showError('Ride cancelled by rider');
      this.clearActiveRide();
      this.currentRide = null;
      this.showWaitingState(true);
    } else {
      this.pendingRides.delete(message.ride_id);
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
