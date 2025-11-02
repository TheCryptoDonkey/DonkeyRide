#!/usr/bin/env node

/**
 * Smart Driver Simulator
 *
 * - Connects to WebSocket for ride requests
 * - Auto-accepts rides when available
 * - Simulates movement to pickup and dropoff
 * - Completes full ride lifecycle
 */

const WebSocket = require('ws');
const Redis = require('redis');
const fetch = require('node-fetch');
const fs = require('fs');

// Load test users
const testData = JSON.parse(fs.readFileSync('test-users.json', 'utf8'));

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3000';
const WS_URL = process.env.WS_URL || 'ws://localhost:3001';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Simulation parameters
const MOVEMENT_SPEED_KMH = 200; // Very fast for live demo
const UPDATE_INTERVAL = 500; // Update every 0.5 seconds
const ACCEPTANCE_DELAY = 500; // Accept almost instantly

// =====================================================
// Smart Driver Simulator
// =====================================================

class SmartDriverSimulator {
  constructor(driver) {
    this.driver = driver;
    this.location = { ...driver.location };
    this.available = true;
    this.currentRide = null;
    this.destination = null;
    this.route = null;  // OSRM route coordinates
    this.routeIndex = 0;  // Current position in route
    this.ws = null;
  }

  async start(redis) {
    this.redis = redis;

    // Connect to WebSocket
    await this.connectWebSocket();

    // Publish online status
    await this.goOnline();

    // Start random movement when idle
    this.startIdleMovement();

    console.log(`✅ ${this.driver.name} is ready for rides`);
  }

  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(WS_URL);

      this.ws.on('open', () => {
        console.log(`🔌 ${this.driver.name} connected to WebSocket`);

        // Register as driver
        this.ws.send(JSON.stringify({
          type: 'register_driver',
          npub: this.driver.npub
        }));

        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleWebSocketMessage(JSON.parse(data.toString()));
      });

