import { useEffect, useState } from 'react';
import { getAuthPrivKey } from '../../services/api';
import { derivePickupCode, type PickupCode as Code } from '../../services/pickup-code';

interface PickupCodeProps {
  taskId: string;
  counterpartyPubkey: string;
  /** Who is looking at this panel */
  role: 'requester' | 'provider';
  counterpartyLabel: string;
}

/**
 * "Right rider, right car": both phones derive the same code from the
 * pair's shared secret — an impostor vehicle cannot show it. Displayed
 * from match until the trip starts.
 */
export function PickupCode({ taskId, counterpartyPubkey, role, counterpartyLabel }: PickupCodeProps) {
  const [code, setCode] = useState<Code | null>(null);

  useEffect(() => {
    const privKey = getAuthPrivKey();
    if (!privKey || !counterpartyPubkey) return;
    let stale = false;
    derivePickupCode(privKey, counterpartyPubkey, taskId)
      .then((derived) => { if (!stale) setCode(derived); })
      .catch(() => {});
    return () => { stale = true; };
  }, [taskId, counterpartyPubkey]);

  if (!code) return null;

  return (
    <div className="meta-card flex items-center justify-between gap-3">
      <div>
        <p className="meta-label">Pickup code</p>
        <p className="text-xs text-donkey-muted mt-1">
          {role === 'requester'
            ? `Your ${counterpartyLabel.toLowerCase()}'s app shows the same code — check it before getting in.`
            : `The ${counterpartyLabel.toLowerCase()}'s app shows the same code — confirm it matches.`}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-2xl font-black tracking-widest text-donkey-orange">{code.pin}</p>
        <p className="text-xs text-donkey-muted">“{code.word}”</p>
      </div>
    </div>
  );
}
