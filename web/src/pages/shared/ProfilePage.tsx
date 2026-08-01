import { useState } from 'react';
import { useIdentity } from '../../context/IdentityContext';
import {
  encodeNsec, importIdentity,
  getIdentityRecoveryNotice, clearIdentityRecoveryNotice,
} from '../../services/nostr';

interface ProfilePageProps {
  role: 'requester' | 'provider';
}

/**
 * Identity backup and restore. The Nostr key IS the user's portable
 * reputation — losing it (cleared browser storage, new phone) must never
 * mean starting from zero, so backup and import are first-class.
 */
export function ProfilePage({ role }: ProfilePageProps) {
  const { identity } = useIdentity();
  const [nsec, setNsec] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [manualCopy, setManualCopy] = useState<{ label: string; value: string } | null>(null);
  const [importValue, setImportValue] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(getIdentityRecoveryNotice());

  const copy = async (label: string, value: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(value);
      setManualCopy(null);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // No clipboard access (older WebViews, http origins) — manual copy
      setManualCopy({ label, value });
    }
  };

  const revealNsec = async () => {
    if (!identity) return;
    setNsec(await encodeNsec(identity.privKeyHex));
  };

  const handleImport = async () => {
    setImportError(null);
    try {
      await importIdentity(role, importValue);
      window.location.reload();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    }
  };

  const dismissRecovery = () => {
    clearIdentityRecoveryNotice();
    setRecoveryNotice(null);
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 max-w-lg mx-auto w-full">
      <div>
        <h1 className="text-xl font-black tracking-tight">Your identity</h1>
        <p className="text-sm text-donkey-muted mt-1">
          Your Nostr key is your reputation. It belongs to you, not to any
          operator. Back it up and it travels with you.
        </p>
      </div>

      {/* Identity recovery notice — stored key was unreadable and replaced */}
      {recoveryNotice && (
        <div className="bg-donkey-orange/20 border border-donkey-orange rounded-lg p-4 space-y-2">
          <p className="text-donkey-orange text-sm font-semibold">
            Stored identity could not be read; a new one was created.
            Restore from backup below if you have one.
          </p>
          <p className="text-xs text-donkey-muted">
            The unreadable value was preserved in this browser's storage for
            manual recovery.
          </p>
          <button className="btn-secondary w-full" onClick={dismissRecovery}>
            Dismiss
          </button>
        </div>
      )}

      {/* Manual copy fallback when the clipboard is unavailable */}
      {manualCopy && (
        <div className="card space-y-2">
          <p className="text-xs uppercase tracking-wider text-donkey-muted">
            Copy {manualCopy.label} manually
          </p>
          <p className="text-sm text-donkey-muted">
            Clipboard access is unavailable. Select the text below and copy it.
          </p>
          <textarea
            readOnly
            rows={3}
            className="w-full bg-donkey-bg border border-donkey-border rounded p-3 font-mono text-xs"
            value={manualCopy.value}
            onFocus={(e) => e.currentTarget.select()}
            autoFocus
          />
          <button className="btn-secondary w-full" onClick={() => setManualCopy(null)}>
            Close
          </button>
        </div>
      )}

      {/* Public identity */}
      <div className="card space-y-2">
        <p className="text-xs uppercase tracking-wider text-donkey-muted">Public key (npub)</p>
        <p className="font-mono text-xs break-all">{identity?.npub || '…'}</p>
        <button
          className="btn-secondary w-full"
          onClick={() => identity && copy('npub', identity.npub)}
        >
          {copied === 'npub' ? 'Copied ✓' : 'Copy npub'}
        </button>
      </div>

      {/* Backup */}
      <div className="card space-y-3">
        <p className="text-xs uppercase tracking-wider text-donkey-muted">Backup secret key</p>
        <p className="text-sm text-donkey-muted">
          Anyone with this key can act as you. Store it somewhere safe
          (password manager). Never share it with support, operators, or
          anyone who asks.
        </p>
        {nsec ? (
          <>
            <p className="font-mono text-xs break-all bg-donkey-bg rounded p-3 border border-donkey-border">{nsec}</p>
            <button className="btn-primary w-full" onClick={() => copy('nsec', nsec)}>
              {copied === 'nsec' ? 'Copied ✓' : 'Copy secret key'}
            </button>
          </>
        ) : (
          <button className="btn-secondary w-full" onClick={revealNsec}>
            Reveal secret key
          </button>
        )}
      </div>

      {/* Restore */}
      <div className="card space-y-3">
        <p className="text-xs uppercase tracking-wider text-donkey-muted">Restore from backup</p>
        <p className="text-sm text-donkey-muted">
          Paste an nsec to replace the identity on this device (for example
          after moving from another phone).
        </p>
        <textarea
          className="w-full bg-donkey-bg border border-donkey-border rounded p-3 font-mono text-xs"
          rows={2}
          placeholder="nsec1…"
          value={importValue}
          onChange={(e) => setImportValue(e.target.value)}
        />
        {importError && <p className="text-donkey-red text-sm">{importError}</p>}
        <button
          className="btn-danger w-full"
          onClick={handleImport}
          disabled={!importValue.trim()}
        >
          Replace identity on this device
        </button>
      </div>
    </div>
  );
}
