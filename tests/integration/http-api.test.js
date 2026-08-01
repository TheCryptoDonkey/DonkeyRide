/**
 * HTTP-level integration tests for the operator server.
 *
 * Boots the real Express app (no HTTP listener from startServer; we attach
 * our own on an ephemeral port) with NIP-98 auth ENABLED, then exercises the
 * ride lifecycle over real HTTP with signed requests:
 *
 *   request → accept → location → arrive → start → complete → rate
 *
 * plus auth rejection, role authorisation, cancellation, driver presence /
 * geo-dispatch, and task-store rehydration.
 */

process.env.DISABLE_REDIS = 'true';
process.env.DISABLE_WS = 'true';
process.env.PAYMENT_PROVIDER = 'demo';
process.env.ENABLE_NIP98_AUTH = 'true';
// Rate limiting is exercised in its own tests; disable here so the rapid
// request lifecycle does not trip the shared authenticated limiter.
process.env.ENABLE_RATE_LIMITING = 'false';
process.env.DISPATCH_RADIUS_KM = '15';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { generatePrivateKey, getPublicKey, nip19 } = require('nostr-tools');

const { app, startServer } = require('../../server.js');
const { generateAuthEvent, createAuthHeader } = require('../../middleware/nip98-auth');
const { TaskManager } = require('../../src/task-manager');
const { MemoryTaskStore } = require('../../src/storage/task-store');

// ── Test identities ─────────────────────────────────

const riderPriv = generatePrivateKey();
const riderPub = getPublicKey(riderPriv);
const riderNpub = nip19.npubEncode(riderPub);

const driverPriv = generatePrivateKey();
const driverPub = getPublicKey(driverPriv);
const driverNpub = nip19.npubEncode(driverPub);

const strangerPriv = generatePrivateKey();

// Manchester city centre / Piccadilly
const PICKUP = { lat: 53.4808, lon: -2.2426 };
const DROPOFF = { lat: 53.4774, lon: -2.2309 };

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

async function get(path) {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function createRide(privKey = riderPriv) {
  return post('/api/rides/request', {
    pickup_lat: PICKUP.lat,
    pickup_lon: PICKUP.lon,
    dropoff_lat: DROPOFF.lat,
    dropoff_lon: DROPOFF.lon,
    rider_pubkey: riderPub,
    rider_npub: riderNpub
  }, privKey);
}

async function acceptRide(rideId, privKey = driverPriv) {
  return post(`/api/rides/${rideId}/accept`, {
    driver_npub: driverNpub,
    driver_pubkey: driverPub,
    driver_name: 'Test Driver',
    driver_location: { lat: PICKUP.lat + 0.01, lon: PICKUP.lon + 0.01 },
    driver_rating: 5.0
  }, privKey);
}

// ── Auth enforcement ────────────────────────────────

test('mutating API routes reject unsigned requests with 401', async () => {
  const res = await post('/api/rides/request', {
    pickup_lat: PICKUP.lat,
    pickup_lon: PICKUP.lon,
    dropoff_lat: DROPOFF.lat,
    dropoff_lon: DROPOFF.lon
  });
  assert.equal(res.status, 401);
  assert.match(res.body.error || '', /Authorization/i);
});

test('stateless estimate endpoint stays public', async () => {
  const res = await post('/api/trips/estimate', {
    pickup_lat: PICKUP.lat,
    pickup_lon: PICKUP.lon,
    dropoff_lat: DROPOFF.lat,
    dropoff_lon: DROPOFF.lon
  });
  assert.equal(res.status, 200);
  assert.ok(res.body.fare);
});

// ── Full lifecycle ──────────────────────────────────

test('full ride lifecycle over HTTP with signed requests', async () => {
  const created = await createRide();
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.success, true);
  const rideId = created.body.ride_id;
  assert.ok(rideId);
  assert.equal(created.body.status, 'requested');

  const accepted = await acceptRide(rideId);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.ride.status, 'en_route');
  assert.equal(accepted.body.ride.driver.pubkey, driverPub);

  const located = await post(`/api/rides/${rideId}/location`, {
    lat: PICKUP.lat + 0.005,
    lon: PICKUP.lon + 0.005
  }, driverPriv);
  assert.equal(located.status, 200, JSON.stringify(located.body));

  const arrived = await post(`/api/rides/${rideId}/arrive`, {}, driverPriv);
  assert.equal(arrived.status, 200, JSON.stringify(arrived.body));
  assert.equal(arrived.body.ride.status, 'arrived');

  const started = await post(`/api/rides/${rideId}/start`, {}, driverPriv);
  assert.equal(started.status, 200, JSON.stringify(started.body));
  assert.equal(started.body.ride.status, 'active');

  const completed = await post(`/api/rides/${rideId}/complete`, {}, driverPriv);
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  assert.equal(completed.body.ride.status, 'completed');
  assert.ok(completed.body.payment);

  const rated = await post(`/api/rides/${rideId}/rate`, {
    rating: 5,
    comment: 'Solid ride',
    raterPubkey: riderPub,
    raterRole: 'rider'
  }, riderPriv);
  assert.equal(rated.status, 200, JSON.stringify(rated.body));
  assert.equal(rated.body.rating, 5);
});

