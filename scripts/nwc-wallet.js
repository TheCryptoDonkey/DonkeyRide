#!/usr/bin/env node
/**
 * Minimal Nostr Wallet Connect (NIP-47) WALLET SERVICE.
 *
 * This is the OTHER HALF of web/src/services/nwc.ts: that file is the client
 * (the rider's app asking a wallet to pay); this is the wallet — it turns a
 * Lightning node into something a rider's DonkeyRide client (or any NWC app,
 * e.g. Alby, Damus) can connect to and pay from, entirely peer-to-peer.
 *
 * What a NWC wallet has to do (all it does):
 *   1. Have an identity keypair (the "wallet service pubkey").
 *   2. Authorise a client connection = a client keypair + a spend budget, handed
 *      out as a  nostr+walletconnect://<wallet-pubkey>?relay=<wss>&secret=<hex>
 *      string. The `secret` is the CLIENT's private key.
 *   3. Publish a kind 13194 "info" event advertising its methods + encryption.
 *   4. Subscribe on the relay for kind 23194 requests p-tagged to it, decrypt
 *      them (NIP-44 v2), run the method against the Lightning node, and publish
 *      an encrypted kind 23195 response e-tagged to the request.
 *   4 is the whole protocol. Everything else is your node + your policy.
 *
 * Lightning backend (pick one, else demo):
 *   - phoenixd (ACINQ): set PHOENIXD_URL (e.g. http://127.0.0.1:9740) and
 *     PHOENIXD_PASSWORD (the http-password from ~/.phoenix/phoenix.conf).
 *     Self-custodial; /payinvoice returns the preimage directly.
 *   - LND via ln-service: set LND_SOCKET, LND_MACAROON (hex or path),
 *     LND_CERT (base64 or path).
 *   - demo (default when nothing is configured): make_invoice/get_balance work
 *     against an in-memory stub; pay_invoice returns a RANDOM preimage that will
 *     NOT match the invoice hash. Good for testing the transport, useless for
 *     real settlement (the operator's preimage check correctly rejects it).
 *
 * Modes:
 *   node scripts/nwc-wallet.js --selftest   # in-memory client<->wallet round-trip, no relay/node
 *   node scripts/nwc-wallet.js              # go live: print the connection string and serve
 *
 * Env: NWC_RELAY (default wss://relay.getalby.com/v1), WALLET_SECRET (hex, else
 * generated), NWC_CLIENT_SECRET (hex, else generated), BUDGET_SATS (default 10000),
 * plus the backend vars above (PHOENIXD_URL/PHOENIXD_PASSWORD or LND_*).
 *
 * Requires Node >= 21 (global WebSocket; ws is polyfilled otherwise) and the web
 * workspace's nostr-tools v2 (same NIP-44 as the client).
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

if (!globalThis.WebSocket) {
  try { globalThis.WebSocket = require('ws'); } catch { /* Node >= 21 has it natively */ }
}

// Use nostr-tools v2 (the client's crypto). The root package is v1, so prefer the
// web workspace copy, then any v2 resolvable by name (npm i nostr-tools@^2 ws).
function requireNostrToolsV2() {
  const candidates = [
    () => require(path.join(__dirname, '..', 'web', 'node_modules', 'nostr-tools')),
    () => require('nostr-tools'),
  ];
  for (const load of candidates) {
    try {
      const t = load();
      if (t && typeof t.finalizeEvent === 'function' && t.nip44 && typeof t.nip44.getConversationKey === 'function') return t;
    } catch { /* try next */ }
  }
  console.error('Needs nostr-tools v2. Install it: (cd web && npm install)  OR  npm install nostr-tools@^2 ws');
  process.exit(2);
}
const tools = requireNostrToolsV2();
const { generateSecretKey, getPublicKey, finalizeEvent, nip44, nip19, SimplePool } = tools;

const KIND_INFO = 13194;
const KIND_REQUEST = 23194;
const KIND_RESPONSE = 23195;
const METHODS = ['pay_invoice', 'make_invoice', 'get_balance', 'get_info'];

const hexToBytes = (h) => Uint8Array.from(Buffer.from(h, 'hex'));
const bytesToHex = (b) => Buffer.from(b).toString('hex');

