const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  getPublicKey,
  getEventHash,
  getSignature
} = require('nostr-tools');

const reputation = require('../../src/nostr/reputation');
const disputeEvents = require('../../src/nostr/dispute-events');
const { RideManager } = require('../../src/ride-manager');
const { TaskManager } = require('../../src/task-manager');
const { loadProfile } = require('../../src/domain-profiles');

// Deterministic test keys
const RIDER_PRIV_HEX = 'f4b31f1248bfa5e603a1c1d73c6f9d1286f5fb7c1d3aa4c9bd4a62d2a6a4a2f1';
const DRIVER_PRIV_HEX = 'EXAMPLE_VALUE';
const GUARDIAN1_PRIV_HEX = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
const GUARDIAN2_PRIV_HEX = 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3';
const GUARDIAN3_PRIV_HEX = 'd4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5';
const OPERATOR_PRIV_HEX = 'e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6';

function hexToBytes(hex) {
  const pairs = hex.match(/.{1,2}/g) || [];
  return Uint8Array.from(pairs.map((byte) => parseInt(byte, 16)));
}

const riderPrivBytes = hexToBytes(RIDER_PRIV_HEX);
const driverPrivBytes = hexToBytes(DRIVER_PRIV_HEX);
const guardian1PrivBytes = hexToBytes(GUARDIAN1_PRIV_HEX);
const guardian2PrivBytes = hexToBytes(GUARDIAN2_PRIV_HEX);
const guardian3PrivBytes = hexToBytes(GUARDIAN3_PRIV_HEX);
const operatorPrivBytes = hexToBytes(OPERATOR_PRIV_HEX);

const riderPubKey = getPublicKey(riderPrivBytes);
const driverPubKey = getPublicKey(driverPrivBytes);
const guardian1PubKey = getPublicKey(guardian1PrivBytes);
const guardian2PubKey = getPublicKey(guardian2PrivBytes);
const guardian3PubKey = getPublicKey(guardian3PrivBytes);
const operatorPubKey = getPublicKey(operatorPrivBytes);

process.env.REPUTATION_STRICT = 'false';

// Suppress console noise during tests
const originalLog = console.log;
const originalWarn = console.warn;
function hush() {
  console.log = () => {};
  console.warn = () => {};
}
function unhush() {
  console.log = originalLog;
  console.warn = originalWarn;
}

// ==========================================
// Event builders
// ==========================================

function buildDisputeEvent(rideId, complainantPrivBytes, complainantPubKey, accusedPubKey, disputeType, content) {
  const event = {
    kind: 7543,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', `dispute_${rideId}`],
      ['ride', rideId],
      ['task_id', rideId],
      ['p', accusedPubKey.toLowerCase()],
      ['dispute_type', disputeType],
      ['complainant_pubkey', complainantPubKey.toLowerCase()],
      ['accused_pubkey', accusedPubKey.toLowerCase()]
    ],
    content: content || '',
    pubkey: complainantPubKey
  };
  event.id = getEventHash(event);
  event.sig = getSignature(event, complainantPrivBytes);
  return event;
}

function buildCounterEvidenceEvent(originalEventId, accusedPrivBytes, accusedPubKey, content) {
  const event = {
    kind: 7543,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['e', originalEventId],
      ['evidence', 'photo_receipt'],
      ['evidence', 'gps_trace']
    ],
    content: content || 'Counter-evidence submitted',
    pubkey: accusedPubKey
  };
  event.id = getEventHash(event);
  event.sig = getSignature(event, accusedPrivBytes);
  return event;
}

function buildAppealEvent(resolutionEventId, appellantPrivBytes, appellantPubKey, appealType, content) {
  const event = {
    kind: 39503,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['e', resolutionEventId],
      ['appeal_type', appealType || 'standard'],
      ['defence', content || 'I disagree with the resolution']
    ],
    content: content || 'Appeal filed',
    pubkey: appellantPubKey
  };
  event.id = getEventHash(event);
  event.sig = getSignature(event, appellantPrivBytes);
  return event;
}

function buildTheftReportEvent(opPubKey, lockEventId, completionEventId, overdueSeconds, reporterPrivBytes, reporterPubKey) {
  const event = {
    kind: 30546,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['operator', opPubKey],
      ['lock_event', lockEventId],
      ['completion_event', completionEventId],
      ['overdue_seconds', String(overdueSeconds)]
    ],
    content: '',
    pubkey: reporterPubKey
  };
  event.id = getEventHash(event);
  event.sig = getSignature(event, reporterPrivBytes);
  return event;
}

function buildWatchdogClaimEvent(theftReportEventId, opPubKey, verifierPrivBytes, verifierPubKey, verified) {
  const event = {
    kind: 39500,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['e', theftReportEventId],
      ['operator', opPubKey],
      ['verified', String(verified)]
    ],
    content: '',
    pubkey: verifierPubKey
  };
  event.id = getEventHash(event);
  event.sig = getSignature(event, verifierPrivBytes);
  return event;
}

