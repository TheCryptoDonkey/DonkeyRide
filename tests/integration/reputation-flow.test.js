const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  getPublicKey,
  getEventHash,
  getSignature
} = require('nostr-tools');

const reputation = require('../../src/nostr/reputation');
const { RideManager } = require('../../src/ride-manager');
const { TaskManager } = require('../../src/task-manager');
const { validateNIP98Auth } = require('../../middleware/nip98-auth');

const RIDER_PRIV_HEX = 'f4b31f1248bfa5e603a1c1d73c6f9d1286f5fb7c1d3aa4c9bd4a62d2a6a4a2f1';
const DRIVER_PRIV_HEX = 'EXAMPLE_VALUE';

const riderPrivBytes = hexToBytes(RIDER_PRIV_HEX);
const driverPrivBytes = hexToBytes(DRIVER_PRIV_HEX);
const riderPubKey = getPublicKey(riderPrivBytes);
const driverPubKey = getPublicKey(driverPrivBytes);

process.env.REPUTATION_STRICT = 'false';

function hexToBytes(hex) {
  const pairs = hex.match(/.{1,2}/g) || [];
  return Uint8Array.from(pairs.map((byte) => parseInt(byte, 16)));
}

function buildNip98Event(url, method) {
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
  event.id = getEventHash(event);
  event.sig = getSignature(event, riderPrivBytes);
  return event;
}

function encodeAuthHeader(event) {
  return `Nostr ${Buffer.from(JSON.stringify(event)).toString('base64')}`;
}

function buildRatingEvent(rideId, targetHex, ratingValue) {
  const event = {
    kind: 30520,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['ride', rideId],
      ['p', targetHex.toLowerCase()],
      ['rating', String(ratingValue)],
      ['role', 'rider']
    ],
    content: ''
  };
  event.pubkey = riderPubKey;
  event.id = getEventHash(event);
  event.sig = getSignature(event, riderPrivBytes);
  return event;
}

function buildPanicEvent(rideId, targetHex) {
  const tags = [
    ['ride', rideId],
    ['role', 'rider']
  ];
  if (targetHex) {
    tags.push(['p', targetHex.toLowerCase()]);
  }
  const event = {
    kind: 30540,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: 'integration-test'
  };
  event.pubkey = riderPubKey;
  event.id = getEventHash(event);
  event.sig = getSignature(event, riderPrivBytes);
  return event;
}

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

test('validateNIP98Auth accepts valid headers and populates req.user', () => {
  const url = 'http://localhost:3000/rides/create';
  const event = buildNip98Event(url, 'POST');
  const authHeader = encodeAuthHeader(event);
  const req = {
    headers: { authorization: authHeader },
    method: 'POST',
    protocol: 'http',
    originalUrl: '/rides/create',
    get(field) {
      if (field.toLowerCase() === 'host') {
        return 'localhost:3000';
      }
      return undefined;
    }
  };
  const res = createMockRes();
  let nextCalled = false;

  validateNIP98Auth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(req.user.pubkey, riderPubKey);
  assert.equal(req.user.authEvent.id, event.id);
  assert.equal(req.user.authEvent.pubkey, event.pubkey);
});

test('validateNIP98Auth rejects malformed headers', () => {
  const req = {
    headers: { authorization: 'Bad header' },
    method: 'POST',
    protocol: 'http',
    originalUrl: '/rides/create',
    get() {
      return 'localhost:3000';
    }
  };
  const res = createMockRes();
  validateNIP98Auth(req, res, () => {});

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'Invalid Authorization format');
});

