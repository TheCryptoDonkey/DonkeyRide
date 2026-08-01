import { useState } from 'react';
import { DualPrice } from '../common/DualPrice';
import type { StakeInfo } from '../../types/api';

interface StakePanelProps {
  stake: StakeInfo | undefined;
  label: string;
  onLock?: () => Promise<void>;
  /** Shown for non-instant rails: user pays the invoice then confirms */
  onConfirmPaid?: () => Promise<void>;
}

export function StakePanel({ stake, label, onLock, onConfirmPaid }: StakePanelProps) {
  const [locking, setLocking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLock = async () => {
    if (!onLock || locking) return;
    setLocking(true);
    setError(null);
    try {
      await onLock();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to lock stake');
    } finally {
      setLocking(false);
    }
  };

  const handleConfirmPaid = async () => {
    if (!onConfirmPaid || confirming) return;
    setConfirming(true);
    setError(null);
    try {
      await onConfirmPaid();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm payment');
    } finally {
      setConfirming(false);
    }
  };

  const copyInvoice = async () => {
    if (!stake?.invoice) return;
    try {
      await navigator.clipboard.writeText(stake.invoice);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Invoice is visible below — manual copy still possible
    }
  };

  if (!stake) return null;

  const awaitingPayment = stake.status === 'pending' && !!stake.invoice;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold uppercase text-donkey-muted">{label}</span>
        <span className={`text-xs font-bold uppercase ${
          stake.status === 'locked' ? 'text-donkey-green' :
          stake.status === 'forfeited' ? 'text-donkey-red' :
          'text-donkey-orange'
        }`}>
          {awaitingPayment ? 'awaiting payment' : stake.status}
        </span>
      </div>

      <DualPrice sats={stake.amountSats} size="md" />

      {stake.status === 'pending' && !stake.invoice && onLock && (
        <button
          className="btn-primary w-full mt-3 text-sm"
          onClick={handleLock}
          disabled={locking}
        >
          {locking ? 'Locking...' : 'Lock Stake'}
        </button>
      )}

      {awaitingPayment && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-donkey-muted">
            Pay this invoice to lock your stake, then confirm below.
          </p>
          <div className="p-2 bg-donkey-bg rounded text-xs font-mono break-all text-donkey-muted">
            {stake.invoice}
          </div>
          <div className="flex gap-2">
            <button
              className="btn-secondary flex-1 text-sm"
              onClick={copyInvoice}
            >
              {copied ? 'Copied ✓' : 'Copy invoice'}
            </button>
            {onConfirmPaid && (
              <button
                className="btn-primary flex-1 text-sm"
                onClick={handleConfirmPaid}
                disabled={confirming}
              >
                {confirming ? 'Checking...' : "I've paid"}
              </button>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-donkey-red text-xs mt-2">{error}</p>}
    </div>
  );
}
