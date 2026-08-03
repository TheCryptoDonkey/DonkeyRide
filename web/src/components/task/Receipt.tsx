import { DualPrice } from '../common/DualPrice';
import { PersonName } from '../common/PersonCard';
import { formatDistance, formatDuration } from '../../services/pricing';
import { useT } from '../../i18n';
import type { TripRecord } from '../../services/trip-history';

interface ReceiptProps {
  trip: TripRecord;
  onClose: () => void;
  /** Book the same journey again */
  onRebook?: (trip: TripRecord) => void;
}

/**
 * A receipt that explains the number rather than restating it.
 *
 * History used to show a total and a rail, which answers "how much" and
 * nothing else — no distance breakdown, no waiting time, no tip line, and
 * no way to check whether a fare was right. Everything here is already on
 * the device: the operator keeps no durable record of anyone's journeys, so
 * this is the rider's own copy and the only copy.
 */
export function Receipt({ trip, onClose, onRebook }: ReceiptProps) {
  const { t } = useT();

  const b = trip.breakdown;
  const rows: { label: string; sats: number }[] = [];
  if (b) {
    rows.push({ label: t('request.base'), sats: b.baseFareSats });
    rows.push({ label: t('request.distance'), sats: b.distanceFareSats });
    rows.push({ label: t('request.time'), sats: b.timeFareSats });
  }
  if (trip.waitingSats) {
    rows.push({
      label: t('receipt.waiting', { n: Math.round(trip.waitingMinutes || 0) }),
      sats: trip.waitingSats,
    });
  }

  const date = new Date(trip.completedAt);

  return (
    <div
      className="fixed inset-0 z-[2000] bg-black/70 flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('receipt.title')}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-sm max-h-[85vh] overflow-y-auto space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-black text-donkey-text">{t('receipt.title')}</h2>
          <p className="text-xs text-donkey-muted">
            {date.toLocaleDateString(undefined, {
              weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
            })}
            {' · '}
            {date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        {/* Journey */}
        <div className="space-y-1 text-sm">
          <p className="flex gap-2">
            <span className="text-donkey-green shrink-0" aria-hidden="true">●</span>
            <span className="text-donkey-text">{trip.from || '—'}</span>
          </p>
          <p className="flex gap-2">
            <span className="text-donkey-red shrink-0" aria-hidden="true">●</span>
            <span className="text-donkey-text">{trip.to || '—'}</span>
          </p>
        </div>

        {(trip.distanceKm != null || trip.durationMin != null) && (
          <p className="text-xs text-donkey-muted">
            {trip.distanceKm != null && formatDistance(trip.distanceKm)}
            {trip.distanceKm != null && trip.durationMin != null && ' · '}
            {trip.durationMin != null && formatDuration(trip.durationMin)}
          </p>
        )}

        {/* What made up the fare */}
        {rows.length > 0 && (
          <div className="meta-card space-y-1">
            {rows.map((row) => (
              <div key={row.label} className="flex justify-between items-baseline text-sm">
                <span className="text-donkey-muted">{row.label}</span>
                <DualPrice sats={row.sats} size="sm" compact ratesOverride={trip.btcPricesAt} />
              </div>
            ))}
            {trip.surgeMultiplier != null && trip.surgeMultiplier > 1 && (
              <p className="text-xs text-donkey-orange pt-1">
                {t('receipt.surge', { x: trip.surgeMultiplier.toFixed(1) })}
              </p>
            )}
            {b && b.operatorFeeSats > 0 && (
              <div className="flex justify-between items-baseline text-xs pt-1">
                <span className="text-donkey-muted">{t('request.operator')}</span>
                <DualPrice sats={b.operatorFeeSats} size="sm" compact ratesOverride={trip.btcPricesAt} />
              </div>
            )}
          </div>
        )}

        {/* Total */}
        <div className="flex justify-between items-baseline border-t border-donkey-border pt-3">
          <span className="text-sm font-bold text-donkey-text">{t('receipt.total')}</span>
          <DualPrice sats={trip.fareSats} size="lg" ratesOverride={trip.btcPricesAt} />
        </div>

        {trip.tipSats ? (
          <div className="flex justify-between items-baseline text-sm">
            <span className="text-donkey-muted">{t('receipt.tip')}</span>
            <DualPrice sats={trip.tipSats} size="sm" compact ratesOverride={trip.btcPricesAt} />
          </div>
        ) : null}

        {/* Who and how */}
        <div className="text-xs text-donkey-muted space-y-1">
          {trip.providerNpub && (
            <p>
              {t('receipt.driver')}{' '}
              <PersonName subject={trip.providerNpub} className="text-donkey-text" />
            </p>
          )}
          {trip.rail && (
            <p>
              {t('receipt.paidBy', {
                rail: trip.rail === 'lnaddress' ? 'Lightning' : trip.rail,
              })}
            </p>
          )}
          <p className="font-mono break-all opacity-70">{trip.id}</p>
        </div>

        <p className="text-xs text-donkey-muted">{t('receipt.stored')}</p>

        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={onClose}>
            {t('common.close')}
          </button>
          {onRebook && trip.fromLoc && trip.toLoc && (
            <button className="btn-primary flex-1" onClick={() => onRebook(trip)}>
              {t('receipt.rebook')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
