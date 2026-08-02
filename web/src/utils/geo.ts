/**
 * Shared geometry helpers — distances and route decoding used by the
 * map layer and the client-side ride check.
 */

import type { LatLng } from '../types/api';

const EARTH_RADIUS_M = 6371000;

export function haversineMetres(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Decode a polyline-encoded string into [lat, lng] pairs.
 * Standard Google polyline algorithm (precision 5).
 */
export function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lat += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lng += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    coords.push([lat / 1e5, lng / 1e5]);
  }

  return coords;
}

/**
 * Normalise a route (encoded polyline string or [lat, lng] array) into
 * clean positions. Returns [] when the geometry is absent or invalid.
 */
export function routePositions(
  geometry: string | [number, number][] | undefined | null,
): [number, number][] {
  if (typeof geometry === 'string') {
    try {
      return decodePolyline(geometry);
    } catch {
      return [];
    }
  }
  if (Array.isArray(geometry)) {
    return geometry.filter(
      (pt): pt is [number, number] =>
        Array.isArray(pt) && pt.length >= 2
        && Number.isFinite(pt[0]) && Number.isFinite(pt[1]),
    );
  }
  return [];
}

/**
 * Shortest distance in metres from a point to a route polyline.
 * Each segment is treated on an equirectangular projection centred on
 * the point — accurate to well under a metre at street scale, which is
 * all the ride check needs.
 */
export function distanceToRouteMetres(point: LatLng, route: [number, number][]): number {
  if (route.length === 0) return Infinity;
  if (route.length === 1) {
    return haversineMetres(point, { lat: route[0][0], lng: route[0][1] });
  }

  const rad = Math.PI / 180;
  const cosLat = Math.cos(point.lat * rad);
  const toXY = (lat: number, lng: number): [number, number] => [
    (lng - point.lng) * rad * cosLat * EARTH_RADIUS_M,
    (lat - point.lat) * rad * EARTH_RADIUS_M,
  ];

  let best = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    const [ax, ay] = toXY(route[i][0], route[i][1]);
    const [bx, by] = toXY(route[i + 1][0], route[i + 1][1]);
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    // Project the origin (the point) onto the segment, clamped to its ends
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq));
    const px = ax + t * dx;
    const py = ay + t * dy;
    best = Math.min(best, Math.hypot(px, py));
  }
  return best;
}