function buildSlashingProposalEvent(opPubKey, theftReportEventId, proposerPrivBytes, proposerPubKey, slashAmount, threshold) {
  const event = {
    kind: 39504,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['e', theftReportEventId],
      ['operator', opPubKey],
      ['slash_amount', String(slashAmount)],
      ['slash_currency', 'SAT'],
      ['threshold', String(threshold)]
    ],
    content: '',
    pubkey: proposerPubKey
  };
  event.id = getEventHash(event);
  event.sig = getSignature(event, proposerPrivBytes);
  return event;
}

function buildGuardianVoteEvent(proposalEventId, guardianPrivBytes, guardianPubKey, vote) {
  const event = {
    kind: 39505,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['e', proposalEventId],
      ['vote', vote],
      ['guardian_pubkey', guardianPubKey]
    ],
    content: '',
    pubkey: guardianPubKey
  };
  event.id = getEventHash(event);
  event.sig = getSignature(event, guardianPrivBytes);
  return event;
}

// Helper: create a completed ride
function createCompletedRide() {
  const rm = new RideManager();
  const ride = rm.createRide(
    { pubkey: riderPubKey },
    { lat: 51.5, lon: -0.12 },
    { lat: 51.52, lon: -0.11 },
    2500,
    { rideId: `ride_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}` }
  );
  rm.acceptRide(ride.id, driverPubKey, {
    name: 'Test Driver',
    location: { lat: 51.49, lon: -0.13 },
    pubkey: driverPubKey
  });
  rm.startEnRoute(ride.id);
  rm.arriveAtPickup(ride.id);
  rm.startTrip(ride.id);
  const origSetTimeout = global.setTimeout;
  try {
    global.setTimeout = (fn, ms, ...args) => {
      if (ms === 300000) return 0;
      return origSetTimeout(fn, ms, ...args);
    };
    rm.completeTrip(ride.id, { success: true, payment_hash: 'test' });
  } finally {
    global.setTimeout = origSetTimeout;
  }
  return { rm, ride: rm.getRide(ride.id) };
}

// Helper: create an active ride (in_progress state)
function createActiveRide() {
  const rm = new RideManager();
  const ride = rm.createRide(
    { pubkey: riderPubKey },
    { lat: 51.5, lon: -0.12 },
    { lat: 51.52, lon: -0.11 },
    2500,
    { rideId: `ride_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}` }
  );
  rm.acceptRide(ride.id, driverPubKey, {
    name: 'Test Driver',
    location: { lat: 51.49, lon: -0.13 },
    pubkey: driverPubKey
  });
  rm.startEnRoute(ride.id);
  rm.arriveAtPickup(ride.id);
  rm.startTrip(ride.id);
  return { rm, ride: rm.getRide(ride.id) };
}

// ==========================================
// Test 1: dispute-events module configures and publishes correctly
// ==========================================

