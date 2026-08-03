import { useEffect, useCallback, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView } from '../../components/map/MapView';
import { LocationMarker } from '../../components/map/LocationMarker';
import { RoutePolyline } from '../../components/map/RoutePolyline';
import { StatusBadge } from '../../components/common/StatusBadge';
import { DualPrice } from '../../components/common/DualPrice';
import { PersonCard } from '../../components/common/PersonCard';
import { PanicButton } from '../../components/safety/PanicButton';
import { Loading } from '../../components/common/Loading';
import { ChatPanel } from '../../components/task/ChatPanel';
import { PickupCode } from '../../components/task/PickupCode';
import { PickupAdjuster } from '../../components/task/PickupAdjuster';
import { WaitingTimer } from '../../components/task/WaitingTimer';
import { SearchingPanel } from '../../components/task/SearchingPanel';
import { NoProvidersScreen } from '../../components/task/NoProvidersScreen';
import { CancelledScreen } from '../../components/task/CancelledScreen';
import { Sheet, SheetSection } from '../../components/layout/Sheet';
import { TaskStakePanel } from '../../components/payment/TaskStakePanel';
import { PayDriver } from '../../components/payment/PayDriver';
import { showToast } from '../../components/common/Toast';
import { useTask } from '../../context/TaskContext';
import { useIdentity } from '../../context/IdentityContext';
import { useDomain } from '../../context/DomainContext';
import { useLocation } from '../../hooks/useLocation';
import { useWebSocket } from '../../hooks/useWebSocket';
import {
  triggerPanic, cancelTask, getTask, acceptQuote, declineQuote, reportNoShow,
  reportLateCancel, getOperatorInfoCached, updateTaskPickup,
} from '../../services/api';
import { reverseGeocode } from '../../utils/reverse-geocode';
import { QuotePanel } from '../../components/task/QuotePanel';
import { TripSharePanel } from '../../components/safety/TripSharePanel';
import { TripAudioRecorder } from '../../components/safety/TripAudioRecorder';
import { RideCheckPrompt } from '../../components/safety/RideCheckPrompt';
import {
  sendAllClear, sendGuardianAlert, sendRideCheckAlert, getSharedGuardians,
  autoShareTrip,
} from '../../services/trip-share';
import { createRideCheck, type RideCheckMonitor, type RideCheckReason } from '../../utils/ride-check';
import { routePositions } from '../../utils/geo';
import { useT } from '../../i18n';
import { describeVehicle } from '../../utils/vehicle';
import { formatScheduledTime, isUpcoming } from '../../utils/datetime';
import type { WsMessage, Task, LatLng, OperatorPaymentInfo } from '../../types/api';

