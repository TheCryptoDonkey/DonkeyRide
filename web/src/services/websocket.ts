import type { WsMessage } from '../types/api';

type MessageHandler = (msg: WsMessage) => void;
type StatusHandler = (connected: boolean) => void;

const WS_PORT = 3001;

export class TaskWebSocket {
  private ws: WebSocket | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private statusHandlers: Set<StatusHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private taskId: string | null = null;
  private shouldReconnect = true;

  /** Connect to the real-time WebSocket for a specific task */
  connect(taskId: string): void {
    this.disconnect();
    this.taskId = taskId;
    this.shouldReconnect = true;

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${window.location.hostname}:${WS_PORT}/realtime/${taskId}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.notifyStatus(true);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsMessage;
        this.messageHandlers.forEach(handler => handler(msg));
      } catch {
        // Ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.notifyStatus(false);
      if (this.shouldReconnect && this.taskId) {
        this.reconnectTimer = setTimeout(() => {
          if (this.taskId) this.connect(this.taskId);
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
  }

  /** Send a message over the WebSocket */
  send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
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

  private notifyStatus(connected: boolean): void {
    this.statusHandlers.forEach(handler => handler(connected));
  }
}

/** Singleton WebSocket instance */
export const taskWs = new TaskWebSocket();
