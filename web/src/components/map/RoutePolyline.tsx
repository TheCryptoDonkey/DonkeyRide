import { Polyline } from 'react-leaflet';

interface RoutePolylineProps {
  /** Encoded polyline string, or decoded [lat, lng] positions */
  geometry: string | [number, number][];
  colour?: string;
  opacity?: number;
}

/**
 * Decode a polyline-encoded string into lat/lng pairs.
 * Uses the standard Google polyline algorithm (precision 5).
 */
function decodePolyline(encoded: string): [number, number][] {
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

function getThemeRouteColour(): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue('--theme-route-colour')
    .trim() || '#b24cf3';
}

export function RoutePolyline({ geometry, colour, opacity = 0.8 }: RoutePolylineProps) {
  const resolvedColour = colour || getThemeRouteColour();

  let positions: [number, number][];
  if (typeof geometry === 'string') {
    try {
      positions = decodePolyline(geometry);
    } catch {
      return null;
    }
  } else if (Array.isArray(geometry)) {
    positions = geometry.filter(
      (pt): pt is [number, number] =>
        Array.isArray(pt) && pt.length >= 2
        && Number.isFinite(pt[0]) && Number.isFinite(pt[1]),
    );
  } else {
    return null;
  }

  if (positions.length === 0) return null;

  return (
    <Polyline
      positions={positions}
      pathOptions={{ color: resolvedColour, weight: 4, opacity }}
    />
  );
}
