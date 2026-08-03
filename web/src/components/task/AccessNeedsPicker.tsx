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
}

/**
 * What the journey needs (rider), or what this vehicle can offer (driver).
 *
 * Kept out of the service-class picker on purpose: needing a ramp or a
 * child seat is not a request for a more expensive car, and presenting it
 * as one would charge disabled passengers a premium for being disabled.
 * The fare is identical; only the set of eligible providers narrows.
 */
export function AccessNeedsPicker({ value, onChange, role }: AccessNeedsPickerProps) {
  const { profile } = useDomain();
  const { t } = useT();
  const options = profile?.accessOptions || [];

  if (options.length === 0) return null;

  return (
    <div className="meta-card mb-4">
      <p className="meta-label mb-1">
        {role === 'requester' ? t('access.riderTitle') : t('access.providerTitle')}
      </p>
      <p className="text-xs text-donkey-muted mb-2">
        {role === 'requester' ? t('access.riderHint') : t('access.providerHint')}
      </p>
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
