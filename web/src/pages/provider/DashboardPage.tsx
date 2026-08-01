import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView } from '../../components/map/MapView';
import { LocationMarker } from '../../components/map/LocationMarker';
import { useLocation } from '../../hooks/useLocation';
import { useIdentity } from '../../context/IdentityContext';
import { useTask } from '../../context/TaskContext';
import { useDomain } from '../../context/DomainContext';
import { getTaskStats, getOperatorInfo } from '../../services/api';
import { dispatchService, type DispatchState } from '../../services/dispatch';

export function DashboardPage() {
  const navigate = useNavigate();
  const { location, error: geoError, loading: geoLoading } = useLocation();
  const { identity } = useIdentity();
  const { activeTask } = useTask();
  const { profile } = useDomain();
  const [stats, setStats] = useState<{ total: number; active: number; completed: number } | null>(null);
  const [operatorFee, setOperatorFee] = useState<string>('0.5%');
  const [dispatchState, setDispatchState] = useState<DispatchState>(dispatchService.getState());

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

        <button
          className="btn-secondary w-full"
          onClick={() => navigate('/provide/earnings')}
        >
          Earnings
        </button>

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
      </div>
    </div>
  );
}
