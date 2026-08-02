#!/usr/bin/env node
/**
 * Proves DB-less durability: an active ride survives an operator restart,
 * rehydrated purely from the operator's own Nostr state snapshots.
 *
 * BASE/WS_URL point at a running operator; RELAY at a persistent relay the
 * operator publishes to. The caller restarts the operator between phase 1
 * and phase 2.
 */
const crypto = require('crypto');
const tools = require('nostr-tools');

const BASE = process.env.BASE || 'http://localhost:3841';
const phase = process.env.PHASE || '1';
const stateFile = '/tmp/nostr-restart-ride.txt';
const fs = require('fs');

const riderSk = process.env.RIDER_SK || tools.generatePrivateKey();
const riderPk = tools.getPublicKey(riderSk);

function authHeader(sk, url, method) {
  const e = tools.finishEvent({ kind: 27235, created_at: Math.floor(Date.now() / 1000), tags: [['u', url], ['method', method], ['nonce', crypto.randomBytes(8).toString('hex')]], content: '', pubkey: tools.getPublicKey(sk) }, sk);
  return `Nostr ${Buffer.from(JSON.stringify(e)).toString('base64')}`;
}
async function api(sk, method, path, body) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...(sk ? { Authorization: authHeader(sk, url, method) } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

(async () => {
  if (phase === '1') {
    // Create a ride and leave it non-terminal (requested)
    const r = await api(riderSk, 'POST', '/api/rides/request', {
      pickup_lat: 51.5074, pickup_lon: -0.1278, dropoff_lat: 51.5155, dropoff_lon: -0.0922,
      rider_pubkey: riderPk, currency: 'GBP'
    });
    const rideId = r.body?.ride_id;
    if (!rideId) { console.error('phase1 FAIL: no ride created', JSON.stringify(r.body)); process.exit(1); }
    fs.writeFileSync(stateFile, JSON.stringify({ rideId, riderSk }));
    console.log('phase1 OK: created non-terminal ride', rideId);
    // give the snapshot a moment to reach the relay
    await new Promise((res) => setTimeout(res, 1500));
    process.exit(0);
  } else {
    // After restart: the ride must be recoverable from Nostr rehydration
    const { rideId, riderSk: sk } = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const pk = tools.getPublicKey(sk);
    const res = await api(sk, 'GET', `/api/participants/${pk}/active`);
    if (res.status !== 200) { console.error('phase2 FAIL: active lookup status', res.status, JSON.stringify(res.body)); process.exit(1); }
    const task = res.body?.task;
    if (task && task.id === rideId) {
      console.log('phase2 OK: ride', rideId, 'rehydrated from Nostr after restart (status:', task.status + ')');
      process.exit(0);
    }
    console.error('phase2 FAIL: ride not recovered after restart', JSON.stringify(res.body));
    process.exit(1);
  }
})().catch((e) => { console.error('proof error:', e.message); process.exit(1); });