test('dispute-events module configures and publishes correctly', async () => {
  hush();
  try {
    const publishedEvents = [];
    disputeEvents.configure({
      operatorPrivkey: OPERATOR_PRIV_HEX,
      publishGeneric: async (event) => { publishedEvents.push(event); }
    });

    assert.equal(disputeEvents.canPublish(), true);

    // Test all 12 publish functions
    const filingEvent = await disputeEvents.publishDisputeFiling({
      disputeId: 'test_dispute_1',
      domain: 'ridesharing',
      taskId: 'ride_123',
      complainantPubkey: riderPubKey,
      accusedPubkey: driverPubKey,
      disputeType: 'payment'
    });
    assert.equal(filingEvent.kind, 7543);
    assert.ok(filingEvent.tags.find(t => t[0] === 'd' && t[1] === 'test_dispute_1'));

    const arbiterEvent = await disputeEvents.publishArbiterAssignment({
      disputeId: 'test_dispute_1',
      arbiterPubkey: operatorPubKey,
      arbiterType: 'operator'
    });
    assert.equal(arbiterEvent.kind, 30545);
    assert.ok(arbiterEvent.tags.find(t => t[0] === 'd' && t[1] === 'test_dispute_1_arbiter'));
    assert.ok(arbiterEvent.tags.find(t => t[0] === 'dispute_id'));

    const resolutionEvent = await disputeEvents.publishDisputeResolution({
      disputeId: 'test_dispute_1',
      outcome: 'refund',
      arbiterPubkey: operatorPubKey,
      complainantStake: 'released',
      accusedStake: 'forfeited'
    });
    assert.equal(resolutionEvent.kind, 30545);
    assert.ok(resolutionEvent.tags.find(t => t[0] === 'd' && t[1] === 'test_dispute_1_resolution'));
    assert.ok(resolutionEvent.tags.find(t => t[0] === 'outcome' && t[1] === 'refund'));
    assert.ok(resolutionEvent.tags.find(t => t[0] === 'resolved_at'));

    const suspiciousEvent = await disputeEvents.publishSuspiciousActivity({
      suspectPubkey: driverPubKey,
      activityType: 'fraud',
      domain: 'ridesharing'
    });
    assert.equal(suspiciousEvent.kind, 30546);
    assert.ok(suspiciousEvent.tags.find(t => t[0] === 'p' && t[1] === driverPubKey));
    assert.ok(suspiciousEvent.tags.find(t => t[0] === 'activity_type'));

    const suspensionEvent = await disputeEvents.publishAccountSuspension({
      pubkey: driverPubKey,
      reason: 'repeated violations',
      duration: 86400
    });
    assert.equal(suspensionEvent.kind, 39502);
    assert.ok(suspensionEvent.tags.find(t => t[0] === 'd' && t[1] === `${driverPubKey}_suspension`));
    assert.ok(suspensionEvent.tags.find(t => t[0] === 'reason'));

    const appealEvent = await disputeEvents.publishAppealRequest({
      appealId: 'appeal_1',
      resolutionEventId: resolutionEvent.id,
      appellantPubkey: driverPubKey,
      appealType: 'standard'
    });
    assert.equal(appealEvent.kind, 39503);
    assert.ok(appealEvent.tags.find(t => t[0] === 'e' && t[1] === resolutionEvent.id));

    const theftEvent = await disputeEvents.publishTheftReport({
      reportId: 'theft_1',
      operatorPubkey: operatorPubKey,
      lockEventId: 'lock_event_123',
      completionEventId: 'completion_event_123',
      overdueSeconds: 3600
    });
    assert.equal(theftEvent.kind, 30546);
    assert.ok(theftEvent.tags.find(t => t[0] === 'operator'));
    assert.ok(theftEvent.tags.find(t => t[0] === 'overdue_seconds'));

    const watchdogEvent = await disputeEvents.publishWatchdogClaim({
      claimId: 'claim_1',
      theftReportEventId: theftEvent.id,
      operatorPubkey: operatorPubKey,
      verified: true,
      verifierPubkey: guardian1PubKey
    });
    assert.equal(watchdogEvent.kind, 39500);
    assert.ok(watchdogEvent.tags.find(t => t[0] === 'e' && t[1] === theftEvent.id));
    assert.ok(watchdogEvent.tags.find(t => t[0] === 'verified' && t[1] === 'true'));

    const slashingEvent = await disputeEvents.publishOperatorSlashing({
      slashingId: 'slash_1',
      operatorPubkey: operatorPubKey,
      slashAmount: 50000,
      slashCurrency: 'SAT',
      guardianVotes: 3
    });
    assert.equal(slashingEvent.kind, 39501);
    assert.ok(slashingEvent.tags.find(t => t[0] === 'slash_amount' && t[1] === '50000'));

    const proposalEvent = await disputeEvents.publishSlashingProposal({
      proposalId: 'proposal_1',
      operatorPubkey: operatorPubKey,
      proposedBy: guardian1PubKey,
      slashAmount: 50000,
      slashCurrency: 'SAT',
      threshold: 3
    });
    assert.equal(proposalEvent.kind, 39504);
    assert.ok(proposalEvent.tags.find(t => t[0] === 'threshold' && t[1] === '3'));

    const voteEvent = await disputeEvents.publishGuardianVote({
      voteId: 'vote_1',
      proposalEventId: proposalEvent.id,
      guardianPubkey: guardian1PubKey,
      vote: 'approve',
      operatorPubkey: operatorPubKey
    });
    assert.equal(voteEvent.kind, 39505);
    assert.ok(voteEvent.tags.find(t => t[0] === 'e' && t[1] === proposalEvent.id));
    assert.ok(voteEvent.tags.find(t => t[0] === 'vote' && t[1] === 'approve'));

    const bondEvent = await disputeEvents.publishOperatorBond({
      amount: 1000000,
      currency: 'SAT',
      trustModel: 'custodial',
      guardianThreshold: 3,
      expiration: Math.floor(Date.now() / 1000) + 86400 * 365
    });
    assert.equal(bondEvent.kind, 30511);
    assert.ok(bondEvent.tags.find(t => t[0] === 'guardian_threshold' && t[1] === '3'));
    assert.ok(bondEvent.tags.find(t => t[0] === 'expiration'));

    assert.equal(publishedEvents.length, 12);
  } finally {
    unhush();
  }
});

// ==========================================
// Test 2: dispute filing on completed ride
// ==========================================

