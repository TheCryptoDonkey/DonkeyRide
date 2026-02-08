import { useEffect, useCallback, useState } from 'react';
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
import { useLocation } from '../../hooks/useLocation';
import { useWebSocket } from '../../hooks/useWebSocket';
import { triggerPanic, cancelTask, getTask, acceptQuote, declineQuote } from '../../services/api';
import { QuotePanel } from '../../components/task/QuotePanel';
import type { WsMessage } from '../../types/api';

export function ActiveTaskPage() {
  const navigate = useNavigate();
  const { activeTask, setActiveTask, origin, destination, providerLocation, setProviderLocation } = useTask();
  const { identity } = useIdentity();
  const { profile } = useDomain();
  const { location: currentLocation } = useLocation(true);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const originLabel = profile?.labels?.originLabel || 'Pickup';
  const destinationLabel = profile?.labels?.destinationLabel || 'Dropoff';
  const taskNoun = profile?.labels?.taskNoun || 'task';
  const requiresDestination = profile?.features.requiresDestination !== false;
  const providerRoleLabel = profile?.roles.provider || 'Provider';

  // Redirect if no active task
  useEffect(() => {
    if (!activeTask) navigate('/request');
  }, [activeTask, navigate]);

  // Handle WebSocket messages
  const handleWsMessage = useCallback((msg: WsMessage) => {
    switch (msg.type) {
      case 'location_update':
        if (profile?.features.liveTracking) {
          setProviderLocation({ lat: msg.data.lat, lng: msg.data.lng });
        }
        break;
      case 'status_change':
        if (activeTask) {
          setActiveTask({ ...activeTask, status: msg.data.status });
        }
        break;
      case 'ride_cancelled':
      case 'task_cancelled':
        navigate('/request');
        break;
    }
  }, [activeTask, setActiveTask, setProviderLocation, navigate]);

  const { connected } = useWebSocket(activeTask?.id || null, handleWsMessage);

  // Poll for updates as fallback
  useEffect(() => {
    if (!activeTask) return;
    const timer = setInterval(async () => {
      try {
        const updated = await getTask(activeTask.id);
        setActiveTask(updated);
        const terminalStates = profile?.states.terminal || [];
        const cancelledValue = profile?.states.values.CANCELLED || 'cancelled';
        if (terminalStates.includes(updated.status)) {
          if (updated.status !== cancelledValue) navigate('/request/complete');
          else navigate('/request');
        }
      } catch {
        // Ignore poll errors
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [activeTask?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!activeTask || !origin) return <Loading message={`Loading ${taskNoun}...`} />;

  const handlePanic = async () => {
    if (!identity) return;
    await triggerPanic(activeTask.id, {
      triggeredBy: identity.pubKeyHex,
      location: currentLocation,
    });
  };

  const handleCancel = async () => {
    if (!identity) return;
    await cancelTask(activeTask.id, {
      cancelledBy: identity.pubKeyHex,
      reason: 'Requester cancelled',
    });
    navigate('/request');
  };

  const centre = providerLocation || origin;

  return (
    <div className="h-full flex flex-col">
      {/* Map */}
      {profile?.features.navigation !== false ? (
        <div className="flex-1 relative">
          <MapView centre={centre} zoom={15}>
            <LocationMarker position={origin} label={originLabel} colour="green" />
            {requiresDestination && destination && (
              <LocationMarker position={destination} label={destinationLabel} colour="red" />
            )}
            {profile?.features.liveTracking && providerLocation && (
              <LocationMarker position={providerLocation} label={providerRoleLabel} colour="blue" />
            )}
            {activeTask.routeGeometry && (
              <RoutePolyline geometry={activeTask.routeGeometry} />
            )}
          </MapView>

          {/* Connection indicator */}
          <div className="absolute top-3 right-3 z-10">
            <div className={`status-dot-glow ${connected ? 'glow-green' : 'glow-orange'}`}
                 title={connected ? 'Connected' : 'Reconnecting...'} />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-donkey-bg">
          <div className="card text-center max-w-sm">
            <p className="text-lg font-bold text-donkey-text mb-2">{taskNoun} in progress</p>
            <p className="text-sm text-donkey-muted">
              Your {providerRoleLabel.toLowerCase()} is on the way
            </p>
            <div className="mt-3">
              <div className={`status-dot-glow inline-block ${connected ? 'glow-green' : 'glow-orange'}`}
                   title={connected ? 'Connected' : 'Reconnecting...'} />
            </div>
          </div>
        </div>
      )}

      {/* Status panel */}
      <div className="bg-donkey-surface border-t-2 border-donkey-border p-5 space-y-3 shadow-panel">
        <div className="flex items-center justify-between">
          <StatusBadge status={activeTask.status} />
          <DualPrice sats={activeTask.fareEstimateSats} size="sm" />
        </div>

        {/* Provider info */}
        {activeTask.providerNpub && (
          <div className="meta-card flex items-center justify-between">
            <div>
              <p className="meta-label">{providerRoleLabel}</p>
              <p className="text-sm font-mono text-donkey-text mt-1">
                {activeTask.providerNpub.slice(0, 16)}...
              </p>
            </div>
            {activeTask.durationMin != null && (
              <div className="text-right">
                <p className="meta-label">ETA</p>
                <p className="text-lg font-black text-donkey-green mt-1">
                  {Math.round(activeTask.durationMin)} min
                </p>
              </div>
            )}
          </div>
        )}

        {/* Streaming payment progress */}
        {profile?.features.streaming && activeTask.streamingPayment && (
          <div className="meta-card">
            <div className="flex justify-between text-xs mb-2">
              <span className="meta-label">Streaming payment</span>
              <span className="text-donkey-green font-bold text-sm">
                {activeTask.streamingPayment.totalPaidSats} sats
              </span>
            </div>
            <div className="h-2 bg-donkey-border rounded-full overflow-hidden">
              <div
                className="h-full bg-donkey-green transition-all rounded-full"
                style={{
                  width: `${Math.min(
                    (activeTask.streamingPayment.totalPaidSats / activeTask.fareEstimateSats) * 100,
                    100,
                  )}%`,
                  boxShadow: '0 0 8px rgba(var(--theme-accent-rgb), 0.5)',
                }}
              />
            </div>
          </div>
        )}

        {/* Quote review — requester sees when provider has submitted a quote */}
        {profile?.features.quoteNegotiation && activeTask.quote &&
          activeTask.quote.status === 'pending' && identity && (
          <QuotePanel
            mode="requester"
            taskId={activeTask.id}
            quote={activeTask.quote}
            onAccept={async () => {
              await acceptQuote(activeTask.id, {
                requesterPubkey: identity.pubKeyHex,
              });
              const updated = await getTask(activeTask.id);
              setActiveTask(updated);
            }}
            onDecline={async () => {
              await declineQuote(activeTask.id, {
                requesterPubkey: identity.pubKeyHex,
              });
              const updated = await getTask(activeTask.id);
              setActiveTask(updated);
            }}
          />
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {activeTask.status === profile?.states.initial && !showCancelConfirm && (
            <button
              className="btn-secondary flex-1"
              onClick={() => setShowCancelConfirm(true)}
            >
              Cancel {taskNoun}
            </button>
          )}
          {showCancelConfirm && (
            <>
              <button
                className="btn-secondary flex-1"
                onClick={() => setShowCancelConfirm(false)}
              >
                Keep
              </button>
              <button
                className="btn-danger flex-1"
                onClick={handleCancel}
              >
                Confirm Cancel
              </button>
            </>
          )}
          {profile?.features.safetyAlerts && !showCancelConfirm && (
            <div className="flex-1">
              <PanicButton onPanic={handlePanic} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
