const SettlementRail = require('./base');

/**
 * Card — paid on the DRIVER'S terminal, not the operator's.
 *
 * Most riders want to pay by card, and a card payment is an acquirer model:
 * money moves cardholder -> acquirer -> merchant, and somebody has to be the
 * merchant of record. The whole posture of this operator depends on that
 * somebody NOT being us. So it is the driver: their own Tap to Pay on
 * iPhone/Android, or their own SumUp/Zettle/Square reader, settling to their
 * own bank under their own merchant agreement. This is already how a minicab
 * card machine works — it belongs to the driver, not the platform.
 *
 * The operator advertises that the driver takes cards, shows the amount, and
 * records the receipt reference. It never sees, routes, or holds the payment.
 * custody 'none', operator_transmitted 0.
 *
 * What this rail is NOT: it is not "card on file, charged automatically at
 * drop-off". That requires a merchant of record in the middle, which is a
 * money-transmitter posture and belongs behind OPERATOR_LICENSED_CUSTODIAN
 * with a real acquirer relationship — not here.
 */

/** Terminals a driver might plausibly name. Free text, capped, never PII. */
const MAX_PROVIDER_LEN = 32;

class CardRail extends SettlementRail {
  constructor(config = {}) {
    super(config);
    this.id = 'card';
    this.label = 'Card';
    this.verifyMethod = 'confirmation_code';
  }

  /**
   * The driver's optional terminal name ("SumUp", "Tap to Pay"). Not a payment
   * endpoint and not PII — it just tells the rider what to expect at the kerb.
   * Blank is fine: "the driver takes cards" is the whole message.
   */
  static isTerminalName(handle) {
    if (handle == null) return true;
    if (typeof handle !== 'string') return false;
    const raw = handle.trim();
    if (raw === '') return true;
    if (raw.length > MAX_PROVIDER_LEN) return false;
    // Letters, digits, spaces and the punctuation a brand name actually uses.
    // Deliberately narrow: this is displayed to a rider and must never be a
    // place to smuggle a long digit string.
    return /^[\p{L}\p{N} .,'&+/-]+$/u.test(raw) && !CardRail.looksLikeCardNumber(raw);
  }

  /**
   * Anything that could be a PAN. The operator must never receive, log, or
   * store card data — accepting it would drag a deliberately out-of-scope
   * coordination service into PCI DSS. Cashu's rail refuses a pasted token
   * for the same class of reason: some values must not pass through here.
   */
  static looksLikeCardNumber(value) {
    if (typeof value !== 'string') return false;
    const digits = value.replace(/[\s-]/g, '');
    if (!/^\d{12,19}$/.test(digits)) return false;
    // Luhn — so an ordinary long reference is not mistaken for a card
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

  async getPayInstructions({ handle, amountSats, amount, currency }) {
    if (!CardRail.isTerminalName(handle)) {
      throw new Error('Invalid card terminal name');
    }
    // Cards move fiat, so the rider sees the fiat figure they will approve on
    // the terminal. Fall back to sats only if no fiat was derived.
    const cur = currency || 'GBP';
    const displayAmount = amount != null
      ? Math.round(amount * 100) / 100
      : amountSats;
    const terminal = typeof handle === 'string' && handle.trim() !== ''
      ? handle.trim()
      : null;

    return {
      rail: this.id,
      label: this.label,
      custody: 'none',
      operator_transmitted: 0,
      terminal,
      amount: displayAmount,
      currency: cur,
      verifyMethod: 'confirmation_code',
      instructions: terminal
        ? `Pay ${displayAmount} ${cur} on your driver's ${terminal} card reader.`
        : `Pay ${displayAmount} ${cur} by card on your driver's own card reader.`,
      // Said plainly because a rider handing over a card deserves to know who
      // is taking the money
      note: 'The payment goes directly to your driver. DonkeyRide never sees your card.'
    };
  }

  /**
   * Record the terminal's receipt/authorisation reference, if the rider has
   * one to hand. The operator cannot verify another party's acquirer, so this
   * is attestation for a dispute — the driver confirming receipt is what
   * actually settles the ride.
   */
  async verify({ proof } = {}) {
    const raw = typeof proof?.confirmationCode === 'string'
      ? proof.confirmationCode.trim()
      : '';

    if (CardRail.looksLikeCardNumber(raw)) {
      // Refuse outright rather than store it: a card number must never reach
      // this operator, and quietly discarding it would teach a client that
      // sending one is fine.
      //
      // Flagged client-safe so the rider is actually TOLD why. This is the
      // one moment where a generic "something went wrong" is worse than
      // useless — the person needs to learn not to do it again.
      const err = new Error(
        'That looks like a card number — never send card details. Enter the receipt reference instead.'
      );
      err.clientSafe = true;
      err.status = 400;
      throw err;
    }

    if (raw === '') {
      return { verified: false, detail: 'card is confirmed by the driver on receipt' };
    }

    // Terminal references are short and alphanumeric; anything else is noise
    const code = raw.toUpperCase();
    if (!/^[A-Z0-9-]{4,24}$/.test(code)) {
      return { verified: false, detail: 'unrecognised receipt reference' };
    }

    return {
      verified: false,
      recorded: true,
      confirmationCode: code,
      detail: 'receipt reference recorded; awaiting driver confirmation'
    };
  }
}

module.exports = CardRail;
