import {
  createContext, useContext, useState, useCallback, useEffect, useRef,
  type ReactNode,
} from 'react';
import type { Task, TripEstimate, LatLng } from '../types/api';
import { getTask, getActiveParticipantTask } from '../services/api';
import { safeOperatorOrigin } from '../services/federation';
import { useDomain } from './DomainContext';
import { useIdentity } from './IdentityContext';

const STORAGE_KEYS = {
  activeTask: 'donkeyride.activeTask',
  origin: 'donkeyride.origin',
  originAddress: 'donkeyride.originAddress',
  destination: 'donkeyride.destination',
  destinationAddress: 'donkeyride.destinationAddress',
} as const;

/** Active task id survives app/tab restarts — keyed per role */
const activeTaskIdKey = (role: string) => `donkeyride.activeTaskId.${role}`;
/**
 * Which operator coordinates the active task, when it is not ours.
 * Stored beside the id because a federated job exists ONLY at the
 * operator that announced it — without this, a restart asks our own
 * operator about a job it has never heard of and the driver loses it
 * mid-shift.
 */
const activeTaskOriginKey = (role: string) => `donkeyride.activeTaskOrigin.${role}`;
/** Last terminal task kept until the user taps Done — keyed per role */
const completedTaskKey = (role: string) => `donkeyride.completedTask.${role}`;

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

function loadLocalJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

interface TaskState {
  /** Currently active task */
  activeTask: Task | null;
  setActiveTask: (task: Task | null) => void;

  /** Last task that reached a terminal state (kept until acknowledged) */
  completedTask: Task | null;
  clearCompletedTask: () => void;

  /** Current trip estimate (before requesting) */
  estimate: TripEstimate | null;
  setEstimate: (est: TripEstimate | null) => void;

  /**
   * Selected origin location, and the human-readable address it was chosen
   * by. The address travels with the request so the provider navigates to a
   * street and the receipt reads back as a journey — without it both ends
   * fall back to raw decimals.
   */
  origin: LatLng | null;
  originAddress: string | null;
  setOrigin: (loc: LatLng | null, address?: string | null) => void;

  /** Selected destination location, and the address it was chosen by */
  destination: LatLng | null;
  destinationAddress: string | null;
  setDestination: (loc: LatLng | null, address?: string | null) => void;

  /** Provider's current location (from WebSocket) */
  providerLocation: LatLng | null;
  setProviderLocation: (loc: LatLng | null) => void;

  /** Clear all task state */
  reset: () => void;
}

const TaskContext = createContext<TaskState>({
  activeTask: null,
  setActiveTask: () => {},
  completedTask: null,
  clearCompletedTask: () => {},
  estimate: null,
  setEstimate: () => {},
  origin: null,
  originAddress: null,
  setOrigin: () => {},
  destination: null,
  destinationAddress: null,
  setDestination: () => {},
  providerLocation: null,
  setProviderLocation: () => {},
  reset: () => {},
});

