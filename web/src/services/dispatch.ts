import type { Task, LatLng } from '../types/api';
import { WS_PROTOCOL, getWsBaseUrl, normaliseWsMessage } from './websocket';
import { getAuthPrivKey, normaliseTask } from './api';
import { createNip98Event } from './nostr';
import { publishAvailabilityBeacon } from './events';

const ONLINE_KEY = 'donkeyride.provider.online';
const RECONNECT_DELAY_MS = 4000;
const PRESENCE_INTERVAL_MS = 30_000;
const BEACON_INTERVAL_MS = 60_000;

export interface DispatchState {
  online: boolean;
  connected: boolean;
}

type TaskHandler = (task: Task, distanceKm?: number) => void;
type StatusHandler = (state: DispatchState) => void;

/**
 * Module-level dispatch connection for the provider app.
 *
 * Going online is a shift, not a page: the connection lives here (like
 * taskWs) so navigating to Earnings or Profile no longer silently drops
 * the driver off shift. The online flag is persisted in localStorage so
 * a reload resumes the shift, and visibilitychange/online events trigger
 * reconnect + re-register (important inside the Capacitor wrap).
 */
class DispatchService {
  private ws: WebSocket | null = null;
  private online = false;
  private connected = false;
  private identity: { pubKeyHex: string; npub: string } | null = null;
  private domainId: string | null = null;
  private location: LatLng | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private presenceTimer: ReturnType<typeof setInterval> | null = null;
  private beaconTimer: ReturnType<typeof setInterval> | null = null;
  private taskHandlers: Set<TaskHandler> = new Set();
  private statusHandlers: Set<StatusHandler> = new Set();
  private awaitingAuth = false;
  private authRetried = false;
  private authTimeout: ReturnType<typeof setTimeout> | null = null;
  private queue: Record<string, unknown>[] = [];
  private listenersBound = false;

  /** Was the provider online before the last reload? */
  wasOnline(): boolean {
    return localStorage.getItem(ONLINE_KEY) === '1';
  }

  isOnline(): boolean { return this.online; }
  isConnected(): boolean { return this.connected; }
  getState(): DispatchState { return { online: this.online, connected: this.connected }; }

  setIdentity(identity: { pubKeyHex: string; npub: string } | null): void {
    this.identity = identity;
  }

  setDomain(domainId: string | null): void {
    this.domainId = domainId;
  }

  /** Latest GPS fix (null when unavailable — presence is then withheld) */
  updateLocation(location: LatLng | null): void {
    this.location = location;
  }

  goOnline(): void {
    if (this.online) return;
    this.online = true;
    localStorage.setItem(ONLINE_KEY, '1');
    this.bindWindowListeners();
    this.connect();
    this.startBeacon();
    this.emitStatus();
  }

  goOffline(): void {
    this.online = false;
    localStorage.removeItem(ONLINE_KEY);
    this.stopTimers();
    this.closeSocket();
    this.connected = false;
    this.emitStatus();
  }

  /** Subscribe to incoming task broadcasts — returns unsubscribe */
  onTask(handler: TaskHandler): () => void {
    this.taskHandlers.add(handler);
    return () => { this.taskHandlers.delete(handler); };
  }

