// ==========================================
// DONKEYRIDE RELAY OPERATOR SERVER
// Anyone can run this to operate a stake relay
// Operators earn 0.5% of ride value for providing infrastructure
// ==========================================

// Load environment variables
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const Redis = require('redis');
const { PaymentProviderFactory, ResilientStakeManager } = require('./payment-providers/factory');
const { validateNIP98Auth } = require('./middleware/nip98-auth');
const {
    publicRateLimiter,
    authenticatedRateLimiter,
    rideCreationLimiter,
    stakeLimiter
} = require('./middleware/rate-limit');
const {
    getBitcoinPrice,
    estimateTripCost,
    fetchBitcoinPrices
} = require('./src/pricing/fiat-conversion');
const { RideManager, RideStatus } = require('./src/ride-manager');
const { getRoute } = require('./src/osrm-routing');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve demo.html and other static files

// ==========================================
// RELAY OPERATOR CONFIGURATION
// ==========================================

const config = {
    // Operator settings
    operatorName: process.env.OPERATOR_NAME || 'DonkeyRide Operator',
    operatorPubkey: process.env.OPERATOR_PUBKEY,
    operatorLightningAddress: process.env.OPERATOR_LIGHTNING,
    operatorFeePercent: parseFloat(process.env.OPERATOR_FEE_PERCENT) || 0.005, // Market-driven fee (default 0.5%)

    // Strike API (for now, later multiple providers)
    strikeApiKey: process.env.STRIKE_API_KEY,

    // Server settings
    port: process.env.PORT || 3000,
    wsPort: process.env.WS_PORT || 3001,

    // Nostr relay to publish events
    nostrRelay: process.env.NOSTR_RELAY || 'wss://relay.damus.io',

    // Operator policies
    maxStakeAmount: 10000, // Max stake in sats
    minStakeAmount: 50,    // Min stake in sats
    requireKYC: false,     // For larger amounts
};

// ==========================================
// PAYMENT PROVIDER INITIALIZATION
// ==========================================

// Initialize payment provider with automatic fallbacks
let paymentProvider;
let stakeManager;

async function initializePaymentProvider() {
    try {
        paymentProvider = await PaymentProviderFactory.fromEnv();
        console.log(`✅ Payment provider initialized: ${paymentProvider.providerName}`);

        // Display capabilities
        const caps = paymentProvider.getCapabilities();
        console.log(`   Trust model: ${caps.trustModel}`);
        console.log(`   Features: ${Object.keys(caps.features).filter(f => caps.features[f]).join(', ')}`);
    } catch (error) {
        console.error('❌ Failed to initialize payment provider:', error.message);
        console.error('   Make sure to configure at least one provider in .env');
        process.exit(1);
    }
}

/**
 * Build provider configuration map from environment variables.
 * Mirrors PaymentProviderFactory.fromEnv so we can reuse configs for stake manager.
 */
function buildProviderConfigsFromEnv() {
    return {
        demo: {},
        strike: {
            apiKey: process.env.STRIKE_API_KEY,
            baseUrl: process.env.STRIKE_BASE_URL
        },
        lnd: {
            host: process.env.LND_HOST || 'localhost:10009',
            cert: process.env.LND_CERT_PATH || '~/.lnd/tls.cert',
            macaroon: process.env.LND_MACAROON_PATH || '~/.lnd/data/chain/bitcoin/mainnet/admin.macaroon',
            network: process.env.LND_NETWORK || 'mainnet'
        },
        btcpay: {
            url: process.env.BTCPAY_URL,
            apiKey: process.env.BTCPAY_API_KEY,
            storeId: process.env.BTCPAY_STORE_ID
        },
        alby: {
            apiKey: process.env.ALBY_API_KEY,
            refreshToken: process.env.ALBY_REFRESH_TOKEN
        },
        cln: {
            socket: process.env.CLN_SOCKET || '~/.lightning/bitcoin/lightning-rpc',
            network: process.env.CLN_NETWORK || 'bitcoin'
        }
    };
}

function parseProviderList(envValue, fallback) {
    if (envValue && envValue.trim().length > 0) {
        return envValue.split(',').map(p => p.trim()).filter(Boolean);
    }
    return Array.isArray(fallback) ? fallback : [fallback];
}

async function initializeStakeManager() {
    const providerOrder = parseProviderList(
        process.env.STAKE_PROVIDERS,
        parseProviderList(process.env.PAYMENT_PROVIDER, 'demo')
    );

    // Allow explicit override of fallback order
    const fallbacks = parseProviderList(process.env.PAYMENT_FALLBACKS, []);
    fallbacks.forEach(p => {
        if (!providerOrder.includes(p)) {
            providerOrder.push(p);
        }
    });

    const configs = buildProviderConfigsFromEnv();
    const normalized = providerOrder.length > 0 ? providerOrder : ['demo'];

    stakeManager = new ResilientStakeManager(normalized, configs, PaymentProviderFactory);
    await stakeManager.initialize();
}

