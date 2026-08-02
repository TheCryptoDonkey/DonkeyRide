/**
 * Open-rides browsing + driver working areas.
 *
 * Boots the real Express app WITH the WebSocket dispatcher (random port)
 * and NIP-98 auth enabled, then proves:
 *
 *   - GET /api/rides/open lists every waiting request (no rider identity)
 *   - the list filters by working-area geohash cells and by proximity
 *   - accepted rides leave the list
 *   - a driver who registers working areas receives jobs inside them
 *     wherever they currently are, and never jobs outside them — areas
 *     override the operator's dispatch radius
 *   - areas set via POST /api/drivers/location apply to WS dispatch
 */

process.env.DISABLE_REDIS = 'true';
process.env.PAYMENT_PROVIDER = 'demo';
process.env.ENABLE_NIP98_AUTH = 'true';
process.env.ENABLE_RATE_LIMITING = 'false';
process.env.DISPATCH_RADIUS_KM = '15';
// Random high port so parallel test files never collide
const WS_PORT = 41000 + Math.floor(Math.random() * 2000);
process.env.WS_PORT = String(WS_PORT);

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const { generatePrivateKey, getPublicKey, nip19 } = require('nostr-tools');

const { app, startServer, getWss } = require('../../server.js');
const { generateAuthEvent, createAuthHeader } = require('../../middleware/nip98-auth');
const { encodeGeohash } = require('../../src/utils/geohash');

// ── Test identities ─────────────────────────────────

const riderPriv = generatePrivateKey();
const riderPub = getPublicKey(riderPriv);
const riderNpub = nip19.npubEncode(riderPub);

function makeDriver() {
  const priv = generatePrivateKey();
  const pub = getPublicKey(priv);
  return { priv, pub, npub: nip19.npubEncode(pub) };
}

// Manchester city centre / Piccadilly
const PICKUP = { lat: 53.4808, lon: -2.2426 };
const DROPOFF = { lat: 53.4774, lon: -2.2309 };
// Central London — well outside the 15 km dispatch radius of Manchester
const LONDON = { lat: 51.5074, lon: -0.1278 };

const MANCHESTER_CELL = encodeGeohash(PICKUP.lat, PICKUP.lon, 5);
const LONDON_CELL = encodeGeohash(LONDON.lat, LONDON.lon, 5);

let server;
let baseUrl;

before(async () => {
  await startServer({ listen: false });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  // The WS dispatcher holds the event loop open — close it or the test
  // process never exits
  const wss = getWss();
  if (wss) {
    wss.clients.forEach((client) => client.terminate());
    wss.close();
  }
});

// ── HTTP helpers ────────────────────────────────────

async function post(path, body, privKey = null) {
  const url = `${baseUrl}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (privKey) {
    headers.Authorization = createAuthHeader(generateAuthEvent(url, 'POST', privKey));
  }
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function getSigned(path, privKey = riderPriv) {
  const url = `${baseUrl}${path}`;
  const headers = {
    Authorization: createAuthHeader(generateAuthEvent(url, 'GET', privKey))
  };
  const res = await fetch(url, { headers });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function createRide() {
  return post('/api/rides/request', {
    pickup_lat: PICKUP.lat,
    pickup_lon: PICKUP.lon,
    dropoff_lat: DROPOFF.lat,
    dropoff_lon: DROPOFF.lon,
    rider_pubkey: riderPub,
    rider_npub: riderNpub
  }, riderPriv);
}

// ── WS helpers ──────────────────────────────────────

const wsUrl = () => `ws://127.0.0.1:${WS_PORT}`;

/** Connect, authenticate, and register a driver; returns {ws, frames} */
async function connectDriver(driver, { location, areas } = {}) {
  const ws = new WebSocket(wsUrl());
  const frames = [];
  ws.on('message', (raw) => {
    try {
      frames.push(JSON.parse(raw.toString()));
    } catch {
      // ignore unparseable frames
    }
  });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  ws.send(JSON.stringify({
    type: 'auth',
    event: generateAuthEvent(wsUrl(), 'GET', driver.priv)
  }));
  await waitFor(frames, (f) => f.type === 'auth_ok', 'auth_ok');

  ws.send(JSON.stringify({
    type: 'register_driver',
    pubkey: driver.pub,
    npub: driver.npub,
    location,
    areas
  }));
  // Registration has no ack — give the server a beat to process it
  await sleep(150);
  return { ws, frames };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(frames, predicate, label, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = frames.find(predicate);
    if (match) return match;
    await sleep(25);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function receivedRideIds(frames) {
  return frames
    .filter((f) => f.type === 'ride_request' && f.ride)
    .map((f) => f.ride.id);
}

// ── Open-rides listing ──────────────────────────────

test('GET /api/rides/open lists waiting requests without rider identity', async () => {
  const a = await createRide();
  const b = await createRide();
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(b.status, 200, JSON.stringify(b.body));

  const res = await getSigned('/api/rides/open');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.success, true);

  const ids = res.body.rides.map((r) => r.id);
  assert.ok(ids.includes(a.body.ride_id));
  assert.ok(ids.includes(b.body.ride_id));

  for (const ride of res.body.rides) {
    assert.ok(ride.pickup, 'pickup present');
    assert.ok(!('rider' in ride), 'no rider object');
    assert.ok(!('requester' in ride), 'no requester object');
    assert.ok(!('requesterPubkey' in ride), 'no requester pubkey');
  }
});

test('pre-accept payloads disclose only an approximate location; accept reveals exact', async () => {
  const created = await createRide();
  const rideId = created.body.ride_id;

  // Open list: ~1 km rounding, flagged approximate, no route
  const open = await getSigned('/api/rides/open');
  const listed = open.body.rides.find((r) => r.id === rideId);
  assert.ok(listed, 'ride listed');
  assert.equal(listed.pickup.approximate, true, 'pickup flagged approximate');
  assert.notEqual(listed.pickup.lat, PICKUP.lat, 'exact latitude withheld');
  assert.ok(Math.abs(listed.pickup.lat - PICKUP.lat) < 0.011, 'still in the right ~km');
  assert.ok(Math.abs(listed.pickup.lon - PICKUP.lon) < 0.011, 'still in the right ~km');
  assert.ok(!('route' in listed), 'no route geometry pre-accept');

  // The accepting driver gets exact coordinates
  const driver = makeDriver();
  const accepted = await post(`/api/rides/${rideId}/accept`, {
    driver_npub: driver.npub,
    driver_pubkey: driver.pub,
    driver_location: { lat: PICKUP.lat + 0.01, lon: PICKUP.lon + 0.01 }
  }, driver.priv);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.ride.pickup.lat, PICKUP.lat, 'exact pickup after accept');
  assert.equal(accepted.body.ride.pickup.lon, PICKUP.lon, 'exact pickup after accept');
});

test('open list filters by working-area cells and by proximity', async () => {
  const created = await createRide();
  const rideId = created.body.ride_id;

  const inArea = await getSigned(`/api/rides/open?areas=${MANCHESTER_CELL}`);
  assert.ok(inArea.body.rides.some((r) => r.id === rideId), 'listed inside its cell');

  const outArea = await getSigned(`/api/rides/open?areas=${LONDON_CELL}`);
  assert.ok(!outArea.body.rides.some((r) => r.id === rideId), 'absent from a London cell');

  const near = await getSigned(`/api/rides/open?lat=${PICKUP.lat}&lon=${PICKUP.lon}`);
  assert.ok(near.body.rides.some((r) => r.id === rideId), 'listed near the pickup');

  const far = await getSigned(`/api/rides/open?lat=${LONDON.lat}&lon=${LONDON.lon}`);
  assert.ok(!far.body.rides.some((r) => r.id === rideId), 'absent 260 km away');
});

test('accepted rides leave the open list', async () => {
  const created = await createRide();
  const rideId = created.body.ride_id;
  const driver = makeDriver();

  const accepted = await post(`/api/rides/${rideId}/accept`, {
    driver_npub: driver.npub,
    driver_pubkey: driver.pub,
    driver_location: { lat: PICKUP.lat + 0.01, lon: PICKUP.lon + 0.01 }
  }, driver.priv);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));

  const res = await getSigned('/api/rides/open');
  assert.ok(!res.body.rides.some((r) => r.id === rideId), 'accepted ride no longer open');
});

