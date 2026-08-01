import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DualPrice } from '../../components/common/DualPrice';
import { StarRating } from '../../components/rating/StarRating';
import { TipSelector } from '../../components/payment/TipSelector';
import { useTask } from '../../context/TaskContext';
import { useIdentity } from '../../context/IdentityContext';
import { useDomain } from '../../context/DomainContext';
import { submitRating, sendTip, getOperatorInfoCached } from '../../services/api';
import { GuaranteeBanner } from '../../components/task/GuaranteeBanner';
import { formatDistance, formatDuration } from '../../services/pricing';
import type { OperatorPaymentInfo } from '../../types/api';

export function CompletionPage() {
  const navigate = useNavigate();
  const { activeTask, completedTask, clearCompletedTask, reset } = useTask();
  const { identity } = useIdentity();
  const { profile } = useDomain();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [tipped, setTipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipError, setTipError] = useState<string | null>(null);
  const [payment, setPayment] = useState<OperatorPaymentInfo | null>(null);

  const taskNoun = profile?.labels?.taskNoun || 'task';
  const completedLabel = profile?.labels?.completedLabel || 'Complete';
  const providerLabel = profile?.roles.provider || 'provider';

  useEffect(() => {
    getOperatorInfoCached()
      .then((info) => setPayment(info.payment || null))
      .catch(() => {});
  }, []);

  // Survive a refresh: fall back to the stored terminal task until Done
  const task = activeTask ?? completedTask;

  const handleDone = () => {
    clearCompletedTask();
    reset();
    navigate('/request');
  };

  if (!task) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="card text-center max-w-md">
          <p className="text-donkey-muted mb-4">No completed {taskNoun} found</p>
          <button className="btn-primary" onClick={() => navigate('/request')}>
            Request a {taskNoun}
          </button>
        </div>
      </div>
    );
  }

  // A no-show is not a completion — show an honest screen, no celebration
  const noShowValue = profile?.states.values.NO_SHOW || 'no_show';
  if (task.status === noShowValue) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="card text-center max-w-md space-y-4">
          <p className="text-donkey-orange text-lg font-bold">
            {providerLabel.charAt(0).toUpperCase() + providerLabel.slice(1)} reported a no-show
          </p>
          <p className="text-sm text-donkey-muted">
            This {taskNoun} ended without being carried out. If that is wrong,
            contact the operator with the {taskNoun} reference below.
          </p>
          <p className="text-xs font-mono text-donkey-muted break-all">{task.id}</p>
          <button className="btn-primary w-full" onClick={handleDone}>
            Done
          </button>
        </div>
      </div>
    );
  }

  const handleSubmitRating = async () => {
    if (!identity || rating === 0) return;
    try {
      await submitRating(task.id, {
        rating,
        comment: comment || undefined,
        raterRole: 'requester',
        targetPubkey: task.providerPubkey,
        domainId: profile?.id || '',
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit rating');
    }
  };

  const handleTip = async (amountSats: number) => {
    if (!identity) return;
    setTipError(null);
    try {
      await sendTip(task.id, {
        amountSats,
        requesterPubkey: identity.pubKeyHex,
      });
      setTipped(true);
    } catch (err) {
      setTipError(err instanceof Error ? err.message : 'Failed to send tip');
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-md mx-auto space-y-6">
        {/* Summary */}
        <div className="card text-center">
          <p className="text-donkey-green text-lg font-bold mb-2">{completedLabel}</p>
          <DualPrice sats={task.fareEstimateSats} size="lg" />

          {task.distanceKm && task.durationMin && (
            <p className="text-donkey-muted text-sm mt-2">
              {formatDistance(task.distanceKm)} &middot; {formatDuration(task.durationMin)}
            </p>
          )}

          {/* Honest payment copy per rail */}
          {payment?.provider === 'cash' && (
            <p className="text-sm text-donkey-text mt-3">
              Pay your {providerLabel.toLowerCase()} directly. Agreed amount:{' '}
              <DualPrice sats={task.fareEstimateSats} size="sm" />
            </p>
          )}
          {payment?.provider === 'demo' && (
            <p className="text-sm text-donkey-muted mt-3">Demo mode: no real payment moves.</p>
          )}
        </div>

        {/* Guarantee period banner */}
        {profile?.features.guaranteePeriod && (
          <GuaranteeBanner
            providerLabel={providerLabel}
            taskNoun={taskNoun}
          />
        )}

        {/* Rating */}
        {!submitted ? (
          <div className="card">
            <p className="text-sm font-bold uppercase text-donkey-muted mb-3">
              Rate your {providerLabel}
            </p>
            <div className="flex justify-center mb-3">
              <StarRating value={rating} onChange={setRating} size="lg" />
            </div>
            <textarea
              className="input-field w-full text-sm"
              rows={2}
              placeholder={`Comment (optional)`}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <button
              className="btn-primary w-full mt-3"
              onClick={handleSubmitRating}
              disabled={rating === 0}
            >
              Submit Rating
            </button>
            {error && <p className="text-donkey-red text-xs mt-2">{error}</p>}
          </div>
        ) : (
          <div className="card text-center">
            <p className="text-donkey-green font-bold">Rating submitted</p>
            <div className="flex justify-center mt-2">
              <StarRating value={rating} readonly size="md" />
            </div>
          </div>
        )}

        {/* Tip */}
        {profile?.features.tipping && !tipped && (
          <TipSelector
            fareEstimateSats={task.fareEstimateSats}
            onTip={handleTip}
          />
        )}

        {tipError && (
          <div className="card text-center">
            <p className="text-donkey-red text-sm">{tipError}</p>
          </div>
        )}

        {tipped && (
          <div className="card text-center">
            <p className="text-donkey-green font-bold">Tip recorded. Thank you.</p>
            {payment?.provider === 'cash' && (
              <p className="text-xs text-donkey-muted mt-1">
                On cash payment the tip is settled together with the fare.
              </p>
            )}
          </div>
        )}

        {/* Done */}
        <button className="btn-secondary w-full" onClick={handleDone}>
          Done
        </button>
      </div>
    </div>
  );
}