test('reputation module caches events when relays fail', async () => {
  const originalLog = console.log;
  const originalWarn = console.warn;
  try {
    console.log = () => {};
    console.warn = () => {};

  reputation.setRelays(['mock://fail']);
  reputation.clearCacheFor(riderPubKey);
  reputation.clearCacheFor(driverPubKey);

  const rideManager = new RideManager();
  const ride = rideManager.createRide(
    { pubkey: riderPubKey },
    { lat: 51.5, lon: -0.12 },
    { lat: 51.52, lon: -0.11 },
    2500,
    { rideId: `ride_${Date.now().toString(36)}` }
  );

  rideManager.acceptRide(ride.id, driverPubKey, {
    name: 'Integration Driver',
    location: { lat: 51.49, lon: -0.13 },
    rating: 4.9,
    pubkey: driverPubKey
  });
  rideManager.startEnRoute(ride.id);
  rideManager.arriveAtPickup(ride.id);
  rideManager.startTrip(ride.id);

  const panicEvent = buildPanicEvent(ride.id, driverPubKey);
  const panicResult = await reputation.publishPanic(panicEvent, ride);
  assert.equal(panicResult.cachedLocally, true);
  assert.ok(Array.isArray(panicResult.relayStatuses));
  assert.equal(panicResult.relayStatuses[0]?.ok, false);

  const originalSetTimeout = global.setTimeout;
  try {
    global.setTimeout = (fn, ms, ...args) => {
      if (ms === 300000) {
        return 0;
      }
      return originalSetTimeout(fn, ms, ...args);
    };
    rideManager.completeTrip(ride.id, { success: true, payment_hash: 'testhash' });
  } finally {
    global.setTimeout = originalSetTimeout;
  }
  const completedRide = rideManager.getRide(ride.id);

  const ratingEvent = buildRatingEvent(ride.id, driverPubKey, 5);
  const ratingResult = await reputation.publishRating(ratingEvent, completedRide);
  assert.equal(ratingResult.cachedLocally, true);
  assert.ok(Array.isArray(ratingResult.relayStatuses));
  assert.equal(ratingResult.relayStatuses[0]?.ok, false);

  const driverProfile = await reputation.getProfile(driverPubKey);
  assert.equal(driverProfile.pubkey, driverPubKey);
  assert.equal(driverProfile.ratingsCount, 1);
  assert.equal(driverProfile.averageRating, 5);

  const riderProfile = await reputation.getProfile(riderPubKey);
  assert.equal(riderProfile.pubkey, riderPubKey);
  assert.equal(riderProfile.panicCount, 1);
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
});

test('a no-show report on a cancelled ride aggregates into noShowCount', async () => {
  const originalLog = console.log;
  const originalWarn = console.warn;
  try {
    console.log = () => {};
    console.warn = () => {};

    reputation.setRelays(['mock://fail']);
    // Fresh target keypair so earlier tests' cached ratings don't bleed in
    const noShowDriverPrivBytes = hexToBytes('9d2f6c1b3a8e5d4c7f0a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f501');
    const noShowDriverPub = getPublicKey(noShowDriverPrivBytes);
    reputation.clearCacheFor(noShowDriverPub);

    const rideManager = new RideManager();
    const ride = rideManager.createRide(
      { pubkey: riderPubKey },
      { lat: 51.5, lon: -0.12 },
      { lat: 51.52, lon: -0.11 },
      2500,
      { rideId: `ride_noshow_${Date.now().toString(36)}` }
    );
    rideManager.acceptRide(ride.id, noShowDriverPub, {
      name: 'No-show Driver',
      location: { lat: 51.49, lon: -0.13 },
      pubkey: noShowDriverPub
    });
    rideManager.startEnRoute(ride.id);
    // The driver never arrives; the rider cancels and reports the no-show
    rideManager.cancelRide(ride.id, riderPubKey, 'no_show');

    const event = {
      kind: 30520,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['ride', ride.id],
        ['p', noShowDriverPub.toLowerCase()],
        ['rating', '1'],
        ['no_show', 'true'],
        ['role', 'rider']
      ],
      content: 'no_show'
    };
    event.pubkey = riderPubKey;
    event.id = getEventHash(event);
    event.sig = getSignature(event, riderPrivBytes);

    const result = await reputation.publishRating(event, rideManager.getRide(ride.id));
    assert.equal(result.rating, 1);
    assert.equal(result.targetHex, noShowDriverPub.toLowerCase());

    const profile = await reputation.getProfile(noShowDriverPub);
    assert.equal(profile.noShowCount, 1, 'no-show counted');
    assert.ok(profile.latestNoShowAt > 0, 'no-show timestamp surfaced');
    assert.equal(profile.ratingsCount, 1, 'the report also counts as a rating');
    assert.equal(profile.averageRating, 1, 'and prices in as 1 star');
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
});

test('locksmith-domain ratings work with role=customer', async () => {
  const originalLog = console.log;
  const originalWarn = console.warn;
  try {
    console.log = () => {};
    console.warn = () => {};

    reputation.setRelays(['mock://fail']);
    reputation.clearCacheFor(riderPubKey);
    reputation.clearCacheFor(driverPubKey);

    // Create a locksmith-domain task via TaskManager
    const taskManager = new TaskManager('locksmith');
    const task = taskManager.createTask(
      { pubkey: riderPubKey },
      { lat: 51.5, lon: -0.12 },
      null,
      5000,
      { taskId: `task_locksmith_${Date.now().toString(36)}` }
    );

    taskManager.acceptTask(task.id, driverPubKey, {
      name: 'Integration Locksmith',
      location: { lat: 51.49, lon: -0.13 },
      rating: 4.8,
      pubkey: driverPubKey
    });
    taskManager.startEnRoute(task.id);
    taskManager.arriveAtPickup(task.id);
    // Locksmith domain has METHOD_CONFIRMED intermediate state
    taskManager.transitionTo(task.id, 'access_method_confirmed');
    taskManager.startTrip(task.id);

    const originalSetTimeout = global.setTimeout;
    try {
      global.setTimeout = (fn, ms, ...args) => {
        if (ms === 300000) {
          return 0;
        }
        return originalSetTimeout(fn, ms, ...args);
      };
      taskManager.completeTrip(task.id, { success: true, payment_hash: 'lockhash' });
    } finally {
      global.setTimeout = originalSetTimeout;
    }
    const completedTask = taskManager.getTask(task.id);

    // Simulate a pure domain-agnostic task: strip legacy rider/driver fields
    // to verify the reputation system works with only requester/provider
    delete completedTask.rider;
    delete completedTask.driver;

    // Build a rating event with role='customer' (locksmith domain requester role)
    const ratingEvent = {
      kind: 30520,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['ride', completedTask.id],
        ['p', driverPubKey.toLowerCase()],
        ['rating', '4'],
        ['role', 'customer']
      ],
      content: ''
    };
    ratingEvent.pubkey = riderPubKey;
    ratingEvent.id = getEventHash(ratingEvent);
    ratingEvent.sig = getSignature(ratingEvent, riderPrivBytes);

    // This should succeed — a customer rating their locksmith
    const ratingResult = await reputation.publishRating(ratingEvent, completedTask);
    assert.equal(ratingResult.cachedLocally, true);
    assert.ok(Array.isArray(ratingResult.relayStatuses));
    // The returned role should be 'customer', not coerced to 'rider'
    assert.equal(ratingResult.role, 'customer');
    assert.equal(ratingResult.rating, 4);
    assert.equal(ratingResult.targetHex, driverPubKey.toLowerCase());

    // Also verify a locksmith (provider) can rate back with role='locksmith'
    reputation.clearCacheFor(riderPubKey);
    const providerRatingEvent = {
      kind: 30520,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['ride', completedTask.id],
        ['p', riderPubKey.toLowerCase()],
        ['rating', '5'],
        ['role', 'locksmith']
      ],
      content: ''
    };
    providerRatingEvent.pubkey = driverPubKey;
    providerRatingEvent.id = getEventHash(providerRatingEvent);
    providerRatingEvent.sig = getSignature(providerRatingEvent, driverPrivBytes);

    const providerRatingResult = await reputation.publishRating(providerRatingEvent, completedTask);
    assert.equal(providerRatingResult.cachedLocally, true);
    assert.equal(providerRatingResult.role, 'locksmith');
    assert.equal(providerRatingResult.rating, 5);
    assert.equal(providerRatingResult.targetHex, riderPubKey.toLowerCase());
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
});

