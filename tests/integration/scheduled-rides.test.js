/**
 * Scheduled (pre-booked) rides.
 *
 * Boots the real Express app with the WS dispatcher and short scheduling
 * timers, then proves:
 *
 *   - scheduled_for is validated (past / too far ahead rejected)
 *   - a pre-booked ride outside the lead window is NOT live-dispatched:
 *     no broadcast, no replay on driver registration, drivers_notified 0
 *   - it IS browsable on /api/rides/open with its scheduledFor, and a
 *     driver can accept it ahead of time (pre-booking)
 *   - the sweep live-dispatches it to drivers when the lead window opens
 *   - an accepted pre-booked ride produces a scheduled_reminder frame on
 *     the ride channel as the pickup time approaches
 *   - an unmatched pre-booked ride is auto-cancelled after the grace
 *     period passes
 */

process.env.DISABLE_REDIS = 'true';
process.env.PAYMENT_PROVIDER = 'demo';
process.env.ENABLE_NIP98_AUTH = 'true';
process.env.ENABLE_RATE_LIMITING = 'false';
process.env.DISPATCH_RADIUS_KM = '15';
// Short scheduling timers so the whole lifecycle fits in a test run
process.env.SCHEDULE_SWEEP_MS = '200';
process.env.SCHEDULE_DISPATCH_LEAD_MS = '2000';
process.env.SCHEDULE_EXPIRE_GRACE_MS = '1200';
// Pin the horizon so the too-far-ahead test is independent of the default
process.env.SCHEDULE_MAX_ADVANCE_MS = String(7 * 24 * 3600 * 1000);
// Random high port so parallel test files never collide
const WS_PORT = 43100 + Math.floor(Math.random() * 1000);
process.env.WS_PORT = String(WS_PORT);

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const { generatePrivateKey, getPublicKey, nip19 } = require('nostr-tools');

const { app, startServer, getWss } = require('../../server.js');
const { generateAuthEvent, createAuthHeader } = require('../../middleware/nip98-auth');

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

async function createScheduledRide(scheduledFor) {
  return post('/api/rides/request', {
    pickup_lat: PICKUP.lat,
    pickup_lon: PICKUP.lon,
    dropoff_lat: DROPOFF.lat,
    dropoff_lon: DROPOFF.lon,
    rider_pubkey: riderPub,
    rider_npub: riderNpub,
    scheduled_for: scheduledFor
  }, riderPriv);
}

// ── WS helpers ──────────────────────────────────────

const wsUrl = () => `ws://127.0.0.1:${WS_PORT}`;

async function connectWs(privKey) {
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
    event: generateAuthEvent(wsUrl(), 'GET', privKey)
  }));
  await waitFor(frames, (f) => f.type === 'auth_ok', 'auth_ok');
  return { ws, frames };
}

/** Connect, authenticate, and register a driver near the pickup */
async function connectDriver(driver) {
  const { ws, frames } = await connectWs(driver.priv);
  ws.send(JSON.stringify({
    type: 'register_driver',
    pubkey: driver.pub,
    npub: driver.npub,
    location: { lat: PICKUP.lat, lon: PICKUP.lon }
  }));
  await sleep(200);
  return { ws, frames };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(frames, predicate, label, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = frames.find(predicate);
    if (match) return match;
    await sleep(25);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

// ── Validation ──────────────────────────────────────

test('scheduled_for in the past is rejected', async () => {
  const res = await createScheduledRide(Date.now() - 10 * 60 * 1000);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /past/);
});

test('scheduled_for beyond the advance limit is rejected', async () => {
  const res = await createScheduledRide(Date.now() + 8 * 24 * 3600 * 1000);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /too far ahead/);
});

test('non-numeric scheduled_for is rejected', async () => {
  const res = await createScheduledRide('tomorrow teatime');
  assert.equal(res.status, 400);
});

// ── Deferred dispatch + open-list browsing + pre-booking ──

