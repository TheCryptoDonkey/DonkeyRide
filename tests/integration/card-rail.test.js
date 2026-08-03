/**
 * Card, paid on the DRIVER'S terminal.
 *
 * Most riders want to pay by card, and a card payment is an acquirer model —
 * somebody has to be the merchant of record. These tests pin that it is never
 * this operator:
 *
 *   - the rail reports custody 'none' and transmits nothing
 *   - the rider is told, in words, that the money goes to the driver
 *   - a card number is REFUSED rather than recorded (a PAN must never reach a
 *     coordination service; accepting one would drag it into PCI scope)
 *   - the amount is the fiat figure a rider approves on a terminal
 *   - the driver's optional reader name is public-safe, not PII
 */

process.env.DISABLE_REDIS = 'true';
process.env.PAYMENT_PROVIDER = 'cash';
// Pinned rather than inherited from a developer's .env — see credentials.test.js
process.env.ENABLE_NIP98_AUTH = 'false';
process.env.ENABLE_RATE_LIMITING = 'false';
process.env.DISABLE_WS = 'true';
// No relay: boot would otherwise rehydrate a developer's live jobs
process.env.NOSTR_RELAY = '';
process.env.PUBLIC_RELAY_URLS = '';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { app, startServer } = require('../../server.js');
const CardRail = require('../../settlement/card');
const settlement = require('../../settlement');

const rail = new CardRail();

let server;
let baseUrl;

before(async () => {
  await startServer({ listen: false });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  if (server) server.close();
});

async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/** Drive a ride to completion with the card rail declared */
async function completedCardRide() {
  const created = await post('/api/rides/request', {
    pickup_lat: 53.4808,
    pickup_lon: -2.2426,
    dropoff_lat: 53.4774,
    dropoff_lon: -2.2309,
    rider_pubkey: 'c'.repeat(64)
  });
  const rideId = created.body.ride_id;
  await post(`/api/rides/${rideId}/accept`, {
    driver_npub: 'npub_test_card_driver',
    driver_pubkey: 'd'.repeat(64),
    driver_location: { lat: 53.49, lon: -2.25 }
  });
  await post(`/api/rides/${rideId}/payment-methods`, {
    methods: [{ rail: 'card', handle: 'SumUp' }]
  });
  await post(`/api/rides/${rideId}/arrive`, {});
  await post(`/api/rides/${rideId}/start`, {});
  await post(`/api/rides/${rideId}/complete`, {});
  return rideId;
}

test('the operator is never the merchant: custody none, nothing transmitted', async () => {
  assert.equal(rail.custody(), 'none');
  const instruction = await rail.getPayInstructions({
    amountSats: 8929, amount: 4.24, currency: 'GBP'
  });
  assert.equal(instruction.custody, 'none');
  assert.equal(instruction.operator_transmitted, 0);
});

test('the rider is told where the money actually goes', async () => {
  const instruction = await rail.getPayInstructions({
    amountSats: 8929, amount: 4.24, currency: 'GBP'
  });
  // Someone handing over a card deserves to know who is taking it
  assert.match(instruction.note, /directly to your driver/i);
  assert.match(instruction.note, /never sees your card/i);
});

test('prices in the fiat a rider approves on a terminal', async () => {
  const instruction = await rail.getPayInstructions({
    amountSats: 8929, amount: 4.2449, currency: 'GBP'
  });
  assert.equal(instruction.amount, 4.24);
  assert.equal(instruction.currency, 'GBP');
  assert.match(instruction.instructions, /4\.24 GBP/);
});

test('names the reader when the driver declared one', async () => {
  const withReader = await rail.getPayInstructions({
    handle: 'SumUp', amountSats: 8929, amount: 4.24, currency: 'GBP'
  });
  assert.equal(withReader.terminal, 'SumUp');
  assert.match(withReader.instructions, /SumUp/);

  const without = await rail.getPayInstructions({
    amountSats: 8929, amount: 4.24, currency: 'GBP'
  });
  assert.equal(without.terminal, null);
  assert.match(without.instructions, /own card reader/i);
});

test('a card number is REFUSED, never recorded', async () => {
  // 4242… is Stripe's test Visa and passes Luhn
  await assert.rejects(
    () => rail.verify({ proof: { confirmationCode: '4242424242424242' } }),
    /never send card details/i
  );
  // Spaced and hyphenated forms are the same number
  await assert.rejects(
    () => rail.verify({ proof: { confirmationCode: '4242 4242 4242 4242' } }),
    /never send card details/i
  );
  await assert.rejects(
    () => rail.verify({ proof: { confirmationCode: '4242-4242-4242-4242' } }),
    /never send card details/i
  );
});

