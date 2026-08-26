const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  REFERENCE_PROVIDER_NAMES,
  assertReferenceProviderNames,
  assertReferencePaymentProvider,
  referenceCancellationOutcome,
  assertEvidenceOnlyDispute
} = require('../../src/payment-policy');

const provider = (name, custody = 'none') => ({
  providerName: name,
  getCustodyModel: () => custody
});

test('reference operator allowlist is record-only cash plus non-production demo', () => {
  assert.deepEqual([...REFERENCE_PROVIDER_NAMES], ['cash', 'demo']);
  assert.deepEqual(
    assertReferencePaymentProvider(provider('cash'), { production: true }),
    { name: 'cash', custody: 'none', operatorCanMoveFunds: false }
  );
  assert.equal(assertReferencePaymentProvider(provider('demo')).name, 'demo');
  assert.throws(
    () => assertReferencePaymentProvider(provider('demo'), { production: true }),
    /not available in production/
  );
});

test('custodial, unknown and falsely non-custodial provider names fail closed with no licence override', () => {
  for (const candidate of [provider('lnd', 'custodial'), provider('btcpay', 'custodial'), provider('custom', 'none')]) {
    assert.throws(() => assertReferencePaymentProvider(candidate), /not available in the reference operator/);
  }
  assert.throws(() => assertReferencePaymentProvider({ providerName: 'mystery' }), /not available/);
});

test('every configured primary and fallback rail is allowlisted before manager creation', () => {
  assert.deepEqual([...assertReferenceProviderNames(['CASH', 'demo'])], ['cash', 'demo']);
  assert.throws(() => assertReferenceProviderNames(['cash', 'lnd']), /fallback rails must all be record-only/);
  assert.throws(() => assertReferenceProviderNames(['cash', 'demo'], { production: true }), /not available in production/);
  assert.throws(() => assertReferenceProviderNames([]), /at least one explicit/);
});

test('reference cancellation is reputational only and moves no money', () => {
  assert.deepEqual(referenceCancellationOutcome({ lateCancellation: true }), {
    model: 'reputation-only',
    lateCancellation: true,
    compensationRecommendation: 0,
    penalty: 0,
    refund: 0,
    moneyMoved: 0,
    requiresIndependentLegalBasisForMoney: true
  });
  assert.equal(referenceCancellationOutcome({ lateCancellation: true, protectedReason: true }).lateCancellation, false);
});

test('reference disputes accept evidence but refuse every monetary stake effect', () => {
  assert.doesNotThrow(() => assertEvidenceOnlyDispute({ accusedStake: 'released', complainantStake: 'released' }));
  assert.throws(() => assertEvidenceOnlyDispute({ accusedStake: 'forfeited' }), /cannot forfeit/);
  assert.throws(() => assertEvidenceOnlyDispute({ complainantStake: 'held' }), /cannot forfeit/);
  assert.throws(() => assertEvidenceOnlyDispute({ forfeitAmount: 1 }), /cannot forfeit/);
});

test('reference server contains no licence bypass or active stake-forfeiture call', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');
  assert.doesNotMatch(source, /OPERATOR_LICENSED_CUSTODIAN/);
  assert.doesNotMatch(source, /stakeManager\.forfeitStake/);
  assert.match(source, /process\.env\.PAYMENT_PROVIDER, 'cash'/);
  assert.match(source, /assertReferenceProviderNames/);
});
