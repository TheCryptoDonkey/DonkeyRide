/**
 * An unanswered request must not sit in `requested` for ever.
 *
 * Before this, only PRE-BOOKED rides had a clock: an immediate request that
 * no driver happened to be in range for at the instant it was broadcast was
 * never retried, never widened, and never closed. The rider watched a static
 * status badge indefinitely, which is indistinguishable from a broken app.
 *
 * Proves: the search widens on a timer, the rider is told it is widening,
 * and an exhausted search ends as a cancellation reasoned `no_providers`.
 */

process.env.DISABLE_REDIS = 'true';
process.env.PAYMENT_PROVIDER = 'demo';
process.env.ENABLE_NIP98_AUTH = 'false';
process.env.ENABLE_RATE_LIMITING = 'false';
process.env.DISPATCH_RADIUS_KM = '10';
process.env.DISPATCH_RADIUS_MAX_KM = '30';
// Wound right in so the whole lifecycle runs inside a test
process.env.SCHEDULE_SWEEP_MS = '120';
process.env.REQUEST_RETRY_MS = '150';
process.env.REQUEST_EXPIRE_MS = '900';
const WS_PORT = 46100 + Math.floor(Math.random() * 400);
process.env.WS_PORT = String(WS_PORT);

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const { generatePrivateKey, getPublicKey, nip19 } = require('nostr-tools');

const { app, startServer, getWss } = require('../../server.js');

const riderPriv = generatePrivateKey();
const riderPub = getPublicKey(riderPriv);
const riderNpub = nip19.npubEncode(riderPub);

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

async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function get(path) {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const createRide = (extra = {}) => post('/api/rides/request', {
  pickup_lat: PICKUP.lat,
  pickup_lon: PICKUP.lon,
  dropoff_lat: DROPOFF.lat,
  dropoff_lon: DROPOFF.lon,
  rider_pubkey: riderPub,
  rider_npub: riderNpub,
  ...extra
});

/** Watch a ride's socket and collect frames */
async function watchRide(rideId) {
  const ws = new WebSocket(`ws://127.0.0.1:${WS_PORT}`);
  const frames = [];
  ws.on('message', (raw) => {
    try { frames.push(JSON.parse(raw.toString())); } catch { /* ignore */ }
  });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  ws.send(JSON.stringify({ type: 'subscribe_ride', rideId }));
  return { ws, frames };
}

const waitFor = (frames, match, ms = 4000) => new Promise((resolve, reject) => {
  const started = Date.now();
  const poll = setInterval(() => {
    const hit = frames.find(match);
    if (hit) { clearInterval(poll); resolve(hit); }
    else if (Date.now() - started > ms) {
      clearInterval(poll);
      reject(new Error(`timed out; saw: ${frames.map((f) => f.type).join(', ')}`));
    }
  }, 25);
});

test('an unanswered request is retried on a widening radius', async () => {
  const { body } = await createRide();
  const { ws, frames } = await watchRide(body.ride_id);

  try {
    const first = await waitFor(frames, (f) => f.type === 'searching');
    assert.equal(first.ride_id, body.ride_id);
    assert.ok(first.radius_km > 10, 'the radius must widen past the configured start');
    assert.ok(first.expires_in_ms > 0, 'the rider is told how long is left');

    // ...and it keeps widening rather than widening once and stopping
    const second = await waitFor(
      frames, (f) => f.type === 'searching' && f.attempt > first.attempt
    );
    assert.ok(second.radius_km > first.radius_km);
  } finally {
    ws.terminate();
  }
});

test('the widening radius is capped, not unbounded', async () => {
  const { body } = await createRide();
  const { ws, frames } = await watchRide(body.ride_id);

  try {
    await waitFor(frames, (f) => f.type === 'ride_cancelled' || f.type === 'task_cancelled');
    const widest = frames
      .filter((f) => f.type === 'searching')
      .reduce((max, f) => Math.max(max, f.radius_km), 0);
    assert.ok(widest > 0);
    assert.ok(widest <= 30, `radius must respect the ceiling, got ${widest}`);
  } finally {
    ws.terminate();
  }
});

test('an exhausted search ends as no_providers, not a silent hang', async () => {
  const { body } = await createRide();
  const { ws, frames } = await watchRide(body.ride_id);

  try {
    const cancelled = await waitFor(frames, (f) => f.type === 'task_cancelled');
    assert.equal(cancelled.reason, 'no_providers');
    assert.equal(cancelled.cancelled_by, 'system');
    assert.ok(cancelled.searched_radius_km > 0, 'tell the rider how far we looked');

    // The ride itself agrees — a client that reconnects after the frame
    // still learns why it ended
    const detail = await get(`/api/rides/${body.ride_id}`);
    assert.equal(detail.body.ride.status, 'cancelled');
    assert.equal(detail.body.ride.cancelReason, 'no_providers');
  } finally {
    ws.terminate();
  }
});

test('a pre-booked ride is not swept by the immediate-request clock', async () => {
  const scheduledFor = Date.now() + 6 * 60 * 60 * 1000;
  const { body } = await createRide({ scheduled_for: scheduledFor });

  // Far longer than REQUEST_EXPIRE_MS — a booking for tonight must survive
  await new Promise((r) => setTimeout(r, 1400));

  const detail = await get(`/api/rides/${body.ride_id}`);
  assert.equal(
    detail.body.ride.status, 'requested',
    'a pre-booked ride keeps its own much longer clock'
  );
});

test('a matched ride stops being retried', async () => {
  const driverPriv = generatePrivateKey();
  const driverPub = getPublicKey(driverPriv);
  const { body } = await createRide();

  const accepted = await post(`/api/rides/${body.ride_id}/accept`, {
    providerPubkey: driverPub,
    providerNpub: nip19.npubEncode(driverPub),
    driver_npub: nip19.npubEncode(driverPub)
  });
  assert.equal(accepted.status, 200);

  const { ws, frames } = await watchRide(body.ride_id);
  try {
    await new Promise((r) => setTimeout(r, 1400));
    assert.equal(
      frames.filter((f) => f.type === 'searching').length, 0,
      'a ride with a driver must never be re-broadcast as still searching'
    );
    const detail = await get(`/api/rides/${body.ride_id}`);
    assert.notEqual(detail.body.ride.status, 'cancelled');
  } finally {
    ws.terminate();
  }
});
