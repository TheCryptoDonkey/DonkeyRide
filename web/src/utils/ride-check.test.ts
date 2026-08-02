import { describe, it, expect } from 'vitest';
import { createRideCheck } from './ride-check';

// A straight ~5.5 km south-to-north route
const route: [number, number][] = [[53.40, -2.24], [53.45, -2.24]];

const cfg = {
  offRouteMetres: 500,
  offRouteSustainMs: 120_000,
  stallRadiusMetres: 100,
  stallMs: 300_000,
  cooldownMs: 300_000,
};

/** Samples travelling along the route, one per interval */
function onRoute(t: number, i: number) {
  return { lat: 53.40 + i * 0.001, lng: -2.24, t };
}

describe('ride check: off-route', () => {
  it('stays quiet while the trip follows the route', () => {
    const check = createRideCheck(route, cfg);
    for (let i = 0; i < 50; i++) {
      expect(check.addSample(onRoute(i * 10_000, i))).toBeNull();
    }
  });

  it('a single wild fix never fires', () => {
    const check = createRideCheck(route, cfg);
    check.addSample(onRoute(0, 0));
    expect(check.addSample({ lat: 53.40, lng: -2.30, t: 10_000 })).toBeNull();
    expect(check.addSample(onRoute(20_000, 2))).toBeNull();
    // Long after: still quiet — the deviation did not sustain
    expect(check.addSample(onRoute(200_000, 3))).toBeNull();
  });

  it('fires after a sustained deviation, then respects the cooldown', () => {
    const check = createRideCheck(route, cfg);
    check.addSample(onRoute(0, 0));
    // ~1.3 km east of the route, creeping along so no stall fires
    let fired = null;
    for (let i = 0; i <= 15; i++) {
      fired = check.addSample({ lat: 53.41 + i * 0.002, lng: -2.22, t: 10_000 + i * 10_000 });
      if (fired) break;
    }
    expect(fired).toBe('off_route');
    // Still off-route immediately after: cooldown holds it quiet
    expect(check.addSample({ lat: 53.44, lng: -2.22, t: 170_000 })).toBeNull();
  });

  it('returning to the route resets the sustain clock', () => {
    const check = createRideCheck(route, cfg);
    check.addSample({ lat: 53.41, lng: -2.22, t: 0 });      // off
    check.addSample(onRoute(60_000, 1));                     // back on
    // Off again — 100s later would have fired had the clock not reset
    expect(check.addSample({ lat: 53.42, lng: -2.22, t: 100_000 })).toBeNull();
    expect(check.addSample({ lat: 53.43, lng: -2.22, t: 230_000 })).toBe('off_route');
  });
});

describe('ride check: stall', () => {
  it('fires when the device stays put too long', () => {
    const check = createRideCheck(route, cfg);
    let fired = null;
    for (let i = 0; i <= 31 && !fired; i++) {
      fired = check.addSample({ lat: 53.42, lng: -2.24, t: i * 10_000 });
    }
    expect(fired).toBe('stalled');
  });

  it('slow creep through traffic keeps restarting the clock', () => {
    const check = createRideCheck(route, cfg);
    for (let i = 0; i <= 40; i++) {
      // ~130 m along the route every 60 s — beyond the stall radius
      expect(check.addSample(onRoute(i * 60_000, i))).toBeNull();
    }
  });

  it('acknowledge quietens a stalled trip for the cooldown', () => {
    const check = createRideCheck(route, cfg);
    let t = 0;
    let fired = null;
    while (!fired) {
      fired = check.addSample({ lat: 53.42, lng: -2.24, t });
      t += 10_000;
    }
    check.acknowledge(t);
    // Still parked through the whole cooldown: quiet
    const quietEnd = t + cfg.cooldownMs;
    while (t < quietEnd) {
      expect(check.addSample({ lat: 53.42, lng: -2.24, t })).toBeNull();
      t += 10_000;
    }
    // But staying parked past cooldown + a fresh stall span fires again
    let refired = null;
    const deadline = t + cfg.stallMs + cfg.cooldownMs + 60_000;
    while (!refired && t < deadline) {
      refired = check.addSample({ lat: 53.42, lng: -2.24, t });
      t += 10_000;
    }
    expect(refired).toBe('stalled');
  });
});
