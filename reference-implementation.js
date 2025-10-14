// ==========================================
// DONKEYRIDE REFERENCE IMPLEMENTATION
// Complete implementation of NIP-XX Ridesharing Protocol
// ==========================================

import { 
  SimplePool, 
  getPublicKey, 
  getEventHash, 
  getSignature, 
  generatePrivateKey,
  nip04 
} from 'nostr-tools';

// ==========================================
// CONSTANTS & CONFIGURATION
// ==========================================

const EVENT_KINDS = {
  RIDE_REQUEST: 30500,
  RIDE_ACCEPTANCE: 30501,
  COMMITMENT_STAKE: 30502,
  STAKE_NEGOTIATION: 30503,
  STREAMING_PAYMENT: 30510,
  RIDE_COMPLETION: 30511,
  RIDE_STATUS_UPDATE: 30512,
  STAKE_RELEASE: 30520,
  CANCELLATION: 30521,
  DISPUTE: 30522,
  REPUTATION: 30530,
  REPUTATION_QUERY: 30531
};

const RIDE_STATUS = {
  REQUESTED: 'requested',
  ACCEPTED: 'accepted',
  DRIVER_ARRIVED: 'arrived',
  PICKUP: 'pickup',
  ENROUTE: 'enroute',
  DROPOFF: 'dropoff',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  DISPUTED: 'disputed'
};

const DEFAULT_CONFIG = {
  stakes: {
    immediate: {
      riderBase: 0.10,
      driverBase: 0.15,
      minStake: 50
    },
    scheduled: {
      riderBase: 0.20,
      driverBase: 0.30,
      minStake: 200
    }
  },
  streaming: {
    baseRate: 50,
    distanceRate: 25,
    timeRate: 10,
    interval: 30000 // 30 seconds
  },
  reputation: {
    defaultScore: 50,
    decayDays: 90,
    minAcceptable: 30
  },
  relays: [
    'wss://relay.damus.io',
    'wss://relay.nostr.band',
    'wss://nos.lol'
  ]
};

// ==========================================
// CORE RIDESHARE CLASS
// ==========================================

class DonkeyRide {
  constructor(privateKey = null) {
    this.privateKey = privateKey || generatePrivateKey();
    this.publicKey = getPublicKey(this.privateKey);
    this.pool = new SimplePool();
    this.relays = DEFAULT_CONFIG.relays;
    
    // State management
    this.activeRides = new Map();
    this.reputationCache = new Map();
    this.webOfTrust = new Map();
    this.streamingIntervals = new Map();
    
    // User preferences
    this.preferences = {
      minAcceptableReputation: 40,
      maxStakePercentage: 25,
      autoNegotiate: true,
      preferredRelays: [...DEFAULT_CONFIG.relays]
    };
  }

  // ==========================================
  // RIDE REQUEST METHODS
  // ==========================================

  async requestRide(params) {
    const {
      from,
      to,
      maxPrice,
      rideType = 'immediate',
      pickupTime = null,
      passengerCount = 1,
      luggage = 'none',
      minDriverReputation = 30
    } = params;

    // Calculate stake based on reputation
    const myReputation = await this.getReputation(this.publicKey);
    const stakePercent = this.calculateStakePercent(
      rideType === 'scheduled' ? 
        DEFAULT_CONFIG.stakes.scheduled.riderBase : 
        DEFAULT_CONFIG.stakes.immediate.riderBase,
      myReputation
    );
    const riderStake = Math.floor(maxPrice * stakePercent);

    const event = {
      kind: EVENT_KINDS.RIDE_REQUEST,
      pubkey: this.publicKey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['from', from.coords, from.address],
        ['to', to.coords, to.address],
        ['price', maxPrice.toString()],
        ['rider_stake', riderStake.toString()],
        ['ride_type', rideType],
        ['payment_type', 'streaming'],
        ['requires_driver_stake', 'true'],
        ['min_driver_reputation', minDriverReputation.toString()],
        ['passenger_count', passengerCount.toString()],
        ['luggage', luggage]
      ],
      content: `Ride request: ${from.address} to ${to.address}`
    };

    if (rideType === 'scheduled' && pickupTime) {
      event.tags.push(['pickup_time', Math.floor(pickupTime / 1000).toString()]);
      event.tags.push(['schedule_weight', '8']); // High importance
      event.tags.push(['expiry', Math.floor((pickupTime - 3600000) / 1000).toString()]);
    } else {
      // Immediate ride expires in 30 minutes
      event.tags.push(['expiry', (Math.floor(Date.now() / 1000) + 1800).toString()]);
    }

