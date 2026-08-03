/**
 * Demand pricing.
 *
 * The ridesharing profile has always declared `distance_time_surge` while no
 * multiplier existed anywhere in the code — a pricing model the
 * implementation did not make good on. This pins the behaviour now that it
 * does, and pins the guarantees that make it defensible:
 *
 *   - OFF unless the operator turns it on, so no existing deployment starts
 *     charging more because of a code change;
 *   - capped, because uncapped surge is how a ride home costs £200;
 *   - never triggered by an ABSENCE of providers (that is a search that will
 *     fail, not demand — pricing it would be charging for nothing);
 *   - and above all, a quote can never reprice UPWARD between the rider
 *     seeing it and tapping Request.
 */

process.env.DISABLE_REDIS = 'true';
process.env.PAYMENT_PROVIDER = 'demo';
process.env.ENABLE_NIP98_AUTH = 'false';
process.env.ENABLE_RATE_LIMITING = 'false';
process.env.SURGE_ENABLED = 'true';
process.env.SURGE_MAX = '2';
process.env.SURGE_MIN_DEMAND = '3';
process.env.SURGE_RADIUS_KM = '5';
process.env.REPUTATION_RELAYS = 'ws://127.0.0.1:1';
const WS_PORT = 47900 + Math.floor(Math.random() * 400);
process.env.WS_PORT = String(WS_PORT);

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { generatePrivateKey, getPublicKey, nip19 } = require('nostr-tools');

const { app, startServer, getWss } = require('../../server.js');

const PICKUP = { lat: 53.4808, lon: -2.2426 };
const DROPOFF = { lat: 53.4774, lon: -2.2309 };

function makeUser() {
  const priv = generatePrivateKey();
  const pub = getPublicKey(priv);
  return { priv, pub, npub: nip19.npubEncode(pub) };
}

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

const quote = () => post('/api/trips/estimate', {
  pickup_lat: PICKUP.lat, pickup_lon: PICKUP.lon,
  dropoff_lat: DROPOFF.lat, dropoff_lon: DROPOFF.lon
});

const request = (extra = {}) => {
  const rider = makeUser();
  return post('/api/rides/request', {
    pickup_lat: PICKUP.lat, pickup_lon: PICKUP.lon,
    dropoff_lat: DROPOFF.lat, dropoff_lon: DROPOFF.lon,
    rider_pubkey: rider.pub,
    rider_npub: rider.npub,
    ...extra
  });
};

/** Put a driver on the map near the pickup */
const putDriver = () => {
  const driver = makeUser();
  return post('/api/drivers/location', {
    npub: driver.npub, pubkey: driver.pub,
    lat: PICKUP.lat, lon: PICKUP.lon
  }).then(() => driver);
};

test('no surge with nobody waiting', async () => {
  const { body } = await quote();
  assert.equal(body.surge.active, false);
  assert.equal(body.surge.multiplier, 1);
});

test('an absence of providers is not demand', async () => {
  // Pile up waiting requests with NO drivers registered at all. Charging
  // the ceiling here would be charging for a search that is going to fail.
  for (let i = 0; i < 5; i++) await request();

  const { body } = await quote();
  assert.equal(
    body.surge.multiplier, 1,
    'zero supply must not surge — that is scarcity of service, not demand'
  );
  assert.equal(body.surge.available, 0);
});

test('surge rises with real demand and is disclosed in the quote', async () => {
  await putDriver(); // one provider, several already-waiting requests
  const { body } = await quote();

  assert.ok(body.surge.waiting >= 3, `expected waiting demand, got ${body.surge.waiting}`);
  assert.equal(body.surge.available, 1);
  assert.ok(body.surge.multiplier > 1, 'demand outstripping supply must surge');
  assert.equal(body.surge.active, true);
  assert.equal(body.surge.reason, 'high_demand');
});

test('surge is capped', async () => {
  const { body } = await quote();
  assert.ok(
    body.surge.multiplier <= 2,
    `SURGE_MAX must hold, got ${body.surge.multiplier}`
  );
});

test('the surged quote is still exactly what the ride records', async () => {
  const q = await quote();
  assert.ok(q.body.surge.active, 'this test needs a live surge');

  const r = await request({ surge_multiplier: q.body.surge.multiplier });
  assert.equal(
    r.body.estimated_fare, q.body.fare.sats,
    'the upfront-price guarantee must hold under surge too'
  );
});

test('a quote can never reprice upward on tap', async () => {
  // The rider was shown 1.0 (say, before a rush began). Even if the live
  // multiplier is now higher, they pay what they were shown.
  const q = await quote();
  assert.ok(q.body.surge.multiplier > 1, 'this test needs a live surge');

  const honoured = await request({ surge_multiplier: 1 });
  const flat = await post('/api/trips/estimate', {
    pickup_lat: PICKUP.lat, pickup_lon: PICKUP.lon,
    dropoff_lat: DROPOFF.lat, dropoff_lon: DROPOFF.lon
  });

  assert.ok(
    honoured.body.estimated_fare < flat.body.fare.sats,
    'a rider shown the lower price must be charged the lower price'
  );
  assert.equal(honoured.body.surge_multiplier, 1);
});

test('a client cannot talk the multiplier ABOVE the live figure', async () => {
  // The clamp is two-sided: quoting yourself 5× must not overcharge you
  // either, so the server takes the lower of live and quoted.
  const live = await quote();
  const cheeky = await request({ surge_multiplier: 99 });

  assert.equal(cheeky.body.surge_multiplier, live.body.surge.multiplier);
  assert.equal(cheeky.body.estimated_fare, live.body.fare.sats);
});

test('service classes compose with surge without breaking the breakdown', async () => {
  const { body } = await quote();
  for (const option of body.options || []) {
    const b = option.fareBreakdown;
    assert.equal(
      b.baseFareSats + b.distanceFareSats + b.timeFareSats,
      option.fareSats,
      `class ${option.id} must still sum under surge`
    );
  }
});
