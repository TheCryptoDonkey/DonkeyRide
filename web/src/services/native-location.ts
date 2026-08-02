import type { LatLng } from '../types/api';

/**
 * Native (Capacitor) on-shift location. The community background-
 * geolocation watcher runs an Android FOREGROUND SERVICE with a
 * persistent notification, which does two jobs at once:
 *   - GPS fixes keep flowing with the screen off or the app backgrounded
 *   - the process (and so the WebView + dispatch WebSocket) stays alive,
 *     so jobs keep arriving mid-shift without any push round trip
 *
 * No-ops cleanly on the web: every entry point checks the platform first,
 * and the plugin is resolved lazily so the web bundle never loads it.
 */

type Watcher = { id: string };

export async function isNativePlatform(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Start the on-shift watcher. Returns a handle to stop it, or null on
 * web / permission refusal. Fixes arrive via `onFix` (already {lat,lng}).
 */
export async function startShiftTracking(
  onFix: (location: LatLng) => void,
): Promise<Watcher | null> {
  if (!(await isNativePlatform())) return null;
  try {
    const { registerPlugin } = await import('@capacitor/core');
    const BackgroundGeolocation = registerPlugin<{
      addWatcher(
        options: Record<string, unknown>,
        callback: (position?: { latitude: number; longitude: number }, error?: { code?: string }) => void,
      ): Promise<string>;
      removeWatcher(options: { id: string }): Promise<void>;
      openSettings(): Promise<void>;
    }>('BackgroundGeolocation');

    const id = await BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: 'On shift',
        backgroundMessage: 'Receiving job requests',
        requestPermissions: true,
        // Fresh fixes only — a stale cached position must never register
        stale: false,
        distanceFilter: 25,
      },
      (position, error) => {
        if (error) {
          if (error.code === 'NOT_AUTHORIZED') {
            // The driver declined — the watcher is dead; web geolocation
            // (foreground-only) remains the fallback
            void BackgroundGeolocation.openSettings().catch(() => {});
          }
          return;
        }
        if (position) {
          onFix({ lat: position.latitude, lng: position.longitude });
        }
      },
    );
    return { id };
  } catch {
    return null;
  }
}

export async function stopShiftTracking(watcher: Watcher | null): Promise<void> {
  if (!watcher) return;
  try {
    const { registerPlugin } = await import('@capacitor/core');
    const BackgroundGeolocation = registerPlugin<{
      removeWatcher(options: { id: string }): Promise<void>;
    }>('BackgroundGeolocation');
    await BackgroundGeolocation.removeWatcher({ id: watcher.id });
  } catch {
    // Process teardown will reclaim the service
  }
}
