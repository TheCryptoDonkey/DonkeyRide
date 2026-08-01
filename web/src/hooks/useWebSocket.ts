import { useEffect, useRef, useCallback, useState } from 'react';
import { taskWs } from '../services/websocket';
import { showToast, dismissToast } from '../components/common/Toast';
import type { WsMessage } from '../types/api';

/**
 * Hook to manage WebSocket connection for a task.
 * Connects when taskId is provided, disconnects on unmount.
 * Surfaces a "Reconnecting..." banner when a disconnect lasts over 5s.
 */
export function useWebSocket(
  taskId: string | null,
  onMessage?: (msg: WsMessage) => void,
) {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!taskId) return;

    taskWs.connect(taskId);

    const unsubMsg = taskWs.onMessage((msg) => {
      handlerRef.current?.(msg);
    });

    const clearReconnectNotice = () => {
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
      if (toastIdRef.current != null) {
        dismissToast(toastIdRef.current);
        toastIdRef.current = null;
      }
    };

    const unsubStatus = taskWs.onStatus((status) => {
      setConnected(status);
      if (status) {
        clearReconnectNotice();
      } else if (!disconnectTimerRef.current) {
        disconnectTimerRef.current = setTimeout(() => {
          toastIdRef.current = showToast('Reconnecting...', { sticky: true });
        }, 5000);
      }
    });

    return () => {
      unsubMsg();
      unsubStatus();
      clearReconnectNotice();
      taskWs.disconnect();
    };
  }, [taskId]);

  const send = useCallback((data: Record<string, unknown>) => {
    taskWs.send(data);
  }, []);

  return { connected, send };
}
