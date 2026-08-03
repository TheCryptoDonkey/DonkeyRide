import { useState } from 'react';
import { AddressSearch } from '../AddressSearch';
import { showToast } from '../common/Toast';
import { useLocation } from '../../hooks/useLocation';
import { updateTaskPickup } from '../../services/api';
import { reverseGeocode } from '../../utils/reverse-geocode';
import { useT } from '../../i18n';
import type { LatLng, Task } from '../../types/api';

interface PickupAdjusterProps {
  task: Task;
  originLabel: string;
  providerLabel: string;
  /** True once a provider has committed — the copy and limits differ */
  matched: boolean;
  onUpdated: (task: Task) => void;
}

/**
 * Move the pickup after requesting — because people walk.
 *
 * They leave the pub, cross to a legal kerb, or dropped the pin on the
 * wrong side of a dual carriageway. Uber and Bolt both allow this right
 * up to arrival and it is one of the sharper edges of a map-tap-only
 * flow. The operator caps how far the point may move once a provider has
 * committed, and never re-prices an agreed fare.
 */
export function PickupAdjuster({
  task, originLabel, providerLabel, matched, onUpdated,
}: PickupAdjusterProps) {
  const { t } = useT();
  const { location, error: locationError, loading: locationLoading } = useLocation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(task.pickupNote || '');

  const hasFix = !locationLoading && !locationError;

  const move = async (loc: LatLng, address?: string | null) => {
    setBusy(true);
    try {
      const named = address ?? await reverseGeocode(loc);
      const updated = await updateTaskPickup(task.id, { location: loc, address: named });
      onUpdated(updated);
      setOpen(false);
      showToast(t('active.pickupMoved', { label: originLabel }));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('active.pickupMoveFailed'), { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async () => {
    setBusy(true);
    try {
      onUpdated(await updateTaskPickup(task.id, { note }));
      showToast(t('active.noteSaved'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('active.pickupMoveFailed'), { type: 'error' });
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
        <p className="meta-label">{t('active.movedTitle', { label: originLabel.toLowerCase() })}</p>
        <p className="text-sm text-donkey-text mt-1">
          {t('active.movedBody', { label: originLabel.toLowerCase() })}
        </p>
      </button>
    );
  }

  return (
    <div className="meta-card border border-donkey-blue/40">
      <p className="meta-label mb-2">{t('active.moveTitle', { label: originLabel })}</p>

      <button
        className="btn-secondary w-full text-sm mb-2"
        disabled={busy || !hasFix}
        onClick={() => move(location)}
      >
        {busy ? t('active.moving') : t('active.imHereNow')}
      </button>

      <AddressSearch
        placeholder={t('active.searchPickup', { label: originLabel.toLowerCase() })}
        biasLocation={task.pickup}
        onSelect={(loc, label) => move(loc, label)}
      />

      <p className="text-xs text-donkey-muted mt-2">
        {matched
          ? t('active.moveLimit', { label: providerLabel.toLowerCase() })
          : t('active.moveFree')}
      </p>
      <p className="text-xs text-donkey-muted mt-1">{t('active.moveDrag')}</p>

      {/* Meeting instructions — the thing a pin cannot say */}
      <div className="mt-3 pt-3 border-t border-donkey-border/50">
        <p className="meta-label mb-1">{t('active.noteTitle')}</p>
        <input
          type="text"
          className="w-full bg-donkey-bg border border-donkey-border rounded-lg px-3 py-2 text-donkey-text text-sm"
          value={note}
          maxLength={140}
          placeholder={t('active.notePlaceholder')}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void saveNote(); }}
        />
        {note !== (task.pickupNote || '') && (
          <button
            className="btn-secondary w-full text-sm mt-2"
            disabled={busy}
            onClick={() => void saveNote()}
          >
            {t('active.saveNote', { label: providerLabel.toLowerCase() })}
          </button>
        )}
      </div>

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
