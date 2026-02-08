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
const reputation = require('./src/nostr/reputation');
const stakeEvents = require('./src/nostr/stake-events');
const { validateNIP98Auth } = require('./middleware/nip98-auth');
const { getPublicKey: nostrGetPublicKey } = require('nostr-tools');
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
const { TaskManager } = require('./src/task-manager');
const { loadProfile, listProfiles } = require('./src/domain-profiles');
const { getRoute } = require('./src/osrm-routing');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve demo.html and other static files (legacy)

// Domain-agnostic route aliases: /api/tasks/* → /api/rides/*, /api/providers/* → /api/drivers/*
app.use((req, res, next) => {
    if (req.path.startsWith('/api/tasks')) {
        req.url = req.url.replace('/api/tasks', '/api/rides');
    } else if (req.path.startsWith('/api/providers')) {
        req.url = req.url.replace('/api/providers', '/api/drivers');
    }
    next();
});

// Serve React frontend build if available (web/dist/)
const path = require('path');
const reactBuildPath = path.join(__dirname, 'web', 'dist');
app.use(express.static(reactBuildPath));

// ==========================================
// RELAY OPERATOR CONFIGURATION
// ==========================================

const config = {
    // Operator settings
    operatorName: process.env.OPERATOR_NAME || 'DonkeyRide Operator',
    operatorPubkey: process.env.OPERATOR_PUBKEY,
    operatorPrivkey: process.env.OPERATOR_PRIVKEY,
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
// DOMAIN PROFILE
// ==========================================

const domainProfile = loadProfile(process.env.DOMAIN);
console.log(`\uD83C\uDF10 Domain profile loaded: ${domainProfile.name} (${domainProfile.id})`);

if (config.operatorPrivkey && !config.operatorPubkey) {
    try {
        config.operatorPubkey = nostrGetPublicKey(config.operatorPrivkey);
        console.log('🔑 Derived operator pubkey from OPERATOR_PRIVKEY');
    } catch (error) {
        console.warn('⚠️  Failed to derive operator pubkey from private key:', error.message);
    }
}

// ==========================================
// PAYMENT PROVIDER INITIALIZATION
// ==========================================

// Initialize payment provider with automatic fallbacks
let paymentProvider;
let stakeManager;
let httpServer = null;

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
    if ((process.env.DISABLE_REDIS || '').toLowerCase() === 'true') {
        console.log('⚠️  Redis disabled via DISABLE_REDIS env');
        redis = null;
        return;
    }
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

const STREAM_INTERVAL_MS = 1000;
const STREAM_STEPS = 15;

// Multi-domain task manager — routes operations to the correct domain's TaskManager.
// Supports frontend domain switching: tasks created under locksmith use locksmith states, etc.
const _domainManagers = new Map();
_domainManagers.set(domainProfile.id, new TaskManager(domainProfile));

function _getManagerForDomain(domainId) {
    if (!_domainManagers.has(domainId)) {
        const profile = loadProfile(domainId);
        _domainManagers.set(domainId, new TaskManager(profile));
    }
    return _domainManagers.get(domainId);
}

// Index: rideId → domainId (populated on create, lazy-filled on lookup)
const _rideIndex = new Map();

function _getManagerForRide(rideId) {
    const cached = _rideIndex.get(rideId);
    if (cached && _domainManagers.has(cached)) {
        return _domainManagers.get(cached);
    }
    for (const [domainId, mgr] of _domainManagers) {
        if (mgr.getRide(rideId)) {
            _rideIndex.set(rideId, domainId);
            return mgr;
        }
    }
    return _domainManagers.get(domainProfile.id);
}

// Drop-in replacement for the single TaskManager — same API, multi-domain routing
const rideManager = {
    // Ride lookup — searches all domain managers
    getRide(rideId) {
        return _getManagerForRide(rideId).getRide(rideId);
    },

    // Creation — accepts optional domain as last argument
    createRide(requester, pickup, dropoff, fare, options = {}) {
        const domain = options.domain || domainProfile.id;
        delete options.domain;
        const mgr = _getManagerForDomain(domain);
        const ride = mgr.createRide(requester, pickup, dropoff, fare, options);
        _rideIndex.set(ride.id, domain);
        return ride;
    },

    // All per-ride operations delegate to the correct manager
    acceptRide(rideId, ...args) { return _getManagerForRide(rideId).acceptRide(rideId, ...args); },
    startEnRoute(rideId, ...args) { return _getManagerForRide(rideId).startEnRoute(rideId, ...args); },
    arriveAtPickup(rideId, ...args) { return _getManagerForRide(rideId).arriveAtPickup(rideId, ...args); },
    startTrip(rideId, ...args) { return _getManagerForRide(rideId).startTrip(rideId, ...args); },
    completeTrip(rideId, ...args) { return _getManagerForRide(rideId).completeTrip(rideId, ...args); },
    cancelRide(rideId, ...args) { return _getManagerForRide(rideId).cancelRide(rideId, ...args); },
    transitionTo(rideId, ...args) { return _getManagerForRide(rideId).transitionTo(rideId, ...args); },
    updateDriverLocation(rideId, ...args) { return _getManagerForRide(rideId).updateDriverLocation(rideId, ...args); },
    recordRating(rideId, ...args) { return _getManagerForRide(rideId).recordRating(rideId, ...args); },

    // Terminal check — uses the ride's own domain
    isTerminal(status) {
        for (const mgr of _domainManagers.values()) {
            if (mgr.isTerminal(status)) return true;
        }
        return false;
    },

    // ETA calculation is domain-independent (haversine)
    calculateETA(from, to, speed) {
        return _domainManagers.get(domainProfile.id).calculateETA(from, to, speed);
    },

    // Aggregate methods — merge across all domains
    getActiveRides() {
        const all = [];
        for (const mgr of _domainManagers.values()) {
            all.push(...mgr.getActiveRides());
        }
        return all;
    },
    getActiveTasks() { return this.getActiveRides(); },

    getStats() {
        const merged = { total: 0 };
        for (const mgr of _domainManagers.values()) {
            const s = mgr.getStats();
            for (const [key, val] of Object.entries(s)) {
                merged[key] = (merged[key] || 0) + val;
            }
        }
        return merged;
    },

    // Get the domain profile for a specific ride
    getProfileForRide(rideId) {
        return _getManagerForRide(rideId).profile;
    },
};
const relayConfig = (process.env.REPUTATION_RELAYS || `${process.env.NOSTR_RELAYS || ''},${config.nostrRelay || ''}`)
    .split(',')
    .map(r => r.trim())
    .filter(Boolean);
reputation.setRelays(relayConfig);
stakeEvents.configure({
    operatorPrivkey: config.operatorPrivkey,
    publishGeneric: (event) => reputation.publishGeneric(event, config.operatorPubkey || event.pubkey)
});

// ==========================================
// WEBSOCKET FOR REAL-TIME UPDATES
// ==========================================

const wsDisabled = (process.env.DISABLE_WS || '').toLowerCase() === 'true';
const wss = wsDisabled ? null : new WebSocket.Server({ port: config.wsPort });

if (wsDisabled) {
    console.log('⚠️  WebSocket broadcasting disabled via DISABLE_WS');
}

if (wss) {
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
                    sendPendingRideRequests(ws);
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
}

// Heartbeat to detect broken connections
const interval = wss ? setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000) : null;