// ── Role authorisation ──────────────────────────────

test('a stranger cannot complete somebody else\'s ride', async () => {
  const created = await createRide();
  const rideId = created.body.ride_id;
  await acceptRide(rideId);

  const res = await post(`/api/rides/${rideId}/complete`, {}, strangerPriv);
  assert.equal(res.status, 403, JSON.stringify(res.body));
});

test('the rider cannot perform provider-only transitions', async () => {
  const created = await createRide();
  const rideId = created.body.ride_id;
  await acceptRide(rideId);

  const res = await post(`/api/rides/${rideId}/arrive`, {}, riderPriv);
  assert.equal(res.status, 403, JSON.stringify(res.body));
});

test('accept is rejected when the signer does not match the claimed driver', async () => {
  const created = await createRide();
  const rideId = created.body.ride_id;

  const res = await post(`/api/rides/${rideId}/accept`, {
    driver_npub: driverNpub,
    driver_pubkey: driverPub,
    driver_location: { lat: PICKUP.lat, lon: PICKUP.lon }
  }, strangerPriv);
  assert.equal(res.status, 403, JSON.stringify(res.body));
});

// ── Cancellation (MVP flow) ─────────────────────────

test('rider can cancel their own ride via /api/rides/:id/cancel', async () => {
  const created = await createRide();
  const rideId = created.body.ride_id;

  const cancelled = await post(`/api/rides/${rideId}/cancel`, {
    cancelledBy: 'rider',
    reason: 'Changed my mind'
  }, riderPriv);
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.equal(cancelled.body.success, true);
  assert.equal(cancelled.body.ride.status, 'cancelled');

  const stranger = await createRide();
  const strangerRideId = stranger.body.ride_id;
  const denied = await post(`/api/rides/${strangerRideId}/cancel`, {
    cancelledBy: 'rider',
    reason: 'not mine'
  }, strangerPriv);
  assert.equal(denied.status, 403, JSON.stringify(denied.body));
});

// ── Driver presence & geo-dispatch ──────────────────

test('driver presence feeds /api/drivers/available with radius filtering', async () => {
  const report = await post('/api/drivers/location', {
    npub: driverNpub,
    pubkey: driverPub,
    lat: PICKUP.lat,
    lon: PICKUP.lon
  }, driverPriv);
  assert.equal(report.status, 200, JSON.stringify(report.body));

  const near = await get(`/api/drivers/available?lat=${PICKUP.lat}&lon=${PICKUP.lon}`);
  assert.equal(near.status, 200);
  // Identities are withheld now (privacy); match on the coarse location near
  // the pickup instead of the driver's npub.
  assert.ok(
    near.body.drivers.some((d) =>
      d.location &&
      Math.abs(d.location.lat - PICKUP.lat) < 0.01 &&
      Math.abs(d.location.lon - PICKUP.lon) < 0.01
    ),
    `expected a driver near the pickup: ${JSON.stringify(near.body)}`
  );
  // The endpoint must not leak driver identities
  assert.ok(
    near.body.drivers.every((d) => d.npub === undefined && d.pubkey === undefined),
    'driver identities must not be exposed'
  );

  // London is ~260 km from Manchester — outside any sane dispatch radius,
  // so the Manchester driver's coarse location must not appear.
  const far = await get('/api/drivers/available?lat=51.5074&lon=-0.1278');
  assert.equal(far.status, 200);
  assert.ok(
    !far.body.drivers.some((d) =>
      d.location &&
      Math.abs(d.location.lat - PICKUP.lat) < 0.01 &&
      Math.abs(d.location.lon - PICKUP.lon) < 0.01
    ),
    `driver should not appear 260km away: ${JSON.stringify(far.body)}`
  );
});

