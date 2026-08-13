/**
 * Destination mode — the driver picks where they're heading and the
 * available-jobs list narrows to jobs that move them that way (Uber's
 * Destination Mode). Entirely client-side: the driver's destination
 * never leaves the device, and the driver — not the operator — decides
 * which work to see. Approximate (~1 km) pre-accept locations are
 * plenty for a corridor judgement.
 */

import type { LatLng, Task } from '../types/api';
import { haversineMetres } from './geo';

const STORAGE_KEY = 'donkeyride.destination-mode';
let currentDestination: DestinationMode | null = null;

export interface DestinationMode extends LatLng {
  label: string;
}

/** A job must bring the driver at least this much closer */
const MIN_PROGRESS_M = 1000;
/** ...unless its dropoff is practically at the destination */
const NEAR_DEST_M = 2000;

export function loadDestinationMode(): DestinationMode | null {
  try {
    // Remove exact destinations left by older builds.
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be unavailable.
  }
  return currentDestination ? { ...currentDestination } : null;
}

export function saveDestinationMode(mode: DestinationMode): void {
  currentDestination = { ...mode };
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* memory-only */ }
}

export function clearDestinationMode(): void {
  currentDestination = null;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* memory-only */ }
}

/**
 * Does this job move the driver toward their destination? A job
 * qualifies when its dropoff makes real progress compared with its
 * pickup, or ends practically at the destination. Jobs whose route we
 * cannot judge (no dropoff — e.g. single-location domains) do not
 * qualify: destination mode is an explicit "only on my way" filter.
 */
export function jobMovesToward(
  job: Pick<Task, 'pickup' | 'dropoff'>,
  destination: LatLng,
): boolean {
  if (!job.dropoff) return false;
  const fromDest = haversineMetres(job.pickup, destination);
  const toDest = haversineMetres(job.dropoff, destination);
  if (toDest <= NEAR_DEST_M) return true;
  return fromDest - toDest >= MIN_PROGRESS_M;
}
