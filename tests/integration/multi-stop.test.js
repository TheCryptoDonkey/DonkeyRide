/**
 * Multi-stop trips.
 *
 * Boots the real Express app with the WS dispatcher and proves:
 *
 *   - stops are validated (too many / bad coordinates rejected)
 *   - the fare estimate covers the full route through every stop
 *   - pre-accept payloads (broadcast, replay, open list) carry only a
 *     stop COUNT — never stop locations (progressive disclosure)
 *   - the participant-gated detail carries the exact stops post-accept,
 *     and a non-participant cannot read them
 */

process.env.DISABLE_REDIS = 'true';
process.env.PAYMENT_PROVIDER = 'demo';
process.env.ENABLE_NIP98_AUTH = 'true';
process.env.ENABLE_RATE_LIMITING = 'false';
process.env.DISPATCH_RADIUS_KM = '15';
// Random high port so parallel test files never collide
const WS_PORT = 44200 + Math.floor(Math.random() * 1000);
process.env.WS_PORT = String(WS_PORT);

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const { generatePrivateKey, getPublicKey, nip19 } = require('nostr-tools');

const { app, startServer, getWss } = require('../../server.js');
const { generateAuthEvent, createAuthHeader } = require('../../middleware/nip98-auth');

const riderPriv = generatePrivateKey();
const riderPub = getPublicKey(riderPriv);
const riderNpub = nip19.npubEncode(riderPub);

function makeDriver() {
  const priv = generatePrivateKey();
  const pub = getPublicKey(priv);
  return { priv, pub, npub: nip19.npubEncode(pub) };
}

// Manchester: Piccadilly → Deansgate with a detour via Ancoats
const PICKUP = { lat: 53.4808, lon: -2.2426 };
const DROPOFF = { lat: 53.4774, lon: -2.2309 };
const STOP_A = { lat: 53.4900, lon: -2.2000, address: '12 Test Terrace' };
const STOP_B = { lat: 53.4850, lon: -2.2200 };

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

async function post(path, body, privKey = null) {
  const url = `${baseUrl}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (privKey) {
    headers.Authorization = createAuthHeader(generateAuthEvent(url, 'POST', privKey));
  }
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function getSigned(path, privKey) {
  const url = `${baseUrl}${path}`;
  const headers = {
    Authorization: createAuthHeader(generateAuthEvent(url, 'GET', privKey))
  };
  const res = await fetch(url, { headers });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function createRide(extra = {}) {
  return post('/api/rides/request', {
    pickup_lat: PICKUP.lat,
    pickup_lon: PICKUP.lon,
    dropoff_lat: DROPOFF.lat,
    dropoff_lon: DROPOFF.lon,
    rider_pubkey: riderPub,
    rider_npub: riderNpub,
    ...extra
  }, riderPriv);
}

const wsUrl = () => `ws://127.0.0.1:${WS_PORT}`;

async function connectDriver(driver) {
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

test('more than 3 stops is rejected', async () => {
  const res = await createRide({ stops: [STOP_A, STOP_B, STOP_A, STOP_B] });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /at most 3/);
});

test('a stop with invalid coordinates is rejected', async () => {
  const res = await createRide({ stops: [{ lat: 999, lon: -2.2 }] });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /valid lat/);
});

// ── Fare covers the detour ──────────────────────────

test('the estimate routes through every stop', async () => {
  const direct = await createRide();
  assert.equal(direct.status, 200);

  const detour = await createRide({ stops: [STOP_A] });
  assert.equal(detour.status, 200);
  assert.ok(
    detour.body.distance_km > direct.body.distance_km * 2,
    `detour ${detour.body.distance_km}km should dwarf direct ${direct.body.distance_km}km`
  );
  assert.ok(detour.body.estimated_fare > direct.body.estimated_fare,
    'a longer trip must cost more');
  // The requester gets their own stops back
  assert.equal(detour.body.stops.length, 1);
  assert.equal(detour.body.stops[0].address, STOP_A.address);
});

// ── Progressive disclosure ──────────────────────────

test('pre-accept payloads carry a stop count, never stop locations', async () => {
  const driver = makeDriver();
  const { ws, frames } = await connectDriver(driver);

  try {
    const res = await createRide({ stops: [STOP_A, STOP_B] });
    assert.equal(res.status, 200);
    const rideId = res.body.ride_id;

    // Live broadcast: count only
    const frame = await waitFor(
      frames,
      (f) => f.type === 'ride_request' && f.ride?.id === rideId,
      'multi-stop broadcast'
    );
    assert.equal(frame.ride.stopCount, 2);
    assert.equal(frame.ride.stops, undefined, 'broadcast must not carry stop locations');

    // Replay on a later registration: same shape
    const late = makeDriver();
    const lateConn = await connectDriver(late);
    const replay = await waitFor(
      lateConn.frames,
      (f) => f.type === 'ride_request' && f.ride?.id === rideId,
      'multi-stop replay'
    );
    assert.equal(replay.ride.stopCount, 2);
    assert.equal(replay.ride.stops, undefined, 'replay must not carry stop locations');
    lateConn.ws.close();

    // Open list: same shape
    const open = await getSigned('/api/rides/open', driver.priv);
    const listed = open.body.rides.find((r) => r.id === rideId);
    assert.ok(listed, 'multi-stop ride must be browsable');
    assert.equal(listed.stopCount, 2);
    assert.equal(listed.stops, undefined, 'open list must not carry stop locations');

    // A non-participant cannot read the detail at all
    const before = await getSigned(`/api/rides/${rideId}`, driver.priv);
    assert.equal(before.status, 403, 'detail is participant-gated');

    // Post-accept the driver IS a participant and gets exact stops
    const accept = await post(`/api/rides/${rideId}/accept`, {
      driver_npub: driver.npub,
      driver_pubkey: driver.pub,
      driver_name: 'Stop collector'
    }, driver.priv);
    assert.equal(accept.status, 200);

    const detail = await getSigned(`/api/rides/${rideId}`, driver.priv);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.ride.stops.length, 2);
    assert.equal(detail.body.ride.stops[0].lat, STOP_A.lat);
    assert.equal(detail.body.ride.stops[0].address, STOP_A.address);

    // Another driver still cannot
    const stranger = makeDriver();
    const denied = await getSigned(`/api/rides/${rideId}`, stranger.priv);
    assert.equal(denied.status, 403, 'stranger must not read exact stops');
  } finally {
    ws.close();
  }
});
