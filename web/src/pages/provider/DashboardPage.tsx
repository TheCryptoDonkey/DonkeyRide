import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView } from '../../components/map/MapView';
import { LocationMarker } from '../../components/map/LocationMarker';
import { useLocation } from '../../hooks/useLocation';
import { useIdentity } from '../../context/IdentityContext';
import { useTask } from '../../context/TaskContext';
import { useDomain } from '../../context/DomainContext';
import { getTaskStats, getOperatorInfo, normaliseTask } from '../../services/api';
import { WS_PROTOCOL, getWsBaseUrl } from '../../services/websocket';

export function DashboardPage() {
  const navigate = useNavigate();
  const { location } = useLocation();
  const { identity } = useIdentity();
  const { setActiveTask } = useTask();
  const { profile } = useDomain();
  const [online, setOnline] = useState(false);
  const [stats, setStats] = useState<{ total: number; active: number; completed: number } | null>(null);
  const [operatorFee, setOperatorFee] = useState<string>('0.5%');
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Use a ref to track "should be online" — avoids stale closure in onclose
  const onlineRef = useRef(false);
  // Latest GPS fix without re-creating the WebSocket on every movement
  const locationRef = useRef(location);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

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

  // Clean up WebSocket on unmount
  useEffect(() => {
    return () => {
      onlineRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, []);

  const connectWs = useCallback(() => {
    // Close any existing connection
    if (reconnectRef.current) clearTimeout(reconnectRef.current);
    wsRef.current?.close();

    const wsUrl = getWsBaseUrl();
    console.log('[DashboardWS] Connecting to', wsUrl);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[DashboardWS] Connected — registering as provider');
      setWsConnected(true);
      // Register as a provider — server uses this to tag us for task broadcasts
      // and geo-filter dispatch by our reported position
      const loc = locationRef.current;
      ws.send(JSON.stringify({
        type: WS_PROTOCOL.registerProvider,
        npub: identity?.npub || '',
        pubkey: identity?.pubKeyHex || '',
        location: loc ? { lat: loc.lat, lon: loc.lng } : undefined,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log('[DashboardWS] Message received:', msg.type, msg);
        // Server broadcasts task requests to all registered providers
        if (msg.type === WS_PROTOCOL.taskBroadcast && msg.ride) {
          const task = normaliseTask(msg.ride);
          console.log('[DashboardWS] Incoming task — navigating to /provide/incoming', task);
          setActiveTask(task);
          navigate('/provide/incoming');
        }
      } catch (err) {
        console.warn('[DashboardWS] Failed to parse message:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('[DashboardWS] WebSocket error:', err);
    };

    ws.onclose = (event) => {
      console.log('[DashboardWS] Disconnected (code:', event.code, 'reason:', event.reason, ')');
      setWsConnected(false);
      // Auto-reconnect if still meant to be online (use ref, not state)
      if (onlineRef.current) {
        console.log('[DashboardWS] Reconnecting in 4s...');
        reconnectRef.current = setTimeout(() => {
          if (onlineRef.current) connectWs();
        }, 4000);
      }
    };

    wsRef.current = ws;
  }, [identity, navigate, setActiveTask]);

  // Presence heartbeat — keeps geo-dispatch fresh while online
  useEffect(() => {
    if (!online || !wsConnected) return;

    const sendPresence = () => {
      const loc = locationRef.current;
      const ws = wsRef.current;
      if (!loc || !ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({
        type: 'driver_location',
        npub: identity?.npub || '',
        pubkey: identity?.pubKeyHex || '',
        location: { lat: loc.lat, lon: loc.lng },
      }));
    };

    sendPresence();
    const timer = setInterval(sendPresence, 30_000);
    return () => clearInterval(timer);
  }, [online, wsConnected, identity]);

  const toggleOnline = useCallback(() => {
    if (onlineRef.current) {
      // Go offline
      onlineRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      setOnline(false);
      setWsConnected(false);
    } else {
      // Go online
      onlineRef.current = true;
      setOnline(true);
      connectWs();
    }
  }, [connectWs]);

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

        {/* Go online button */}
        <button
          className={online ? 'btn-danger w-full' : 'btn-primary w-full'}
          onClick={toggleOnline}
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
