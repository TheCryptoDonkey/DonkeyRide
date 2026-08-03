import { useEffect, useState } from 'react';
import { useT } from '../../i18n';

interface SearchingPanelProps {
  /** Unix ms the request was made — the elapsed clock counts from here */
  since: number;
  /** Latest widening attempt from the operator, if one has arrived yet */
  attempt?: number;
  radiusKm?: number;
  providersNotified?: number;
  /** Word for the people being searched for ("drivers") */
  providerLabel: string;
}

/**
 * What a rider sees between tapping Request and someone accepting.
 *
 * The old screen showed a static "REQUESTED" badge, which is indistinguishable
 * from a broken app. A wait is tolerable when it is visibly a wait: an elapsed
 * clock that is obviously ticking, and honest news each time the search widens.
 */
export function SearchingPanel({
  since, attempt, radiusKm, providersNotified, providerLabel,
}: SearchingPanelProps) {
  const { t } = useT();
  const [elapsed, setElapsed] = useState(() => Math.max(0, Date.now() - since));

  useEffect(() => {
    const timer = setInterval(() => setElapsed(Math.max(0, Date.now() - since)), 1000);
    return () => clearInterval(timer);
  }, [since]);

  const seconds = Math.floor(elapsed / 1000);
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <div className="meta-card" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        {/* Three dots that are plainly alive — the whole point is that the
            rider can see the app is still working */}
        <span className="flex gap-1 shrink-0" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-2 h-2 rounded-full bg-donkey-blue animate-pulse"
              style={{ animationDelay: `${i * 200}ms` }}
            />
          ))}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-donkey-text">
            {t('searching.title', { label: providerLabel })}
          </p>
          <p className="text-xs text-donkey-muted">
            {attempt && attempt > 1 && radiusKm
              ? t('searching.widened', { km: Math.round(radiusKm) })
              : providersNotified
                ? t('searching.notified', { n: providersNotified, label: providerLabel })
                : t('searching.nearby', { label: providerLabel })}
          </p>
        </div>
        <span className="text-sm font-mono text-donkey-muted tabular-nums shrink-0">
          {clock}
        </span>
      </div>
    </div>
  );
}
