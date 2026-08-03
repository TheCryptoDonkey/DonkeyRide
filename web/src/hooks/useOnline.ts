import { useSyncExternalStore } from 'react';

/**
 * Whether this device currently has a network at all.
 *
 * The apps had no notion of it: on a stairwell or a rural road every call
 * failed with a raw fetch error and the screen simply looked broken. This
 * is the browser's own signal — cheap, synchronous, and honest about what
 * it does NOT know (an online phone on a captive-portal wifi still says
 * online), so callers use it to explain a failure, never to prevent a
 * request from being tried.
 */

function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function snapshot(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}
