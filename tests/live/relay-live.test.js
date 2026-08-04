/**
 * Live relay behaviour, against a REAL relay.
 *
 * The integration suite proves the snapshot is sealed by inspecting the
 * event we build. It cannot prove a relay accepts it, stores it, hands it
 * back intact, or honours the NIP-40 expiry we rely on — that is mocked by
 * absence. This file closes that gap against infrastructure we control.
 *
 *   LIVE_RELAY_URL=wss://relay.trotters.cc npm run test:live
 *
 * SKIPPED unless LIVE_RELAY_URL is set, so it stays inert in CI and in the
 * default `npm test` (whose glob would otherwise pick it up).
 *
 * It leaves no residue: a THROWAWAY operator key per run, so nothing lands
 * in the real operator's namespace; a unique task id; a 120-second NIP-40
 * expiry; and an explicit tombstone in `after`. Never point this at a relay
 * you do not control.
 */

require('../helpers/isolate-relays');

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  generatePrivateKey, getPublicKey, getEventHash, getSignature
} = require('nostr-tools');

if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = require('ws');
}
const WebSocket = require('ws');

const operatorAnnounce = require('../../src/nostr/operator-announce');
const { encodeGeohash } = require('../../src/utils/geohash');

const RELAY = process.env.LIVE_RELAY_URL || '';
const skip = RELAY ? false : 'set LIVE_RELAY_URL to run (e.g. wss://relay.trotters.cc)';

// Throwaway operator identity — this run's events belong to nobody.
const OPERATOR_PRIV = generatePrivateKey();
const OPERATOR_PUB = getPublicKey(OPERATOR_PRIV);
const TASK_ID = `livetest_${Date.now().toString(36)}_${Math.floor(process.hrtime()[1] / 1000)}`;
const TTL_SECONDS = 120;

const RIDER_PUB = 'a'.repeat(64);
const DRIVER_PUB = 'b'.repeat(64);
const PICKUP_CELL = encodeGeohash(53.47741, -2.23094, 6);

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(RELAY);
    const timer = setTimeout(() => { try { ws.close(); } catch { /* */ } reject(new Error('connect timeout')); }, 15000);
    ws.on('open', () => { clearTimeout(timer); resolve(ws); });
    ws.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

/** Publish one event, resolve the relay's OK frame */
async function publish(event) {
  const ws = await connect();
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('publish timeout')), 15000);
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw);
          if (msg[0] === 'OK' && msg[1] === event.id) {
            clearTimeout(timer);
            resolve({ accepted: msg[2], reason: msg[3] || '' });
          }
        } catch { /* ignore */ }
      });
      ws.send(JSON.stringify(['EVENT', event]));
    });
  } finally {
    try { ws.close(); } catch { /* */ }
  }
}

/** Query, resolve on EOSE */
async function query(filter) {
  const ws = await connect();
  try {
    return await new Promise((resolve, reject) => {
      const found = [];
      const timer = setTimeout(() => reject(new Error('query timeout')), 15000);
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw);
          if (msg[0] === 'EVENT') found.push(msg[2]);
          if (msg[0] === 'EOSE') { clearTimeout(timer); resolve(found); }
        } catch { /* ignore */ }
      });
      ws.send(JSON.stringify(['REQ', 'live', filter]));
    });
  } finally {
    try { ws.close(); } catch { /* */ }
  }
}

function snapshotBody() {
  return {
    taskId: TASK_ID,
    expirationSeconds: Math.floor(Date.now() / 1000) + TTL_SECONDS,
    content: {
      participants: [
        { pubkey: RIDER_PUB, role: 'requester' },
        { pubkey: DRIVER_PUB, role: 'provider' }
      ],
      status: 'matched',
      domain: 'ridesharing',
      requester: { pubkey: RIDER_PUB, npub: 'npub1livetestrider' },
      provider: { pubkey: DRIVER_PUB, npub: 'npub1livetestdriver' },
      fare: 22250,
      currency: 'GBP',
      geohashPickup: PICKUP_CELL,
      geohashDropoff: encodeGeohash(53.4711, -2.2936, 6),
      timestamps: { requested: Date.now() }
    }
  };
}