if (wss) {
    wss.on('close', () => {
        clearInterval(interval);
    });
}

// Broadcast to specific ride
function broadcastToRide(rideId, message) {
    if (!wss) {
        return;
    }
    wss.clients.forEach(client => {
        if (client.rideId === rideId && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

// Broadcast to all drivers
function broadcastToDrivers(message) {
    if (!wss) {
        return 0;
    }
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
    if (!wss) {
        return;
    }
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

function sendPendingRideRequests(ws) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return;
    }

    const pendingRides = rideManager.getActiveRides().filter(
        (ride) => {
            const p = rideManager.getProfileForRide(ride.id);
            return ride.status === p.states.values.REQUESTED;
        }
    );

    pendingRides.forEach((ride) => {
        const session = activeRides.get(ride.id) || {};
        const estimate = session.estimate || null;
        const distanceKm = typeof session?.estimate?.distance?.km === 'number'
            ? session.estimate.distance.km
            : null;
        const payload = {
            type: 'ride_request',
            ride: {
                id: ride.id,
                pickup: ride.pickup,
                dropoff: ride.dropoff,
                fare: ride.fare,
                distance: distanceKm,
                estimatedFare: estimate,
                route: session.route || ride.route || null,
                currency: ride.currency || session.currency || 'GBP'
            }
        };

        try {
            ws.send(JSON.stringify(payload));
        } catch (error) {
            console.warn(`Failed to send pending ride ${ride.id} to driver:`, error.message);
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

        stakeEvents.publishStreamPayment({
            rideId,
            amount,
            totalPaid: state.totalPaid,
            fare: state.fareSats
        }).catch((err) => {
            console.warn(`Failed to publish stream payment for ${rideId}:`, err.message);
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
        domain: {
            id: domainProfile.id,
            name: domainProfile.name,
            description: domainProfile.description,
            roles: domainProfile.roles,
            discoveryMethod: domainProfile.discoveryMethod,
            pricingModel: domainProfile.pricingModel,
            features: domainProfile.features,
            states: Object.values(domainProfile.states.values)
        },
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
        const { rideId, riderId, fareAmount, currency } = req.body;

        const fareSats = parseInt(fareAmount, 10);
        if (!Number.isFinite(fareSats) || fareSats <= 0) {
            return res.status(400).json({ error: 'Invalid fare amount' });
        }

        let fiatCurrency = typeof currency === 'string' ? currency.toUpperCase() : 'GBP';
        if (!['USD', 'EUR', 'GBP'].includes(fiatCurrency)) {
            fiatCurrency = 'GBP';
        }

        const authenticatedPubkey = req.user.pubkey;
        if (riderId && riderId.toLowerCase() !== authenticatedPubkey.toLowerCase()) {
            return res.status(403).json({
                error: 'Forbidden',
                details: 'Authenticated pubkey must match riderId'
            });
        }
        
        // Calculate stakes
        const riderStake = Math.max(config.minStakeAmount, Math.floor(fareSats * 0.1));
        const operatorFee = Math.floor(fareSats * config.operatorFeePercent);
        
        // Create Lightning invoice for rider to pay stake
        const invoice = await createLightningInvoice(riderStake, `Stake for ride ${rideId}`);
        
        // Store ride session
        activeRides.set(rideId, {
            riderId: authenticatedPubkey,
            fareAmount: fareSats,
            riderStake,
            operatorFee,
            status: 'waiting_rider_stake',
            createdAt: Date.now(),
            invoice,
            currency: fiatCurrency
        });
        
        res.json({
            success: true,
            rideId,
            invoice: invoice.payment_request,
            stakeAmount: riderStake,
            operatorFee,
            currency: fiatCurrency,
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
        const rideRecord = rideManager.getRide(rideId);
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

        stakeEvents.publishStakeLock({
            rideId,
            role: 'rider',
            amount: ride.riderStake,
            participant: ride.riderId,
            providerEvent: stakeLock.event,
            escrowId: stakeLock.holdId
        }).catch((err) => {
            console.warn(`Failed to publish rider stake lock for ${rideId}:`, err.message);
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
        const { driverId, driverLightning, driverPubkey } = req.body;
        
        const ride = activeRides.get(rideId);
        if (!ride) throw new Error('Ride not found');
        if (ride.status !== 'waiting_driver') throw new Error('Ride not available');
        
        // Calculate driver stake (15% of fare)
        const driverStake = Math.max(config.minStakeAmount, Math.floor(ride.fareAmount * 0.15));
        
        // Create invoice for driver
        const invoice = await createLightningInvoice(driverStake, `Driver stake for ${rideId}`);
        
        const driverHex = (driverPubkey || driverId || '').toLowerCase();
        ride.driverId = driverHex;
        ride.driverNpub = driverId;
        ride.driverPubkey = driverHex;
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

        stakeEvents.publishStakeLock({
            rideId,
            role: 'driver',
            amount: ride.driverStake,
            participant: ride.driverId,
            providerEvent: stakeLock.event,
            escrowId: stakeLock.holdId
        }).catch((err) => {
            console.warn(`Failed to publish driver stake lock for ${rideId}:`, err.message);
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
        stakeEvents.publishStakeRelease({
            rideId,
            role: 'rider',
            amount: ride.riderStake,
            providerEvent: riderRelease?.event,
            reason: 'completed'
        }).catch((err) => {
            console.warn(`Failed to publish rider stake release for ${rideId}:`, err.message);
        });
        stakeEvents.publishStakeRelease({
            rideId,
            role: 'driver',
            amount: ride.driverStake,
            providerEvent: driverRelease?.event,
            reason: 'completed'
        }).catch((err) => {
            console.warn(`Failed to publish driver stake release for ${rideId}:`, err.message);
        });
        
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
        const rideProfile = rideManager.getProfileForRide(rideId);
        const completedState = rideProfile.states.values.COMPLETED;
        if (rideRecord && rideRecord.status !== completedState) {
            try {
                rideManager.completeTrip(rideId, payment);
            } catch (err) {
                console.warn(`Ride ${rideId} completion already processed:`, err.message);
            }
        } else if (rideRecord && rideRecord.status === completedState) {
            rideRecord.payment = rideRecord.payment || payment;
        }

        const rideSession = activeRides.get(rideId);
        const rideCurrency = rideRecord?.currency || rideSession?.currency || 'GBP';

        // Broadcast completion
        broadcastToRide(rideId, {
            type: 'ride_completed',
            operatorFee: ride.operatorFee,
            duration: ride.completedAt - ride.startedAt,
            currency: rideCurrency
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

        let penalty = { penalty: 0, refund: 0 };
        let penaltyResult = null;
        let riderReleaseResult = null;
        let driverReleaseResult = null;
        
        if (ride.status === 'active') {
            // Apply penalties based on who cancelled
            if (cancelledBy === ride.driverId) {
                // Driver cancelled - forfeit 80% of driver stake to rider
                penaltyResult = await stakeManager.forfeitStake(
                    `${rideId}_driver`,
                    ride.driverId,
                    'driver_cancelled'
                );
                
                // Release rider stake
                riderReleaseResult = await stakeManager.releaseStakes(`${rideId}_rider`);
            } else if (cancelledBy === ride.riderId) {
                // Rider cancelled - forfeit 80% of rider stake to driver  
                penaltyResult = await stakeManager.forfeitStake(
                    `${rideId}_rider`,
                    ride.riderId,
                    'rider_cancelled'
                );
                
                // Release driver stake
                driverReleaseResult = await stakeManager.releaseStakes(`${rideId}_driver`);
            }
        } else if (ride.status === 'waiting_driver' || ride.status === 'waiting_rider_stake') {
            if (ride.riderStakeLocked) {
                try {
                    riderReleaseResult = await stakeManager.releaseStakes(`${rideId}_rider`);
                    penalty.refund = ride.riderStake || 0;
                } catch (releaseError) {
                    console.warn(`Failed to release rider stake for ${rideId}:`, releaseError.message);
                }
            }
        }

        if (penaltyResult) {
            penalty.penalty = penaltyResult.penalty || 0;
            penalty.refund = penaltyResult.refund || penalty.refund || 0;
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
            penalty: penalty.penalty || 0,
            refund: penalty.refund || 0
        });
        broadcastToDrivers({
            type: 'ride_cancelled',
            ride_id: rideId,
            cancelledBy,
            penalty: penalty.penalty || 0
        });

        if (riderReleaseResult) {
            stakeEvents.publishStakeRelease({
                rideId,
                role: 'rider',
                amount: ride.riderStake,
                providerEvent: riderReleaseResult.event,
                reason: 'cancelled'
            }).catch((err) => {
                console.warn(`Failed to publish rider stake release for ${rideId}:`, err.message);
            });
        }
        if (driverReleaseResult) {
            stakeEvents.publishStakeRelease({
                rideId,
                role: 'driver',
                amount: ride.driverStake,
                providerEvent: driverReleaseResult.event,
                reason: 'cancelled'
            }).catch((err) => {
                console.warn(`Failed to publish driver stake release for ${rideId}:`, err.message);
            });
        }
        if (penaltyResult) {
            stakeEvents.publishStakePenalty({
                rideId,
                reason: reason || 'cancelled',
                penalty: penaltyResult.penalty,
                refund: penaltyResult.refund,
                providerEvent: penaltyResult.event
            }).catch((err) => {
                console.warn(`Failed to publish stake penalty for ${rideId}:`, err.message);
            });
        }

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
            finalizedAt: session.finalizedAt || null,
            currency: session.currency || 'GBP'
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
        finalizedAt: rideRecord.finalizedAt || timestamps.completed || timestamps.cancelled || null,
        currency: rideRecord.currency || 'GBP'
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
        const currencyRaw = typeof currency === 'string' ? currency.toUpperCase() : 'GBP';
        const fiatCurrency = ['USD', 'EUR', 'GBP'].includes(currencyRaw) ? currencyRaw : 'GBP';

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
            currency: fiatCurrency,
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
                fare_sats,
                currency,
                domain
            } = req.body;

            // Use request-specified domain profile if provided, else the server's startup profile
            const requestProfile = domain && domain !== domainProfile.id
                ? (() => { try { return loadProfile(domain); } catch { return domainProfile; } })()
                : domainProfile;

            let fiatCurrency = typeof currency === 'string' ? currency.toUpperCase() : 'GBP';
            if (!['USD', 'EUR', 'GBP'].includes(fiatCurrency)) {
                fiatCurrency = 'GBP';
            }

            // Validate — dropoff is optional for single-location domains (e.g. locksmith)
            if (!pickup_lat || !pickup_lon) {
                return res.status(400).json({
                    error: 'Missing required parameters',
                    required: ['pickup_lat', 'pickup_lon']
                });
            }

            if (requestProfile.features.requiresDestination && (!dropoff_lat || !dropoff_lon)) {
                return res.status(400).json({
                    error: 'Missing required parameters',
                    required: ['dropoff_lat', 'dropoff_lon']
                });
            }

            // Use default rider if not provided (for MVP)
            const riderNpub = rider_npub || 'npub_test_rider';
            const rideOptions = ride_id ? { rideId: ride_id } : {};
            const sessionForRide = ride_id ? activeRides.get(ride_id) : null;
            const riderPubkeyHex = (sessionForRide?.riderId || req.body.rider_pubkey || '').toLowerCase() || null;
            rideOptions.currency = fiatCurrency;
            rideOptions.domain = requestProfile.id;

            // Try to get OSRM route for real road routing
            let distance, duration, routeCoordinates = null;
            const hasDropoff = dropoff_lat && dropoff_lon;

            if (hasDropoff) {
                const osrmRoute = await getRoute(pickup_lat, pickup_lon, dropoff_lat, dropoff_lon);

                if (osrmRoute) {
                    // Use OSRM routing data
                    distance = parseFloat(osrmRoute.distanceKm);
                    duration = osrmRoute.durationMin;
                    routeCoordinates = osrmRoute.coordinates;
                    const distanceMiles = distance * 0.621371;
                    console.log(`🗺️  Using OSRM routing: ${distance.toFixed(2)}km (${distanceMiles.toFixed(2)}mi), ${duration} min, ${routeCoordinates.length} points`);
                } else {
                    // Fallback to straight-line calculation
                    distance = calculateDistance(pickup_lat, pickup_lon, dropoff_lat, dropoff_lon);
                    duration = (distance / 45) * 60; // faster fallback (~45 km/h) to keep demos snappy
                    const distanceMiles = distance * 0.621371;
                    console.log(`📏 Using straight-line routing: ${distance.toFixed(2)}km (${distanceMiles.toFixed(2)}mi)`);
                }
            } else {
                // Single-location domain (e.g. locksmith) — no route to calculate
                distance = 0;
                duration = 0;
                console.log(`📍 Single-location task — no route needed`);
            }

            const estimate = await estimateTripCost(distance, duration, {
                currency: fiatCurrency,
                operatorFeePct: config.operatorFeePercent
            });

            const estimatedFareSats = fare_sats
                ? parseInt(fare_sats, 10)
                : estimate.fare.sats;

            // Create ride
            const dropoffLocation = hasDropoff ? { lat: dropoff_lat, lon: dropoff_lon } : null;
            const ride = rideManager.createRide(
                { npub: riderNpub, pubkey: riderPubkeyHex },
                { lat: pickup_lat, lon: pickup_lon },
                dropoffLocation,
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
                    session.currency = fiatCurrency;
                }
            }

            ride.currency = fiatCurrency;

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
                    route: routeCoordinates,
                    currency: fiatCurrency,
                    rider: ride.rider ? {
                        npub: ride.rider.npub,
                        pubkey: ride.rider.pubkey
                    } : null
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
                currency: fiatCurrency,
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
        const { driver_npub, driver_name, driver_location, driver_rating, driver_pubkey } = req.body;

        const ride = rideManager.acceptRide(rideId, driver_npub, {
            name: driver_name,
            location: driver_location,
            rating: driver_rating,
            pubkey: driver_pubkey
        });

        const activeSession = activeRides.get(rideId);
        if (activeSession) {
            activeSession.driverId = (driver_pubkey || activeSession.driverId || driver_npub || '').toLowerCase();
            activeSession.driverNpub = driver_npub;
        }

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

        // Notify rider with driver route (emit both legacy and generic event types)
        const matchPayload = {
            id: ride.id,
            status: ride.status,
            driver: ride.driver,
            eta_seconds: eta,
            driver_route: driverRoute  // Route from driver to pickup
        };
        broadcastToRide(rideId, { type: 'ride_matched', ride: matchPayload });
        broadcastToRide(rideId, { type: 'task_matched', task: matchPayload });

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

        // Determine destination based on status (using the ride's domain profile)
        const rideProfile = rideManager.getProfileForRide(rideId);
        let destination;
        if (ride.status === rideProfile.states.values.PROVIDER_EN_ROUTE) {
            destination = ride.pickup;
        } else if (ride.status === rideProfile.states.values.ACTIVE) {
            destination = ride.dropoff;
        }

        // Calculate ETA if we have a destination
        let eta = null;
        if (destination) {
            eta = rideManager.calculateETA({ lat, lon }, destination);
        }

        // Update location
        rideManager.updateDriverLocation(rideId, { lat, lon }, eta);

        // Broadcast to rider (both legacy and React frontend formats)
        broadcastToRide(rideId, {
            type: 'driver_location',
            ride_id: rideId,
            location: { lat, lon },
            eta_seconds: eta
        });
        broadcastToRide(rideId, {
            type: 'location_update',
            data: { lat, lng: lon, eta_seconds: eta }
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

// Generic state transition (for domain-specific intermediate states)
app.post('/api/rides/:rideId/transition', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { targetState, driverPubkey, metadata } = req.body;

        if (!targetState) {
            return res.status(400).json({ error: 'Missing targetState' });
        }

        const ride = rideManager.getRide(rideId);
        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }

        rideManager.transitionTo(rideId, targetState, metadata || {});

        const updatedRide = rideManager.getRide(rideId);

        broadcastToRide(rideId, {
            type: 'status_change',
            ride_id: rideId,
            status: updatedRide.status,
            previousStatus: ride.status,
            timestamp: Date.now()
        });

        res.json({
            success: true,
            ride: updatedRide
        });

    } catch (error) {
        console.error('Error transitioning ride:', error);
        res.status(400).json({
            error: 'Failed to transition state',
            details: error.message
        });
    }
});

// Panic / emergency alert
app.post('/api/rides/:rideId/panic', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { event } = req.body || {};

        if (!event) {
            return res.status(400).json({ error: 'Missing panic event payload' });
        }

        const ride = rideManager.getRide(rideId);
        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }

        const publishResult = await reputation.publishPanic(event, ride);

        updateRideStreamingState(rideId, { panicTriggeredAt: Date.now() });
        stopStreamingForRide(rideId);

        try {
            ride.safety = ride.safety || { panicEvents: [], checkIns: [] };
            ride.safety.panicEvents = ride.safety.panicEvents || [];
            ride.safety.panicEvents.push({
                eventId: event.id,
                role: publishResult.role,
                pubkey: event.pubkey,
                note: event.content || '',
                tags: event.tags || [],
                createdAt: (event.created_at || Math.floor(Date.now() / 1000)) * 1000,
                cachedLocally: !!publishResult.cachedLocally,
                relayStatuses: publishResult.relayStatuses || []
            });
        } catch (recordError) {
            console.warn(`Failed to append panic event for ride ${rideId}:`, recordError.message);
        }

        broadcastToRide(rideId, {
            type: 'panic_alert',
            ride_id: rideId,
            initiated_by: event.pubkey,
            role: publishResult.role,
            content: event.content,
            tags: event.tags,
            timestamp: event.created_at * 1000,
            relay_statuses: publishResult.relayStatuses || [],
            cached_locally: !!publishResult.cachedLocally
        });

        res.json({
            success: true,
            relay_statuses: publishResult.relayStatuses || [],
            cached_locally: !!publishResult.cachedLocally
        });
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

app.post('/api/rides/:rideId/rate', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { event, rating, comment, raterPubkey, raterRole } = req.body || {};

        const ride = rideManager.getRide(rideId);
        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }

        const rideProfile = rideManager.getProfileForRide(rideId);
        if (!rideManager.isTerminal(ride.status) || ride.status === rideProfile.states.values.CANCELLED) {
            return res.status(400).json({ error: 'Task not completed yet' });
        }

        // Path A: Full Nostr event (legacy / advanced clients)
        if (event) {
            const result = await reputation.publishRating(event, ride);

            try {
                rideManager.recordRating(rideId, result.role, {
                    rating: result.rating,
                    target: result.targetHex,
                    eventId: event.id,
                    pubkey: event.pubkey,
                    notes: event.content || '',
                    relayStatuses: result.relayStatuses || [],
                    cachedLocally: !!result.cachedLocally
                });
            } catch (recordError) {
                console.warn(`Failed to record rating in ride manager for ${rideId}:`, recordError.message);
            }

            broadcastToRide(rideId, {
                type: 'rating_submitted',
                ride_id: rideId,
                role: result.role,
                rating: result.rating,
                target_hex: result.targetHex,
                target_npub: result.targetNpub || null,
                relay_statuses: result.relayStatuses || [],
                cached_locally: !!result.cachedLocally
            });

            return res.json({
                success: true,
                rating: result.rating,
                target_hex: result.targetHex,
                target_npub: result.targetNpub || null,
                relay_statuses: result.relayStatuses || [],
                cached_locally: !!result.cachedLocally
            });
        }

        // Path B: Simple rating (React frontend)
        if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'Missing or invalid rating (1-5)' });
        }

        const role = raterRole === 'driver' ? 'driver'
            : raterRole === 'rider' ? 'rider'
            : raterRole === 'provider' ? 'driver'
            : raterRole === 'requester' ? 'rider'
            : 'rider';

        // Determine the rating target
        const targetPubkey = role === 'rider'
            ? (ride.driver?.pubkey || ride.provider?.pubkey || '')
            : (ride.rider?.pubkey || ride.requester?.pubkey || '');

        try {
            rideManager.recordRating(rideId, role, {
                rating,
                target: targetPubkey,
                pubkey: raterPubkey || '',
                notes: comment || '',
                cachedLocally: true
            });
        } catch (recordError) {
            console.warn(`Failed to record rating for ${rideId}:`, recordError.message);
        }

        broadcastToRide(rideId, {
            type: 'rating_submitted',
            ride_id: rideId,
            role,
            rating,
            target_hex: targetPubkey,
            timestamp: Date.now()
        });

        console.log(`⭐ Rating recorded for ${rideId}: ${rating}/5 by ${role}`);

        res.json({
            success: true,
            rating,
            role,
            target_hex: targetPubkey
        });
    } catch (error) {
        console.error('Error submitting rating:', error);
        res.status(500).json({
            error: 'Failed to submit rating',
            details: error.message
        });
    }
});

// Rider tips driver
app.post('/api/rides/:rideId/tip', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { amount_sats } = req.body || {};
        const amount = parseInt(amount_sats, 10);

        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ error: 'Invalid tip amount' });
        }

        const ride = rideManager.getRide(rideId);
        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }

        ride.tips = ride.tips || [];
        ride.tips.push({ amount_sats: amount, timestamp: Date.now() });

        broadcastToRide(rideId, {
            type: 'tip_sent',
            ride_id: rideId,
            amount_sats: amount
        });

        res.json({ success: true, amount_sats: amount });
    } catch (error) {
        console.error('Error submitting tip:', error);
        res.status(500).json({ error: 'Failed to submit tip' });
    }
});

// ==========================================
// PROOF & QUOTE ENDPOINTS
// ==========================================

// Submit completion proof (photo or signature)
app.post('/api/rides/:rideId/proof', async (req, res) => {
    try {
        const { rideId } = req.params;
        const ride = rideManager.getRide(rideId);

        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }

        ride.proofs = ride.proofs || [];

        // Handle JSON-based signature proofs
        if (req.body && req.body.type === 'signature') {
            ride.proofs.push({
                type: 'signature',
                data: req.body.signature,
                timestamp: Date.now(),
                providerPubkey: req.body.providerPubkey,
            });
            return res.json({ success: true, proofCount: ride.proofs.length });
        }

        // Handle photo proofs (JSON with base64 data URL)
        // Store metadata only — file storage is an operator concern
        ride.proofs.push({
            type: req.body?.type || 'photo',
            fileName: req.body?.fileName,
            mimeType: req.body?.mimeType,
            sizeBytes: req.body?.sizeBytes,
            timestamp: Date.now(),
            providerPubkey: req.body?.providerPubkey,
        });

        res.json({ success: true, proofCount: ride.proofs.length });
    } catch (error) {
        console.error('Error submitting proof:', error);
        res.status(500).json({ error: 'Failed to submit proof' });
    }
});

