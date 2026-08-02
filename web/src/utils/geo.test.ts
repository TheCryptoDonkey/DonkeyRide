import { describe, it, expect } from 'vitest';
import {
  haversineMetres, decodePolyline, routePositions, distanceToRouteMetres,
} from './geo';

describe('haversineMetres', () => {
  it('one milli-degree of latitude is ~111 metres', () => {
    const d = haversineMetres({ lat: 53.48, lng: -2.24 }, { lat: 53.481, lng: -2.24 });
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(118);
  });

  it('zero distance for the same point', () => {
    expect(haversineMetres({ lat: 53.48, lng: -2.24 }, { lat: 53.48, lng: -2.24 })).toBe(0);
  });
});

describe('decodePolyline', () => {
  it('decodes the reference polyline from the algorithm spec', () => {
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(points).toEqual([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ]);
  });
});

describe('routePositions', () => {
  it('passes through a coordinate array, dropping junk', () => {
    const input = [[53.48, -2.24], [NaN, 1], [53.49, -2.25]] as [number, number][];
    expect(routePositions(input)).toEqual([[53.48, -2.24], [53.49, -2.25]]);
  });

  it('decodes an encoded string', () => {
    expect(routePositions('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toHaveLength(3);
  });

  it('returns [] for absent geometry', () => {
    expect(routePositions(undefined)).toEqual([]);
    expect(routePositions(null)).toEqual([]);
  });
});

describe('distanceToRouteMetres', () => {
  // A ~1.1 km straight west-to-east segment through Manchester
  const route: [number, number][] = [[53.48, -2.25], [53.48, -2.235]];

  it('a point on the route is at ~zero distance', () => {
    expect(distanceToRouteMetres({ lat: 53.48, lng: -2.24 }, route)).toBeLessThan(1);
  });

  it('a point offset perpendicular measures the offset', () => {
    // 0.002° of latitude ≈ 222 m north of the segment
    const d = distanceToRouteMetres({ lat: 53.482, lng: -2.24 }, route);
    expect(d).toBeGreaterThan(210);
    expect(d).toBeLessThan(235);
  });

  it('beyond an endpoint measures to the endpoint, not the line', () => {
    const d = distanceToRouteMetres({ lat: 53.48, lng: -2.28 }, route);
    const direct = haversineMetres({ lat: 53.48, lng: -2.28 }, { lat: 53.48, lng: -2.25 });
    expect(Math.abs(d - direct)).toBeLessThan(direct * 0.01);
  });

  it('empty route is infinitely far away', () => {
    expect(distanceToRouteMetres({ lat: 53.48, lng: -2.24 }, [])).toBe(Infinity);
  });
});
