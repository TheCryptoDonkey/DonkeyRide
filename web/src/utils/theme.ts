/**
 * Light and dark, and the RGB triplet format that makes themed colours work
 * at all.
 *
 * The app was dark-only, which is the wrong default for this product: a rider
 * stands OUTSIDE, in daylight, looking at a map — the exact moment the screen
 * matters most and the exact condition dark mode handles worst. The choice is
 * device-local (`donkeyride.theme`), defaults to following the system, and is
 * applied as `data-theme` on <html> so CSS never has to guess.
 */
import { useSyncExternalStore } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'donkeyride.theme';

/** Status-bar colour on Android/iOS — the page background of each theme */
const THEME_COLOUR: Record<ResolvedTheme, string> = {
  dark: '#0a0a0a',
  light: '#f7f8fa',
};

export const THEMES: { id: ThemeChoice; labelKey: string }[] = [
  { id: 'system', labelKey: 'theme.system' },
  { id: 'light', labelKey: 'theme.light' },
  { id: 'dark', labelKey: 'theme.dark' },
];

/**
 * Convert an RGB triplet to the space-separated form.
 *
 * Tailwind emits `rgb(var(--x) / <alpha>)`, which is MODERN rgb() syntax and
 * therefore rejects comma-separated channels outright: `rgb(178, 76, 243 / 1)`
 * is a parse error and the declaration is dropped — silently, and even when
 * the alpha is 1. Domain profiles have always published the legacy comma form
 * (`'178, 76, 243'`), so every themed colour in the app rendered as nothing.
 *
 * Operators write their own profiles, so accept either format rather than
 * making a working theme depend on punctuation.
 */
export function normaliseRgbTriplet(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const parts = value.trim().split(/[,\s]+/).filter(Boolean);
  if (parts.length !== 3) return null;
  if (!parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return null;
  return parts.join(' ');
}

/** WCAG relative luminance for a 0-255 channel triple */
function luminance([r, g, b]: number[]): number {
  const chan = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

/** Contrast of a colour against white, per WCAG 2.1 */
function contrastOnWhite(rgb: number[]): number {
  return 1.05 / (luminance(rgb) + 0.05);
}

/**
 * The same brand colour, dark enough to read on a light background.
 *
 * A domain profile publishes ONE accent, tuned for near-black — DonkeyRide's
 * default is `#00ff88`, which scores 1.4:1 on white and is effectively
 * invisible. Rather than ask every operator to supply a second palette,
 * darken theirs until it clears 4.5:1, preserving hue. Luminance rises
 * monotonically as the channels scale, so a bisection always converges.
 */
export function readableOnLight(triplet: string | null | undefined, target = 5.5): string | null {
  const normalised = normaliseRgbTriplet(triplet);
  if (!normalised) return null;
  const rgb = normalised.split(' ').map(Number);
  if (contrastOnWhite(rgb) >= target) return normalised;

  let low = 0;
  let high = 1;
  for (let i = 0; i < 20; i += 1) {
    const mid = (low + high) / 2;
    const scaled = rgb.map((c) => c * mid);
    if (contrastOnWhite(scaled) >= target) low = mid;
    else high = mid;
  }

  // Verify what we actually EMIT, not the float behind it: rounding each
  // channel to an integer can nudge the colour back over the line.
  let scale = low;
  let out = rgb.map((c) => Math.round(c * scale));
  while (contrastOnWhite(out) < target && scale > 0) {
    scale = Math.max(0, scale - 0.01);
    out = rgb.map((c) => Math.round(c * scale));
  }
  return out.join(' ');
}

function isChoice(value: unknown): value is ThemeChoice {
  return value === 'system' || value === 'light' || value === 'dark';
}

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isChoice(stored)) return stored;
  } catch {
    // storage unavailable — follow the system
  }
  return 'system';
}

function mediaQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null;
  return window.matchMedia('(prefers-color-scheme: light)');
}

function systemTheme(): ResolvedTheme {
  return mediaQuery()?.matches ? 'light' : 'dark';
}

export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  return choice === 'system' ? systemTheme() : choice;
}

let choice: ThemeChoice = readChoice();
const listeners = new Set<() => void>();

export function getThemeChoice(): ThemeChoice {
  return choice;
}

/** The theme actually on screen, with `system` already resolved */
export function getTheme(): ResolvedTheme {
  return resolveTheme(choice);
}

function apply(): void {
  if (typeof document === 'undefined') return;
  const resolved = getTheme();
  document.documentElement.setAttribute('data-theme', resolved);
  // The status bar is part of the app on a phone; leaving it black above a
  // white page is the sort of seam that reads as "web page", not "app".
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOUR[resolved]);
}

export function setThemeChoice(next: ThemeChoice): void {
  choice = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // fine — the choice just won't persist
  }
  apply();
  listeners.forEach((l) => l());
}

/**
 * Stamp the theme before React renders. Called from both entry points so the
 * first paint is already correct — flipping the whole page a moment after
 * load is worse than either theme on its own.
 */
export function initTheme(): void {
  apply();
  // Following the system means following it as it CHANGES: phones switch
  // theme on a schedule, usually while the app is open in someone's hand.
  mediaQuery()?.addEventListener?.('change', () => {
    if (choice !== 'system') return;
    apply();
    listeners.forEach((l) => l());
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Re-renders on theme change, exactly as `useT()` does on locale change */
export function useTheme(): { choice: ThemeChoice; theme: ResolvedTheme; setTheme: (c: ThemeChoice) => void } {
  const current = useSyncExternalStore(subscribe, getThemeChoice, () => 'system' as ThemeChoice);
  return { choice: current, theme: resolveTheme(current), setTheme: setThemeChoice };
}