      this.ws.on('error', (error) => {
        console.error(`❌ WebSocket error for ${this.driver.name}:`, error.message);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log(`📴 ${this.driver.name} disconnected from WebSocket`);
        // Attempt reconnect
        setTimeout(() => this.connectWebSocket(), 5000);
      });
    });
  }

  handleWebSocketMessage(message) {
    switch (message.type) {
      case 'ride_request':
        this.handleRideRequest(message.ride);
        break;

      case 'ride_cancelled':
        if (this.currentRide && this.currentRide.id === message.ride_id) {
          console.log(`❌ Ride ${message.ride_id} was cancelled`);
          this.currentRide = null;
          this.destination = null;
          this.route = null;
          this.routeIndex = 0;
          this.available = true;
        }
        break;
    }
  }

  async handleRideRequest(ride) {
    // Only accept if available
    if (!this.available) {
      return;
    }

    // Check if within reasonable distance (10km)
    const distance = this.calculateDistance(
      this.location.lat,
      this.location.lon,
      ride.pickup.lat,
      ride.pickup.lon
    );

    if (distance > 10) {
      console.log(`📏 ${this.driver.name}: Ride too far (${distance.toFixed(1)}km)`);
      return;
    }

    // Wait a bit (simulate thinking)
    await new Promise(resolve => setTimeout(resolve, ACCEPTANCE_DELAY));

    // Check again if still available
    if (!this.available) {
      return;
    }

    // Accept the ride!
    this.acceptRide(ride);
  }

  async acceptRide(ride) {
    console.log(`✋ ${this.driver.name} accepting ride ${ride.id}...`);

    try {
      const response = await fetch(`${API_URL}/api/rides/${ride.id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_npub: this.driver.npub,
          driver_name: this.driver.name,
          driver_location: this.location,
          driver_rating: this.driver.reputation.averageRating
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to accept ride: ${response.statusText}`);
      }

      const result = await response.json();

      console.log(`✅ ${this.driver.name} accepted ride ${ride.id}`);
      console.log(`   ETA to pickup: ${Math.round(result.eta_seconds / 60)} min`);

      this.available = false;
      this.currentRide = result.ride;
      this.destination = result.ride.pickup;

      // Store driver route (if OSRM returned one)
      if (result.driver_route && result.driver_route.length > 0) {
        this.route = result.driver_route.map(coord => ({ lat: coord[1], lon: coord[0] }));
        this.routeIndex = 0;
        console.log(`   Following OSRM route with ${this.route.length} waypoints`);
      } else {
        this.route = null;
      }

      // Start moving to pickup
      this.startRideMovement();

    } catch (error) {
      console.error(`❌ Error accepting ride:`, error.message);
      this.available = true;
    }
  }

  startRideMovement() {
    console.log(`🚗 ${this.driver.name} starting ride movement...`);

    if (this.rideInterval) {
      clearInterval(this.rideInterval);
    }

    this.rideInterval = setInterval(async () => {
      await this.updateRideLocation();
    }, UPDATE_INTERVAL);

    console.log(`⏱️  ${this.driver.name} movement interval started`);
  }

  async updateRideLocation() {
    if (!this.currentRide || !this.destination) {
      console.log(`⚠️  ${this.driver.name} updateRideLocation: No ride or destination`);
      return;
    }

    console.log(`📍 ${this.driver.name} updating location...`);

    // Move towards destination
    const arrived = this.moveTowardsDestination(this.destination);

    // Update location via API
    try {
      await fetch(`${API_URL}/api/rides/${this.currentRide.id}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: this.location.lat,
          lon: this.location.lon
        })
      });

      // Update Redis
      await this.updateRedisLocation();

      if (arrived) {
        await this.handleArrival();
      }

    } catch (error) {
      console.error(`❌ Error updating location:`, error.message);
    }
  }

  async handleArrival() {
    const ride = this.currentRide;

    // Check current status
    const statusResponse = await fetch(`${API_URL}/api/rides/${ride.id}`);
    const statusData = await statusResponse.json();
    const currentStatus = statusData.ride.status;

    if (currentStatus === 'en_route') {
      // Arrived at pickup
      console.log(`📍 ${this.driver.name} arrived at pickup`);

      await fetch(`${API_URL}/api/rides/${ride.id}/arrive`, {
        method: 'POST'
      });

      // Wait a bit (simulate rider getting in)
      await new Promise(resolve => setTimeout(resolve, 500));

      // Start trip
      console.log(`🚀 ${this.driver.name} starting trip`);

      await fetch(`${API_URL}/api/rides/${ride.id}/start`, {
        method: 'POST'
      });

      // Set destination to dropoff
      this.destination = ride.dropoff;

      // Load trip route (pickup to dropoff)
      // The ride object should have the route from when it was created
      if (ride.route && ride.route.length > 0) {
        this.route = ride.route.map(coord => ({ lat: coord[1], lon: coord[0] }));
        this.routeIndex = 0;
        console.log(`   Following trip route with ${this.route.length} waypoints`);
      } else {
        this.route = null;
      }

    } else if (currentStatus === 'active') {
      // Arrived at dropoff
      console.log(`🎯 ${this.driver.name} arrived at dropoff`);

      await fetch(`${API_URL}/api/rides/${ride.id}/complete`, {
        method: 'POST'
      });

      console.log(`✅ ${this.driver.name} completed ride ${ride.id}`);

      // Reset
      this.currentRide = null;
      this.destination = null;
      this.route = null;
      this.routeIndex = 0;
      this.available = true;

      // Stop ride movement
      if (this.rideInterval) {
        clearInterval(this.rideInterval);
        this.rideInterval = null;
      }
    }
  }

  moveTowardsDestination(destination) {
    // Calculate max movement for this interval
    const maxMove = (MOVEMENT_SPEED_KMH / 3600) * (UPDATE_INTERVAL / 1000); // km

    // If we have a route, follow the waypoints
    if (this.route && this.route.length > 0) {
      return this.followRoute(maxMove);
    }

    // Otherwise, move in straight line to destination
    const distance = this.calculateDistance(
      this.location.lat,
      this.location.lon,
      destination.lat,
      destination.lon
    );

    if (distance <= maxMove * 1.5) {
      // Arrived! Move directly to destination
      this.location.lat = destination.lat;
      this.location.lon = destination.lon;
      return true;
    }

    // Move towards destination
    const ratio = maxMove / distance;
    this.location.lat += (destination.lat - this.location.lat) * ratio;
    this.location.lon += (destination.lon - this.location.lon) * ratio;

    return false;
  }

  followRoute(maxMove) {
    // Follow the OSRM route waypoints
    let distanceMoved = 0;

    while (distanceMoved < maxMove && this.routeIndex < this.route.length) {
      const nextWaypoint = this.route[this.routeIndex];

      const distanceToWaypoint = this.calculateDistance(
        this.location.lat,
        this.location.lon,
        nextWaypoint.lat,
        nextWaypoint.lon
      );

      const remainingMove = maxMove - distanceMoved;

      if (distanceToWaypoint <= remainingMove) {
        // Move to this waypoint and continue to next
        this.location.lat = nextWaypoint.lat;
        this.location.lon = nextWaypoint.lon;
        distanceMoved += distanceToWaypoint;
        this.routeIndex++;

        // Check if we've reached the end of route
        if (this.routeIndex >= this.route.length) {
          return true; // Arrived!
        }
      } else {
        // Move partway towards this waypoint
        const ratio = remainingMove / distanceToWaypoint;
        this.location.lat += (nextWaypoint.lat - this.location.lat) * ratio;
        this.location.lon += (nextWaypoint.lon - this.location.lon) * ratio;
        distanceMoved += remainingMove;
        break;
      }
    }

    return false; // Not arrived yet
  }

  startIdleMovement() {
    this.idleInterval = setInterval(async () => {
      if (this.available && !this.currentRide) {
        // Random walk when idle
        this.randomWalk();
        await this.updateRedisLocation();
      }
    }, 5000);
  }

  randomWalk() {
    const distance = (MOVEMENT_SPEED_KMH / 3600) * 5; // 5 seconds of movement
    const angle = Math.random() * 2 * Math.PI;

    const latOffset = (distance / 111) * Math.cos(angle);
    const lonOffset = (distance / (111 * Math.cos(this.location.lat * Math.PI / 180))) * Math.sin(angle);

    this.location.lat += latOffset;
    this.location.lon += lonOffset;
  }

  async goOnline() {
    await this.redis.set(
      `driver:online:${this.driver.npub}`,
      JSON.stringify({
        npub: this.driver.npub,
        name: this.driver.name,
        location: this.location,
        available: this.available,
        rating: this.driver.reputation.averageRating,
        totalRides: this.driver.reputation.totalRides,
        lastUpdate: Date.now()
      }),
      { EX: 3600 }
    );
  }

  async updateRedisLocation() {
    await this.redis.set(
      `driver:online:${this.driver.npub}`,
      JSON.stringify({
        npub: this.driver.npub,
        name: this.driver.name,
        location: this.location,
        available: this.available,
        rating: this.driver.reputation.averageRating,
        totalRides: this.driver.reputation.totalRides,
        lastUpdate: Date.now()
      }),
      { EX: 3600 }
    );
  }

  async goOffline() {
    console.log(`🔴 ${this.driver.name} going offline...`);

    if (this.ws) {
      this.ws.close();
    }

    if (this.idleInterval) {
      clearInterval(this.idleInterval);
    }

    if (this.rideInterval) {
      clearInterval(this.rideInterval);
    }

    await this.redis.del(`driver:online:${this.driver.npub}`);
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
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

// =====================================================
// Main
// =====================================================

async function main() {
  console.log('========================================');
  console.log('DonkeyRide Smart Driver Simulator');
  console.log('========================================\n');

  // Connect to Redis
  const redis = Redis.createClient({ url: REDIS_URL });
  await redis.connect();
  console.log(`📊 Connected to Redis\n`);

  // Create driver simulators
  const simulators = testData.drivers.map(driver =>
    new SmartDriverSimulator(driver)
  );

  console.log(`🚗 Starting ${simulators.length} smart drivers...\n`);

  // Start all drivers
  for (const sim of simulators) {
    await sim.start(redis);
    await new Promise(resolve => setTimeout(resolve, 500)); // Stagger startup
  }

  console.log('\n✅ All drivers online and ready for rides!');
  console.log('📡 Listening for ride requests via WebSocket');
  console.log('🤖 Drivers will auto-accept rides within 10km\n');
  console.log('Press Ctrl+C to stop\n');

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down...\n');

    for (const sim of simulators) {
      await sim.goOffline();
    }

    await redis.disconnect();

    console.log('✅ All drivers offline. Goodbye!\n');
    process.exit(0);
  });

  // Keep alive
  await new Promise(() => {});
}

main().catch(console.error);
