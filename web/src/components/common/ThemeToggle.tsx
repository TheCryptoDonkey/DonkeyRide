import { useTheme, THEMES } from '../../utils/theme';
import { useT } from '../../i18n';

/**
 * Light, dark, or whatever the phone is doing.
 *
 * Dark-only was the wrong default for a product used standing outside in
 * daylight. Device-local, like the language choice it sits next to.
 */
export function ThemeToggle() {
  const { t } = useT();
  const { choice, setTheme } = useTheme();

  return (
    <div className="card space-y-2">
      <p className="text-xs uppercase tracking-wider text-donkey-muted">
        {t('profile.appearance')}
      </p>
      <p className="text-sm text-donkey-muted">{t('profile.appearanceNote')}</p>
      <div className="flex gap-2" role="group" aria-label={t('profile.appearance')}>
        {THEMES.map((option) => (
          <button
            key={option.id}
            aria-pressed={choice === option.id}
            className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition-colors ${
              choice === option.id
                ? 'border-donkey-blue text-donkey-blue bg-donkey-blue/10'
                : 'border-donkey-border text-donkey-muted'
            }`}
            onClick={() => setTheme(option.id)}
          >
            {t(option.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
