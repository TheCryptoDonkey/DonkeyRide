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

// =====================================================
// Fetch Bitcoin Prices
// =====================================================

async function fetchBitcoinPrices() {
  // 1. BTC in the CoinGecko-supported majors (no auth). Keep working even if
  //    the request fails, by reusing the cache or a hardcoded fallback.
  let base;
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur,gbp'
    );
    const data = await response.json();
    base = { USD: data.bitcoin.usd, EUR: data.bitcoin.eur, GBP: data.bitcoin.gbp };
  } catch (error) {
    console.error('Failed to fetch Bitcoin prices:', error.message);
    base = priceCache.USD
      ? { USD: priceCache.USD, EUR: priceCache.EUR, GBP: priceCache.GBP }
      : { USD: 45000, EUR: 42000, GBP: 36000 };
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
    lastUpdate: Date.now()
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
    surgeMultiplier = 1.0,
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
  let fiatFare = bf + (distanceKm * pk) + (durationMinutes * pm);
  fiatFare = fiatFare * surgeMultiplier;

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
    breakdown: {
      baseFare: {
        fiat: baseFare,
        formatted: formatCurrency(baseFare, currency)
      },
      distance: {
        fiat: distanceKm * perKm,
        formatted: formatCurrency(distanceKm * perKm, currency)
      },
      duration: {
        fiat: durationMinutes * perMinute,
        formatted: formatCurrency(durationMinutes * perMinute, currency)
      },
      surge: {
        multiplier: surgeMultiplier,
        formatted: `${surgeMultiplier}x`
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
