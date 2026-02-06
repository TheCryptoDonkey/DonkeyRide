import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DualPrice } from '../../components/common/DualPrice';
import { StarRating } from '../../components/rating/StarRating';
import { TipSelector } from '../../components/payment/TipSelector';
import { useTask } from '../../context/TaskContext';
import { useIdentity } from '../../context/IdentityContext';
import { useDomain } from '../../context/DomainContext';
import { submitRating, sendTip } from '../../services/api';
import { formatDistance, formatDuration } from '../../services/pricing';

export function CompletionPage() {
  const navigate = useNavigate();
  const { activeTask, reset } = useTask();
  const { identity } = useIdentity();
  const { profile } = useDomain();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [tipped, setTipped] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!activeTask) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="card text-center max-w-md">
          <p className="text-donkey-muted mb-4">No completed ride found</p>
          <button className="btn-primary" onClick={() => navigate('/ride')}>
            Request a ride
          </button>
        </div>
      </div>
    );
  }

  const handleSubmitRating = async () => {
    if (!identity || rating === 0) return;
    try {
      await submitRating(activeTask.id, {
        rating,
        comment: comment || undefined,
        raterPubkey: identity.pubKeyHex,
        raterRole: 'rider',
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit rating');
    }
  };

  const handleTip = async (amountSats: number) => {
    if (!identity) return;
    await sendTip(activeTask.id, {
      amountSats,
      riderPubkey: identity.pubKeyHex,
    });
    setTipped(true);
  };

  const handleDone = () => {
    reset();
    navigate('/ride');
  };

  const providerLabel = profile?.roles.provider || 'driver';

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-md mx-auto space-y-6">
        {/* Summary */}
        <div className="card text-center">
          <p className="text-donkey-green text-lg font-bold mb-2">Ride Complete</p>
          <DualPrice sats={activeTask.fareEstimateSats} size="lg" />

          {activeTask.distanceKm && activeTask.durationMin && (
            <p className="text-donkey-muted text-sm mt-2">
              {formatDistance(activeTask.distanceKm)} &middot; {formatDuration(activeTask.durationMin)}
            </p>
          )}
        </div>

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
            fareEstimateSats={activeTask.fareEstimateSats}
            onTip={handleTip}
          />
        )}

        {tipped && (
          <div className="card text-center">
            <p className="text-donkey-green font-bold">Tip sent! Thank you.</p>
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
