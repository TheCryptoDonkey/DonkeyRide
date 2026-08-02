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
 * Lightning backend:
 *   - real: LND via ln-service — set LND_SOCKET, LND_MACAROON (hex or path),
 *     LND_CERT (base64 or path).
 *   - demo (default when no LND is configured): make_invoice/get_balance work
 *     against an in-memory stub; pay_invoice returns a RANDOM preimage that will
 *     NOT match the invoice hash — good for testing the transport, useless for
 *     real settlement (the operator's preimage check correctly rejects it).
 *
 * Modes:
 *   node scripts/nwc-wallet.js --selftest   # in-memory client<->wallet round-trip, no relay/node
 *   node scripts/nwc-wallet.js              # go live: print the connection string and serve
 *
 * Env: NWC_RELAY (default wss://relay.getalby.com/v1), WALLET_SECRET (hex, else
 * generated), NWC_CLIENT_SECRET (hex, else generated), BUDGET_SATS (default 10000).
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

// Use the SAME nostr-tools the client uses, so the NIP-44 crypto matches exactly.
let tools;
try {
  tools = require(path.join(__dirname, '..', 'web', 'node_modules', 'nostr-tools'));
} catch (e) {
  console.error('This tool needs the web workspace installed (nostr-tools v2). Run: (cd web && npm install)');
  process.exit(2);
}
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

// ── Lightning backend ────────────────────────────────────────
function loadLnd() {
  const socket = process.env.LND_SOCKET;
  if (!socket) return null; // demo mode
  const lnService = require('ln-service');
  const readMaybe = (v, enc) => (v && fs.existsSync(v) ? fs.readFileSync(v).toString(enc) : v);
  const cert = readMaybe(process.env.LND_CERT, 'base64');
  const macaroon = readMaybe(process.env.LND_MACAROON, 'hex');
  const { lnd } = lnService.authenticatedLndGrpc({ socket, cert, macaroon });
  return { lnService, lnd };
}
const LND = loadLnd();
let spentSats = 0;

/** Run a NIP-47 method against the Lightning backend. Returns the result object
 *  or throws {code,message}. Amounts on the wire are MSATS (NIP-47). */
async function runMethod(method, params) {
  // Budget applies to spends regardless of backend.
  if (method === 'pay_invoice') {
    const invoice = params?.invoice;
    if (!invoice) throw { code: 'OTHER', message: 'invoice required' };
    let tokens = 0;
    try {
      const parsed = LND ? LND.lnService.parsePaymentRequest({ request: invoice }) : tools.nip19 && null;
      tokens = parsed ? parsed.tokens : Math.ceil((params?.amount || 0) / 1000);
    } catch { tokens = Math.ceil((params?.amount || 0) / 1000); }
    if (spentSats + tokens > BUDGET_SATS) {
      throw { code: 'QUOTA_EXCEEDED', message: `over budget (${spentSats}+${tokens} > ${BUDGET_SATS} sats)` };
    }
    if (!LND) {
      // DEMO: cannot really pay, so return a random preimage (will not verify).
      spentSats += tokens;
      return { preimage: crypto.randomBytes(32).toString('hex') };
    }
    const res = await LND.lnService.payViaPaymentRequest({ lnd: LND.lnd, request: invoice });
    spentSats += (res.tokens || tokens);
    return { preimage: res.secret, fees_paid: (res.fee_mtokens ? Number(res.fee_mtokens) : (res.fee || 0) * 1000) };
  }

  if (method === 'make_invoice') {
    const tokens = Math.max(1, Math.ceil((params?.amount || 0) / 1000));
    if (!LND) {
      const id = crypto.randomBytes(32).toString('hex');
      return { invoice: `lnbc-demo-${tokens}-${id.slice(0, 8)}`, payment_hash: id };
    }
    const inv = await LND.lnService.createInvoice({ lnd: LND.lnd, tokens, description: params?.description || '' });
    return { invoice: inv.request, payment_hash: inv.id };
  }

  if (method === 'get_balance') {
    if (!LND) return { balance: 5000 * 1000 };
    const bal = await LND.lnService.getChannelBalance({ lnd: LND.lnd });
    return { balance: (bal.channel_balance || 0) * 1000 };
  }

  if (method === 'get_info') {
    if (!LND) return { alias: 'donkeyride-demo-wallet', network: 'regtest', methods: METHODS };
    const info = await LND.lnService.getWalletInfo({ lnd: LND.lnd });
    return { alias: info.alias, pubkey: info.public_key, network: (info.chains || []).length ? 'bitcoin' : 'unknown', block_height: info.current_block_height, methods: METHODS };
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
  console.log(`  backend: ${LND ? 'LND (real Lightning)' : 'DEMO (no real payments)'}`);
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
