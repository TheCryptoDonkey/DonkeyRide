/**
 * Provider credentials — self-attested, shown, never operator-verified.
 *
 * Proves:
 *   - the domain publishes what may be declared
 *   - a declaration reaches the requester on the participant-gated task
 *   - an expired claim is dropped rather than displayed
 *   - an unknown credential id is dropped
 *   - accepting is NOT gated by default (an operator opts in)
 */

process.env.DISABLE_REDIS = 'true';
process.env.PAYMENT_PROVIDER = 'demo';
process.env.ENABLE_RATE_LIMITING = 'false';
// These requests are unsigned, so auth must be OFF. Pin it rather than
// inheriting: server.js loads .env, and a developer whose operator runs with
// ENABLE_NIP98_AUTH=true would otherwise watch this file fail with 401s that
// say nothing about credentials.
process.env.ENABLE_NIP98_AUTH = 'false';
const WS_PORT = 54000 + Math.floor(Math.random() * 400);
process.env.WS_PORT = String(WS_PORT);
// No relay: boot rehydrates non-terminal tasks from Nostr snapshots, so a
// developer with a relay in their .env would start this test with their own
// live jobs already loaded. Durability is not what is under test here.
process.env.NOSTR_RELAY = '';
process.env.PUBLIC_RELAY_URLS = '';


const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { generatePrivateKey, getPublicKey, nip19 } = require('nostr-tools');

const { app, startServer, getWss } = require('../../server.js');

function makeIdentity() {
  const priv = generatePrivateKey();
  const pub = getPublicKey(priv);
  return { priv, pub, npub: nip19.npubEncode(pub) };
}

const rider = makeIdentity();
const driver = makeIdentity();

const PICKUP = { lat: 53.4808, lon: -2.2426 };
const DROPOFF = { lat: 53.4774, lon: -2.2309 };
const YEAR_AHEAD = Date.now() + 365 * 24 * 3600 * 1000;
const LAST_MONTH = Date.now() - 30 * 24 * 3600 * 1000;

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

const requestRide = () => post('/api/rides/request', {
  pickup_lat: PICKUP.lat,
  pickup_lon: PICKUP.lon,
  dropoff_lat: DROPOFF.lat,
  dropoff_lon: DROPOFF.lon,
  rider_npub: rider.npub,
  rider_pubkey: rider.pub
});

const accept = (rideId, credentials) => post(`/api/rides/${rideId}/accept`, {
  driver_pubkey: driver.pub,
  driver_npub: driver.npub,
  driver_location: PICKUP,
  credentials
});

test('the domain publishes what a provider may declare', async () => {
  const body = await fetch(`${baseUrl}/api/domains/current`).then((r) => r.json());

  const ids = body.credentials.map((c) => c.id);
  assert.ok(ids.includes('phv_licence'), `expected a private hire licence, got ${ids}`);
  assert.ok(ids.includes('hire_reward_insurance'));
  assert.equal(body.enforceCredentials, false, 'gating is opt-in, never the default');
  // A credential is a permission to work, never a price band
  for (const credential of body.credentials) {
    assert.equal(credential.fareMultiplier, undefined);
  }
});

test('a declaration reaches the requester on the task', async () => {
  const { body } = await requestRide();
  const accepted = await accept(body.ride_id, [
    { id: 'phv_licence', expiresAt: YEAR_AHEAD, reference: 'MCR/12345' },
    { id: 'hire_reward_insurance', expiresAt: YEAR_AHEAD }
  ]);

  assert.equal(accepted.status, 200);
  const declared = accepted.body.ride.providerCredentials;
  assert.equal(declared.length, 2);
  assert.equal(declared[0].id, 'phv_licence');
  assert.equal(declared[0].reference, 'MCR/12345');
  assert.equal(declared[0].expiresAt, YEAR_AHEAD);
});

test('an expired claim is dropped, not displayed', async () => {
  const { body } = await requestRide();
  const accepted = await accept(body.ride_id, [
    { id: 'phv_licence', expiresAt: LAST_MONTH },
    { id: 'mot', expiresAt: YEAR_AHEAD }
  ]);

  assert.equal(accepted.status, 200);
  const ids = (accepted.body.ride.providerCredentials || []).map((c) => c.id);
  assert.deepEqual(ids, ['mot'], 'a licence that ran out in March is not a licence');
});

test('an unknown credential id is dropped', async () => {
  const { body } = await requestRide();
  const accepted = await accept(body.ride_id, [
    { id: 'jedi_knight', expiresAt: YEAR_AHEAD },
    { id: 'mot', expiresAt: YEAR_AHEAD }
  ]);

  assert.equal(accepted.status, 200);
  const ids = (accepted.body.ride.providerCredentials || []).map((c) => c.id);
  assert.deepEqual(ids, ['mot']);
});

test('accepting is not gated by default', async () => {
  const { body } = await requestRide();
  const accepted = await accept(body.ride_id, undefined);

  assert.equal(
    accepted.status, 200,
    'an operator that has not opted in must not start refusing its own drivers'
  );
  assert.equal(accepted.body.ride.providerCredentials, undefined);
});
