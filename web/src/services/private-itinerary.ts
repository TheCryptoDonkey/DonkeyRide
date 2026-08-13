import type { LatLng, Task, TaskStop } from '../types/api';
import type { NostrEvent } from '../types/nostr';
import { hexToBytes } from './nostr';
import { publishToRelays, subscribeToRelays } from './relays';
import { unwrapVerifiedRumor } from './chat';

const DM_KIND = 14;
const WRAP_KIND = 1059;
const SUBJECT_PREFIX = 'donkeyride-itinerary:';
const STORAGE_PREFIX = 'donkeyride.private-itinerary.';
const WRAP_SKEW_SECONDS = 2 * 24 * 60 * 60;

export interface PrivateItinerary {
  version: 1;
  taskId: string;
  pickup: LatLng;
  dropoff?: LatLng | null;
  stops?: TaskStop[];
  pickupAddress?: string;
  dropoffAddress?: string;
  pickupNote?: string;
  createdAt: number;
}

function nostrTools() {
  return import('nostr-tools');
}

export function itineraryFromTask(task: Task): PrivateItinerary {
  return {
    version: 1,
    taskId: task.id,
    pickup: task.pickup,
    dropoff: task.dropoff,
    stops: task.stops,
    pickupAddress: task.pickupAddress,
    dropoffAddress: task.dropoffAddress,
    pickupNote: task.pickupNote,
    createdAt: Date.now(),
  };
}

export function mergePrivateItinerary(task: Task, itinerary: PrivateItinerary): Task {
  if (itinerary.version !== 1 || itinerary.taskId !== task.id) return task;
  return {
    ...task,
    pickup: itinerary.pickup,
    dropoff: itinerary.dropoff,
    stops: itinerary.stops,
    stopCount: itinerary.stops?.length || task.stopCount || 0,
    pickupAddress: itinerary.pickupAddress,
    dropoffAddress: itinerary.dropoffAddress,
    pickupNote: itinerary.pickupNote,
    locationMode: 'participant_encrypted',
  };
}

/** Store exact points encrypted to this device identity, never cleartext. */
export async function savePrivateItinerary(
  privKeyHex: string,
  itinerary: PrivateItinerary,
): Promise<void> {
  const { nip44, getPublicKey } = await nostrTools();
  const priv = hexToBytes(privKeyHex);
  const self = getPublicKey(priv);
  const key = nip44.v2.utils.getConversationKey(priv, self);
  const ciphertext = nip44.v2.encrypt(JSON.stringify(itinerary), key);
  localStorage.setItem(STORAGE_PREFIX + itinerary.taskId, ciphertext);
}

export async function loadPrivateItinerary(
  privKeyHex: string,
  taskId: string,
): Promise<PrivateItinerary | null> {
  try {
    const ciphertext = localStorage.getItem(STORAGE_PREFIX + taskId);
    if (!ciphertext) return null;
    const { nip44, getPublicKey } = await nostrTools();
    const priv = hexToBytes(privKeyHex);
    const self = getPublicKey(priv);
    const key = nip44.v2.utils.getConversationKey(priv, self);
    const parsed = JSON.parse(nip44.v2.decrypt(ciphertext, key));
    return validItinerary(parsed, taskId) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPrivateItinerary(taskId: string): void {
  localStorage.removeItem(STORAGE_PREFIX + taskId);
}

function validPoint(value: unknown): value is LatLng {
  const point = value as LatLng;
  return Boolean(point && Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function validItinerary(value: unknown, taskId: string): value is PrivateItinerary {
  const item = value as PrivateItinerary;
  return Boolean(item && item.version === 1 && item.taskId === taskId
    && validPoint(item.pickup)
    && (item.dropoff == null || validPoint(item.dropoff))
    && (!item.stops || (Array.isArray(item.stops) && item.stops.length <= 3
      && item.stops.every(validPoint))));
}

/** Build self + recipient wraps; exported so the crypto boundary is testable. */
export async function createPrivateItineraryWraps(
  privKeyHex: string,
  counterpartyPubkey: string,
  itinerary: PrivateItinerary,
): Promise<NostrEvent[]> {
  if (!/^[0-9a-f]{64}$/i.test(counterpartyPubkey)) throw new Error('Invalid recipient pubkey');
  const { nip59, getPublicKey } = await nostrTools();
  const priv = hexToBytes(privKeyHex);
  const self = getPublicKey(priv);
  const rumor = nip59.createRumor({
    kind: DM_KIND,
    content: JSON.stringify(itinerary),
    tags: [
      ['p', counterpartyPubkey],
      ['subject', SUBJECT_PREFIX + itinerary.taskId],
    ],
    created_at: Math.floor(Date.now() / 1000),
  }, priv);
  return [self, counterpartyPubkey].map((recipient) =>
    nip59.createWrap(nip59.createSeal(rumor, priv, recipient), recipient));
}

/** Publish the exact itinerary as a signed NIP-17 gift wrap to the match. */
export async function sendPrivateItinerary(
  privKeyHex: string,
  counterpartyPubkey: string,
  itinerary: PrivateItinerary,
): Promise<void> {
  const wraps = await createPrivateItineraryWraps(
    privKeyHex, counterpartyPubkey, itinerary,
  );
  const acks = await Promise.all(wraps.map((wrap) => publishToRelays(wrap as NostrEvent)));
  if (acks.every((count) => count === 0)) {
    throw new Error('No relay accepted the encrypted itinerary');
  }
}

/** Subscribe to verified itinerary wraps from the matched counterparty. */
export async function subscribePrivateItinerary(
  privKeyHex: string,
  selfPubkey: string,
  counterpartyPubkey: string,
  taskId: string,
  onItinerary: (itinerary: PrivateItinerary) => void,
): Promise<{ close: () => void }> {
  return subscribeToRelays({
    kinds: [WRAP_KIND],
    '#p': [selfPubkey],
    since: Math.floor(Date.now() / 1000) - WRAP_SKEW_SECONDS,
  }, (wrap) => {
    void unwrapVerifiedRumor(wrap, privKeyHex).then((rumor) => {
      if (!rumor || rumor.pubkey.toLowerCase() !== counterpartyPubkey.toLowerCase()) return;
      if (rumor.tags.find((tag) => tag[0] === 'subject')?.[1]
          !== SUBJECT_PREFIX + taskId) return;
      try {
        const parsed = JSON.parse(rumor.content);
        if (validItinerary(parsed, taskId)) onItinerary(parsed);
      } catch {
        // Ignore malformed or unrelated encrypted messages.
      }
    });
  });
}
