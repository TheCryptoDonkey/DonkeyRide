/**
 * Cash payment rail tests.
 *
 * Runs the full ride lifecycle with PAYMENT_PROVIDER=cash and asserts the
 * completion payment record is an honest record-only settlement (explicit
 * method, amount, currency and trust model — no fake payment hashes), plus
 * unit coverage of the CashProvider stake semantics and the factory's
 * rejection of planned-but-unimplemented rails.
 */

process.env.DISABLE_REDIS = 'true';
process.env.DISABLE_WS = 'true';
process.env.PAYMENT_PROVIDER = 'cash';
process.env.ENABLE_NIP98_AUTH = 'false';
// Pinned for the same reason as auth: the lifecycle below fires requests
// back to back, and an inherited ENABLE_RATE_LIMITING=true would throttle
// them into failures that look like payment bugs.
process.env.ENABLE_RATE_LIMITING = 'false';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { app, startServer } = require('../../server.js');
const { PaymentProviderFactory } = require('../../payment-providers/factory');
const CashProvider = require('../../payment-providers/cash');

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

async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

test('completion settles as a declared cash record, not a fake hash', async () => {
  const created = await post('/api/rides/request', {
    pickup_lat: 53.4808,
    pickup_lon: -2.2426,
    dropoff_lat: 53.4774,
    dropoff_lon: -2.2309,
    rider_pubkey: 'a'.repeat(64)
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const rideId = created.body.ride_id;

  const accepted = await post(`/api/rides/${rideId}/accept`, {
    driver_npub: 'npub_test_cash_driver',
    driver_pubkey: 'b'.repeat(64),
    driver_location: { lat: 53.49, lon: -2.25 }
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));

  await post(`/api/rides/${rideId}/arrive`, {});
  await post(`/api/rides/${rideId}/start`, {});
  const completed = await post(`/api/rides/${rideId}/complete`, {});

  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  const payment = completed.body.payment;
  assert.equal(payment.method, 'cash');
  assert.equal(payment.status, 'declared');
  assert.equal(payment.trust_model, 'social');
  // ride.fare is sats, so the record must SAY sats. It used to report the
  // sats figure under the ride's fiat currency — "8914 GBP" for what was
  // 8,914 sats, contradicting the rule that an amount is the smallest unit
  // of the currency printed beside it.
  assert.equal(payment.currency, 'SAT');
  assert.ok(payment.amount > 0);
  // The humans settled in pounds, so the fiat figure rides alongside —
  // derived on demand, and omitted rather than invented if no price is known
  if (payment.fiat) {
    assert.equal(payment.fiat.currency, 'GBP');
    assert.ok(payment.fiat.amount > 0);
    assert.ok(
      payment.fiat.amount < payment.amount,
      'a fiat fare must not be reported as the sats figure'
    );
  }
  assert.equal(payment.payment_hash, undefined, 'cash settlement must not fabricate a payment hash');
  assert.equal(payment.record.method, 'cash');
});

test('CashProvider stake lifecycle is record-only', async () => {
  const provider = new CashProvider();

  const lock = await provider.lockStake('ride_test', 'c'.repeat(64), 500, 'rider');
  assert.equal(lock.success, true);
  assert.match(lock.proof.note, /no funds held/);
  assert.equal(lock.event.kind, 30532);

  const status = await provider.getStakeStatus('ride_test_rider');
  assert.equal(status.status, 'committed');
  assert.equal(status.providerData.custody, 'none');

  const release = await provider.releaseStake('ride_test_rider');
  assert.equal(release.success, true);

  const lock2 = await provider.lockStake('ride_test2', 'c'.repeat(64), 500, 'driver');
  assert.equal(lock2.success, true);
  const forfeit = await provider.forfeitStake('ride_test2_driver', 'c'.repeat(64), 'no-show');
  assert.equal(forfeit.success, true);
  assert.equal(forfeit.settled, 'on_record_only');
  assert.equal(forfeit.refund, 0);
});

test('factory rejects planned-but-unimplemented rails with a clear error', () => {
  for (const type of ['strike', 'nip47', 'nwc', 'stripe']) {
    assert.throws(
      () => PaymentProviderFactory.create(type),
      /planned but not yet implemented/,
      `expected clear rejection for '${type}'`
    );
  }
});

test('factory creates the cash provider', async () => {
  const provider = PaymentProviderFactory.create('cash');
  assert.equal(provider.providerName, 'cash');
  assert.equal(await provider.healthCheck(), true);
  assert.equal(provider.getCapabilities().features.custody, 'none');
});
