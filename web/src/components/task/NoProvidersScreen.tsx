import { useT } from '../../i18n';

interface NoProvidersScreenProps {
  providerLabel: string;
  taskNoun: string;
  /** How far the operator searched before giving up */
  radiusKm?: number;
  onRetry: () => void;
  onSchedule: () => void;
}

/**
 * The honest end of a search that found nobody.
 *
 * A rider who is told "no {drivers} are available" can decide what to do.
 * A rider left on a spinner cannot, and will assume the app is broken —
 * which, before this screen existed, was the more reasonable conclusion.
 */
export function NoProvidersScreen({
  providerLabel, taskNoun, radiusKm, onRetry, onSchedule,
}: NoProvidersScreenProps) {
  const { t } = useT();

  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="card max-w-sm w-full text-center space-y-4">
        <p className="text-4xl" aria-hidden="true">🤷</p>
        <div>
          <h1 className="text-lg font-black text-donkey-text">
            {t('noProviders.title', { label: providerLabel })}
          </h1>
          <p className="text-sm text-donkey-muted mt-2">
            {radiusKm
              ? t('noProviders.searched', { km: Math.round(radiusKm), label: providerLabel })
              : t('noProviders.none', { label: providerLabel })}
          </p>
        </div>

        <p className="text-xs text-donkey-muted">
          {t('noProviders.noCharge', { noun: taskNoun })}
        </p>

        <div className="space-y-2">
          <button className="btn-primary w-full" onClick={onRetry}>
            {t('noProviders.retry')}
          </button>
          <button className="btn-secondary w-full" onClick={onSchedule}>
            {t('noProviders.schedule', { noun: taskNoun })}
          </button>
        </div>
      </div>
    </div>
  );
}
