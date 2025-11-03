const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  getPublicKey,
  getEventHash,
  getSignature
} = require('nostr-tools');

const reputation = require('../../src/nostr/reputation');
const { RideManager } = require('../../src/ride-manager');
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
    kind: 30530,
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
    kind: 30560,
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
    riderPubKey,
    { lat: 51.5, lon: -0.12 },
    { lat: 51.52, lon: -0.11 },
    2500,
    { rideId: `ride_${Date.now().toString(36)}` }
  );

  rideManager.acceptRide(ride.id, driverPubKey, {
    name: 'Integration Driver',
    location: { lat: 51.49, lon: -0.13 },
    rating: 4.9
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

after(() => {
  reputation.shutdown();
});
