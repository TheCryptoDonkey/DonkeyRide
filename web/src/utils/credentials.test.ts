import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadCredentials, saveCredentials, isExpired, isExpiringSoon,
  validCredentials, missingRequired,
} from './credentials';

const YEAR_AHEAD = Date.now() + 365 * 24 * 3600 * 1000;
const LAST_MONTH = Date.now() - 30 * 24 * 3600 * 1000;
const NEXT_WEEK = Date.now() + 7 * 24 * 3600 * 1000;

describe('credentials', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a declaration', () => {
    saveCredentials([{ id: 'phv_licence', expiresAt: YEAR_AHEAD, reference: 'MCR/1' }]);
    expect(loadCredentials()).toEqual([
      { id: 'phv_licence', expiresAt: YEAR_AHEAD, reference: 'MCR/1' },
    ]);
  });

  it('survives junk in storage rather than blanking the app', () => {
    localStorage.setItem('donkeyride.credentials', '{not json');
    expect(loadCredentials()).toEqual([]);
    localStorage.setItem('donkeyride.credentials', '[{"nope":1},{"id":"mot"}]');
    expect(loadCredentials()).toEqual([{ id: 'mot' }]);
  });

  it('drops duplicates and caps a long reference', () => {
    saveCredentials([
      { id: 'mot' },
      { id: 'MOT' as string },
      { id: 'phv_licence', reference: 'x'.repeat(200) },
    ]);
    const held = loadCredentials();
    expect(held.map((c) => c.id)).toEqual(['mot', 'phv_licence']);
    expect(held[1].reference).toHaveLength(60);
  });

  it('knows an expired claim from a live one', () => {
    expect(isExpired({ id: 'a', expiresAt: LAST_MONTH })).toBe(true);
    expect(isExpired({ id: 'a', expiresAt: YEAR_AHEAD })).toBe(false);
    // No date given is weaker than a date, but it is not expired
    expect(isExpired({ id: 'a' })).toBe(false);
  });

  it('warns before a licence lapses, not after', () => {
    expect(isExpiringSoon({ id: 'a', expiresAt: NEXT_WEEK })).toBe(true);
    expect(isExpiringSoon({ id: 'a', expiresAt: YEAR_AHEAD })).toBe(false);
    // Already gone is a different, louder problem
    expect(isExpiringSoon({ id: 'a', expiresAt: LAST_MONTH })).toBe(false);
  });

  it('never sends an expired claim', () => {
    saveCredentials([
      { id: 'phv_licence', expiresAt: LAST_MONTH },
      { id: 'mot', expiresAt: YEAR_AHEAD },
    ]);
    expect(validCredentials().map((c) => c.id)).toEqual(['mot']);
  });

  it('reports what a domain requires and this device has not declared', () => {
    saveCredentials([{ id: 'mot', expiresAt: YEAR_AHEAD }]);
    const required = [
      { id: 'phv_licence', required: true },
      { id: 'hire_reward_insurance', required: true },
      { id: 'mot', required: false },
    ];
    expect(missingRequired(required)).toEqual(['phv_licence', 'hire_reward_insurance']);
  });

  it('counts an expired required claim as missing', () => {
    saveCredentials([{ id: 'phv_licence', expiresAt: LAST_MONTH }]);
    expect(missingRequired([{ id: 'phv_licence', required: true }]))
      .toEqual(['phv_licence']);
  });
});
