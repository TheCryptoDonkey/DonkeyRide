const { getPublicKey, getEventHash, getSignature } = require('nostr-tools');
const { KINDS, EXPERIMENTAL } = require('./kinds');

let operatorPrivkey = null;
let operatorPubkey = null;
let publisher = null;

const VALID_DISPUTE_TYPES = ['payment', 'conduct', 'safety', 'quality', 'no_show'];
const VALID_OUTCOMES = ['refund', 'partial_refund', 'penalty', 'mutual_cancellation', 'dismissed', 'escalation'];
const VALID_ARBITER_TYPES = ['operator', 'third_party', 'guardian', 'automated'];
const VALID_VOTES = ['approve', 'reject', 'abstain'];
const VALID_STAKE_EFFECTS = ['released', 'forfeited', 'partial_forfeit', 'held'];

function configure({ operatorPrivkey: privkey, publishGeneric }) {
  operatorPrivkey = null;
  operatorPubkey = null;
  publisher = null;

  if (!privkey) {
    console.warn('[DisputeEvents] Operator privkey not configured \u2013 dispute events will remain local only.');
    return;
  }

  if (typeof publishGeneric !== 'function') {
    console.warn('[DisputeEvents] Publisher not configured \u2013 dispute events will remain local only.');
    return;
  }

  try {
    operatorPrivkey = privkey.toLowerCase();
    operatorPubkey = getPublicKey(operatorPrivkey);
    publisher = publishGeneric;
    console.log('[DisputeEvents] Dispute event publisher enabled.');
  } catch (error) {
    operatorPrivkey = null;
    operatorPubkey = null;
    publisher = null;
    console.warn('[DisputeEvents] Failed to initialise publisher:', error.message);
  }
}

function canPublish() {
  return Boolean(operatorPrivkey && operatorPubkey && typeof publisher === 'function');
}

function buildEvent(kind, tags = [], content = '') {
  if (!canPublish()) {
    return null;
  }

  const event = {
    kind,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
    pubkey: operatorPubkey
  };

  event.id = getEventHash(event);
  event.sig = getSignature(event, operatorPrivkey);
  return event;
}

async function publishEvent(kind, tags, content) {
  const event = buildEvent(kind, tags, content);
  if (!event) {
    return null;
  }
  try {
    await publisher(event, operatorPubkey);
  } catch (error) {
    console.warn('[DisputeEvents] Failed to publish event:', error.message);
  }
  return event;
}

async function publishDisputeFiling({
  disputeId,
  domain,
  taskId,
  complainantPubkey,
  accusedPubkey,
  disputeType,
  amount,
  currency,
  evidenceType,
  evidence,
  content = ''
}) {
  const tags = [
    ['d', disputeId],
    ['domain', domain],
    ['task_id', taskId],
    ['complainant_pubkey', complainantPubkey],
    ['accused_pubkey', accusedPubkey],
    ['dispute_type', disputeType]
  ];
  if (amount != null) {
    tags.push(['amount', String(amount)]);
  }
  if (currency) {
    tags.push(['currency', currency]);
  }
  if (evidenceType) {
    tags.push(['evidence_type', evidenceType]);
  }
  if (evidence) {
    tags.push(['evidence', evidence]);
  }
  return publishEvent(KINDS.DISPUTE_CLAIM, tags, content);
}

async function publishArbiterAssignment({
  disputeId,
  arbiterPubkey,
  arbiterType,
  deadline
}) {
  const assignedAt = Math.floor(Date.now() / 1000);
  const tags = [
    ['d', `${disputeId}_arbiter`],
    ['status', 'assigned'],
    ['dispute_id', disputeId],
    ['arbiter_pubkey', arbiterPubkey],
    ['arbiter_type', arbiterType],
    ['assigned_at', String(assignedAt)]
  ];
  if (deadline) {
    tags.push(['deadline', String(deadline)]);
  }
  return publishEvent(KINDS.DISPUTE_RESOLUTION, tags, '');
}

