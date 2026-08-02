const crypto = require('crypto');
const SettlementRail = require('./base');
const { fetchWithTimeout } = require('../src/utils/fetch-timeout');

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

    // 1. LNURL-pay metadata
    const metaRes = await fetchWithTimeout(this._resolveUrl(handle));
    if (!metaRes.ok) {
      throw new Error(`Lightning Address lookup failed (${metaRes.status})`);
    }
    const meta = await metaRes.json();
    if (meta.tag !== 'payRequest' || !meta.callback) {
      throw new Error('Endpoint is not an LNURL-pay service');
    }
    const millisats = sats * 1000;
    if (millisats < (meta.minSendable || 0) || (meta.maxSendable && millisats > meta.maxSendable)) {
      throw new Error(`Amount ${sats} sats outside the payee's accepted range`);
    }

    // 2. Callback -> bolt11 invoice
    const cbUrl = new URL(meta.callback);
    cbUrl.searchParams.set('amount', String(millisats));
    if (memo && meta.commentAllowed) {
      cbUrl.searchParams.set('comment', String(memo).slice(0, meta.commentAllowed));
    }
    const invRes = await fetchWithTimeout(cbUrl.toString());
    if (!invRes.ok) {
      throw new Error(`Invoice request failed (${invRes.status})`);
    }
    const invBody = await invRes.json();
    if (invBody.status === 'ERROR' || !invBody.pr) {
      throw new Error(invBody.reason || 'Payee did not return an invoice');
    }

    // 3. Payment hash for preimage verification (offline bolt11 parse)
    let paymentHash = null;
    try {
      const { parsePaymentRequest } = require('ln-service');
      paymentHash = parsePaymentRequest({ request: invBody.pr }).id;
    } catch (error) {
      paymentHash = null; // verification will fall back to manual
    }

    return {
      rail: this.id,
      label: this.label,
      custody: 'none',
      operator_transmitted: 0,
      lnAddress: handle,
      invoice: invBody.pr,
      paymentHash,
      // LUD-21 verify URL if the service offers it
      verifyUrl: invBody.verify || null,
      payLink: `lightning:${invBody.pr}`,
      amountSats: sats,
      currency: currency || 'SAT',
      verifyMethod: paymentHash ? 'preimage' : 'manual',
      instructions: `Pay ${sats} sats to ${handle} with any Lightning wallet.`
    };
  }

  async verify({ instruction, proof }) {
    // Preferred: preimage proof — SHA-256(preimage) must equal the invoice
    // payment hash. Pure crypto, no trust in any third party.
    const preimage = (proof?.preimage || '').trim().toLowerCase();
    const hash = (instruction?.paymentHash || '').toLowerCase();
    if (preimage && /^[0-9a-f]{64}$/.test(preimage)) {
      if (hash) {
        const computed = crypto.createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex');
        if (computed === hash) {
          return { verified: true, detail: 'preimage matches invoice payment hash' };
        }
        return { verified: false, detail: 'preimage does not match invoice' };
      }
      // No hash to check against, but a well-formed preimage was supplied.
      return { verified: false, recorded: true, detail: 'preimage recorded (no invoice hash to verify against)' };
    }

    // Fallback: LUD-21 verify URL lets the operator confirm settlement (and
    // capture the preimage) WITHOUT ever routing the payment itself.
    const verifyUrl = instruction?.verifyUrl;
    if (verifyUrl) {
      try {
        const res = await fetchWithTimeout(verifyUrl);
        if (res.ok) {
          const body = await res.json();
          if (body.status === 'OK' && body.settled) {
            return { verified: true, detail: 'confirmed settled via LUD-21 verify', confirmationCode: body.preimage || null };
          }
          return { verified: false, detail: 'LUD-21 verify reports not yet settled' };
        }
      } catch (error) {
        return { verified: false, detail: `LUD-21 verify failed: ${error.message}` };
      }
    }
    return { verified: false, detail: 'no valid preimage supplied and no verify URL available' };
  }
}

module.exports = LnAddressRail;
