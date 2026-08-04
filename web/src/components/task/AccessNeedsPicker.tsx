import { useDomain } from '../../context/DomainContext';
import { toggle } from '../../utils/access-needs';
import { useT } from '../../i18n';

interface AccessNeedsPickerProps {
  /** Currently selected ids */
  value: string[];
  onChange: (ids: string[]) => void;
  /**
   * 'requester' asks what they need; 'provider' asks what they can offer.
   * Same catalogue, opposite question — so the copy differs.
   */
  role: 'requester' | 'provider';
  /**
   * Render without the card chrome and title — for a caller that already
   * provides both (a sheet disclosure), where a card inside a card and a
   * heading under a heading just add noise.
   */
  bare?: boolean;
}

/**
 * What the journey needs (rider), or what this vehicle can offer (driver).
 *
 * Kept out of the service-class picker on purpose: needing a ramp or a
 * child seat is not a request for a more expensive car, and presenting it
 * as one would charge disabled passengers a premium for being disabled.
 * The fare is identical; only the set of eligible providers narrows.
 */
export function AccessNeedsPicker({ value, onChange, role, bare }: AccessNeedsPickerProps) {
  const { profile } = useDomain();
  const { t } = useT();
  const options = profile?.accessOptions || [];
  const labels = profile?.labels;

  if (options.length === 0) return null;

  // A domain may supply its own question. The default copy asks what this
  // journey needs, which is wrong when the same list carries trade
  // qualifications or licence categories. Profile copy is server-sent and
  // therefore untranslated — the fallback keeps the translated default.
  const title = role === 'requester'
    ? labels?.accessRequesterTitle || t('access.riderTitle')
    : labels?.accessProviderTitle || t('access.providerTitle');
  const hint = role === 'requester'
    ? labels?.accessRequesterHint || t('access.riderHint')
    : labels?.accessProviderHint || t('access.providerHint');

  return (
    <div className={bare ? '' : 'meta-card mb-4'}>
      {!bare && <p className="meta-label mb-1">{title}</p>}
      <p className="text-xs text-donkey-muted mb-2">{hint}</p>
      {/*
        Article 9(2)(a) explicit consent, and it has to be BEFORE the tick.
        Wheelchair, step-free and assistance-dog needs are data concerning
        health under Article 4(15) — ticking one discloses a disability. The
        prohibition in Article 9(1) lifts on explicit consent, and consent is
        only explicit if it is informed: what it is, what it is for, who
        receives it, how long it is kept. A checkbox with no notice is an
        affirmative act about something the person was never told.

        Requester side only. A provider ticking "assistance dog" is stating a
        vehicle policy, not their own health, so no Article 9 issue arises.
      */}
      {role === 'requester' && (
        <p className="text-xs text-donkey-muted mb-3 leading-relaxed">
          {t('access.riderConsent')}
        </p>
      )}
      <div className="space-y-1">
        {options.map((option) => {
          const checked = value.includes(option.id);
          return (
            <label
              key={option.id}
              className="flex items-start gap-3 min-h-[44px] cursor-pointer py-1"
            >
              <input
                type="checkbox"
                className="w-5 h-5 mt-0.5 shrink-0 accent-donkey-blue"
                checked={checked}
                onChange={() => onChange(toggle(value, option.id))}
              />
              <span className="min-w-0">
                <span className="block text-sm text-donkey-text font-semibold">
                  {role === 'provider' && option.providerPrompt
                    ? option.providerPrompt
                    : option.label}
                </span>
                {role === 'requester' && option.description && (
                  <span className="block text-xs text-donkey-muted">
                    {option.description}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      {value.length > 0 && (
        <p className="text-xs text-donkey-muted mt-2">
          {role === 'requester' ? t('access.riderNote') : t('access.providerNote')}
        </p>
      )}
    </div>
  );
}
