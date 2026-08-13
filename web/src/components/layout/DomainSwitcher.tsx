import { useDomain } from '../../context/DomainContext';
import { useTask } from '../../context/TaskContext';
import { useT } from '../../i18n';

export function DomainSwitcher() {
  const { t } = useT();
  const { profile, availableDomains, switchDomain } = useDomain();
  const { activeTask } = useTask();

  if (availableDomains.length < 2) return null;

  const locked = !!activeTask;

  return (
    <div className="card space-y-2">
      <label className="block">
        <span className="meta-label">{t('domain.switch')}</span>
        <select
          name="domain"
          value={profile?.id || ''}
          onChange={e => switchDomain(e.target.value)}
          disabled={locked}
          className="input-field w-full mt-1"
        >
          {availableDomains.map(d => (
            <option key={d.id} value={d.id}>
              {d.emoji} {d.name}
            </option>
          ))}
        </select>
      </label>
      {locked && <p className="text-xs text-donkey-orange">{t('domain.locked')}</p>}
    </div>
  );
}
