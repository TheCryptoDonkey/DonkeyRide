// ==========================================
// OSRM NAVIGATION PROVIDER
// Open Source Routing Machine - Fast, traffic-aware routing
// ==========================================

const { NavigationProvider, Route, Instruction } = require('./base');
const fetch = require('node-fetch');

/**
 * OSRM Provider
 *
 * Uses OSRM (Open Source Routing Machine) for routing
 * Can use public instance or self-hosted
 *
 * Features:
 * - Very fast routing
 * - Turn-by-turn directions
 * - Multiple profiles (car, bike, foot)
 * - Can integrate with traffic data
 *
 * Public instance: https://router.project-osrm.org
 * Self-hosted: docker run -t -i osrm/osrm-backend
 */
class OSRMProvider extends NavigationProvider {
    constructor(config = {}) {
        super(config);
        this.providerName = 'osrm';

        // OSRM server URL
        this.baseUrl = config.baseUrl || process.env.OSRM_URL || 'https://router.project-osrm.org';
        this.profile = config.profile || 'car'; // car, bike, foot
        this.trafficEnabled = config.traffic || false;
    }

    /**
     * Calculate route using OSRM
     */
    async calculateRoute(origin, destination, options = {}) {
        this.validateCoordinates(origin);
        this.validateCoordinates(destination);

        try {
            const profile = options.profile || this.profile;
            const coordinates = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;

            // OSRM API: /route/v1/{profile}/{coordinates}
            const url = `${this.baseUrl}/route/v1/${profile}/${coordinates}`;
            const params = new URLSearchParams({
                overview: 'full',
                geometries: 'geojson',
                steps: 'true',
                annotations: 'true'
            });

            // Add traffic if enabled
            if (this.trafficEnabled || options.traffic) {
                params.append('annotations', 'speed,duration');
            }

            const response = await fetch(`${url}?${params}`);
            if (!response.ok) {
                throw new Error(`OSRM API error: ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.routes || data.routes.length === 0) {
                throw new Error('No route found');
            }

            return this.parseOSRMRoute(data.routes[0], origin, destination);

        } catch (error) {
            console.error('OSRM routing error:', error);
            throw error;
        }
    }

    /**
     * Get alternative routes
     */
    async getAlternatives(origin, destination, options = {}) {
        this.validateCoordinates(origin);
        this.validateCoordinates(destination);

        try {
            const profile = options.profile || this.profile;
            const coordinates = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;

            const url = `${this.baseUrl}/route/v1/${profile}/${coordinates}`;
            const params = new URLSearchParams({
                overview: 'full',
                geometries: 'geojson',
                steps: 'true',
                alternatives: 'true', // Request alternatives
                annotations: 'true'
            });

            const response = await fetch(`${url}?${params}`);
            if (!response.ok) {
                throw new Error(`OSRM API error: ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.routes || data.routes.length === 0) {
                throw new Error('No routes found');
            }

            // Parse all alternative routes
            return data.routes.map(route =>
                this.parseOSRMRoute(route, origin, destination)
            );

        } catch (error) {
            console.error('OSRM alternatives error:', error);
            throw error;
        }
    }

    /**
     * Parse OSRM response into Route object
     */
    parseOSRMRoute(osrmRoute, origin, destination) {
        const instructions = this.parseInstructions(osrmRoute.legs[0].steps);

        // Calculate costs
        const distance = osrmRoute.distance;
        const fuelCost = this.estimateFuelCost(distance);

        const route = new Route({
            origin,
            destination,
            distance: osrmRoute.distance,
            duration: osrmRoute.duration,
            geometry: osrmRoute.geometry,
            instructions,
            hasTraffic: this.trafficEnabled,
            trafficDelay: this.calculateTrafficDelay(osrmRoute),
            fuelCost,
            metadata: {
                provider: 'osrm',
                profile: this.profile,
                legs: osrmRoute.legs.length,
                waypoints: osrmRoute.legs[0].steps.length
            }
        });

        return route;
    }

    /**
     * Parse OSRM steps into Instructions
     */
    parseInstructions(steps) {
        return steps.map((step, index) => {
            const location = step.maneuver.location;

            return new Instruction({
                type: this.maneuverTypeToInstruction(step.maneuver.type),
                text: step.name || step.maneuver.type,
                distance: step.distance,
                duration: step.duration,
                location: {
                    lat: location[1],
                    lon: location[0]
                },
                maneuver: {
                    type: step.maneuver.type,
                    modifier: step.maneuver.modifier,
                    bearingBefore: step.maneuver.bearing_before,
                    bearingAfter: step.maneuver.bearing_after
                }
            });
        });
    }

    /**
     * Convert OSRM maneuver types to readable instructions
     */
    maneuverTypeToInstruction(type) {
        const mapping = {
            'turn': 'turn',
            'new name': 'continue',
            'depart': 'depart',
            'arrive': 'arrive',
            'merge': 'merge',
            'on ramp': 'ramp',
            'off ramp': 'exit',
            'fork': 'fork',
            'end of road': 'end_of_road',
            'continue': 'continue',
            'roundabout': 'roundabout',
            'rotary': 'roundabout',
            'roundabout turn': 'roundabout_exit'
        };

        return mapping[type] || 'continue';
    }

    /**
     * Calculate traffic delay from annotations
     */
    calculateTrafficDelay(osrmRoute) {
        if (!osrmRoute.legs[0].annotation) {
            return 0;
        }

        // Compare actual duration with free-flow duration
        // This is simplified - real traffic analysis is more complex
        const annotations = osrmRoute.legs[0].annotation;
        if (annotations.speed && annotations.duration) {
            const speeds = annotations.speed;
            const durations = annotations.duration;

            let totalDelay = 0;
            for (let i = 0; i < speeds.length; i++) {
                // If speed is significantly below expected, count as delay
                const expectedSpeed = 50; // km/h baseline
                if (speeds[i] < expectedSpeed * 0.7) {
                    totalDelay += durations[i] * 0.3; // 30% delay
                }
            }
            return totalDelay;
        }

        return 0;
    }

    /**
     * Get turn-by-turn instructions
     */
    async getInstructions(route) {
        return route.instructions;
    }

    /**
     * Get capabilities
     */
    getCapabilities() {
        return {
            provider: this.providerName,
            features: {
                traffic: this.trafficEnabled,
                alternatives: true,
                turnByTurn: true,
                rerouting: true,
                costOptimization: true,
                avoidTolls: false,
                avoidHighways: false,
                avoidFerries: false,
                fuelEfficiency: true
            },
            maxWaypoints: 25,
            profiles: ['car', 'bike', 'foot']
        };
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            const response = await fetch(`${this.baseUrl}/route/v1/car/-0.1278,51.5074;-0.0922,51.5155`);
            return response.ok;
        } catch (error) {
            return false;
        }
    }
}

module.exports = OSRMProvider;
