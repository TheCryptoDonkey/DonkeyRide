#!/usr/bin/env node

/**
 * Simulate Drivers - Multi-Operator Version
 *
 * - Assigns drivers to different operators
 * - Publishes with operator tags
 * - Shows operator competition in action
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
// OPERATOR DEFINITIONS
// =====================================================

const OPERATORS = [
  {
    id: 'operator-a',
    name: 'FastRides',
    npub: process.env.OPERATOR_A_PUBKEY || 'npub1fastrideexample',
    fee: 0.003,  // 0.3% - lowest fee
    color: '#00ff00',  // Green
    description: 'Discount rides, low fees',
    port: 3000
  },
  {
    id: 'operator-b',
    name: 'CityRides',
    npub: process.env.OPERATOR_B_PUBKEY || 'npub1cityridesexample',
    fee: 0.005,  // 0.5% - standard
    color: '#0099ff',  // Blue
    description: 'Standard service, reliable',
    port: 3100
  },
  {
    id: 'operator-c',
    name: 'PremiumRides',
    npub: process.env.OPERATOR_C_PUBKEY || 'npub1premiumridesexample',
    fee: 0.010,  // 1.0% - premium
    color: '#ff9900',  // Orange
    description: 'Premium service, best quality',
    port: 3200
  }
];

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
// Driver Simulation with Operator Assignment
// =====================================================

class DriverSimulator {
  constructor(driver, operator, nostrClient, redis) {
    this.driver = driver;
    this.operator = operator;
    this.nostrClient = nostrClient;
    this.redis = redis;
    this.location = driver.location;
    this.online = false;
    this.moving = false;
  }

  async goOnline() {
    console.log(`🟢 ${this.driver.name} going online with ${this.operator.name} (${this.operator.fee * 100}% fee)...`);

    // Publish to Nostr (Kind 30503 - Driver Online Status)
    // WITH OPERATOR TAGS
    const event = {
      kind: 30503,
      content: '',
      tags: [
        ['d', `driver_status_${this.driver.publicKey}`],
        ['status', 'online'],
        ['lat', this.location.lat.toString()],
        ['lon', this.location.lon.toString()],
        ['available', 'true'],

        // OPERATOR INFORMATION
        ['operator', this.operator.npub],
        ['operator_name', this.operator.name],
        ['operator_fee', this.operator.fee.toString()],
        ['stake_relay', `ws://localhost:${this.operator.port}`]
      ],
      created_at: Math.floor(Date.now() / 1000)
    };

    await this.nostrClient.publish(event, this.driver.privateKey);

    // Store in Redis for quick lookup
    // Include operator information
    await this.redis.set(
      `driver:online:${this.driver.npub}`,
      JSON.stringify({
        npub: this.driver.npub,
        name: this.driver.name,
        location: this.location,
        available: true,
        lastUpdate: Date.now(),

        // Operator info for unified view
        operator: {
          id: this.operator.id,
          name: this.operator.name,
          npub: this.operator.npub,
          fee: this.operator.fee,
          color: this.operator.color,
          port: this.operator.port
        }
      }),
      { EX: 3600 } // Expire after 1 hour
    );

    this.online = true;
    console.log(`✅ ${this.driver.name} is now online with ${this.operator.name}`);

    // Start location updates
    this.startLocationUpdates();
  }

  async goOffline() {
    console.log(`🔴 ${this.driver.name} (${this.operator.name}) going offline...`);

    const event = {
      kind: 30503,
      content: '',
      tags: [
        ['d', `driver_status_${this.driver.publicKey}`],
        ['status', 'offline'],
        ['operator', this.operator.npub]
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
        timestamp: Date.now(),
        operator: this.operator.name
      }),
      { EX: 60 } // Expire after 1 minute
    );

    // Update online status location
    const onlineData = await this.redis.get(`driver:online:${this.driver.npub}`);
    if (onlineData) {
      const data = JSON.parse(onlineData);
      data.location = this.location;
      data.lastUpdate = Date.now();
      await this.redis.set(
        `driver:online:${this.driver.npub}`,
        JSON.stringify(data),
        { EX: 3600 }
      );
    }

    // Publish to Nostr occasionally
    if (Math.random() < 0.1) { // 10% of updates
      const event = {
        kind: 30512, // Status Update
        content: '',
        tags: [
          ['d', `driver_loc_${this.driver.publicKey}_${Date.now()}`],
          ['type', 'location_update'],
          ['lat', this.location.lat.toString()],
          ['lon', this.location.lon.toString()],
          ['operator', this.operator.npub]
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
  console.log('DonkeyRide Multi-Operator Driver Simulator');
  console.log('========================================\n');

  // Initialize clients
  const nostrClient = new NostrClient(NOSTR_RELAYS);
  const redis = Redis.createClient({ url: REDIS_URL });
  await redis.connect();

  console.log(`📡 Connected to Nostr relays: ${NOSTR_RELAYS.join(', ')}`);
  console.log(`📊 Connected to Redis: ${REDIS_URL}\n`);

  // Display operator info
  console.log('🏢 Operators:');
  OPERATORS.forEach(op => {
    console.log(`   ${op.name} (${op.fee * 100}% fee) - ${op.description}`);
  });
  console.log('');

  // Assign drivers to operators
  // Driver 1-3 → Operator A (FastRides)
  // Driver 4-7 → Operator B (CityRides)
  // Driver 8-10 → Operator C (PremiumRides)
  const simulators = testData.drivers.map((driver, index) => {
    const operatorIndex = Math.floor((index / testData.drivers.length) * OPERATORS.length);
    const operator = OPERATORS[Math.min(operatorIndex, OPERATORS.length - 1)];

    return new DriverSimulator(driver, operator, nostrClient, redis);
  });

  // Bring all drivers online
  console.log(`🚗 Bringing ${simulators.length} drivers online across ${OPERATORS.length} operators...\n`);

  // Group by operator for display
  const byOperator = {};
  simulators.forEach(sim => {
    if (!byOperator[sim.operator.name]) {
      byOperator[sim.operator.name] = [];
    }
    byOperator[sim.operator.name].push(sim);
  });

  // Bring online grouped by operator
  for (const [operatorName, sims] of Object.entries(byOperator)) {
    console.log(`--- ${operatorName} ---`);
    for (const sim of sims) {
      await sim.goOnline();
      await new Promise(resolve => setTimeout(resolve, 500)); // Stagger startup
    }
    console.log('');
  }

  console.log('✅ All drivers online and moving!\n');
  console.log('📊 Driver Distribution:');
  for (const [operatorName, sims] of Object.entries(byOperator)) {
    console.log(`   ${operatorName}: ${sims.length} drivers`);
  }
  console.log('');

  console.log('📍 Drivers are updating locations every 5 seconds');
  console.log('🗺️  View them at: http://localhost:3000/demo.html\n');
  console.log('💡 TIP: Riders will see ALL drivers from ALL operators!');
  console.log('    They pick based on price/ETA, not operator.\n');
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
