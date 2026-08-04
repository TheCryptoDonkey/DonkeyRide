/**
 * What the operator writes to its own disk.
 *
 * The architecture's privacy claim is that exact PII is in-memory and
 * ephemeral, lost on restart by design. stdout is neither: Docker's
 * json-file driver persists every line (3 x 10 MB here) outside the
 * erasure story and outside every `/api` privacy control.
 *
 * A live production log held both halves of a travel history:
 *
 *   ✅ Task created: ride_a85b1178 [ridesharing] (npub1ht0jln4...)
 *   OSRM routing error: request to http://localhost:5001/route/v1/driving/
 *     -0.1278,51.5074;-0.0922,51.5155?overview=full... failed
 *
 * Who, from where, to where, when — joined by the ride id, in plaintext,
 * from an ERROR path that fires exactly when nobody is watching.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { redact, safeErrorMessage } = require('../../src/log-redact');
const { TaskManager } = require('../../src/task-manager');

// Verbatim from the production log that prompted this.
const REAL_LEAK = 'request to http://localhost:5001/route/v1/driving/'
  + '-0.1278,51.5074;-0.0922,51.5155?overview=full&geometries=geojson&steps=false failed, reason: ';

describe('routing errors never carry a journey', () => {
  test('the exact production leak is redacted', () => {
    const safe = safeErrorMessage(new Error(REAL_LEAK));

    assert.ok(!safe.includes('51.5074'), 'pickup latitude survived');
    assert.ok(!safe.includes('-0.1278'), 'pickup longitude survived');
    assert.ok(!safe.includes('51.5155'), 'dropoff latitude survived');
    assert.ok(!safe.includes('-0.0922'), 'dropoff longitude survived');
  });

  test('but still says which service failed', () => {
    // Redaction that destroys the ability to operate the thing gets
    // reverted by the next person on call. Keep scheme and host.
    const safe = safeErrorMessage(new Error(REAL_LEAK));

    assert.ok(safe.includes('http://localhost:5001'), 'lost the failing host');
    assert.ok(safe.includes('failed'), 'lost the failure itself');
  });

  test('a bare coordinate pair is caught outside a URL too', () => {
    assert.ok(!redact('driver at -0.1278,51.5074 now').includes('51.5074'));
  });

  test('ordinary numbers in logs survive — over-redaction is not free', () => {
    // "1.33km, 4 min" is useful and identifies nobody.
    assert.equal(redact('OSRM: 1.33km, 4 min, 95 points'), 'OSRM: 1.33km, 4 min, 95 points');
  });

  test('keys and identifiers are stripped', () => {
    const npub = 'npub1ht0jln4ht6wqkge5ndx62wslt9z2ejysxaj59jmuq2ag735fz0asr8a2jw';
    assert.ok(!redact(`task by ${npub}`).includes('ht0jln4'));
    assert.ok(!redact(`key ${'a'.repeat(64)}`).includes('a'.repeat(64)));
    // An ORS API key rides in an Authorization header on axios-shaped errors.
    assert.ok(!redact('Authorization: nsec1qqqqqqqqqqqqqqqqqqqqqqqq').includes('nsec1qqq'));
  });

  test('a non-Error is handled without throwing', () => {
    assert.equal(safeErrorMessage(null), 'unknown error');
    assert.ok(!safeErrorMessage(`fetch ${REAL_LEAK}`).includes('51.5074'));
  });
});

describe('the task lifecycle names nobody on stdout', () => {
  /** Run fn with console.log captured. */
  function capture(fn) {
    const lines = [];
    const original = console.log;
    console.log = (...args) => lines.push(args.join(' '));
    try { fn(); } finally { console.log = original; }
    return lines.join('\n');
  }

  test('creating and matching a task logs no identity', () => {
    const manager = new TaskManager('ridesharing');
    const requester = 'a1'.repeat(32);
    const provider = 'b2'.repeat(32);

    const output = capture(() => {
      const task = manager.createTask(
        requester,
        { lat: 51.5074, lon: -0.1278 },
        { lat: 51.5155, lon: -0.0922 },
        1000,
      );
      manager.acceptTask(task.id, provider, {});
    });

    assert.ok(output.length > 0, 'nothing was logged at all — test is not exercising the path');
    assert.ok(!output.includes('npub1'), `an npub reached the log:\n${output}`);
    assert.ok(!output.includes(requester), 'the requester pubkey reached the log');
    assert.ok(!output.includes(provider), 'the provider pubkey reached the log');
    // The task id is fine: it identifies a job, not a person, and it is
    // already the join key the operator needs to be operable.
    assert.ok(/ride_|task_/.test(output), 'lost the task id, which we do want');
  });
});
