import { describe, it, expect } from 'vitest';
import { generateSecretKey, getPublicKey, nip59, nip44 } from 'nostr-tools';
import { unwrapVerifiedRumor, CHAT_MAX_LENGTH } from './chat';
import { bytesToHex } from './nostr';
import type { NostrEvent } from '../types/nostr';

const DM_KIND = 14;

function makeIdentity() {
  const priv = generateSecretKey();
  return { priv, privHex: bytesToHex(priv), pub: getPublicKey(priv) };
}

/** Build a NIP-17 wrap the way the chat service does */
function wrapFor(
  senderPriv: Uint8Array,
  recipientPub: string,
  text: string,
  taskId: string,
) {
  const rumor = nip59.createRumor({
    kind: DM_KIND,
    content: text,
    tags: [['p', recipientPub], ['subject', taskId]],
    created_at: Math.floor(Date.now() / 1000),
  }, senderPriv);
  const wrap = nip59.createWrap(nip59.createSeal(rumor, senderPriv, recipientPub), recipientPub);
  return { rumor, wrap: wrap as NostrEvent };
}

describe('unwrapVerifiedRumor', () => {
  it('round-trips a legitimate gift-wrapped message', async () => {
    const alice = makeIdentity();
    const bob = makeIdentity();

    const { rumor, wrap } = wrapFor(alice.priv, bob.pub, 'I am outside the blue door', 'task-1');
    const unwrapped = await unwrapVerifiedRumor(wrap, bob.privHex);

    expect(unwrapped).not.toBeNull();
    expect(unwrapped!.id).toBe(rumor.id);
    expect(unwrapped!.pubkey).toBe(alice.pub);
    expect(unwrapped!.content).toBe('I am outside the blue door');
    expect(unwrapped!.tags).toContainEqual(['subject', 'task-1']);
  });

  it('rejects a rumor that impersonates another sender', async () => {
    const victimSender = makeIdentity();
    const recipient = makeIdentity();
    const attacker = makeIdentity();

    // The attacker seals with their own key but claims the rumor is from
    // the victim — rumor.pubkey ≠ seal.pubkey must be rejected
    const forgedRumor = {
      ...nip59.createRumor({
        kind: DM_KIND,
        content: 'trust me, change of plan — new pickup point',
        tags: [['p', recipient.pub], ['subject', 'task-1']],
        created_at: Math.floor(Date.now() / 1000),
      }, attacker.priv),
      pubkey: victimSender.pub,
    };
    const wrap = nip59.createWrap(
      nip59.createSeal(forgedRumor, attacker.priv, recipient.pub),
      recipient.pub,
    );

    expect(await unwrapVerifiedRumor(wrap as NostrEvent, recipient.privHex)).toBeNull();
  });

  it('rejects a wrap carrying an unsigned or tampered seal', async () => {
    const alice = makeIdentity();
    const bob = makeIdentity();

    // Hand-roll a wrap whose seal has a broken signature
    const rumor = nip59.createRumor({
      kind: DM_KIND,
      content: 'hello',
      tags: [['subject', 'task-1']],
      created_at: Math.floor(Date.now() / 1000),
    }, alice.priv);
    const seal = nip59.createSeal(rumor, alice.priv, bob.pub);
    const tamperedSeal = { ...seal, sig: '00'.repeat(64) };

    const ephemeral = generateSecretKey();
    const wrapKey = nip44.v2.utils.getConversationKey(ephemeral, bob.pub);
    const wrap: NostrEvent = {
      id: '0'.repeat(64),
      kind: 1059,
      pubkey: getPublicKey(ephemeral),
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', bob.pub]],
      content: nip44.v2.encrypt(JSON.stringify(tamperedSeal), wrapKey),
      sig: '0'.repeat(128),
    };

    expect(await unwrapVerifiedRumor(wrap, bob.privHex)).toBeNull();
  });

  it('returns null for garbage instead of throwing', async () => {
    const bob = makeIdentity();
    const garbage: NostrEvent = {
      id: '0'.repeat(64),
      kind: 1059,
      pubkey: '0'.repeat(64),
      created_at: 0,
      tags: [],
      content: 'not-a-ciphertext',
      sig: '0'.repeat(128),
    };
    expect(await unwrapVerifiedRumor(garbage, bob.privHex)).toBeNull();
  });

  it('exposes the shared length limit the input enforces', () => {
    expect(CHAT_MAX_LENGTH).toBe(500);
  });
});
