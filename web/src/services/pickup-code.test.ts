import { describe, it, expect } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { derivePickupCode } from './pickup-code';
import { bytesToHex } from './nostr';

function makeIdentity() {
  const priv = generateSecretKey();
  return { privHex: bytesToHex(priv), pub: getPublicKey(priv) };
}

describe('pickup code', () => {
  it('both sides derive the identical code', async () => {
    const rider = makeIdentity();
    const driver = makeIdentity();
    const fromRider = await derivePickupCode(rider.privHex, driver.pub, 'ride-1');
    const fromDriver = await derivePickupCode(driver.privHex, rider.pub, 'ride-1');
    expect(fromRider).toEqual(fromDriver);
    expect(fromRider.pin).toMatch(/^\d{4}$/);
    expect(fromRider.word.length).toBeGreaterThan(2);
  });

  it('changes per ride and per pair — an impostor cannot reuse one', async () => {
    const rider = makeIdentity();
    const driver = makeIdentity();
    const impostor = makeIdentity();

    const real = await derivePickupCode(rider.privHex, driver.pub, 'ride-1');
    const otherRide = await derivePickupCode(rider.privHex, driver.pub, 'ride-2');
    // The impostor knows the ride id and both PUBLIC keys, but derives
    // with their own key — a different pair secret, a different code
    const forged = await derivePickupCode(impostor.privHex, rider.pub, 'ride-1');

    expect(otherRide).not.toEqual(real);
    expect(forged).not.toEqual(real);
  });
});
