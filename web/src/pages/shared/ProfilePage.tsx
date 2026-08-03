import { useState } from 'react';
import { useIdentity } from '../../context/IdentityContext';
import {
  encodeNsec, importIdentity,
  getIdentityRecoveryNotice, clearIdentityRecoveryNotice,
} from '../../services/nostr';
import { PaymentMethodsEditor } from '../../components/payment/PaymentMethodsEditor';
import { VehicleEditor } from '../../components/provider/VehicleEditor';
import { AccessNeedsPicker } from '../../components/task/AccessNeedsPicker';
import { NameEditor } from '../../components/common/NameEditor';
import {
  loadAccessFeatures, saveAccessFeatures, loadAccessNeeds, saveAccessNeeds,
} from '../../utils/access-needs';
import { dispatchService } from '../../services/dispatch';
import { useT, LOCALES } from '../../i18n';
import { WomenSafetyCard } from '../../components/safety/WomenSafetyCard';
import { ReputationBadge } from '../../components/common/ReputationBadge';

interface ProfilePageProps {
  role: 'requester' | 'provider';
}

/**
 * Identity backup and restore. The Nostr key IS the user's portable
 * reputation — losing it (cleared browser storage, new phone) must never
 * mean starting from zero, so backup and import are first-class.
 */
export function ProfilePage({ role }: ProfilePageProps) {
  const { t, locale, setLocale } = useT();
  const { identity } = useIdentity();
  const [nsec, setNsec] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [manualCopy, setManualCopy] = useState<{ label: string; value: string } | null>(null);
  const [importValue, setImportValue] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(getIdentityRecoveryNotice());
  // Provider: what this vehicle offers. Requester: what they need.
  const [accessFeatures, setAccessFeatures] = useState<string[]>(
    () => (role === 'provider' ? loadAccessFeatures() : loadAccessNeeds()),
  );

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
        <h1 className="text-xl font-black tracking-tight">{t('profile.title')}</h1>
        <p className="text-sm text-donkey-muted mt-1">
          {t('profile.intro')}
        </p>
      </div>

      {/* Language — device-local, auto-detected from the browser */}
      <div className="card space-y-2">
        <p className="text-xs uppercase tracking-wider text-donkey-muted">{t('profile.language')}</p>
        <p className="text-sm text-donkey-muted">{t('profile.languageNote')}</p>
        <div className="flex gap-2">
          {LOCALES.map((l) => (
            <button
              key={l.id}
              className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                locale === l.id
                  ? 'border-donkey-blue text-donkey-blue bg-donkey-blue/10'
                  : 'border-donkey-border text-donkey-muted'
              }`}
              onClick={() => setLocale(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
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
        <p className="text-xs uppercase tracking-wider text-donkey-muted">{t('profile.accountId')}</p>
        <p className="text-sm text-donkey-muted">
          {t('profile.accountIdNote')}
        </p>
        <p className="font-mono text-xs break-all">{identity?.npub || '…'}</p>
        <button
          className="btn-secondary w-full"
          onClick={() => identity && copy('your ID', identity.npub)}
        >
          {copied === 'your ID' ? t('profile.copied') : t('profile.copyId')}
        </button>
      </div>

      {/* Backup */}
      <div className="card space-y-3">
        <p className="text-xs uppercase tracking-wider text-donkey-muted">{t('profile.recoveryKey')}</p>
        <p className="text-sm text-donkey-muted">
          {t('profile.recoveryNote')}
        </p>
        {nsec ? (
          <>
            <p className="font-mono text-xs break-all bg-donkey-bg rounded p-3 border border-donkey-border">{nsec}</p>
            <button className="btn-primary w-full" onClick={() => copy('your recovery key', nsec)}>
              {copied === 'your recovery key' ? t('profile.copied') : t('profile.copyRecovery')}
            </button>
          </>
        ) : (
          <button className="btn-secondary w-full" onClick={revealNsec}>
            {t('profile.revealRecovery')}
          </button>
        )}
      </div>

      {/* Restore */}
      <div className="card space-y-3">
        <p className="text-xs uppercase tracking-wider text-donkey-muted">{t('profile.restore')}</p>
        <p className="text-sm text-donkey-muted">
          {t('profile.restoreNote')}
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
          {t('profile.replace')}
        </button>
      </div>

      {/* Your own standing. Drivers are judged on this and could not
          see it; riders are judged on it too. Read from public relays
          and signature-verified in this client, exactly as a stranger
          would see it — never a number the operator asserts. */}
      {identity?.npub && (
        <div className="card">
          <p className="font-bold text-donkey-text">{t('profile.standing')}</p>
          <div className="mt-2">
            <ReputationBadge subject={identity.npub} />
          </div>
          <p className="text-xs text-donkey-muted mt-2">
            {t('profile.standingNote')}
          </p>
        </div>
      )}

      {/* The name the other party sees — your own kind 0 metadata */}
      <NameEditor />

      {/* Women-only matching — device-local, self-declared */}
      <WomenSafetyCard role={role} />

      {/* What this journey needs / what this vehicle offers. Remembered on
          the device so nobody re-declares a wheelchair every single time. */}
      <AccessNeedsPicker
        role={role}
        value={accessFeatures}
        onChange={(ids) => {
          setAccessFeatures(ids);
          if (role === 'provider') {
            saveAccessFeatures(ids);
            // Re-register so dispatch applies the change immediately
            dispatchService.refreshDeclarations();
          } else {
            saveAccessNeeds(ids);
          }
        }}
      />

      {/* Provider only: accepted payment methods (non-custodial, direct) */}
      {role === 'provider' && <PaymentMethodsEditor />}

      {/* Provider only: the car a matched requester should look for */}
      {role === 'provider' && <VehicleEditor />}
    </div>
  );
}
