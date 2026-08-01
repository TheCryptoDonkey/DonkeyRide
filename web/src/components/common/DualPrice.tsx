import { useBtcPrices } from '../../hooks/useBtcPrices';
import { formatSats, satsToFiat } from '../../services/pricing';

interface DualPriceProps {
  sats: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function DualPrice({ sats, size = 'md', className }: DualPriceProps) {
  const { prices } = useBtcPrices();

  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl',
  };

  const fiat = satsToFiat(sats, prices);

  return (
    <span className={`inline-flex items-baseline gap-2 ${className || ''}`}>
      <span className={`text-sats ${sizeClasses[size]}`}>
        {formatSats(sats)} sats
      </span>
      {fiat && (
        <span className="text-fiat">
          ({fiat})
        </span>
      )}
    </span>
  );
}
