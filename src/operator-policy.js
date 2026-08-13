'use strict';

/**
 * Operator policy is deployment configuration, not a DonkeyRide licence.
 *
 * The same server can coordinate an open community market or be run by a
 * taxi firm that has checked an off-chain driver roster.  Clients consume
 * the public shape below so they can explain the operator's rules before a
 * driver goes online or a rider requests a trip.
 */

const POLICY_SCHEMA = 'org.donkeyride.operator-policy/v1';
const POLICY_MODES = new Set(['open', 'regulated', 'custom']);
const ADMISSION_MODES = new Set([
  'open',
  'allowlist',
  'credentials',
  'allowlist_and_credentials'
]);
const RECORD_MODES = new Set(['ephemeral', 'durable']);

function csv(raw) {
  return String(raw || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function oneOf(name, value, allowed) {
  if (!allowed.has(value)) {
    throw new Error(`${name} must be one of: ${Array.from(allowed).join(', ')}`);
  }
  return value;
}

function createOperatorPolicy(env = process.env) {
  const mode = oneOf(
    'OPERATOR_POLICY_MODE',
    String(env.OPERATOR_POLICY_MODE || 'open').trim().toLowerCase(),
    POLICY_MODES
  );

  // Keep ENFORCE_CREDENTIALS as a migration alias. New deployments should
  // use the explicit admission mode because a boolean cannot describe a
  // manually verified fleet roster or a combined policy.
  const legacyCredentials = String(env.ENFORCE_CREDENTIALS || '').toLowerCase() === 'true';
  const defaultAdmission = legacyCredentials
    ? 'credentials'
    : (mode === 'regulated' ? 'allowlist_and_credentials' : 'open');
  const admissionMode = oneOf(
    'OPERATOR_ADMISSION_MODE',
    String(env.OPERATOR_ADMISSION_MODE || defaultAdmission).trim().toLowerCase(),
    ADMISSION_MODES
  );
  const allowedDrivers = new Set(csv(env.OPERATOR_ALLOWED_DRIVERS));
  const needsAllowlist = admissionMode === 'allowlist'
    || admissionMode === 'allowlist_and_credentials';

  if (mode === 'regulated' && needsAllowlist && allowedDrivers.size === 0) {
    throw new Error(
      'A regulated allowlist policy needs OPERATOR_ALLOWED_DRIVERS; refusing to advertise an empty or unenforced verified fleet'
    );
  }

  const recordMode = oneOf(
    'OPERATOR_RECORD_MODE',
    String(env.OPERATOR_RECORD_MODE || (env.DATABASE_URL ? 'durable' : 'ephemeral'))
      .trim().toLowerCase(),
    RECORD_MODES
  );

  return {
    schema: POLICY_SCHEMA,
    mode,
    admissionMode,
    allowedDrivers,
    recordMode,
    termsUrl: String(env.OPERATOR_TERMS_URL || '').trim() || null,
    privacyUrl: String(env.OPERATOR_PRIVACY_URL || '').trim() || null,
    contact: String(env.OPERATOR_CONTACT || '').trim() || null
  };
}

function admissionNeedsAllowlist(policy) {
  return policy.admissionMode === 'allowlist'
    || policy.admissionMode === 'allowlist_and_credentials';
}

function admissionNeedsCredentials(policy) {
  return policy.admissionMode === 'credentials'
    || policy.admissionMode === 'allowlist_and_credentials';
}

/** Evaluate already-sanitised declarations against operator policy. */
function evaluateDriverAdmission(policy, { pubkey, npub, credentials = [], requiredCredentials = [] }) {
  const identifiers = [pubkey, npub]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());
  const allowlisted = identifiers.some((id) => policy.allowedDrivers.has(id));
  const held = new Set(credentials.map((credential) => credential.id));
  const missingCredentials = requiredCredentials.filter((id) => !held.has(id));
  const missingAllowlist = admissionNeedsAllowlist(policy) && !allowlisted;
  const credentialsMissing = admissionNeedsCredentials(policy) && missingCredentials.length > 0;

  return {
    allowed: !missingAllowlist && !credentialsMissing,
    missingAllowlist,
    missingCredentials: credentialsMissing ? missingCredentials : []
  };
}

function publicOperatorPolicy(policy, { requiredCredentials = [], storageBackend = null } = {}) {
  const assurance = policy.admissionMode === 'allowlist'
    ? 'operator_roster'
    : policy.admissionMode === 'credentials'
      ? 'self_attested'
      : policy.admissionMode === 'allowlist_and_credentials'
        ? 'operator_roster_and_self_attested'
        : 'none';

  return {
    schema: policy.schema,
    mode: policy.mode,
    admission: {
      mode: policy.admissionMode,
      assurance,
      requiredCredentials: admissionNeedsCredentials(policy) ? requiredCredentials : [],
      allowlistSize: admissionNeedsAllowlist(policy) ? policy.allowedDrivers.size : null,
      note: assurance.includes('operator_roster')
        ? 'The operator controls its own driver roster. DonkeyRide does not issue or verify licences.'
        : assurance === 'self_attested'
          ? 'Credential declarations are self-attested; this operator has not independently verified them.'
          : 'Any driver identity may offer service through this operator.'
    },
    records: {
      mode: policy.recordMode,
      backend: storageBackend || (policy.recordMode === 'durable' ? 'configured' : 'memory_and_encrypted_relay')
    },
    termsUrl: policy.termsUrl,
    privacyUrl: policy.privacyUrl,
    contact: policy.contact
  };
}

module.exports = {
  POLICY_SCHEMA,
  createOperatorPolicy,
  evaluateDriverAdmission,
  publicOperatorPolicy,
  admissionNeedsAllowlist,
  admissionNeedsCredentials
};
