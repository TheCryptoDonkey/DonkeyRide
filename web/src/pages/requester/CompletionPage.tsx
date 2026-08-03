import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DualPrice } from '../../components/common/DualPrice';
import { StarRating } from '../../components/rating/StarRating';
import { FeedbackTags } from '../../components/rating/FeedbackTags';
import { TipSelector } from '../../components/payment/TipSelector';
import { PayDriver } from '../../components/payment/PayDriver';
import { DisputePanel } from '../../components/task/DisputePanel';
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

/**
 * The end of a job.
 *
 * Ordered by what the rider owes rather than what the app wants: paying
 * comes first because somebody is waiting for it, then the rating (with
 * the reason, not just the star), then the tip attached to it, and only
 * then the receipt-ish summary and the housekeeping. It used to open with
 * a fare summary and bury the star rating below a favourite toggle.
 */
export function CompletionPage() {
  const navigate = useNavigate();
  const { activeTask, completedTask, clearCompletedTask, reset, estimate } = useTask();
  const { identity } = useIdentity();
  const { profile } = useDomain();
  const { t, td } = useT();
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState<string[]>([]);
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

  // A no-show is not a completion — show an honest screen, no celebration,
  // and a way to actually do something about it
  const noShowValue = profile?.states.values.NO_SHOW || 'no_show';
  if (task.status === noShowValue) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <div className="card text-center max-w-md mx-auto space-y-4">
          <p className="text-donkey-orange text-lg font-bold">
            {t('complete.noShowTitle', { label: providerLabel })}
          </p>
          <p className="text-sm text-donkey-muted">
            {t('complete.noShowBody', { noun: taskNoun })}
          </p>
          <p className="text-xs font-mono text-donkey-muted break-all">{task.id}</p>
          {/* The screen used to end here, telling people to contact an
              operator it gave them no way to contact */}
          <DisputePanel task={task} role="requester" />
          <button className="btn-secondary w-full" onClick={() => navigate('/request/help')}>
            {t('complete.getHelp')}
          </button>
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
        feedback,
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
        {/* Pay first: somebody is sitting there waiting to be paid */}
        <PayDriver task={task} settlement={settlement} />

        {/* Rating, with the reason attached. A star alone tells an
            aggregator nothing it can act on. */}
        {!submitted ? (
          <div className="card">
            <p className="text-sm font-bold uppercase text-donkey-muted mb-3">
              {t('complete.rate', { label: providerLabel })}
            </p>
            <div className="flex justify-center mb-3">
              <StarRating value={rating} onChange={setRating} size="lg" />
            </div>
            <FeedbackTags
              rating={rating}
              role="requester"
              value={feedback}
              onChange={setFeedback}
            />
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

        {/* Tip — attached to the rating, where the goodwill is */}
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
              <p className="text-xs text-donkey-muted mt-1">{t('complete.tipWithFare')}</p>
            )}
          </div>
        )}

        {/* What it was */}
        <div className="card text-center">
          <p className="text-donkey-green text-lg font-bold mb-2">{completedLabel}</p>
          <DualPrice sats={task.fareEstimateSats} size="lg" />

          {task.distanceKm && task.durationMin && (
            <p className="text-donkey-muted text-sm mt-2">
              {formatDistance(task.distanceKm)} &middot; {formatDuration(task.durationMin)}
            </p>
          )}

          {payment?.provider === 'cash' && (
            <p className="text-sm text-donkey-text mt-3">
              {t('complete.payDirect', { label: providerLabel.toLowerCase() })}{' '}
              <DualPrice sats={task.fareEstimateSats} size="sm" />
            </p>
          )}
          {payment?.provider === 'demo' && (
            <p className="text-sm text-donkey-muted mt-3">{t('complete.demoPayment')}</p>
          )}
        </div>

        {/* Guarantee period banner */}
        {profile?.features.guaranteePeriod && (
          <GuaranteeBanner
            providerLabel={providerLabel}
            taskNoun={taskNoun}
          />
        )}

        {/* Keep this provider — a head start on the rider's next request */}
        {task.providerPubkey && (
          <button
            className={`card w-full text-left flex items-center gap-3 min-h-[44px] ${
              favourite ? 'border border-donkey-orange/50' : ''
            }`}
            aria-pressed={favourite}
            onClick={() => setFavourite(toggleFavourite({
              pubkey: task.providerPubkey!,
              npub: task.providerNpub,
            }))}
          >
            <span className="text-xl" aria-hidden="true">{favourite ? '⭐' : '☆'}</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-donkey-text">
                {favourite
                  ? t('complete.favouriteSaved', {
                      label: providerLabel.toLowerCase(), noun: taskNoun,
                    })
                  : t('complete.favouriteSave', { label: providerLabel.toLowerCase() })}
              </span>
              <span className="block text-xs text-donkey-muted">
                {t('complete.favouriteNote', { label: providerLabel.toLowerCase() })}
              </span>
            </span>
          </button>
        )}

        {/* Something went wrong — the dispute rail, reachable at last */}
        <DisputePanel task={task} role="requester" />

        {/* Done */}
        <button className="btn-secondary w-full" onClick={handleDone}>
          {t('complete.done')}
        </button>
      </div>
    </div>
  );
}
