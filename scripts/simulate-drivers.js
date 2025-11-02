#!/usr/bin/env node

/**
 * Simulate Drivers Online
 *
 * - Publishes driver online status to Nostr
 * - Updates Redis with current locations
 * - Simulates movement around NYC
 */

const { SimplePool, finalizeEvent, getPublicKey } = require('nostr-tools');
const { nip19 } = require('nostr-tools');
const Redis = require('redis');
const fs = require('fs');

// Load test users
const testData = JSON.parse(fs.readFileSync('test-users.json', 'utf8'));

// Configuration
const NOSTR_RELAYS = (process.env.NOSTR_RELAY || 'ws://localhost:7777').split(',');
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Movement simulation
const MOVEMENT_INTERVAL = 5000; // Update location every 5 seconds
const MOVEMENT_SPEED_KMH = 30; // Average speed

// =====================================================
// Nostr Client
// =====================================================

class NostrClient {
  constructor(relays) {
    this.pool = new SimplePool();
    this.relays = relays;
  }

  async publish(event, privateKeyHex) {
    const sk = Buffer.from(privateKeyHex, 'hex');
    const signedEvent = finalizeEvent(event, sk);

    try {
      await Promise.any(
        this.pool.publish(this.relays, signedEvent)
      );
      return signedEvent;
    } catch (error) {
      console.error('Failed to publish:', error.message);
      return null;
    }
  }

  close() {
    this.pool.close(this.relays);
  }
}

// =====================================================
// Driver Simulation
// =====================================================

class DriverSimulator {
  constructor(driver, nostrClient, redis) {
    this.driver = driver;
    this.nostrClient = nostrClient;
    this.redis = redis;
    this.location = driver.location;
    this.online = false;
    this.moving = false;
    this.destination = null;
  }

  async goOnline() {
    console.log(`🟢 ${this.driver.name} going online...`);

    // Publish to Nostr (Kind 30503 - Driver Online Status)
    const event = {
      kind: 30503,
      content: '',
      tags: [
        ['d', `driver_status_${this.driver.publicKey}`],
        ['status', 'online'],
        ['lat', this.location.lat.toString()],
        ['lon', this.location.lon.toString()],
        ['available', 'true']
      ],
      created_at: Math.floor(Date.now() / 1000)
    };

    await this.nostrClient.publish(event, this.driver.privateKey);

    // Store in Redis for quick lookup
    await this.redis.set(
      `driver:online:${this.driver.npub}`,
      JSON.stringify({
        npub: this.driver.npub,
        name: this.driver.name,
        location: this.location,
        available: true,
        lastUpdate: Date.now()
      }),
      { EX: 3600 } // Expire after 1 hour
    );

    this.online = true;
    console.log(`✅ ${this.driver.name} is now online`);

    // Start location updates
    this.startLocationUpdates();
  }

  async goOffline() {
    console.log(`🔴 ${this.driver.name} going offline...`);

    const event = {
      kind: 30503,
      content: '',
      tags: [
        ['d', `driver_status_${this.driver.publicKey}`],
        ['status', 'offline']
      ],
      created_at: Math.floor(Date.now() / 1000)
    };

    await this.nostrClient.publish(event, this.driver.privateKey);
    await this.redis.del(`driver:online:${this.driver.npub}`);

    this.online = false;
    if (this.locationInterval) {
      clearInterval(this.locationInterval);
    }
  }

  startLocationUpdates() {
    this.locationInterval = setInterval(() => {
      this.simulateMovement();
      this.updateLocation();
    }, MOVEMENT_INTERVAL);
  }

  simulateMovement() {
    // Random walk around the area
    const distance = (MOVEMENT_SPEED_KMH / 3600) * (MOVEMENT_INTERVAL / 1000); // km
    const angle = Math.random() * 2 * Math.PI;

    const latOffset = (distance / 111) * Math.cos(angle);
    const lonOffset = (distance / (111 * Math.cos(this.location.lat * Math.PI / 180))) * Math.sin(angle);

    this.location.lat += latOffset;
    this.location.lon += lonOffset;
  }

  async updateLocation() {
    // Update Redis
    await this.redis.set(
      `driver:location:${this.driver.npub}`,
      JSON.stringify({
        lat: this.location.lat,
        lon: this.location.lon,
        heading: Math.floor(Math.random() * 360),
        speed: MOVEMENT_SPEED_KMH,
        timestamp: Date.now()
      }),
      { EX: 60 } // Expire after 1 minute
    );

    // Publish to Nostr (occasionally, not every update)
    if (Math.random() < 0.1) { // 10% of updates
      const event = {
        kind: 30512, // Status Update
        content: '',
        tags: [
          ['d', `driver_loc_${this.driver.publicKey}_${Date.now()}`],
          ['type', 'location_update'],
          ['lat', this.location.lat.toString()],
          ['lon', this.location.lon.toString()],
          ['heading', Math.floor(Math.random() * 360).toString()],
          ['speed', MOVEMENT_SPEED_KMH.toString()]
        ],
        created_at: Math.floor(Date.now() / 1000)
      };

      await this.nostrClient.publish(event, this.driver.privateKey);
    }
  }
}

// =====================================================
// Main Simulation
// =====================================================

async function main() {
  console.log('========================================');
  console.log('DonkeyRide Driver Simulator');
  console.log('========================================\n');

  // Initialize clients
  const nostrClient = new NostrClient(NOSTR_RELAYS);
  const redis = Redis.createClient({ url: REDIS_URL });
  await redis.connect();

  console.log(`📡 Connected to Nostr relays: ${NOSTR_RELAYS.join(', ')}`);
  console.log(`📊 Connected to Redis: ${REDIS_URL}\n`);

  // Create driver simulators
  const simulators = testData.drivers.map(driver =>
    new DriverSimulator(driver, nostrClient, redis)
  );

  // Bring all drivers online
  console.log(`🚗 Bringing ${simulators.length} drivers online...\n`);

  for (const sim of simulators) {
    await sim.goOnline();
    await new Promise(resolve => setTimeout(resolve, 500)); // Stagger startup
  }

  console.log('\n✅ All drivers online and moving!\n');
  console.log('📍 Drivers are updating locations every 5 seconds');
  console.log('🗺️  View them at: http://localhost:3000/demo\n');
  console.log('Press Ctrl+C to stop simulation\n');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down...\n');

    for (const sim of simulators) {
      await sim.goOffline();
    }

    nostrClient.close();
    await redis.disconnect();

    console.log('✅ All drivers offline. Goodbye!\n');
    process.exit(0);
  });

  // Keep alive
  await new Promise(() => {});
}

main().catch(console.error);
