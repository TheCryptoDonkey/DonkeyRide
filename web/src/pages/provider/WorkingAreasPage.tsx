import type { GeoJsonObject } from 'geojson';
import L, { type LeafletMouseEvent, type PathOptions } from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView, useLeafletMap } from '../../components/map/MapView';
import { showToast } from '../../components/common/Toast';
import { useLocation } from '../../hooks/useLocation';
import { useDomain } from '../../context/DomainContext';
import { dispatchService } from '../../services/dispatch';
import {
  loadWorkingAreas,
  saveWorkingAreas,
  verticesToCells,
  combinedCells,
  cellsToGeoJSON,
  type WorkingArea,
} from '../../utils/working-areas';
import type { LatLng } from '../../types/api';

/** Forward map taps to the polygon being drawn */
function ClickCapture({ onPoint }: { onPoint: (point: LatLng) => void }) {
  const map = useLeafletMap();
  useEffect(() => {
    const handleClick = (event: LeafletMouseEvent) => {
      onPoint({ lat: event.latlng.lat, lng: event.latlng.lng });
    };
    map.on('click', handleClick);
    return () => { map.off('click', handleClick); };
  }, [map, onPoint]);
  return null;
}

function GeoJsonLayer({ data, style }: { data: GeoJsonObject; style: PathOptions }) {
  const map = useLeafletMap();
  useEffect(() => {
    const layer = L.geoJSON(data, { style }).addTo(map);
    return () => { layer.removeFrom(map); };
  }, [map, data, style]);
  return null;
}

function PolygonLayer({ positions, style }: { positions: [number, number][]; style: PathOptions }) {
  const map = useLeafletMap();
  useEffect(() => {
    const layer = L.polygon(positions, style).addTo(map);
    return () => { layer.removeFrom(map); };
  }, [map, positions, style]);
  return null;
}

function PointLayer({ point }: { point: LatLng }) {
  const map = useLeafletMap();
  useEffect(() => {
    const layer = L.circleMarker([point.lat, point.lng], {
      radius: 5,
      color: '#f59e0b',
      fillColor: '#f59e0b',
      fillOpacity: 1,
    }).addTo(map);
    return () => { layer.removeFrom(map); };
  }, [map, point.lat, point.lng]);
  return null;
}

/**
 * Driver-defined working areas: tap the map to outline a polygon, save it,
 * and geohash-kit covers it with a compact cell set. The union of all saved
 * areas is registered with the dispatcher — jobs then arrive on cell
 * membership rather than the operator's blunt radius, and the TROTT-02
 * announcements a driver could subscribe to use the same `g` cells.
 */
