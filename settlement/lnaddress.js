const SettlementRail = require('./base');
const { resolveLnurlPay, verifyLud21, LnurlError } = require('farrier-kit/lnurl');
const { verifyPreimage } = require('farrier-kit/preimage');
const { createPinnedFetch } = require('farrier-kit/node');

// One pinned fetch for resolving and verifying untrusted, driver-supplied
// Lightning Address hosts. It resolves each host once and connects to the
// validated address, so a DNS-rebinding race cannot point the operator at an
// internal service. farrier's SSRF guard and invoice gating ride on top.
const pinnedFetch = createPinnedFetch();

// Map farrier's LnurlError codes to the rail's user-facing messages.
function friendlyLnurlError(error) {
  if (!(error instanceof LnurlError)) return error;
  switch (error.code) {
    case 'BAD_ADDRESS': return new Error('A valid Lightning Address (name@domain) is required');
    case 'NOT_PAYREQUEST': return new Error('Endpoint is not an LNURL-pay service');
    case 'NO_CALLBACK': return new Error('Lightning Address response had no callback URL');
    case 'BELOW_MIN':
    case 'ABOVE_MAX': return new Error(`Amount outside the payee's accepted range (${error.message})`);
    case 'NO_INVOICE': return new Error('Payee did not return an invoice');
    case 'AMOUNT_MISMATCH': return new Error(`Payee returned an invoice for the wrong amount (${error.message})`);
    case 'NETWORK_MISMATCH': return new Error('Payee returned an invoice on the wrong Lightning network');
    case 'INVOICE_EXPIRED': return new Error('Payee returned an already-expired invoice');
    default: return error;
  }
}

/**
 * Lightning wallet-to-wallet via a Lightning Address / LNURL-pay (LUD-16/LUD-06).
 *
 * The driver advertises a Lightning Address (user@domain). At settlement the
 * operator resolves it to a bolt11 invoice for the fare amount — but the RIDER
 * pays that invoice from their OWN wallet (QR, deeplink, or NWC). The operator
 * never holds funds: custody 'none'. Payment is verified by the preimage
 * (SHA-256(preimage) === the invoice payment hash).
 *
 * This same rail carries "Tando"-style payouts: a driver who wants Kenyan
 * shillings uses a Tando Lightning Address as their handle; the rider pays
 * Lightning, Tando settles M-Pesa to the driver. From the operator's side it
 * is an ordinary Lightning Address — we are not in the flow.
 */
class LnAddressRail extends SettlementRail {
  constructor(config = {}) {
    super(config);
    this.id = 'lnaddress';
    this.label = 'Lightning';
    this.verifyMethod = 'preimage';
    // Mainnet by default. A licensed operator settling on another network
    // overrides it; the invoice the payee returns must match.
    this.network = config.network || 'bc';
  }

  static isLightningAddress(handle) {
    return typeof handle === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(handle.trim());
  }

  _resolveUrl(handle) {
    const [name, domain] = handle.trim().toLowerCase().split('@');
    if (!name || !domain) {
      throw new Error('Invalid Lightning Address');
    }
    return `https://${domain}/.well-known/lnurlp/${encodeURIComponent(name)}`;
  }

  async getPayInstructions({ handle, amountSats, currency, memo }) {
    if (!LnAddressRail.isLightningAddress(handle)) {
      throw new Error('A valid Lightning Address (name@domain) is required');
    }
    const sats = Number(amountSats);
    if (!Number.isInteger(sats) || sats <= 0) {
      throw new Error('amountSats must be a positive integer');
    }

    // farrier runs the whole LNURL-pay flow over the pinned (SSRF-safe) fetch:
    // metadata, sendable-range, callback, and it returns an invoice whose
    // amount, network, expiry and description-hash it has already checked. The
    // payment hash comes from the decoded invoice, no ln-service parse needed.
    let resolved;
    try {
      resolved = await resolveLnurlPay({
        address: handle,
        amountSats: sats,
        comment: memo ? String(memo) : undefined,
        network: this.network,
        fetchImpl: pinnedFetch,
      });
    } catch (error) {
      throw friendlyLnurlError(error);
    }

    const paymentHash = resolved.paymentHashHex || null;
    return {
      rail: this.id,
      label: this.label,
      custody: 'none',
      operator_transmitted: 0,
      lnAddress: handle,
      invoice: resolved.bolt11,
      paymentHash,
      // LUD-21 verify URL if the service offers it (already origin-checked).
      verifyUrl: resolved.verifyUrl || null,
      payLink: `lightning:${resolved.bolt11}`,
      amountSats: sats,
      currency: currency || 'SAT',
      verifyMethod: paymentHash ? 'preimage' : 'manual',
      instructions: `Pay ${sats} sats to ${handle} with any Lightning wallet.`
    };
  }

  async verify({ instruction, proof }) {
    // Preferred: preimage proof — SHA-256(preimage) must equal the invoice
    // payment hash. Pure crypto, no trust in any third party. farrier's
    // verifyPreimage is the constant-time check.
    const preimage = (proof?.preimage || '').trim().toLowerCase();
    const hash = (instruction?.paymentHash || '').toLowerCase();
    if (preimage && /^[0-9a-f]{64}$/.test(preimage)) {
      if (hash) {
        if (verifyPreimage(preimage, hash)) {
          return { verified: true, detail: 'preimage matches invoice payment hash' };
        }
        // A preimage was supplied and definitively contradicts the invoice.
        return { verified: false, failed: true, detail: 'preimage does not match invoice' };
      }
      // No hash to check against, but a well-formed preimage was supplied.
      return { verified: false, recorded: true, detail: 'preimage recorded (no invoice hash to verify against)' };
    }

    // Fallback: LUD-21 verify URL lets the operator confirm settlement WITHOUT
    // ever routing the payment. farrier cross-checks the service's preimage
    // against the invoice payment hash, so a bare "settled" claim is not proof.
    const verifyUrl = instruction?.verifyUrl;
    if (verifyUrl) {
      try {
        const result = await verifyLud21({
          verifyUrl,
          paymentHashHex: hash || undefined,
          fetchImpl: pinnedFetch,
        });
        if (result.verified) {
          return { verified: true, detail: 'confirmed settled via LUD-21 (preimage verified against the invoice payment hash)', confirmationCode: result.preimage || null };
        }
        if (result.settled) {
          return { verified: false, detail: 'LUD-21 service reports settled but its preimage did not verify against the invoice payment hash' };
        }
        return { verified: false, detail: 'LUD-21 verify reports not yet settled' };
      } catch (error) {
        return { verified: false, detail: `LUD-21 verify failed: ${error.message}` };
      }
    }
    return { verified: false, detail: 'no valid preimage supplied and no verify URL available' };
  }
}

module.exports = LnAddressRail;
