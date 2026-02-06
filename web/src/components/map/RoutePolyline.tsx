import { Polyline } from 'react-leaflet';

interface RoutePolylineProps {
  geometry: string;
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

export function RoutePolyline({ geometry, colour = '#b24cf3', opacity = 0.8 }: RoutePolylineProps) {
  const positions = decodePolyline(geometry);

  if (positions.length === 0) return null;

  return (
    <Polyline
      positions={positions}
      pathOptions={{ color: colour, weight: 4, opacity }}
    />
  );
}
