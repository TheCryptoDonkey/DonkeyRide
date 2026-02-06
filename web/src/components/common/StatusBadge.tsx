const STATUS_COLOURS: Record<string, string> = {
  requested: 'bg-donkey-blue/20 text-donkey-blue',
  matched: 'bg-donkey-purple/20 text-donkey-purple',
  en_route: 'bg-donkey-orange/20 text-donkey-orange',
  arrived: 'bg-donkey-green/20 text-donkey-green',
  active: 'bg-donkey-green/20 text-donkey-green',
  completed: 'bg-donkey-green/20 text-donkey-green',
  cancelled: 'bg-donkey-red/20 text-donkey-red',
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const colourClass = STATUS_COLOURS[status] || 'bg-donkey-muted/20 text-donkey-muted';

  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase ${colourClass} ${className || ''}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
