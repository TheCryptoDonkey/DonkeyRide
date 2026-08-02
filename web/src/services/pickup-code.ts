import { hexToBytes } from './nostr';

/**
 * Pickup verification code — "right rider, right car" (the spoken-verify
 * pattern flock ships for pick-ups, rebuilt on the pairwise secret two
 * strangers already share).
 *
 * Both phones derive the same short code from the NIP-44 ECDH
 * conversation key between the two participants' keypairs plus the ride
 * id. Deriving it requires one of the two PRIVATE keys, so:
 *   - the matched rider and driver always agree,
 *   - the operator cannot derive it (it only ever sees public keys),
 *   - an impostor car that saw the broadcast cannot produce it.
 * Nothing is published and no server state exists — pure local maths.
 */

/** Short, phonetically distinct words — easy to say through a car window */
const WORDS = [
  'apple', 'badger', 'candle', 'donkey', 'ember', 'falcon', 'garlic', 'hammer',
  'island', 'jacket', 'kettle', 'lantern', 'magnet', 'nutmeg', 'orange', 'pepper',
  'quartz', 'rocket', 'saddle', 'tiger', 'umbrella', 'violet', 'walnut', 'yellow',
  'zebra', 'anchor', 'bishop', 'copper', 'dragon', 'engine', 'feather', 'goblet',
  'helmet', 'ivory', 'jungle', 'kitten', 'lemon', 'marble', 'needle', 'otter',
  'pigeon', 'rabbit', 'silver', 'temple', 'urchin', 'vessel', 'window', 'yonder',
  'barrel', 'cactus', 'dolphin', 'ferret', 'gutter', 'hazel', 'iceberg', 'jigsaw',
  'ladder', 'mirror', 'nickel', 'oyster', 'parrot', 'quiver', 'ribbon', 'sparrow',
] as const;

export interface PickupCode {
  /** Four digits, zero-padded — read out or shown on screen */
  pin: string;
  /** A word alternative for saying aloud */
  word: string;
}

export async function derivePickupCode(
  privKeyHex: string,
  counterpartyPubkey: string,
  taskId: string,
): Promise<PickupCode> {
  const { nip44 } = await import('nostr-tools');
  const conversationKey = nip44.v2.utils.getConversationKey(
    hexToBytes(privKeyHex), counterpartyPubkey);
  const material = new Uint8Array([
    ...conversationKey,
    ...new TextEncoder().encode(taskId),
  ]);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', material));
  const pin = String(((digest[0] << 8) | digest[1]) % 10000).padStart(4, '0');
  const word = WORDS[((digest[2] << 8) | digest[3]) % WORDS.length];
  return { pin, word };
}