async function publishDisputeResolution({
  disputeId,
  outcome,
  arbiterPubkey,
  amount,
  currency,
  complainantStake,
  accusedStake,
  forfeitAmount,
  reasoning = ''
}) {
  const resolvedAt = Math.floor(Date.now() / 1000);
  const tags = [
    ['d', `${disputeId}_resolution`],
    ['status', 'resolved'],
    ['dispute_id', disputeId],
    ['outcome', outcome],
    ['arbiter_pubkey', arbiterPubkey],
    ['resolved_at', String(resolvedAt)]
  ];
  if (amount != null) {
    tags.push(['amount', String(amount)]);
  }
  if (currency) {
    tags.push(['currency', currency]);
  }
  if (complainantStake) {
    tags.push(['complainant_stake', complainantStake]);
  }
  if (accusedStake) {
    tags.push(['accused_stake', accusedStake]);
  }
  if (forfeitAmount != null) {
    tags.push(['forfeit_amount', String(forfeitAmount)]);
  }
  if (reasoning) {
    tags.push(['reasoning', reasoning]);
  }
  return publishEvent(KINDS.DISPUTE_RESOLUTION, tags, reasoning);
}

async function publishSuspiciousActivity({
  suspectPubkey,
  activityType,
  domain,
  description,
  confidence,
  evidence
}) {
  const tags = [
    ['d', `suspicious_${Date.now().toString(36)}`],
    ['report_type', 'suspicious_activity'],
    ['p', suspectPubkey],
    ['activity_type', activityType],
    ['domain', domain]
  ];
  if (description) {
    tags.push(['description', description]);
  }
  if (confidence != null) {
    tags.push(['confidence', String(confidence)]);
  }
  if (evidence) {
    tags.push(['evidence', evidence]);
  }
  return publishEvent(KINDS.ABUSE_REPORT, tags, description || '');
}

async function publishAccountSuspension({
  pubkey,
  reason,
  duration,
  effectiveFrom
}) {
  const tags = [
    ['d', `${pubkey}_suspension`],
    ['p', pubkey],
    ['reason', reason]
  ];
  if (duration) {
    tags.push(['duration', String(duration)]);
  }
  if (effectiveFrom) {
    tags.push(['effective_from', String(effectiveFrom)]);
  }
  return publishEvent(EXPERIMENTAL.ACCOUNT_SUSPENSION, tags, reason || '');
}

async function publishAppealRequest({
  appealId,
  resolutionEventId,
  appellantPubkey,
  appealType,
  defence,
  evidence
}) {
  const tags = [
    ['d', appealId],
    ['e', resolutionEventId],
    ['appellant_pubkey', appellantPubkey],
    ['appeal_type', appealType || 'standard']
  ];
  if (defence) {
    tags.push(['defence', defence]);
  }
  if (evidence) {
    tags.push(['evidence', evidence]);
  }
  return publishEvent(EXPERIMENTAL.APPEAL_REQUEST, tags, defence || '');
}

async function publishTheftReport({
  reportId,
  operatorPubkey: opPubkey,
  lockEventId,
  completionEventId,
  overdueSeconds,
  taskId,
  amount,
  currency,
  reporterRole
}) {
  const tags = [
    ['d', reportId],
    ['report_type', 'operator_theft'],
    ['operator', opPubkey],
    ['lock_event', lockEventId],
    ['completion_event', completionEventId],
    ['overdue_seconds', String(overdueSeconds)]
  ];
  if (taskId) {
    tags.push(['task_id', taskId]);
  }
  if (amount != null) {
    tags.push(['amount', String(amount)]);
  }
  if (currency) {
    tags.push(['currency', currency]);
  }
  if (reporterRole) {
    tags.push(['reporter_role', reporterRole]);
  }
  return publishEvent(KINDS.ABUSE_REPORT, tags, '');
}

async function publishWatchdogClaim({
  claimId,
  theftReportEventId,
  operatorPubkey: opPubkey,
  verified,
  verifierPubkey,
  verificationMethod
}) {
  const checkedAt = Math.floor(Date.now() / 1000);
  const tags = [
    ['d', claimId],
    ['e', theftReportEventId],
    ['operator', opPubkey],
    ['verified', String(verified)],
    ['verifier_pubkey', verifierPubkey],
    ['verification_method', verificationMethod || 'manual'],
    ['checked_at', String(checkedAt)]
  ];
  return publishEvent(EXPERIMENTAL.WATCHDOG_CLAIM, tags, '');
}

