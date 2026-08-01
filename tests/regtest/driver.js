/**
 * Regtest proof of hodl-invoice stake semantics against real LND nodes.
 *
 * Proves, with actual held HTLCs:
 * 1. lockStake creates a payable hodl invoice; confirmStakePaid only reports
 *    paid once the payment is genuinely HELD.
 * 2. releaseStake CANCELS the invoice — the payer gets their money back
 *    (payment fails, balance restored). Release must never enrich the operator.
 * 3. forfeitStake SETTLES the invoice — the operator claims the stake as a
 *    real, enforceable penalty (operator balance increases).
 */

const path = require('path');
const assert = require('assert/strict');
const lnService = require('ln-service');
const LNDProvider = require('../../payment-providers/lnd');

const CRED_DIR = process.env.CRED_DIR;
if (!CRED_DIR) {
  console.error('CRED_DIR not set');
  process.exit(1);
}

const { lnd: payerLnd } = lnService.authenticatedLndGrpc({
  cert: require('fs').readFileSync(path.join(CRED_DIR, 'payer-tls.cert')).toString('base64'),
  macaroon: require('fs').readFileSync(path.join(CRED_DIR, 'payer-admin.macaroon')).toString('hex'),
  socket: '127.0.0.1:10010'
});

const provider = new LNDProvider({
  host: '127.0.0.1:10009',
  cert: path.join(CRED_DIR, 'operator-tls.cert'),
  macaroon: path.join(CRED_DIR, 'operator-admin.macaroon'),
  network: 'regtest'
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function channelBalance(lnd) {
  const { channel_balance } = await lnService.getChannelBalance({ lnd });
  return channel_balance;
}

async function pollUntil(fn, label, attempts = 30, delayMs = 1000) {
  for (let i = 0; i < attempts; i++) {
    if (await fn()) return;
    await sleep(delayMs);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

(async () => {
  const AMOUNT = 5000;

  // ── 1. Lock + pay + confirm held ──────────────────
  const lock = await provider.lockStake('regtest_release', 'payer_pubkey_hex', AMOUNT, 'rider');
  assert.equal(lock.success, true, `lockStake failed: ${lock.error}`);
  assert.ok(lock.invoice.startsWith('lnbcrt'), 'hodl invoice is a real regtest invoice');
  console.log('✔ lockStake created real hodl invoice');

  const before = await provider.confirmStakePaid('regtest_release_rider');
  assert.equal(before.paid, false, 'must not report paid before payment');
  console.log('✔ confirmStakePaid correctly reports unpaid before payment');

  const payerBalanceStart = await channelBalance(payerLnd);

  // Pay the hodl invoice — this call blocks until settle/cancel, so fire and forget
  const payment1 = lnService.payViaPaymentRequest({ lnd: payerLnd, request: lock.invoice })
    .then((r) => ({ outcome: 'settled', r }))
    .catch((e) => ({ outcome: 'failed', e }));

  await pollUntil(async () => (await provider.confirmStakePaid('regtest_release_rider')).paid,
    'stake payment to be HELD');
  console.log('✔ payment is HELD — stake enforceable, confirmStakePaid flips to paid');

  // ── 2. Release = cancel = refund ──────────────────
  const release = await provider.releaseStake('regtest_release_rider');
  assert.equal(release.success, true, `releaseStake failed: ${release.error}`);

  const payResult1 = await payment1;
  assert.equal(payResult1.outcome, 'failed', 'release must CANCEL the payment (refund), not settle it');

  await pollUntil(async () => (await channelBalance(payerLnd)) === payerBalanceStart,
    'payer balance restored after release');
  console.log(`✔ releaseStake refunded the payer (balance restored: ${payerBalanceStart} sats)`);

  const operatorAfterRelease = await channelBalance(provider.lnd.lnd);
  assert.equal(operatorAfterRelease, 0, 'operator must gain NOTHING from a released stake');
  console.log('✔ operator gained nothing from release — no silent stake theft');

  // ── 3. Forfeit = settle = operator claims penalty ─
  const lock2 = await provider.lockStake('regtest_forfeit', 'payer_pubkey_hex', AMOUNT, 'driver');
  assert.equal(lock2.success, true);

  const payment2 = lnService.payViaPaymentRequest({ lnd: payerLnd, request: lock2.invoice })
    .then((r) => ({ outcome: 'settled', r }))
    .catch((e) => ({ outcome: 'failed', e }));

  await pollUntil(async () => (await provider.confirmStakePaid('regtest_forfeit_driver')).paid,
    'second stake payment to be HELD');

  const forfeit = await provider.forfeitStake('regtest_forfeit_driver', 'payer_pubkey_hex', 'driver_cancelled');
  assert.equal(forfeit.success, true, `forfeitStake failed: ${forfeit.error}`);
  assert.equal(forfeit.penalty, AMOUNT, 'forfeit claims the full stake as penalty');

  const payResult2 = await payment2;
  assert.equal(payResult2.outcome, 'settled', 'forfeit must SETTLE the payment');

  await pollUntil(async () => (await channelBalance(provider.lnd.lnd)) === AMOUNT,
    'operator balance to reflect claimed penalty');
  console.log(`✔ forfeitStake claimed a real ${AMOUNT} sat penalty (operator balance: ${AMOUNT} sats)`);

  const payerEnd = await channelBalance(payerLnd);
  assert.equal(payerEnd, payerBalanceStart - AMOUNT, 'payer paid exactly the forfeited stake');
  console.log('✔ payer lost exactly the forfeited stake, nothing more');

  console.log('\nALL REGTEST STAKE SEMANTICS PROVEN ✅');
  process.exit(0);
})().catch((err) => {
  console.error('\nREGTEST PROOF FAILED ❌');
  console.error(err);
  process.exit(1);
});
