/**
 * Ride check — the rider's own phone watches the trip (Uber RideCheck,
 * done operator-blind). Pure detection over GPS samples: no network, no
 * server, nothing leaves the device until the rider (or their silence)
 * chooses to alert their trusted contacts.
 *
 * Two conditions, both only meaningful while the trip is in progress:
 * - off_route: sustained distance from the expected route geometry
 * - stalled:   no meaningful movement for a long stretch
 *
 * Thresholds are deliberately generous — urban GPS wanders and traffic
 * jams are real; a false "Everything OK?" is mildly annoying, but a
 * noisy one teaches riders to ignore it.
 */

import type { LatLng } from '../types/api';
import { haversineMetres, distanceToRouteMetres } from './geo';

export type RideCheckReason = 'off_route' | 'stalled';

export interface RideCheckSample extends LatLng {
  /** Sample time, unix ms — injected so the logic is fully testable */
  t: number;
}

export interface RideCheckConfig {
  offRouteMetres: number;
  offRouteSustainMs: number;
  stallRadiusMetres: number;
  stallMs: number;
  cooldownMs: number;
}

export const DEFAULT_RIDE_CHECK: RideCheckConfig = {
  offRouteMetres: 500,
  offRouteSustainMs: 2 * 60 * 1000,
  stallRadiusMetres: 100,
  stallMs: 5 * 60 * 1000,
  cooldownMs: 5 * 60 * 1000,
};

export interface RideCheckMonitor {
  /** Feed a GPS fix; returns a reason when a prompt should be raised. */
  addSample(sample: RideCheckSample): RideCheckReason | null;
  /** Rider said "I'm fine" (or was alerted) — quiet down for a while. */
  acknowledge(t: number): void;
}

export function createRideCheck(
  route: [number, number][],
  config: Partial<RideCheckConfig> = {},
): RideCheckMonitor {
  const cfg: RideCheckConfig = { ...DEFAULT_RIDE_CHECK, ...config };
  let offRouteSince: number | null = null;
  // Stall clock anchor: the fix the device has stayed close to
  let anchor: RideCheckSample | null = null;
  let quietUntil = 0;

  const fire = (reason: RideCheckReason, t: number): RideCheckReason => {
    quietUntil = t + cfg.cooldownMs;
    offRouteSince = null;
    anchor = null;
    return reason;
  };

  return {
    addSample(sample: RideCheckSample): RideCheckReason | null {
      const { t } = sample;

      // Off-route: sustained, so a single wild GPS fix never fires
      if (route.length >= 2
        && distanceToRouteMetres(sample, route) > cfg.offRouteMetres) {
        offRouteSince = offRouteSince ?? t;
      } else {
        offRouteSince = null;
      }

      // Stall: still within the radius of the anchor fix? A move beyond
      // it (including slow creep through traffic) restarts the clock.
      if (!anchor || haversineMetres(anchor, sample) > cfg.stallRadiusMetres) {
        anchor = sample;
      }

      if (t < quietUntil) return null;
      if (offRouteSince !== null && t - offRouteSince >= cfg.offRouteSustainMs) {
        return fire('off_route', t);
      }
      if (t - anchor.t >= cfg.stallMs) {
        return fire('stalled', t);
      }
      return null;
    },

    acknowledge(t: number): void {
      quietUntil = t + cfg.cooldownMs;
      offRouteSince = null;
      anchor = null;
    },
  };
}
