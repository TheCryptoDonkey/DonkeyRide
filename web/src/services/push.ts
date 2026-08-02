import { getVapidKey, subscribePush, unsubscribePush } from './api';
import type { LatLng } from '../types/api';

/**
 * Web Push job alerts (VAPID — the operator's own keys, no Firebase).
 * A WS frame only reaches an open socket; this is how a driver with the
 * app backgrounded or the screen off still hears about a job. Payloads
 * are end-to-end encrypted to this device (RFC 8291).
 */

/** Decode a URL-safe base64 VAPID key for pushManager.subscribe */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalised);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * Register this device for job alerts. Call from a user gesture (the
 * Go online button) — the permission prompt fires before any await so
 * Safari still counts it as gesture-driven. Best-effort: returns false
 * rather than throwing (no service worker in dev, permission denied,
 * operator without push configured).
 */
export async function enableJobPush(
  pubkey: string,
  areas: string[],
  location: LatLng | null,
): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') return false;

    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return false; // dev builds register no worker

    const key = await getVapidKey();
    if (!key) return false;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });
    }

    await subscribePush({
      subscription: subscription.toJSON(),
      pubkey,
      areas,
      location: location ? { lat: location.lat, lon: location.lng } : null,
    });
    return true;
  } catch {
    return false;
  }
}

/** Going off shift — the operator stops pushing to this device.
 *  The browser subscription is kept for an instant re-enable. */
export async function disableJobPush(pubkey: string): Promise<void> {
  try {
    await unsubscribePush(pubkey);
  } catch {
    // Best-effort — an unreachable operator can't push anyway
  }
}