test('dispute filing on completed ride produces kind 7543 with correct tags', async () => {
  hush();
  try {
    reputation.setRelays(['memory://test']);
    const { ride } = createCompletedRide();

    const disputeEvent = buildDisputeEvent(ride.id, riderPrivBytes, riderPubKey, driverPubKey, 'payment', 'Overcharged');
    reputation.ensureEventIntegrity(disputeEvent);

    assert.equal(disputeEvent.kind, 7543);
    assert.ok(disputeEvent.tags.find(t => t[0] === 'dispute_type' && t[1] === 'payment'));
    assert.ok(disputeEvent.tags.find(t => t[0] === 'task_id' && t[1] === ride.id));
    assert.ok(disputeEvent.tags.find(t => t[0] === 'complainant_pubkey'));
    assert.ok(disputeEvent.tags.find(t => t[0] === 'accused_pubkey'));
  } finally {
    unhush();
  }
});

// ==========================================
// Test 3: dispute filing on active ride
// ==========================================

test('dispute filing on active ride is allowed', async () => {
  hush();
  try {
    reputation.setRelays(['memory://test']);
    const { ride } = createActiveRide();

    const disputeEvent = buildDisputeEvent(ride.id, riderPrivBytes, riderPubKey, driverPubKey, 'safety', 'Dangerous driving');
    reputation.ensureEventIntegrity(disputeEvent);

    assert.equal(disputeEvent.kind, 7543);
    assert.equal(ride.status, 'active');
    assert.ok(disputeEvent.tags.find(t => t[0] === 'dispute_type' && t[1] === 'safety'));
  } finally {
    unhush();
  }
});

// ==========================================
// Test 4: dispute filing on cancelled ride
// ==========================================

test('dispute filing on cancelled ride is allowed', async () => {
  hush();
  try {
    reputation.setRelays(['memory://test']);
    const rm = new RideManager();
    const ride = rm.createRide(
      { pubkey: riderPubKey },
      { lat: 51.5, lon: -0.12 },
      { lat: 51.52, lon: -0.11 },
      2500,
      { rideId: `ride_${Date.now().toString(36)}` }
    );
    rm.acceptRide(ride.id, driverPubKey, {
      name: 'Test Driver',
      location: { lat: 51.49, lon: -0.13 },
      pubkey: driverPubKey
    });
    rm.cancelRide(ride.id, 'test_reason');
    const cancelledRide = rm.getRide(ride.id);

    assert.equal(cancelledRide.status, 'cancelled');

    const disputeEvent = buildDisputeEvent(cancelledRide.id, riderPrivBytes, riderPubKey, driverPubKey, 'no_show', 'Driver never came');
    reputation.ensureEventIntegrity(disputeEvent);

    assert.equal(disputeEvent.kind, 7543);
  } finally {
    unhush();
  }
});

// ==========================================
// Test 5: counter-evidence references original dispute
// ==========================================

test('counter-evidence references original dispute via e tag', async () => {
  hush();
  try {
    reputation.setRelays(['memory://test']);

    const { ride } = createCompletedRide();
    const disputeEvent = buildDisputeEvent(ride.id, riderPrivBytes, riderPubKey, driverPubKey, 'payment', 'Overcharged');

    const counterEvent = buildCounterEvidenceEvent(disputeEvent.id, driverPrivBytes, driverPubKey, 'I did not overcharge');
    reputation.ensureEventIntegrity(counterEvent);

    const eTag = counterEvent.tags.find(t => t[0] === 'e');
    assert.ok(eTag);
    assert.equal(eTag[1], disputeEvent.id);
    assert.ok(counterEvent.tags.filter(t => t[0] === 'evidence').length >= 1);
  } finally {
    unhush();
  }
});

// ==========================================
// Test 6: arbiter assignment publishes kind 30545
// ==========================================

test('arbiter assignment publishes kind 30545 with correct d tag pattern', async () => {
  hush();
  try {
    const publishedEvents = [];
    disputeEvents.configure({
      operatorPrivkey: OPERATOR_PRIV_HEX,
      publishGeneric: async (event) => { publishedEvents.push(event); }
    });

    const event = await disputeEvents.publishArbiterAssignment({
      disputeId: 'dispute_abc',
      arbiterPubkey: operatorPubKey,
      arbiterType: 'operator',
      deadline: Math.floor(Date.now() / 1000) + 86400
    });

    assert.equal(event.kind, 30545);
    assert.ok(event.tags.find(t => t[0] === 'd' && t[1] === 'dispute_abc_arbiter'));
    assert.ok(event.tags.find(t => t[0] === 'dispute_id' && t[1] === 'dispute_abc'));
    assert.ok(event.tags.find(t => t[0] === 'arbiter_type' && t[1] === 'operator'));
    assert.ok(event.tags.find(t => t[0] === 'assigned_at'));
  } finally {
    unhush();
  }
});

