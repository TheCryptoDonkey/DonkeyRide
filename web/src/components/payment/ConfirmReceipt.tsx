import { useState } from 'react';
import { confirmReceived } from '../../services/api';
import { useDomain } from '../../context/DomainContext';
import type { Task, SettlementInfo } from '../../types/api';

interface ConfirmReceiptProps {
  task: Task;
  /** Settlement state from getTask / WS */
  settlement?: SettlementInfo | null;
  /** Rail from a fresh settlement_declared WS, before a task refresh lands */
  declaredRail?: string | null;
}

const RAIL_LABELS: Record<string, string> = {
  lnaddress: 'Lightning',
  lightning: 'Lightning',
  tando: 'Tando (Lightning to M-Pesa)',
  mpesa: 'M-Pesa',
  cash: 'cash',
};

/**
 * Driver-side receipt confirmation. When the rider declares a direct payment,
 * the driver sees which rail was used and confirms the funds arrived. This is
 * the human counterpart to verification for rails that cannot be auto-checked
 * (cash, M-Pesa). Funds always move rider -> driver directly; this only
 * records that the driver acknowledges receipt.
 */
export function ConfirmReceipt({ task, settlement, declaredRail }: ConfirmReceiptProps) {
  const { profile } = useDomain();
  const requesterLabel = (profile?.roles.requester || 'rider').toLowerCase();
  const [confirming, setConfirming] = useState(false);
  const [localConfirmed, setLocalConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = localConfirmed
    || settlement?.status === 'confirmed'
    || settlement?.confirmedByProvider === true;

  const rail = settlement?.rail || declaredRail || null;
  const declared = !!rail || (!!settlement?.status && !confirmed);

  const handleConfirm = async () => {
    if (confirming) return;
    setConfirming(true);
    setError(null);
    try {
      await confirmReceived(task.id);
      setLocalConfirmed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm receipt');
    } finally {
      setConfirming(false);
    }
  };

  if (confirmed) {
    return (
      <div className="card text-center">
        <p className="text-donkey-green font-bold">Payment confirmed</p>
        {rail && (
          <p className="text-xs text-donkey-muted mt-1">
            Received via {RAIL_LABELS[rail] || rail}.
          </p>
        )}
      </div>
    );
  }

  if (!declared) return null;

  return (
    <div className="card space-y-3">
      <div>
        <p className="section-title">Payment declared</p>
        <p className="text-sm text-donkey-text mt-1">
          Your {requesterLabel} says they paid you
          {rail ? ` via ${RAIL_LABELS[rail] || rail}` : ''}.
        </p>
        {settlement?.verified && (
          <p className="text-xs text-donkey-green mt-1">Verified by preimage.</p>
        )}
        <p className="text-[11px] text-donkey-muted mt-1">
          Confirm only once the money is actually in your account.
        </p>
      </div>
      <button
        className="btn-primary w-full"
        onClick={handleConfirm}
        disabled={confirming}
      >
        {confirming ? 'Confirming…' : 'Confirm received'}
      </button>
      {error && <p className="text-donkey-red text-sm">{error}</p>}
    </div>
  );
}
