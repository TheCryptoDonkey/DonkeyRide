/**
 * Community lift: a routed, zero-settlement, multi-passenger journey.
 * Uses only synthetic Manchester coordinates.
 */

process.env.DISABLE_REDIS = 'true';
process.env.PAYMENT_PROVIDER = 'cash';
process.env.ENABLE_NIP98_AUTH = 'true';
process.env.ENABLE_RATE_LIMITING = 'false';
process.env.DISPATCH_RADIUS_KM = '15';
process.env.HANDOFF_HMAC_SECRET = 'integration-test-handoff-secret';
const WS_PORT = 45200 + Math.floor(Math.random() * 800);
process.env.WS_PORT = String(WS_PORT);
require('../helpers/isolate-relays');

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const { generatePrivateKey, getPublicKey, nip19 } = require('nostr-tools');
const { app, startServer, getWss } = require('../../server.js');
const { generateAuthEvent, createAuthHeader } = require('../../middleware/nip98-auth');

const PICKUP = { lat: 53.4808, lon: -2.2426 };
const FIRST = { lat: 53.4631, lon: -2.2913, address: 'Synthetic First Drop-off, Manchester' };
const LAST = { lat: 53.4420, lon: -2.2190, address: 'Synthetic Last Drop-off, Manchester' };

const riderPriv = generatePrivateKey();
const riderPub = getPublicKey(riderPriv);
const riderNpub = nip19.npubEncode(riderPub);

function identity() {
  const priv = generatePrivateKey();
  const pub = getPublicKey(priv);
  return { priv, pub, npub: nip19.npubEncode(pub) };
}

const communityDriver = identity();
const taxiDriver = identity();
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

async function request(method, path, body, priv = null) {
  const url = `${baseUrl}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (priv) headers.Authorization = createAuthHeader(generateAuthEvent(url, method, priv));
  const res = await fetch(url, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function connectDriver(driver, domain) {
  const wsUrl = `ws://127.0.0.1:${WS_PORT}`;
  const ws = new WebSocket(wsUrl);
  const frames = [];
  ws.on('message', (raw) => frames.push(JSON.parse(raw.toString())));
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  ws.send(JSON.stringify({ type: 'auth', event: generateAuthEvent(wsUrl, 'GET', driver.priv) }));
  await waitFor(frames, (frame) => frame.type === 'auth_ok');
  ws.send(JSON.stringify({
    type: 'register_driver',
    pubkey: driver.pub,
    npub: driver.npub,
    domain,
    service_options: ['standard'],
    location: { lat: PICKUP.lat, lon: PICKUP.lon }
  }));
  await new Promise((resolve) => setTimeout(resolve, 150));
  return { ws, frames };
}

async function waitFor(frames, predicate, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = frames.find(predicate);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for WebSocket frame');
}

