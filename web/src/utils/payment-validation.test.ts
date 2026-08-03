import { describe, it, expect } from 'vitest';
import {
  isLightningAddress, isMpesaNumber, isTandoHandle, validateRailHandle,
  looksLikeCardNumber,
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

  describe('rails whose handle is optional', () => {
    // These were impossible to enable: blank gave "Enter a handle", and for
    // Cashu anything non-blank gave "Unknown rail: cashu".
    it('accepts a blank card reader name', () => {
      expect(validateRailHandle('card', '')).toEqual({ valid: true });
      expect(validateRailHandle('tap-to-pay', '')).toEqual({ valid: true });
      expect(validateRailHandle('card', 'SumUp')).toEqual({ valid: true });
    });

    it('accepts a blank Cashu payment request, and a creq when given', () => {
      expect(validateRailHandle('cashu', '')).toEqual({ valid: true });
      expect(validateRailHandle('cashu', 'creq1abcdef')).toEqual({ valid: true });
      expect(validateRailHandle('cashu', 'not-a-request').valid).toBe(false);
    });

    it('refuses a card number in the reader name', () => {
      const result = validateRailHandle('card', '4242424242424242');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Never enter a card number/i);
      // Spaced form is the same number
      expect(validateRailHandle('card', '4242 4242 4242 4242').valid).toBe(false);
    });

    it('keeps the reader name short enough to display', () => {
      expect(validateRailHandle('card', 'x'.repeat(33)).valid).toBe(false);
    });
  });

  describe('looksLikeCardNumber', () => {
    it('matches a PAN and not an ordinary reference', () => {
      expect(looksLikeCardNumber('4242424242424242')).toBe(true);
      expect(looksLikeCardNumber('4242-4242-4242-4242')).toBe(true);
      expect(looksLikeCardNumber('1234567890123')).toBe(false);  // fails Luhn
      expect(looksLikeCardNumber('SUMUP123')).toBe(false);
    });
  });
});
