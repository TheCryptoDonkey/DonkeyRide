import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView } from '../../components/map/MapView';
import { LocationMarker } from '../../components/map/LocationMarker';
import { useLocation } from '../../hooks/useLocation';
import { useIdentity } from '../../context/IdentityContext';
import { useTask } from '../../context/TaskContext';
import { useDomain } from '../../context/DomainContext';
import { getTaskStats, getOperatorInfo } from '../../services/api';
import type { LatLng } from '../../types/api';

/** Normalise a ride_request payload into the shape our Task context expects */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normaliseRideRequest(ride: any) {
  const normLoc = (loc: { lat: number; lon?: number; lng?: number } | null): LatLng | null => {
    if (!loc) return null;
    return { lat: loc.lat, lng: loc.lng ?? loc.lon ?? 0 };
  };

  return {
    id: ride.id || '',
    status: ride.status || 'requested',
    requesterPubkey: ride.rider?.pubkey || '',
    pickup: normLoc(ride.pickup) || { lat: 0, lng: 0 },
    dropoff: normLoc(ride.dropoff),
    fareEstimateSats: ride.fare ?? ride.estimatedFare?.fare?.sats ?? 0,
    distanceKm: typeof ride.distance === 'number' ? ride.distance : ride.estimatedFare?.distance?.km,
    durationMin: ride.estimatedFare?.duration?.minutes,
    routeGeometry: ride.route,
    createdAt: new Date().toISOString(),
  };
}

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

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${window.location.hostname}:3001`;
    console.log('[DashboardWS] Connecting to', wsUrl);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[DashboardWS] Connected — registering as driver');
      setWsConnected(true);
      // Register as a driver — server uses this to tag us for ride broadcasts
      ws.send(JSON.stringify({
        type: 'register_driver',
        npub: identity?.npub || '',
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log('[DashboardWS] Message received:', msg.type, msg);
        // Server broadcasts 'ride_request' to all registered drivers
        if (msg.type === 'ride_request' && msg.ride) {
          const task = normaliseRideRequest(msg.ride);
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
