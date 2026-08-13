const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generatePrivateKey, validateEvent, verifySignature } = require('nostr-tools');

const operatorAnnounce = require('../../src/nostr/operator-announce');

test('signed operator announcement carries the public policy contract', async () => {
  let published = null;
  operatorAnnounce.configure({
    operatorPrivkey: generatePrivateKey(),
    publishGeneric: async (event) => { published = event; },
  });

  const event = await operatorAnnounce.publishAnnouncement({
    name: 'Example Cars',
    domains: ['ridesharing'],
    serviceUrl: 'https://rides.example',
    publicRelays: ['wss://relay.example'],
    policy: {
      schema: 'org.donkeyride.operator-policy/v1',
      mode: 'regulated',
      admission: { mode: 'allowlist' },
      records: { mode: 'durable' },
      termsUrl: 'https://rides.example/terms',
      privacyUrl: 'https://rides.example/privacy',
    },
  });

  assert.equal(event, published);
  assert.equal(validateEvent(event), true);
  assert.equal(verifySignature(event), true);
  const value = (name) => event.tags.find((tag) => tag[0] === name)?.[1];
  assert.equal(value('service_url'), 'https://rides.example');
  assert.equal(value('policy_schema'), 'org.donkeyride.operator-policy/v1');
  assert.equal(value('policy_mode'), 'regulated');
  assert.equal(value('admission'), 'allowlist');
  assert.equal(value('record_mode'), 'durable');
  assert.equal(value('terms_url'), 'https://rides.example/terms');
  assert.equal(value('privacy_url'), 'https://rides.example/privacy');
});
