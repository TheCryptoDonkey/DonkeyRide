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

/**
 * A Cashu NUT-18 payment request. Optional for that rail — blank means
 * "any Cashu token, sent over the chat".
 */
export function isCashuPaymentRequest(handle: string): boolean {
  return typeof handle === 'string' && /^creq[a-z0-9]/i.test(handle.trim());
}

/**
 * Anything that could be a card number, by Luhn. Mirrors settlement/card.js:
 * a PAN must never be typed into this app, let alone sent to the operator.
 */
export function looksLikeCardNumber(value: string): boolean {
  if (typeof value !== 'string') return false;
  const digits = value.replace(/[\s-]/g, '');
  if (!/^\d{12,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Rails whose handle is genuinely optional. Cash needs nothing at all; a card
 * reader's brand and a Cashu payment request are both nice-to-have. Requiring
 * them made the rail impossible to enable — which is how Cashu came to be
 * unselectable ("Enter a handle" when blank, "Unknown rail" when not).
 */
const OPTIONAL_HANDLE = new Set(['cash', 'card', 'tap-to-pay', 'cashu']);

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

  // Nothing to enter is a valid answer for these
  if (!value && OPTIONAL_HANDLE.has(railId)) {
    return { valid: true };
  }
  if (!value) {
    return { valid: false, error: 'Enter a handle' };
  }

  switch (railId) {
    case 'cash':
      return { valid: true };
    case 'card':
    case 'tap-to-pay':
      // The reader's brand, shown to the rider — never a card number
      if (looksLikeCardNumber(value)) {
        return { valid: false, error: 'Never enter a card number. Name your reader, e.g. SumUp.' };
      }
      return value.length <= 32
        ? { valid: true }
        : { valid: false, error: 'Keep the reader name short, e.g. SumUp' };
    case 'cashu':
      return isCashuPaymentRequest(value)
        ? { valid: true }
        : { valid: false, error: 'Enter a creq… payment request, or leave blank' };
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
