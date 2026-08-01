const { test } = require('node:test');
const assert = require('node:assert/strict');

const { loadProfile, listProfiles, profileExists, validateProfile } = require('../../src/domain-profiles');
const { TaskManager } = require('../../src/task-manager');
const { RideManager, RideStatus } = require('../../src/ride-manager');

// ==========================================
// Domain Profile Schema & Loader Tests
// ==========================================

test('listProfiles returns all built-in profile identifiers', () => {
  const profiles = listProfiles();
  assert.ok(profiles.includes('ridesharing'));
  assert.ok(profiles.includes('locksmith'));
  assert.ok(profiles.includes('delivery'));
  assert.ok(profiles.length >= 3);
});

test('profileExists returns true for built-in profiles', () => {
  assert.equal(profileExists('ridesharing'), true);
  assert.equal(profileExists('locksmith'), true);
  assert.equal(profileExists('delivery'), true);
});

test('profileExists returns false for unknown profiles', () => {
  assert.equal(profileExists('nonexistent_domain_xyz'), false);
});

test('loadProfile loads ridesharing profile by default', () => {
  const profile = loadProfile();
  assert.equal(profile.id, 'ridesharing');
  assert.equal(profile.name, 'DonkeyRide');
  assert.equal(profile.roles.requester, 'rider');
  assert.equal(profile.roles.provider, 'driver');
});

test('loadProfile loads locksmith profile', () => {
  const profile = loadProfile('locksmith');
  assert.equal(profile.id, 'locksmith');
  assert.equal(profile.roles.requester, 'customer');
  assert.equal(profile.roles.provider, 'locksmith');
  assert.equal(profile.states.initial, 'lockout_reported');
  assert.ok(profile.states.values.METHOD_CONFIRMED);
  assert.equal(profile.features.quoteNegotiation, true);
});

test('loadProfile loads delivery profile', () => {
  const profile = loadProfile('delivery');
  assert.equal(profile.id, 'delivery');
  assert.equal(profile.roles.requester, 'sender');
  assert.equal(profile.roles.provider, 'courier');
  assert.ok(profile.states.values.COLLECTED);
  assert.ok(profile.states.values.ARRIVED_AT_DELIVERY);
  assert.equal(profile.features.signatures, true);
  assert.equal(profile.features.photos, true);
});

test('loadProfile throws for unknown profiles', () => {
  assert.throws(() => loadProfile('nonexistent_xyz'), /not found/);
});

test('validateProfile rejects profiles without required fields', () => {
  assert.throws(() => validateProfile(null), /must be an object/);
  assert.throws(() => validateProfile({}), /requires a 'id'/);
  assert.throws(() => validateProfile({ id: 'x' }), /requires a 'name'/);
});

test('validateProfile rejects profiles with invalid state transitions', () => {
  assert.throws(() => validateProfile({
    id: 'bad',
    name: 'Bad',
    discoveryMethod: 'geohash',
    pricingModel: 'flatRate',
    states: {
      values: { A: 'a', B: 'b' },
      transitions: { 'a': ['nonexistent'] },
      terminal: ['b'],
      initial: 'a'
    },
    roles: { requester: 'r', provider: 'p' }
  }), /Transition target 'nonexistent' not found/);
});

test('validateProfile applies defaults for optional fields', () => {
  const profile = validateProfile({
    id: 'minimal',
    name: 'Minimal',
    discoveryMethod: 'geohash',
    pricingModel: 'flatRate',
    states: {
      values: { REQUESTED: 'requested', COMPLETED: 'completed', CANCELLED: 'cancelled' },
      transitions: { 'requested': ['completed', 'cancelled'] },
      terminal: ['completed', 'cancelled'],
      initial: 'requested'
    },
    roles: { requester: 'client', provider: 'worker' }
  });

  assert.equal(profile.stakingModel.requesterStakePercent, 0.10);
  assert.equal(profile.stakingModel.providerStakePercent, 0.15);
  assert.equal(profile.encryptionRequired, false);
  assert.equal(profile.features.navigation, true);
  assert.equal(profile.eventKinds.taskAnnouncement, 37500);
  assert.equal(profile.eventKinds.rating, 30520);
  assert.equal(profile.eventKinds.stakeLock, 30532);
});

