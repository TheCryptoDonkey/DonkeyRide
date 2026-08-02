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

  const none = await rail.verify({ instruction: { paymentHash }, proof: {} });
  assert.equal(none.verified, false);
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
