import { useDomain } from '../../context/DomainContext';
import { useT } from '../../i18n';

/** Map state keys to colour classes */
const KEY_COLOURS: Record<string, string> = {
  REQUESTED: 'bg-donkey-blue/20 text-donkey-blue',
  MATCHED: 'bg-donkey-purple/20 text-donkey-purple',
  PROVIDER_EN_ROUTE: 'bg-donkey-orange/20 text-donkey-orange',
  PROVIDER_ARRIVED: 'bg-donkey-green/20 text-donkey-green',
  METHOD_CONFIRMED: 'bg-donkey-purple/20 text-donkey-purple',
  COLLECTED: 'bg-donkey-orange/20 text-donkey-orange',
  ACTIVE: 'bg-donkey-green/20 text-donkey-green',
  ARRIVED_AT_DELIVERY: 'bg-donkey-purple/20 text-donkey-purple',
  COMPLETED: 'bg-donkey-green/20 text-donkey-green',
  CANCELLED: 'bg-donkey-red/20 text-donkey-red',
  NO_SHOW: 'bg-donkey-red/20 text-donkey-red',
};

const FALLBACK_COLOUR = 'bg-donkey-muted/20 text-donkey-muted';

interface StatusBadgeProps {
  status: string;
  /** Whose screen this is — the same state reads differently either side */
  role?: 'requester' | 'provider';
  className?: string;
}

/**
 * What is happening, in a sentence.
 *
 * This used to render the raw state machine value uppercased —
 * "PROVIDER EN ROUTE" — which is a database enum, not something a person
 * says, and it went through no translation at all, so a Swahili app showed
 * English constants. The state KEYS are stable across domain profiles, so
 * copy keys off them and lands in the reader's language and point of view.
 */
export function StatusBadge({ status, role = 'requester', className }: StatusBadgeProps) {
  const { profile } = useDomain();
  const { t, td } = useT();

  // Reverse-lookup: find the state key whose value matches the current status
  let stateKey: string | null = null;
  if (profile?.states.values) {
    for (const [key, value] of Object.entries(profile.states.values)) {
      if (value === status) {
        stateKey = key;
        break;
      }
    }
  }

  const colourClass = (stateKey && KEY_COLOURS[stateKey]) || FALLBACK_COLOUR;

  // Domain labels ("driver", "ride") are themselves translated, so a
  // locksmith profile in Swahili reads correctly too
  const params = {
    provider: td(profile?.roles.provider || 'driver').toLowerCase(),
    requester: td(profile?.roles.requester || 'rider').toLowerCase(),
    noun: td(profile?.labels?.taskNoun || 'task').toLowerCase(),
  };

  // Unknown state (a domain profile we have no copy for): fall back to the
  // raw value made readable rather than showing nothing
  const label = stateKey
    ? t(`state.${role}.${stateKey}`, params)
    : status.replace(/_/g, ' ');

  return (
    <span
      // The state changing IS the news on these screens, and a screen
      // reader user has no map to glance at
      role="status"
      aria-live="polite"
      className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${colourClass} ${className || ''}`}
    >
      {label}
    </span>
  );
}
