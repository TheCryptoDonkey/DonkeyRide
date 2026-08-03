import { useEffect, useState } from 'react';
import { ReputationBadge } from './ReputationBadge';
import {
  getProfile, displayName, initials, fallbackName, type UserProfile,
} from '../../services/profiles';

interface PersonCardProps {
  /** npub or hex pubkey of the person to show */
  subject: string | undefined | null;
  /** Their role in this task ("Driver", "Rider") */
  roleLabel: string;
  /** Verified reputation under the name — omit on screens that show it elsewhere */
  showReputation?: boolean;
  /** Right-hand slot: ETA, fare, an action button */
  children?: React.ReactNode;
  size?: 'sm' | 'md';
}

/**
 * A person, rendered as a person.
 *
 * Every screen used to identify the counterparty by a truncated npub, which
 * tells a rider nothing about who is collecting them. This shows the name
 * they published, their picture, and — crucially next to a self-declared
 * name — the reputation this client verified for itself.
 */
export function PersonCard({
  subject, roleLabel, showReputation = true, children, size = 'md',
}: PersonCardProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!subject) {
      setProfile(null);
      return;
    }
    let live = true;
    // Never blocks the screen: no profile just means the fallback identifier
    void getProfile(subject)
      .then((p) => { if (live) setProfile(p); })
      .catch(() => {});
    return () => { live = false; };
  }, [subject]);

  if (!subject) return null;

  const npub = profile?.npub || subject;
  const name = displayName(profile, npub);
  const named = Boolean(profile?.name);
  const avatarSize = size === 'sm' ? 'w-9 h-9 text-xs' : 'w-12 h-12 text-sm';

  return (
    <div className="flex items-center gap-3">
      {profile?.picture ? (
        <img
          src={profile.picture}
          alt=""
          className={`${avatarSize} rounded-full object-cover shrink-0 bg-donkey-bg`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      ) : (
        <div
          className={`${avatarSize} rounded-full shrink-0 bg-donkey-blue/20 text-donkey-blue font-black flex items-center justify-center`}
          aria-hidden="true"
        >
          {initials(name)}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="meta-label">{roleLabel}</p>
        <p
          className={`font-bold text-donkey-text truncate ${size === 'sm' ? 'text-sm' : 'text-base'} ${named ? '' : 'font-mono text-sm'}`}
          title={npub}
        >
          {name}
        </p>
        {showReputation && (
          <div className="mt-0.5">
            <ReputationBadge subject={npub} />
          </div>
        )}
      </div>

      {children && <div className="shrink-0 text-right">{children}</div>}
    </div>
  );
}

/** The same identity, inline and compact — for lists and headers */
export function PersonName({
  subject, className,
}: { subject: string | undefined | null; className?: string }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!subject) return;
    let live = true;
    void getProfile(subject).then((p) => { if (live) setProfile(p); }).catch(() => {});
    return () => { live = false; };
  }, [subject]);

  if (!subject) return null;
  const npub = profile?.npub || subject;
  return (
    <span className={className} title={npub}>
      {profile?.name || fallbackName(npub)}
    </span>
  );
}
