import type { LatLng, TaskStop } from '../types/api';

export interface ClientRoute {
  distanceKm: number;
  durationMinutes: number;
  /** Leaflet order: [lat, lng] */
  geometry: [number, number][];
}

/** Decode Valhalla's precision-6 polyline into Leaflet [lat, lng] points. */
export function decodePolyline6(shape: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const readDelta = () => {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      if (index >= shape.length) throw new Error('Malformed routing shape');
      byte = shape.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return (result & 1) ? ~(result >> 1) : (result >> 1);
  };
  while (index < shape.length) {
    lat += readDelta();
    lng += readDelta();
    points.push([lat / 1e6, lng / 1e6]);
  }
  return points;
}

/**
 * Route in the browser against the routing service selected by the operator.
 * The coordination API never receives these points: only the returned
 * distance/time totals are sent there for pricing.
 */
export async function routeDirect(
  routerBase: string,
  pickup: LatLng,
  dropoff: LatLng,
  stops: TaskStop[] = [],
): Promise<ClientRoute> {
  const base = routerBase.replace(/\/$/, '');
  const target = base.endsWith('/route') ? base : `${base}/route`;
  const response = await fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locations: [pickup, ...stops, dropoff].map((point) => ({
        lat: point.lat,
        lon: point.lng,
      })),
      costing: 'auto',
      units: 'kilometers',
      shape_format: 'polyline6',
    }),
  });
  if (!response.ok) {
    throw new Error(`Routing service returned ${response.status}`);
  }
  const data = await response.json();
  const summary = data?.trip?.summary;
  const legs = Array.isArray(data?.trip?.legs) ? data.trip.legs : [];
  const distanceKm = Number(summary?.length);
  const durationSeconds = Number(summary?.time);
  if (!Number.isFinite(distanceKm) || distanceKm <= 0
      || !Number.isFinite(durationSeconds) || durationSeconds <= 0
      || legs.length === 0) {
    throw new Error('Routing service returned no usable road route');
  }
  const geometry: [number, number][] = [];
  for (const leg of legs) {
    const decoded = decodePolyline6(String(leg?.shape || ''));
    if (geometry.length > 0 && decoded.length > 0) decoded.shift();
    geometry.push(...decoded);
  }
  if (geometry.length < 2) throw new Error('Routing service returned no route geometry');
  return {
    distanceKm,
    durationMinutes: durationSeconds / 60,
    geometry,
  };
}
