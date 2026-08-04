/**
 * Web Push job alerts (VAPID, no Firebase).
 *
 * Boots the real app with the WS dispatcher and NIP-98 auth, injects a
 * fake push transport, and proves:
 *
 *   - the operator advertises a VAPID public key
 *   - a driver may only subscribe as themselves (403 otherwise)
 *   - a subscribed, DISCONNECTED driver gets a push for a ride in their
 *     working areas — and the payload carries no rider identity or
 *     exact coordinates
 *   - a driver with an open dispatch socket gets the WS frame, NOT a push
 *   - out-of-area subscribers get nothing
 *   - unsubscribe stops pushes; an expired subscription (410) self-heals
 */

process.env.DISABLE_REDIS = 'true';
process.env.PAYMENT_PROVIDER = 'demo';
process.env.ENABLE_NIP98_AUTH = 'true';
process.env.ENABLE_RATE_LIMITING = 'false';
process.env.DISPATCH_RADIUS_KM = '15';
const WS_PORT = 43000 + Math.floor(Math.random() * 2000);
process.env.WS_PORT = String(WS_PORT);
// No relay: boot rehydrates non-terminal tasks from Nostr snapshots, so a
// developer with a relay in their .env would start this test with their own
// live jobs already loaded. Durability is not what is under test here.
require('../helpers/isolate-relays');


const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const { generatePrivateKey, getPublicKey, nip19 } = require('nostr-tools');

const { app, startServer, getWss, pushService } = require('../../server.js');
const { generateAuthEvent, createAuthHeader } = require('../../middleware/nip98-auth');
const { encodeGeohash } = require('../../src/utils/geohash');

const riderPriv = generatePrivateKey();
const riderPub = getPublicKey(riderPriv);
const riderNpub = nip19.npubEncode(riderPub);

function makeDriver() {
  const priv = generatePrivateKey();
  const pub = getPublicKey(priv);
  return { priv, pub, npub: nip19.npubEncode(pub) };
}

// Manchester pickup; London is far outside the 15 km radius
const PICKUP = { lat: 53.4808, lon: -2.2426 };
const DROPOFF = { lat: 53.4774, lon: -2.2309 };
const LONDON = { lat: 51.5074, lon: -0.1278 };
const MANCHESTER_CELL = encodeGeohash(PICKUP.lat, PICKUP.lon, 5);

function fakeSubscription(label) {
  return {
    endpoint: `https://push.example.org/send/${label}`,
    keys: { p256dh: 'BPdh'.padEnd(20, 'x'), auth: 'auth'.padEnd(16, 'y') }
  };
}

// Captured sends: { endpoint, payload }
let sent = [];

let server;
let baseUrl;

before(async () => {
  await startServer({ listen: false });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  pushService.setTransport(async (subscription, payload) => {
    sent.push({ endpoint: subscription.endpoint, payload });
  });
});

after(() => {
  server.close();
  pushService.setTransport(null);
  const wss = getWss();
  if (wss) {
    wss.clients.forEach((client) => client.terminate());
    wss.close();
  }
});

beforeEach(() => {
  sent = [];
  pushService.reset();
});

