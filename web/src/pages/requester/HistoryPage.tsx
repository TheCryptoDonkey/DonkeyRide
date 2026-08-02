import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DualPrice } from '../../components/common/DualPrice';
import { useDomain } from '../../context/DomainContext';
import { getTripHistory, clearTripHistory } from '../../services/trip-history';

/**
 * Your past trips — stored on this device only. The operator keeps no
 * durable record of who went where; this page is the rider's own copy.
 */
export function HistoryPage() {
  const navigate = useNavigate();
  const { profile } = useDomain();
  const [trips, setTrips] = useState(getTripHistory());
  const [confirmClear, setConfirmClear] = useState(false);

  const taskNoun = profile?.labels?.taskNoun || 'trip';

  const formatDate = (ms: number) =>
    new Date(ms).toLocaleDateString(undefined, {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4 max-w-md mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black text-donkey-text">Your {taskNoun}s</h1>
        <button className="btn-secondary text-xs px-3" onClick={() => navigate('/request')}>
          Back
        </button>
      </div>

      <p className="text-xs text-donkey-muted">
        Stored on this device only — the operator keeps no record of your
        past {taskNoun}s.
      </p>

      {trips.length === 0 ? (
        <div className="card text-center">
          <p className="text-donkey-muted">No {taskNoun}s on this device yet.</p>
        </div>
      ) : (
        trips.map((trip) => (
          <div key={trip.id} className="meta-card">
            <div className="flex items-center justify-between">
              <p className="text-xs text-donkey-muted">{formatDate(trip.completedAt)}</p>
              <DualPrice sats={trip.fareSats} size="sm" />
            </div>
            {(trip.from || trip.to) && (
              <p className="text-sm text-donkey-text mt-1">
                {trip.from || '—'} <span className="text-donkey-muted">→</span> {trip.to || '—'}
              </p>
            )}
            <p className="text-xs text-donkey-muted mt-1">
              {trip.status === 'completed' ? 'Completed' : trip.status}
              {trip.rail && ` · paid by ${trip.rail === 'lnaddress' ? 'Lightning' : trip.rail}`}
              {trip.providerNpub && ` · ${trip.providerNpub.slice(0, 12)}…`}
            </p>
          </div>
        ))
      )}

      {trips.length > 0 && (
        confirmClear ? (
          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={() => setConfirmClear(false)}>
              Keep
            </button>
            <button
              className="btn-danger flex-1"
              onClick={() => {
                clearTripHistory();
                setTrips([]);
                setConfirmClear(false);
              }}
            >
              Clear history
            </button>
          </div>
        ) : (
          <button
            className="text-donkey-muted text-xs w-full text-center"
            onClick={() => setConfirmClear(true)}
          >
            Clear history from this device
          </button>
        )
      )}
    </div>
  );
}
