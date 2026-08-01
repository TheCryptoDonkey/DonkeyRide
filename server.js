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
const disputeEvents = require('./src/nostr/dispute-events');
const { validateNIP98Auth } = require('./middleware/nip98-auth');
const { getPublicKey: nostrGetPublicKey, nip19 } = require('nostr-tools');
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
const { createTaskStore } = require('./src/storage/task-store');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // photo/signature proofs arrive as base64 data URLs
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

// ==========================================
// NIP-98 AUTHENTICATION GATE
// When ENABLE_NIP98_AUTH=true, every mutating API route requires a valid
// NIP-98 signature. Stateless compute endpoints stay public.
// ==========================================

const nip98Enabled = (process.env.ENABLE_NIP98_AUTH || '').toLowerCase() === 'true';
const NIP98_PUBLIC_PATHS = new Set([
    '/api/trips/estimate',
    '/api/routes/preview'
]);

if (nip98Enabled) {
    app.use((req, res, next) => {
        const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
        const guarded = req.path.startsWith('/api/') || req.path.startsWith('/rides');
        if (!mutating || !guarded || NIP98_PUBLIC_PATHS.has(req.path)) {
            return next();
        }
        if (req.user) {
            return next();
        }
        return validateNIP98Auth(req, res, next);
    });
    console.log('🔐 NIP-98 authentication enforced on mutating API routes');
} else {
    console.log('⚠️  NIP-98 authentication DISABLED (set ENABLE_NIP98_AUTH=true for production)');
}

// For sensitive GET endpoints: require NIP-98 only when auth is enabled
const optionalNip98 = nip98Enabled ? validateNIP98Auth : (req, res, next) => next();

/**
 * Does the authenticated signer match a stored party identity?
 * Identities may carry a hex pubkey, an npub, or both.
 */
function actorMatchesIdentity(reqUser, identity) {
    if (!reqUser || !identity) {
        return false;
    }
    const signerPubkey = (reqUser.pubkey || '').toLowerCase();
    if (identity.pubkey && identity.pubkey.toLowerCase() === signerPubkey) {
        return true;
    }
    if (identity.npub) {
        try {
            return identity.npub.toLowerCase() === nip19.npubEncode(signerPubkey).toLowerCase();
        } catch (error) {
            return false;
        }
    }
    return false;
}

/**
 * Role authorisation for ride actions. Returns null when the signer is
 * permitted (or auth is disabled), otherwise a { status, error, details }
 * object the route should return.
 *
 * @param {Object} req - Express request (req.user set by NIP-98 middleware)
 * @param {Object} ride - The ride/task record
 * @param {string[]} allowed - Roles permitted: 'requester' and/or 'provider'
 */
function authoriseRideActor(req, ride, allowed = ['requester', 'provider']) {
    if (!nip98Enabled || !req.user) {
        return null;
    }
    const identities = [];
    if (allowed.includes('requester')) {
        identities.push(ride.requester || ride.rider);
    }
    if (allowed.includes('provider')) {
        identities.push(ride.provider || ride.driver);
    }
    if (identities.some((identity) => actorMatchesIdentity(req.user, identity))) {
        return null;
    }
    return {
        status: 403,
        error: 'Forbidden',
        details: `Signer is not the ${allowed.join(' or ')} on this ride`
    };
}

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
        cash: {},
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
const disputes = new Map();
const suspensions = new Map();
const theftReports = new Map();
const guardianState = {
    bond: null,
    guardians: new Set(
        (process.env.GUARDIAN_PUBKEYS || '').split(',').map(s => s.trim()).filter(Boolean)
    ),
    proposals: new Map(),
    watchdogClaims: new Map()
};

const STREAM_INTERVAL_MS = 1000;
const STREAM_STEPS = 15;

// Multi-domain task manager — routes operations to the correct domain's TaskManager.
// Supports frontend domain switching: tasks created under locksmith use locksmith states, etc.
const _domainManagers = new Map();
_domainManagers.set(domainProfile.id, new TaskManager(domainProfile));

// Task persistence — attached to every domain manager once initialised in startServer()
let taskStore = null;

function _getManagerForDomain(domainId) {
    if (!_domainManagers.has(domainId)) {
        const profile = loadProfile(domainId);
        const manager = new TaskManager(profile);
        if (taskStore) {
            manager.setStore(taskStore);
        }
        _domainManagers.set(domainId, manager);
    }
    return _domainManagers.get(domainId);
}

