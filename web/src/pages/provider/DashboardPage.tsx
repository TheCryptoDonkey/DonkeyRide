import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView } from '../../components/map/MapView';
import { LocationMarker } from '../../components/map/LocationMarker';
import { DualPrice } from '../../components/common/DualPrice';
import { useLocation } from '../../hooks/useLocation';
import { useIdentity } from '../../context/IdentityContext';
import { useTask } from '../../context/TaskContext';
import { useDomain } from '../../context/DomainContext';
import { getTaskStats, getOperatorInfo } from '../../services/api';
import { dispatchService, type DispatchState } from '../../services/dispatch';
import { formatDistance } from '../../services/pricing';
import { formatScheduledTime, isUpcoming } from '../../utils/datetime';
import { Capacitor } from '@capacitor/core';
import type { Task } from '../../types/api';

const isNative = Capacitor.isNativePlatform();

export function DashboardPage() {
  const navigate = useNavigate();
  const { location, error: geoError, loading: geoLoading } = useLocation();
  const { identity } = useIdentity();
  const { activeTask, setActiveTask } = useTask();
  const { profile } = useDomain();
  const [stats, setStats] = useState<{ total: number; active: number; completed: number } | null>(null);
  const [operatorFee, setOperatorFee] = useState<string>('0.5%');
  const [dispatchState, setDispatchState] = useState<DispatchState>(dispatchService.getState());
  const [availableJobs, setAvailableJobs] = useState<Task[]>(dispatchService.getAvailableTasks());

  const online = dispatchState.online;
  const wsConnected = dispatchState.connected;
  const geoReady = !geoLoading && !geoError;

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

  // Fetch stats
  useEffect(() => {
    getTaskStats()
      .then(s => setStats(s))
      .catch(() => {});
  }, []);

  // The dispatch connection lives in a module singleton — going online
  // survives route changes; this page only mirrors its state.
  useEffect(() => dispatchService.onStatus(setDispatchState), []);

  // Every open job the driver could take — broadcasts plus the polled
  // open-jobs endpoint, so nothing is missed while another job is on screen
  useEffect(() => dispatchService.onAvailable(setAvailableJobs), []);

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

  const providerLabel = profile?.roles.provider || 'Provider';
  const taskNoun = profile?.labels?.taskNoun || 'task';

  return (
    <div className="h-full flex flex-col">
      {/* Map */}
      {profile?.features.navigation !== false ? (
        <div className="flex-1 relative">
          <MapView centre={location} zoom={14}>
            <LocationMarker position={location} label="You" colour="green" />
          </MapView>

          {/* Online status indicator — floating badge with glow */}
          <div className="absolute top-3 left-3 z-10">
            <div className={`status-indicator ${online ? (wsConnected ? 'status-online' : 'status-connecting') : 'status-offline'}`}>
              <div className={`status-dot-glow ${wsConnected ? 'glow-green' : online ? 'glow-orange' : 'glow-red'}`} />
              <span className="font-semibold tracking-wide text-sm uppercase">
                {wsConnected ? 'Online' : online ? 'Connecting...' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-donkey-bg relative">
          <div className="card text-center max-w-sm">
            <p className="text-lg font-bold text-donkey-text">{providerLabel} Dashboard</p>
            <p className="text-sm text-donkey-muted mt-1">Ready to receive {taskNoun} requests</p>
          </div>
          {/* Online status indicator */}
          <div className="absolute top-3 left-3 z-10">
            <div className={`status-indicator ${online ? (wsConnected ? 'status-online' : 'status-connecting') : 'status-offline'}`}>
              <div className={`status-dot-glow ${wsConnected ? 'glow-green' : online ? 'glow-orange' : 'glow-red'}`} />
              <span className="font-semibold tracking-wide text-sm uppercase">
                {wsConnected ? 'Online' : online ? 'Connecting...' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard panel */}
      <div className="bg-donkey-surface border-t-2 border-donkey-border p-6 space-y-4 shadow-panel">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black tracking-tight">{providerLabel} Dashboard</h2>
          <span className="text-xs text-donkey-muted font-mono uppercase tracking-wider">Fee: {operatorFee}</span>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="stat-card">
              <p className="text-2xl font-black text-donkey-blue">{stats.active}</p>
              <p className="stat-label">Active</p>
            </div>
            <div className="stat-card">
              <p className="text-2xl font-black text-donkey-green">{stats.completed}</p>
              <p className="stat-label">Completed</p>
            </div>
            <div className="stat-card">
              <p className="text-2xl font-black text-donkey-text">{stats.total}</p>
              <p className="stat-label">Total</p>
            </div>
          </div>
        )}

        {/* Every waiting job — tap to review and accept */}
        {online && availableJobs.length > 0 && (
          <div className="space-y-2">
            <p className="section-title">
              Waiting {taskNoun} requests ({availableJobs.length})
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {availableJobs.map((job) => (
                <button
                  key={job.id}
                  className="w-full flex items-center justify-between bg-donkey-bg border border-donkey-border rounded-lg px-4 py-3 text-left hover:border-donkey-blue transition-colors"
                  onClick={() => openJob(job)}
                >
                  <div>
                    <DualPrice sats={job.fareEstimateSats} size="sm" />
                    <p className="text-xs text-donkey-muted mt-0.5">
                      {job.distanceKm != null && formatDistance(job.distanceKm)}
                      {(job.stopCount ?? 0) > 0 && (
                        <span>
                          {job.distanceKm != null && ' · '}
                          +{job.stopCount} {job.stopCount === 1 ? 'stop' : 'stops'}
                        </span>
                      )}
                      {isUpcoming(job.scheduledFor) && (
                        <span className="text-donkey-blue font-semibold">
                          {(job.distanceKm != null || (job.stopCount ?? 0) > 0) && ' · '}
                          Booked {formatScheduledTime(job.scheduledFor)}
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
                  <span className="text-donkey-blue text-sm font-semibold">View</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* GPS unavailable — geo-dispatch cannot work, so block going online */}
        {geoError && !online && (
          <div className="bg-donkey-orange/20 border border-donkey-orange rounded-lg p-3">
            <p className="text-donkey-orange text-sm font-semibold">
              Location unavailable. You will not receive {taskNoun} requests until
              location is enabled.
            </p>
          </div>
        )}

        {/* Go online button */}
        <button
          className={online ? 'btn-danger w-full' : 'btn-primary w-full'}
          onClick={toggleOnline}
          disabled={!online && !!geoError}
        >
          {online ? 'Go Offline' : 'Go Online'}
        </button>

        <div className="flex gap-3">
          <button
            className="btn-secondary flex-1"
            onClick={() => navigate('/provide/earnings')}
          >
            Earnings
          </button>
          <button
            className="btn-secondary flex-1"
            onClick={() => navigate('/provide/areas')}
          >
            Working Areas
          </button>
        </div>

        {online && wsConnected && (
          <p className="text-donkey-green text-sm text-center font-semibold animate-pulse">
            Listening for {taskNoun} requests...
          </p>
        )}
        {online && !wsConnected && (
          <p className="text-donkey-orange text-sm text-center">
            Connecting to dispatcher...
          </p>
        )}

        {/* Web only: the Android build keeps the shift alive screen-off */}
        {!isNative && (
          <p className="text-xs text-donkey-muted text-center">
            Driving on Android?{' '}
            <a href="/download.html" className="text-donkey-blue font-semibold">
              Get the app
            </a>{' '}
            — jobs keep arriving with the screen off.
          </p>
        )}
      </div>
    </div>
  );
}
