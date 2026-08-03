import { useState } from 'react';
import { AddressSearch } from '../AddressSearch';
import { DualPrice } from '../common/DualPrice';
import { showToast } from '../common/Toast';
import { changeTaskDropoff, previewTaskDropoff, type DropoffChange } from '../../services/api';
import { reverseGeocode } from '../../utils/reverse-geocode';
import { useT } from '../../i18n';
import type { LatLng, Task } from '../../types/api';

interface DestinationChangerProps {
  task: Task;
  destinationLabel: string;
  providerLabel: string;
  onUpdated: (task: Task) => void;
}

/**
 * Change where the journey ends, mid-journey.
 *
 * The one thing every commercial app allows and this one did not: the
 * party moved, the parcel has to go to the depot after all, the meeting
 * was switched to the other office. Moving the PICKUP is a walk and the
 * agreed fare stands; a new destination is different work, so it re-prices
 * — and the rider sees the new number and taps again before anything is
 * committed. No silent repricing, which is the failure mode this whole
 * codebase exists to avoid.
 */
export function DestinationChanger({
  task, destinationLabel, providerLabel, onUpdated,
}: DestinationChangerProps) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<
    { location: LatLng; address: string | null; quote: DropoffChange } | null
  >(null);

  const quote = async (loc: LatLng, label?: string | null) => {
    setBusy(true);
    try {
      const address = label ?? await reverseGeocode(loc);
      const preview = await previewTaskDropoff(
        task.id, { location: loc }, task.operatorBase,
      );
      setPending({ location: loc, address, quote: preview });
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : t('destination.failed'),
        { type: 'error' },
      );
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const { task: updated } = await changeTaskDropoff(task.id, {
        location: pending.location,
        address: pending.address,
        // Spend the preview the rider just read, so the fare they confirm is
        // the fare they were shown
        quoteId: pending.quote.quote_id,
      }, task.operatorBase);
      onUpdated(updated);
      setPending(null);
      setOpen(false);
      showToast(t('destination.changed', { label: destinationLabel.toLowerCase() }));
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : t('destination.failed'),
        { type: 'error' },
      );
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        className="meta-card w-full text-left min-h-[44px]"
        onClick={() => setOpen(true)}
      >
        <p className="meta-label">{t('destination.title', { label: destinationLabel.toLowerCase() })}</p>
        <p className="text-sm text-donkey-text mt-1">
          {t('destination.body', { label: destinationLabel.toLowerCase() })}
        </p>
      </button>
    );
  }

  // Priced, waiting for a second tap. The number is the whole point of
  // this step, so it leads.
  if (pending) {
    const change = pending.quote.fare_change_sats;
    return (
      <div className="meta-card border border-donkey-blue/40 space-y-3">
        <div>
          <p className="meta-label">{t('destination.newTitle', { label: destinationLabel })}</p>
          <p className="text-sm font-semibold text-donkey-text mt-1">
            {pending.address
              || `${pending.location.lat.toFixed(4)}, ${pending.location.lng.toFixed(4)}`}
          </p>
        </div>

        <div className="flex items-baseline justify-between">
          <span className="text-sm text-donkey-muted">{t('destination.newFare')}</span>
          <DualPrice sats={pending.quote.fare_sats} size="md" />
        </div>
        <p className={`text-xs font-semibold ${change > 0 ? 'text-donkey-orange' : 'text-donkey-green'}`}>
          {change === 0
            ? t('destination.samePrice')
            : change > 0
              ? t('destination.more', { n: Math.abs(change).toLocaleString() })
              : t('destination.less', { n: Math.abs(change).toLocaleString() })}
        </p>
        <p className="text-xs text-donkey-muted">
          {t('destination.confirmNote', { label: providerLabel.toLowerCase() })}
        </p>

        <div className="flex gap-3">
          <button
            className="btn-secondary flex-1"
            disabled={busy}
            onClick={() => setPending(null)}
          >
            {t('common.back')}
          </button>
          <button className="btn-primary flex-1" disabled={busy} onClick={() => void confirm()}>
            {busy ? t('destination.changing') : t('destination.confirm')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="meta-card border border-donkey-blue/40">
      <p className="meta-label mb-2">{t('destination.searchTitle', { label: destinationLabel })}</p>
      <AddressSearch
        placeholder={t('destination.searchPlaceholder', { label: destinationLabel.toLowerCase() })}
        biasLocation={task.dropoff || task.pickup}
        autoFocus
        onSelect={(loc, label) => void quote(loc, label)}
      />
      <p className="text-xs text-donkey-muted mt-2">{t('destination.priceNote')}</p>
      <button
        className="text-xs text-donkey-muted underline mt-2 min-h-[44px]"
        onClick={() => setOpen(false)}
        disabled={busy}
      >
        {t('common.close')}
      </button>
    </div>
  );
}
