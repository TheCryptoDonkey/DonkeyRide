import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { enableTaskPush } from '../../services/push';
import { formatDistance, formatDuration } from '../../services/pricing';
import { AddressSearch } from '../../components/AddressSearch';
import { useT } from '../../i18n';
import { loadGender } from '../../utils/gender';
import { favouritePubkeys } from '../../utils/favourites';
import { AccessNeedsPicker } from '../../components/task/AccessNeedsPicker';
import { loadAccessNeeds, saveAccessNeeds } from '../../utils/access-needs';
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
  const { t, td } = useT();
  const { origin, destination, estimate, setEstimate, setActiveTask, activeTask } = useTask();
  const { identity } = useIdentity();
  const { profile } = useDomain();
  const [loading, setLoading] = useState(false);
  const [estimating, setEstimating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // ?when=later lands here from the "nobody available" screen — a rider who
  // just failed to get a car now is being offered the booking, not the
  // identical attempt that just failed
  const [params] = useSearchParams();
  const [when, setWhen] = useState<'now' | 'later'>(
    params.get('when') === 'later' ? 'later' : 'now',
  );
  const [whenValue, setWhenValue] = useState<string>(() =>
    params.get('when') === 'later'
      ? toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000))
      : '',
  );
  // Intermediate stops in visit order (multi-stop trips)
  const [stops, setStops] = useState<TaskStop[]>([]);
  const [addingStop, setAddingStop] = useState(false);
  // Women-only matching — the toggle only exists for a declared woman
  const isWoman = loadGender() === 'woman';
  const [womenOnly, setWomenOnly] = useState(false);
  // Meeting instructions a pin cannot express
  const [pickupNote, setPickupNote] = useState('');
  // What this journey needs. Remembered on the device so a wheelchair user
  // is not re-declaring it every single time.
  const [accessNeeds, setAccessNeeds] = useState<string[]>(loadAccessNeeds);
  // Service class (Standard / Comfort / XL) — domains without classes
  // never show the picker
  const [option, setOption] = useState<string | null>(null);
  const serviceOptions = estimate?.options || [];
  const chosenOption = serviceOptions.find((o) => o.id === option) || serviceOptions[0] || null;
  // A class scales the whole rate card, so its rows — not the base class's —
  // are the ones that sum to the price on the button
  const breakdown = chosenOption?.fareBreakdown
    || estimate?.fareBreakdown
    || { baseFareSats: 0, distanceFareSats: 0, timeFareSats: 0, operatorFeeSats: 0 };
  // Saved providers get a short head start; the list never leaves the
  // device except as part of this request
  const favourites = favouritePubkeys();

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
  const originLabel = td(profile?.labels?.originLabel || 'Pickup');
  const destinationLabel = td(profile?.labels?.destinationLabel || 'Dropoff');
  const taskNoun = td(profile?.labels?.taskNoun || 'ride');

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
    // Lock-screen alerts for "on the way" and "I'm here". Fired from this
    // tap so the permission prompt is gesture-driven (Safari insists), and
    // never blocking: a refusal must not stop the request.
    void enableTaskPush(identity.pubKeyHex).catch(() => {});
    // Remember the needs so this is not re-declared on every journey
    saveAccessNeeds(accessNeeds);
    try {
      const task = await requestTask({
        pickup: origin,
        dropoff: requiresDestination ? destination! : null,
        requesterPubkey: identity.pubKeyHex,
        requesterNpub: identity.npub,
        domain: profile?.id,
        scheduledFor,
        stops: stops.length > 0 ? stops : undefined,
        womenOnly: isWoman && womenOnly,
        pickupNote: pickupNote.trim() || undefined,
        option: chosenOption?.id,
        accessNeeds: accessNeeds.length > 0 ? accessNeeds : undefined,
        // The multiplier this screen showed — the server will not exceed it
        surgeMultiplier: estimate?.surge?.multiplier,
        preferredProviders: favourites,
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

  const providerLabel = td(profile?.roles.provider || 'Provider');

  // Service classes — real prices, not a multiplier the rider must guess
  const optionPicker = serviceOptions.length > 1 ? (
    <div className="meta-card mb-4">
      <p className="meta-label mb-2">{t('request.optionTitle')}</p>
      <div className="space-y-2">
        {serviceOptions.map((o) => (
          <button
            key={o.id}
            className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${
              chosenOption?.id === o.id
                ? 'border-donkey-blue bg-donkey-blue/10'
                : 'border-donkey-border'
            }`}
            onClick={() => setOption(o.id)}
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-donkey-text">{o.label}</span>
              {o.description && (
                <span className="block text-xs text-donkey-muted truncate">{o.description}</span>
              )}
            </span>
            <span className="shrink-0">
              <DualPrice sats={o.fareSats} size="md" compact />
            </span>
          </button>
        ))}
      </div>
    </div>
  ) : null;

  // Multi-stop: add up to MAX_STOPS calling points along the way
  const stopsPicker = (
    <div className="meta-card mb-4">
      <p className="meta-label mb-2">{t('request.stopsTitle')}</p>
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
          placeholder={t('request.searchStop')}
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
          {t('request.addStop')}
        </button>
      ) : null}
      {stops.length > 0 && (
        <p className="text-donkey-muted text-xs mt-2">
          {t('request.stopsNote', { label: providerLabel.toLowerCase() })}
        </p>
      )}
    </div>
  );

  // "Black gate, side entrance" — the thing a dropped pin cannot say.
  // Participant-gated: it reaches the matched provider and nobody else.
  const notePicker = (
    <div className="meta-card mb-4">
      <p className="meta-label mb-2">{t('request.noteTitle', { label: providerLabel.toLowerCase() })}</p>
      <input
        type="text"
        className="w-full bg-donkey-bg border border-donkey-border rounded-lg px-3 py-2 text-donkey-text text-sm"
        value={pickupNote}
        maxLength={140}
        placeholder={t('request.notePlaceholder')}
        onChange={(e) => setPickupNote(e.target.value)}
      />
      <p className="text-donkey-muted text-xs mt-2">{t('request.noteHint')}</p>
    </div>
  );

  // "Leave now" vs pre-booked pickup — shared by both pricing layouts
  const whenPicker = (
    <div className="meta-card mb-4">
      <p className="meta-label mb-2">{t('request.whenTitle')}</p>
      <div className="flex gap-2">
        <button
          className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition-colors ${
            when === 'now'
              ? 'border-donkey-blue text-donkey-blue bg-donkey-blue/10'
              : 'border-donkey-border text-donkey-muted'
          }`}
          onClick={() => setWhen('now')}
        >
          {t('common.now')}
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
          {t('common.later')}
        </button>
      </div>
      {when === 'later' && (
        <div className="mt-3">
          <input
            type="datetime-local"
            aria-label={t('request.whenTitle')}
            className="w-full bg-donkey-bg border border-donkey-border rounded-lg px-3 py-2 text-donkey-text text-sm"
            value={whenValue}
            min={toLocalInputValue(new Date(Date.now() + MIN_SCHEDULE_AHEAD_MS))}
            max={toLocalInputValue(new Date(Date.now() + MAX_SCHEDULE_AHEAD_MS))}
            onChange={(e) => setWhenValue(e.target.value)}
          />
          {scheduleInvalid ? (
            <p className="text-donkey-orange text-xs mt-2">
              {t('request.scheduleInvalid')}
            </p>
          ) : (
            <p className="text-donkey-muted text-xs mt-2">
              {t('request.scheduleNote', { label: providerLabel.toLowerCase() })}
            </p>
          )}
        </div>
      )}
    </div>
  );

  // Women-only toggle — shown only when the rider declared woman on the
  // profile page. Self-attested matching; the note says so.
  const womenOnlyPicker = isWoman ? (
    <div className="meta-card mb-4">
      <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
        <input
          type="checkbox"
          className="w-5 h-5 accent-donkey-purple"
          checked={womenOnly}
          onChange={(e) => setWomenOnly(e.target.checked)}
        />
        <span className="text-sm text-donkey-text font-semibold">
          {t('women.requestToggle', { label: providerLabel.toLowerCase() + 's' })}
        </span>
      </label>
      {womenOnly && (
        <p className="text-donkey-muted text-xs mt-1">
          {t('women.requestNote', { label: providerLabel.toLowerCase() + 's' })}
        </p>
      )}
    </div>
  ) : null;

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
                label={t('request.stopLabel', { n: i + 1 })}
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
            <p className="text-lg font-bold text-donkey-text">{t('request.originSet', { label: originLabel })}</p>
            <p className="text-sm text-donkey-muted mt-1">{t('request.ready', { noun: taskNoun })}</p>
          </div>
        </div>
      )}

      {/* Estimate panel */}
      <div className="bg-donkey-surface border-t-2 border-donkey-border p-6 shadow-panel">
        {requiresDestination && estimating ? (
          <Loading message={t('request.estimating')} />
        ) : requiresDestination && estimate ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <DualPrice sats={chosenOption?.fareSats ?? estimate.fareEstimateSats} size="lg" />
                <p className="text-donkey-muted text-sm mt-1">
                  {formatDistance(estimate.distanceKm)} &middot; {formatDuration(estimate.durationMinutes)}
                </p>
              </div>
            </div>

            {/* Demand pricing, said plainly and BEFORE the tap. A rider who
                discovers a multiplier on the receipt has been ambushed. */}
            {estimate.surge?.active && (
              <div className="meta-card mb-4 border border-donkey-orange/50">
                <p className="text-sm font-bold text-donkey-orange">
                  {t('surge.title', { x: estimate.surge.multiplier.toFixed(1) })}
                </p>
                <p className="text-xs text-donkey-muted mt-1">
                  {t('surge.body', { label: providerLabel.toLowerCase() + 's' })}
                </p>
              </div>
            )}

            {/* Fare breakdown — the chosen class's own rows, in the same
                money the headline is in, and they sum to it */}
            <div className="meta-card mb-4">
              <p className="meta-label mb-2">{t('request.fareBreakdown')}</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <DualPrice sats={breakdown.baseFareSats} size="sm" compact />
                  <p className="text-donkey-muted">{t('request.base')}</p>
                </div>
                <div>
                  <DualPrice sats={breakdown.distanceFareSats} size="sm" compact />
                  <p className="text-donkey-muted">{t('request.distance')}</p>
                </div>
                <div>
                  <DualPrice sats={breakdown.timeFareSats} size="sm" compact />
                  <p className="text-donkey-muted">{t('request.time')}</p>
                </div>
              </div>
              {breakdown.operatorFeeSats > 0 && (
                <p className="text-donkey-muted text-xs mt-2">
                  {t('request.includesFee')}{' '}
                  <DualPrice sats={breakdown.operatorFeeSats} size="sm" compact />
                </p>
              )}
              {estimate.routed === false && (
                <p className="text-donkey-muted text-xs mt-2">{t('request.straightLine')}</p>
              )}
            </div>

            {optionPicker}

            {stopsPicker}

            {notePicker}

            <AccessNeedsPicker
              value={accessNeeds}
              onChange={setAccessNeeds}
              role="requester"
            />

            {whenPicker}

            {womenOnlyPicker}

            {favourites.length > 0 && when === 'now' && (
              <p className="text-donkey-muted text-xs mb-3">
                {t('request.favouritesFirst', { n: favourites.length })}
              </p>
            )}

            <div className="flex gap-3">
              <button
                className="btn-secondary flex-1"
                onClick={() => navigate('/request')}
              >
                {t('common.back')}
              </button>
              <button
                className="btn-primary flex-1"
                onClick={handleRequest}
                disabled={loading || scheduleInvalid}
              >
                {loading
                  ? t('request.requesting')
                  : when === 'later'
                    ? t('request.bookForLater', { label: providerLabel })
                    : t('request.request', { label: providerLabel })}
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

            {notePicker}

            {whenPicker}

            {womenOnlyPicker}

            <div className="flex gap-3">
              <button
                className="btn-secondary flex-1"
                onClick={() => navigate('/request')}
              >
                {t('common.back')}
              </button>
              <button
                className="btn-primary flex-1"
                onClick={handleRequest}
                disabled={loading || scheduleInvalid}
              >
                {loading
                  ? t('request.requesting')
                  : when === 'later'
                    ? t('request.bookLater')
                    : profile?.labels?.requestVerb || 'Request'}
              </button>
            </div>

            {error && <p className="text-donkey-red text-sm mt-3">{error}</p>}
          </div>
        ) : (
          <div className="text-center">
            <p className="text-donkey-red">{error || t('request.estimateFailed')}</p>
            <button className="btn-secondary mt-3" onClick={() => navigate('/request')}>
              {t('common.back')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