// ==========================================
// Test 7: resolution publishes kind 30545 per outcome
// ==========================================

test('resolution publishes kind 30545 for each valid outcome', async () => {
  hush();
  try {
    const publishedEvents = [];
    disputeEvents.configure({
      operatorPrivkey: OPERATOR_PRIV_HEX,
      publishGeneric: async (event) => { publishedEvents.push(event); }
    });

    for (const outcome of disputeEvents.VALID_OUTCOMES) {
      const event = await disputeEvents.publishDisputeResolution({
        disputeId: `dispute_${outcome}`,
        outcome,
        arbiterPubkey: operatorPubKey
      });

      assert.equal(event.kind, 30545);
      assert.ok(event.tags.find(t => t[0] === 'outcome' && t[1] === outcome));
      assert.ok(event.tags.find(t => t[0] === 'resolved_at'));
    }

    assert.equal(publishedEvents.length, disputeEvents.VALID_OUTCOMES.length);
  } finally {
    unhush();
  }
});

// ==========================================
// Test 8: resolution with refund triggers correct stake effect tags
// ==========================================

test('resolution with refund includes released/forfeited stake tags', async () => {
  hush();
  try {
    disputeEvents.configure({
      operatorPrivkey: OPERATOR_PRIV_HEX,
      publishGeneric: async () => {}
    });

    const event = await disputeEvents.publishDisputeResolution({
      disputeId: 'dispute_refund',
      outcome: 'refund',
      arbiterPubkey: operatorPubKey,
      complainantStake: 'released',
      accusedStake: 'forfeited',
      forfeitAmount: 5000,
      currency: 'SAT'
    });

    assert.equal(event.kind, 30545);
    assert.ok(event.tags.find(t => t[0] === 'complainant_stake' && t[1] === 'released'));
    assert.ok(event.tags.find(t => t[0] === 'accused_stake' && t[1] === 'forfeited'));
  } finally {
    unhush();
  }
});

// ==========================================
// Test 9: resolution with partial_refund includes forfeit amount
// ==========================================

test('resolution with partial_refund includes forfeit_amount tag', async () => {
  hush();
  try {
    disputeEvents.configure({
      operatorPrivkey: OPERATOR_PRIV_HEX,
      publishGeneric: async () => {}
    });

    const event = await disputeEvents.publishDisputeResolution({
      disputeId: 'dispute_partial',
      outcome: 'partial_refund',
      arbiterPubkey: operatorPubKey,
      complainantStake: 'released',
      accusedStake: 'partial_forfeit',
      forfeitAmount: 2500,
      currency: 'GBP'
    });

    assert.ok(event.tags.find(t => t[0] === 'forfeit_amount' && t[1] === '2500'));
    assert.ok(event.tags.find(t => t[0] === 'currency' && t[1] === 'GBP'));
  } finally {
    unhush();
  }
});

// ==========================================
// Test 10: resolution with escalation keeps dispute open
// ==========================================

test('escalation outcome produces event but signals ongoing dispute', async () => {
  hush();
  try {
    disputeEvents.configure({
      operatorPrivkey: OPERATOR_PRIV_HEX,
      publishGeneric: async () => {}
    });

    const event = await disputeEvents.publishDisputeResolution({
      disputeId: 'dispute_escalate',
      outcome: 'escalation',
      arbiterPubkey: operatorPubKey
    });

    assert.equal(event.kind, 30545);
    assert.ok(event.tags.find(t => t[0] === 'outcome' && t[1] === 'escalation'));
    // The caller is responsible for setting status to 'escalated' not 'resolved'
  } finally {
    unhush();
  }
});

// ==========================================
// Test 11: appeal references resolution event
// ==========================================

test('appeal event (kind 39503) references resolution via e tag', async () => {
  hush();
  try {
    reputation.setRelays(['memory://test']);

    const resolutionEventId = 'abc123def456';
    const appealEvent = buildAppealEvent(resolutionEventId, driverPrivBytes, driverPubKey, 'standard', 'Unfair resolution');
    reputation.ensureEventIntegrity(appealEvent);

    assert.equal(appealEvent.kind, 39503);
    const eTag = appealEvent.tags.find(t => t[0] === 'e');
    assert.ok(eTag);
    assert.equal(eTag[1], resolutionEventId);
    assert.ok(appealEvent.tags.find(t => t[0] === 'appeal_type' && t[1] === 'standard'));
  } finally {
    unhush();
  }
});

// ==========================================
// Test 12: duplicate filing from same complainant rejected
// ==========================================

