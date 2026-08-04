#!/usr/bin/env node
/**
 * Purge plaintext kind 30078 snapshots this operator published before
 * snapshots were sealed.
 *
 * Nothing on a relay can be forcibly deleted, so this uses both mechanisms
 * a relay might honour, newest-wins first:
 *
 *   1. SUPERSEDE — republish each task id as a kind 30078 with the same `d`
 *      tag, empty content and an expiration in the past. Kind 30078 is
 *      ADDRESSABLE, so a spec-compliant relay keeps only the newest event
 *      per (kind, pubkey, d) and drops the plaintext one. This works even
 *      on relays that ignore NIP-09.
 *   2. DELETE — a NIP-09 kind 5 request naming each `a` coordinate. Relays
 *      that honour it remove the event outright.
 *
 * Run with --dry-run first. Requires OPERATOR_NSEC/OPERATOR_PRIVKEY in .env.
 *
 *   node scripts/purge-plaintext-snapshots.cjs --dry-run
 *   node scripts/purge-plaintext-snapshots.cjs --relay wss://relay.damus.io
 *
 * --all also removes SEALED snapshots. They disclose nothing, but a relay
 * this operator can still read is a relay it will rehydrate from: leftover
 * snapshots reappear as live tasks on the next boot. Use it to leave a
 * relay cleanly, or to clear test spill.
 */

require('dotenv').config();
const {
  getPublicKey, getEventHash, getSignature, nip19
} = require('nostr-tools');

if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = require('ws');
}
const WebSocket = require('ws');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const PURGE_ALL = args.includes('--all');
const RELAYS = (() => {
  const i = args.indexOf('--relay');
  if (i !== -1 && args[i + 1]) return [args[i + 1]];
  // Where the old hardcoded defaults actually published. relay.nostr.band was
  // in the old fallback list but was never reached: the config default filled
  // the relay list with damus first, so the fallback branch never ran — and
  // the host has been unreachable from two independent networks since.
  return ['wss://relay.damus.io'];
})();

function operatorKey() {
  const raw = process.env.OPERATOR_PRIVKEY || process.env.OPERATOR_NSEC || '';
  if (!raw) throw new Error('Set OPERATOR_NSEC or OPERATOR_PRIVKEY');
  const priv = raw.startsWith('nsec') ? nip19.decode(raw).data : raw.toLowerCase();
  return { priv, pub: getPublicKey(priv) };
}

function sign(template, priv, pub) {
  const event = { ...template, pubkey: pub };
  event.id = getEventHash(event);
  event.sig = getSignature(event, priv);
  return event;
}

/** Everything this key has published as kind 30078, with readable content */
function fetchPlaintext(relay, pub) {
  return new Promise((resolve) => {
    const found = [];
    let ws;
    const done = (note) => { try { ws && ws.close(); } catch {} resolve({ found, note }); };
    const timer = setTimeout(() => done('timeout'), 20000);
    try { ws = new WebSocket(relay); } catch (e) { clearTimeout(timer); return done(e.message); }
    ws.on('error', (e) => { clearTimeout(timer); done(e.message); });
    ws.on('open', () => ws.send(JSON.stringify(['REQ', 'purge', {
      authors: [pub], kinds: [30078], limit: 500
    }])));
    ws.on('message', (m) => {
      try {
        const msg = JSON.parse(m);
        if (msg[0] === 'EVENT') found.push(msg[2]);
        if (msg[0] === 'EOSE') { clearTimeout(timer); done('eose'); }
      } catch { /* ignore */ }
    });
  });
}

/** Publish with retry — a busy relay 503s the connection, not the events. */
async function publishWithRetry(relay, events, attempts = 10) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const outcome = await publish(relay, events);
    if (outcome.results.length > 0) return outcome;
    console.log(`   publish attempt ${attempt}/${attempts}: ${outcome.note} — retrying`);
    await new Promise((r) => setTimeout(r, 8000));
  }
  return { results: [], note: 'gave up' };
}

