import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import type { LatLng } from '../../types/api';
import 'leaflet/dist/leaflet.css';
import { useEffect, type ReactNode } from 'react';

interface MapViewProps {
  centre: LatLng;
  zoom?: number;
  children?: ReactNode;
  className?: string;
}

function MapUpdater({ centre, zoom }: { centre: LatLng; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([centre.lat, centre.lng], zoom);
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
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <MapUpdater centre={centre} zoom={zoom} />
      {children}
    </MapContainer>
  );
}