test('community lift routes roads, isolates dispatch, confirms every handoff and never settles money', async () => {
  const community = await connectDriver(communityDriver, 'community-lift');
  const taxi = await connectDriver(taxiDriver, 'ridesharing');

  const estimate = await request('POST', '/api/trips/estimate', {
    pickup_lat: PICKUP.lat,
    pickup_lon: PICKUP.lon,
    dropoff_lat: LAST.lat,
    dropoff_lon: LAST.lon,
    stops: [FIRST],
    domain: 'community-lift'
  });
  assert.equal(estimate.status, 200);
  assert.equal(estimate.body.routed, true, 'community lifts fail closed unless a real road route exists');
  assert.ok(estimate.body.routeGeometry.length > 2, 'road polyline must be present');
  assert.equal(estimate.body.fare.sats, 0);
  assert.ok(estimate.body.options.every((option) => option.fareSats === 0));

  const created = await request('POST', '/api/tasks/request', {
    pickup_lat: PICKUP.lat,
    pickup_lon: PICKUP.lon,
    dropoff_lat: LAST.lat,
    dropoff_lon: LAST.lon,
    pickup_address: 'Synthetic Meeting Point, Manchester',
    dropoff_address: LAST.address,
    rider_pubkey: riderPub,
    rider_npub: riderNpub,
    domain: 'community-lift',
    option: 'standard',
    passengers: [
      { id: 'alice', name: 'Alice', guardianName: 'Guardian A', handoffCode: '1842', dropoff: FIRST },
      { id: 'ben', name: 'Ben', guardianName: 'Guardian B', handoffCode: '7391', dropoff: LAST }
    ]
  }, riderPriv);
  assert.equal(created.status, 200);
  assert.equal(created.body.estimated_fare, 0);
  assert.equal(created.body.settlement_required, false);
  assert.equal(created.body.passenger_count, 2);
  assert.equal(created.body.drivers_notified, 1, 'only the driver online for this domain is notified');
  const rideId = created.body.ride_id;

  const offer = await waitFor(community.frames,
    (frame) => frame.type === 'ride_request' && frame.ride?.id === rideId);
  assert.equal(offer.ride.domain, 'community-lift');
  assert.equal(offer.ride.passengerCount, 2);
  assert.equal(offer.ride.passengers, undefined, 'names and exact drop-offs stay participant-gated');
  assert.equal(taxi.frames.some((frame) => frame.ride?.id === rideId), false);

  const communityOpen = await request('GET', '/api/tasks/open?domain=community-lift', undefined, communityDriver.priv);
  const taxiOpen = await request('GET', '/api/tasks/open?domain=ridesharing', undefined, taxiDriver.priv);
  assert.ok(communityOpen.body.rides.some((ride) => ride.id === rideId));
  assert.equal(taxiOpen.body.rides.some((ride) => ride.id === rideId), false);

  const detail = await request('GET', `/api/tasks/${rideId}`, undefined, riderPriv);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.ride.passengers.length, 2);
  assert.equal(JSON.stringify(detail.body).includes('handoffCode'), false, 'no code or digest is returned');

  const accepted = await request('POST', `/api/tasks/${rideId}/accept`, {
    driver_pubkey: communityDriver.pub,
    driver_npub: communityDriver.npub,
    domain: 'community-lift',
    service_options: ['standard'],
    driver_location: { lat: 53.4875, lon: -2.2901 }
  }, communityDriver.priv);
  assert.equal(accepted.status, 200);
  await request('POST', `/api/tasks/${rideId}/arrive`, {}, communityDriver.priv);
  await request('POST', `/api/tasks/${rideId}/start`, {}, communityDriver.priv);

  const tooSoon = await request('POST', `/api/tasks/${rideId}/complete`, {}, communityDriver.priv);
  assert.equal(tooSoon.status, 409);

  assert.equal((await request('POST', `/api/tasks/${rideId}/handoffs/alice/arrive`, {}, communityDriver.priv)).status, 200);
  for (const code of ['0000', '0001', '0002', '0003']) {
    assert.equal((await request('POST', `/api/tasks/${rideId}/handoffs/alice/confirm`, { code }, communityDriver.priv)).status, 403);
  }
  const locked = await request('POST', `/api/tasks/${rideId}/handoffs/alice/confirm`, { code: '0004' }, communityDriver.priv);
  assert.equal(locked.status, 429, 'five wrong guesses lock this passenger handoff');
  assert.equal((await request('POST', `/api/tasks/${rideId}/handoffs/alice/reset-code`, { code: '2841' }, riderPriv)).status, 200);
  assert.equal((await request('POST', `/api/tasks/${rideId}/handoffs/alice/confirm`, { code: '1842' }, communityDriver.priv)).status, 403);
  assert.equal((await request('POST', `/api/tasks/${rideId}/handoffs/alice/confirm`, { code: '2841' }, communityDriver.priv)).status, 200);
  assert.equal((await request('POST', `/api/tasks/${rideId}/handoffs/ben/confirm`, { code: '7391' }, communityDriver.priv)).status, 409);
  assert.equal((await request('POST', `/api/tasks/${rideId}/handoffs/ben/arrive`, {}, communityDriver.priv)).status, 200);
  assert.equal((await request('POST', `/api/tasks/${rideId}/handoffs/ben/confirm`, { code: '7391' }, communityDriver.priv)).status, 200);

  assert.equal((await request('GET', `/api/tasks/${rideId}/payment-options`, undefined, riderPriv)).status, 409);
  assert.equal((await request('POST', `/api/tasks/${rideId}/requester-stake`, {}, riderPriv)).status, 409);
  assert.equal((await request('POST', `/api/tasks/${rideId}/tip`, { amount_sats: 100 }, riderPriv)).status, 409);

  const completed = await request('POST', `/api/tasks/${rideId}/complete`, {}, communityDriver.priv);
  assert.equal(completed.status, 200);
  assert.equal(completed.body.ride.fare, 0);
  assert.equal(completed.body.payment.status, 'not_required');
  assert.equal(completed.body.payment.method, 'none');
  assert.ok(completed.body.ride.passengers.every((passenger) => passenger.handoffStatus === 'handed_off'));
  assert.equal(JSON.stringify(completed.body).includes('handoffCode'), false);

  community.ws.terminate();
  taxi.ws.terminate();
});
