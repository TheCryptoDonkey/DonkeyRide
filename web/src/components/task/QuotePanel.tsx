import { useState } from 'react';
import { DualPrice } from '../common/DualPrice';
import type { TaskQuote } from '../../types/api';

interface QuotePanelProviderProps {
  mode: 'provider';
  taskId: string;
  onSubmit: (amountSats: number, description: string) => Promise<void>;
  existingQuote?: TaskQuote;
}

interface QuotePanelRequesterProps {
  mode: 'requester';
  taskId: string;
  quote: TaskQuote;
  onAccept: () => Promise<void>;
  onDecline: () => Promise<void>;
}

type QuotePanelProps = QuotePanelProviderProps | QuotePanelRequesterProps;

/**
 * Quote negotiation panel — two modes:
 * - Provider: form to submit amount + description after assessment
 * - Requester: review quote, accept or decline
 */
export function QuotePanel(props: QuotePanelProps) {
  if (props.mode === 'provider') return <ProviderQuoteForm {...props} />;
  return <RequesterQuoteReview {...props} />;
}

function ProviderQuoteForm({ onSubmit, existingQuote }: QuotePanelProviderProps) {
  const [amount, setAmount] = useState(existingQuote?.amountSats?.toString() || '');
  const [description, setDescription] = useState(existingQuote?.description || '');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const sats = parseInt(amount, 10);
    if (!sats || sats <= 0 || !description.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(sats, description.trim());
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit quote');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted || existingQuote?.status === 'pending') {
    return (
      <div className="card text-center">
        <p className="text-donkey-green font-bold text-sm">Quote submitted</p>
        <p className="text-donkey-muted text-xs mt-1">Waiting for customer response...</p>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="meta-label mb-2">Submit quote</p>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-donkey-muted block mb-1">Amount (sats)</label>
          <input
            type="number"
            className="input-field w-full"
            placeholder="e.g. 5000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="1"
          />
        </div>

        <div>
          <label className="text-xs text-donkey-muted block mb-1">Description of work</label>
          <textarea
            className="input-field w-full text-sm"
            rows={2}
            placeholder="Describe the work required..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <button
          className="btn-primary w-full"
          onClick={handleSubmit}
          disabled={submitting || !amount || !description.trim()}
        >
          {submitting ? 'Submitting...' : 'Submit Quote'}
        </button>
      </div>

      {error && <p className="text-donkey-red text-xs mt-2">{error}</p>}
    </div>
  );
}

function RequesterQuoteReview({ quote, onAccept, onDecline }: QuotePanelRequesterProps) {
  const [responding, setResponding] = useState(false);
  const [responded, setResponded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    setResponding(true);
    setError(null);
    try {
      await onAccept();
      setResponded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept quote');
    } finally {
      setResponding(false);
    }
  };

  const handleDecline = async () => {
    setResponding(true);
    setError(null);
    try {
      await onDecline();
      setResponded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decline quote');
    } finally {
      setResponding(false);
    }
  };

  if (responded) {
    return (
      <div className="card text-center">
        <p className="text-donkey-green font-bold text-sm">Response sent</p>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="meta-label mb-2">Quote received</p>

      <div className="text-center mb-3">
        <DualPrice sats={quote.amountSats} size="lg" />
      </div>

      {quote.description && (
        <p className="text-sm text-donkey-text bg-donkey-bg rounded-lg p-3 mb-3">
          {quote.description}
        </p>
      )}

      <div className="flex gap-3">
        <button
          className="btn-secondary flex-1"
          onClick={handleDecline}
          disabled={responding}
        >
          Decline
        </button>
        <button
          className="btn-primary flex-1"
          onClick={handleAccept}
          disabled={responding}
        >
          {responding ? 'Processing...' : 'Accept Quote'}
        </button>
      </div>

      {error && <p className="text-donkey-red text-xs mt-2">{error}</p>}
    </div>
  );
}
