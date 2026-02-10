const { getPublicKey, getEventHash, getSignature } = require('nostr-tools');

let operatorPrivkey = null;
let operatorPubkey = null;
let publisher = null;

function configure({ operatorPrivkey: privkey, publishGeneric }) {
  operatorPrivkey = null;
  operatorPubkey = null;
  publisher = null;

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

function safeNumber(value) {
  if (value == null) {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
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

async function publishStakeLock({
  rideId,
  role,
  amount,
  participant,
  providerEvent,
  escrowId,
  currency = 'SAT',
  trustModel = 'unknown'
}) {
  const tags = [
    ['ride', rideId],
    ['event', 'stake_lock'],
    ['role', role],
    ['amount', String(amount || extractTagValue(providerEvent, 'amount') || 0)],
    ['currency', currency],
    ['trust_model', trustModel]
  ];
  if (participant) {
    tags.push(['participant', participant.toLowerCase()]);
  }
  const provider = extractTagValue(providerEvent, 'provider');
  if (provider) {
    tags.push(['provider', provider]);
  }
  const mechanism = extractTagValue(providerEvent, 'mechanism');
  if (mechanism) {
    tags.push(['mechanism', mechanism]);
  }
  if (escrowId) {
    tags.push(['escrow_id', String(escrowId)]);
  }
  if (providerEvent?.id) {
    tags.push(['provider_event', providerEvent.id]);
  }

  return publishEvent(30502, tags, serialiseProviderEvent(providerEvent));
}

async function publishStakeRelease({
  rideId,
  role,
  amount,
  providerEvent,
  reason = 'completed',
  currency = 'SAT',
  trustModel = 'unknown'
}) {
  const derivedAmount = amount || extractTagValue(providerEvent, 'amount') || 0;
  const tags = [
    ['ride', rideId],
    ['event', 'stake_release'],
    ['role', role],
    ['amount', String(derivedAmount)],
    ['currency', currency],
    ['trust_model', trustModel],
    ['reason', reason]
  ];
  if (providerEvent?.id) {
    tags.push(['provider_event', providerEvent.id]);
  }
  return publishEvent(30520, tags, serialiseProviderEvent(providerEvent));
}

async function publishStakePenalty({
  rideId,
  reason,
  penalty,
  refund,
  providerEvent,
  currency = 'SAT',
  trustModel = 'unknown'
}) {
  const tags = [
    ['ride', rideId],
    ['event', 'stake_penalty'],
    ['reason', reason || 'unspecified'],
    ['penalty', String(penalty || extractTagValue(providerEvent, 'penalty') || 0)],
    ['refund', String(refund || extractTagValue(providerEvent, 'refund') || 0)],
    ['currency', currency],
    ['trust_model', trustModel]
  ];
  if (providerEvent?.id) {
    tags.push(['provider_event', providerEvent.id]);
  }
  return publishEvent(30521, tags, serialiseProviderEvent(providerEvent));
}

async function publishStreamPayment({
  rideId,
  amount,
  totalPaid,
  fare,
  currency = 'SAT',
  trustModel = 'unknown'
}) {
  const tags = [
    ['ride', rideId],
    ['event', 'stream_payment'],
    ['amount', String(amount)],
    ['total', String(totalPaid)],
    ['fare', String(fare)],
    ['currency', currency],
    ['trust_model', trustModel],
    ['status', totalPaid >= fare ? 'settled' : 'in_progress']
  ];
  return publishEvent(30510, tags, '');
}

module.exports = {
  configure,
  canPublish,
  publishStakeLock,
  publishStakeRelease,
  publishStakePenalty,
  publishStreamPayment
};
