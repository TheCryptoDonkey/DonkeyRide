import { useBtcPrices } from '../../hooks/useBtcPrices';
import { formatSats, satsToFiat } from '../../services/pricing';

interface DualPriceProps {
  sats: number;
  size?: 'sm' | 'md' | 'lg';
  /**
   * Drop the sats half. For narrow slots — a three-column breakdown, a list
   * row — where "£1.86 (3,964 sats)" wraps onto three lines and the number
   * stops being readable at all. The sats stay in the title attribute.
   */
  compact?: boolean;
  className?: string;
}

/**
 * Fiat-first price display: the currency people think in leads, sats ride
 * along for the Bitcoin-native. Falls back to sats-only while the BTC
 * price is still loading or unavailable.
 */
export function DualPrice({ sats, size = 'md', compact, className }: DualPriceProps) {
  const { prices } = useBtcPrices();

  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl',
  };

  const fiat = satsToFiat(sats, prices);

  if (!fiat) {
    return (
      <span
        className={`inline-flex items-baseline ${className || ''}`}
        title={`${formatSats(sats)} sats`}
      >
        <span className={`text-donkey-orange font-bold ${sizeClasses[size]}`}>
          {formatSats(sats)} sats
        </span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-baseline gap-2 ${className || ''}`}
      title={`${formatSats(sats)} sats`}
    >
      <span className={`text-donkey-orange font-bold ${sizeClasses[size]} whitespace-nowrap`}>
        {fiat}
      </span>
      {!compact && (
        <span className="text-donkey-muted text-sm whitespace-nowrap">
          ({formatSats(sats)} sats)
        </span>
      )}
    </span>
  );
}
