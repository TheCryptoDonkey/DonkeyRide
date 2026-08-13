import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MapView } from '../../components/map/MapView';
import { LocationMarker } from '../../components/map/LocationMarker';
import { RoutePolyline } from '../../components/map/RoutePolyline';
import { DualPrice } from '../../components/common/DualPrice';
import { Loading } from '../../components/common/Loading';
import { Sheet, SheetSection } from '../../components/layout/Sheet';
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
import { formatScheduledTime } from '../../utils/datetime';
import { recordAgreedRate } from '../../utils/agreed-rate';
import { peekBtcPrices } from '../../hooks/useBtcPrices';
import type { TaskStop } from '../../types/api';
import { generateHandoffCode, saveHandoffCodes } from '../../utils/handoff-codes';

const MAX_STOPS = 5;
const MAX_LIFT_PASSENGERS = 6;

interface LiftPassengerDraft {
  id: string;
  name: string;
  guardianName: string;
  note: string;
  handoffCode: string;
  dropoff: TaskStop;
}

function newLiftPassenger(dropoff: TaskStop): LiftPassengerDraft {
  return {
    id: crypto.randomUUID(),
    name: '',
    guardianName: '',
    note: '',
    handoffCode: generateHandoffCode(),
    dropoff,
  };
}

/** Format a Date for a datetime-local input (local time, minute precision) */
function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const MIN_SCHEDULE_AHEAD_MS = 20 * 60 * 1000;
const MAX_SCHEDULE_AHEAD_MS = 30 * 24 * 3600 * 1000;

/**
 * Confirm the job.
 *
 * This screen used to stack eight always-open blocks under a map that
 * `flex-1` then squeezed to nothing — price, breakdown, class picker,
 * stops, note, access needs, timing, women-only — with the primary button
 * somewhere past the bottom of the fold, and the CLASS PICKER BELOW THE
 * BREAKDOWN IT DETERMINES. It now follows the shape the active screens
 * already use: what you are buying stays visible, the choices that change
 * it lead, everything optional is one tap away, and the action bar is
 * pinned so the price you are agreeing to is on the button you press.
 */
