import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildTripShareText, buildAllClearText, buildAlertText, buildRideCheckAlertText,
  getTrustedContacts, addTrustedContact, removeTrustedContact,
  getSharedGuardians,
} from './trip-share';
import type { Task } from '../types/api';

const task: Task = {
  id: 'ride_test1',
  status: 'en_route',
  requesterPubkey: 'a'.repeat(64),
  providerNpub: 'npub1driverdriverdriverdriverdriverdriverdriver',
  pickup: { lat: 53.4808, lng: -2.2426 },
  dropoff: { lat: 53.4774, lng: -2.2309 },
  fareEstimateSats: 8000,
  createdAt: new Date().toISOString(),
};

beforeEach(() => {
  localStorage.clear();
});

describe('trip share messages', () => {
  it('share names the driver and both areas, and promises an all-clear', () => {
    const text = buildTripShareText(task);
    expect(text).toContain('npub1driverdriverdri…');
    expect(text).toContain('53.48, -2.24');
    expect(text).toContain('53.48, -2.23');
    expect(text).toContain('all-clear');
  });

  it('share copes with no driver assigned yet', () => {
    const text = buildTripShareText({ ...task, providerNpub: undefined });
    expect(text).toContain('not yet assigned');
  });

  it('all-clear is unambiguous', () => {
    expect(buildAllClearText()).toContain('All clear');
    expect(buildAllClearText()).toContain('arrived safely');
  });

  it('alert carries the driver and last known location', () => {
    const text = buildAlertText(task, { lat: 53.5, lng: -2.25 });
    expect(text).toContain('🆘');
    expect(text).toContain('npub1driverdriverdri…');
    expect(text).toContain('53.50, -2.25');
  });

  it('alert without a location still reads sensibly', () => {
    const text = buildAlertText(task, null);
    expect(text).toContain('🆘');
    expect(text).not.toContain('Last known location');
  });

  it('ride-check alert names the condition and the driver', () => {
    const offRoute = buildRideCheckAlertText(task, 'off_route', { lat: 53.5, lng: -2.25 });
    expect(offRoute).toContain('left the expected route');
    expect(offRoute).toContain('npub1driverdriverdri…');
    expect(offRoute).toContain('53.50, -2.25');

    const stalled = buildRideCheckAlertText(task, 'stalled', null);
    expect(stalled).toContain('stopped for a while');
    expect(stalled).not.toContain('Last known location');
  });
});

describe('trusted contacts storage', () => {
  it('rejects non-npub input', async () => {
    await expect(addTrustedContact('not-an-npub')).rejects.toThrow();
    await expect(addTrustedContact('a'.repeat(64))).rejects.toThrow();
  });

  it('stores, dedupes and removes contacts', async () => {
    // A real, valid npub (decodes cleanly)
    const npub = 'npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6';
    await addTrustedContact(npub);
    await addTrustedContact(` ${npub} `);
    expect(getTrustedContacts()).toEqual([npub]);
    removeTrustedContact(npub);
    expect(getTrustedContacts()).toEqual([]);
  });

  it('shared guardians default to empty per task', () => {
    expect(getSharedGuardians('ride_never_shared')).toEqual([]);
  });
});
