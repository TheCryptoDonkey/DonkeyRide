import { useEffect, useState } from 'react';
import { useIdentity } from '../../context/IdentityContext';
import { getDriverEarnings, type DriverEarnings } from '../../services/api';
import { DualPrice } from '../../components/common/DualPrice';
import { useT } from '../../i18n';

/**
 * Earnings transparency is a core driver-respect feature: full visibility
 * of every completed job, fare and tip — no black-box take rates.
 */
export function EarningsPage() {
  const { t } = useT();
  const { identity } = useIdentity();
  const [earnings, setEarnings] = useState<DriverEarnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!identity?.pubKeyHex) return;
    setLoading(true);
    getDriverEarnings(identity.pubKeyHex)
      .then(setEarnings)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [identity?.pubKeyHex]);

  if (error) {
    return (
      <div className="p-6 text-donkey-red text-sm" role="alert">
        {t('earnings.failed', { error })}
      </div>
    );
  }

  // Loading skeleton — never show zeros as if they were real figures
  if (loading || !earnings) {
    return (
      <div className="h-full overflow-y-auto p-6 space-y-6 max-w-lg mx-auto w-full">
        <div>
          <h1 className="text-xl font-black tracking-tight">{t('earnings.title')}</h1>
          <p className="text-sm text-donkey-muted mt-1">{t('earnings.loading')}</p>
        </div>
        <div className="grid grid-cols-3 gap-3 animate-pulse">
          {[0, 1, 2].map((i) => (
            <div key={i} className="stat-card space-y-2">
              <div className="h-5 bg-donkey-border rounded" />
              <div className="h-3 bg-donkey-border rounded w-2/3 mx-auto" />
            </div>
          ))}
        </div>
        <div className="space-y-2 animate-pulse">
          <div className="h-3 bg-donkey-border rounded w-1/3" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="card">
              <div className="h-4 bg-donkey-border rounded w-1/2 mb-2" />
              <div className="h-3 bg-donkey-border rounded w-3/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const summary = earnings.summary;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 max-w-lg mx-auto w-full">
      <div>
        <h1 className="text-xl font-black tracking-tight">{t('earnings.title')}</h1>
        <p className="text-sm text-donkey-muted mt-1">{t('earnings.intro')}</p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="stat-card">
          <DualPrice sats={summary?.today.sats ?? 0} size="sm" />
          <p className="stat-label">{t('earnings.today', { n: summary?.today.rides ?? 0 })}</p>
        </div>
        <div className="stat-card">
          <DualPrice sats={summary?.week.sats ?? 0} size="sm" />
          <p className="stat-label">{t('earnings.week', { n: summary?.week.rides ?? 0 })}</p>
        </div>
        <div className="stat-card">
          <DualPrice sats={summary?.allTime.sats ?? 0} size="sm" />
          <p className="stat-label">{t('earnings.allTime', { n: summary?.allTime.rides ?? 0 })}</p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-donkey-muted">{t('earnings.completedJobs')}</p>
        {earnings.rides.length === 0 && (
          <div className="card text-center text-sm text-donkey-muted">
            {t('earnings.empty')}
          </div>
        )}
        {earnings.rides.map((ride) => (
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
                <p className="text-xs text-donkey-green">
                  {t('earnings.tip', { n: ride.tips.toLocaleString() })}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