// ── Working-area dispatch over WS ───────────────────

test('working areas override the radius for WS dispatch', async () => {
  // Driver A works Manchester but is currently in London
  const driverA = makeDriver();
  const a = await connectDriver(driverA, {
    location: LONDON,
    areas: [MANCHESTER_CELL]
  });

  // Driver B is AT the pickup but has declared London-only areas
  const driverB = makeDriver();
  const b = await connectDriver(driverB, {
    location: { lat: PICKUP.lat + 0.001, lon: PICKUP.lon + 0.001 },
    areas: [LONDON_CELL]
  });

  const created = await createRide();
  const rideId = created.body.ride_id;
  assert.ok(rideId);

  const frame = await waitFor(a.frames, (f) => f.type === 'ride_request' && f.ride?.id === rideId,
    'ride_request for the in-area driver');
  // Broadcasts follow progressive disclosure too — approximate, no route
  assert.equal(frame.ride.pickup.approximate, true, 'broadcast pickup is approximate');
  assert.ok(!('route' in frame.ride), 'broadcast carries no route geometry');
  await sleep(300);
  assert.ok(!receivedRideIds(b.frames).includes(rideId),
    'out-of-area driver never hears about the job despite being next to it');

  a.ws.close();
  b.ws.close();
});

test('registering with working areas replays open jobs inside them', async () => {
  const created = await createRide();
  const rideId = created.body.ride_id;

  // Registers AFTER the request was made, from the other end of the country
  const driver = makeDriver();
  const { ws, frames } = await connectDriver(driver, {
    location: LONDON,
    areas: [MANCHESTER_CELL]
  });

  await waitFor(frames, (f) => f.type === 'ride_request' && f.ride?.id === rideId,
    'replayed ride_request on registration');
  ws.close();
});

test('areas set via POST /api/drivers/location apply to WS dispatch', async () => {
  // Registers over WS near the pickup with no areas...
  const driver = makeDriver();
  const { ws, frames } = await connectDriver(driver, {
    location: { lat: PICKUP.lat + 0.001, lon: PICKUP.lon + 0.001 }
  });

  // ...then declares London-only working areas over REST
  const report = await post('/api/drivers/location', {
    npub: driver.npub,
    pubkey: driver.pub,
    lat: PICKUP.lat + 0.001,
    lon: PICKUP.lon + 0.001,
    areas: [LONDON_CELL]
  }, driver.priv);
  assert.equal(report.status, 200, JSON.stringify(report.body));

  const created = await createRide();
  const rideId = created.body.ride_id;

  await sleep(400);
  assert.ok(!receivedRideIds(frames).includes(rideId),
    'REST-declared areas filter WS dispatch');
  ws.close();
});