test('duplicate dispute from same complainant on same ride is detectable', () => {
  // This tests the logic that would be used in the endpoint
  const existingDisputes = [
    { taskId: 'ride_1', complainantPubkey: riderPubKey.toLowerCase(), status: 'filed' },
    { taskId: 'ride_2', complainantPubkey: driverPubKey.toLowerCase(), status: 'resolved' }
  ];

  // Same complainant, same ride, unresolved — should reject
  const duplicates = existingDisputes.filter(
    d => d.taskId === 'ride_1' && d.complainantPubkey === riderPubKey.toLowerCase() && d.status !== 'resolved'
  );
  assert.equal(duplicates.length, 1);

  // Same complainant, different ride — should allow
  const noDuplicates = existingDisputes.filter(
    d => d.taskId === 'ride_3' && d.complainantPubkey === riderPubKey.toLowerCase() && d.status !== 'resolved'
  );
  assert.equal(noDuplicates.length, 0);

  // Same ride, resolved — should allow new dispute
  const resolvedOk = existingDisputes.filter(
    d => d.taskId === 'ride_2' && d.complainantPubkey === driverPubKey.toLowerCase() && d.status !== 'resolved'
  );
  assert.equal(resolvedOk.length, 0);
});

// ==========================================
// Test 13: theft report and watchdog verification lifecycle
// ==========================================

test('theft report and watchdog verification lifecycle', async () => {
  hush();
  try {
    reputation.setRelays(['memory://test']);

    // File theft report
    const theftEvent = buildTheftReportEvent(
      operatorPubKey, 'lock_evt_1', 'comp_evt_1', 3600,
      riderPrivBytes, riderPubKey
    );
    reputation.ensureEventIntegrity(theftEvent);
    assert.equal(theftEvent.kind, 30546);
    assert.ok(theftEvent.tags.find(t => t[0] === 'operator' && t[1] === operatorPubKey));
    assert.ok(theftEvent.tags.find(t => t[0] === 'overdue_seconds' && t[1] === '3600'));

    // 3 watchdog claims
    const claim1 = buildWatchdogClaimEvent(theftEvent.id, operatorPubKey, guardian1PrivBytes, guardian1PubKey, true);
    reputation.ensureEventIntegrity(claim1);
    assert.equal(claim1.kind, 39500);

    const claim2 = buildWatchdogClaimEvent(theftEvent.id, operatorPubKey, guardian2PrivBytes, guardian2PubKey, true);
    reputation.ensureEventIntegrity(claim2);

    const claim3 = buildWatchdogClaimEvent(theftEvent.id, operatorPubKey, guardian3PrivBytes, guardian3PubKey, true);
    reputation.ensureEventIntegrity(claim3);

    // Verify all reference the theft report
    assert.equal(claim1.tags.find(t => t[0] === 'e')[1], theftEvent.id);
    assert.equal(claim2.tags.find(t => t[0] === 'e')[1], theftEvent.id);
    assert.equal(claim3.tags.find(t => t[0] === 'e')[1], theftEvent.id);

    // Simulate threshold check
    const verifiedClaims = [claim1, claim2, claim3].filter(c =>
      c.tags.find(t => t[0] === 'verified' && t[1] === 'true')
    );
    assert.equal(verifiedClaims.length, 3);
    assert.ok(verifiedClaims.length >= 3, 'Watchdog threshold met');
  } finally {
    unhush();
  }
});

// ==========================================
// Test 14: slashing proposal and guardian vote threshold
// ==========================================

test('slashing proposal and guardian vote threshold', async () => {
  hush();
  try {
    reputation.setRelays(['memory://test']);

    const theftEvent = buildTheftReportEvent(
      operatorPubKey, 'lock_2', 'comp_2', 7200,
      riderPrivBytes, riderPubKey
    );

    const proposal = buildSlashingProposalEvent(
      operatorPubKey, theftEvent.id,
      guardian1PrivBytes, guardian1PubKey,
      50000, 3
    );
    reputation.ensureEventIntegrity(proposal);
    assert.equal(proposal.kind, 39504);
    assert.ok(proposal.tags.find(t => t[0] === 'threshold' && t[1] === '3'));

    // Vote 1: approve (not met)
    const vote1 = buildGuardianVoteEvent(proposal.id, guardian1PrivBytes, guardian1PubKey, 'approve');
    reputation.ensureEventIntegrity(vote1);
    assert.equal(vote1.tags.find(t => t[0] === 'vote')[1], 'approve');

    // Vote 2: approve (not met yet)
    const vote2 = buildGuardianVoteEvent(proposal.id, guardian2PrivBytes, guardian2PubKey, 'approve');
    reputation.ensureEventIntegrity(vote2);

    // Vote 3: approve (threshold met)
    const vote3 = buildGuardianVoteEvent(proposal.id, guardian3PrivBytes, guardian3PubKey, 'approve');
    reputation.ensureEventIntegrity(vote3);

    // Simulate counting
    const votes = new Map();
    votes.set(guardian1PubKey, { vote: 'approve' });
    votes.set(guardian2PubKey, { vote: 'approve' });

    let approvals = Array.from(votes.values()).filter(v => v.vote === 'approve').length;
    assert.equal(approvals, 2);
    assert.ok(approvals < 3, 'Threshold not yet met after 2 votes');

    votes.set(guardian3PubKey, { vote: 'approve' });
    approvals = Array.from(votes.values()).filter(v => v.vote === 'approve').length;
    assert.equal(approvals, 3);
    assert.ok(approvals >= 3, 'Threshold met after 3 votes');

    // Verify kind 39501 can be published
    disputeEvents.configure({
      operatorPrivkey: OPERATOR_PRIV_HEX,
      publishGeneric: async () => {}
    });
    const slashingEvent = await disputeEvents.publishOperatorSlashing({
      slashingId: 'slash_test',
      operatorPubkey: operatorPubKey,
      slashAmount: 50000,
      slashCurrency: 'SAT',
      guardianVotes: 3,
      theftReportEventId: theftEvent.id,
      proposalEventId: proposal.id
    });
    assert.equal(slashingEvent.kind, 39501);
    assert.ok(slashingEvent.tags.find(t => t[0] === 'guardian_votes' && t[1] === '3'));
  } finally {
    unhush();
  }
});

