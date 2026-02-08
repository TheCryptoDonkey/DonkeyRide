import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView } from '../../components/map/MapView';
import { LocationMarker } from '../../components/map/LocationMarker';
import { DualPrice } from '../../components/common/DualPrice';
import { useTask } from '../../context/TaskContext';
import { useIdentity } from '../../context/IdentityContext';
import { useLocation } from '../../hooks/useLocation';
import { useDomain } from '../../context/DomainContext';
import { acceptTask } from '../../services/api';
import { formatDistance, formatDuration } from '../../services/pricing';

export function IncomingTaskPage() {
  const navigate = useNavigate();
  const { activeTask, setActiveTask } = useTask();
  const { identity } = useIdentity();
  const { location } = useLocation();
  const { profile } = useDomain();

  const originLabel = profile?.labels?.originLabel || 'Pickup';
  const destinationLabel = profile?.labels?.destinationLabel || 'Dropoff';
  const requiresDestination = profile?.features.requiresDestination !== false;
  const taskNoun = profile?.labels?.taskNoun || 'task';

  useEffect(() => {
    if (!activeTask) navigate('/provide');
  }, [activeTask, navigate]);

  if (!activeTask) return null;

  const handleAccept = async () => {
    if (!identity) return;
    try {
      const updated = await acceptTask(activeTask.id, {
        providerPubkey: identity.pubKeyHex,
        providerNpub: identity.npub,
        providerLocation: location,
      });
      setActiveTask(updated);
      navigate('/provide/active');
    } catch (err) {
      console.error('Accept failed:', err);
    }
  };

  const handleDecline = () => {
    setActiveTask(null);
    navigate('/provide');
  };

  const requesterLabel = profile?.roles.requester || 'Requester';

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
            <LocationMarker position={location} label="You" colour="blue" />
          </MapView>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-donkey-bg">
          <div className="card text-center max-w-sm">
            <p className="text-lg font-bold text-donkey-text">Incoming {taskNoun}</p>
            <p className="text-sm text-donkey-muted mt-1">
              A {profile?.roles.requester || 'requester'} needs your service
            </p>
          </div>
        </div>
      )}

      {/* Incoming task panel */}
      <div className="bg-donkey-surface border-t-2 border-donkey-border p-6 shadow-panel">
        <div className="incoming-card mb-4">
          <p className="section-title text-center">
            New {requesterLabel} {taskNoun}
          </p>

          <div className="text-center mb-3">
            <DualPrice sats={activeTask.fareEstimateSats} size="lg" />
          </div>

          {(activeTask.distanceKm || activeTask.durationMin) && (
            <div className="flex justify-center gap-4 text-sm text-donkey-muted mb-3">
              {activeTask.distanceKm != null && (
                <span>{formatDistance(activeTask.distanceKm)}</span>
              )}
              {activeTask.durationMin != null && (
                <span>{formatDuration(activeTask.durationMin)}</span>
              )}
            </div>
          )}

          {activeTask.requesterPubkey && (
            <p className="text-xs font-mono text-donkey-muted text-center truncate">
              {requesterLabel}: {activeTask.requesterPubkey.slice(0, 16)}...
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={handleDecline}>
            Decline
          </button>
          <button className="btn-primary flex-1" onClick={handleAccept}>
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
