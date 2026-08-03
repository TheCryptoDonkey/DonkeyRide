/**
 * What the operator does when the BTC price feed misbehaves.
 *
 * Every fare is quoted in sats off this rate, and the upfront-price guarantee
 * means whatever comes out here is the number the rider approves AND the
 * number recorded. So a bad rate is not a display glitch — it is the price.
 *
 * The failure that motivated these: CoinGecko answers a rate limit with HTTP
 * 429 and a perfectly valid JSON body, and a partial answer (say USD present,
 * GBP missing) used to sail straight through into the cache. GBP is the
 * default currency, so every fare then came out NaN with nothing logged.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const FETCH_MODULE = require.resolve('../../src/utils/fetch-timeout');
const FIAT_MODULE = require.resolve('../../src/pricing/fiat-conversion');

/**
 * Load a FRESH fiat-conversion (so its module-level price cache starts empty)
 * with the outbound fetch replaced by `handler`.
 */
function loadWithFetch(handler) {
  delete require.cache[FIAT_MODULE];
  require.cache[FETCH_MODULE] = {
    id: FETCH_MODULE,
    filename: FETCH_MODULE,
    loaded: true,
    paths: [],
    exports: { fetchWithTimeout: handler },
  };
  const mod = require(FIAT_MODULE);
  return mod;
}

function cleanup() {
  delete require.cache[FETCH_MODULE];
  delete require.cache[FIAT_MODULE];
}

/** A CoinGecko-shaped success */
const priceBody = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

test('a rate-limited price feed does not become a TypeError', async () => {
  // 429 with a valid JSON body — "it parsed" is not "it worked"
  const fx = loadWithFetch(async (url) => {
    if (url.includes('coingecko')) {
      return { ok: false, status: 429, json: async () => ({ status: { error_code: 429 } }) };
    }
    return priceBody({ rates: { KES: 130 } });
  });

  const prices = await fx.fetchBitcoinPrices();
  // No cache to fall back on, so the documented last resort is used — and
  // says so, rather than pretending it is a live rate.
  assert.equal(prices.fallback, true);
  assert.ok(prices.GBP > 0, 'GBP is still a usable number');
  cleanup();
});

test('a PARTIAL price response never poisons the cache', async () => {
  // USD only. This used to produce {USD: n, EUR: undefined, GBP: undefined}
  // with no throw, so no fallback ran, and every GBP fare became NaN.
  const fx = loadWithFetch(async (url) => {
    if (url.includes('coingecko')) {
      return priceBody({ bitcoin: { usd: 95000 } });
    }
    return priceBody({ rates: { KES: 130 } });
  });

  const prices = await fx.fetchBitcoinPrices();
  for (const currency of ['USD', 'EUR', 'GBP', 'KES']) {
    assert.ok(
      Number.isFinite(prices[currency]) && prices[currency] > 0,
      `${currency} is a usable price, got ${prices[currency]}`,
    );
  }

  // And the thing that actually mattered: the fare is a number, not NaN
  const fare = await fx.satsToFiat(10000, 'GBP');
  assert.ok(Number.isFinite(fare.amount), `GBP fare is finite, got ${fare.amount}`);
  assert.ok(!fare.formatted.includes('NaN'), `no NaN on screen, got ${fare.formatted}`);
  cleanup();
});

test('a good response is used verbatim and is not flagged as a fallback', async () => {
  const fx = loadWithFetch(async (url) => {
    if (url.includes('coingecko')) {
      return priceBody({ bitcoin: { usd: 95000, eur: 88000, gbp: 75000 } });
    }
    return priceBody({ rates: { KES: 130 } });
  });

  const prices = await fx.fetchBitcoinPrices();
  assert.equal(prices.USD, 95000);
  assert.equal(prices.GBP, 75000);
  assert.equal(prices.KES, 95000 * 130);
  assert.ok(!prices.fallback, 'a live rate is not flagged as a fallback');
  cleanup();
});

test('a stale cache is preferred over an invented price', async () => {
  let good = true;
  const fx = loadWithFetch(async (url) => {
    if (url.includes('coingecko')) {
      if (!good) throw new Error('network down');
      return priceBody({ bitcoin: { usd: 95000, eur: 88000, gbp: 75000 } });
    }
    return priceBody({ rates: { KES: 130 } });
  });

  await fx.fetchBitcoinPrices();
  good = false;
  const prices = await fx.fetchBitcoinPrices();

  // Stale but REAL beats a hardcoded constant every time
  assert.equal(prices.GBP, 75000);
  assert.ok(!prices.fallback, 'a stale cache is not the last-resort constant');
  cleanup();
});

test('conversions refuse rather than hand back NaN', async () => {
  const fx = loadWithFetch(async (url) => {
    if (url.includes('coingecko')) {
      return priceBody({ bitcoin: { usd: 95000, eur: 88000, gbp: 75000 } });
    }
    return priceBody({ rates: { KES: 130 } });
  });
  await fx.fetchBitcoinPrices();

  await assert.rejects(
    () => fx.satsToFiat(10000, 'JPY'),
    /No BTC price available/,
    'an unknown currency is an error, not a NaN fare',
  );
  cleanup();
});