function publish(relay, events) {
  return new Promise((resolve) => {
    const results = [];
    let ws;
    const done = (note) => { try { ws && ws.close(); } catch {} resolve({ results, note }); };
    const timer = setTimeout(() => done('timeout'), 30000);
    try { ws = new WebSocket(relay); } catch (e) { clearTimeout(timer); return done(e.message); }
    ws.on('error', (e) => { clearTimeout(timer); done(e.message); });
    ws.on('open', () => {
      for (const e of events) ws.send(JSON.stringify(['EVENT', e]));
    });
    ws.on('message', (m) => {
      try {
        const msg = JSON.parse(m);
        if (msg[0] === 'OK') {
          results.push({ id: msg[1], accepted: msg[2], reason: msg[3] || '' });
          if (results.length >= events.length) { clearTimeout(timer); done('done'); }
        }
      } catch { /* ignore */ }
    });
  });
}

(async () => {
  const { priv, pub } = operatorKey();
  console.log(`operator : ${nip19.npubEncode(pub)}`);
  console.log(`relays   : ${RELAYS.join(', ')}`);
  console.log(`mode     : ${DRY_RUN ? 'DRY RUN — nothing will be published' : 'LIVE'}\n`);

  for (const relay of RELAYS) {
    let scan = { found: [], note: '' };
    for (let attempt = 1; attempt <= 8; attempt++) {
      scan = await fetchPlaintext(relay, pub);
      if (scan.note === 'eose') break;
      console.log(`  ${relay}: ${scan.note} — retry ${attempt}/8`);
      await new Promise((r) => setTimeout(r, 6000));
    }
    if (scan.note !== 'eose') {
      console.log(`✗ ${relay}: could not read (${scan.note}) — skipping\n`);
      continue;
    }

    const readable = scan.found.filter((e) => (e.content || '').trim().startsWith('{'));
    const plaintext = PURGE_ALL ? scan.found : readable;
    console.log(`── ${relay}: ${scan.found.length} snapshot(s), ${readable.length} PLAINTEXT`
      + `${PURGE_ALL ? ` — --all: purging all ${scan.found.length}` : ''}`);
    if (plaintext.length === 0) { console.log('   nothing to purge\n'); continue; }

    const now = Math.floor(Date.now() / 1000);
    const dTags = [...new Set(plaintext
      .map((e) => (e.tags.find((t) => t[0] === 'd') || [])[1])
      .filter(Boolean))];

    // 1. Supersede: newest event per (kind, pubkey, d) wins on an
    //    addressable kind, so an empty one evicts the plaintext.
    //
    //    The expiration must be in the FUTURE, if only just. strfry rejects
    //    an already-expired event outright ("invalid: event expired"), so a
    //    back-dated tombstone never lands and the plaintext it was meant to
    //    evict stays exactly where it is. A short window lets the relay
    //    accept it, drop the plaintext as the older version, then expire the
    //    tombstone itself shortly after.
    const TOMBSTONE_TTL_SECONDS = 600;
    const tombstones = dTags.map((d) => sign({
      kind: 30078,
      created_at: now,
      tags: [['d', d], ['expiration', String(now + TOMBSTONE_TTL_SECONDS)]],
      content: ''
    }, priv, pub));

    // 2. NIP-09 deletion request for the same coordinates.
    const deletion = sign({
      kind: 5,
      created_at: now,
      tags: [
        ...dTags.map((d) => ['a', `30078:${pub}:${d}`]),
        ...plaintext.map((e) => ['e', e.id])
      ],
      content: 'Superseded: these snapshots were published in plaintext before sealing.'
    }, priv, pub);

    console.log(`   ${dTags.length} task id(s) to supersede + 1 deletion request`);
    for (const d of dTags) console.log(`     - ${d}`);

    if (DRY_RUN) { console.log('   (dry run — nothing sent)\n'); continue; }

    const { results, note } = await publishWithRetry(relay, [...tombstones, deletion]);
    const ok = results.filter((r) => r.accepted).length;
    console.log(`   published ${ok}/${tombstones.length + 1} (${note})`);
    for (const r of results.filter((x) => !x.accepted)) {
      console.log(`     rejected ${r.id.slice(0, 12)}…: ${r.reason}`);
    }
    console.log('');
  }

  console.log('Re-run with --dry-run afterwards to confirm the plaintext count is 0.');
  process.exit(0);
})();