export function TaskProvider({ children }: { children: ReactNode }) {
  const { profile } = useDomain();
  const { identity, role } = useIdentity();
  const [activeTask, setActiveTaskState] = useState<Task | null>(() => loadJson(STORAGE_KEYS.activeTask));
  const [completedTask, setCompletedTask] = useState<Task | null>(() => loadLocalJson(completedTaskKey(role)));
  const [estimate, setEstimate] = useState<TripEstimate | null>(null);
  const [origin, setOriginState] = useState<LatLng | null>(() => loadJson(STORAGE_KEYS.origin));
  const [destination, setDestinationState] = useState<LatLng | null>(() => loadJson(STORAGE_KEYS.destination));
  const [originAddress, setOriginAddressState] = useState<string | null>(() => loadJson(STORAGE_KEYS.originAddress));
  const [destinationAddress, setDestinationAddressState] = useState<string | null>(() => loadJson(STORAGE_KEYS.destinationAddress));
  const [providerLocation, setProviderLocation] = useState<LatLng | null>(null);

  const terminalStatesRef = useRef<string[]>([]);
  terminalStatesRef.current = profile?.states.terminal || [];
  const roleRef = useRef(role);
  roleRef.current = role;

  const setActiveTask = useCallback((task: Task | null) => {
    setActiveTaskState(task);
    saveJson(STORAGE_KEYS.activeTask, task);

    const currentRole = roleRef.current;
    if (task) {
      if (terminalStatesRef.current.includes(task.status)) {
        // Terminal — keep a copy until the user acknowledges it (Done)
        setCompletedTask(task);
        try {
          localStorage.setItem(completedTaskKey(currentRole), JSON.stringify(task));
        } catch { /* storage full — non-fatal */ }
        localStorage.removeItem(activeTaskIdKey(currentRole));
        localStorage.removeItem(activeTaskOriginKey(currentRole));
      } else {
        localStorage.setItem(activeTaskIdKey(currentRole), task.id);
        if (task.operatorBase) {
          localStorage.setItem(activeTaskOriginKey(currentRole), task.operatorBase);
        } else {
          localStorage.removeItem(activeTaskOriginKey(currentRole));
        }
      }
    } else {
      localStorage.removeItem(activeTaskIdKey(currentRole));
      localStorage.removeItem(activeTaskOriginKey(currentRole));
    }
  }, []);

  const clearCompletedTask = useCallback(() => {
    setCompletedTask(null);
    localStorage.removeItem(completedTaskKey(roleRef.current));
  }, []);

  // Addresses are stored beside the coordinates, not derived later: the
  // requester picked them by name, and a reverse-geocode of the same point
  // is a different (and worse) string than the one they chose.
  const setOrigin = useCallback((loc: LatLng | null, address?: string | null) => {
    setOriginState(loc);
    saveJson(STORAGE_KEYS.origin, loc);
    if (address !== undefined || loc === null) {
      const next = loc === null ? null : (address ?? null);
      setOriginAddressState(next);
      saveJson(STORAGE_KEYS.originAddress, next);
    }
  }, []);

  const setDestination = useCallback((loc: LatLng | null, address?: string | null) => {
    setDestinationState(loc);
    saveJson(STORAGE_KEYS.destination, loc);
    if (address !== undefined || loc === null) {
      const next = loc === null ? null : (address ?? null);
      setDestinationAddressState(next);
      saveJson(STORAGE_KEYS.destinationAddress, next);
    }
  }, []);

  const reset = useCallback(() => {
    setActiveTaskState(null);
    setEstimate(null);
    setOriginState(null);
    setDestinationState(null);
    setOriginAddressState(null);
    setDestinationAddressState(null);
    setProviderLocation(null);
    sessionStorage.removeItem(STORAGE_KEYS.activeTask);
    sessionStorage.removeItem(STORAGE_KEYS.origin);
    sessionStorage.removeItem(STORAGE_KEYS.destination);
    sessionStorage.removeItem(STORAGE_KEYS.originAddress);
    sessionStorage.removeItem(STORAGE_KEYS.destinationAddress);
    localStorage.removeItem(activeTaskIdKey(roleRef.current));
    localStorage.removeItem(activeTaskOriginKey(roleRef.current));
  }, []);

  // On boot, re-fetch the stored task; if the session is fresh (app/tab
  // restart) ask the operator for this participant's active task instead.
  useEffect(() => {
    if (!profile || !identity) return;
    const terminalStates = profile.states.terminal || [];

    const adopt = (fresh: Task) => {
      if (terminalStates.includes(fresh.status)) {
        setActiveTask(fresh); // stores the terminal copy
        reset();
      } else {
        setActiveTask(fresh);
      }
    };

    // Re-validated on the way out of storage, not just on the way in: the
    // origin came from an untrusted relay event, and it is about to be the
    // target of signed requests.
    const storedOrigin = () =>
      safeOperatorOrigin(localStorage.getItem(activeTaskOriginKey(roleRef.current))) || undefined;

    const stored = loadJson<Task>(STORAGE_KEYS.activeTask);
    if (stored?.id) {
      getTask(stored.id, safeOperatorOrigin(stored.operatorBase || null) || storedOrigin())
        .then(adopt)
        .catch(() => reset()); // Task not found — clear
      return;
    }

    /** Last resort: the id and, for a federated job, whose job it is */
    const fromStoredId = () => {
      const storedId = localStorage.getItem(activeTaskIdKey(roleRef.current));
      if (!storedId) return;
      getTask(storedId, storedOrigin())
        .then((fresh) => {
          if (!terminalStates.includes(fresh.status)) {
            setActiveTask(fresh);
          } else {
            localStorage.removeItem(activeTaskIdKey(roleRef.current));
            localStorage.removeItem(activeTaskOriginKey(roleRef.current));
          }
        })
        .catch(() => {
          localStorage.removeItem(activeTaskIdKey(roleRef.current));
          localStorage.removeItem(activeTaskOriginKey(roleRef.current));
        });
    };

    // No session task — rehydrate from the operator. It only knows its own
    // jobs, so a null answer with a stored foreign origin is not "no job".
    getActiveParticipantTask(identity.pubKeyHex)
      .then((task) => {
        if (task && !terminalStates.includes(task.status)) {
          setActiveTask(task);
        } else if (storedOrigin()) {
          fromStoredId();
        } else {
          localStorage.removeItem(activeTaskIdKey(roleRef.current));
        }
      })
      .catch(fromStoredId);
  }, [profile, identity?.pubKeyHex]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <TaskContext.Provider
      value={{
        activeTask, setActiveTask,
        completedTask, clearCompletedTask,
        estimate, setEstimate,
        origin, originAddress, setOrigin,
        destination, destinationAddress, setDestination,
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
