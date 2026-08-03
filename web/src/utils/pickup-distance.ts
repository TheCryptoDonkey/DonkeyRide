import { haversineMetres } from './geo';
import type { LatLng, Task } from '../types/api';

/**
 * How far the driver is from the pickup, and roughly how long that takes.
 *
 * This is the number a driver decides on — a £6 job two minutes away and a £6
 * job twenty minutes away are not the same job — and it was missing from every
 * screen a driver chooses from. Computed on the device from the approximate
 * pickup already in the payload, so it costs the operator nothing and leaks
 * nothing extra.
 *
 * Deliberately straight-line: pre-accept the driver only has an approximate
 * (~1 km rounded) pickup anyway, so a road route would be false precision.
 */

/** Assumed average speed for the approach leg */
const APPROACH_SPEED_KMH = 25;

export interface PickupProximity {
  km: number;
  minutes: number;
}

export function pickupProximity(
  from: LatLng | null | undefined,
  pickup: LatLng | null | undefined,
): PickupProximity | null {
  if (!from || !pickup) return null;
  if (!Number.isFinite(from.lat) || !Number.isFinite(from.lng)) return null;
  if (!Number.isFinite(pickup.lat) || !Number.isFinite(pickup.lng)) return null;

  const km = haversineMetres(from, pickup) / 1000;
  if (!Number.isFinite(km)) return null;
  return {
    km,
    // Never promise under a minute — an "0 min away" badge on a job that is
    // still a walk away is the kind of small lie drivers stop trusting
    minutes: Math.max(1, Math.round((km / APPROACH_SPEED_KMH) * 60)),
  };
}

export function taskPickupProximity(
  from: LatLng | null | undefined,
  task: Pick<Task, 'pickup'> | null | undefined,
): PickupProximity | null {
  return pickupProximity(from, task?.pickup);
}

/**
 * Rank jobs the way a driver would: nearest first, and among jobs of similar
 * closeness the better-paying one wins. Without a fix, fall back to fare.
 */
export function rankJobs<T extends Pick<Task, 'pickup' | 'fareEstimateSats'>>(
  jobs: T[],
  from: LatLng | null | undefined,
): T[] {
  return [...jobs].sort((a, b) => {
    const da = pickupProximity(from, a.pickup);
    const db = pickupProximity(from, b.pickup);
    if (da && db) {
      // Half-a-kilometre buckets: inside one bucket, money decides
      const bucket = Math.round(da.km * 2) - Math.round(db.km * 2);
      if (bucket !== 0) return bucket;
    }
    return (b.fareEstimateSats || 0) - (a.fareEstimateSats || 0);
  });
}
