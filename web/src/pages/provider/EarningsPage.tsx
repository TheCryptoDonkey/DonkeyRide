import { useEffect, useState } from 'react';
import { useIdentity } from '../../context/IdentityContext';
import { getDriverEarnings, type DriverEarnings } from '../../services/api';
import { DualPrice } from '../../components/common/DualPrice';

/**
 * Earnings transparency is a core driver-respect feature: full visibility
 * of every completed job, fare and tip — no black-box take rates.
 */
export function EarningsPage() {
  const { identity } = useIdentity();
  const [earnings, setEarnings] = useState<DriverEarnings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!identity?.pubKeyHex) return;
    getDriverEarnings(identity.pubKeyHex)
      .then(setEarnings)
      .catch((err) => setError(err.message));
  }, [identity?.pubKeyHex]);

  if (error) {
    return <div className="p-6 text-donkey-red text-sm">Failed to load earnings: {error}</div>;
  }

  const summary = earnings?.summary;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 max-w-lg mx-auto w-full">
      <div>
        <h1 className="text-xl font-black tracking-tight">Earnings</h1>
        <p className="text-sm text-donkey-muted mt-1">
          Every job, every sat. What the rider pays is what you see.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="stat-card">
          <DualPrice sats={summary?.today.sats ?? 0} size="sm" />
          <p className="stat-label">Today · {summary?.today.rides ?? 0}</p>
        </div>
        <div className="stat-card">
          <DualPrice sats={summary?.week.sats ?? 0} size="sm" />
          <p className="stat-label">7 days · {summary?.week.rides ?? 0}</p>
        </div>
        <div className="stat-card">
          <DualPrice sats={summary?.allTime.sats ?? 0} size="sm" />
          <p className="stat-label">All time · {summary?.allTime.rides ?? 0}</p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-donkey-muted">Completed jobs</p>
        {earnings && earnings.rides.length === 0 && (
          <div className="card text-center text-sm text-donkey-muted">
            No completed jobs yet — go online to start earning.
          </div>
        )}
        {earnings?.rides.map((ride) => (
          <div key={ride.id} className="card flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">
                {ride.completedAt ? new Date(ride.completedAt).toLocaleString() : '—'}
              </p>
              <p className="text-xs text-donkey-muted font-mono">
                {ride.id}
                {ride.rating != null && <span className="ml-2 text-donkey-orange">★ {ride.rating}</span>}
              </p>
              {ride.settlement && (
                <p className="text-xs text-donkey-muted">
                  {ride.settlement.method} · {ride.settlement.status}
                </p>
              )}
            </div>
            <div className="text-right">
              <DualPrice sats={ride.fare} size="sm" />
              {ride.tips > 0 && (
                <p className="text-xs text-donkey-green">+{ride.tips.toLocaleString()} tip</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