test('validateProfile applies default labels when none provided', () => {
  const profile = validateProfile({
    id: 'nolabels',
    name: 'No Labels',
    discoveryMethod: 'geohash',
    pricingModel: 'flatRate',
    states: {
      values: { REQUESTED: 'requested', COMPLETED: 'completed', CANCELLED: 'cancelled' },
      transitions: { 'requested': ['completed', 'cancelled'] },
      terminal: ['completed', 'cancelled'],
      initial: 'requested'
    },
    roles: { requester: 'client', provider: 'worker' }
  });

  assert.equal(profile.labels.originLabel, 'Pickup');
  assert.equal(profile.labels.destinationLabel, 'Dropoff');
  assert.equal(profile.labels.taskNoun, 'task');
  assert.equal(profile.labels.requestVerb, 'Request');
  assert.equal(profile.labels.activeVerb, 'In progress');
  assert.equal(profile.labels.completedLabel, 'Complete');
  assert.ok(profile.labels.originInstruction);
  assert.ok(profile.labels.destinationInstruction);
});

test('validateProfile merges partial labels with defaults', () => {
  const profile = validateProfile({
    id: 'partial',
    name: 'Partial Labels',
    discoveryMethod: 'geohash',
    pricingModel: 'flatRate',
    states: {
      values: { REQUESTED: 'requested', COMPLETED: 'completed', CANCELLED: 'cancelled' },
      transitions: { 'requested': ['completed', 'cancelled'] },
      terminal: ['completed', 'cancelled'],
      initial: 'requested'
    },
    roles: { requester: 'client', provider: 'worker' },
    labels: {
      taskNoun: 'job',
      originLabel: 'Site'
    }
  });

  // Provided values override defaults
  assert.equal(profile.labels.taskNoun, 'job');
  assert.equal(profile.labels.originLabel, 'Site');
  // Unprovided values fall back to defaults
  assert.equal(profile.labels.destinationLabel, 'Dropoff');
  assert.equal(profile.labels.requestVerb, 'Request');
  assert.equal(profile.labels.completedLabel, 'Complete');
});

test('all built-in profiles have domain-specific labels', () => {
  const ridesharing = loadProfile('ridesharing');
  assert.equal(ridesharing.labels.taskNoun, 'ride');
  assert.equal(ridesharing.labels.originLabel, 'Pickup');

  const locksmith = loadProfile('locksmith');
  assert.equal(locksmith.labels.taskNoun, 'callout');
  assert.equal(locksmith.labels.originLabel, 'Lockout location');
  assert.equal(locksmith.labels.destinationLabel, '');

  const delivery = loadProfile('delivery');
  assert.equal(delivery.labels.taskNoun, 'delivery');
  assert.equal(delivery.labels.originLabel, 'Collection point');
  assert.equal(delivery.labels.destinationLabel, 'Delivery address');
});

// ==========================================
// All Profiles Validate Correctly
// ==========================================

test('all built-in profiles pass validation', () => {
  for (const id of listProfiles()) {
    const profile = loadProfile(id);
    assert.ok(profile.id, `Profile ${id} has an id`);
    assert.ok(profile.states.values, `Profile ${id} has states`);
    assert.ok(profile.roles.requester, `Profile ${id} has requester role`);
    assert.ok(profile.roles.provider, `Profile ${id} has provider role`);
  }
});

