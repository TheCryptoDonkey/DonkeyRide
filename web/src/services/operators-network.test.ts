import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getOperatorInfo, getAvailableProviders } = vi.hoisted(() => ({
  getOperatorInfo: vi.fn(async (origin: string) => ({
    name: origin.includes('fleet') ? 'Fleet Operator' : 'Open Operator',
    operator: origin.includes('fleet') ? 'fleet-key' : 'open-key',
    fee: '0%',
    feePercent: 0,
    domain: { id: 'ridesharing' },
    public_relays: ['wss://relay.example'],
    policy: {
      schema: 'org.donkeyride.operator-policy/v1',
      mode: origin.includes('fleet') ? 'regulated' : 'open',
      admission: {
        mode: origin.includes('fleet') ? 'allowlist' : 'open',
        assurance: origin.includes('fleet') ? 'operator_roster' : 'none',
        requiredCredentials: [],
        allowlistSize: origin.includes('fleet') ? 2 : null,
        note: '',
      },
      records: { mode: 'ephemeral', backend: 'memory' },
    },
  })),
  getAvailableProviders: vi.fn(async (_params: unknown, origin: string) => ({
    drivers: [{
      pubkey: '',
      npub: '',
      location: origin.includes('fleet')
        ? { lat: 53.481, lng: -2.241 }
        : { lat: 53.482, lng: -2.242 },
    }],
  })),
}));

vi.mock('./api', () => ({ getOperatorInfo, getAvailableProviders }));
vi.mock('./relays', () => ({ queryRelays: vi.fn(async () => []) }));

import { discoverNetworkProviders } from './operators';

describe('network supply discovery', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('donkeyride.coordination.mode', 'managed');
    localStorage.setItem('donkeyride.operator.known', JSON.stringify([
      'https://fleet.example',
    ]));
    getOperatorInfo.mockClear();
    getAvailableProviders.mockClear();
  });

  it('merges coarse providers from the selected and other known operators', async () => {
    const result = await discoverNetworkProviders({ lat: 53.48, lng: -2.24 }, 10);

    expect(result.operators.filter((operator) => operator.reachable)).toHaveLength(2);
    expect(result.providers).toHaveLength(2);
    expect(new Set(result.providers.map((provider) => provider.operatorBase))).toEqual(new Set([
      'http://localhost:3000',
      'https://fleet.example',
    ]));
    expect(result.providers.every((provider) => provider.pubkey.length > 0)).toBe(true);
  });
});
