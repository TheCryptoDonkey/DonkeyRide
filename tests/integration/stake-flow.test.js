/**
 * Stake flow (Flow A) integration tests.
 *
 * This is the flow where money is actually enforced: rider stakes, driver
 * accepts and stakes, both stakes release on completion, and cancellation
 * forfeits the canceller's stake. These endpoints were historically never
 * exercised (a call to a nonexistent method survived here for months), so
 * this suite runs the whole loop over real HTTP with signed requests.
 */

process.env.DISABLE_REDIS = 'true';
process.env.DISABLE_WS = 'true';
process.env.PAYMENT_PROVIDER = 'demo';
process.env.ENABLE_NIP98_AUTH = 'true';
process.env.ENABLE_RATE_LIMITING = 'false';
// No relay: boot rehydrates non-terminal tasks from Nostr snapshots, so a
// developer with a relay in their .env would start this test with their own
// live jobs already loaded. Durability is not what is under test here.
process.env.NOSTR_RELAY = '';
process.env.PUBLIC_RELAY_URLS = '';


const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { generatePrivateKey, getPublicKey, nip19 } = require('nostr-tools');

const { app, startServer } = require('../../server.js');
const { generateAuthEvent, createAuthHeader } = require('../../middleware/nip98-auth');

const riderPriv = generatePrivateKey();
const riderPub = getPublicKey(riderPriv);
const driverPriv = generatePrivateKey();
const driverPub = getPublicKey(driverPriv);
const driverNpub = nip19.npubEncode(driverPub);

const FARE = 20000;
const EXPECTED_RIDER_STAKE = Math.max(50, Math.floor(FARE * 0.1));   // 2000
const EXPECTED_DRIVER_STAKE = Math.max(50, Math.floor(FARE * 0.15)); // 3000

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

async function post(path, body, privKey) {
  const url = `${baseUrl}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (privKey) {
    headers.Authorization = createAuthHeader(generateAuthEvent(url, 'POST', privKey));
  }
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function driveToActive(rideId) {
  const created = await post('/rides/create', {
    rideId,
    riderId: riderPub,
    fareAmount: FARE,
    currency: 'GBP'
  }, riderPriv);
  assert.equal(created.status, 200, JSON.stringify(created.body));

  const riderStaked = await post(`/rides/${rideId}/rider-stake`, {}, riderPriv);
  assert.equal(riderStaked.status, 200, JSON.stringify(riderStaked.body));
  assert.equal(riderStaked.body.status, 'stake_locked');

  const accepted = await post(`/rides/${rideId}/driver-accept`, {
    driverId: driverNpub,
    driverPubkey: driverPub,
    driverLightning: 'driver@example.com'
  }, driverPriv);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.stakeAmount, EXPECTED_DRIVER_STAKE);

  const driverStaked = await post(`/rides/${rideId}/driver-stake`, {}, driverPriv);
  assert.equal(driverStaked.status, 200, JSON.stringify(driverStaked.body));
  assert.equal(driverStaked.body.status, 'ride_active');

  return { created, riderStaked, accepted, driverStaked };
}

test('full stake lifecycle: create → rider-stake → driver-accept → driver-stake → complete', async () => {
  const rideId = 'flowa_happy';
  const steps = await driveToActive(rideId);

  assert.equal(steps.created.body.stakeAmount, EXPECTED_RIDER_STAKE);
  // create no longer returns a decorative invoice; the real invoice (if the
  // rail needs one) is issued at the rider-stake step.
  assert.ok(!steps.created.body.invoice, 'create must not return a decorative invoice');
  assert.equal(steps.created.body.next, `/rides/${rideId}/rider-stake`);
  assert.equal(steps.riderStaked.body.proof.kind, 30532, 'stake lock proof is a kind 30532 event');

  const completed = await post(`/rides/${rideId}/complete`, {}, driverPriv);
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  assert.equal(completed.body.riderStakeReleased, true);
  assert.equal(completed.body.driverStakeReleased, true);
  assert.equal(completed.body.releases.length, 2, 'both release proofs present');
  for (const release of completed.body.releases) {
    assert.equal(release.kind, 30533, 'release proof is a kind 30533 event');
  }
});

test('rider cancellation forfeits 80% of the rider stake', async () => {
  const rideId = 'flowa_cancel';
  await driveToActive(rideId);

  const cancelled = await post(`/rides/${rideId}/cancel`, {
    cancelledBy: riderPub,
    reason: 'changed my mind'
  }, riderPriv);
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.equal(cancelled.body.success, true);
  assert.equal(cancelled.body.penalty, Math.floor(EXPECTED_RIDER_STAKE * 0.8));
  assert.equal(cancelled.body.refund, EXPECTED_RIDER_STAKE - Math.floor(EXPECTED_RIDER_STAKE * 0.8));
});

test('create rejects a signer that does not match riderId', async () => {
  const res = await post('/rides/create', {
    rideId: 'flowa_forged',
    riderId: riderPub,
    fareAmount: FARE
  }, driverPriv);
  assert.equal(res.status, 403, JSON.stringify(res.body));
});

test('completing a ride twice fails cleanly', async () => {
  const rideId = 'flowa_double';
  await driveToActive(rideId);

  const first = await post(`/rides/${rideId}/complete`, {}, driverPriv);
  assert.equal(first.status, 200);

  const second = await post(`/rides/${rideId}/complete`, {}, driverPriv);
  // The session is finalised and removed on first completion, so a repeat
  // is a clean 404 rather than a double-settlement.
  assert.equal(second.status, 404, 'second completion must not silently succeed');
});
