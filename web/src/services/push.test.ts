import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Job alerts inside the Android wrap.
 *
 * The Push API does not exist in a WebView, so the wrapped driver app
 * takes the UnifiedPush path instead. What matters is that the operator
 * cannot tell the difference — same subscription shape, same VAPID key —
 * and that a driver is never told they are reachable when they are not.
 */

const pushPlugin = {
  distributors: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
  getSubscription: vi.fn(),
  takePendingUrl: vi.fn(),
  requestNotificationPermission: vi.fn(),
  addListener: vi.fn(),
};

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  },
  registerPlugin: () => pushPlugin,
}));

const subscribePush = vi.fn().mockResolvedValue({ success: true });
const unsubscribePush = vi.fn().mockResolvedValue({ success: true });
const getVapidKey = vi.fn().mockResolvedValue('a'.repeat(87));

vi.mock('./api', () => ({
  subscribePush: (...args: unknown[]) => subscribePush(...args),
  unsubscribePush: (...args: unknown[]) => unsubscribePush(...args),
  getVapidKey: () => getVapidKey(),
}));

const NATIVE_SUBSCRIPTION = {
  endpoint: 'https://ntfy.sh/up_abc123',
  keys: { p256dh: 'BPubKey', auth: 'AuthSecret' },
};

let listeners: ((data: { subscription: unknown }) => void)[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  listeners = [];
  pushPlugin.requestNotificationPermission.mockResolvedValue({ granted: true });
  pushPlugin.getSubscription.mockResolvedValue({ subscription: null });
  pushPlugin.unregister.mockResolvedValue(undefined);
  pushPlugin.addListener.mockImplementation((_event: string, handler: (data: { subscription: unknown }) => void) => {
    listeners.push(handler);
    return Promise.resolve({ remove: () => Promise.resolve() });
  });
});

async function freshModule() {
  vi.resetModules();
  return import('./push');
}

describe('native job push', () => {
  it('sends the operator the UnifiedPush endpoint in the ordinary Web Push shape', async () => {
    pushPlugin.register.mockResolvedValue({ status: 'registering', distributor: 'io.heckel.ntfy' });
    pushPlugin.getSubscription.mockResolvedValue({ subscription: NATIVE_SUBSCRIPTION });

    const { enableJobPush, getPushState } = await freshModule();
    const enabled = await enableJobPush('driverpubkey', ['gcw2'], { lat: 51.5, lng: -0.12 });

    expect(enabled).toBe(true);
    expect(getPushState()).toBe('enabled');
    expect(subscribePush).toHaveBeenCalledTimes(1);
    const [params] = subscribePush.mock.calls[0] as [Record<string, unknown>];
    expect(params.subscription).toEqual(NATIVE_SUBSCRIPTION);
    expect(params.pubkey).toBe('driverpubkey');
    expect(params.areas).toEqual(['gcw2']);
    // The operator's own VAPID key, exactly as the browser path uses it
    expect(pushPlugin.register).toHaveBeenCalledWith({ vapid: 'a'.repeat(87) });
  });

  it('reports a missing distributor instead of pretending the driver is reachable', async () => {
    pushPlugin.register.mockResolvedValue({ status: 'no_distributor' });

    const { enableJobPush, getPushState } = await freshModule();
    const enabled = await enableJobPush('driverpubkey', [], null);

    expect(enabled).toBe(false);
    expect(getPushState()).toBe('no_distributor');
    // Nothing is registered with the operator — a subscription with no
    // transport behind it would be a driver who never hears a job.
    expect(subscribePush).not.toHaveBeenCalled();
  });

  it('reports a refused notification permission', async () => {
    pushPlugin.requestNotificationPermission.mockResolvedValue({ granted: false });

    const { enableJobPush, getPushState } = await freshModule();
    expect(await enableJobPush('driverpubkey', [], null)).toBe(false);
    expect(getPushState()).toBe('denied');
    expect(subscribePush).not.toHaveBeenCalled();
  });

  it('fails honestly when the distributor never produces an endpoint', async () => {
    pushPlugin.register.mockResolvedValue({ status: 'registering' });
    pushPlugin.getSubscription.mockResolvedValue({ subscription: null });

    const { enableJobPush, getPushState } = await freshModule();
    vi.useFakeTimers();
    const pending = enableJobPush('driverpubkey', [], null);
    await vi.advanceTimersByTimeAsync(13000);
    const enabled = await pending;
    vi.useRealTimers();

    expect(enabled).toBe(false);
    expect(getPushState()).toBe('failed');
    expect(subscribePush).not.toHaveBeenCalled();
  });

  it('re-registers when the distributor rotates the endpoint', async () => {
    pushPlugin.register.mockResolvedValue({ status: 'registering' });
    pushPlugin.getSubscription.mockResolvedValue({ subscription: NATIVE_SUBSCRIPTION });

    const { enableJobPush } = await freshModule();
    await enableJobPush('driverpubkey', ['gcw2'], null);
    expect(subscribePush).toHaveBeenCalledTimes(1);

    const rotated = { endpoint: 'https://ntfy.sh/up_rotated', keys: NATIVE_SUBSCRIPTION.keys };
    listeners.forEach((handler) => handler({ subscription: rotated }));
    await Promise.resolve();

    expect(subscribePush).toHaveBeenCalledTimes(2);
    const [params] = subscribePush.mock.calls[1] as [Record<string, unknown>];
    expect(params.subscription).toEqual(rotated);
    // Same driver, same working areas — a rotation must not silently
    // widen or narrow where they get jobs from.
    expect(params.pubkey).toBe('driverpubkey');
    expect(params.areas).toEqual(['gcw2']);
  });

  it('releases the distributor when the driver goes off shift', async () => {
    const { disableJobPush, getPushState } = await freshModule();
    await disableJobPush('driverpubkey');

    expect(unsubscribePush).toHaveBeenCalledWith('driverpubkey');
    expect(pushPlugin.unregister).toHaveBeenCalledTimes(1);
    expect(getPushState()).toBe('idle');
  });
});