test('all built-in profiles have requiresDestination feature flag', () => {
  for (const id of listProfiles()) {
    const profile = loadProfile(id);
    assert.equal(typeof profile.features.requiresDestination, 'boolean',
      `Profile ${id} must have boolean requiresDestination`);
  }

  const locksmith = loadProfile('locksmith');
  assert.equal(locksmith.features.requiresDestination, false,
    'Locksmith should not require destination');

  const ridesharing = loadProfile('ridesharing');
  assert.equal(ridesharing.features.requiresDestination, true,
    'Ridesharing should require destination');

  const delivery = loadProfile('delivery');
  assert.equal(delivery.features.requiresDestination, true,
    'Delivery should require destination');
});

// ==========================================
// TaskManager Tests
// ==========================================

test('TaskManager creates tasks with correct domain state', () => {
  const tm = new TaskManager('ridesharing');
  const task = tm.createTask(
    { pubkey: 'abc123' },
    { lat: 51.5, lon: -0.12 },
    { lat: 51.52, lon: -0.11 },
    5000
  );

  assert.equal(task.status, 'requested');
  assert.equal(task.domain, 'ridesharing');
  assert.ok(task.id.startsWith('ride_'));
  assert.equal(task.fare, 5000);
  assert.equal(task.pickup.lat, 51.5);
  assert.equal(task.dropoff.lat, 51.52);
});

test('TaskManager creates locksmith tasks with domain-specific initial state', () => {
  const tm = new TaskManager('locksmith');
  const task = tm.createTask(
    { pubkey: 'def456' },
    { lat: 51.5, lon: -0.12 },
    null,
    15000
  );

  assert.equal(task.status, 'lockout_reported');
  assert.equal(task.domain, 'locksmith');
  assert.ok(task.id.startsWith('task_'));
});

test('TaskManager enforces domain-specific state transitions', () => {
  const tm = new TaskManager('locksmith');
  const task = tm.createTask(
    { pubkey: 'ghi789' },
    { lat: 51.5, lon: -0.12 },
    null,
    15000
  );

  // Accept
  tm.acceptTask(task.id, 'npub_lock1', {
    name: 'Bob the Locksmith',
    location: { lat: 51.49, lon: -0.13 },
    pubkey: 'lock_pub1'
  });
  assert.equal(tm.getTask(task.id).status, 'locksmith_matched');

  // En route
  tm.startEnRoute(task.id);
  assert.equal(tm.getTask(task.id).status, 'en_route');

  // Arrive
  tm.arriveAtPickup(task.id);
  assert.equal(tm.getTask(task.id).status, 'arrived');

  // Transition to domain-specific state: access_method_confirmed
  tm.transitionTo(task.id, 'access_method_confirmed', { method: 'picking' });
  assert.equal(tm.getTask(task.id).status, 'access_method_confirmed');

  // Start work
  tm.startTrip(task.id);
  assert.equal(tm.getTask(task.id).status, 'work_active');

  // Complete
  tm.completeTrip(task.id, { amount: 15000 });
  assert.equal(tm.getTask(task.id).status, 'access_gained');
});

test('TaskManager rejects invalid transitions', () => {
  const tm = new TaskManager('ridesharing');
  const task = tm.createTask(
    { pubkey: 'rej123' },
    { lat: 51.5, lon: -0.12 },
    { lat: 51.52, lon: -0.11 },
    5000
  );

  // Cannot jump directly from requested to active
  assert.throws(() => tm.startTrip(task.id), /not allowed/);
});

test('TaskManager delivery profile has extra states', () => {
  const tm = new TaskManager('delivery');
  const task = tm.createTask(
    { pubkey: 'del123' },
    { lat: 51.5, lon: -0.12 },
    { lat: 51.52, lon: -0.11 },
    3000
  );

  assert.equal(task.status, 'collection_requested');

  tm.acceptTask(task.id, 'npub_courier1', {
    name: 'Fast Courier',
    location: { lat: 51.49, lon: -0.13 },
    pubkey: 'courier_pub1'
  });
  assert.equal(tm.getTask(task.id).status, 'courier_matched');

  tm.startEnRoute(task.id);
  tm.arriveAtPickup(task.id);
  assert.equal(tm.getTask(task.id).status, 'arrived_at_pickup');

  // Domain-specific: collected
  tm.transitionTo(task.id, 'collected');
  assert.equal(tm.getTask(task.id).status, 'collected');

  // In transit
  tm.startTrip(task.id);
  assert.equal(tm.getTask(task.id).status, 'in_transit');

  // Arrived at delivery
  tm.transitionTo(task.id, 'arrived_at_delivery');
  assert.equal(tm.getTask(task.id).status, 'arrived_at_delivery');

  // Delivered
  tm.completeTrip(task.id, { proof: 'photo_url' });
  assert.equal(tm.getTask(task.id).status, 'delivered');
});