    event.id = getEventHash(event);
    event.sig = getSignature(event, this.privateKey);

    // Store in active rides
    this.activeRides.set(event.id, {
      type: 'request',
      event,
      status: RIDE_STATUS.REQUESTED,
      stake: riderStake
    });

    // Publish to relays
    await this.pool.publish(this.relays, event);
    
    return event.id;
  }

  // ==========================================
  // DRIVER ACCEPTANCE WITH STAKE
  // ==========================================

  async acceptRide(requestId, rideRequest) {
    const myReputation = await this.getReputation(this.publicKey);
    const rideValue = parseInt(rideRequest.tags.find(t => t[0] === 'price')[1]);
    const rideType = rideRequest.tags.find(t => t[0] === 'ride_type')[1];
    
    // Calculate required stake
    const stakePercent = this.calculateStakePercent(
      rideType === 'scheduled' ? 
        DEFAULT_CONFIG.stakes.scheduled.driverBase : 
        DEFAULT_CONFIG.stakes.immediate.driverBase,
      myReputation
    );
    const driverStake = Math.floor(rideValue * stakePercent);

    const event = {
      kind: EVENT_KINDS.RIDE_ACCEPTANCE,
      pubkey: this.publicKey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['e', requestId],
        ['p', rideRequest.pubkey],
        ['driver_stake', driverStake.toString()],
        ['payment_type', 'streaming'],
        ['rate', DEFAULT_CONFIG.streaming.baseRate.toString()],
        ['interval', (DEFAULT_CONFIG.streaming.interval / 1000).toString()],
        ['driver_reputation', myReputation.toString()],
        ['vehicle', 'Toyota Camry'],
        ['license_plate', 'ABC-123']
      ],
      content: `Ride accepted. Stake: ${driverStake} sats`
    };

    event.id = getEventHash(event);
    event.sig = getSignature(event, this.privateKey);

    // Store acceptance
    this.activeRides.set(requestId, {
      type: 'accepted',
      event,
      status: RIDE_STATUS.ACCEPTED,
      stake: driverStake,
      riderPubkey: rideRequest.pubkey
    });

    await this.pool.publish(this.relays, event);
    return event.id;
  }

  // ==========================================
  // RIDE STATUS UPDATES
  // ==========================================

  async updateRideStatus(rideId, status, location = null) {
    const ride = this.activeRides.get(rideId);
    if (!ride) throw new Error('Ride not found');

    const event = {
      kind: EVENT_KINDS.RIDE_STATUS_UPDATE,
      pubkey: this.publicKey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['e', rideId],
        ['p', ride.riderPubkey],
        ['status', status]
      ],
      content: `Status: ${status}`
    };

    if (location) {
      event.tags.push(['location', `${location.lat},${location.lng}`]);
      
      // Calculate ETA if enroute
      if (status === RIDE_STATUS.ENROUTE) {
        const eta = this.calculateETA(location, ride.destination);
        event.tags.push(['eta', eta.toString()]);
        event.tags.push(['distance_remaining', this.calculateDistance(location, ride.destination).toString()]);
      }
    }

    event.id = getEventHash(event);
    event.sig = getSignature(event, this.privateKey);

    // Update local state
    ride.status = status;
    ride.lastUpdate = Date.now();
    ride.currentLocation = location;

    await this.pool.publish(this.relays, event);
    return event.id;
  }

  // ==========================================
  // STREAMING PAYMENTS
  // ==========================================

  startStreamingPayments(rideId, driverPubkey, maxAmount) {
    const ride = this.activeRides.get(rideId);
    if (!ride) throw new Error('Ride not found');

    let totalPaid = 0;
    let paymentCount = 0;

    const interval = setInterval(async () => {
      // Calculate payment based on distance and time
      const payment = this.calculateStreamingPayment(ride);
      
      if (totalPaid + payment >= maxAmount) {
        clearInterval(interval);
        this.streamingIntervals.delete(rideId);
        await this.completeRide(rideId);
        return;
      }

      const event = {
        kind: EVENT_KINDS.STREAMING_PAYMENT,
        pubkey: this.publicKey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['p', driverPubkey],
          ['e', rideId],
          ['amount', payment.toString()],
          ['invoice', paymentCount.toString()],
          ['total_paid', (totalPaid + payment).toString()]
        ],
        content: `Payment #${paymentCount}: ${payment} sats`
      };

      // Add location if available (for distance-based pricing)
      if (ride.currentLocation) {
        event.tags.push(['location', `${ride.currentLocation.lat},${ride.currentLocation.lng}`]);
      }

      event.id = getEventHash(event);
      event.sig = getSignature(event, this.privateKey);

      await this.pool.publish(this.relays, event);
      
      totalPaid += payment;
      paymentCount++;
      
      ride.totalPaid = totalPaid;
      ride.paymentCount = paymentCount;

    }, DEFAULT_CONFIG.streaming.interval);

    this.streamingIntervals.set(rideId, interval);
  }

  calculateStreamingPayment(ride) {
    let payment = DEFAULT_CONFIG.streaming.baseRate;
    
    // Add distance component
    if (ride.lastLocation && ride.currentLocation) {
      const distance = this.calculateDistance(ride.lastLocation, ride.currentLocation);
      payment += Math.floor(distance * DEFAULT_CONFIG.streaming.distanceRate / 500);
    }
    
    // Add time component
    const rideDuration = (Date.now() - ride.startTime) / 60000; // minutes
    payment += Math.floor(rideDuration * DEFAULT_CONFIG.streaming.timeRate);
    
    return payment;
  }

  // ==========================================
  // DISPUTE RESOLUTION
  // ==========================================

  async fileDispute(rideId, disputeType, evidence, proposedResolution) {
    const ride = this.activeRides.get(rideId);
    if (!ride) throw new Error('Ride not found');

    const event = {
      kind: EVENT_KINDS.DISPUTE,
      pubkey: this.publicKey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['e', rideId],
        ['p', ride.event.pubkey === this.publicKey ? ride.riderPubkey : ride.event.pubkey],
        ['dispute_type', disputeType],
        ['proposed_resolution', proposedResolution],
        ['stake_at_risk', ride.stake.toString()]
      ],
      content: `Dispute: ${disputeType}. Evidence: ${evidence}`
    };

    // Request specific arbiter if in web of trust
    const trustedArbiters = await this.getTrustedArbiters();
    if (trustedArbiters.length > 0) {
      event.tags.push(['arbiter_requested', trustedArbiters[0]]);
    }

    event.id = getEventHash(event);
    event.sig = getSignature(event, this.privateKey);

    ride.status = RIDE_STATUS.DISPUTED;
    
    await this.pool.publish(this.relays, event);
    return event.id;
  }

  // ==========================================
  // REPUTATION SYSTEM
  // ==========================================

  async getReputation(pubkey) {
    // Check cache first
    if (this.reputationCache.has(pubkey)) {
      const cached = this.reputationCache.get(pubkey);
      if (Date.now() - cached.timestamp < 3600000) { // 1 hour cache
        return cached.score;
      }
    }

    // Query reputation events
    const events = await this.pool.list(this.relays, [{
      kinds: [EVENT_KINDS.REPUTATION],
      '#p': [pubkey],
      limit: 100
    }]);

    const score = this.calculateReputationScore(events);
    
    // Cache the result
    this.reputationCache.set(pubkey, {
      score,
      timestamp: Date.now()
    });

    return score;
  }

  calculateReputationScore(events) {
    if (events.length === 0) return DEFAULT_CONFIG.reputation.defaultScore;

    let weightedSum = 0;
    let totalWeight = 0;

    events.forEach(event => {
      const rating = parseInt(event.tags.find(t => t[0] === 'rating')?.[1] || '3');
      const weight = parseInt(event.tags.find(t => t[0] === 'weight')?.[1] || '1');
      const completion = event.tags.find(t => t[0] === 'completion')?.[1] === 'true';
      
      // Completed rides worth more
      const completionMultiplier = completion ? 1.0 : 0.5;
      
      // Recent events weighted higher
      const age = Date.now() - (event.created_at * 1000);
      const decayMs = DEFAULT_CONFIG.reputation.decayDays * 24 * 60 * 60 * 1000;
      const ageMultiplier = Math.max(0.5, 1.0 - (age / decayMs));
      
      const finalWeight = weight * completionMultiplier * ageMultiplier;
      
      weightedSum += (rating * 20) * finalWeight;
      totalWeight += finalWeight;
    });

    return totalWeight > 0 ? 
      Math.round(weightedSum / totalWeight) : 
      DEFAULT_CONFIG.reputation.defaultScore;
  }

  async rateUser(pubkey, rideId, rating, tags = []) {
    const event = {
      kind: EVENT_KINDS.REPUTATION,
      pubkey: this.publicKey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['p', pubkey],
        ['e', rideId],
        ['rating', rating.toString()],
        ['completion', 'true'],
        ['tags', tags.join(',')]
      ],
      content: ''
    };

    event.id = getEventHash(event);
    event.sig = getSignature(event, this.privateKey);

    await this.pool.publish(this.relays, event);
    return event.id;
  }

  // ==========================================
  // WEB OF TRUST
  // ==========================================

  async buildWebOfTrust() {
    // Get follows (NIP-02)
    const follows = await this.pool.list(this.relays, [{
      kinds: [3], // Contact list
      authors: [this.publicKey],
      limit: 1
    }]);

    if (follows.length > 0) {
      const followList = follows[0].tags
        .filter(t => t[0] === 'p')
        .map(t => t[1]);
      
      // Get follows of follows
      const secondDegree = await this.pool.list(this.relays, [{
        kinds: [3],
        authors: followList,
        limit: 100
      }]);

      // Build trust map
      followList.forEach(pubkey => {
        this.webOfTrust.set(pubkey, { degree: 1, trust: 80 });
      });

      secondDegree.forEach(event => {
        event.tags
          .filter(t => t[0] === 'p')
          .forEach(t => {
            if (!this.webOfTrust.has(t[1])) {
              this.webOfTrust.set(t[1], { degree: 2, trust: 60 });
            }
          });
      });
    }
  }

  getTrustScore(pubkey) {
    if (pubkey === this.publicKey) return 100;
    
    const trust = this.webOfTrust.get(pubkey);
    if (trust) return trust.trust;
    
    return 30; // Unknown user
  }

  async getTrustedArbiters() {
    // Find highly trusted users who have arbiter tags
    const trustedUsers = Array.from(this.webOfTrust.entries())
      .filter(([_, trust]) => trust.trust >= 70)
      .map(([pubkey, _]) => pubkey);
    
    const arbiterEvents = await this.pool.list(this.relays, [{
      kinds: [0], // Profile metadata
      authors: trustedUsers
    }]);

    return arbiterEvents
      .filter(e => e.content.includes('arbiter'))
      .map(e => e.pubkey);
  }

  // ==========================================
  // STAKE NEGOTIATION
  // ==========================================

  async negotiateStake(rideId, proposedRiderStake, proposedDriverStake) {
    const ride = this.activeRides.get(rideId);
    if (!ride) throw new Error('Ride not found');

    const myReputation = await this.getReputation(this.publicKey);

    const event = {
      kind: EVENT_KINDS.STAKE_NEGOTIATION,
      pubkey: this.publicKey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['e', rideId],
        ['p', ride.event.pubkey === this.publicKey ? ride.riderPubkey : ride.event.pubkey],
        ['proposed_rider_stake', proposedRiderStake.toString()],
        ['proposed_driver_stake', proposedDriverStake.toString()],
        ['my_reputation', myReputation.toString()],
        ['counter_offer', 'true']
      ],
      content: `Proposing adjusted stakes based on ${myReputation}/100 reputation`
    };

    event.id = getEventHash(event);
    event.sig = getSignature(event, this.privateKey);

    await this.pool.publish(this.relays, event);
    return event.id;
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  calculateStakePercent(basePercent, reputationScore) {
    // High reputation = lower stake required
    const reputationMultiplier = 2.0 - (reputationScore / 100);
    return basePercent * reputationMultiplier;
  }

  calculateDistance(point1, point2) {
    // Haversine formula for distance between two coordinates
    const R = 6371000; // Earth radius in meters
    const φ1 = point1.lat * Math.PI / 180;
    const φ2 = point2.lat * Math.PI / 180;
    const Δφ = (point2.lat - point1.lat) * Math.PI / 180;
    const Δλ = (point2.lng - point1.lng) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
  }

  calculateETA(currentLocation, destination) {
    const distance = this.calculateDistance(currentLocation, destination);
    const avgSpeedMps = 10; // 36 km/h average city speed
    return Math.floor(distance / avgSpeedMps); // ETA in seconds
  }

  // ==========================================
  // RIDE COMPLETION
  // ==========================================

  async completeRide(rideId) {
    const ride = this.activeRides.get(rideId);
    if (!ride) throw new Error('Ride not found');

    const event = {
      kind: EVENT_KINDS.RIDE_COMPLETION,
      pubkey: this.publicKey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['e', rideId],
        ['p', ride.riderPubkey || ride.event.pubkey],
        ['status', 'completed'],
        ['total_paid', ride.totalPaid?.toString() || '0'],
        ['total_distance', ride.totalDistance?.toString() || '0'],
        ['duration', ((Date.now() - ride.startTime) / 1000).toString()],
        ['release_stakes', 'true']
      ],
      content: 'Ride completed successfully'
    };

    event.id = getEventHash(event);
    event.sig = getSignature(event, this.privateKey);

    ride.status = RIDE_STATUS.COMPLETED;
    
    // Stop streaming if active
    if (this.streamingIntervals.has(rideId)) {
      clearInterval(this.streamingIntervals.get(rideId));
      this.streamingIntervals.delete(rideId);
    }

    await this.pool.publish(this.relays, event);
    return event.id;
  }

  // ==========================================
  // CANCELLATION WITH PENALTIES
  // ==========================================

  async cancelRide(rideId, reason) {
    const ride = this.activeRides.get(rideId);
    if (!ride) throw new Error('Ride not found');

    const timeSinceAcceptance = Date.now() - (ride.event.created_at * 1000);
    const penalty = this.calculateCancellationPenalty(ride, timeSinceAcceptance);

    const event = {
      kind: EVENT_KINDS.CANCELLATION,
      pubkey: this.publicKey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['e', rideId],
        ['p', ride.riderPubkey || ride.event.pubkey],
        ['reason', reason],
        ['penalty', penalty.toString()],
        ['refund', (ride.stake - penalty).toString()],
        ['time_since_commitment', (timeSinceAcceptance / 1000).toString()]
      ],
      content: `Cancellation: ${reason}`
    };

    event.id = getEventHash(event);
    event.sig = getSignature(event, this.privateKey);

    ride.status = RIDE_STATUS.CANCELLED;
    
    await this.pool.publish(this.relays, event);
    return event.id;
  }

  calculateCancellationPenalty(ride, timeSinceAcceptance) {
    const rideType = ride.event.tags.find(t => t[0] === 'ride_type')?.[1];
    
    if (rideType === 'scheduled') {
      const pickupTime = parseInt(ride.event.tags.find(t => t[0] === 'pickup_time')?.[1] || '0') * 1000;
      const timeUntilPickup = pickupTime - Date.now();
      
      if (timeUntilPickup > 86400000) return ride.stake * 0.2;  // >24h: 20%
      if (timeUntilPickup > 43200000) return ride.stake * 0.5;  // 12-24h: 50%
      if (timeUntilPickup > 21600000) return ride.stake * 0.8;  // 6-12h: 80%
      return ride.stake; // <6h: 100%
    } else {
      // Immediate rides
      if (timeSinceAcceptance < 30000) return 0; // 30s grace period
      if (timeSinceAcceptance < 300000) return ride.stake * 0.5; // <5min: 50%
      return ride.stake * 0.8; // >5min: 80%
    }
  }

  // ==========================================
  // SUBSCRIPTION MANAGEMENT
  // ==========================================

  async subscribeToRides(filters = {}) {
    const defaultFilters = {
      kinds: [EVENT_KINDS.RIDE_REQUEST],
      since: Math.floor(Date.now() / 1000) - 300 // Last 5 minutes
    };

    const sub = this.pool.sub(this.relays, [{ ...defaultFilters, ...filters }]);
    
    sub.on('event', async (event) => {
      // Check if ride meets our criteria
      const minRep = parseInt(event.tags.find(t => t[0] === 'min_driver_reputation')?.[1] || '0');
      const myRep = await this.getReputation(this.publicKey);
      
      if (myRep >= minRep) {
        this.handleIncomingRide(event);
      }
    });

    return sub;
  }

  handleIncomingRide(event) {
    // Override in implementation
    console.log('New ride request:', event);
  }

  // ==========================================
  // CLEANUP
  // ==========================================

  cleanup() {
    // Clear all streaming intervals
    this.streamingIntervals.forEach(interval => clearInterval(interval));
    this.streamingIntervals.clear();
    
    // Close pool connections
    this.pool.close(this.relays);
  }
}

// ==========================================
// EXPORT
// ==========================================

export default DonkeyRide;
export { EVENT_KINDS, RIDE_STATUS, DEFAULT_CONFIG };