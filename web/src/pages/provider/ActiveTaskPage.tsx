import { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView } from '../../components/map/MapView';
import { LocationMarker } from '../../components/map/LocationMarker';
import { RoutePolyline } from '../../components/map/RoutePolyline';
import { StatusBadge } from '../../components/common/StatusBadge';
import { DualPrice } from '../../components/common/DualPrice';
import { PanicButton } from '../../components/safety/PanicButton';
import { TaskStakePanel } from '../../components/payment/TaskStakePanel';
import { PaymentMethodsEditor } from '../../components/payment/PaymentMethodsEditor';
import { ConfirmReceipt } from '../../components/payment/ConfirmReceipt';
import { showToast } from '../../components/common/Toast';
import { useTask } from '../../context/TaskContext';
import { useIdentity } from '../../context/IdentityContext';
import { useDomain } from '../../context/DomainContext';
import { useLocation } from '../../hooks/useLocation';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useLiveTracking } from '../../modules/pii';
import {
  arriveAtOrigin, startTask, completeTask, transitionTask,
  triggerPanic, getTask, submitProof,
  submitSignatureProof, submitQuote, cancelTask, reportNoShow,
} from '../../services/api';
import { PhotoProof } from '../../components/task/PhotoProof';
import { SignatureCapture } from '../../components/task/SignatureCapture';
import { QuotePanel } from '../../components/task/QuotePanel';
import { ChatPanel } from '../../components/task/ChatPanel';
import { TripAudioRecorder } from '../../components/safety/TripAudioRecorder';
import { PickupCode } from '../../components/task/PickupCode';
import { WaitingTimer } from '../../components/task/WaitingTimer';
import { formatScheduledTime, isUpcoming } from '../../utils/datetime';
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
  const { activeTask, setActiveTask, reset } = useTask();
  const { identity } = useIdentity();
  const { profile } = useDomain();
  const { location } = useLocation(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [reportRequesterNoShow, setReportRequesterNoShow] = useState(false);
  const [declaredRail, setDeclaredRail] = useState<string | null>(null);

  const originLabel = profile?.labels?.originLabel || 'Pickup';
  const destinationLabel = profile?.labels?.destinationLabel || 'Dropoff';
  const taskNoun = profile?.labels?.taskNoun || 'task';
  const requesterLabel = profile?.roles.requester || 'requester';
  const requiresDestination = profile?.features.requiresDestination !== false;
  const terminalStates = profile?.states.terminal || [];

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

  // Re-fetch the task when a WS event signals a state change
  const refreshTask = useCallback(async () => {
    if (!activeTask) return;
    try {
      const updated = await getTask(activeTask.id);
      setActiveTask(updated);
      if (terminalStates.includes(updated.status)) {
        navigate('/provide/complete');
      }
    } catch {
      // Poll will catch up
    }
  }, [activeTask?.id, setActiveTask, terminalStates, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle WebSocket messages — state updates arrive live, not just via poll
  const handleWsMessage = useCallback((msg: WsMessage) => {
    switch (msg.type) {
      case 'status_change':
        if (activeTask) {
          setActiveTask({ ...activeTask, status: msg.status });
          if (terminalStates.includes(msg.status)) navigate('/provide/complete');
        }
        break;
      case 'task_started':
      case 'task_completed':
        void refreshTask();
        break;
      case 'pickup_updated':
        // The rider walked. Loud, because the driver may already be
        // turning into the old street.
        showToast(
          msg.address
            ? `${originLabel} moved: ${msg.address}`
            : `${originLabel} moved${msg.movedMetres ? ` ${msg.movedMetres} m` : ''}`,
          { type: 'error' },
        );
        void refreshTask();
        break;
      case 'tip_sent':
        showToast('Tip received');
        break;
      case 'settlement_declared':
        setDeclaredRail(msg.rail || null);
        showToast('Rider says they have paid');
        void refreshTask();
        break;
      case 'settlement_confirmed':
        void refreshTask();
        break;
      case 'scheduled_reminder':
        showToast(`Upcoming ${taskNoun} — ${formatScheduledTime(msg.scheduledFor)}`);
        break;
      case 'task_cancelled':
        showToast(`${taskNoun} cancelled`, { type: 'error' });
        reset();
        navigate('/provide');
        break;
    }
  }, [activeTask, setActiveTask, navigate, terminalStates, refreshTask, reset, taskNoun, originLabel]);

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

  /** Run a lifecycle action with in-flight guard and inline error surface */
  const runAction = async (key: string, fn: () => Promise<void>) => {
    if (busyAction) return;
    setBusyAction(key);
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Action failed';
      setActionError(message);
      showToast(message, { type: 'error' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleArrive = () => runAction('arrive', async () => {
    const updated = await arriveAtOrigin(activeTask.id, {
      providerPubkey: identity.pubKeyHex,
    });
    setActiveTask(updated);
  });

  const handleStart = () => runAction('start', async () => {
    const updated = await startTask(activeTask.id, {
      providerPubkey: identity.pubKeyHex,
    });
    setActiveTask(updated);
  });

  const handleComplete = () => runAction('complete', async () => {
    const updated = await completeTask(activeTask.id, {
      providerPubkey: identity.pubKeyHex,
    });
    setActiveTask(updated);
    navigate('/provide/complete');
  });

  const handleTransition = (targetState: string) => runAction(targetState, async () => {
    const updated = await transitionTask(activeTask.id, {
      targetState,
      providerPubkey: identity.pubKeyHex,
    });
    setActiveTask(updated);
    // Navigate to completion if we've reached a terminal state
    if (terminalStates.includes(updated.status)) {
      navigate('/provide/complete');
    }
  });

  const handleCancel = () => runAction('cancel', async () => {
    const noShowTarget = reportRequesterNoShow ? activeTask.requesterPubkey : null;
    await cancelTask(activeTask.id, {
      cancelledBy: identity.pubKeyHex,
      reason: noShowTarget ? 'no_show' : 'Provider cancelled',
    });
    // Signed by the driver, published to public relays. Fire-and-forget:
    // cancelling the job never blocks on relay reachability.
    if (noShowTarget) {
      void reportNoShow(activeTask.id, {
        targetPubkey: noShowTarget,
        reporterRole: 'provider',
        domainId: profile?.id,
      }).catch(() => {});
      showToast('No-show reported');
    }
    reset();
    navigate('/provide');
  });

  const handlePanic = async () => {
    await triggerPanic(activeTask.id, {
      role: 'provider',
      location,
    });
  };

  const status = activeTask.status;
  const isTerminal = terminalStates.includes(status);

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
      let handler: () => void;
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
            {(activeTask.stops || []).map((stop, i) => (
              <LocationMarker
                key={`${stop.lat},${stop.lng},${i}`}
                position={stop}
                label={`Stop ${i + 1}`}
                colour="blue"
              />
            ))}
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

        {/* Pre-booked job — no need to head out yet */}
        {!isTerminal && isUpcoming(activeTask.scheduledFor) && !activeTask.startedAt && (
          <div className="meta-card border border-donkey-blue/40">
            <p className="meta-label">Booked for</p>
            <p className="text-sm font-bold text-donkey-text mt-1">
              {formatScheduledTime(activeTask.scheduledFor)}
            </p>
            <p className="text-xs text-donkey-muted mt-1">
              You've committed to this {taskNoun} — you'll get a reminder as the
              time approaches.
            </p>
          </div>
        )}

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

        {/* Waiting time, visible to both sides as it runs */}
        <WaitingTimer task={activeTask} role="provider" />

        {/* What the pin cannot say — the requester's meeting instructions */}
        {activeTask.pickupNote && !activeTask.startedAt && (
          <div className="meta-card border border-donkey-orange/40">
            <p className="meta-label">Note from the {requesterLabel.toLowerCase()}</p>
            <p className="text-sm text-donkey-text mt-1">{activeTask.pickupNote}</p>
          </div>
        )}

        {/* Where exactly to pull in */}
        {activeTask.pickupAddress && !activeTask.startedAt && (
          <div className="meta-card">
            <p className="meta-label">{originLabel}</p>
            <p className="text-sm text-donkey-text mt-1">{activeTask.pickupAddress}</p>
          </div>
        )}

        {/* Stops to visit, in order */}
        {(activeTask.stops || []).length > 0 && (
          <div className="meta-card">
            <p className="meta-label">Stops on the way</p>
            {activeTask.stops!.map((stop, i) => (
              <p key={`${stop.lat},${stop.lng},${i}`} className="text-sm text-donkey-text mt-1">
                <span className="text-donkey-blue font-black">{i + 1}.</span>{' '}
                {stop.address || `${stop.lat.toFixed(4)}, ${stop.lng.toFixed(4)}`}
              </p>
            ))}
          </div>
        )}

        {/* Stake — only on rails that support custody (never cash) */}
        <TaskStakePanel task={activeTask} role="provider" />

        {/* Right rider, right car — until the trip starts */}
        {!isTerminal && activeTask.requesterPubkey && !activeTask.startedAt
          && status !== profile?.states.values.ACTIVE && (
          <PickupCode
            taskId={activeTask.id}
            counterpartyPubkey={activeTask.requesterPubkey}
            role="provider"
            counterpartyLabel={profile?.roles.requester || 'Requester'}
          />
        )}

        {/* E2E encrypted chat with the requester */}
        {!isTerminal && activeTask.requesterPubkey && (
          <ChatPanel
            taskId={activeTask.id}
            selfPubkey={identity.pubKeyHex}
            counterpartyPubkey={activeTask.requesterPubkey}
            counterpartyLabel={profile?.roles.requester || 'Requester'}
          />
        )}

        {/* Opt-in audio recording — device-local, counterparty notified */}
        {activeTask.requesterPubkey && !isTerminal && (
          <TripAudioRecorder
            taskId={activeTask.id}
            counterpartyPubkey={activeTask.requesterPubkey}
          />
        )}

        {/* Non-custodial settlement: confirm the rider's direct payment */}
        <ConfirmReceipt
          task={activeTask}
          settlement={activeTask.settlement}
          declaredRail={declaredRail}
        />

        {/* Accepted payment methods for this job (rider pays the driver direct) */}
        {!isTerminal && (
          <PaymentMethodsEditor rideId={activeTask.id} />
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
        {buttons.length > 0 && !showCancelConfirm && (
          <div className="flex gap-3">
            {buttons.map(({ label, handler, stateKey }) => (
              <button
                key={stateKey}
                className="btn-primary flex-1"
                onClick={handler}
                disabled={busyAction !== null}
              >
                {busyAction !== null ? 'Working...' : label}
              </button>
            ))}
          </div>
        )}

        {/* Cancel job — with confirm step */}
        {!isTerminal && (
          <div className="flex gap-3">
            {!showCancelConfirm ? (
              <button
                className="btn-secondary flex-1"
                onClick={() => setShowCancelConfirm(true)}
                disabled={busyAction !== null}
              >
                Cancel job
              </button>
            ) : (
              <>
                {!activeTask.startedAt && (
                  <label className="w-full flex items-center gap-2 mb-2 cursor-pointer basis-full">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-donkey-orange"
                      checked={reportRequesterNoShow}
                      onChange={(e) => setReportRequesterNoShow(e.target.checked)}
                    />
                    <span className="text-xs text-donkey-text">
                      The {requesterLabel.toLowerCase()} didn't show up — report it
                    </span>
                  </label>
                )}
                <button
                  className="btn-secondary flex-1"
                  onClick={() => setShowCancelConfirm(false)}
                  disabled={busyAction !== null}
                >
                  Keep job
                </button>
                <button
                  className="btn-danger flex-1"
                  onClick={handleCancel}
                  disabled={busyAction !== null}
                >
                  {busyAction === 'cancel' ? 'Cancelling...' : 'Confirm cancel'}
                </button>
              </>
            )}
          </div>
        )}

        {actionError && <p className="text-donkey-red text-sm">{actionError}</p>}

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
