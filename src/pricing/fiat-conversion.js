/**
 * Fiat Conversion Utilities
 *
 * Converts between sats and fiat currencies (USD, EUR, GBP, KES)
 * Fetches real-time BTC prices from multiple sources
 *
 * KES is first-class: the M-Pesa and Tando settlement rails are Kenyan, so a
 * Kenyan operator prices rides in shillings and riders pay the exact figure.
 */

const { fetchWithTimeout: fetch } = require('../utils/fetch-timeout');

// Price cache (update every 5 minutes)
let priceCache = {
  USD: null,
  EUR: null,
  GBP: null,
  KES: null,
  lastUpdate: null
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/** A price we are willing to quote a fare from */
function isUsablePrice(value) {
  return Number.isFinite(value) && value > 0;
}

/**
 * Absolute last resort: no feed AND no cache. These are only ever better than
 * refusing to quote at all, and an operator who cannot reach a price feed
 * should override them rather than ship fares priced off a stale constant.
 */
const LAST_RESORT_PRICES = {
  USD: Number(process.env.BTC_PRICE_FALLBACK_USD) || 45000,
  EUR: Number(process.env.BTC_PRICE_FALLBACK_EUR) || 42000,
  GBP: Number(process.env.BTC_PRICE_FALLBACK_GBP) || 36000
};

// =====================================================
// Fetch Bitcoin Prices
// =====================================================

async function fetchBitcoinPrices() {
  // 1. BTC in the CoinGecko-supported majors (no auth). Keep working even if
  //    the request fails, by reusing the cache or a hardcoded fallback.
  let base = null;
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur,gbp'
    );
    // A rate-limited CoinGecko answers 429 with a perfectly valid JSON body,
    // so "it parsed" is not "it worked". Without this the first sign of
    // trouble was a TypeError on data.bitcoin.usd.
    if (!response.ok) {
      throw new Error(`CoinGecko HTTP ${response.status}`);
    }
    const data = await response.json();
    const quoted = data && data.bitcoin;
    const candidate = quoted
      ? { USD: quoted.usd, EUR: quoted.eur, GBP: quoted.gbp }
      : null;
    // EVERY currency must be a real number. A partial answer used to sail
    // through untouched — no throw, so no fallback — and poisoned the cache
    // with undefined, after which every fare in that currency came out NaN.
    // GBP is the default, so a response missing one key broke the rate card
    // silently.
    if (!candidate || !Object.values(candidate).every(isUsablePrice)) {
      throw new Error('CoinGecko returned no usable price for USD/EUR/GBP');
    }
    base = candidate;
  } catch (error) {
    console.error('Failed to fetch Bitcoin prices:', error.message);
  }

  let usingFallback = false;
  if (!base) {
    if (isUsablePrice(priceCache.USD)) {
      // Stale but REAL — much safer than a made-up number
      base = { USD: priceCache.USD, EUR: priceCache.EUR, GBP: priceCache.GBP };
    } else {
      base = { ...LAST_RESORT_PRICES };
      usingFallback = true;
      // Loudly: the operator is about to quote fares off a hardcoded rate.
      // The upfront-price guarantee still holds — the rider approves exactly
      // what gets recorded — but both numbers are wrong against the market,
      // and nothing downstream can tell. Set BTC_PRICE_FALLBACK_USD/EUR/GBP
      // to something current if this box cannot reach a price feed.
      console.warn(
        `⚠️  No BTC price available and no cache — pricing every fare from the `
        + `FALLBACK rate (USD ${base.USD}). Fares will be wrong until a feed `
        + `responds. Set BTC_PRICE_FALLBACK_USD/EUR/GBP for a sane figure.`
      );
    }
  }

  // 2. KES is NOT a CoinGecko vs_currency, so derive BTC/KES = BTC/USD × USD/KES
  //    using a free FX rate. The M-Pesa and Tando rails depend on this, so it
  //    has its own fallback and never blocks the majors above.
  let usdToKes = 129; // sane 2026 fallback if the FX call fails
  try {
    const fx = await fetch('https://open.er-api.com/v6/latest/USD');
    const fxData = await fx.json();
    if (fxData && fxData.rates && Number.isFinite(fxData.rates.KES)) {
      usdToKes = fxData.rates.KES;
    }
  } catch (error) {
    console.error('Failed to fetch USD/KES FX rate, using fallback:', error.message);
  }

  priceCache = {
    ...base,
    KES: Math.round(base.USD * usdToKes),
    lastUpdate: Date.now(),
    // Whether these numbers came off a hardcoded constant rather than a feed.
    // Callers that care (a quote about to be committed to) can refuse.
    fallback: usingFallback
  };

  return priceCache;
}

// =====================================================
// Get Current Price
// =====================================================

async function getBitcoinPrice(currency = 'USD') {
  // Check if cache is valid
  if (priceCache.lastUpdate && Date.now() - priceCache.lastUpdate < CACHE_DURATION) {
    return priceCache[currency];
  }

  // Fetch new prices
  await fetchBitcoinPrices();
  return priceCache[currency];
}

// =====================================================
// Conversion Functions
// =====================================================

async function satsToFiat(sats, currency = 'USD') {
  const btcPrice = await getBitcoinPrice(currency);
  // Refuse rather than hand back NaN. A NaN fare renders as "£NaN" on a
  // confirm screen, or worse gets rounded into a number nobody chose.
  if (!isUsablePrice(btcPrice)) {
    throw new Error(`No BTC price available for ${currency}`);
  }
  const btc = sats / 100000000; // Convert sats to BTC
  const fiatAmount = btc * btcPrice;

  return {
    amount: fiatAmount,
    currency,
    formatted: formatCurrency(fiatAmount, currency),
    btcPrice,
    sats
  };
}

