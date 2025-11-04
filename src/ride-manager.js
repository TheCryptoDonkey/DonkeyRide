/**
 * Ride Manager
 *
 * Manages ride lifecycle and state transitions
 */

const { v4: uuidv4 } = require('uuid');
const { nip19 } = require('nostr-tools');

function toLower(input) {
  return typeof input === 'string' ? input.toLowerCase() : null;
}

function resolveIdentity(identity = {}) {
  const pubkey = toLower(identity.pubkey);
  let npub = identity.npub || null;
  if (!npub && pubkey && nip19?.npubEncode) {
    try {
      npub = nip19.npubEncode(pubkey);
    } catch (error) {
      npub = null;
    }
  }
  return { pubkey, npub };
}

function identityKeys(identity = {}) {
  const keys = [];
  if (identity.pubkey) {
    keys.push(identity.pubkey.toLowerCase());
  }
  if (identity.npub) {
    keys.push(identity.npub.toLowerCase());
  }
  return Array.from(new Set(keys.filter(Boolean)));
}

// Ride status constants
const RideStatus = {
  REQUESTED: 'requested',       // Rider requested, waiting for driver
  MATCHED: 'matched',           // Driver accepted
  DRIVER_EN_ROUTE: 'en_route',  // Driver going to pickup
  DRIVER_ARRIVED: 'arrived',    // Driver at pickup
  ACTIVE: 'active',             // Trip in progress
  COMPLETED: 'completed',       // Trip finished
  CANCELLED: 'cancelled'        // Cancelled
};

class RideManager {
  constructor() {
    this.rides = new Map(); // ride_id → ride object
    this.riderRides = new Map(); // rider_npub → ride_id
    this.driverRides = new Map(); // driver_npub → ride_id
  }

  /**
   * Create a new ride request
   */
  createRide(riderIdentity, pickup, dropoff, estimatedFare, options = {}) {
    const rideId = options.rideId || `ride_${uuidv4().split('-')[0]}`;

    if (this.rides.has(rideId)) {
      throw new Error(`Ride ${rideId} already exists`);
    }

    const rider = resolveIdentity(riderIdentity);

    const ride = {
      id: rideId,
      status: RideStatus.REQUESTED,
      rider,
      driver: null,
      pickup: {
        lat: pickup.lat,
        lon: pickup.lon
      },
      dropoff: {
        lat: dropoff.lat,
        lon: dropoff.lon
      },
      currency: options.currency || 'GBP',
      fare: estimatedFare,
      timestamps: {
        requested: Date.now(),
        matched: null,
        driverEnRoute: null,
        driverArrived: null,
        started: null,
        completed: null
      },
      feedback: {
        rider: null,
        driver: null
      },
      history: [
        { status: RideStatus.REQUESTED, timestamp: Date.now() }
      ]
    };

    this.rides.set(rideId, ride);
    identityKeys(rider).forEach((key) => this.riderRides.set(key, rideId));

    console.log(`✅ Ride created: ${rideId} (${rider.npub || rider.pubkey || 'unknown rider'})`);

    return ride;
  }

  /**
   * Driver accepts ride
   */
  acceptRide(rideId, driverNpub, driverInfo) {
    const ride = this.rides.get(rideId);

    if (!ride) {
      throw new Error(`Ride ${rideId} not found`);
    }

    if (ride.status !== RideStatus.REQUESTED) {
      // Already matched - silently ignore (race condition)
      return null;
    }

    const driverIdentity = resolveIdentity({ npub: driverNpub, pubkey: driverInfo.pubkey });

    ride.driver = {
      npub: driverIdentity.npub,
      pubkey: driverIdentity.pubkey,
      name: driverInfo.name || 'Driver',
      location: driverInfo.location,
      rating: driverInfo.rating || 5.0
    };

    ride.status = RideStatus.MATCHED;
    ride.timestamps.matched = Date.now();
    ride.history.push({
      status: RideStatus.MATCHED,
      timestamp: Date.now(),
      driver: driverNpub
    });

    identityKeys(driverIdentity).forEach((key) => this.driverRides.set(key, rideId));

    console.log(`✅ Ride ${rideId} matched with driver ${driverIdentity.npub || driverIdentity.pubkey || 'unknown driver'}`);

    return ride;
  }

  /**
   * Driver starts moving to pickup
   */
  startEnRoute(rideId) {
    const ride = this.rides.get(rideId);

    if (!ride) {
      throw new Error(`Ride ${rideId} not found`);
    }

    if (ride.status !== RideStatus.MATCHED) {
      throw new Error(`Ride ${rideId} must be matched first`);
    }

    ride.status = RideStatus.DRIVER_EN_ROUTE;
    ride.timestamps.driverEnRoute = Date.now();
    ride.history.push({
      status: RideStatus.DRIVER_EN_ROUTE,
      timestamp: Date.now()
    });

    console.log(`🚗 Driver en route to pickup for ride ${rideId}`);

    return ride;
  }

  /**
   * Driver arrived at pickup
   */
  arriveAtPickup(rideId) {
    const ride = this.rides.get(rideId);

    if (!ride) {
      throw new Error(`Ride ${rideId} not found`);
    }

    ride.status = RideStatus.DRIVER_ARRIVED;
    ride.timestamps.driverArrived = Date.now();
    ride.history.push({
      status: RideStatus.DRIVER_ARRIVED,
      timestamp: Date.now()
    });

    console.log(`📍 Driver arrived at pickup for ride ${rideId}`);

    return ride;
  }

