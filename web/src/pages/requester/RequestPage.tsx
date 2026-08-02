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
import { getTripEstimate, requestTask, getOperatorInfoCached, getApiBase } from '../../services/api';
import { publishTaskAnnouncement } from '../../services/events';
import { formatDistance, formatDuration } from '../../services/pricing';
import { AddressSearch } from '../../components/AddressSearch';
import type { TaskStop } from '../../types/api';

const MAX_STOPS = 2;

/** Format a Date for a datetime-local input (local time, minute precision) */
function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const MIN_SCHEDULE_AHEAD_MS = 20 * 60 * 1000;
const MAX_SCHEDULE_AHEAD_MS = 30 * 24 * 3600 * 1000;

export function RequestPage() {
  const navigate = useNavigate();
  const { origin, destination, estimate, setEstimate, setActiveTask, activeTask } = useTask();
  const { identity } = useIdentity();
  const { profile } = useDomain();
  const [loading, setLoading] = useState(false);
  const [estimating, setEstimating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [whenValue, setWhenValue] = useState<string>('');
  // Intermediate stops in visit order (multi-stop trips)
  const [stops, setStops] = useState<TaskStop[]>([]);
  const [addingStop, setAddingStop] = useState(false);

  // Resolved pickup time (unix ms) when scheduling; null = leave now
  const scheduledFor = when === 'later' && whenValue
    ? new Date(whenValue).getTime()
    : null;
  const scheduleInvalid = when === 'later' && (
    !scheduledFor
    || scheduledFor < Date.now() + MIN_SCHEDULE_AHEAD_MS
    || scheduledFor > Date.now() + MAX_SCHEDULE_AHEAD_MS
  );

  const requiresDestination = profile?.features.requiresDestination !== false;
  const originLabel = profile?.labels?.originLabel || 'Pickup';
  const destinationLabel = profile?.labels?.destinationLabel || 'Dropoff';
  const taskNoun = profile?.labels?.taskNoun || 'ride';

  // Back-navigation guard: an existing active task means no second request
  useEffect(() => {
    if (activeTask && profile && !profile.states.terminal.includes(activeTask.status)) {
      navigate('/request/active', { replace: true });
    }
  }, [activeTask, profile, navigate]);

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
    getTripEstimate({ pickup: origin, dropoff: destination, stops })
      .then((est) => {
        setEstimate(est);
        setEstimating(false);
      })
      .catch((err) => {
        setError(err.message);
        setEstimating(false);
      });
  }, [origin, destination, stops, setEstimate, requiresDestination]);

  const handleRequest = async () => {
    if (!origin || !identity) return;
    if (requiresDestination && !destination) return;
    if (scheduleInvalid) return;
    setLoading(true);
    setError(null);
    try {
      const task = await requestTask({
        pickup: origin,
        dropoff: requiresDestination ? destination! : null,
        requesterPubkey: identity.pubKeyHex,
        requesterNpub: identity.npub,
        domain: profile?.id,
        scheduledFor,
        stops: stops.length > 0 ? stops : undefined,
      });
      setActiveTask(task);
      // Decentralised announcement — geohash-only, best-effort, relays only.
      // Operator tags let drivers on OTHER operators discover this job.
      if (profile?.id) {
        void getOperatorInfoCached()
          .then((info) => publishTaskAnnouncement(task.id, origin, profile.id, identity.privKeyHex, {
            pubkey: info.pubkey || null,
            api: getApiBase(),
            scheduledFor,
          }))
          .catch(() => publishTaskAnnouncement(task.id, origin, profile.id, identity.privKeyHex, { scheduledFor }));
      }
      navigate('/request/active');
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to request ${taskNoun}`);
      setLoading(false);
    }
  };

  if (!origin) return null;

  const providerLabel = profile?.roles.provider || 'Provider';

  // Multi-stop: add up to MAX_STOPS calling points along the way
  const stopsPicker = (
    <div className="meta-card mb-4">
      <p className="meta-label mb-2">Stops along the way</p>
      {stops.map((stop, i) => (
        <div key={`${stop.lat},${stop.lng},${i}`} className="flex items-center gap-2 mb-2">
          <span className="text-donkey-blue text-xs font-black w-5">{i + 1}.</span>
          <p className="flex-1 text-sm text-donkey-text truncate">
            {stop.address || `${stop.lat.toFixed(4)}, ${stop.lng.toFixed(4)}`}
          </p>
          <button
            className="text-donkey-muted text-xs"
            onClick={() => setStops(stops.filter((_, j) => j !== i))}
            aria-label={`Remove stop ${i + 1}`}
          >
            ✕
          </button>
        </div>
      ))}
      {addingStop ? (
        <AddressSearch
          placeholder="Search for a stop..."
          biasLocation={origin}
          autoFocus
          onSelect={(loc, label) => {
            setStops([...stops, { ...loc, address: label }]);
            setAddingStop(false);
          }}
        />
      ) : stops.length < MAX_STOPS ? (
        <button
          className="text-donkey-blue text-sm font-semibold"
          onClick={() => setAddingStop(true)}
        >
          + Add a stop
        </button>
      ) : null}
      {stops.length > 0 && (
        <p className="text-donkey-muted text-xs mt-2">
          Your {providerLabel.toLowerCase()} visits each stop in order — the
          fare covers the full route.
        </p>
      )}
    </div>
  );

  // "Leave now" vs pre-booked pickup — shared by both pricing layouts
  const whenPicker = (
    <div className="meta-card mb-4">
      <p className="meta-label mb-2">When do you need it?</p>
      <div className="flex gap-2">
        <button
          className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition-colors ${
            when === 'now'
              ? 'border-donkey-blue text-donkey-blue bg-donkey-blue/10'
              : 'border-donkey-border text-donkey-muted'
          }`}
          onClick={() => setWhen('now')}
        >
          Now
        </button>
        <button
          className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition-colors ${
            when === 'later'
              ? 'border-donkey-blue text-donkey-blue bg-donkey-blue/10'
              : 'border-donkey-border text-donkey-muted'
          }`}
          onClick={() => {
            setWhen('later');
            if (!whenValue) {
              setWhenValue(toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000)));
            }
          }}
        >
          Later
        </button>
      </div>
      {when === 'later' && (
        <div className="mt-3">
          <input
            type="datetime-local"
            className="w-full bg-donkey-bg border border-donkey-border rounded-lg px-3 py-2 text-donkey-text text-sm"
            value={whenValue}
            min={toLocalInputValue(new Date(Date.now() + MIN_SCHEDULE_AHEAD_MS))}
            max={toLocalInputValue(new Date(Date.now() + MAX_SCHEDULE_AHEAD_MS))}
            onChange={(e) => setWhenValue(e.target.value)}
          />
          {scheduleInvalid ? (
            <p className="text-donkey-orange text-xs mt-2">
              Pick a time between 20 minutes and 30 days from now.
            </p>
          ) : (
            <p className="text-donkey-muted text-xs mt-2">
              A {providerLabel.toLowerCase()} can commit early — you'll both get a
              reminder as the time approaches.
            </p>
          )}
        </div>
      )}
    </div>
  );

  const mapCentre = destination
    ? { lat: (origin.lat + destination.lat) / 2, lng: (origin.lng + destination.lng) / 2 }
    : origin;

  return (
    <div className="h-full flex flex-col">
      {/* Map */}
      {profile?.features.navigation !== false ? (
        <div className="flex-1 relative">
          <MapView centre={mapCentre} zoom={13}>
            <LocationMarker position={origin} label={originLabel} colour="green" />
            {stops.map((stop, i) => (
              <LocationMarker
                key={`${stop.lat},${stop.lng},${i}`}
                position={stop}
                label={`Stop ${i + 1}`}
                colour="blue"
              />
            ))}
            {destination && <LocationMarker position={destination} label={destinationLabel} colour="red" />}
            {estimate?.routeGeometry && (
              <RoutePolyline geometry={estimate.routeGeometry} />
            )}
          </MapView>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-donkey-bg">
          <div className="card text-center max-w-sm">
            <p className="text-lg font-bold text-donkey-text">{originLabel} set</p>
            <p className="text-sm text-donkey-muted mt-1">Ready to request a {taskNoun}</p>
          </div>
        </div>
      )}

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

            {stopsPicker}

            {whenPicker}

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
                disabled={loading || scheduleInvalid}
              >
                {loading
                  ? 'Requesting...'
                  : when === 'later'
                    ? `Book ${providerLabel} for later`
                    : `${profile?.labels?.requestVerb || 'Request'} ${providerLabel}`}
              </button>
            </div>

            {error && <p className="text-donkey-red text-sm mt-3">{error}</p>}
          </div>
        ) : !requiresDestination ? (
          /* Non-distance pricing — display depends on the pricingModel */
          <div>
            <div className="mb-4 text-center">
              {profile?.pricingModel === 'flatRate' && (
                <>
                  <p className="text-lg font-bold text-donkey-text">Flat rate pricing</p>
                  <p className="text-donkey-muted text-sm mt-1">
                    Price confirmed after {profile?.roles.provider || 'provider'} assessment
                  </p>
                </>
              )}
              {profile?.pricingModel === 'quote' && (
                <>
                  <p className="text-lg font-bold text-donkey-text">Quote-based pricing</p>
                  <p className="text-donkey-muted text-sm mt-1">
                    {profile?.roles.provider || 'Provider'} will submit a quote for your approval
                  </p>
                </>
              )}
              {profile?.pricingModel === 'hourly' && (
                <>
                  <p className="text-lg font-bold text-donkey-text">Hourly rate</p>
                  <p className="text-donkey-muted text-sm mt-1">
                    Billed by the hour. Final price based on time spent
                  </p>
                </>
              )}
              {profile?.pricingModel === 'milestone' && (
                <>
                  <p className="text-lg font-bold text-donkey-text">Milestone pricing</p>
                  <p className="text-donkey-muted text-sm mt-1">
                    Payment at agreed milestones throughout the {taskNoun}
                  </p>
                </>
              )}
              {(!profile?.pricingModel || profile?.pricingModel === 'distance_time_surge') && (
                <>
                  <p className="text-lg font-bold text-donkey-text">Service request</p>
                  <p className="text-donkey-muted text-sm mt-1">
                    Price confirmed after {profile?.roles.provider || 'provider'} assessment
                  </p>
                </>
              )}
            </div>

            {whenPicker}

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
                disabled={loading || scheduleInvalid}
              >
                {loading
                  ? 'Requesting...'
                  : when === 'later'
                    ? 'Book for later'
                    : profile?.labels?.requestVerb || 'Request'}
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
