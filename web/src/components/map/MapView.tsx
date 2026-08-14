import L, { type Map as LeafletMap } from 'leaflet';
import type { LatLng } from '../../types/api';
import 'leaflet/dist/leaflet.css';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface MapViewProps {
  centre: LatLng;
  zoom?: number;
  children?: ReactNode;
  className?: string;
  /**
   * What this map is showing, for anyone who cannot see it. Every screen
   * states its situation in text as well (status badge, person card,
   * addresses), so the map is supplementary rather than the only source —
   * but it should still announce itself rather than being an unlabelled
   * region full of tile images.
   */
  label?: string;
}

/** Threshold in degrees (~100m at London's latitude) */
const SIGNIFICANT_MOVE = 0.001;

const LeafletMapContext = createContext<LeafletMap | null>(null);

export function useLeafletMap(): LeafletMap {
  const map = useContext(LeafletMapContext);
  if (!map) {
    throw new Error('Leaflet layer must be rendered inside MapView');
  }
  return map;
}

export function MapView({
  centre, zoom = 14, children, className, label = 'Map',
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [map, setMap] = useState<LeafletMap | null>(null);
  const userDragged = useRef(false);
  const lastCentre = useRef(centre);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const instance = L.map(containerRef.current, { zoomControl: false });
    instance.setView([centre.lat, centre.lng], zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(instance);

    const markDragged = () => { userDragged.current = true; };
    instance.on('dragstart', markDragged);
    mapRef.current = instance;
    setMap(instance);

    return () => {
      instance.off('dragstart', markDragged);
      instance.remove();
      mapRef.current = null;
      setMap((current) => (current === instance ? null : current));
    };
    // Initial centre and zoom belong to this map instance. Later changes are
    // handled below without destroying its tiles or interaction state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!map) return;
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

  return (
    <>
      <div
        ref={containerRef}
        className={className || 'h-full w-full'}
        role="region"
        aria-label={label}
      />
      {map && (
        <LeafletMapContext.Provider value={map}>
          {children}
        </LeafletMapContext.Provider>
      )}
    </>
  );
}
