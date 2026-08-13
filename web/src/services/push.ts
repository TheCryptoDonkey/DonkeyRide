import { getVapidKey, subscribePush, unsubscribePush } from './api';
import { loadGender, loadWomenOnlyDriver } from '../utils/gender';
import {
  awaitSubscription,
  onSubscriptionChange,
  registerUnifiedPush,
  requestNotificationPermission,
  unifiedPushSupported,
  unregisterUnifiedPush,
} from './unified-push';
import type { LatLng } from '../types/api';

/**
 * Web Push job alerts (VAPID — the operator's own keys, no Firebase).
 * A WS frame only reaches an open socket; this is how a driver with the
 * app backgrounded or the screen off still hears about a job. Payloads
 * are end-to-end encrypted to this device (RFC 8291).
 *
 * Two transports, one subscription shape. In a browser that is the Push
 * API; inside the Android wrap — where the Push API does not exist —
 * it is UnifiedPush via the driver's own distributor. The operator sees
 * the same {endpoint, keys} either way and encrypts the same way, so the
 * branch lives here and nothing downstream knows the difference.
 */

/**
 * Why job alerts are not currently arriving, when they are not. The
 * driver dashboard shows this: a silent failure here reads as "no jobs
 * tonight", which is the worst possible way to be wrong.
 */
export type PushState =
  | 'idle'
  | 'enabled'
  | 'unsupported'
  | 'denied'
  | 'no_distributor'
  | 'choose_distributor'
  | 'failed';

let pushState: PushState = 'idle';
const stateListeners = new Set<(state: PushState) => void>();

function setPushState(state: PushState): void {
  if (state === pushState) return;
  pushState = state;
  stateListeners.forEach((listener) => listener(state));
}

export function getPushState(): PushState {
  return pushState;
}

export function onPushStateChange(listener: (state: PushState) => void): () => void {
  stateListeners.add(listener);
  return () => { stateListeners.delete(listener); };
}

/** Re-subscription details, kept so a rotated endpoint can re-register itself */
let lastJobSubscribe: { pubkey: string; areas: string[]; location: LatLng | null; domain?: string } | null = null;
let rotationWatcher: Promise<unknown> | null = null;

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
  domain?: string,
): Promise<boolean> {
  if (unifiedPushSupported()) {
    return enableNativeJobPush(pubkey, areas, location, domain);
  }
  if (!pushSupported()) {
    setPushState('unsupported');
    return false;
  }
  try {
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') {
      setPushState('denied');
      return false;
    }

    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      setPushState('unsupported'); // dev builds register no worker
      return false;
    }

    const key = await getVapidKey();
    if (!key) {
      setPushState('unsupported');
      return false;
    }

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
      // Self-declared, so pushed jobs honour women-only pairing too
      gender: loadGender(),
      women_only: loadWomenOnlyDriver(),
      domain,
    });
    setPushState('enabled');
    return true;
  } catch {
    setPushState('failed');
    return false;
  }
}

/**
 * The same registration inside the Android wrap, over UnifiedPush.
 *
 * The distributor answers asynchronously, so this waits for a real
 * endpoint before telling the operator anything — a subscription with no
 * endpoint would be a driver who believes they are reachable and is not.
 */
async function enableNativeJobPush(
  pubkey: string,
  areas: string[],
  location: LatLng | null,
  domain?: string,
): Promise<boolean> {
  lastJobSubscribe = { pubkey, areas, location, domain };
  try {
    if (!(await requestNotificationPermission())) {
      setPushState('denied');
      return false;
    }

    const key = await getVapidKey();
    if (!key) {
      setPushState('unsupported');
      return false;
    }

    const { status } = await registerUnifiedPush(key);
    if (status === 'no_distributor' || status === 'choose_distributor') {
      // Nothing to fall back to, and we are not adding Firebase to
      // manufacture one. The dashboard explains what to install.
      setPushState(status);
      return false;
    }

    const subscription = await awaitSubscription();
    if (!subscription) {
      setPushState('failed');
      return false;
    }

    await subscribePush({
      subscription,
      pubkey,
      areas,
      location: location ? { lat: location.lat, lon: location.lng } : null,
      gender: loadGender(),
      women_only: loadWomenOnlyDriver(),
      domain,
    });
    setPushState('enabled');
    watchForRotation();
    return true;
  } catch {
    setPushState('failed');
    return false;
  }
}

/**
 * A distributor may hand out a new endpoint at any time (its server moved,
 * the app was reinstalled). Re-register with the operator when it does,
 * otherwise alerts stop silently and the driver never finds out.
 */
function watchForRotation(): void {
  if (rotationWatcher) return;
  rotationWatcher = onSubscriptionChange((subscription) => {
    if (!subscription || !lastJobSubscribe) return;
    void subscribePush({
      subscription,
      pubkey: lastJobSubscribe.pubkey,
      areas: lastJobSubscribe.areas,
      location: lastJobSubscribe.location
        ? { lat: lastJobSubscribe.location.lat, lon: lastJobSubscribe.location.lng }
        : null,
      gender: loadGender(),
      women_only: loadWomenOnlyDriver(),
      domain: lastJobSubscribe.domain,
    }).catch(() => {
      setPushState('failed');
    });
  });
}

/**
 * Register a RIDER's device for their own task alerts: matched, arrived,
 * cancelled. Same VAPID rail as job alerts, but the subscription is
 * flagged `requester` so it can never be swept into job dispatch.
 *
 * Call from the gesture that requests the task — the permission prompt
 * then rides a tap the rider already meant to make, and the alerts start
 * exactly when they become useful. Best-effort: a refusal costs nothing
 * but the lock-screen update.
 */
export async function enableTaskPush(pubkey: string): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') return false;

    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return false;

    const key = await getVapidKey();
    if (!key) return false;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });
    }

    await subscribePush({ subscription: subscription.toJSON(), pubkey, role: 'requester' });
    return true;
  } catch {
    return false;
  }
}

/** Going off shift — the operator stops pushing to this device.
 *  The browser subscription is kept for an instant re-enable; the native
 *  registration is released, since a distributor carrying messages for an
 *  off-shift driver is a battery cost with nothing on the other end. */
export async function disableJobPush(pubkey: string): Promise<void> {
  lastJobSubscribe = null;
  try {
    await unsubscribePush(pubkey);
  } catch {
    // Best-effort — an unreachable operator can't push anyway
  }
  if (unifiedPushSupported()) {
    await unregisterUnifiedPush();
  }
  setPushState('idle');
}
