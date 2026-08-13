import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodePolyline6, routeDirect } from './client-routing';

afterEach(() => vi.restoreAllMocks());

describe('client-direct Valhalla routing', () => {
  it('decodes Valhalla precision-6 geometry in Leaflet order', () => {
    const points = decodePolyline6('mve_eBd~zgCbA}PNcF');
    expect(points.length).toBeGreaterThanOrEqual(3);
    expect(points.every(([lat, lng]) => lat > 50 && lng < 0)).toBe(true);
  });

  it('routes through every stop and uses road summary rather than a point-to-point guess', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      trip: {
        summary: { length: 4.75, time: 1050 },
        legs: [
          { shape: 'mve_eBd~zgCbA}PNcF' },
          { shape: 'mve_eBd~zgCbA}PNcF' },
        ],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const route = await routeDirect(
      'https://router.example',
      { lat: 53.4808, lng: -2.2426 },
      { lat: 53.4774, lng: -2.2309 },
      [{ lat: 53.49, lng: -2.2 }],
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(fetchMock.mock.calls[0][0]).toBe('https://router.example/route');
    expect(body.locations).toHaveLength(3);
    expect(body.locations[1]).toEqual({ lat: 53.49, lon: -2.2 });
    expect(body.costing).toBe('auto');
    expect(route.distanceKm).toBe(4.75);
    expect(route.durationMinutes).toBe(17.5);
    expect(route.geometry.length).toBeGreaterThan(3);
  });
});