async function publishOperatorSlashing({
  slashingId,
  operatorPubkey: opPubkey,
  slashAmount,
  slashCurrency,
  guardianVotes,
  theftReportEventId,
  proposalEventId,
  victims,
  distribution
}) {
  const tags = [
    ['d', slashingId],
    ['operator', opPubkey],
    ['slash_amount', String(slashAmount)],
    ['slash_currency', slashCurrency],
    ['guardian_votes', String(guardianVotes)]
  ];
  if (theftReportEventId) {
    tags.push(['e', theftReportEventId]);
  }
  if (proposalEventId) {
    tags.push(['proposal_event', proposalEventId]);
  }
  if (victims) {
    tags.push(['victims', victims]);
  }
  if (distribution) {
    tags.push(['distribution', distribution]);
  }
  return publishEvent(EXPERIMENTAL.OPERATOR_SLASHING, tags, '');
}

async function publishSlashingProposal({
  proposalId,
  operatorPubkey: opPubkey,
  proposedBy,
  slashAmount,
  slashCurrency,
  threshold,
  theftReportEventId,
  bondEventId,
  deadline,
  victims,
  distributionProposal
}) {
  const tags = [
    ['d', proposalId],
    ['operator', opPubkey],
    ['proposed_by', proposedBy],
    ['slash_amount', String(slashAmount)],
    ['slash_currency', slashCurrency],
    ['threshold', String(threshold)]
  ];
  if (theftReportEventId) {
    tags.push(['e', theftReportEventId]);
  }
  if (bondEventId) {
    tags.push(['bond_event', bondEventId]);
  }
  if (deadline) {
    tags.push(['deadline', String(deadline)]);
  }
  if (victims) {
    tags.push(['victims', victims]);
  }
  if (distributionProposal) {
    tags.push(['distribution_proposal', distributionProposal]);
  }
  return publishEvent(EXPERIMENTAL.SLASHING_PROPOSAL, tags, '');
}

async function publishGuardianVote({
  voteId,
  proposalEventId,
  guardianPubkey,
  vote,
  operatorPubkey: opPubkey,
  reasoning
}) {
  const tags = [
    ['d', voteId],
    ['e', proposalEventId],
    ['guardian_pubkey', guardianPubkey],
    ['vote', vote],
    ['operator', opPubkey]
  ];
  if (reasoning) {
    tags.push(['reasoning', reasoning]);
  }
  return publishEvent(EXPERIMENTAL.GUARDIAN_VOTE, tags, reasoning || '');
}

async function publishOperatorBond({
  amount,
  currency,
  trustModel,
  guardianThreshold,
  feePercent,
  serviceArea,
  expiration
}) {
  if (!canPublish()) {
    return null;
  }
  const tags = [
    ['d', `${operatorPubkey}_bond`],
    ['t', 'trott-operator'],
    ['operator_pubkey', operatorPubkey],
    ['amount', String(amount)],
    ['currency', currency],
    ['trust_model', trustModel || 'custodial']
  ];
  if (guardianThreshold != null) {
    tags.push(['guardian_threshold', String(guardianThreshold)]);
  }
  if (feePercent != null) {
    tags.push(['fee_percent', String(feePercent)]);
  }
  if (serviceArea) {
    tags.push(['service_area', serviceArea]);
  }
  if (expiration) {
    tags.push(['expiration', String(expiration)]);
  }
  return publishEvent(KINDS.OPERATOR_BOND, tags, '');
}

module.exports = {
  configure,
  canPublish,
  publishDisputeFiling,
  publishArbiterAssignment,
  publishDisputeResolution,
  publishSuspiciousActivity,
  publishAccountSuspension,
  publishAppealRequest,
  publishTheftReport,
  publishWatchdogClaim,
  publishOperatorSlashing,
  publishSlashingProposal,
  publishGuardianVote,
  publishOperatorBond,
  VALID_DISPUTE_TYPES,
  VALID_OUTCOMES,
  VALID_ARBITER_TYPES,
  VALID_VOTES,
  VALID_STAKE_EFFECTS
};
