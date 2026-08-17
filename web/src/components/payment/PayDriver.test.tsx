import { describe, it, expect, vi, beforeEach } from 'vitest';
// No global setup file, so auto-cleanup is off: without this each test's DOM
// stays mounted and queries find the PREVIOUS test's output.
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

/**
 * An unknown payment outcome must be a dead end for the RETRY, not for the
 * payer.
 *
 * Once a pay_invoice request reaches the relay the wallet may have paid, so a
 * timeout or an unreadable answer means nobody knows. Reporting that as
 * "failed" invites a second payment, so the pay button is withheld. But the
 * copy tells the payer to check their wallet and try again — and with a wallet
 * connected the connect form does not render either, so if the unknown state is
 * never cleared there is no route back at all and the instruction is a lie.
 */

const NwcUnknownOutcomeError = class extends Error {
  readonly ambiguous = true;
};

const payInvoiceViaNwc = vi.fn();
const getPayInstruction = vi.fn();
const getPaymentOptions = vi.fn();
const settleRide = vi.fn();

vi.mock('../../services/nwc', () => ({
  getStoredNwcUri: () => 'nostr+walletconnect://deadbeef?relay=wss://r&secret=abc',
  setStoredNwcUri: vi.fn(),
  payInvoiceViaNwc: (...args: unknown[]) => payInvoiceViaNwc(...args),
  isUnknownOutcome: (e: unknown) => !!e && typeof e === 'object'
    && (e as { ambiguous?: boolean }).ambiguous === true,
}));

vi.mock('../../services/api', () => ({
  getPaymentOptions: (...a: unknown[]) => getPaymentOptions(...a),
  getPayInstruction: (...a: unknown[]) => getPayInstruction(...a),
  settleRide: (...a: unknown[]) => settleRide(...a),
}));

vi.mock('../../context/DomainContext', () => ({
  useDomain: () => ({ profile: { roles: { provider: 'driver' } } }),
}));

vi.mock('../../services/pricing', () => ({
  formatFiatAmount: (n: number) => `£${n}`,
}));

// Presentational children, stubbed so this stays a test of PayDriver's own
// state machine rather than of price formatting or QR rendering.
vi.mock('../common/DualPrice', () => ({
  DualPrice: ({ sats }: { sats: number }) => <span>{sats} sats</span>,
}));

vi.mock('./QrCodeSvg', () => ({
  QrCodeSvg: () => <svg />,
}));

const { PayDriver } = await import('./PayDriver');

const task = {
  id: 'ride_test',
  fareEstimateSats: 5000,
  operatorBase: undefined,
} as never;

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  getPaymentOptions.mockResolvedValue({ methods: [{ rail: 'lnaddress' }] });
  getPayInstruction.mockResolvedValue({
    rail: 'lnaddress',
    invoice: 'lnbc50u1ptestinvoice',
    payLink: 'lightning:lnbc50u1ptestinvoice',
    amountSats: 5000,
  });
});

/** Select the Lightning rail and wait for its invoice to render */
async function openLightning() {
  render(<PayDriver task={task} />);
  await waitFor(() => expect(screen.getByText('Lightning')).toBeTruthy());
  fireEvent.click(screen.getByText('Lightning'));
  await waitFor(() => expect(payButton()).toBeTruthy());
}

/** The "pay with connected wallet" button, or null when withheld */
function payButton() {
  return screen.queryByRole('button', { name: /connected wallet/i });
}

describe('PayDriver, unknown NWC outcome', () => {
  it('withholds the pay button so an unknown outcome cannot be retried blindly', async () => {
    payInvoiceViaNwc.mockRejectedValue(new NwcUnknownOutcomeError('Wallet did not respond in time'));
    await openLightning();

    fireEvent.click(payButton()!);

    await waitFor(() => expect(payButton()).toBeNull());
    // ...and the payer is told it is unknown rather than failed
    expect(screen.getByRole('alert')).toBeTruthy();
    // nothing was recorded: the operator is not told a payment happened
    expect(settleRide).not.toHaveBeenCalled();
  });

  it('does NOT re-arm one-tap pay when a different invoice is minted', async () => {
    // The dangerous case: the old invoice was near expiry or the fare moved, so
    // the server mints a NEW payable invoice. The journey may already be paid,
    // and this button would pay it again. Previously the guard was both inert
    // (cleared up front, so nothing was left to compare) and inverted (it
    // withheld on a match and re-armed on a difference).
    payInvoiceViaNwc.mockRejectedValue(new NwcUnknownOutcomeError('Wallet did not respond in time'));
    await openLightning();
    fireEvent.click(payButton()!);
    await waitFor(() => expect(payButton()).toBeNull());

    getPayInstruction.mockResolvedValue({
      rail: 'lnaddress',
      invoice: 'lnbc50u1pDIFFERENTinvoice',
      payLink: 'lightning:lnbc50u1pDIFFERENTinvoice',
      amountSats: 6200,
    });
    fireEvent.click(screen.getByText(/Choose a different method/i));
    fireEvent.click(screen.getByText('Lightning'));

    await waitFor(() => expect(getPayInstruction).toHaveBeenCalledTimes(2));
    expect(payButton()).toBeNull();
    // ...and they are still told what to do instead
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('re-arms one-tap pay when the SAME invoice comes back', async () => {
    // Server-side reuse hands back the identical invoice, and Lightning itself
    // refuses a second payment of one bolt11 — so this is the one safe re-arm.
    // Without it the path is stranded: with a wallet connected the connect form
    // does not render either, while the copy tells the payer to try again.
    payInvoiceViaNwc.mockRejectedValue(new NwcUnknownOutcomeError('Wallet did not respond in time'));
    await openLightning();
    fireEvent.click(payButton()!);
    await waitFor(() => expect(payButton()).toBeNull());

    // The retry the copy tells them to make: go back, choose the rail again
    fireEvent.click(screen.getByText(/Choose a different method/i));
    fireEvent.click(screen.getByText('Lightning'));

    await waitFor(() => expect(payButton()).toBeTruthy());
  });

  it('reports a definite failure as a failure, leaving the button live', async () => {
    payInvoiceViaNwc.mockRejectedValue(new Error('no route'));
    await openLightning();
    fireEvent.click(payButton()!);

    // A definite failure proves nothing was paid, so retrying is safe and the
    // button must stay available
    await waitFor(() => expect(screen.getByText('no route')).toBeTruthy());
    expect(payButton()).toBeTruthy();
  });

  it('keeps a successful preimage where the payer can resubmit it', async () => {
    // Recording can fail on its own long after the money moved. Discarding the
    // one piece of evidence the payment happened would leave the payer unable
    // to prove it.
    const preimage = 'ab'.repeat(32);
    payInvoiceViaNwc.mockResolvedValue({ preimage });
    settleRide.mockRejectedValue(new Error('operator unreachable'));
    await openLightning();
    fireEvent.click(payButton()!);

    await waitFor(() => {
      const field = screen.getByPlaceholderText(/preimage/i) as HTMLInputElement;
      expect(field.value).toBe(preimage);
    });
  });
});
