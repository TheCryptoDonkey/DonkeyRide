const { SimplePool, getEventHash, verifySignature, nip19 } = require('nostr-tools');

const DEFAULT_RELAYS = (process.env.REPUTATION_RELAYS || process.env.NOSTR_RELAYS || '').split(',').map(r => r.trim()).filter(Boolean);
const FALLBACK_RELAYS = ['wss://relay.damus.io', 'wss://relay.nostr.band'];
const STRICT_RELAY_MODE = (process.env.REPUTATION_STRICT || '').toLowerCase() === 'true';

const pool = new SimplePool();
const relaySet = new Set(DEFAULT_RELAYS.length ? DEFAULT_RELAYS : FALLBACK_RELAYS);
const profileCache = new Map();
const CACHE_DURATION_MS = parseInt(process.env.REPUTATION_CACHE_MS || '30000', 10);
const MAX_EVENT_AGE_SECONDS = parseInt(process.env.REPUTATION_EVENT_MAX_AGE || '86400', 10);

const localBuffers = {
  ratings: new Map(), // targetPubkeyHex -> Map<eventId, event>
  panic: new Map(),   // authorPubkeyHex -> Map<eventId, event>
  generic: new Map()  // authorPubkeyHex -> Map<eventId, event>
};

function cacheLocalEvent(bucket, key, event) {
  if (!bucket || !key || !event?.id) {
    return;
  }
  const lowerKey = key.toLowerCase();
  const store = localBuffers[bucket];
  if (!store) {
    return;
  }
  if (!store.has(lowerKey)) {
    store.set(lowerKey, new Map());
  }
  store.get(lowerKey).set(event.id, event);
}

function getLocalEvents(bucket, key, sinceSeconds) {
  if (!bucket || !key) {
    return [];
  }
  const store = localBuffers[bucket];
  if (!store) {
    return [];
  }
  const map = store.get(key.toLowerCase());
  if (!map) {
    return [];
  }
  const minTimestamp = typeof sinceSeconds === 'number' ? sinceSeconds : null;
  return Array.from(map.values()).filter(evt => {
    if (minTimestamp != null && typeof evt.created_at === 'number') {
      return evt.created_at >= minTimestamp;
    }
    return true;
  });
}

function purgeLocalEvent(eventId) {
  if (!eventId) {
    return;
  }
  Object.values(localBuffers).forEach(store => {
    store.forEach(eventMap => {
      eventMap.delete(eventId);
    });
  });
}

function mergeEvents(primary = [], secondary = []) {
  const merged = new Map();
  primary.forEach(evt => {
    if (evt?.id) {
      merged.set(evt.id, evt);
    }
  });
  secondary.forEach(evt => {
    if (evt?.id && !merged.has(evt.id)) {
      merged.set(evt.id, evt);
    }
  });
  return Array.from(merged.values()).sort((a, b) => (b?.created_at || 0) - (a?.created_at || 0));
}

async function safeList(relays, filters) {
  if (!relays.length) {
    return [];
  }
  try {
    return await pool.list(relays, filters);
  } catch (error) {
    console.warn('Reputation relay list failed, using local cache only:', error.message);
    return [];
  }
}

function setRelays(relays = []) {
  relaySet.clear();
  const cleaned = relays.map(r => (r || '').trim()).filter(Boolean);
  if (cleaned.length) {
    cleaned.forEach(r => relaySet.add(r));
  } else {
    FALLBACK_RELAYS.forEach(r => relaySet.add(r));
  }
}

function getRelays() {
  if (relaySet.size === 0) {
    FALLBACK_RELAYS.forEach(r => relaySet.add(r));
  }
  return Array.from(relaySet);
}

