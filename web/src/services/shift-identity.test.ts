import { describe, expect, it } from 'vitest';
import { getPublicKey } from 'nostr-tools';
import { hexToBytes } from './nostr';
import { EphemeralShiftIdentity } from './shift-identity';

describe('EphemeralShiftIdentity', () => {
  it('keeps one valid anonymous key for an online shift', async () => {
    const identity = new EphemeralShiftIdentity();
    const [first, concurrent] = await Promise.all([
      identity.privateKey(), identity.privateKey(),
    ]);

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(concurrent).toBe(first);
    expect(getPublicKey(hexToBytes(first))).toMatch(/^[0-9a-f]{64}$/);
    expect(await identity.privateKey()).toBe(first);
  });

  it('forgets the key offline and creates an unlinkable next shift', async () => {
    const identity = new EphemeralShiftIdentity();
    const first = await identity.privateKey();

    identity.clear();

    expect(await identity.privateKey()).not.toBe(first);
  });
});
