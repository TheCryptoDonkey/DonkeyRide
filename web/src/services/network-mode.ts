export type CoordinationMode = 'direct' | 'managed';

const MODE_KEY = 'donkeyride.coordination.mode';
const ROUTING_KEY = 'donkeyride.routing.url';
const RELAYS_KEY = 'donkeyride.relays.urls';
export const COORDINATION_MODE_CHANGED_EVENT = 'donkeyride:coordination-mode-changed';

/**
 * The downloadable app/PWA is the product. It joins the open Nostr network
 * directly unless this person explicitly selects a managed operator (or a
 * branded operator build opts in at build time).
 */
export function getCoordinationMode(): CoordinationMode {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === 'direct' || saved === 'managed') return saved;
  } catch {
    // Storage-disabled browsers still get the privacy-minimised default.
  }
  return String(import.meta.env.VITE_COORDINATION_MODE || '').toLowerCase() === 'managed'
    ? 'managed'
    : 'direct';
}

export function isDirectMode(operatorBase?: string | null): boolean {
  // A task carrying an operator origin deliberately remains managed even if
  // the app's global selection later changes.
  return !operatorBase && getCoordinationMode() === 'direct';
}

export function setCoordinationMode(mode: CoordinationMode): void {
  localStorage.setItem(MODE_KEY, mode);
  window.dispatchEvent(new CustomEvent(COORDINATION_MODE_CHANGED_EVENT, {
    detail: { mode },
  }));
}

export function getDirectRoutingUrl(): string {
  try {
    const saved = localStorage.getItem(ROUTING_KEY);
    if (saved && validRoutingUrl(saved)) return saved;
  } catch {
    // Fall through to the build/default endpoint.
  }
  return String(import.meta.env.VITE_PUBLIC_ROUTING_URL || '/routing').trim();
}

export function getDirectRelayUrls(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(RELAYS_KEY) || 'null');
    if (Array.isArray(saved)) {
      const relays = saved.filter((relay): relay is string =>
        typeof relay === 'string' && /^wss:\/\/[^\s]+$/i.test(relay));
      if (relays.length > 0) return Array.from(new Set(relays));
    }
  } catch {
    // Fall through to the build/default relay set.
  }
  const configured = String(import.meta.env.VITE_NOSTR_RELAYS || '')
    .split(',')
    .map((relay) => relay.trim())
    .filter((relay) => /^wss:\/\//i.test(relay));
  return configured.length > 0
    ? configured
    : ['wss://relay.damus.io', 'wss://nos.lol'];
}

function validRoutingUrl(value: string): boolean {
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try {
    const url = new URL(value);
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
      || url.hostname === '[::1]';
    return url.protocol === 'https:' || (url.protocol === 'http:' && loopback);
  } catch {
    return false;
  }
}

export function setDirectRelayUrls(relays: string[]): void {
  const clean = Array.from(new Set(relays.map((relay) => relay.trim()).filter(Boolean)));
  if (clean.length === 0 || clean.some((relay) => !/^wss:\/\/[^\s]+$/i.test(relay))) {
    throw new Error('Enter at least one secure wss:// relay URL');
  }
  localStorage.setItem(RELAYS_KEY, JSON.stringify(clean));
}

export function setDirectRoutingUrl(value: string): void {
  const clean = value.trim().replace(/\/$/, '');
  if (!validRoutingUrl(clean)) {
    throw new Error('Router must use HTTPS (HTTP is allowed only on this device for development)');
  }
  localStorage.setItem(ROUTING_KEY, clean);
}

export function resetDirectNetworkServices(): void {
  localStorage.removeItem(RELAYS_KEY);
  localStorage.removeItem(ROUTING_KEY);
}
