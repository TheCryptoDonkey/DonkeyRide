import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView } from '../../components/map/MapView';
import { LocationMarker } from '../../components/map/LocationMarker';
import { DualPrice } from '../../components/common/DualPrice';
import { useTask } from '../../context/TaskContext';
import { useIdentity } from '../../context/IdentityContext';
import { useLocation } from '../../hooks/useLocation';
import { useDomain } from '../../context/DomainContext';
import { acceptRide } from '../../services/api';
import { formatDistance, formatDuration } from '../../services/pricing';

export function IncomingTaskPage() {
  const navigate = useNavigate();
  const { activeTask, setActiveTask } = useTask();
  const { identity } = useIdentity();
  const { location } = useLocation();
  const { profile } = useDomain();

  useEffect(() => {
    if (!activeTask) navigate('/drive');
  }, [activeTask, navigate]);

  if (!activeTask) return null;

  const handleAccept = async () => {
    if (!identity) return;
    try {
      const updated = await acceptRide(activeTask.id, {
        driverPubkey: identity.pubKeyHex,
        driverNpub: identity.npub,
        driverLocation: location,
      });
      setActiveTask(updated);
      navigate('/drive/active');
    } catch (err) {
      console.error('Accept failed:', err);
    }
  };

  const handleDecline = () => {
    setActiveTask(null);
    navigate('/drive');
  };

  const requesterLabel = profile?.roles.requester || 'Rider';

  return (
    <div className="h-full flex flex-col">
      {/* Map with pickup/dropoff */}
      <div className="flex-1 relative">
        <MapView centre={activeTask.pickup} zoom={14}>
          <LocationMarker position={activeTask.pickup} label="Pickup" colour="green" />
          <LocationMarker position={activeTask.dropoff} label="Dropoff" colour="red" />
          <LocationMarker position={location} label="You" colour="blue" />
        </MapView>
      </div>

      {/* Incoming ride panel */}
      <div className="bg-donkey-surface border-t border-donkey-border p-6 space-y-4">
        <div className="text-center">
          <p className="text-lg font-bold text-donkey-purple">
            New {requesterLabel} Request
          </p>
          <DualPrice sats={activeTask.fareEstimateSats} size="lg" className="mt-2" />
        </div>

        {activeTask.distanceKm && activeTask.durationMin && (
          <p className="text-donkey-muted text-sm text-center">
            {formatDistance(activeTask.distanceKm)} &middot; {formatDuration(activeTask.durationMin)}
          </p>
        )}

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
