import { useEffect, useState } from 'react';
import { useIdentity } from '../../context/IdentityContext';
import { useT } from '../../i18n';
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
  // Checked immediately before getting into a stranger's car — it has to
  // read in the reader's own language
  const { t } = useT();
  const { identity } = useIdentity();
  const [code, setCode] = useState<Code | null>(null);

  // The key comes from context, NOT the module-level getter, because the
  // identity loads asynchronously. Reading the getter once at mount meant
  // that whenever this mounted first — which is what happens on a reload,
  // since nothing gates it on identity — the effect bailed and never ran
  // again, so the code was simply absent for the rest of the session. That
  // is precisely when someone reopens the app at the kerb to check the car.
  useEffect(() => {
    const privKey = identity?.privKeyHex;
    if (!privKey || !counterpartyPubkey) return;
    let stale = false;
    derivePickupCode(privKey, counterpartyPubkey, taskId)
      .then((derived) => { if (!stale) setCode(derived); })
      .catch(() => {});
    return () => { stale = true; };
  }, [taskId, counterpartyPubkey, identity?.privKeyHex]);

  if (!code) return null;

  return (
    <div className="meta-card flex items-center justify-between gap-3">
      <div>
        <p className="meta-label">{t('code.title')}</p>
        <p className="text-xs text-donkey-muted mt-1">
          {role === 'requester'
            ? t('code.riderHint', { label: counterpartyLabel.toLowerCase() })
            : t('code.providerHint', { label: counterpartyLabel.toLowerCase() })}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-2xl font-black tracking-widest text-donkey-orange">{code.pin}</p>
        <p className="text-xs text-donkey-muted">“{code.word}”</p>
      </div>
    </div>
  );
}
