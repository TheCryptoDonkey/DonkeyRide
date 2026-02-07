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
import { getTripEstimate, requestTask } from '../../services/api';
import { formatDistance, formatDuration } from '../../services/pricing';

export function RequestPage() {
  const navigate = useNavigate();
  const { origin, destination, estimate, setEstimate, setActiveTask } = useTask();
  const { identity } = useIdentity();
  const { profile } = useDomain();
  const [loading, setLoading] = useState(false);
  const [estimating, setEstimating] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requiresDestination = profile?.features.requiresDestination !== false;
  const originLabel = profile?.labels?.originLabel || 'Pickup';
  const destinationLabel = profile?.labels?.destinationLabel || 'Dropoff';
  const taskNoun = profile?.labels?.taskNoun || 'ride';

  // Redirect if no origin, or no destination when required
  useEffect(() => {
    if (!origin) {
      navigate('/request');
      return;
    }
    if (requiresDestination && !destination) {
      navigate('/request');
    }
  }, [origin, destination, navigate, requiresDestination]);

  // Fetch estimate (only for two-location domains)
  useEffect(() => {
    if (!origin) return;
    if (!requiresDestination) {
      // Single-location domain — no route to estimate
      setEstimating(false);
      return;
    }
    if (!destination) return;
    setEstimating(true);
    getTripEstimate({ pickup: origin, dropoff: destination })
      .then((est) => {
        setEstimate(est);
        setEstimating(false);
      })
      .catch((err) => {
        setError(err.message);
        setEstimating(false);
      });
  }, [origin, destination, setEstimate, requiresDestination]);

  const handleRequest = async () => {
    if (!origin || !identity) return;
    if (requiresDestination && !destination) return;
    setLoading(true);
    setError(null);
    try {
      const task = await requestTask({
        pickup: origin,
        dropoff: requiresDestination ? destination! : null,
        requesterPubkey: identity.pubKeyHex,
        requesterNpub: identity.npub,
      });
      setActiveTask(task);
      navigate('/request/active');
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to request ${taskNoun}`);
      setLoading(false);
    }
  };

  if (!origin) return null;

  const mapCentre = destination
    ? { lat: (origin.lat + destination.lat) / 2, lng: (origin.lng + destination.lng) / 2 }
    : origin;

  return (
    <div className="h-full flex flex-col">
      {/* Map */}
      <div className="flex-1 relative">
        <MapView centre={mapCentre} zoom={13}>
          <LocationMarker position={origin} label={originLabel} colour="green" />
          {destination && <LocationMarker position={destination} label={destinationLabel} colour="red" />}
          {estimate?.routeGeometry && (
            <RoutePolyline geometry={estimate.routeGeometry} />
          )}
        </MapView>
      </div>

      {/* Estimate panel */}
      <div className="bg-donkey-surface border-t-2 border-donkey-border p-6 shadow-panel">
        {requiresDestination && estimating ? (
          <Loading message="Calculating estimate..." />
        ) : requiresDestination && estimate ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <DualPrice sats={estimate.fareEstimateSats} size="lg" />
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
            <div className="meta-card mb-4">
              <p className="meta-label mb-2">Fare breakdown</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-donkey-text font-bold">{estimate.fareBreakdown.baseFareSats} sats</p>
                  <p className="text-donkey-muted">Base</p>
                </div>
                <div>
                  <p className="text-donkey-text font-bold">{estimate.fareBreakdown.distanceFareSats} sats</p>
                  <p className="text-donkey-muted">Distance</p>
                </div>
                <div>
                  <p className="text-donkey-text font-bold">{estimate.fareBreakdown.operatorFeeSats} sats</p>
                  <p className="text-donkey-muted">Operator</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                className="btn-secondary flex-1"
                onClick={() => navigate('/request')}
              >
                Back
              </button>
              <button
                className="btn-primary flex-1"
                onClick={handleRequest}
                disabled={loading}
              >
                {loading ? 'Requesting...' : `${profile?.labels?.requestVerb || 'Request'} ${profile?.roles.provider || 'Provider'}`}
              </button>
            </div>

            {error && <p className="text-donkey-red text-sm mt-3">{error}</p>}
          </div>
        ) : !requiresDestination ? (
          /* Single-location domain — flat-rate / quote-based pricing info */
          <div>
            <div className="mb-4 text-center">
              <p className="text-lg font-bold text-donkey-text">
                {profile?.pricingModel === 'flatRate' ? 'Flat rate pricing' : 'Quote-based pricing'}
              </p>
              <p className="text-donkey-muted text-sm mt-1">
                Price confirmed after {profile?.roles.provider || 'provider'} assessment
              </p>
            </div>

            <div className="flex gap-3">
              <button
                className="btn-secondary flex-1"
                onClick={() => navigate('/request')}
              >
                Back
              </button>
              <button
                className="btn-primary flex-1"
                onClick={handleRequest}
                disabled={loading}
              >
                {loading ? 'Requesting...' : profile?.labels?.requestVerb || 'Request'}
              </button>
            </div>

            {error && <p className="text-donkey-red text-sm mt-3">{error}</p>}
          </div>
        ) : (
          <div className="text-center">
            <p className="text-donkey-red">{error || 'Failed to get estimate'}</p>
            <button className="btn-secondary mt-3" onClick={() => navigate('/request')}>
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
