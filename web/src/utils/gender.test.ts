import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadGender, saveGender, loadWomenOnlyDriver, saveWomenOnlyDriver,
} from './gender';

describe('gender declaration', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a declaration and clears it', () => {
    expect(loadGender()).toBeNull();
    saveGender('woman');
    expect(loadGender()).toBe('woman');
    saveGender(null);
    expect(loadGender()).toBeNull();
  });

  it('rejects junk values in storage', () => {
    localStorage.setItem('donkeyride.gender', 'attack-helicopter');
    expect(loadGender()).toBeNull();
  });

  it('women-only driver preference requires the woman declaration', () => {
    saveWomenOnlyDriver(true);
    expect(loadWomenOnlyDriver()).toBe(false);
    saveGender('woman');
    saveWomenOnlyDriver(true);
    expect(loadWomenOnlyDriver()).toBe(true);
  });

  it('clearing or changing the declaration clears the preference', () => {
    saveGender('woman');
    saveWomenOnlyDriver(true);
    saveGender('man');
    expect(loadWomenOnlyDriver()).toBe(false);
  });
});
