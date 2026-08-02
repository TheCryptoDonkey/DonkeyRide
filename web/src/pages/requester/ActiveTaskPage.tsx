import { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView } from '../../components/map/MapView';
import { LocationMarker } from '../../components/map/LocationMarker';
import { RoutePolyline } from '../../components/map/RoutePolyline';
import { StatusBadge } from '../../components/common/StatusBadge';
import { DualPrice } from '../../components/common/DualPrice';
import { PanicButton } from '../../components/safety/PanicButton';
import { Loading } from '../../components/common/Loading';
import { TaskStakePanel } from '../../components/payment/TaskStakePanel';
import { PayDriver } from '../../components/payment/PayDriver';
import { showToast } from '../../components/common/Toast';
import { useTask } from '../../context/TaskContext';
import { useIdentity } from '../../context/IdentityContext';
import { useDomain } from '../../context/DomainContext';
import { useLocation } from '../../hooks/useLocation';
import { useWebSocket } from '../../hooks/useWebSocket';
import {
  triggerPanic, cancelTask, getTask, acceptQuote, declineQuote,
  getOperatorInfoCached,
} from '../../services/api';
import { QuotePanel } from '../../components/task/QuotePanel';
import type { WsMessage, Task, OperatorPaymentInfo } from '../../types/api';

export function ActiveTaskPage() {
  const navigate = useNavigate();
  const { activeTask, setActiveTask, origin, destination, providerLocation, setProviderLocation, reset } = useTask();
  const { identity } = useIdentity();
  const { profile } = useDomain();
  const { location: currentLocation } = useLocation(true);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [payment, setPayment] = useState<OperatorPaymentInfo | null>(null);

  const originLabel = profile?.labels?.originLabel || 'Pickup';
  const destinationLabel = profile?.labels?.destinationLabel || 'Dropoff';
  const taskNoun = profile?.labels?.taskNoun || 'task';
  const requiresDestination = profile?.features.requiresDestination !== false;
  const providerRoleLabel = profile?.roles.provider || 'Provider';

  const terminalStates = profile?.states.terminal || [];
  const cancelledValue = profile?.states.values.CANCELLED || 'cancelled';
  const activeValue = profile?.states.values.ACTIVE || 'active';

  // Redirect if no active task
  useEffect(() => {
    if (!activeTask) navigate('/request');
  }, [activeTask, navigate]);

  // Honest payment copy needs to know the rail
  useEffect(() => {
    getOperatorInfoCached()
      .then((info) => setPayment(info.payment || null))
      .catch(() => {});
  }, []);

  // Route a task that has reached a terminal state
  const routeTerminal = useCallback((task: Task) => {
    if (task.status === cancelledValue) {
      showToast(`${providerRoleLabel} cancelled the ${taskNoun}`, { type: 'error' });
      reset();
      navigate('/request');
    } else {
      // Completion page distinguishes completed from no_show
      navigate('/request/complete');
    }
  }, [cancelledValue, providerRoleLabel, taskNoun, reset, navigate]);

  // Re-fetch the task (used when a WS event signals a state change)
  const refreshTask = useCallback(async () => {
    if (!activeTask) return;
    try {
      const updated = await getTask(activeTask.id);
      setActiveTask(updated);
      if (terminalStates.includes(updated.status)) routeTerminal(updated);
    } catch {
      // Poll will catch up
    }
  }, [activeTask?.id, setActiveTask, terminalStates, routeTerminal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle WebSocket messages — state updates arrive live, not just via poll
  const handleWsMessage = useCallback((msg: WsMessage) => {
    switch (msg.type) {
      case 'location_update':
        if (profile?.features.liveTracking) {
          setProviderLocation(msg.location);
        }
        break;
      case 'status_change':
        if (activeTask) {
          const updated = { ...activeTask, status: msg.status };
          setActiveTask(updated);
          if (terminalStates.includes(msg.status)) routeTerminal(updated);
        }
        break;
      case 'task_matched':
      case 'provider_arrived':
      case 'task_started':
      case 'task_completed':
        void refreshTask();
        break;
      case 'settlement_declared':
        void refreshTask();
        break;
      case 'settlement_confirmed':
        showToast('Payment confirmed');
        void refreshTask();
        break;
      case 'task_cancelled':
        showToast(`${taskNoun} cancelled`, { type: 'error' });
        reset();
        navigate('/request');
        break;
    }
  }, [activeTask, setActiveTask, setProviderLocation, navigate, profile, terminalStates, routeTerminal, refreshTask, reset, taskNoun]);

  const { connected } = useWebSocket(activeTask?.id || null, handleWsMessage);

  // Poll for updates as fallback
  useEffect(() => {
    if (!activeTask) return;
    const timer = setInterval(async () => {
      try {
        const updated = await getTask(activeTask.id);
        setActiveTask(updated);
        if (terminalStates.includes(updated.status)) routeTerminal(updated);
      } catch {
        // Ignore poll errors
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [activeTask?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!activeTask || !origin) return <Loading message={`Loading ${taskNoun}...`} />;

  const handlePanic = async () => {
    if (!identity) throw new Error('No identity');
    await triggerPanic(activeTask.id, {
      role: 'requester',
      location: currentLocation,
    });
  };

  const handleCancel = async () => {
    if (!identity || cancelling) return;
    setCancelling(true);
    setActionError(null);
    try {
      await cancelTask(activeTask.id, {
        cancelledBy: identity.pubKeyHex,
        reason: 'Requester cancelled',
      });
      reset();
      navigate('/request');
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to cancel ${taskNoun}`;
      setActionError(message);
      showToast(message, { type: 'error' });
    } finally {
      setCancelling(false);
    }
  };

  // Cancel is available in every non-terminal state before the active phase
  const canCancel = !terminalStates.includes(activeTask.status)
    && activeTask.status !== activeValue
    && !activeTask.startedAt;

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

        {/* Honest payment copy per rail */}
        {payment?.provider === 'cash' && (
          <div className="meta-card">
            <p className="meta-label">Payment</p>
            <p className="text-sm text-donkey-text mt-1">
              Pay your {providerRoleLabel.toLowerCase()} directly. Agreed amount:{' '}
              <DualPrice sats={activeTask.fareEstimateSats} size="sm" />
            </p>
          </div>
        )}
        {payment?.provider === 'demo' && (
          <div className="meta-card">
            <p className="meta-label">Payment</p>
            <p className="text-sm text-donkey-text mt-1">Demo mode: no real payment moves.</p>
          </div>
        )}

        {/* Stake — only on rails that support custody (never cash) */}
        <TaskStakePanel task={activeTask} role="requester" />

        {/* Pay the driver directly — once the job is under way */}
        {activeTask.status === activeValue && (
          <PayDriver task={activeTask} settlement={activeTask.settlement} />
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
          {canCancel && !showCancelConfirm && (
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
                disabled={cancelling}
              >
                Keep
              </button>
              <button
                className="btn-danger flex-1"
                onClick={handleCancel}
                disabled={cancelling}
              >
                {cancelling ? 'Cancelling...' : 'Confirm Cancel'}
              </button>
            </>
          )}
          {profile?.features.safetyAlerts && !showCancelConfirm && (
            <div className="flex-1">
              <PanicButton onPanic={handlePanic} />
            </div>
          )}
        </div>

        {actionError && <p className="text-donkey-red text-sm">{actionError}</p>}
      </div>
    </div>
  );
}
