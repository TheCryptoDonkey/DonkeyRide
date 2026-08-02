/**
 * Fiat pricing: KES formatting and the rate-card currency conversion that makes
 * the M-Pesa/Tando rails quote a sane amount instead of "2.50 shillings".
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const fx = require('../../src/pricing/fiat-conversion');

test('formatCurrency shows KES in whole shillings with a KSh symbol', () => {
  assert.equal(fx.formatCurrency(1305.2, 'KES'), 'KSh 1,305');
  assert.equal(fx.formatCurrency(7.489, 'GBP'), '£7.49');
});

test('the rate card converts across currencies via the BTC cross rate', async () => {
  // Ensure prices (real or fallback) are populated deterministically for the run.
  await fx.fetchBitcoinPrices();
  const usdPrice = await fx.getBitcoinPrice('USD');
  const kesPrice = await fx.getBitcoinPrice('KES');
  assert.ok(usdPrice > 0 && kesPrice > 0, 'USD and KES BTC prices are available');

  const opts = { baseFare: 2.5, perKm: 1.5, perMinute: 0.3, rateCardCurrency: 'USD' };
  const inUsd = await fx.estimateTripCost(5, 10, { ...opts, currency: 'USD' });
  const inKes = await fx.estimateTripCost(5, 10, { ...opts, currency: 'KES' });

  // The KES fiat fare should be the USD fiat fare scaled by the BTC cross rate.
  const factor = kesPrice / usdPrice;
  const expectedKes = inUsd.fare.fiat * factor;
  const drift = Math.abs(inKes.fare.fiat - expectedKes) / expectedKes;
  assert.ok(drift < 0.001, `KES fare tracks the cross rate (drift ${drift})`);
  assert.ok(inKes.fare.fiat > inUsd.fare.fiat * 50, 'a KES fare is not "2.50 shillings"');
});

test('an operator rate card in the ride currency is used verbatim (no conversion)', async () => {
  await fx.fetchBitcoinPrices();
  // rateCardCurrency === currency: the 200/100/20 KES rate card is applied as-is.
  const est = await fx.estimateTripCost(0, 0, {
    currency: 'KES', baseFare: 200, perKm: 100, perMinute: 20, rateCardCurrency: 'KES'
  });
  assert.equal(Math.round(est.fare.fiat), 200, 'zero-distance fare is exactly the base fare');
});