test('TaskManager cancel works from any non-terminal state', () => {
  const tm = new TaskManager('ridesharing');
  const task = tm.createTask(
    { pubkey: 'can123' },
    { lat: 51.5, lon: -0.12 },
    { lat: 51.52, lon: -0.11 },
    5000
  );

  tm.cancelTask(task.id, 'can123', 'changed my mind');
  assert.equal(tm.getTask(task.id).status, 'cancelled');
});

test('TaskManager cancel throws on already-terminal tasks', () => {
  const tm = new TaskManager('ridesharing');
  const task = tm.createTask(
    { pubkey: 'term123' },
    { lat: 51.5, lon: -0.12 },
    { lat: 51.52, lon: -0.11 },
    5000
  );

  tm.cancelTask(task.id, 'term123', 'test');
  assert.throws(() => tm.cancelTask(task.id, 'term123', 'again'), /already cancelled/);
});

test('TaskManager getStats returns counts per state', () => {
  const tm = new TaskManager('ridesharing');
  tm.createTask({ pubkey: 'st1' }, { lat: 51.5, lon: -0.12 }, { lat: 51.52, lon: -0.11 }, 1000);
  tm.createTask({ pubkey: 'st2' }, { lat: 51.5, lon: -0.12 }, { lat: 51.52, lon: -0.11 }, 2000);

  const stats = tm.getStats();
  assert.equal(stats.total, 2);
  assert.equal(stats.requested, 2);
});

test('TaskManager getActiveTasks excludes terminal states', () => {
  const tm = new TaskManager('ridesharing');
  const t1 = tm.createTask({ pubkey: 'act1' }, { lat: 51.5, lon: -0.12 }, { lat: 51.52, lon: -0.11 }, 1000);
  tm.createTask({ pubkey: 'act2' }, { lat: 51.5, lon: -0.12 }, { lat: 51.52, lon: -0.11 }, 2000);
  tm.cancelTask(t1.id, 'act1', 'test');

  const active = tm.getActiveTasks();
  assert.equal(active.length, 1);
});

test('TaskManager records ratings', () => {
  const originalSetTimeout = global.setTimeout;
  try {
    global.setTimeout = (fn, ms, ...args) => {
      if (ms === 300000) return 0;
      return originalSetTimeout(fn, ms, ...args);
    };

    const tm = new TaskManager('ridesharing');
    const task = tm.createTask({ pubkey: 'rat1' }, { lat: 51.5, lon: -0.12 }, { lat: 51.52, lon: -0.11 }, 1000);

    tm.acceptTask(task.id, 'npub_drv', { name: 'D', location: { lat: 51, lon: 0 }, pubkey: 'drv1' });
    tm.startEnRoute(task.id);
    tm.arriveAtPickup(task.id);
    tm.startTrip(task.id);
    tm.completeTrip(task.id, { hash: 'test' });

    tm.recordRating(task.id, 'rider', { rating: 5 });
    assert.equal(tm.getTask(task.id).feedback.rider.rating, 5);

    assert.throws(() => tm.recordRating(task.id, 'rider', { rating: 4 }), /already recorded/);
  } finally {
    global.setTimeout = originalSetTimeout;
  }
});

// ==========================================
// RideManager Backward Compatibility Tests
// ==========================================

