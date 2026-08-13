import type { LatLng, Task, TaskStop } from '../types/api';
import type { NostrEvent } from '../types/nostr';
import { bytesToHex, hexToBytes, signNostrEvent } from './nostr';
import { publishToRelays, subscribeToRelays } from './relays';
import { unwrapVerifiedRumor } from './chat';
import { decodeGeohash, encodeGeohash } from '../utils/geohash';

export const DIRECT_TASK_KIND = 37500;
const WRAP_KIND = 1059;
const DM_KIND = 14;
const SUBJECT_PREFIX = 'donkeyride-direct:';
const CAPABILITY_PREFIX = 'donkeyride.direct-capability.';
const TASK_PREFIX = 'donkeyride.direct-task.';
const WRAP_SKEW_SECONDS = 2 * 24 * 60 * 60;
const knownDirectTaskIds = new Set<string>();

export function isKnownDirectTask(taskIdValue: string): boolean {
  return knownDirectTaskIds.has(taskIdValue);
}

interface DirectCapability {
  version: 1;
  taskId: string;
  rendezvousPrivkey: string;
}

export interface DirectTaskAnnouncement {
  task: Task;
  rendezvousPubkey: string;
  geohash: string;
  expiration: number;
  eventId: string;
}

interface DirectMessage {
  version: 1;
  taskId: string;
  type: 'accept' | 'matched' | 'state' | 'cancel' | 'rejected';
  status?: string;
  task?: Task;
  providerLocation?: LatLng;
  reason?: string;
  at: number;
}

function nostrTools() {
  return import('nostr-tools');
}

async function ownerStorageKey(prefix: string, privKeyHex: string, taskIdValue: string) {
  const { getPublicKey } = await nostrTools();
  return `${prefix}${getPublicKey(hexToBytes(privKeyHex))}.${taskIdValue}`;
}

function tag(event: NostrEvent, name: string): string | null {
  return event.tags.find((item) => item[0] === name)?.[1] ?? null;
}

