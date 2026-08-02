#!/usr/bin/env node
/**
 * REAL non-custodial Lightning settlement proof, end-to-end through a running
 * operator, using a real NWC wallet and a real Lightning Address.
 *
 * It exercises the exact rider→driver path with no operator custody:
 *   rider requests a ride (NIP-98) → driver accepts → driver advertises their
 *   Lightning Address → rider asks the operator for a pay instruction (operator
 *   resolves the LN Address via LNURL-pay to a bolt11) → rider's OWN wallet pays
 *   that invoice over NWC (NIP-47) → operator verifies the payment by preimage
 *   (SHA256(preimage) === invoice payment_hash) → driver confirms receipt.
 *
 * The operator never touches the money. To keep it ~free, point DRIVER_LNADDR at
 * an address on the SAME wallet as NWC_URI so the sats round-trip back to you.
 *
 * Requires Node >= 21 (global WebSocket; ws is polyfilled otherwise) and the web
 * workspace's nostr-tools v2 (NIP-44), the same crypto as the client.
 *
 *   NWC_URI='nostr+walletconnect://...' \
 *   DRIVER_LNADDR='you@yourwallet.com' \
 *   BASE=https://donkeyride.95.217.39.110.sslip.io \
 *   node scripts/nwc-settlement-proof.js
 */

const crypto = require('crypto');
const path = require('path');

if (!globalThis.WebSocket) {
  try { globalThis.WebSocket = require('ws'); } catch { /* Node >= 21 has it natively */ }
}

// Use the web workspace's nostr-tools v2 (NIP-44 + the finalizeEvent API), the
// same crypto as the client. A bare require would resolve the root v1 copy.
let tools;
try {
  tools = require(path.join(__dirname, '..', 'web', 'node_modules', 'nostr-tools'));
} catch (e) {
  console.error('This tool needs the web workspace installed (nostr-tools v2). Run: (cd web && npm install)');
  process.exit(2);
}
const {
  generateSecretKey, getPublicKey, finalizeEvent, nip19, nip44, SimplePool,
} = tools;

const BASE = process.env.BASE || 'https://donkeyride.95.217.39.110.sslip.io';
const NWC_URI = process.env.NWC_URI;
const DRIVER_LNADDR = process.env.DRIVER_LNADDR;
// 1000 sats (~£0.75) is a safe default: some payees (e.g. bitcoin.co.ke) reject
// tiny amounts. Lower it with AMOUNT_SATS if your own wallet accepts less.
const AMOUNT_SATS = parseInt(process.env.AMOUNT_SATS || '1000', 10);

if (!NWC_URI || !DRIVER_LNADDR) {
  console.error('Set NWC_URI and DRIVER_LNADDR (see the header of this file).');
  process.exit(2);
}

const hexToBytes = (h) => Uint8Array.from(Buffer.from(h, 'hex'));

let failures = 0;
function check(cond, label, detail) {
  if (cond) { console.log(`  ✔ ${label}`); }
  else { failures += 1; console.error(`  ✖ ${label}${detail ? ` -- ${detail}` : ''}`); }
}

// ── signing (NIP-98) ─────────────────────────────────────────
function signed(sk, kind, tags, content = '') {
  return finalizeEvent({
    kind,
    created_at: Math.floor(Date.now() / 1000),
    tags: [...tags, ['nonce', crypto.randomBytes(8).toString('hex')]],
    content,
    pubkey: getPublicKey(sk),
  }, sk);
}
function authHeader(sk, url, method) {
  return `Nostr ${Buffer.from(JSON.stringify(signed(sk, 27235, [['u', url], ['method', method]]))).toString('base64')}`;
}
async function api(sk, method, path, body) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(sk ? { Authorization: authHeader(sk, url, method) } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body: json };
}

