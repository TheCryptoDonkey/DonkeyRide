import { useState } from 'react';
import { useIdentity } from '../../context/IdentityContext';
import { encodeNsec, importIdentity } from '../../services/nostr';

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
  const [importValue, setImportValue] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
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

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 max-w-lg mx-auto w-full">
      <div>
        <h1 className="text-xl font-black tracking-tight">Your identity</h1>
        <p className="text-sm text-donkey-muted mt-1">
          Your Nostr key is your reputation. It belongs to you, not to any
          operator — back it up and it travels with you.
        </p>
      </div>

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
