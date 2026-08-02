import { describe, it, expect } from 'vitest';
import { getModules, modulesToPath } from './qr';

describe('getModules', () => {
  it('produces a square matrix at least version 1 (21x21)', () => {
    const m = getModules('HELLO', 'M');
    expect(m.length).toBeGreaterThanOrEqual(21);
    expect(m.every((row) => row.length === m.length)).toBe(true);
    // Version size is always 4v + 17
    expect((m.length - 17) % 4).toBe(0);
  });

  it('draws the top-left finder pattern correctly', () => {
    const m = getModules('HELLO', 'M');
    // Outer 7x7 border is dark, inner ring light, 3x3 centre dark
    expect(m[0][0]).toBe(true);
    expect(m[0][6]).toBe(true);
    expect(m[6][0]).toBe(true);
    expect(m[1][1]).toBe(false);
    expect(m[3][3]).toBe(true);
  });

  it('scales to a larger version for long data without throwing', () => {
    const longInvoice = 'lightning:lnbc10u1p' + 'a1b2c3d4e5'.repeat(30);
    const m = getModules(longInvoice, 'M');
    // Longer payloads need a bigger symbol than version 1
    expect(m.length).toBeGreaterThan(21);
  });

  it('is deterministic for the same input', () => {
    expect(getModules('donkey', 'M')).toEqual(getModules('donkey', 'M'));
  });
});

describe('modulesToPath', () => {
  it('emits an SVG path with the quiet-zone offset applied', () => {
    const m = getModules('HELLO', 'M');
    const path = modulesToPath(m, 2);
    expect(path.length).toBeGreaterThan(0);
    // First dark module (0,0) shifted by the margin of 2
    expect(path.startsWith('M2 2h1v1h-1z')).toBe(true);
  });
});
