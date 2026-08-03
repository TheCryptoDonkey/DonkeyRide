import { describe, it, expect, vi, beforeEach } from 'vitest';
// No global setup file, so auto-cleanup is off: without this each test's
// DOM stays mounted and queries find the PREVIOUS test's output.
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { bytesToHex } from '../../services/nostr';

// The identity loads asynchronously, so this hook returns null on the first
// render and a key some time later. That ordering is the whole point here.
const identityState: { identity: { privKeyHex: string; pubKeyHex: string } | null } = {
  identity: null,
};
vi.mock('../../context/IdentityContext', () => ({
  useIdentity: () => identityState,
}));

const { PickupCode } = await import('./PickupCode');

const rider = (() => {
  const priv = generateSecretKey();
  return { privKeyHex: bytesToHex(priv), pubKeyHex: getPublicKey(priv) };
})();
const driverPubkey = getPublicKey(generateSecretKey());

describe('PickupCode', () => {
  beforeEach(() => {
    cleanup();
    identityState.identity = null;
  });

  it('shows the code once the identity is available', async () => {
    identityState.identity = rider;
    render(
      <PickupCode
        taskId="ride_1"
        counterpartyPubkey={driverPubkey}
        role="requester"
        counterpartyLabel="driver"
      />,
    );
    await waitFor(() => expect(screen.getByText(/^\d{4}$/)).toBeTruthy());
  });

  it('still appears when it mounted BEFORE the identity loaded', async () => {
    // The regression: nothing gates this component on identity, so on a
    // reload it mounts first. Reading the key once at mount meant the effect
    // bailed and never ran again — the code was absent for the rest of the
    // session, exactly when someone reopens the app at the kerb to check
    // they are getting into the right car.
    const { rerender } = render(
      <PickupCode
        taskId="ride_1"
        counterpartyPubkey={driverPubkey}
        role="requester"
        counterpartyLabel="driver"
      />,
    );
    expect(screen.queryByText(/^\d{4}$/)).toBeNull();

    identityState.identity = rider;
    rerender(
      <PickupCode
        taskId="ride_1"
        counterpartyPubkey={driverPubkey}
        role="requester"
        counterpartyLabel="driver"
      />,
    );

    await waitFor(() => expect(screen.getByText(/^\d{4}$/)).toBeTruthy());
  });

  it('renders nothing without a counterparty to derive against', async () => {
    identityState.identity = rider;
    const { container } = render(
      <PickupCode taskId="ride_1" counterpartyPubkey="" role="requester" counterpartyLabel="driver" />,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(container.textContent).toBe('');
  });
});
