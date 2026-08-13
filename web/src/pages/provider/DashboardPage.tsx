import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView } from '../../components/map/MapView';
import { LocationMarker } from '../../components/map/LocationMarker';
import { DualPrice } from '../../components/common/DualPrice';
import { Sheet, SheetSection } from '../../components/layout/Sheet';
import { DemandPanel } from '../../components/provider/DemandPanel';
import { useLocation } from '../../hooks/useLocation';
import { useIdentity } from '../../context/IdentityContext';
import { useTask } from '../../context/TaskContext';
import { useDomain } from '../../context/DomainContext';
import { getOperatorInfo, getDriverEarnings, type DriverEarnings } from '../../services/api';
import { mergeEarnings } from '../../services/job-history';
import { taskPickupProximity, rankJobs } from '../../utils/pickup-distance';
import { onlineMsToday, formatOnline, satsPerHour } from '../../utils/shift';
import { dispatchService, type DispatchState } from '../../services/dispatch';
import { formatDistance } from '../../services/pricing';
import { formatScheduledTime, isUpcoming } from '../../utils/datetime';
import { AddressSearch } from '../../components/AddressSearch';
import {
  saveDestinationMode, clearDestinationMode, type DestinationMode,
} from '../../utils/destination-mode';
import { missingRequired } from '../../utils/credentials';
import { Capacitor } from '@capacitor/core';
import { getPushState, onPushStateChange, type PushState } from '../../services/push';
import { useT } from '../../i18n';
import type { Task } from '../../types/api';

const isNative = Capacitor.isNativePlatform();
/** F-Droid first: the point of this rail is not needing Google's store either */
const NTFY_INSTALL_URL = 'https://f-droid.org/packages/io.heckel.ntfy/';

/**
 * The driver's home screen.
 *
 * It used to be nine stacked blocks with GO ONLINE — the one control the
 * whole screen exists for — fifth down, below a job list that could grow
 * to 256 px. On a 390 px phone the button was under the fold. The shape is
 * now: map, a sheet of what is happening, and the shift control pinned
 * where a thumb lands whatever else is on screen.
 */
