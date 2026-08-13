const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

let requestBody = null;
const upstream = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    requestBody = JSON.parse(body);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      trip: {
        summary: { length: 1.565, time: 214.936 },
        legs: [{ shape: 'mve_eBd~zgCbA}PNcF' }]
      }
    }));
  });
});

before(async () => {
  upstream.listen(0, '127.0.0.1');
  await new Promise((resolve) => upstream.once('listening', resolve));
  process.env.NAVIGATION_PROVIDER = 'valhalla';
  process.env.VALHALLA_URL = `http://127.0.0.1:${upstream.address().port}`;
});

after(() => upstream.close());

test('normalises a private Valhalla route to the existing routing contract', async () => {
  // Require after the before hook has installed this test's private URL.
  const { getRoute } = require('../../src/osrm-routing');
  const route = await getRoute(
    53.4808, -2.2426,
    53.4774, -2.2309,
    [{ lat: 53.479, lon: -2.235 }]
  );

  assert.equal(requestBody.costing, 'auto');
  assert.equal(requestBody.locations.length, 3);
  assert.deepEqual(requestBody.locations[1], { lat: 53.479, lon: -2.235 });
  assert.equal(route.distance, 1565);
  assert.equal(route.distanceKm, '1.56');
  assert.equal(route.durationMin, 4);
  assert.ok(route.coordinates.length >= 3);
  assert.ok(route.coordinates.every(([lon, lat]) => lon < 0 && lat > 50));
});
