/**
 * Minimal i18n runtime — no framework, no build step. A flat key → string
 * dictionary per locale, `{param}` interpolation, English fallback for any
 * missing key, and a `useT()` hook that re-renders subscribers on switch.
 *
 * Locale is chosen automatically from the browser (Swahili detected for the
 * KES market) and can be overridden from the profile page; the choice is
 * device-local (`donkeyride.locale`).
 */
import { useSyncExternalStore } from 'react';
import { en } from './en';
import { sw } from './sw';

export type LocaleId = 'en' | 'sw';

const DICTS: Record<LocaleId, Record<string, string>> = { en, sw };

export const LOCALES: { id: LocaleId; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'sw', label: 'Kiswahili' },
];

const STORAGE_KEY = 'donkeyride.locale';

function detect(): LocaleId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'sw') return stored;
  } catch {
    // storage unavailable — fall through to browser language
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  return nav.toLowerCase().startsWith('sw') ? 'sw' : 'en';
}

let current: LocaleId = detect();
const listeners = new Set<() => void>();

export function getLocale(): LocaleId {
  return current;
}

export function setLocale(locale: LocaleId): void {
  current = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // fine — the choice just won't persist
  }
  listeners.forEach((l) => l());
}

export function t(key: string, params?: Record<string, string | number>): string {
  let s = DICTS[current][key] ?? DICTS.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}

/**
 * Translate a dynamic string that comes from the server (domain-profile role
 * names and labels like "driver", "ride", "Pickup"). Falls back to the
 * server's own string when no mapping exists, so unknown domains still work.
 */
export function td(text: string | undefined | null): string {
  if (!text) return '';
  return DICTS[current][`dyn.${text.toLowerCase()}`] ?? text;
}

export function useLocale(): LocaleId {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current
  );
}

/** Subscribe to locale changes and get the translation helpers. */
export function useT() {
  const locale = useLocale();
  return { t, td, locale, setLocale };
}
