/**
 * Where the work is.
 *
 * Aggregated demand for drivers, built from the same waiting requests the
 * open list already exposes but coarsened to ~5 km cells. Proves:
 *
 *   - waiting requests are reported as counts per cell
 *   - a cell with a single person waiting is suppressed (that is a doorway,
 *     not a pattern)
 *   - matched and pre-booked work is not counted as demand now
 *   - no pickup coordinate or identity leaves in the payload
 */

process.env.DISABLE_REDIS = 'true';
process.env.PAYMENT_PROVIDER = 'demo';
process.env.ENABLE_RATE_LIMITING = 'false';
// Unsigned requests — pin auth off rather than inheriting it from a .env
// (see credentials.test.js).
process.env.ENABLE_NIP98_AUTH = 'false';
process.env.REQUEST_RETRY_MS = '600000';
const WS_PORT = 53000 + Math.floor(Math.random() * 400);
process.env.WS_PORT = String(WS_PORT);

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { generatePrivateKey, getPublicKey, nip19 } = require('nostr-tools');

const { app, startServer, getWss } = require('../../server.js');
const { encodeGeohash, decodeGeohash } = require('../../src/utils/geohash');

/** Dead centre of the geohash-5 cell a point falls in, so a test cannot
 *  straddle a cell boundary and count the same crowd as two crowds */
function cellCentre(point, precision = 5) {
  return decodeGeohash(encodeGeohash(point.lat, point.lon, precision));
}

function makeIdentity() {
  const priv = generatePrivateKey();
  const pub = getPublicKey(priv);
  return { priv, pub, npub: nip19.npubEncode(pub) };
}

const rider = makeIdentity();
const driver = makeIdentity();

// Three pickups inside one geohash-5 cell, one on its own miles away
const CENTRE = cellCentre({ lat: 53.4808, lon: -2.2426 });
const BUSY_A = { lat: CENTRE.lat, lon: CENTRE.lon };
const BUSY_B = { lat: CENTRE.lat + 0.0004, lon: CENTRE.lon + 0.0004 };
const BUSY_C = { lat: CENTRE.lat - 0.0004, lon: CENTRE.lon - 0.0004 };
const LONELY = { lat: 51.5074, lon: -0.1278 };
const DROPOFF = { lat: 53.4600, lon: -2.2000 };

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
  const wss = getWss();
  if (wss) {
    wss.clients.forEach((client) => client.terminate());
    wss.close();
  }
});

async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const requestRide = (pickup, extra = {}) => post('/api/rides/request', {
  pickup_lat: pickup.lat,
  pickup_lon: pickup.lon,
  dropoff_lat: DROPOFF.lat,
  dropoff_lon: DROPOFF.lon,
  rider_npub: rider.npub,
  rider_pubkey: rider.pub,
  ...extra
});

const demand = () => fetch(`${baseUrl}/api/demand`).then((r) => r.json());

test('a busy cell is reported and a lonely one is suppressed', async () => {
  await requestRide(BUSY_A);
  await requestRide(BUSY_B);
  await requestRide(BUSY_C);
  await requestRide(LONELY);

  const body = await demand();
  const busyCell = encodeGeohash(BUSY_A.lat, BUSY_A.lon, body.precision);
  const lonelyCell = encodeGeohash(LONELY.lat, LONELY.lon, body.precision);

  const busy = body.cells.find((c) => c.geohash === busyCell);
  assert.ok(busy, `expected the busy cell, got ${JSON.stringify(body.cells)}`);
  assert.equal(busy.waiting, 3);
  assert.ok(Number.isFinite(busy.lat) && Number.isFinite(busy.lon));

  assert.equal(
    body.cells.find((c) => c.geohash === lonelyCell), undefined,
    'one person waiting is a doorway, not a pattern'
  );
});

test('the payload carries counts, never pickups or identities', async () => {
  const body = await demand();
  const raw = JSON.stringify(body);

  assert.ok(!raw.includes(rider.npub), 'no requester identity');
  // Reported positions are cell centres, never the pickup that was sent
  assert.ok(!raw.includes(String(BUSY_B.lat)), 'no exact pickup coordinate');
  assert.ok(!raw.includes(String(BUSY_C.lon)), 'no exact pickup coordinate');
  for (const cell of body.cells) {
    assert.deepEqual(
      Object.keys(cell).sort(),
      ['available', 'geohash', 'lat', 'lon', 'multiplier', 'waiting']
    );
  }
});

test('matched work is no longer demand', async () => {
  const before = await demand();
  const cell = encodeGeohash(BUSY_A.lat, BUSY_A.lon, before.precision);
  const was = before.cells.find((c) => c.geohash === cell).waiting;

  const { body } = await requestRide(BUSY_A);
  await post(`/api/rides/${body.ride_id}/accept`, {
    driver_pubkey: driver.pub,
    driver_npub: driver.npub,
    driver_location: BUSY_A
  });

  const after = await demand();
  const now = after.cells.find((c) => c.geohash === cell).waiting;
  assert.equal(now, was, 'a request somebody took is not still waiting');
});

test('pre-booked work is not demand now', async () => {
  const before = await demand();
  const cell = encodeGeohash(BUSY_A.lat, BUSY_A.lon, before.precision);
  const was = before.cells.find((c) => c.geohash === cell).waiting;

  await requestRide(BUSY_A, { scheduled_for: Date.now() + 6 * 3600 * 1000 });

  const after = await demand();
  const now = after.cells.find((c) => c.geohash === cell).waiting;
  assert.equal(now, was, 'a booking for tonight is not somebody standing there now');
});
