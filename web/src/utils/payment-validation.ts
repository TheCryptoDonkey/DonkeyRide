/**
 * Client-side validators for driver payment handles. These mirror the
 * operator's own checks (see settlement/*.js) so the driver gets instant
 * inline feedback before anything is sent. The server remains the source of
 * truth and re-validates every handle.
 */

/** A Lightning Address looks like name@domain.tld. */
export function isLightningAddress(handle: string): boolean {
  return typeof handle === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(handle.trim());
}

/**
 * A Kenyan M-Pesa MSISDN: 2547XXXXXXXX / 07XXXXXXXX / +2547XXXXXXXX, and the
 * Safaricom/Airtel 01X ranges. Spaces and dashes are ignored.
 */
export function isMpesaNumber(handle: string): boolean {
  if (typeof handle !== 'string') return false;
  const cleaned = handle.replace(/[\s-]/g, '');
  return /^(?:\+?254|0)(?:7|1)\d{8}$/.test(cleaned);
}

/** Tando accepts either a bare Kenyan number or a Lightning Address. */
export function isTandoHandle(handle: string): boolean {
  return isMpesaNumber(handle) || isLightningAddress(handle);
}

export interface HandleValidation {
  valid: boolean;
  error?: string;
}

/**
 * Validate a handle for a rail. Cash needs no handle. Returns a human-readable
 * error suitable for inline display when invalid.
 */
export function validateRailHandle(rail: string, handle: string): HandleValidation {
  const railId = (rail || '').toLowerCase();
  const value = (handle || '').trim();

  if (railId === 'cash') {
    return { valid: true };
  }
  if (!value) {
    return { valid: false, error: 'Enter a handle' };
  }

  switch (railId) {
    case 'lnaddress':
    case 'lightning':
      return isLightningAddress(value)
        ? { valid: true }
        : { valid: false, error: 'Enter a Lightning Address like you@wallet.com' };
    case 'mpesa':
      return isMpesaNumber(value)
        ? { valid: true }
        : { valid: false, error: 'Enter a Kenyan number like 2547XXXXXXXX' };
    case 'tando':
      return isTandoHandle(value)
        ? { valid: true }
        : { valid: false, error: 'Enter a Kenyan number or a Lightning Address' };
    default:
      return { valid: false, error: `Unknown rail: ${rail}` };
  }
}