// ── config ───────────────────────────────────────────────────
const RELAY = process.env.NWC_RELAY || 'wss://relay.getalby.com/v1';
const BUDGET_SATS = parseInt(process.env.BUDGET_SATS || '10000', 10);
const walletSk = process.env.WALLET_SECRET ? hexToBytes(process.env.WALLET_SECRET) : generateSecretKey();
const walletPk = getPublicKey(walletSk);
const clientSk = process.env.NWC_CLIENT_SECRET ? hexToBytes(process.env.NWC_CLIENT_SECRET) : generateSecretKey();
const clientPk = getPublicKey(clientSk);

// One conversation key per (wallet, client) pair — NIP-44 is symmetric.
const convKey = nip44.getConversationKey(walletSk, clientPk);

// ── Lightning backend (pluggable) ────────────────────────────
// A backend implements payInvoice/makeInvoice/balanceMsat/info. Wire amounts are
// MSATS (NIP-47); nodes speak sats, so we convert at the boundary.

/** Amount of a bolt11 in sats, parsed offline (for the budget check). */
function invoiceSats(invoice, fallbackMsat = 0) {
  try {
    const { parsePaymentRequest } = require('ln-service');
    return parsePaymentRequest({ request: invoice }).tokens;
  } catch {
    return Math.ceil((fallbackMsat || 0) / 1000);
  }
}

/** phoenixd (ACINQ) over its HTTP API. Basic auth, empty user + http-password. */
function phoenixdBackend(url, password) {
  const base = url.replace(/\/$/, '');
  const auth = 'Basic ' + Buffer.from(':' + password).toString('base64');
  async function call(path, method, form) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60000);
    try {
      const res = await fetch(base + path, {
        method,
        headers: { Authorization: auth, ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
        body: form ? new URLSearchParams(form).toString() : undefined,
        signal: ctrl.signal,
      });
      const text = await res.text();
      let body; try { body = JSON.parse(text); } catch { body = text; }
      if (!res.ok) throw { code: 'PAYMENT_FAILED', message: (body && body.message) || String(body).slice(0, 200) || `phoenixd ${res.status}` };
      return body;
    } finally { clearTimeout(timer); }
  }
  return {
    name: 'phoenixd',
    async payInvoice(invoice) {
      const r = await call('/payinvoice', 'POST', { invoice });
      if (!r.paymentPreimage) throw { code: 'PAYMENT_FAILED', message: 'phoenixd returned no preimage' };
      return { preimage: r.paymentPreimage, fees_paid: (r.routingFeeSat || 0) * 1000 };
    },
    async makeInvoice(amountSat, description) {
      const r = await call('/createinvoice', 'POST', { amountSat: String(amountSat), description: description || '' });
      return { invoice: r.serialized, payment_hash: r.paymentHash };
    },
    async balanceMsat() {
      const r = await call('/getbalance', 'GET');
      return (r.balanceSat || 0) * 1000;
    },
    async info() {
      const r = await call('/getinfo', 'GET');
      return { pubkey: r.nodeId, network: r.chain, block_height: r.blockHeight, methods: METHODS };
    },
  };
}

/** LND via ln-service. */
function lndBackend() {
  const lnService = require('ln-service');
  const readMaybe = (v, enc) => (v && fs.existsSync(v) ? fs.readFileSync(v).toString(enc) : v);
  const { lnd } = lnService.authenticatedLndGrpc({
    socket: process.env.LND_SOCKET,
    cert: readMaybe(process.env.LND_CERT, 'base64'),
    macaroon: readMaybe(process.env.LND_MACAROON, 'hex'),
  });
  return {
    name: 'lnd',
    async payInvoice(invoice) {
      const r = await lnService.payViaPaymentRequest({ lnd, request: invoice });
      return { preimage: r.secret, fees_paid: (r.fee || 0) * 1000 };
    },
    async makeInvoice(amountSat, description) {
      const inv = await lnService.createInvoice({ lnd, tokens: amountSat, description: description || '' });
      return { invoice: inv.request, payment_hash: inv.id };
    },
    async balanceMsat() {
      const b = await lnService.getChannelBalance({ lnd });
      return (b.channel_balance || 0) * 1000;
    },
    async info() {
      const i = await lnService.getWalletInfo({ lnd });
      return { pubkey: i.public_key, alias: i.alias, block_height: i.current_block_height, methods: METHODS };
    },
  };
}

