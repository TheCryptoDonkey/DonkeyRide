import { describe, it, expect } from 'vitest';
import {
  isLightningAddress, isMpesaNumber, isTandoHandle, validateRailHandle,
} from './payment-validation';

describe('isLightningAddress', () => {
  it('accepts well-formed name@domain.tld addresses', () => {
    expect(isLightningAddress('you@wallet.com')).toBe(true);
    expect(isLightningAddress('alice.bob@getalby.com')).toBe(true);
    expect(isLightningAddress('  spaced@domain.io  ')).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(isLightningAddress('nope')).toBe(false);
    expect(isLightningAddress('missing@domain')).toBe(false);
    expect(isLightningAddress('@domain.com')).toBe(false);
    expect(isLightningAddress('spaces in@domain.com')).toBe(false);
    expect(isLightningAddress('')).toBe(false);
  });
});

describe('isMpesaNumber', () => {
  it('accepts Kenyan MSISDN formats and ignores spaces/dashes', () => {
    expect(isMpesaNumber('254712345678')).toBe(true);
    expect(isMpesaNumber('0712345678')).toBe(true);
    expect(isMpesaNumber('+254712345678')).toBe(true);
    expect(isMpesaNumber('254112345678')).toBe(true); // 01X range
    expect(isMpesaNumber('0712 345 678')).toBe(true);
    expect(isMpesaNumber('0712-345-678')).toBe(true);
  });

  it('rejects non-Kenyan or malformed numbers', () => {
    expect(isMpesaNumber('447712345678')).toBe(false); // UK
    expect(isMpesaNumber('0812345678')).toBe(false); // wrong prefix
    expect(isMpesaNumber('25471234567')).toBe(false); // too short
    expect(isMpesaNumber('you@wallet.com')).toBe(false);
    expect(isMpesaNumber('')).toBe(false);
  });
});

describe('isTandoHandle', () => {
  it('accepts either a Kenyan number or a Lightning Address', () => {
    expect(isTandoHandle('254712345678')).toBe(true);
    expect(isTandoHandle('you@tando.me')).toBe(true);
  });

  it('rejects anything that is neither', () => {
    expect(isTandoHandle('nonsense')).toBe(false);
  });
});

describe('validateRailHandle', () => {
  it('always passes cash and needs no handle', () => {
    expect(validateRailHandle('cash', '')).toEqual({ valid: true });
  });

  it('requires a handle for non-cash rails', () => {
    expect(validateRailHandle('lnaddress', '').valid).toBe(false);
    expect(validateRailHandle('mpesa', '   ').valid).toBe(false);
  });

  it('validates lightning, mpesa and tando handles', () => {
    expect(validateRailHandle('lnaddress', 'you@wallet.com').valid).toBe(true);
    expect(validateRailHandle('lnaddress', '07123').valid).toBe(false);

    expect(validateRailHandle('mpesa', '254712345678').valid).toBe(true);
    expect(validateRailHandle('mpesa', 'you@wallet.com').valid).toBe(false);

    expect(validateRailHandle('tando', '0712345678').valid).toBe(true);
    expect(validateRailHandle('tando', 'you@tando.me').valid).toBe(true);
    expect(validateRailHandle('tando', 'rubbish').valid).toBe(false);
  });

  it('reports unknown rails', () => {
    const result = validateRailHandle('paypal', 'x');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unknown rail');
  });

  it('returns a human-readable error message when invalid', () => {
    expect(validateRailHandle('lnaddress', 'bad').error).toMatch(/Lightning Address/);
    expect(validateRailHandle('mpesa', 'bad').error).toMatch(/Kenyan number/);
  });
});
