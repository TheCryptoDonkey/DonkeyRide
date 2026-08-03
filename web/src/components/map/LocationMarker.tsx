import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import type { LatLng } from '../../types/api';

interface LocationMarkerProps {
  position: LatLng;
  label: string;
  colour?: 'green' | 'red' | 'purple' | 'blue' | 'orange';
  /** Let the user drag the pin (pickup adjustment) */
  draggable?: boolean;
  onDragEnd?: (position: LatLng) => void;
}

const COLOURS: Record<string, string> = {
  green: '#00ff88',
  red: '#ff4444',
  purple: '#b24cf3',
  blue: '#4fc3f7',
  orange: '#f5a623',
};

function createIcon(colour: string, draggable: boolean) {
  const hex = COLOURS[colour] || COLOURS.purple;
  // A draggable pin is bigger and ringed — it has to look grabbable
  const size = draggable ? 24 : 16;
  return L.divIcon({
    html: `<div style="
      width: ${size}px; height: ${size}px;
      background: ${hex};
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4)${draggable ? `, 0 0 0 6px ${hex}33` : ''};
      cursor: ${draggable ? 'grab' : 'pointer'};
    "></div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export function LocationMarker({
  position,
  label,
  colour = 'purple',
  draggable = false,
  onDragEnd,
}: LocationMarkerProps) {
  return (
    <Marker
      position={[position.lat, position.lng]}
      icon={createIcon(colour, draggable)}
      draggable={draggable}
      eventHandlers={draggable && onDragEnd ? {
        dragend: (e) => {
          const { lat, lng } = e.target.getLatLng();
          onDragEnd({ lat, lng });
        },
      } : undefined}
    >
      <Popup>
        <span className="font-mono text-sm">{label}</span>
      </Popup>
    </Marker>
  );
}
