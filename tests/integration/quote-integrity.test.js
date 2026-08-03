/**
 * The upfront-price guarantee.
 *
 * A rider approves a number on the confirm screen and taps Request. The fare
 * recorded on the ride one tap later MUST be that number. The two endpoints
 * used to route independently — the quote priced a straight line, the ride
 * priced the road — so every fare came in over the quote by roughly the
 * ratio of road distance to crow-flies. This file pins them together.
 *
 * Also proves the fare breakdown is real: the rows come from the server's own
 * rate card and sum to the quoted fare exactly, rather than being synthesised
 * client-side as fixed percentages of the total.
 */

process.env.DISABLE_REDIS = 'true';
process.env.PAYMENT_PROVIDER = 'demo';
process.env.ENABLE_NIP98_AUTH = 'false';
process.env.ENABLE_RATE_LIMITING = 'false';
const WS_PORT = 45600 + Math.floor(Math.random() * 400);
process.env.WS_PORT = String(WS_PORT);

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { generatePrivateKey, getPublicKey, nip19 } = require('nostr-tools');

const { app, startServer, getWss } = require('../../server.js');

const riderPriv = generatePrivateKey();
const riderPub = getPublicKey(riderPriv);
const riderNpub = nip19.npubEncode(riderPub);

const PICKUP = { lat: 53.4808, lon: -2.2426 };
const DROPOFF = { lat: 53.4774, lon: -2.2309 };
const STOPS = [{ lat: 53.4900, lon: -2.2000 }];

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

const quote = (extra = {}) => post('/api/trips/estimate', {
  pickup_lat: PICKUP.lat,
  pickup_lon: PICKUP.lon,
  dropoff_lat: DROPOFF.lat,
  dropoff_lon: DROPOFF.lon,
  ...extra
});

const request = (extra = {}) => post('/api/rides/request', {
  pickup_lat: PICKUP.lat,
  pickup_lon: PICKUP.lon,
  dropoff_lat: DROPOFF.lat,
  dropoff_lon: DROPOFF.lon,
  rider_pubkey: riderPub,
  rider_npub: riderNpub,
  ...extra
});

test('the quoted fare is the fare recorded on the ride', async () => {
  const q = await quote();
  assert.equal(q.status, 200);

  const r = await request();
  assert.equal(r.status, 200);

  assert.equal(
    r.body.estimated_fare, q.body.fare.sats,
    'ride fare must equal the quote the rider approved'
  );
  // Same inputs, so the route the price came from must agree too
  assert.equal(r.body.distance_km, q.body.distance.km);
  assert.equal(r.body.duration_minutes, Math.round(q.body.duration.minutes));
});

test('quote and ride agree on a multi-stop route', async () => {
  const q = await quote({ stops: STOPS });
  const r = await request({ stops: STOPS });

  assert.equal(r.body.estimated_fare, q.body.fare.sats);
  assert.equal(r.body.distance_km, q.body.distance.km);
  // The detour is really covered — a via point this far off the direct line
  // cannot leave the distance unchanged
  const direct = await quote();
  assert.ok(
    q.body.distance.km > direct.body.distance.km,
    'multi-stop quote must cover the detour'
  );
});

test('quote and ride agree on a scaled service class', async () => {
  const q = await quote();
  const xl = (q.body.options || []).find((o) => o.id !== q.body.options[0].id);
  if (!xl) return; // domain without classes — nothing to pin

  const r = await request({ option: xl.id });
  assert.equal(
    r.body.estimated_fare, xl.fareSats,
    'the class price shown in the picker must be the price charged'
  );
});

test('fare breakdown rows are real and sum to the fare exactly', async () => {
  const { body } = await quote();
  const b = body.fareBreakdown;

  assert.ok(b, 'estimate must carry a fareBreakdown');
  const sum = b.baseFareSats + b.distanceFareSats + b.timeFareSats;
  assert.equal(sum, body.fare.sats, 'rows must sum to the quoted fare');

  // Not the old synthesised 30/40/20 split — the rows must track the rate
  // card, so a longer trip must shift weight onto the distance row
  const far = await post('/api/trips/estimate', {
    pickup_lat: PICKUP.lat,
    pickup_lon: PICKUP.lon,
    dropoff_lat: 53.8008,
    dropoff_lon: -1.5491
  });
  const fb = far.body.fareBreakdown;
  const shareNear = b.distanceFareSats / body.fare.sats;
  const shareFar = fb.distanceFareSats / far.body.fare.sats;
  assert.ok(
    shareFar > shareNear,
    'distance must be a larger share of a longer fare (rows are not fixed percentages)'
  );
});

test('every service class carries its own summing breakdown', async () => {
  const { body } = await quote();
  for (const option of body.options || []) {
    const b = option.fareBreakdown;
    assert.ok(b, `class ${option.id} must carry a breakdown`);
    assert.equal(
      b.baseFareSats + b.distanceFareSats + b.timeFareSats,
      option.fareSats,
      `class ${option.id} rows must sum to its own fare`
    );
  }
});

test('the quote carries the geometry the price came from', async () => {
  const { body } = await quote();
  // With a router up this is the road polyline; without one the estimate is
  // an honest straight line and says so rather than inventing a route.
  if (body.routed) {
    assert.ok(Array.isArray(body.routeGeometry) && body.routeGeometry.length > 1);
  } else {
    assert.equal(body.routed, false);
    assert.equal(body.routeGeometry, null);
  }
});
