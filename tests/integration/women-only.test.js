/**
 * Women-only matching (self-declared, Bolt W4W-style pairing).
 *
 * Boots the real Express app with the WebSocket dispatcher and NIP-98 auth,
 * then proves:
 *
 *   - a women-only request is broadcast only to drivers who declared woman
 *     (fail closed: a driver with no declaration never sees it)
 *   - an ordinary request is NOT sent to a driver who set women_only
 *   - registration replay applies the same pairing
 *   - GET /api/rides/open hides women-only requests unless ?gender=woman
 *   - accept of a women-only ride is refused without the woman declaration
 */

process.env.DISABLE_REDIS = 'true';
process.env.PAYMENT_PROVIDER = 'demo';
process.env.ENABLE_NIP98_AUTH = 'true';
process.env.ENABLE_RATE_LIMITING = 'false';
process.env.DISPATCH_RADIUS_KM = '15';
const WS_PORT = 43100 + Math.floor(Math.random() * 1800);
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

async function createRide({ womenOnly = false } = {}) {
  return post('/api/rides/request', {
    pickup_lat: PICKUP.lat,
    pickup_lon: PICKUP.lon,
    dropoff_lat: DROPOFF.lat,
    dropoff_lon: DROPOFF.lon,
    rider_pubkey: riderPub,
    rider_npub: riderNpub,
    ...(womenOnly ? { women_only: true } : {})
  }, riderPriv);
}

const wsUrl = () => `ws://127.0.0.1:${WS_PORT}`;

async function connectDriver(driver, { location = PICKUP, gender, womenOnly } = {}) {
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
    ...(gender !== undefined ? { gender } : {}),
    ...(womenOnly !== undefined ? { women_only: womenOnly } : {})
  }));
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

test('women-only request reaches only declared-women drivers', async () => {
  const woman = makeDriver();
  const man = makeDriver();
  const womanConn = await connectDriver(woman, { gender: 'woman' });
  const manConn = await connectDriver(man, {});

  try {
    const created = await createRide({ womenOnly: true });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const rideId = created.body.ride_id;
    assert.equal(created.body.women_only, true);

    const frame = await waitFor(
      womanConn.frames,
      (f) => f.type === 'ride_request' && f.ride?.id === rideId,
      'women-only broadcast to declared woman'
    );
    assert.equal(frame.ride.womenOnly, true, 'frame carries the flag');

    await sleep(300);
    assert.ok(!receivedRideIds(manConn.frames).includes(rideId),
      'undeclared driver never sees the women-only request');

    // An ordinary request still reaches both
    const ordinary = await createRide();
    const ordinaryId = ordinary.body.ride_id;
    await waitFor(womanConn.frames, (f) => f.ride?.id === ordinaryId, 'ordinary to woman');
    await waitFor(manConn.frames, (f) => f.ride?.id === ordinaryId, 'ordinary to man');
  } finally {
    womanConn.ws.close();
    manConn.ws.close();
  }
});

test('a driver who set women_only receives only women-only requests', async () => {
  const driver = makeDriver();
  const conn = await connectDriver(driver, { gender: 'woman', womenOnly: true });

  try {
    const ordinary = await createRide();
    const flagged = await createRide({ womenOnly: true });

    const flaggedId = flagged.body.ride_id;
    await waitFor(conn.frames, (f) => f.ride?.id === flaggedId, 'women-only received');
    await sleep(300);
    assert.ok(!receivedRideIds(conn.frames).includes(ordinary.body.ride_id),
      'ordinary request filtered out for a women-only driver');
  } finally {
    conn.ws.close();
  }
});

test('registration replay applies women-only pairing', async () => {
  const created = await createRide({ womenOnly: true });
  const rideId = created.body.ride_id;

  const woman = makeDriver();
  const womanConn = await connectDriver(woman, { gender: 'woman' });
  const man = makeDriver();
  const manConn = await connectDriver(man, {});

  try {
    await waitFor(womanConn.frames, (f) => f.ride?.id === rideId, 'replayed to woman');
    await sleep(300);
    assert.ok(!receivedRideIds(manConn.frames).includes(rideId),
      'not replayed to an undeclared driver');
  } finally {
    womanConn.ws.close();
    manConn.ws.close();
  }
});

test('open list hides women-only requests unless ?gender=woman; accept enforces the declaration', async () => {
  const created = await createRide({ womenOnly: true });
  const rideId = created.body.ride_id;

  const plain = await getSigned('/api/rides/open');
  assert.ok(!plain.body.rides.some((r) => r.id === rideId),
    'hidden from an undeclared browser');

  const declared = await getSigned('/api/rides/open?gender=woman');
  const listed = declared.body.rides.find((r) => r.id === rideId);
  assert.ok(listed, 'listed for a declared woman');
  assert.equal(listed.womenOnly, true, 'flag carried so the UI can badge it');

  // Accept without the declaration → clear 403, ride still open
  const man = makeDriver();
  const refused = await post(`/api/rides/${rideId}/accept`, {
    driver_pubkey: man.pub,
    driver_npub: man.npub,
    driver_location: { lat: PICKUP.lat, lon: PICKUP.lon }
  }, man.priv);
  assert.equal(refused.status, 403, JSON.stringify(refused.body));

  // Accept with the declaration succeeds
  const woman = makeDriver();
  const accepted = await post(`/api/rides/${rideId}/accept`, {
    driver_pubkey: woman.pub,
    driver_npub: woman.npub,
    driver_location: { lat: PICKUP.lat, lon: PICKUP.lon },
    gender: 'woman'
  }, woman.priv);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.ride.womenOnly, true);
});
