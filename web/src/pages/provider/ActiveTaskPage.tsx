import { useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView } from '../../components/map/MapView';
import { LocationMarker } from '../../components/map/LocationMarker';
import { RoutePolyline } from '../../components/map/RoutePolyline';
import { StatusBadge } from '../../components/common/StatusBadge';
import { DualPrice } from '../../components/common/DualPrice';
import { PanicButton } from '../../components/safety/PanicButton';
import { useTask } from '../../context/TaskContext';
import { useIdentity } from '../../context/IdentityContext';
import { useDomain } from '../../context/DomainContext';
import { useLocation } from '../../hooks/useLocation';
import { useWebSocket } from '../../hooks/useWebSocket';
import {
  arriveAtPickup, startTrip, completeTrip,
  updateLocation, triggerPanic, getRide,
} from '../../services/api';
import type { WsMessage } from '../../types/api';

export function ActiveTaskPage() {
  const navigate = useNavigate();
  const { activeTask, setActiveTask } = useTask();
  const { identity } = useIdentity();
  const { profile } = useDomain();
  const { location } = useLocation();
  const locationTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!activeTask) navigate('/drive');
  }, [activeTask, navigate]);

  // Send location updates every 3 seconds
  useEffect(() => {
    if (!activeTask || !identity) return;
    locationTimer.current = setInterval(async () => {
      try {
        await updateLocation(activeTask.id, {
          lat: location.lat,
          lng: location.lng,
          driverPubkey: identity.pubKeyHex,
        });
      } catch {
        // Ignore
      }
    }, 3000);
    return () => {
      if (locationTimer.current) clearInterval(locationTimer.current);
    };
  }, [activeTask?.id, identity, location.lat, location.lng]);

  // Handle WebSocket messages
  const handleWsMessage = useCallback((msg: WsMessage) => {
    if (msg.type === 'status_change' && activeTask) {
      setActiveTask({ ...activeTask, status: msg.data.status });
    }
    if (msg.type === 'ride_cancelled') {
      navigate('/drive');
    }
  }, [activeTask, setActiveTask, navigate]);

  const { connected } = useWebSocket(activeTask?.id || null, handleWsMessage);

  // Poll for updates
  useEffect(() => {
    if (!activeTask) return;
    const timer = setInterval(async () => {
      try {
        const updated = await getRide(activeTask.id);
        setActiveTask(updated);
      } catch {
        // Ignore
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [activeTask?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!activeTask || !identity) return null;

  const handleArrive = async () => {
    const updated = await arriveAtPickup(activeTask.id, {
      driverPubkey: identity.pubKeyHex,
    });
    setActiveTask(updated);
  };

  const handleStart = async () => {
    const updated = await startTrip(activeTask.id, {
      driverPubkey: identity.pubKeyHex,
    });
    setActiveTask(updated);
  };

  const handleComplete = async () => {
    const updated = await completeTrip(activeTask.id, {
      driverPubkey: identity.pubKeyHex,
    });
    setActiveTask(updated);
    navigate('/drive');
  };

  const handlePanic = async () => {
    await triggerPanic(activeTask.id, {
      triggeredBy: identity.pubKeyHex,
      location,
    });
  };

  const status = activeTask.status;
  const requesterLabel = profile?.roles.requester || 'Rider';

  return (
    <div className="h-full flex flex-col">
      {/* Map */}
      <div className="flex-1 relative">
        <MapView centre={location} zoom={15}>
          <LocationMarker position={location} label="You" colour="blue" />
          <LocationMarker position={activeTask.pickup} label="Pickup" colour="green" />
          <LocationMarker position={activeTask.dropoff} label="Dropoff" colour="red" />
          {activeTask.routeGeometry && (
            <RoutePolyline geometry={activeTask.routeGeometry} colour="#4fc3f7" />
          )}
        </MapView>

        {/* Connection indicator */}
        <div className={`absolute top-3 right-3 z-10 w-3 h-3 rounded-full ${
          connected ? 'bg-donkey-green' : 'bg-donkey-red animate-pulse'
        }`} />
      </div>

      {/* Control panel */}
      <div className="bg-donkey-surface border-t border-donkey-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <StatusBadge status={status} />
          <DualPrice sats={activeTask.fareEstimateSats} size="sm" />
        </div>

        {/* Streaming payment progress */}
        {activeTask.streamingPayment && (
          <div className="bg-donkey-bg rounded-lg p-3">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-donkey-muted">Earning</span>
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

        {/* Status-dependent action buttons */}
        <div className="flex gap-3">
          {(status === 'matched' || status === 'en_route') && (
            <button className="btn-primary flex-1" onClick={handleArrive}>
              Arrived at Pickup
            </button>
          )}
          {status === 'arrived' && (
            <button className="btn-primary flex-1" onClick={handleStart}>
              Start {requesterLabel} Trip
            </button>
          )}
          {status === 'active' && (
            <button className="btn-primary flex-1" onClick={handleComplete}>
              Complete Trip
            </button>
          )}
        </div>

        {profile?.features.safetyAlerts && (
          <PanicButton onPanic={handlePanic} />
        )}
      </div>
    </div>
  );
}
