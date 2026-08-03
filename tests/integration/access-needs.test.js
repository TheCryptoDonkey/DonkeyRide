/**
 * Access needs (wheelchair, child seat, assistance dog, extra luggage…).
 *
 * These are REQUIREMENTS, not a price band: a wheelchair user may want a
 * Standard car, and needing a child seat must not price someone into
 * Comfort. So they filter WHO can take the job and never touch the fare.
 *
 * Everything here fails closed, on the same reasoning as women-only
 * matching: a provider who has not declared a feature never sees the job
 * and cannot accept it. The failure this prevents is not a mismatched ride
 * — it is a wheelchair user watching a car they cannot board drive away.
 *
 * Also proves the data never leaves the operator's memory: health-adjacent
 * information must not reach a public relay, so it is absent from the
 * kind 30078 snapshot exactly like the women-only flag.
 */

process.env.DISABLE_REDIS = 'true';
process.env.PAYMENT_PROVIDER = 'demo';
process.env.ENABLE_NIP98_AUTH = 'false';
process.env.ENABLE_RATE_LIMITING = 'false';
process.env.DISPATCH_RADIUS_KM = '15';
process.env.REPUTATION_RELAYS = 'ws://127.0.0.1:1';
const WS_PORT = 47300 + Math.floor(Math.random() * 400);
process.env.WS_PORT = String(WS_PORT);

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { generatePrivateKey, getPublicKey, nip19 } = require('nostr-tools');

const { app, startServer, getWss } = require('../../server.js');

const rider = (() => {
  const priv = generatePrivateKey();
  const pub = getPublicKey(priv);
  return { priv, pub, npub: nip19.npubEncode(pub) };
})();

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
  rider_pubkey: rider.pub,
  rider_npub: rider.npub,
  ...extra
});

/** Put a driver on the map with the features they declare */
const register = (driver, accessFeatures) => post('/api/drivers/location', {
  npub: driver.npub,
  pubkey: driver.pub,
  lat: PICKUP.lat,
  lon: PICKUP.lon,
  access_features: accessFeatures
});

const accept = (rideId, driver, accessFeatures) => post(`/api/rides/${rideId}/accept`, {
  driver_pubkey: driver.pub,
  driver_npub: driver.npub,
  ...(accessFeatures ? { access_features: accessFeatures } : {})
});

test('the domain endpoint publishes the access catalogue', async () => {
  // The picker builds itself from this list. Omit it and the server-side
  // filtering still works perfectly on a need no rider can ever express.
  const { body } = await get('/api/domains/current');

  assert.ok(Array.isArray(body.accessOptions), 'accessOptions must be sent to clients');
  const ids = body.accessOptions.map((option) => option.id);
  assert.ok(ids.includes('wheelchair'), 'wheelchair option must reach the client');
  for (const option of body.accessOptions) {
    assert.equal(option.fareMultiplier, undefined,
      'an access option must never arrive carrying a price');
  }
});

test('an access need never changes the fare', async () => {
  const plain = await createRide();
  const needy = await createRide({ access_needs: ['wheelchair', 'assistance_dog'] });

  assert.equal(
    needy.body.estimated_fare, plain.body.estimated_fare,
    'needing a ramp is not a reason to be charged more'
  );
});

test('a job with access needs is invisible on the open list by default', async () => {
  const { body } = await createRide({ access_needs: ['wheelchair'] });

  const anonymous = await get('/api/rides/open');
  assert.ok(
    !anonymous.body.rides.some((r) => r.id === body.ride_id),
    'fail closed: a browser declaring nothing must not be offered the job'
  );

  const wrongFeature = await get('/api/rides/open?access=child_seat');
  assert.ok(
    !wrongFeature.body.rides.some((r) => r.id === body.ride_id),
    'declaring a different feature is not declaring this one'
  );

  const declared = await get('/api/rides/open?access=wheelchair');
  assert.ok(
    declared.body.rides.some((r) => r.id === body.ride_id),
    'a provider who declared the feature must see the job'
  );
});

test('every need must be met, not just one of them', async () => {
  const { body } = await createRide({ access_needs: ['wheelchair', 'child_seat'] });

  const partial = await get('/api/rides/open?access=wheelchair');
  assert.ok(
    !partial.body.rides.some((r) => r.id === body.ride_id),
    'meeting one of two needs is not meeting the request'
  );

  const both = await get('/api/rides/open?access=wheelchair,child_seat');
  assert.ok(both.body.rides.some((r) => r.id === body.ride_id));
});

test('accept is refused without the declaration, and says what is missing', async () => {
  const driver = makeDriver();
  await register(driver, []);
  const { body } = await createRide({ access_needs: ['wheelchair'] });

  const refused = await accept(body.ride_id, driver);
  assert.equal(refused.status, 403);
  assert.deepEqual(refused.body.missing, ['wheelchair']);
  assert.match(refused.body.details, /Wheelchair accessible/);
});

test('accept succeeds for a provider who declares the feature', async () => {
  const driver = makeDriver();
  await register(driver, ['wheelchair', 'assistance_dog']);
  const { body } = await createRide({ access_needs: ['wheelchair'] });

  const accepted = await accept(body.ride_id, driver, ['wheelchair', 'assistance_dog']);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
});

test('ordinary requests are unaffected and carry no access data', async () => {
  const driver = makeDriver();
  await register(driver, []);
  const { body } = await createRide();

  const open = await get('/api/rides/open');
  const listed = open.body.rides.find((r) => r.id === body.ride_id);
  assert.ok(listed, 'a request with no needs reaches everyone');
  assert.deepEqual(listed.accessNeeds, []);

  const accepted = await accept(body.ride_id, driver);
  assert.equal(accepted.status, 200);
});

test('unknown access ids are dropped, not rejected', async () => {
  // A newer client asking for something this operator does not model must
  // still get a ride rather than a 400
  const { body, status } = await createRide({
    access_needs: ['wheelchair', 'teleportation']
  });
  assert.equal(status, 200);

  const open = await get('/api/rides/open?access=wheelchair');
  assert.ok(
    open.body.rides.some((r) => r.id === body.ride_id),
    'the recognised need still applies; the unknown one is ignored'
  );
});

test('access needs never reach the public Nostr snapshot', async () => {
  const { body } = await createRide({ access_needs: ['wheelchair'] });
  const detail = await get(`/api/rides/${body.ride_id}`);
  const snapshot = JSON.stringify(detail.body.ride.snapshot || {});

  assert.ok(
    !snapshot.includes('wheelchair'),
    'health-adjacent data must never be published to a relay'
  );
});
