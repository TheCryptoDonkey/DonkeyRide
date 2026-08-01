import { useEffect, useState } from 'react';
import { StakePanel } from './StakePanel';
import { useDomain } from '../../context/DomainContext';
import { useIdentity } from '../../context/IdentityContext';
import {
  getOperatorInfoCached, postRequesterStake, postProviderStake,
  confirmRequesterStake, confirmProviderStake, type StakeResponse,
} from '../../services/api';
import type { Task, StakeInfo } from '../../types/api';

interface TaskStakePanelProps {
  task: Task;
  role: 'requester' | 'provider';
}

/**
 * Mounts StakePanel for the active task, gated on the operator's payment
 * capabilities: stakes only make sense on custodial rails, so nothing is
 * shown when the operator runs on cash (record-only, no custody).
 */
export function TaskStakePanel({ task, role }: TaskStakePanelProps) {
  const { profile } = useDomain();
  const { identity } = useIdentity();
  const [supported, setSupported] = useState(false);
  const [stake, setStake] = useState<StakeInfo | null>(null);

  useEffect(() => {
    let mounted = true;
    getOperatorInfoCached()
      .then((info) => {
        if (!mounted) return;
        const payment = info.payment;
        const supportsStakes = !!payment
          && payment.provider !== 'cash'
          && (payment.capabilities?.stakes ?? true);
        setSupported(supportsStakes);
      })
      .catch(() => { if (mounted) setSupported(false); });
    return () => { mounted = false; };
  }, []);

  // Initial stake estimate from the domain's staking model
  useEffect(() => {
    if (stake) return;
    const percent = role === 'requester'
      ? profile?.stakingModel?.requesterStakePercent ?? 0
      : profile?.stakingModel?.providerStakePercent ?? 0;
    setStake({
      amountSats: Math.round((task.fareEstimateSats * percent) / 100),
      status: 'pending',
    });
  }, [profile, role, task.fareEstimateSats, stake]);

  if (!supported || !identity || !stake) return null;
  if (profile?.states.terminal.includes(task.status)) return null;

  const applyResponse = (res: StakeResponse) => {
    const amountSats = res.amountSats ?? res.amount_sats ?? stake.amountSats;
    if (res.status === 'awaiting_payment') {
      setStake({
        amountSats,
        status: 'pending',
        invoice: res.invoice,
        paymentHash: res.paymentHash,
      });
    } else {
      setStake({
        amountSats,
        status: 'locked',
        paymentHash: res.paymentHash,
      });
    }
  };

  const handleLock = async () => {
    const res = role === 'requester'
      ? await postRequesterStake(task.id, { requesterPubkey: identity.pubKeyHex })
      : await postProviderStake(task.id, { providerPubkey: identity.pubKeyHex });
    applyResponse(res);
  };

  const handleConfirmPaid = async () => {
    const res = role === 'requester'
      ? await confirmRequesterStake(task.id, { requesterPubkey: identity.pubKeyHex })
      : await confirmProviderStake(task.id, { providerPubkey: identity.pubKeyHex });
    if (res.status === 'awaiting_payment') {
      throw new Error('Payment not detected yet. Try again shortly.');
    }
    applyResponse(res);
  };

  return (
    <StakePanel
      stake={stake}
      label="Your stake"
      onLock={handleLock}
      onConfirmPaid={handleConfirmPaid}
    />
  );
}
