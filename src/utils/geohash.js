/**
 * Standard base32 geohash encode/decode (backend).
 *
 * Used to publish PII-free coordination state to Nostr: only geohash-level
 * location leaves the operator, never exact coordinates or addresses.
 * decode() returns the cell centre, which is all a rehydrated task needs.
 */

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

function encodeGeohash(lat, lon, precision = 5) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return '';
  }
  let latMin = -90;
  let latMax = 90;
  let lonMin = -180;
  let lonMax = 180;
  let hash = '';
  let bit = 0;
  let ch = 0;
  let evenBit = true;

  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lonMin + lonMax) / 2;
      if (lon >= mid) { ch = ch * 2 + 1; lonMin = mid; } else { ch = ch * 2; lonMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { ch = ch * 2 + 1; latMin = mid; } else { ch = ch * 2; latMax = mid; }
    }
    evenBit = !evenBit;
    if (++bit === 5) {
      hash += BASE32.charAt(ch);
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

/**
 * Decode a geohash to the centre of its cell.
 * @returns {{lat:number, lon:number}|null}
 */
function decodeGeohash(hash) {
  if (typeof hash !== 'string' || hash.length === 0) {
    return null;
  }
  let latMin = -90;
  let latMax = 90;
  let lonMin = -180;
  let lonMax = 180;
  let evenBit = true;

  for (const char of hash.toLowerCase()) {
    const idx = BASE32.indexOf(char);
    if (idx === -1) {
      return null;
    }
    for (let n = 4; n >= 0; n -= 1) {
      const bitN = (idx >> n) & 1;
      if (evenBit) {
        const mid = (lonMin + lonMax) / 2;
        if (bitN === 1) { lonMin = mid; } else { lonMax = mid; }
      } else {
        const mid = (latMin + latMax) / 2;
        if (bitN === 1) { latMin = mid; } else { latMax = mid; }
      }
      evenBit = !evenBit;
    }
  }
  return { lat: (latMin + latMax) / 2, lon: (lonMin + lonMax) / 2 };
}

module.exports = { encodeGeohash, decodeGeohash };