export function WorkingAreasPage() {
  const navigate = useNavigate();
  // Drawing an area does not require revealing the device position.
  const { location } = useLocation({ enabled: false });
  const { profile } = useDomain();
  const [areas, setAreas] = useState<WorkingArea[]>(loadWorkingAreas());
  const [draft, setDraft] = useState<LatLng[]>([]);

  const taskNoun = profile?.labels?.taskNoun || 'task';
  const savedCells = useMemo(() => combinedCells(areas), [areas]);
  const savedGeoJSON = useMemo(
    () => (savedCells.length > 0 ? cellsToGeoJSON(savedCells) : null),
    [savedCells],
  );

  // Live preview of the draft's coverage — null while infeasible/too large
  const draftCells = useMemo(() => {
    if (draft.length < 3) return null;
    try {
      return verticesToCells(draft);
    } catch {
      return null;
    }
  }, [draft]);
  const draftGeoJSON = useMemo(
    () => (draftCells && draftCells.length > 0 ? cellsToGeoJSON(draftCells) : null),
    [draftCells],
  );

  const persist = (next: WorkingArea[]) => {
    setAreas(next);
    saveWorkingAreas(next);
    dispatchService.setAreas(combinedCells(next));
  };

  const saveDraft = () => {
    if (draft.length < 3) return;
    let cells: string[];
    try {
      cells = verticesToCells(draft);
    } catch {
      showToast('Area too large — draw a smaller one', { type: 'error' });
      return;
    }
    const area: WorkingArea = {
      id: `area_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: `Area ${areas.length + 1}`,
      vertices: draft,
      cells,
    };
    persist([...areas, area]);
    setDraft([]);
    showToast(`${area.name} saved (${cells.length} cells)`, { type: 'info' });
  };

  const removeArea = (id: string) => {
    persist(areas.filter((area) => area.id !== id));
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 relative">
        <MapView centre={location} zoom={12}>
          <ClickCapture onPoint={(point) => setDraft((prev) => [...prev, point])} />

          {/* Saved coverage cells */}
          {savedGeoJSON && (
            <GeoJsonLayer
              key={savedCells.join(',')}
              data={savedGeoJSON as GeoJsonObject}
              style={{ color: '#22c55e', weight: 1, fillOpacity: 0.15 }}
            />
          )}

          {/* Draft polygon + its live coverage preview */}
          {draftGeoJSON && (
            <GeoJsonLayer
              key={`draft-${draftCells?.join(',')}`}
              data={draftGeoJSON as GeoJsonObject}
              style={{ color: '#f59e0b', weight: 1, fillOpacity: 0.1 }}
            />
          )}
          {draft.length >= 2 && (
            <PolygonLayer
              positions={draft.map((p) => [p.lat, p.lng] as [number, number])}
              style={{ color: '#f59e0b', weight: 2, fillOpacity: 0.05 }}
            />
          )}
          {draft.map((point, i) => (
            <PointLayer
              key={`${point.lat}-${point.lng}-${i}`}
              point={point}
            />
          ))}
        </MapView>

        <div className="absolute top-3 left-3 right-3 z-10">
          <div className="bg-donkey-surface/95 border border-donkey-border rounded-lg px-4 py-2">
            <p className="text-sm text-donkey-text font-semibold">
              Tap the map to outline where you want to work
            </p>
            <p className="text-xs text-donkey-muted">
              {draft.length > 0
                ? `${draft.length} point${draft.length === 1 ? '' : 's'} — need at least 3`
                : savedCells.length > 0
                  ? `Covering ${savedCells.length} geohash cells — only ${taskNoun} requests inside your areas reach you`
                  : `No areas defined — ${taskNoun} requests use the operator's dispatch radius`}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-donkey-surface border-t-2 border-donkey-border p-6 space-y-4 shadow-panel">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black tracking-tight">Working Areas</h2>
          <span className="text-xs text-donkey-muted font-mono uppercase tracking-wider">
            {savedCells.length} cells
          </span>
        </div>

        {areas.length > 0 && (
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {areas.map((area) => (
              <div
                key={area.id}
                className="flex items-center justify-between bg-donkey-bg border border-donkey-border rounded-lg px-4 py-2"
              >
                <div>
                  <p className="text-sm font-semibold text-donkey-text">{area.name}</p>
                  <p className="text-xs text-donkey-muted">{area.cells.length} cells</p>
                </div>
                <button
                  className="text-donkey-red text-sm font-semibold"
                  onClick={() => removeArea(area.id)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {draft.length > 0 ? (
          <div className="flex gap-3">
            <button
              className="btn-secondary flex-1"
              onClick={() => setDraft((prev) => prev.slice(0, -1))}
            >
              Undo Point
            </button>
            <button
              className="btn-secondary flex-1"
              onClick={() => setDraft([])}
            >
              Clear
            </button>
            <button
              className="btn-primary flex-1"
              onClick={saveDraft}
              disabled={draft.length < 3}
            >
              Save Area
            </button>
          </div>
        ) : (
          <button className="btn-secondary w-full" onClick={() => navigate('/provide')}>
            Back to Dashboard
          </button>
        )}
      </div>
    </div>
  );
}
