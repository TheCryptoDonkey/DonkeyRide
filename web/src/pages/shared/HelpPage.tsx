import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChatPanel } from '../../components/task/ChatPanel';
import { DisputePanel } from '../../components/task/DisputePanel';
import { PersonName } from '../../components/common/PersonCard';
import { useIdentity } from '../../context/IdentityContext';
import { useDomain } from '../../context/DomainContext';
import { getOperatorInfoCached } from '../../services/api';
import { getTripHistory, type TripRecord } from '../../services/trip-history';
import { useT } from '../../i18n';
import type { OperatorInfo } from '../../types/api';

/**
 * Help — the screen this app sent people to and never had.
 *
 * The no-show screen told riders to "contact the operator with the
 * reference below" while offering no way to contact anybody, and a phone
 * left on the back seat had no path at all once the trip screen was gone.
 *
 * Nothing here is a support desk in the usual sense: there is no ticket
 * queue, because the operator holds no record of your journeys to look up.
 * What it does have is the two things that actually resolve a problem —
 * reaching the person who was there (end-to-end encrypted, straight to
 * them), and putting a signed claim on the record.
 */
export function HelpPage({ role }: { role: 'requester' | 'provider' }) {
  const navigate = useNavigate();
  const { t, td } = useT();
  const { identity } = useIdentity();
  const { profile } = useDomain();
  const [operator, setOperator] = useState<OperatorInfo | null>(null);
  const [trip, setTrip] = useState<TripRecord | null>(null);
  const [contacting, setContacting] = useState(false);

  useEffect(() => {
    getOperatorInfoCached().then(setOperator).catch(() => {});
    setTrip(getTripHistory()[0] || null);
  }, []);

  const taskNoun = td(profile?.labels?.taskNoun || 'trip');
  const providerLabel = td(profile?.roles.provider || 'driver');

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4 max-w-md mx-auto w-full">
      <h1 className="text-xl font-black text-donkey-text">{t('help.title')}</h1>
      <p className="text-sm text-donkey-muted">{t('help.intro')}</p>

      {/* Left something behind — the commonest problem there is, and the
          one an operator with no durable record genuinely cannot solve
          for you. You can still reach the person who has it. */}
      {role === 'requester' && trip && (
        <div className="card space-y-2">
          <p className="font-bold text-donkey-text">{t('help.lostTitle')}</p>
          <p className="text-sm text-donkey-muted">
            {t('help.lostBody', { label: providerLabel.toLowerCase() })}
          </p>
          <p className="text-xs text-donkey-muted">
            {new Date(trip.completedAt).toLocaleString()}
            {trip.to ? ` · ${trip.to}` : ''}
            {trip.providerNpub && (
              <>
                {' · '}
                <PersonName subject={trip.providerNpub} className="text-donkey-text" />
              </>
            )}
          </p>
          {trip.providerPubkey && identity ? (
            contacting ? (
              <ChatPanel
                taskId={trip.id}
                selfPubkey={identity.pubKeyHex}
                counterpartyPubkey={trip.providerPubkey}
                counterpartyLabel={providerLabel}
                role="requester"
              />
            ) : (
              <button className="btn-secondary w-full text-sm" onClick={() => setContacting(true)}>
                {t('help.messageProvider', { label: providerLabel.toLowerCase() })}
              </button>
            )
          ) : (
            <p className="text-xs text-donkey-muted">{t('help.noContact')}</p>
          )}
        </div>
      )}

      {/* Raise it formally — the dispute rail that existed with no door */}
      {trip && (
        <div className="card space-y-2">
          <p className="font-bold text-donkey-text">{t('help.problemTitle', { noun: taskNoun })}</p>
          <p className="text-sm text-donkey-muted">{t('help.problemBody')}</p>
          <DisputePanel
            task={{
              id: trip.id,
              requesterPubkey: role === 'requester' ? (identity?.pubKeyHex || '') : '',
              providerPubkey: role === 'requester' ? trip.providerPubkey : identity?.pubKeyHex,
            }}
            role={role}
          />
        </div>
      )}

      {/* Safety is not a support ticket */}
      <div className="card space-y-2">
        <p className="font-bold text-donkey-text">{t('help.safetyTitle')}</p>
        <p className="text-sm text-donkey-muted">{t('help.safetyBody')}</p>
      </div>

      {/* Who you are actually dealing with, and what they can and cannot do */}
      <div className="card space-y-2">
        <p className="font-bold text-donkey-text">{t('help.operatorTitle')}</p>
        <p className="text-sm text-donkey-text">{operator?.name || '—'}</p>
        <p className="text-sm text-donkey-muted">
          {t('help.operatorBody', { label: providerLabel.toLowerCase() })}
        </p>
        {operator?.pubkey && (
          <p className="text-xs font-mono text-donkey-muted break-all">{operator.pubkey}</p>
        )}
      </div>

      <div className="flex gap-3">
        <a className="btn-secondary flex-1 text-center" href="/manual.html">
          {t('help.manual')}
        </a>
        <button
          className="btn-secondary flex-1"
          onClick={() => navigate(role === 'provider' ? '/provide' : '/request')}
        >
          {t('common.back')}
        </button>
      </div>
    </div>
  );
}
