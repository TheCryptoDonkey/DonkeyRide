import { useState } from 'react';
import { useDomain } from '../../context/DomainContext';
import {
  loadCredentials, saveCredentials, isExpired, isExpiringSoon, type Credential,
} from '../../utils/credentials';
import { useT } from '../../i18n';

/** yyyy-mm-dd for a date input, in local time */
function toDateInput(ms: number | undefined): string {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * What you hold, in your own words.
 *
 * A licensed private hire driver, a Gas Safe engineer and an SIA officer
 * all have paperwork that the person waiting for them has no way to check.
 * The profile lists what the domain recognises; this is where a provider
 * declares theirs. Device-local, sent on accept, shown to the requester as
 * a CLAIM — the copy says declared, never verified, because the operator
 * checks none of it and must never imply otherwise.
 */
export function CredentialsEditor() {
  const { t } = useT();
  const { profile } = useDomain();
  const [credentials, setCredentials] = useState<Credential[]>(loadCredentials);
  const [saved, setSaved] = useState(false);

  const available = profile?.credentials || [];
  if (available.length === 0) return null;

  const held = (id: string) => credentials.find((c) => c.id === id);

  const update = (next: Credential[]) => {
    setCredentials(next);
    saveCredentials(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  const toggle = (id: string) => {
    update(held(id)
      ? credentials.filter((c) => c.id !== id)
      : [...credentials, { id }]);
  };

  const setField = (id: string, field: 'expiresAt' | 'reference', value: string) => {
    update(credentials.map((c) => {
      if (c.id !== id) return c;
      if (field === 'reference') {
        return { ...c, reference: value.trim() || undefined };
      }
      // End of the given day: a licence valid "until the 3rd" is valid ON the 3rd
      const ms = value ? new Date(`${value}T23:59:59`).getTime() : NaN;
      return { ...c, expiresAt: Number.isFinite(ms) ? ms : undefined };
    }));
  };

  return (
    <div className="card space-y-3">
      <div>
        <p className="text-xs uppercase tracking-wider text-donkey-muted">
          {t('credentials.title')}
        </p>
        <p className="text-sm text-donkey-muted mt-1">{t('credentials.intro')}</p>
      </div>

      {available.map((option) => {
        const mine = held(option.id);
        const expired = mine ? isExpired(mine) : false;
        const soon = mine ? isExpiringSoon(mine) : false;
        return (
          <div
            key={option.id}
            className={`rounded-lg border p-3 space-y-2 ${
              expired ? 'border-donkey-red/50' : 'border-donkey-border'
            }`}
          >
            <label className="flex items-start gap-3 cursor-pointer min-h-[44px]">
              <input
                type="checkbox"
                className="w-5 h-5 mt-0.5 accent-donkey-blue shrink-0"
                checked={Boolean(mine)}
                onChange={() => toggle(option.id)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-donkey-text">
                  {option.label}
                  {option.required && (
                    <span className="text-donkey-orange"> · {t('credentials.requiredTag')}</span>
                  )}
                </span>
                {option.description && (
                  <span className="block text-xs text-donkey-muted">{option.description}</span>
                )}
              </span>
            </label>

            {mine && (
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="meta-label">{t('credentials.expiry')}</span>
                  <input
                    type="date"
                    className="w-full bg-donkey-bg border border-donkey-border rounded-lg px-2 py-2 text-donkey-text text-sm"
                    value={toDateInput(mine.expiresAt)}
                    onChange={(e) => setField(option.id, 'expiresAt', e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="meta-label">{t('credentials.reference')}</span>
                  <input
                    type="text"
                    maxLength={60}
                    className="w-full bg-donkey-bg border border-donkey-border rounded-lg px-2 py-2 text-donkey-text text-sm"
                    value={mine.reference || ''}
                    placeholder={t('credentials.referencePlaceholder')}
                    onChange={(e) => setField(option.id, 'reference', e.target.value)}
                  />
                </label>
              </div>
            )}

            {expired && (
              <p className="text-xs text-donkey-red font-semibold">
                {t('credentials.expired')}
              </p>
            )}
            {soon && (
              <p className="text-xs text-donkey-orange font-semibold">
                {t('credentials.expiringSoon')}
              </p>
            )}
          </div>
        );
      })}

      <p className="text-xs text-donkey-muted">
        {profile?.enforceCredentials
          ? t('credentials.enforced')
          : t('credentials.notVerified')}
      </p>
      {saved && <p className="text-xs text-donkey-green font-semibold">{t('credentials.saved')}</p>}
    </div>
  );
}
