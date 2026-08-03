/**
 * "Arrives 14:32", not just "in 23 min".
 *
 * A duration answers "how long am I waiting"; a clock time answers "will I
 * make the train", which is the question people actually have. Both are
 * shown, because a countdown is what you glance at and a time is what you
 * plan around.
 */

/** Clock time this many seconds from now, in the viewer's own locale */
export function arrivalClock(seconds: number, now = Date.now()): string {
  const at = new Date(now + Math.max(0, seconds) * 1000);
  return at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Minutes, floored at 1 — "in 0 min" is not a thing anybody says */
export function etaMinutes(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60));
}

/**
 * Seconds remaining to the destination, live where possible.
 *
 * While the trip runs, the estimate made at booking time gets staler by the
 * minute: it was for the whole journey, from the pickup, before any of it
 * had happened. When the provider's app is sending live ETAs we use those;
 * otherwise we fall back to the booking estimate less the time already
 * elapsed, which is at least monotonic and honest about direction.
 */
export function remainingSeconds(params: {
  liveEtaSeconds?: number | null;
  durationMin?: number | null;
  startedAt?: string | null;
  now?: number;
}): number | null {
  if (params.liveEtaSeconds != null && params.liveEtaSeconds >= 0) {
    return params.liveEtaSeconds;
  }
  if (params.durationMin == null || !params.startedAt) return null;
  const started = new Date(params.startedAt).getTime();
  if (!Number.isFinite(started)) return null;
  const elapsed = ((params.now ?? Date.now()) - started) / 1000;
  // Never negative: an overrunning trip reports "about a minute", not a
  // number counting backwards into the past
  return Math.max(60, params.durationMin * 60 - elapsed);
}
