// ==========================================
// NAVIGATION PROVIDER BASE CLASS
// Abstract interface for routing engines
// ==========================================

/**
 * Base class for all navigation/routing providers
 *
 * Supports:
 * - Route calculation with traffic
 * - Turn-by-turn directions
 * - ETA calculation
 * - Alternative routes
 * - Cost optimization (time/distance/fuel)
 */
class NavigationProvider {
    constructor(config = {}) {
        this.providerName = 'base';
        this.config = config;
    }

    /**
     * Calculate optimal route between two points
     *
     * @param {Object} origin - {lat, lon}
     * @param {Object} destination - {lat, lon}
     * @param {Object} options - Routing options
     * @returns {Promise<Route>}
     */
    async calculateRoute(origin, destination, options = {}) {
        throw new Error('calculateRoute must be implemented by provider');
    }

    /**
     * Get alternative routes
     *
     * @param {Object} origin
     * @param {Object} destination
     * @param {Object} options
     * @returns {Promise<Array<Route>>}
     */
    async getAlternatives(origin, destination, options = {}) {
        throw new Error('getAlternatives must be implemented by provider');
    }

    /**
     * Get turn-by-turn navigation instructions
     *
     * @param {Route} route
     * @returns {Promise<Array<Instruction>>}
     */
    async getInstructions(route) {
        throw new Error('getInstructions must be implemented by provider');
    }

    /**
     * Calculate ETA based on current traffic
     *
     * @param {Object} origin
     * @param {Object} destination
     * @param {Date} departureTime
     * @returns {Promise<number>} ETA in seconds
     */
    async calculateETA(origin, destination, departureTime = new Date()) {
        const route = await this.calculateRoute(origin, destination, {
            departureTime,
            traffic: true
        });
        return route.duration;
    }

    /**
     * Get current traffic conditions on route
     *
     * @param {Route} route
     * @returns {Promise<TrafficData>}
     */
    async getTrafficData(route) {
        throw new Error('getTrafficData must be implemented by provider');
    }

    /**
     * Recalculate route based on current position
     * Used for real-time rerouting
     *
     * @param {Route} currentRoute
     * @param {Object} currentPosition
     * @returns {Promise<Route>}
     */
    async recalculateRoute(currentRoute, currentPosition) {
        return this.calculateRoute(
            currentPosition,
            currentRoute.destination,
            { traffic: true, optimize: 'time' }
        );
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            // Test with a simple route
            const testRoute = await this.calculateRoute(
                { lat: 51.5074, lon: -0.1278 }, // London
                { lat: 51.5155, lon: -0.0922 }  // Nearby
            );
            return testRoute && testRoute.distance > 0;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get provider capabilities
     */
    getCapabilities() {
        return {
            provider: this.providerName,
            features: {
                traffic: false,
                alternatives: false,
                turnByTurn: false,
                rerouting: false,
                costOptimization: false,
                avoidTolls: false,
                avoidHighways: false,
                avoidFerries: false,
                fuelEfficiency: false
            },
            maxWaypoints: 1
        };
    }

    /**
     * Create Nostr event for route
     */
    createRouteEvent(route, rideId) {
        return {
            kind: 30580, // Navigation route event
            tags: [
                ['d', rideId],
                ['route_id', route.id],
                ['distance', route.distance.toString()],
                ['duration', route.duration.toString()],
                ['origin', `${route.origin.lat},${route.origin.lon}`],
                ['destination', `${route.destination.lat},${route.destination.lon}`],
                ['provider', this.providerName],
                ['traffic', route.hasTraffic ? 'true' : 'false']
            ],
            content: JSON.stringify({
                geometry: route.geometry,
                instructions: route.instructions,
                metadata: route.metadata
            })
        };
    }

    /**
     * Validate coordinates
     */
    validateCoordinates(point) {
        if (!point || typeof point.lat !== 'number' || typeof point.lon !== 'number') {
            throw new Error('Invalid coordinates: must have lat and lon');
        }
        if (point.lat < -90 || point.lat > 90) {
            throw new Error('Invalid latitude: must be between -90 and 90');
        }
        if (point.lon < -180 || point.lon > 180) {
            throw new Error('Invalid longitude: must be between -180 and 180');
        }
    }

    /**
     * Calculate distance between two points (Haversine formula)
     */
    calculateDistance(point1, point2) {
        const R = 6371000; // Earth radius in meters
        const φ1 = point1.lat * Math.PI / 180;
        const φ2 = point2.lat * Math.PI / 180;
        const Δφ = (point2.lat - point1.lat) * Math.PI / 180;
        const Δλ = (point2.lon - point1.lon) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // Distance in meters
    }

    /**
     * Format distance for display
     */
    formatDistance(meters) {
        if (meters < 1000) {
            return `${Math.round(meters)} m`;
        }
        return `${(meters / 1000).toFixed(1)} km`;
    }

    /**
     * Format duration for display
     */
    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }

    /**
     * Estimate fuel cost
     * @param {number} distance - Distance in meters
     * @param {number} fuelPrice - Price per liter
     * @param {number} efficiency - Liters per 100km
     */
    estimateFuelCost(distance, fuelPrice = 1.50, efficiency = 7.5) {
        const distanceKm = distance / 1000;
        const fuelUsed = (distanceKm / 100) * efficiency;
        return fuelUsed * fuelPrice;
    }

    /**
     * Calculate route score (lower is better)
     * Balances time, distance, and cost
     */
    calculateRouteScore(route, weights = { time: 0.6, distance: 0.2, cost: 0.2 }) {
        const normalizedTime = route.duration / 3600; // hours
        const normalizedDistance = route.distance / 100000; // per 100km
        const normalizedCost = (route.cost || 0) / 10; // per £10

        return (
            weights.time * normalizedTime +
            weights.distance * normalizedDistance +
            weights.cost * normalizedCost
        );
    }
}

/**
 * Route object structure
 */
class Route {
    constructor(data) {
        this.id = data.id || this.generateId();
        this.origin = data.origin;
        this.destination = data.destination;
        this.distance = data.distance; // meters
        this.duration = data.duration; // seconds
        this.geometry = data.geometry; // GeoJSON or encoded polyline
        this.instructions = data.instructions || [];
        this.hasTraffic = data.hasTraffic || false;
        this.trafficDelay = data.trafficDelay || 0;
        this.cost = data.cost || null;
        this.fuelCost = data.fuelCost || null;
        this.tollCost = data.tollCost || 0;
        this.metadata = data.metadata || {};
    }

    generateId() {
        return `route_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    toJSON() {
        return {
            id: this.id,
            origin: this.origin,
            destination: this.destination,
            distance: this.distance,
            duration: this.duration,
            geometry: this.geometry,
            instructions: this.instructions,
            hasTraffic: this.hasTraffic,
            trafficDelay: this.trafficDelay,
            cost: this.cost,
            fuelCost: this.fuelCost,
            tollCost: this.tollCost,
            metadata: this.metadata
        };
    }
}

/**
 * Navigation instruction
 */
class Instruction {
    constructor(data) {
        this.type = data.type; // turn, merge, exit, arrive, etc.
        this.text = data.text; // Human-readable instruction
        this.distance = data.distance; // Distance to instruction (meters)
        this.duration = data.duration; // Time to instruction (seconds)
        this.location = data.location; // {lat, lon}
        this.maneuver = data.maneuver; // Detailed maneuver info
    }
}

module.exports = {
    NavigationProvider,
    Route,
    Instruction
};
