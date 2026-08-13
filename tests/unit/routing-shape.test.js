const { test } = require('node:test');
const assert = require('node:assert/strict');

const { decodePolyline6 } = require('../../src/osrm-routing');

test('decodes Valhalla precision-6 shapes into GeoJSON coordinate order', () => {
  // Valhalla response for two Manchester points, trimmed to the first fixes.
  const points = decodePolyline6('mve_eBd~zgCbA}PNcF');
  assert.ok(points.length >= 3);
  assert.ok(Math.abs(points[0][0] - (-2.242546)) < 0.000002);
  assert.ok(Math.abs(points[0][1] - 53.4808) < 0.001);
  assert.ok(points.every(([lon, lat]) => lon < 0 && lat > 50));
});

test('rejects a malformed Valhalla shape', () => {
  assert.throws(() => decodePolyline6('_'), /Malformed routing shape/);
});
