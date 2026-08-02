/**
 * Trip sharing — flock's share → all-clear → alert pattern on the same
 * NIP-17 gift-wrap rail as chat. The rider picks trusted contacts
 * (guardians) and sends them E2E encrypted trip updates directly over
 * public relays: the operator never sees or carries them, and the
 * guardian needs nothing more than any NIP-17-capable Nostr DM client
 * (0xchat, Amethyst, …) to read them — DonkeyRide not required.
 *
 * Deliberately NOT live tracking: a share names the driver and route
 * area, an all-clear confirms safe arrival, an alert forwards a panic.
 * (Full flock-circle integration — group envelope keys, breadcrumb
 * trails — belongs to the Flock app; this speaks the same language a
 * human can read.)
 */

import type { NostrEvent } from '../types/nostr';
import { hexToBytes } from './nostr';
import { publishToRelays } from './relays';
import type { Task } from '../types/api';

const DM_KIND = 14;
const SUBJECT_PREFIX = 'donkeyride-trip:';
const CONTACTS_KEY = 'donkeyride.trusted-contacts';
const SHARED_KEY_PREFIX = 'donkeyride.tripshare.';

function nostrTools() {
  return import('nostr-tools');
}

// ── Trusted contacts (guardian npubs, device-local) ──

export function getTrustedContacts(): string[] {
  try {
    const raw = localStorage.getItem(CONTACTS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((n) => typeof n === 'string') : [];
  } catch {
    return [];
  }
}

/** Validate and store a guardian npub. Returns the normalised npub. */
export async function addTrustedContact(npub: string): Promise<string> {
  const trimmed = npub.trim();
  const { nip19 } = await nostrTools();
  const decoded = nip19.decode(trimmed);
  if (decoded.type !== 'npub') {
    throw new Error('Not an npub');
  }
  const list = getTrustedContacts();
  if (!list.includes(trimmed)) {
    localStorage.setItem(CONTACTS_KEY, JSON.stringify([...list, trimmed]));
  }
  return trimmed;
}

export function removeTrustedContact(npub: string): void {
  const list = getTrustedContacts().filter((n) => n !== npub);
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(list));
}

// ── Who a trip was shared with (per task, device-local) ──