async function initializeTaskStore() {
    try {
        const store = createTaskStore(process.env.DATABASE_URL);
        await store.init();
        taskStore = store;
        for (const manager of _domainManagers.values()) {
            manager.setStore(taskStore);
        }

        const persisted = await taskStore.loadActiveTasks();
        for (const task of persisted) {
            try {
                const manager = _getManagerForDomain(task.domain || domainProfile.id);
                manager.hydrateTask(task);
                _rideIndex.set(task.id, task.domain || domainProfile.id);
            } catch (error) {
                console.warn(`⚠️  Could not rehydrate task ${task.id}:`, error.message);
            }
        }
        console.log(`💾 Task store ready (${store.backend}) — rehydrated ${persisted.length} active task(s)`);
    } catch (error) {
        console.warn('⚠️  Task store unavailable — running in-memory only:', error.message);
        taskStore = null;
    }
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

    // Persist mutations made directly on the ride object (proofs, tips, safety, quotes)
    persistRide(rideId) {
        const mgr = _getManagerForRide(rideId);
        const ride = mgr.getRide(rideId);
        if (ride) {
            mgr._persist(ride);
        }
    },

    // All in-memory tasks where the pubkey is a party (either role)
    getTasksByParticipant(pubkey) {
        const key = (pubkey || '').toLowerCase();
        const matches = [];
        for (const mgr of _domainManagers.values()) {
            for (const task of mgr.tasks.values()) {
                const provider = task.provider || task.driver;
                const requester = task.requester || task.rider;
                if (provider?.pubkey?.toLowerCase() === key
                    || requester?.pubkey?.toLowerCase() === key) {
                    matches.push(task);
                }
            }
        }
        return matches;
    },

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
disputeEvents.configure({
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
                    ws.driverPubkey = (data.pubkey || '').toLowerCase() || null;
                    ws.clientType = 'driver';
                    updateDriverPresence({
                        npub: data.npub,
                        pubkey: data.pubkey,
                        location: data.location
                    });
                    console.log(`Driver ${data.npub} registered for ride requests${data.location ? ` at ${data.location.lat},${data.location.lon}` : ''}`);
                    sendPendingRideRequests(ws);
                    break;

                case 'driver_location':
                    // Presence heartbeat while online (not tied to an active ride)
                    updateDriverPresence({
                        npub: data.npub || ws.driverNpub,
                        pubkey: data.pubkey || ws.driverPubkey,
                        location: data.location || (Number.isFinite(data.lat) ? { lat: data.lat, lon: data.lon } : null)
                    });
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

// ==========================================
// DRIVER PRESENCE & GEO-DISPATCH
// Drivers report their location (WS register/location messages or
// POST /api/drivers/location). Ride requests are only dispatched to
// drivers within DISPATCH_RADIUS_KM of the pickup.
// ==========================================

const DISPATCH_RADIUS_KM = parseFloat(process.env.DISPATCH_RADIUS_KM) || 15;
const DRIVER_PRESENCE_TTL_MS = 2 * 60 * 1000; // location older than this is stale
// STRICT_DISPATCH=true excludes drivers with no known location from dispatch
const strictDispatch = (process.env.STRICT_DISPATCH || '').toLowerCase() === 'true';

// key: npub or pubkey (lowercase) → { npub, pubkey, location: {lat, lon}, lastSeen }
const driverPresence = new Map();

function updateDriverPresence({ npub, pubkey, location }) {
    const key = (npub || pubkey || '').toLowerCase();
    if (!key) {
        return null;
    }
    const existing = driverPresence.get(key) || {};
    const entry = {
        npub: npub || existing.npub || null,
        pubkey: (pubkey || existing.pubkey || null),
        location: location && Number.isFinite(location.lat) && Number.isFinite(location.lon)
            ? { lat: location.lat, lon: location.lon }
            : existing.location || null,
        lastSeen: Date.now()
    };
    driverPresence.set(key, entry);
    return entry;
}

function getDriverPresence(identifier) {
    if (!identifier) {
        return null;
    }
    const entry = driverPresence.get(identifier.toLowerCase());
    if (!entry || (Date.now() - entry.lastSeen) > DRIVER_PRESENCE_TTL_MS) {
        return null;
    }
    return entry;
}

/**
 * Should this driver receive a request with the given origin?
 * Drivers with a fresh location get a haversine radius check; drivers
 * without one are included unless STRICT_DISPATCH=true.
 */
function driverInRange(driverIdentifier, origin) {
    if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lon)) {
        return true;
    }
    const presence = getDriverPresence(driverIdentifier);
    if (!presence || !presence.location) {
        return !strictDispatch;
    }
    const distanceKm = calculateDistance(
        presence.location.lat, presence.location.lon,
        origin.lat, origin.lon
    );
    return distanceKm <= DISPATCH_RADIUS_KM;
}

// Broadcast to drivers, geo-filtered by origin when provided
function broadcastToDrivers(message, origin = null) {
    if (!wss) {
        return 0;
    }
    let count = 0;
    wss.clients.forEach(client => {
        if (client.clientType === 'driver' && client.readyState === WebSocket.OPEN) {
            if (!driverInRange(client.driverNpub || client.driverPubkey, origin)) {
                return;
            }
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
        if (!driverInRange(ws.driverNpub || ws.driverPubkey, ride.pickup)) {
            return;
        }
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
            fare: state.fareSats,
            currency: ride.currency || 'SAT',
            trustModel: stakeManager.currentProvider?.getTrustModel() || 'unknown'
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

        // Create the stake lock with the payment provider
        const stakeLock = await stakeManager.lockStake(
            rideId,
            ride.riderId,
            ride.riderStake,
            'rider'
        );

        if (!stakeLock || !stakeLock.success) {
            return res.status(502).json({
                error: 'Stake lock failed',
                details: stakeLock?.error || 'Payment provider rejected the stake lock'
            });
        }

        // Non-instant rails (hodl invoices): the stake is only enforceable
        // once the payer's payment is actually held. Hand back the invoice
        // and require confirmation via /rider-stake/confirm.
        const instantLock = stakeManager.currentProvider?.getCapabilities?.().features?.instantLock !== false;
        if (!instantLock) {
            ride.status = 'waiting_rider_stake_payment';
            ride.riderStakeProof = stakeLock.holdId || stakeLock.lockId;
            ride.riderStakeInvoice = stakeLock.invoice;
            return res.json({
                success: true,
                status: 'awaiting_payment',
                invoice: stakeLock.invoice,
                stakeAmount: ride.riderStake,
                confirm: `/rides/${rideId}/rider-stake/confirm`
            });
        }

        ride.status = 'waiting_driver';
        ride.riderStakeLocked = true;
        ride.riderStakeProof = stakeLock.holdId || stakeLock.lockId;

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
            escrowId: stakeLock.holdId,
            currency: ride.currency || 'SAT',
            trustModel: stakeManager.currentProvider?.getTrustModel() || 'unknown'
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

        if (!stakeLock || !stakeLock.success) {
            return res.status(502).json({
                error: 'Stake lock failed',
                details: stakeLock?.error || 'Payment provider rejected the stake lock'
            });
        }

        const instantLock = stakeManager.currentProvider?.getCapabilities?.().features?.instantLock !== false;
        if (!instantLock) {
            ride.status = 'waiting_driver_stake_payment';
            ride.driverStakeProof = stakeLock.holdId || stakeLock.lockId;
            ride.driverStakeInvoice = stakeLock.invoice;
            return res.json({
                success: true,
                status: 'awaiting_payment',
                invoice: stakeLock.invoice,
                stakeAmount: ride.driverStake,
                confirm: `/rides/${rideId}/driver-stake/confirm`
            });
        }

        ride.status = 'active';
        ride.driverStakeLocked = true;
        ride.driverStakeProof = stakeLock.holdId || stakeLock.lockId;
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
            escrowId: stakeLock.holdId,
            currency: ride.currency || 'SAT',
            trustModel: stakeManager.currentProvider?.getTrustModel() || 'unknown'
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

// Confirm a non-instant stake payment landed (hodl invoice held).
// Kept separate per role so each party confirms their own payment.
async function confirmStakePayment(req, res, role) {
    try {
        const { rideId } = req.params;
        const ride = activeRides.get(rideId);
        if (!ride) throw new Error('Ride not found');

        const provider = stakeManager.currentProvider;
        if (typeof provider?.confirmStakePaid !== 'function') {
            return res.status(400).json({
                error: `Provider ${provider?.providerName || 'unknown'} does not require payment confirmation`
            });
        }

        const result = await provider.confirmStakePaid(`${rideId}_${role}`);
        if (!result.paid) {
            return res.status(402).json({
                success: false,
                paid: false,
                status: result.status,
                details: 'Stake invoice not yet paid/held'
            });
        }

        if (role === 'rider') {
            ride.status = 'waiting_driver';
            ride.riderStakeLocked = true;
            broadcastToRide(rideId, { type: 'rider_stake_locked', amount: ride.riderStake });
            stakeEvents.publishStakeLock({
                rideId,
                role: 'rider',
                amount: ride.riderStake,
                participant: ride.riderId,
                escrowId: ride.riderStakeProof,
                currency: ride.currency || 'SAT',
                trustModel: provider.getTrustModel()
            }).catch((err) => console.warn(`Failed to publish rider stake lock for ${rideId}:`, err.message));
        } else {
            ride.status = 'active';
            ride.driverStakeLocked = true;
            ride.startedAt = Date.now();
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
                escrowId: ride.driverStakeProof,
                currency: ride.currency || 'SAT',
                trustModel: provider.getTrustModel()
            }).catch((err) => console.warn(`Failed to publish driver stake lock for ${rideId}:`, err.message));
        }

        res.json({ success: true, paid: true, status: ride.status });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

app.post('/rides/:rideId/rider-stake/confirm', (req, res) => confirmStakePayment(req, res, 'rider'));
app.post('/rides/:rideId/driver-stake/confirm', (req, res) => confirmStakePayment(req, res, 'driver'));

// Complete ride and release stakes
app.post('/rides/:rideId/complete', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { completionProof } = req.body;
        
        const ride = activeRides.get(rideId);
        if (!ride) throw new Error('Ride not found');
        if (ride.status !== 'active') throw new Error('Ride not active');
        
        // Release both stakes — a failed release is an operator incident,
        // not something to paper over with a success response
        const riderRelease = await stakeManager.releaseStake(`${rideId}_rider`);
        const driverRelease = await stakeManager.releaseStake(`${rideId}_driver`);

        if (!riderRelease?.success || !driverRelease?.success) {
            return res.status(502).json({
                error: 'Stake release failed — ride left active',
                riderStakeReleased: !!riderRelease?.success,
                driverStakeReleased: !!driverRelease?.success,
                details: [riderRelease?.error, driverRelease?.error].filter(Boolean)
            });
        }

        stakeEvents.publishStakeRelease({
            rideId,
            role: 'rider',
            amount: ride.riderStake,
            providerEvent: riderRelease?.event,
            reason: 'completed',
            currency: ride.currency || 'SAT',
            trustModel: stakeManager.currentProvider?.getTrustModel() || 'unknown'
        }).catch((err) => {
            console.warn(`Failed to publish rider stake release for ${rideId}:`, err.message);
        });
        stakeEvents.publishStakeRelease({
            rideId,
            role: 'driver',
            amount: ride.driverStake,
            providerEvent: driverRelease?.event,
            reason: 'completed',
            currency: ride.currency || 'SAT',
            trustModel: stakeManager.currentProvider?.getTrustModel() || 'unknown'
        }).catch((err) => {
            console.warn(`Failed to publish driver stake release for ${rideId}:`, err.message);
        });
        
        // Pay operator fee (from fare, not stakes)
        const operatorPayment = await payOperatorFee(ride.operatorFee);

        const completionTimestamp = Date.now();
        // Fare settlement itself is out-of-band on this flow (stakes are the
        // enforced part) — record it honestly rather than faking a hash.
        const payment = {
            success: true,
            method: stakeManager.currentProvider?.providerName || 'unknown',
            status: 'stakes_released',
            amount: ride.fareAmount,
            currency: ride.currency || 'SAT',
            trust_model: stakeManager.currentProvider?.getTrustModel() || 'unknown',
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
            releases: [riderRelease.event, driverRelease.event].filter(Boolean)
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
                riderReleaseResult = await stakeManager.releaseStake(`${rideId}_rider`);
            } else if (cancelledBy === ride.riderId) {
                // Rider cancelled - forfeit 80% of rider stake to driver  
                penaltyResult = await stakeManager.forfeitStake(
                    `${rideId}_rider`,
                    ride.riderId,
                    'rider_cancelled'
                );
                
                // Release driver stake
                driverReleaseResult = await stakeManager.releaseStake(`${rideId}_driver`);
            }
        } else if (ride.status === 'waiting_driver' || ride.status === 'waiting_rider_stake') {
            if (ride.riderStakeLocked) {
                try {
                    riderReleaseResult = await stakeManager.releaseStake(`${rideId}_rider`);
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
                reason: 'cancelled',
                currency: ride.currency || 'SAT',
                trustModel: stakeManager.currentProvider?.getTrustModel() || 'unknown'
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
                reason: 'cancelled',
                currency: ride.currency || 'SAT',
                trustModel: stakeManager.currentProvider?.getTrustModel() || 'unknown'
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
                providerEvent: penaltyResult.event,
                currency: ride.currency || 'SAT',
                trustModel: stakeManager.currentProvider?.getTrustModel() || 'unknown'
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

// Get available drivers — merges live presence (real drivers) with Redis
// entries (demo/simulator fleets). Optional ?lat/&lon/&radius filter.
app.get('/api/drivers/available', publicRateLimiter, async (req, res) => {
    try {
        const byKey = new Map();

        // Live presence from real connected drivers
        const now = Date.now();
        for (const [key, entry] of driverPresence) {
            if ((now - entry.lastSeen) > DRIVER_PRESENCE_TTL_MS) {
                continue;
            }
            byKey.set(key, {
                npub: entry.npub,
                pubkey: entry.pubkey,
                name: 'Driver',
                location: entry.location,
                available: true,
                rating: 5.0,
                totalRides: 0,
                lastUpdate: entry.lastSeen,
                source: 'live'
            });
        }

        // Redis-backed entries (demo bot fleets, external feeders)
        if (redis) {
            const keys = await redis.keys('driver:online:*');
            const driversData = await Promise.all(
                keys.map(async (key) => {
                    const data = await redis.get(key);
                    return data ? JSON.parse(data) : null;
                })
            );
            driversData.filter(Boolean).forEach((driver) => {
                const key = (driver.npub || '').toLowerCase();
                if (key && !byKey.has(key)) {
                    byKey.set(key, {
                        npub: driver.npub,
                        name: driver.name || 'Driver',
                        location: driver.location,
                        available: driver.available !== false,
                        rating: driver.rating || 5.0,
                        totalRides: driver.totalRides || 0,
                        lastUpdate: driver.lastUpdate,
                        source: 'redis'
                    });
                }
            });
        }

        let drivers = Array.from(byKey.values());

        // Optional proximity filter
        const lat = parseFloat(req.query.lat);
        const lon = parseFloat(req.query.lon ?? req.query.lng);
        const radius = parseFloat(req.query.radius) || DISPATCH_RADIUS_KM;
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
            drivers = drivers.filter((driver) => {
                if (!driver.location) {
                    return false;
                }
                const dLat = driver.location.lat;
                const dLon = driver.location.lon ?? driver.location.lng;
                if (!Number.isFinite(dLat) || !Number.isFinite(dLon)) {
                    return false;
                }
                return calculateDistance(dLat, dLon, lat, lon) <= radius;
            });
        }

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

// Driver reports presence + location (used by the driver app while online)
app.post('/api/drivers/location', async (req, res) => {
    try {
        const { npub, pubkey, lat, lon } = req.body || {};
        const signerPubkey = req.user?.pubkey || null;

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return res.status(400).json({ error: 'Missing or invalid lat/lon' });
        }

        // When auth is on, the driver may only report their own position
        if (nip98Enabled && req.user && !actorMatchesIdentity(req.user, { pubkey, npub })) {
            return res.status(403).json({
                error: 'Forbidden',
                details: 'Signer does not match the reported driver identity'
            });
        }

        const entry = updateDriverPresence({
            npub,
            pubkey: pubkey || signerPubkey,
            location: { lat, lon }
        });

        if (!entry) {
            return res.status(400).json({ error: 'Missing driver identity (npub or pubkey)' });
        }

        res.json({ success: true, lastSeen: entry.lastSeen });
    } catch (error) {
        console.error('Error updating driver presence:', error);
        res.status(500).json({ error: 'Failed to update driver presence' });
    }
});

// Driver earnings and completed-ride history (memory + task store).
// With auth enabled, a driver may only read their own earnings.
app.get('/api/drivers/:pubkey/earnings', optionalNip98, async (req, res) => {
    try {
        const pubkey = (req.params.pubkey || '').toLowerCase();
        if (nip98Enabled && req.user && req.user.pubkey.toLowerCase() !== pubkey) {
            return res.status(403).json({
                error: 'Forbidden',
                details: 'You can only view your own earnings'
            });
        }

        const byId = new Map();
        rideManager.getTasksByParticipant(pubkey).forEach((task) => byId.set(task.id, task));
        if (taskStore) {
            try {
                const persisted = await taskStore.loadTasksByParticipant(pubkey);
                persisted.forEach((task) => {
                    if (!byId.has(task.id)) {
                        byId.set(task.id, task);
                    }
                });
            } catch (error) {
                console.warn('Earnings: task store lookup failed:', error.message);
            }
        }

        const rides = [];
        for (const task of byId.values()) {
            const provider = task.provider || task.driver;
            if (provider?.pubkey?.toLowerCase() !== pubkey) continue;
            if (task.status !== 'completed') continue;
            const tips = (task.tips || []).reduce((acc, tip) => acc + (tip.amount_sats || 0), 0);
            rides.push({
                id: task.id,
                domain: task.domain,
                completedAt: task.timestamps?.completed || null,
                fare: task.fare || 0,
                tips,
                currency: task.currency || 'GBP',
                rating: task.feedback?.rider?.rating ?? null
            });
        }
        rides.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
        const sumSats = (list) => list.reduce((acc, r) => acc + r.fare + r.tips, 0);
        const todayRides = rides.filter((r) => (r.completedAt || 0) >= dayStart.getTime());
        const weekRides = rides.filter((r) => (r.completedAt || 0) >= weekAgo);

        res.json({
            success: true,
            pubkey,
            summary: {
                today: { rides: todayRides.length, sats: sumSats(todayRides) },
                week: { rides: weekRides.length, sats: sumSats(weekRides) },
                allTime: { rides: rides.length, sats: sumSats(rides) }
            },
            rides: rides.slice(0, 100)
        });
    } catch (error) {
        console.error('Error computing earnings:', error);
        res.status(500).json({ error: 'Failed to compute earnings', details: error.message });
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

            // Broadcast to drivers within DISPATCH_RADIUS_KM of the pickup
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
            }, ride.pickup);

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

        if (nip98Enabled && req.user && !actorMatchesIdentity(req.user, { pubkey: driver_pubkey, npub: driver_npub })) {
            return res.status(403).json({
                error: 'Forbidden',
                details: 'Signer does not match the accepting driver identity'
            });
        }

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

        const authErr = authoriseRideActor(req, ride, ['provider']);
        if (authErr) {
            return res.status(authErr.status).json(authErr);
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

        const existing = rideManager.getRide(rideId);
        if (!existing) {
            return res.status(404).json({ error: 'Ride not found' });
        }
        const authErr = authoriseRideActor(req, existing, ['provider']);
        if (authErr) {
            return res.status(authErr.status).json(authErr);
        }

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

        const existing = rideManager.getRide(rideId);
        if (!existing) {
            return res.status(404).json({ error: 'Ride not found' });
        }
        const authErr = authoriseRideActor(req, existing, ['provider']);
        if (authErr) {
            return res.status(authErr.status).json(authErr);
        }

        const ride = rideManager.startTrip(rideId);
        const rideProfile = rideManager.getProfileForRide(rideId);
        if (!rideProfile || rideProfile.features?.streaming !== false) {
            startStreamingForRide(rideId);
        }

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

// Cancel ride (MVP flow — reached by the React app via /api/tasks/:id/cancel)
app.post('/api/rides/:rideId/cancel', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { cancelledBy, reason } = req.body || {};

        const ride = rideManager.getRide(rideId);
        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }

        const authErr = authoriseRideActor(req, ride);
        if (authErr) {
            return res.status(authErr.status).json(authErr);
        }

        const cancelled = rideManager.cancelRide(
            rideId,
            cancelledBy || req.user?.pubkey || 'unknown',
            reason || 'No reason given'
        );
        stopStreamingForRide(rideId);
        finalizeRideSession(rideId, 'cancelled');

        const cancelPayload = {
            ride_id: rideId,
            task_id: rideId,
            reason: reason || null,
            cancelled_by: cancelledBy || null
        };
        broadcastToRide(rideId, { type: 'ride_cancelled', ...cancelPayload });
        broadcastToRide(rideId, { type: 'task_cancelled', ...cancelPayload });

        res.json({ success: true, ride: cancelled });

    } catch (error) {
        console.error('Error cancelling ride:', error);
        res.status(400).json({
            error: 'Failed to cancel ride',
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

        const authErr = authoriseRideActor(req, ride);
        if (authErr) {
            return res.status(authErr.status).json(authErr);
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

        const authErr = authoriseRideActor(req, ride);
        if (authErr) {
            return res.status(authErr.status).json(authErr);
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

        const authErr = authoriseRideActor(req, ride);
        if (authErr) {
            return res.status(authErr.status).json(authErr);
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
        rideManager.persistRide(rideId);

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

        const authErr = authoriseRideActor(req, ride);
        if (authErr) {
            return res.status(authErr.status).json(authErr);
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

        // The signer must actually hold the role they claim to rate as
        const raterIdentity = role === 'rider'
            ? (ride.requester || ride.rider)
            : (ride.provider || ride.driver);
        if (nip98Enabled && req.user && !actorMatchesIdentity(req.user, raterIdentity)) {
            return res.status(403).json({
                error: 'Forbidden',
                details: 'Signer does not match the claimed rating role on this ride'
            });
        }

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

        const authErr = authoriseRideActor(req, ride, ['requester']);
        if (authErr) {
            return res.status(authErr.status).json(authErr);
        }

        ride.tips = ride.tips || [];
        ride.tips.push({ amount_sats: amount, timestamp: Date.now() });
        rideManager.persistRide(rideId);

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

        const authErr = authoriseRideActor(req, ride, ['provider']);
        if (authErr) {
            return res.status(authErr.status).json(authErr);
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
            rideManager.persistRide(rideId);
            return res.json({ success: true, proofCount: ride.proofs.length });
        }

        // Handle photo proofs (JSON with base64 data URL).
        // The data URL is stored with the task — proofs are dispute evidence.
        ride.proofs.push({
            type: req.body?.type || 'photo',
            fileName: req.body?.fileName,
            mimeType: req.body?.mimeType,
            sizeBytes: req.body?.sizeBytes,
            data: req.body?.dataUrl || null,
            timestamp: Date.now(),
            providerPubkey: req.body?.providerPubkey,
        });
        rideManager.persistRide(rideId);

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

        const authErr = authoriseRideActor(req, ride, ['provider']);
        if (authErr) {
            return res.status(authErr.status).json(authErr);
        }

        ride.quote = {
            amount_sats,
            description,
            status: 'pending',
            submitted_at: new Date().toISOString(),
            provider_pubkey: providerPubkey,
        };
        rideManager.persistRide(rideId);

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

        const authErr = authoriseRideActor(req, ride, ['requester']);
        if (authErr) {
            return res.status(authErr.status).json(authErr);
        }

        ride.quote.status = 'accepted';
        ride.quote.responded_at = new Date().toISOString();
        ride.fare = ride.quote.amount_sats;
        rideManager.persistRide(rideId);

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

        const authErr = authoriseRideActor(req, ride, ['requester']);
        if (authErr) {
            return res.status(authErr.status).json(authErr);
        }

        ride.quote.status = 'declined';
        ride.quote.responded_at = new Date().toISOString();
        if (req.body?.reason) ride.quote.decline_reason = req.body.reason;
        rideManager.persistRide(rideId);

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

// ==========================================
// DISPUTE RESOLUTION ENDPOINTS
// ==========================================

// A1. File a dispute
app.post('/api/rides/:rideId/dispute', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { event } = req.body || {};

        if (!event) {
            return res.status(400).json({ error: 'Missing dispute event payload' });
        }

        const ride = rideManager.getRide(rideId);
        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }

        // Validate event integrity
        reputation.setRelays(reputation.getRelays()); // ensure relays initialised
        reputation.ensureEventIntegrity(event);

        if (event.kind !== 30522) {
            return res.status(400).json({ error: 'Event kind must be 30522' });
        }

        // Validate complainant is a participant
        const eventPubkey = event.pubkey.toLowerCase();
        const rideProfile = rideManager.getProfileForRide(rideId);
        const requesterPub = (ride.rider?.pubkey || ride.requester?.pubkey || '').toLowerCase();
        const providerPub = (ride.driver?.pubkey || ride.provider?.pubkey || '').toLowerCase();

        if (eventPubkey !== requesterPub && eventPubkey !== providerPub) {
            return res.status(403).json({ error: 'Complainant must be a task participant' });
        }

        // Validate ride is post-requested state
        if (ride.status === rideProfile.states.initial) {
            return res.status(400).json({ error: 'Cannot dispute a task that has only just been requested' });
        }

        // Validate dispute_type tag
        const disputeTypeTag = event.tags.find(t => t[0] === 'dispute_type');
        const disputeType = disputeTypeTag?.[1];
        if (!disputeType || !disputeEvents.VALID_DISPUTE_TYPES.includes(disputeType)) {
            return res.status(400).json({ error: `Invalid dispute_type. Must be one of: ${disputeEvents.VALID_DISPUTE_TYPES.join(', ')}` });
        }

        // Check for existing unresolved dispute from same complainant
        const existingDisputes = Array.from(disputes.values()).filter(
            d => d.taskId === rideId && d.complainantPubkey === eventPubkey && d.status !== 'resolved'
        );
        if (existingDisputes.length > 0) {
            return res.status(409).json({ error: 'An unresolved dispute from this complainant already exists for this task' });
        }

        // Determine accused pubkey
        const accusedPubkey = eventPubkey === requesterPub ? providerPub : requesterPub;

        // Publish client-signed event
        const publishResult = await reputation.publishGeneric(event, event.pubkey);

        // Create dispute object
        const disputeId = `dispute_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const amountTag = event.tags.find(t => t[0] === 'amount');
        const currencyTag = event.tags.find(t => t[0] === 'currency');
        const evidenceTags = event.tags.filter(t => t[0] === 'evidence');

        const dispute = {
            id: disputeId,
            taskId: rideId,
            status: 'filed',
            filingEventId: event.id,
            complainantPubkey: eventPubkey,
            accusedPubkey,
            disputeType,
            amount: amountTag ? Number(amountTag[1]) : null,
            currency: currencyTag?.[1] || null,
            evidence: evidenceTags.map(t => t[1]),
            content: event.content || '',
            domain: rideProfile.id,
            filedAt: Date.now(),
            arbiter: null,
            resolution: null,
            counterEvidence: [],
            appeal: null,
            stakeEffects: null
        };
        disputes.set(disputeId, dispute);

        // Link to ride
        ride.disputes = ride.disputes || [];
        ride.disputes.push(disputeId);

        // Auto-assign operator as arbiter
        let arbiterEvent = null;
        if (config.operatorPubkey) {
            arbiterEvent = await disputeEvents.publishArbiterAssignment({
                disputeId,
                arbiterPubkey: config.operatorPubkey,
                arbiterType: 'operator',
                deadline: Math.floor(Date.now() / 1000) + 86400 // 24h deadline
            });
            if (arbiterEvent) {
                dispute.arbiter = {
                    pubkey: config.operatorPubkey,
                    type: 'operator',
                    assignedAt: Date.now(),
                    deadline: Math.floor(Date.now() / 1000) + 86400,
                    eventId: arbiterEvent.id
                };
                dispute.status = 'assigned';
            }
        }

        broadcastToRide(rideId, {
            type: 'dispute_filed',
            ride_id: rideId,
            dispute_id: disputeId,
            dispute_type: disputeType,
            complainant_pubkey: eventPubkey
        });

        res.json({
            success: true,
            dispute_id: disputeId,
            relay_statuses: publishResult.relayStatuses || [],
            cached_locally: !!publishResult.cachedLocally
        });
    } catch (error) {
        console.error('Error filing dispute:', error);
        res.status(500).json({ error: 'Failed to file dispute', details: error.message });
    }
});

// A2. Counter-evidence
app.post('/api/rides/:rideId/dispute/:disputeId/evidence', async (req, res) => {
    try {
        const { rideId, disputeId } = req.params;
        const { event } = req.body || {};

        if (!event) {
            return res.status(400).json({ error: 'Missing evidence event payload' });
        }

        const dispute = disputes.get(disputeId);
        if (!dispute) {
            return res.status(404).json({ error: 'Dispute not found' });
        }

        if (dispute.taskId !== rideId) {
            return res.status(400).json({ error: 'Dispute does not belong to this ride' });
        }

        if (!['filed', 'assigned'].includes(dispute.status)) {
            return res.status(400).json({ error: 'Dispute is not in a state that accepts evidence' });
        }

        reputation.ensureEventIntegrity(event);

        // Validate e tag references original filing
        const eTag = event.tags.find(t => t[0] === 'e');
        if (!eTag || eTag[1] !== dispute.filingEventId) {
            return res.status(400).json({ error: 'Evidence event must reference the original filing event via e tag' });
        }

        const publishResult = await reputation.publishGeneric(event, event.pubkey);

        dispute.counterEvidence.push({
            eventId: event.id,
            pubkey: event.pubkey,
            evidence: event.tags.filter(t => t[0] === 'evidence').map(t => t[1]),
            content: event.content || '',
            filedAt: Date.now()
        });

        broadcastToRide(rideId, {
            type: 'dispute_evidence',
            ride_id: rideId,
            dispute_id: disputeId,
            from_pubkey: event.pubkey
        });

        res.json({
            success: true,
            relay_statuses: publishResult.relayStatuses || [],
            cached_locally: !!publishResult.cachedLocally
        });
    } catch (error) {
        console.error('Error submitting counter-evidence:', error);
        res.status(500).json({ error: 'Failed to submit evidence', details: error.message });
    }
});

// A3. Assign arbiter
app.post('/api/disputes/:disputeId/assign', async (req, res) => {
    try {
        const { disputeId } = req.params;
        const { arbiterPubkey, arbiterType, deadline } = req.body || {};

        const dispute = disputes.get(disputeId);
        if (!dispute) {
            return res.status(404).json({ error: 'Dispute not found' });
        }

        if (dispute.status !== 'filed') {
            return res.status(400).json({ error: 'Dispute already has an arbiter assigned' });
        }

        if (!arbiterPubkey || !arbiterType) {
            return res.status(400).json({ error: 'arbiterPubkey and arbiterType are required' });
        }

        if (!disputeEvents.VALID_ARBITER_TYPES.includes(arbiterType)) {
            return res.status(400).json({ error: `Invalid arbiterType. Must be one of: ${disputeEvents.VALID_ARBITER_TYPES.join(', ')}` });
        }

        if (arbiterType === 'guardian' && !guardianState.guardians.has(arbiterPubkey)) {
            return res.status(400).json({ error: 'Specified pubkey is not a registered guardian' });
        }

        const arbiterEvent = await disputeEvents.publishArbiterAssignment({
            disputeId,
            arbiterPubkey,
            arbiterType,
            deadline: deadline || Math.floor(Date.now() / 1000) + 86400
        });

        dispute.arbiter = {
            pubkey: arbiterPubkey,
            type: arbiterType,
            assignedAt: Date.now(),
            deadline: deadline || Math.floor(Date.now() / 1000) + 86400,
            eventId: arbiterEvent?.id || null
        };
        dispute.status = 'assigned';

        broadcastToRide(dispute.taskId, {
            type: 'arbiter_assigned',
            dispute_id: disputeId,
            arbiter_pubkey: arbiterPubkey,
            arbiter_type: arbiterType
        });

        res.json({
            success: true,
            event_id: arbiterEvent?.id || null
        });
    } catch (error) {
        console.error('Error assigning arbiter:', error);
        res.status(500).json({ error: 'Failed to assign arbiter', details: error.message });
    }
});

// A4. Resolve dispute
app.post('/api/disputes/:disputeId/resolve', async (req, res) => {
    try {
        const { disputeId } = req.params;
        const {
            outcome,
            amount,
            currency,
            complainantStake,
            accusedStake,
            forfeitAmount,
            forfeitCurrency,
            reasoning
        } = req.body || {};

        const dispute = disputes.get(disputeId);
        if (!dispute) {
            return res.status(404).json({ error: 'Dispute not found' });
        }

        if (!['filed', 'assigned'].includes(dispute.status)) {
            return res.status(400).json({ error: 'Dispute cannot be resolved in its current state' });
        }

        if (!outcome || !disputeEvents.VALID_OUTCOMES.includes(outcome)) {
            return res.status(400).json({ error: `Invalid outcome. Must be one of: ${disputeEvents.VALID_OUTCOMES.join(', ')}` });
        }

        const arbiterPubkey = dispute.arbiter?.pubkey || config.operatorPubkey || 'unknown';

        const resolutionEvent = await disputeEvents.publishDisputeResolution({
            disputeId,
            outcome,
            arbiterPubkey,
            amount: amount || dispute.amount,
            currency: currency || dispute.currency,
            complainantStake: complainantStake || 'released',
            accusedStake: accusedStake || (outcome === 'dismissed' ? 'released' : 'forfeited'),
            forfeitAmount,
            reasoning: reasoning || ''
        });

        // Execute stake effects
        const rideId = dispute.taskId;
        const ride = rideManager.getRide(rideId);
        const cStake = complainantStake || 'released';
        const aStake = accusedStake || (outcome === 'dismissed' ? 'released' : 'forfeited');

        dispute.stakeEffects = {
            complainantStake: cStake,
            accusedStake: aStake,
            forfeitAmount: forfeitAmount || null
        };

        if (ride && stakeManager) {
            try {
                const trustModel = stakeManager.currentProvider?.getTrustModel() || 'unknown';
                const complainantRole = dispute.complainantPubkey === (ride.rider?.pubkey || ride.requester?.pubkey || '').toLowerCase() ? 'rider' : 'driver';
                const accusedRole = complainantRole === 'rider' ? 'driver' : 'rider';

                if (outcome === 'escalation') {
                    // Stakes held — do nothing
                } else {
                    // Release complainant stake
                    if (cStake === 'released') {
                        try {
                            const releaseResult = await stakeManager.releaseStake(`${rideId}_${complainantRole}`);
                            await stakeEvents.publishStakeRelease({
                                rideId,
                                role: complainantRole,
                                amount: releaseResult?.amount,
                                providerEvent: releaseResult,
                                reason: 'dispute_resolved',
                                trustModel
                            });
                        } catch (stakeErr) {
                            console.warn(`[Dispute] Failed to release complainant stake for ${rideId}:`, stakeErr.message);
                        }
                    }

                    // Handle accused stake
                    if (aStake === 'forfeited' || aStake === 'partial_forfeit') {
                        try {
                            const penaltyResult = await stakeManager.forfeitStake(
                                `${rideId}_${accusedRole}`,
                                forfeitAmount || undefined
                            );
                            await stakeEvents.publishStakePenalty({
                                rideId,
                                reason: `dispute_${outcome}`,
                                penalty: penaltyResult?.penalty || forfeitAmount,
                                refund: penaltyResult?.refund || 0,
                                providerEvent: penaltyResult,
                                currency: forfeitCurrency || currency || 'SAT',
                                trustModel
                            });
                        } catch (stakeErr) {
                            console.warn(`[Dispute] Failed to forfeit accused stake for ${rideId}:`, stakeErr.message);
                        }
                    } else if (aStake === 'released') {
                        try {
                            const releaseResult = await stakeManager.releaseStake(`${rideId}_${accusedRole}`);
                            await stakeEvents.publishStakeRelease({
                                rideId,
                                role: accusedRole,
                                amount: releaseResult?.amount,
                                providerEvent: releaseResult,
                                reason: 'dispute_dismissed',
                                trustModel
                            });
                        } catch (stakeErr) {
                            console.warn(`[Dispute] Failed to release accused stake for ${rideId}:`, stakeErr.message);
                        }
                    }
                }
            } catch (stakeError) {
                console.warn(`[Dispute] Stake operations failed for ${rideId}:`, stakeError.message);
            }
        }

        dispute.resolution = {
            outcome,
            amount: amount || dispute.amount,
            currency: currency || dispute.currency,
            reasoning: reasoning || '',
            eventId: resolutionEvent?.id || null,
            resolvedAt: Date.now()
        };
        dispute.status = outcome === 'escalation' ? 'escalated' : 'resolved';

        broadcastToRide(rideId, {
            type: 'dispute_resolved',
            dispute_id: disputeId,
            outcome,
            amount: amount || dispute.amount,
            currency: currency || dispute.currency
        });

        res.json({
            success: true,
            outcome,
            event_id: resolutionEvent?.id || null,
            status: dispute.status
        });
    } catch (error) {
        console.error('Error resolving dispute:', error);
        res.status(500).json({ error: 'Failed to resolve dispute', details: error.message });
    }
});

// A5. Appeal a resolution
app.post('/api/disputes/:disputeId/appeal', async (req, res) => {
    try {
        const { disputeId } = req.params;
        const { event } = req.body || {};

        if (!event) {
            return res.status(400).json({ error: 'Missing appeal event payload' });
        }

        const dispute = disputes.get(disputeId);
        if (!dispute) {
            return res.status(404).json({ error: 'Dispute not found' });
        }

        if (dispute.status !== 'resolved') {
            return res.status(400).json({ error: 'Only resolved disputes can be appealed' });
        }

        reputation.ensureEventIntegrity(event);

        if (event.kind !== 30551) {
            return res.status(400).json({ error: 'Event kind must be 30551' });
        }

        // Validate appellant is a dispute participant
        const eventPubkey = event.pubkey.toLowerCase();
        if (eventPubkey !== dispute.complainantPubkey && eventPubkey !== dispute.accusedPubkey) {
            return res.status(403).json({ error: 'Appellant must be a dispute participant' });
        }

        // Validate e tag references resolution event
        const eTag = event.tags.find(t => t[0] === 'e');
        if (!eTag || eTag[1] !== dispute.resolution?.eventId) {
            return res.status(400).json({ error: 'Appeal must reference the resolution event via e tag' });
        }

        // Check no existing appeal
        if (dispute.appeal) {
            return res.status(409).json({ error: 'This dispute has already been appealed' });
        }

        const publishResult = await reputation.publishGeneric(event, event.pubkey);

        const appealTypeTag = event.tags.find(t => t[0] === 'appeal_type');
        const defenceTag = event.tags.find(t => t[0] === 'defence');

        dispute.appeal = {
            eventId: event.id,
            appellantPubkey: eventPubkey,
            appealType: appealTypeTag?.[1] || 'standard',
            defence: defenceTag?.[1] || event.content || '',
            filedAt: Date.now()
        };
        dispute.status = 'appealed';

        broadcastToRide(dispute.taskId, {
            type: 'dispute_appealed',
            dispute_id: disputeId,
            appellant_pubkey: eventPubkey
        });

        res.json({
            success: true,
            relay_statuses: publishResult.relayStatuses || [],
            cached_locally: !!publishResult.cachedLocally
        });
    } catch (error) {
        console.error('Error filing appeal:', error);
        res.status(500).json({ error: 'Failed to file appeal', details: error.message });
    }
});

// B1. Suspicious activity report
app.post('/api/abuse/report', async (req, res) => {
    try {
        const { suspectPubkey, activityType, description, confidence, evidence } = req.body || {};

        if (!suspectPubkey || !activityType) {
            return res.status(400).json({ error: 'suspectPubkey and activityType are required' });
        }

        const event = await disputeEvents.publishSuspiciousActivity({
            suspectPubkey,
            activityType,
            domain: domainProfile.id,
            description: description || '',
            confidence,
            evidence
        });

        res.json({
            success: true,
            report_id: event?.id || null,
            event_id: event?.id || null
        });
    } catch (error) {
        console.error('Error reporting suspicious activity:', error);
        res.status(500).json({ error: 'Failed to report suspicious activity', details: error.message });
    }
});

// B2. Suspend account
app.post('/api/abuse/suspend', async (req, res) => {
    try {
        const { pubkey, reason, duration, relatedEventId } = req.body || {};

        if (!pubkey || !reason) {
            return res.status(400).json({ error: 'pubkey and reason are required' });
        }

        const effectiveFrom = Math.floor(Date.now() / 1000);

        const event = await disputeEvents.publishAccountSuspension({
            pubkey,
            reason,
            duration,
            effectiveFrom
        });

        suspensions.set(pubkey.toLowerCase(), {
            pubkey: pubkey.toLowerCase(),
            reason,
            duration: duration || null,
            effectiveFrom,
            eventId: event?.id || null,
            relatedEventId: relatedEventId || null,
            createdAt: Date.now()
        });

        broadcastToAll({
            type: 'account_suspended',
            pubkey: pubkey.toLowerCase(),
            reason
        });

        res.json({
            success: true,
            event_id: event?.id || null
        });
    } catch (error) {
        console.error('Error suspending account:', error);
        res.status(500).json({ error: 'Failed to suspend account', details: error.message });
    }
});

// B3. Check suspension
app.get('/api/abuse/suspensions/:pubkey', (req, res) => {
    try {
        const pubkey = req.params.pubkey.toLowerCase();
        const suspension = suspensions.get(pubkey);

        if (!suspension) {
            return res.json({ suspended: false, details: null });
        }

        // Check if duration-based suspension has expired
        if (suspension.duration && suspension.effectiveFrom) {
            const expiresAt = suspension.effectiveFrom + suspension.duration;
            if (Math.floor(Date.now() / 1000) > expiresAt) {
                suspensions.delete(pubkey);
                return res.json({ suspended: false, details: null });
            }
        }

        res.json({ suspended: true, details: suspension });
    } catch (error) {
        console.error('Error checking suspension:', error);
        res.status(500).json({ error: 'Failed to check suspension', details: error.message });
    }
});

// C1. Declare operator bond
app.post('/api/operator/bond', async (req, res) => {
    try {
        const { amount, currency, trustModel, guardianThreshold, feePercent, serviceArea, expiration } = req.body || {};

        if (!amount || !currency) {
            return res.status(400).json({ error: 'amount and currency are required' });
        }

        const event = await disputeEvents.publishOperatorBond({
            amount,
            currency,
            trustModel,
            guardianThreshold,
            feePercent,
            serviceArea,
            expiration
        });

        guardianState.bond = {
            amount: Number(amount),
            currency,
            trustModel: trustModel || 'custodial',
            guardianThreshold: guardianThreshold || 3,
            feePercent: feePercent || null,
            serviceArea: serviceArea || null,
            expiration: expiration || null,
            eventId: event?.id || null,
            createdAt: Date.now()
        };

        res.json({
            success: true,
            event_id: event?.id || null
        });
    } catch (error) {
        console.error('Error publishing operator bond:', error);
        res.status(500).json({ error: 'Failed to publish operator bond', details: error.message });
    }
});

// C2. File theft report
app.post('/api/guardian/theft-report', async (req, res) => {
    try {
        const { event } = req.body || {};

        if (!event) {
            return res.status(400).json({ error: 'Missing theft report event payload' });
        }

        reputation.ensureEventIntegrity(event);

        if (event.kind !== 30525) {
            return res.status(400).json({ error: 'Event kind must be 30525' });
        }

        // Validate required tags
        const requiredTags = ['operator', 'lock_event', 'completion_event', 'overdue_seconds'];
        for (const tagName of requiredTags) {
            const tag = event.tags.find(t => t[0] === tagName);
            if (!tag || !tag[1]) {
                return res.status(400).json({ error: `Missing required tag: ${tagName}` });
            }
        }

        const publishResult = await reputation.publishGeneric(event, event.pubkey);

        const reportId = `theft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        theftReports.set(reportId, {
            id: reportId,
            eventId: event.id,
            reporterPubkey: event.pubkey,
            operatorPubkey: event.tags.find(t => t[0] === 'operator')?.[1],
            lockEventId: event.tags.find(t => t[0] === 'lock_event')?.[1],
            completionEventId: event.tags.find(t => t[0] === 'completion_event')?.[1],
            overdueSeconds: Number(event.tags.find(t => t[0] === 'overdue_seconds')?.[1]),
            filedAt: Date.now(),
            watchdogThresholdMet: false
        });

        // Initialise watchdog claim tracking
        guardianState.watchdogClaims.set(reportId, []);

        res.json({
            success: true,
            report_id: reportId,
            relay_statuses: publishResult.relayStatuses || [],
            cached_locally: !!publishResult.cachedLocally
        });
    } catch (error) {
        console.error('Error filing theft report:', error);
        res.status(500).json({ error: 'Failed to file theft report', details: error.message });
    }
});

// C3. Watchdog claim (verify theft report)
app.post('/api/guardian/watchdog-claim', async (req, res) => {
    try {
        const { event } = req.body || {};

        if (!event) {
            return res.status(400).json({ error: 'Missing watchdog claim event payload' });
        }

        reputation.ensureEventIntegrity(event);

        if (event.kind !== 30526) {
            return res.status(400).json({ error: 'Event kind must be 30526' });
        }

        // Find referenced theft report via e tag
        const eTag = event.tags.find(t => t[0] === 'e');
        if (!eTag || !eTag[1]) {
            return res.status(400).json({ error: 'Missing e tag referencing theft report' });
        }

        // Find the theft report by event ID
        let targetReportId = null;
        for (const [id, report] of theftReports) {
            if (report.eventId === eTag[1]) {
                targetReportId = id;
                break;
            }
        }

        if (!targetReportId) {
            return res.status(404).json({ error: 'Referenced theft report not found' });
        }

        const report = theftReports.get(targetReportId);

        // Verifier must not be the original reporter
        if (event.pubkey.toLowerCase() === report.reporterPubkey.toLowerCase()) {
            return res.status(400).json({ error: 'Verifier cannot be the original reporter' });
        }

        const publishResult = await reputation.publishGeneric(event, event.pubkey);

        const claims = guardianState.watchdogClaims.get(targetReportId) || [];
        const verifiedTag = event.tags.find(t => t[0] === 'verified');
        claims.push({
            eventId: event.id,
            verifierPubkey: event.pubkey,
            verified: verifiedTag?.[1] === 'true',
            filedAt: Date.now()
        });
        guardianState.watchdogClaims.set(targetReportId, claims);

        // Check verification consensus (3-of-5 verified claims by default)
        const verifiedCount = claims.filter(c => c.verified).length;
        const threshold = 3;
        const thresholdMet = verifiedCount >= threshold;

        if (thresholdMet) {
            report.watchdogThresholdMet = true;
        }

        res.json({
            success: true,
            threshold_met: thresholdMet,
            claims_count: claims.length,
            verified_count: verifiedCount,
            relay_statuses: publishResult.relayStatuses || [],
            cached_locally: !!publishResult.cachedLocally
        });
    } catch (error) {
        console.error('Error filing watchdog claim:', error);
        res.status(500).json({ error: 'Failed to file watchdog claim', details: error.message });
    }
});

// C4. Slashing proposal
app.post('/api/guardian/slashing-proposal', async (req, res) => {
    try {
        const { event } = req.body || {};

        if (!event) {
            return res.status(400).json({ error: 'Missing slashing proposal event payload' });
        }

        reputation.ensureEventIntegrity(event);

        if (event.kind !== 30553) {
            return res.status(400).json({ error: 'Event kind must be 30553' });
        }

        // Validate proposer is a guardian
        if (!guardianState.guardians.has(event.pubkey)) {
            return res.status(403).json({ error: 'Proposer must be a registered guardian' });
        }

        // Validate referenced theft report has met watchdog threshold
        const eTag = event.tags.find(t => t[0] === 'e');
        if (!eTag || !eTag[1]) {
            return res.status(400).json({ error: 'Missing e tag referencing theft report' });
        }

        let targetReportId = null;
        for (const [id, report] of theftReports) {
            if (report.eventId === eTag[1]) {
                targetReportId = id;
                break;
            }
        }

        if (!targetReportId) {
            return res.status(404).json({ error: 'Referenced theft report not found' });
        }

        const report = theftReports.get(targetReportId);
        if (!report.watchdogThresholdMet) {
            return res.status(400).json({ error: 'Theft report has not met watchdog verification threshold' });
        }

        // Check no active proposal for same report
        for (const [, proposal] of guardianState.proposals) {
            if (proposal.theftReportId === targetReportId && proposal.status === 'active') {
                return res.status(409).json({ error: 'An active slashing proposal already exists for this theft report' });
            }
        }

        const publishResult = await reputation.publishGeneric(event, event.pubkey);

        const proposalId = `proposal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const thresholdTag = event.tags.find(t => t[0] === 'threshold');
        const slashAmountTag = event.tags.find(t => t[0] === 'slash_amount');
        const slashCurrencyTag = event.tags.find(t => t[0] === 'slash_currency');

        guardianState.proposals.set(proposalId, {
            id: proposalId,
            eventId: event.id,
            proposerPubkey: event.pubkey,
            theftReportId: targetReportId,
            theftReportEventId: eTag[1],
            slashAmount: slashAmountTag ? Number(slashAmountTag[1]) : 0,
            slashCurrency: slashCurrencyTag?.[1] || 'SAT',
            threshold: thresholdTag ? Number(thresholdTag[1]) : 3,
            votes: new Map(),
            status: 'active',
            createdAt: Date.now()
        });

        res.json({
            success: true,
            proposal_id: proposalId,
            relay_statuses: publishResult.relayStatuses || [],
            cached_locally: !!publishResult.cachedLocally
        });
    } catch (error) {
        console.error('Error creating slashing proposal:', error);
        res.status(500).json({ error: 'Failed to create slashing proposal', details: error.message });
    }
});

// C5. Guardian vote
app.post('/api/guardian/vote', async (req, res) => {
    try {
        const { event } = req.body || {};

        if (!event) {
            return res.status(400).json({ error: 'Missing vote event payload' });
        }

        reputation.ensureEventIntegrity(event);

        if (event.kind !== 30554) {
            return res.status(400).json({ error: 'Event kind must be 30554' });
        }

        // Validate voter is a guardian
        if (!guardianState.guardians.has(event.pubkey)) {
            return res.status(403).json({ error: 'Voter must be a registered guardian' });
        }

        // Find proposal via e tag
        const eTag = event.tags.find(t => t[0] === 'e');
        if (!eTag || !eTag[1]) {
            return res.status(400).json({ error: 'Missing e tag referencing proposal' });
        }

        let targetProposalId = null;
        for (const [id, proposal] of guardianState.proposals) {
            if (proposal.eventId === eTag[1]) {
                targetProposalId = id;
                break;
            }
        }

        if (!targetProposalId) {
            return res.status(404).json({ error: 'Referenced proposal not found' });
        }

        const proposal = guardianState.proposals.get(targetProposalId);

        if (proposal.status !== 'active') {
            return res.status(400).json({ error: 'Proposal is no longer active' });
        }

        // Check voter hasn't already voted
        if (proposal.votes.has(event.pubkey)) {
            return res.status(409).json({ error: 'Guardian has already voted on this proposal' });
        }

        // Validate vote tag
        const voteTag = event.tags.find(t => t[0] === 'vote');
        const vote = voteTag?.[1];
        if (!vote || !disputeEvents.VALID_VOTES.includes(vote)) {
            return res.status(400).json({ error: `Invalid vote. Must be one of: ${disputeEvents.VALID_VOTES.join(', ')}` });
        }

        const publishResult = await reputation.publishGeneric(event, event.pubkey);

        proposal.votes.set(event.pubkey, {
            vote,
            eventId: event.id,
            castAt: Date.now()
        });

        // Count votes
        const approvals = Array.from(proposal.votes.values()).filter(v => v.vote === 'approve').length;
        const rejections = Array.from(proposal.votes.values()).filter(v => v.vote === 'reject').length;
        const totalGuardians = guardianState.guardians.size;
        const thresholdMet = approvals >= proposal.threshold;
        const approvalImpossible = rejections > (totalGuardians - proposal.threshold);

        let slashingExecuted = false;

        if (thresholdMet) {
            // Execute slashing
            const slashingEvent = await disputeEvents.publishOperatorSlashing({
                slashingId: `slash_${Date.now().toString(36)}`,
                operatorPubkey: config.operatorPubkey,
                slashAmount: proposal.slashAmount,
                slashCurrency: proposal.slashCurrency,
                guardianVotes: approvals,
                theftReportEventId: proposal.theftReportEventId,
                proposalEventId: proposal.eventId
            });

            // Reduce bond
            if (guardianState.bond) {
                guardianState.bond.amount = Math.max(0, guardianState.bond.amount - proposal.slashAmount);
            }

            proposal.status = 'executed';
            proposal.slashingEventId = slashingEvent?.id || null;
            slashingExecuted = true;
        } else if (approvalImpossible) {
            proposal.status = 'rejected';
        }

        res.json({
            success: true,
            current_tally: { approve: approvals, reject: rejections, total: proposal.votes.size },
            threshold_met: thresholdMet,
            slashing_executed: slashingExecuted,
            relay_statuses: publishResult.relayStatuses || [],
            cached_locally: !!publishResult.cachedLocally
        });
    } catch (error) {
        console.error('Error casting guardian vote:', error);
        res.status(500).json({ error: 'Failed to cast vote', details: error.message });
    }
});

// D1. Get dispute details
app.get('/api/disputes/:disputeId', (req, res) => {
    try {
        const dispute = disputes.get(req.params.disputeId);
        if (!dispute) {
            return res.status(404).json({ error: 'Dispute not found' });
        }
        res.json({ success: true, dispute });
    } catch (error) {
        console.error('Error fetching dispute:', error);
        res.status(500).json({ error: 'Failed to fetch dispute', details: error.message });
    }
});

// D2. List disputes for a ride
app.get('/api/rides/:rideId/disputes', (req, res) => {
    try {
        const { rideId } = req.params;
        const rideDisputes = Array.from(disputes.values()).filter(d => d.taskId === rideId);
        res.json({ success: true, disputes: rideDisputes });
    } catch (error) {
        console.error('Error listing disputes:', error);
        res.status(500).json({ error: 'Failed to list disputes', details: error.message });
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

        const authErr = authoriseRideActor(req, ride, ['provider']);
        if (authErr) {
            return res.status(authErr.status).json(authErr);
        }

        // Settle via the configured payment provider — every payment record
        // carries an explicit method, amount, currency and trust_model, never
        // a fake payment hash dressed up as real settlement.
        const currency = ride.currency || 'GBP';
        let payment;
        if (paymentProvider && typeof paymentProvider.recordSettlement === 'function') {
            // Record-only rails (cash): the fare changes hands face-to-face
            const record = await paymentProvider.recordSettlement(rideId, ride.fare, currency);
            payment = {
                success: true,
                method: paymentProvider.providerName,
                status: 'declared',
                amount: ride.fare,
                currency,
                trust_model: paymentProvider.getTrustModel(),
                record,
                timestamp: Date.now()
            };
        } else if (paymentProvider && paymentProvider.providerName === 'demo') {
            payment = {
                success: true,
                method: 'demo',
                status: 'simulated',
                payment_hash: `demo_${Date.now()}`,
                amount: ride.fare,
                currency,
                trust_model: 'demo',
                timestamp: Date.now()
            };
        } else {
            // Lightning rails settle through the stake flow (hold invoices on
            // /rides/:id/*-stake). Completion here records that out-of-band
            // settlement is pending rather than pretending it happened.
            payment = {
                success: true,
                method: paymentProvider?.providerName || 'none',
                status: 'settlement_pending',
                amount: ride.fare,
                currency,
                trust_model: paymentProvider?.getTrustModel?.() || 'unknown',
                timestamp: Date.now()
            };
        }

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

// Ride statistics — MUST be registered before /api/rides/:rideId or the
// literal path 'stats' is captured as a ride id and 404s
app.get('/api/rides/stats', (req, res) => {
    try {
        const stats = rideManager.getStats();
        const activeRides = rideManager.getActiveRides();

        res.json({
            success: true,
            // Flat summary consumed by the driver dashboard
            total: stats.total || 0,
            active: activeRides.length,
            completed: stats.completed || 0,
            cancelled: stats.cancelled || 0,
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
    // Rider and driver are separate apps sharing one origin: driver paths
    // get the driver shell, everything else gets the rider shell.
    const driverShellPath = path.join(reactBuildPath, 'driver.html');
    if ((req.path.startsWith('/provide') || req.path.startsWith('/drive')) && fs.existsSync(driverShellPath)) {
        return res.sendFile(driverShellPath);
    }
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

    // Initialize task persistence and rehydrate active tasks
    await initializeTaskStore();

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
            await stakeManager.releaseStake(`${rideId}_rider`);
            await stakeManager.releaseStake(`${rideId}_driver`);
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
