import { Link, useLocation } from 'react-router-dom';
import { useDomain } from '../../context/DomainContext';
import { useIdentity } from '../../context/IdentityContext';

export function Header() {
  const { profile } = useDomain();
  const { role, setRole, identity } = useIdentity();
  const location = useLocation();

  const isProvider = role === 'driver' || location.pathname.startsWith('/drive');
  const truncatedPub = identity?.npub
    ? `${identity.npub.slice(0, 12)}...${identity.npub.slice(-4)}`
    : '...';

  return (
    <header className="bg-brand-gradient text-white px-6 py-4 flex items-center justify-between shadow-lg z-20">
      <Link to="/" className="flex items-center gap-3">
        <span className="text-2xl font-black tracking-tight">
          {profile?.name || 'DonkeyRide'}
        </span>
        <span className="text-xs uppercase tracking-widest opacity-75">
          {profile?.roles.requester || 'rider'} / {profile?.roles.provider || 'driver'}
        </span>
      </Link>

      <div className="flex items-center gap-4">
        {/* Role toggle */}
        <div className="flex bg-white/20 rounded-lg overflow-hidden text-sm">
          <button
            className={`px-4 py-2 transition-colors ${
              !isProvider ? 'bg-white/30 font-bold' : 'hover:bg-white/10'
            }`}
            onClick={() => setRole('rider')}
          >
            {profile?.roles.requester || 'Rider'}
          </button>
          <button
            className={`px-4 py-2 transition-colors ${
              isProvider ? 'bg-white/30 font-bold' : 'hover:bg-white/10'
            }`}
            onClick={() => setRole('driver')}
          >
            {profile?.roles.provider || 'Driver'}
          </button>
        </div>

        {/* Identity badge */}
        <div className="text-xs font-mono opacity-75" title={identity?.npub}>
          {truncatedPub}
        </div>
      </div>
    </header>
  );
}
