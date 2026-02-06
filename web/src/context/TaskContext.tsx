import {
  createContext, useContext, useState, useCallback,
  type ReactNode,
} from 'react';
import type { Task, TripEstimate, LatLng } from '../types/api';

interface TaskState {
  /** Currently active task/ride */
  activeTask: Task | null;
  setActiveTask: (task: Task | null) => void;

  /** Current trip estimate (before requesting) */
  estimate: TripEstimate | null;
  setEstimate: (est: TripEstimate | null) => void;

  /** Selected pickup location */
  pickup: LatLng | null;
  setPickup: (loc: LatLng | null) => void;

  /** Selected dropoff location */
  dropoff: LatLng | null;
  setDropoff: (loc: LatLng | null) => void;

  /** Driver's current location (from WebSocket) */
  driverLocation: LatLng | null;
  setDriverLocation: (loc: LatLng | null) => void;

  /** Clear all task state */
  reset: () => void;
}

const TaskContext = createContext<TaskState>({
  activeTask: null,
  setActiveTask: () => {},
  estimate: null,
  setEstimate: () => {},
  pickup: null,
  setPickup: () => {},
  dropoff: null,
  setDropoff: () => {},
  driverLocation: null,
  setDriverLocation: () => {},
  reset: () => {},
});

export function TaskProvider({ children }: { children: ReactNode }) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [estimate, setEstimate] = useState<TripEstimate | null>(null);
  const [pickup, setPickup] = useState<LatLng | null>(null);
  const [dropoff, setDropoff] = useState<LatLng | null>(null);
  const [driverLocation, setDriverLocation] = useState<LatLng | null>(null);

  const reset = useCallback(() => {
    setActiveTask(null);
    setEstimate(null);
    setPickup(null);
    setDropoff(null);
    setDriverLocation(null);
  }, []);

  return (
    <TaskContext.Provider
      value={{
        activeTask, setActiveTask,
        estimate, setEstimate,
        pickup, setPickup,
        dropoff, setDropoff,
        driverLocation, setDriverLocation,
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
