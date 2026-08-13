import { useEffect, useCallback, useState, useRef } from 'react';
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
import { CancelReasonPicker } from '../../components/task/CancelReasonPicker';
import { Sheet, SheetSection } from '../../components/layout/Sheet';
import { dispatchService } from '../../services/dispatch';
import { getAgreedRate } from '../../utils/agreed-rate';
import { useT } from '../../i18n';
import type { WsMessage } from '../../types/api';
import {
  loadPrivateItinerary, mergePrivateItinerary, savePrivateItinerary,
  subscribePrivateItinerary,
} from '../../services/private-itinerary';

/** Map known state keys to existing API endpoints */
const KNOWN_ENDPOINTS: Record<string, string> = {
  PROVIDER_ARRIVED: 'arrive',
  ACTIVE: 'start',
  COMPLETED: 'complete',
};

/**
 * What to call the next step.
 *
 * This used to be a hardcoded English map with a titlecased enum as the
 * fallback, so a Swahili driver read "Mark Arrived" and any domain state
 * outside the map rendered as "Arrived At Delivery". Translation first,
 * then the DOMAIN PROFILE's own words (which is the whole point of having
 * profiles), and the prettified value only as a last resort.
 */
function actionLabel(
  stateKey: string,
  stateValue: string,
  profile: { labels?: { activeVerb?: string; completedLabel?: string } } | null | undefined,
  t: (key: string) => string,
): string {
  const key = `pactive.action.${stateKey}`;
  const translated = t(key);
  if (translated !== key) return translated;
  if (stateKey === 'ACTIVE' && profile?.labels?.activeVerb) return profile.labels.activeVerb;
  if (stateKey === 'COMPLETED' && profile?.labels?.completedLabel) return profile.labels.completedLabel;
  return stateValue.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
}

