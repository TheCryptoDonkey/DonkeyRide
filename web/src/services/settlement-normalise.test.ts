import { describe, it, expect } from 'vitest';
import { normaliseTask } from './api';

/**
 * The settlement normaliser is an ALLOWLIST, so any field the server adds and
 * it does not name is dropped silently — the component reading it sees
 * `undefined` and renders a blank where a number should be.
 *
 * That is not theoretical. The provider's shortfall notice (ConfirmReceipt)
 * reads paidAmountSats/expectedAmountSats, and those two numbers ARE the
 * meaning of a 'short' status: without them it says "covers ? sats, but the
 * fare is ? sats", which alarms the party losing money without telling them
 * anything. A component test that supplies the settlement prop directly cannot
 * catch it, because it never crosses this boundary.
 */

/** What the server actually puts on a ride for a proven-but-short payment */
const rideWithShortSettlement = {
  id: 'ride_x',
  status: 'completed',
  fare: 6200,
  settlementRecord: {
    rail: 'lnaddress',
    custody: 'none',
    operator_transmitted: 0,
    settlement: 'peer-to-peer',
    verified: false,
    status: 'short',
    detail: 'preimage proves payment of 5000 sats, but the fare is now 6200 sats',
    confirmationCode: null,
    paidAmountSats: 5000,
    expectedAmountSats: 6200,
    declaredBy: 'requester',
    timestamp: 1785789102593,
  },
};

describe('settlement normalisation', () => {
  it('carries the figures a shortfall is made of', () => {
    const task = normaliseTask(rideWithShortSettlement);

    expect(task.settlement?.status).toBe('short');
    expect(task.settlement?.verified).toBe(false);
    expect(task.settlement?.paidAmountSats).toBe(5000);
    expect(task.settlement?.expectedAmountSats).toBe(6200);
  });

  it('carries the detail explaining why a proof was refused', () => {
    const task = normaliseTask(rideWithShortSettlement);
    expect(task.settlement?.detail).toContain('5000');
  });

  it('leaves the amounts undefined rather than guessing when absent', () => {
    // An ordinary verified settlement has no shortfall figures, and must not
    // acquire zeroes — ConfirmReceipt keys its notice off the status, but a 0
    // would read as "they paid nothing" anywhere else.
    const task = normaliseTask({
      id: 'ride_y',
      status: 'completed',
      settlementRecord: { rail: 'lnaddress', status: 'verified', verified: true },
    });

    expect(task.settlement?.verified).toBe(true);
    expect(task.settlement?.paidAmountSats).toBeUndefined();
    expect(task.settlement?.expectedAmountSats).toBeUndefined();
  });

  it('still normalises the legacy `settlement` key as well as settlementRecord', () => {
    const task = normaliseTask({
      id: 'ride_z',
      status: 'completed',
      settlement: { rail: 'cash', status: 'confirmed', confirmedByProvider: true },
    });

    expect(task.settlement?.rail).toBe('cash');
    expect(task.settlement?.confirmedByProvider).toBe(true);
  });
});