test('RideManager is backward compatible — creates rides with original API', () => {
  const rm = new RideManager();
  const ride = rm.createRide(
    { pubkey: 'bc_pub1' },
    { lat: 51.5, lon: -0.12 },
    { lat: 51.52, lon: -0.11 },
    5000
  );

  assert.equal(ride.status, 'requested');
  assert.ok(ride.id.startsWith('ride_'));
  assert.ok(rm.rides instanceof Map);
  assert.equal(rm.getRide(ride.id), ride);
});

test('RideManager backward compat — full ride lifecycle', () => {
  const originalSetTimeout = global.setTimeout;
  try {
    global.setTimeout = (fn, ms, ...args) => {
      if (ms === 300000) return 0;
      return originalSetTimeout(fn, ms, ...args);
    };

    const rm = new RideManager();
    const ride = rm.createRide(
      { pubkey: 'bc_rider1' },
      { lat: 51.5, lon: -0.12 },
      { lat: 51.52, lon: -0.11 },
      2500,
      { rideId: 'ride_bc_test' }
    );

    assert.equal(ride.status, RideStatus.REQUESTED);

    rm.acceptRide('ride_bc_test', 'driver_npub', {
      name: 'Test Driver',
      location: { lat: 51.49, lon: -0.13 },
      rating: 4.8,
      pubkey: 'bc_driver1'
    });
    assert.equal(rm.getRide('ride_bc_test').status, RideStatus.MATCHED);

    rm.startEnRoute('ride_bc_test');
    assert.equal(rm.getRide('ride_bc_test').status, RideStatus.DRIVER_EN_ROUTE);

    rm.arriveAtPickup('ride_bc_test');
    assert.equal(rm.getRide('ride_bc_test').status, RideStatus.DRIVER_ARRIVED);

    rm.startTrip('ride_bc_test');
    assert.equal(rm.getRide('ride_bc_test').status, RideStatus.ACTIVE);

    rm.completeTrip('ride_bc_test', { hash: 'test_hash' });
    assert.equal(rm.getRide('ride_bc_test').status, RideStatus.COMPLETED);
  } finally {
    global.setTimeout = originalSetTimeout;
  }
});

test('RideManager backward compat — RideStatus constants unchanged', () => {
  assert.equal(RideStatus.REQUESTED, 'requested');
  assert.equal(RideStatus.MATCHED, 'matched');
  assert.equal(RideStatus.DRIVER_EN_ROUTE, 'en_route');
  assert.equal(RideStatus.DRIVER_ARRIVED, 'arrived');
  assert.equal(RideStatus.ACTIVE, 'active');
  assert.equal(RideStatus.COMPLETED, 'completed');
  assert.equal(RideStatus.CANCELLED, 'cancelled');
});

test('RideManager backward compat — getRideByRider and getRideByDriver work', () => {
  const rm = new RideManager();
  const ride = rm.createRide(
    { pubkey: 'lookup_rider' },
    { lat: 51.5, lon: -0.12 },
    { lat: 51.52, lon: -0.11 },
    3000
  );

  const found = rm.getRideByRider('lookup_rider');
  assert.equal(found.id, ride.id);

  rm.acceptRide(ride.id, 'lookup_driver_npub', {
    name: 'D',
    location: { lat: 51, lon: 0 },
    pubkey: 'lookup_driver'
  });

  const driverRide = rm.getRideByDriver('lookup_driver');
  assert.equal(driverRide.id, ride.id);
});

test('RideManager backward compat — cancelRide works', () => {
  const rm = new RideManager();
  const ride = rm.createRide(
    { pubkey: 'cancel_pub' },
    { lat: 51.5, lon: -0.12 },
    { lat: 51.52, lon: -0.11 },
    3000
  );

  rm.cancelRide(ride.id, 'cancel_pub', 'test cancellation');
  assert.equal(rm.getRide(ride.id).status, RideStatus.CANCELLED);
});

