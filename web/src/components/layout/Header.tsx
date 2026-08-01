import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDomain } from '../../context/DomainContext';
import { useIdentity } from '../../context/IdentityContext';
import { getIdentityRecoveryNotice } from '../../services/nostr';
import { DomainSwitcher } from './DomainSwitcher';

interface HeaderProps {
  app: 'rider' | 'driver';
}

export function Header({ app }: HeaderProps) {
  const { profile } = useDomain();
  const { identity } = useIdentity();
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);

  // The flag is written while the identity loads — re-check when it settles
  useEffect(() => {
    setRecoveryNotice(getIdentityRecoveryNotice());
  }, [identity]);

  const isDriver = app === 'driver';
  const homePath = isDriver ? '/provide' : '/';
  const providerNoun = profile?.roles.provider || 'Driver';
  const appSuffix = isDriver
    ? providerNoun.charAt(0).toUpperCase() + providerNoun.slice(1)
    : null;

  const truncatedPub = identity?.npub
    ? `${identity.npub.slice(0, 12)}...${identity.npub.slice(-4)}`
    : '...';

  // Switching apps is a full navigation — rider and driver are separate PWAs
  const switchHref = isDriver ? '/' : '/provide';
  const switchLabel = isDriver
    ? `${profile?.roles.requester || 'Rider'} app`
    : `${providerNoun} app`;

  return (
    <>
      <header className="bg-brand-gradient text-white px-6 py-4 flex items-center justify-between z-20"
              style={{ boxShadow: '0 8px 25px rgba(0, 0, 0, 0.35)' }}>
        <Link to={homePath} className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black" style={{ letterSpacing: '-0.02em' }}>
                {profile?.theme?.emoji && <span className="mr-1">{profile.theme.emoji}</span>}
                DonkeyRide{appSuffix && <span className="font-semibold opacity-80"> {appSuffix}</span>}
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

          {/* Cross-app link */}
          <a
            href={switchHref}
            className="px-4 py-2 rounded-full text-sm font-semibold transition-all hover:bg-white/10"
            style={{ background: 'rgba(0, 0, 0, 0.25)', border: '1px solid rgba(255, 255, 255, 0.2)', letterSpacing: '0.05em' }}
          >
            {switchLabel}
          </a>

          {/* Identity badge → profile (key backup/restore) */}
          <Link
            to={isDriver ? '/provide/profile' : '/request/profile'}
            className="text-xs font-mono opacity-70 hover:opacity-100 underline decoration-dotted underline-offset-4 min-h-[44px] min-w-[44px] inline-flex items-center px-2 -mx-2"
            title={`${identity?.npub || ''} (tap to back up your key)`}
            style={{ letterSpacing: '0.04em' }}
          >
            {truncatedPub}
          </Link>
        </div>
      </header>

      {/* Identity recovery notice — stored key was unreadable and replaced */}
      {recoveryNotice && (
        <div className="bg-donkey-orange/20 border-b border-donkey-orange px-4 py-2 text-xs text-donkey-orange font-semibold">
          Stored identity could not be read; a new one was created. Restore from backup in Profile.
        </div>
      )}
    </>
  );
}