// Provider submits a quote
app.post('/api/rides/:rideId/quote', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { amount_sats, description, providerPubkey } = req.body || {};

        if (!Number.isFinite(amount_sats) || amount_sats <= 0) {
            return res.status(400).json({ error: 'Invalid quote amount' });
        }
        if (!description || typeof description !== 'string') {
            return res.status(400).json({ error: 'Description is required' });
        }

        const ride = rideManager.getRide(rideId);
        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }

        ride.quote = {
            amount_sats,
            description,
            status: 'pending',
            submitted_at: new Date().toISOString(),
            provider_pubkey: providerPubkey,
        };

        broadcastToRide(rideId, {
            type: 'quote_submitted',
            ride_id: rideId,
            quote: ride.quote,
        });

        res.json({ success: true, quote: ride.quote });
    } catch (error) {
        console.error('Error submitting quote:', error);
        res.status(500).json({ error: 'Failed to submit quote' });
    }
});

// Requester accepts a quote
app.post('/api/rides/:rideId/quote/accept', async (req, res) => {
    try {
        const { rideId } = req.params;
        const ride = rideManager.getRide(rideId);

        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }
        if (!ride.quote || ride.quote.status !== 'pending') {
            return res.status(400).json({ error: 'No pending quote to accept' });
        }

        ride.quote.status = 'accepted';
        ride.quote.responded_at = new Date().toISOString();
        ride.fare = ride.quote.amount_sats;

        broadcastToRide(rideId, {
            type: 'quote_accepted',
            ride_id: rideId,
            quote: ride.quote,
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error accepting quote:', error);
        res.status(500).json({ error: 'Failed to accept quote' });
    }
});

// Requester declines a quote
app.post('/api/rides/:rideId/quote/decline', async (req, res) => {
    try {
        const { rideId } = req.params;
        const ride = rideManager.getRide(rideId);

        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }
        if (!ride.quote || ride.quote.status !== 'pending') {
            return res.status(400).json({ error: 'No pending quote to decline' });
        }

        ride.quote.status = 'declined';
        ride.quote.responded_at = new Date().toISOString();
        if (req.body?.reason) ride.quote.decline_reason = req.body.reason;

        broadcastToRide(rideId, {
            type: 'quote_declined',
            ride_id: rideId,
            quote: ride.quote,
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error declining quote:', error);
        res.status(500).json({ error: 'Failed to decline quote' });
    }
});

app.get('/api/reputation/:npub', async (req, res) => {
    try {
        const profile = await reputation.getProfile(req.params.npub);
        res.json({ success: true, profile });
    } catch (error) {
        if (error.message === 'Reputation not found') {
            return res.status(404).json({ error: 'Reputation not found' });
        }
        console.error('Error fetching reputation:', error);
        res.status(500).json({
            error: 'Failed to fetch reputation',
            details: error.message
        });
    }
});

app.post('/api/reputation/export', async (req, res) => {
    try {
        const { npub, since } = req.body || {};
        const exportBundle = await reputation.exportEvents(npub, since);
        res.json({ success: true, export: exportBundle });
    } catch (error) {
        console.error('Error exporting reputation:', error);
        res.status(500).json({
            error: 'Failed to export reputation',
            details: error.message
        });
    }
});

app.delete('/api/reputation/:npub', async (req, res) => {
    try {
        const npub = req.params.npub;
        const { event } = req.body || {};
        if (!event) {
            return res.status(400).json({ error: 'Provide a signed Nostr delete event' });
        }
        const outcome = await reputation.publishGeneric(event, npub);
        reputation.clearCacheFor(npub);
        res.json({
            success: true,
            relay_statuses: outcome.relayStatuses || [],
            cached_locally: !!outcome.cachedLocally
        });
    } catch (error) {
        console.error('Error deleting reputation data:', error);
        res.status(500).json({
            error: 'Failed to request reputation deletion',
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

        finalizeRideSession(rideId, 'completed');

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
// DOMAIN PROFILE API
// ==========================================

// List available domain profiles
app.get('/api/domains', publicRateLimiter, (req, res) => {
    const profiles = listProfiles();
    const details = profiles.map(id => {
        try {
            const profile = loadProfile(id);
            return {
                id: profile.id,
                name: profile.name,
                description: profile.description,
                emoji: profile.theme?.emoji || '',
                roles: profile.roles,
                discoveryMethod: profile.discoveryMethod,
                pricingModel: profile.pricingModel,
                features: profile.features,
                states: Object.values(profile.states.values)
            };
        } catch (_err) {
            return { id, error: 'Failed to load profile' };
        }
    });

    res.json({
        current: domainProfile.id,
        available: details,
        count: details.length
    });
});

// Get current domain profile details
app.get('/api/domains/current', publicRateLimiter, (req, res) => {
    res.json({
        id: domainProfile.id,
        name: domainProfile.name,
        description: domainProfile.description,
        roles: domainProfile.roles,
        labels: domainProfile.labels,
        discoveryMethod: domainProfile.discoveryMethod,
        pricingModel: domainProfile.pricingModel,
        stakingModel: domainProfile.stakingModel,
        completionProofTypes: domainProfile.completionProofTypes,
        ratingCriteria: domainProfile.ratingCriteria,
        features: domainProfile.features,
        regulatoryBodies: domainProfile.regulatoryBodies,
        states: domainProfile.states,
        eventKinds: domainProfile.eventKinds,
        theme: domainProfile.theme
    });
});

// Get a specific domain profile by ID
app.get('/api/domains/:id', publicRateLimiter, (req, res) => {
    try {
        const profile = loadProfile(req.params.id);
        res.json({
            id: profile.id,
            name: profile.name,
            description: profile.description,
            roles: profile.roles,
            labels: profile.labels,
            discoveryMethod: profile.discoveryMethod,
            pricingModel: profile.pricingModel,
            stakingModel: profile.stakingModel,
            completionProofTypes: profile.completionProofTypes,
            ratingCriteria: profile.ratingCriteria,
            features: profile.features,
            regulatoryBodies: profile.regulatoryBodies,
            states: profile.states,
            eventKinds: profile.eventKinds,
            theme: profile.theme
        });
    } catch (error) {
        res.status(404).json({ error: `Domain profile '${req.params.id}' not found` });
    }
});

// ==========================================
// SPA CATCH-ALL (React frontend)
// ==========================================

// For any non-API, non-static route, serve the React index.html
// This enables client-side routing (react-router)
const fs = require('fs');
const reactIndexPath = path.join(__dirname, 'web', 'dist', 'index.html');
app.get('*', (req, res, next) => {
    // Skip API routes, health checks, and legacy HTML files
    if (req.path.startsWith('/api/') || req.path.startsWith('/rides/') || req.path.startsWith('/tasks/') ||
        req.path === '/info' || req.path === '/health' ||
        req.path.endsWith('.html') || req.path.endsWith('.js') ||
        req.path.endsWith('.css') || req.path.endsWith('.map')) {
        return next();
    }
    // Serve React app if the build exists
    if (fs.existsSync(reactIndexPath)) {
        return res.sendFile(reactIndexPath);
    }
    next();
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

async function startServer(options = {}) {
    const listen = options.listen !== false;
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
    if (listen) {
        httpServer = app.listen(config.port, () => {
            console.log(`
    ========================================
    DonkeyRide Operator Server
    ========================================
    Name: ${config.operatorName}
    Domain: ${domainProfile.name} (${domainProfile.id})
    Roles: ${domainProfile.roles.requester} / ${domainProfile.roles.provider}
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

    \uD83C\uDF10 Domain: ${domainProfile.name}
    \uD83D\uDD10 NIP-98 authentication enabled
    \uD83D\uDEE1\uFE0F  Rate limiting active
    \u26A1 Multiple payment providers supported
    \uD83D\uDCB0 Dual pricing (sats + fiat) enabled
    \uD83D\uDDFA\uFE0F  ${domainProfile.features.liveTracking ? 'Live tracking enabled' : 'Live tracking disabled'}
    ========================================

    API Endpoints:
    GET  /api/domains              - List available domain profiles
    GET  /api/domains/current      - Current domain profile details
    GET  /api/domains/:id          - Get a specific domain profile by ID
    GET  /api/drivers/available    - List online ${domainProfile.roles.provider}s
    POST /api/trips/estimate       - Estimate cost
    GET  /api/prices/btc           - Get BTC prices
    GET  /info                     - Operator information
    ========================================
        `);
        });
    } else {
        console.log('🧪 Server initialized without HTTP listener (listen=false)');
    }

    return { app, httpServer, wss };
}

if (require.main === module) {
    startServer().catch(error => {
        console.error('Failed to start server:', error);
        process.exit(1);
    });
}

module.exports = {
    app,
    startServer,
    rideManager,
    taskManager: rideManager,
    domainProfile,
    reputation,
    getHttpServer: () => httpServer
};

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
    if (wss && typeof wss.close === 'function') {
        wss.close();
    }
    if (redis) {
        await redis.disconnect();
    }

    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('Received SIGINT');
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.emit('SIGTERM');
});
