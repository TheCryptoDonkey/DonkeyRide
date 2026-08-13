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

const { getPublicKey, getEventHash, getSignature, nip44 } = require('nostr-tools');
const { KINDS } = require('./kinds');

let operatorPrivkey = null;
let operatorPubkey = null;
let publisher = null;
// NIP-44 conversation key with ourselves — the snapshot is written and read
// by this operator alone, so encrypting to our own key costs one ECDH and
// turns the relay into storage that cannot read what it stores.
let selfKey = null;

function configure({ operatorPrivkey: privkey, publishGeneric }) {
  operatorPrivkey = null;
  operatorPubkey = null;
  publisher = null;
  selfKey = null;

  if (!privkey || typeof publishGeneric !== 'function') {
    console.warn('[OperatorAnnounce] Not configured — operator will not be discoverable via Nostr.');
    return;
  }

  try {
    operatorPrivkey = privkey.toLowerCase();
    operatorPubkey = getPublicKey(operatorPrivkey);
    publisher = publishGeneric;
    selfKey = nip44.utils.v2.getConversationKey(operatorPrivkey, operatorPubkey);
  } catch (error) {
    console.warn('[OperatorAnnounce] Failed to initialise:', error.message);
  }
}

/**
 * Encrypt a snapshot body to the operator's own key.
 * Returns null if encryption is unavailable — the caller must then publish
 * NOTHING rather than fall back to plaintext. A snapshot is a durability
 * convenience; a plaintext one is a public record of who went where.
 */
function sealSnapshot(body) {
  if (!selfKey) {
    return null;
  }
  try {
    return nip44.encrypt(selfKey, JSON.stringify(body || {}));
  } catch (error) {
    console.warn('[OperatorAnnounce] Snapshot encryption failed:', error.message);
    return null;
  }
}

/**
 * Decrypt one of our own snapshots. Returns null for anything we cannot
 * open — a foreign, corrupt or legacy-plaintext event is not our state.
 */
function openSnapshot(content) {
  if (!selfKey || !content) {
    return null;
  }
  try {
    return JSON.parse(nip44.decrypt(selfKey, content));
  } catch (error) {
    return null;
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
  policy = null,
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
  if (policy?.schema) tags.push(['policy_schema', policy.schema]);
  if (policy?.mode) tags.push(['policy_mode', policy.mode]);
  if (policy?.admission?.mode) tags.push(['admission', policy.admission.mode]);
  if (policy?.records?.mode) tags.push(['record_mode', policy.records.mode]);
  if (policy?.termsUrl) tags.push(['terms_url', policy.termsUrl]);
  if (policy?.privacyUrl) tags.push(['privacy_url', policy.privacyUrl]);
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
 * The snapshot is SEALED to the operator's own key. It has exactly one
 * reader — this operator, rehydrating at boot — so nothing is gained by
 * leaving it readable, and a great deal is lost: published in the clear it
 * was a public, permanent record of which pubkey travelled from which
 * geohash cell to which, when, and for how much, queryable per person by
 * `#p`. Coarse location is not anonymous location. The `d` tag stays
 * (addressability) and NIP-40 expiration stays (relay hygiene); status,
 * domain, participants and geohashes now live inside the ciphertext.
 *
 * @param {Object} snapshot - { taskId, content:<object>, expirationSeconds }
 *   (status/domain/participants/geohashes are carried within `content`)
 */
async function publishTaskSnapshot(snapshot) {
  if (!snapshot?.taskId) {
    return null;
  }
  const content = sealSnapshot(snapshot.content);
  if (content === null) {
    // No key, no snapshot. Never degrade to plaintext.
    return null;
  }
  const tags = [['d', snapshot.taskId]];
  if (snapshot.expirationSeconds) {
    tags.push(['expiration', String(snapshot.expirationSeconds)]);
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
  openSnapshot,
  publishHeartbeat,
  getOperatorPubkey
};
