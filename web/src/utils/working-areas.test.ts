import { describe, it, expect, beforeEach } from 'vitest';
import { encode } from 'geohash-kit';
import {
  verticesToCells,
  combinedCells,
  loadWorkingAreas,
  saveWorkingAreas,
  cellsToGeoJSON,
  MAX_AREA_CELLS,
  type WorkingArea,
} from './working-areas';

// A rough box around central Manchester
const MANCHESTER_BOX = [
  { lat: 53.44, lng: -2.30 },
  { lat: 53.44, lng: -2.18 },
  { lat: 53.52, lng: -2.18 },
  { lat: 53.52, lng: -2.30 },
];

const PICCADILLY = { lat: 53.4808, lng: -2.2426 };

function makeArea(id: string, cells: string[]): WorkingArea {
  return { id, name: id, vertices: MANCHESTER_BOX, cells };
}

describe('working areas', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('covers a drawn polygon with cells containing its interior points', () => {
    const cells = verticesToCells(MANCHESTER_BOX);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.length).toBeLessThanOrEqual(MAX_AREA_CELLS);

    // A pickup inside the polygon must geohash-match one of the cells
    const pickupHash = encode(PICCADILLY.lat, PICCADILLY.lng, 9);
    expect(cells.some((cell) => pickupHash.startsWith(cell))).toBe(true);

    // A London pickup must not
    const londonHash = encode(51.5074, -0.1278, 9);
    expect(cells.some((cell) => londonHash.startsWith(cell))).toBe(false);
  });

  it('needs at least three vertices', () => {
    expect(verticesToCells([])).toEqual([]);
    expect(verticesToCells(MANCHESTER_BOX.slice(0, 2))).toEqual([]);
  });

  it('unions areas, dedupes overlap, and respects the server cap', () => {
    const cells = verticesToCells(MANCHESTER_BOX);
    const union = combinedCells([
      makeArea('a', cells),
      makeArea('b', cells), // exact duplicate area
    ]);
    // Duplicates collapse — the union is no bigger than one area's coverage
    expect(union.length).toBeLessThanOrEqual(cells.length);
    expect(union.length).toBeLessThanOrEqual(MAX_AREA_CELLS);
  });

  it('round-trips through localStorage and survives corruption', () => {
    const areas = [makeArea('area_1', verticesToCells(MANCHESTER_BOX))];
    saveWorkingAreas(areas);
    expect(loadWorkingAreas()).toEqual(areas);

    localStorage.setItem('donkeyride.provider.workingAreas', 'not json');
    expect(loadWorkingAreas()).toEqual([]);

    localStorage.setItem('donkeyride.provider.workingAreas', '{"not":"an array"}');
    expect(loadWorkingAreas()).toEqual([]);
  });

  it('renders coverage cells as GeoJSON rectangles', () => {
    const cells = verticesToCells(MANCHESTER_BOX);
    const geojson = cellsToGeoJSON(cells);
    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.features.length).toBe(cells.length);
    expect(geojson.features[0].properties.geohash).toBe(cells[0]);
  });
});
