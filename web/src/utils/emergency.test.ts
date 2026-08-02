import { describe, it, expect } from 'vitest';
import { emergencyNumber } from './emergency';

describe('emergencyNumber', () => {
  it('maps known regions', () => {
    expect(emergencyNumber('en-GB')).toBe('999');
    expect(emergencyNumber('sw-KE')).toBe('999');
    expect(emergencyNumber('en-US')).toBe('911');
    expect(emergencyNumber('en-AU')).toBe('000');
    expect(emergencyNumber('en-NZ')).toBe('111');
  });

  it('falls back to the GSM standard 112', () => {
    expect(emergencyNumber('fr-FR')).toBe('112');
    expect(emergencyNumber('de')).toBe('112');
    expect(emergencyNumber('')).toBeTypeOf('string');
  });
});
