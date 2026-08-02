const SettlementRail = require('./base');

/**
 * M-Pesa, non-custodial (direct "Send Money", phone-to-phone).
 *
 * The rider sends the fare DIRECTLY to the driver's M-Pesa number using their
 * own M-Pesa; Safaricom moves the money account-to-account. The operator only
 * shows the rider the driver's number and amount, then records the M-Pesa
 * confirmation code the rider (and driver) can see. The operator NEVER runs a
 * paybill/till that collects then disburses — that would make it a fund
 * aggregator / money transmitter. custody 'none'.
 *
 * The driver's phone number is PII: it is shared per-ride to the matched rider
 * only and never published to a relay.
 *
 * Optional (Mode-B, licensed operators): a read-only Daraja transaction-status
 * check can auto-verify the confirmation code. That path is gated behind
 * operator-supplied credentials and is NOT part of the default deployment.
 */
class MpesaRail extends SettlementRail {
  constructor(config = {}) {
    super(config);
    this.id = 'mpesa';
    this.label = 'M-Pesa';
    this.verifyMethod = 'confirmation_code';
  }

  static isMpesaNumber(handle) {
    if (typeof handle !== 'string') return false;
    // Kenyan MSISDN: 2547XXXXXXXX / 07XXXXXXXX / +2547XXXXXXXX / 2541XXXXXXXX
    const cleaned = handle.replace(/[\s-]/g, '');
    return /^(?:\+?254|0)(?:7|1)\d{8}$/.test(cleaned);
  }

  async getPayInstructions({ handle, amountSats, amount, currency }) {
    if (!MpesaRail.isMpesaNumber(handle)) {
      throw new Error('A valid M-Pesa number is required');
    }
    // M-Pesa moves fiat, so show the fiat figure the rider types into their own
    // M-Pesa menu. KES is transacted in whole shillings; other currencies keep
    // two decimals. Fall back to the sats figure only if no fiat was supplied.
    const cur = currency || 'KES';
    let displayAmount;
    if (amount != null) {
      displayAmount = cur === 'KES' ? Math.round(amount) : Math.round(amount * 100) / 100;
    } else {
      displayAmount = amountSats;
    }
    return {
      rail: this.id,
      label: this.label,
      custody: 'none',
      operator_transmitted: 0,
      mpesaNumber: handle,
      amount: displayAmount,
      currency: cur,
      verifyMethod: 'confirmation_code',
      // Steps the rider follows in their own M-Pesa menu / app
      instructions: `Send ${displayAmount} ${cur} to ${handle} via M-Pesa "Send Money", then enter the confirmation code below.`
    };
  }

  async verify({ proof }) {
    // Default: record the rider-supplied M-Pesa confirmation code. Genuine
    // auto-verification requires a licensed Daraja integration (Mode-B); here
    // we record the code as attestation and let the driver confirm receipt.
    const supplied = typeof proof?.confirmationCode === 'string' && proof.confirmationCode.trim() !== '';
    const code = (proof?.confirmationCode || '').trim().toUpperCase();
    if (/^[A-Z0-9]{8,12}$/.test(code)) {
      return { verified: false, recorded: true, confirmationCode: code, detail: 'confirmation code recorded; awaiting driver confirmation' };
    }
    // A code was typed but is malformed = a failed proof; no code at all = simply
    // awaiting one (declared), which the driver still confirms on receipt.
    return { verified: false, failed: supplied, detail: supplied ? 'M-Pesa confirmation code is malformed' : 'no M-Pesa confirmation code supplied yet' };
  }
}

module.exports = MpesaRail;