function validPubkey(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

function validMessage(value: unknown, taskId: string): value is DirectMessage {
  const item = value as DirectMessage;
  return Boolean(item && item.version === 1 && item.taskId === taskId
    && ['accept', 'matched', 'state', 'cancel', 'rejected'].includes(item.type)
    && Number.isFinite(item.at));
}

async function selfEncrypt(privKeyHex: string, value: unknown): Promise<string> {
  const { nip44, getPublicKey } = await nostrTools();
  const priv = hexToBytes(privKeyHex);
  const key = nip44.v2.utils.getConversationKey(priv, getPublicKey(priv));
  return nip44.v2.encrypt(JSON.stringify(value), key);
}

async function selfDecrypt<T>(privKeyHex: string, ciphertext: string): Promise<T> {
  const { nip44, getPublicKey } = await nostrTools();
  const priv = hexToBytes(privKeyHex);
  const key = nip44.v2.utils.getConversationKey(priv, getPublicKey(priv));
  return JSON.parse(nip44.v2.decrypt(ciphertext, key)) as T;
}

async function saveCapability(ownerPrivkey: string, capability: DirectCapability): Promise<void> {
  localStorage.setItem(
    await ownerStorageKey(CAPABILITY_PREFIX, ownerPrivkey, capability.taskId),
    await selfEncrypt(ownerPrivkey, capability),
  );
}

async function loadCapability(ownerPrivkey: string, taskId: string): Promise<DirectCapability | null> {
  try {
    const stored = localStorage.getItem(await ownerStorageKey(CAPABILITY_PREFIX, ownerPrivkey, taskId));
    if (!stored) return null;
    const parsed = await selfDecrypt<DirectCapability>(ownerPrivkey, stored);
    return parsed.version === 1 && parsed.taskId === taskId
      && /^[0-9a-f]{64}$/i.test(parsed.rendezvousPrivkey)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export async function saveDirectTask(privKeyHex: string, task: Task): Promise<void> {
  if (task.coordinationMode !== 'direct') return;
  knownDirectTaskIds.add(task.id);
  localStorage.setItem(
    await ownerStorageKey(TASK_PREFIX, privKeyHex, task.id),
    await selfEncrypt(privKeyHex, task),
  );
}

export async function loadDirectTask(privKeyHex: string, taskId: string): Promise<Task | null> {
  try {
    const stored = localStorage.getItem(await ownerStorageKey(TASK_PREFIX, privKeyHex, taskId));
    if (!stored) return null;
    const task = await selfDecrypt<Task>(privKeyHex, stored);
    if (task.id === taskId && task.coordinationMode === 'direct') {
      knownDirectTaskIds.add(task.id);
      return task;
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearDirectTask(privKeyHex: string, taskId: string): Promise<void> {
  knownDirectTaskIds.delete(taskId);
  localStorage.removeItem(await ownerStorageKey(TASK_PREFIX, privKeyHex, taskId));
  localStorage.removeItem(await ownerStorageKey(CAPABILITY_PREFIX, privKeyHex, taskId));
}

function taskId(): string {
  return `ride_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function centre(hash: string): LatLng | null {
  const point = decodeGeohash(hash);
  return point ? { lat: point.lat, lng: point.lon } : null;
}

function publicTaskTags(task: Task, status: 'open' | 'closed', expiration: number): string[][] {
  const tags: string[][] = [
    ['d', task.id],
    ['g', encodeGeohash(task.pickup.lat, task.pickup.lng, 5)],
    ['domain', 'ridesharing'],
    ['t', 'trott-task'],
    ['mode', 'direct'],
    ['status', status],
    ['expiration', String(expiration)],
  ];
  if (status === 'open' && task.dropoff) {
    tags.push(['dropoff', encodeGeohash(task.dropoff.lat, task.dropoff.lng, 5)]);
    tags.push(['stops', String(task.stopCount || 0)]);
    tags.push(['distance_m', String(Math.round((task.distanceKm || 0) * 1000))]);
    tags.push(['duration_s', String(Math.round((task.durationMin || 0) * 60))]);
    tags.push(['settlement', task.settlementMode || 'none']);
    if (task.scheduledFor) tags.push(['scheduled_for', String(Math.floor(task.scheduledFor / 1000))]);
  }
  return tags;
}

async function publishTaskState(
  rendezvousPrivkey: string,
  task: Task,
  status: 'open' | 'closed',
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const scheduledSec = task.scheduledFor ? Math.floor(task.scheduledFor / 1000) : null;
  const expiration = status === 'open'
    ? (scheduledSec ? scheduledSec + 3600 : now + 900)
    : now + 300;
  const event = await signNostrEvent({
    kind: DIRECT_TASK_KIND,
    created_at: now,
    tags: publicTaskTags(task, status, expiration),
    content: '',
  }, rendezvousPrivkey);
  if (await publishToRelays(event) === 0) {
    throw new Error('No relay accepted the journey announcement');
  }
}

export async function createDirectTask(params: {
  requesterPrivkey: string;
  requesterPubkey: string;
  pickup: LatLng;
  dropoff: LatLng;
  stops?: TaskStop[];
  pickupAddress?: string;
  dropoffAddress?: string;
  pickupNote?: string | null;
  scheduledFor?: number | null;
  distanceKm: number;
  durationMinutes: number;
  routeGeometry?: string | [number, number][];
  settlementMode?: 'priced' | 'none';
}): Promise<Task> {
  const { generateSecretKey, getPublicKey } = await nostrTools();
  const rendezvousPrivkey = bytesToHex(generateSecretKey());
  const rendezvousPubkey = getPublicKey(hexToBytes(rendezvousPrivkey));
  const id = taskId();
  const task: Task = {
    id,
    status: 'requested',
    requesterPubkey: params.requesterPubkey,
    pickup: params.pickup,
    dropoff: params.dropoff,
    stops: params.stops,
    stopCount: params.stops?.length || 0,
    pickupAddress: params.pickupAddress,
    dropoffAddress: params.dropoffAddress,
    pickupNote: params.pickupNote || undefined,
    fareEstimateSats: 0,
    distanceKm: params.distanceKm,
    durationMin: params.durationMinutes,
    routeGeometry: params.routeGeometry,
    settlementMode: params.settlementMode || 'none',
    locationMode: 'participant_encrypted',
    coordinationMode: 'direct',
    createdAt: new Date().toISOString(),
  };
  knownDirectTaskIds.add(id);
  await saveCapability(params.requesterPrivkey, {
    version: 1, taskId: id, rendezvousPrivkey,
  });
  await saveDirectTask(params.requesterPrivkey, task);
  try {
    await publishTaskState(rendezvousPrivkey, task, 'open');
  } catch (error) {
    await clearDirectTask(params.requesterPrivkey, id);
    throw error;
  }
  // The public event is signed by a per-task rendezvous capability. This is
  // the return address for encrypted accept attempts, never the rider's ID.
  Object.defineProperty(task, '__rendezvousPubkey', {
    value: rendezvousPubkey,
    enumerable: false,
  });
  return task;
}

export function parseDirectTaskAnnouncement(event: NostrEvent): DirectTaskAnnouncement | null {
  if (event.kind !== DIRECT_TASK_KIND || tag(event, 'mode') !== 'direct'
      || tag(event, 'status') !== 'open') return null;
  const id = tag(event, 'd');
  const pickupHash = tag(event, 'g');
  const dropoffHash = tag(event, 'dropoff');
  const expiration = Number(tag(event, 'expiration'));
  const pickup = pickupHash ? centre(pickupHash) : null;
  const dropoff = dropoffHash ? centre(dropoffHash) : null;
  if (!id || !pickupHash || !pickup || !dropoff || !Number.isFinite(expiration)
      || !validPubkey(event.pubkey)) return null;
  const distanceKm = Number(tag(event, 'distance_m')) / 1000;
  const durationMin = Number(tag(event, 'duration_s')) / 60;
  const stopCount = Number(tag(event, 'stops') || 0);
  const scheduled = Number(tag(event, 'scheduled_for'));
  return {
    task: {
      id,
      status: 'requested',
      // Until match, this capability is the only encrypted reply address.
      requesterPubkey: event.pubkey,
      pickup,
      dropoff,
      stopCount: Number.isInteger(stopCount) && stopCount >= 0 ? stopCount : 0,
      distanceKm: Number.isFinite(distanceKm) ? distanceKm : 0,
      durationMin: Number.isFinite(durationMin) ? durationMin : 0,
      fareEstimateSats: 0,
      settlementMode: tag(event, 'settlement') === 'priced' ? 'priced' : 'none',
      locationMode: 'participant_encrypted',
      coordinationMode: 'direct',
      scheduledFor: Number.isFinite(scheduled) ? scheduled * 1000 : null,
      createdAt: new Date(event.created_at * 1000).toISOString(),
    },
    rendezvousPubkey: event.pubkey,
    geohash: pickupHash,
    expiration,
    eventId: event.id,
  };
}

export function directTaskEventState(event: NostrEvent): {
  taskId: string; status: 'open' | 'closed';
} | null {
  if (event.kind !== DIRECT_TASK_KIND || tag(event, 'mode') !== 'direct') return null;
  const id = tag(event, 'd');
  const status = tag(event, 'status');
  return id && (status === 'open' || status === 'closed') ? { taskId: id, status } : null;
}

async function createMessageWraps(
  senderPrivkey: string,
  recipientPubkey: string,
  message: DirectMessage,
): Promise<NostrEvent[]> {
  if (!validPubkey(recipientPubkey)) throw new Error('Invalid direct-message recipient');
  const { nip59, getPublicKey } = await nostrTools();
  const priv = hexToBytes(senderPrivkey);
  const self = getPublicKey(priv);
  const rumor = nip59.createRumor({
    kind: DM_KIND,
    content: JSON.stringify(message),
    tags: [
      ['p', recipientPubkey],
      ['subject', SUBJECT_PREFIX + message.taskId],
    ],
    created_at: Math.floor(Date.now() / 1000),
  }, priv);
  return [recipientPubkey, self].map((recipient) =>
    nip59.createWrap(nip59.createSeal(rumor, priv, recipient), recipient) as NostrEvent);
}

async function publishMessage(
  senderPrivkey: string,
  recipientPubkey: string,
  message: DirectMessage,
): Promise<void> {
  const wraps = await createMessageWraps(senderPrivkey, recipientPubkey, message);
  // Recipient copy is first. The sender's history copy is useful but cannot
  // make a failed delivery look successful.
  const recipientAcks = await publishToRelays(wraps[0]);
  void publishToRelays(wraps[1]);
  if (recipientAcks === 0) throw new Error('No relay delivered the encrypted journey update');
}

async function subscribeMessages(
  recipientPrivkey: string,
  recipientPubkey: string,
  taskIdValue: string,
  onMessage: (message: DirectMessage, senderPubkey: string) => void,
): Promise<{ close: () => void }> {
  return subscribeToRelays({
    kinds: [WRAP_KIND],
    '#p': [recipientPubkey],
    since: Math.floor(Date.now() / 1000) - WRAP_SKEW_SECONDS,
  }, (wrap) => {
    void unwrapVerifiedRumor(wrap, recipientPrivkey).then((rumor) => {
      if (!rumor || rumor.tags.find((item) => item[0] === 'subject')?.[1]
          !== SUBJECT_PREFIX + taskIdValue) return;
      try {
        const message = JSON.parse(rumor.content);
        if (validMessage(message, taskIdValue)) onMessage(message, rumor.pubkey);
      } catch {
        // Ignore malformed or unrelated encrypted payloads.
      }
    });
  });
}

export async function acceptDirectTask(
  providerPrivkey: string,
  providerPubkey: string,
  task: Task,
  providerLocation: LatLng,
  timeoutMs = 15_000,
): Promise<Task> {
  if (task.coordinationMode !== 'direct') throw new Error('Not a direct journey');
  const response = new Promise<Task>((resolve, reject) => {
    let subscription: { close: () => void } | null = null;
    const timer = window.setTimeout(() => {
      subscription?.close();
      reject(new Error('The rider did not confirm this match yet'));
    }, timeoutMs);
    void subscribeMessages(providerPrivkey, providerPubkey, task.id, (message, sender) => {
      if (message.type === 'rejected') {
        window.clearTimeout(timer);
        subscription?.close();
        reject(new Error('Another driver accepted this journey first'));
        return;
      }
      if (message.type !== 'matched' || !message.task || message.task.providerPubkey !== providerPubkey
          || message.task.requesterPubkey !== sender) return;
      window.clearTimeout(timer);
      subscription?.close();
      resolve(message.task);
    }).then((sub) => { subscription = sub; });
  });
  await publishMessage(providerPrivkey, task.requesterPubkey, {
    version: 1,
    taskId: task.id,
    type: 'accept',
    providerLocation,
    at: Date.now(),
  });
  const matched = await response;
  await saveDirectTask(providerPrivkey, matched);
  return matched;
}

const claimed = new Set<string>();

export async function subscribeRequesterDirectTask(
  requesterPrivkey: string,
  requesterPubkey: string,
  task: Task,
  onTask: (task: Task) => void,
): Promise<{ close: () => void }> {
  const capability = await loadCapability(requesterPrivkey, task.id);
  const handles: Array<{ close: () => void }> = [];
  if (capability && !task.providerPubkey) {
    const { getPublicKey } = await nostrTools();
    const rendezvousPubkey = getPublicKey(hexToBytes(capability.rendezvousPrivkey));
    handles.push(await subscribeMessages(
      capability.rendezvousPrivkey,
      rendezvousPubkey,
      task.id,
      (message, sender) => {
        if (message.type !== 'accept' || !validPubkey(sender)) return;
        if (claimed.has(task.id) || task.providerPubkey) {
          void publishMessage(requesterPrivkey, sender, {
            version: 1, taskId: task.id, type: 'rejected', at: Date.now(),
          });
          return;
        }
        claimed.add(task.id);
        const matched: Task = {
          ...task,
          status: 'en_route',
          requesterPubkey,
          providerPubkey: sender,
        };
        void saveDirectTask(requesterPrivkey, matched);
        void publishTaskState(capability.rendezvousPrivkey, matched, 'closed');
        void publishMessage(requesterPrivkey, sender, {
          version: 1, taskId: task.id, type: 'matched', task: {
            ...matched,
            // Exact itinerary follows in its own encrypted gift wrap.
            pickup: centre(encodeGeohash(task.pickup.lat, task.pickup.lng, 5))!,
            dropoff: task.dropoff
              ? centre(encodeGeohash(task.dropoff.lat, task.dropoff.lng, 5))
              : null,
            stops: undefined,
            pickupAddress: undefined,
            dropoffAddress: undefined,
            pickupNote: undefined,
            routeGeometry: undefined,
          }, at: Date.now(),
        });
        void subscribeParticipantDirectTask(
          requesterPrivkey, requesterPubkey, matched, onTask,
        ).then((handle) => handles.push(handle));
        onTask(matched);
      },
    ));
  }
  if (task.providerPubkey) {
    handles.push(await subscribeParticipantDirectTask(
      requesterPrivkey, requesterPubkey, task, onTask,
    ));
  }
  return { close: () => handles.forEach((handle) => handle.close()) };
}

export async function subscribeParticipantDirectTask(
  privKeyHex: string,
  selfPubkey: string,
  task: Task,
  onTask: (task: Task) => void,
): Promise<{ close: () => void }> {
  let current = task;
  let lastAt = Math.max(
    Date.parse(task.completedAt || '') || 0,
    Date.parse(task.startedAt || '') || 0,
    Date.parse(task.arrivedAt || '') || 0,
    Date.parse(task.createdAt || '') || 0,
  );
  return subscribeMessages(privKeyHex, selfPubkey, task.id, (message, sender) => {
    const expected = selfPubkey === current.requesterPubkey
      ? current.providerPubkey
      : current.requesterPubkey;
    if (!expected || sender.toLowerCase() !== expected.toLowerCase()) return;
    if (message.at <= lastAt) return;
    lastAt = message.at;
    if (message.type === 'state' && message.status) {
      const next: Task = {
        ...current,
        status: message.status,
        ...(message.status === 'arrived' ? { arrivedAt: new Date(message.at).toISOString() } : {}),
        ...(message.status === 'active' ? { startedAt: new Date(message.at).toISOString() } : {}),
        ...(message.status === 'completed' ? { completedAt: new Date(message.at).toISOString() } : {}),
      };
      current = next;
      void saveDirectTask(privKeyHex, next);
      onTask(next);
    } else if (message.type === 'cancel') {
      const next: Task = {
        ...current,
        status: 'cancelled',
        cancellationReason: message.reason,
      };
      current = next;
      void saveDirectTask(privKeyHex, next);
      onTask(next);
    }
  });
}

export async function transitionDirectTask(
  privKeyHex: string,
  taskIdValue: string,
  status: string,
): Promise<Task> {
  const task = await loadDirectTask(privKeyHex, taskIdValue);
  if (!task) throw new Error('Encrypted journey state is unavailable on this device');
  const recipient = task.providerPubkey === undefined
    ? null
    : (task.providerPubkey === task.requesterPubkey ? null
      : (task.requesterPubkey === (await nostrTools()).getPublicKey(hexToBytes(privKeyHex))
        ? task.providerPubkey : task.requesterPubkey));
  if (!recipient) throw new Error('The matched counterparty is unavailable');
  const at = Date.now();
  const next: Task = {
    ...task,
    status,
    ...(status === 'arrived' ? { arrivedAt: new Date(at).toISOString() } : {}),
    ...(status === 'active' ? { startedAt: new Date(at).toISOString() } : {}),
    ...(status === 'completed' ? { completedAt: new Date(at).toISOString() } : {}),
  };
  await publishMessage(privKeyHex, recipient, {
    version: 1, taskId: task.id, type: 'state', status, at,
  });
  await saveDirectTask(privKeyHex, next);
  return next;
}

export async function cancelDirectTask(
  privKeyHex: string,
  taskIdValue: string,
  reason?: string,
): Promise<Task> {
  const task = await loadDirectTask(privKeyHex, taskIdValue);
  if (!task) throw new Error('Encrypted journey state is unavailable on this device');
  const { getPublicKey } = await nostrTools();
  const self = getPublicKey(hexToBytes(privKeyHex));
  const recipient = self === task.requesterPubkey ? task.providerPubkey : task.requesterPubkey;
  if (recipient) {
    await publishMessage(privKeyHex, recipient, {
      version: 1, taskId: task.id, type: 'cancel', reason, at: Date.now(),
    });
  } else {
    const capability = await loadCapability(privKeyHex, task.id);
    if (capability) await publishTaskState(capability.rendezvousPrivkey, task, 'closed');
  }
  const next = { ...task, status: 'cancelled', cancellationReason: reason };
  await saveDirectTask(privKeyHex, next);
  return next;
}
