/**
 * OSRM Routing Integration
 *
 * Uses the public OSRM demo server for real road routing
 */

const { fetchWithTimeout: fetch } = require('./utils/fetch-timeout');

// Use local OSRM server for GDPR compliance
// Local server running on port 5001 with central London map data
const OSRM_SERVER = process.env.OSRM_SERVER || 'http://localhost:5001';

/**
 * Get route between two points using OSRM.
 * Optional intermediate stops are routed through in order.
 *
 * @param {Array<{lat: number, lon: number}>} [via] - intermediate stops
 */
async function getRoute(fromLat, fromLon, toLat, toLon, via = []) {
  // Only use OSRM if local server is configured
  if (!OSRM_SERVER) {
    console.log('📏 Local OSRM not configured - using straight-line routing');
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
    console.error('OSRM routing error:', error.message);
    // Fallback to straight line
    return null;
  }
}

/**
 * Calculate straight-line distance (Haversine formula)
 * Used as fallback when OSRM is unavailable
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
  calculateDistance,
  calculateETA
};
