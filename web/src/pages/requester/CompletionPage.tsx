import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DualPrice } from '../../components/common/DualPrice';
import { StarRating } from '../../components/rating/StarRating';
import { TipSelector } from '../../components/payment/TipSelector';
import { PayDriver } from '../../components/payment/PayDriver';
import { useTask } from '../../context/TaskContext';
import { useIdentity } from '../../context/IdentityContext';
import { useDomain } from '../../context/DomainContext';
import { submitRating, sendTip, getOperatorInfoCached, getTask } from '../../services/api';
import { GuaranteeBanner } from '../../components/task/GuaranteeBanner';
import { formatDistance, formatDuration } from '../../services/pricing';
import { recordTrip } from '../../services/trip-history';
import { isFavourite, toggleFavourite } from '../../utils/favourites';
import { useT } from '../../i18n';
import type { OperatorPaymentInfo, SettlementInfo } from '../../types/api';

export function CompletionPage() {
  const navigate = useNavigate();
  const { activeTask, completedTask, clearCompletedTask, reset, estimate } = useTask();
  const { identity } = useIdentity();
  const { profile } = useDomain();
  const { t, td } = useT();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [tipped, setTipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipError, setTipError] = useState<string | null>(null);
  const [payment, setPayment] = useState<OperatorPaymentInfo | null>(null);
  const [liveSettlement, setLiveSettlement] = useState<SettlementInfo | null>(null);
  // "That one again" — device-local, gives them a head start next time
  const [favourite, setFavourite] = useState(false);

  const taskNoun = td(profile?.labels?.taskNoun || 'task');
  const completedLabel = td(profile?.labels?.completedLabel || 'Complete');
  const providerLabel = td(profile?.roles.provider || 'provider');

  useEffect(() => {
    getOperatorInfoCached()
      .then((info) => setPayment(info.payment || null))
      .catch(() => {});
  }, []);

  // Survive a refresh: fall back to the stored terminal task until Done
  const task = activeTask ?? completedTask;
  const settlement = liveSettlement ?? task?.settlement ?? null;
  const settlementConfirmed = settlement?.status === 'confirmed' || settlement?.confirmedByProvider === true;

  // Poll for the driver's receipt confirmation while payment is unconfirmed.
  useEffect(() => {
    if (!task || settlementConfirmed) return;
    const timer = setInterval(async () => {
      try {
        const fresh = await getTask(task.id);
        if (fresh.settlement) setLiveSettlement(fresh.settlement);
      } catch {
        // Ignore — next tick retries
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [task?.id, settlementConfirmed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reflect what is already saved when the page opens
  useEffect(() => {
    if (task?.providerPubkey) setFavourite(isFavourite(task.providerPubkey));
  }, [task?.providerPubkey]);

  // Your copy of the trip — device-local history (the operator keeps none).
  // Re-records when settlement confirms so the paid-by rail lands too.
  useEffect(() => {
    if (task) {
      // The breakdown and any demand multiplier come from the estimate the
      // rider approved, so the receipt can explain the fare rather than
      // just restate it
      recordTrip({ ...task, settlement: settlement ?? undefined }, {
        breakdown: estimate?.fareBreakdown,
        surgeMultiplier: estimate?.surge?.multiplier,
      });
    }
  }, [task?.id, settlement?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDone = () => {
    clearCompletedTask();
    reset();
    navigate('/request');
  };

  if (!task) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="card text-center max-w-md">
          <p className="text-donkey-muted mb-4">{t('complete.none', { noun: taskNoun })}</p>
          <button className="btn-primary" onClick={() => navigate('/request')}>
            {t('complete.requestAnother', { noun: taskNoun })}
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
            {t('complete.done')}
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
      setError(err instanceof Error ? err.message : t('complete.rateFailed'));
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
      setTipError(err instanceof Error ? err.message : t('tip.failed'));
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

        {/* Pay the driver directly (non-custodial) */}
        <PayDriver task={task} settlement={settlement} />

        {/* Keep this provider — a head start on the rider's next request */}
        {task.providerPubkey && (
          <button
            className={`card w-full text-left flex items-center gap-3 min-h-[44px] ${
              favourite ? 'border border-donkey-orange/50' : ''
            }`}
            onClick={() => setFavourite(toggleFavourite({
              pubkey: task.providerPubkey!,
              npub: task.providerNpub,
            }))}
          >
            <span className="text-xl">{favourite ? '⭐' : '☆'}</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-donkey-text">
                {favourite
                  ? `Saved — this ${providerLabel.toLowerCase()} gets your next ${taskNoun} first`
                  : `Save this ${providerLabel.toLowerCase()}`}
              </span>
              <span className="block text-xs text-donkey-muted">
                Stays on this device. Saved {providerLabel.toLowerCase()}s get a
                short head start before a request opens to everyone.
              </span>
            </span>
          </button>
        )}

        {/* Rating */}
        {!submitted ? (
          <div className="card">
            <p className="text-sm font-bold uppercase text-donkey-muted mb-3">
              {t('complete.rate', { label: providerLabel })}
            </p>
            <div className="flex justify-center mb-3">
              <StarRating value={rating} onChange={setRating} size="lg" />
            </div>
            <textarea
              className="input-field w-full text-sm"
              rows={2}
              placeholder={t('complete.comment')}
              aria-label={t('complete.comment')}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <button
              className="btn-primary w-full mt-3"
              onClick={handleSubmitRating}
              disabled={rating === 0}
            >
              {t('complete.submitRating')}
            </button>
            {error && <p className="text-donkey-red text-xs mt-2">{error}</p>}
          </div>
        ) : (
          <div className="card text-center">
            <p className="text-donkey-green font-bold">{t('complete.rated')}</p>
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
            <p className="text-donkey-green font-bold">{t('tip.recorded')}</p>
            {payment?.provider === 'cash' && (
              <p className="text-xs text-donkey-muted mt-1">
                On cash payment the tip is settled together with the fare.
              </p>
            )}
          </div>
        )}

        {/* Done */}
        <button className="btn-secondary w-full" onClick={handleDone}>
          {t('complete.done')}
        </button>
      </div>
    </div>
  );
}
