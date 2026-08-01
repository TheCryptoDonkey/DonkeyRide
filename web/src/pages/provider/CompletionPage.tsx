import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DualPrice } from '../../components/common/DualPrice';
import { StarRating } from '../../components/rating/StarRating';
import { useTask } from '../../context/TaskContext';
import { useIdentity } from '../../context/IdentityContext';
import { useDomain } from '../../context/DomainContext';
import { submitRating } from '../../services/api';
import { formatDistance, formatDuration } from '../../services/pricing';

export function CompletionPage() {
  const navigate = useNavigate();
  const { activeTask, completedTask, clearCompletedTask, reset } = useTask();
  const { identity } = useIdentity();
  const { profile } = useDomain();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const taskNoun = profile?.labels?.taskNoun || 'task';
  const completedLabel = profile?.labels?.completedLabel || 'Complete';
  const requesterLabel = profile?.roles.requester || 'requester';

  // Survive a refresh: fall back to the stored terminal task until Done
  const task = activeTask ?? completedTask;

  if (!task) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="card text-center max-w-md">
          <p className="text-donkey-muted mb-4">No completed {taskNoun} found</p>
          <button className="btn-primary" onClick={() => navigate('/provide')}>
            Back to Dashboard
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
        raterRole: 'provider',
        targetPubkey: task.requesterPubkey,
        domainId: profile?.id || '',
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit rating');
    }
  };

  const handleDone = () => {
    clearCompletedTask();
    reset();
    navigate('/provide');
  };

  // Settlement amount is the honest figure when present; fall back to fare
  const earned = task.settlement?.amountSats ?? task.fareEstimateSats;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-md mx-auto space-y-6">
        {/* Summary */}
        <div className="earnings-card text-center">
          <p className="text-donkey-green text-lg font-bold mb-2">{completedLabel}</p>
          <p className="meta-label mb-1">Earned</p>
          <DualPrice sats={earned} size="lg" />

          {(task.distanceKm || task.durationMin) && (
            <p className="text-donkey-muted text-sm mt-2">
              {task.distanceKm ? formatDistance(task.distanceKm) : ''}
              {task.distanceKm && task.durationMin ? ' · ' : ''}
              {task.durationMin ? formatDuration(task.durationMin) : ''}
            </p>
          )}
        </div>

        {/* Rating */}
        {!submitted ? (
          <div className="card">
            <p className="section-title">
              Rate your {requesterLabel}
            </p>
            <div className="flex justify-center mb-3">
              <StarRating value={rating} onChange={setRating} size="lg" />
            </div>
            <textarea
              className="input-field w-full text-sm"
              rows={2}
              placeholder="Comment (optional)"
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

        {/* Done */}
        <button className="btn-secondary w-full" onClick={handleDone}>
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
