/**
 * Proof of payment survives the operator issuing more than one invoice.
 *
 * A preimage only ever matches the ONE invoice it paid. The operator used to
 * keep a single `pendingInstruction` and mint a fresh bolt11 on every call to
 * /pay-instruction, so:
 *
 *   - re-selecting the rail replaced the recorded payment hash, and a rider
 *     who really had paid was told their preimage "does not match invoice" —
 *     the paste-your-preimage field exists to rescue exactly that situation,
 *     and it was the thing that broke
 *   - a new hash also meant bolt11's own replay protection no longer covered
 *     a retry, turning "the rider tapped again" into "the rider paid twice"
 *
 * So two rules, pinned here: reuse a live invoice instead of minting another,
 * and verify a supplied preimage against every invoice still on record.
 */

process.env.DISABLE_REDIS = 'true';
process.env.PAYMENT_PROVIDER = 'cash';
process.env.ENABLE_NIP98_AUTH = 'false';
process.env.ENABLE_RATE_LIMITING = 'false';
process.env.DISABLE_WS = 'true';
// No relay: boot would otherwise rehydrate a developer's live jobs
require('../helpers/isolate-relays');

const { test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { createUnsignedRequest, createSignedRequest } = require('ln-service');
const ecc = require('tiny-secp256k1');

const { app, startServer, rideManager } = require('../../server.js');
const settlement = require('../../settlement');

let server;
let baseUrl;
const rail = settlement.getRail('lnaddress');
const realGetPayInstructions = rail.getPayInstructions.bind(rail);
const realVerify = rail.verify.bind(rail);

before(async () => {
  await startServer({ listen: false });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  // Awaited, unlike the fire-and-forget close most integration files use: the
  // suite relies on --test-force-exit (server.js leaves six intervals running,
  // see the CI flake issue), and force-exit racing a child's final IPC flush is
  // what produces "Unable to deserialize cloned data". Closing before the
  // process is killed is one fewer thing in flight.
  rail.getPayInstructions = realGetPayInstructions;
  rail.verify = realVerify;
  if (server) await new Promise((resolve) => server.close(resolve));
});

/**
 * A real, signed, freshly-timestamped bolt11 — the operator decodes the
 * invoice locally to learn when it expires, so a fake string would not do.
 * Returns the preimage too, which is what a payer's wallet hands back.
 */
// One payee keypair for the whole file. Deriving a fresh point per invoice is
// the expensive part, and the tests only ever need distinct payment hashes, not
// distinct payees. This file mints ~25 invoices; under `npm test`'s parallel
// run that cost was enough to make it the heaviest file in the suite.
const PAYEE_PRIV = crypto.randomBytes(32);
const PAYEE_PUB = Buffer.from(ecc.pointFromScalar(PAYEE_PRIV, true)).toString('hex');

function mintInvoice({ sats = 5000, expirySeconds = 3600 } = {}) {
  const priv = PAYEE_PRIV;
  const destination = PAYEE_PUB;
  const preimage = crypto.randomBytes(32);
  const id = crypto.createHash('sha256').update(preimage).digest('hex');
  const createdAt = new Date();
  const unsigned = createUnsignedRequest({
    id,
    destination,
    mtokens: String(sats * 1000),
    network: 'bitcoin',
    description: 'DonkeyRide test',
    created_at: createdAt.toISOString(),
    expires_at: new Date(createdAt.getTime() + expirySeconds * 1000).toISOString()
  });
  const { signature } = ecc.signRecoverable(Buffer.from(unsigned.hash, 'hex'), priv);
  const { request } = createSignedRequest({
    destination,
    hrp: unsigned.hrp,
    tags: unsigned.tags,
    signature: Buffer.from(signature).toString('hex')
  });
  return { invoice: request, paymentHash: id, preimage: preimage.toString('hex') };
}

/**
 * Stub the rail so no LNURL resolution (i.e. no network) is needed.
 * `delayMs` stands in for that round trip, which is the window in which a
 * second tap arrives before the first invoice has been recorded.
 */
function stubRail({ expirySeconds = 3600, delayMs = 0 } = {}) {
  const issued = [];
  rail.getPayInstructions = async ({ amountSats }) => {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const minted = mintInvoice({ sats: amountSats || 5000, expirySeconds });
    issued.push(minted);
    return {
      rail: 'lnaddress',
      label: 'Lightning',
      custody: 'none',
      operator_transmitted: 0,
      lnAddress: 'driver@wallet.com',
      invoice: minted.invoice,
      paymentHash: minted.paymentHash,
      verifyUrl: null,
      payLink: `lightning:${minted.invoice}`,
      amountSats: amountSats || 5000,
      currency: 'SAT',
      verifyMethod: 'preimage',
      instructions: 'test'
    };
  };
  return issued;
}

let verifyCalls = 0;
beforeEach(() => {
  verifyCalls = 0;
  rail.verify = async (args) => {
    verifyCalls += 1;
    return realVerify(args);
  };
});

afterEach(() => {
  rail.getPayInstructions = realGetPayInstructions;
});

async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/** A completed ride with the Lightning rail declared by the driver */
async function completedRide() {
  const created = await post('/api/rides/request', {
    pickup_lat: 53.4808,
    pickup_lon: -2.2426,
    dropoff_lat: 53.4774,
    dropoff_lon: -2.2309,
    rider_pubkey: 'a'.repeat(64)
  });
  const rideId = created.body.ride_id;
  assert.ok(rideId, `ride not created: ${JSON.stringify(created.body)}`);
  await post(`/api/rides/${rideId}/accept`, {
    driver_npub: 'npub_test_proof_driver',
    driver_pubkey: 'b'.repeat(64),
    driver_location: { lat: 53.49, lon: -2.25 }
  });
  await post(`/api/rides/${rideId}/payment-methods`, {
    methods: [{ rail: 'lnaddress', handle: 'driver@wallet.com' }]
  });
  await post(`/api/rides/${rideId}/arrive`, {});
  await post(`/api/rides/${rideId}/start`, {});
  await post(`/api/rides/${rideId}/complete`, {});
  return rideId;
}

test('a live invoice is reused, so a retry cannot become a second payment', async () => {
  const issued = stubRail();
  const rideId = await completedRide();

  const first = await post(`/api/rides/${rideId}/pay-instruction`, { rail: 'lnaddress' });
  const second = await post(`/api/rides/${rideId}/pay-instruction`, { rail: 'lnaddress' });

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  // Same invoice, same hash: a rider who pays twice pays the same invoice,
  // which Lightning itself refuses the second time.
  assert.equal(second.body.invoice, first.body.invoice);
  assert.equal(issued.length, 1, 'a second live-invoice request must not mint another invoice');
});

test('a double tap shares one invoice rather than minting two', async () => {
  // liveInstruction can only see instructions that have RESOLVED, and building
  // one takes a network round trip — so without sharing the in-flight build,
  // two taps in the same moment both find nothing recorded and both mint,
  // handing the rider two payable invoices.
  const issued = stubRail({ delayMs: 50 });
  const rideId = await completedRide();

  const [a, b] = await Promise.all([
    post(`/api/rides/${rideId}/pay-instruction`, { rail: 'lnaddress' }),
    post(`/api/rides/${rideId}/pay-instruction`, { rail: 'lnaddress' })
  ]);

  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(issued.length, 1, 'concurrent requests must share one invoice');
  assert.equal(a.body.invoice, b.body.invoice);

  // ...and the shared result is recorded once, still verifiable
  const settled = await post(`/api/rides/${rideId}/settle`, {
    rail: 'lnaddress',
    proof: { preimage: issued[0].preimage }
  });
  assert.equal(settled.body.settlement.verified, true);
});

test('a preimage for an EARLIER invoice still verifies (the rescue path)', async () => {
  // First invoice too close to expiry to be safely reused, so the next
  // request genuinely mints a new one — the exact condition under which the
  // operator used to forget the invoice the rider had already paid.
  const issued = stubRail({ expirySeconds: 30 });
  const rideId = await completedRide();

  const first = await post(`/api/rides/${rideId}/pay-instruction`, { rail: 'lnaddress' });
  const second = await post(`/api/rides/${rideId}/pay-instruction`, { rail: 'lnaddress' });
  assert.equal(issued.length, 2, 'a near-expiry invoice must not be reused');
  assert.notEqual(second.body.invoice, first.body.invoice);

  // The rider paid the FIRST invoice and pastes its preimage
  const settled = await post(`/api/rides/${rideId}/settle`, {
    rail: 'lnaddress',
    proof: { preimage: issued[0].preimage }
  });

  assert.equal(settled.status, 200);
  assert.equal(settled.body.settlement.verified, true, 'proof of a paid earlier invoice must be accepted');
  assert.equal(settled.body.settlement.status, 'verified');
});

test('the newest invoice still verifies, and a preimage matching none is refused', async () => {
  const issued = stubRail({ expirySeconds: 30 });
  const rideId = await completedRide();
  await post(`/api/rides/${rideId}/pay-instruction`, { rail: 'lnaddress' });
  await post(`/api/rides/${rideId}/pay-instruction`, { rail: 'lnaddress' });

  const latest = await post(`/api/rides/${rideId}/settle`, {
    rail: 'lnaddress',
    proof: { preimage: issued[1].preimage }
  });
  assert.equal(latest.body.settlement.verified, true);

  // Accepting any old preimage would be worse than the bug being fixed
  const bogus = await post(`/api/rides/${rideId}/settle`, {
    rail: 'lnaddress',
    proof: { preimage: crypto.randomBytes(32).toString('hex') }
  });
  assert.equal(bogus.body.settlement.verified, false);
  assert.equal(bogus.body.settlement.status, 'unverified', 'a preimage matching no invoice must fail loudly');
});

test('with no preimage supplied, verification is attempted exactly once', async () => {
  // The multi-invoice loop is local crypto only. A rail with no preimage to
  // check falls through to its network verify, so that must not be multiplied
  // by the number of invoices on record.
  const issued = stubRail({ expirySeconds: 30 });
  const rideId = await completedRide();
  await post(`/api/rides/${rideId}/pay-instruction`, { rail: 'lnaddress' });
  await post(`/api/rides/${rideId}/pay-instruction`, { rail: 'lnaddress' });
  assert.equal(issued.length, 2);

  verifyCalls = 0;
  const declared = await post(`/api/rides/${rideId}/settle`, { rail: 'lnaddress', proof: {} });

  assert.equal(declared.body.settlement.status, 'declared');
  assert.equal(verifyCalls, 1, 'no preimage means one verify attempt, as before this change');
});

test('an invoice is never reused for a different fare', async () => {
  // Real services issue long-lived invoices — 24 hours on the one this was
  // verified against — so an invoice easily outlives the fare it was built
  // for. Waiting time is added on start, for instance. Reusing on amount
  // alone would quietly ask the rider for the wrong number.
  const issued = stubRail();
  const rideId = await completedRide();

  const first = await post(`/api/rides/${rideId}/pay-instruction`, { rail: 'lnaddress' });
  const originalFare = first.body.amountSats;

  // The fare moves, as a waiting charge or tip would move it
  const ride = rideManager.getRide(rideId);
  ride.fare = originalFare + 500;

  const second = await post(`/api/rides/${rideId}/pay-instruction`, { rail: 'lnaddress' });

  assert.equal(issued.length, 2, 'a changed fare must mint a new invoice');
  assert.notEqual(second.body.invoice, first.body.invoice);
  assert.equal(second.body.amountSats, originalFare + 500, 'the new invoice must ask for the new fare');

  // The old invoice is still on record, so a rider who already paid it is not
  // told their proof is bad — but it proves payment of the OLD fare, and
  // calling that 'verified' would have the operator assert a payment of an
  // amount nobody made. Recognised, quantified, and short.
  const settled = await post(`/api/rides/${rideId}/settle`, {
    rail: 'lnaddress',
    proof: { preimage: issued[0].preimage }
  });
  assert.equal(settled.body.settlement.status, 'short');
  assert.equal(settled.body.settlement.verified, false);
  assert.equal(settled.body.settlement.paidAmountSats, originalFare);
  assert.equal(settled.body.settlement.expectedAmountSats, originalFare + 500);
});

test('a short payment is never published as a verified receipt', async () => {
  // publishPaymentReceipt is called with ride.fare and verified: true. A
  // proven preimage for a cheaper invoice must not reach it, or the operator
  // signs an assertion that the current fare was cryptographically settled.
  const issued = stubRail();
  const rideId = await completedRide();
  const first = await post(`/api/rides/${rideId}/pay-instruction`, { rail: 'lnaddress' });
  rideManager.getRide(rideId).fare = first.body.amountSats + 1;

  const settled = await post(`/api/rides/${rideId}/settle`, {
    rail: 'lnaddress',
    proof: { preimage: issued[0].preimage }
  });
  assert.equal(settled.body.settlement.verified, false, 'a shortfall is not a verified settlement');
  assert.match(settled.body.settlement.detail, /fare is now/);
});

test('an invoice for a superseded payment handle is never reused', async () => {
  // A driver can correct a mistyped Lightning Address or M-Pesa number from
  // their own active screen, and POST /payment-methods replaces the list
  // wholesale. An invoice minted for the old handle stays payable for hours,
  // so reusing on rail and amount alone would hand the rider a stale invoice
  // that pays whoever the typo belonged to.
  const issued = stubRail();
  const rideId = await completedRide();
  const first = await post(`/api/rides/${rideId}/pay-instruction`, { rail: 'lnaddress' });

  await post(`/api/rides/${rideId}/payment-methods`, {
    methods: [{ rail: 'lnaddress', handle: 'corrected@wallet.com' }]
  });
  const second = await post(`/api/rides/${rideId}/pay-instruction`, { rail: 'lnaddress' });

  assert.equal(issued.length, 2, 'a corrected handle must mint a new invoice');
  assert.notEqual(second.body.invoice, first.body.invoice);
});

test('an instruction with no payment hash cannot mask a bad proof', async () => {
  // A rail handed an instruction with no hash answers `recorded` rather than
  // `failed`, having no grounds to contradict the proof. If such a record were
  // checked after a genuine mismatch it would overwrite the verdict and
  // downgrade "this proof is wrong" to "declared, awaiting the driver".
  // Records are stored newest-first, so the hashless one has to be the OLDER
  // of the two to be reached after the genuine mismatch. Issued first here for
  // exactly that reason.
  const issued = stubRail({ expirySeconds: 30 });
  const rideId = await completedRide();

  // A service whose invoice yields no extractable hash — the rail itself
  // contemplates this (verifyMethod flips to 'manual')
  const withHash = rail.getPayInstructions;
  rail.getPayInstructions = async (args) => {
    const built = await withHash(args);
    return { ...built, paymentHash: null, verifyMethod: 'manual' };
  };
  await post(`/api/rides/${rideId}/pay-instruction`, { rail: 'lnaddress' });
  rail.getPayInstructions = withHash;

  // ...then a normal, hashed one, which is what a bad proof contradicts
  await post(`/api/rides/${rideId}/pay-instruction`, { rail: 'lnaddress' });

  const bogus = await post(`/api/rides/${rideId}/settle`, {
    rail: 'lnaddress',
    proof: { preimage: crypto.randomBytes(32).toString('hex') }
  });
  assert.equal(bogus.body.settlement.status, 'unverified', 'a bad proof must still fail loudly');

  // ...and the real preimage for the hashed invoice still verifies
  const good = await post(`/api/rides/${rideId}/settle`, {
    rail: 'lnaddress',
    proof: { preimage: issued[1].preimage }
  });
  assert.equal(good.body.settlement.verified, true);
});

test('a failed build does not poison the ride for later attempts', async () => {
  // instructionOnce memoises the in-flight build. If a transient failure left
  // its entry behind, every later attempt would be handed the same rejected
  // promise and the journey could never be paid at all — a far worse outcome
  // than the double payment the memo exists to prevent.
  const rideId = await completedRide();

  rail.getPayInstructions = async () => { throw new Error('LNURL service unreachable'); };
  const failed = await post(`/api/rides/${rideId}/pay-instruction`, { rail: 'lnaddress' });
  assert.equal(failed.status, 502, 'a build failure is reported, not swallowed');

  // The same ride, rail and amount as the failed attempt: if the rejected
  // promise were still memoised, this would fail identically
  const issued = stubRail();
  const recovered = await post(`/api/rides/${rideId}/pay-instruction`, { rail: 'lnaddress' });

  assert.equal(recovered.status, 200, 'a retry after a transient failure must succeed');
  assert.ok(recovered.body.invoice);
  assert.equal(issued.length, 1);
});

test('an invoice the operator cannot decode is never reused, but is still verifiable', async () => {
  // Reuse depends on decoding the invoice to learn when it expires. With no
  // expiry there is no safe reuse decision, so it must fall back to minting —
  // and the record must still carry its hash, or a rider who paid it would be
  // left with unverifiable proof.
  const issued = [];
  rail.getPayInstructions = async ({ amountSats }) => {
    const minted = mintInvoice({ sats: amountSats || 5000 });
    issued.push(minted);
    return {
      rail: 'lnaddress', label: 'Lightning', custody: 'none', operator_transmitted: 0,
      lnAddress: 'driver@wallet.com',
      invoice: 'lnbc-not-decodable-by-anyone',
      paymentHash: minted.paymentHash,
      verifyUrl: null, payLink: 'lightning:x',
      amountSats: amountSats || 5000, currency: 'SAT', verifyMethod: 'preimage', instructions: 'test'
    };
  };
  const rideId = await completedRide();

  await post(`/api/rides/${rideId}/pay-instruction`, { rail: 'lnaddress' });
  await post(`/api/rides/${rideId}/pay-instruction`, { rail: 'lnaddress' });
  assert.equal(issued.length, 2, 'an undecodable invoice must not be reused');

  // ...and proof against the first still checks out
  const settled = await post(`/api/rides/${rideId}/settle`, {
    rail: 'lnaddress',
    proof: { preimage: issued[0].preimage }
  });
  assert.equal(settled.body.settlement.verified, true);
});

test('the invoice ledger never reaches the ride API response', async () => {
  // GET /api/rides/:id serialises the ride wholesale. The ledger is internal
  // bookkeeping carrying whole invoices, and pendingInstruction was always
  // deliberately narrow, so neither belongs in an API response even a
  // participant-gated one. Pinned because the ledger lives ON the ride object
  // (so it is collected with it) and only non-enumerability keeps it out.
  stubRail();
  const rideId = await completedRide();
  await post(`/api/rides/${rideId}/pay-instruction`, { rail: 'lnaddress' });

  const res = await fetch(`${baseUrl}/api/rides/${rideId}`);
  const body = await res.json();
  assert.equal(res.status, 200);

  const wire = JSON.stringify(body);
  assert.ok(!('paymentInstructions' in body.ride), 'the ledger must not be serialised');
  assert.ok(!wire.includes('lnbc'), 'no invoice should appear in the ride response');
  assert.ok(!wire.includes('payload'), 'no cached instruction payload should appear');

  // ...while the narrow record the settle fallback relies on is still there
  assert.deepEqual(
    Object.keys(body.ride.pendingInstruction).sort(),
    ['paymentHash', 'rail', 'verifyUrl']
  );

  // ...and the ledger still works, invisible though it is
  const settled = await post(`/api/rides/${rideId}/settle`, {
    rail: 'lnaddress',
    proof: { preimage: 'a'.repeat(64) }
  });
  assert.equal(settled.body.settlement.status, 'unverified');
});

test('recorded invoices are capped, so a ride cannot grow without bound', async () => {
  const issued = stubRail({ expirySeconds: 30 });
  const rideId = await completedRide();
  for (let i = 0; i < 7; i += 1) {
    await post(`/api/rides/${rideId}/pay-instruction`, { rail: 'lnaddress' });
  }
  assert.equal(issued.length, 7);

  // The most recent are kept; the oldest fall off rather than accumulating
  const recent = await post(`/api/rides/${rideId}/settle`, {
    rail: 'lnaddress',
    proof: { preimage: issued[6].preimage }
  });
  assert.equal(recent.body.settlement.verified, true);

  const dropped = await post(`/api/rides/${rideId}/settle`, {
    rail: 'lnaddress',
    proof: { preimage: issued[0].preimage }
  });
  assert.equal(dropped.body.settlement.verified, false, 'an invoice evicted by the cap is no longer on record');
});
