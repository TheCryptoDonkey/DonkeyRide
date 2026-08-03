import { useEffect, useState } from 'react';
import { DualPrice } from '../common/DualPrice';
import { useT } from '../../i18n';
import { getOperatorInfoCached } from '../../services/api';
import type { Task } from '../../types/api';

interface WaitingTimerProps {
  task: Task;
  /** Which side is looking — the copy differs, the numbers do not */
  role: 'requester' | 'provider';
  /**
   * Override the operator's free-waiting period. Tests pass this; screens
   * should not — the real figure comes from the operator (see below).
   */
  freeMinutes?: number;
}

/**
 * Waiting time, shown to both parties as it happens.
 *
 * A provider sitting at the kerb for twelve minutes did real work, and
 * every commercial app prices it. The operator holds no money, so this
 * is not a charge it levies: past the free period the agreed number both
 * parties settle peer-to-peer simply grows, at the same per-minute rate
 * as the fare. Showing the timer running BEFORE it costs anything is the
 * point — nobody should discover a surcharge after the fact.
 */
export function WaitingTimer({ task, role, freeMinutes }: WaitingTimerProps) {
  const { t } = useT();
  const [now, setNow] = useState(() => Date.now());
  // The operator decides when waiting starts costing (FREE_WAITING_MINUTES).
  // A hardcoded client default would quietly promise free minutes that the
  // operator is already charging for, so until the real figure arrives this
  // stays null and the countdown line is withheld rather than guessed.
  const [operatorFree, setOperatorFree] = useState<number | null>(null);

  const arrivedAt = task.arrivedAt ? new Date(task.arrivedAt).getTime() : null;
  const running = Boolean(arrivedAt) && !task.startedAt;

  useEffect(() => {
    if (freeMinutes != null) return;
    let live = true;
    getOperatorInfoCached()
      .then((info) => {
        if (live && typeof info.freeWaitingMinutes === 'number') {
          setOperatorFree(info.freeWaitingMinutes);
        }
      })
      .catch(() => { /* offline — say nothing rather than guess */ });
    return () => { live = false; };
  }, [freeMinutes]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  // Settled: the trip started and waiting was added to the agreed fare
  if (task.waiting && task.waiting.sats > 0) {
    return (
      <div className="meta-card">
        <p className="meta-label">{t('waiting.chargedTitle')}</p>
        <p className="text-sm text-donkey-text mt-1">
          {t('waiting.charged', { n: task.waiting.minutes })}{' '}
          <DualPrice sats={task.waiting.sats} size="sm" />
        </p>
      </div>
    );
  }

  if (!running || !arrivedAt) return null;

  const waitedSeconds = Math.max(0, Math.floor((now - arrivedAt) / 1000));
  const free = freeMinutes ?? operatorFree;
  const freeSeconds = free != null ? free * 60 : null;
  const chargeable = freeSeconds != null && waitedSeconds > freeSeconds;
  const remaining = freeSeconds != null ? Math.max(0, freeSeconds - waitedSeconds) : 0;

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className={`meta-card ${chargeable ? 'border border-donkey-orange/40' : ''}`}>
      <p className="meta-label">{t('waiting.title')}</p>
      <p className="text-sm text-donkey-text mt-1 font-bold">{mmss(waitedSeconds)}</p>
      {/* The elapsed time is always true; what it COSTS is the operator's
          to say, so that line waits for the operator's own figure. */}
      {freeSeconds != null && (
        <p className="text-xs text-donkey-muted mt-1">
          {chargeable
            ? t(role === 'requester' ? 'waiting.chargingRider' : 'waiting.chargingProvider')
            : t(role === 'requester' ? 'waiting.freeRider' : 'waiting.freeProvider', { time: mmss(remaining) })}
        </p>
      )}
    </div>
  );
}
