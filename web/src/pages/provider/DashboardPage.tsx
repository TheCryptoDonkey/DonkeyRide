import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView } from '../../components/map/MapView';
import { LocationMarker } from '../../components/map/LocationMarker';
import { useLocation } from '../../hooks/useLocation';
import { useIdentity } from '../../context/IdentityContext';
import { useTask } from '../../context/TaskContext';
import { useDomain } from '../../context/DomainContext';
import { getRideStats, getOperatorInfo } from '../../services/api';

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
  const [ws, setWs] = useState<WebSocket | null>(null);

  // Fetch operator info
  useEffect(() => {
    getOperatorInfo()
      .then(info => setOperatorFee(info.fee))
      .catch(() => {});
  }, []);

  // Fetch stats
  useEffect(() => {
    getRideStats()
      .then(s => setStats(s))
      .catch(() => {});
  }, []);

  // WebSocket for incoming ride notifications
  const toggleOnline = useCallback(() => {
    if (online) {
      ws?.close();
      setWs(null);
      setOnline(false);
      setWsConnected(false);
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${window.location.hostname}:3001/driver/${identity?.pubKeyHex}`;
    const newWs = new WebSocket(wsUrl);

    newWs.onopen = () => {
      setWsConnected(true);
      setOnline(true);
    };

    newWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'driver_assigned' || msg.type === 'ride_matched') {
          setActiveTask(msg.data);
          navigate('/drive/incoming');
        }
      } catch {
        // Ignore
      }
    };

    newWs.onclose = () => {
      setWsConnected(false);
      setOnline(false);
    };

    setWs(newWs);
  }, [online, ws, identity, navigate, setActiveTask]);

  const providerLabel = profile?.roles.provider || 'Driver';

  return (
    <div className="h-full flex flex-col">
      {/* Map */}
      <div className="flex-1 relative">
        <MapView centre={location} zoom={14}>
          <LocationMarker position={location} label="You" colour="green" />
        </MapView>

        {/* Online status indicator */}
        <div className="absolute top-3 left-3 z-10">
          <div className={`flex items-center gap-2 card text-sm ${online ? 'border-donkey-green' : ''}`}>
            <div className={`w-3 h-3 rounded-full ${online ? 'bg-donkey-green' : 'bg-donkey-red'}`} />
            <span>{online ? 'Online' : 'Offline'}</span>
          </div>
        </div>
      </div>

      {/* Dashboard panel */}
      <div className="bg-donkey-surface border-t border-donkey-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{providerLabel} Dashboard</h2>
          <span className="text-xs text-donkey-muted">Operator fee: {operatorFee}</span>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="card p-3">
              <p className="text-xl font-bold text-donkey-blue">{stats.active}</p>
              <p className="text-xs text-donkey-muted">Active</p>
            </div>
            <div className="card p-3">
              <p className="text-xl font-bold text-donkey-green">{stats.completed}</p>
              <p className="text-xs text-donkey-muted">Completed</p>
            </div>
            <div className="card p-3">
              <p className="text-xl font-bold text-donkey-text">{stats.total}</p>
              <p className="text-xs text-donkey-muted">Total</p>
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

        {online && !wsConnected && (
          <p className="text-donkey-orange text-xs text-center">Connecting...</p>
        )}
      </div>
    </div>
  );
}
