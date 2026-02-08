import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useDomain } from '../../context/DomainContext';
import { useIdentity } from '../../context/IdentityContext';
import { DomainSwitcher } from './DomainSwitcher';

export function Header() {
  const { profile } = useDomain();
  const { role, setRole, identity } = useIdentity();
  const location = useLocation();
  const navigate = useNavigate();

  const isProvider = role === 'provider' || location.pathname.startsWith('/provide');
  const truncatedPub = identity?.npub
    ? `${identity.npub.slice(0, 12)}...${identity.npub.slice(-4)}`
    : '...';

  const handleRoleChange = (newRole: 'requester' | 'provider') => {
    setRole(newRole);
    navigate(newRole === 'provider' ? '/provide' : '/request');
  };

  return (
    <header className="bg-brand-gradient text-white px-6 py-4 flex items-center justify-between z-20"
            style={{ boxShadow: '0 8px 25px rgba(0, 0, 0, 0.35)' }}>
      <Link to="/" className="flex items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black" style={{ letterSpacing: '-0.02em' }}>
              {profile?.theme?.emoji && <span className="mr-1">{profile.theme.emoji}</span>}
              DonkeyRide
            </span>
          </div>
          <div className="text-xs uppercase opacity-70" style={{ letterSpacing: '0.2em' }}>
            {profile?.name || 'Protocol'}
          </div>
        </div>
      </Link>

      <div className="flex items-center gap-4">
        {/* Domain picker */}
        <DomainSwitcher />

        {/* Role toggle */}
        <div className="flex rounded-full overflow-hidden text-sm"
             style={{ background: 'rgba(0, 0, 0, 0.25)', border: '1px solid rgba(255, 255, 255, 0.2)' }}>
          <button
            className={`px-4 py-2 transition-all font-semibold ${
              !isProvider ? 'bg-white/25' : 'hover:bg-white/10'
            }`}
            style={{ letterSpacing: '0.05em' }}
            onClick={() => handleRoleChange('requester')}
          >
            {profile?.roles.requester || 'Requester'}
          </button>
          <button
            className={`px-4 py-2 transition-all font-semibold ${
              isProvider ? 'bg-white/25' : 'hover:bg-white/10'
            }`}
            style={{ letterSpacing: '0.05em' }}
            onClick={() => handleRoleChange('provider')}
          >
            {profile?.roles.provider || 'Provider'}
          </button>
        </div>

        {/* Identity badge */}
        <div className="text-xs font-mono opacity-70" title={identity?.npub}
             style={{ letterSpacing: '0.04em' }}>
          {truncatedPub}
        </div>
      </div>
    </header>
  );
}
