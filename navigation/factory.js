// ==========================================
// NAVIGATION PROVIDER FACTORY
// Creates navigation provider instances with automatic fallbacks
// ==========================================

const OSRMProvider = require('./osrm');
const OpenRouteServiceProvider = require('./openrouteservice');

/**
 * Factory for creating navigation provider instances
 * Supports fallback chains for resilience
 */
class NavigationProviderFactory {
    /**
     * Create a navigation provider
     *
     * @param {string} type - Provider type: 'osrm'|'ors'|'graphhopper'
     * @param {Object} config - Provider configuration
     * @returns {NavigationProvider}
     */
    static create(type, config = {}) {
        switch (type.toLowerCase()) {
            case 'osrm':
                return new OSRMProvider(config);

            case 'ors':
            case 'openrouteservice':
                return new OpenRouteServiceProvider(config);

            default:
                throw new Error(`Unknown navigation provider type: ${type}`);
        }
    }

    /**
     * Create provider with automatic fallbacks
     *
     * @param {string} primary - Primary provider type
     * @param {Array<string>} fallbacks - Ordered array of fallback providers
     * @param {Object} configs - Configuration for each provider
     * @returns {NavigationProvider}
     */
    static async createWithFallbacks(primary, fallbacks = [], configs = {}) {
        const providers = [primary, ...fallbacks];

        for (const type of providers) {
            try {
                const provider = this.create(type, configs[type] || {});

                // Check if provider is healthy
                const healthy = await provider.healthCheck();
                if (healthy) {
                    console.log(`✅ Using navigation provider: ${type}`);
                    return provider;
                }

                console.warn(`⚠️  Provider ${type} failed health check, trying next...`);
            } catch (error) {
                console.warn(`⚠️  Failed to initialize ${type}: ${error.message}`);
                continue;
            }
        }

        throw new Error('All navigation providers failed to initialize');
    }

    /**
     * Create from environment variables
     */
    static fromEnv() {
        const type = process.env.NAVIGATION_PROVIDER || 'osrm';

        const configs = {
            osrm: {
                baseUrl: process.env.OSRM_URL,
                profile: process.env.OSRM_PROFILE || 'car',
                traffic: process.env.OSRM_TRAFFIC === 'true'
            },
            ors: {
                apiKey: process.env.ORS_API_KEY,
                baseUrl: process.env.ORS_URL,
                profile: process.env.ORS_PROFILE || 'driving-car'
            }
        };

        const fallbacks = process.env.NAVIGATION_FALLBACKS
            ? process.env.NAVIGATION_FALLBACKS.split(',').map(s => s.trim())
            : ['osrm']; // Default fallback to public OSRM

        return this.createWithFallbacks(type, fallbacks, configs);
    }

    /**
     * Get list of available provider types
     */
    static getAvailableProviders() {
        return ['osrm', 'ors'];
    }
}

/**
 * Route Cost Optimizer
 *
 * Analyzes multiple routes and recommends the best one based on:
 * - Time (fastest)
 * - Distance (shortest)
 * - Cost (cheapest for driver)
 * - Balanced (best overall value)
 */
class RouteCostOptimizer {
    constructor(config = {}) {
        // Cost factors (can be customized per market)
        this.fuelPricePerLiter = config.fuelPrice || 1.50; // £1.50/liter
        this.vehicleEfficiency = config.efficiency || 7.5; // 7.5L/100km
        this.driverHourlyValue = config.hourlyValue || 15; // £15/hour opportunity cost
        this.tollAversion = config.tollAversion || 1.5; // 1.5x weight for tolls
    }

    /**
     * Find the best route for the driver
     *
     * @param {Array<Route>} routes - Array of alternative routes
     * @param {Object} rideDetails - {fareAmount, passengerCount}
     * @returns {Object} Best route with analysis
     */
    findBestRoute(routes, rideDetails = {}) {
        const analyses = routes.map(route => {
            return {
                route,
                analysis: this.analyzeRoute(route, rideDetails)
            };
        });

        // Sort by net profit (highest first)
        analyses.sort((a, b) => b.analysis.netProfit - a.analysis.netProfit);

        return {
            recommended: analyses[0],
            alternatives: analyses.slice(1),
            summary: this.createSummary(analyses)
        };
    }