function resolveHexPubkey(value) {
  if (!value || typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (trimmed.startsWith('npub')) {
    try {
      const decoded = nip19.decode(trimmed);
      if (typeof decoded.data === 'string') {
        return decoded.data.toLowerCase();
      }
      if (decoded.data?.type === 'npub' && typeof decoded.data.data === 'string') {
        return decoded.data.data.toLowerCase();
      }
    } catch (error) {
      throw new Error('Invalid npub');
    }
  }
  return trimmed.toLowerCase();
}

function ensureEventIntegrity(event) {
  if (!event || typeof event !== 'object') {
    throw new Error('Missing event payload');
  }
  if (typeof event.kind !== 'number') {
    throw new Error('Event kind required');
  }
  if (!event.pubkey) {
    throw new Error('Event pubkey required');
  }
  if (!Array.isArray(event.tags)) {
    throw new Error('Event tags array required');
  }
  if (!event.created_at) {
    throw new Error('Event created_at required');
  }
  const computedId = getEventHash(event);
  if (event.id !== computedId) {
    throw new Error('Event id does not match hash');
  }
  if (!verifySignature(event)) {
    throw new Error('Invalid event signature');
  }
}

async function dispatchToRelays(event) {
  const relays = getRelays();
  if (!relays.length) {
    return [];
  }
  const publishPromises = relays.map((relay) =>
    pool.publish(relay, event).then(
      () => ({ relay, ok: true }),
      (error) => ({ relay, ok: false, error: error?.message || String(error) })
    )
  );
  const results = await Promise.all(publishPromises);
  return results;
}

async function publishEvent(event) {
  const statuses = await dispatchToRelays(event);
  const successCount = statuses.filter(status => status.ok).length;
  if (successCount === 0 && STRICT_RELAY_MODE) {
    const reasons = statuses.map(result => `${result.relay}: ${result.error || 'unknown error'}`).filter(Boolean).join('; ');
    throw new Error(`Failed to publish event to relays${reasons ? `: ${reasons}` : ''}`);
  }
  if (successCount === 0 && statuses.length === 0) {
    console.warn('No reputation relays configured — storing event locally only');
  } else if (successCount === 0) {
    console.warn('Reputation event stored locally — all relay publishes failed');
  }
  return statuses;
}

function buildProfileResponse(hexKey, ratings, panicEvents) {
  let npub = null;
  try {
    npub = nip19.npubEncode(hexKey);
  } catch (error) {
    npub = hexKey;
  }
  const summary = {
    npub,
    pubkey: hexKey,
    averageRating: 0,
    ratingsCount: 0,
    lastRatingAt: null,
    panicCount: panicEvents.length,
    latestPanicAt: panicEvents.reduce((latest, evt) => Math.max(latest, evt.created_at || 0), 0) || null
  };

  if (ratings.length > 0) {
    const sum = ratings.reduce((total, evt) => {
      const ratingTag = evt.tags.find(t => t[0] === 'rating');
      const value = Number(ratingTag?.[1] || 0);
      return total + value;
    }, 0);
    summary.averageRating = Number((sum / ratings.length).toFixed(2));
    summary.ratingsCount = ratings.length;
    summary.lastRatingAt = ratings.reduce((latest, evt) => Math.max(latest, evt.created_at || 0), 0) || null;
  }

  return summary;
}

async function fetchRatingEventsFor(npub, sinceSeconds) {
  const relays = getRelays();
  const filters = [{
    kinds: [30530],
    '#p': [npub],
    since: sinceSeconds || undefined,
    limit: parseInt(process.env.REPUTATION_RATING_LIMIT || '200', 10)
  }];
  const remoteEvents = await safeList(relays, filters);
  const localEvents = getLocalEvents('ratings', npub, sinceSeconds);
  return mergeEvents(remoteEvents, localEvents);
}

async function fetchPanicEventsFor(npub, sinceSeconds) {
  const relays = getRelays();
  const filters = [{
    kinds: [30560],
    authors: [npub],
    since: sinceSeconds || undefined,
    limit: parseInt(process.env.REPUTATION_PANIC_LIMIT || '100', 10)
  }];
  const remoteEvents = await safeList(relays, filters);
  const localEvents = getLocalEvents('panic', npub, sinceSeconds);
  return mergeEvents(remoteEvents, localEvents);
}

function clearCacheFor(npubOrHex) {
  const hexKey = resolveHexPubkey(npubOrHex);
  if (hexKey) {
    profileCache.delete(hexKey);
  }
}

async function getProfile(npubOrHex) {
  const hexKey = resolveHexPubkey(npubOrHex);
  if (!hexKey) {
    throw new Error('Invalid npub');
  }

  const cached = profileCache.get(hexKey);
  if (cached && cached.expires > Date.now()) {
    return cached.profile;
  }

  const ratings = await fetchRatingEventsFor(hexKey);
  const panicEvents = await fetchPanicEventsFor(hexKey);
  const profile = buildProfileResponse(hexKey, ratings, panicEvents);
  profileCache.set(hexKey, {
    expires: Date.now() + CACHE_DURATION_MS,
    profile
  });
  return profile;
}

async function exportEvents(npubOrHex, sinceMillis) {
  const hexKey = resolveHexPubkey(npubOrHex);
  if (!hexKey) {
    throw new Error('Invalid npub');
  }
  const sinceSeconds = sinceMillis ? Math.floor(Number(sinceMillis) / 1000) : undefined;
  const ratings = await fetchRatingEventsFor(hexKey, sinceSeconds);
  const panicEvents = await fetchPanicEventsFor(hexKey, sinceSeconds);
  return {
    ratings,
    panic: panicEvents
  };
}

function enforceRideParticipation(eventPubkey, ride, role) {
  const riderNpub = ride?.rider?.npub ? ride.rider.npub.toLowerCase() : null;
  const driverNpub = ride?.driver?.npub ? ride.driver.npub.toLowerCase() : null;
  if (role === 'rider') {
    if (!riderNpub || riderNpub !== eventPubkey) {
      throw new Error('Rating initiator does not match rider');
    }
    if (!driverNpub) {
      throw new Error('Missing driver npub for ride');
    }
    return { target: driverNpub, subject: riderNpub };
  }
  if (!driverNpub || driverNpub !== eventPubkey) {
    throw new Error('Rating initiator does not match driver');
  }
  if (!riderNpub) {
    throw new Error('Missing rider npub for ride');
  }
  return { target: riderNpub, subject: driverNpub };
}

function parseRatingEvent(event, ride) {
  ensureEventIntegrity(event);
  if (event.kind !== 30530) {
    throw new Error('Invalid rating event kind');
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - event.created_at) > MAX_EVENT_AGE_SECONDS) {
    throw new Error('Rating event timestamp out of range');
  }
  const rideTag = event.tags.find(t => t[0] === 'ride');
  if (!rideTag || rideTag[1] !== ride.id) {
    throw new Error('Rating event ride tag mismatch');
  }
  const ratingTag = event.tags.find(t => t[0] === 'rating');
  const ratingValue = Number(ratingTag?.[1]);
  if (!Number.isFinite(ratingValue) || ratingValue < 1 || ratingValue > 5) {
    throw new Error('Rating value must be between 1 and 5');
  }
  const roleTag = event.tags.find(t => t[0] === 'role');
  const role = roleTag?.[1] === 'driver' ? 'driver' : 'rider';
  const { target } = enforceRideParticipation(event.pubkey.toLowerCase(), ride, role);
  const targetTag = event.tags.find(t => t[0] === 'p');
  if (!targetTag || targetTag[1].toLowerCase() !== target) {
    throw new Error('Rating event target mismatch');
  }
  return { ratingValue, role, targetNpub: target };
}

