import { useState } from 'react';
import { confirmReceived } from '../../services/api';
import { useDomain } from '../../context/DomainContext';
import { useT } from '../../i18n';
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
  const { t, td } = useT();
  const requesterLabel = td(profile?.roles.requester || 'rider').toLowerCase();
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
      await confirmReceived(task.id, task.operatorBase);
      setLocalConfirmed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('receipt.confirmFailed'));
    } finally {
      setConfirming(false);
    }
  };

  if (confirmed) {
    return (
      <div className="card text-center">
        <p className="text-donkey-green font-bold">{t('settle.confirmed')}</p>
        {rail && (
          <p className="text-xs text-donkey-muted mt-1">
            {t('settle.receivedVia', { rail: RAIL_LABELS[rail] || rail })}
          </p>
        )}
      </div>
    );
  }

  if (!declared) return null;

  return (
    <div className="card space-y-3">
      <div>
        <p className="section-title">{t('settle.declared')}</p>
        <p className="text-sm text-donkey-text mt-1">
          {rail
            ? t('settle.saysPaidVia', { label: requesterLabel, rail: RAIL_LABELS[rail] || rail })
            : t('settle.saysPaid', { label: requesterLabel })}
        </p>
        {settlement?.verified && (
          <p className="text-xs text-donkey-green mt-1">{t('settle.verified')}</p>
        )}
        <p className="text-[11px] text-donkey-muted mt-1">{t('settle.confirmWarning')}</p>
      </div>
      <button
        className="btn-primary w-full"
        onClick={handleConfirm}
        disabled={confirming}
      >
        {confirming ? t('settle.confirming') : t('settle.confirmReceived')}
      </button>
      {error && <p className="text-donkey-red text-sm">{error}</p>}
    </div>
  );
}