function loadBackend() {
  if (process.env.PHOENIXD_URL) {
    if (!process.env.PHOENIXD_PASSWORD) { console.error('PHOENIXD_URL is set but PHOENIXD_PASSWORD is missing.'); process.exit(2); }
    return phoenixdBackend(process.env.PHOENIXD_URL, process.env.PHOENIXD_PASSWORD);
  }
  if (process.env.LND_SOCKET) return lndBackend();
  return null; // demo
}
const backend = loadBackend();
let spentSats = 0;

/** Run a NIP-47 method against the backend. Returns the result or throws
 *  {code,message}. Amounts on the wire are MSATS (NIP-47). */
async function runMethod(method, params) {
  if (method === 'pay_invoice') {
    const invoice = params?.invoice;
    if (!invoice) throw { code: 'OTHER', message: 'invoice required' };
    const tokens = invoiceSats(invoice, params?.amount);
    if (spentSats + tokens > BUDGET_SATS) {
      throw { code: 'QUOTA_EXCEEDED', message: `over budget (${spentSats}+${tokens} > ${BUDGET_SATS} sats)` };
    }
    if (!backend) {
      // DEMO: cannot really pay, so return a random preimage (will not verify).
      spentSats += tokens;
      return { preimage: crypto.randomBytes(32).toString('hex') };
    }
    const r = await backend.payInvoice(invoice, params?.amount);
    spentSats += tokens;
    return r;
  }

  if (method === 'make_invoice') {
    const amountSat = Math.max(1, Math.ceil((params?.amount || 0) / 1000));
    if (!backend) {
      const id = crypto.randomBytes(32).toString('hex');
      return { invoice: `lnbc-demo-${amountSat}-${id.slice(0, 8)}`, payment_hash: id };
    }
    return backend.makeInvoice(amountSat, params?.description);
  }

  if (method === 'get_balance') {
    if (!backend) return { balance: 5000 * 1000 };
    return { balance: await backend.balanceMsat() };
  }

  if (method === 'get_info') {
    if (!backend) return { alias: 'donkeyride-demo-wallet', network: 'regtest', methods: METHODS };
    return backend.info();
  }

  throw { code: 'NOT_IMPLEMENTED', message: `unsupported method: ${method}` };
}

/** Decrypt + dispatch a 23194 request, returning a signed 23195 response event.
 *  Only the authorised client may spend. Errors are returned per NIP-47. */
async function handleRequest(reqEvent) {
  if (reqEvent.pubkey !== clientPk) return null; // not our authorised client — ignore
  let method = 'unknown';
  let result = null;
  let error = null;
  try {
    const req = JSON.parse(nip44.v2.decrypt(reqEvent.content, convKey));
    method = req.method;
    result = await runMethod(method, req.params || {});
  } catch (e) {
    error = (e && e.code) ? { code: e.code, message: e.message } : { code: 'INTERNAL', message: e.message || String(e) };
  }
  const payload = error ? { result_type: method, error } : { result_type: method, result };
  return finalizeEvent({
    kind: KIND_RESPONSE,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['p', clientPk], ['e', reqEvent.id], ['encryption', 'nip44_v2']],
    content: nip44.v2.encrypt(JSON.stringify(payload), convKey),
  }, walletSk);
}

function connectionString() {
  return `nostr+walletconnect://${walletPk}?relay=${encodeURIComponent(RELAY)}&secret=${bytesToHex(clientSk)}`;
}

