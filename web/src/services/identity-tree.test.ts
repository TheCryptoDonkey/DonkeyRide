import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPublicKey, nip19 } from 'nostr-tools';

const protectedRecords = vi.hoisted(() => new Map<string, string>());

vi.mock('./secure-device-storage', () => ({
  secureDeviceEnvelope: (name: string) => protectedRecords.has(name)
    ? JSON.stringify({ v: 1, cipher: 'test-only' })
    : null,
  secureDeviceGet: async (name: string) => protectedRecords.get(name) ?? null,
  secureDeviceSet: async (name: string, value: string) => { protectedRecords.set(name, value); },
  secureDeviceRemove: (name: string) => { protectedRecords.delete(name); },
}));

const {
  getIdentityKeyModel,
  loadIdentityTreePersona,
  restoreIdentityTree,
  revealIdentityTreeRecoveryKey,
  startFreshIdentityTree,
} = await import('./identity-tree');

beforeEach(() => {
  localStorage.clear();
  protectedRecords.clear();
  localStorage.setItem('donkeyride.coordination.mode', 'direct');
});

describe('identity tree personas', () => {
  it('creates one unpublished root and deterministic unlinkable role identities', async () => {
    const rider = await loadIdentityTreePersona('requester');
    const driver = await loadIdentityTreePersona('provider');
    const riderAgain = await loadIdentityTreePersona('requester');

    expect(getIdentityKeyModel()).toBe('tree');
    expect(protectedRecords.get('donkeyride.identityTreeRoot')).toMatch(/^[0-9a-f]{64}$/);
    expect(riderAgain).toEqual(rider);
    expect(driver?.pubKeyHex).not.toBe(rider?.pubKeyHex);

    const recovery = await revealIdentityTreeRecoveryKey();
    const decoded = nip19.decode(recovery!);
    expect(decoded.type).toBe('nsec');
    const rootPubkey = getPublicKey(new Uint8Array(decoded.data as Uint8Array));
    expect(rootPubkey).not.toBe(rider?.pubKeyHex);
    expect(rootPubkey).not.toBe(driver?.pubKeyHex);
    expect(JSON.stringify(localStorage)).not.toContain(rootPubkey);
  });

  it('derives a different persona for every selected managed operator', async () => {
    localStorage.setItem('donkeyride.coordination.mode', 'managed');
    localStorage.setItem('donkeyride.operator.origin', 'https://firm-a.example');
    const firmA = await loadIdentityTreePersona('provider');

    localStorage.setItem('donkeyride.operator.origin', 'https://firm-b.example');
    const firmB = await loadIdentityTreePersona('provider');

    expect(firmA?.pubKeyHex).not.toBe(firmB?.pubKeyHex);
  });

  it('never auto-migrates or replaces an existing identity', async () => {
    const legacyKey = '11'.repeat(32);
    protectedRecords.set('donkeyride.providerPrivKey', legacyKey);

    expect(await loadIdentityTreePersona('provider')).toBeNull();
    expect(getIdentityKeyModel()).toBe('legacy');
    expect(protectedRecords.get('donkeyride.providerPrivKey')).toBe(legacyKey);
    expect(protectedRecords.has('donkeyride.identityTreeRoot')).toBe(false);
  });

  it('requires an explicit fresh start to discard legacy role records', async () => {
    protectedRecords.set('donkeyride.providerPrivKey', '22'.repeat(32));
    localStorage.setItem('donkeyride.requesterPrivKey', '33'.repeat(32));

    await startFreshIdentityTree();

    expect(getIdentityKeyModel()).toBe('tree');
    expect(protectedRecords.has('donkeyride.providerPrivKey')).toBe(false);
    expect(localStorage.getItem('donkeyride.requesterPrivKey')).toBeNull();
    expect(await loadIdentityTreePersona('provider')).not.toBeNull();
  });

  it('restores every derived persona from the one root recovery key', async () => {
    const originalRider = await loadIdentityTreePersona('requester');
    const originalDriver = await loadIdentityTreePersona('provider');
    const recovery = await revealIdentityTreeRecoveryKey();

    await startFreshIdentityTree();
    expect((await loadIdentityTreePersona('provider'))?.pubKeyHex)
      .not.toBe(originalDriver?.pubKeyHex);

    await restoreIdentityTree(recovery!);

    expect(await loadIdentityTreePersona('requester')).toEqual(originalRider);
    expect(await loadIdentityTreePersona('provider')).toEqual(originalDriver);
  });
});
