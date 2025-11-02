/**
 * Fiat Conversion Utilities
 *
 * Converts between sats and fiat currencies (USD, EUR, GBP)
 * Fetches real-time BTC prices from multiple sources
 */

const fetch = require('node-fetch');

// Price cache (update every 5 minutes)
let priceCache = {
  USD: null,
  EUR: null,
  GBP: null,
  lastUpdate: null
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// =====================================================
// Fetch Bitcoin Prices
// =====================================================

async function fetchBitcoinPrices() {
  try {
    // Use CoinGecko API (no auth required)
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur,gbp'
    );

    const data = await response.json();

    priceCache = {
      USD: data.bitcoin.usd,
      EUR: data.bitcoin.eur,
      GBP: data.bitcoin.gbp,
      lastUpdate: Date.now()
    };

    return priceCache;
  } catch (error) {
    console.error('Failed to fetch Bitcoin prices:', error.message);

    // Fallback to hardcoded prices if API fails
    if (!priceCache.USD) {
      priceCache = {
        USD: 45000, // Fallback price
        EUR: 42000,
        GBP: 36000,
        lastUpdate: Date.now()
      };
    }

    return priceCache;
  }
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
    GBP: '£'
  };

  const symbol = symbols[currency] || currency;

  // Format with 2 decimal places
  const formatted = amount.toFixed(2);

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
    baseFare = 2.50, // USD base fare
    perKm = 1.50, // USD per km
    perMinute = 0.30, // USD per minute
    surgeMultiplier = 1.0,
    operatorFeePct = 0.005
  } = options;

  // Calculate fiat fare
  let fiatFare = baseFare + (distanceKm * perKm) + (durationMinutes * perMinute);
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