export function ActiveTaskPage() {
  const navigate = useNavigate();
  const { activeTask, setActiveTask, reset } = useTask();
  const { identity } = useIdentity();
  const { profile } = useDomain();
  const { t } = useT();
  const { location, hasFix } = useLocation(true);
  const loadedPrivateTaskRef = useRef<string | null>(null);
  // Keep using the app-level listener's last genuine fix while this freshly
  // mounted watcher starts. Its initial London value is map framing only and
  // must never become a live-tracking update or panic location.
  const safeLocation = hasFix ? location : dispatchService.getLocation();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [reportRequesterNoShow, setReportRequesterNoShow] = useState(false);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  // "One more and I'm done" — spent on completion, never sent early
  const [endShiftAfter, setEndShiftAfter] = useState(dispatchService.isEndingShiftAfterJob());
  const [declaredRail, setDeclaredRail] = useState<string | null>(null);
  // The requester cancelled — its own screen, with the option to record it
  const [cancelledOn, setCancelledOn] = useState<
    { late: boolean; reasonCode: string | null } | null
  >(null);

  const originLabel = profile?.labels?.originLabel || 'Pickup';
  const destinationLabel = profile?.labels?.destinationLabel || 'Dropoff';
  const taskNoun = profile?.labels?.taskNoun || 'task';
  const requesterLabel = profile?.roles.requester || 'requester';
  const requiresDestination = profile?.features.requiresDestination !== false;
  const terminalStates = profile?.states.terminal || [];

  useEffect(() => {
    if (!activeTask) navigate('/provide');
  }, [activeTask, navigate]);

  // The provider initially accepts a coarse-cell task. Restore a previously
  // received itinerary from encrypted device storage, then listen for the
  // requester's verified NIP-17 envelope.
  useEffect(() => {
    if (!activeTask || !identity || !activeTask.requesterPubkey
        || activeTask.locationMode !== 'participant_encrypted') return;
    let closed = false;
    let subscription: { close: () => void } | null = null;
    if (loadedPrivateTaskRef.current !== activeTask.id) {
      loadedPrivateTaskRef.current = activeTask.id;
      void loadPrivateItinerary(identity.privKeyHex, activeTask.id).then((itinerary) => {
        if (!closed && itinerary) setActiveTask(mergePrivateItinerary(activeTask, itinerary));
      });
    }
    void subscribePrivateItinerary(
      identity.privKeyHex,
      identity.pubKeyHex,
      activeTask.requesterPubkey,
      activeTask.id,
      (itinerary) => {
        void savePrivateItinerary(identity.privKeyHex, itinerary);
        setActiveTask(mergePrivateItinerary(activeTask, itinerary));
      },
    ).then((handle) => {
      if (closed) handle.close();
      else subscription = handle;
    });
    return () => {
      closed = true;
      subscription?.close();
    };
  }, [activeTask?.id, activeTask?.requesterPubkey, activeTask?.locationMode, identity?.privKeyHex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Send location updates via PII module (only when liveTracking is enabled)
  useLiveTracking({
    taskId: activeTask?.id || null,
    providerPubkey: identity?.pubKeyHex || null,
    lat: safeLocation?.lat ?? 0,
    lng: safeLocation?.lng ?? 0,
    enabled: !!(profile?.features.liveTracking && activeTask && identity && safeLocation
      && activeTask.locationMode !== 'participant_encrypted'),
    operatorBase: activeTask?.operatorBase,
  });

  // Re-fetch the task when a WS event signals a state change
  const refreshTask = useCallback(async () => {
    if (!activeTask) return;
    try {
      const updated = await getTask(activeTask.id, activeTask.operatorBase);
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
            ? t('pactive.pickupMovedTo', { label: originLabel, address: msg.address })
            : t('pactive.pickupMovedBy', {
                label: originLabel,
                distance: msg.movedMetres ? ` ${msg.movedMetres} m` : '',
              }),
          { type: 'error' },
        );
        void refreshTask();
        break;
      case 'dropoff_updated':
        // The rider changed where this ends. Loud: the driver may be
        // navigating to the old one right now, and the fare moved with it.
        showToast(
          msg.address
            ? t('pactive.dropoffMoved', { address: msg.address })
            : t('pactive.dropoffMovedPlain'),
          { type: 'error' },
        );
        void refreshTask();
        break;
      case 'tip_sent':
        showToast(t('pactive.tipReceived'));
        break;
      case 'settlement_declared':
        setDeclaredRail(msg.rail || null);
        showToast(t('pactive.saysPaid', { label: requesterLabel.toLowerCase() }));
        void refreshTask();
        break;
      case 'settlement_confirmed':
        void refreshTask();
        break;
      case 'scheduled_reminder':
        showToast(t('pactive.upcoming', {
          noun: taskNoun, time: formatScheduledTime(msg.scheduledFor),
        }));
        break;
      case 'task_cancelled':
        // A driver who drove to a pickup deserves the same record the rider
        // gets when a driver drops them — same rail, same trust model
        setCancelledOn({
          late: msg.lateCancellation === true,
          reasonCode: msg.reasonCode ?? null,
        });
        break;
    }
  }, [activeTask, setActiveTask, navigate, terminalStates, refreshTask, reset, taskNoun, originLabel]);

  // A federated job's updates live on the operator that holds it, so the
  // socket follows the job rather than the app's own operator.
  const { connected } = useWebSocket(
    activeTask?.id || null, handleWsMessage, activeTask?.operatorBase,
  );

  // Poll for updates
  useEffect(() => {
    if (!activeTask) return;
    const timer = setInterval(async () => {
      try {
        const updated = await getTask(activeTask.id, activeTask.operatorBase);
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
        reasonCode={cancelledOn.reasonCode}
        onReport={async () => {
          if (!activeTask.requesterPubkey) return;
          await reportLateCancel(activeTask.id, {
            targetPubkey: activeTask.requesterPubkey,
            reporterRole: 'provider',
            domainId: profile?.id,
          }, activeTask.operatorBase);
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
      const message = err instanceof Error ? err.message : t('pactive.actionFailed');
      setActionError(message);
      showToast(message, { type: 'error' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleArrive = () => runAction('arrive', async () => {
    const updated = await arriveAtOrigin(activeTask.id, {
      providerPubkey: identity.pubKeyHex,
    }, activeTask.operatorBase);
    setActiveTask(updated);
  });

  const handleStart = () => runAction('start', async () => {
    const updated = await startTask(activeTask.id, {
      providerPubkey: identity.pubKeyHex,
    }, activeTask.operatorBase);
    setActiveTask(updated);
  });

  const handleComplete = () => runAction('complete', async () => {
    const updated = await completeTask(activeTask.id, {
      providerPubkey: identity.pubKeyHex,
    }, activeTask.operatorBase);
    setActiveTask(updated);
    // Anyone this job was shared with hears that it ended safely —
    // fire-and-forget so finishing never waits on relays
    void sendAllClear(identity.privKeyHex, updated.id, taskNoun).catch(() => {});
    // "Finish after this one" is spent here, not when it was ticked
    dispatchService.finishJob();
    navigate('/provide/complete');
  });

  const handleTransition = (targetState: string) => runAction(targetState, async () => {
    const updated = await transitionTask(activeTask.id, {
      targetState,
      providerPubkey: identity.pubKeyHex,
    }, activeTask.operatorBase);
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
      reason: noShowTarget ? 'no_show' : undefined,
      reasonCode: noShowTarget ? 'no_show' : cancelReason,
    }, activeTask.operatorBase);
    // Signed by the driver, published to public relays. Fire-and-forget:
    // cancelling the job never blocks on relay reachability.
    if (noShowTarget) {
      void reportNoShow(activeTask.id, {
        targetPubkey: noShowTarget,
        reporterRole: 'provider',
        domainId: profile?.id,
      }, activeTask.operatorBase).catch(() => {});
      showToast(t('active.noShowReported'));
    }
    reset();
    navigate('/provide');
  });

  const handlePanic = async () => {
    // The driver's own trusted contacts hear it directly, E2E encrypted —
    // the operator carries the alert, not the message
    void sendGuardianAlert(identity.privKeyHex, activeTask, safeLocation, 'provider').catch(() => {});
    await triggerPanic(activeTask.id, {
      role: 'provider',
      location: safeLocation,
      locationMode: activeTask.locationMode,
    }, activeTask.operatorBase);
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

      const label = actionLabel(stateKey, nextStateValue, profile, t);

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
          <MapView centre={safeLocation || activeTask.pickup} zoom={15}>
            {safeLocation && (
              <LocationMarker position={safeLocation} label="You" colour="blue" />
            )}
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
            <div
              className={`status-dot-glow ${connected ? 'glow-green' : 'glow-orange'}`}
              role="status"
              aria-live="polite"
              aria-label={connected ? t('common.connected') : t('common.reconnecting')}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-donkey-bg relative">
          <div className="card text-center max-w-sm">
            <p className="text-lg font-bold text-donkey-text">{taskNoun} active</p>
            <p className="text-sm text-donkey-muted mt-1">Use the controls below to manage the {taskNoun}</p>
          </div>
          <div className="absolute top-3 right-3 z-10">
            <div
              className={`status-dot-glow ${connected ? 'glow-green' : 'glow-orange'}`}
              role="status"
              aria-live="polite"
              aria-label={connected ? t('common.connected') : t('common.reconnecting')}
            />
          </div>
        </div>
      )}

      {/* Sheet: the current step and the person stay visible; detail,
          safety and payment sit one tap away. Thirteen stacked panels left
          no map on a phone and buried the action button below the fold. */}
      <Sheet>
        <div className="flex items-center justify-between">
          <StatusBadge status={status} role="provider" />
          {/* Through the rate in force when they accepted — the fare on the
              offer card is what they agreed to work for */}
          {activeTask.settlementMode === 'none'
            ? <span className="text-sm font-black text-donkey-green">{t('settlement.none')}</span>
            : (
              <DualPrice
                sats={activeTask.fareEstimateSats}
                size="sm"
                ratesOverride={getAgreedRate(activeTask.id)}
              />
            )}
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

        {/* Where this ends, in words. The driver could see the destination
            only as a map pin and a nav button — fine until you decline the
            hand-off, or the rider changes it mid-trip. */}
        {requiresDestination && (activeTask.dropoffAddress || activeTask.dropoff) && (
          <div className="meta-card">
            <p className="meta-label">{destinationLabel}</p>
            <p className="text-sm text-donkey-text mt-1">
              {activeTask.dropoffAddress
                || `${activeTask.dropoff!.lat.toFixed(4)}, ${activeTask.dropoff!.lng.toFixed(4)}`}
            </p>
          </div>
        )}

        {/* Waiting time — a running meter belongs in front of both parties */}
        {activeTask.settlementMode !== 'none' && <WaitingTimer task={activeTask} role="provider" />}

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
        {activeTask.locationMode !== 'participant_encrypted'
          && activeTask.settlementMode !== 'none'
          && profile?.features.quoteNegotiation &&
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
              }, activeTask.operatorBase);
              const updated = await getTask(activeTask.id, activeTask.operatorBase);
              setActiveTask(updated);
            }}
          />
        )}

        {/* The rider says they have paid — confirm it */}
        {activeTask.settlementMode !== 'none' && (
          <ConfirmReceipt
            task={activeTask}
            settlement={activeTask.settlement}
            declaredRail={declaredRail}
          />
        )}

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
              role="provider"
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
        {activeTask.locationMode !== 'participant_encrypted' && ((profile?.features.photos && (
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
                  }, activeTask.operatorBase);
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
                  }, activeTask.operatorBase);
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
        {!isTerminal && activeTask.settlementMode !== 'none' && (
          <SheetSection title={t('sheet.payment')} icon="💷" rememberAs="driver-payment">
            {activeTask.locationMode !== 'participant_encrypted' && (
              <PaymentMethodsEditor rideId={activeTask.id} operatorBase={activeTask.operatorBase} />
            )}
            <TaskStakePanel task={activeTask} role="provider" />
          </SheetSection>
        )}

        {/* Actions */}
        <div className="pt-1 space-y-2">
          {/* Finishing for the day used to mean choosing between abandoning
              this job and remembering later */}
          {!isTerminal && !showCancelConfirm && dispatchService.isOnline() && (
            <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
              <input
                type="checkbox"
                className="w-4 h-4 accent-donkey-blue"
                checked={endShiftAfter}
                onChange={(e) => {
                  setEndShiftAfter(e.target.checked);
                  dispatchService.setEndShiftAfterJob(e.target.checked);
                }}
              />
              <span className="text-xs text-donkey-text">{t('pactive.endShiftAfter')}</span>
            </label>
          )}

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
              {/* Once the job has STARTED there is no late cancellation to
                  warn about — the operator only marks one when a provider
                  committed and dropped it before starting. Telling a driver
                  mid-trip that this "shows on your record" is a penalty that
                  does not exist, and it discourages exactly the cancellations
                  that most need to happen (a breakdown, a passenger who has
                  become a problem). Say the thing that is actually true. */}
              <p className="text-xs text-donkey-muted">
                {activeTask.startedAt
                  ? t('pactive.cancelNoteStarted', {
                    label: requesterLabel.toLowerCase(), noun: taskNoun.toLowerCase(),
                  })
                  : t('pactive.cancelNote', { label: requesterLabel.toLowerCase() })}
              </p>
              <CancelReasonPicker
                side="provider"
                value={cancelReason}
                onChange={setCancelReason}
              />
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

      {/* The next job transition never scrolls. A driver approaching a kerb
          should not hunt through addresses, timers or safety panels for it. */}
      {buttons.length > 0 && !showCancelConfirm && (
        <div className="bg-donkey-surface border-t-2 border-donkey-border px-5 py-3 shadow-panel shrink-0">
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
        </div>
      )}
    </div>
  );
}
