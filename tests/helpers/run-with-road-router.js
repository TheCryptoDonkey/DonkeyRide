#!/usr/bin/env node

/**
 * Run a command with a deterministic, localhost-only OSRM test double.
 *
 * Production routing still fails closed when its configured road router is
 * unavailable. Tests must not depend on a developer's OSRM/Valhalla process,
 * contact a public router, or fall back to straight-line pricing. This helper
 * supplies the same routed contract with ordered, bent geometry and a stable
 * road-distance factor.
 */

const http = require('node:http');
const { spawn } = require('node:child_process');

function toRadians(value) {
  return value * (Math.PI / 180);
}

function haversineMetres([fromLon, fromLat], [toLon, toLat]) {
  const earthRadiusMetres = 6_371_000;
  const deltaLat = toRadians(toLat - fromLat);
  const deltaLon = toRadians(toLon - fromLon);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat))
    * Math.sin(deltaLon / 2) ** 2;
  return earthRadiusMetres * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildRoadRoute(waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    throw new Error('At least two valid waypoints are required');
  }

  const coordinates = [waypoints[0]];
  let directMetres = 0;

  for (let index = 1; index < waypoints.length; index += 1) {
    const from = waypoints[index - 1];
    const to = waypoints[index];
    directMetres += haversineMetres(from, to);

    // A small perpendicular bend makes the fixture explicit road geometry,
    // not a two-point line masquerading as a route. Every via point remains
    // present and in the requested order.
    const deltaLon = to[0] - from[0];
    const deltaLat = to[1] - from[1];
    coordinates.push([
      (from[0] + to[0]) / 2 - deltaLat * 0.03,
      (from[1] + to[1]) / 2 + deltaLon * 0.03
    ]);
    coordinates.push(to);
  }

  const distance = Math.max(1, Math.round(directMetres * 1.18));
  return {
    coordinates,
    distance,
    duration: Math.max(1, Math.round(distance / (30_000 / 3_600)))
  };
}

function parseWaypoints(pathname) {
  const prefix = '/route/v1/driving/';
  if (!pathname.startsWith(prefix)) return null;
  const encoded = pathname.slice(prefix.length);
  const waypoints = decodeURIComponent(encoded).split(';').map((value) => {
    const [lon, lat] = value.split(',').map(Number);
    return [lon, lat];
  });
  if (waypoints.some(([lon, lat]) => !Number.isFinite(lon) || !Number.isFinite(lat))) {
    return null;
  }
  return waypoints;
}

function createRoadRouter() {
  return http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const waypoints = request.method === 'GET' ? parseWaypoints(url.pathname) : null;
    if (!waypoints || waypoints.length < 2) {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ code: 'InvalidUrl' }));
      return;
    }

    const route = buildRoadRoute(waypoints);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      code: 'Ok',
      routes: [{
        geometry: { type: 'LineString', coordinates: route.coordinates },
        distance: route.distance,
        duration: route.duration
      }],
      waypoints: waypoints.map(([lon, lat]) => ({ location: [lon, lat] }))
    }));
  });
}

function run() {
  const separator = process.argv.indexOf('--');
  const command = separator >= 0 ? process.argv[separator + 1] : null;
  const args = separator >= 0 ? process.argv.slice(separator + 2) : [];
  if (!command) {
    console.error('Usage: run-with-road-router.js -- command [args...]');
    process.exit(2);
  }

  const router = createRoadRouter();
  router.listen(0, '127.0.0.1', () => {
    const address = router.address();
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        NAVIGATION_PROVIDER: 'osrm',
        OSRM_URL: `http://127.0.0.1:${address.port}`,
        VALHALLA_URL: ''
      }
    });

    child.once('error', (error) => {
      console.error(`Unable to start test command: ${error.message}`);
      router.close(() => process.exit(1));
    });
    child.once('exit', (code, signal) => {
      router.close(() => {
        if (signal) {
          process.kill(process.pid, signal);
          return;
        }
        process.exit(code ?? 1);
      });
    });
  });
}

if (require.main === module) run();

module.exports = { buildRoadRoute, createRoadRouter, parseWaypoints };
