import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView } from '../../components/map/MapView';
import { LocationMarker } from '../../components/map/LocationMarker';
import { RoutePolyline } from '../../components/map/RoutePolyline';
import { DualPrice } from '../../components/common/DualPrice';
import { Loading } from '../../components/common/Loading';
import { useTask } from '../../context/TaskContext';
import { useIdentity } from '../../context/IdentityContext';
import { useDomain } from '../../context/DomainContext';
import { getTripEstimate, requestRide } from '../../services/api';
import { formatDistance, formatDuration } from '../../services/pricing';

export function RequestPage() {
  const navigate = useNavigate();
  const { pickup, dropoff, estimate, setEstimate, setActiveTask } = useTask();
  const { identity } = useIdentity();
  const { profile } = useDomain();
  const [loading, setLoading] = useState(false);
  const [estimating, setEstimating] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Redirect if no locations selected
  useEffect(() => {
    if (!pickup || !dropoff) {
      navigate('/ride');
    }
  }, [pickup, dropoff, navigate]);

  // Fetch estimate
  useEffect(() => {
    if (!pickup || !dropoff) return;
    setEstimating(true);
    getTripEstimate({ pickup, dropoff })
      .then((est) => {
        setEstimate(est);
        setEstimating(false);
      })
      .catch((err) => {
        setError(err.message);
        setEstimating(false);
      });
  }, [pickup, dropoff, setEstimate]);

  const handleRequest = async () => {
    if (!pickup || !dropoff || !identity) return;
    setLoading(true);
    setError(null);
    try {
      const task = await requestRide({
        pickup,
        dropoff,
        riderPubkey: identity.pubKeyHex,
        riderNpub: identity.npub,
      });
      setActiveTask(task);
      navigate('/ride/active');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request ride');
      setLoading(false);
    }
  };

  if (!pickup || !dropoff) return null;

  const midpoint = {
    lat: (pickup.lat + dropoff.lat) / 2,
    lng: (pickup.lng + dropoff.lng) / 2,
  };

  return (
    <div className="h-full flex flex-col">
      {/* Map */}
      <div className="flex-1 relative">
        <MapView centre={midpoint} zoom={13}>
          <LocationMarker position={pickup} label="Pickup" colour="green" />
          <LocationMarker position={dropoff} label="Dropoff" colour="red" />
          {estimate?.routeGeometry && (
            <RoutePolyline geometry={estimate.routeGeometry} />
          )}
        </MapView>
      </div>

      {/* Estimate panel */}
      <div className="bg-donkey-surface border-t border-donkey-border p-6">
        {estimating ? (
          <Loading message="Calculating estimate..." />
        ) : estimate ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-lg font-bold">
                  <DualPrice sats={estimate.fareEstimateSats} size="lg" />
                </p>
                <p className="text-donkey-muted text-sm mt-1">
                  {formatDistance(estimate.distanceKm)} &middot; {formatDuration(estimate.durationMinutes)}
                </p>
              </div>

              {estimate.fareBreakdown.surgeMultiplier > 1 && (
                <span className="bg-donkey-orange/20 text-donkey-orange text-xs font-bold px-3 py-1 rounded-full">
                  {estimate.fareBreakdown.surgeMultiplier.toFixed(1)}x surge
                </span>
              )}
            </div>

            {/* Fare breakdown */}
            <div className="grid grid-cols-3 gap-2 text-xs text-donkey-muted mb-4">
              <div>
                <p className="text-donkey-text font-bold">{estimate.fareBreakdown.baseFareSats}</p>
                <p>Base</p>
              </div>
              <div>
                <p className="text-donkey-text font-bold">{estimate.fareBreakdown.distanceFareSats}</p>
                <p>Distance</p>
              </div>
              <div>
                <p className="text-donkey-text font-bold">{estimate.fareBreakdown.operatorFeeSats}</p>
                <p>Operator fee</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                className="btn-secondary flex-1"
                onClick={() => navigate('/ride')}
              >
                Back
              </button>
              <button
                className="btn-primary flex-1"
                onClick={handleRequest}
                disabled={loading}
              >
                {loading ? 'Requesting...' : `Request ${profile?.roles.provider || 'Ride'}`}
              </button>
            </div>

            {error && <p className="text-donkey-red text-sm mt-3">{error}</p>}
          </div>
        ) : (
          <div className="text-center">
            <p className="text-donkey-red">{error || 'Failed to get estimate'}</p>
            <button className="btn-secondary mt-3" onClick={() => navigate('/ride')}>
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
