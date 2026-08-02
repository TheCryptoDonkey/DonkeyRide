/**
 * TROTT-02/06 operator presence on Nostr.
 *
 * Publishes the operator's service announcement (Kind 30511 Operator Bond —
 * the persistent "who I am, what I coordinate, on what terms" record) at
 * startup, and a liveness heartbeat (Kind 30554) on an interval. Together
 * these make the operator DISCOVERABLE via relays: a client that knows
 * nothing but a relay URL can find operators, compare fees and liveness,
 * and pick one — no hardcoded HTTPS entry point required.
 */

const { getPublicKey, getEventHash, getSignature } = require('nostr-tools');
const { KINDS } = require('./kinds');

let operatorPrivkey = null;
let operatorPubkey = null;
let publisher = null;

function configure({ operatorPrivkey: privkey, publishGeneric }) {
  operatorPrivkey = null;
  operatorPubkey = null;
  publisher = null;

  if (!privkey || typeof publishGeneric !== 'function') {
    console.warn('[OperatorAnnounce] Not configured — operator will not be discoverable via Nostr.');
    return;
  }

  try {
    operatorPrivkey = privkey.toLowerCase();
    operatorPubkey = getPublicKey(operatorPrivkey);
    publisher = publishGeneric;
  } catch (error) {
    console.warn('[OperatorAnnounce] Failed to initialise:', error.message);
  }
}

function canPublish() {
  return Boolean(operatorPrivkey && operatorPubkey && typeof publisher === 'function');
}

async function publishEvent(kind, tags, content = '') {
  if (!canPublish()) {
    return null;
  }
  const event = {
    kind,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
    pubkey: operatorPubkey
  };
  event.id = getEventHash(event);
  event.sig = getSignature(event, operatorPrivkey);
  try {
    await publisher(event, operatorPubkey);
  } catch (error) {
    console.warn('[OperatorAnnounce] Publish failed:', error.message);
  }
  return event;
}

/**
 * Kind 30511 Operator Bond / service announcement.
 * `bondAmount` is honest: 0 when the operator has not posted a bond.
 */
async function publishAnnouncement({
  name,
  domains = [],
  feePercent,
  paymentProviders = [],
  trustModels = [],
  supportedCurrencies = [],
  serviceUrl,
  publicRelays = [],
  bondAmount = 0,
  bondCurrency = 'SAT'
}) {
  const tags = [
    ['d', `${operatorPubkey}_bond`],
    ['t', 'trott-operator'],
    ['operator_pubkey', operatorPubkey],
    ['amount', String(bondAmount)],
    ['currency', bondCurrency],
    ['name', name || 'TROTT operator']
  ];
  domains.forEach((domain) => tags.push(['domain', domain]));
  if (feePercent != null) {
    tags.push(['fee_percent', String(feePercent)]);
  }
  if (paymentProviders.length) {
    tags.push(['payment_providers', paymentProviders.join(',')]);
  }
  if (trustModels.length) {
    tags.push(['trust_models', trustModels.join(',')]);
  }
  if (supportedCurrencies.length) {
    tags.push(['supported_currencies', supportedCurrencies.join(',')]);
  }
  if (serviceUrl) {
    tags.push(['service_url', serviceUrl]);
  }
  publicRelays.forEach((relay) => tags.push(['relay', relay]));

  const event = await publishEvent(KINDS.OPERATOR_BOND, tags);
  if (event) {
    console.log(`📡 Operator announcement published (kind ${KINDS.OPERATOR_BOND})`);
  }
  return event;
}

/**
 * TROTT-01 Kind 30078 State Snapshot — the custodian's current view of a
 * task. Addressable (one per d-tag = task id), so the relay keeps only the
 * latest. This is the operator's durability layer: no database required.
 *
 * The snapshot is deliberately PII-free — pubkeys, status, fare and
 * GEOHASH-level location only. Exact coordinates and addresses never leave
 * the operator's memory.
 *
 * @param {Object} snapshot - { taskId, status, domain, participants:[{pubkey,role}],
 *   geohashPickup, geohashDropoff, content:<object>, expirationSeconds }
 */
async function publishTaskSnapshot(snapshot) {
  if (!snapshot?.taskId) {
    return null;
  }
  const tags = [
    ['d', snapshot.taskId],
    ['status', snapshot.status || 'unknown'],
    ['domain', snapshot.domain || 'unknown']
  ];
  for (const p of snapshot.participants || []) {
    if (p?.pubkey) {
      tags.push(['p', p.pubkey.toLowerCase(), '', p.role || '']);
    }
  }
  if (snapshot.geohashPickup) {
    tags.push(['g', snapshot.geohashPickup]);
  }
  if (snapshot.geohashDropoff) {
    tags.push(['g', snapshot.geohashDropoff]);
  }
  if (snapshot.expirationSeconds) {
    tags.push(['expiration', String(snapshot.expirationSeconds)]);
  }
  let content = '';
  try {
    content = JSON.stringify(snapshot.content || {});
  } catch (error) {
    content = '';
  }
  return publishEvent(30078, tags, content);
}

/**
 * Kind 30554 Operator Heartbeat — published every 5 minutes. A stale
 * heartbeat tells participants the operator may be offline or abandoned.
 */
async function publishHeartbeat({ activeTasks = 0, domains = [], uptimeSeconds = 0 }) {
  const tags = [
    ['d', `${operatorPubkey}_heartbeat`],
    ['operator_pubkey', operatorPubkey],
    ['active_tasks', String(activeTasks)],
    ['domains', domains.join(',')],
    ['uptime_seconds', String(Math.floor(uptimeSeconds))]
  ];
  return publishEvent(KINDS.OPERATOR_HEARTBEAT, tags);
}

function getOperatorPubkey() {
  return operatorPubkey;
}

module.exports = {
  configure,
  canPublish,
  publishAnnouncement,
  publishTaskSnapshot,
  publishHeartbeat,
  getOperatorPubkey
};
