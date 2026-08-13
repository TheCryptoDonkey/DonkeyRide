/**
 * OSRM Routing Integration
 *
 * Uses the public OSRM demo server for real road routing
 */

const { fetchWithTimeout: fetch } = require('./utils/fetch-timeout');
const { safeErrorMessage } = require('./log-redact');

// Use local OSRM server for GDPR compliance
// Local server running on port 5001 with central London map data
// OSRM_URL is the documented compose/env name. Keep OSRM_SERVER as a
// backwards-compatible alias for existing operators.
const OSRM_SERVER = process.env.OSRM_URL || process.env.OSRM_SERVER || 'http://localhost:5001';
const VALHALLA_SERVER = process.env.VALHALLA_URL || '';
const ROUTING_PROVIDER = String(
  process.env.NAVIGATION_PROVIDER || (VALHALLA_SERVER ? 'valhalla' : 'osrm')
).toLowerCase();

/** Decode Valhalla's precision-6 polyline to [lon, lat] coordinates. */
function decodePolyline6(shape) {
  if (typeof shape !== 'string' || !shape) return [];
  const coordinates = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  while (index < shape.length) {
    const readDelta = () => {
      let result = 0;
      let shift = 0;
      let byte;
      do {
        if (index >= shape.length) throw new Error('Malformed routing shape');
        byte = shape.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      return (result & 1) ? ~(result >> 1) : (result >> 1);
    };
    lat += readDelta();
    lon += readDelta();
    coordinates.push([lon / 1e6, lat / 1e6]);
  }
  return coordinates;
}

async function getValhallaRoute(fromLat, fromLon, toLat, toLon, via) {
  if (!VALHALLA_SERVER) return null;
  const locations = [
    { lat: fromLat, lon: fromLon },
    ...via.map((stop) => ({ lat: stop.lat, lon: stop.lon })),
    { lat: toLat, lon: toLon }
  ];
  const response = await fetch(`${VALHALLA_SERVER.replace(/\/$/, '')}/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locations,
      costing: 'auto',
      units: 'kilometers',
      shape_format: 'polyline6'
    })
  });
  if (!response.ok) throw new Error(`Valhalla HTTP ${response.status}`);
  const data = await response.json();
  const summary = data?.trip?.summary;
  const legs = Array.isArray(data?.trip?.legs) ? data.trip.legs : [];
  if (!summary || legs.length === 0) throw new Error('No route found');
  const coordinates = [];
  legs.forEach((leg) => {
    const points = decodePolyline6(leg.shape);
    if (coordinates.length > 0 && points.length > 0) points.shift();
    coordinates.push(...points);
  });
  if (coordinates.length < 2) throw new Error('Route has no geometry');
  const distanceKm = Number(summary.length);
  const durationSeconds = Number(summary.time);
  return {
    coordinates,
    distance: distanceKm * 1000,
    duration: durationSeconds,
    distanceKm: distanceKm.toFixed(2),
    durationMin: Math.ceil(durationSeconds / 60)
  };
}

/**
 * Get route between two points using OSRM.
 * Optional intermediate stops are routed through in order.
 *
 * @param {Array<{lat: number, lon: number}>} [via] - intermediate stops
 */
async function getRoute(fromLat, fromLon, toLat, toLon, via = []) {
  if (ROUTING_PROVIDER === 'valhalla') {
    try {
      return await getValhallaRoute(fromLat, fromLon, toLat, toLon, via);
    } catch (error) {
      console.error('Valhalla routing error:', safeErrorMessage(error));
      return null;
    }
  }
  // Callers fail visibly on null; they never turn it into a point-to-point
  // fare or route.
  if (!OSRM_SERVER) {
    console.log('Road router not configured');
    return null;
  }

  try {
    const waypoints = [
      `${fromLon},${fromLat}`,
      ...via.map((stop) => `${stop.lon},${stop.lat}`),
      `${toLon},${toLat}`
    ].join(';');
    const url = `${OSRM_SERVER}/route/v1/driving/${waypoints}?overview=full&geometries=geojson&steps=false`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      throw new Error('No route found');
    }

    const route = data.routes[0];

    return {
      coordinates: route.geometry.coordinates, // Array of [lon, lat] points
      distance: route.distance, // meters
      duration: route.duration, // seconds
      distanceKm: (route.distance / 1000).toFixed(2),
      durationMin: Math.ceil(route.duration / 60)
    };

  } catch (error) {
    // NEVER `error.message` raw: node-fetch embeds the whole request URL,
    // and that URL is an exact pickup and an exact dropoff.
    console.error('OSRM routing error:', safeErrorMessage(error));
    return null;
  }
}

/**
 * Calculate direct distance for proximity/ETA helpers, never fare routing.
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate ETA based on distance and average speed
 */
function calculateETA(distanceKm, speedKmh = 30) {
  const hours = distanceKm / speedKmh;
  return Math.round(hours * 3600); // Convert to seconds
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

module.exports = {
  getRoute,
  decodePolyline6,
  calculateDistance,
  calculateETA
};
