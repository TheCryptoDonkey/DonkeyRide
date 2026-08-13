import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView } from '../../components/map/MapView';
import { LocationMarker } from '../../components/map/LocationMarker';
import { DualPrice } from '../../components/common/DualPrice';
import { PersonCard } from '../../components/common/PersonCard';
import { AcceptCountdown } from '../../components/provider/AcceptCountdown';
import { showToast } from '../../components/common/Toast';
import { taskPickupProximity } from '../../utils/pickup-distance';
import { useTask } from '../../context/TaskContext';
import { useIdentity } from '../../context/IdentityContext';
import { useDomain } from '../../context/DomainContext';
import { acceptTask, setPaymentMethods, ApiError } from '../../services/api';
import { getSavedPaymentMethods } from '../../utils/payment-methods';
import { formatDistance, formatDuration } from '../../services/pricing';
import { formatScheduledTime, isUpcoming } from '../../utils/datetime';
import { dispatchService } from '../../services/dispatch';
import { loadVehicle, loadServiceOptions } from '../../utils/vehicle';
import { loadAccessFeatures } from '../../utils/access-needs';
import { validCredentials } from '../../utils/credentials';
import { loadGender } from '../../utils/gender';
import { reverseGeocode } from '../../utils/reverse-geocode';
import { recordAgreedRate } from '../../utils/agreed-rate';
import { peekBtcPrices } from '../../hooks/useBtcPrices';
import { useT } from '../../i18n';

/** How long a driver has to take an offer before it lapses back to the list */
const ACCEPT_SECONDS = 20;

