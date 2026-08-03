import { useState, useRef, useCallback } from 'react';
import { emergencyNumber } from '../../utils/emergency';
import { useT } from '../../i18n';

interface PanicButtonProps {
  onPanic: () => Promise<void>;
}

const HOLD_DURATION = 3000; // 3 seconds to activate

export function PanicButton({ onPanic }: PanicButtonProps) {
  // Someone reaching for this is in trouble. It must read in their own
  // language, which it did not before — this whole component was English.
  const { t } = useT();
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);

  const fire = useCallback(async () => {
    setSending(true);
    setFailed(false);
    try {
      await onPanic();
      setSent(true);
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  }, [onPanic]);

  const startHold = useCallback(() => {
    if (sent || sending) return;
    setHolding(true);
    startRef.current = Date.now();

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min(elapsed / HOLD_DURATION, 1);
      setProgress(pct);

      if (pct >= 1) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        setHolding(false);
        setProgress(0);
        void fire();
      }
    }, 50);
  }, [sent, sending, fire]);

  const cancelHold = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setHolding(false);
    setProgress(0);
  }, []);

  const emergency = emergencyNumber();

  if (sent) {
    return (
      <div className="bg-donkey-red/20 border border-donkey-red rounded-xl p-4 text-center">
        <p className="text-donkey-red font-bold text-lg">{t('panic.sent')}</p>
        <p className="text-donkey-muted text-sm mt-1">{t('panic.sentBody')}</p>
        <a
          href={`tel:${emergency}`}
          className="block mt-3 bg-donkey-red text-white font-black py-3 rounded-xl"
        >
          {t('panic.call', { number: emergency })}
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {failed && (
        <div className="bg-donkey-red border border-donkey-red rounded-xl p-4 text-center">
          <p className="text-white font-black text-lg">{t('panic.failed')}</p>
          <p className="text-white font-bold text-sm mt-1">
            <a href={`tel:${emergency}`} className="underline">
              {t('panic.callDirect', { number: emergency })}
            </a>
          </p>
        </div>
      )}
      <button
        className="relative w-full bg-donkey-red/80 hover:bg-donkey-red text-white font-bold py-4 rounded-xl transition-colors overflow-hidden disabled:opacity-70"
        onMouseDown={startHold}
        onMouseUp={cancelHold}
        onMouseLeave={cancelHold}
        onTouchStart={startHold}
        onTouchEnd={cancelHold}
        disabled={sending}
        aria-label={t('panic.aria')}
      >
        {/* Progress overlay */}
        <div
          className="absolute inset-0 bg-donkey-red transition-all"
          style={{ width: `${progress * 100}%` }}
        />
        <span className="relative z-10">
          {sending ? t('panic.sending')
            : holding ? t('panic.holding')
              : failed ? t('panic.retry') : t('panic.label')}
        </span>
      </button>
    </div>
  );
}
