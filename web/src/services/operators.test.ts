import { describe, expect, it } from 'vitest';
import { parseOperatorAnnouncement } from './operators';
import type { NostrEvent } from '../types/nostr';

function event(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: 'event-id',
    pubkey: 'operator-key',
    created_at: 123,
    kind: 30511,
    tags: [
      ['t', 'trott-operator'],
      ['service_url', 'https://rides.example/path'],
      ['name', 'Example Cars'],
      ['domain', 'ridesharing'],
      ['relay', 'wss://relay.example'],
      ['fee_percent', '1.5'],
      ['policy_mode', 'regulated'],
      ['admission', 'allowlist'],
    ],
    content: '',
    sig: 'signature',
    ...overrides,
  };
}

describe('operator announcements', () => {
  it('parses discovery, policy and service origin tags', () => {
    expect(parseOperatorAnnouncement(event())).toMatchObject({
      origin: 'https://rides.example',
      name: 'Example Cars',
      domains: ['ridesharing'],
      relays: ['wss://relay.example'],
      feePercent: 1.5,
      policyMode: 'regulated',
      admissionMode: 'allowlist',
    });
  });

  it('rejects insecure public origins and unrelated events', () => {
    expect(parseOperatorAnnouncement(event({
      tags: [['t', 'trott-operator'], ['service_url', 'http://rides.example']],
    }))).toBeNull();
    expect(parseOperatorAnnouncement(event({ kind: 1 }))).toBeNull();
  });
});
