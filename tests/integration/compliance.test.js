/**
 * Non-custodial compliance: the operator must never be a money transmitter.
 * These tests pin the custody model of every rail and the settlement posture.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { PaymentProviderFactory } = require('../../payment-providers/factory');
const { encodeGeohash, decodeGeohash } = require('../../src/utils/geohash');

test('record-only and mock rails are non-custodial', () => {
  assert.equal(PaymentProviderFactory.create('cash').getCustodyModel(), 'none');
  assert.equal(PaymentProviderFactory.create('demo').getCustodyModel(), 'none');
});

test('lightning rails are custodial (operator holds/controls funds)', () => {
  const stubConfig = {
    lnd: {},
    btcpay: { url: 'https://x', apiKey: 'k', storeId: 's' },
    alby: { apiKey: 'k' },
    cln: {}
  };
  for (const type of ['lnd', 'btcpay', 'alby', 'cln']) {
    assert.equal(
      PaymentProviderFactory.create(type, stubConfig[type]).getCustodyModel(),
      'custodial',
      `${type} must report custodial`
    );
  }
});

test('base provider defaults to custodial (fail-safe: unknown rails are gated)', () => {
  const PaymentProvider = require('../../payment-providers/base');
  const bare = new PaymentProvider({});
  assert.equal(bare.getCustodyModel(), 'custodial');
});

test('cash settlement records that the operator moved nothing', async () => {
  const cash = PaymentProviderFactory.create('cash');
  const record = await cash.recordSettlement('ride_x', 5000, 'GBP');
  // The cash rail records a face-to-face settlement; custody is none.
  assert.equal(cash.getCustodyModel(), 'none');
  assert.ok(record, 'a settlement record is returned');
});

test('geohash snapshots carry no exact coordinates but round-trip within the cell', () => {
  const hash = encodeGeohash(51.5074, -0.1278, 6);
  assert.equal(typeof hash, 'string');
  assert.ok(hash.length === 6);
  const centre = decodeGeohash(hash);
  // Precision 6 cell is well under ~1.5km; the centre is close but NOT exact.
  assert.ok(Math.abs(centre.lat - 51.5074) < 0.02);
  assert.ok(Math.abs(centre.lon - (-0.1278)) < 0.02);
  assert.notEqual(centre.lat, 51.5074, 'must not reproduce the exact coordinate');
});
