/** Privacy-default coordination: exact itinerary never enters the operator. */

process.env.DISABLE_REDIS = 'true';
process.env.PAYMENT_PROVIDER = 'demo';
process.env.ENABLE_NIP98_AUTH = 'false';
process.env.ENABLE_RATE_LIMITING = 'false';
process.env.OPERATOR_DATA_MODE = 'blind';
process.env.WS_PORT = String(47800 + Math.floor(Math.random() * 500));
require('../helpers/isolate-relays');

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { generatePrivateKey, getPublicKey, nip19 } = require('nostr-tools');
const { encodeGeohash, decodeGeohash } = require('../../src/utils/geohash');
const { app, startServer, getWss, rideManager } = require('../../server.js');

const exactPickup = { lat: 53.4808123, lon: -2.2426123 };
const exactDropoff = { lat: 53.4774567, lon: -2.2309456 };
const pickupCell = encodeGeohash(exactPickup.lat, exactPickup.lon, 5);
const dropoffCell = encodeGeohash(exactDropoff.lat, exactDropoff.lon, 5);
const riderPriv = generatePrivateKey();
const riderPub = getPublicKey(riderPriv);
const driverPriv = generatePrivateKey();
const driverPub = getPublicKey(driverPriv);

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
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test('blind operator advertises the boundary and no database', async () => {
  const response = await fetch(`${baseUrl}/info`);
  const info = await response.json();
  assert.equal(info.data_handling.mode, 'blind');
  assert.equal(info.data_handling.exact_itinerary, 'participant_encrypted');
  assert.equal(info.data_handling.database_enabled, false);
  assert.ok(info.data_handling.residual_metadata.includes('network_address'));
});

test('blind operator rejects an exact-coordinate estimate', async () => {
  const result = await post('/api/trips/estimate', {
    pickup_lat: exactPickup.lat,
    pickup_lon: exactPickup.lon,
    dropoff_lat: exactDropoff.lat,
    dropoff_lon: exactDropoff.lon,
  });
  assert.equal(result.status, 400);
  assert.match(result.body.error, /coarse cells/i);
});

test('no-money multi-stop task stores only cells and route totals', async () => {
  const summary = { distance_km: 4.75, duration_minutes: 17.5 };
  const quote = await post('/api/trips/estimate', {
    location_mode: 'participant_encrypted',
    pickup_cell: pickupCell,
    dropoff_cell: dropoffCell,
    stop_count: 2,
    route_summary: summary,
  });
  assert.equal(quote.status, 200, JSON.stringify(quote.body));
  assert.equal(quote.body.routed, true);
  assert.equal(quote.body.routeGeometry, null);

  const created = await post('/api/rides/request', {
    location_mode: 'participant_encrypted',
    pickup_cell: pickupCell,
    dropoff_cell: dropoffCell,
    stop_count: 2,
    route_summary: summary,
    quote_id: quote.body.quote_id,
    settlement_mode: 'none',
    rider_pubkey: riderPub,
    rider_npub: nip19.npubEncode(riderPub),
    // A hostile/old client cannot smuggle these into blind storage.
    pickup_address: '1 Exact Home Street',
    dropoff_address: '9 Exact School Road',
    pickup_note: 'private note',
    stops: [{ lat: 53.49, lon: -2.2, address: 'secret stop' }],
    passenger: { name: 'third-party name' },
    access_needs: ['wheelchair'],
    women_only: true,
    preferred_providers: ['a'.repeat(64)],
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.estimated_fare, 0);
  assert.equal(created.body.stops, null);
  assert.equal(created.body.stop_count, 2);
  assert.equal(created.body.settlement_mode, 'none');

  const ride = rideManager.getRide(created.body.ride_id);
  const expectedPickup = decodeGeohash(pickupCell);
  assert.equal(ride.pickup.lat, expectedPickup.lat);
  assert.equal(ride.pickup.lon, expectedPickup.lon);
  assert.notEqual(ride.pickup.lat, exactPickup.lat);
  assert.equal(ride.stops, null);
  assert.equal(ride.stopCount, 2);
  assert.equal(ride.pickupAddress, undefined);
  assert.equal(ride.dropoffAddress, undefined);
  assert.equal(ride.pickupNote, undefined);
  assert.equal(ride.passenger, undefined);
  assert.equal(ride.accessNeeds, undefined);
  assert.equal(ride.womenOnly, undefined);
  assert.equal(ride.preferredProviders, undefined);
  assert.equal(JSON.stringify(ride).includes('Exact Home Street'), false);

  const accepted = await post(`/api/rides/${ride.id}/accept`, {
    driver_pubkey: driverPub,
    driver_npub: nip19.npubEncode(driverPub),
    driver_location: exactPickup,
    // Blind coordination must discard these even from an old/hostile app.
    vehicle: { registration: 'PII-123', make: 'Specific' },
    credentials: [{ id: 'licence', reference: 'secret-ref' }],
    gender: 'woman',
    access_features: ['wheelchair'],
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(ride.vehicle, undefined);
  assert.equal(ride.providerCredentials, undefined);
  assert.equal(JSON.stringify(ride).includes('PII-123'), false);
  assert.equal(ride.driver.location.lat, expectedPickup.lat);
  assert.equal(ride.driver.location.lon, expectedPickup.lon);

  const liveTrack = await post(`/api/rides/${ride.id}/location`, {
    lat: exactPickup.lat,
    lon: exactPickup.lon,
  });
  assert.equal(liveTrack.status, 409);
  const movedPickup = await post(`/api/rides/${ride.id}/pickup`, {
    lat: exactPickup.lat,
    lon: exactPickup.lon,
    address: 'another exact place',
  });
  assert.equal(movedPickup.status, 409);
  const movedDropoff = await post(`/api/rides/${ride.id}/dropoff`, {
    lat: exactDropoff.lat,
    lon: exactDropoff.lon,
  });
  assert.equal(movedDropoff.status, 409);
  assert.equal(JSON.stringify(ride).includes('another exact place'), false);

  const options = await fetch(`${baseUrl}/api/rides/${ride.id}/payment-options`);
  const payment = await options.json();
  assert.equal(payment.settlement, 'none');
  assert.deepEqual(payment.methods, []);

  const settle = await post(`/api/rides/${ride.id}/settle`, { rail: 'cash', proof: {} });
  assert.equal(settle.status, 409);
});

test('blind single-location task sends a coarse cell and no fake route', async () => {
  const created = await post('/api/rides/request', {
    location_mode: 'participant_encrypted',
    pickup_cell: pickupCell,
    stop_count: 0,
    route_summary: { distance_km: 0, duration_minutes: 0 },
    settlement_mode: 'none',
    domain: 'locksmith',
    rider_pubkey: riderPub,
    rider_npub: nip19.npubEncode(riderPub),
    pickup_address: 'must not be stored',
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.location_mode, 'participant_encrypted');
  assert.equal(created.body.route, null);
  const ride = rideManager.getRide(created.body.ride_id);
  assert.equal(ride.dropoff, null);
  assert.equal(ride.pickupAddress, undefined);
});
