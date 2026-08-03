/**
 * Changing the destination mid-journey.
 *
 * The pickup endpoint freezes the fare once a provider has committed — a
 * rider walking to a legal kerb must not reprice a job. A DESTINATION
 * change is the opposite case: it is different work over a different
 * route, so it re-prices, on the terms the requester already agreed.
 *
 * Boots the real Express app with NIP-98 auth and the WebSocket
 * dispatcher, then proves:
 *
 *   - preview prices the change without applying it
 *   - a longer journey re-prices upward and the provider is told
 *   - the route and distance follow the new destination
 *   - stops can be added after the request, and cover the detour
 *   - the provider cannot change the requester's destination
 *   - it still works once the trip is under way (the whole point)
 *   - a waiting charge already accrued survives the change
 *   - a finished job refuses the change
 */

process.env.DISABLE_REDIS = 'true';
process.env.PAYMENT_PROVIDER = 'demo';
process.env.ENABLE_NIP98_AUTH = 'true';
process.env.ENABLE_RATE_LIMITING = 'false';
process.env.FREE_WAITING_MINUTES = '0';
const WS_PORT = 51000 + Math.floor(Math.random() * 400);
process.env.WS_PORT = String(WS_PORT);
// No relay: boot rehydrates non-terminal tasks from Nostr snapshots, so a
// developer with a relay in their .env would start this test with their own
// live jobs already loaded. Durability is not what is under test here.
process.env.NOSTR_RELAY = '';
process.env.PUBLIC_RELAY_URLS = '';


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
// Considerably further out — a genuinely bigger job
const FURTHER = { lat: 53.5400, lon: -2.1200 };
// A calling point roughly between the two
const STOP = { lat: 53.5000, lon: -2.2000 };

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