export function getSharedGuardians(taskId: string): string[] {
  try {
    const raw = localStorage.getItem(SHARED_KEY_PREFIX + taskId);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function rememberShared(taskId: string, npub: string): void {
  const list = getSharedGuardians(taskId);
  if (!list.includes(npub)) {
    localStorage.setItem(SHARED_KEY_PREFIX + taskId, JSON.stringify([...list, npub]));
  }
}

// ── Message builders (pure — unit tested) ──────────

function area(loc?: { lat: number; lng: number } | null): string {
  if (!loc) return 'not set';
  return `${loc.lat.toFixed(2)}, ${loc.lng.toFixed(2)}`;
}

export function buildTripShareText(task: Task, taskNoun = 'ride'): string {
  const driver = task.providerNpub
    ? `${task.providerNpub.slice(0, 20)}…`
    : 'not yet assigned';
  return [
    `🫏 I'm taking a DonkeyRide ${taskNoun} and I'm sharing it with you.`,
    `Driver: ${driver}`,
    `From around ${area(task.pickup)} to around ${area(task.dropoff)}.`,
    `I'll send an all-clear here when I arrive — if you don't hear from me, please check in.`,
  ].join('\n');
}

export function buildAllClearText(taskNoun = 'ride'): string {
  return `✅ All clear — my DonkeyRide ${taskNoun} is complete and I've arrived safely.`;
}

export function buildAlertText(task: Task, location?: { lat: number; lng: number } | null): string {
  const driver = task.providerNpub ? `${task.providerNpub.slice(0, 20)}…` : 'unknown';
  const lastKnown = location ? `Last known location: around ${area(location)}.` : '';
  return [
    `🆘 I've triggered the panic alarm on my DonkeyRide trip.`,
    `Driver: ${driver}. ${lastKnown}`,
    `Please contact me NOW — and if I don't answer, raise help.`,
  ].join('\n').trim();
}

export function buildRideCheckAlertText(
  task: Task,
  reason: 'off_route' | 'stalled',
  location?: { lat: number; lng: number } | null,
): string {
  const driver = task.providerNpub ? `${task.providerNpub.slice(0, 20)}…` : 'unknown';
  const what = reason === 'off_route'
    ? 'has left the expected route'
    : 'has been stopped for a while';
  const lastKnown = location ? ` Last known location: around ${area(location)}.` : '';
  return [
    `⚠️ Automatic safety check: my DonkeyRide trip ${what} and I haven't confirmed I'm OK.`,
    `Driver: ${driver}.${lastKnown}`,
    `Please check in with me — and if I don't answer, raise help.`,
  ].join('\n');
}

// ── Sending (gift-wrapped, guardian + self copy) ────

async function sendGuardianMessage(
  privKeyHex: string,
  guardianNpub: string,
  taskId: string,
  text: string,
): Promise<void> {
  const { nip19, nip59, getPublicKey } = await nostrTools();
  const decoded = nip19.decode(guardianNpub);
  if (decoded.type !== 'npub') throw new Error('Not an npub');
  const guardianPubkey = decoded.data as string;

  const priv = hexToBytes(privKeyHex);
  const selfPubkey = getPublicKey(priv);

  const rumor = nip59.createRumor({
    kind: DM_KIND,
    content: text,
    tags: [['p', guardianPubkey], ['subject', SUBJECT_PREFIX + taskId]],
    created_at: Math.floor(Date.now() / 1000),
  }, priv);

  const wraps = [selfPubkey, guardianPubkey].map((recipient) =>
    nip59.createWrap(nip59.createSeal(rumor, priv, recipient), recipient));

  const acks = await Promise.all(wraps.map((wrap) => publishToRelays(wrap as NostrEvent)));
  if (acks.every((count) => count === 0)) {
    throw new Error('No relay accepted the message — check your connection');
  }
}

/** Share a trip with a guardian; remembered so the all-clear follows. */
export async function shareTrip(
  privKeyHex: string,
  guardianNpub: string,
  task: Task,
  taskNoun = 'ride',
): Promise<void> {
  await sendGuardianMessage(privKeyHex, guardianNpub, task.id, buildTripShareText(task, taskNoun));
  rememberShared(task.id, guardianNpub);
}

/** Tell every guardian this trip was shared with that it ended safely. */
export async function sendAllClear(
  privKeyHex: string,
  taskId: string,
  taskNoun = 'ride',
): Promise<void> {
  const guardians = getSharedGuardians(taskId);
  await Promise.allSettled(guardians.map((npub) =>
    sendGuardianMessage(privKeyHex, npub, taskId, buildAllClearText(taskNoun))));
  localStorage.removeItem(SHARED_KEY_PREFIX + taskId);
}

/** Ride check went unanswered (or the rider chose to alert). */
export async function sendRideCheckAlert(
  privKeyHex: string,
  task: Task,
  reason: 'off_route' | 'stalled',
  location?: { lat: number; lng: number } | null,
): Promise<void> {
  const guardians = getSharedGuardians(task.id);
  await Promise.allSettled(guardians.map((npub) =>
    sendGuardianMessage(privKeyHex, npub, task.id, buildRideCheckAlertText(task, reason, location))));
}

/** Forward a panic to every guardian this trip was shared with. */
export async function sendGuardianAlert(
  privKeyHex: string,
  task: Task,
  location?: { lat: number; lng: number } | null,
): Promise<void> {
  const guardians = getSharedGuardians(task.id);
  await Promise.allSettled(guardians.map((npub) =>
    sendGuardianMessage(privKeyHex, npub, task.id, buildAlertText(task, location))));
}