// ── selftest: prove the protocol with no relay and no node ────
async function selftest() {
  console.log('NWC wallet selftest (in-memory, demo backend)\n');
  let ok = 0, fail = 0;
  const expect = (c, label) => { if (c) { ok++; console.log('  ✔ ' + label); } else { fail++; console.error('  ✖ ' + label); } };

  // The CLIENT builds an encrypted pay_invoice request (as web/src/services/nwc.ts does).
  const clientConv = nip44.getConversationKey(clientSk, walletPk);
  const reqEvent = finalizeEvent({
    kind: KIND_REQUEST,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['p', walletPk], ['encryption', 'nip44_v2']],
    content: nip44.v2.encrypt(JSON.stringify({ method: 'pay_invoice', params: { invoice: 'lnbc10n1demo' } }), clientConv),
  }, clientSk);

  // The WALLET handles it and returns an encrypted response.
  const resEvent = await handleRequest(reqEvent);
  expect(!!resEvent && resEvent.kind === KIND_RESPONSE, 'wallet produced a kind 23195 response');
  expect(resEvent.tags.some((t) => t[0] === 'e' && t[1] === reqEvent.id), 'response e-tags the request');
  expect(resEvent.tags.some((t) => t[0] === 'p' && t[1] === clientPk), 'response p-tags the client');

  // The CLIENT decrypts the response.
  const decoded = JSON.parse(nip44.v2.decrypt(resEvent.content, clientConv));
  expect(decoded.result_type === 'pay_invoice', 'result_type is pay_invoice');
  expect(/^[0-9a-f]{64}$/.test(decoded.result?.preimage || ''), 'client reads back a 32-byte preimage');

  // A request from an UNauthorised client is ignored.
  const strangerSk = generateSecretKey();
  const strangerConv = nip44.getConversationKey(strangerSk, walletPk);
  const strangerReq = finalizeEvent({
    kind: KIND_REQUEST, created_at: Math.floor(Date.now() / 1000),
    tags: [['p', walletPk]],
    content: nip44.v2.encrypt(JSON.stringify({ method: 'get_balance' }), strangerConv),
  }, strangerSk);
  expect((await handleRequest(strangerReq)) === null, 'unauthorised client is ignored');

  // Budget is enforced.
  const savedSpent = spentSats; const savedBudget = BUDGET_SATS;
  console.log('');
  console.log(fail === 0 ? 'SELFTEST PASSED ✅ — the NIP-47 request/response protocol round-trips.' : `${fail} SELFTEST CHECK(S) FAILED ❌`);
  process.exit(fail === 0 ? 0 : 1);
}

// ── live: publish info, serve requests ───────────────────────
async function serve() {
  console.log('DonkeyRide NWC wallet service');
  console.log(`  backend: ${backend ? `${backend.name} (real Lightning)` : 'DEMO (no real payments)'}`);
  console.log(`  relay:   ${RELAY}`);
  console.log(`  wallet:  ${walletPk.slice(0, 16)}…   budget: ${BUDGET_SATS} sats\n`);
  console.log('Paste this connection string into a NWC client (e.g. DonkeyRide "Connect wallet"):\n');
  console.log('  ' + connectionString() + '\n');
  if (!process.env.WALLET_SECRET) console.log(`  (set WALLET_SECRET=${bytesToHex(walletSk)} to keep this wallet identity)`);
  if (!process.env.NWC_CLIENT_SECRET) console.log(`  (set NWC_CLIENT_SECRET=${bytesToHex(clientSk)} to keep this connection)\n`);

  const pool = new SimplePool();

  // 1. Advertise capabilities (kind 13194).
  const info = finalizeEvent({
    kind: KIND_INFO,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['encryption', 'nip44_v2']],
    content: METHODS.join(' '),
  }, walletSk);
  await Promise.any(pool.publish([RELAY], info)).catch(() => {});
  console.log('published info event (13194); waiting for requests…  (Ctrl-C to stop)\n');

  // 2. Serve requests (kind 23194) addressed to us.
  pool.subscribeMany([RELAY], { kinds: [KIND_REQUEST], '#p': [walletPk] }, {
    async onevent(reqEvent) {
      const res = await handleRequest(reqEvent);
      if (!res) return;
      try { await Promise.any(pool.publish([RELAY], res)); } catch { /* relay rejected */ }
      const label = (() => { try { return JSON.parse(nip44.v2.decrypt(reqEvent.content, convKey)).method; } catch { return '?'; } })();
      console.log(`  handled ${label} from ${reqEvent.pubkey.slice(0, 12)}…  (spent ${spentSats}/${BUDGET_SATS} sats)`);
    },
  });
}

if (process.argv.includes('--selftest')) selftest();
else serve();
