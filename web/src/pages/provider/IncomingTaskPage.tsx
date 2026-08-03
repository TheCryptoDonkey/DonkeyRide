import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView } from '../../components/map/MapView';
import { LocationMarker } from '../../components/map/LocationMarker';
import { DualPrice } from '../../components/common/DualPrice';
import { ReputationBadge } from '../../components/common/ReputationBadge';
import { showToast } from '../../components/common/Toast';
import { useTask } from '../../context/TaskContext';
import { useIdentity } from '../../context/IdentityContext';
import { useLocation } from '../../hooks/useLocation';
import { useDomain } from '../../context/DomainContext';
import { acceptTask, setPaymentMethods, ApiError } from '../../services/api';
import { getSavedPaymentMethods } from '../../utils/payment-methods';
import { formatDistance, formatDuration } from '../../services/pricing';
import { formatScheduledTime, isUpcoming } from '../../utils/datetime';
import { dispatchService } from '../../services/dispatch';
import { loadVehicle } from '../../utils/vehicle';
import { loadGender } from '../../utils/gender';
import { useT } from '../../i18n';

export function IncomingTaskPage() {
  const navigate = useNavigate();
  const { t, td } = useT();
  const { activeTask, setActiveTask } = useTask();
  const { identity } = useIdentity();
  const { location } = useLocation();
  const { profile } = useDomain();
  const [accepting, setAccepting] = useState(false);

  const originLabel = td(profile?.labels?.originLabel || 'Pickup');
  const destinationLabel = td(profile?.labels?.destinationLabel || 'Dropoff');
  const requiresDestination = profile?.features.requiresDestination !== false;
  const taskNoun = td(profile?.labels?.taskNoun || 'task');

  useEffect(() => {
    if (!activeTask) navigate('/provide');
  }, [activeTask, navigate]);

  if (!activeTask) return null;

  const handleAccept = async () => {
    if (!identity || accepting) return;
    setAccepting(true);
    try {
      const updated = await acceptTask(activeTask.id, {
        providerPubkey: identity.pubKeyHex,
        providerNpub: identity.npub,
        providerLocation: location,
        // The car the requester should look for (set on the profile page)
        vehicle: loadVehicle(),
        // Self-declared — required by the server for a women-only task
        gender: loadGender(),
      });
      dispatchService.removeAvailable(activeTask.id);
      setActiveTask(updated);

      // Best-effort: advertise the driver's saved payment methods on this ride
      // so the rider can pay directly. Never blocks accepting the job.
      const savedMethods = getSavedPaymentMethods();
      if (savedMethods.length > 0) {
        void setPaymentMethods(updated.id, { methods: savedMethods }).catch(() => {});
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

  const handleDecline = () => {
    setActiveTask(null);
    navigate('/provide');
  };

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
            <LocationMarker position={location} label={t('common.you')} colour="blue" />
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
          <p className="section-title text-center">
            {t('incoming.new', { label: requesterLabel, noun: taskNoun })}
          </p>

          <div className="text-center mb-3">
            <DualPrice sats={activeTask.fareEstimateSats} size="lg" />
          </div>

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
            <>
              <p className="text-xs font-mono text-donkey-muted text-center truncate">
                {requesterLabel}: {activeTask.requesterPubkey.slice(0, 16)}...
              </p>
              <div className="flex justify-center mt-1">
                <ReputationBadge subject={activeTask.requesterPubkey} />
              </div>
            </>
          )}
        </div>

        {activeTask.operatorBase ? (
          // Federated job — coordinated by another operator. Phase 1 is a
          // hand-off: open their driver app (the account is portable via
          // the recovery key).
          <div className="space-y-3">
            <p className="text-xs text-donkey-muted text-center">
              This {taskNoun} is coordinated by{' '}
              <span className="font-semibold text-donkey-purple">
                {new URL(activeTask.operatorBase).host}
              </span>{' '}
              (discovered via Nostr). Accept it in their app — your account
              works anywhere by restoring your recovery key.
            </p>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={handleDecline}>
                Dismiss
              </button>
              <a
                className="btn-primary flex-1 text-center"
                href={`${activeTask.operatorBase}/provide`}
                target="_blank"
                rel="noreferrer"
              >
                Open operator
              </a>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={handleDecline} disabled={accepting}>
              {t('common.decline')}
            </button>
            <button className="btn-primary flex-1" onClick={handleAccept} disabled={accepting}>
              {accepting ? t('common.accepting') : t('common.accept')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
