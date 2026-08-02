import { useState } from 'react';
import {
  getTrustedContacts, addTrustedContact, removeTrustedContact,
  getSharedGuardians, shareTrip,
} from '../../services/trip-share';
import type { Task } from '../../types/api';

interface TripSharePanelProps {
  task: Task;
  privKeyHex: string;
  taskNoun?: string;
}

/**
 * Share the trip with a trusted contact — an E2E encrypted note to their
 * Nostr DMs (flock's share → all-clear pattern). The all-clear and any
 * panic alert follow automatically to everyone the trip was shared with.
 */
export function TripSharePanel({ task, privKeyHex, taskNoun = 'ride' }: TripSharePanelProps) {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<string[]>(getTrustedContacts());
  const [shared, setShared] = useState<string[]>(getSharedGuardians(task.id));
  const [newNpub, setNewNpub] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    setError(null);
    try {
      await addTrustedContact(newNpub);
      setContacts(getTrustedContacts());
      setNewNpub('');
    } catch {
      setError('That does not look like an npub (starts npub1…)');
    }
  };

  const handleShare = async (npub: string) => {
    setBusy(npub);
    setError(null);
    try {
      await shareTrip(privKeyHex, npub, task, taskNoun);
      setShared(getSharedGuardians(task.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send — try again');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="meta-card">
      <button
        className="w-full flex items-center justify-between text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="meta-label">
          Share this {taskNoun}
          {shared.length > 0 && (
            <span className="text-donkey-green"> · shared with {shared.length}</span>
          )}
        </span>
        <span className="text-donkey-muted text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-donkey-muted">
            Sends an encrypted note straight to their Nostr messages — no
            account here needed, any NIP-17 DM app works. They'll get an
            all-clear when you arrive.
          </p>

          {contacts.map((npub) => {
            const isShared = shared.includes(npub);
            return (
              <div key={npub} className="flex items-center gap-2">
                <p className="flex-1 text-xs font-mono text-donkey-text truncate">
                  {npub.slice(0, 16)}…
                </p>
                {isShared ? (
                  <span className="text-donkey-green text-xs font-semibold">Shared ✓</span>
                ) : (
                  <button
                    className="text-donkey-blue text-xs font-semibold disabled:opacity-50"
                    disabled={busy === npub}
                    onClick={() => handleShare(npub)}
                  >
                    {busy === npub ? 'Sending…' : 'Share'}
                  </button>
                )}
                <button
                  className="text-donkey-muted text-xs"
                  onClick={() => {
                    removeTrustedContact(npub);
                    setContacts(getTrustedContacts());
                  }}
                  aria-label="Remove contact"
                >
                  ✕
                </button>
              </div>
            );
          })}

          <div className="flex gap-2">
            <input
              className="flex-1 bg-donkey-bg border border-donkey-border rounded-lg px-3 py-2 text-donkey-text text-xs font-mono"
              placeholder="npub1… of someone you trust"
              value={newNpub}
              onChange={(e) => setNewNpub(e.target.value)}
            />
            <button
              className="btn-secondary text-xs px-3"
              onClick={handleAdd}
              disabled={!newNpub.trim()}
            >
              Add
            </button>
          </div>

          {error && <p className="text-donkey-orange text-xs">{error}</p>}
        </div>
      )}
    </div>
  );
}