export function DashboardPage() {
  const navigate = useNavigate();
  const { t, td } = useT();
  const { location, hasFix, error: geoError, refresh: refreshLocation } = useLocation();
  const { identity } = useIdentity();
  const { activeTask, setActiveTask } = useTask();
  const { profile } = useDomain();
  // The driver's OWN figures. The dashboard used to headline platform-wide
  // ride counts, which tell a driver nothing about their own day.
  const [earnings, setEarnings] = useState<DriverEarnings | null>(null);
  // No guessed default: showing "0.5%" on an operator that takes 0% is a
  // fee that does not exist, and it flashes on every load
  const [operatorFee, setOperatorFee] = useState<string | null>(null);
  const [dispatchState, setDispatchState] = useState<DispatchState>(dispatchService.getState());
  const [availableJobs, setAvailableJobs] = useState<Task[]>(dispatchService.getAvailableTasks());
  const [declined, setDeclined] = useState(dispatchService.declinedCount());
  const [destMode, setDestMode] = useState<DestinationMode | null>(dispatchService.getDestinationMode());
  const [pickingDest, setPickingDest] = useState(false);
  // Push can fail quietly, and a driver reads silence as "no jobs tonight"
  const [pushState, setPushState] = useState<PushState>(getPushState);
  useEffect(() => onPushStateChange(setPushState), []);

  const applyDestination = (mode: DestinationMode | null) => {
    if (mode) saveDestinationMode(mode);
    else clearDestinationMode();
    dispatchService.setDestinationMode(mode);
    setDestMode(mode);
    setPickingDest(false);
  };

  const online = dispatchState.online;
  const wsConnected = dispatchState.connected;
  // A real device fix, not the placeholder. Never inferred from the absence
  // of an error — see useLocation.
  const geoReady = hasFix;

  // An in-flight job (including one rehydrated after a restart) resumes here
  useEffect(() => {
    if (activeTask && identity && profile
        && activeTask.providerPubkey === identity.pubKeyHex
        && !profile.states.terminal.includes(activeTask.status)) {
      navigate('/provide/active');
    }
  }, [activeTask, identity, profile, navigate]);

  // Fetch operator info
  useEffect(() => {
    getOperatorInfo()
      .then(info => setOperatorFee(info.fee))
      .catch(() => {});
  }, []);

  // The driver's own earnings, refreshed when a job completes
  useEffect(() => {
    if (!identity?.pubKeyHex) return;
    let live = true;
    // Merged with this device's own ledger. The operator forgets a completed
    // job after six hours and never rehydrates one after a restart, so asking
    // it alone showed a driver £0.00 for work they had actually done.
    const load = () => getDriverEarnings(identity.pubKeyHex)
      .then((e) => { if (live) setEarnings(mergeEarnings(e)); })
      .catch(() => { if (live) setEarnings(mergeEarnings(null)); });
    void load();
    const timer = setInterval(load, 60000);
    return () => { live = false; clearInterval(timer); };
  }, [identity?.pubKeyHex]);

  // Hours online ticks while the shift runs, so the per-hour rate stays honest
  const [onlineMs, setOnlineMs] = useState(() => onlineMsToday());
  useEffect(() => {
    const timer = setInterval(() => setOnlineMs(onlineMsToday()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { setOnlineMs(onlineMsToday()); }, [online]);

  // The dispatch connection lives in a module singleton — going online
  // survives route changes; this page only mirrors its state.
  useEffect(() => dispatchService.onStatus(setDispatchState), []);

  // Every open job the driver could take — broadcasts plus the polled
  // open-jobs endpoint, so nothing is missed while another job is on screen
  useEffect(() => dispatchService.onAvailable((jobs) => {
    setAvailableJobs(jobs);
    setDeclined(dispatchService.declinedCount());
  }), []);

  const openJob = useCallback((task: Task) => {
    setActiveTask(task);
    navigate('/provide/incoming');
  }, [setActiveTask, navigate]);

  useEffect(() => {
    if (identity) {
      dispatchService.setIdentity({ pubKeyHex: identity.pubKeyHex, npub: identity.npub });
    }
  }, [identity]);

  useEffect(() => {
    if (profile) dispatchService.setDomain(profile.id);
  }, [profile]);

  // Never feed the dispatch a fallback position — GPS fix or nothing
  useEffect(() => {
    dispatchService.updateLocation(geoReady ? location : null);
  }, [geoReady, location]);

  // Resume the shift after a reload if the driver was online
  useEffect(() => {
    if (dispatchService.wasOnline() && !dispatchService.isOnline() && identity && geoReady) {
      dispatchService.goOnline();
    }
  }, [identity, geoReady]);

  const toggleOnline = useCallback(() => {
    if (dispatchService.isOnline()) {
      dispatchService.goOffline();
    } else if (!geoError) {
      dispatchService.goOnline();
    }
  }, [geoError]);

  const providerLabel = td(profile?.roles.provider || 'Provider');
  const taskNoun = td(profile?.labels?.taskNoun || 'task');
  const perHour = satsPerHour(earnings?.summary?.today.sats ?? 0, onlineMs);
  // Nearest first, money breaking ties — the order a driver would pick in
  const rankedJobs = rankJobs(availableJobs, geoReady ? location : null);
  const statusLabel = wsConnected ? t('common.online') : online ? t('common.connecting') : t('common.offline');

  // Paperwork the domain says is needed and this device has not declared.
  // An operator running ENFORCE_CREDENTIALS refuses the accept, and the
  // kerb is a bad place to discover that.
  const missingCredentials = profile?.enforceCredentials
    ? missingRequired(profile.credentials || []) : [];

  return (
    <div className="h-full flex flex-col">
      {/* Map */}
      {profile?.features.navigation !== false ? (
        <div className="flex-1 relative">
          <MapView centre={location} zoom={14}>
            {/* Only mark "you" where the device actually put us. Without a
                fix `location` is the London placeholder, and a confident
                green dot on it is simply a lie. */}
            {hasFix && (
              <LocationMarker position={location} label={t('common.you')} colour="green" />
            )}
          </MapView>

          {/* Online status indicator — floating badge with glow */}
          <div className="absolute top-3 left-3 z-10">
            <div className={`status-indicator ${online ? (wsConnected ? 'status-online' : 'status-connecting') : 'status-offline'}`}>
              <div className={`status-dot-glow ${wsConnected ? 'glow-green' : online ? 'glow-orange' : 'glow-red'}`} />
              <span className="font-semibold tracking-wide text-sm uppercase">
                {statusLabel}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-donkey-bg relative">
          <div className="card text-center max-w-sm">
            <p className="text-lg font-bold text-donkey-text">{t('dash.title', { label: providerLabel })}</p>
            <p className="text-sm text-donkey-muted mt-1">{t('dash.ready', { noun: taskNoun })}</p>
          </div>
          <div className="absolute top-3 left-3 z-10">
            <div className={`status-indicator ${online ? (wsConnected ? 'status-online' : 'status-connecting') : 'status-offline'}`}>
              <div className={`status-dot-glow ${wsConnected ? 'glow-green' : online ? 'glow-orange' : 'glow-red'}`} />
              <span className="font-semibold tracking-wide text-sm uppercase">
                {statusLabel}
              </span>
            </div>
          </div>
        </div>
      )}

      <Sheet maxHeightClass="max-h-[48vh]">
        {/* Your day. Not the platform's — a driver deciding whether to keep
            working needs their own earnings, trips and hours, in that order. */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="stat-card">
            {/* compact: at a third of a phone's width the sats line runs out
                of the card and over the one beside it */}
            <DualPrice sats={earnings?.summary?.today.sats ?? 0} size="sm" compact />
            <p className="stat-label">{t('dash.todayEarned')}</p>
          </div>
          <div className="stat-card">
            <p className="text-2xl font-black text-donkey-text">
              {earnings?.summary?.today.rides ?? 0}
            </p>
            <p className="stat-label">{t('dash.todayTrips')}</p>
          </div>
          <div className="stat-card">
            <p className="text-2xl font-black text-donkey-text">{formatOnline(onlineMs)}</p>
            <p className="stat-label">{t('dash.online')}</p>
          </div>
        </div>

        {/* Per hour — the number that says whether the day is worth it.
            Withheld until enough of a shift has run to mean anything. */}
        {perHour != null && (
          <p className="text-xs text-donkey-muted text-center">
            {t('dash.perHour')} <DualPrice sats={perHour} size="sm" />
          </p>
        )}

        {/* Anything blocking work comes before anything optional */}
        {geoError && !online && (
          <div className="bg-donkey-orange/20 border border-donkey-orange rounded-lg p-3" role="alert">
            <p className="text-donkey-orange text-sm font-semibold">
              {t('dash.noGps', { noun: taskNoun })}
            </p>
          </div>
        )}

        {/* Online, but the operator has no position for us — so no job can
            ever arrive. Silence here is indistinguishable from a quiet night,
            and a driver can sit through a whole shift earning nothing. */}
        {online && !hasFix && (
          <div className="bg-donkey-red/20 border border-donkey-red rounded-lg p-3" role="alert">
            <p className="text-donkey-red text-sm font-semibold">
              {t('dash.onlineNoGps', { noun: taskNoun })}
            </p>
            <button
              className="text-donkey-blue text-sm font-semibold mt-1 min-h-[44px]"
              onClick={refreshLocation}
            >
              {t('dash.retryGps')}
            </button>
          </div>
        )}

        {online && dispatchState.admissionError && (
          <button
            className="w-full text-left bg-donkey-red/20 border border-donkey-red rounded-lg p-3"
            onClick={() => navigate('/provide/profile')}
          >
            <p className="text-donkey-red text-sm font-semibold">
              {t('dash.operatorDenied')}
            </p>
            <p className="text-donkey-red text-xs mt-1">{dispatchState.admissionError}</p>
          </button>
        )}

        {missingCredentials.length > 0 && (
          <button
            className="w-full text-left bg-donkey-orange/20 border border-donkey-orange rounded-lg p-3"
            onClick={() => navigate('/provide/profile')}
          >
            <p className="text-donkey-orange text-sm font-semibold">
              {t('credentials.missingTitle')}
            </p>
            <p className="text-donkey-orange text-xs mt-1">
              {t('credentials.missingBody', { n: missingCredentials.length })}
            </p>
          </button>
        )}

        {/* Every waiting job — nearest first, tap to review and accept */}
        {online && rankedJobs.length > 0 && (
          <div className="space-y-2">
            <p className="section-title">
              {t('dash.waiting', { noun: taskNoun, n: rankedJobs.length })}
            </p>
            <div className="space-y-2">
              {rankedJobs.map((job) => {
                // How far the driver is from THIS rider — the thing that
                // separates a good job from a bad one at the same fare
                const near = taskPickupProximity(geoReady ? location : null, job);
                return (
                <button
                  key={job.id}
                  className="w-full flex items-center justify-between bg-donkey-bg border border-donkey-border rounded-lg px-4 py-3 text-left hover:border-donkey-blue transition-colors"
                  onClick={() => openJob(job)}
                >
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <DualPrice sats={job.fareEstimateSats} size="sm" />
                      {near && (
                        <span className="text-xs font-bold text-donkey-blue shrink-0">
                          {t('dash.awayShort', { min: near.minutes })}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-donkey-muted mt-0.5">
                      {job.distanceKm != null && formatDistance(job.distanceKm)}
                      {(job.stopCount ?? 0) > 0 && (
                        <span>
                          {job.distanceKm != null && ' · '}
                          +{job.stopCount} {job.stopCount === 1 ? t('common.stop') : t('common.stops')}
                        </span>
                      )}
                      {job.womenOnly && (
                        <span className="text-donkey-purple font-semibold">
                          {(job.distanceKm != null || (job.stopCount ?? 0) > 0) && ' · '}
                          ♀ {t('women.badge')}
                        </span>
                      )}
                      {isUpcoming(job.scheduledFor) && (
                        <span className="text-donkey-blue font-semibold">
                          {(job.distanceKm != null || (job.stopCount ?? 0) > 0) && ' · '}
                          {t('dash.booked', { time: formatScheduledTime(job.scheduledFor) })}
                        </span>
                      )}
                      {job.operatorBase && (
                        <span className="text-donkey-purple font-semibold">
                          {(job.distanceKm != null || (job.stopCount ?? 0) > 0 || isUpcoming(job.scheduledFor)) && ' · '}
                          via Nostr · {new URL(job.operatorBase).host}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="text-donkey-blue text-sm font-semibold shrink-0 ml-2">
                    {t('common.view')}
                  </span>
                </button>
                );
              })}
            </div>
            {/* A decline is remembered, so give the driver the way back */}
            {declined > 0 && (
              <button
                className="text-donkey-muted text-xs underline w-full text-center min-h-[44px]"
                onClick={() => {
                  dispatchService.clearDeclined();
                  setDeclined(0);
                }}
              >
                {t('dash.showDeclined', { n: declined })}
              </button>
            )}
          </div>
        )}

        {online && rankedJobs.length === 0 && (
          <p className={`text-sm text-center ${wsConnected ? 'text-donkey-green font-semibold' : 'text-donkey-orange'}`}>
            {wsConnected ? t('dash.listening', { noun: taskNoun }) : t('dash.connectingDispatcher')}
          </p>
        )}

        {/* Where the work is — the operator already computes this to price
            demand; a driver guessing at it was the odd part */}
        {online && (
          <SheetSection title={t('demand.section')} icon="📈" rememberAs="driver-demand" defaultOpen>
            <DemandPanel location={geoReady ? location : null} taskNoun={taskNoun} />
          </SheetSection>
        )}

        {/* Destination mode — only jobs that move you toward it.
            Client-side: the destination never leaves this device. */}
        <SheetSection
          title={t('dash.headingSection')}
          icon="🧭"
          badge={destMode ? destMode.label : undefined}
          rememberAs="driver-destination"
        >
          {destMode ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-donkey-text truncate">{destMode.label}</p>
                <p className="text-xs text-donkey-muted">
                  {t('dash.corridorNote', { noun: taskNoun })}
                </p>
              </div>
              <button
                className="btn-secondary text-xs px-3"
                onClick={() => applyDestination(null)}
              >
                {t('common.clear')}
              </button>
            </div>
          ) : pickingDest ? (
            <div>
              <p className="meta-label mb-2">{t('dash.headingPrompt')}</p>
              <AddressSearch
                name="driver-destination-address"
                placeholder={t('dash.searchDestination')}
                biasLocation={location}
                autoFocus
                onSelect={(loc, label) => applyDestination({ ...loc, label })}
              />
              <button
                className="text-donkey-muted text-xs mt-2 min-h-[44px]"
                onClick={() => setPickingDest(false)}
              >
                {t('common.cancel')}
              </button>
            </div>
          ) : (
            <button
              className="text-donkey-blue text-sm font-semibold min-h-[44px]"
              onClick={() => setPickingDest(true)}
            >
              {t('dash.headingCta', { noun: taskNoun })}
            </button>
          )}
        </SheetSection>

        {/* The app is online but nothing can reach it once backgrounded. Say
            so — silence looks identical to a quiet night.
            NOT native-only: a web driver whose notifications are switched off
            is in exactly the same position (the tab is frozen the moment it
            is backgrounded, so the dispatch socket goes with it), and used to
            be told nothing at all. The distributor prompts below stay Android
            -only, because UnifiedPush is an Android concept. */}
        {online && pushState !== 'enabled' && pushState !== 'idle' && (
          <div className="bg-donkey-orange/20 border border-donkey-orange rounded-lg p-3">
            <p className="text-donkey-orange text-sm">
              {pushState === 'no_distributor' && t('dash.pushNoDistributor')}
              {pushState === 'choose_distributor' && t('dash.pushChoose')}
              {pushState === 'denied' && t('dash.pushDenied')}
              {(pushState === 'failed' || pushState === 'unsupported')
                && (isNative ? t('dash.pushNoDistributor') : t('dash.pushDenied'))}
            </p>
            {/* Installing a UnifiedPush distributor is only meaningful in the
                Android wrap — on web the answer is the browser's own
                notification permission, not another app. */}
            {isNative && pushState !== 'denied' && (
              <a
                href={NTFY_INSTALL_URL}
                target="_blank"
                rel="noreferrer"
                className="text-donkey-blue text-sm font-semibold"
              >
                {t('dash.pushGetNtfy')}
              </a>
            )}
          </div>
        )}

        {/* Web only: the Android build keeps the shift alive screen-off */}
        {!isNative && (
          <p className="text-xs text-donkey-muted text-center">
            {t('dash.androidNote')}{' '}
            <a href="/download.html" className="text-donkey-blue font-semibold">
              {t('dash.getApp')}
            </a>{' '}
            {t('dash.screenOff')}
          </p>
        )}

        {operatorFee && (
          <p className="text-xs text-donkey-muted text-center font-mono uppercase tracking-wider">
            {t('dash.fee', { fee: operatorFee })}
          </p>
        )}
      </Sheet>

      {/* The shift control, where a thumb lands — not fifth down a column */}
      <div className="bg-donkey-surface border-t-2 border-donkey-border px-5 py-3 shadow-panel">
        <button
          className={online ? 'btn-danger w-full' : 'btn-primary w-full'}
          onClick={toggleOnline}
          disabled={!online && !!geoError}
        >
          {online ? t('dash.goOffline') : t('dash.goOnline')}
        </button>
      </div>
    </div>
  );
}