test('driver cannot report presence as somebody else', async () => {
  const res = await post('/api/drivers/location', {
    npub: driverNpub,
    pubkey: driverPub,
    lat: PICKUP.lat,
    lon: PICKUP.lon
  }, strangerPriv);
  assert.equal(res.status, 403, JSON.stringify(res.body));
});

test('driver earnings reflect completed rides and are self-only', async () => {
  // The lifecycle test above completed a ride for driverPub
  const path = `/api/drivers/${driverPub}/earnings`;
  const url = `${baseUrl}${path}`;

  const own = await fetch(url, {
    headers: { Authorization: createAuthHeader(generateAuthEvent(url, 'GET', driverPriv)) }
  });
  const body = await own.json();
  assert.equal(own.status, 200, JSON.stringify(body));
  assert.ok(body.summary.allTime.rides >= 1, 'completed ride appears in earnings');
  assert.ok(body.summary.allTime.sats > 0, 'earnings are non-zero');
  assert.equal(body.rides[0].currency, 'GBP');

  const other = await fetch(url, {
    headers: { Authorization: createAuthHeader(generateAuthEvent(url, 'GET', strangerPriv)) }
  });
  assert.equal(other.status, 403, 'strangers cannot read another driver\'s earnings');
});

test('/api/rides/stats resolves as the stats route, not a ride id', async () => {
  const res = await get('/api/rides/stats');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(typeof res.body.total, 'number');
  assert.equal(typeof res.body.active, 'number');
  assert.equal(typeof res.body.completed, 'number');
  // Must NOT enumerate active rides or their participants (PII scraping index)
  assert.equal(res.body.rides, undefined, 'stats must not enumerate rides');
});

test('a replayed NIP-98 auth event is rejected on a mutating request', async () => {
  const url = `${baseUrl}/api/rides/request`;
  const ev = generateAuthEvent(url, 'POST', riderPriv);
  const header = createAuthHeader(ev);
  const body = JSON.stringify({
    pickup_lat: PICKUP.lat, pickup_lon: PICKUP.lon,
    dropoff_lat: DROPOFF.lat, dropoff_lon: DROPOFF.lon,
    rider_pubkey: riderPub, fare_sats: 5000, currency: 'GBP'
  });
  const opts = { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: header }, body };
  const first = await fetch(url, opts);
  assert.notEqual(first.status, 401, 'first use of a fresh auth event must authenticate');
  const second = await fetch(url, opts);
  assert.equal(second.status, 401, 'replayed auth event must be rejected');
});

test('malformed JSON body returns a clean 400', async () => {
  const url = `${baseUrl}/api/rides/request`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: createAuthHeader(generateAuthEvent(url, 'POST', riderPriv)) },
    body: '{ not json'
  });
  assert.equal(res.status, 400);
});

// ── Persistence & rehydration ───────────────────────

test('tasks survive a manager restart via the task store', async () => {
  const store = new MemoryTaskStore();

  const managerA = new TaskManager('ridesharing');
  managerA.setStore(store);

  const task = managerA.createTask(
    { pubkey: riderPub, npub: riderNpub },
    PICKUP,
    DROPOFF,
    5000
  );
  managerA.acceptTask(task.id, driverNpub, { pubkey: driverPub, name: 'Test Driver', location: PICKUP });

  // _persist is fire-and-forget — let the queued saves settle
  await new Promise((resolve) => setImmediate(resolve));

  // Simulate a restart: fresh manager, same store
  const managerB = new TaskManager('ridesharing');
  managerB.setStore(store);
  const persisted = await store.loadActiveTasks();
  persisted.forEach((row) => managerB.hydrateTask(row));

  const restored = managerB.getTask(task.id);
  assert.ok(restored, 'task should be rehydrated after restart');
  assert.equal(restored.status, 'matched');
  assert.equal(restored.driver.pubkey, driverPub);
  assert.equal(managerB.getTaskByRequester(riderNpub)?.id, task.id);

  // Lifecycle continues cleanly on the rehydrated task
  managerB.startEnRoute(task.id);
  assert.equal(managerB.getTask(task.id).status, 'en_route');

  // Terminal tasks are not rehydrated
  managerB.cancelTask(task.id, 'rider', 'test');
  await new Promise((resolve) => setImmediate(resolve));
  const managerC = new TaskManager('ridesharing');
  const remaining = await store.loadActiveTasks();
  remaining.forEach((row) => managerC.hydrateTask(row));
  assert.equal(managerC.getTask(task.id), undefined);
});
