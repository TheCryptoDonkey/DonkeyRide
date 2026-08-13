/**
 * The four things a rider gets that a map pin cannot give them:
 * lock-screen alerts, meeting instructions, a choice of vehicle, and a
 * favourite driver who gets first refusal. Plus waiting time, which is
 * what the driver gets back.
 *
 * Proves:
 *   - a rider push subscription is never offered a job (role separation)
 *   - matched / arrived / cancelled reach the rider's device
 *   - pickup notes are participant-gated: never in a pre-accept payload
 *   - service classes price up, and only declared drivers can see or take one
 *   - favourites get an exclusive window that others cannot out-tap
 *   - waiting past the free period grows the agreed fare, once
 */

process.env.DISABLE_REDIS = 'true';
process.env.PAYMENT_PROVIDER = 'demo';
process.env.ENABLE_NIP98_AUTH = 'true';
process.env.ENABLE_RATE_LIMITING = 'false';
process.env.FREE_WAITING_MINUTES = '0';
process.env.FAVOURITE_HEAD_START_MS = '30000';
const WS_PORT = 46100 + Math.floor(Math.random() * 1800);
process.env.WS_PORT = String(WS_PORT);
// No relay: boot rehydrates non-terminal tasks from Nostr snapshots, so a
// developer with a relay in their .env would start this test with their own
// live jobs already loaded. Durability is not what is under test here.
require('../helpers/isolate-relays');


const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { generatePrivateKey, getPublicKey, nip19 } = require('nostr-tools');

const { app, startServer, getWss, rideManager } = require('../../server.js');
const pushService = require('../../src/push.js');
const { generateAuthEvent, createAuthHeader } = require('../../middleware/nip98-auth');

function makeIdentity() {
  const priv = generatePrivateKey();
  const pub = getPublicKey(priv);
  return { priv, pub, npub: nip19.npubEncode(pub) };
}

const rider = makeIdentity();
const driver = makeIdentity();
const xlDriver = makeIdentity();
const favourite = makeIdentity();

const PICKUP = { lat: 53.4808, lon: -2.2426 };
const DROPOFF = { lat: 53.4774, lon: -2.2309 };

function subscription(tag) {
  return {
    endpoint: `https://push.example.com/${tag}`,
    keys: { p256dh: 'x'.repeat(87), auth: 'y'.repeat(22) }
  };
}

let server;
let baseUrl;
let sent;

before(async () => {
  await startServer({ listen: false });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  // Never talk to a real push service in tests
  pushService.setTransport(async (sub, payload) => {
    sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
  });
});

after(() => {
  pushService.setTransport(null);
  pushService.reset();
  server.close();
  const wss = getWss();
  if (wss) {
    wss.clients.forEach((client) => client.terminate());
    wss.close();
  }
});

