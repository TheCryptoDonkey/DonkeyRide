import { describe, it, expect } from 'vitest';
import { encodeGeohash } from './geohash';

describe('encodeGeohash', () => {
  it('encodes central London at precision 5', () => {
    expect(encodeGeohash(51.5074, -0.1278, 5)).toBe('gcpvj');
  });

  it('encodes the classic reference vector', () => {
    expect(encodeGeohash(57.64911, 10.40744, 11)).toBe('u4pruydqqvj');
  });

  it('encodes a southern-hemisphere point', () => {
    // Sydney Opera House
    expect(encodeGeohash(-33.8568, 151.2153, 5)).toBe('r3gx2');
  });

  it('respects the precision parameter and is prefix-consistent', () => {
    const seven = encodeGeohash(51.5074, -0.1278, 7);
    expect(seven).toHaveLength(7);
    expect(seven.slice(0, 5)).toBe('gcpvj');
  });
});
