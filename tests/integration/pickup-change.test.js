/**
 * Moving the pickup — riders walk.
 *
 * Boots the real Express app with NIP-98 auth and the WebSocket
 * dispatcher, then proves:
 *
 *   - the requester can move the pickup before anyone commits (re-priced)
 *   - after a provider commits, a short move is allowed, the AGREED FARE
 *     IS UNCHANGED, and the provider is told over the ride socket
 *   - a long move after commitment is refused
 *   - the provider cannot move the requester's pickup
 *   - once the provider has arrived, the pickup is frozen
 */

process.env.DISABLE_REDIS = 'true';
process.env.PAYMENT_PROVIDER = 'demo';
process.env.ENABLE_NIP98_AUTH = 'true';
process.env.ENABLE_RATE_LIMITING = 'false';
const WS_PORT = 45100 + Math.floor(Math.random() * 1800);
process.env.WS_PORT = String(WS_PORT);
// No relay: boot rehydrates non-terminal tasks from Nostr snapshots, so a
// developer with a relay in their .env would start this test with their own
// live jobs already loaded. Durability is not what is under test here.
require('../helpers/isolate-relays');


const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const { generatePrivateKey, getPublicKey, nip19 } = require('nostr-tools');

const { app, startServer, getWss } = require('../../server.js');
const { generateAuthEvent, createAuthHeader } = require('../../middleware/nip98-auth');

function makeIdentity() {
  const priv = generatePrivateKey();
  const pub = getPublicKey(priv);
  return { priv, pub, npub: nip19.npubEncode(pub) };
}

const rider = makeIdentity();
const driver = makeIdentity();

const PICKUP = { lat: 53.4808, lon: -2.2426 };
const DROPOFF = { lat: 53.4774, lon: -2.2309 };
// ~250 m up the road — the rider walked to a legal kerb
const NEARBY = { lat: 53.4830, lon: -2.2426 };
// ~5 km away — a different job, not a walk
const FAR = { lat: 53.5250, lon: -2.2426 };

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

async function post(path, body, privKey) {
  const url = `${baseUrl}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (privKey) {
    headers.Authorization = createAuthHeader(generateAuthEvent(url, 'POST', privKey));
  }
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function requestRide() {
  const { status, body } = await post('/api/rides/request', {
    pickup_lat: PICKUP.lat,
    pickup_lon: PICKUP.lon,
    dropoff_lat: DROPOFF.lat,
    dropoff_lon: DROPOFF.lon,
    rider_npub: rider.npub,
    rider_pubkey: rider.pub
  }, rider.priv);
  assert.equal(status, 200);
  return body.ride_id;
}

async function acceptRide(rideId) {
  const { status } = await post(`/api/rides/${rideId}/accept`, {
    driver_npub: driver.npub,
    driver_pubkey: driver.pub,
    driver_location: { lat: 53.4700, lon: -2.2500 }
  }, driver.priv);
  assert.equal(status, 200);
}

test('requester can move the pickup before anyone commits, and it is re-priced', async () => {
  const rideId = await requestRide();

  const { status, body } = await post(`/api/rides/${rideId}/pickup`, {
    lat: FAR.lat,
    lng: FAR.lon,
    address: 'Somewhere else entirely'
  }, rider.priv);

  assert.equal(status, 200);
  assert.equal(body.repriced, true, 'an uncommitted job re-prices on a moved pickup');
  assert.equal(body.ride.pickup.lat, FAR.lat);
  assert.equal(body.ride.pickup.lon, FAR.lon);
  assert.equal(body.ride.pickupAddress, 'Somewhere else entirely');
  assert.ok(body.moved_m > 4000, `expected a multi-km move, got ${body.moved_m}m`);
});

test('a short move after commitment is allowed, keeps the fare and tells the provider', async () => {
  const rideId = await requestRide();
  await acceptRide(rideId);

  const before = await fetch(`${baseUrl}/api/rides/${rideId}`, {
    headers: {
      Authorization: createAuthHeader(
        generateAuthEvent(`${baseUrl}/api/rides/${rideId}`, 'GET', rider.priv)
      )
    }
  }).then((r) => r.json());
  const agreedFare = before.ride.fare;

  // The provider is watching the ride socket, as their app does
  const ws = new WebSocket(`ws://127.0.0.1:${WS_PORT}`);
  const frames = [];
  await new Promise((resolve, reject) => {
    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'auth',
        event: generateAuthEvent(`ws://127.0.0.1:${WS_PORT}`, 'GET', driver.priv)
      }));
      ws.send(JSON.stringify({ type: 'subscribe_ride', rideId }));
      setTimeout(resolve, 250);
    });
    ws.on('error', reject);
  });
  ws.on('message', (raw) => {
    try { frames.push(JSON.parse(raw.toString())); } catch { /* ignore */ }
  });

  const { status, body } = await post(`/api/rides/${rideId}/pickup`, {
    lat: NEARBY.lat,
    lon: NEARBY.lon
  }, rider.priv);

  assert.equal(status, 200);
  assert.equal(body.repriced, false, 'a committed job never re-prices on a short walk');
  assert.equal(body.ride.fare, agreedFare, 'the agreed fare must survive a pickup nudge');
  assert.equal(body.ride.pickup.lat, NEARBY.lat);

  await new Promise((resolve) => setTimeout(resolve, 300));
  ws.close();

  const notice = frames.find((f) => f.type === 'pickup_updated');
  assert.ok(notice, `provider was not told: ${JSON.stringify(frames.map((f) => f.type))}`);
  assert.equal(notice.pickup.lat, NEARBY.lat);
  assert.ok(notice.moved_m > 100 && notice.moved_m < 1000);
});

test('a long move after commitment is refused', async () => {
  const rideId = await requestRide();
  await acceptRide(rideId);

  const { status, body } = await post(`/api/rides/${rideId}/pickup`, {
    lat: FAR.lat,
    lon: FAR.lon
  }, rider.priv);

  assert.equal(status, 400);
  assert.match(body.error, /too far/i);
  assert.ok(body.max_km > 0);
});

test('the provider cannot move the requester pickup', async () => {
  const rideId = await requestRide();
  await acceptRide(rideId);

  const { status } = await post(`/api/rides/${rideId}/pickup`, {
    lat: NEARBY.lat,
    lon: NEARBY.lon
  }, driver.priv);

  assert.equal(status, 403);
});

test('the pickup is frozen once the provider has arrived', async () => {
  const rideId = await requestRide();
  await acceptRide(rideId);

  const arrived = await post(`/api/rides/${rideId}/arrive`, {}, driver.priv);
  assert.equal(arrived.status, 200);

  const { status, body } = await post(`/api/rides/${rideId}/pickup`, {
    lat: NEARBY.lat,
    lon: NEARBY.lon
  }, rider.priv);

  assert.equal(status, 409);
  assert.match(body.error, /no longer be changed/i);
});

test('invalid coordinates are rejected', async () => {
  const rideId = await requestRide();

  const { status } = await post(`/api/rides/${rideId}/pickup`, {
    lat: 'nowhere',
    lon: -2.2426
  }, rider.priv);

  assert.equal(status, 400);
});
