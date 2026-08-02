import { useBtcPrices } from '../../hooks/useBtcPrices';
import { formatSats, satsToFiat } from '../../services/pricing';

interface DualPriceProps {
  sats: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Fiat-first price display: the currency people think in leads, sats ride
 * along for the Bitcoin-native. Falls back to sats-only while the BTC
 * price is still loading or unavailable.
 */
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
      {fiat ? (
        <>
          <span className={`text-donkey-orange font-bold ${sizeClasses[size]}`}>
            {fiat}
          </span>
          <span className="text-donkey-muted text-sm">
            ({formatSats(sats)} sats)
          </span>
        </>
      ) : (
        <span className={`text-donkey-orange font-bold ${sizeClasses[size]}`}>
          {formatSats(sats)} sats
        </span>
      )}
    </span>
  );
}
