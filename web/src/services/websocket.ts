import type { WsMessage, LatLng } from '../types/api';
import { getAuthPrivKey } from './api';
import { createNip98Event } from './nostr';

type MessageHandler = (msg: WsMessage) => void;
type StatusHandler = (connected: boolean) => void;

const WS_PORT = 3001;

/**
 * Protocol mapping — isolates server message strings to one place.
 * The server currently uses ride-centric names; this mapping lets the
 * frontend use semantic, domain-agnostic names everywhere else.
 */
export const WS_PROTOCOL = {
  subscribeToTask: 'subscribe_ride',    // client → server
  registerProvider: 'register_driver',  // client → server
  taskBroadcast: 'ride_request',        // server → client
} as const;

/**
 * WebSocket URL for ANOTHER operator's origin (federation phase 2).
 *
 * Their reverse proxy convention is assumed to match ours — TLS origins
 * expose the socket at /ws — because that is what the reference deployment
 * documents and what an operator running this codebase will have. A
 * foreign operator that proxies elsewhere simply fails to connect, and the
 * job falls back to REST polling rather than showing stale state.
 */
export function wsUrlForOrigin(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.protocol === 'https:') return `wss://${url.host}/ws`;
    if (url.protocol === 'http:') return `ws://${url.hostname}:${WS_PORT}`;
    return null;
  } catch {
    return null;
  }
}

