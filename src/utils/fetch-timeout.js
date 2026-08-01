/**
 * fetch with a hard timeout. node-fetch@2 has NO default timeout — a hung
 * upstream (OSRM, price API, payment API) would otherwise hold the route
 * handler and its socket open forever.
 */
const fetch = require('node-fetch');

const DEFAULT_TIMEOUT_MS = parseInt(process.env.OUTBOUND_FETCH_TIMEOUT_MS || '5000', 10);

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (timer.unref) {
    timer.unref();
  }
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Request to ${new URL(url).host} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchWithTimeout, DEFAULT_TIMEOUT_MS };
