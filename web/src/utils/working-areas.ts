import { polygonToGeohashes, deduplicateGeohashes, geohashesToGeoJSON } from 'geohash-kit';
import type { GeohashGeoJSON } from 'geohash-kit';
import type { LatLng } from '../types/api';

/**
 * Driver-defined working areas. Each area is a polygon drawn on the map,
 * covered by a compact multi-precision geohash cell set (geohash-kit).
 * The union of every area's cells is sent with the dispatch registration,
 * so the operator dispatches on cell membership instead of a blunt radius —
 * the driver only hears about jobs inside the areas they chose to work.
 */
export interface WorkingArea {
  id: string;
  name: string;
  /** Polygon vertices as drawn on the map */
  vertices: LatLng[];
  /** Geohash coverage cells derived from the polygon */
  cells: string[];
}

const STORAGE_KEY = 'donkeyride.provider.workingAreas';

/** Matches the server-side cap (MAX_WORKING_AREAS) — the union is trimmed to this */
export const MAX_AREA_CELLS = 64;

/**
 * Cover a drawn polygon with geohash cells. Precision 4–6 spans roughly
 * 40 km cells down to 1 km cells: coarse interiors, tight edges.
 * Throws RangeError when the polygon is too large to cover — callers
 * surface that as "area too large".
 */
export function verticesToCells(vertices: LatLng[]): string[] {
  if (vertices.length < 3) return [];
  const ring: [number, number][] = vertices.map((v) => [v.lng, v.lat]);
  return polygonToGeohashes(ring, { minPrecision: 4, maxPrecision: 6, maxCells: MAX_AREA_CELLS });
}

export function loadWorkingAreas(): WorkingArea[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is WorkingArea =>
        !!a && typeof a.id === 'string' && Array.isArray(a.cells) && Array.isArray(a.vertices),
    );
  } catch {
    return [];
  }
}

export function saveWorkingAreas(areas: WorkingArea[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(areas));
  } catch {
    // Storage unavailable — the areas still apply for this session
  }
}

/** Union of all areas' cells, deduped/merged and capped to the server limit */
export function combinedCells(areas: WorkingArea[]): string[] {
  const cells = deduplicateGeohashes(areas.flatMap((a) => a.cells));
  return cells.slice(0, MAX_AREA_CELLS);
}

/** GeoJSON rectangles for rendering coverage cells on the map */
export function cellsToGeoJSON(cells: string[]): GeohashGeoJSON {
  return geohashesToGeoJSON(cells);
}