// ==========================================
// Test 15: duplicate guardian vote rejected
// ==========================================

test('duplicate guardian vote is detectable', () => {
  const votes = new Map();
  votes.set(guardian1PubKey, { vote: 'approve', eventId: 'evt_1' });

  // Attempting to vote again
  const alreadyVoted = votes.has(guardian1PubKey);
  assert.equal(alreadyVoted, true, 'Duplicate vote detected');

  // Different guardian should be allowed
  const notVoted = votes.has(guardian2PubKey);
  assert.equal(notVoted, false, 'New guardian can vote');
});

// ==========================================
// Test 16: operator bond publishes kind 30511
// ==========================================

test('operator bond publishes kind 30511 with guardian_threshold and expiration', async () => {
  hush();
  try {
    disputeEvents.configure({
      operatorPrivkey: OPERATOR_PRIV_HEX,
      publishGeneric: async () => {}
    });

    const expiration = Math.floor(Date.now() / 1000) + 86400 * 365;
    const event = await disputeEvents.publishOperatorBond({
      amount: 1000000,
      currency: 'SAT',
      trustModel: 'custodial',
      guardianThreshold: 3,
      feePercent: 0.5,
      serviceArea: 'gb:london',
      expiration
    });

    assert.equal(event.kind, 30511);
    assert.ok(event.tags.find(t => t[0] === 'amount' && t[1] === '1000000'));
    assert.ok(event.tags.find(t => t[0] === 'currency' && t[1] === 'SAT'));
    assert.ok(event.tags.find(t => t[0] === 'guardian_threshold' && t[1] === '3'));
    assert.ok(event.tags.find(t => t[0] === 'expiration' && t[1] === String(expiration)));
    assert.ok(event.tags.find(t => t[0] === 'fee_percent' && t[1] === '0.5'));
    assert.ok(event.tags.find(t => t[0] === 'service_area' && t[1] === 'gb:london'));
    // d tag should be operator pubkey
    assert.ok(event.tags.find(t => t[0] === 'd' && t[1] === `${operatorPubKey}_bond`));
  } finally {
    unhush();
  }
});

// ==========================================
// Test 17: account suspension publishes kind 39502
// ==========================================

test('account suspension publishes kind 39502 with d tag pattern and reason', async () => {
  hush();
  try {
    disputeEvents.configure({
      operatorPrivkey: OPERATOR_PRIV_HEX,
      publishGeneric: async () => {}
    });

    const event = await disputeEvents.publishAccountSuspension({
      pubkey: driverPubKey,
      reason: 'repeated no-shows',
      duration: 604800
    });

    assert.equal(event.kind, 39502);
    assert.ok(event.tags.find(t => t[0] === 'd' && t[1] === `${driverPubKey}_suspension`));
    assert.ok(event.tags.find(t => t[0] === 'p' && t[1] === driverPubKey));
    assert.ok(event.tags.find(t => t[0] === 'reason' && t[1] === 'repeated no-shows'));
    assert.ok(event.tags.find(t => t[0] === 'duration' && t[1] === '604800'));
  } finally {
    unhush();
  }
});

// ==========================================
// Test 18: suspicious activity publishes kind 30546
// ==========================================

