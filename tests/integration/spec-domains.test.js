/**
 * The six domain profiles that existed in the TROTT spec but not in this
 * implementation: towing, emergency trades, pet services, security,
 * cleaning and moving.
 *
 * The important test here is `lifecycle is drivable end to end`. A profile
 * can validate perfectly and still be unusable if its state machine has no
 * path from arrival to the active state, because the engine's start and
 * complete calls go through validateTransition like anything else. Every
 * built-in profile has to survive a full run, not just load.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { loadProfile, listProfiles, validateProfile } = require('../../src/domain-profiles');
const { TaskManager } = require('../../src/task-manager');

const SPEC_DOMAINS = ['towing', 'emergency-trades', 'pet-services', 'security', 'cleaning', 'moving'];

/**
 * The states each domain passes through between arriving and starting work,
 * and between starting and completing. Anything not listed goes straight
 * from arrival into the active state.
 */
const LIFECYCLE_PATHS = {
  ridesharing: { beforeActive: [], beforeComplete: [] },
  locksmith: { beforeActive: ['access_method_confirmed'], beforeComplete: [] },
  delivery: { beforeActive: ['collected'], beforeComplete: ['arrived_at_delivery'] },
  towing: { beforeActive: ['vehicle_assessed', 'vehicle_loaded'], beforeComplete: [] },
  'emergency-trades': { beforeActive: ['diagnosis', 'quote_provided', 'quote_accepted'], beforeComplete: [] },
  'pet-services': { beforeActive: ['check_in'], beforeComplete: [] },
  security: { beforeActive: ['briefed'], beforeComplete: [] },
  cleaning: { beforeActive: [], beforeComplete: [] },
  moving: { beforeActive: ['loading'], beforeComplete: ['unloading'] }
};

test('every spec-only domain loads as a built-in profile', () => {
  const available = listProfiles();
  for (const id of SPEC_DOMAINS) {
    assert.ok(available.includes(id), `${id} must be a built-in profile`);
    const profile = loadProfile(id);
    assert.equal(profile.id, id, `${id} profile must declare the spec domain identifier`);
    assert.ok(profile.roles.requester, `${id} needs a requester role`);
    assert.ok(profile.roles.provider, `${id} needs a provider role`);
  }
});

test('every built-in profile exposes the state keys the engine drives', () => {
  // The task manager reaches for these by name. A profile missing one
  // loads fine and then throws the first time anybody accepts a job.
  const required = [
    'REQUESTED', 'MATCHED', 'PROVIDER_EN_ROUTE', 'PROVIDER_ARRIVED',
    'ACTIVE', 'COMPLETED', 'CANCELLED', 'NO_SHOW'
  ];

  for (const id of listProfiles()) {
    const { states } = loadProfile(id);
    for (const key of required) {
      assert.equal(typeof states.values[key], 'string',
        `Profile ${id} must map a state to ${key}`);
    }
    assert.equal(states.initial, states.values.REQUESTED,
      `Profile ${id} must start in its REQUESTED state`);
    assert.ok(states.terminal.includes(states.values.COMPLETED),
      `Profile ${id} must treat its COMPLETED state as terminal`);
    assert.ok(states.terminal.includes(states.values.CANCELLED),
      `Profile ${id} must treat its CANCELLED state as terminal`);
  }
});

