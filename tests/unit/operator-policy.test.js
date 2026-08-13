const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  createOperatorPolicy,
  evaluateDriverAdmission,
  publicOperatorPolicy
} = require('../../src/operator-policy');

test('open policy admits any driver and is explicit about assurance', () => {
  const policy = createOperatorPolicy({});
  const result = evaluateDriverAdmission(policy, {
    pubkey: 'abc',
    credentials: [],
    requiredCredentials: ['phv_licence']
  });

  assert.equal(result.allowed, true);
  assert.equal(publicOperatorPolicy(policy).admission.assurance, 'none');
});

test('operator roster can represent a manually checked taxi fleet', () => {
  const policy = createOperatorPolicy({
    OPERATOR_POLICY_MODE: 'regulated',
    OPERATOR_ADMISSION_MODE: 'allowlist',
    OPERATOR_ALLOWED_DRIVERS: 'ABC,npub1driver'
  });

  assert.equal(evaluateDriverAdmission(policy, { pubkey: 'abc' }).allowed, true);
  assert.equal(evaluateDriverAdmission(policy, { pubkey: 'def' }).allowed, false);
  const published = publicOperatorPolicy(policy);
  assert.equal(published.admission.assurance, 'operator_roster');
  assert.equal(published.admission.allowlistSize, 2);
  assert.equal(JSON.stringify(published).includes('npub1driver'), false);
});

test('combined policy needs both roster membership and required declarations', () => {
  const policy = createOperatorPolicy({
    OPERATOR_POLICY_MODE: 'regulated',
    OPERATOR_ALLOWED_DRIVERS: 'driver-key'
  });
  const requiredCredentials = ['phv_licence', 'hire_reward_insurance'];

  assert.deepEqual(evaluateDriverAdmission(policy, {
    pubkey: 'driver-key',
    credentials: [{ id: 'phv_licence' }],
    requiredCredentials
  }), {
    allowed: false,
    missingAllowlist: false,
    missingCredentials: ['hire_reward_insurance']
  });
  assert.equal(evaluateDriverAdmission(policy, {
    pubkey: 'driver-key',
    credentials: requiredCredentials.map((id) => ({ id })),
    requiredCredentials
  }).allowed, true);
});

test('regulated mode fails closed when its roster is missing', () => {
  assert.throws(
    () => createOperatorPolicy({ OPERATOR_POLICY_MODE: 'regulated' }),
    /OPERATOR_ALLOWED_DRIVERS/
  );
});

test('legacy credential toggle maps to the explicit credentials mode', () => {
  const policy = createOperatorPolicy({ ENFORCE_CREDENTIALS: 'true' });
  assert.equal(policy.admissionMode, 'credentials');
});
