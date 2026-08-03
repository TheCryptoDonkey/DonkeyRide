/**
 * Self-declared gender for women-only matching — device-local, like the
 * vehicle and trip history. DonkeyRide has no accounts and cannot verify
 * gender: this is an honest attestation, and every surface that uses it
 * says so. Only 'woman' carries matching semantics.
 */

export type Gender = 'woman' | 'man';

const GENDER_KEY = 'donkeyride.gender';
const WOMEN_ONLY_KEY = 'donkeyride.womenOnlyDriver';

export function loadGender(): Gender | null {
  try {
    const v = localStorage.getItem(GENDER_KEY);
    return v === 'woman' || v === 'man' ? v : null;
  } catch {
    return null;
  }
}

export function saveGender(gender: Gender | null): void {
  try {
    if (gender) localStorage.setItem(GENDER_KEY, gender);
    else localStorage.removeItem(GENDER_KEY);
    // The driver-side preference only makes sense for a declared woman
    if (gender !== 'woman') localStorage.removeItem(WOMEN_ONLY_KEY);
  } catch {
    // storage unavailable — the declaration just won't persist
  }
}

/** Driver preference: only receive women-only requests. */
export function loadWomenOnlyDriver(): boolean {
  try {
    return localStorage.getItem(WOMEN_ONLY_KEY) === '1' && loadGender() === 'woman';
  } catch {
    return false;
  }
}

export function saveWomenOnlyDriver(enabled: boolean): void {
  try {
    if (enabled && loadGender() === 'woman') localStorage.setItem(WOMEN_ONLY_KEY, '1');
    else localStorage.removeItem(WOMEN_ONLY_KEY);
  } catch {
    // storage unavailable
  }
}
