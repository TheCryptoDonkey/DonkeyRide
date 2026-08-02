import type { Task, LatLng } from '../types/api';
import { WS_PROTOCOL, getWsBaseUrl, normaliseWsMessage } from './websocket';
import { getAuthPrivKey, getOpenTasks, normaliseTask } from './api';
import { createNip98Event } from './nostr';
import { publishAvailabilityBeacon } from './events';
import { enableJobPush, disableJobPush } from './push';
import { subscribeFederatedTasks } from './federation';
import { startShiftTracking, stopShiftTracking } from './native-location';
import { loadWorkingAreas, combinedCells } from '../utils/working-areas';
import { loadDestinationMode, jobMovesToward } from '../utils/destination-mode';
import type { DestinationMode } from '../utils/destination-mode';

const ONLINE_KEY = 'donkeyride.provider.online';
const RECONNECT_DELAY_MS = 4000;
const PRESENCE_INTERVAL_MS = 30_000;
const BEACON_INTERVAL_MS = 60_000;
const OPEN_POLL_INTERVAL_MS = 30_000;

export interface DispatchState {
  online: boolean;
  connected: boolean;
}

type TaskHandler = (task: Task, distanceKm?: number) => void;
type StatusHandler = (state: DispatchState) => void;
type AvailableHandler = (tasks: Task[]) => void;

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
  private availableHandlers: Set<AvailableHandler> = new Set();
  /** Every open job the driver could take, keyed by task id */
  private availableTasks: Map<string, { task: Task; receivedAt: number }> = new Map();
  private openPollTimer: ReturnType<typeof setInterval> | null = null;
  /** Working-area geohash cells sent with registration ([] = radius dispatch) */
  private areas: string[] = combinedCells(loadWorkingAreas());
  /**
   * Destination mode: when set, only jobs that move the driver toward it
   * are shown. Client-side only — the destination never leaves the device.
   * Jobs are still STORED unfiltered, so switching it off (or changing
   * destination) instantly restores everything already received.
   */
  private destination: DestinationMode | null = loadDestinationMode();
  /** Relay subscription for jobs coordinated by OTHER operators */
  private federation: { close: () => void } | null = null;
  /** Native background-location watcher (Capacitor wrap only) */
  private shiftWatcher: { id: string } | null = null;
  /** Foreign jobs expire with their announcement (15 min) */
  private static readonly FOREIGN_TTL_MS = 15 * 60 * 1000;
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

  /**
   * Set the driver's working-area geohash cells. An empty array reverts to
   * radius dispatch. Re-registers immediately so the operator applies the
   * new areas and replays any open jobs inside them.
   */
  setAreas(cells: string[]): void {
    this.areas = cells;
    if (this.connected) {
      this.queueOrSend(this.registerMessage());
      void this.refreshOpenTasks();
    }
    // Push targeting must track the new areas too
    if (this.online && this.identity) {
      void enableJobPush(this.identity.pubKeyHex, this.areas, this.location);
    }
  }

  getAreas(): string[] {
    return this.areas;
  }

  /** Every open job the driver could take, oldest first */
  getAvailableTasks(): Task[] {
    return Array.from(this.availableTasks.values())
      .sort((a, b) => a.receivedAt - b.receivedAt)
      .map((entry) => entry.task)
      .filter((task) => this.matchesDestination(task));
  }

  private matchesDestination(task: Task): boolean {
    return !this.destination || jobMovesToward(task, this.destination);
  }

  /** Set (or clear) destination mode; the visible list updates at once */
  setDestinationMode(destination: DestinationMode | null): void {
    this.destination = destination;
    this.emitAvailable();
  }

  getDestinationMode(): DestinationMode | null {
    return this.destination;
  }

  /** Subscribe to the available-jobs list — returns unsubscribe */
  onAvailable(handler: AvailableHandler): () => void {
    this.availableHandlers.add(handler);
    handler(this.getAvailableTasks());
    return () => { this.availableHandlers.delete(handler); };
  }

  /** Drop a job from the list (accepted, taken by someone else, declined) */
  removeAvailable(taskId: string): void {
    if (this.availableTasks.delete(taskId)) {
      this.emitAvailable();
    }
  }

  /**
   * Reconcile the list against GET /api/tasks/open: jobs accepted or
   * cancelled elsewhere disappear; jobs broadcast before we connected
   * (or outside a dropped frame) appear.
   */
  async refreshOpenTasks(): Promise<void> {
    if (!this.online) return;
    let open: Task[];
    try {
      open = await getOpenTasks(
        this.areas.length > 0
          ? { areas: this.areas }
          : { location: this.location ?? undefined },
      );
    } catch {
      return; // transient — the next poll reconciles
    }
    const next = new Map<string, { task: Task; receivedAt: number }>();
    for (const task of open) {
      const existing = this.availableTasks.get(task.id);
      next.set(task.id, { task, receivedAt: existing?.receivedAt ?? Date.now() });
    }
    // Foreign (federated) jobs are not in OUR operator's open list — keep
    // them until their announcement TTL runs out
    for (const [id, entry] of this.availableTasks) {
      if (entry.task.operatorBase && !next.has(id)
          && Date.now() - entry.receivedAt < DispatchService.FOREIGN_TTL_MS) {
        next.set(id, entry);
      }
    }
    this.availableTasks = next;
    this.emitAvailable();
  }

  goOnline(): void {
    if (this.online) return;
    this.online = true;
    localStorage.setItem(ONLINE_KEY, '1');
    this.bindWindowListeners();
    this.connect();
    this.startBeacon();
    this.startFederation();
    // Native wrap: a foreground-service location watcher keeps fixes AND
    // the dispatch socket alive with the screen off (no-op on web)
    void startShiftTracking((location) => {
      this.location = location;
      this.queueOrSend({
        type: 'driver_location',
        npub: this.identity?.npub || '',
        pubkey: this.identity?.pubKeyHex || '',
        location: { lat: location.lat, lon: location.lng },
      });
    }).then((watcher) => {
      if (this.online) this.shiftWatcher = watcher;
      else void stopShiftTracking(watcher);
    });
    this.emitStatus();
    // Job alerts while backgrounded — called here so the permission
    // prompt rides the Go online tap (a user gesture)
    if (this.identity) {
      void enableJobPush(this.identity.pubKeyHex, this.areas, this.location);
    }
  }

  goOffline(): void {
    this.online = false;
    localStorage.removeItem(ONLINE_KEY);
    this.stopTimers();
    this.stopFederation();
    void stopShiftTracking(this.shiftWatcher);
    this.shiftWatcher = null;
    this.closeSocket();
    this.connected = false;
    this.availableTasks.clear();
    this.emitAvailable();
    this.emitStatus();
    if (this.identity) {
      void disableJobPush(this.identity.pubKeyHex);
    }
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
      this.startOpenPoll();
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
        const withDistance = msg.distanceKm != null && task.distanceKm == null
          ? { ...task, distanceKm: msg.distanceKm }
          : task;
        // Every broadcast lands in the available list — nothing is dropped
        // just because another job is already on screen
        this.availableTasks.set(withDistance.id, {
          task: withDistance,
          receivedAt: this.availableTasks.get(withDistance.id)?.receivedAt ?? Date.now(),
        });
        this.emitAvailable();
        // Destination mode: a job heading the wrong way stays out of the
        // incoming full-screen too (it is stored, in case the mode clears)
        if (this.matchesDestination(withDistance)) {
          this.taskHandlers.forEach((handler) => handler(task, msg.distanceKm));
        }
      }
    };

    ws.onclose = () => {
      this.connected = false;
      this.stopPresence();
      this.stopOpenPoll();
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
      // Working-area cells; [] deliberately clears any stored areas
      areas: this.areas,
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

  /**
   * Federated discovery: subscribe to kind 37500 task announcements on the
   * public relays — jobs coordinated by OTHER operators land in the same
   * available list, badged with their operator. The relays, not any single
   * operator, are the marketplace.
   */
  private startFederation(): void {
    this.stopFederation();
    void subscribeFederatedTasks(
      () => ({ domainId: this.domainId, areas: this.areas, location: this.location }),
      (task) => {
        if (!this.online || this.availableTasks.has(task.id)) return;
        this.availableTasks.set(task.id, { task, receivedAt: Date.now() });
        this.emitAvailable();
      },
    ).then((sub) => {
      if (this.online) this.federation = sub;
      else sub.close();
    });
  }

  private stopFederation(): void {
    this.federation?.close();
    this.federation = null;
  }

  /** Poll the open-jobs endpoint so the list self-heals against missed frames */
  private startOpenPoll(): void {
    this.stopOpenPoll();
    void this.refreshOpenTasks();
    this.openPollTimer = setInterval(() => void this.refreshOpenTasks(), OPEN_POLL_INTERVAL_MS);
  }

  private stopOpenPoll(): void {
    if (this.openPollTimer) {
      clearInterval(this.openPollTimer);
      this.openPollTimer = null;
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
    this.stopOpenPoll();
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

  private emitAvailable(): void {
    const tasks = this.getAvailableTasks();
    this.availableHandlers.forEach((handler) => handler(tasks));
  }
}

/** Singleton dispatch connection for the provider app */
export const dispatchService = new DispatchService();
