import { useDomain } from '../../context/DomainContext';
import { useTask } from '../../context/TaskContext';

export function DomainSwitcher() {
  const { profile, availableDomains, switchDomain } = useDomain();
  const { activeTask } = useTask();

  if (availableDomains.length < 2) return null;

  const locked = !!activeTask;

  return (
    <select
      value={profile?.id || ''}
      onChange={e => switchDomain(e.target.value)}
      disabled={locked}
      className="text-sm font-semibold rounded-full px-3 py-2 cursor-pointer transition-all appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        background: 'rgba(0, 0, 0, 0.25)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        color: 'white',
        letterSpacing: '0.05em',
        outline: 'none',
      }}
      title={locked ? 'Finish the current task before switching domain' : 'Switch domain preview'}
    >
      {availableDomains.map(d => (
        <option key={d.id} value={d.id} style={{ color: '#333', background: '#fff' }}>
          {d.emoji} {d.name}
        </option>
      ))}
    </select>
  );
}
