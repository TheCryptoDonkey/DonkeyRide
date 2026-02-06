import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import type { LatLng } from '../../types/api';

interface LocationMarkerProps {
  position: LatLng;
  label: string;
  colour?: 'green' | 'red' | 'purple' | 'blue' | 'orange';
}

const COLOURS: Record<string, string> = {
  green: '#00ff88',
  red: '#ff4444',
  purple: '#b24cf3',
  blue: '#4fc3f7',
  orange: '#f5a623',
};

function createIcon(colour: string) {
  const hex = COLOURS[colour] || COLOURS.purple;
  return L.divIcon({
    html: `<div style="
      width: 16px; height: 16px;
      background: ${hex};
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    "></div>`,
    className: '',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

export function LocationMarker({ position, label, colour = 'purple' }: LocationMarkerProps) {
  return (
    <Marker position={[position.lat, position.lng]} icon={createIcon(colour)}>
      <Popup>
        <span className="font-mono text-sm">{label}</span>
      </Popup>
    </Marker>
  );
}
