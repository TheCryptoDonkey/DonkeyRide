import { useDomain } from '../../context/DomainContext';

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
};

const FALLBACK_COLOUR = 'bg-donkey-muted/20 text-donkey-muted';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { profile } = useDomain();

  // Reverse-lookup: find the state key whose value matches the current status
  let colourClass = FALLBACK_COLOUR;
  if (profile?.states.values) {
    for (const [key, value] of Object.entries(profile.states.values)) {
      if (value === status) {
        colourClass = KEY_COLOURS[key] || FALLBACK_COLOUR;
        break;
      }
    }
  }

  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase ${colourClass} ${className || ''}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
