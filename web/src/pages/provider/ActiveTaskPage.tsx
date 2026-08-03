import { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView } from '../../components/map/MapView';
import { LocationMarker } from '../../components/map/LocationMarker';
import { RoutePolyline } from '../../components/map/RoutePolyline';
import { StatusBadge } from '../../components/common/StatusBadge';
import { DualPrice } from '../../components/common/DualPrice';
import { PersonCard } from '../../components/common/PersonCard';
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
  submitSignatureProof, submitQuote, cancelTask, reportNoShow, reportLateCancel,
} from '../../services/api';
import { PhotoProof } from '../../components/task/PhotoProof';
import { SignatureCapture } from '../../components/task/SignatureCapture';
import { QuotePanel } from '../../components/task/QuotePanel';
import { ChatPanel } from '../../components/task/ChatPanel';
import { TripAudioRecorder } from '../../components/safety/TripAudioRecorder';
import { TripSharePanel } from '../../components/safety/TripSharePanel';
import { sendAllClear, sendGuardianAlert } from '../../services/trip-share';
import { PickupCode } from '../../components/task/PickupCode';
import { WaitingTimer } from '../../components/task/WaitingTimer';
import { formatScheduledTime, isUpcoming } from '../../utils/datetime';
import { CancelledScreen } from '../../components/task/CancelledScreen';
import { Sheet, SheetSection } from '../../components/layout/Sheet';
import { useT } from '../../i18n';
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
  const { t } = useT();
  const { location } = useLocation(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [reportRequesterNoShow, setReportRequesterNoShow] = useState(false);
  const [declaredRail, setDeclaredRail] = useState<string | null>(null);
  // The requester cancelled — its own screen, with the option to record it
  const [cancelledOn, setCancelledOn] = useState<{ late: boolean } | null>(null);

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
        // A driver who drove to a pickup deserves the same record the rider
        // gets when a driver drops them — same rail, same trust model
        setCancelledOn({ late: msg.lateCancellation === true });
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

  // The requester cancelled on a driver who had committed
  if (cancelledOn && activeTask && identity) {
    return (
      <CancelledScreen
        byLabel={requesterLabel.toLowerCase()}
        taskNoun={taskNoun}
        late={cancelledOn.late && Boolean(activeTask.requesterPubkey)}
        onReport={async () => {
          if (!activeTask.requesterPubkey) return;
          await reportLateCancel(activeTask.id, {
            targetPubkey: activeTask.requesterPubkey,
            reporterRole: 'provider',
            domainId: profile?.id,
          });
        }}
        onDone={() => { reset(); navigate('/provide'); }}
      />
    );
  }

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
    // Anyone this job was shared with hears that it ended safely —
    // fire-and-forget so finishing never waits on relays
    void sendAllClear(identity.privKeyHex, updated.id, taskNoun).catch(() => {});
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
    // The driver's own trusted contacts hear it directly, E2E encrypted —
    // the operator carries the alert, not the message
    void sendGuardianAlert(identity.privKeyHex, activeTask, location, 'provider').catch(() => {});
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

      {/* Sheet: the current step and the person stay visible; detail,
          safety and payment sit one tap away. Thirteen stacked panels left
          no map on a phone and buried the action button below the fold. */}
      <Sheet>
        <div className="flex items-center justify-between">
          <StatusBadge status={status} role="provider" />
          <DualPrice sats={activeTask.fareEstimateSats} size="sm" />
        </div>

        {/* Who you are collecting. The driver is meeting a stranger too —
            this screen used to name them nowhere at all. */}
        {!isTerminal && activeTask.requesterPubkey && (
          <div className="meta-card">
            <PersonCard
              subject={activeTask.requesterPubkey}
              roleLabel={requesterLabel}
              size="sm"
            />
          </div>
        )}

        {/* Pre-booked job — no need to head out yet */}
        {!isTerminal && isUpcoming(activeTask.scheduledFor) && !activeTask.startedAt && (
          <div className="meta-card border border-donkey-blue/40">
            <p className="meta-label">{t('active.bookedFor')}</p>
            <p className="text-sm font-bold text-donkey-text mt-1">
              {formatScheduledTime(activeTask.scheduledFor)}
            </p>
            <p className="text-xs text-donkey-muted mt-1">
              {t('pactive.committed', { noun: taskNoun })}
            </p>
          </div>
        )}

        {/* The meeting instructions a dropped pin cannot say. Never behind a
            tap while heading there — it is the reason the driver finds them. */}
        {activeTask.pickupNote && !activeTask.startedAt && (
          <div className="meta-card border border-donkey-orange/40">
            <p className="meta-label">{t('pactive.noteFrom', { label: requesterLabel.toLowerCase() })}</p>
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

        {/* Waiting time — a running meter belongs in front of both parties */}
        <WaitingTimer task={activeTask} role="provider" />

        {/* The step itself. Primary and first, not below ten panels. */}
        {buttons.length > 0 && !showCancelConfirm && (
          <div className="flex gap-3">
            {buttons.map(({ label, handler, stateKey }) => (
              <button
                key={stateKey}
                className="btn-primary flex-1"
                onClick={handler}
                disabled={busyAction !== null}
              >
                {busyAction !== null ? t('pactive.working') : label}
              </button>
            ))}
          </div>
        )}

        {/* Navigation hand-off — drivers trust their own nav app */}
        {(() => {
          const navTarget = status === profile?.states.values.ACTIVE
            ? activeTask.dropoff
            : activeTask.pickup;
          if (!navTarget || isTerminal) return null;
          return (
            <div className="flex gap-3">
              <a
                className="btn-secondary flex-1 text-center"
                href={`https://waze.com/ul?ll=${navTarget.lat},${navTarget.lng}&navigate=yes`}
                target="_blank" rel="noreferrer"
              >
                {t('pactive.waze')}
              </a>
              <a
                className="btn-secondary flex-1 text-center"
                href={`https://www.google.com/maps/dir/?api=1&destination=${navTarget.lat},${navTarget.lng}`}
                target="_blank" rel="noreferrer"
              >
                {t('pactive.googleMaps')}
              </a>
            </div>
          );
        })()}

        {/* Quote negotiation — an action the job is waiting on */}
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

        {/* The rider says they have paid — confirm it */}
        <ConfirmReceipt
          task={activeTask}
          settlement={activeTask.settlement}
          declaredRail={declaredRail}
        />

        {/* ── Everything below is one tap away ───────────────────────── */}

        {/* Meeting the right rider */}
        {!isTerminal && activeTask.requesterPubkey && !activeTask.startedAt
          && status !== profile?.states.values.ACTIVE && (
          <SheetSection
            title={t('sheet.meeting')}
            icon="📍"
            defaultOpen
            rememberAs="driver-meeting"
          >
            <PickupCode
              taskId={activeTask.id}
              counterpartyPubkey={activeTask.requesterPubkey}
              role="provider"
              counterpartyLabel={profile?.roles.requester || 'Requester'}
            />
          </SheetSection>
        )}

        {/* E2E encrypted chat with the requester */}
        {!isTerminal && activeTask.requesterPubkey && (
          <SheetSection
            title={t('sheet.message', { label: requesterLabel })}
            icon="💬"
            rememberAs="driver-chat"
          >
            <ChatPanel
              taskId={activeTask.id}
              selfPubkey={identity.pubKeyHex}
              counterpartyPubkey={activeTask.requesterPubkey}
              counterpartyLabel={profile?.roles.requester || 'Requester'}
            />
          </SheetSection>
        )}

        {/* Stops and job detail */}
        {(activeTask.stops || []).length > 0 && (
          <SheetSection title={t('sheet.jobDetail')} icon="🗺️" rememberAs="driver-detail">
            <div>
              <p className="meta-label">{t('pactive.stops')}</p>
              {activeTask.stops!.map((stop, i) => (
                <p key={`${stop.lat},${stop.lng},${i}`} className="text-sm text-donkey-text mt-1">
                  <span className="text-donkey-blue font-black">{i + 1}.</span>{' '}
                  {stop.address || `${stop.lat.toFixed(4)}, ${stop.lng.toFixed(4)}`}
                </p>
              ))}
            </div>
          </SheetSection>
        )}

        {/* Proof of completion, where the domain asks for it */}
        {((profile?.features.photos && (
          status === profile?.states.values.PROVIDER_ARRIVED ||
          status === profile?.states.values.COLLECTED ||
          status === profile?.states.values.ARRIVED_AT_DELIVERY
        )) || (profile?.features.signatures
          && status === profile?.states.values.ARRIVED_AT_DELIVERY)) && (
          <SheetSection title={t('sheet.proof')} icon="📷" defaultOpen rememberAs="driver-proof">
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
            {profile?.features.signatures
              && status === profile?.states.values.ARRIVED_AT_DELIVERY && (
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
          </SheetSection>
        )}

        {/* Safety — a driver alone with a stranger is exposed too */}
        {!isTerminal && (
          <SheetSection title={t('sheet.safety')} icon="🛡️" rememberAs="driver-safety">
            <TripSharePanel
              task={activeTask}
              privKeyHex={identity.privKeyHex}
              taskNoun={taskNoun}
              role="provider"
            />
            {activeTask.requesterPubkey && (
              <TripAudioRecorder
                taskId={activeTask.id}
                counterpartyPubkey={activeTask.requesterPubkey}
              />
            )}
          </SheetSection>
        )}

        {/* How you get paid */}
        {!isTerminal && (
          <SheetSection title={t('sheet.payment')} icon="💷" rememberAs="driver-payment">
            <PaymentMethodsEditor rideId={activeTask.id} />
            <TaskStakePanel task={activeTask} role="provider" />
          </SheetSection>
        )}

        {/* Actions */}
        <div className="pt-1 space-y-2">
          {profile?.features.safetyAlerts && !showCancelConfirm && (
            <PanicButton onPanic={handlePanic} />
          )}

          {!isTerminal && !showCancelConfirm && (
            <button
              className="btn-secondary w-full"
              onClick={() => setShowCancelConfirm(true)}
              disabled={busyAction !== null}
            >
              {t('pactive.cancelJob')}
            </button>
          )}

          {!isTerminal && showCancelConfirm && (
            <div className="rounded-lg border border-donkey-red/40 p-3 space-y-3">
              <p className="text-sm font-bold text-donkey-text">{t('pactive.cancelConfirm')}</p>
              <p className="text-xs text-donkey-muted">
                {t('pactive.cancelNote', { label: requesterLabel.toLowerCase() })}
              </p>
              {!activeTask.startedAt && (
                <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-donkey-orange"
                    checked={reportRequesterNoShow}
                    onChange={(e) => setReportRequesterNoShow(e.target.checked)}
                  />
                  <span className="text-xs text-donkey-text">
                    {t('active.reportNoShow', { label: requesterLabel.toLowerCase() })}
                  </span>
                </label>
              )}
              <div className="flex gap-3">
                <button
                  className="btn-secondary flex-1"
                  onClick={() => setShowCancelConfirm(false)}
                  disabled={busyAction !== null}
                >
                  {t('pactive.keepJob')}
                </button>
                <button
                  className="btn-danger flex-1"
                  onClick={handleCancel}
                  disabled={busyAction !== null}
                >
                  {busyAction === 'cancel' ? t('active.cancelling') : t('active.confirmCancel')}
                </button>
              </div>
            </div>
          )}

          {actionError && <p className="text-donkey-red text-sm">{actionError}</p>}
        </div>
      </Sheet>
    </div>
  );
}