  /** Subscribe to online/connection state — returns unsubscribe */
  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => { this.statusHandlers.delete(handler); };
  }

  // ── Internals ─────────────────────────────────────

  private connect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.closeSocket();

    let ws: WebSocket;
    try {
      ws = new WebSocket(getWsBaseUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    this.awaitingAuth = false;
    this.authRetried = false;
    this.queue = [];

    ws.onopen = async () => {
      this.connected = true;
      this.emitStatus();

      // Auth handshake first (D6), then register for dispatch
      if (getAuthPrivKey()) {
        this.awaitingAuth = true;
        const sent = await this.sendAuth();
        if (!sent) {
          this.awaitingAuth = false;
        } else {
          // Servers without the auth contract never reply — flush anyway
          this.startAuthTimeout();
        }
      }
      this.queueOrSend(this.registerMessage());
      this.startPresence();
      void this.sendBeacon();
    };

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = normaliseWsMessage(JSON.parse(event.data));
      } catch {
        return;
      }
      if (!msg) return;

      if (msg.type === 'auth_ok') {
        this.clearAuthTimeout();
        this.awaitingAuth = false;
        this.authRetried = false;
        this.flushQueue();
        return;
      }

      if (msg.type === 'error') {
        if (msg.error === 'auth_required' && !this.authRetried) {
          this.authRetried = true;
          this.awaitingAuth = true;
          this.queue.push(this.registerMessage());
          void this.sendAuth().then((sent) => {
            if (!sent) this.awaitingAuth = false;
          });
        }
        return;
      }

      if (msg.type === 'task_broadcast') {
        const task = normaliseTask(msg.task);
        this.taskHandlers.forEach((handler) => handler(task, msg.distanceKm));
      }
    };

    ws.onclose = () => {
      this.connected = false;
      this.stopPresence();
      this.emitStatus();
      if (this.online) this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose follows
    };
  }

  private registerMessage(): Record<string, unknown> {
    return {
      type: WS_PROTOCOL.registerProvider,
      npub: this.identity?.npub || '',
      pubkey: this.identity?.pubKeyHex || '',
      // Never register a fallback position — omit location until GPS is real
      location: this.location ? { lat: this.location.lat, lon: this.location.lng } : undefined,
    };
  }

  private queueOrSend(data: Record<string, unknown>): void {
    if (this.awaitingAuth) {
      this.queue.push(data);
      return;
    }
    this.rawSend(data);
  }

  private rawSend(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private flushQueue(): void {
    const pending = this.queue;
    this.queue = [];
    pending.forEach((data) => this.rawSend(data));
  }

  private startAuthTimeout(): void {
    this.clearAuthTimeout();
    this.authTimeout = setTimeout(() => {
      if (this.awaitingAuth) {
        this.awaitingAuth = false;
        this.flushQueue();
      }
    }, 3000);
  }

  private clearAuthTimeout(): void {
    if (this.authTimeout) {
      clearTimeout(this.authTimeout);
      this.authTimeout = null;
    }
  }

  private async sendAuth(): Promise<boolean> {
    const key = getAuthPrivKey();
    if (!key) return false;
    try {
      const event = await createNip98Event(getWsBaseUrl(), 'GET', key);
      this.rawSend({ type: 'auth', event });
      return true;
    } catch {
      return false;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.online) this.connect();
    }, RECONNECT_DELAY_MS);
  }

  private startPresence(): void {
    this.stopPresence();
    const sendPresence = () => {
      if (!this.location) return;
      this.queueOrSend({
        type: 'driver_location',
        npub: this.identity?.npub || '',
        pubkey: this.identity?.pubKeyHex || '',
        location: { lat: this.location.lat, lon: this.location.lng },
      });
    };
    sendPresence();
    this.presenceTimer = setInterval(sendPresence, PRESENCE_INTERVAL_MS);
  }

  private stopPresence(): void {
    if (this.presenceTimer) {
      clearInterval(this.presenceTimer);
      this.presenceTimer = null;
    }
  }

  /**
   * TROTT-02 availability beacon — signed kind 20500 published direct to
   * public relays only, immediately on going online and every 60 seconds.
   */
  private startBeacon(): void {
    this.stopBeacon();
    void this.sendBeacon();
    this.beaconTimer = setInterval(() => void this.sendBeacon(), BEACON_INTERVAL_MS);
  }

  private stopBeacon(): void {
    if (this.beaconTimer) {
      clearInterval(this.beaconTimer);
      this.beaconTimer = null;
    }
  }

  private async sendBeacon(): Promise<void> {
    const key = getAuthPrivKey();
    if (!this.online || !key || !this.location || !this.domainId) return;
    await publishAvailabilityBeacon(this.location, this.domainId, key);
  }

  private stopTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearAuthTimeout();
    this.stopPresence();
    this.stopBeacon();
  }

  private closeSocket(): void {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private bindWindowListeners(): void {
    if (this.listenersBound) return;
    this.listenersBound = true;

    const reviveConnection = () => {
      if (!this.online) return;
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.connect();
      } else {
        // Socket looks open — re-register in case the server lost us
        this.queueOrSend(this.registerMessage());
      }
    };

    window.addEventListener('online', reviveConnection);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reviveConnection();
    });
  }

  private emitStatus(): void {
    const state = this.getState();
    this.statusHandlers.forEach((handler) => handler(state));
  }
}

/** Singleton dispatch connection for the provider app */
export const dispatchService = new DispatchService();