// ==========================================
// REDIS CLIENT
// ==========================================

let redis;

async function initializeRedis() {
    try {
        redis = Redis.createClient({
            url: process.env.REDIS_URL || 'redis://localhost:6379'
        });

        redis.on('error', (err) => console.error('Redis error:', err));

        await redis.connect();
        console.log('✅ Redis connected');
    } catch (error) {
        console.warn('⚠️  Redis not available - driver location features disabled');
        redis = null;
    }
}

const activeRides = new Map();
const stakeBalances = new Map();
const rideStreamingTimers = new Map();

const STREAM_INTERVAL_MS = 3000;
const STREAM_STEPS = 40;

// Initialize ride manager
const rideManager = new RideManager();

// ==========================================
// WEBSOCKET FOR REAL-TIME UPDATES
// ==========================================

const wss = new WebSocket.Server({ port: config.wsPort });

wss.on('connection', (ws) => {
    console.log('New client connected');
    ws.isAlive = true;

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            switch(data.type) {
                case 'subscribe_ride':
                    ws.rideId = data.rideId;
                    ws.clientType = 'rider';
                    console.log(`Rider subscribed to ride ${data.rideId}`);
                    break;

                case 'register_driver':
                    ws.driverNpub = data.npub;
                    ws.clientType = 'driver';
                    console.log(`Driver ${data.npub} registered for ride requests`);
                    break;

                case 'get_status':
                    ws.send(JSON.stringify({
                        type: 'status',
                        rides: rideManager.getActiveRides().length,
                        operator: config.operatorPubkey,
                        stats: rideManager.getStats()
                    }));
                    break;
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

// Heartbeat to detect broken connections
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(interval);
});

// Broadcast to specific ride
function broadcastToRide(rideId, message) {
    wss.clients.forEach(client => {
        if (client.rideId === rideId && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

// Broadcast to all drivers
function broadcastToDrivers(message) {
    let count = 0;
    wss.clients.forEach(client => {
        if (client.clientType === 'driver' && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
            count++;
        }
    });
    return count;
}

// Broadcast to all clients
function broadcastToAll(message) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

function updateRideStreamingState(rideId, patch = {}) {
    const safePatch = { ...patch };
    if (!Object.prototype.hasOwnProperty.call(safePatch, 'updatedAt')) {
        safePatch.updatedAt = Date.now();
    }

    const session = activeRides.get(rideId);
    if (session) {
        session.streaming = {
            ...(session.streaming || {}),
            ...safePatch
        };
    }

    const rideRecord = rideManager.getRide(rideId);
    if (rideRecord) {
        rideRecord.streaming = {
            ...(rideRecord.streaming || {}),
            ...safePatch
        };
    }
}

function startStreamingForRide(rideId) {
    if (rideStreamingTimers.has(rideId)) {
        return;
    }

    const ride = rideManager.getRide(rideId);
    if (!ride || !ride.fare || ride.fare <= 0) {
        return;
    }

    const fareSats = ride.fare;
    const step = Math.max(1, Math.floor(fareSats / STREAM_STEPS));

    const state = {
        totalPaid: 0,
        fareSats,
        step,
        interval: null
    };

    const startedAt = Date.now();
    updateRideStreamingState(rideId, {
        totalPaid: 0,
        fare: fareSats,
        startedAt
    });

    state.interval = setInterval(() => {
        const remaining = Math.max(0, state.fareSats - state.totalPaid);
        const amount = Math.min(state.step, remaining);

        if (amount <= 0) {
            stopStreamingForRide(rideId);
            return;
        }

        state.totalPaid += amount;

        updateRideStreamingState(rideId, {
            totalPaid: state.totalPaid,
            fare: state.fareSats,
            lastAmount: amount
        });

        broadcastToRide(rideId, {
            type: 'stream_payment',
            ride_id: rideId,
            amount_sats: amount,
            total_paid_sats: state.totalPaid,
            fare_sats: state.fareSats,
            remaining_sats: Math.max(0, state.fareSats - state.totalPaid),
            timestamp: Date.now()
        });

        if (state.totalPaid >= state.fareSats) {
            stopStreamingForRide(rideId);
        }
    }, STREAM_INTERVAL_MS);

    rideStreamingTimers.set(rideId, state);
}

function stopStreamingForRide(rideId) {
    const state = rideStreamingTimers.get(rideId);
    if (!state) {
        return;
    }

    clearInterval(state.interval);
    rideStreamingTimers.delete(rideId);
    updateRideStreamingState(rideId, {
        totalPaid: state.totalPaid,
        fare: state.fareSats,
        stoppedAt: Date.now()
    });
}

function finalizeRideSession(rideId, finalStatus) {
    const session = activeRides.get(rideId);
    if (session) {
        if (finalStatus) {
            session.status = finalStatus;
        }
        session.finalizedAt = Date.now();
    }

    stopStreamingForRide(rideId);
    activeRides.delete(rideId);

    const rideRecord = rideManager.getRide(rideId);
    if (rideRecord) {
        rideRecord.finalizedAt = Date.now();
    }
}

// ==========================================
// REST API ENDPOINTS
// ==========================================

// Get relay operator info (public endpoint)
app.get('/info', publicRateLimiter, (req, res) => {
    const caps = paymentProvider.getCapabilities();

    res.json({
        name: config.operatorName,
        operator: config.operatorPubkey,
        lightning: config.operatorLightningAddress,
        fee: `${config.operatorFeePercent * 100}%`,
        feePercent: config.operatorFeePercent,
        maxStake: config.maxStakeAmount,
        minStake: config.minStakeAmount,
        activeRides: activeRides.size,
        uptime: process.uptime(),
        version: '1.0.0',
        nostrRelay: config.nostrRelay,
        paymentProvider: {
            name: paymentProvider.providerName,
            type: caps.type,
            trustModel: caps.trustModel,
            features: caps.features
        },
        mechanisms: [caps.type]
    });
});

// Create ride session with stakes
app.post('/rides/create', validateNIP98Auth, rideCreationLimiter, async (req, res) => {
    try {
        const { rideId, riderId, fareAmount } = req.body;

        const authenticatedPubkey = req.user.pubkey;
        if (riderId && riderId.toLowerCase() !== authenticatedPubkey.toLowerCase()) {
            return res.status(403).json({
                error: 'Forbidden',
                details: 'Authenticated pubkey must match riderId'
            });
        }
        
        // Calculate stakes
        const riderStake = Math.max(config.minStakeAmount, Math.floor(fareAmount * 0.1));
        const operatorFee = Math.floor(fareAmount * config.operatorFeePercent);
        
        // Create Lightning invoice for rider to pay stake
        const invoice = await createLightningInvoice(riderStake, `Stake for ride ${rideId}`);
        
        // Store ride session
        activeRides.set(rideId, {
            riderId: authenticatedPubkey,
            fareAmount,
            riderStake,
            operatorFee,
            status: 'waiting_rider_stake',
            createdAt: Date.now(),
            invoice
        });
        
        res.json({
            success: true,
            rideId,
            invoice: invoice.payment_request,
            stakeAmount: riderStake,
            operatorFee,
            expiresAt: Date.now() + 600000 // 10 minutes
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Rider pays stake
app.post('/rides/:rideId/rider-stake', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { paymentProof } = req.body;
        
        const ride = activeRides.get(rideId);
        if (!ride) throw new Error('Ride not found');
        
        // Verify payment and lock stake
        const stakeLock = await stakeManager.lockStake(
            rideId,
            ride.riderId,
            ride.riderStake,
            'rider'
        );
        
        ride.status = 'waiting_driver';
        ride.riderStakeLocked = true;
        ride.riderStakeProof = stakeLock.holdId;
        
        // Broadcast to WebSocket clients
        broadcastToRide(rideId, {
            type: 'rider_stake_locked',
            amount: ride.riderStake
        });
        
        res.json({
            success: true,
            status: 'stake_locked',
            proof: stakeLock.event
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Driver accepts and stakes
app.post('/rides/:rideId/driver-accept', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { driverId, driverLightning } = req.body;
        
        const ride = activeRides.get(rideId);
        if (!ride) throw new Error('Ride not found');
        if (ride.status !== 'waiting_driver') throw new Error('Ride not available');
        
        // Calculate driver stake (15% of fare)
        const driverStake = Math.max(config.minStakeAmount, Math.floor(ride.fareAmount * 0.15));
        
        // Create invoice for driver
        const invoice = await createLightningInvoice(driverStake, `Driver stake for ${rideId}`);
        
        ride.driverId = driverId;
        ride.driverLightning = driverLightning;
        ride.driverStake = driverStake;
        ride.status = 'waiting_driver_stake';
        ride.driverInvoice = invoice.payment_request;
        
        res.json({
            success: true,
            invoice: invoice.payment_request,
            stakeAmount: driverStake
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Driver pays stake
app.post('/rides/:rideId/driver-stake', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { paymentProof } = req.body;
        
        const ride = activeRides.get(rideId);
        if (!ride) throw new Error('Ride not found');
        
        // Lock driver stake
        const stakeLock = await stakeManager.lockStake(
            rideId,
            ride.driverId,
            ride.driverStake,
            'driver'
        );
        
        ride.status = 'active';
        ride.driverStakeLocked = true;
        ride.driverStakeProof = stakeLock.holdId;
        ride.startedAt = Date.now();

        // Notify rider that driver stake is locked
        broadcastToRide(rideId, {
            type: 'driver_stake_locked',
            driver: ride.driverId,
            stake: ride.driverStake,
            timestamp: ride.startedAt
        });

        res.json({
            success: true,
            status: 'ride_active',
            proof: stakeLock.event
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Complete ride and release stakes
app.post('/rides/:rideId/complete', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { completionProof } = req.body;
        
        const ride = activeRides.get(rideId);
        if (!ride) throw new Error('Ride not found');
        if (ride.status !== 'active') throw new Error('Ride not active');
        
        // Release both stakes
        const riderRelease = await stakeManager.releaseStakes(`${rideId}_rider`);
        const driverRelease = await stakeManager.releaseStakes(`${rideId}_driver`);
        
        // Pay operator fee (from fare, not stakes)
        const operatorPayment = await payOperatorFee(ride.operatorFee);

        const completionTimestamp = Date.now();
        const payment = {
            success: true,
            payment_hash: `mock_hash_${completionTimestamp}`,
            amount_sats: ride.fareAmount,
            timestamp: completionTimestamp
        };
        
        ride.status = 'completed';
        ride.completedAt = completionTimestamp;

        const rideRecord = rideManager.getRide(rideId);
        if (rideRecord && rideRecord.status !== RideStatus.COMPLETED) {
            try {
                rideManager.completeTrip(rideId, payment);
            } catch (err) {
                console.warn(`Ride ${rideId} completion already processed:`, err.message);
            }
        } else if (rideRecord && rideRecord.status === RideStatus.COMPLETED) {
            rideRecord.payment = rideRecord.payment || payment;
        }
        
        // Broadcast completion
        broadcastToRide(rideId, {
            type: 'ride_completed',
            operatorFee: ride.operatorFee,
            duration: ride.completedAt - ride.startedAt
        });

        finalizeRideSession(rideId, 'completed');
        
        res.json({
            success: true,
            riderStakeReleased: true,
            driverStakeReleased: true,
            operatorFeePaid: ride.operatorFee,
            releases: [riderRelease.event, driverRelease.event]
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Cancel ride with penalties
app.post('/rides/:rideId/cancel', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { cancelledBy, reason } = req.body;
        
        const ride = activeRides.get(rideId);
        if (!ride) throw new Error('Ride not found');

        stopStreamingForRide(rideId);

        let penalty = {};
        
        if (ride.status === 'active') {
            // Apply penalties based on who cancelled
            if (cancelledBy === ride.driverId) {
                // Driver cancelled - forfeit 80% of driver stake to rider
                penalty = await stakeManager.forfeitStake(
                    `${rideId}_driver`,
                    ride.driverId,
                    'driver_cancelled'
                );
                
                // Release rider stake
                await stakeManager.releaseStakes(`${rideId}_rider`);
                
            } else if (cancelledBy === ride.riderId) {
                // Rider cancelled - forfeit 80% of rider stake to driver  
                penalty = await stakeManager.forfeitStake(
                    `${rideId}_rider`,
                    ride.riderId,
                    'rider_cancelled'
                );
                
                // Release driver stake
                await stakeManager.releaseStakes(`${rideId}_driver`);
            }
        }
        
        ride.status = 'cancelled';
        ride.cancelledBy = cancelledBy;
        ride.cancelReason = reason;
        ride.cancelledAt = Date.now();

        try {
            rideManager.cancelRide(
                rideId,
                cancelledBy || 'unknown',
                reason || 'cancelled'
            );
        } catch (err) {
            console.warn(`Ride ${rideId} cancellation already processed:`, err.message);
        }
        
        // Broadcast cancellation
        broadcastToRide(rideId, {
            type: 'ride_cancelled',
            ride_id: rideId,
            cancelledBy,
            penalty: penalty.penalty || 0
        });
        broadcastToDrivers({
            type: 'ride_cancelled',
            ride_id: rideId,
            cancelledBy,
            penalty: penalty.penalty || 0
        });

        finalizeRideSession(rideId, 'cancelled');
        
        res.json({
            success: true,
            cancelledBy,
            penalty: penalty.penalty || 0,
            refund: penalty.refund || 0
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get ride status
app.get('/rides/:rideId', (req, res) => {
    const { rideId } = req.params;
    const session = activeRides.get(rideId);

    if (session) {
        const response = {
            rideId,
            status: session.status,
            fareAmount: session.fareAmount,
            riderStake: session.riderStake,
            driverStake: session.driverStake,
            operatorFee: session.operatorFee,
            createdAt: session.createdAt,
            startedAt: session.startedAt,
            completedAt: session.completedAt,
            streaming: session.streaming || null,
            finalizedAt: session.finalizedAt || null
        };

        return res.json(response);
    }

    const rideRecord = rideManager.getRide(rideId);
    if (!rideRecord) {
        return res.status(404).json({ error: 'Ride not found' });
    }

    const timestamps = rideRecord.timestamps || {};
    const response = {
        rideId,
        status: rideRecord.status,
        fareAmount: rideRecord.fare,
        riderId: rideRecord.rider?.npub,
        driverId: rideRecord.driver?.npub || null,
        createdAt: timestamps.requested,
        startedAt: timestamps.started,
        completedAt: timestamps.completed,
        cancelledAt: timestamps.cancelled,
        streaming: rideRecord.streaming || null,
        finalizedAt: rideRecord.finalizedAt || timestamps.completed || timestamps.cancelled || null
    };

    res.json(response);
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        activeRides: rideManager.getActiveRides().length,
        memoryUsage: process.memoryUsage(),
        redisConnected: !!redis
    });
});

// ==========================================
// DEMO & TRACKING API ENDPOINTS
// ==========================================

// Get available drivers
app.get('/api/drivers/available', publicRateLimiter, async (req, res) => {
    try {
        if (!redis) {
            return res.json({ drivers: [] });
        }

        // Get all online drivers from Redis
        const keys = await redis.keys('driver:online:*');

        if (keys.length === 0) {
            return res.json({ drivers: [] });
        }

        // Fetch driver data
        const driversData = await Promise.all(
            keys.map(async (key) => {
                const data = await redis.get(key);
                return data ? JSON.parse(data) : null;
            })
        );

        // Filter out null entries and add additional info
        const drivers = driversData
            .filter(d => d !== null)
            .map(driver => ({
                npub: driver.npub,
                name: driver.name || 'Driver',
                location: driver.location,
                available: driver.available !== false,
                rating: driver.rating || 5.0,
                totalRides: driver.totalRides || 0,
                lastUpdate: driver.lastUpdate
            }));

        res.json({
            drivers,
            count: drivers.length,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('Error fetching drivers:', error);
        res.status(500).json({
            error: 'Failed to fetch drivers',
            details: error.message
        });
    }
});

// Estimate trip cost
app.post('/api/trips/estimate', publicRateLimiter, async (req, res) => {
    try {
        const { pickup_lat, pickup_lon, dropoff_lat, dropoff_lon, currency } = req.body;

        // Validate inputs
        if (!pickup_lat || !pickup_lon || !dropoff_lat || !dropoff_lon) {
            return res.status(400).json({
                error: 'Missing required parameters',
                required: ['pickup_lat', 'pickup_lon', 'dropoff_lat', 'dropoff_lon']
            });
        }

        // Calculate distance using Haversine formula
        const distance = calculateDistance(
            pickup_lat,
            pickup_lon,
            dropoff_lat,
            dropoff_lon
        );

        // Estimate duration based on average speed (30 km/h in city)
        const duration = (distance / 30) * 60; // minutes

        // Get detailed cost estimate with dual pricing
        const estimate = await estimateTripCost(distance, duration, {
            currency: currency || 'USD',
            operatorFeePct: config.operatorFeePercent
        });

        res.json({
            ...estimate,
            pickup: { lat: pickup_lat, lon: pickup_lon },
            dropoff: { lat: dropoff_lat, lon: dropoff_lon },
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('Error estimating trip cost:', error);
        res.status(500).json({
            error: 'Failed to estimate trip cost',
            details: error.message
        });
    }
});

// Get current BTC prices
app.get('/api/prices/btc', publicRateLimiter, async (req, res) => {
    try {
        // Fetch prices for all supported currencies
        const prices = {
            USD: await getBitcoinPrice('USD'),
            EUR: await getBitcoinPrice('EUR'),
            GBP: await getBitcoinPrice('GBP')
        };

        res.json({
            prices,
            lastUpdate: Date.now(),
            source: 'CoinGecko'
        });

    } catch (error) {
        console.error('Error fetching BTC prices:', error);
        res.status(500).json({
            error: 'Failed to fetch BTC prices',
            details: error.message
        });
    }
});

// Refresh BTC prices (for testing)
app.post('/api/prices/refresh', async (req, res) => {
    try {
        await fetchBitcoinPrices();
        res.json({
            success: true,
            message: 'Prices refreshed',
            timestamp: Date.now()
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to refresh prices',
            details: error.message
        });
    }
});

// Preview route (calculate route without creating a ride)
app.post('/api/routes/preview', publicRateLimiter, async (req, res) => {
    try {
        const { from_lat, from_lon, to_lat, to_lon } = req.body;

        // Validate inputs
        if (!from_lat || !from_lon || !to_lat || !to_lon) {
            return res.status(400).json({
                error: 'Missing required parameters',
                required: ['from_lat', 'from_lon', 'to_lat', 'to_lon']
            });
        }

        // Try to get OSRM route
        const osrmRoute = await getRoute(from_lat, from_lon, to_lat, to_lon);

        if (osrmRoute) {
            res.json({
                success: true,
                route: osrmRoute.coordinates,
                distance_km: parseFloat(osrmRoute.distanceKm),
                duration_seconds: osrmRoute.duration,
                duration_minutes: osrmRoute.durationMin,
                points: osrmRoute.coordinates.length
            });
        } else {
            // No OSRM available, return null route
            res.json({
                success: true,
                route: null,
                message: 'OSRM routing not available'
            });
        }

    } catch (error) {
        console.error('Error previewing route:', error);
        res.status(500).json({
            error: 'Failed to preview route',
            details: error.message
        });
    }
});

// ==========================================
// MVP RIDE APIs
// ==========================================

// Request a ride
    app.post('/api/rides/request', publicRateLimiter, async (req, res) => {
        try {
            const {
                pickup_lat,
                pickup_lon,
                dropoff_lat,
                dropoff_lon,
                rider_npub,
                ride_id,
                fare_sats
            } = req.body;

            // Validate
            if (!pickup_lat || !pickup_lon || !dropoff_lat || !dropoff_lon) {
                return res.status(400).json({
                    error: 'Missing required parameters',
                required: ['pickup_lat', 'pickup_lon', 'dropoff_lat', 'dropoff_lon']
            });
        }

            // Use default rider if not provided (for MVP)
            const riderNpub = rider_npub || 'npub_test_rider';
            const rideOptions = ride_id ? { rideId: ride_id } : {};

            // Try to get OSRM route for real road routing
            let distance, duration, routeCoordinates = null;
            const osrmRoute = await getRoute(pickup_lat, pickup_lon, dropoff_lat, dropoff_lon);

        if (osrmRoute) {
            // Use OSRM routing data
            distance = parseFloat(osrmRoute.distanceKm);
            duration = osrmRoute.durationMin;
            routeCoordinates = osrmRoute.coordinates;
            console.log(`🗺️  Using OSRM routing: ${distance.toFixed(2)}km, ${duration} min, ${routeCoordinates.length} points`);
        } else {
            // Fallback to straight-line calculation
            distance = calculateDistance(pickup_lat, pickup_lon, dropoff_lat, dropoff_lon);
            duration = (distance / 30) * 60; // 30 km/h average
            console.log(`📏 Using straight-line routing: ${distance.toFixed(2)}km`);
        }

            const estimate = await estimateTripCost(distance, duration, {
                currency: 'USD',
                operatorFeePct: config.operatorFeePercent
            });

            const estimatedFareSats = fare_sats
                ? parseInt(fare_sats, 10)
                : estimate.fare.sats;

            // Create ride
            const ride = rideManager.createRide(
                riderNpub,
                { lat: pickup_lat, lon: pickup_lon },
                { lat: dropoff_lat, lon: dropoff_lon },
                estimatedFareSats,
                rideOptions
            );

            // Add route coordinates if available
            if (routeCoordinates) {
                ride.route = routeCoordinates;
            }

            if (rideOptions.rideId) {
                const session = activeRides.get(rideOptions.rideId);
                if (session) {
                    session.pickup = ride.pickup;
                    session.dropoff = ride.dropoff;
                    session.estimate = estimate;
                    session.route = routeCoordinates;
                }
            }

            // Broadcast to all drivers
            const driverCount = broadcastToDrivers({
                type: 'ride_request',
                ride: {
                id: ride.id,
                pickup: ride.pickup,
                dropoff: ride.dropoff,
                    fare: ride.fare,
                    distance: distance,
                    estimatedFare: estimate,
                    route: routeCoordinates
                }
            });

            console.log(`📢 Broadcast ride request ${ride.id} to ${driverCount} drivers`);

            res.json({
                success: true,
                ride_id: ride.id,
                status: ride.status,
                estimated_fare: estimatedFareSats,
                estimated_cost: estimate.fare.formatted,
                distance_km: distance,
                duration_minutes: Math.round(duration),
                drivers_notified: driverCount,
                route: routeCoordinates,
                estimate
            });

    } catch (error) {
        console.error('Error requesting ride:', error);
        res.status(500).json({
            error: 'Failed to request ride',
            details: error.message
        });
    }
});

// Driver accepts ride
app.post('/api/rides/:rideId/accept', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { driver_npub, driver_name, driver_location, driver_rating } = req.body;

        const ride = rideManager.acceptRide(rideId, driver_npub, {
            name: driver_name,
            location: driver_location,
            rating: driver_rating
        });

        // If ride is null, another driver already accepted (race condition)
        if (!ride) {
            return res.status(400).json({
                error: 'Ride already accepted by another driver'
            });
        }

        // Start en route
        rideManager.startEnRoute(rideId);

        // Calculate driver-to-pickup route using OSRM
        let driverRoute = null;
        const driverToPickupRoute = await getRoute(
            driver_location.lat,
            driver_location.lon,
            ride.pickup.lat,
            ride.pickup.lon
        );

        if (driverToPickupRoute) {
            driverRoute = driverToPickupRoute.coordinates;
            console.log(`🚗 Driver route calculated: ${driverToPickupRoute.distanceKm}km to pickup, ${driverRoute.length} points`);
        }

        // Calculate ETA
        const eta = driverToPickupRoute
            ? driverToPickupRoute.duration  // Use OSRM duration in seconds
            : rideManager.calculateETA(driver_location, ride.pickup);

        // Notify rider with driver route
        broadcastToRide(rideId, {
            type: 'ride_matched',
            ride: {
                id: ride.id,
                status: ride.status,
                driver: ride.driver,
                eta_seconds: eta,
                driver_route: driverRoute  // Route from driver to pickup
            }
        });

        res.json({
            success: true,
            ride,
            eta_seconds: eta,
            driver_route: driverRoute
        });

    } catch (error) {
        console.error('Error accepting ride:', error);
        res.status(400).json({
            error: 'Failed to accept ride',
            details: error.message
        });
    }
});

// Update driver location (during ride)
app.post('/api/rides/:rideId/location', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { lat, lon } = req.body;

        const ride = rideManager.getRide(rideId);

        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }

        // Determine destination based on status
        let destination;
        if (ride.status === RideStatus.DRIVER_EN_ROUTE) {
            destination = ride.pickup;
        } else if (ride.status === RideStatus.ACTIVE) {
            destination = ride.dropoff;
        }

        // Calculate ETA if we have a destination
        let eta = null;
        if (destination) {
            eta = rideManager.calculateETA({ lat, lon }, destination);
        }

        // Update location
        rideManager.updateDriverLocation(rideId, { lat, lon }, eta);

        // Broadcast to rider
        broadcastToRide(rideId, {
            type: 'driver_location',
            ride_id: rideId,
            location: { lat, lon },
            eta_seconds: eta
        });

        res.json({
            success: true,
            eta_seconds: eta
        });

    } catch (error) {
        console.error('Error updating location:', error);
        res.status(500).json({
            error: 'Failed to update location',
            details: error.message
        });
    }
});

// Driver arrived at pickup
app.post('/api/rides/:rideId/arrive', async (req, res) => {
    try {
        const { rideId } = req.params;

        const ride = rideManager.arriveAtPickup(rideId);

        // Notify rider
        broadcastToRide(rideId, {
            type: 'driver_arrived',
            ride_id: rideId,
            ride
        });

        res.json({
            success: true,
            ride
        });

    } catch (error) {
        console.error('Error marking arrival:', error);
        res.status(400).json({
            error: 'Failed to mark arrival',
            details: error.message
        });
    }
});

// Start trip
app.post('/api/rides/:rideId/start', async (req, res) => {
    try {
        const { rideId } = req.params;

        const ride = rideManager.startTrip(rideId);
        startStreamingForRide(rideId);

        // Notify rider
        broadcastToRide(rideId, {
            type: 'trip_started',
            ride_id: rideId,
            ride
        });

        res.json({
            success: true,
            ride
        });

    } catch (error) {
        console.error('Error starting trip:', error);
        res.status(400).json({
            error: 'Failed to start trip',
            details: error.message
        });
    }
});

// Panic / emergency alert
app.post('/api/rides/:rideId/panic', (req, res) => {
    try {
        const { rideId } = req.params;
        const { initiatedBy, role, note } = req.body || {};

        const ride = rideManager.getRide(rideId);
        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }

        const timestamp = Date.now();
        const session = activeRides.get(rideId);
        if (session) {
            session.panicActive = true;
            session.panicAt = timestamp;
            session.status = 'panic';
        }

        ride.safety = ride.safety || { panicEvents: [], checkIns: [] };
        ride.safety.panicEvents.push({
            initiatedBy: initiatedBy || role || 'unknown',
            role: role || null,
            note: note || null,
            timestamp
        });
        ride.history.push({
            status: 'panic_alert',
            timestamp,
            by: initiatedBy || role || 'unknown'
        });

        updateRideStreamingState(rideId, { panicTriggeredAt: timestamp });
        stopStreamingForRide(rideId);

        broadcastToRide(rideId, {
            type: 'panic_alert',
            ride_id: rideId,
            initiated_by: initiatedBy || role || 'unknown',
            note: note || null,
            timestamp
        });

        res.json({ success: true, timestamp });
    } catch (error) {
        console.error('Error handling panic alert:', error);
        res.status(500).json({
            error: 'Failed to trigger panic',
            details: error.message
        });
    }
});

// Record safety check-in
app.post('/api/rides/:rideId/check-in', (req, res) => {
    try {
        const { rideId } = req.params;
        const { status, source, note, by } = req.body || {};

        const ride = rideManager.getRide(rideId);
        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }

        const timestamp = Date.now();
        ride.safety = ride.safety || { panicEvents: [], checkIns: [] };
        ride.safety.checkIns.push({
            status: status || 'ok',
            source: source || 'manual',
            note: note || null,
            by: by || null,
            timestamp
        });

        broadcastToRide(rideId, {
            type: 'safety_check_update',
            ride_id: rideId,
            status: status || 'ok',
            source: source || 'manual',
            note: note || null,
            by: by || null,
            timestamp
        });

        res.json({ success: true, timestamp });
    } catch (error) {
        console.error('Error recording safety check:', error);
        res.status(500).json({
            error: 'Failed to record safety check',
            details: error.message
        });
    }
});

// Complete trip
app.post('/api/rides/:rideId/complete', async (req, res) => {
    try {
        const { rideId } = req.params;

        const ride = rideManager.getRide(rideId);

        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }

        // Mock payment
        const payment = {
            success: true,
            payment_hash: `mock_hash_${Date.now()}`,
            amount_sats: ride.fare,
            timestamp: Date.now()
        };

        const completedRide = rideManager.completeTrip(rideId, payment);
        stopStreamingForRide(rideId);

        // Notify rider
        broadcastToRide(rideId, {
            type: 'trip_completed',
            ride_id: rideId,
            ride: completedRide,
            payment
        });

        res.json({
            success: true,
            ride: completedRide,
            payment
        });

    } catch (error) {
        console.error('Error completing trip:', error);
        res.status(400).json({
            error: 'Failed to complete trip',
            details: error.message
        });
    }
});

// Get ride status
app.get('/api/rides/:rideId', (req, res) => {
    try {
        const { rideId } = req.params;

        const ride = rideManager.getRide(rideId);

        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }

        res.json({
            success: true,
            ride
        });

    } catch (error) {
        console.error('Error getting ride:', error);
        res.status(500).json({
            error: 'Failed to get ride',
            details: error.message
        });
    }
});

// Get ride stats
app.get('/api/rides/stats', (req, res) => {
    try {
        const stats = rideManager.getStats();
        const activeRides = rideManager.getActiveRides();

        res.json({
            success: true,
            stats,
            active_rides: activeRides.length,
            rides: activeRides.map(r => ({
                id: r.id,
                status: r.status,
                rider: r.rider.npub,
                driver: r.driver?.npub || null
            }))
        });

    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({
            error: 'Failed to get stats',
            details: error.message
        });
    }
});

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in kilometers
}

function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

async function createLightningInvoice(amount, memo) {
    // This would integrate with your Lightning node or Strike API
    // For now, returning mock invoice
    return {
        payment_request: `lnbc${amount}...`,
        payment_hash: Buffer.from(Math.random().toString()).toString('hex'),
        expires_at: Date.now() + 600000
    };
}

async function payOperatorFee(amount) {
    // Pay operator fee via Lightning
    console.log(`Paying operator fee: ${amount} sats to ${config.operatorLightningAddress}`);
    // Implementation would send actual Lightning payment
    return { success: true, amount };
}

// ==========================================
// SERVER STARTUP
// ==========================================

async function startServer() {
    // Initialize payment provider first
    await initializePaymentProvider();
    await initializeStakeManager();

    // Initialize Redis for driver tracking
    await initializeRedis();

    // Pre-fetch BTC prices
    try {
        await fetchBitcoinPrices();
        console.log('✅ BTC prices fetched');
    } catch (error) {
        console.warn('⚠️  Failed to fetch initial BTC prices');
    }

    // Start HTTP server
    app.listen(config.port, () => {
        console.log(`
    ========================================
    DonkeyRide Operator Server
    ========================================
    Name: ${config.operatorName}
    Operator: ${config.operatorPubkey || 'Not configured'}
    Lightning: ${config.operatorLightningAddress || 'Not configured'}
    Fee: ${config.operatorFeePercent * 100}%
    Payment Provider: ${paymentProvider.providerName} (${paymentProvider.type})
    API Port: ${config.port}
    WebSocket Port: ${config.wsPort}
    ========================================
    Server running at http://localhost:${config.port}
    WebSocket at ws://localhost:${config.wsPort}
    Demo UI at http://localhost:${config.port}/demo.html
    ========================================

    🔐 NIP-98 authentication enabled
    🛡️  Rate limiting active
    ⚡ Multiple payment providers supported
    💰 Dual pricing (sats + fiat) enabled
    🗺️  Driver tracking enabled
    ========================================

    API Endpoints:
    GET  /api/drivers/available   - List online drivers
    POST /api/trips/estimate       - Estimate trip cost
    GET  /api/prices/btc           - Get BTC prices
    GET  /info                     - Operator information
    ========================================
        `);
    });
}

// Start the server
startServer().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down gracefully...');

    // Release all active stakes before shutdown
    activeRides.forEach(async (ride, rideId) => {
        if (ride.status === 'active') {
            await stakeManager.releaseStakes(`${rideId}_rider`);
            await stakeManager.releaseStakes(`${rideId}_driver`);
        }
        stopStreamingForRide(rideId);
    });

    // Close connections
    wss.close();
    if (redis) {
        await redis.disconnect();
    }

    process.exit(0);
});

module.exports = app;