test('RideManager backward compat — getActiveRides and getStats work', () => {
  const rm = new RideManager();
  rm.createRide({ pubkey: 'stat1' }, { lat: 51.5, lon: -0.12 }, { lat: 51.52, lon: -0.11 }, 1000);
  rm.createRide({ pubkey: 'stat2' }, { lat: 51.5, lon: -0.12 }, { lat: 51.52, lon: -0.11 }, 2000);

  assert.equal(rm.getActiveRides().length, 2);

  const stats = rm.getStats();
  assert.equal(stats.total, 2);
});

test('RideManager backward compat — updateDriverLocation works', () => {
  const rm = new RideManager();
  const ride = rm.createRide(
    { pubkey: 'loc_rider' },
    { lat: 51.5, lon: -0.12 },
    { lat: 51.52, lon: -0.11 },
    3000
  );

  rm.acceptRide(ride.id, 'loc_driver_npub', {
    name: 'D',
    location: { lat: 51, lon: 0 },
    pubkey: 'loc_driver'
  });

  rm.updateDriverLocation(ride.id, { lat: 51.51, lon: -0.115 }, 120);
  const updated = rm.getRide(ride.id);
  assert.equal(updated.driver.location.lat, 51.51);
  assert.equal(updated.driver.eta, 120);
});

test('RideManager backward compat — calculateETA and calculateDistance work', () => {
  const rm = new RideManager();
  const distance = rm.calculateDistance(51.5, -0.12, 51.52, -0.11);
  assert.ok(distance > 0);
  assert.ok(distance < 5);

  const eta = rm.calculateETA({ lat: 51.5, lon: -0.12 }, { lat: 51.52, lon: -0.11 });
  assert.ok(eta > 0);
});

// ==========================================
// Domain Theme Tests
// ==========================================

test('all built-in profiles have theme data with required fields', () => {
  const requiredFields = [
    'primary', 'primaryRgb', 'secondary', 'secondaryRgb',
    'accent', 'accentRgb', 'gradientFrom', 'gradientTo',
    'gradientAngle', 'routeColour', 'emoji'
  ];

  for (const id of listProfiles()) {
    const profile = loadProfile(id);
    assert.ok(profile.theme, `Profile ${id} must have a theme object`);
    for (const field of requiredFields) {
      assert.equal(typeof profile.theme[field], 'string',
        `Profile ${id} theme.${field} must be a string`);
    }
  }
});

test('schema applies theme defaults when no theme provided', () => {
  const profile = validateProfile({
    id: 'notheme',
    name: 'No Theme',
    discoveryMethod: 'geohash',
    pricingModel: 'flatRate',
    states: {
      values: { REQUESTED: 'requested', COMPLETED: 'completed', CANCELLED: 'cancelled' },
      transitions: { 'requested': ['completed', 'cancelled'] },
      terminal: ['completed', 'cancelled'],
      initial: 'requested'
    },
    roles: { requester: 'client', provider: 'worker' }
  });

  assert.ok(profile.theme, 'Default theme must be applied');
  assert.equal(profile.theme.primary, '#b24cf3');
  assert.equal(profile.theme.primaryRgb, '178, 76, 243');
  assert.equal(profile.theme.secondary, '#ff6ec7');
  assert.equal(profile.theme.accent, '#00ff88');
  assert.equal(profile.theme.emoji, '');
});

test('each domain has distinct primary colours and correct emoji', () => {
  const ridesharing = loadProfile('ridesharing');
  const locksmith = loadProfile('locksmith');
  const delivery = loadProfile('delivery');

  // Distinct primary colours
  assert.notEqual(ridesharing.theme.primary, locksmith.theme.primary);
  assert.notEqual(ridesharing.theme.primary, delivery.theme.primary);
  assert.notEqual(locksmith.theme.primary, delivery.theme.primary);

  // Correct emojis
  assert.equal(ridesharing.theme.emoji, '🚗');
  assert.equal(locksmith.theme.emoji, '🔑');
  assert.equal(delivery.theme.emoji, '📦');
});