let publishedEvent = null;

after(async () => {
  if (!RELAY || !publishedEvent) return;
  // Supersede with an empty, near-expiry event and ask for deletion. The
  // expiry must be in the FUTURE — strfry rejects an already-expired event
  // outright, so a back-dated tombstone never lands.
  try {
    const now = Math.floor(Date.now() / 1000);
    const tombstone = { kind: 30078, created_at: now, tags: [['d', TASK_ID], ['expiration', String(now + 60)]], content: '', pubkey: OPERATOR_PUB };
    tombstone.id = getEventHash(tombstone);
    tombstone.sig = getSignature(tombstone, OPERATOR_PRIV);
    await publish(tombstone);

    const del = { kind: 5, created_at: now, tags: [['a', `30078:${OPERATOR_PUB}:${TASK_ID}`], ['e', publishedEvent.id]], content: 'live test cleanup', pubkey: OPERATOR_PUB };
    del.id = getEventHash(del);
    del.sig = getSignature(del, OPERATOR_PRIV);
    await publish(del);
  } catch (err) {
    console.warn(`live test cleanup failed (events expire in ${TTL_SECONDS}s anyway):`, err.message);
  }
});

test('a real relay accepts a sealed snapshot', { skip }, async () => {
  operatorAnnounce.configure({
    operatorPrivkey: OPERATOR_PRIV,
    publishGeneric: async (event) => {
      const { accepted, reason } = await publish(event);
      assert.ok(accepted, `relay rejected the snapshot: ${reason}`);
      return { relayStatuses: [{ relay: RELAY, ok: true }] };
    }
  });

  publishedEvent = await operatorAnnounce.publishTaskSnapshot(snapshotBody());
  assert.ok(publishedEvent, 'a snapshot was built and published');
  assert.equal(publishedEvent.kind, 30078);
});

test('what the relay hands back discloses nothing', { skip }, async () => {
  const events = await query({ authors: [OPERATOR_PUB], kinds: [30078], limit: 10 });
  assert.equal(events.length, 1, 'the relay stored exactly our snapshot');

  const [stored] = events;
  const wire = JSON.stringify(stored);
  for (const secret of [
    RIDER_PUB, DRIVER_PUB, 'npub1livetestrider', 'npub1livetestdriver',
    PICKUP_CELL, 'matched', 'ridesharing', '22250', 'GBP'
  ]) {
    assert.ok(!wire.includes(secret), `a relay round trip must not expose ${secret}`);
  }
  assert.deepEqual(stored.tags.map((t) => t[0]).sort(), ['d', 'expiration']);
});

test('and the operator can still rehydrate from it', { skip }, async () => {
  // Exactly what rehydrateFromNostr does: find by author, read the d tag,
  // open the content. If this passes, durability survives sealing on real
  // infrastructure, not just in a unit test.
  const [stored] = await query({ authors: [OPERATOR_PUB], kinds: [30078], limit: 10 });

  const taskId = (stored.tags.find((t) => t[0] === 'd') || [])[1];
  assert.equal(taskId, TASK_ID);

  const opened = operatorAnnounce.openSnapshot(stored.content);
  assert.ok(opened, 'the operator opens its own snapshot after a relay round trip');
  assert.equal(opened.status, 'matched');
  assert.equal(opened.fare, 22250);
  assert.equal(opened.geohashPickup, PICKUP_CELL);
  assert.equal(opened.requester.pubkey, RIDER_PUB);
});

test('a snapshot sealed to another operator stays shut', { skip }, async () => {
  const [stored] = await query({ authors: [OPERATOR_PUB], kinds: [30078], limit: 10 });

  operatorAnnounce.configure({
    operatorPrivkey: generatePrivateKey(),
    publishGeneric: async () => ({ relayStatuses: [] })
  });
  assert.equal(
    operatorAnnounce.openSnapshot(stored.content), null,
    'a relay operator holding the event learns nothing from it'
  );
});
