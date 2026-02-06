import { useState } from 'react';
import { DualPrice } from '../common/DualPrice';
import type { StakeInfo } from '../../types/api';

interface StakePanelProps {
  stake: StakeInfo | undefined;
  label: string;
  onLock?: () => Promise<void>;
}

export function StakePanel({ stake, label, onLock }: StakePanelProps) {
  const [locking, setLocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLock = async () => {
    if (!onLock) return;
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

  if (!stake) return null;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold uppercase text-donkey-muted">{label}</span>
        <span className={`text-xs font-bold uppercase ${
          stake.status === 'locked' ? 'text-donkey-green' :
          stake.status === 'forfeited' ? 'text-donkey-red' :
          'text-donkey-orange'
        }`}>
          {stake.status}
        </span>
      </div>

      <DualPrice sats={stake.amountSats} size="md" />

      {stake.status === 'pending' && onLock && (
        <button
          className="btn-primary w-full mt-3 text-sm"
          onClick={handleLock}
          disabled={locking}
        >
          {locking ? 'Locking...' : 'Lock Stake'}
        </button>
      )}

      {stake.invoice && stake.status === 'pending' && (
        <div className="mt-2 p-2 bg-donkey-bg rounded text-xs font-mono break-all text-donkey-muted">
          {stake.invoice}
        </div>
      )}

      {error && <p className="text-donkey-red text-xs mt-2">{error}</p>}
    </div>
  );
}
