// ==========================================
// NAVIGATION SERVICE
// Real-time turn-by-turn navigation with automatic rerouting
// ==========================================

const { NavigationProviderFactory, RouteCostOptimizer } = require('./factory');
const EventEmitter = require('events');

/**
 * Navigation Service
 *
 * Provides:
 * - Route calculation with cost optimization
 * - Real-time turn-by-turn guidance
 * - Automatic rerouting when driver deviates
 * - Nostr event publishing for navigation updates
 * - Traffic-aware ETA updates
 */
class NavigationService extends EventEmitter {
    constructor(config = {}) {
        super();

        this.provider = null;
        this.optimizer = new RouteCostOptimizer(config.optimizer);

        // Active navigation sessions
        this.activeSessions = new Map();

        // Configuration
        this.rerouteThreshold = config.rerouteThreshold || 50; // meters off route
        this.etaUpdateInterval = config.etaUpdateInterval || 60000; // 1 minute
        this.instructionAdvanceDistance = config.instructionAdvanceDistance || 200; // 200m before turn
    }

    /**
     * Initialize navigation provider
     */
    async initialize() {
        try {
            this.provider = await NavigationProviderFactory.fromEnv();
            console.log(`✅ Navigation provider initialized: ${this.provider.providerName}`);

            const caps = this.provider.getCapabilities();
            console.log(`   Features: ${Object.keys(caps.features).filter(f => caps.features[f]).join(', ')}`);

        } catch (error) {
            console.error('❌ Failed to initialize navigation provider:', error.message);
            // Fall back to public OSRM
            try {
                const OSRMProvider = require('./osrm');
                this.provider = new OSRMProvider({});
                console.log('✅ Using fallback: public OSRM');
            } catch (fallbackError) {
                throw new Error('No navigation providers available');
            }
        }
    }

    /**
     * Calculate optimal route with cost analysis
     *
     * @param {Object} origin - {lat, lon}
     * @param {Object} destination - {lat, lon}
     * @param {Object} rideDetails - {fareAmount, rideId}
     * @returns {Promise<Object>} Route with cost analysis
     */
    async calculateOptimalRoute(origin, destination, rideDetails = {}) {
        try {
            // Get alternative routes
            const routes = await this.provider.getAlternatives(origin, destination, {
                traffic: true
            });

            // Analyze costs for each route
            const result = this.optimizer.findBestRoute(routes, rideDetails);

            // Emit event
            this.emit('routeCalculated', {
                rideId: rideDetails.rideId,
                recommended: result.recommended.route,
                alternatives: result.alternatives.map(a => a.route),
                analysis: result.recommended.analysis
            });

            return result;

        } catch (error) {
            console.error('Route calculation error:', error);
            throw error;
        }
    }

    /**
     * Start navigation session
     *
     * @param {string} rideId
     * @param {Route} route
     * @param {Object} currentPosition
     * @returns {NavigationSession}
     */
    startNavigation(rideId, route, currentPosition) {
        const session = new NavigationSession(rideId, route, currentPosition, {
            service: this,
            provider: this.provider,
            rerouteThreshold: this.rerouteThreshold,
            instructionAdvanceDistance: this.instructionAdvanceDistance
        });

        this.activeSessions.set(rideId, session);

        // Start monitoring
        session.start();

        // Emit start event
        this.emit('navigationStarted', {
            rideId,
            route,
            currentPosition
        });

        return session;
    }

    /**
     * Update driver position during navigation
     *
     * @param {string} rideId
     * @param {Object} position - {lat, lon, heading, speed}
     */
    async updatePosition(rideId, position) {
        const session = this.activeSessions.get(rideId);
        if (!session) {
            throw new Error(`No active navigation session for ride ${rideId}`);
        }

        await session.updatePosition(position);
    }

    /**
     * Stop navigation session
     *
     * @param {string} rideId
     */
    stopNavigation(rideId) {
        const session = this.activeSessions.get(rideId);
        if (session) {
            session.stop();
            this.activeSessions.delete(rideId);

            this.emit('navigationStopped', { rideId });
        }
    }

    /**
     * Get navigation status
     *
     * @param {string} rideId
     * @returns {Object} Status
     */
    getNavigationStatus(rideId) {
        const session = this.activeSessions.get(rideId);
        if (!session) {
            return null;
        }

        return session.getStatus();
    }

    /**
     * Create Nostr event for route
     */
    createRouteEvent(route, rideId) {
        return this.provider.createRouteEvent(route, rideId);
    }
}

/**
 * Navigation Session
 *
 * Manages a single active navigation session with:
 * - Position tracking
 * - Instruction advancement
 * - Automatic rerouting
 * - ETA updates
 */
class NavigationSession extends EventEmitter {
    constructor(rideId, route, startPosition, options = {}) {
        super();

        this.rideId = rideId;
        this.route = route;
        this.currentPosition = startPosition;
        this.instructions = route.instructions;
        this.currentInstructionIndex = 0;

        // Options
        this.service = options.service;
        this.provider = options.provider;
        this.rerouteThreshold = options.rerouteThreshold || 50;
        this.instructionAdvanceDistance = options.instructionAdvanceDistance || 200;

        // State
        this.isActive = false;
        this.isRerouting = false;
        this.distanceRemaining = route.distance;
        this.timeRemaining = route.duration;
        this.etaUpdateTimer = null;

        // Statistics
        this.stats = {
            startTime: Date.now(),
            distanceTraveled: 0,
            rerouteCount: 0,
            averageSpeed: 0
        };
    }