test('locksmith-domain panic events work with role=customer', async () => {
  const originalLog = console.log;
  const originalWarn = console.warn;
  try {
    console.log = () => {};
    console.warn = () => {};

    reputation.setRelays(['mock://fail']);

    // Create a locksmith-domain task and advance to active state
    const taskManager = new TaskManager('locksmith');
    const task = taskManager.createTask(
      { pubkey: riderPubKey },
      { lat: 51.5, lon: -0.12 },
      null,
      5000,
      { taskId: `task_panic_${Date.now().toString(36)}` }
    );

    taskManager.acceptTask(task.id, driverPubKey, {
      name: 'Panic Locksmith',
      location: { lat: 51.49, lon: -0.13 },
      rating: 4.8,
      pubkey: driverPubKey
    });
    taskManager.startEnRoute(task.id);
    taskManager.arriveAtPickup(task.id);
    taskManager.transitionTo(task.id, 'access_method_confirmed');
    taskManager.startTrip(task.id);

    const activeTask = taskManager.getTask(task.id);
    // Strip legacy fields to verify domain-agnostic behaviour
    delete activeTask.rider;
    delete activeTask.driver;

    // Build a panic event with role='customer'
    const panicEvent = {
      kind: 30540,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['ride', activeTask.id],
        ['role', 'customer'],
        ['p', driverPubKey.toLowerCase()]
      ],
      content: 'emergency'
    };
    panicEvent.pubkey = riderPubKey;
    panicEvent.id = getEventHash(panicEvent);
    panicEvent.sig = getSignature(panicEvent, riderPrivBytes);

    const panicResult = await reputation.publishPanic(panicEvent, activeTask);
    assert.equal(panicResult.cachedLocally, true);
    assert.equal(panicResult.role, 'customer');
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
});

after(() => {
  reputation.shutdown();
});
