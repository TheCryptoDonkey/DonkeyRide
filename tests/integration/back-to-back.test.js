/**
 * Back-to-back dispatch.
 *
 * A provider ten minutes from their drop-off is invisible to every request
 * around that drop-off, so they finish a job into an empty screen and then
 * drive back across town for the next one. Once they are close to the end
 * of an active job, dispatch also judges them from where that job ENDS —
 * in addition to where they currently are, never instead of it.
 *
 * Runs on a deliberately tight dispatch radius: with the ridesharing
 * default of 15 km nothing would be out of reach and the test would prove
 * nothing.
 */

process.env.DISABLE_REDIS = 'true';
process.env.PAYMENT_PROVIDER = 'demo';
process.env.ENABLE_RATE_LIMITING = 'false';
process.env.DISPATCH_RADIUS_KM = '2';
process.env.DISPATCH_RADIUS_MAX_KM = '2';
process.env.BACK_TO_BACK_LEAD_KM = '3';
// Keep the retry sweep out of the way — it would widen the radius for us
process.env.REQUEST_RETRY_MS = '600000';
const WS_PORT = 52000 + Math.floor(Math.random() * 400);
process.env.WS_PORT = String(WS_PORT);

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const { generatePrivateKey, getPublicKey, nip19 } = require('nostr-tools');

const { app, startServer, getWss } = require('../../server.js');

function makeIdentity() {
  const priv = generatePrivateKey();
  const pub = getPublicKey(priv);
  return { priv, pub, npub: nip19.npubEncode(pub) };
}

const rider = makeIdentity();
const driver = makeIdentity();

// The geometry, in a straight line of latitude (1° ≈ 111.32 km):
//   DRIVER ---2.8 km--- DROPOFF ---1.8 km--- NEXT_PICKUP
// so the next pickup is 4.6 km from where the driver IS (out of a 2 km
// radius) but 1.8 km from where they are about to BE (inside it).
const DROPOFF = { lat: 53.6000, lon: -2.2400 };
const DRIVER = { lat: 53.5748, lon: -2.2400 };
const NEXT_PICKUP = { lat: 53.6162, lon: -2.2400 };
const FAR_DESTINATION = { lat: 53.7000, lon: -2.2400 };

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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A driver socket registered at DRIVER, collecting every frame it gets */
async function onlineDriver() {
  const ws = new WebSocket(`ws://127.0.0.1:${WS_PORT}`);
  const frames = [];
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
  ws.on('message', (raw) => {
    try { frames.push(JSON.parse(raw.toString())); } catch { /* ignore */ }
  });
  ws.send(JSON.stringify({
    type: 'register_driver',
    pubkey: driver.pub,
    npub: driver.npub,
    location: DRIVER
  }));
  await wait(200);
  return { ws, frames };
}

const requestRide = (pickup, dropoff) => post('/api/rides/request', {
  pickup_lat: pickup.lat,
  pickup_lon: pickup.lon,
  dropoff_lat: dropoff.lat,
  dropoff_lon: dropoff.lon,
  rider_npub: rider.npub,
  rider_pubkey: rider.pub
});

const offers = (frames) => frames.filter((f) => f.type === 'ride_request');

test('an idle provider is not offered a job beyond the dispatch radius', async () => {
  const { ws, frames } = await onlineDriver();

  const { status } = await requestRide(NEXT_PICKUP, FAR_DESTINATION);
  assert.equal(status, 200);
  await wait(250);
  ws.close();

  assert.equal(
    offers(frames).length, 0,
    '4.6 km away on a 2 km radius must not be offered'
  );
});

test('a provider finishing a job IS offered work around their drop-off', async () => {
  const { ws, frames } = await onlineDriver();

  // The job they are currently on ends at DROPOFF
  const first = await requestRide(DRIVER, DROPOFF);
  assert.equal(first.status, 200);
  await post(`/api/rides/${first.body.ride_id}/accept`, {
    driver_pubkey: driver.pub,
    driver_npub: driver.npub,
    driver_location: DRIVER
  });
  await post(`/api/rides/${first.body.ride_id}/arrive`, { providerPubkey: driver.pub });
  await post(`/api/rides/${first.body.ride_id}/start`, { providerPubkey: driver.pub });
  // The finishing-provider index is cached for a second
  await wait(1100);

  const before = offers(frames).length;

  // A new request at the far pickup — out of radius from where they are,
  // in radius from where they are about to be
  const second = await requestRide(NEXT_PICKUP, FAR_DESTINATION);
  assert.equal(second.status, 200);
  await wait(300);
  ws.close();

  const received = offers(frames).slice(before);
  assert.equal(
    received.length, 1,
    `expected the next job to reach a finishing driver, got ${received.length}`
  );
  assert.equal(received[0].ride.id, second.body.ride_id);

  // Leave the driver idle again for the next case
  await post(`/api/rides/${first.body.ride_id}/complete`, { providerPubkey: driver.pub });
});

test('a provider who has not yet started is judged only from where they are', async () => {
  const { ws, frames } = await onlineDriver();

  // Matched but not under way — they are still at DRIVER and staying there
  const first = await requestRide(DRIVER, DROPOFF);
  await post(`/api/rides/${first.body.ride_id}/accept`, {
    driver_pubkey: driver.pub,
    driver_npub: driver.npub,
    driver_location: DRIVER
  });
  await wait(1100);

  const before = offers(frames).length;
  await requestRide(NEXT_PICKUP, FAR_DESTINATION);
  await wait(300);
  ws.close();

  assert.equal(
    offers(frames).length - before, 0,
    'a job that has not started tells us nothing about where the driver will be'
  );
});
