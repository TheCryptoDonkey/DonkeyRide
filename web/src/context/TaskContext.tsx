import {
  createContext, useContext, useState, useCallback, useEffect,
  type ReactNode,
} from 'react';
import type { Task, TripEstimate, LatLng } from '../types/api';
import { getTask } from '../services/api';

const STORAGE_KEYS = {
  activeTask: 'donkeyride.activeTask',
  origin: 'donkeyride.origin',
  destination: 'donkeyride.destination',
} as const;

function loadJson<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveJson(key: string, value: unknown) {
  if (value == null) {
    sessionStorage.removeItem(key);
  } else {
    sessionStorage.setItem(key, JSON.stringify(value));
  }
}

interface TaskState {
  /** Currently active task */
  activeTask: Task | null;
  setActiveTask: (task: Task | null) => void;

  /** Current trip estimate (before requesting) */
  estimate: TripEstimate | null;
  setEstimate: (est: TripEstimate | null) => void;

  /** Selected origin location */
  origin: LatLng | null;
  setOrigin: (loc: LatLng | null) => void;

  /** Selected destination location */
  destination: LatLng | null;
  setDestination: (loc: LatLng | null) => void;

  /** Provider's current location (from WebSocket) */
  providerLocation: LatLng | null;
  setProviderLocation: (loc: LatLng | null) => void;

  /** Clear all task state */
  reset: () => void;
}

const TaskContext = createContext<TaskState>({
  activeTask: null,
  setActiveTask: () => {},
  estimate: null,
  setEstimate: () => {},
  origin: null,
  setOrigin: () => {},
  destination: null,
  setDestination: () => {},
  providerLocation: null,
  setProviderLocation: () => {},
  reset: () => {},
});

export function TaskProvider({ children }: { children: ReactNode }) {
  const [activeTask, setActiveTaskState] = useState<Task | null>(() => loadJson(STORAGE_KEYS.activeTask));
  const [estimate, setEstimate] = useState<TripEstimate | null>(null);
  const [origin, setOriginState] = useState<LatLng | null>(() => loadJson(STORAGE_KEYS.origin));
  const [destination, setDestinationState] = useState<LatLng | null>(() => loadJson(STORAGE_KEYS.destination));
  const [providerLocation, setProviderLocation] = useState<LatLng | null>(null);

  const setActiveTask = useCallback((task: Task | null) => {
    setActiveTaskState(task);
    saveJson(STORAGE_KEYS.activeTask, task);
  }, []);

  const setOrigin = useCallback((loc: LatLng | null) => {
    setOriginState(loc);
    saveJson(STORAGE_KEYS.origin, loc);
  }, []);

  const setDestination = useCallback((loc: LatLng | null) => {
    setDestinationState(loc);
    saveJson(STORAGE_KEYS.destination, loc);
  }, []);

  const reset = useCallback(() => {
    setActiveTaskState(null);
    setEstimate(null);
    setOriginState(null);
    setDestinationState(null);
    setProviderLocation(null);
    sessionStorage.removeItem(STORAGE_KEYS.activeTask);
    sessionStorage.removeItem(STORAGE_KEYS.origin);
    sessionStorage.removeItem(STORAGE_KEYS.destination);
  }, []);

  // On mount, re-fetch stored task to get fresh state
  useEffect(() => {
    const stored = loadJson<Task>(STORAGE_KEYS.activeTask);
    if (!stored?.id) return;

    getTask(stored.id)
      .then((fresh) => {
        // Clear if task has reached a terminal state
        // We check common terminal states — the profile isn't available here
        // so we use a heuristic: if the status contains 'cancelled', 'completed',
        // 'delivered', or 'access_gained', treat it as terminal
        const terminalPatterns = ['cancelled', 'completed', 'delivered', 'access_gained'];
        const isTerminal = terminalPatterns.some(p => fresh.status.includes(p));
        if (isTerminal) {
          reset();
        } else {
          setActiveTask(fresh);
        }
      })
      .catch(() => {
        // Task not found — clear
        reset();
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <TaskContext.Provider
      value={{
        activeTask, setActiveTask,
        estimate, setEstimate,
        origin, setOrigin,
        destination, setDestination,
        providerLocation, setProviderLocation,
        reset,
      }}
    >
      {children}
    </TaskContext.Provider>
  );
}

export function useTask(): TaskState {
  return useContext(TaskContext);
}
