/**
 * Local emergency services number, mapped from the device locale's
 * region. 112 is the GSM-standard fallback — networks in most countries
 * accept or redirect it.
 */

const BY_REGION: Record<string, string> = {
  GB: '999', IE: '999', KE: '999', UG: '999', TZ: '999', HK: '999',
  US: '911', CA: '911', MX: '911', PH: '911',
  AU: '000',
  NZ: '111',
};

export function emergencyNumber(locale?: string): string {
  const lang = locale
    || (typeof navigator !== 'undefined' ? navigator.language : '')
    || '';
  const region = (lang.split('-')[1] || '').toUpperCase();
  return BY_REGION[region] || '112';
}
