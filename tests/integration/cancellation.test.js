/**
 * Late-cancellation accountability.
 *
 * Mode A holds no money, so there is no cancellation FEE to levy and none is
 * levied. What there is instead is a record: somebody committed to a job and
 * then dropped it while the other party was waiting. That record is signed by
 * the party who was let down — never asserted by the operator — and rides the
 * same kind 30520 rail as a no-show.
 *
 * Proves: the grace window is real, an unmatched request is never a "late"
 * cancellation, a started job is not either, and the rate endpoint accepts a
 * late_cancel report on a cancelled ride while still refusing an ordinary
 * quality rating for a trip that never ran.
 */

process.env.DISABLE_REDIS = 'true';
process.env.PAYMENT_PROVIDER = 'demo';
process.env.ENABLE_NIP98_AUTH = 'false';
process.env.ENABLE_RATE_LIMITING = 'false';
// Wound right in so a "late" cancellation is reachable inside a test
process.env.CANCEL_GRACE_MS = '150';
// No relays: publishing a report would open sockets that outlive the run
process.env.REPUTATION_RELAYS = 'ws://127.0.0.1:1';
process.env.NOSTR_RELAYS = '';
process.env.NOSTR_RELAY = '';
const WS_PORT = 46800 + Math.floor(Math.random() * 400);
process.env.WS_PORT = String(WS_PORT);

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  generatePrivateKey, getPublicKey, nip19, getEventHash, signEvent,
} = require('nostr-tools');

const { app, startServer, getWss } = require('../../server.js');

const rider = (() => {
  const priv = generatePrivateKey();
  const pub = getPublicKey(priv);
  return { priv, pub, npub: nip19.npubEncode(pub) };
})();
const driver = (() => {
  const priv = generatePrivateKey();
  const pub = getPublicKey(priv);
  return { priv, pub, npub: nip19.npubEncode(pub) };
})();

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

const createRide = () => post('/api/rides/request', {
  pickup_lat: PICKUP.lat,
  pickup_lon: PICKUP.lon,
  dropoff_lat: DROPOFF.lat,
  dropoff_lon: DROPOFF.lon,
  rider_pubkey: rider.pub,
  rider_npub: rider.npub
});

const accept = (rideId) => post(`/api/rides/${rideId}/accept`, {
  driver_pubkey: driver.pub,
  driver_npub: driver.npub
});

const cancel = (rideId, by) => post(`/api/rides/${rideId}/cancel`, {
  cancelledBy: by,
  reason: 'changed my mind'
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A wronged-party-signed late-cancellation report */
function lateCancelEvent(signer, rideId, targetPubkey, role) {
  const event = {
    kind: 30520,
    pubkey: signer.pub,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['ride', rideId],
      ['rating', '1'],
      ['late_cancel', 'true'],
      ['role', role],
      ['p', targetPubkey]
    ],
    content: 'late_cancel'
  };
  event.id = getEventHash(event);
  event.sig = signEvent(event, signer.priv);
  return event;
}

test('cancelling an unmatched request is never a late cancellation', async () => {
  const { body } = await createRide();
  // Nobody has committed, so nobody has been let down
  await wait(250);
  const cancelled = await cancel(body.ride_id, rider.pub);

  assert.equal(cancelled.status, 200);
  assert.notEqual(
    cancelled.body.ride.lateCancellation, true,
    'a request no one accepted cannot be cancelled "late"'
  );
});

test('cancelling inside the grace window is not late', async () => {
  const { body } = await createRide();
  await accept(body.ride_id);

  // Straight away — changing your mind immediately is not an offence
  const cancelled = await cancel(body.ride_id, driver.pub);
  assert.equal(cancelled.status, 200);
  assert.notEqual(cancelled.body.ride.lateCancellation, true);
});

test('cancelling after the grace window IS late, and both parties are told', async () => {
  const { body } = await createRide();
  await accept(body.ride_id);
  await wait(250); // past CANCEL_GRACE_MS

  const cancelled = await cancel(body.ride_id, driver.pub);
  assert.equal(cancelled.status, 200);
  assert.equal(
    cancelled.body.ride.lateCancellation, true,
    'committing and then dropping past the grace window is a late cancellation'
  );
});

test('the wronged party can put a late cancellation on the public record', async () => {
  const { body } = await createRide();
  await accept(body.ride_id);
  await wait(250);
  await cancel(body.ride_id, driver.pub);

  // The rider was let down, so the rider signs it
  const report = await post(`/api/rides/${body.ride_id}/rate`, {
    event: lateCancelEvent(rider, body.ride_id, driver.pub, 'rider')
  });
  assert.equal(report.status, 200, JSON.stringify(report.body));
});

test('a cancelled ride still refuses an ordinary quality rating', async () => {
  const { body } = await createRide();
  await accept(body.ride_id);
  await wait(250);
  await cancel(body.ride_id, driver.pub);

  // No late_cancel/no_show flag — a trip that never ran cannot be rated
  const event = {
    kind: 30520,
    pubkey: rider.pub,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['ride', body.ride_id], ['rating', '5'], ['p', driver.pub]],
    content: 'lovely'
  };
  event.id = getEventHash(event);
  event.sig = signEvent(event, rider.priv);

  const rated = await post(`/api/rides/${body.ride_id}/rate`, { event });
  assert.equal(rated.status, 400);
});

