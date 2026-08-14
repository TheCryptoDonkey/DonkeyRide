import L from 'leaflet';
import { useEffect, useMemo } from 'react';
import { routePositions } from '../../utils/geo';
import { useLeafletMap } from './MapView';

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
  const map = useLeafletMap();
  const resolvedColour = colour || getThemeRouteColour();
  const positions = useMemo(() => routePositions(geometry), [geometry]);

  useEffect(() => {
    if (positions.length === 0) return;
    const line = L.polyline(positions, {
      color: resolvedColour,
      weight: 4,
      opacity,
    }).addTo(map);

    return () => {
      line.removeFrom(map);
    };
  }, [map, positions, resolvedColour, opacity]);

  return null;
}