    /**
     * Analyze a single route's economics
     *
     * @param {Route} route
     * @param {Object} rideDetails
     * @returns {Object} Analysis with costs and profit
     */
    analyzeRoute(route, rideDetails = {}) {
        const fareAmount = rideDetails.fareAmount || 0;

        // Calculate all costs
        const fuelCost = this.calculateFuelCost(route.distance);
        const timeCost = this.calculateTimeCost(route.duration);
        const tollCost = route.tollCost || 0;
        const trafficCost = this.calculateTrafficCost(route.trafficDelay);

        const totalCost = fuelCost + timeCost + (tollCost * this.tollAversion) + trafficCost;
        const netProfit = fareAmount - totalCost;
        const profitMargin = fareAmount > 0 ? (netProfit / fareAmount) * 100 : 0;

        // Calculate cost per km and per minute
        const costPerKm = totalCost / (route.distance / 1000);
        const costPerMinute = totalCost / (route.duration / 60);

        // Efficiency scores (higher is better)
        const timeEfficiency = fareAmount / (route.duration / 60); // £/minute
        const distanceEfficiency = fareAmount / (route.distance / 1000); // £/km
        const fuelEfficiency = route.distance / fuelCost; // meters per £

        return {
            // Costs
            fuelCost: this.round(fuelCost),
            timeCost: this.round(timeCost),
            tollCost: this.round(tollCost),
            trafficCost: this.round(trafficCost),
            totalCost: this.round(totalCost),

            // Profit
            fareAmount,
            netProfit: this.round(netProfit),
            profitMargin: this.round(profitMargin),

            // Efficiency metrics
            costPerKm: this.round(costPerKm),
            costPerMinute: this.round(costPerMinute),
            timeEfficiency: this.round(timeEfficiency),
            distanceEfficiency: this.round(distanceEfficiency),
            fuelEfficiency: this.round(fuelEfficiency),

            // Overall score (0-100)
            score: this.calculateOverallScore({
                profitMargin,
                timeEfficiency,
                fuelEfficiency,
                hasTraffic: route.hasTraffic,
                hasTolls: tollCost > 0
            })
        };
    }

    /**
     * Calculate fuel cost
     */
    calculateFuelCost(distanceMeters) {
        const distanceKm = distanceMeters / 1000;
        const fuelUsed = (distanceKm / 100) * this.vehicleEfficiency;
        return fuelUsed * this.fuelPricePerLiter;
    }

    /**
     * Calculate time cost (opportunity cost)
     */
    calculateTimeCost(durationSeconds) {
        const hours = durationSeconds / 3600;
        return hours * this.driverHourlyValue;
    }

    /**
     * Calculate traffic delay cost
     */
    calculateTrafficCost(trafficDelaySeconds) {
        if (!trafficDelaySeconds) return 0;
        return this.calculateTimeCost(trafficDelaySeconds);
    }

    /**
     * Calculate overall route score (0-100)
     */
    calculateOverallScore(factors) {
        let score = 50; // Start at neutral

        // Profit margin impact (±30 points)
        score += Math.min(30, factors.profitMargin * 0.5);

        // Time efficiency (±20 points)
        const timeScore = Math.min(20, factors.timeEfficiency);
        score += timeScore;

        // Fuel efficiency (±15 points)
        const fuelScore = Math.min(15, factors.fuelEfficiency / 100);
        score += fuelScore;

        // Penalties
        if (factors.hasTraffic) score -= 10;
        if (factors.hasTolls) score -= 5;

        return Math.max(0, Math.min(100, score));
    }

    /**
     * Create summary comparing all routes
     */
    createSummary(analyses) {
        const fastest = analyses.reduce((a, b) =>
            a.route.duration < b.route.duration ? a : b
        );
        const shortest = analyses.reduce((a, b) =>
            a.route.distance < b.route.distance ? a : b
        );
        const cheapest = analyses.reduce((a, b) =>
            a.analysis.totalCost < b.analysis.totalCost ? a : b
        );
        const mostProfitable = analyses.reduce((a, b) =>
            a.analysis.netProfit > b.analysis.netProfit ? a : b
        );

        return {
            fastest: {
                duration: fastest.route.duration,
                savings: fastest.route.duration
            },
            shortest: {
                distance: shortest.route.distance,
                savings: shortest.route.distance
            },
            cheapest: {
                cost: cheapest.analysis.totalCost,
                savings: cheapest.analysis.totalCost
            },
            mostProfitable: {
                profit: mostProfitable.analysis.netProfit,
                margin: mostProfitable.analysis.profitMargin
            }
        };
    }

    /**
     * Round to 2 decimal places
     */
    round(value) {
        return Math.round(value * 100) / 100;
    }

    /**
     * Format cost analysis for display
     */
    formatAnalysis(analysis) {
        return {
            costs: {
                fuel: `£${analysis.fuelCost.toFixed(2)}`,
                time: `£${analysis.timeCost.toFixed(2)}`,
                tolls: `£${analysis.tollCost.toFixed(2)}`,
                traffic: `£${analysis.trafficCost.toFixed(2)}`,
                total: `£${analysis.totalCost.toFixed(2)}`
            },
            profit: {
                fare: `£${analysis.fareAmount.toFixed(2)}`,
                net: `£${analysis.netProfit.toFixed(2)}`,
                margin: `${analysis.profitMargin.toFixed(1)}%`
            },
            efficiency: {
                timeValue: `£${analysis.timeEfficiency.toFixed(2)}/min`,
                distanceValue: `£${analysis.distanceEfficiency.toFixed(2)}/km`,
                fuelValue: `${analysis.fuelEfficiency.toFixed(0)}m/£`
            },
            score: Math.round(analysis.score),
            recommendation: this.getRecommendation(analysis.score)
        };
    }

    /**
     * Get recommendation based on score
     */
    getRecommendation(score) {
        if (score >= 80) return 'Excellent choice!';
        if (score >= 60) return 'Good option';
        if (score >= 40) return 'Acceptable';
        return 'Consider alternatives';
    }
}

module.exports = {
    NavigationProviderFactory,
    RouteCostOptimizer
};
