import { useState } from 'react';
import {
  getTrustedContacts, addTrustedContact, removeTrustedContact,
  getSharedGuardians, shareTrip, isAutoShare, setAutoShare,
  type ShareRole,
} from '../../services/trip-share';
import { useT } from '../../i18n';
import type { Task } from '../../types/api';

interface TripSharePanelProps {
  task: Task;
  privKeyHex: string;
  taskNoun?: string;
  /** Whose note this is — a driver shares too, naming the passenger */
  role?: ShareRole;
}

/**
 * Share the trip with a trusted contact — an E2E encrypted note to their
 * Nostr DMs (flock's share → all-clear pattern). The all-clear and any
 * panic alert follow automatically to everyone the trip was shared with.
 */
export function TripSharePanel({ task, privKeyHex, taskNoun = 'ride', role = 'requester' }: TripSharePanelProps) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<string[]>(getTrustedContacts());
  const [shared, setShared] = useState<string[]>(getSharedGuardians(task.id));
  const [newNpub, setNewNpub] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoVersion, setAutoVersion] = useState(0); // re-render on toggle

  const handleAdd = async () => {
    setError(null);
    try {
      await addTrustedContact(newNpub);
      setContacts(getTrustedContacts());
      setNewNpub('');
    } catch {
      setError(t('share.badNpub'));
    }
  };

  const handleShare = async (npub: string) => {
    setBusy(npub);
    setError(null);
    try {
      await shareTrip(privKeyHex, npub, task, taskNoun, role);
      setShared(getSharedGuardians(task.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('share.sendFailed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="meta-card">
      <button
        className="w-full flex items-center justify-between text-left"
        onClick={() => {
          // Auto-share may have fired since mount — re-read on open
          setShared(getSharedGuardians(task.id));
          setOpen((o) => !o);
        }}
      >
        <span className="meta-label">
          {t('share.title', { noun: taskNoun })}
          {shared.length > 0 && (
            <span className="text-donkey-green">
              {' '}· {t('share.sharedWith', { n: shared.length })}
            </span>
          )}
        </span>
        <span className="text-donkey-muted text-xs" aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-donkey-muted">{t('share.explain')}</p>

          {contacts.map((npub) => {
            const isShared = shared.includes(npub);
            const auto = isAutoShare(npub);
            return (
              <div key={npub} className="flex items-center gap-2">
                <p className="flex-1 text-xs font-mono text-donkey-text truncate">
                  {npub.slice(0, 16)}…
                </p>
                <button
                  className={`text-xs font-semibold ${auto ? 'text-donkey-green' : 'text-donkey-muted'}`}
                  onClick={() => {
                    setAutoShare(npub, !auto);
                    setAutoVersion(autoVersion + 1);
                  }}
                  title={t('share.everyTripHint')}
                  aria-pressed={auto}
                >
                  {auto ? t('share.everyTripOn') : t('share.everyTrip')}
                </button>
                {isShared ? (
                  <span className="text-donkey-green text-xs font-semibold">{t('share.done')}</span>
                ) : (
                  <button
                    className="text-donkey-blue text-xs font-semibold disabled:opacity-50"
                    disabled={busy === npub}
                    onClick={() => handleShare(npub)}
                  >
                    {busy === npub ? t('share.sending') : t('share.share')}
                  </button>
                )}
                <button
                  className="text-donkey-muted text-xs"
                  onClick={() => {
                    removeTrustedContact(npub);
                    setContacts(getTrustedContacts());
                  }}
                  aria-label={t('share.remove')}
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </div>
            );
          })}

          <div className="flex gap-2">
            <input
              className="flex-1 bg-donkey-bg border border-donkey-border rounded-lg px-3 py-2 text-donkey-text text-xs font-mono"
              placeholder={t('share.addPlaceholder')}
              aria-label={t('share.addPlaceholder')}
              value={newNpub}
              onChange={(e) => setNewNpub(e.target.value)}
            />
            <button
              className="btn-secondary text-xs px-3"
              onClick={handleAdd}
              disabled={!newNpub.trim()}
            >
              {t('share.add')}
            </button>
          </div>

          {error && <p className="text-donkey-orange text-xs" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
