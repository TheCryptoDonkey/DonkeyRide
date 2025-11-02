#!/usr/bin/env node

/**
 * Setup Test Environment for DonkeyRide
 *
 * Creates:
 * - Test Nostr keys (drivers and riders)
 * - Seeds database with test data
 * - Simulates drivers going online
 */

const crypto = require('crypto');
const { generateSecretKey, getPublicKey } = require('nostr-tools/pure');
const { nip19 } = require('nostr-tools');
const { Pool } = require('pg');
const fs = require('fs');

// Configuration
const NUM_DRIVERS = 10;
const NUM_RIDERS = 5;

// NYC coordinates (for test data)
const NYC_CENTER = { lat: 40.7580, lon: -73.9855 };
const RADIUS_KM = 5;

// =====================================================
// Key Generation
// =====================================================

function generateNostrKeys() {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);

  return {
    privateKey: Buffer.from(sk).toString('hex'),
    publicKey: Buffer.from(pk).toString('hex'),
    nsec: nip19.nsecEncode(sk),
    npub: nip19.npubEncode(pk)
  };
}

function generateTestUsers() {
  console.log('🔑 Generating test keys...\n');

  const drivers = [];
  const riders = [];

  // Generate drivers
  for (let i = 0; i < NUM_DRIVERS; i++) {
    const keys = generateNostrKeys();
    const name = `Driver ${i + 1}`;

    drivers.push({
      name,
      ...keys,
      type: 'driver',
      location: randomLocationNear(NYC_CENTER, RADIUS_KM)
    });

    console.log(`✅ ${name}`);
    console.log(`   npub: ${keys.npub}`);
    console.log(`   nsec: ${keys.nsec}\n`);
  }

  // Generate riders
  for (let i = 0; i < NUM_RIDERS; i++) {
    const keys = generateNostrKeys();
    const name = `Rider ${i + 1}`;

    riders.push({
      name,
      ...keys,
      type: 'rider',
      location: randomLocationNear(NYC_CENTER, RADIUS_KM)
    });

    console.log(`✅ ${name}`);
    console.log(`   npub: ${keys.npub}`);
    console.log(`   nsec: ${keys.nsec}\n`);
  }

  return { drivers, riders };
}

// =====================================================
// Location Utilities
// =====================================================

function randomLocationNear(center, radiusKm) {
  // Random point within radius
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.random() * radiusKm;

  // Convert to lat/lon offset (rough approximation)
  const latOffset = (distance / 111) * Math.cos(angle);
  const lonOffset = (distance / (111 * Math.cos(center.lat * Math.PI / 180))) * Math.sin(angle);

  return {
    lat: center.lat + latOffset,
    lon: center.lon + lonOffset
  };
}

// =====================================================
// Database Seeding
// =====================================================

async function seedDatabase(users) {
  console.log('\n📊 Seeding database...\n');

  const db = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://donkey:devpassword123@localhost:5432/donkeyride'
  });

  try {
    // Create operator if not exists
    await db.query(`
      INSERT INTO operators (pubkey, lightning_address, fee_percent, bond_amount, bond_status)
      VALUES ($1, $2, 0.005, 1000000, 'confirmed')
      ON CONFLICT (pubkey) DO NOTHING
    `, [process.env.OPERATOR_PUBKEY || 'npub1operator', 'operator@getalby.com']);

    console.log('✅ Operator created');

    // Create reputation for all users
    for (const user of [...users.drivers, ...users.riders]) {
      await db.query(`
        INSERT INTO reputation (
          pubkey, user_type,
          total_rides, completed_rides,
          average_rating, total_ratings,
          rating_5_count
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (pubkey) DO NOTHING
      `, [
        user.npub,
        user.type,
        Math.floor(Math.random() * 100) + 10, // 10-110 total rides
        Math.floor(Math.random() * 100) + 10, // completed rides
        4.5 + Math.random() * 0.5, // 4.5-5.0 rating
        Math.floor(Math.random() * 100) + 10, // total ratings
        Math.floor(Math.random() * 80) + 20 // 5-star ratings
      ]);

      console.log(`✅ Created reputation for ${user.name}`);
    }

    console.log('\n✅ Database seeded successfully\n');
  } catch (error) {
    console.error('❌ Database error:', error.message);
  } finally {
    await db.end();
  }
}

// =====================================================
// Save Test Data
// =====================================================

function saveTestData(users) {
  const testData = {
    generated: new Date().toISOString(),
    drivers: users.drivers,
    riders: users.riders
  };

  // Save to JSON file
  fs.writeFileSync(
    'test-users.json',
    JSON.stringify(testData, null, 2)
  );

  // Save to .env format for easy copying
  let envContent = '# Test Users Generated on ' + new Date().toISOString() + '\n\n';

  envContent += '# Drivers\n';
  users.drivers.forEach((driver, i) => {
    envContent += `TEST_DRIVER_${i + 1}_NPUB=${driver.npub}\n`;
    envContent += `TEST_DRIVER_${i + 1}_NSEC=${driver.nsec}\n\n`;
  });

  envContent += '# Riders\n';
  users.riders.forEach((rider, i) => {
    envContent += `TEST_RIDER_${i + 1}_NPUB=${rider.npub}\n`;
    envContent += `TEST_RIDER_${i + 1}_NSEC=${rider.nsec}\n\n`;
  });

  fs.writeFileSync('test-users.env', envContent);

  console.log('💾 Saved test data to:');
  console.log('   - test-users.json (structured data)');
  console.log('   - test-users.env (environment variables)\n');
}

// =====================================================
// Display Summary
// =====================================================

function displaySummary(users) {
  console.log('========================================');
  console.log('🎉 Test Environment Ready!');
  console.log('========================================\n');

  console.log('📊 Generated:');
  console.log(`   - ${users.drivers.length} drivers`);
  console.log(`   - ${users.riders.length} riders`);
  console.log(`   - All with reputation data\n`);

  console.log('🗺️  Locations:');
  console.log(`   - Center: NYC (${NYC_CENTER.lat}, ${NYC_CENTER.lon})`);
  console.log(`   - Radius: ${RADIUS_KM} km\n`);

  console.log('📁 Files created:');
  console.log('   - test-users.json');
  console.log('   - test-users.env\n');

  console.log('🚀 Next steps:');
  console.log('   1. node scripts/simulate-drivers.js  # Put drivers online');
  console.log('   2. open http://localhost:3000/demo   # View map\n');

  console.log('💡 Example usage:');
  console.log('   const testData = require("./test-users.json");');
  console.log('   const driver = testData.drivers[0];');
  console.log('   console.log(driver.nsec); // Use for signing\n');
}

// =====================================================
// Main
// =====================================================

async function main() {
  console.log('========================================');
  console.log('DonkeyRide Test Environment Setup');
  console.log('========================================\n');

  // Generate keys
  const users = generateTestUsers();

  // Save to files
  saveTestData(users);

  // Seed database
  await seedDatabase(users);

  // Display summary
  displaySummary(users);
}

main().catch(console.error);
