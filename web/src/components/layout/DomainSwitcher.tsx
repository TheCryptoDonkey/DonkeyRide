import { useDomain } from '../../context/DomainContext';
import { useTask } from '../../context/TaskContext';
import { useT } from '../../i18n';

export function DomainSwitcher() {
  const { t } = useT();
  const { profile, availableDomains, switchDomain } = useDomain();
  const { activeTask } = useTask();

  if (availableDomains.length < 2) return null;

  const locked = !!activeTask;

  // Emoji-width in the header. A full-width pill repeating the domain name
  // next to the wordmark pushed the app-switch link off the right edge of a
  // phone, and a narrow <select> still renders its clipped label — so show
  // the emoji and lay a transparent select over it.
  const current = availableDomains.find((d) => d.id === profile?.id);

  return (
    <span className={`relative shrink-0 w-11 h-11 inline-flex items-center justify-center rounded-full hover:bg-white/10 ${locked ? 'opacity-50' : ''}`}>
      <span className="text-lg pointer-events-none" aria-hidden="true">
        {current?.emoji || '🌐'}
      </span>
      <select
        value={profile?.id || ''}
        onChange={e => switchDomain(e.target.value)}
        disabled={locked}
        aria-label="Switch domain"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        title={locked ? t('domain.locked') : t('domain.switch')}
      >
        {availableDomains.map(d => (
          <option key={d.id} value={d.id} style={{ color: '#333', background: '#fff' }}>
            {d.emoji} {d.name}
          </option>
        ))}
      </select>
    </span>
  );
}