async function fiatToSats(amount, currency = 'USD') {
  const btcPrice = await getBitcoinPrice(currency);
  if (!isUsablePrice(btcPrice)) {
    throw new Error(`No BTC price available for ${currency}`);
  }
  const btc = amount / btcPrice;
  const sats = Math.round(btc * 100000000);

  return {
    sats,
    amount,
    currency,
    formatted: formatSats(sats),
    btcPrice
  };
}

// =====================================================
// Formatting Functions
// =====================================================

function formatCurrency(amount, currency = 'USD') {
  const symbols = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    KES: 'KSh '
  };

  const symbol = symbols[currency] || `${currency} `;

  // KES is transacted in whole shillings; others keep 2 decimals.
  const formatted = currency === 'KES' ? Math.round(amount).toLocaleString() : amount.toFixed(2);

  return `${symbol}${formatted}`;
}

function formatSats(sats) {
  // Format with thousand separators
  return sats.toLocaleString() + ' sats';
}

function formatDualPrice(sats, currency = 'USD') {
  // Returns formatted string with both sats and fiat
  const fiatAmount = (sats / 100000000) * (priceCache[currency] || 45000);
  return `${formatSats(sats)} (${formatCurrency(fiatAmount, currency)})`;
}

// =====================================================
// Trip Cost Estimation
// =====================================================

async function estimateTripCost(distanceKm, durationMinutes, options = {}) {
  const {
    currency = 'USD',
    baseFare = 2.50, // base fare, denominated in rateCardCurrency
    perKm = 1.50, // per km, denominated in rateCardCurrency
    perMinute = 0.30, // per minute, denominated in rateCardCurrency
    rateCardCurrency = 'USD', // currency the three rates above are quoted in
    operatorFeePct = 0.005
  } = options;

  // The rate card is quoted in rateCardCurrency (USD by default). If the ride is
  // priced in another currency, convert each rate via the BTC cross rate so a
  // KES ride is not charged "2.50 shillings". Operators who set an explicit rate
  // card in their own currency (rateCardCurrency === currency) skip conversion.
  let bf = baseFare, pk = perKm, pm = perMinute;
  if (rateCardCurrency !== currency) {
    const src = await getBitcoinPrice(rateCardCurrency);
    const tgt = await getBitcoinPrice(currency);
    if (Number.isFinite(src) && src > 0 && Number.isFinite(tgt) && tgt > 0) {
      const factor = tgt / src; // fiat-per-BTC ratio = target units per source unit
      bf = baseFare * factor;
      pk = perKm * factor;
      pm = perMinute * factor;
    }
  }

  // Calculate fiat fare
  const fiatFare = bf + (distanceKm * pk) + (durationMinutes * pm);

  // Convert to sats
  const fareInSats = await fiatToSats(fiatFare, currency);

  // Calculate operator fee
  const operatorFeeSats = Math.round(fareInSats.sats * operatorFeePct);
  const driverEarnsSats = fareInSats.sats - operatorFeeSats;

  // Convert driver earnings back to fiat
  const driverEarnsFiat = await satsToFiat(driverEarnsSats, currency);

  return {
    distance: {
      km: distanceKm,
      formatted: `${distanceKm.toFixed(1)} km`
    },
    duration: {
      minutes: durationMinutes,
      formatted: `${Math.round(durationMinutes)} min`
    },
    fare: {
      sats: fareInSats.sats,
      fiat: fiatFare,
      currency,
      formatted: formatDualPrice(fareInSats.sats, currency)
    },
    // Rows use the converted rates (bf/pk/pm) so they sum to fare.fiat in
    // the ride currency — the raw rate card may be quoted in another one.
    breakdown: {
      baseFare: {
        fiat: bf,
        formatted: formatCurrency(bf, currency)
      },
      distance: {
        fiat: distanceKm * pk,
        formatted: formatCurrency(distanceKm * pk, currency)
      },
      duration: {
        fiat: durationMinutes * pm,
        formatted: formatCurrency(durationMinutes * pm, currency)
      }
    },
    operatorFee: {
      sats: operatorFeeSats,
      fiat: fiatFare * operatorFeePct,
      percentage: operatorFeePct * 100,
      formatted: formatDualPrice(operatorFeeSats, currency)
    },
    driverEarns: {
      sats: driverEarnsSats,
      fiat: driverEarnsFiat.amount,
      formatted: formatDualPrice(driverEarnsSats, currency)
    },
    btcPrice: priceCache[currency],
    currency
  };
}

// =====================================================
// Price Display Helpers
// =====================================================

function createPriceDisplay(sats, currency = 'USD') {
  const fiatAmount = (sats / 100000000) * (priceCache[currency] || 45000);

  return {
    primary: formatSats(sats),
    secondary: formatCurrency(fiatAmount, currency),
    combined: formatDualPrice(sats, currency),
    sats,
    fiat: fiatAmount,
    currency
  };
}

// =====================================================
// Exports
// =====================================================

module.exports = {
  // Fetching
  getBitcoinPrice,
  fetchBitcoinPrices,

  // Conversion
  satsToFiat,
  fiatToSats,

  // Formatting
  formatCurrency,
  formatSats,
  formatDualPrice,

  // Trip estimation
  estimateTripCost,

  // Display
  createPriceDisplay,

  // Cache access
  getPriceCache: () => priceCache
};