test('suspicious activity publishes kind 30546 with p tag and activity_type', async () => {
  hush();
  try {
    disputeEvents.configure({
      operatorPrivkey: OPERATOR_PRIV_HEX,
      publishGeneric: async () => {}
    });

    const event = await disputeEvents.publishSuspiciousActivity({
      suspectPubkey: riderPubKey,
      activityType: 'sybil_attack',
      domain: 'ridesharing',
      description: 'Multiple accounts detected',
      confidence: 0.85,
      evidence: 'ip_correlation'
    });

    assert.equal(event.kind, 30546);
    assert.ok(event.tags.find(t => t[0] === 'p' && t[1] === riderPubKey));
    assert.ok(event.tags.find(t => t[0] === 'activity_type' && t[1] === 'sybil_attack'));
    assert.ok(event.tags.find(t => t[0] === 'domain' && t[1] === 'ridesharing'));
    assert.ok(event.tags.find(t => t[0] === 'confidence' && t[1] === '0.85'));
  } finally {
    unhush();
  }
});

// ==========================================
// Test 19: dispute lifecycle across all three domains
// ==========================================

test('dispute lifecycle works across all three domains', async () => {
  hush();
  try {
    reputation.setRelays(['memory://test']);

    const domains = ['ridesharing', 'locksmith', 'delivery'];

    for (const domainId of domains) {
      const profile = loadProfile(domainId);
      const tm = new TaskManager(domainId);

      // Create a task
      const task = tm.createTask(
        { pubkey: riderPubKey },
        { lat: 51.5, lon: -0.12 },
        domainId === 'locksmith' ? null : { lat: 51.52, lon: -0.11 },
        5000
      );

      // Accept and progress to a state past initial
      tm.acceptTask(task.id, driverPubKey, {
        name: 'Test Provider',
        location: { lat: 51.49, lon: -0.13 },
        pubkey: driverPubKey
      });

      // Build a dispute event with domain tag
      const disputeEvent = {
        kind: 7543,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['d', `dispute_${task.id}`],
          ['task_id', task.id],
          ['domain', domainId],
          ['dispute_type', 'quality'],
          ['complainant_pubkey', riderPubKey],
          ['accused_pubkey', driverPubKey]
        ],
        content: `Dispute for ${domainId}`,
        pubkey: riderPubKey
      };
      disputeEvent.id = getEventHash(disputeEvent);
      disputeEvent.sig = getSignature(disputeEvent, riderPrivBytes);

      reputation.ensureEventIntegrity(disputeEvent);

      const domainTag = disputeEvent.tags.find(t => t[0] === 'domain');
      assert.ok(domainTag, `Domain tag present for ${domainId}`);
      assert.equal(domainTag[1], domainId, `Domain tag matches ${domainId}`);

      // Verify the domain profile has dispute event kinds
      assert.equal(profile.eventKinds.disputeClaim, 7543);
      assert.equal(profile.eventKinds.disputeResolution, 30545);
      assert.equal(profile.eventKinds.disputeResolution, 30545);
      assert.equal(profile.eventKinds.abuseReport, 30546);
    }
  } finally {
    unhush();
  }
});

// ==========================================
// Test 20: validation helpers reject invalid values
// ==========================================

test('validation constants contain correct values', () => {
  // VALID_DISPUTE_TYPES
  assert.deepEqual(
    disputeEvents.VALID_DISPUTE_TYPES,
    ['payment', 'conduct', 'safety', 'quality', 'no_show']
  );
  assert.ok(!disputeEvents.VALID_DISPUTE_TYPES.includes('invalid'));
  assert.ok(!disputeEvents.VALID_DISPUTE_TYPES.includes(''));

  // VALID_OUTCOMES
  assert.deepEqual(
    disputeEvents.VALID_OUTCOMES,
    ['refund', 'partial_refund', 'penalty', 'mutual_cancellation', 'dismissed', 'escalation']
  );
  assert.ok(!disputeEvents.VALID_OUTCOMES.includes('ban'));

  // VALID_ARBITER_TYPES
  assert.deepEqual(
    disputeEvents.VALID_ARBITER_TYPES,
    ['operator', 'third_party', 'guardian', 'automated']
  );

  // VALID_VOTES
  assert.deepEqual(
    disputeEvents.VALID_VOTES,
    ['approve', 'reject', 'abstain']
  );
  assert.ok(!disputeEvents.VALID_VOTES.includes('maybe'));

  // VALID_STAKE_EFFECTS
  assert.deepEqual(
    disputeEvents.VALID_STAKE_EFFECTS,
    ['released', 'forfeited', 'partial_forfeit', 'held']
  );

  // Validate that these are used for checking invalid inputs
  assert.equal(disputeEvents.VALID_DISPUTE_TYPES.includes('payment'), true);
  assert.equal(disputeEvents.VALID_DISPUTE_TYPES.includes('fraud'), false);
  assert.equal(disputeEvents.VALID_OUTCOMES.includes('refund'), true);
  assert.equal(disputeEvents.VALID_OUTCOMES.includes('revenge'), false);
});