// ── NWC (NIP-47) pay_invoice ─────────────────────────────────
function parseNwc(uri) {
  const url = new URL(uri.trim().replace(/^nostr\+walletconnect:\/\//i, 'https://'));
  const walletPubkey = (url.hostname || url.pathname.replace(/^\/+/, '')).toLowerCase();
  const relay = url.searchParams.get('relay');
  const secret = (url.searchParams.get('secret') || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(walletPubkey)) throw new Error('bad wallet pubkey in NWC URI');
  if (!relay) throw new Error('no relay in NWC URI');
  if (!/^[0-9a-f]{64}$/.test(secret)) throw new Error('bad secret in NWC URI');
  return { walletPubkey, relay, secret };
}

async function payViaNwc(uri, invoice, timeoutMs = 60000) {
  const conn = parseNwc(uri);
  const pool = new SimplePool();
  const key = nip44.getConversationKey(hexToBytes(conn.secret), conn.walletPubkey);
  const clientPubkey = getPublicKey(hexToBytes(conn.secret));
  const payload = JSON.stringify({ method: 'pay_invoice', params: { invoice } });
  const reqEvent = finalizeEvent({
    kind: 23194,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['p', conn.walletPubkey], ['encryption', 'nip44_v2']],
    content: nip44.v2.encrypt(payload, key),
  }, hexToBytes(conn.secret));

  try {
    return await new Promise((resolve, reject) => {
      let settled = false;
      const done = (fn) => { if (settled) return; settled = true; clearTimeout(t); try { sub.close(); } catch {} fn(); };
      const t = setTimeout(() => done(() => reject(new Error('wallet did not respond in time'))), timeoutMs);
      const sub = pool.subscribeMany(
        [conn.relay],
        { kinds: [23195], authors: [conn.walletPubkey], '#e': [reqEvent.id], '#p': [clientPubkey] },
        {
          onevent(ev) {
            try {
              const parsed = JSON.parse(nip44.v2.decrypt(ev.content, key));
              if (parsed.error) return done(() => reject(new Error(parsed.error.message || parsed.error.code)));
              const preimage = parsed.result?.preimage;
              if (preimage) done(() => resolve(preimage));
              else done(() => reject(new Error('response had no preimage')));
            } catch (e) { done(() => reject(e)); }
          },
        },
      );
      pool.publish([conn.relay], reqEvent);
    });
  } finally { try { pool.close([conn.relay]); } catch {} }
}

async function main() {
  console.log(`REAL NWC settlement proof against ${BASE}`);
  console.log(`  paying ${AMOUNT_SATS} sats to ${DRIVER_LNADDR} from your NWC wallet\n`);

  const riderSk = generateSecretKey();
  const riderPk = getPublicKey(riderSk);
  const driverSk = generateSecretKey();
  const driverPk = getPublicKey(driverSk);
  const P = { lat: 51.5074, lon: -0.1278 };

  // 1. Rider requests a ride with a tiny fixed fare so this costs pennies.
  const req = await api(riderSk, 'POST', '/api/rides/request', {
    pickup_lat: P.lat, pickup_lon: P.lon, dropoff_lat: P.lat, dropoff_lon: P.lon,
    rider_pubkey: riderPk, currency: 'SAT', fare_sats: AMOUNT_SATS,
  });
  const rideId = req.body?.ride_id;
  check(req.status === 200 && !!rideId, 'rider requested a ride', JSON.stringify(req.body));

  // 2. Driver accepts.
  const acc = await api(driverSk, 'POST', `/api/rides/${rideId}/accept`, {
    driver_npub: nip19.npubEncode(driverPk), driver_pubkey: driverPk, driver_location: P,
  });
  check(acc.status === 200, 'driver accepted', JSON.stringify(acc.body));

  // 3. Driver advertises their Lightning Address.
  const pm = await api(driverSk, 'POST', `/api/rides/${rideId}/payment-methods`, {
    methods: [{ rail: 'lnaddress', handle: DRIVER_LNADDR }],
  });
  check(pm.status === 200, 'driver advertised a Lightning Address', JSON.stringify(pm.body));

  // 4. Rider asks the operator to resolve it to a payable invoice.
  const instr = await api(riderSk, 'POST', `/api/rides/${rideId}/pay-instruction`, { rail: 'lnaddress' });
  check(instr.status === 200 && !!instr.body?.invoice, 'operator resolved LN Address to a bolt11 invoice', JSON.stringify(instr.body));
  check(instr.body?.custody === 'none' && instr.body?.operator_transmitted === 0, 'instruction is non-custodial (operator transmits 0)', JSON.stringify(instr.body));
  const invoice = instr.body.invoice;
  const paymentHash = instr.body.paymentHash;
  console.log(`  invoice: ${invoice.slice(0, 42)}…  hash: ${(paymentHash || '(none)').slice(0, 16)}…`);

  // 5. Rider's OWN wallet pays the invoice over NWC. Operator never sees funds.
  console.log('  paying via your NWC wallet…');
  const preimage = await payViaNwc(NWC_URI, invoice);
  check(/^[0-9a-f]{64}$/i.test(preimage), 'wallet paid and returned a 32-byte preimage', preimage);

  // Local sanity: the preimage really does hash to the invoice payment hash.
  if (paymentHash) {
    const computed = crypto.createHash('sha256').update(hexToBytes(preimage.toLowerCase())).digest('hex');
    check(computed === paymentHash.toLowerCase(), 'preimage hashes to the invoice payment hash (SHA256)', `${computed} vs ${paymentHash}`);
  }

  // 6. Rider submits the preimage; the operator verifies it cryptographically.
  const settle = await api(riderSk, 'POST', `/api/rides/${rideId}/settle`, { rail: 'lnaddress', proof: { preimage } });
  check(settle.status === 200, 'operator accepted the settlement', JSON.stringify(settle.body));
  check(settle.body?.settlement?.verified === true, 'operator VERIFIED the payment by preimage', JSON.stringify(settle.body?.settlement));
  check(settle.body?.settlement?.status === 'verified', "settlement status is 'verified'", JSON.stringify(settle.body?.settlement));
  check(settle.body?.settlement?.custody === 'none', 'settlement custody is none', JSON.stringify(settle.body?.settlement));

  // 7. Driver confirms receipt (the human backstop, here already cryptographically true).
  const conf = await api(driverSk, 'POST', `/api/rides/${rideId}/confirm-received`, {});
  check(conf.status === 200 && conf.body?.settlement?.status === 'confirmed', 'driver confirmed receipt', JSON.stringify(conf.body?.settlement));

  console.log('');
  if (failures === 0) {
    console.log('REAL LIGHTNING SETTLEMENT PROVEN END-TO-END ✅');
    console.log('The rider paid the driver directly; the operator only resolved the');
    console.log('address and verified the preimage. It moved £0.');
    process.exit(0);
  } else {
    console.error(`${failures} CHECK(S) FAILED ❌`);
    process.exit(1);
  }
}

main().catch((err) => { console.error('proof harness error:', err.message || err); process.exit(1); });
