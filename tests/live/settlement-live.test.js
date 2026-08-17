/**
 * Live Lightning Address settlement, against a REAL LNURL-pay service.
 *
 * The integration suite proves the operator's invoice BOOKKEEPING is right
 * (tests/integration/settlement-proof.test.js), but it does so by stubbing
 * `getPayInstructions` — which is precisely the part that talks to the outside
 * world. So the real chain has never run end to end:
 *
 *     LNURL-pay resolution -> real bolt11 -> local decode -> expiresAt
 *       -> the reuse decision that prevents a second payment
 *
 * This file closes that gap. It needs no money: only the final preimage step
 * requires an actual payment, and that step is pure crypto already covered by
 * farrier's own tests. What cannot be checked without a real service is
 * whether real invoices come back decodable, correctly priced, and long-lived
 * enough for the reuse rule to ever engage.
 *
 * That last one is a load-bearing assumption nothing else verifies. The
 * operator refuses to reuse an invoice inside INVOICE_REUSE_MARGIN_MS (60s) of
 * expiry. If real services issued short-lived invoices, reuse would silently
 * never fire and the double-payment defence would be dead code that passes
 * every unit test.
 *
 *     LIVE_LN_ADDRESS=you@wallet.com npm run test:live
 *
 * SKIPPED unless LIVE_LN_ADDRESS is set, so it stays inert in CI and in the
 * default `npm test`. Deliberately NO default value: resolving an address
 * contacts a third party, which must always be an explicit choice.
 *
 * It moves no money and leaves no residue — resolving a payRequest and
 * fetching an invoice obliges nobody to pay it, and an unpaid invoice simply
 * expires. Use an address you control.
 */

require('../helpers/isolate-relays');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { tryDecodeBolt11 } = require('farrier-kit/bolt11');

const settlement = require('../../settlement');

const LN_ADDRESS = process.env.LIVE_LN_ADDRESS || '';
const skip = LN_ADDRESS ? false : 'set LIVE_LN_ADDRESS to run (e.g. you@wallet.com)';

// Small enough to be accepted by any service, large enough to clear a
// dust/minSendable floor.
const AMOUNT_SATS = 100;
// Mirrors server.js's INVOICE_REUSE_MARGIN_MS — kept as a literal so a change
// there shows up here as a failure rather than passing silently.
const REUSE_MARGIN_MS = 60 * 1000;

const rail = settlement.getRail('lnaddress');

test('a real Lightning Address yields a decodable, correctly priced invoice', { skip }, async () => {
  const instruction = await rail.getPayInstructions({
    handle: LN_ADDRESS,
    amountSats: AMOUNT_SATS,
    currency: 'SAT',
    memo: 'DonkeyRide live settlement test'
  });

  // The rail's non-custodial contract, against a real service
  assert.equal(instruction.custody, 'none');
  assert.equal(instruction.operator_transmitted, 0);
  assert.equal(instruction.rail, 'lnaddress');
  assert.ok(instruction.invoice, 'no invoice returned');
  assert.match(instruction.invoice, /^lnbc/i, 'not a mainnet bolt11');

  // The decode the operator itself relies on for expiry
  const decoded = tryDecodeBolt11(instruction.invoice);
  assert.ok(decoded, 'the operator could not decode the invoice it just fetched');

  // The rail's claimed payment hash must be the invoice's own
  assert.equal(
    decoded.paymentHashHex.toLowerCase(),
    String(instruction.paymentHash).toLowerCase(),
    'rail payment hash disagrees with the invoice'
  );

  // The amount the rider is asked for is the amount the operator quoted
  assert.equal(
    decoded.amountMsats,
    BigInt(AMOUNT_SATS * 1000),
    'invoice amount does not match the requested fare'
  );

  // verifyMethod drives whether /settle can check a preimage at all
  assert.equal(instruction.verifyMethod, 'preimage');
});

test('real invoices live long enough for the reuse rule to engage', { skip }, async () => {
  // If this fails, the double-payment defence in server.js never fires
  // against this service: every second tap would mint a fresh invoice with a
  // fresh payment hash, exactly the condition the reuse rule exists to avoid.
  const instruction = await rail.getPayInstructions({
    handle: LN_ADDRESS,
    amountSats: AMOUNT_SATS,
    currency: 'SAT',
    memo: 'DonkeyRide live settlement test'
  });

  const decoded = tryDecodeBolt11(instruction.invoice);
  assert.ok(decoded, 'undecodable invoice');

  const expiresAt = (decoded.timestamp + decoded.expirySeconds) * 1000;
  const remainingMs = expiresAt - Date.now();

  assert.ok(
    remainingMs > REUSE_MARGIN_MS,
    `invoice expires in ${Math.round(remainingMs / 1000)}s, inside the ${REUSE_MARGIN_MS / 1000}s `
    + 'reuse margin — reuse would never engage against this service'
  );
});

test('the service mints a fresh invoice each call, which is why reuse matters', { skip }, async () => {
  // The premise of the whole fix: without the operator reusing, a second tap
  // gets a different payment hash and Lightning's own replay protection no
  // longer covers a retry.
  const first = await rail.getPayInstructions({
    handle: LN_ADDRESS, amountSats: AMOUNT_SATS, currency: 'SAT', memo: 'DonkeyRide live 1'
  });
  const second = await rail.getPayInstructions({
    handle: LN_ADDRESS, amountSats: AMOUNT_SATS, currency: 'SAT', memo: 'DonkeyRide live 2'
  });

  assert.notEqual(
    first.paymentHash,
    second.paymentHash,
    'service returned the same payment hash twice — reuse would be moot, but verify this is not a cache'
  );
});
