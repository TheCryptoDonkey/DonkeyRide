/**
 * Vehicle details on accept.
 *
 * The driver's car (make/model/colour/registration) arrives with the
 * accept call and is participant-gated ride state: the matched rider
 * sees it on the detail; it never appears pre-accept and a stranger
 * cannot read it. Free text is trimmed and capped.
 */

process.env.DISABLE_REDIS = 'true';
process.env.PAYMENT_PROVIDER = 'demo';
process.env.ENABLE_NIP98_AUTH = 'true';
process.env.ENABLE_RATE_LIMITING = 'false';
const WS_PORT = 45300 + Math.floor(Math.random() * 1000);
process.env.WS_PORT = String(WS_PORT);
// No relay: boot rehydrates non-terminal tasks from Nostr snapshots, so a
// developer with a relay in their .env would start this test with their own
// live jobs already loaded. Durability is not what is under test here.
require('../helpers/isolate-relays');


const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { generatePrivateKey, getPublicKey, nip19 } = require('nostr-tools');

const { app, startServer, getWss } = require('../../server.js');
const { generateAuthEvent, createAuthHeader } = require('../../middleware/nip98-auth');

const riderPriv = generatePrivateKey();
const riderPub = getPublicKey(riderPriv);
const riderNpub = nip19.npubEncode(riderPub);
const driverPriv = generatePrivateKey();
const driverPub = getPublicKey(driverPriv);
const driverNpub = nip19.npubEncode(driverPub);

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
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: createAuthHeader(generateAuthEvent(url, 'POST', privKey)),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function getSigned(path, privKey) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: createAuthHeader(generateAuthEvent(url, 'GET', privKey)) },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

test('vehicle travels with accept, participant-gated, trimmed and capped', async () => {
  const create = await post('/api/rides/request', {
    pickup_lat: 53.4808, pickup_lon: -2.2426,
    dropoff_lat: 53.4774, dropoff_lon: -2.2309,
    rider_pubkey: riderPub, rider_npub: riderNpub,
  }, riderPriv);
  assert.equal(create.status, 200);
  const rideId = create.body.ride_id;

  const accept = await post(`/api/rides/${rideId}/accept`, {
    driver_npub: driverNpub,
    driver_pubkey: driverPub,
    driver_name: 'Car owner',
    vehicle: {
      make: '  Toyota ', model: 'Prius', colour: 'Blue',
      registration: 'MN65 XYZ' + 'x'.repeat(100), // capped at 40 chars
      bogus: 'ignored',
    },
  }, driverPriv);
  assert.equal(accept.status, 200);
  assert.equal(accept.body.ride.vehicle.make, 'Toyota', 'free text is trimmed');
  assert.equal(accept.body.ride.vehicle.registration.length, 40, 'fields are capped');

  // Both participants see the car on the detail
  const riderView = await getSigned(`/api/rides/${rideId}`, riderPriv);
  assert.equal(riderView.status, 200);
  assert.equal(riderView.body.ride.vehicle.colour, 'Blue');

  // A stranger cannot read it (the whole detail is participant-gated)
  const stranger = generatePrivateKey();
  const denied = await getSigned(`/api/rides/${rideId}`, stranger);
  assert.equal(denied.status, 403);
});

test('an all-empty or absent vehicle stores nothing', async () => {
  const create = await post('/api/rides/request', {
    pickup_lat: 53.4808, pickup_lon: -2.2426,
    dropoff_lat: 53.4774, dropoff_lon: -2.2309,
    rider_pubkey: riderPub, rider_npub: riderNpub,
  }, riderPriv);
  const rideId = create.body.ride_id;

  const accept = await post(`/api/rides/${rideId}/accept`, {
    driver_npub: driverNpub,
    driver_pubkey: driverPub,
    vehicle: { make: '  ', model: '' },
  }, driverPriv);
  assert.equal(accept.status, 200);
  assert.equal(accept.body.ride.vehicle ?? null, null);
});
