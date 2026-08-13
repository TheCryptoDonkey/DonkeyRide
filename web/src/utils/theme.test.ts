import { describe, it, expect, beforeEach } from 'vitest';
import {
  normaliseRgbTriplet, readableOnLight, getTheme, getThemeChoice,
  setThemeChoice, initTheme,
} from './theme';

describe('normaliseRgbTriplet', () => {
  it('converts the comma form domain profiles publish', () => {
    // Tailwind emits `rgb(var(--x) / <alpha>)`; comma-separated channels make
    // that a parse error, so the colour renders as nothing at all
    expect(normaliseRgbTriplet('178, 76, 243')).toBe('178 76 243');
  });

  it('leaves an already-correct triplet alone', () => {
    expect(normaliseRgbTriplet('0 255 136')).toBe('0 255 136');
  });

  it('tolerates ragged spacing from a hand-written profile', () => {
    expect(normaliseRgbTriplet('  0,255,  136 ')).toBe('0 255 136');
  });

  it('rejects anything that is not three channels in range', () => {
    expect(normaliseRgbTriplet('178, 76')).toBeNull();
    expect(normaliseRgbTriplet('178, 76, 243, 1')).toBeNull();
    expect(normaliseRgbTriplet('178, 76, 300')).toBeNull();
    expect(normaliseRgbTriplet('red')).toBeNull();
    expect(normaliseRgbTriplet(null)).toBeNull();
  });
});

/** WCAG 2.1 contrast against white, mirrored here to check the output */
function contrastOnWhite(triplet: string): number {
  const chan = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = triplet.split(' ').map(Number);
  return 1.05 / (0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b) + 0.05);
}

describe('readableOnLight', () => {
  it('darkens a neon accent until it can actually be read', () => {
    // #00ff88 scores about 1.4:1 on white — invisible
    expect(contrastOnWhite('0 255 136')).toBeLessThan(2);
    const fixed = readableOnLight('0, 255, 136')!;
    // Leave headroom for the pale tinted cards brand text also appears on.
    expect(contrastOnWhite(fixed)).toBeGreaterThanOrEqual(5.5);
  });

  it('keeps the hue — it is still the operator’s brand', () => {
    const fixed = readableOnLight('0, 255, 136')!;
    const [r, g, b] = fixed.split(' ').map(Number);
    expect(r).toBe(0);          // no red in, no red out
    expect(g).toBeGreaterThan(b); // still green rather than teal
  });

  it('leaves a colour that already has contrast untouched', () => {
    const navy = '20 30 90';
    expect(readableOnLight(navy)).toBe(navy);
  });

  it('handles every built-in brand colour', () => {
    for (const brand of ['178, 76, 243', '255, 110, 199', '0, 255, 136']) {
      expect(contrastOnWhite(readableOnLight(brand)!)).toBeGreaterThanOrEqual(5.5);
    }
  });

  it('returns null for a malformed triplet rather than a broken colour', () => {
    expect(readableOnLight('not a colour')).toBeNull();
  });
});

describe('theme choice', () => {
  beforeEach(() => {
    localStorage.clear();
    setThemeChoice('system');
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to following the system', () => {
    expect(getThemeChoice()).toBe('system');
  });

  it('stamps the resolved theme on the document so CSS never guesses', () => {
    setThemeChoice('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    setThemeChoice('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('resolves system to a concrete theme', () => {
    setThemeChoice('system');
    expect(['light', 'dark']).toContain(getTheme());
  });

  it('persists the choice on the device', () => {
    setThemeChoice('light');
    expect(localStorage.getItem('donkeyride.theme')).toBe('light');
  });

  it('moves the status bar colour with the theme', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
    initTheme();
    setThemeChoice('light');
    expect(meta.getAttribute('content')).toBe('#f7f8fa');
    setThemeChoice('dark');
    expect(meta.getAttribute('content')).toBe('#0a0a0a');
    document.head.removeChild(meta);
  });
});
