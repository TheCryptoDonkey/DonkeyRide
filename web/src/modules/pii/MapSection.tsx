import type { ReactNode } from 'react';
import { MapView } from '../../components/map/MapView';
import type { LatLng } from '../../types/api';

interface MapSectionProps {
  centre: LatLng;
  zoom?: number;
  children?: ReactNode;
  /** Rendered when navigation is disabled */
  fallback?: ReactNode;
  /** Whether the map should be shown (typically profile.features.navigation) */
  enabled?: boolean;
}

/**
 * Conditional map wrapper — renders MapView when enabled,
 * or a fallback when navigation is disabled.
 * All map usage should go through this component so it can be
 * stripped from privacy-maximised deployments.
 */
export function MapSection({ centre, zoom, children, fallback, enabled = true }: MapSectionProps) {
  if (!enabled) {
    return (
      <div className="flex-1 flex items-center justify-center bg-donkey-bg">
        {fallback || (
          <div className="card text-center max-w-sm">
            <p className="text-sm text-donkey-muted">Map unavailable</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 relative">
      <MapView centre={centre} zoom={zoom}>
        {children}
      </MapView>
    </div>
  );
}
