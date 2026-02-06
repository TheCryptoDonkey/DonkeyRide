import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView } from '../../components/map/MapView';
import { LocationMarker } from '../../components/map/LocationMarker';
import { RoutePolyline } from '../../components/map/RoutePolyline';
import { StatusBadge } from '../../components/common/StatusBadge';
import { DualPrice } from '../../components/common/DualPrice';
import { PanicButton } from '../../components/safety/PanicButton';
import { Loading } from '../../components/common/Loading';
import { useTask } from '../../context/TaskContext';
import { useIdentity } from '../../context/IdentityContext';
import { useDomain } from '../../context/DomainContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { triggerPanic, cancelRide, getRide } from '../../services/api';
import type { WsMessage } from '../../types/api';

export function ActiveTaskPage() {
  const navigate = useNavigate();
  const { activeTask, setActiveTask, pickup, dropoff, driverLocation, setDriverLocation } = useTask();
  const { identity } = useIdentity();
  const { profile } = useDomain();

  // Redirect if no active task
  useEffect(() => {
    if (!activeTask) navigate('/ride');
  }, [activeTask, navigate]);

  // Handle WebSocket messages
  const handleWsMessage = useCallback((msg: WsMessage) => {
    switch (msg.type) {
      case 'location_update':
        setDriverLocation({ lat: msg.data.lat, lng: msg.data.lng });
        break;
      case 'status_change':
        if (activeTask) {
          setActiveTask({ ...activeTask, status: msg.data.status });
        }
        break;
      case 'ride_cancelled':
        navigate('/ride');
        break;
    }
  }, [activeTask, setActiveTask, setDriverLocation, navigate]);

  const { connected } = useWebSocket(activeTask?.id || null, handleWsMessage);

  // Poll for updates as fallback
  useEffect(() => {
    if (!activeTask) return;
    const timer = setInterval(async () => {
      try {
        const updated = await getRide(activeTask.id);
        setActiveTask(updated);
        if (['completed', 'cancelled'].includes(updated.status)) {
          if (updated.status === 'completed') navigate('/ride/complete');
          else navigate('/ride');
        }
      } catch {
        // Ignore poll errors
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [activeTask?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!activeTask || !pickup) return <Loading message="Loading ride..." />;

  const handlePanic = async () => {
    if (!identity) return;
    await triggerPanic(activeTask.id, {
      triggeredBy: identity.pubKeyHex,
      location: pickup,
    });
  };

  const handleCancel = async () => {
    if (!identity) return;
    await cancelRide(activeTask.id, {
      cancelledBy: identity.pubKeyHex,
      reason: 'Rider cancelled',
    });
    navigate('/ride');
  };

  const centre = driverLocation || pickup;
  const providerLabel = profile?.roles.provider || 'Driver';

  return (
    <div className="h-full flex flex-col">
      {/* Map */}
      <div className="flex-1 relative">
        <MapView centre={centre} zoom={15}>
          <LocationMarker position={pickup} label="Pickup" colour="green" />
          {dropoff && <LocationMarker position={dropoff} label="Dropoff" colour="red" />}
          {driverLocation && (
            <LocationMarker position={driverLocation} label={providerLabel} colour="blue" />
          )}
          {activeTask.routeGeometry && (
            <RoutePolyline geometry={activeTask.routeGeometry} />
          )}
        </MapView>

        {/* Connection indicator */}
        <div className={`absolute top-3 right-3 z-10 w-3 h-3 rounded-full ${
          connected ? 'bg-donkey-green' : 'bg-donkey-red animate-pulse'
        }`} title={connected ? 'Connected' : 'Reconnecting...'} />
      </div>

      {/* Status panel */}
      <div className="bg-donkey-surface border-t border-donkey-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <StatusBadge status={activeTask.status} />
          <DualPrice sats={activeTask.fareEstimateSats} size="sm" />
        </div>

        {activeTask.providerNpub && (
          <p className="text-xs font-mono text-donkey-muted">
            {providerLabel}: {activeTask.providerNpub.slice(0, 16)}...
          </p>
        )}

        {/* Streaming payment progress */}
        {activeTask.streamingPayment && (
          <div className="bg-donkey-bg rounded-lg p-3">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-donkey-muted">Streaming payment</span>
              <span className="text-donkey-green font-bold">
                {activeTask.streamingPayment.totalPaidSats} sats
              </span>
            </div>
            <div className="h-1 bg-donkey-border rounded-full overflow-hidden">
              <div
                className="h-full bg-donkey-green transition-all"
                style={{
                  width: `${Math.min(
                    (activeTask.streamingPayment.totalPaidSats / activeTask.fareEstimateSats) * 100,
                    100,
                  )}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {activeTask.status === 'requested' && (
            <button className="btn-secondary flex-1 text-sm" onClick={handleCancel}>
              Cancel
            </button>
          )}
          {profile?.features.safetyAlerts && (
            <div className="flex-1">
              <PanicButton onPanic={handlePanic} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
