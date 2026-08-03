import { useState } from 'react';
import { useT } from '../../i18n';
import { reasonKey, prettifyCode } from '../../utils/cancel-reasons';

interface CancelledScreenProps {
  /** Word for whoever cancelled ("driver", "rider") */
  byLabel: string;
  taskNoun: string;
  /**
   * True when they committed and then dropped it after the grace window.
   * Only then is there anything to report — changing your mind seconds
   * after matching is not a late cancellation.
   */
  late: boolean;
  /**
   * The fixed reason code the canceller chose, if they gave one. The whole
   * point of the per-side vocabulary is that the OTHER party learns why —
   * this screen used to drop it, so a rider whose app was backgrounded read
   * "the driver cancelled: a vehicle problem" in the push while one watching
   * the screen was told only "your driver cancelled".
   */
  reasonCode?: string | null;
  onReport: () => Promise<void>;
  onDone: () => void;
}

/**
 * The counterparty cancelled.
 *
 * This used to be a toast and an instant bounce back to the home screen,
 * which gave the wronged party no idea what had happened and no way to
 * record it. Mode A levies no cancellation fee — the operator holds no
 * money — so the accountability is the record, and only the person who was
 * let down can create it.
 */
export function CancelledScreen({
  byLabel, taskNoun, late, reasonCode, onReport, onDone,
}: CancelledScreenProps) {
  const { t } = useT();
  const [reported, setReported] = useState(false);
  const [busy, setBusy] = useState(false);

  const report = async () => {
    if (busy || reported) return;
    setBusy(true);
    try {
      await onReport();
      setReported(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="card max-w-sm w-full text-center space-y-4">
        <p className="text-4xl" aria-hidden="true">🚫</p>
        <div>
          <h1 className="text-lg font-black text-donkey-text">
            {t('cancelled.title', { label: byLabel })}
          </h1>
          <p className="text-sm text-donkey-muted mt-2">
            {t('cancelled.body', { noun: taskNoun })}
          </p>
          {/* Why, when they said why. "Cancelled" on its own leaves the other
              party guessing whether they did something wrong. */}
          {reasonCode && (
            <p className="text-sm text-donkey-text font-semibold mt-2">
              {t('cancelled.reason', {
                reason: (t(reasonKey(reasonCode)) === reasonKey(reasonCode)
                  ? prettifyCode(reasonCode)
                  : t(reasonKey(reasonCode))).toLowerCase(),
              })}
            </p>
          )}
        </div>

        {/* Only offered when there is genuinely something to report */}
        {late && !reported && (
          <div className="rounded-lg border border-donkey-orange/40 p-3 space-y-2 text-left">
            <p className="text-sm font-semibold text-donkey-text">
              {t('cancelled.lateTitle', { label: byLabel })}
            </p>
            <p className="text-xs text-donkey-muted">
              {t('cancelled.lateBody', { label: byLabel })}
            </p>
            <button
              className="btn-secondary w-full text-sm"
              onClick={report}
              disabled={busy}
            >
              {busy ? t('cancelled.reporting') : t('cancelled.report')}
            </button>
          </div>
        )}

        {reported && (
          <p className="text-sm text-donkey-green font-semibold">
            {t('cancelled.reported')}
          </p>
        )}

        <button className="btn-primary w-full" onClick={onDone}>
          {t('cancelled.requestAnother', { noun: taskNoun })}
        </button>
      </div>
    </div>
  );
}
