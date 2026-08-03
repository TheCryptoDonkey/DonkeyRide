import { useEffect, useCallback, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView } from '../../components/map/MapView';
import { LocationMarker } from '../../components/map/LocationMarker';
import { RoutePolyline } from '../../components/map/RoutePolyline';
import { StatusBadge } from '../../components/common/StatusBadge';
import { DualPrice } from '../../components/common/DualPrice';
import { ReputationBadge } from '../../components/common/ReputationBadge';
import { PanicButton } from '../../components/safety/PanicButton';
import { Loading } from '../../components/common/Loading';
import { ChatPanel } from '../../components/task/ChatPanel';
import { PickupCode } from '../../components/task/PickupCode';
import { PickupAdjuster } from '../../components/task/PickupAdjuster';
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
  getOperatorInfoCached, updateTaskPickup,
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

  // Route a task that has reached a terminal state
  const routeTerminal = useCallback((task: Task) => {
    if (task.status === cancelledValue) {
      showToast(`${providerRoleLabel} cancelled the ${taskNoun}`, { type: 'error' });
      reset();
      navigate('/request');
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
      case 'task_cancelled':
        showToast(`${taskNoun} cancelled`, { type: 'error' });
        reset();
        navigate('/request');
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

      {/* Status panel */}
      <div className="bg-donkey-surface border-t-2 border-donkey-border p-5 space-y-3 shadow-panel">
        <div className="flex items-center justify-between">
          <StatusBadge status={activeTask.status} />
          <DualPrice sats={activeTask.fareEstimateSats} size="sm" />
        </div>

        {/* Everything OK? — client-side ride check */}
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
            <p className="meta-label">Booked for</p>
            <p className="text-sm font-bold text-donkey-text mt-1">
              {formatScheduledTime(activeTask.scheduledFor)}
            </p>
            <p className="text-xs text-donkey-muted mt-1">
              {activeTask.providerPubkey
                ? `Your ${providerRoleLabel.toLowerCase()} has committed — you'll both get a reminder nearer the time.`
                : `We'll alert nearby ${providerRoleLabel.toLowerCase()}s closer to the time — one may also commit early.`}
            </p>
          </div>
        )}

        {/* Provider info */}
        {activeTask.providerNpub && (
          <div className="meta-card flex items-center justify-between">
            <div>
              <p className="meta-label">{providerRoleLabel}</p>
              <p className="text-sm font-mono text-donkey-text mt-1">
                {activeTask.providerNpub.slice(0, 16)}...
              </p>
              <div className="mt-1">
                <ReputationBadge subject={activeTask.providerNpub} />
              </div>
              {describeVehicle(activeTask.vehicle) && (
                <p className="text-sm text-donkey-text mt-1">
                  <span className="meta-label">Look for </span>
                  <span className="font-bold">{describeVehicle(activeTask.vehicle)}</span>
                </p>
              )}
            </div>
            {/* While they are coming to you, the only number that matters
                is how long until they are here — not the trip length */}
            {arrivingMinutes != null && pickupMovable ? (
              <div className="text-right">
                <p className="meta-label">{t('active.arriving')}</p>
                <p className="text-lg font-black text-donkey-green mt-1">
                  {t('active.arrivingIn', { n: arrivingMinutes })}
                </p>
              </div>
            ) : activeTask.durationMin != null && (
              <div className="text-right">
                <p className="meta-label">{t('active.tripTime')}</p>
                <p className="text-lg font-black text-donkey-green mt-1">
                  {Math.round(activeTask.durationMin)} min
                </p>
              </div>
            )}
          </div>
        )}

        {/* Riders walk: the meeting point stays editable until arrival */}
        {pickupMovable && (
          <PickupAdjuster
            task={activeTask}
            originLabel={originLabel}
            providerLabel={providerRoleLabel}
            matched={matched}
            onUpdated={applyPickup}
          />
        )}

        {/* Right rider, right car — until the trip starts */}
        {activeTask.providerPubkey && !activeTask.startedAt
          && activeTask.status !== activeValue
          && !terminalStates.includes(activeTask.status) && (
          <PickupCode
            taskId={activeTask.id}
            counterpartyPubkey={activeTask.providerPubkey}
            role="requester"
            counterpartyLabel={providerRoleLabel}
          />
        )}

        {/* E2E encrypted chat with the matched provider */}
        {activeTask.providerPubkey && identity
          && !terminalStates.includes(activeTask.status) && (
          <ChatPanel
            taskId={activeTask.id}
            selfPubkey={identity.pubKeyHex}
            counterpartyPubkey={activeTask.providerPubkey}
            counterpartyLabel={providerRoleLabel}
          />
        )}

        {/* Tell someone you trust — E2E encrypted, operator-blind */}
        {identity && !terminalStates.includes(activeTask.status) && (
          <TripSharePanel
            task={activeTask}
            privKeyHex={identity.privKeyHex}
            taskNoun={taskNoun}
          />
        )}

        {/* Opt-in audio recording — device-local, counterparty notified */}
        {activeTask.providerPubkey && !terminalStates.includes(activeTask.status) && (
          <TripAudioRecorder
            taskId={activeTask.id}
            counterpartyPubkey={activeTask.providerPubkey}
          />
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
              {activeTask.providerPubkey && !activeTask.startedAt && (
                <label className="w-full flex items-center gap-2 mb-2 cursor-pointer basis-full">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-donkey-orange"
                    checked={reportProviderNoShow}
                    onChange={(e) => setReportProviderNoShow(e.target.checked)}
                  />
                  <span className="text-xs text-donkey-text">
                    The {providerRoleLabel.toLowerCase()} didn't show up — report it
                  </span>
                </label>
              )}
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