async function publishRating(event, ride) {
  const { ratingValue, role, targetNpub } = parseRatingEvent(event, ride);
  const relayStatuses = await publishEvent(event);
  cacheLocalEvent('ratings', targetNpub, event);
  clearCacheFor(targetNpub);
  clearCacheFor(event.pubkey.toLowerCase());
  const cachedLocally = relayStatuses.length === 0 || !relayStatuses.some(status => status.ok);
  return { rating: ratingValue, role, target: targetNpub, relayStatuses, cachedLocally };
}

function parsePanicEvent(event, ride) {
  ensureEventIntegrity(event);
  if (event.kind !== 30560) {
    throw new Error('Invalid panic event kind');
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - event.created_at) > MAX_EVENT_AGE_SECONDS) {
    throw new Error('Panic event timestamp out of range');
  }
  const rideTag = event.tags.find(t => t[0] === 'ride');
  if (!rideTag || rideTag[1] !== ride.id) {
    throw new Error('Panic event ride tag mismatch');
  }
  const roleTag = event.tags.find(t => t[0] === 'role');
  const role = roleTag?.[1] === 'driver' ? 'driver' : 'rider';
  enforceRideParticipation(event.pubkey.toLowerCase(), ride, role);
  return { role };
}

async function publishPanic(event, ride) {
  const { role } = parsePanicEvent(event, ride);
  const relayStatuses = await publishEvent(event);
  cacheLocalEvent('panic', event.pubkey, event);
  clearCacheFor(event.pubkey.toLowerCase());
  const cachedLocally = relayStatuses.length === 0 || !relayStatuses.some(status => status.ok);
  return { role, relayStatuses, cachedLocally };
}

async function publishGeneric(event, expectedPubkey) {
  ensureEventIntegrity(event);
  if (expectedPubkey && event.pubkey.toLowerCase() !== resolveHexPubkey(expectedPubkey)) {
    throw new Error('Event pubkey mismatch');
  }
  const relayStatuses = await publishEvent(event);
  cacheLocalEvent('generic', event.pubkey, event);
  event.tags
    .filter(tag => tag[0] === 'e' && tag[1])
    .forEach(([, targetId]) => purgeLocalEvent(targetId));
  clearCacheFor(event.pubkey.toLowerCase());
  const cachedLocally = relayStatuses.length === 0 || !relayStatuses.some(status => status.ok);
  return { relayStatuses, cachedLocally };
}

module.exports = {
  setRelays,
  getRelays,
  publishRating,
  publishPanic,
  getProfile,
  exportEvents,
  publishGeneric,
  clearCacheFor
};