    /**
     * Start the session
     */
    start() {
        this.isActive = true;

        // Start ETA update timer
        this.etaUpdateTimer = setInterval(() => {
            this.updateETA();
        }, 60000); // Update every minute

        this.emit('started', {
            rideId: this.rideId,
            route: this.route,
            firstInstruction: this.getCurrentInstruction()
        });
    }

    /**
     * Stop the session
     */
    stop() {
        this.isActive = false;

        if (this.etaUpdateTimer) {
            clearInterval(this.etaUpdateTimer);
        }

        this.emit('stopped', {
            rideId: this.rideId,
            stats: this.stats
        });
    }

    /**
     * Update current position
     */
    async updatePosition(position) {
        if (!this.isActive) return;

        const previousPosition = this.currentPosition;
        this.currentPosition = position;

        // Calculate distance traveled
        const distanceMoved = this.provider.calculateDistance(previousPosition, position);
        this.stats.distanceTraveled += distanceMoved;
        this.distanceRemaining -= distanceMoved;

        // Update average speed
        const timeElapsed = (Date.now() - this.stats.startTime) / 1000; // seconds
        this.stats.averageSpeed = this.stats.distanceTraveled / timeElapsed;

        // Check if we need to advance to next instruction
        await this.checkInstructionProgress();

        // Check if we're off route
        await this.checkOffRoute();

        // Emit position update
        this.emit('positionUpdated', {
            rideId: this.rideId,
            position,
            distanceRemaining: this.distanceRemaining,
            timeRemaining: this.timeRemaining,
            currentInstruction: this.getCurrentInstruction()
        });
    }

    /**
     * Check if we need to advance to next instruction
     */
    async checkInstructionProgress() {
        const currentInstruction = this.getCurrentInstruction();
        if (!currentInstruction) return;

        const distanceToInstruction = this.provider.calculateDistance(
            this.currentPosition,
            currentInstruction.location
        );

        // If we're within advance distance, announce the instruction
        if (distanceToInstruction <= this.instructionAdvanceDistance &&
            !currentInstruction.announced) {

            currentInstruction.announced = true;

            this.emit('instructionAnnounced', {
                rideId: this.rideId,
                instruction: currentInstruction,
                distanceToInstruction
            });
        }

        // If we've passed the instruction, move to next
        if (distanceToInstruction < 10) { // 10m tolerance
            this.currentInstructionIndex++;

            this.emit('instructionCompleted', {
                rideId: this.rideId,
                completedInstruction: currentInstruction,
                nextInstruction: this.getCurrentInstruction()
            });
        }
    }

    /**
     * Check if driver is off route
     */
    async checkOffRoute() {
        if (this.isRerouting) return;

        // Calculate distance to route
        // (Simplified - real implementation would use perpendicular distance to route line)
        const distanceToNextInstruction = this.provider.calculateDistance(
            this.currentPosition,
            this.getCurrentInstruction().location
        );

        const expectedDistance = this.getCurrentInstruction().distance;
        const deviation = Math.abs(distanceToNextInstruction - expectedDistance);

        if (deviation > this.rerouteThreshold) {
            await this.reroute();
        }
    }

    /**
     * Reroute from current position
     */
    async reroute() {
        if (this.isRerouting) return;

        this.isRerouting = true;
        this.stats.rerouteCount++;

        try {
            console.log(`🔄 Rerouting ride ${this.rideId}...`);

            const newRoute = await this.provider.recalculateRoute(
                this.route,
                this.currentPosition
            );

            this.route = newRoute;
            this.instructions = newRoute.instructions;
            this.currentInstructionIndex = 0;
            this.distanceRemaining = newRoute.distance;
            this.timeRemaining = newRoute.duration;

            this.emit('rerouted', {
                rideId: this.rideId,
                newRoute,
                reason: 'off_route'
            });

        } catch (error) {
            console.error('Rerouting failed:', error);
            this.emit('rerouteFailed', {
                rideId: this.rideId,
                error: error.message
            });
        } finally {
            this.isRerouting = false;
        }
    }

    /**
     * Update ETA based on current traffic
     */
    async updateETA() {
        try {
            const newETA = await this.provider.calculateETA(
                this.currentPosition,
                this.route.destination
            );

            const etaChange = newETA - this.timeRemaining;

            if (Math.abs(etaChange) > 60) { // More than 1 minute change
                this.timeRemaining = newETA;

                this.emit('etaUpdated', {
                    rideId: this.rideId,
                    newETA,
                    change: etaChange
                });
            }
        } catch (error) {
            console.error('ETA update failed:', error);
        }
    }

    /**
     * Get current instruction
     */
    getCurrentInstruction() {
        return this.instructions[this.currentInstructionIndex] || null;
    }

    /**
     * Get next instruction
     */
    getNextInstruction() {
        return this.instructions[this.currentInstructionIndex + 1] || null;
    }

    /**
     * Get session status
     */
    getStatus() {
        return {
            rideId: this.rideId,
            isActive: this.isActive,
            currentPosition: this.currentPosition,
            currentInstruction: this.getCurrentInstruction(),
            nextInstruction: this.getNextInstruction(),
            distanceRemaining: this.distanceRemaining,
            timeRemaining: this.timeRemaining,
            progress: (this.stats.distanceTraveled / this.route.distance) * 100,
            stats: this.stats
        };
    }
}

module.exports = {
    NavigationService,
    NavigationSession
};
