/**
 * What the operator actually leaves on a public relay.
 *
 * The kind 30078 state snapshot is the operator's durability layer, and it
 * has exactly ONE reader: this operator, rehydrating at boot. Published in
 * the clear it was also a public, permanent record of which pubkey went
 * from which ~1 km cell to which, when, and for how much — indexed per
 * person by `p` tag. These tests pin the fix: opaque on the wire, readable
 * to us, and useless to anyone else.
 *
 * The previous version of this check read `ride.snapshot` off the HTTP ride
 * detail. No such field exists, so it asserted against `{}` and passed no
 * matter what was published. Here we inspect the real signed event.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generatePrivateKey, getPublicKey, verifySignature } = require('nostr-tools');

const operatorAnnounce = require('../../src/nostr/operator-announce');
const { encodeGeohash } = require('../../src/utils/geohash');

const OPERATOR_PRIV = generatePrivateKey();
const OPERATOR_PUB = getPublicKey(OPERATOR_PRIV);
const RIDER_PUB = 'a'.repeat(64);
const DRIVER_PUB = 'b'.repeat(64);

// Manchester Piccadilly → Salford Quays, at the precision the server uses
const PICKUP_CELL = encodeGeohash(53.47741, -2.23094, 6);
const DROPOFF_CELL = encodeGeohash(53.4711, -2.2936, 6);

function captureOperator() {
  const published = [];
  operatorAnnounce.configure({
    operatorPrivkey: OPERATOR_PRIV,
    publishGeneric: async (event) => {
      published.push(event);
      return { relayStatuses: [{ relay: 'capture://', ok: true }] };
    }
  });
  return published;
}

/** The shape server.js's buildTaskSnapshot produces for a matched ride */
function snapshotBody() {
  return {
    taskId: 'ride_abc123',
    expirationSeconds: Math.floor(Date.now() / 1000) + 3600,
    content: {
      participants: [
        { pubkey: RIDER_PUB, role: 'requester' },
        { pubkey: DRIVER_PUB, role: 'provider' }
      ],
      status: 'matched',
      domain: 'ridesharing',
      requester: { pubkey: RIDER_PUB, npub: 'npub1rider' },
      provider: { pubkey: DRIVER_PUB, npub: 'npub1driver' },
      fare: 22250,
      currency: 'GBP',
      geohashPickup: PICKUP_CELL,
      geohashDropoff: DROPOFF_CELL,
      timestamps: { requested: 1785789102593, matched: 1785789102599 }
    }
  };
}

test('a published snapshot names nobody and locates nothing', async () => {
  const published = captureOperator();
  const event = await operatorAnnounce.publishTaskSnapshot(snapshotBody());

  assert.ok(event, 'a snapshot is published');
  assert.equal(published.length, 1);
  assert.ok(verifySignature(event), 'snapshot must be operator-signed');

  // Tags: addressability and relay hygiene, nothing more.
  const tagNames = event.tags.map((t) => t[0]).sort();
  assert.deepEqual(tagNames, ['d', 'expiration']);
  assert.equal(event.tags.find((t) => t[0] === 'd')[1], 'ride_abc123');

  // The whole event, tags included, must not carry any of this.
  const wire = JSON.stringify(event);
  for (const secret of [
    RIDER_PUB, DRIVER_PUB, 'npub1rider', 'npub1driver',
    PICKUP_CELL, DROPOFF_CELL, 'matched', 'ridesharing', '22250', 'GBP'
  ]) {
    assert.ok(
      !wire.includes(secret),
      `the wire format must not disclose ${secret}`
    );
  }
});

test('the operator can read back what it sealed', async () => {
  captureOperator();
  const event = await operatorAnnounce.publishTaskSnapshot(snapshotBody());

  const opened = operatorAnnounce.openSnapshot(event.content);
  assert.ok(opened, 'the operator opens its own snapshot');
  assert.equal(opened.status, 'matched');
  assert.equal(opened.domain, 'ridesharing');
  assert.equal(opened.fare, 22250);
  assert.equal(opened.geohashPickup, PICKUP_CELL);
  assert.equal(opened.requester.pubkey, RIDER_PUB);
  assert.equal(opened.provider.pubkey, DRIVER_PUB);
});

test('nobody else can — including a relay holding the event', async () => {
  captureOperator();
  const event = await operatorAnnounce.publishTaskSnapshot(snapshotBody());
  const sealed = event.content;

  // Reconfigure as a DIFFERENT operator and try to open it.
  operatorAnnounce.configure({
    operatorPrivkey: generatePrivateKey(),
    publishGeneric: async () => ({ relayStatuses: [] })
  });

  assert.equal(
    operatorAnnounce.openSnapshot(sealed), null,
    'a snapshot sealed to one operator must be opaque to every other'
  );
});

test('an unopenable snapshot is skipped, never trusted as plaintext', async () => {
  captureOperator();

  // What a pre-sealing operator used to publish: readable JSON.
  const legacy = JSON.stringify(snapshotBody().content);
  assert.equal(
    operatorAnnounce.openSnapshot(legacy), null,
    'legacy plaintext must not be accepted on rehydration'
  );
  assert.equal(operatorAnnounce.openSnapshot(''), null);
  assert.equal(operatorAnnounce.openSnapshot('not base64 at all'), null);
});

test('with no operator key, no snapshot is published at all', async () => {
  const published = [];
  operatorAnnounce.configure({ operatorPrivkey: null, publishGeneric: null });

  const event = await operatorAnnounce.publishTaskSnapshot(snapshotBody());

  assert.equal(event, null, 'never degrade to an unsealed snapshot');
  assert.equal(published.length, 0);
});

test('the operator can still find its own snapshots on a relay', async () => {
  const published = captureOperator();
  await operatorAnnounce.publishTaskSnapshot(snapshotBody());
  const [event] = published;

  // Rehydration queries {kinds:[30078], authors:[operatorPubkey]} and reads
  // the task id off the `d` tag — both survive sealing, which is the whole
  // point: durability intact, disclosure gone.
  assert.equal(event.kind, 30078);
  assert.equal(event.pubkey, OPERATOR_PUB);
  assert.equal(event.tags.find((t) => t[0] === 'd')[1], 'ride_abc123');
});