test('a reader name cannot smuggle a card number either', () => {
  assert.equal(CardRail.isTerminalName('SumUp'), true);
  assert.equal(CardRail.isTerminalName('Tap to Pay'), true);
  assert.equal(CardRail.isTerminalName(''), true);       // optional
  assert.equal(CardRail.isTerminalName(null), true);     // optional
  assert.equal(CardRail.isTerminalName('4242424242424242'), false);
  assert.equal(CardRail.isTerminalName('x'.repeat(64)), false);
});

test('an ordinary receipt reference is recorded for a dispute', async () => {
  const result = await rail.verify({ proof: { confirmationCode: 'a7f3-9921' } });
  assert.equal(result.recorded, true);
  assert.equal(result.confirmationCode, 'A7F3-9921');
  // The operator cannot verify another party's acquirer and must not pretend to
  assert.equal(result.verified, false);
});

test('no reference means the driver confirms receipt, as with cash', async () => {
  const result = await rail.verify({ proof: {} });
  assert.equal(result.verified, false);
  assert.equal(result.recorded, undefined);
  assert.match(result.detail, /driver on receipt/i);
});

test('a long non-card digit string is not mistaken for a PAN', () => {
  // 1234567890123 fails Luhn — an ordinary reference must still be accepted
  assert.equal(CardRail.looksLikeCardNumber('1234567890123'), false);
  assert.equal(CardRail.looksLikeCardNumber('4242424242424242'), true);
  assert.equal(CardRail.looksLikeCardNumber('SUMUP123'), false);
});

test('registered in the rail registry, under both names', () => {
  assert.equal(settlement.isKnownRail('card'), true);
  assert.equal(settlement.isKnownRail('tap-to-pay'), true);
  assert.equal(settlement.getRail('card').id, 'card');
  assert.equal(settlement.getRail('tap-to-pay').id, 'card');
});

test('offered to drivers, and public-safe (a shop sign, not PII)', () => {
  const listed = settlement.listRails().find((r) => r.id === 'card');
  assert.ok(listed, 'card should be offered in the rail catalogue');
  assert.equal(listed.custody, 'none');
  assert.match(listed.settles, /driver's own merchant account/i);

  // Unlike an M-Pesa number, "I take cards" reveals nothing about a person
  assert.equal(settlement.isPublicSafe('card'), true);
  assert.equal(settlement.isPublicSafe('mpesa'), false);
});

test('the registry validates the optional reader name', () => {
  assert.equal(settlement.validateHandle('card', 'Zettle'), true);
  assert.equal(settlement.validateHandle('card', ''), true);
  assert.equal(settlement.validateHandle('card', '4242424242424242'), false);
});

test('over HTTP: a card number is refused, and the payer is TOLD why', async () => {
  const rideId = await completedCardRide();

  const refused = await post(`/api/rides/${rideId}/settle`, {
    rail: 'card',
    proof: { confirmationCode: '4242424242424242' }
  });

  // The payer's mistake, not a server fault — and a generic 500 would teach
  // them nothing, on the one path where they must learn not to do it again
  assert.equal(refused.status, 400, JSON.stringify(refused.body));
  assert.match(refused.body.details, /never send card details/i);

  // Nothing was recorded: the ride is still unsettled
  const options = await fetch(`${baseUrl}/api/rides/${rideId}/payment-options`)
    .then((r) => r.json())
    .catch(() => ({}));
  assert.notEqual(options?.settlement?.status, 'declared');
});

test('over HTTP: an ordinary receipt reference settles as declared', async () => {
  const rideId = await completedCardRide();

  const settled = await post(`/api/rides/${rideId}/settle`, {
    rail: 'card',
    proof: { confirmationCode: 'A7F3-9921' }
  });

  assert.equal(settled.status, 200, JSON.stringify(settled.body));
  assert.equal(settled.body.settlement.rail, 'card');
  // The operator cannot verify someone else's acquirer, and says so
  assert.equal(settled.body.settlement.status, 'declared');
  assert.equal(settled.body.settlement.custody, 'none');
  assert.equal(settled.body.settlement.operator_transmitted, 0);
});

test('every rail in the catalogue is still non-custodial', () => {
  // The invariant the whole directory exists to hold
  for (const entry of settlement.listRails()) {
    assert.equal(entry.custody, 'none', `${entry.id} must be non-custodial`);
    assert.equal(settlement.getRail(entry.id).custody(), 'none');
  }
});
