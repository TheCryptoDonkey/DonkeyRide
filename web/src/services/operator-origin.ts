/** Runtime operator selection shared by the rider and driver apps. */

import { setCoordinationMode } from './network-mode';

const STORAGE_KEY = 'donkeyride.operator.origin';
export const OPERATOR_CHANGED_EVENT = 'donkeyride:operator-changed';

/** Accept HTTPS operators; permit HTTP only on loopback for development. */
export function safeOperatorOrigin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const loopback = url.hostname === 'localhost'
      || url.hostname === '127.0.0.1'
      || url.hostname === '[::1]';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/** The bundled URL is a bootstrap, not a permanent operator lock-in. */
export function getBootstrapOperatorBase(): string {
  const configured = safeOperatorOrigin(String(import.meta.env.VITE_API_BASE || ''));
  if (configured) return configured;
  return window.location.origin;
}

export function getSelectedOperatorBase(): string {
  try {
    return safeOperatorOrigin(localStorage.getItem(STORAGE_KEY))
      || getBootstrapOperatorBase();
  } catch {
    return getBootstrapOperatorBase();
  }
}

export function setSelectedOperatorBase(raw: string): string {
  const origin = safeOperatorOrigin(raw);
  if (!origin) {
    throw new Error('Operator must use HTTPS (HTTP is allowed only on this device for development).');
  }
  setCoordinationMode('managed');
  localStorage.setItem(STORAGE_KEY, origin);
  window.dispatchEvent(new CustomEvent(OPERATOR_CHANGED_EVENT, { detail: { origin } }));
  return origin;
}

export function resetSelectedOperatorBase(): string {
  localStorage.removeItem(STORAGE_KEY);
  setCoordinationMode('direct');
  const origin = getBootstrapOperatorBase();
  window.dispatchEvent(new CustomEvent(OPERATOR_CHANGED_EVENT, { detail: { origin } }));
  return origin;
}
