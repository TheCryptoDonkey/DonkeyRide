/** Standard base32 geohash alphabet */
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/**
 * Encode a latitude/longitude pair as a geohash string.
 * Standard algorithm: interleaved longitude/latitude bisection,
 * 5 bits per base32 character.
 */
export function encodeGeohash(lat: number, lon: number, precision = 5): string {
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
