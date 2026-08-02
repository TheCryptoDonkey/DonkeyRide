/**
 * Non-custodial settlement rail registry.
 *
 * Every rail here settles DIRECTLY rider->driver; the operator never receives,
 * holds, or transmits funds. Adding a rail is a matter of dropping a module in
 * and registering it — the "etc." in "Lightning, M-Pesa, Tando, etc." is
 * config, not a rewrite.
 */
const CashRail = require('./cash');
const LnAddressRail = require('./lnaddress');
const MpesaRail = require('./mpesa');

const RAILS = {
  cash: CashRail,
  lnaddress: LnAddressRail,   // Lightning wallet-to-wallet (LN Address / LNURL)
  lightning: LnAddressRail,   // alias
  tando: LnAddressRail,       // Tando = a Lightning Address that settles to M-Pesa
  mpesa: MpesaRail
};

// Public presentation for the driver's "accepted methods" picker.
const RAIL_CATALOGUE = [
  { id: 'lnaddress', label: 'Lightning', handleLabel: 'Lightning Address', handleHint: 'you@wallet.com', settles: 'Lightning', custody: 'none' },
  { id: 'tando', label: 'Tando (Lightning to M-Pesa)', handleLabel: 'M-Pesa number', handleHint: '2547XXXXXXXX', settles: 'M-Pesa (paid over Lightning)', custody: 'none' },
  { id: 'mpesa', label: 'M-Pesa', handleLabel: 'M-Pesa number', handleHint: '2547XXXXXXXX', settles: 'M-Pesa', custody: 'none' },
  { id: 'cash', label: 'Cash', handleLabel: null, handleHint: null, settles: 'In person', custody: 'none' }
];

const instances = new Map();

function getRail(id, config = {}) {
  const key = (id || '').toLowerCase();
  const Rail = RAILS[key];
  if (!Rail) {
    throw new Error(`Unknown settlement rail: ${id}`);
  }
  if (!instances.has(key)) {
    instances.set(key, new Rail(config));
  }
  return instances.get(key);
}

function isKnownRail(id) {
  return Boolean(RAILS[(id || '').toLowerCase()]);
}

function listRails() {
  return RAIL_CATALOGUE;
}

/**
 * Normalise a driver-supplied handle. Tando turns any Kenyan M-Pesa number
 * into a Lightning Address at bitcoin.co.ke, so a driver can enter just their
 * number for the Tando rail and we build the address for them.
 */
function normaliseHandle(railId, handle) {
  const key = (railId || '').toLowerCase();
  const raw = typeof handle === 'string' ? handle.trim() : '';
  if (key === 'tando' && MpesaRail.isMpesaNumber(raw)) {
    const digits = raw.replace(/[\s-]/g, '').replace(/^\+/, '').replace(/^0/, '254');
    return `${digits}@bitcoin.co.ke`;
  }
  return raw;
}

/**
 * Validate a driver-supplied handle for a rail (so we never advertise junk).
 */
function validateHandle(railId, handle) {
  const key = (railId || '').toLowerCase();
  if (key === 'cash') return true;
  if (key === 'mpesa') return MpesaRail.isMpesaNumber(handle);
  if (key === 'tando') {
    return MpesaRail.isMpesaNumber(handle) || LnAddressRail.isLightningAddress(handle);
  }
  if (['lnaddress', 'lightning'].includes(key)) return LnAddressRail.isLightningAddress(handle);
  return false;
}

/**
 * Which handles are safe to publish publicly (payment endpoints) vs. which are
 * PII to be shared per-ride only (a phone number).
 */
function isPublicSafe(railId) {
  return ['lnaddress', 'lightning', 'tando', 'cash'].includes((railId || '').toLowerCase());
}

module.exports = { getRail, isKnownRail, listRails, validateHandle, normaliseHandle, isPublicSafe, RAIL_CATALOGUE };
