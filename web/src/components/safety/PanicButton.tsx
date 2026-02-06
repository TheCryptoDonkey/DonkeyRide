import { useState, useRef, useCallback } from 'react';

interface PanicButtonProps {
  onPanic: () => Promise<void>;
}

const HOLD_DURATION = 3000; // 3 seconds to activate

export function PanicButton({ onPanic }: PanicButtonProps) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [triggered, setTriggered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);

  const startHold = useCallback(() => {
    if (triggered) return;
    setHolding(true);
    startRef.current = Date.now();

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min(elapsed / HOLD_DURATION, 1);
      setProgress(pct);

      if (pct >= 1) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        setTriggered(true);
        setHolding(false);
        onPanic();
      }
    }, 50);
  }, [triggered, onPanic]);

  const cancelHold = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setHolding(false);
    setProgress(0);
  }, []);

  if (triggered) {
    return (
      <div className="bg-donkey-red/20 border border-donkey-red rounded-xl p-4 text-center">
        <p className="text-donkey-red font-bold text-lg">EMERGENCY ALERT SENT</p>
        <p className="text-donkey-muted text-sm mt-1">Help is on the way</p>
      </div>
    );
  }

  return (
    <button
      className="relative w-full bg-donkey-red/80 hover:bg-donkey-red text-white font-bold py-4 rounded-xl transition-colors overflow-hidden"
      onMouseDown={startHold}
      onMouseUp={cancelHold}
      onMouseLeave={cancelHold}
      onTouchStart={startHold}
      onTouchEnd={cancelHold}
    >
      {/* Progress overlay */}
      <div
        className="absolute inset-0 bg-donkey-red transition-all"
        style={{ width: `${progress * 100}%` }}
      />
      <span className="relative z-10">
        {holding ? 'HOLD TO CONFIRM...' : 'PANIC / SOS'}
      </span>
    </button>
  );
}
