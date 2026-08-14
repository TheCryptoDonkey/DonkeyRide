/**
 * Non-custodial multi-rail settlement. Verifies every rail reports custody
 * 'none', the Lightning/Tando rail preimage check is correct, Tando handle
 * normalisation, and the M-Pesa record-only behaviour.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const settlement = require('../../settlement');

test('all rails are non-custodial', () => {
  for (const rail of settlement.listRails()) {
    assert.equal(settlement.getRail(rail.id).custody(), 'none', `${rail.id} must be non-custodial`);
  }
});

test('Tando normalises a bare Kenyan number to a bitcoin.co.ke Lightning Address', () => {
  assert.equal(settlement.normaliseHandle('tando', '0712345678'), '254712345678@bitcoin.co.ke');
  assert.equal(settlement.normaliseHandle('tando', '254712345678'), '254712345678@bitcoin.co.ke');
  assert.equal(settlement.normaliseHandle('tando', '+254712345678'), '254712345678@bitcoin.co.ke');
  // A full lightning address is left as-is
  assert.equal(settlement.normaliseHandle('tando', 'me@wallet.com'), 'me@wallet.com');
});

test('handle validation rejects junk', () => {
  assert.equal(settlement.validateHandle('lnaddress', 'alice@wallet.com'), true);
  assert.equal(settlement.validateHandle('lnaddress', 'not-an-address'), false);
  assert.equal(settlement.validateHandle('mpesa', '254712345678'), true);
  assert.equal(settlement.validateHandle('mpesa', '12345'), false);
  assert.equal(settlement.validateHandle('cash', ''), true);
});

test('M-Pesa number is PII (not public-safe); Lightning handles are public-safe', () => {
  assert.equal(settlement.isPublicSafe('mpesa'), false);
  assert.equal(settlement.isPublicSafe('lnaddress'), true);
  assert.equal(settlement.isPublicSafe('tando'), true);
  assert.equal(settlement.isPublicSafe('cash'), true);
});

test('Lightning rail verifies a correct preimage and rejects a wrong one', async () => {
  const rail = settlement.getRail('lnaddress');
  const preimage = crypto.randomBytes(32).toString('hex');
  const paymentHash = crypto.createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex');

  const ok = await rail.verify({ instruction: { paymentHash }, proof: { preimage } });
  assert.equal(ok.verified, true);

  const wrong = await rail.verify({ instruction: { paymentHash }, proof: { preimage: crypto.randomBytes(32).toString('hex') } });
  assert.equal(wrong.verified, false);
  assert.equal(wrong.failed, true, 'a supplied preimage that contradicts the invoice is a failed proof');

  const none = await rail.verify({ instruction: { paymentHash }, proof: {} });
  assert.equal(none.verified, false);
  assert.notEqual(none.failed, true, 'no preimage yet is "declared, awaiting", not a failed proof');
});

test('M-Pesa records a confirmation code as attestation, not cryptographic proof', async () => {
  const rail = settlement.getRail('mpesa');
  const res = await rail.verify({ proof: { confirmationCode: 'QAB1CDEF23' } });
  assert.equal(res.verified, false, 'a self-reported code is not cryptographic proof');
  assert.equal(res.recorded, true);
  assert.equal(res.confirmationCode, 'QAB1CDEF23');
});

test('M-Pesa pay instructions never route through the operator', async () => {
  const rail = settlement.getRail('mpesa');
  const inst = await rail.getPayInstructions({ handle: '254712345678', amount: 500, currency: 'KES' });
  assert.equal(inst.custody, 'none');
  assert.equal(inst.operator_transmitted, 0);
  assert.equal(inst.mpesaNumber, '254712345678');
});

test('M-Pesa shows the fiat amount (not the sats count) and rounds it sensibly', async () => {
  const rail = settlement.getRail('mpesa');
  // KES is transacted in whole shillings
  const kes = await rail.getPayInstructions({ handle: '254712345678', amountSats: 999999, amount: 532.7, currency: 'KES' });
  assert.equal(kes.amount, 533, 'KES rounds to whole shillings');
  assert.equal(kes.currency, 'KES');
  assert.match(kes.instructions, /533 KES/);
  // Other currencies keep two decimals
  const gbp = await rail.getPayInstructions({ handle: '254712345678', amountSats: 999999, amount: 15.319, currency: 'GBP' });
  assert.equal(gbp.amount, 15.32, 'non-KES keeps two decimals');
  assert.equal(gbp.currency, 'GBP');
});

test('M-Pesa distinguishes a malformed code (failed) from no code yet (declared)', async () => {
  const rail = settlement.getRail('mpesa');
  const bad = await rail.verify({ proof: { confirmationCode: 'xyz' } });
  assert.equal(bad.verified, false);
  assert.equal(bad.failed, true, 'a code was typed but is malformed = failed proof');

  const empty = await rail.verify({ proof: {} });
  assert.equal(empty.verified, false);
  assert.notEqual(empty.failed, true, 'no code yet = awaiting, not failed');
});

test('Cash shows the fiat amount rounded for human display', async () => {
  const rail = settlement.getRail('cash');
  const inst = await rail.getPayInstructions({ amountSats: 999999, amount: 15.319, currency: 'GBP' });
  assert.equal(inst.amount, 15.32);
  assert.equal(inst.currency, 'GBP');
  assert.equal(inst.custody, 'none');
});

test('Tando is presented as an M-Pesa number the driver enters directly', () => {
  const tando = settlement.listRails().find((r) => r.id === 'tando');
  assert.ok(tando, 'tando rail is catalogued');
  assert.equal(tando.handleLabel, 'M-Pesa number');
  assert.match(tando.handleHint, /2547/);
});

test('Cashu is record-only: the handle is optional, a creq validates, junk does not', () => {
  assert.equal(settlement.validateHandle('cashu', ''), true, 'blank = any Cashu token');
  assert.equal(settlement.validateHandle('cashu', 'creqAeyJtIjoiaHR0cHMifQ=='), true);
  assert.equal(settlement.validateHandle('cashu', 'not-a-payment-request'), false);
  assert.equal(settlement.isPublicSafe('cashu'), true, 'a payment request is a payment endpoint');
});

test('Cashu instructions route the token through the chat, never the operator', async () => {
  const rail = settlement.getRail('cashu');
  const inst = await rail.getPayInstructions({ handle: '', amountSats: 8000 });
  assert.equal(inst.custody, 'none');
  assert.equal(inst.operator_transmitted, 0);
  assert.equal(inst.currency, 'SAT');
  assert.match(inst.instructions, /chat/i);
  assert.equal(inst.paymentRequest, undefined);

  const withReq = await rail.getPayInstructions({ handle: 'creqAeyJtIjoiaHR0cHMifQ==', amountSats: 8000 });
  assert.equal(withReq.paymentRequest, 'creqAeyJtIjoiaHR0cHMifQ==');
});

test('Cashu REFUSES a token pasted to the operator (custody hazard)', async () => {
  const rail = settlement.getRail('cashu');
  const pasted = await rail.verify({ proof: { token: `cashu${'A'.repeat(18)}` } });
  assert.equal(pasted.failed, true, 'a pasted token must be refused, not recorded');
  assert.match(pasted.detail, /never send the Cashu token to the operator/);

  const declared = await rail.verify({ proof: {} });
  assert.equal(declared.verified, false);
  assert.equal(declared.failed ?? false, false, 'no proof = declared, awaiting driver confirmation');
});