export function IncomingTaskPage() {
  const navigate = useNavigate();
  const { t, td } = useT();
  const { activeTask, setActiveTask } = useTask();
  const { identity } = useIdentity();
  const { profile } = useDomain();
  const [accepting, setAccepting] = useState(false);
  // The app-level dispatch listener survives route changes and retains the
  // last genuine fix. A newly mounted location hook starts at the London map
  // placeholder, which must never be sent as the driver's position.
  const location = dispatchService.getLocation();

  const originLabel = td(profile?.labels?.originLabel || 'Pickup');
  const destinationLabel = td(profile?.labels?.destinationLabel || 'Dropoff');
  const requiresDestination = profile?.features.requiresDestination !== false;
  const taskNoun = td(profile?.labels?.taskNoun || 'task');

  useEffect(() => {
    if (!activeTask) navigate('/provide');
  }, [activeTask, navigate]);

  // Name the two ends of the job. Pre-accept the coordinates are already
  // ~1 km rounded, so this yields a neighbourhood — enough for a driver to
  // know the roads, without the operator handing out an exact address.
  const [areas, setAreas] = useState<{ from: string | null; to: string | null }>(
    { from: null, to: null },
  );
  useEffect(() => {
    if (!activeTask) return;
    if (activeTask.locationMode === 'participant_encrypted') {
      setAreas({ from: null, to: null });
      return;
    }
    let live = true;
    void Promise.all([
      activeTask.pickup ? reverseGeocode(activeTask.pickup) : Promise.resolve(null),
      activeTask.dropoff ? reverseGeocode(activeTask.dropoff) : Promise.resolve(null),
    ])
      .then(([from, to]) => { if (live) setAreas({ from, to }); })
      .catch(() => {});
    return () => { live = false; };
  }, [activeTask?.id, activeTask?.locationMode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!activeTask) return null;

  const handleAccept = async () => {
    if (!identity || accepting) return;
    if (!location) {
      showToast(t('incoming.waitingForLocation'), { type: 'error' });
      return;
    }
    setAccepting(true);
    try {
      const privateItinerary = activeTask.locationMode === 'participant_encrypted';
      const updated = await acceptTask(activeTask.id, {
        providerPubkey: identity.pubKeyHex,
        providerNpub: identity.npub,
        providerLocation: location,
        // The car the requester should look for (set on the profile page)
        vehicle: privateItinerary ? null : loadVehicle(),
        // Self-declared — required by the server for a women-only task
        gender: privateItinerary ? null : loadGender(),
        // Vehicle classes declared on the profile page (XL, Comfort …)
        serviceOptions: loadServiceOptions(),
        // Fail-closed guard at accept: the server refuses if these do not
        // cover what the request needs
        accessFeatures: privateItinerary ? [] : loadAccessFeatures(),
        locationMode: activeTask.locationMode,
        // Licences and cover, as declared on the profile page. Expired
        // claims never leave this device — an operator running
        // ENFORCE_CREDENTIALS refuses the accept, which is the point.
        credentials: privateItinerary ? [] : validCredentials(),
      }, activeTask.operatorBase);
      // The rate behind the fare this driver just agreed to work for. Accept
      // is their moment of agreement, exactly as the request tap is the
      // rider's — without it the figure drifts against the one on the offer
      // card they said yes to.
      if (activeTask.settlementMode !== 'none') {
        recordAgreedRate(activeTask.id, peekBtcPrices());
      }
      dispatchService.removeAvailable(activeTask.id);
      // The job stays theirs to coordinate — carry the origin forward so
      // every later call goes back to the operator that holds it.
      setActiveTask(activeTask.operatorBase
        ? { ...updated, operatorBase: activeTask.operatorBase }
        : updated);

      // Best-effort: advertise the driver's saved payment methods on this ride
      // so the rider can pay directly. Never blocks accepting the job.
      const savedMethods = getSavedPaymentMethods();
      if (activeTask.settlementMode !== 'none' && !privateItinerary
          && savedMethods.length > 0) {
        void setPaymentMethods(
          updated.id, { methods: savedMethods }, activeTask.operatorBase,
        ).catch(() => {});
      }

      navigate('/provide/active');
    } catch (err) {
      // Losing a simultaneous-accept race is normal — say so honestly
      const status = err instanceof ApiError ? err.status : undefined;
      const taken = status === 400 || status === 404 || status === 409;
      if (taken) dispatchService.removeAvailable(activeTask.id);
      showToast(
        taken
          ? t('incoming.taken')
          : err instanceof Error ? err.message : t('incoming.acceptFailed'),
        { type: 'error' },
      );
      setActiveTask(null);
      navigate('/provide');
    } finally {
      setAccepting(false);
    }
  };

  // Declining must actually decline. It used to just navigate back, so the
  // job reappeared at the top of the dashboard immediately and the driver
  // had to keep re-declining the one they had already turned down.
  const handleDecline = () => {
    dispatchService.declineAvailable(activeTask.id);
    setActiveTask(null);
    navigate('/provide');
  };

  // Out of time — release the offer rather than hold it silently. The job
  // goes back on the dashboard list, so this is a lapse, not a rejection.
  const handleExpire = () => {
    if (accepting) return;
    showToast(t('incoming.expired'), { type: 'error' });
    setActiveTask(null);
    navigate('/provide');
  };

  // How far away the rider is — the number that decides whether this job is
  // worth taking, and the one this screen never used to show
  const proximity = taskPickupProximity(location, activeTask);

  const requesterLabel = td(profile?.roles.requester || 'Requester');

  return (
    <div className="h-full flex flex-col">
      {/* Map with origin/destination */}
      {profile?.features.navigation !== false ? (
        <div className="flex-1 relative">
          <MapView centre={activeTask.pickup} zoom={14}>
            <LocationMarker position={activeTask.pickup} label={originLabel} colour="green" />
            {requiresDestination && activeTask.dropoff && (
              <LocationMarker position={activeTask.dropoff} label={destinationLabel} colour="red" />
            )}
            {location && (
              <LocationMarker position={location} label={t('common.you')} colour="blue" />
            )}
          </MapView>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-donkey-bg">
          <div className="card text-center max-w-sm">
            <p className="text-lg font-bold text-donkey-text">{t('incoming.title', { noun: taskNoun })}</p>
            <p className="text-sm text-donkey-muted mt-1">
              {t('incoming.needsService', { label: requesterLabel })}
            </p>
          </div>
        </div>
      )}

      {/* Incoming task panel */}
      <div className="bg-donkey-surface border-t-2 border-donkey-border p-6 shadow-panel">
        <div className="incoming-card mb-4">
          {/* Headline: what it pays, how far to the rider, and how long the
              offer lasts — the three things a decision needs, side by side */}
          <div className="flex items-center gap-4 mb-3">
            <div className="min-w-0 flex-1">
              <p className="section-title mb-1">
                {t('incoming.new', { label: requesterLabel, noun: taskNoun })}
              </p>
              {activeTask.settlementMode === 'none'
                ? <p className="text-lg font-black text-donkey-green">{t('settlement.none')}</p>
                : <DualPrice sats={activeTask.fareEstimateSats} size="lg" />}
              {proximity && (
                <p className="text-sm font-bold text-donkey-blue mt-1">
                  {t('incoming.away', {
                    min: proximity.minutes,
                    dist: formatDistance(proximity.km),
                  })}
                </p>
              )}
            </div>
            {!activeTask.operatorBase && (
              <AcceptCountdown
                seconds={ACCEPT_SECONDS}
                onExpire={handleExpire}
                paused={accepting}
              />
            )}
          </div>

          {/* Where from and where to, in words — a map pin alone does not
              tell a driver whether they know the road */}
          <div className="space-y-1 mb-3 text-sm">
            <p className="flex gap-2">
              <span className="text-donkey-green shrink-0" aria-hidden="true">●</span>
              <span className="text-donkey-text truncate">
                {activeTask.pickupAddress || areas.from || t('incoming.approxPickup')}
              </span>
            </p>
            {requiresDestination && (
              <p className="flex gap-2">
                <span className="text-donkey-red shrink-0" aria-hidden="true">●</span>
                <span className="text-donkey-text truncate">
                  {activeTask.dropoffAddress || areas.to || t('incoming.approxDropoff')}
                </span>
              </p>
            )}
          </div>

          {/* What this job needs — the driver already passed the gate, but
              they still have to know to bring the child seat */}
          {(activeTask.accessNeeds || []).length > 0 && (
            <div className="flex flex-wrap gap-1 justify-center mb-3">
              {activeTask.accessNeeds!.map((id) => {
                const option = (profile?.accessOptions || []).find((o) => o.id === id);
                return (
                  <span
                    key={id}
                    className="text-xs font-semibold px-2 py-1 rounded-full bg-donkey-blue/20 text-donkey-blue"
                  >
                    {option?.label || id}
                  </span>
                );
              })}
            </div>
          )}

          {activeTask.womenOnly && (
            <p className="text-sm text-donkey-purple font-bold text-center mb-3">
              ♀ {t('women.badge')} — {t('women.incomingNote', { label: requesterLabel, provider: td(profile?.roles.provider || 'driver').toLowerCase() })}
            </p>
          )}

          {isUpcoming(activeTask.scheduledFor) && (
            <p className="text-sm text-donkey-blue font-bold text-center mb-3">
              {t('incoming.bookedCommit', { time: formatScheduledTime(activeTask.scheduledFor) })}
            </p>
          )}

          {(activeTask.distanceKm || activeTask.durationMin || (activeTask.stopCount ?? 0) > 0) && (
            <div className="flex justify-center gap-4 text-sm text-donkey-muted mb-3">
              {activeTask.distanceKm != null && (
                <span>{formatDistance(activeTask.distanceKm)}</span>
              )}
              {activeTask.durationMin != null && (
                <span>{formatDuration(activeTask.durationMin)}</span>
              )}
              {(activeTask.stopCount ?? 0) > 0 && (
                <span>+{activeTask.stopCount} {activeTask.stopCount === 1 ? t('common.stop') : t('common.stops')}</span>
              )}
            </div>
          )}

          <p className="text-xs text-donkey-muted text-center mb-3">
            {t('incoming.approx')}
          </p>

          {activeTask.requesterPubkey && (
            <PersonCard
              subject={activeTask.requesterPubkey}
              roleLabel={requesterLabel}
              size="sm"
            />
          )}
        </div>

        {activeTask.operatorBase && (
          // A job coordinated by someone else. It is accepted and run from
          // here — the driver's key is the account, and it means the same
          // thing at every operator — but say whose job it is, because that
          // is who the fare and any dispute sit with.
          <p className="text-xs text-donkey-muted text-center mb-3">
            {t('federation.coordinatedBy', { host: new URL(activeTask.operatorBase).host })}
          </p>
        )}
        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={handleDecline} disabled={accepting}>
            {t('common.decline')}
          </button>
          <button className="btn-primary flex-1" onClick={handleAccept} disabled={accepting || !location}>
            {accepting
              ? t('common.accepting')
              : location ? t('common.accept') : t('incoming.findingLocation')}
          </button>
        </div>
      </div>
    </div>
  );
}