  /**
   * Start trip
   */
  startTrip(rideId) {
    const ride = this.rides.get(rideId);

    if (!ride) {
      throw new Error(`Ride ${rideId} not found`);
    }

    if (ride.status !== RideStatus.DRIVER_ARRIVED) {
      throw new Error(`Driver must arrive at pickup first`);
    }

    ride.status = RideStatus.ACTIVE;
    ride.timestamps.started = Date.now();
    ride.history.push({
      status: RideStatus.ACTIVE,
      timestamp: Date.now()
    });

    console.log(`🚀 Trip started for ride ${rideId}`);

    return ride;
  }

  /**
   * Complete trip
   */
  completeTrip(rideId, paymentInfo = {}) {
    const ride = this.rides.get(rideId);

    if (!ride) {
      throw new Error(`Ride ${rideId} not found`);
    }

    if (ride.status !== RideStatus.ACTIVE) {
      throw new Error(`Trip must be active to complete`);
    }

    ride.status = RideStatus.COMPLETED;
    ride.timestamps.completed = Date.now();
    ride.payment = paymentInfo;
    ride.history.push({
      status: RideStatus.COMPLETED,
      timestamp: Date.now()
    });

    // Calculate duration
    const duration = ride.timestamps.completed - ride.timestamps.started;
    ride.duration = Math.round(duration / 1000); // seconds

    console.log(`✅ Trip completed for ride ${rideId} (${ride.duration}s)`);

    // Clean up references after 5 minutes
    setTimeout(() => {
      identityKeys(ride.rider).forEach((key) => this.riderRides.delete(key));
      if (ride.driver) {
        identityKeys(ride.driver).forEach((key) => this.driverRides.delete(key));
      }
    }, 300000);

    return ride;
  }

  recordRating(rideId, role, ratingPayload) {
    const ride = this.rides.get(rideId);
    if (!ride) {
      throw new Error(`Ride ${rideId} not found`);
    }

    if (!ride.feedback) {
      ride.feedback = { rider: null, driver: null };
    }

    if (ride.feedback[role]) {
      throw new Error(`Rating already recorded for ${role}`);
    }

    ride.feedback[role] = {
      ...ratingPayload,
      timestamp: Date.now()
    };

    return ride;
  }

  /**
   * Cancel ride
   */
  cancelRide(rideId, cancelledBy, reason) {
    const ride = this.rides.get(rideId);

    if (!ride) {
      throw new Error(`Ride ${rideId} not found`);
    }

    if (ride.status === RideStatus.COMPLETED || ride.status === RideStatus.CANCELLED) {
      throw new Error(`Ride ${rideId} is already ${ride.status}`);
    }

    ride.status = RideStatus.CANCELLED;
    ride.cancelledBy = cancelledBy;
    ride.cancelReason = reason;
    ride.timestamps.cancelled = Date.now();
    ride.history.push({
      status: RideStatus.CANCELLED,
      timestamp: Date.now(),
      by: cancelledBy,
      reason
    });

    console.log(`❌ Ride ${rideId} cancelled by ${cancelledBy}: ${reason}`);

    // Clean up references
    identityKeys(ride.rider).forEach((key) => this.riderRides.delete(key));
    if (ride.driver) {
      identityKeys(ride.driver).forEach((key) => this.driverRides.delete(key));
    }

    return ride;
  }

  /**
   * Update driver location
   */
  updateDriverLocation(rideId, location, eta = null) {
    const ride = this.rides.get(rideId);

    if (!ride || !ride.driver) {
      return null;
    }

    ride.driver.location = location;

    if (eta !== null) {
      ride.driver.eta = eta;
    }

    return ride;
  }

  /**
   * Get ride by ID
   */
  getRide(rideId) {
    return this.rides.get(rideId);
  }

  /**
   * Get ride by rider
   */
  getRideByRider(riderNpub) {
    const rideId = this.riderRides.get(toLower(riderNpub));
    return rideId ? this.rides.get(rideId) : null;
  }

  /**
   * Get ride by driver
   */
  getRideByDriver(driverNpub) {
    const rideId = this.driverRides.get(toLower(driverNpub));
    return rideId ? this.rides.get(rideId) : null;
  }

  /**
   * Get all active rides
   */
  getActiveRides() {
    return Array.from(this.rides.values()).filter(
      ride => ride.status !== RideStatus.COMPLETED && ride.status !== RideStatus.CANCELLED
    );
  }

  /**
   * Get ride statistics
   */
  getStats() {
    const rides = Array.from(this.rides.values());

    return {
      total: rides.length,
      requested: rides.filter(r => r.status === RideStatus.REQUESTED).length,
      matched: rides.filter(r => r.status === RideStatus.MATCHED).length,
      enRoute: rides.filter(r => r.status === RideStatus.DRIVER_EN_ROUTE).length,
      active: rides.filter(r => r.status === RideStatus.ACTIVE).length,
      completed: rides.filter(r => r.status === RideStatus.COMPLETED).length,
      cancelled: rides.filter(r => r.status === RideStatus.CANCELLED).length
    };
  }

  /**
   * Calculate ETA in seconds
   */
  calculateETA(from, to, speedKmh = 30) {
    const distance = this.calculateDistance(from.lat, from.lon, to.lat, to.lon);
    const hours = distance / speedKmh;
    return Math.round(hours * 3600); // Convert to seconds
  }

  /**
   * Calculate distance in kilometers
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }
}

module.exports = {
  RideManager,
  RideStatus
};