async function post(path, body, privKey = null, method = 'POST') {
  const url = `${baseUrl}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (privKey) {
    headers.Authorization = createAuthHeader(generateAuthEvent(url, method, privKey));
  }
  const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function createRide() {
  return post('/api/rides/request', {
    pickup_lat: PICKUP.lat,
    pickup_lon: PICKUP.lon,
    dropoff_lat: DROPOFF.lat,
    dropoff_lon: DROPOFF.lon,
    rider_pubkey: riderPub,
    rider_npub: riderNpub
  }, riderPriv);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Tests ───────────────────────────────────────────

test('operator advertises a VAPID public key', async () => {
  const res = await fetch(`${baseUrl}/api/push/vapid-key`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.ok(typeof body.key === 'string' && body.key.length > 20, 'VAPID key present');
});

test('a driver may only subscribe as themselves', async () => {
  const driver = makeDriver();
  const stranger = makeDriver();
  const res = await post('/api/push/subscribe', {
    pubkey: driver.pub,
    subscription: fakeSubscription('forged')
  }, stranger.priv);
  assert.equal(res.status, 403);
});

test('subscribed offline driver in-area gets a PII-free push; out-of-area does not', async () => {
  const inArea = makeDriver();
  const outOfArea = makeDriver();

  const subA = await post('/api/push/subscribe', {
    pubkey: inArea.pub,
    subscription: fakeSubscription('in-area'),
    areas: [MANCHESTER_CELL]
  }, inArea.priv);
  assert.equal(subA.status, 200, JSON.stringify(subA.body));

  const subB = await post('/api/push/subscribe', {
    pubkey: outOfArea.pub,
    subscription: fakeSubscription('out-of-area'),
    location: LONDON
  }, outOfArea.priv);
  assert.equal(subB.status, 200, JSON.stringify(subB.body));

  const created = await createRide();
  assert.equal(created.status, 200, JSON.stringify(created.body));
  await sleep(100); // sends are fire-and-forget

  const endpoints = sent.map((s) => s.endpoint);
  assert.ok(endpoints.some((e) => e.includes('in-area')), 'in-area driver pushed');
  assert.ok(!endpoints.some((e) => e.includes('out-of-area')), 'out-of-area driver not pushed');

  // The payload must carry no rider identity and no coordinates
  const payload = sent.find((s) => s.endpoint.includes('in-area')).payload;
  assert.ok(!payload.includes(riderPub), 'no rider pubkey in push payload');
  assert.ok(!payload.includes(riderNpub), 'no rider npub in push payload');
  assert.ok(!payload.includes(String(PICKUP.lat)), 'no exact coordinates in push payload');
  const parsed = JSON.parse(payload);
  assert.ok(parsed.title, 'payload has a title');
  assert.equal(parsed.url, '/provide');
});

test('a driver with an open dispatch socket gets WS, not push', async () => {
  const driver = makeDriver();
  await post('/api/push/subscribe', {
    pubkey: driver.pub,
    subscription: fakeSubscription('connected'),
    areas: [MANCHESTER_CELL]
  }, driver.priv);

  // Connect and register over WS (auth handshake first)
  const wsUrl = `ws://127.0.0.1:${WS_PORT}`;
  const ws = new WebSocket(wsUrl);
  const frames = [];
  ws.on('message', (raw) => {
    try { frames.push(JSON.parse(raw.toString())); } catch { /* ignore */ }
  });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  ws.send(JSON.stringify({ type: 'auth', event: generateAuthEvent(wsUrl, 'GET', driver.priv) }));
  const deadline = Date.now() + 3000;
  while (!frames.some((f) => f.type === 'auth_ok') && Date.now() < deadline) {
    await sleep(25);
  }
  ws.send(JSON.stringify({
    type: 'register_driver',
    pubkey: driver.pub,
    npub: driver.npub,
    location: { lat: PICKUP.lat, lon: PICKUP.lon },
    areas: [MANCHESTER_CELL]
  }));
  await sleep(150);

  sent = [];
  await createRide();
  await sleep(100);

  assert.ok(
    frames.some((f) => f.type === 'ride_request'),
    'connected driver received the WS broadcast'
  );
  assert.ok(
    !sent.some((s) => s.endpoint.includes('connected')),
    'connected driver must not also be pushed'
  );
  ws.close();
});

test('unsubscribe stops pushes', async () => {
  const driver = makeDriver();
  await post('/api/push/subscribe', {
    pubkey: driver.pub,
    subscription: fakeSubscription('leaver'),
    areas: [MANCHESTER_CELL]
  }, driver.priv);

  const del = await post('/api/push/subscribe', { pubkey: driver.pub }, driver.priv, 'DELETE');
  assert.equal(del.status, 200, JSON.stringify(del.body));

  await createRide();
  await sleep(100);
  assert.equal(sent.filter((s) => s.endpoint.includes('leaver')).length, 0);
});

test('an expired subscription (410) is dropped', async () => {
  const driver = makeDriver();
  pushService.subscribe(driver.pub, fakeSubscription('expired'), { areas: [MANCHESTER_CELL] });
  pushService.setTransport(async () => {
    const error = new Error('Gone');
    error.statusCode = 410;
    throw error;
  });

  await pushService.sendTo(driver.pub, { title: 'test' });
  assert.equal(pushService.listSubscriptions().length, 0, 'expired subscription removed');

  // Restore the capture transport for any following tests
  pushService.setTransport(async (subscription, payload) => {
    sent.push({ endpoint: subscription.endpoint, payload });
  });
});
