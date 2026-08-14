const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildRoadRoute, parseWaypoints } = require('../helpers/run-with-road-router');

test('the test router preserves ordered stops and returns bent road geometry', () => {
  const pickup = [-2.2426, 53.4808];
  const stop = [-2.2500, 53.4700];
  const dropoff = [-2.2309, 53.4774];
  const route = buildRoadRoute([pickup, stop, dropoff]);

  assert.deepEqual(route.coordinates[0], pickup);
  assert.deepEqual(route.coordinates[2], stop);
  assert.deepEqual(route.coordinates.at(-1), dropoff);
  assert.equal(route.coordinates.length, 5);
  assert.notDeepEqual(route.coordinates[1], [
    (pickup[0] + stop[0]) / 2,
    (pickup[1] + stop[1]) / 2
  ]);
  assert.ok(route.distance > 0);
  assert.ok(route.duration > 0);
});

test('the test router parses an OSRM route request without losing via points', () => {
  assert.deepEqual(
    parseWaypoints('/route/v1/driving/-2.2426,53.4808;-2.25,53.47;-2.2309,53.4774'),
    [[-2.2426, 53.4808], [-2.25, 53.47], [-2.2309, 53.4774]]
  );
  assert.equal(parseWaypoints('/nearest/v1/driving/-2.2,53.4'), null);
});