export function getWsBaseUrl(): string {
  // Native (Capacitor) builds bake in the operator's WebSocket URL
  const envUrl = import.meta.env.VITE_WS_URL;
  if (envUrl) {
    return envUrl;
  }
  // Behind TLS the WebSocket is reverse-proxied on the same origin at /ws;
  // local dev connects straight to the WS port.
  if (window.location.protocol === 'https:') {
    return `wss://${window.location.host}/ws`;
  }
  return `ws://${window.location.hostname}:${WS_PORT}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normWsLocation(src: any): LatLng | null {
  if (!src || typeof src.lat !== 'number') return null;
  const lng = src.lng ?? src.lon;
  if (typeof lng !== 'number') return null;
  return { lat: src.lat, lng };
}

/**
 * Map a raw server frame to the normalised WsMessage union.
 * The server sends ride-centric names with fields at the TOP level
 * (e.g. {type:'status_change', ride_id, status, previousStatus}).
 * Returns null for frames the frontend does not understand.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normaliseWsMessage(raw: any): WsMessage | null {
  if (!raw || typeof raw.type !== 'string') return null;

  const taskId: string | undefined =
    raw.ride_id ?? raw.rideId ?? raw.task_id ?? raw.taskId ?? raw.id;

  switch (raw.type) {
    case 'status_change':
      return {
        type: 'status_change',
        taskId: taskId || '',
        status: raw.status ?? raw.data?.status ?? '',
        previousStatus: raw.previousStatus ?? raw.previous_status,
      };

    case 'ride_matched':
    case 'task_matched':
      return {
        type: 'task_matched',
        taskId,
        providerPubkey: raw.driver_pubkey ?? raw.driverPubkey ?? raw.provider_pubkey,
        providerLocation: normWsLocation(raw.driver_location ?? raw.driverLocation),
      };

    case 'driver_arrived':
      return { type: 'provider_arrived', taskId };

    case 'trip_started':
      return { type: 'task_started', taskId };

    case 'ride_completed':
    case 'trip_completed':
      return { type: 'task_completed', taskId };

    case 'location_update': {
      const location = normWsLocation(raw.location ?? raw.data ?? raw);
      if (!location) return null;
      const src = raw.location ?? raw.data ?? raw;
      const eta = src.eta_seconds ?? src.etaSeconds ?? raw.eta_seconds;
      return {
        type: 'location_update',
        taskId,
        location,
        heading: src.heading,
        speed: src.speed,
        etaSeconds: typeof eta === 'number' ? eta : null,
      };
    }

    case 'pickup_updated': {
      const pickup = normWsLocation(raw.pickup);
      if (!pickup) return null;
      return {
        type: 'pickup_updated',
        taskId,
        pickup,
        address: typeof raw.address === 'string' ? raw.address : undefined,
        movedMetres: typeof raw.moved_m === 'number' ? raw.moved_m : undefined,
      };
    }

    case 'panic_alert':
      return {
        type: 'panic_alert',
        taskId,
        triggeredBy: raw.triggeredBy ?? raw.triggered_by,
        location: normWsLocation(raw.location),
      };

    case 'rating_submitted':
      return { type: 'rating_submitted', taskId, rating: raw.rating };

    case 'tip_sent':
      return {
        type: 'tip_sent',
        taskId,
        amountSats: raw.amount_sats ?? raw.amountSats ?? raw.amount,
      };

    case 'ride_cancelled':
    case 'task_cancelled':
      return {
        type: 'task_cancelled',
        taskId,
        cancelledBy: raw.cancelledBy ?? raw.cancelled_by,
        reason: raw.reason,
        lateCancellation: raw.late_cancellation === true,
      };

    case 'settlement_declared':
      return {
        type: 'settlement_declared',
        taskId,
        rail: raw.rail,
        verified: raw.verified === true || raw.verified === 'true',
      };

    case 'settlement_confirmed':
      return { type: 'settlement_confirmed', taskId, rail: raw.rail };

    case WS_PROTOCOL.taskBroadcast:
    case 'task_request':
      return {
        type: 'task_broadcast',
        task: raw.ride ?? raw.task ?? raw,
        distanceKm: typeof raw.distance === 'number' ? raw.distance : undefined,
      };

    case 'scheduled_reminder':
      return {
        type: 'scheduled_reminder',
        taskId,
        scheduledFor: typeof raw.scheduled_for === 'number' ? raw.scheduled_for : 0,
      };

    case 'searching':
      return {
        type: 'searching',
        taskId,
        attempt: typeof raw.attempt === 'number' ? raw.attempt : 1,
        radiusKm: typeof raw.radius_km === 'number' ? raw.radius_km : 0,
        providersNotified: typeof raw.providers_notified === 'number'
          ? raw.providers_notified : 0,
        expiresInMs: typeof raw.expires_in_ms === 'number' ? raw.expires_in_ms : 0,
      };

    case 'auth_ok':
      return { type: 'auth_ok', pubkey: raw.pubkey || '' };

    case 'error':
      return { type: 'error', error: raw.error || 'unknown' };

    default:
      return null;
  }
}

export class TaskWebSocket {
  private ws: WebSocket | null = null;
  private wsUrl: string | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private statusHandlers: Set<StatusHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private taskId: string | null = null;
  /** Operator origin when the task belongs to someone else; null = ours */
  private operatorBase: string | null = null;
  private shouldReconnect = true;
  private awaitingAuth = false;
  private authRetried = false;
  private authTimeout: ReturnType<typeof setTimeout> | null = null;
  private queue: Record<string, unknown>[] = [];

  /**
   * Connect to the real-time WebSocket for a specific task.
   *
   * `operatorBase` points the socket at the operator that actually holds
   * the job — a job found over Nostr is coordinated by whoever announced
   * it, and its updates only exist there.
   */
  connect(taskId: string, operatorBase?: string | null): void {
    this.disconnect();
    this.taskId = taskId;
    this.operatorBase = operatorBase || null;
    this.shouldReconnect = true;
    this.awaitingAuth = false;
    this.authRetried = false;
    this.queue = [];

    this.wsUrl = (this.operatorBase && wsUrlForOrigin(this.operatorBase)) || getWsBaseUrl();
    this.ws = new WebSocket(this.wsUrl);

    this.ws.onopen = async () => {
      // Auth handshake first (D6): if we have an identity, sign a NIP-98
      // event for the WS URL and hold protocol messages until auth_ok.
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
      // Subscribe to updates for this specific task/ride
      this.send({ type: WS_PROTOCOL.subscribeToTask, rideId: taskId });
      this.notifyStatus(true);
    };

    this.ws.onmessage = (event) => {
      let msg: WsMessage | null = null;
      try {
        msg = normaliseWsMessage(JSON.parse(event.data));
      } catch {
        return; // Ignore malformed messages
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
          // Server requires auth — send it, then retry the subscription once
          this.authRetried = true;
          this.awaitingAuth = true;
          if (this.taskId) {
            this.queue.push({ type: WS_PROTOCOL.subscribeToTask, rideId: this.taskId });
          }
          void this.sendAuth().then((sent) => {
            if (!sent) this.awaitingAuth = false;
          });
          return;
        }
        if (msg.error === 'auth_failed') {
          this.clearAuthTimeout();
          this.awaitingAuth = false;
        }
      }

      this.messageHandlers.forEach(handler => handler(msg!));
    };

    this.ws.onclose = () => {
      this.notifyStatus(false);
      if (this.shouldReconnect && this.taskId) {
        this.reconnectTimer = setTimeout(() => {
          if (this.taskId) this.connect(this.taskId, this.operatorBase);
        }, 3000);
      }
    };

    this.ws.onerror = () => {
      // Will trigger onclose
    };
  }

  /** Disconnect and stop reconnecting */
  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.taskId = null;
    this.operatorBase = null;
    this.clearAuthTimeout();
    this.awaitingAuth = false;
    this.queue = [];
  }

  /** Send a message over the WebSocket (queued while awaiting auth) */
  send(data: Record<string, unknown>): void {
    if (this.awaitingAuth) {
      this.queue.push(data);
      return;
    }
    this.rawSend(data);
  }

  /** Subscribe to incoming messages */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /** Subscribe to connection status changes */
  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  private rawSend(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private async sendAuth(): Promise<boolean> {
    const key = getAuthPrivKey();
    if (!key || !this.wsUrl) return false;
    try {
      const event = await createNip98Event(this.wsUrl, 'GET', key);
      this.rawSend({ type: 'auth', event });
      return true;
    } catch {
      return false;
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

  private notifyStatus(connected: boolean): void {
    this.statusHandlers.forEach(handler => handler(connected));
  }
}

/** Singleton WebSocket instance */
export const taskWs = new TaskWebSocket();
