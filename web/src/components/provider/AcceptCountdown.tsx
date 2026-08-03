import { useEffect, useRef, useState } from 'react';

interface AcceptCountdownProps {
  /** Seconds the driver has to decide */
  seconds: number;
  /** Fired once when the clock runs out */
  onExpire: () => void;
  /** Pause the clock (e.g. while an accept is in flight) */
  paused?: boolean;
}

/**
 * The decision clock on an incoming job.
 *
 * A job offer with no clock has two failure modes: the rider waits on a driver
 * who put their phone in a pocket, and the driver has no signal that hesitating
 * costs them the job. Every dispatch app shows a shrinking ring for exactly
 * this reason. On expiry the offer is released rather than silently held.
 */
export function AcceptCountdown({ seconds, onExpire, paused = false }: AcceptCountdownProps) {
  const [remaining, setRemaining] = useState(seconds);
  const firedRef = useRef(false);

  useEffect(() => {
    if (paused) return;
    const deadline = Date.now() + remaining * 1000;
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0 && !firedRef.current) {
        firedRef.current = true;
        clearInterval(timer);
        onExpire();
      }
    }, 250);
    return () => clearInterval(timer);
    // Restarting on `remaining` would reset the deadline every tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  const fraction = seconds > 0 ? remaining / seconds : 0;
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const urgent = remaining <= 5;

  return (
    <div
      className="relative w-16 h-16 shrink-0"
      role="timer"
      aria-live="off"
      aria-label={`${remaining} seconds left to accept`}
    >
      <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
        <circle
          cx="32" cy="32" r={radius}
          fill="none" strokeWidth="5"
          className="stroke-donkey-border"
        />
        <circle
          cx="32" cy="32" r={radius}
          fill="none" strokeWidth="5" strokeLinecap="round"
          className={urgent ? 'stroke-donkey-red' : 'stroke-donkey-green'}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: circumference * (1 - fraction),
            transition: 'stroke-dashoffset 250ms linear',
          }}
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center text-lg font-black tabular-nums ${
          urgent ? 'text-donkey-red' : 'text-donkey-text'
        }`}
      >
        {remaining}
      </span>
    </div>
  );
}
