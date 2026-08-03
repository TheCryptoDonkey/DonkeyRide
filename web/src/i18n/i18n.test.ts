import { describe, it, expect, beforeEach } from 'vitest';
import { t, td, setLocale, getLocale } from './index';
import { en } from './en';
import { sw } from './sw';

describe('i18n', () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale('en');
  });

  it('translates a key with interpolation', () => {
    expect(t('home.step', { n: 2 })).toBe('Step 2 of 2');
  });

  it('falls back to English for a key missing in Swahili', () => {
    setLocale('sw');
    expect(t('this.key.does.not.exist')).toBe('this.key.does.not.exist');
    // Every en key must resolve to SOMETHING in sw mode (en fallback)
    for (const key of Object.keys(en)) {
      expect(t(key)).toBeTruthy();
    }
  });

  it('switches locale and persists the choice', () => {
    setLocale('sw');
    expect(getLocale()).toBe('sw');
    expect(localStorage.getItem('donkeyride.locale')).toBe('sw');
    expect(t('common.accept')).toBe('Kubali');
  });

  it('td translates known dynamic labels and passes unknown ones through', () => {
    setLocale('sw');
    expect(td('driver')).toBe('dereva');
    expect(td('Driver')).toBe('dereva');
    expect(td('ride')).toBe('safari');
    expect(td('quantum plumber')).toBe('quantum plumber');
    setLocale('en');
    expect(td('driver')).toBe('driver');
  });

  it('sw dictionary keeps every interpolation placeholder its en source has', () => {
    for (const [key, enValue] of Object.entries(en)) {
      const swValue = sw[key];
      if (!swValue) continue;
      const placeholders = enValue.match(/\{[a-z]+\}/gi) || [];
      for (const ph of placeholders) {
        expect(swValue, `${key} is missing ${ph}`).toContain(ph);
      }
    }
  });

  it('sw has no keys that do not exist in en (except dyn.*)', () => {
    for (const key of Object.keys(sw)) {
      if (key.startsWith('dyn.')) continue;
      expect(en[key], `orphan sw key ${key}`).toBeTruthy();
    }
  });
});
