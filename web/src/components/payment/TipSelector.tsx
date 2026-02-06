import { useState } from 'react';
import { DualPrice } from '../common/DualPrice';

interface TipSelectorProps {
  fareEstimateSats: number;
  onTip: (amountSats: number) => Promise<void>;
}

const PRESETS = [0.10, 0.15, 0.20]; // percentage of fare

export function TipSelector({ fareEstimateSats, onTip }: TipSelectorProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [sending, setSending] = useState(false);

  const presetAmounts = PRESETS.map(pct => Math.round(fareEstimateSats * pct));

  const tipAmount = selected !== null
    ? presetAmounts[selected]
    : custom ? parseInt(custom, 10) || 0 : 0;

  const handleSend = async () => {
    if (tipAmount <= 0) return;
    setSending(true);
    try {
      await onTip(tipAmount);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card">
      <p className="text-sm font-bold uppercase text-donkey-muted mb-3">Tip</p>

      <div className="flex gap-2 mb-3">
        {PRESETS.map((pct, i) => (
          <button
            key={pct}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
              selected === i
                ? 'bg-donkey-purple text-white'
                : 'bg-donkey-bg border border-donkey-border text-donkey-text hover:border-donkey-purple'
            }`}
            onClick={() => { setSelected(i); setCustom(''); }}
          >
            {Math.round(pct * 100)}%
          </button>
        ))}
        <input
          type="number"
          placeholder="Custom"
          className="input-field flex-1 text-sm py-2"
          value={custom}
          onChange={(e) => { setCustom(e.target.value); setSelected(null); }}
        />
      </div>

      {tipAmount > 0 && (
        <div className="flex items-center justify-between">
          <DualPrice sats={tipAmount} size="sm" />
          <button
            className="btn-primary text-sm py-2 px-4"
            onClick={handleSend}
            disabled={sending}
          >
            {sending ? 'Sending...' : 'Send Tip'}
          </button>
        </div>
      )}
    </div>
  );
}
