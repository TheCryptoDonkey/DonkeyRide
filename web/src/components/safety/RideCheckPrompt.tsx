import { useEffect, useRef, useState } from 'react';
import type { RideCheckReason } from '../../utils/ride-check';

interface RideCheckPromptProps {
  reason: RideCheckReason;
  /** Guardians this trip was shared with — 0 disables auto-escalation */
  guardianCount: number;
  onDismiss: () => void;
  onAlert: () => void;
  /** Seconds of silence before guardians are alerted automatically */
  autoAlertSeconds?: number;
}

/**
 * "Everything OK?" — raised by the client-side ride check. If the trip
 * was shared and the rider doesn't respond, their trusted contacts are
 * alerted automatically; a rider in trouble may not be able to tap.
 */
export function RideCheckPrompt({
  reason, guardianCount, onDismiss, onAlert, autoAlertSeconds = 60,
}: RideCheckPromptProps) {
  const [remaining, setRemaining] = useState(autoAlertSeconds);
  const alertedRef = useRef(false);

  const fireAlert = () => {
    if (alertedRef.current) return;
    alertedRef.current = true;
    onAlert();
  };

  useEffect(() => {
    if (guardianCount === 0) return;
    const timer = setInterval(() => {
      setRemaining((s) => {
        if (s <= 1) {
          clearInterval(timer);
          fireAlert();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardianCount]);

  const what = reason === 'off_route'
    ? 'Your trip has left the expected route.'
    : 'You seem to have been stopped for a while.';

  return (
    <div className="meta-card border-2 border-donkey-orange">
      <p className="text-base font-black text-donkey-text">Everything OK?</p>
      <p className="text-sm text-donkey-text mt-1">{what}</p>
      {guardianCount > 0 ? (
        <p className="text-xs text-donkey-muted mt-1">
          If you don't respond, the {guardianCount === 1 ? 'contact' : `${guardianCount} contacts`}{' '}
          you shared this trip with will be alerted in {remaining}s.
        </p>
      ) : (
        <p className="text-xs text-donkey-muted mt-1">
          This trip hasn't been shared with anyone — use the panic button
          below if you need help.
        </p>
      )}
      <div className="flex gap-3 mt-3">
        <button className="btn-secondary flex-1" onClick={onDismiss}>
          I'm fine
        </button>
        {guardianCount > 0 && (
          <button className="btn-danger flex-1" onClick={fireAlert}>
            Alert contacts now
          </button>
        )}
      </div>
    </div>
  );
}
