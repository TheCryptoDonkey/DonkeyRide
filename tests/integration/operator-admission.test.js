/** Real HTTP proof for open/regulated operator policy. */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { generatePrivateKey, getPublicKey, nip19 } = require('nostr-tools');

function identity() {
  const priv = generatePrivateKey();
  const pub = getPublicKey(priv);
  return { priv, pub, npub: nip19.npubEncode(pub) };
}

const rider = identity();
const rosterDriver = identity();
const outsideDriver = identity();

process.env.DISABLE_REDIS = 'true';
process.env.DISABLE_WS = 'true';
process.env.PAYMENT_PROVIDER = 'demo';
process.env.ENABLE_NIP98_AUTH = 'true';
process.env.ENABLE_RATE_LIMITING = 'false';
process.env.OPERATOR_POLICY_MODE = 'regulated';
process.env.OPERATOR_ADMISSION_MODE = 'allowlist_and_credentials';
process.env.OPERATOR_ALLOWED_DRIVERS = rosterDriver.pub;
require('../helpers/isolate-relays');

const { app, startServer } = require('../../server');
const { generateAuthEvent, createAuthHeader } = require('../../middleware/nip98-auth');

const PICKUP = { lat: 53.4808, lon: -2.2426 };
const DROPOFF = { lat: 53.4774, lon: -2.2309 };
const YEAR_AHEAD = Date.now() + 365 * 24 * 60 * 60 * 1000;
const credentials = [
  { id: 'phv_licence', expiresAt: YEAR_AHEAD },
  { id: 'hire_reward_insurance', expiresAt: YEAR_AHEAD },
];

let server;
let baseUrl;

before(async () => {
  await startServer({ listen: false });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

async function post(path, body, privkey) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: createAuthHeader(generateAuthEvent(url, 'POST', privkey)),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function requestRide() {
  return post('/api/rides/request', {
    pickup_lat: PICKUP.lat,
    pickup_lon: PICKUP.lon,
    dropoff_lat: DROPOFF.lat,
    dropoff_lon: DROPOFF.lon,
    rider_pubkey: rider.pub,
    rider_npub: rider.npub,
  }, rider.priv);
}

async function accept(rideId, driver, declarations) {
  return post(`/api/rides/${rideId}/accept`, {
    driver_pubkey: driver.pub,
    driver_npub: driver.npub,
    driver_location: PICKUP,
    credentials: declarations,
  }, driver.priv);
}

test('publishes the operator-owned admission and records contract', async () => {
  const info = await fetch(`${baseUrl}/info`).then((response) => response.json());
  assert.equal(info.policy.schema, 'org.donkeyride.operator-policy/v1');
  assert.equal(info.policy.mode, 'regulated');
  assert.equal(info.policy.admission.mode, 'allowlist_and_credentials');
  assert.equal(info.policy.admission.assurance, 'operator_roster_and_self_attested');
  assert.equal(info.policy.admission.allowlistSize, 1);
  assert.deepEqual(info.policy.admission.requiredCredentials.sort(), [
    'hire_reward_insurance', 'phv_licence'
  ]);
  assert.equal(JSON.stringify(info).includes(rosterDriver.pub), false, 'never publish the roster');
});

test('permits a foreign operator PWA without weakening signed identity checks', async () => {
  const response = await fetch(`${baseUrl}/info`, {
    headers: { Origin: 'https://another-operator.example' },
  });
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get('access-control-allow-origin'),
    'https://another-operator.example'
  );
});

test('refuses a driver outside the operator roster', async () => {
  const created = await requestRide();
  const accepted = await accept(created.body.ride_id, outsideDriver, credentials);
  assert.equal(accepted.status, 403);
  assert.equal(accepted.body.error, 'Driver not admitted by this operator');
});

test('refuses an allowlisted driver missing required declarations', async () => {
  const created = await requestRide();
  const accepted = await accept(created.body.ride_id, rosterDriver, [credentials[0]]);
  assert.equal(accepted.status, 403);
  assert.deepEqual(accepted.body.missing, ['hire_reward_insurance']);
});

test('accepts an allowlisted driver with current required declarations', async () => {
  const created = await requestRide();
  const accepted = await accept(created.body.ride_id, rosterDriver, credentials);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.ride.driver.pubkey, rosterDriver.pub);
});
