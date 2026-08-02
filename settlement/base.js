/**
 * Non-custodial settlement rails.
 *
 * These are fundamentally different from payment-providers/ (which manage
 * custodial escrow stakes). A settlement rail NEVER touches funds: it turns a
 * driver's payout handle into something the RIDER pays DIRECTLY, and verifies
 * or records that a direct rider->driver payment happened. The operator is
 * only ever a coordinator and witness.
 *
 * Every rail reports custody 'none' — if a rail cannot guarantee that, it does
 * not belong here.
 */
class SettlementRail {
  constructor(config = {}) {
    this.config = config;
    this.id = 'base';
    this.label = 'Base';
    // 'preimage' | 'confirmation_code' | 'manual'
    this.verifyMethod = 'manual';
  }

  custody() {
    return 'none';
  }

  /**
   * Turn a driver payout handle + amount into a payable artefact for the rider.
   * @param {Object} req - { handle, amountSats, amount, currency, memo }
   * @returns {Promise<Object>} instruction the rider acts on directly
   */
  async getPayInstructions() {
    throw new Error('getPayInstructions not implemented');
  }

  /**
   * Verify a direct rider->driver payment from proof the rider supplies.
   * @param {Object} args - { instruction, proof }
   * @returns {Promise<{verified: boolean, detail?: string}>}
   */
  async verify() {
    return { verified: false, detail: 'verification not supported for this rail' };
  }
}

module.exports = SettlementRail;
