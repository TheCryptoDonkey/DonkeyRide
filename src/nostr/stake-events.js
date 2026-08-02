const { getPublicKey, getEventHash, getSignature } = require('nostr-tools');
const { KINDS } = require('./kinds');

let operatorPrivkey = null;
let operatorPubkey = null;
let publisher = null;
let domainId = 'ridesharing';

function configure({ operatorPrivkey: privkey, publishGeneric, domain }) {
  operatorPrivkey = null;
  operatorPubkey = null;
  publisher = null;
  if (domain) {
    domainId = domain;
  }

  if (!privkey) {
    console.warn('[StakeEvents] Operator privkey not configured – stake events will remain local only.');
    return;
  }

  if (typeof publishGeneric !== 'function') {
    console.warn('[StakeEvents] Publisher not configured – stake events will remain local only.');
    return;
  }

  try {
    operatorPrivkey = privkey.toLowerCase();
    operatorPubkey = getPublicKey(operatorPrivkey);
    publisher = publishGeneric;
    console.log('[StakeEvents] Stake event publisher enabled.');
  } catch (error) {
    operatorPrivkey = null;
    operatorPubkey = null;
    publisher = null;
    console.warn('[StakeEvents] Failed to initialise publisher:', error.message);
  }
}

function canPublish() {
  return Boolean(operatorPrivkey && operatorPubkey && typeof publisher === 'function');
}

function buildEvent(kind, tags = [], content = '') {
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
  return event;
}

async function publishEvent(kind, tags, content) {
  const event = buildEvent(kind, tags, content);
  if (!event) {
    return null;
  }
  try {
    await publisher(event, operatorPubkey);
  } catch (error) {
    console.warn('[StakeEvents] Failed to publish event:', error.message);
  }
  return event;
}

function extractTagValue(event, tagKey) {
  if (!event?.tags) {
    return null;
  }
  const tag = event.tags.find((entry) => entry[0] === tagKey);
  return tag ? tag[1] : null;
}

function serialiseProviderEvent(event) {
  if (!event) {
    return '';
  }
  try {
    return JSON.stringify({
      provider_event: {
        kind: event.kind,
        id: event.id,
        tags: event.tags,
        content: event.content
      }
    });
  } catch (error) {
    console.warn('[StakeEvents] Failed to serialise provider event:', error.message);
    return '';
  }
}

/**
 * Normalise DonkeyRide's internal role names to TROTT party names.
 * The spec uses requester/provider on payment events.
 */
function toParty(role) {
  if (role === 'rider' || role === 'requester' || role === 'customer' || role === 'sender') {
    return 'requester';
  }
  if (role === 'driver' || role === 'provider' || role === 'locksmith' || role === 'courier') {
    return 'provider';
  }
  return role || 'unknown';
}

/**
 * TROTT-04 Kind 30532 Escrow Lock — funds committed for a task.
 * d tag: `{taskId}:lock:{party}` (addressable, one live lock per party).
 */
async function publishStakeLock({
  rideId,
  role,
  amount,
  participant,
  providerEvent,
  escrowId,
  currency = 'SAT',
  trustModel = 'unknown',
  paymentRail
}) {
  const party = toParty(role);
  const tags = [
    ['d', `${rideId}:lock:${party}`],
    ['domain', domainId],
    ['task_id', rideId],
    ['party', party],
    ['amount', String(amount || extractTagValue(providerEvent, 'amount') || 0)],
    ['currency', currency],
    ['trust_model', trustModel],
    ['locked_at', String(Math.floor(Date.now() / 1000))]
  ];
  if (participant) {
    tags.push(['p', participant.toLowerCase()]);
  }
  const rail = paymentRail || extractTagValue(providerEvent, 'provider');
  if (rail) {
    tags.push(['payment_rail', rail]);
  }
  const mechanism = extractTagValue(providerEvent, 'mechanism');
  if (mechanism) {
    tags.push(['lock_type', mechanism]);
  }
  const paymentHash = extractTagValue(providerEvent, 'payment_hash');
  if (paymentHash) {
    tags.push(['payment_hash', paymentHash]);
  }
  if (escrowId) {
    tags.push(['escrow_id', String(escrowId)]);
  }
  if (providerEvent?.id) {
    tags.push(['e', providerEvent.id]);
  }

  return publishEvent(KINDS.ESCROW_LOCK, tags, serialiseProviderEvent(providerEvent));
}

/**
 * TROTT-04 Kind 30533 Settlement with outcome=released.
 * d tag: `{taskId}:settlement:{party}`.
 */
async function publishStakeRelease({
  rideId,
  role,
  amount,
  providerEvent,
  reason = 'completed',
  currency = 'SAT',
  trustModel = 'unknown'
}) {
  const party = toParty(role);
  const derivedAmount = amount || extractTagValue(providerEvent, 'amount') || 0;
  const tags = [
    ['d', `${rideId}:settlement:${party}`],
    ['domain', domainId],
    ['task_id', rideId],
    ['outcome', 'released'],
    ['party', party],
    ['amount', String(derivedAmount)],
    ['currency', currency],
    ['trust_model', trustModel],
    ['release_reason', reason],
    ['released_at', String(Math.floor(Date.now() / 1000))]
  ];
  if (providerEvent?.id) {
    tags.push(['e', providerEvent.id]);
  }
  return publishEvent(KINDS.SETTLEMENT, tags, serialiseProviderEvent(providerEvent));
}

/**
 * TROTT-04 Kind 30533 Settlement with outcome=forfeited / partial_forfeit.
 */
async function publishStakePenalty({
  rideId,
  role,
  reason,
  penalty,
  refund,
  providerEvent,
  currency = 'SAT',
  trustModel = 'unknown'
}) {
  const party = toParty(role);
  const penaltyAmount = Number(penalty || extractTagValue(providerEvent, 'penalty') || 0);
  const refundAmount = Number(refund || extractTagValue(providerEvent, 'refund') || 0);
  const outcome = refundAmount > 0 ? 'partial_forfeit' : 'forfeited';
  const tags = [
    ['d', `${rideId}:settlement:${party}`],
    ['domain', domainId],
    ['task_id', rideId],
    ['outcome', outcome],
    ['party', party],
    ['amount', String(penaltyAmount)],
    ['refund', String(refundAmount)],
    ['currency', currency],
    ['trust_model', trustModel],
    ['release_reason', reason || 'unspecified'],
    ['released_at', String(Math.floor(Date.now() / 1000))]
  ];
  if (refundAmount > 0 && penaltyAmount + refundAmount > 0) {
    const pct = ((penaltyAmount / (penaltyAmount + refundAmount)) * 100).toFixed(1);
    tags.push(['forfeit_percentage', pct]);
  }
  if (providerEvent?.id) {
    tags.push(['e', providerEvent.id]);
  }
  return publishEvent(KINDS.SETTLEMENT, tags, serialiseProviderEvent(providerEvent));
}

module.exports = {
  configure,
  canPublish,
  publishStakeLock,
  publishStakeRelease,
  publishStakePenalty
};
