import type { ChatMessage } from '../types/api';
import type { NostrEvent } from '../types/nostr';
import { hexToBytes } from './nostr';
import { publishToRelays, subscribeToRelays } from './relays';

/**
 * End-to-end encrypted task chat — NIP-17 gift-wrapped DMs (the same
 * pattern flock ships for circle chat) exchanged DIRECTLY between the two
 * participants over public relays. The operator never carries, stores or
 * can read a message; chat keeps working even if the operator is down.
 *
 * Wire format per NIP-17/NIP-59: an unsigned kind 14 rumor (the message),
 * sealed (kind 13, signed by the sender, NIP-44 encrypted to the
 * recipient), gift-wrapped (kind 1059, ephemeral key, timestamp randomised
 * up to two days into the past). One wrap is published per recipient plus
 * one to self, so our own history survives a refresh via relay replay.
 * The ride id travels in the rumor's `subject` tag (inside the encryption)
 * to thread messages per task without leaking the task on the wire.
 */

const WRAP_KIND = 1059;
const SEAL_KIND = 13;
const DM_KIND = 14;
/** NIP-59 backdates wraps up to 2 days; query with that much slack */
const WRAP_SKEW_SECONDS = 2 * 24 * 60 * 60;
export const CHAT_MAX_LENGTH = 500;

function nostrTools() {
  return import('nostr-tools');
}

/**
 * Unwrap a kind 1059 gift wrap with the checks nostr-tools' own
 * `unwrapEvent` skips: the seal must be a validly SIGNED kind 13 from the
 * claimed sender, and the rumor's pubkey must equal the seal's pubkey —
 * otherwise anyone could impersonate the counterparty inside the chat.
 * Returns null for anything that fails decryption or verification.
 */
export async function unwrapVerifiedRumor(
  wrap: NostrEvent,
  recipientPrivKeyHex: string,
): Promise<{ id: string; pubkey: string; created_at: number; tags: string[][]; content: string } | null> {
  try {
    const { nip44, verifyEvent } = await nostrTools();
    const priv = hexToBytes(recipientPrivKeyHex);

    const sealKey = nip44.v2.utils.getConversationKey(priv, wrap.pubkey);
    const seal = JSON.parse(nip44.v2.decrypt(wrap.content, sealKey));
    if (seal.kind !== SEAL_KIND || !verifyEvent(seal)) return null;

    const rumorKey = nip44.v2.utils.getConversationKey(priv, seal.pubkey);
    const rumor = JSON.parse(nip44.v2.decrypt(seal.content, rumorKey));
    // The seal signature is the only authentication the rumor has
    if (rumor.kind !== DM_KIND || rumor.pubkey !== seal.pubkey) return null;

    return rumor;
  } catch {
    return null;
  }
}

/** The task id a rumor is threaded under (its `subject` tag) */
function rumorTaskId(tags: string[][]): string | null {
  return tags?.find((t) => t[0] === 'subject')?.[1] ?? null;
}

/**
 * Send a chat message for a task. Publishes one wrap to the counterparty
 * and one to self (history replay). Throws if no relay accepted either
 * wrap, so the UI can offer a retry.
 */
export async function sendTaskChatMessage(
  privKeyHex: string,
  counterpartyPubkey: string,
  taskId: string,
  text: string,
): Promise<ChatMessage> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Message text is required');
  if (trimmed.length > CHAT_MAX_LENGTH) {
    throw new Error(`Message too long (max ${CHAT_MAX_LENGTH} characters)`);
  }

  const { nip59, getPublicKey } = await nostrTools();
  const priv = hexToBytes(privKeyHex);
  const selfPubkey = getPublicKey(priv);

  // One rumor, sealed separately per recipient — both copies share its id
  const rumor = nip59.createRumor({
    kind: DM_KIND,
    content: trimmed,
    tags: [['p', counterpartyPubkey], ['subject', taskId]],
    created_at: Math.floor(Date.now() / 1000),
  }, priv);

  const wraps = [selfPubkey, counterpartyPubkey].map((recipient) =>
    nip59.createWrap(nip59.createSeal(rumor, priv, recipient), recipient));

  const acks = await Promise.all(wraps.map((wrap) => publishToRelays(wrap as NostrEvent)));
  if (acks.every((count) => count === 0)) {
    throw new Error('No relay accepted the message — check your connection');
  }

  return { id: rumor.id, from: selfPubkey, text: trimmed, at: rumor.created_at * 1000 };
}

/**
 * Live subscription to a task's chat. Delivers every verified rumor for
 * this task authored by self or the counterparty (relay replay included,
 * so history returns after a refresh). Callers dedupe by message id.
 * Returns a close handle.
 */
export async function subscribeTaskChat(
  privKeyHex: string,
  selfPubkey: string,
  counterpartyPubkey: string,
  taskId: string,
  onMessage: (msg: ChatMessage) => void,
): Promise<{ close: () => void }> {
  const allowedSenders = new Set([selfPubkey.toLowerCase(), counterpartyPubkey.toLowerCase()]);
  return subscribeToRelays(
    {
      kinds: [WRAP_KIND],
      '#p': [selfPubkey],
      since: Math.floor(Date.now() / 1000) - WRAP_SKEW_SECONDS,
    },
    (wrap) => {
      void unwrapVerifiedRumor(wrap, privKeyHex).then((rumor) => {
        if (!rumor) return;
        if (rumorTaskId(rumor.tags) !== taskId) return;
        if (!allowedSenders.has(rumor.pubkey.toLowerCase())) return;
        onMessage({
          id: rumor.id,
          from: rumor.pubkey,
          text: rumor.content,
          at: rumor.created_at * 1000,
        });
      });
    },
  );
}
