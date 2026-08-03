import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDomain } from '../../context/DomainContext';
import { useIdentity } from '../../context/IdentityContext';
import { getIdentityRecoveryNotice } from '../../services/nostr';
import { getProfile, initials, fallbackName } from '../../services/profiles';
import { DomainSwitcher } from './DomainSwitcher';
import { useT } from '../../i18n';

interface HeaderProps {
  app: 'rider' | 'driver';
}

/**
 * Mobile-first header.
 *
 * The previous one was laid out for a desktop: a two-column row with a full
 * wordmark, a subtitle, a domain select, a text app-switch pill and a
 * truncated npub. At 390 px the title wrapped, the switch link ran off the
 * right edge where it could not be tapped, and the whole thing ate a third
 * of the screen above a map that needed it. One compact row now, with the
 * identity shown as the user's own avatar rather than a base32 string.
 */
export function Header({ app }: HeaderProps) {
  const { profile } = useDomain();
  const { identity } = useIdentity();
  const { t } = useT();
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [me, setMe] = useState<{ name: string | null; picture: string | null }>(
    { name: null, picture: null },
  );

  // The flag is written while the identity loads — re-check when it settles
  useEffect(() => {
    setRecoveryNotice(getIdentityRecoveryNotice());
  }, [identity]);

  // Your own name and picture, so the header shows a person not a key
  useEffect(() => {
    if (!identity?.pubKeyHex) return;
    let live = true;
    void getProfile(identity.pubKeyHex)
      .then((p) => { if (live) setMe({ name: p.name, picture: p.picture }); })
      .catch(() => {});
    return () => { live = false; };
  }, [identity?.pubKeyHex]);

  const isDriver = app === 'driver';
  const homePath = isDriver ? '/provide' : '/';
  const providerNoun = profile?.roles.provider || 'Driver';
  const roleChip = isDriver
    ? providerNoun.charAt(0).toUpperCase() + providerNoun.slice(1)
    : null;

  // Switching apps is a full navigation — rider and driver are separate PWAs
  const switchHref = isDriver ? '/' : '/provide';
  const switchLabel = isDriver
    ? `${profile?.roles.requester || 'Rider'} app`
    : `${providerNoun} app`;

  const myName = me.name || fallbackName(identity?.npub);
  const profilePath = isDriver ? '/provide/profile' : '/request/profile';

  return (
    <>
      <header
        className="bg-brand-gradient text-white px-3 h-14 flex items-center gap-2 z-20 shrink-0"
        style={{ boxShadow: '0 8px 25px rgba(0, 0, 0, 0.35)' }}
      >
        {/* Brand — truncates rather than wrapping the header to two lines */}
        <Link to={homePath} className="flex items-center gap-1.5 min-w-0">
          {profile?.theme?.emoji && (
            <span className="text-lg shrink-0" aria-hidden="true">{profile.theme.emoji}</span>
          )}
          <span
            className="text-lg font-black truncate"
            style={{ letterSpacing: '-0.02em' }}
          >
            DonkeyRide
          </span>
          {roleChip && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/25 shrink-0">
              {roleChip}
            </span>
          )}
        </Link>

        <div className="flex-1" />

        {/* Domain picker renders nothing unless there is a choice to make */}
        <DomainSwitcher />

        {/* Cross-app link */}
        <a
          href={switchHref}
          aria-label={switchLabel}
          title={switchLabel}
          className="shrink-0 w-11 h-11 -mr-1 rounded-full inline-flex items-center justify-center text-lg transition-all hover:bg-white/10"
        >
          {/* Not a car: the domain switcher beside it is already a car for
              ridesharing, and two identical glyphs read as one control */}
          <span aria-hidden="true">{isDriver ? '🧍' : '💼'}</span>
        </a>

        {/* Identity → profile (key backup/restore), as a person */}
        <Link
          to={profilePath}
          aria-label={t('header.yourProfile')}
          title={myName}
          className="shrink-0 w-9 h-9 rounded-full overflow-hidden inline-flex items-center justify-center bg-black/25 border border-white/25 text-xs font-black"
        >
          {me.picture ? (
            <img
              src={me.picture}
              alt=""
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <span aria-hidden="true">{me.name ? initials(me.name) : '👤'}</span>
          )}
        </Link>
      </header>

      {/* Identity recovery notice — stored key was unreadable and replaced */}
      {recoveryNotice && (
        <div className="bg-donkey-orange/20 border-b border-donkey-orange px-4 py-2 text-xs text-donkey-orange font-semibold">
          {t('header.recoveryNotice')}
        </div>
      )}
    </>
  );
}
