/**
 * Kind 30535 Payment Receipt — the operator's record that a
 * non-custodial settlement completed.
 *
 * Publishing one is OFF by default: a public receipt is a permanent
 * statement that one pubkey paid another a named sum at a named time, and
 * nothing in this implementation reads it back. When an operator does opt
 * in, the spec shape must hold (amount, currency, trust_model,
 * operator_transmitted 0, addressable d tag) and it must carry NO `p`
 * tags — those turn a relay into a per-person financial index.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generatePrivateKey, verifySignature } = require('nostr-tools');
const stakeEvents = require('../../src/nostr/stake-events');
const { KINDS } = require('../../src/nostr/kinds');

function configureCapture() {
  const published = [];
  stakeEvents.configure({
    operatorPrivkey: generatePrivateKey(),
    publishGeneric: async (event) => published.push(event),
    domain: 'ridesharing'
  });
  return published;
}

const RECEIPT_ARGS = {
  rideId: 'ride_r1',
  amount: 8000,
  paymentRail: 'lnaddress',
  status: 'confirmed',
  verified: true
};

test('no payment receipt reaches a relay by default', async () => {
  delete process.env.PUBLISH_PAYMENT_RECEIPTS;
  const published = configureCapture();

  const event = await stakeEvents.publishPaymentReceipt(RECEIPT_ARGS);

  assert.equal(event, null, 'nothing is built');
  assert.equal(published.length, 0, 'nothing is published');
});

test('an opted-in receipt is signed, spec-shaped and names nobody', async () => {
  process.env.PUBLISH_PAYMENT_RECEIPTS = 'true';
  const published = configureCapture();

  try {
    const event = await stakeEvents.publishPaymentReceipt(RECEIPT_ARGS);

    assert.equal(event.kind, KINDS.PAYMENT_RECEIPT);
    assert.ok(verifySignature(event), 'receipt must be operator-signed');
    assert.equal(published.length, 1);

    const tag = (k) => event.tags.find((t) => t[0] === k)?.[1];
    assert.equal(tag('d'), 'ride_r1:receipt');
    assert.equal(tag('task_id'), 'ride_r1');
    assert.equal(tag('amount'), '8000');
    assert.equal(tag('currency'), 'SAT');
    assert.equal(tag('trust_model'), 'peer_to_peer');
    assert.equal(tag('operator_transmitted'), '0');
    assert.equal(tag('payment_rail'), 'lnaddress');
    assert.equal(tag('status'), 'confirmed');
    assert.equal(tag('verified'), 'true');

    // Verifiable to whoever holds the task id — the people it concerns —
    // and not indexed against either party.
    assert.equal(
      event.tags.filter((t) => t[0] === 'p').length, 0,
      'a receipt must never be queryable per person'
    );
  } finally {
    delete process.env.PUBLISH_PAYMENT_RECEIPTS;
  }
});
