/**
 * An unset relay list must mean NOWHERE.
 *
 * This module used to fall back to ['wss://relay.damus.io',
 * 'wss://relay.nostr.band'] whenever nothing was configured, so an unset —
 * or explicitly emptied — variable published operator-signed events, which
 * carry other people's coordination state, to two of the largest public
 * relays. `NOSTR_RELAY=''` is the obvious way to say "no relays" and it
 * selected the fallback; the test suite set exactly that, and duly shipped
 * signed task snapshots to relay.damus.io on every run.
 *
 * A default destination nobody chose is not a default, it is a leak.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const reputation = require('../../src/nostr/reputation');

const KNOWN_PUBLIC_RELAYS = [
  'relay.damus.io', 'relay.nostr.band', 'nos.lol', 'nostr.wine', 'relay.snort.social'
];

test('an empty relay list stays empty', () => {
  reputation.setRelays([]);
  assert.deepEqual(reputation.getRelays(), []);
});

test('blank and whitespace entries do not conjure a relay', () => {
  reputation.setRelays(['', '   ', null, undefined]);
  assert.deepEqual(reputation.getRelays(), [], 'a list of nothings is still nothing');
});

test('no third-party relay is ever reachable without being named', () => {
  reputation.setRelays([]);
  const configured = reputation.getRelays().join(' ');
  for (const host of KNOWN_PUBLIC_RELAYS) {
    assert.ok(
      !configured.includes(host),
      `${host} must never appear unless an operator asked for it`
    );
  }
});

test('configured relays are used verbatim', () => {
  reputation.setRelays(['ws://localhost:7777', ' wss://relay.example.com ']);
  assert.deepEqual(
    reputation.getRelays(),
    ['ws://localhost:7777', 'wss://relay.example.com']
  );
});

test('publishing with no relays configured reaches nothing and throws nothing', async () => {
  reputation.setRelays([]);
  // publishGeneric requires a well-formed signed event; the relay dispatch
  // it wraps is what we care about here.
  const { generatePrivateKey, getPublicKey, getEventHash, getSignature } = require('nostr-tools');
  const priv = generatePrivateKey();
  const event = {
    kind: 30078,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['d', 'ride_x']],
    content: 'sealed',
    pubkey: getPublicKey(priv)
  };
  event.id = getEventHash(event);
  event.sig = getSignature(event, priv);

  const result = await reputation.publishGeneric(event);
  assert.deepEqual(result.relayStatuses, [], 'nothing was dispatched anywhere');
  assert.equal(result.cachedLocally, true, 'and the caller is told it went nowhere');
});