test('every built-in profile lifecycle is drivable end to end', () => {
  for (const id of listProfiles()) {
    const path = LIFECYCLE_PATHS[id];
    assert.ok(path, `Add ${id} to LIFECYCLE_PATHS so its lifecycle is exercised`);

    const tm = new TaskManager(id);
    const states = tm.states;
    const task = tm.createTask(
      { pubkey: `req_${id}` },
      { lat: 51.5, lon: -0.12 },
      { lat: 51.52, lon: -0.11 },
      12000
    );
    assert.equal(task.status, states.REQUESTED, `${id} starts requested`);

    tm.acceptTask(task.id, `npub_${id}`, {
      name: 'Test provider',
      location: { lat: 51.49, lon: -0.13 },
      pubkey: `prov_${id}`
    });
    assert.equal(tm.getTask(task.id).status, states.MATCHED, `${id} matches`);

    tm.startEnRoute(task.id);
    assert.equal(tm.getTask(task.id).status, states.PROVIDER_EN_ROUTE, `${id} goes en route`);

    tm.arriveAtPickup(task.id);
    assert.equal(tm.getTask(task.id).status, states.PROVIDER_ARRIVED, `${id} arrives`);

    for (const intermediate of path.beforeActive) {
      tm.transitionTo(task.id, intermediate);
      assert.equal(tm.getTask(task.id).status, intermediate, `${id} reaches ${intermediate}`);
    }

    tm.startTrip(task.id);
    assert.equal(tm.getTask(task.id).status, states.ACTIVE, `${id} starts work`);

    for (const intermediate of path.beforeComplete) {
      tm.transitionTo(task.id, intermediate);
      assert.equal(tm.getTask(task.id).status, intermediate, `${id} reaches ${intermediate}`);
    }

    tm.completeTrip(task.id, { amount: 12000 });
    assert.equal(tm.getTask(task.id).status, states.COMPLETED, `${id} completes`);
    assert.ok(tm.isTerminal(tm.getTask(task.id).status), `${id} ends terminal`);
  }
});

test('a security shift cycles between station, patrol and incident', () => {
  // The only domain in the set whose active phase is not a line. An
  // incident that runs past the end of the shift still has to be closable,
  // so the shift can end from any of the three.
  const tm = new TaskManager('security');
  const task = tm.createTask({ pubkey: 'client_sec' }, { lat: 51.5, lon: -0.12 }, null, 40000);

  tm.acceptTask(task.id, 'npub_officer', { name: 'Officer', pubkey: 'officer_pub' });
  tm.startEnRoute(task.id);
  tm.arriveAtPickup(task.id);
  tm.transitionTo(task.id, 'briefed');
  tm.startTrip(task.id);
  assert.equal(tm.getTask(task.id).status, 'on_station');

  tm.transitionTo(task.id, 'patrolling');
  tm.transitionTo(task.id, 'incident');
  tm.transitionTo(task.id, 'patrolling');
  tm.transitionTo(task.id, 'on_station');
  assert.equal(tm.getTask(task.id).status, 'on_station');

  tm.completeTrip(task.id, { amount: 40000 });
  assert.equal(tm.getTask(task.id).status, 'shift_complete');
});

test('a declined towing quote cancels rather than proceeding to loading', () => {
  const tm = new TaskManager('towing');
  const task = tm.createTask(
    { pubkey: 'motorist' },
    { lat: 51.5, lon: -0.12 },
    { lat: 51.52, lon: -0.11 },
    18500
  );

  tm.acceptTask(task.id, 'npub_recovery', { name: 'Recovery', pubkey: 'recovery_pub' });
  tm.startEnRoute(task.id);
  tm.arriveAtPickup(task.id);

  // The binding quote comes AFTER the on-site assessment. Nothing may be
  // loaded before the motorist has agreed the price.
  assert.throws(() => tm.transitionTo(task.id, 'vehicle_loaded'), /not allowed/);

  tm.cancelTask(task.id, 'quote declined');
  assert.equal(tm.getTask(task.id).status, 'cancelled');
});

test('rating criteria weights sum to 1.0 in every built-in profile', () => {
  for (const id of listProfiles()) {
    const { ratingCriteria } = loadProfile(id);
    const sum = ratingCriteria.reduce((total, criterion) => total + criterion.weight, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9,
      `Profile ${id} rating weights sum to ${sum}, not 1.0`);
    for (const criterion of ratingCriteria) {
      assert.match(criterion.tag, /^[a-z0-9_]+$/,
        `Profile ${id} criterion '${criterion.tag}' must be lowercase with underscores (TROTT-03)`);
    }
  }
});

