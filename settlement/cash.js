const SettlementRail = require('./base');

/**
 * Cash in hand — the simplest non-custodial rail. The rider pays the driver
 * directly in person; the operator only records that it was agreed. Manual
 * confirmation by the driver.
 */
class CashRail extends SettlementRail {
  constructor(config = {}) {
    super(config);
    this.id = 'cash';
    this.label = 'Cash';
    this.verifyMethod = 'manual';
  }

  async getPayInstructions({ amountSats, amount, currency }) {
    // Show the fiat figure (rounded for human display) when we have one, else
    // fall back to the sats amount.
    const displayAmount = amount != null ? Math.round(amount * 100) / 100 : amountSats;
    return {
      rail: this.id,
      label: this.label,
      custody: 'none',
      operator_transmitted: 0,
      amount: displayAmount,
      currency: currency || 'GBP',
      verifyMethod: 'manual',
      instructions: `Pay your driver ${displayAmount} ${currency || 'GBP'} directly.`
    };
  }

  async verify() {
    // Cash is confirmed by the driver marking the ride settled, not by proof.
    return { verified: false, detail: 'cash is confirmed by the driver on receipt' };
  }
}

module.exports = CashRail;