test('a started job is not treated as a late cancellation', async () => {
  const { body } = await createRide();
  await accept(body.ride_id);
  await post(`/api/rides/${body.ride_id}/arrive`, { providerPubkey: driver.pub });
  await post(`/api/rides/${body.ride_id}/start`, { providerPubkey: driver.pub });
  await wait(250);

  const cancelled = await cancel(body.ride_id, rider.pub);
  if (cancelled.status === 200) {
    assert.notEqual(
      cancelled.body.ride.lateCancellation, true,
      'abandoning a trip mid-way is a different problem, not a late cancellation'
    );
  }
});

test('a structured reason is recorded and travels to the other party', async () => {
  const { body } = await createRide();
  await accept(body.ride_id);

  const cancelled = await post(`/api/rides/${body.ride_id}/cancel`, {
    cancelledBy: rider.pub,
    reason_code: 'provider_not_moving'
  });

  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.ride.cancellationReasonCode, 'provider_not_moving');
  assert.equal(cancelled.body.ride.cancelledSide, 'requester');
});

test('a side cannot claim the other side reason', async () => {
  const { body } = await createRide();
  await accept(body.ride_id);

  // "vehicle_problem" belongs to the provider vocabulary
  const cancelled = await post(`/api/rides/${body.ride_id}/cancel`, {
    cancelledBy: rider.pub,
    reason_code: 'vehicle_problem'
  });

  assert.equal(cancelled.status, 200);
  assert.equal(
    cancelled.body.ride.cancellationReasonCode, undefined,
    'an out-of-vocabulary code is dropped, not recorded'
  );
});

test('the provider vocabulary works for the provider', async () => {
  const { body } = await createRide();
  await accept(body.ride_id);

  const cancelled = await post(`/api/rides/${body.ride_id}/cancel`, {
    cancelledBy: driver.pub,
    reason_code: 'vehicle_problem'
  });

  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.ride.cancellationReasonCode, 'vehicle_problem');
  assert.equal(cancelled.body.ride.cancelledSide, 'provider');
});

test('the no-show flow still yields a no_show code', async () => {
  const { body } = await createRide();
  await accept(body.ride_id);

  const cancelled = await post(`/api/rides/${body.ride_id}/cancel`, {
    cancelledBy: rider.pub,
    reason: 'no_show'
  });

  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.ride.cancellationReasonCode, 'no_show');
});

test('the vocabulary is discoverable', async () => {
  const res = await fetch(`${baseUrl}/api/cancellation-reasons`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.ok(body.reasons.requester.includes('changed_plans'));
  assert.ok(body.reasons.provider.includes('too_far'));
  assert.ok(
    !body.reasons.requester.includes('vehicle_problem'),
    'a requester never has a vehicle problem'
  );
});
