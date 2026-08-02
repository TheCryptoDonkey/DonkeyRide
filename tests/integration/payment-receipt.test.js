/**
 * Kind 30535 Payment Receipt — the operator's record that a
 * non-custodial settlement completed. Spec constraints: amount,
 * currency and trust_model tags present; operator_transmitted 0
 * (the operator never moved the money); addressable d tag.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generatePrivateKey, verifySignature } = require('nostr-tools');
const stakeEvents = require('../../src/nostr/stake-events');
const { KINDS } = require('../../src/nostr/kinds');

test('publishPaymentReceipt emits a signed, spec-shaped kind 30535', async () => {
  const published = [];
  stakeEvents.configure({
    operatorPrivkey: generatePrivateKey(),
    publishGeneric: async (event) => published.push(event),
    domain: 'ridesharing'
  });

  const event = await stakeEvents.publishPaymentReceipt({
    rideId: 'ride_r1',
    amount: 8000,
    paymentRail: 'lnaddress',
    status: 'confirmed',
    verified: true,
    requesterPubkey: 'A'.repeat(64),
    providerPubkey: 'b'.repeat(64)
  });

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

  const parties = event.tags.filter((t) => t[0] === 'p').map((t) => t[1]);
  assert.ok(parties.includes('a'.repeat(64)), 'p tags are lowercased hex');
  assert.ok(parties.includes('b'.repeat(64)));
});
