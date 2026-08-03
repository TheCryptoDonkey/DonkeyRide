import { useDomain } from '../../context/DomainContext';
import { useT } from '../../i18n';
import type { DeclaredCredential } from '../../types/api';

/**
 * What the provider says they hold, shown to the person waiting for them.
 *
 * Deliberately worded as a claim. The operator does not check a licence
 * number against any register and this card must never suggest it did —
 * same discipline as the rating badge, which shows what strangers signed
 * rather than a number the operator made up. A reference is shown because
 * it is checkable BY THE REQUESTER against the issuing authority, which is
 * the only verification anybody here can honestly offer.
 */
export function CredentialsCard({ credentials }: { credentials?: DeclaredCredential[] }) {
  const { t } = useT();
  const { profile } = useDomain();

  if (!credentials || credentials.length === 0) return null;

  const labelFor = (id: string) =>
    (profile?.credentials || []).find((c) => c.id === id)?.label || id;

  return (
    <div className="meta-card">
      <p className="meta-label">{t('credentials.declaredTitle')}</p>
      <ul className="mt-1 space-y-1">
        {credentials.map((credential) => (
          <li key={credential.id} className="text-sm text-donkey-text">
            <span className="text-donkey-green" aria-hidden="true">✓ </span>
            {labelFor(credential.id)}
            {credential.reference && (
              <span className="text-donkey-muted font-mono text-xs"> · {credential.reference}</span>
            )}
            {credential.expiresAt && (
              <span className="text-donkey-muted text-xs">
                {' · '}
                {t('credentials.until', {
                  date: new Date(credential.expiresAt).toLocaleDateString(undefined, {
                    month: 'short', year: 'numeric',
                  }),
                })}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-donkey-muted mt-2">{t('credentials.selfDeclared')}</p>
    </div>
  );
}
