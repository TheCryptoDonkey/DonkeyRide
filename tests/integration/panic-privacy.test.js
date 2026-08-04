/**
 * A panic alert is the one event where getting privacy wrong is dangerous
 * rather than merely regrettable.
 *
 * Kind 30540 is public and permanent, so exact coordinates on one broadcast
 * precisely where a frightened person is standing — to everyone, for ever,
 * including whoever they are frightened of. The public event carries a
 * geohash cell; exact position travels encrypted to the rider's guardians
 * and over the participant-gated task socket.
 *
 * It is also ADDRESSABLE. Without a `d` tag every alert a person raises
 * shares d="" and each new one replaces the last, so a relay ends up
 * holding one panic per person rather than one per incident — while the
 * reputation aggregator queries for up to 100 of them.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  generatePrivateKey, getPublicKey, getEventHash, getSignature, nip19
} = require('nostr-tools');

const reputation = require('../../src/nostr/reputation');
const { KINDS } = require('../../src/nostr/kinds');
const { encodeGeohash } = require('../../src/utils/geohash');

const riderPriv = generatePrivateKey();
const riderPub = getPublicKey(riderPriv);
const driverPriv = generatePrivateKey();
const driverPub = getPublicKey(driverPriv);

const RIDE = {
  id: 'ride_panic1',
  requester: { pubkey: riderPub, npub: nip19.npubEncode(riderPub) },
  provider: { pubkey: driverPub, npub: nip19.npubEncode(driverPub) }
};

const EXACT = { lat: 53.47741, lng: -2.23094 };

function signPanic(tags) {
  const event = {
    kind: KINDS.EMERGENCY_SIGNAL,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: 'panic',
    pubkey: riderPub
  };
  event.id = getEventHash(event);
  event.sig = getSignature(event, riderPriv);
  return event;
}

test('a coarse panic is published to relays', async () => {
  reputation.setRelays(['mock://success']);

  const event = signPanic([
    ['d', RIDE.id],
    ['ride', RIDE.id],
    ['role', 'rider'],
    ['g', encodeGeohash(EXACT.lat, EXACT.lng, 5)]
  ]);

  const result = await reputation.publishPanic(event, RIDE);

  assert.equal(result.role, 'rider');
  assert.ok(!result.withheldForLocation, 'nothing to withhold');
  assert.ok(
    result.relayStatuses.some((s) => s.ok),
    'the alert reaches relays — being publicly attached to the pubkey is the point'
  );
});

test('a panic carrying exact coordinates is NOT relayed, but still succeeds', async () => {
  reputation.setRelays(['mock://success']);

  const event = signPanic([
    ['d', RIDE.id],
    ['ride', RIDE.id],
    ['role', 'rider'],
    ['location', JSON.stringify({ lat: EXACT.lat, lng: EXACT.lng })]
  ]);

  const result = await reputation.publishPanic(event, RIDE);

  // The safety path must never fail because of a privacy rule: the alert is
  // still recorded and still reaches the counterparty over the task socket.
  assert.equal(result.role, 'rider', 'the panic is still processed');
  assert.equal(result.withheldForLocation, true);
  assert.deepEqual(result.relayStatuses, [], 'nothing went to a relay');
});

test('an unparseable location tag is treated as unsafe', async () => {
  reputation.setRelays(['mock://success']);

  const event = signPanic([
    ['d', RIDE.id],
    ['ride', RIDE.id],
    ['role', 'rider'],
    ['location', '53.47741,-2.23094']
  ]);

  const result = await reputation.publishPanic(event, RIDE);
  assert.equal(result.withheldForLocation, true, 'fail closed on anything we cannot vet');
});

test('a geohash cell is coarse enough to be a district, not a doorway', () => {
  const cell = encodeGeohash(EXACT.lat, EXACT.lng, 5);
  assert.equal(cell.length, 5);

  const { decodeGeohash } = require('../../src/utils/geohash');
  const centre = decodeGeohash(cell);
  const metres = Math.hypot(
    (centre.lat - EXACT.lat) * 111320,
    (centre.lon - EXACT.lng) * 111320 * Math.cos(EXACT.lat * Math.PI / 180)
  );
  assert.ok(metres > 500, `precision 5 must not pinpoint anyone (was ${Math.round(metres)}m)`);
});