export function ActiveTaskPage() {
  const navigate = useNavigate();
  const { activeTask, setActiveTask, origin, setOrigin, destination, providerLocation, setProviderLocation, reset } = useTask();
  const { identity } = useIdentity();
  const { profile } = useDomain();
  const { t } = useT();
  const { location: currentLocation, error: locationError, loading: locationLoading } = useLocation(true);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reportProviderNoShow, setReportProviderNoShow] = useState(false);
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

  // Live search progress while nobody has accepted yet
  const [search, setSearch] = useState<{
    attempt: number; radiusKm: number; providersNotified: number;
  } | null>(null);
  // Set when the operator exhausted its search — shown as its own screen
  const [noProviders, setNoProviders] = useState<{ radiusKm: number } | null>(null);
  // Set when the provider cancelled — its own screen too, because a toast
  // told the rider nothing and gave them nowhere to record it
  const [cancelledBy, setCancelledBy] = useState<{ late: boolean } | null>(null);

  // Route a task that has reached a terminal state
  const routeTerminal = useCallback((task: Task) => {
    if (task.status === cancelledValue) {
      // "Nobody was available" is a different answer from "your driver
      // cancelled", and conflating them reads as a fault that isn't there
      if (task.cancellationReason === 'no_providers') {
        setNoProviders({ radiusKm: search?.radiusKm || 0 });
        return;
      }
      // They had committed and then dropped it — the rider gets a screen,
      // not a toast, and the option to put it on the public record
      setCancelledBy({ late: task.lateCancellation === true });
      return;
    } else {
      // Guardians this trip was shared with get their all-clear —
      // fire-and-forget so navigation never waits on relays
      if (identity) {
        void sendAllClear(identity.privKeyHex, task.id, taskNoun).catch(() => {});
      }
      // Completion page distinguishes completed from no_show
      navigate('/request/complete');
    }
  }, [cancelledValue, providerRoleLabel, taskNoun, reset, navigate, identity]);

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

  // How long until the car is here — the question every rider is asking.
  // Comes with each provider location update; cleared once they arrive.
  const [pickupEtaSeconds, setPickupEtaSeconds] = useState<number | null>(null);

  // Handle WebSocket messages — state updates arrive live, not just via poll
  const handleWsMessage = useCallback((msg: WsMessage) => {
    switch (msg.type) {
      case 'location_update':
        if (profile?.features.liveTracking) {
          setProviderLocation(msg.location);
        }
        if (typeof msg.etaSeconds === 'number') {
          setPickupEtaSeconds(msg.etaSeconds);
        }
        break;
      case 'pickup_updated':
        // Normally this phone moved it — but a second device (or a
        // reconnect) must not show a stale meeting point
        setOrigin(msg.pickup);
        void refreshTask();
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
      case 'scheduled_reminder':
        showToast(`Your ${taskNoun} is coming up — ${formatScheduledTime(msg.scheduledFor)}`);
        break;
      case 'searching':
        // The search is still live and reaching further out
        setSearch({
          attempt: msg.attempt,
          radiusKm: msg.radiusKm,
          providersNotified: msg.providersNotified,
        });
        break;
      case 'task_cancelled':
        if (msg.reason === 'no_providers') {
          setNoProviders({ radiusKm: search?.radiusKm || 0 });
          break;
        }
        setCancelledBy({ late: msg.lateCancellation === true });
        break;
    }
  }, [activeTask, setActiveTask, setProviderLocation, setOrigin, navigate, profile, terminalStates, routeTerminal, refreshTask, reset, taskNoun]);

  const { connected } = useWebSocket(activeTask?.id || null, handleWsMessage);

  // Auto-share: guardians flagged "every trip" get the share as soon as a
  // provider is matched (the share names the driver) — once per task
  const autoSharedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!identity || !activeTask?.providerPubkey) return;
    if (terminalStates.includes(activeTask.status)) return;
    if (autoSharedRef.current === activeTask.id) return;
    autoSharedRef.current = activeTask.id;
    void autoShareTrip(identity.privKeyHex, activeTask, taskNoun)
      .then((count) => {
        if (count > 0) {
          showToast(`Trip shared with ${count} trusted contact${count === 1 ? '' : 's'}`);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTask?.id, activeTask?.providerPubkey, activeTask?.status, identity, taskNoun]);

  // Ride check — this phone watches the trip; nothing leaves the device
  // unless the rider (or their silence) chooses to alert their contacts
  const [rideCheck, setRideCheck] = useState<RideCheckReason | null>(null);
  const rideCheckRef = useRef<RideCheckMonitor | null>(null);

  useEffect(() => {
    rideCheckRef.current = null;
    setRideCheck(null);
  }, [activeTask?.id]);

  useEffect(() => {
    // Only while the trip is under way, and only on real GPS fixes —
    // useLocation's London fallback would read as wildly off-route
    if (!activeTask?.startedAt || activeTask.status !== activeValue) return;
    if (locationError || locationLoading) return;
    if (!rideCheckRef.current) {
      rideCheckRef.current = createRideCheck(routePositions(activeTask.routeGeometry));
    }
    const reason = rideCheckRef.current.addSample({ ...currentLocation, t: Date.now() });
    if (reason) setRideCheck(reason);
  }, [currentLocation, locationError, locationLoading, activeTask?.status, activeTask?.startedAt, activeValue]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Search exhausted — its own screen, with a way forward
  if (noProviders) {
    return (
      <NoProvidersScreen
        providerLabel={providerRoleLabel.toLowerCase() + 's'}
        taskNoun={taskNoun}
        radiusKm={noProviders.radiusKm}
        onRetry={() => { reset(); navigate('/request/new'); }}
        onSchedule={() => { reset(); navigate('/request/new?when=later'); }}
      />
    );
  }

  // The provider cancelled — say so properly, and offer the record
  if (cancelledBy) {
    const target = activeTask?.providerPubkey;
    return (
      <CancelledScreen
        byLabel={providerRoleLabel.toLowerCase()}
        taskNoun={taskNoun}
        late={cancelledBy.late && Boolean(target)}
        onReport={async () => {
          if (!target || !activeTask) return;
          await reportLateCancel(activeTask.id, {
            targetPubkey: target,
            reporterRole: 'requester',
            domainId: profile?.id,
          });
        }}
        onDone={() => { reset(); navigate('/request'); }}
      />
    );
  }

  if (!activeTask || !origin) return <Loading message={`Loading ${taskNoun}...`} />;

  const handlePanic = async () => {
    if (!identity) throw new Error('No identity');
    // Guardians hear about it too — direct, encrypted, operator-blind
    void sendGuardianAlert(identity.privKeyHex, activeTask, currentLocation).catch(() => {});
    await triggerPanic(activeTask.id, {
      role: 'requester',
      location: currentLocation,
    });
  };

  const dismissRideCheck = () => {
    rideCheckRef.current?.acknowledge(Date.now());
    setRideCheck(null);
  };

  const alertRideCheck = () => {
    if (identity && rideCheck) {
      void sendRideCheckAlert(identity.privKeyHex, activeTask, rideCheck, currentLocation)
        .catch(() => {});
      showToast('Your contacts have been alerted');
    }
    dismissRideCheck();
  };

  const handleCancel = async () => {
    if (!identity || cancelling) return;
    setCancelling(true);
    setActionError(null);
    try {
      const noShowTarget = reportProviderNoShow ? activeTask.providerPubkey : null;
      await cancelTask(activeTask.id, {
        cancelledBy: identity.pubKeyHex,
        reason: noShowTarget ? 'no_show' : 'Requester cancelled',
      });
      // Signed by the rider, published to public relays — the counterparty's
      // future matches see it. Fire-and-forget: cancel never blocks on relays.
      if (noShowTarget) {
        void reportNoShow(activeTask.id, {
          targetPubkey: noShowTarget,
          reporterRole: 'requester',
          domainId: profile?.id,
        }).catch(() => {});
        showToast('No-show reported');
      }
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

  // The pickup stays editable until the provider is actually at the kerb —
  // riders walk while the car is on its way
  const arrivedValue = profile?.states.values.PROVIDER_ARRIVED || 'arrived';
  const matched = Boolean(activeTask.providerPubkey);
  const pickupMovable = !terminalStates.includes(activeTask.status)
    && activeTask.status !== arrivedValue
    && activeTask.status !== activeValue
    && !activeTask.startedAt;

  const pickupPoint = (activeTask.pickup && (activeTask.pickup.lat || activeTask.pickup.lng))
    ? activeTask.pickup
    : origin;

  const applyPickup = (updated: Task) => {
    setActiveTask(updated);
    if (updated.pickup) setOrigin(updated.pickup);
  };

  const dragPickup = async (loc: LatLng) => {
    try {
      const named = await reverseGeocode(loc);
      applyPickup(await updateTaskPickup(activeTask.id, { location: loc, address: named }));
      showToast(t('active.pickupMoved', { label: originLabel }));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('active.pickupMoveFailed'), { type: 'error' });
    }
  };

  const sharedCount = getSharedGuardians(activeTask.id).length;

  const arrivingMinutes = pickupEtaSeconds != null && pickupEtaSeconds >= 0
    ? Math.max(1, Math.round(pickupEtaSeconds / 60))
    : null;

  const centre = providerLocation || pickupPoint;

  return (
    <div className="h-full flex flex-col">
      {/* Map */}
      {profile?.features.navigation !== false ? (
        <div className="flex-1 relative">
          <MapView centre={centre} zoom={15}>
            <LocationMarker
              position={pickupPoint}
              label={originLabel}
              colour="green"
              draggable={pickupMovable}
              onDragEnd={(loc) => void dragPickup(loc)}
            />
            {(activeTask.stops || []).map((stop, i) => (
              <LocationMarker
                key={`${stop.lat},${stop.lng},${i}`}
                position={stop}
                label={`Stop ${i + 1}`}
                colour="blue"
              />
            ))}
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

      {/* Sheet: what is live now stays visible, the rest is one tap away.
          This screen used to stack thirteen open panels under a map that
          then had nowhere to render. */}
      <Sheet>
        <div className="flex items-center justify-between">
          <StatusBadge status={activeTask.status} />
          <DualPrice sats={activeTask.fareEstimateSats} size="sm" />
        </div>

        {/* Nobody has taken it yet — show that the search is alive */}
        {!matched && !terminalStates.includes(activeTask.status)
          && !isUpcoming(activeTask.scheduledFor) && (
          <SearchingPanel
            since={new Date(activeTask.createdAt).getTime()}
            attempt={search?.attempt}
            radiusKm={search?.radiusKm}
            providersNotified={search?.providersNotified}
            providerLabel={providerRoleLabel.toLowerCase() + 's'}
          />
        )}

        {/* Everything OK? — client-side ride check. Never behind a tap:
            it is a question that needs answering now. */}
        {rideCheck && (
          <RideCheckPrompt
            reason={rideCheck}
            guardianCount={getSharedGuardians(activeTask.id).length}
            onDismiss={dismissRideCheck}
            onAlert={alertRideCheck}
          />
        )}

        {/* Pre-booked pickup time */}
        {isUpcoming(activeTask.scheduledFor) && !activeTask.startedAt
          && !terminalStates.includes(activeTask.status) && (
          <div className="meta-card border border-donkey-blue/40">
            <p className="meta-label">{t('active.bookedFor')}</p>
            <p className="text-sm font-bold text-donkey-text mt-1">
              {formatScheduledTime(activeTask.scheduledFor)}
            </p>
            <p className="text-xs text-donkey-muted mt-1">
              {activeTask.providerPubkey
                ? t('active.bookedCommitted', { label: providerRoleLabel.toLowerCase() })
                : t('active.bookedWaiting', { label: providerRoleLabel.toLowerCase() + 's' })}
            </p>
          </div>
        )}

        {/* Who is coming, and when — the headline of this screen */}
        {activeTask.providerNpub && (
          <div className="meta-card">
            <PersonCard subject={activeTask.providerNpub} roleLabel={providerRoleLabel}>
              {/* While they are coming to you, the only number that matters
                  is how long until they are here — not the trip length */}
              {arrivingMinutes != null && pickupMovable ? (
                <>
                  <p className="meta-label">{t('active.arriving')}</p>
                  <p className="text-lg font-black text-donkey-green mt-1">
                    {t('active.arrivingIn', { n: arrivingMinutes })}
                  </p>
                </>
              ) : activeTask.durationMin != null ? (
                <>
                  <p className="meta-label">{t('active.tripTime')}</p>
                  <p className="text-lg font-black text-donkey-green mt-1">
                    {Math.round(activeTask.durationMin)} min
                  </p>
                </>
              ) : null}
            </PersonCard>
            {describeVehicle(activeTask.vehicle) && (
              <p className="text-sm text-donkey-text mt-2">
                <span className="meta-label">{t('active.lookFor')} </span>
                <span className="font-bold">{describeVehicle(activeTask.vehicle)}</span>
              </p>
            )}
          </div>
        )}

        {/* Waiting time — a running meter belongs in front of both parties */}
        <WaitingTimer task={activeTask} role="requester" />

        {/* Quote review — an unanswered question, never behind a tap */}
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

        {/* Pay the driver — the current step once the job is under way */}
        {activeTask.status === activeValue && (
          <PayDriver task={activeTask} settlement={activeTask.settlement} />
        )}

        {/* ── Everything below is one tap away ───────────────────────── */}

        {/* Meeting the right car: code + moving the pickup. Open by default
            while they approach, because that is when it is used. */}
        {matched && !activeTask.startedAt
          && !terminalStates.includes(activeTask.status)
          && activeTask.status !== activeValue && (
          <SheetSection
            title={t('sheet.meeting')}
            icon="📍"
            defaultOpen
            rememberAs="rider-meeting"
          >
            {activeTask.providerPubkey && (
              <PickupCode
                taskId={activeTask.id}
                counterpartyPubkey={activeTask.providerPubkey}
                role="requester"
                counterpartyLabel={providerRoleLabel}
              />
            )}
            {pickupMovable && (
              <PickupAdjuster
                task={activeTask}
                originLabel={originLabel}
                providerLabel={providerRoleLabel}
                matched={matched}
                onUpdated={applyPickup}
              />
            )}
          </SheetSection>
        )}

        {/* Not yet matched but still able to walk to a better kerb */}
        {!matched && pickupMovable && !terminalStates.includes(activeTask.status) && (
          <SheetSection title={t('sheet.pickup')} icon="📍" rememberAs="rider-pickup">
            <PickupAdjuster
              task={activeTask}
              originLabel={originLabel}
              providerLabel={providerRoleLabel}
              matched={matched}
              onUpdated={applyPickup}
            />
          </SheetSection>
        )}

        {/* E2E encrypted chat with the matched provider */}
        {activeTask.providerPubkey && identity
          && !terminalStates.includes(activeTask.status) && (
          <SheetSection title={t('sheet.message', { label: providerRoleLabel })} icon="💬" rememberAs="rider-chat">
            <ChatPanel
              taskId={activeTask.id}
              selfPubkey={identity.pubKeyHex}
              counterpartyPubkey={activeTask.providerPubkey}
              counterpartyLabel={providerRoleLabel}
            />
          </SheetSection>
        )}

        {/* Safety tools together, where someone would look for them */}
        {identity && !terminalStates.includes(activeTask.status) && (
          <SheetSection
            title={t('sheet.safety')}
            icon="🛡️"
            badge={sharedCount > 0 ? t('sheet.sharedWith', { n: sharedCount }) : undefined}
            rememberAs="rider-safety"
          >
            <TripSharePanel
              task={activeTask}
              privKeyHex={identity.privKeyHex}
              taskNoun={taskNoun}
            />
            {activeTask.providerPubkey && (
              <TripAudioRecorder
                taskId={activeTask.id}
                counterpartyPubkey={activeTask.providerPubkey}
              />
            )}
          </SheetSection>
        )}

        {/* Payment detail: how it settles, and any stake */}
        {(payment?.provider === 'cash' || payment?.provider === 'demo'
          || activeTask.requesterStake) && (
          <SheetSection title={t('sheet.payment')} icon="💷" rememberAs="rider-payment">
            {payment?.provider === 'cash' && (
              <p className="text-sm text-donkey-text">
                {t('active.payDirect', { label: providerRoleLabel.toLowerCase() })}{' '}
                <DualPrice sats={activeTask.fareEstimateSats} size="sm" />
              </p>
            )}
            {payment?.provider === 'demo' && (
              <p className="text-sm text-donkey-muted">{t('active.demoPayment')}</p>
            )}
            <TaskStakePanel task={activeTask} role="requester" />
          </SheetSection>
        )}

        {/* Actions: panic stays a first-class control, cancel is a
            considered decision with its consequences spelled out */}
        <div className="pt-1 space-y-2">
          {profile?.features.safetyAlerts && !showCancelConfirm && (
            <PanicButton onPanic={handlePanic} />
          )}

          {canCancel && !showCancelConfirm && (
            <button
              className="btn-secondary w-full"
              onClick={() => setShowCancelConfirm(true)}
            >
              {t('active.cancel', { noun: taskNoun })}
            </button>
          )}

          {showCancelConfirm && (
            <div className="rounded-lg border border-donkey-red/40 p-3 space-y-3">
              <p className="text-sm font-bold text-donkey-text">
                {t('active.cancelConfirm', { noun: taskNoun })}
              </p>
              <p className="text-xs text-donkey-muted">
                {matched
                  ? t('active.cancelMatchedNote', { label: providerRoleLabel.toLowerCase() })
                  : t('active.cancelNote')}
              </p>
              {activeTask.providerPubkey && !activeTask.startedAt && (
                <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-donkey-orange"
                    checked={reportProviderNoShow}
                    onChange={(e) => setReportProviderNoShow(e.target.checked)}
                  />
                  <span className="text-xs text-donkey-text">
                    {t('active.reportNoShow', { label: providerRoleLabel.toLowerCase() })}
                  </span>
                </label>
              )}
              <div className="flex gap-3">
                <button
                  className="btn-secondary flex-1"
                  onClick={() => setShowCancelConfirm(false)}
                  disabled={cancelling}
                >
                  {t('active.keep')}
                </button>
                <button
                  className="btn-danger flex-1"
                  onClick={handleCancel}
                  disabled={cancelling}
                >
                  {cancelling ? t('active.cancelling') : t('active.confirmCancel')}
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
