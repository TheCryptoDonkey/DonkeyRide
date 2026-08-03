import type { LatLng } from '../types/api';

/**
 * Native (Capacitor) on-shift location.
 *
 * Two implementations behind one call, because the platforms genuinely
 * differ:
 *
 *   Android — @capacitor-community/background-geolocation runs a FOREGROUND
 *   SERVICE with a persistent notification, which does two jobs at once:
 *     - GPS fixes keep flowing with the screen off or the app backgrounded
 *     - the process (and so the WebView + dispatch WebSocket) stays alive,
 *       so jobs keep arriving mid-shift without any push round trip
 *
 *   iOS — `ShiftLocationPlugin.swift` in the App target. The community
 *   plugin does not compile against Capacitor 8 on iOS and is unmaintained,
 *   so the wrap ships its own CLLocationManager watcher with the same three
 *   methods. It reports failures as a resolved `{error}` payload rather than
 *   a rejection (see the toolchain note in that file), which is why the
 *   callback below reads both shapes.
 *
 * No-ops cleanly on the web: every entry point checks the platform first,
 * and the plugin is resolved lazily so the web bundle never loads it.
 */

/** Which plugin issued the watcher, so it is stopped through the same one */
export type ShiftWatcher = { id: string; plugin: string };

interface NativeFix {
  latitude?: number;
  longitude?: number;
  /** iOS only: a failure that arrived as a resolved payload */
  error?: { code?: string; message?: string };
}

interface WatcherPlugin {
  addWatcher(
    options: Record<string, unknown>,
    callback: (position?: NativeFix, error?: { code?: string }) => void,
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
}

export async function isNativePlatform(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

async function resolvePlugin(): Promise<{ plugin: WatcherPlugin; name: string } | null> {
  try {
    const { Capacitor, registerPlugin } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return null;
    const name = Capacitor.getPlatform() === 'ios' ? 'ShiftLocation' : 'BackgroundGeolocation';
    return { plugin: registerPlugin<WatcherPlugin>(name), name };
  } catch {
    return null;
  }
}

/**
 * Start the on-shift watcher. Returns a handle to stop it, or null on
 * web / permission refusal. Fixes arrive via `onFix` (already {lat,lng}).
 */
export async function startShiftTracking(
  onFix: (location: LatLng) => void,
): Promise<ShiftWatcher | null> {
  const resolved = await resolvePlugin();
  if (!resolved) return null;
  const { plugin, name } = resolved;

  try {
    const id = await plugin.addWatcher(
      {
        backgroundTitle: 'On shift',
        backgroundMessage: 'Receiving job requests',
        requestPermissions: true,
        // Fresh fixes only — a stale cached position must never register
        stale: false,
        distanceFilter: 25,
      },
      (position, error) => {
        const failure = error || position?.error;
        if (failure) {
          if (failure.code === 'NOT_AUTHORIZED') {
            // The driver declined — the watcher is dead; web geolocation
            // (foreground-only) remains the fallback
            void plugin.openSettings().catch(() => {});
          }
          return;
        }
        if (position && position.latitude != null && position.longitude != null) {
          onFix({ lat: position.latitude, lng: position.longitude });
        }
      },
    );
    return { id, plugin: name };
  } catch {
    return null;
  }
}

export async function stopShiftTracking(watcher: ShiftWatcher | null): Promise<void> {
  if (!watcher) return;
  try {
    const { registerPlugin } = await import('@capacitor/core');
    const plugin = registerPlugin<Pick<WatcherPlugin, 'removeWatcher'>>(watcher.plugin);
    await plugin.removeWatcher({ id: watcher.id });
  } catch {
    // Process teardown will reclaim the service
  }
}