test('spec-only domains express requirements as access needs, never as a price band', () => {
  // Trade qualifications and SIA licence categories run on the same
  // machinery as a wheelchair ramp: they filter who may take the job and
  // they never touch the fare.
  for (const id of ['emergency-trades', 'pet-services', 'security', 'cleaning', 'moving']) {
    const profile = loadProfile(id);
    assert.ok(profile.accessOptions.length > 0, `${id} declares access requirements`);
    for (const option of profile.accessOptions) {
      assert.equal(option.fareMultiplier, undefined,
        `${id} access option '${option.id}' must not carry a fare multiplier`);
      assert.ok(option.providerPrompt,
        `${id} access option '${option.id}' needs a provider-facing prompt`);
    }
  }

  // And the schema refuses one outright if someone tries.
  assert.throws(() => validateProfile({
    id: 'greedy',
    name: 'Greedy',
    discoveryMethod: 'geohash',
    pricingModel: 'hourly',
    states: {
      values: { REQUESTED: 'requested', COMPLETED: 'completed', CANCELLED: 'cancelled' },
      transitions: { 'requested': ['completed', 'cancelled'] },
      terminal: ['completed', 'cancelled'],
      initial: 'requested'
    },
    roles: { requester: 'client', provider: 'worker' },
    accessOptions: [{ id: 'ramp', label: 'Ramp', fareMultiplier: 1.5 }]
  }), /never change the fare/);
});

test('service classes scale the rate card only where a class really exists', () => {
  // Towing and moving price by recovery method and crew size; the rest of
  // the set has one implicit class and no picker.
  for (const id of ['towing', 'moving']) {
    const profile = loadProfile(id);
    assert.ok(profile.serviceOptions.length > 1, `${id} offers more than one class`);
    assert.equal(profile.serviceOptions[0].fareMultiplier, 1,
      `${id} default class must be the unscaled rate card`);
    for (const option of profile.serviceOptions) {
      assert.ok(option.fareMultiplier > 0, `${id} class '${option.id}' needs a positive multiplier`);
    }
  }

  for (const id of ['emergency-trades', 'pet-services', 'security', 'cleaning']) {
    assert.equal(loadProfile(id).serviceOptions.length, 0,
      `${id} should not present a service-class picker`);
  }
});

test('every built-in profile is visually distinguishable', () => {
  const colours = new Set();
  const emojis = new Set();

  for (const id of listProfiles()) {
    const { theme } = loadProfile(id);
    assert.ok(!colours.has(theme.primary), `Profile ${id} reuses primary colour ${theme.primary}`);
    assert.ok(!emojis.has(theme.emoji), `Profile ${id} reuses emoji ${theme.emoji}`);
    colours.add(theme.primary);
    emojis.add(theme.emoji);
  }
});

test('regulated domains name the body that actually regulates them', () => {
  const security = loadProfile('security');
  assert.equal(security.regulatoryBodies.sia.required, true,
    'SIA licensing is a criminal-offence gate, not a nicety');

  const trades = loadProfile('emergency-trades');
  assert.equal(trades.regulatoryBodies.gasSafe.required, true,
    'Gas work without Gas Safe registration is a criminal offence');

  // Cleaning is genuinely unregulated in the UK — the profile must not
  // imply a licence exists where none does.
  const cleaning = loadProfile('cleaning');
  for (const body of Object.values(cleaning.regulatoryBodies)) {
    assert.equal(body.required, false, `Cleaning must not assert a mandatory ${body.name}`);
  }
});

test('domains where nobody travels to a second location do not demand one', () => {
  for (const id of ['emergency-trades', 'pet-services', 'security', 'cleaning']) {
    assert.equal(loadProfile(id).features.requiresDestination, false,
      `${id} has one location, not two`);
  }
  for (const id of ['towing', 'moving']) {
    assert.equal(loadProfile(id).features.requiresDestination, true,
      `${id} moves something from A to B`);
  }
});