test('a pre-booked ride is not live-dispatched but is browsable and acceptable', async () => {
  const driver = makeDriver();
  const { ws, frames } = await connectDriver(driver);

  try {
    const scheduledFor = Date.now() + 3600 * 1000; // 1 hour ahead
    const res = await createScheduledRide(scheduledFor);
    assert.equal(res.status, 200);
    assert.equal(res.body.scheduled_for, scheduledFor);
    assert.equal(res.body.drivers_notified, 0);
    const rideId = res.body.ride_id;

    // No live frame for the connected in-range driver
    await sleep(600);
    assert.ok(
      !frames.some((f) => f.type === 'ride_request' && f.ride?.id === rideId),
      'far-future scheduled ride must not be broadcast'
    );

    // A driver registering later must not get it replayed either
    const late = makeDriver();
    const lateConn = await connectDriver(late);
    assert.ok(
      !lateConn.frames.some((f) => f.type === 'ride_request' && f.ride?.id === rideId),
      'far-future scheduled ride must not be replayed on registration'
    );
    lateConn.ws.close();

    // But it IS on the open list, carrying its pickup time
    const open = await getSigned('/api/rides/open', driver.priv);
    const listed = open.body.rides.find((r) => r.id === rideId);
    assert.ok(listed, 'scheduled ride must be browsable');
    assert.equal(listed.scheduledFor, scheduledFor);

    // And a driver can commit to it now (pre-booking)
    const accept = await post(`/api/rides/${rideId}/accept`, {
      driver_npub: driver.npub,
      driver_pubkey: driver.pub,
      driver_name: 'Pre-booker'
    }, driver.priv);
    assert.equal(accept.status, 200);

    const openAfter = await getSigned('/api/rides/open', driver.priv);
    assert.ok(
      !openAfter.body.rides.some((r) => r.id === rideId),
      'accepted scheduled ride must leave the open list'
    );
  } finally {
    ws.close();
  }
});

// ── Sweep dispatch at the lead window ───────────────

test('the sweep live-dispatches a scheduled ride when the lead window opens', async () => {
  const driver = makeDriver();
  const { ws, frames } = await connectDriver(driver);

  try {
    const scheduledFor = Date.now() + 3000; // beyond the 2s lead → deferred
    const res = await createScheduledRide(scheduledFor);
    assert.equal(res.status, 200);
    assert.equal(res.body.drivers_notified, 0);
    const rideId = res.body.ride_id;

    // Window opens at scheduledFor − lead (≈1s) — the sweep must dispatch it
    const frame = await waitFor(
      frames,
      (f) => f.type === 'ride_request' && f.ride?.id === rideId,
      'sweep dispatch of the scheduled ride'
    );
    assert.equal(frame.ride.scheduledFor, scheduledFor);
    assert.equal(frame.ride.pickup.approximate, true, 'pre-accept location stays approximate');
  } finally {
    ws.close();
  }
});

// ── Reminder for an accepted pre-booked ride ────────

test('an accepted pre-booked ride gets a scheduled_reminder as pickup approaches', async () => {
  const driver = makeDriver();

  const scheduledFor = Date.now() + 3500; // beyond the 2s lead → deferred
  const res = await createScheduledRide(scheduledFor);
  assert.equal(res.status, 200);
  const rideId = res.body.ride_id;

  const accept = await post(`/api/rides/${rideId}/accept`, {
    driver_npub: driver.npub,
    driver_pubkey: driver.pub,
    driver_name: 'Early bird'
  }, driver.priv);
  assert.equal(accept.status, 200);

  // Rider listens on the ride channel
  const { ws, frames } = await connectWs(riderPriv);
  try {
    ws.send(JSON.stringify({ type: 'subscribe_ride', rideId }));

    const reminder = await waitFor(
      frames,
      (f) => f.type === 'scheduled_reminder' && f.ride_id === rideId,
      'scheduled_reminder frame',
      5000
    );
    assert.equal(reminder.scheduled_for, scheduledFor);
  } finally {
    ws.close();
  }
});

// ── Expiry of an unmatched pre-booked ride ──────────

test('an unmatched scheduled ride is auto-cancelled after the grace period', async () => {
  const scheduledFor = Date.now() + 2500;
  const res = await createScheduledRide(scheduledFor);
  assert.equal(res.status, 200);
  const rideId = res.body.ride_id;

  // Expiry lands at scheduledFor + grace (≈3.7s in) — poll the ride status
  const deadline = Date.now() + 8000;
  let status = null;
  while (Date.now() < deadline) {
    const detail = await getSigned(`/rides/${rideId}`, riderPriv);
    status = detail.body.status;
    if (status === 'cancelled') break;
    await sleep(300);
  }
  assert.equal(status, 'cancelled', 'unmatched scheduled ride must expire');

  const open = await getSigned('/api/rides/open', riderPriv);
  assert.ok(
    !open.body.rides.some((r) => r.id === rideId),
    'expired scheduled ride must leave the open list'
  );
});
