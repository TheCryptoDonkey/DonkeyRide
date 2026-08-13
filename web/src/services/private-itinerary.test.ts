import { beforeEach, describe, expect, it } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { bytesToHex } from './nostr';
import {
  itineraryFromTask, loadPrivateItinerary, mergePrivateItinerary,
  savePrivateItinerary, createPrivateItineraryWraps,
} from './private-itinerary';
import type { Task } from '../types/api';
import { unwrapVerifiedRumor } from './chat';

const task: Task = {
  id: 'ride_private',
  status: 'requested',
  requesterPubkey: 'a'.repeat(64),
  pickup: { lat: 53.4808123, lng: -2.2426123 },
  dropoff: { lat: 53.4774567, lng: -2.2309456 },
  stops: [{ lat: 53.49, lng: -2.2, address: 'Private stop' }],
  pickupAddress: 'Private pickup',
  dropoffAddress: 'Private dropoff',
  pickupNote: 'blue gate',
  fareEstimateSats: 0,
  settlementMode: 'none',
  locationMode: 'participant_encrypted',
  createdAt: new Date().toISOString(),
};

beforeEach(() => localStorage.clear());

describe('private itinerary device storage', () => {
  it('round-trips exact points without storing their cleartext', async () => {
    const priv = bytesToHex(generateSecretKey());
    const itinerary = itineraryFromTask(task);
    await savePrivateItinerary(priv, itinerary);

    const stored = localStorage.getItem('donkeyride.private-itinerary.ride_private');
    expect(stored).toBeTruthy();
    expect(stored).not.toContain('Private pickup');
    expect(stored).not.toContain('53.4808123');
    expect(await loadPrivateItinerary(priv, task.id)).toEqual(itinerary);
  });

  it('cannot be decrypted by a different device identity', async () => {
    const owner = bytesToHex(generateSecretKey());
    const stranger = bytesToHex(generateSecretKey());
    await savePrivateItinerary(owner, itineraryFromTask(task));
    expect(await loadPrivateItinerary(stranger, task.id)).toBeNull();
  });

  it('merges exact data into a coarse operator task only for the same id', () => {
    const coarse = {
      ...task,
      pickup: { lat: 53.48, lng: -2.24 },
      dropoff: { lat: 53.48, lng: -2.23 },
      stops: undefined,
      pickupAddress: undefined,
    };
    const itinerary = itineraryFromTask(task);
    expect(mergePrivateItinerary(coarse, itinerary).pickup).toEqual(task.pickup);
    expect(mergePrivateItinerary({ ...coarse, id: 'other' }, itinerary).pickup)
      .toEqual(coarse.pickup);
  });

  it('gift-wraps the itinerary so only the matched recipient can open it', async () => {
    const senderPriv = generateSecretKey();
    const recipientPriv = generateSecretKey();
    const strangerPriv = generateSecretKey();
    const senderHex = bytesToHex(senderPriv);
    const recipientHex = bytesToHex(recipientPriv);
    const wraps = await createPrivateItineraryWraps(
      senderHex, getPublicKey(recipientPriv), itineraryFromTask(task),
    );
    const recipientWrap = wraps.find((wrap) =>
      wrap.tags.some((tag) => tag[0] === 'p' && tag[1] === getPublicKey(recipientPriv)));
    expect(recipientWrap).toBeTruthy();
    expect(JSON.stringify(recipientWrap)).not.toContain('Private pickup');
    expect(JSON.stringify(recipientWrap)).not.toContain('53.4808123');

    const rumor = await unwrapVerifiedRumor(recipientWrap!, recipientHex);
    expect(rumor?.pubkey).toBe(getPublicKey(senderPriv));
    expect(JSON.parse(rumor!.content).pickup).toEqual(task.pickup);
    expect(await unwrapVerifiedRumor(recipientWrap!, bytesToHex(strangerPriv))).toBeNull();
  });
});
