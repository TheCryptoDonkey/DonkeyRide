// nostr-tools' SimplePool needs a global WebSocket (absent on Node < 21).
// Guard here too so relay I/O works regardless of the entry point.
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = require('ws');
}

const { SimplePool, getEventHash, verifySignature, nip19 } = require('nostr-tools');
const { KINDS } = require('./kinds');

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

const RELAY_TIMEOUT_MS = parseInt(process.env.RELAY_TIMEOUT_MS || '5000', 10);

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      if (timer.unref) {
        timer.unref();
      }
    })
  ]);
}

async function safeList(relays, filters) {
  if (!relays.length) {
    return [];
  }
  try {
    // A relay that accepts the connection and never sends EOSE would
    // otherwise hang the request forever.
    return await withTimeout(pool.list(relays, filters), RELAY_TIMEOUT_MS, 'Relay list');
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
  const publishPromises = relays.map((relay) => {
    const trimmed = (relay || '').trim();
    if (!trimmed) {
      return Promise.resolve({ relay: trimmed, ok: false, error: 'Empty relay URI' });
    }
    if (trimmed.startsWith('memory://') || trimmed.startsWith('mock://success')) {
      return Promise.resolve({ relay: trimmed, ok: true, mock: true });
    }
    if (trimmed.startsWith('mock://fail')) {
      return Promise.resolve({ relay: trimmed, ok: false, error: 'Mock relay failure' });
    }
    return (async () => {
      // SimplePool.publish returns an array of publish promises
      const publishResults = pool.publish([trimmed], event);
      const tasks = Array.isArray(publishResults) ? publishResults : [publishResults];
      await withTimeout(Promise.all(tasks.map(p => Promise.resolve(p))), RELAY_TIMEOUT_MS, `Publish to ${trimmed}`);
      return { relay: trimmed, ok: true };
    })().catch((error) => ({
      relay: trimmed,
      ok: false,
      error: error?.message || String(error)
    }));
  });
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

/**
 * Keep only events whose signature verifies. Relay responses are untrusted
 * input — an aggregate built from unverified events is sybil-forgeable.
 */
function filterVerified(events) {
  return events.filter(evt => {
    try {
      return evt?.id === getEventHash(evt) && verifySignature(evt);
    } catch (error) {
      return false;
    }
  });
}

/**
 * One rating per (rater, task) pair — latest wins. Prevents a single
 * counterparty inflating or trashing a profile by re-publishing.
 */
function dedupeRatings(events) {
  const byKey = new Map();
  events.forEach(evt => {
    const taskTag = evt.tags.find(t => t[0] === 'ride' || t[0] === 'task_id');
    const key = `${evt.pubkey}:${taskTag?.[1] || evt.id}`;
    const existing = byKey.get(key);
    if (!existing || (evt.created_at || 0) > (existing.created_at || 0)) {
      byKey.set(key, evt);
    }
  });
  return Array.from(byKey.values());
}

function buildProfileResponse(hexKey, ratings, panicEvents) {
  let npub = null;
  try {
    npub = nip19.npubEncode(hexKey);
  } catch (error) {
    npub = hexKey;
  }
  const verifiedRatings = dedupeRatings(filterVerified(ratings));
  const verifiedPanic = filterVerified(panicEvents);
  const summary = {
    npub,
    pubkey: hexKey,
    averageRating: 0,
    ratingsCount: 0,
    distinctRaters: 0,
    lastRatingAt: null,
    panicCount: verifiedPanic.length,
    latestPanicAt: verifiedPanic.reduce((latest, evt) => Math.max(latest, evt.created_at || 0), 0) || null
  };

  if (verifiedRatings.length > 0) {
    const sum = verifiedRatings.reduce((total, evt) => {
      const ratingTag = evt.tags.find(t => t[0] === 'rating');
      const value = Number(ratingTag?.[1] || 0);
      return total + value;
    }, 0);
    summary.averageRating = Number((sum / verifiedRatings.length).toFixed(2));
    summary.ratingsCount = verifiedRatings.length;
    summary.distinctRaters = new Set(verifiedRatings.map(evt => evt.pubkey)).size;
    summary.lastRatingAt = verifiedRatings.reduce((latest, evt) => Math.max(latest, evt.created_at || 0), 0) || null;
  }

  // No-show reports: counterparty-signed rating events flagged no_show.
  // They stay IN the average (they carry rating 1 — a no-show is a bad
  // experience) and are additionally surfaced as a count. Mode A has no
  // custody, so no-show accountability is reputational, not financial.
  const noShowEvents = verifiedRatings.filter(evt =>
    evt.tags.some(t => t[0] === 'no_show' && t[1] === 'true'));
  summary.noShowCount = noShowEvents.length;
  summary.latestNoShowAt = noShowEvents.reduce(
    (latest, evt) => Math.max(latest, evt.created_at || 0), 0) || null;

  // Late cancellations: same shape, same trust model. Somebody committed and
  // then dropped, after the grace window and before the job began. Mode A
  // levies no fee — the record IS the accountability.
  const lateCancelEvents = verifiedRatings.filter(evt =>
    evt.tags.some(t => t[0] === 'late_cancel' && t[1] === 'true'));
  summary.lateCancelCount = lateCancelEvents.length;
  summary.latestLateCancelAt = lateCancelEvents.reduce(
    (latest, evt) => Math.max(latest, evt.created_at || 0), 0) || null;

  return summary;
}

async function fetchRatingEventsFor(npub, sinceSeconds) {
  const relays = getRelays();
  const filters = [{
    kinds: [KINDS.TASK_RATING],
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
    kinds: [KINDS.EMERGENCY_SIGNAL],
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

/**
 * Determine whether a role tag value represents the requester side or provider side.
 *
 * Recognises generic names ('requester', 'rider') and domain-specific names
 * ('customer', 'sender', etc.). If the role name is not recognised, falls back
 * to matching the event pubkey against task participants.
 *
 * @param {string} role - Role tag value from the rating/panic event
 * @param {string} eventPubkey - Hex pubkey of the event author (lowercase)
 * @param {Object} task - The task/ride object
 * @returns {'requester'|'provider'} Normalised side
 */
function resolveRoleSide(role, eventPubkey, task) {
  // Known requester-side role names (generic + all domain-specific requester roles)
  const requesterRoles = ['requester', 'rider', 'customer', 'sender'];
  // Known provider-side role names (generic + all domain-specific provider roles)
  const providerRoles = ['provider', 'driver', 'locksmith', 'courier'];

  if (requesterRoles.includes(role)) {
    return 'requester';
  }
  if (providerRoles.includes(role)) {
    return 'provider';
  }

  // Fallback: match event pubkey against task participants
  const requesterHex = (task?.requester?.pubkey || task?.rider?.pubkey || '').toLowerCase();
  const providerHex = (task?.provider?.pubkey || task?.driver?.pubkey || '').toLowerCase();

  if (eventPubkey === requesterHex) {
    return 'requester';
  }
  if (eventPubkey === providerHex) {
    return 'provider';
  }

  throw new Error('Unable to determine role side from event');
}

function enforceRideParticipation(eventPubkey, ride, role) {
  // Use generic fields first, fall back to legacy rider/driver fields
  const requesterHex = ride?.requester?.pubkey ? ride.requester.pubkey.toLowerCase()
    : ride?.rider?.pubkey ? ride.rider.pubkey.toLowerCase() : null;
  const requesterNpub = ride?.requester?.npub ? ride.requester.npub.toLowerCase()
    : ride?.rider?.npub ? ride.rider.npub.toLowerCase() : null;
  const providerHex = ride?.provider?.pubkey ? ride.provider.pubkey.toLowerCase()
    : ride?.driver?.pubkey ? ride.driver.pubkey.toLowerCase() : null;
  const providerNpub = ride?.provider?.npub ? ride.provider.npub.toLowerCase()
    : ride?.driver?.npub ? ride.driver.npub.toLowerCase() : null;

  const side = resolveRoleSide(role, eventPubkey, ride);

  if (side === 'requester') {
    if (requesterHex) {
      if (eventPubkey !== requesterHex) {
        throw new Error('Rating initiator does not match requester');
      }
    } else if (requesterNpub && resolveHexPubkey(requesterNpub) !== eventPubkey) {
      throw new Error('Rating initiator does not match requester');
    } else if (!requesterHex && !requesterNpub) {
      throw new Error('Missing requester identity for task');
    }
    if (!providerHex && !providerNpub) {
      throw new Error('Missing provider identity for task');
    }
    return {
      targetHex: providerHex || resolveHexPubkey(providerNpub),
      targetNpub: providerNpub || (providerHex && nip19?.npubEncode ? nip19.npubEncode(providerHex) : null),
      subjectHex: requesterHex || eventPubkey,
      subjectNpub: requesterNpub || (requesterHex && nip19?.npubEncode ? nip19.npubEncode(requesterHex) : null)
    };
  }

  // Provider side
  if (providerHex) {
    if (eventPubkey !== providerHex) {
      throw new Error('Rating initiator does not match provider');
    }
  } else if (providerNpub && resolveHexPubkey(providerNpub) !== eventPubkey) {
    throw new Error('Rating initiator does not match provider');
  } else if (!providerHex && !providerNpub) {
    throw new Error('Missing provider identity for task');
  }

  if (!requesterHex && !requesterNpub) {
    throw new Error('Missing requester identity for task');
  }

  return {
    targetHex: requesterHex || resolveHexPubkey(requesterNpub),
    targetNpub: requesterNpub || (requesterHex && nip19?.npubEncode ? nip19.npubEncode(requesterHex) : null),
    subjectHex: providerHex || eventPubkey,
    subjectNpub: providerNpub || (providerHex && nip19?.npubEncode ? nip19.npubEncode(providerHex) : null)
  };
}

function parseRatingEvent(event, ride) {
  ensureEventIntegrity(event);
  if (event.kind !== KINDS.TASK_RATING) {
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
  const role = roleTag?.[1] || 'requester';
  const { targetHex, targetNpub } = enforceRideParticipation(event.pubkey.toLowerCase(), ride, role);
  const targetTag = event.tags.find(t => t[0] === 'p');
  if (!targetTag) {
    throw new Error('Rating event target missing');
  }
  // p tags MUST be hex per NIP-01 — an npub here would pass validation but
  // make the event unqueryable via #p filters, silently breaking portability.
  if (!/^[0-9a-f]{64}$/i.test(targetTag[1] || '')) {
    throw new Error('Rating event p tag must be a hex pubkey');
  }
  const tagHex = resolveHexPubkey(targetTag[1]);
  if (!tagHex || tagHex !== targetHex) {
    throw new Error('Rating event target mismatch');
  }
  return { ratingValue, role, targetHex, targetNpub };
}

async function publishRating(event, ride) {
  const { ratingValue, role, targetHex, targetNpub } = parseRatingEvent(event, ride);
  const relayStatuses = await publishEvent(event);
  cacheLocalEvent('ratings', targetHex, event);
  clearCacheFor(targetHex);
  clearCacheFor(event.pubkey.toLowerCase());
  const cachedLocally = relayStatuses.length === 0 || !relayStatuses.some(status => status.ok);
  return {
    rating: ratingValue,
    role,
    targetHex,
    targetNpub,
    relayStatuses,
    cachedLocally
  };
}

function parsePanicEvent(event, ride) {
  ensureEventIntegrity(event);
  if (event.kind !== KINDS.EMERGENCY_SIGNAL) {
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
  const role = roleTag?.[1] || 'requester';
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

/**
 * Generic relay query with a timeout, for callers that need raw events
 * (e.g. the operator rehydrating its own state snapshots at boot).
 * Returns [] on failure — the caller decides how to degrade.
 */
async function queryEvents(filters) {
  return safeList(getRelays(), filters);
}

module.exports = {
  setRelays,
  getRelays,
  queryEvents,
  publishRating,
  publishPanic,
  getProfile,
  exportEvents,
  publishGeneric,
  clearCacheFor,
  ensureEventIntegrity,
  shutdown: () => {
    try {
      pool.close(getRelays());
    } catch (error) {
      console.warn('Failed to close reputation pool:', error.message);
    }
  }
};
