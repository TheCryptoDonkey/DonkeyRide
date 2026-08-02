const SettlementRail = require('./base');

/**
 * Cashu ecash, non-custodial (token passes rider -> driver directly).
 *
 * The rider's wallet mints a Cashu token for the fare and hands it to
 * the driver over the in-app E2E encrypted chat (NIP-17); the driver
 * redeems it at the mint with their own wallet. The token IS the money:
 * it must therefore NEVER pass through the operator — an operator that
 * carried it could redeem it, which is custody. This rail is strictly
 * record-only: the operator shows instructions, records the rider's
 * declaration, and the driver's confirm-received is the backstop.
 *
 * The driver may optionally advertise a NUT-18 payment request
 * (creq...) naming their preferred mints; it is a payment endpoint like
 * a Lightning Address, safe to publish.
 */
class CashuRail extends SettlementRail {
  constructor(config = {}) {
    super(config);
    this.id = 'cashu';
    this.label = 'Cashu (ecash)';
    this.verifyMethod = 'declared';
  }

  /** NUT-18 payment request: "creq" + version char + base64url payload */
  static isPaymentRequest(handle) {
    if (typeof handle !== 'string') return false;
    return /^creq[A-Za-z0-9._~+/=-]{8,}$/.test(handle.trim());
  }

  async getPayInstructions({ handle, amountSats }) {
    return {
      rail: this.id,
      label: this.label,
      custody: 'none',
      operator_transmitted: 0,
      amount: amountSats,
      currency: 'SAT',
      ...(CashuRail.isPaymentRequest(handle) ? { paymentRequest: handle.trim() } : {}),
      verifyMethod: 'declared',
      instructions: `Create a Cashu token for ${amountSats} sats in your own wallet and send it to your driver in the chat — it's end-to-end encrypted, so only they can redeem it. Never send the token to anyone else.`
    };
  }

  async verify({ proof }) {
    // A pasted token would let the OPERATOR redeem it — refuse loudly
    // rather than quietly becoming a custodian.
    const pasted = typeof proof?.token === 'string' && proof.token.trim().startsWith('cashu');
    if (pasted) {
      return {
        verified: false,
        failed: true,
        detail: 'never send the Cashu token to the operator — send it to your driver in the chat, they redeem it themselves'
      };
    }
    return {
      verified: false,
      detail: 'ecash declared; awaiting driver confirmation after redeeming the token'
    };
  }
}

module.exports = CashuRail;
