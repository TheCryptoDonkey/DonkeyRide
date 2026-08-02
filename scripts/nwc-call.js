#!/usr/bin/env node
/**
 * Tiny Nostr Wallet Connect (NIP-47) client for poking any NWC wallet — yours
 * (scripts/nwc-wallet.js) or a third party's (Alby, Coinos…). Send one method
 * and print the decrypted result.
 *
 *   NWC_URI='nostr+walletconnect://...' node scripts/nwc-call.js get_info
 *   NWC_URI='...' node scripts/nwc-call.js get_balance
 *   NWC_URI='...' node scripts/nwc-call.js make_invoice 1000        # sats
 *   NWC_URI='...' node scripts/nwc-call.js pay_invoice lnbc10u1...  # spends!
 *
 * get_info/get_balance/make_invoice move no money; pay_invoice does.
 * Requires nostr-tools v2 (see requireNostrToolsV2 below) and Node >= 21.
 */
const path = require('path');
if (!globalThis.WebSocket) { try { globalThis.WebSocket = require('ws'); } catch { /* Node >= 21 */ } }

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
const { finalizeEvent, getPublicKey, nip44, SimplePool } = requireNostrToolsV2();
const hexToBytes = (h) => Uint8Array.from(Buffer.from(h, 'hex'));

const uri = process.env.NWC_URI;
if (!uri) { console.error('Set NWC_URI'); process.exit(2); }
const method = process.argv[2] || 'get_info';
const arg = process.argv[3];
const params = method === 'pay_invoice' ? { invoice: arg }
  : method === 'make_invoice' ? { amount: Number(arg || 0) * 1000, description: 'nwc-call' }
  : {};

const u = new URL(uri.replace(/^nostr\+walletconnect:\/\//i, 'https://'));
const walletPk = (u.hostname || u.pathname.replace(/^\/+/, '')).toLowerCase();
const relay = u.searchParams.get('relay');
const secret = (u.searchParams.get('secret') || '').toLowerCase();
const key = nip44.getConversationKey(hexToBytes(secret), walletPk);
const clientPk = getPublicKey(hexToBytes(secret));

(async () => {
  const pool = new SimplePool();
  const req = finalizeEvent({
    kind: 23194, created_at: Math.floor(Date.now() / 1000),
    tags: [['p', walletPk], ['encryption', 'nip44_v2']],
    content: nip44.v2.encrypt(JSON.stringify({ method, params }), key),
  }, hexToBytes(secret));
  const res = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for wallet')), 30000);
    const sub = pool.subscribeMany([relay], { kinds: [23195], authors: [walletPk], '#e': [req.id], '#p': [clientPk] }, {
      onevent(ev) { try { clearTimeout(t); sub.close(); resolve(JSON.parse(nip44.v2.decrypt(ev.content, key))); } catch (e) { reject(e); } },
    });
    pool.publish([relay], req);
  });
  console.log(`${method} ->`, JSON.stringify(res, null, 2));
  try { pool.close([relay]); } catch { /* noop */ }
  process.exit(res && !res.error ? 0 : 1);
})().catch((e) => { console.error(`${method} failed:`, e.message); process.exit(1); });
