import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/**
 * UnifiedPush — off-shift job alerts inside the native driver app.
 *
 * Web Push works in a browser and does not exist in an Android WebView, so
 * the wrapped app would go silent the moment it is backgrounded and the
 * dispatch socket drops. UnifiedPush fills that gap without Firebase: the
 * driver's own distributor app (ntfy is the common one) carries the
 * message, and what comes back is an ordinary Web Push subscription —
 * endpoint plus p256dh/auth keys — so the operator encrypts to it with the
 * VAPID keys it already has and nothing on the server changes.
 *
 * No distributor installed means no alerts. We say so plainly rather than
 * quietly falling back to Google's transport, which is the whole point of
 * choosing this rail.
 */

export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export type RegisterStatus = 'registering' | 'no_distributor' | 'choose_distributor';

interface UnifiedPushPlugin {
  distributors(): Promise<{ distributors: string[]; current: string | null }>;
  register(options: { vapid: string; distributor?: string }): Promise<{
    status: RegisterStatus;
    distributor?: string;
    distributors?: string[];
  }>;
  unregister(): Promise<void>;
  getSubscription(): Promise<{ subscription: PushSubscriptionJson | null }>;
  takePendingUrl(): Promise<{ url: string | null }>;
  requestNotificationPermission(): Promise<{ granted: boolean }>;
  addListener(
    event: 'subscriptionChange',
    handler: (data: { subscription: PushSubscriptionJson | null }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: 'notificationTapped',
    handler: (data: { url: string }) => void,
  ): Promise<PluginListenerHandle>;
}

const plugin = registerPlugin<UnifiedPushPlugin>('UnifiedPush');

/** Only the Android wrap has this rail. The PWA keeps using Web Push. */
export function unifiedPushSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!unifiedPushSupported()) return false;
  try {
    const { granted } = await plugin.requestNotificationPermission();
    return granted;
  } catch {
    return false;
  }
}

export async function listDistributors(): Promise<{ distributors: string[]; current: string | null }> {
  if (!unifiedPushSupported()) return { distributors: [], current: null };
  try {
    return await plugin.distributors();
  } catch {
    return { distributors: [], current: null };
  }
}

export async function registerUnifiedPush(
  vapid: string,
  distributor?: string,
): Promise<{ status: RegisterStatus; distributors?: string[] }> {
  const result = await plugin.register(distributor ? { vapid, distributor } : { vapid });
  return { status: result.status, distributors: result.distributors };
}

export async function unregisterUnifiedPush(): Promise<void> {
  if (!unifiedPushSupported()) return;
  try {
    await plugin.unregister();
  } catch {
    // Best-effort: an unregister we cannot deliver costs a stale endpoint,
    // which the operator drops on its next 410.
  }
}

export async function currentSubscription(): Promise<PushSubscriptionJson | null> {
  if (!unifiedPushSupported()) return null;
  try {
    const { subscription } = await plugin.getSubscription();
    return subscription || null;
  } catch {
    return null;
  }
}

/**
 * The endpoint arrives from the distributor asynchronously, often within a
 * second but not always. Waits for it rather than reporting success on a
 * registration that has not produced anything to push to yet.
 */
export async function awaitSubscription(timeoutMs = 12000): Promise<PushSubscriptionJson | null> {
  const existing = await currentSubscription();
  if (existing) return existing;

  return new Promise((resolve) => {
    let settled = false;
    let handle: PluginListenerHandle | null = null;

    const finish = (subscription: PushSubscriptionJson | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.clearInterval(poll);
      void handle?.remove();
      resolve(subscription);
    };

    const timer = window.setTimeout(() => finish(null), timeoutMs);
    // Belt and braces: the listener can miss an endpoint that landed
    // while the bridge was still starting.
    const poll = window.setInterval(() => {
      void currentSubscription().then((subscription) => {
        if (subscription) finish(subscription);
      });
    }, 750);

    void plugin
      .addListener('subscriptionChange', ({ subscription }) => {
        if (subscription) finish(subscription);
      })
      .then((listener) => {
        handle = listener;
        if (settled) void listener.remove();
      });
  });
}

/** Fires when the distributor rotates or revokes this device's endpoint. */
export async function onSubscriptionChange(
  handler: (subscription: PushSubscriptionJson | null) => void,
): Promise<PluginListenerHandle | null> {
  if (!unifiedPushSupported()) return null;
  try {
    return await plugin.addListener('subscriptionChange', ({ subscription }) => handler(subscription || null));
  } catch {
    return null;
  }
}

/** Where a tapped notification wants the app to go, consumed once. */
export async function takePendingUrl(): Promise<string | null> {
  if (!unifiedPushSupported()) return null;
  try {
    const { url } = await plugin.takePendingUrl();
    return url || null;
  } catch {
    return null;
  }
}

export async function onNotificationTapped(
  handler: (url: string) => void,
): Promise<PluginListenerHandle | null> {
  if (!unifiedPushSupported()) return null;
  try {
    return await plugin.addListener('notificationTapped', ({ url }) => handler(url));
  } catch {
    return null;
  }
}
