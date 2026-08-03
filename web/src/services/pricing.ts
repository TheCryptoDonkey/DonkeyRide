import type { BtcPrices } from '../types/api';

const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: '£',
  USD: '$',
  EUR: '€',
  KES: 'KSh ',
};

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'KES'];

const PREF_KEY_CURRENCY = 'donkeyride.pref.currency';
const PREF_KEY_UNIT = 'donkeyride.pref.unit';

/** Get the user's preferred fiat currency */
export function getPreferredCurrency(): string {
  const stored = localStorage.getItem(PREF_KEY_CURRENCY);
  if (stored && SUPPORTED_CURRENCIES.includes(stored.toUpperCase())) {
    return stored.toUpperCase();
  }
  return 'GBP';
}

/** Set the user's preferred fiat currency */
export function setPreferredCurrency(currency: string): void {
  localStorage.setItem(PREF_KEY_CURRENCY, currency.toUpperCase());
}

/** Get currency symbol */
export function getCurrencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] || code;
}

/** Get the user's preferred distance unit */
export function getPreferredUnit(): 'km' | 'mi' {
  const stored = localStorage.getItem(PREF_KEY_UNIT);
  return stored === 'km' ? 'km' : 'mi';
}

/** Set the user's preferred distance unit */
export function setPreferredUnit(unit: 'km' | 'mi'): void {
  localStorage.setItem(PREF_KEY_UNIT, unit);
}

/** Convert satoshis to fiat display string */
export function satsToFiat(
  sats: number,
  prices: BtcPrices | null,
  currency?: string,
): string {
  if (!prices) return '';
  const curr = currency || getPreferredCurrency();
  const btcPrice = prices[curr as keyof Pick<BtcPrices, 'USD' | 'GBP' | 'EUR' | 'KES'>];
  if (!btcPrice) return '';
  const fiatValue = (sats / 100_000_000) * btcPrice;
  // KES is quoted in whole shillings; other currencies keep two decimals.
  const shown = curr === 'KES'
    ? Math.round(fiatValue).toLocaleString()
    : fiatValue.toFixed(2);
  return `${getCurrencySymbol(curr)}${shown}`;
}

/**
 * Format a fiat amount the operator already derived (a settlement
 * instruction), with its symbol and the right number of decimals.
 *
 * The server rounds to two decimals, which makes £7.90 arrive as the number
 * 7.9 — printed raw that reads as unfinished software on the one screen
 * where someone is about to hand over money. KES is quoted in whole
 * shillings, as everywhere else.
 */
export function formatFiatAmount(amount: number, currency?: string): string {
  const curr = currency || getPreferredCurrency();
  if (!Number.isFinite(amount)) return '';
  const shown = curr === 'KES'
    ? Math.round(amount).toLocaleString()
    : amount.toFixed(2);
  return `${getCurrencySymbol(curr)}${shown}`;
}

/** Format satoshis with comma separators */
export function formatSats(sats: number): string {
  return Math.round(sats).toLocaleString();
}

/** Convert distance from km based on user preference */
export function formatDistance(distanceKm: number, digits = 1): string {
  const unit = getPreferredUnit();
  if (unit === 'mi') {
    return `${(distanceKm * 0.621371).toFixed(digits)} mi`;
  }
  return `${distanceKm.toFixed(digits)} km`;
}

/** Format duration in minutes to human-readable string */
export function formatDuration(minutes: number): string {
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}
