import { useEffect, useRef, useCallback, useState } from 'react';
import { taskWs } from '../services/websocket';
import type { WsMessage } from '../types/api';

/**
 * Hook to manage WebSocket connection for a task.
 * Connects when taskId is provided, disconnects on unmount.
 */
export function useWebSocket(
  taskId: string | null,
  onMessage?: (msg: WsMessage) => void,
) {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    if (!taskId) return;

    taskWs.connect(taskId);

    const unsubMsg = taskWs.onMessage((msg) => {
      handlerRef.current?.(msg);
    });

    const unsubStatus = taskWs.onStatus((status) => {
      setConnected(status);
    });

    return () => {
      unsubMsg();
      unsubStatus();
      taskWs.disconnect();
    };
  }, [taskId]);

  const send = useCallback((data: Record<string, unknown>) => {
    taskWs.send(data);
  }, []);

  return { connected, send };
}