export function RequestPage() {
  const navigate = useNavigate();
  const { t, td } = useT();
  const {
    origin, destination, originAddress, destinationAddress,
    estimate, setEstimate, setActiveTask, activeTask,
  } = useTask();
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
  // Booking for somebody else — a parent sending a child home, an office
  // booking for a client. The provider needs a name to call out.
  const [forSomeoneElse, setForSomeoneElse] = useState(false);
  const [passengerName, setPassengerName] = useState('');
  const [passengerNote, setPassengerNote] = useState('');
  const communityLift = profile?.features.multiPassengerHandoffs === true;
  const settlementRequired = profile?.features.settlementRequired !== false;
  const [liftPassengers, setLiftPassengers] = useState<LiftPassengerDraft[]>(() =>
    destination ? [newLiftPassenger({ ...destination, address: destinationAddress || undefined })] : [],
  );
  const [addingPassenger, setAddingPassenger] = useState(false);
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
  const routeStops = useMemo(
    () => communityLift ? liftPassengers.slice(0, -1).map((p) => p.dropoff) : stops,
    [communityLift, liftPassengers, stops],
  );
  const passengersInvalid = communityLift && (
    liftPassengers.length < 1
    || liftPassengers.some((p) => !p.name.trim())
    || Boolean(chosenOption?.seats && liftPassengers.length > chosenOption.seats)
  );

  useEffect(() => {
    if (!communityLift || !destination) return;
    setLiftPassengers((current) => {
      if (current.length === 0) {
        return [newLiftPassenger({ ...destination, address: destinationAddress || undefined })];
      }
      const last = current[current.length - 1];
      const address = destinationAddress || undefined;
      if (last.dropoff.lat === destination.lat && last.dropoff.lng === destination.lng
          && last.dropoff.address === address) return current;
      return [
        ...current.slice(0, -1),
        { ...last, dropoff: { ...destination, address } },
      ];
    });
  }, [communityLift, destination, destinationAddress]);

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
  const providerLabel = td(profile?.roles.provider || 'Provider');
  const requestVerb = td(profile?.labels?.requestVerb || 'Request');

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
    getTripEstimate({ pickup: origin, dropoff: destination, stops: routeStops, domain: profile?.id })
      .then((est) => {
        setEstimate(est);
        setEstimating(false);
      })
      .catch((err) => {
        setError(err.message);
        setEstimating(false);
      });
  }, [origin, destination, routeStops, setEstimate, requiresDestination, profile?.id]);

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
        // The names these places were chosen by. Without them the provider
        // navigates to decimals and the receipt is unreadable later.
        pickupAddress: originAddress || undefined,
        dropoffAddress: requiresDestination ? (destinationAddress || undefined) : undefined,
        domain: profile?.id,
        scheduledFor,
        stops: routeStops.length > 0 ? routeStops : undefined,
        womenOnly: isWoman && womenOnly,
        pickupNote: pickupNote.trim() || undefined,
        option: chosenOption?.id,
        accessNeeds: accessNeeds.length > 0 ? accessNeeds : undefined,
        // The multiplier this screen showed — the server will not exceed it
        surgeMultiplier: estimate?.surge?.multiplier,
        // ...and the quote itself, so the fare recorded is the fare shown
        quoteId: estimate?.quoteId,
        preferredProviders: favourites,
        passenger: forSomeoneElse && (passengerName.trim() || passengerNote.trim())
          ? { name: passengerName.trim() || undefined, note: passengerNote.trim() || undefined }
          : null,
        passengers: communityLift ? liftPassengers.map((passenger) => ({
          id: passenger.id,
          name: passenger.name.trim(),
          guardianName: passenger.guardianName.trim() || undefined,
          note: passenger.note.trim() || undefined,
          handoffCode: passenger.handoffCode,
          dropoff: passenger.dropoff,
        })) : undefined,
      });
      if (communityLift) {
        saveHandoffCodes(task.id, Object.fromEntries(
          liftPassengers.map((passenger) => [passenger.id, passenger.handoffCode]),
        ));
      }
      setActiveTask(task);
      // The rate behind the number just agreed to. Without it the completion
      // screen reconverts the same sats at a rate that has since moved, and
      // reports an "agreed amount" nobody agreed to.
      if (settlementRequired) recordAgreedRate(task.id, peekBtcPrices());
      // Decentralised announcement — geohash-only, best-effort, relays only.
      // Operator tags let drivers on OTHER operators discover this job.
      if (profile?.id) {
        void getOperatorInfoCached()
          .then((info) => publishTaskAnnouncement(task.id, origin, profile.id, {
            pubkey: info.pubkey || null,
            api: getApiBase(),
            scheduledFor,
          }))
          .catch(() => publishTaskAnnouncement(task.id, origin, profile.id, { scheduledFor }));
      }
      navigate('/request/active');
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to request ${taskNoun}`);
      setLoading(false);
    }
  };

  if (!origin) return null;

  const headlineSats = chosenOption?.fareSats ?? estimate?.fareEstimateSats ?? 0;

  // ── The choices, each one tap away ──────────────────────────────

  /** Service classes — real prices, and ABOVE the breakdown they determine */
  const optionPicker = serviceOptions.length > 1 ? (
    <div className="space-y-2">
      <p className="meta-label">{t('request.optionTitle')}</p>
      {serviceOptions.map((o) => (
        <button
          key={o.id}
          aria-pressed={chosenOption?.id === o.id}
          className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg border text-left transition-colors min-h-[52px] ${
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
          {settlementRequired && (
            <span className="shrink-0">
              <DualPrice sats={o.fareSats} size="md" compact />
            </span>
          )}
        </button>
      ))}
    </div>
  ) : null;

  const fareBreakdown = (
    <>
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
      {estimate?.routed === false && (
        <p className="text-donkey-muted text-xs mt-2">{t('request.straightLine')}</p>
      )}
    </>
  );

  const stopsPicker = (
    <>
      {stops.map((stop, i) => (
        <div key={`${stop.lat},${stop.lng},${i}`} className="flex items-center gap-2 mb-2">
          <span className="text-donkey-blue text-xs font-black w-5">{i + 1}.</span>
          <p className="flex-1 text-sm text-donkey-text truncate">
            {stop.address || `${stop.lat.toFixed(4)}, ${stop.lng.toFixed(4)}`}
          </p>
          <button
            className="text-donkey-muted text-xs min-h-[44px] px-2"
            onClick={() => setStops(stops.filter((_, j) => j !== i))}
            aria-label={t('request.removeStop', { n: i + 1 })}
          >
            ✕
          </button>
        </div>
      ))}
      {addingStop ? (
        <AddressSearch
          name="additional-stop-address"
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
          className="text-donkey-blue text-sm font-semibold min-h-[44px]"
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
    </>
  );

  const notePicker = (
    <>
      <input
        type="text"
        className="w-full bg-donkey-bg border border-donkey-border rounded-lg px-3 py-2 text-donkey-text text-sm"
        value={pickupNote}
        maxLength={140}
        aria-label={t('request.noteTitle', { label: providerLabel.toLowerCase() })}
        placeholder={t('request.notePlaceholder')}
        onChange={(e) => setPickupNote(e.target.value)}
      />
      <p className="text-donkey-muted text-xs mt-2">{t('request.noteHint')}</p>
    </>
  );

  /** Booking for somebody else: who is actually travelling */
  const passengerPicker = (
    <>
      <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
        <input
          type="checkbox"
          className="w-5 h-5 accent-donkey-blue"
          checked={forSomeoneElse}
          onChange={(e) => setForSomeoneElse(e.target.checked)}
        />
        <span className="text-sm text-donkey-text font-semibold">
          {t('passenger.toggle', { noun: taskNoun })}
        </span>
      </label>
      {forSomeoneElse && (
        <div className="space-y-2 mt-2">
          <input
            type="text"
            className="w-full bg-donkey-bg border border-donkey-border rounded-lg px-3 py-2 text-donkey-text text-sm"
            value={passengerName}
            maxLength={60}
            aria-label={t('passenger.name')}
            placeholder={t('passenger.namePlaceholder')}
            onChange={(e) => setPassengerName(e.target.value)}
          />
          <input
            type="text"
            className="w-full bg-donkey-bg border border-donkey-border rounded-lg px-3 py-2 text-donkey-text text-sm"
            value={passengerNote}
            maxLength={140}
            aria-label={t('passenger.note')}
            placeholder={t('passenger.notePlaceholder')}
            onChange={(e) => setPassengerNote(e.target.value)}
          />
          <p className="text-donkey-muted text-xs">
            {t('passenger.privacy', { label: providerLabel.toLowerCase() })}
          </p>
        </div>
      )}
    </>
  );

  const liftPassengerPicker = (
    <div className="space-y-3" data-testid="community-lift-passengers">
      <p className="text-donkey-muted text-xs">{t('lift.passengersHint')}</p>
      {liftPassengers.map((passenger, index) => {
        const isLast = index === liftPassengers.length - 1;
        const update = (change: Partial<LiftPassengerDraft>) => {
          setLiftPassengers((current) => current.map((item) =>
            item.id === passenger.id ? { ...item, ...change } : item));
        };
        return (
          <div key={passenger.id} className="meta-card space-y-2" data-testid={`lift-passenger-${index}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-donkey-text">
                {t('lift.passengerNumber', { n: index + 1 })}
              </p>
              {!isLast && (
                <button
                  type="button"
                  className="text-donkey-muted text-xs min-h-[44px] px-2"
                  onClick={() => setLiftPassengers((current) => current.filter((p) => p.id !== passenger.id))}
                  aria-label={t('lift.removePassenger', { n: index + 1 })}
                >
                  {t('common.remove')}
                </button>
              )}
            </div>
            <input
              type="text"
              className="w-full bg-donkey-bg border border-donkey-border rounded-lg px-3 py-2 text-donkey-text text-sm min-h-[44px]"
              value={passenger.name}
              maxLength={60}
              aria-label={t('lift.passengerName', { n: index + 1 })}
              placeholder={t('lift.passengerNamePlaceholder')}
              onChange={(event) => update({ name: event.target.value })}
            />
            <input
              type="text"
              className="w-full bg-donkey-bg border border-donkey-border rounded-lg px-3 py-2 text-donkey-text text-sm min-h-[44px]"
              value={passenger.guardianName}
              maxLength={60}
              aria-label={t('lift.guardianName', { n: index + 1 })}
              placeholder={t('lift.guardianPlaceholder')}
              onChange={(event) => update({ guardianName: event.target.value })}
            />
            <p className="text-xs text-donkey-muted">
              <span className="font-semibold text-donkey-text">
                {isLast ? t('lift.lastDropoff') : t('lift.dropoff', { n: index + 1 })}:
              </span>{' '}
              {passenger.dropoff.address
                || `${passenger.dropoff.lat.toFixed(4)}, ${passenger.dropoff.lng.toFixed(4)}`}
            </p>
          </div>
        );
      })}
      {addingPassenger ? (
        <AddressSearch
          name="community-passenger-dropoff"
          placeholder={t('lift.searchDropoff')}
          biasLocation={origin}
          autoFocus
          onSelect={(loc, label) => {
            setLiftPassengers((current) => {
              const next = newLiftPassenger({ ...loc, address: label });
              return current.length > 0
                ? [...current.slice(0, -1), next, current[current.length - 1]]
                : [next];
            });
            setAddingPassenger(false);
          }}
        />
      ) : liftPassengers.length < MAX_LIFT_PASSENGERS ? (
        <button
          type="button"
          className="text-donkey-blue text-sm font-semibold min-h-[44px]"
          onClick={() => setAddingPassenger(true)}
        >
          {t('lift.addPassenger')}
        </button>
      ) : null}
      <p className="text-donkey-muted text-xs">{t('lift.codePrivacy')}</p>
    </div>
  );

  const whenPicker = (
    <>
      <div className="flex gap-2">
        <button
          aria-pressed={when === 'now'}
          className={`flex-1 min-h-[44px] rounded-lg border text-sm font-semibold transition-colors ${
            when === 'now'
              ? 'border-donkey-blue text-donkey-blue bg-donkey-blue/10'
              : 'border-donkey-border text-donkey-muted'
          }`}
          onClick={() => setWhen('now')}
        >
          {t('common.now')}
        </button>
        <button
          aria-pressed={when === 'later'}
          className={`flex-1 min-h-[44px] rounded-lg border text-sm font-semibold transition-colors ${
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
            <p className="text-donkey-orange text-xs mt-2">{t('request.scheduleInvalid')}</p>
          ) : (
            <p className="text-donkey-muted text-xs mt-2">
              {t('request.scheduleNote', { label: providerLabel.toLowerCase() })}
            </p>
          )}
        </div>
      )}
    </>
  );

  const womenOnlyPicker = isWoman ? (
    <div className="meta-card">
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

  // The one control that must never be below the fold
  const actionBar = (
    <div className="bg-donkey-surface border-t-2 border-donkey-border px-5 py-3 shadow-panel">
      {profile?.operational === false && (
        <p className="text-donkey-orange text-sm mb-2" role="alert">
          {profile.unavailableReason || t('domain.notReady')}
        </p>
      )}
      {error && <p className="text-donkey-red text-sm mb-2">{error}</p>}
      <div className="flex gap-3">
        <button className="btn-secondary px-5" onClick={() => navigate('/request')}>
          {t('common.back')}
        </button>
        <button
          className="btn-primary flex-1 flex items-center justify-center gap-2"
          onClick={handleRequest}
          disabled={profile?.operational === false || loading || scheduleInvalid || passengersInvalid || (requiresDestination && estimating)}
        >
          <span>
            {loading
              ? t('request.requesting')
              : when === 'later'
                ? t('request.bookForLater', { label: providerLabel })
                : `${requestVerb} ${providerLabel}`}
          </span>
          {/* The number you are agreeing to, on the button that agrees to it */}
          {requiresDestination && !loading && headlineSats > 0 && (
            <span className="opacity-90">
              · <DualPrice sats={headlineSats} size="sm" compact />
            </span>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Map */}
      {profile?.features.navigation !== false ? (
        <div className="flex-1 relative">
          <MapView centre={mapCentre} zoom={13}>
            <LocationMarker position={origin} label={originLabel} colour="green" />
            {routeStops.map((stop, i) => (
              <LocationMarker
                key={`${stop.lat},${stop.lng},${i}`}
                position={stop}
                label={t('request.stopLabel', { n: i + 1 })}
                colour="blue"
              />
            ))}
            {destination && <LocationMarker position={destination} label={destinationLabel} colour="red" />}
            {estimate?.routeGeometry && <RoutePolyline geometry={estimate.routeGeometry} />}
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

      {requiresDestination && estimating ? (
        <div className="bg-donkey-surface border-t-2 border-donkey-border p-6">
          <Loading message={t('request.estimating')} />
        </div>
      ) : requiresDestination && estimate ? (
        <>
          <Sheet maxHeightClass="max-h-[45vh]">
            {/* What you are buying */}
            <div className="flex items-baseline justify-between gap-3">
              <div>
                {settlementRequired ? (
                  <DualPrice sats={headlineSats} size="lg" />
                ) : (
                  <p className="text-lg font-black text-donkey-text">{t('lift.noPayment')}</p>
                )}
                <p className="text-donkey-muted text-sm mt-1">
                  {formatDistance(estimate.distanceKm)} &middot; {formatDuration(estimate.durationMinutes)}
                </p>
              </div>
              {when === 'later' && scheduledFor && !scheduleInvalid && (
                <p className="text-xs font-semibold text-donkey-blue text-right">
                  {formatScheduledTime(scheduledFor)}
                </p>
              )}
            </div>

            {/* Demand pricing, said plainly and BEFORE the tap. A rider who
                discovers a multiplier on the receipt has been ambushed. */}
            {settlementRequired && estimate.surge?.active && (
              <div className="meta-card border border-donkey-orange/50">
                <p className="text-sm font-bold text-donkey-orange">
                  {t('surge.title', { x: estimate.surge.multiplier.toFixed(1) })}
                </p>
                <p className="text-xs text-donkey-muted mt-1">
                  {t('surge.body', { label: providerLabel.toLowerCase() + 's' })}
                </p>
              </div>
            )}

            {/* The class decides the price, so it comes before the rows that
                explain it — the other way round for the whole of this app's
                life, which is exactly backwards */}
            {optionPicker}

            {settlementRequired && (
              <SheetSection title={t('request.fareBreakdown')} icon="🧾" rememberAs="request-breakdown">
                {fareBreakdown}
              </SheetSection>
            )}

            <SheetSection
              title={t('request.whenTitle')}
              icon="🕒"
              badge={when === 'later' && scheduledFor && !scheduleInvalid
                ? formatScheduledTime(scheduledFor)
                : t('common.now')}
              rememberAs="request-when"
            >
              {whenPicker}
            </SheetSection>

            {communityLift ? (
              <SheetSection
                title={t('lift.passengersTitle')}
                icon="👥"
                badge={String(liftPassengers.length)}
                rememberAs="request-lift-passengers"
                defaultOpen
              >
                {liftPassengerPicker}
              </SheetSection>
            ) : (
              <SheetSection
                title={t('request.stopsTitle')}
                icon="📍"
                badge={stops.length > 0 ? String(stops.length) : undefined}
                rememberAs="request-stops"
              >
                {stopsPicker}
              </SheetSection>
            )}

            <SheetSection
              title={t('request.noteTitle', { label: providerLabel.toLowerCase() })}
              icon="💬"
              badge={pickupNote.trim() ? t('common.set') : undefined}
              rememberAs="request-note"
            >
              {notePicker}
            </SheetSection>

            {!communityLift && (
              <SheetSection
                title={t('passenger.title')}
                icon="👤"
                badge={forSomeoneElse ? (passengerName.trim() || t('common.set')) : undefined}
                rememberAs="request-passenger"
              >
                {passengerPicker}
              </SheetSection>
            )}

            <SheetSection
              title={t('access.title')}
              icon="♿"
              badge={accessNeeds.length > 0 ? String(accessNeeds.length) : undefined}
              rememberAs="request-access"
            >
              <AccessNeedsPicker
                value={accessNeeds}
                onChange={setAccessNeeds}
                role="requester"
                bare
              />
            </SheetSection>

            {/* Safety, not an option — stays visible for a declared woman */}
            {womenOnlyPicker}

            {favourites.length > 0 && when === 'now' && (
              <p className="text-donkey-muted text-xs">
                {t('request.favouritesFirst', { n: favourites.length })}
              </p>
            )}
          </Sheet>
          {actionBar}
        </>
      ) : !requiresDestination ? (
        <>
          <Sheet maxHeightClass="max-h-[45vh]">
            <div className="text-center">
              <p className="text-lg font-bold text-donkey-text">
                {t(`request.pricing.${profile?.pricingModel || 'assessed'}.title`)}
              </p>
              <p className="text-donkey-muted text-sm mt-1">
                {t(`request.pricing.${profile?.pricingModel || 'assessed'}.body`, {
                  label: providerLabel.toLowerCase(),
                  noun: taskNoun,
                })}
              </p>
            </div>

            <SheetSection
              title={t('request.noteTitle', { label: providerLabel.toLowerCase() })}
              icon="💬"
              badge={pickupNote.trim() ? t('common.set') : undefined}
              rememberAs="request-note"
            >
              {notePicker}
            </SheetSection>

            <SheetSection
              title={t('request.whenTitle')}
              icon="🕒"
              badge={when === 'later' && scheduledFor && !scheduleInvalid
                ? formatScheduledTime(scheduledFor)
                : t('common.now')}
              rememberAs="request-when"
            >
              {whenPicker}
            </SheetSection>

            {womenOnlyPicker}
          </Sheet>
          {actionBar}
        </>
      ) : (
        <div className="bg-donkey-surface border-t-2 border-donkey-border p-6 text-center">
          <p className="text-donkey-red">{error || t('request.estimateFailed')}</p>
          <button className="btn-secondary mt-3" onClick={() => navigate('/request')}>
            {t('common.back')}
          </button>
        </div>
      )}
    </div>
  );
}
