import { describe, it, expect, vi, beforeEach } from 'vitest';
// No global setup file, so auto-cleanup is off: without this each test's DOM
// stays mounted and queries find the PREVIOUS test's output.
import { render, screen, cleanup } from '@testing-library/react';

/**
 * A short payment must be disclosed to the party who loses by it.
 *
 * When a rider's preimage proves payment of less than the fare now owed — the
 * fare moves after an invoice is minted, via waiting time or a changed
 * destination — the operator records status 'short' rather than 'verified'.
 * But this screen treats any status as "the rider says they paid, confirm
 * receipt", so without an explicit notice the driver is asked to confirm a
 * shortfall they were never told about. They are the one out of pocket.
 */

vi.mock('../../context/DomainContext', () => ({
  useDomain: () => ({ profile: { roles: { requester: 'rider' } } }),
}));

vi.mock('../../services/api', () => ({
  confirmReceived: vi.fn(),
}));

const { ConfirmReceipt } = await import('./ConfirmReceipt');

const task = { id: 'ride_test', operatorBase: undefined } as never;

beforeEach(() => cleanup());

describe('ConfirmReceipt, short payments', () => {
  it('tells the driver the shortfall, with both figures, before they confirm', () => {
    render(
      <ConfirmReceipt
        task={task}
        settlement={{
          rail: 'lnaddress',
          status: 'short',
          verified: false,
          paidAmountSats: 5000,
          expectedAmountSats: 6200,
        }}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('5000');
    expect(alert.textContent).toContain('6200');
    // ...and the confirm button is still offered, because acknowledging what
    // actually arrived is the driver's call, not the operator's
    expect(screen.getByRole('button', { name: /confirm/i })).toBeTruthy();
  });

  it('says nothing about a shortfall on an ordinary verified payment', () => {
    render(
      <ConfirmReceipt
        task={task}
        settlement={{ rail: 'lnaddress', status: 'verified', verified: true }}
      />,
    );

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: /confirm/i })).toBeTruthy();
  });

  it('shows nothing at all once the driver has confirmed', () => {
    render(
      <ConfirmReceipt
        task={task}
        settlement={{ rail: 'lnaddress', status: 'short', confirmedByProvider: true }}
      />,
    );

    // A confirmed settlement is closed: no alert, no second confirm button
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: /confirm receipt|confirm received/i })).toBeNull();
  });
});