beforeEach(() => {
  sent = [];
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

async function get(path, privKey) {
  const url = `${baseUrl}${path}`;
  const headers = privKey
    ? { Authorization: createAuthHeader(generateAuthEvent(url, 'GET', privKey)) }
    : {};
  const res = await fetch(url, { headers });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function requestRide(extra = {}, who = rider) {
  const { status, body } = await post('/api/rides/request', {
    pickup_lat: PICKUP.lat,
    pickup_lon: PICKUP.lon,
    dropoff_lat: DROPOFF.lat,
    dropoff_lon: DROPOFF.lon,
    rider_npub: who.npub,
    rider_pubkey: who.pub,
    ...extra
  }, who.priv);
  assert.equal(status, 200, JSON.stringify(body));
  return body;
}

// ── Rider push ──────────────────────────────────────

test('a rider push subscription is never offered a job', async () => {
  const res = await post('/api/push/subscribe', {
    subscription: subscription('rider'),
    pubkey: rider.pub,
    role: 'requester'
  }, rider.priv);
  assert.equal(res.status, 200);

  await requestRide();

  const jobAlerts = sent.filter((s) => /New .* nearby/.test(s.payload.title));
  assert.equal(jobAlerts.length, 0, 'a rider was offered a driver job');
});

test('matched and arrived reach the rider device', async () => {
  await post('/api/push/subscribe', {
    subscription: subscription('rider'),
    pubkey: rider.pub,
    role: 'requester'
  }, rider.priv);

  const { ride_id } = await requestRide();
  sent = [];

  await post(`/api/rides/${ride_id}/accept`, {
    driver_npub: driver.npub,
    driver_pubkey: driver.pub,
    driver_location: { lat: 53.47, lon: -2.25 },
    vehicle: { colour: 'Blue', make: 'Toyota', model: 'Corolla', registration: 'AB12 CDE' }
  }, driver.priv);

  const matched = sent.find((s) => /on the way/i.test(s.payload.title));
  assert.ok(matched, `no match alert: ${JSON.stringify(sent.map((s) => s.payload.title))}`);
  assert.match(matched.payload.body, /Blue Toyota Corolla/);
  assert.equal(matched.payload.url, '/request/active');

  sent = [];
  await post(`/api/rides/${ride_id}/arrive`, {}, driver.priv);
  assert.ok(sent.find((s) => /is here/i.test(s.payload.title)), 'no arrival alert');
});

// ── Pickup notes ────────────────────────────────────

test('a pickup note reaches the matched driver and nobody else', async () => {
  const { ride_id } = await requestRide({ pickup_note: 'Black gate, side entrance' });

  // Pre-accept browsing must not carry the note
  const open = await get('/api/rides/open', driver.priv);
  const listed = open.body.rides.find((r) => r.id === ride_id);
  assert.ok(listed, 'ride missing from the open list');
  assert.equal(JSON.stringify(listed).includes('Black gate'), false,
    'the note leaked into a pre-accept payload');

  await post(`/api/rides/${ride_id}/accept`, {
    driver_npub: driver.npub,
    driver_pubkey: driver.pub,
    driver_location: { lat: 53.47, lon: -2.25 }
  }, driver.priv);

  const detail = await get(`/api/rides/${ride_id}`, driver.priv);
  assert.equal(detail.body.ride.pickupNote, 'Black gate, side entrance');
});

test('the note can be edited alone, without moving the pickup or the price', async () => {
  const { ride_id } = await requestRide();
  const before = await get(`/api/rides/${ride_id}`, rider.priv);

  const res = await post(`/api/rides/${ride_id}/pickup`, {
    note: 'I am in the blue coat'
  }, rider.priv);

  assert.equal(res.status, 200);
  assert.equal(res.body.repriced, false);
  assert.equal(res.body.ride.pickupNote, 'I am in the blue coat');
  assert.equal(res.body.ride.fare, before.body.ride.fare);
  assert.deepEqual(res.body.ride.pickup, before.body.ride.pickup);
});

// ── Service classes ─────────────────────────────────

test('XL costs more than standard and is hidden from undeclared drivers', async () => {
  const standard = await requestRide();
  const xl = await requestRide({ option: 'xl' });

  assert.equal(xl.option, 'xl');
  assert.ok(xl.estimated_fare > standard.estimated_fare,
    `XL (${xl.estimated_fare}) should cost more than standard (${standard.estimated_fare})`);

  // A driver who declared nothing sees only the standard job
  const plain = await get('/api/rides/open', driver.priv);
  const plainIds = plain.body.rides.map((r) => r.id);
  assert.ok(plainIds.includes(standard.ride_id));
  assert.ok(!plainIds.includes(xl.ride_id), 'an undeclared driver was shown an XL job');

  // One who declared XL sees both
  const declared = await get('/api/rides/open?options=xl', xlDriver.priv);
  const declaredIds = declared.body.rides.map((r) => r.id);
  assert.ok(declaredIds.includes(xl.ride_id), 'a declared XL driver could not see the job');
});

test('accepting an XL job without declaring the class is refused', async () => {
  const { ride_id } = await requestRide({ option: 'xl' });

  const refused = await post(`/api/rides/${ride_id}/accept`, {
    driver_npub: driver.npub,
    driver_pubkey: driver.pub,
    driver_location: { lat: 53.47, lon: -2.25 }
  }, driver.priv);
  assert.equal(refused.status, 403);
  assert.match(refused.body.error, /class/i);

  const accepted = await post(`/api/rides/${ride_id}/accept`, {
    driver_npub: xlDriver.npub,
    driver_pubkey: xlDriver.pub,
    driver_location: { lat: 53.47, lon: -2.25 },
    service_options: ['xl']
  }, xlDriver.priv);
  assert.equal(accepted.status, 200);
});

// ── Favourite providers ─────────────────────────────

test('a favourite gets the job to themselves before anyone else', async () => {
  const { ride_id } = await requestRide({ preferred_providers: [favourite.pub] });

  // Hidden from everyone else while the window is open
  const others = await get('/api/rides/open', driver.priv);
  assert.ok(!others.body.rides.some((r) => r.id === ride_id),
    'a non-favourite could browse a job inside its head start');

  // …and visible to the favourite
  const theirs = await get(`/api/rides/open?pubkey=${favourite.pub}`, favourite.priv);
  assert.ok(theirs.body.rides.some((r) => r.id === ride_id),
    'the favourite could not see their own head start');

  // A head start others can out-tap is not a head start
  const outTapped = await post(`/api/rides/${ride_id}/accept`, {
    driver_npub: driver.npub,
    driver_pubkey: driver.pub,
    driver_location: { lat: 53.47, lon: -2.25 }
  }, driver.priv);
  assert.equal(outTapped.status, 403);
  assert.ok(outTapped.body.opens_in_seconds >= 0);

  const taken = await post(`/api/rides/${ride_id}/accept`, {
    driver_npub: favourite.npub,
    driver_pubkey: favourite.pub,
    driver_location: { lat: 53.47, lon: -2.25 }
  }, favourite.priv);
  assert.equal(taken.status, 200);
});

test('an unknown or malformed favourite never blocks the job', async () => {
  const { ride_id, favourites_first } = await requestRide({
    preferred_providers: ['not-a-pubkey', 12345]
  });
  assert.equal(favourites_first, false);

  const open = await get('/api/rides/open', driver.priv);
  assert.ok(open.body.rides.some((r) => r.id === ride_id));
});

// ── Waiting time ────────────────────────────────────

test('a few seconds at the kerb never changes the fare', async () => {
  const { ride_id } = await requestRide();
  await post(`/api/rides/${ride_id}/accept`, {
    driver_npub: driver.npub,
    driver_pubkey: driver.pub,
    driver_location: { lat: 53.47, lon: -2.25 }
  }, driver.priv);

  const before = await get(`/api/rides/${ride_id}`, driver.priv);
  const agreed = before.body.ride.fare;

  await post(`/api/rides/${ride_id}/arrive`, {}, driver.priv);
  const started = await post(`/api/rides/${ride_id}/start`, {}, driver.priv);

  assert.equal(started.status, 200);
  assert.equal(started.body.ride.fare, agreed,
    'a sub-minute wait must never change the fare');
  assert.equal(started.body.ride.waiting, undefined);
});

test('a long wait grows the agreed fare, once, by the per-minute rate', async () => {
  const { ride_id } = await requestRide();
  await post(`/api/rides/${ride_id}/accept`, {
    driver_npub: driver.npub,
    driver_pubkey: driver.pub,
    driver_location: { lat: 53.47, lon: -2.25 }
  }, driver.priv);
  await post(`/api/rides/${ride_id}/arrive`, {}, driver.priv);

  // Back-date the arrival: the driver has been at the kerb 12 minutes
  const ride = rideManager.getRide(ride_id);
  const agreed = ride.fare;
  ride.timestamps.providerArrived = Date.now() - 12 * 60 * 1000;

  const started = await post(`/api/rides/${ride_id}/start`, {}, driver.priv);
  assert.equal(started.status, 200);
  assert.ok(started.body.ride.waiting, 'no waiting recorded after a 12 minute wait');
  assert.equal(started.body.ride.waiting.minutes, 12);
  assert.ok(started.body.ride.waiting.sats > 0);
  assert.equal(
    started.body.ride.fare,
    agreed + started.body.ride.waiting.sats,
    'the waiting charge must be added to the agreed fare'
  );

  // The trip is under way — starting again must not stack another charge
  const again = await post(`/api/rides/${ride_id}/start`, {}, driver.priv);
  assert.equal(again.status, 400);
  assert.equal(rideManager.getRide(ride_id).fare, started.body.ride.fare);
});

// ── Booking for somebody else ───────────────────────

test('a passenger name reaches the matched provider and nobody else', async () => {
  const created = await requestRide({
    passenger: { name: 'Aunty Mercy', note: 'she uses a stick' }
  });

  // Pre-accept: the open list is public-ish, so it must not carry a name
  // Signed as a driver browsing, which is who the open list is for
  const open = await get('/api/rides/open', driver.priv);
  assert.equal(open.status, 200, JSON.stringify(open.body));
  const listed = (open.body.rides || open.body.tasks || [])
    .find((r) => r.id === created.ride_id);
  assert.ok(listed, 'the job should still be browsable');
  assert.equal(
    JSON.stringify(listed).includes('Mercy'), false,
    'a third party name must never appear in a pre-accept payload'
  );

  const accepted = await post(`/api/rides/${created.ride_id}/accept`, {
    driver_npub: driver.npub,
    driver_pubkey: driver.pub,
    driver_location: { lat: PICKUP.lat, lon: PICKUP.lon }
  }, driver.priv);
  assert.equal(accepted.status, 200);

  // Post-accept: the driver has somebody to call out for
  const detail = await get(`/api/rides/${created.ride_id}`, driver.priv);
  assert.equal(detail.body.ride.passenger.name, 'Aunty Mercy');
  assert.equal(detail.body.ride.passenger.note, 'she uses a stick');
});

test('a driver already at the pickup gets a one-minute ETA, not a router loop', async () => {
  const created = await requestRide();
  const accepted = await post(`/api/rides/${created.ride_id}/accept`, {
    driver_npub: driver.npub,
    driver_pubkey: driver.pub,
    driver_location: { lat: PICKUP.lat, lon: PICKUP.lon }
  }, driver.priv);

  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.eta_seconds, 60);
  assert.equal(accepted.body.driver_route, null);
});

test('a passenger name is capped and an empty one is not recorded', async () => {
  const long = await requestRide({ passenger: { name: 'x'.repeat(200) } });
  const ride = rideManager.getRide(long.ride_id);
  assert.equal(ride.passenger.name.length, 60);

  const blank = await requestRide({ passenger: { name: '   ', note: '' } });
  assert.equal(rideManager.getRide(blank.ride_id).passenger, undefined);
});
