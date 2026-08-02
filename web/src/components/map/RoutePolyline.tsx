import { Polyline } from 'react-leaflet';
import { routePositions } from '../../utils/geo';

interface RoutePolylineProps {
  /** Encoded polyline string, or decoded [lat, lng] positions */
  geometry: string | [number, number][];
  colour?: string;
  opacity?: number;
}

function getThemeRouteColour(): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue('--theme-route-colour')
    .trim() || '#b24cf3';
}

export function RoutePolyline({ geometry, colour, opacity = 0.8 }: RoutePolylineProps) {
  const resolvedColour = colour || getThemeRouteColour();

  const positions = routePositions(geometry);
  if (positions.length === 0) return null;

  return (
    <Polyline
      positions={positions}
      pathOptions={{ color: resolvedColour, weight: 4, opacity }}
    />
  );
}
