import { useEffect, useCallback } from 'react';
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
import { useLiveTracking } from '../../modules/pii';
import {
  arriveAtOrigin, startTask, completeTask, transitionTask,
  triggerPanic, getTask, submitProof,
  submitSignatureProof, submitQuote,
} from '../../services/api';
import { PhotoProof } from '../../components/task/PhotoProof';
import { SignatureCapture } from '../../components/task/SignatureCapture';
import { QuotePanel } from '../../components/task/QuotePanel';
import type { WsMessage } from '../../types/api';

/** Map known state keys to existing API endpoints */
const KNOWN_ENDPOINTS: Record<string, string> = {
  PROVIDER_ARRIVED: 'arrive',
  ACTIVE: 'start',
  COMPLETED: 'complete',
};

/** Labels for state keys that don't have obvious display names */
const STATE_KEY_LABELS: Record<string, string> = {
  PROVIDER_ARRIVED: 'Mark Arrived',
  ACTIVE: 'Start',
  COMPLETED: 'Complete',
  METHOD_CONFIRMED: 'Confirm Method',
  COLLECTED: 'Mark Collected',
  ARRIVED_AT_DELIVERY: 'Arrived at Delivery',
};

export function ActiveTaskPage() {
  const navigate = useNavigate();
  const { activeTask, setActiveTask } = useTask();
  const { identity } = useIdentity();
  const { profile } = useDomain();
  const { location } = useLocation(true);

  const originLabel = profile?.labels?.originLabel || 'Pickup';
  const destinationLabel = profile?.labels?.destinationLabel || 'Dropoff';
  const taskNoun = profile?.labels?.taskNoun || 'task';
  const requiresDestination = profile?.features.requiresDestination !== false;

  useEffect(() => {
    if (!activeTask) navigate('/provide');
  }, [activeTask, navigate]);

  // Send location updates via PII module (only when liveTracking is enabled)
  useLiveTracking({
    taskId: activeTask?.id || null,
    providerPubkey: identity?.pubKeyHex || null,
    lat: location.lat,
    lng: location.lng,
    enabled: !!(profile?.features.liveTracking && activeTask && identity),
  });

  // Handle WebSocket messages
  const handleWsMessage = useCallback((msg: WsMessage) => {
    if (msg.type === 'status_change' && activeTask) {
      setActiveTask({ ...activeTask, status: msg.data.status });
    }
    if (msg.type === 'ride_cancelled' || msg.type === 'task_cancelled') {
      navigate('/provide');
    }
  }, [activeTask, setActiveTask, navigate]);

  const { connected } = useWebSocket(activeTask?.id || null, handleWsMessage);

  // Poll for updates
  useEffect(() => {
    if (!activeTask) return;
    const timer = setInterval(async () => {
      try {
        const updated = await getTask(activeTask.id);
        setActiveTask(updated);
      } catch {
        // Ignore
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [activeTask?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!activeTask || !identity) return null;

  const handleArrive = async () => {
    const updated = await arriveAtOrigin(activeTask.id, {
      providerPubkey: identity.pubKeyHex,
    });
    setActiveTask(updated);
  };

  const handleStart = async () => {
    const updated = await startTask(activeTask.id, {
      providerPubkey: identity.pubKeyHex,
    });
    setActiveTask(updated);
  };

  const handleComplete = async () => {
    const updated = await completeTask(activeTask.id, {
      providerPubkey: identity.pubKeyHex,
    });
    setActiveTask(updated);
    navigate('/provide/complete');
  };

  const handleTransition = async (targetState: string) => {
    const updated = await transitionTask(activeTask.id, {
      targetState,
      providerPubkey: identity.pubKeyHex,
    });
    setActiveTask(updated);
    // Navigate to completion if we've reached a terminal state
    const terminalStates = profile?.states.terminal || [];
    if (terminalStates.includes(updated.status)) {
      navigate('/provide/complete');
    }
  };

  const handlePanic = async () => {
    await triggerPanic(activeTask.id, {
      triggeredBy: identity.pubKeyHex,
      location,
    });
  };

  const status = activeTask.status;

  // Build dynamic action buttons from profile transitions
  const getActionButtons = () => {
    if (!profile?.states.transitions) return [];

    const validNextStates = profile.states.transitions[status] || [];
    // Filter out cancelled — that's handled separately
    const cancelledValue = profile.states.values.CANCELLED;
    const filtered = validNextStates.filter((s: string) => s !== cancelledValue);

    return filtered.map((nextStateValue: string) => {
      // Find the key for this state value
      const stateKey = Object.entries(profile.states.values)
        .find(([, v]) => v === nextStateValue)?.[0] || '';

      const label = STATE_KEY_LABELS[stateKey]
        || nextStateValue.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

      // Decide which handler to use
      const endpoint = KNOWN_ENDPOINTS[stateKey];
      let handler: () => Promise<void>;
      if (endpoint === 'arrive') handler = handleArrive;
      else if (endpoint === 'start') handler = handleStart;
      else if (endpoint === 'complete') handler = handleComplete;
      else handler = () => handleTransition(nextStateValue);

      return { label, handler, stateKey };
    });
  };

  const buttons = getActionButtons();

  return (
    <div className="h-full flex flex-col">
      {/* Map */}
      {profile?.features.navigation !== false ? (
        <div className="flex-1 relative">
          <MapView centre={location} zoom={15}>
            <LocationMarker position={location} label="You" colour="blue" />
            <LocationMarker position={activeTask.pickup} label={originLabel} colour="green" />
            {requiresDestination && activeTask.dropoff && (
              <LocationMarker position={activeTask.dropoff} label={destinationLabel} colour="red" />
            )}
            {activeTask.routeGeometry && (
              <RoutePolyline geometry={activeTask.routeGeometry} />
            )}
          </MapView>

          {/* Connection indicator */}
          <div className="absolute top-3 right-3 z-10">
            <div className={`status-dot-glow ${connected ? 'glow-green' : 'glow-orange'}`} />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-donkey-bg relative">
          <div className="card text-center max-w-sm">
            <p className="text-lg font-bold text-donkey-text">{taskNoun} active</p>
            <p className="text-sm text-donkey-muted mt-1">Use the controls below to manage the {taskNoun}</p>
          </div>
          <div className="absolute top-3 right-3 z-10">
            <div className={`status-dot-glow ${connected ? 'glow-green' : 'glow-orange'}`} />
          </div>
        </div>
      )}

      {/* Control panel */}
      <div className="bg-donkey-surface border-t-2 border-donkey-border p-5 space-y-3 shadow-panel">
        <div className="flex items-center justify-between">
          <StatusBadge status={status} />
          <DualPrice sats={activeTask.fareEstimateSats} size="sm" />
        </div>

        {/* Task info row */}
        {(activeTask.distanceKm || activeTask.durationMin) && (
          <div className="flex gap-4 text-xs text-donkey-muted">
            {activeTask.distanceKm != null && (
              <span>{activeTask.distanceKm.toFixed(1)} km</span>
            )}
            {activeTask.durationMin != null && (
              <span>~{Math.round(activeTask.durationMin)} min</span>
            )}
          </div>
        )}

        {/* Streaming payment progress */}
        {profile?.features.streaming && activeTask.streamingPayment && (
          <div className="earnings-card">
            <div className="flex justify-between text-xs mb-2">
              <span className="meta-label">Earning</span>
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

        {/* Quote negotiation — provider submits quote after arrival */}
        {profile?.features.quoteNegotiation &&
          status === profile?.states.values.PROVIDER_ARRIVED && (
          <QuotePanel
            mode="provider"
            taskId={activeTask.id}
            existingQuote={activeTask.quote}
            onSubmit={async (amountSats, description) => {
              await submitQuote(activeTask.id, {
                amountSats,
                description,
                providerPubkey: identity.pubKeyHex,
              });
              const updated = await getTask(activeTask.id);
              setActiveTask(updated);
            }}
          />
        )}

        {/* Photo proof — shown at states where proof is expected */}
        {profile?.features.photos && (
          status === profile?.states.values.PROVIDER_ARRIVED ||
          status === profile?.states.values.COLLECTED ||
          status === profile?.states.values.ARRIVED_AT_DELIVERY
        ) && (
          <PhotoProof
            taskId={activeTask.id}
            label={status === profile?.states.values.ARRIVED_AT_DELIVERY ? 'Delivery proof' : 'Collection proof'}
            onSubmit={async (file) => {
              await submitProof(activeTask.id, {
                type: 'photo',
                file,
                providerPubkey: identity.pubKeyHex,
              });
            }}
          />
        )}

        {/* Signature capture — typically at delivery completion */}
        {profile?.features.signatures && (
          status === profile?.states.values.ARRIVED_AT_DELIVERY
        ) && (
          <SignatureCapture
            label="Recipient signature"
            onSubmit={async (dataUrl) => {
              await submitSignatureProof(activeTask.id, {
                dataUrl,
                providerPubkey: identity.pubKeyHex,
              });
            }}
          />
        )}

        {/* Dynamic action buttons */}
        {buttons.length > 0 && (
          <div className="flex gap-3">
            {buttons.map(({ label, handler, stateKey }) => (
              <button key={stateKey} className="btn-primary flex-1" onClick={handler}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Hand off to the driver's preferred navigation app — drivers trust
            their own nav; never trap them in ours */}
        {(() => {
          const navTarget = status === profile?.states.values.ACTIVE
            ? activeTask.dropoff
            : activeTask.pickup;
          if (!navTarget) return null;
          return (
            <div className="flex gap-3">
              <a
                className="btn-secondary flex-1 text-center"
                href={`https://waze.com/ul?ll=${navTarget.lat},${navTarget.lng}&navigate=yes`}
                target="_blank" rel="noreferrer"
              >
                Navigate (Waze)
              </a>
              <a
                className="btn-secondary flex-1 text-center"
                href={`https://www.google.com/maps/dir/?api=1&destination=${navTarget.lat},${navTarget.lng}`}
                target="_blank" rel="noreferrer"
              >
                Google Maps
              </a>
            </div>
          );
        })()}

        {profile?.features.safetyAlerts && (
          <PanicButton onPanic={handlePanic} />
        )}
      </div>
    </div>
  );
}
