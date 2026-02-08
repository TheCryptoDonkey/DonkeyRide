import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { LatLng } from '../../types/api';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, type ReactNode } from 'react';

interface MapViewProps {
  centre: LatLng;
  zoom?: number;
  children?: ReactNode;
  className?: string;
}

/** Threshold in degrees (~100m at London's latitude) */
const SIGNIFICANT_MOVE = 0.001;

function MapUpdater({ centre, zoom }: { centre: LatLng; zoom: number }) {
  const map = useMap();
  const userDragged = useRef(false);
  const lastCentre = useRef(centre);

  // Track user drag
  useMapEvents({
    dragstart: () => { userDragged.current = true; },
  });

  useEffect(() => {
    const latDiff = Math.abs(centre.lat - lastCentre.current.lat);
    const lngDiff = Math.abs(centre.lng - lastCentre.current.lng);
    const significantChange = latDiff > SIGNIFICANT_MOVE || lngDiff > SIGNIFICANT_MOVE;

    if (significantChange) {
      // Reset drag flag on significant movement — user should see the new location
      userDragged.current = false;
      lastCentre.current = centre;
      map.setView([centre.lat, centre.lng], zoom);
    } else if (!userDragged.current) {
      map.setView([centre.lat, centre.lng], zoom);
    }
  }, [map, centre.lat, centre.lng, zoom]);

  return null;
}

export function MapView({ centre, zoom = 14, children, className }: MapViewProps) {
  return (
    <MapContainer
      center={[centre.lat, centre.lng]}
      zoom={zoom}
      className={className || 'h-full w-full'}
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapUpdater centre={centre} zoom={zoom} />
      {children}
    </MapContainer>
  );
}
