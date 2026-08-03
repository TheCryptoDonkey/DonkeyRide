import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DualPrice } from '../../components/common/DualPrice';
import { Receipt } from '../../components/task/Receipt';
import { useDomain } from '../../context/DomainContext';
import { useTask } from '../../context/TaskContext';
import { useT } from '../../i18n';
import {
  getTripHistory, clearTripHistory, type TripRecord,
} from '../../services/trip-history';

/**
 * Your past trips — stored on this device only. The operator keeps no
 * durable record of who went where; this page is the rider's own copy.
 *
 * Each row opens a real receipt (what made up the fare, waiting time, tip,
 * who drove) and offers the same journey again in one tap — the thing
 * people actually want from a history screen.
 */
export function HistoryPage() {
  const navigate = useNavigate();
  const { profile } = useDomain();
  const { setOrigin, setDestination } = useTask();
  const { t, td } = useT();
  const [trips, setTrips] = useState(getTripHistory());
  const [confirmClear, setConfirmClear] = useState(false);
  const [open, setOpen] = useState<TripRecord | null>(null);

  const taskNoun = td(profile?.labels?.taskNoun || 'trip');

  const formatDate = (ms: number) =>
    new Date(ms).toLocaleDateString(undefined, {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  /** Same journey again: seed the task context and go straight to confirm */
  const rebook = (trip: TripRecord) => {
    if (!trip.fromLoc || !trip.toLoc) return;
    setOrigin(trip.fromLoc);
    setDestination(trip.toLoc);
    setOpen(null);
    navigate('/request/new');
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4 max-w-md mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black text-donkey-text">
          {t('history.title', { noun: taskNoun })}
        </h1>
        <button className="btn-secondary text-xs px-3" onClick={() => navigate('/request')}>
          {t('common.back')}
        </button>
      </div>

      <p className="text-xs text-donkey-muted">
        {t('history.deviceOnly', { noun: taskNoun })}
      </p>

      {trips.length === 0 ? (
        <div className="card text-center">
          <p className="text-donkey-muted">{t('history.empty', { noun: taskNoun })}</p>
        </div>
      ) : (
        trips.map((trip) => (
          <div key={trip.id} className="meta-card">
            <button
              className="w-full text-left"
              onClick={() => setOpen(trip)}
              aria-label={t('history.viewReceipt')}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-donkey-muted">{formatDate(trip.completedAt)}</p>
                <DualPrice sats={trip.fareSats} size="sm" compact />
              </div>
              {(trip.from || trip.to) && (
                <p className="text-sm text-donkey-text mt-1">
                  {trip.from || '—'} <span className="text-donkey-muted">→</span> {trip.to || '—'}
                </p>
              )}
              <p className="text-xs text-donkey-muted mt-1">
                {trip.status === 'completed' ? t('history.completed') : trip.status}
                {trip.rail && ` · ${t('receipt.paidBy', {
                  rail: trip.rail === 'lnaddress' ? 'Lightning' : trip.rail,
                })}`}
              </p>
            </button>

            {/* The thing people actually come to this screen for */}
            {trip.fromLoc && trip.toLoc && (
              <button
                className="text-donkey-blue text-xs font-semibold mt-2 min-h-[44px]"
                onClick={() => rebook(trip)}
              >
                {t('history.again')}
              </button>
            )}
          </div>
        ))
      )}

      {trips.length > 0 && (
        confirmClear ? (
          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={() => setConfirmClear(false)}>
              {t('active.keep')}
            </button>
            <button
              className="btn-danger flex-1"
              onClick={() => {
                clearTripHistory();
                setTrips([]);
                setConfirmClear(false);
              }}
            >
              {t('history.clear')}
            </button>
          </div>
        ) : (
          <button
            className="text-donkey-muted text-xs w-full text-center min-h-[44px]"
            onClick={() => setConfirmClear(true)}
          >
            {t('history.clearPrompt')}
          </button>
        )
      )}

      {open && (
        <Receipt trip={open} onClose={() => setOpen(null)} onRebook={rebook} />
      )}
    </div>
  );
}