async function getRide(rideId, privKey) {
  const url = `${baseUrl}/api/rides/${rideId}`;
  const res = await fetch(url, {
    headers: { Authorization: createAuthHeader(generateAuthEvent(url, 'GET', privKey)) }
  });
  return (await res.json()).ride;
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

test('preview prices the change without applying it', async () => {
  const rideId = await requestRide();
  const before = await getRide(rideId, rider.priv);

  const { status, body } = await post(`/api/rides/${rideId}/dropoff`, {
    lat: FURTHER.lat,
    lng: FURTHER.lon,
    preview: true
  }, rider.priv);

  assert.equal(status, 200);
  assert.equal(body.preview, true);
  assert.ok(body.fare_sats > before.fare, 'a longer journey must quote higher');
  assert.equal(body.previous_fare_sats, before.fare);
  assert.equal(body.fare_change_sats, body.fare_sats - before.fare);

  const after = await getRide(rideId, rider.priv);
  assert.equal(after.fare, before.fare, 'a preview must not touch the recorded fare');
  assert.equal(after.dropoff.lat, DROPOFF.lat, 'a preview must not move the destination');
});

test('a new destination re-prices, re-routes and tells the provider', async () => {
  const rideId = await requestRide();
  await acceptRide(rideId);
  const before = await getRide(rideId, rider.priv);

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

  const { status, body } = await post(`/api/rides/${rideId}/dropoff`, {
    lat: FURTHER.lat,
    lon: FURTHER.lon,
    address: 'The other side of town'
  }, rider.priv);

  assert.equal(status, 200);
  assert.equal(body.ride.dropoff.lat, FURTHER.lat);
  assert.equal(body.ride.dropoffAddress, 'The other side of town');
  assert.ok(body.fare_sats > before.fare, 'a committed job DOES re-price on a new destination');
  assert.equal(body.ride.fare, body.fare_sats);
  assert.ok(body.distance_km > (before.distance || 0), 'the route must follow the new destination');
  assert.ok(body.moved_m > 1000);

  await new Promise((resolve) => setTimeout(resolve, 300));
  ws.close();

  const notice = frames.find((f) => f.type === 'dropoff_updated');
  assert.ok(notice, `provider was not told: ${JSON.stringify(frames.map((f) => f.type))}`);
  assert.equal(notice.dropoff.lat, FURTHER.lat);
  assert.equal(notice.fare_sats, body.fare_sats);
  assert.equal(notice.previous_fare_sats, before.fare);
});

test('a stop can be added after the request and covers the detour', async () => {
  const rideId = await requestRide();
  await acceptRide(rideId);
  const before = await getRide(rideId, rider.priv);

  const { status, body } = await post(`/api/rides/${rideId}/dropoff`, {
    stops: [{ lat: STOP.lat, lon: STOP.lon, address: 'Pick up my sister' }]
  }, rider.priv);

  assert.equal(status, 200);
  assert.equal(body.ride.stops.length, 1);
  assert.equal(body.ride.stops[0].address, 'Pick up my sister');
  assert.equal(body.ride.dropoff.lat, DROPOFF.lat, 'a stops-only change keeps the destination');
  assert.ok(body.distance_km > (before.distance || 0), 'the detour must be covered');
  assert.ok(body.fare_sats > before.fare);
});

test('the provider cannot change the requester destination', async () => {
  const rideId = await requestRide();
  await acceptRide(rideId);

  const { status } = await post(`/api/rides/${rideId}/dropoff`, {
    lat: FURTHER.lat,
    lon: FURTHER.lon
  }, driver.priv);

  assert.equal(status, 403);
});

test('the destination can still be changed once the trip is under way', async () => {
  const rideId = await requestRide();
  await acceptRide(rideId);
  assert.equal((await post(`/api/rides/${rideId}/arrive`, {}, driver.priv)).status, 200);
  assert.equal((await post(`/api/rides/${rideId}/start`, {}, driver.priv)).status, 200);

  const { status, body } = await post(`/api/rides/${rideId}/dropoff`, {
    lat: FURTHER.lat,
    lon: FURTHER.lon
  }, rider.priv);

  assert.equal(status, 200);
  assert.equal(body.ride.dropoff.lat, FURTHER.lat);
});

test('a waiting charge already accrued survives the change', async () => {
  const rideId = await requestRide();
  await acceptRide(rideId);
  assert.equal((await post(`/api/rides/${rideId}/arrive`, {}, driver.priv)).status, 200);
  // FREE_WAITING_MINUTES=0, so any measurable wait is chargeable; force one
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal((await post(`/api/rides/${rideId}/start`, {}, driver.priv)).status, 200);

  const started = await getRide(rideId, rider.priv);
  const waitingSats = started.waiting?.sats || 0;

  const { status, body } = await post(`/api/rides/${rideId}/dropoff`, {
    lat: FURTHER.lat,
    lon: FURTHER.lon
  }, rider.priv);

  assert.equal(status, 200);
  // Whatever the route now costs, the waiting the provider already did is
  // still in the number both parties settle
  assert.equal(
    body.fare_sats - waitingSats,
    body.estimate.fare.sats,
    'the fare must be route price plus the waiting already accrued'
  );
});

test('a finished job refuses a destination change', async () => {
  const rideId = await requestRide();
  await acceptRide(rideId);
  assert.equal((await post(`/api/rides/${rideId}/arrive`, {}, driver.priv)).status, 200);
  assert.equal((await post(`/api/rides/${rideId}/start`, {}, driver.priv)).status, 200);
  assert.equal((await post(`/api/rides/${rideId}/complete`, {}, driver.priv)).status, 200);

  const { status, body } = await post(`/api/rides/${rideId}/dropoff`, {
    lat: FURTHER.lat,
    lon: FURTHER.lon
  }, rider.priv);

  assert.equal(status, 409);
  assert.match(body.error, /no longer/i);
});

test('invalid coordinates are refused', async () => {
  const rideId = await requestRide();

  const { status } = await post(`/api/rides/${rideId}/dropoff`, {
    lat: 'somewhere',
    lon: -2.2
  }, rider.priv);

  assert.equal(status, 400);
});

test('the task alias reaches the same handler', async () => {
  const rideId = await requestRide();

  const { status, body } = await post(`/api/tasks/${rideId}/dropoff`, {
    lat: FURTHER.lat,
    lon: FURTHER.lon,
    preview: true
  }, rider.priv);

  assert.equal(status, 200);
  assert.equal(body.preview, true);
});

// ── The preview's whole promise: tap twice on the SAME number ───────────
//
// Preview and change each went through routeAndPrice independently, and the
// fiat rate card reaches sats through a five-minute-cached BTC price. Caught
// on real hardware mid-trip: the preview read 24,882 sats, the confirmed
// change recorded 24,888. Small, but it is exactly the guarantee the second
// tap exists to give.
const { getPriceCache } = require('../../src/pricing/fiat-conversion');

function movePrice(factor) {
  const cache = getPriceCache();
  for (const ccy of ['USD', 'EUR', 'GBP', 'KES']) {
    if (typeof cache[ccy] === 'number') cache[ccy] = cache[ccy] * factor;
  }
  cache.lastUpdate = Date.now();
}

test('the previewed price is what the change records, even if the rate moves', async () => {
  const rideId = await requestRide();
  await acceptRide(rideId);

  const preview = await post(`/api/rides/${rideId}/dropoff`, {
    lat: FURTHER.lat, lng: FURTHER.lon, preview: true
  }, rider.priv);
  assert.equal(preview.status, 200);
  assert.ok(preview.body.quote_id, 'a preview must hand back something to spend');
  const shown = preview.body.fare_sats;

  movePrice(1.05);

  const applied = await post(`/api/rides/${rideId}/dropoff`, {
    lat: FURTHER.lat, lng: FURTHER.lon, quote_id: preview.body.quote_id
  }, rider.priv);
  assert.equal(applied.status, 200);
  assert.equal(
    applied.body.fare_sats, shown,
    'the rider must be charged the number the preview showed'
  );

  movePrice(1 / 1.05);
});

test('a preview cannot be spent on a different destination', async () => {
  const rideId = await requestRide();
  await acceptRide(rideId);

  const preview = await post(`/api/rides/${rideId}/dropoff`, {
    lat: DROPOFF.lat, lng: DROPOFF.lon, preview: true
  }, rider.priv);

  // Same handle, somewhere materially further: the fare must come from the
  // destination actually being set.
  const applied = await post(`/api/rides/${rideId}/dropoff`, {
    lat: FURTHER.lat, lng: FURTHER.lon, quote_id: preview.body.quote_id
  }, rider.priv);
  assert.equal(applied.status, 200);
  assert.ok(
    applied.body.fare_sats > preview.body.fare_sats,
    'a mismatched preview must be ignored and the real change priced'
  );
});

test('an expired preview still lets the change through, priced live', async () => {
  const rideId = await requestRide();
  await acceptRide(rideId);
  const applied = await post(`/api/rides/${rideId}/dropoff`, {
    lat: FURTHER.lat, lng: FURTHER.lon, quote_id: 'q_neverissued'
  }, rider.priv);
  assert.equal(applied.status, 200, 'a stale preview must not cost them the change');
  assert.ok(applied.body.fare_sats > 0);
});
