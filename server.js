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

// nostr-tools' SimplePool references a global WebSocket. Node < 21 has none,
// so without this every relay read and write silently fails and the whole
// Nostr layer becomes inert. Set it before any pool is constructed.
if (typeof globalThis.WebSocket === 'undefined') {
    globalThis.WebSocket = WebSocket;
}
const Redis = require('redis');
const { PaymentProviderFactory, ResilientStakeManager } = require('./payment-providers/factory');
const reputation = require('./src/nostr/reputation');
const stakeEvents = require('./src/nostr/stake-events');
const disputeEvents = require('./src/nostr/dispute-events');
const operatorAnnounce = require('./src/nostr/operator-announce');
const pushService = require('./src/push');
const { validateNIP98Auth } = require('./middleware/nip98-auth');
const { getPublicKey: nostrGetPublicKey, nip19 } = require('nostr-tools');
const {
    publicRateLimiter: enforcePublicRateLimit,
    authenticatedRateLimiter: enforceAuthenticatedRateLimit,
    rideCreationLimiter: enforceRideCreationLimit,
    stakeLimiter: enforceStakeLimit
} = require('./middleware/rate-limit');
const {
    getBitcoinPrice,
    estimateTripCost,
    fetchBitcoinPrices,
    satsToFiat
} = require('./src/pricing/fiat-conversion');
const { RideManager, RideStatus } = require('./src/ride-manager');
const { TaskManager } = require('./src/task-manager');
const { loadProfile, listProfiles } = require('./src/domain-profiles');
const { getRoute } = require('./src/osrm-routing');
const { safeErrorMessage } = require('./src/log-redact');
const { createTaskStore } = require('./src/storage/task-store');
const {
    createOperatorPolicy,
    evaluateDriverAdmission,
    publicOperatorPolicy,
    admissionNeedsCredentials
} = require('./src/operator-policy');

const app = express();

// Behind Caddy/nginx the client IP arrives via X-Forwarded-For; without
// trust proxy every user shares the proxy's IP in one rate-limit bucket.
app.set('trust proxy', 1);

// CORS: operator switching means a PWA served by operator A must be able to
// call operator B. This API uses no cookies; participant data is protected
// by a request signature, so allowing a browser origin does not grant it an
// identity. Operators can disable federation CORS and use ALLOWED_ORIGINS.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'capacitor://localhost,http://localhost,https://localhost,http://localhost:5173,http://localhost:3000')
    .split(',').map(o => o.trim()).filter(Boolean);
const federationCorsEnabled = (process.env.FEDERATION_CORS || 'true').toLowerCase() !== 'false';
app.use(cors({
    origin: (origin, callback) => {
        // Non-browser clients and same-origin requests send no Origin header
        if (!origin || federationCorsEnabled || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(null, false);
    },
    maxAge: 86400
}));

// Minimal security headers (no external dependency)
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
});

// Body limit is small by default; only the proof route accepts photos.
// rawBody is captured for NIP-98 payload-tag verification.
const captureRawBody = (req, res, buf) => { req.rawBody = buf; };
const proofBodyParser = express.json({ limit: '2mb', verify: captureRawBody });
const defaultBodyParser = express.json({ limit: '100kb', verify: captureRawBody });
app.use((req, res, next) => {
    const parser = /\/proof$/.test(req.path) ? proofBodyParser : defaultBodyParser;
    parser(req, res, next);
});
app.use(express.static('public')); // Serve demo.html and other static files (legacy)

const rateLimitingEnabled = (process.env.ENABLE_RATE_LIMITING || 'true').toLowerCase() !== 'false';
const noRateLimit = (req, res, next) => next();
// ENABLE_RATE_LIMITING=false is used by local/test operators and must mean
// every limiter. Previously it disabled only the catch-all authenticated
// gate while route-level public, creation and stake limiters kept returning
// 429s — a browser suite could exhaust the shared IP bucket before a rider
// even reached the fare screen.
const publicRateLimiter = rateLimitingEnabled ? enforcePublicRateLimit : noRateLimit;
const authenticatedRateLimiter = rateLimitingEnabled ? enforceAuthenticatedRateLimit : noRateLimit;
const rideCreationLimiter = rateLimitingEnabled ? enforceRideCreationLimit : noRateLimit;
const stakeLimiter = rateLimitingEnabled ? enforceStakeLimit : noRateLimit;
if (!rateLimitingEnabled) {
    console.warn('\u26A0\uFE0F  Rate limiting DISABLED via ENABLE_RATE_LIMITING=false');
}

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
    // Without a signature there is no identity, so every participant-only
    // check in this file — managed ride details with exact coordinates,
    // pickup notes, panic records, and `subscribe_ride` on
    // the task socket — degrades to "anyone who knows the task id". That id
    // is not a secret: the requester's own kind 37500 announcement puts it
    // on public relays for federated discovery. So auth-off is not a weaker
    // deployment, it is an open one, and it must never be the posture a
    // real operator reaches by forgetting a variable.
    if (process.env.NODE_ENV === 'production'
        && (process.env.ALLOW_UNAUTHENTICATED || '').toLowerCase() !== 'true') {
        console.error('❌ Refusing to run with NIP-98 authentication disabled and NODE_ENV=production.');
        console.error('   Task ids travel on public relays, so unauthenticated participant checks admit anyone.');
        console.error('   Set ENABLE_NIP98_AUTH=true, or ALLOW_UNAUTHENTICATED=true for a throwaway public demo.');
        process.exit(1);
    }
    console.log('⚠️  NIP-98 authentication DISABLED — participant checks are OPEN to anyone holding a task id');
}

// For sensitive GET endpoints: require NIP-98 only when auth is enabled
const optionalNip98 = nip98Enabled ? validateNIP98Auth : (req, res, next) => next();

// Rate limiting runs AFTER auth so it keys on the authenticated PUBKEY, not
// the IP — otherwise every user behind a shared mobile-carrier IP would share
// one bucket. Mutating API traffic is limited per user.
if (rateLimitingEnabled) {
    app.use((req, res, next) => {
        const guarded = req.path.startsWith('/api/') || req.path.startsWith('/rides');
        const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
        if (!guarded || !mutating) {
            return next();
        }
        return authenticatedRateLimiter(req, res, next);
    });
}

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

/**
 * Coordinate/number validation shared across routes. `!lat` style checks
 * rejected legitimate zero coordinates and admitted strings like "abc".
 */
function isValidLat(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= -90 && n <= 90;
}

function isValidLon(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= -180 && n <= 180;
}

function isPositiveInt(value, max = Number.MAX_SAFE_INTEGER) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 && n <= max;
}

/** Intermediate calling points a request or a destination change may carry */
const MAX_TASK_STOPS = 3;

/**
 * Validate and normalise intermediate stops. Shared by the request handler
 * and the destination-change endpoint so "add a stop" means the same thing
 * whether it happens before or after the job is under way.
 *
 * @returns {{ stops: Array|null }|{ error: string }}
 */
function parseStops(stops) {
    if (stops == null) {
        return { stops: null };
    }
    if (!Array.isArray(stops) || stops.length > MAX_TASK_STOPS) {
        return { error: `stops must be an array of at most ${MAX_TASK_STOPS} intermediate stops` };
    }
    if (stops.length === 0) {
        return { stops: [] };
    }
    const parsed = [];
    for (const stop of stops) {
        const stopLon = stop?.lon != null ? stop.lon : stop?.lng;
        if (!isValidLat(stop?.lat) || !isValidLon(stopLon)) {
            return { error: 'each stop must contain valid lat and lon/lng' };
        }
        parsed.push({
            lat: Number(stop.lat),
            lon: Number(stopLon),
            ...(typeof stop.address === 'string' && stop.address.trim()
                ? { address: stop.address.trim().slice(0, 200) } : {})
        });
    }
    return { stops: parsed };
}

function clampText(value, maxLen) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.length > maxLen ? value.slice(0, maxLen) : value;
}

/**
 * Flow-A session authorisation: sessions store bare hex pubkeys rather than
 * identity objects. Returns null when permitted, else a 403 payload.
 */
function authoriseSessionActor(req, ...allowedHexKeys) {
    if (!nip98Enabled || !req.user) {
        return null;
    }
    const signer = (req.user.pubkey || '').toLowerCase();
    const permitted = allowedHexKeys
        .filter(Boolean)
        .some((hex) => hex.toLowerCase() === signer);
    if (permitted) {
        return null;
    }
    return {
        status: 403,
        error: 'Forbidden',
        details: 'Signer does not hold the required role on this ride session'
    };
}

// Serve React frontend build if available (web/dist/)
const path = require('path');
const reactBuildPath = path.join(__dirname, 'web', 'dist');
app.use(express.static(reactBuildPath));

// ==========================================
// RELAY OPERATOR CONFIGURATION
// ==========================================

/**
 * Parse a numeric env var. Unlike `parseFloat(x) || dflt`, a configured
 * value of 0 is respected and garbage fails loudly.
 */
function envNumber(name, dflt) {
    const raw = process.env[name];
    if (raw == null || raw === '') {
        return dflt;
    }
    const value = parseFloat(raw);
    if (!Number.isFinite(value)) {
        console.error(`\u274C ${name}="${raw}" is not a number`);
        process.exit(1);
    }
    return value;
}

/**
 * Resolve the operator's private key. Accepts hex via OPERATOR_PRIVKEY or
 * bech32 nsec via OPERATOR_NSEC / OPERATOR_PRIVKEY. Exits on a malformed
 * key \u2014 a silently absent key disables the entire public audit trail.
 */
function resolveOperatorPrivkey() {
    const raw = process.env.OPERATOR_PRIVKEY || process.env.OPERATOR_NSEC || null;
    if (!raw) {
        return null;
    }
    const trimmed = raw.trim();
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
        return trimmed.toLowerCase();
    }
    if (trimmed.startsWith('nsec1')) {
        try {
            const decoded = nip19.decode(trimmed);
            const data = decoded.data;
            const hex = typeof data === 'string' ? data : Buffer.from(data).toString('hex');
            if (/^[0-9a-f]{64}$/.test(hex)) {
                return hex;
            }
        } catch (error) {
            console.error(`\u274C OPERATOR_PRIVKEY/OPERATOR_NSEC is not a valid nsec: ${error.message}`);
            process.exit(1);
        }
    }
    console.error('\u274C OPERATOR_PRIVKEY/OPERATOR_NSEC must be 64 hex chars or an nsec1 string');
    process.exit(1);
}

const config = {
    // Operator settings
    operatorName: process.env.OPERATOR_NAME || 'DonkeyRide Operator',
    operatorPubkey: process.env.OPERATOR_PUBKEY,
    operatorPrivkey: resolveOperatorPrivkey(),
    operatorLightningAddress: process.env.OPERATOR_LIGHTNING,
    // Default 0: the non-custodial operator takes NO cut of the fare (it never
    // holds the fare, so it cannot). A licensed custodial operator may set a
    // fee, which is only ever deducted on a custodial rail it is licensed for.
    operatorFeePercent: envNumber('OPERATOR_FEE_PERCENT', 0),

    // Fare rate card. Defaults are quoted in USD and auto-converted to the ride
    // currency, so fares are sane in any currency (incl. KES) out of the box.
    // An operator running a real market sets these to their own currency and
    // sets FARE_CURRENCY to match (then no conversion is applied).
    fareBase: envNumber('FARE_BASE', 2.50),
    farePerKm: envNumber('FARE_PER_KM', 1.50),
    farePerMinute: envNumber('FARE_PER_MINUTE', 0.30),

    // Server settings
    port: process.env.PORT || 3000,
    wsPort: process.env.WS_PORT || 3001,

    // Nostr relay to publish events. NO default: this used to fall back to
    // 'wss://relay.damus.io', so `NOSTR_RELAY=''` — the obvious way to say
    // "publish nowhere", and what the test suite sets — resolved to a large
    // public relay instead. That is how signed task snapshots ended up on
    // relay.damus.io. An unnamed relay is not a relay.
    nostrRelay: process.env.NOSTR_RELAY || '',

    // Relay URLs advertised to clients (public URLs, not Docker-internal ones)
    publicRelays: (process.env.PUBLIC_RELAY_URLS || '')
        .split(',').map(r => r.trim()).filter(Boolean),

    // Operator policies
    maxStakeAmount: envNumber('MAX_STAKE_AMOUNT', 10000), // Max stake in sats
    minStakeAmount: envNumber('MIN_STAKE_AMOUNT', 50),    // Min stake in sats
    requireKYC: (process.env.REQUIRE_KYC || '').toLowerCase() === 'true',
};

// Fiat currencies the operator can price rides in. KES is included so a Kenyan
// operator can price in shillings and the M-Pesa/Tando rails show the exact
// amount. DEFAULT_FIAT_CURRENCY sets the fallback when a request omits one.
const SUPPORTED_FIAT = ['USD', 'EUR', 'GBP', 'KES'];
const DEFAULT_FIAT = (() => {
    const c = (process.env.DEFAULT_FIAT_CURRENCY || 'GBP').toUpperCase();
    return SUPPORTED_FIAT.includes(c) ? c : 'GBP';
})();
/** Normalise a requested currency to a supported one, else the operator default. */
function resolveFiatCurrency(requested) {
    const c = typeof requested === 'string' ? requested.toUpperCase() : '';
    return SUPPORTED_FIAT.includes(c) ? c : DEFAULT_FIAT;
}

// Currency the fare rate card is quoted in. Defaults to USD (the built-in rate
// card is USD-denominated and converted to the ride currency); an operator with
// a local rate card sets FARE_CURRENCY to their own currency.
const RATE_CARD_CURRENCY = (() => {
    const c = (process.env.FARE_CURRENCY || 'USD').toUpperCase();
    return SUPPORTED_FIAT.includes(c) ? c : 'USD';
})();

// Data handling is an operator choice, not a market assumption.
//
// blind   — the coordinator receives coarse geohash cell centres and routed
//           distance/time totals. Exact itinerary points are exchanged
//           participant-to-participant by the clients after a match.
// managed — the operator receives exact points and may attach a database.
//
// Keep the process default compatible for developers and existing managed
// operators; the public/demo compose file explicitly selects `blind`.
const OPERATOR_DATA_MODE = (() => {
    const mode = String(process.env.OPERATOR_DATA_MODE || 'managed').trim().toLowerCase();
    if (!['blind', 'managed'].includes(mode)) {
        console.error(`❌ Invalid OPERATOR_DATA_MODE "${mode}" (expected blind or managed)`);
        process.exit(1);
    }
    return mode;
})();
const PUBLIC_ROUTING_URL = String(process.env.PUBLIC_ROUTING_URL || '').trim().replace(/\/$/, '');
const PRIVATE_LOCATION_PRECISION = 5; // roughly a neighbourhood, not a doorway
const SETTLEMENT_MODES = new Set(['priced', 'none']);

function normaliseSettlementMode(value) {
    const mode = typeof value === 'string' ? value.trim().toLowerCase() : 'priced';
    return SETTLEMENT_MODES.has(mode) ? mode : null;
}

function parseRouteSummary(value, allowZero = false) {
    if (!value || typeof value !== 'object') return null;
    const distanceKm = Number(value.distance_km ?? value.distanceKm);
    const durationMinutes = Number(value.duration_minutes ?? value.durationMinutes);
    const minimum = allowZero ? 0 : Number.MIN_VALUE;
    if (!Number.isFinite(distanceKm) || distanceKm < minimum || distanceKm > 2000) return null;
    if (!Number.isFinite(durationMinutes) || durationMinutes < minimum || durationMinutes > 48 * 60) return null;
    if (allowZero && ((distanceKm === 0) !== (durationMinutes === 0))) return null;
    return { distanceKm, durationMinutes };
}

/** Rate-card options passed to every estimateTripCost() call. */
function rateCardOptions(currency, multiplier = 1) {
    // A service class (XL, Comfort) scales the whole rate card, so every
    // derived figure — fare, breakdown rows, formatted string — stays
    // internally consistent instead of a multiplied total that no longer
    // matches its own breakdown.
    const m = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
    return {
        currency,
        baseFare: config.fareBase * m,
        perKm: config.farePerKm * m,
        perMinute: config.farePerMinute * m,
        rateCardCurrency: RATE_CARD_CURRENCY,
        operatorFeePct: config.operatorFeePercent
    };
}

/**
 * Route + price a trip. The single pricing path for BOTH the upfront quote
 * (`/api/trips/estimate`) and the fare recorded on the ride
 * (`/api/rides/request`) — see the upfront-price guarantee below. Any change
 * here moves both, which is the point.
 *
 * @returns {{distance:number, duration:number, coordinates:Array|null,
 *            routed:boolean, estimate:object}}
 */
async function routeAndPrice(pickup, dropoff, via, currency, multiplier = 1) {
    let distance = 0;
    let duration = 0;
    let coordinates = null;
    let routed = false;

    if (dropoff && dropoff.lat != null && dropoff.lon != null) {
        const osrmRoute = await getRoute(
            pickup.lat, pickup.lon, dropoff.lat, dropoff.lon, via || []
        );
        if (osrmRoute) {
            distance = parseFloat(osrmRoute.distanceKm);
            duration = osrmRoute.durationMin;
            coordinates = osrmRoute.coordinates;
            routed = true;
        } else {
            const error = new Error('Road routing is unavailable; no straight-line estimate was substituted');
            error.code = 'ROAD_ROUTING_UNAVAILABLE';
            throw error;
        }
    }

    const estimate = await estimateTripCost(
        distance, duration, rateCardOptions(currency, multiplier)
    );
    return { distance, duration, coordinates, routed, estimate };
}

// ==========================================
// QUOTE STORE — the upfront-price guarantee across TIME
// ==========================================
// routeAndPrice() makes the quote and the fare agree for the same INPUTS,
// but the rate card is fiat and reaches sats through a BTC price cached for
// five minutes. A rider who reads the quote, picks a service class and types
// a meeting note can easily cross that boundary, and the ride then records a
// number they never saw — the completion screen even calls it the "agreed
// amount". Recomputing more carefully cannot fix that; only remembering the
// quote can. So the estimate mints one, and the request spends it.
//
// Kept in memory and short-lived, like every other bit of coordination state
// here: a lost quote costs a re-price, not a ride.
const quoteStore = new Map();
const QUOTE_TTL_MS = parseInt(process.env.QUOTE_TTL_MS || '600000', 10); // 10 min
// How far the request's coordinates may sit from the quoted ones. Not zero:
// clients round when they serialise. Far too small to buy a different journey.
const QUOTE_MATCH_TOLERANCE_KM = 0.1;

function rememberQuote(entry) {
    // Unguessable: a quote is a promise about money, and a predictable
    // handle would let one rider spend another's.
    const id = `q_${require('crypto').randomBytes(16).toString('hex')}`;
    quoteStore.set(id, { ...entry, expiresAt: Date.now() + QUOTE_TTL_MS });
    return id;
}

/** The quote if it is still valid AND is for the journey being requested. */
function redeemQuote(quoteId, journey) {
    if (typeof quoteId !== 'string' || !quoteId) return null;
    const quote = quoteStore.get(quoteId);
    if (!quote) return null;
    if (quote.expiresAt <= Date.now()) {
        quoteStore.delete(quoteId);
        return null;
    }
    // A privacy-mode quote is bound to routed totals rather than exact
    // coordinates. The routing client keeps the itinerary; the coordinator
    // only needs the numbers the rate card prices.
    if (quote.locationMode === 'participant_encrypted') {
        const distanceDelta = Math.abs(Number(quote.distanceKm) - Number(journey.distanceKm));
        const durationDelta = Math.abs(Number(quote.durationMinutes) - Number(journey.durationMinutes));
        if (!Number.isFinite(distanceDelta) || distanceDelta > 0.05) return null;
        if (!Number.isFinite(durationDelta) || durationDelta > 0.5) return null;
        if ((quote.stopCount || 0) !== (journey.stopCount || 0)) return null;
        if ((quote.currency || null) !== (journey.currency || null)) return null;
        return quote;
    }

    // A managed-mode quote buys the journey it was given for, not a cheaper
    // price on a different one. Everything the fare depends on has to match.
    const near = (a, b) => a && b
        && calculateDistance(a.lat, a.lon, b.lat, b.lon) <= QUOTE_MATCH_TOLERANCE_KM;
    if (!near(quote.pickup, journey.pickup)) return null;
    if (Boolean(quote.dropoff) !== Boolean(journey.dropoff)) return null;
    if (quote.dropoff && !near(quote.dropoff, journey.dropoff)) return null;
    if ((quote.stopCount || 0) !== (journey.stopCount || 0)) return null;
    if ((quote.currency || null) !== (journey.currency || null)) return null;
    return quote;
}

/**
 * The sats figure this quote showed for the class the rider actually chose.
 * The confirm screen prices EVERY class up front, so the class is picked
 * after the quote is minted — a quote is for a journey, not for one row of
 * the rate card. Returns null for a class this quote never priced.
 */
function quotedFareFor(quote, optionId) {
    if (!quote) return null;
    const key = optionId || '__default__';
    const priced = quote.fares && quote.fares[key];
    return priced && Number.isFinite(priced.sats) ? priced : null;
}

const quoteSweep = setInterval(() => {
    const now = Date.now();
    for (const [id, q] of quoteStore) {
        if (q.expiresAt <= now) quoteStore.delete(id);
    }
}, 60 * 1000);
quoteSweep.unref();

/**
 * Sats rows for a fare breakdown that actually sums to the quote. The pricing
 * module returns fiat rows; the client shows sats-and-fiat, so convert with
 * the SAME fiat→sats ratio the total used rather than re-deriving it.
 */
function breakdownSats(estimate) {
    const rows = estimate.breakdown || {};
    const totalFiat = estimate.fare?.fiat || 0;
    const totalSats = estimate.fare?.sats || 0;
    const toSats = (fiat) => (totalFiat > 0
        ? Math.round((fiat / totalFiat) * totalSats)
        : 0);
    const baseFareSats = toSats(rows.baseFare?.fiat || 0);
    const timeFareSats = toSats(rows.duration?.fiat || 0);
    // Rounding remainder lands on the distance row so the three rows sum to
    // the quoted fare EXACTLY — a breakdown that is a sat out invites the
    // "what's the extra for?" question this feature exists to answer.
    return {
        baseFareSats,
        distanceFareSats: Math.max(0, totalSats - baseFareSats - timeFareSats),
        timeFareSats,
        operatorFeeSats: estimate.operatorFee?.sats || 0
    };
}

const packageVersion = require('./package.json').version;

// ==========================================
// DOMAIN PROFILE
// ==========================================

let domainProfile;
try {
    domainProfile = loadProfile(process.env.DOMAIN);
} catch (error) {
    console.error(`\u274C Failed to load domain profile "${process.env.DOMAIN}": ${error.message}`);
    process.exit(1);
}
console.log(`\uD83C\uDF10 Domain profile loaded: ${domainProfile.name} (${domainProfile.id})`);

if (config.operatorPrivkey) {
    try {
        const derived = nostrGetPublicKey(config.operatorPrivkey);
        if (config.operatorPubkey && !config.operatorPubkey.startsWith('npub')
            && config.operatorPubkey.toLowerCase() !== derived.toLowerCase()) {
            console.error('\u274C OPERATOR_PUBKEY does not match the key derived from the private key');
            process.exit(1);
        }
        config.operatorPubkey = derived;
        console.log('\uD83D\uDD11 Operator Nostr identity loaded');
    } catch (error) {
        console.error('\u274C Failed to derive operator pubkey from private key:', error.message);
        process.exit(1);
    }
} else {
    console.warn('\u26A0\uFE0F  No operator key configured (OPERATOR_PRIVKEY or OPERATOR_NSEC) \u2014 operator-signed Nostr events are DISABLED');
}

// ==========================================
// PAYMENT PROVIDER INITIALIZATION
// ==========================================

// Initialize payment provider with automatic fallbacks
let paymentProvider;
let stakeManager;
let httpServer = null;

/**
 * Unify on the stake manager's primary provider and refuse to run a mock
 * rail in production. Two divergent provider instances previously meant
 * settlements were recorded on an object holding no stakes.
 */
function adoptPaymentProvider() {
    paymentProvider = stakeManager.currentProvider;

    // COMPLIANCE GATE: the reference operator is a coordinator, not a payment
    // institution. A custodial rail (one where the operator receives, holds or
    // can claim funds) makes the operator a money transmitter / EMI \u2014 a
    // licensed activity. Refuse to run one unless the operator explicitly
    // asserts it holds the requisite licence.
    const custody = typeof paymentProvider.getCustodyModel === 'function'
        ? paymentProvider.getCustodyModel()
        : 'custodial';
    const licensed = (process.env.OPERATOR_LICENSED_CUSTODIAN || '').toLowerCase() === 'true';
    if (custody !== 'none' && !licensed) {
        console.error(`\u274C Payment provider '${paymentProvider.providerName}' is CUSTODIAL \u2014 the operator would receive and control funds, making it a money transmitter.`);
        console.error('   The reference operator is non-custodial by design. Use PAYMENT_PROVIDER=cash (record-only, settles peer-to-peer).');
        console.error('   Only set OPERATOR_LICENSED_CUSTODIAN=true if you are a licensed payment institution and accept that regulatory burden.');
        process.exit(1);
    }

    if (process.env.NODE_ENV === 'production'
        && paymentProvider.getTrustModel() === 'demo'
        && (process.env.ALLOW_DEMO_PAYMENTS || '').toLowerCase() !== 'true') {
        console.error('\u274C Refusing to run the demo payment provider with NODE_ENV=production.');
        console.error('   Set PAYMENT_PROVIDER=cash for a real non-custodial rail, or ALLOW_DEMO_PAYMENTS=true for a public demo.');
        process.exit(1);
    }

    const caps = paymentProvider.getCapabilities();
    console.log(`\u2705 Payment provider: ${paymentProvider.providerName} (trust: ${caps.trustModel}, custody: ${custody})`);
    if (custody === 'none') {
        console.log('\uD83D\uDEE1\uFE0F  Non-custodial: the operator never receives, holds, or transmits funds.');
    } else {
        console.log('\u26A0\uFE0F  CUSTODIAL rail active under OPERATOR_LICENSED_CUSTODIAN \u2014 the operator is acting as a licensed payment institution.');
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
        manager.setSnapshotPublisher(publishTaskSnapshot);
        _domainManagers.set(domainId, manager);
    }
    return _domainManagers.get(domainId);
}

async function initializeTaskStore() {
    // Always attach the Nostr snapshot publisher — it is the default
    // durability layer, database or not.
    for (const manager of _domainManagers.values()) {
        manager.setSnapshotPublisher(publishTaskSnapshot);
    }

    // A database is entirely optional. The default deployment runs with none:
    // durability comes from Nostr snapshots (rehydrated below). Only when
    // DATABASE_URL is set (e.g. a licensed Mode-B operator retaining PII) does
    // the operator use a store.
    if (!process.env.DATABASE_URL) {
        console.log('💾 No database configured — in-memory + Nostr snapshot durability');
        return;
    }
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
        console.warn('⚠️  Task store unavailable — running in-memory + Nostr only:', error.message);
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
    updatePickup(rideId, ...args) { return _getManagerForRide(rideId).updatePickup(rideId, ...args); },
    updateDropoff(rideId, ...args) { return _getManagerForRide(rideId).updateDropoff(rideId, ...args); },
    recordRating(rideId, ...args) { return _getManagerForRide(rideId).recordRating(rideId, ...args); },

    // Persist mutations made directly on the ride object (proofs, tips, safety, quotes)
    persistRide(rideId) {
        const mgr = _getManagerForRide(rideId);
        const ride = mgr.getRide(rideId);
        if (ride) {
            mgr._persist(ride);
        }
    },

    // All in-memory tasks where the pubkey is a party (either role).
    // Tasks created via npub-only identities are matched through the
    // derived npub as well.
    getTasksByParticipant(pubkey) {
        const key = (pubkey || '').toLowerCase();
        let npubKey = null;
        try {
            npubKey = /^[0-9a-f]{64}$/.test(key) ? nip19.npubEncode(key).toLowerCase() : null;
        } catch (error) {
            npubKey = null;
        }
        const matchesIdentity = (identity) => Boolean(identity && (
            identity.pubkey?.toLowerCase() === key
            || (npubKey && identity.npub?.toLowerCase() === npubKey)
        ));
        const matches = [];
        for (const mgr of _domainManagers.values()) {
            for (const task of mgr.tasks.values()) {
                if (matchesIdentity(task.provider || task.driver)
                    || matchesIdentity(task.requester || task.rider)) {
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
if (relayConfig.length === 0) {
    // Silence is the safe default (see src/nostr/reputation.js), but it is
    // not a FREE default: no relay means no snapshot durability, so an
    // in-flight task will not survive a restart. Say so rather than let an
    // operator discover it the hard way.
    console.log('📡 No relays configured — the operator publishes nothing and');
    console.log('   active tasks will NOT survive a restart. Set NOSTR_RELAY to enable durability.');
} else {
    console.log(`📡 Relays: ${relayConfig.join(', ')}`);
}

/**
 * Outbox-aware publisher: an operator-signed event that reaches no relay is
 * buffered and retried, never silently dropped. Uses the database outbox when
 * a store is configured, otherwise an in-memory buffer (bounded) so the
 * default DB-less operator still retries.
 */
const memoryOutbox = new Map(); // event.id -> event
const MEMORY_OUTBOX_MAX = 500;

async function bufferOutbox(event) {
    if (taskStore) {
        await taskStore.saveOutboxEvent(event).catch(() => {});
        return;
    }
    if (memoryOutbox.size >= MEMORY_OUTBOX_MAX) {
        // drop oldest
        const oldest = memoryOutbox.keys().next().value;
        memoryOutbox.delete(oldest);
    }
    memoryOutbox.set(event.id, event);
}

async function publishWithOutbox(event, expectedPubkey) {
    try {
        const result = await reputation.publishGeneric(event, expectedPubkey);
        const anyOk = (result.relayStatuses || []).some((status) => status.ok);
        if (!anyOk) {
            await bufferOutbox(event);
        }
        return result;
    } catch (error) {
        await bufferOutbox(event);
        throw error;
    }
}

stakeEvents.configure({
    operatorPrivkey: config.operatorPrivkey,
    domain: domainProfile.id,
    publishGeneric: (event) => publishWithOutbox(event, config.operatorPubkey || event.pubkey)
});
disputeEvents.configure({
    operatorPrivkey: config.operatorPrivkey,
    publishGeneric: (event) => publishWithOutbox(event, config.operatorPubkey || event.pubkey)
});
operatorAnnounce.configure({
    operatorPrivkey: config.operatorPrivkey,
    publishGeneric: (event) => publishWithOutbox(event, config.operatorPubkey || event.pubkey)
});

// ==========================================
// NOSTR STATE SNAPSHOTS (durability without a database)
// The operator publishes a kind 30078 snapshot on every task mutation and
// rehydrates non-terminal tasks from these on boot. This replaces
// operator-side database persistence for the default deployment.
//
// Two layers of restraint, because one was not enough:
//   1. Exact coordinates and addresses never enter a snapshot at all —
//      location is reduced to a geohash cell before it leaves memory.
//   2. The whole body is then SEALED to the operator's own key (NIP-44).
//      Coarse location is not anonymous location: a pubkey plus a ~1 km
//      cell plus a timestamp, repeated, is somebody's home. The snapshot
//      has exactly one legitimate reader — this operator at boot — so it
//      is written for that reader and no one else.
// A relay stores it; a relay cannot read it.
// ==========================================

const { encodeGeohash, decodeGeohash } = require('./src/utils/geohash');
const SNAPSHOT_GEOHASH_PRECISION = parseInt(process.env.SNAPSHOT_GEOHASH_PRECISION || '6', 10);
const SNAPSHOT_TTL_SECONDS = parseInt(process.env.SNAPSHOT_TTL_SECONDS || String(24 * 3600), 10);
// Snapshots ARE the durability layer for the default database-free operator,
// so they stay on by default. An operator with DATABASE_URL set has a durable
// store already and can switch them off entirely: NOSTR_SNAPSHOTS=false.
const SNAPSHOTS_ENABLED = (process.env.NOSTR_SNAPSHOTS || '').toLowerCase() !== 'false';

function buildTaskSnapshot(task) {
    const requester = task.requester || task.rider || null;
    const provider = task.provider || task.driver || null;
    const pickup = task.pickup || task.origin || null;
    const dropoff = task.dropoff || task.destination || null;
    const participants = [];
    if (requester?.pubkey) participants.push({ pubkey: requester.pubkey, role: 'requester' });
    if (provider?.pubkey) participants.push({ pubkey: provider.pubkey, role: 'provider' });

    const geohashPickup = pickup && Number.isFinite(pickup.lat)
        ? encodeGeohash(pickup.lat, pickup.lon ?? pickup.lng, SNAPSHOT_GEOHASH_PRECISION) : '';
    const geohashDropoff = dropoff && Number.isFinite(dropoff.lat)
        ? encodeGeohash(dropoff.lat, dropoff.lon ?? dropoff.lng, SNAPSHOT_GEOHASH_PRECISION) : '';
    const geohashStops = (task.stops || [])
        .filter((s) => Number.isFinite(s?.lat))
        .map((s) => encodeGeohash(s.lat, s.lon ?? s.lng, SNAPSHOT_GEOHASH_PRECISION));

    return {
        taskId: task.id,
        expirationSeconds: Math.floor(Date.now() / 1000) + SNAPSHOT_TTL_SECONDS,
        // Sealed to the operator's own key before it leaves the process.
        // `participants` rides INSIDE the ciphertext — as public `p` tags it
        // made every task queryable per person.
        content: {
            participants,
            status: task.status,
            domain: task.domain || domainProfile.id,
            requester: requester ? { pubkey: requester.pubkey, npub: requester.npub } : null,
            provider: provider ? { pubkey: provider.pubkey, npub: provider.npub } : null,
            fare: task.fare ?? null,
            currency: task.currency || null,
            settlementMode: task.settlementMode || 'priced',
            locationMode: task.locationMode || 'operator_memory',
            stopCount: task.stopCount ?? (task.stops?.length || 0),
            scheduledFor: task.scheduledFor || null,
            // Deliberately NOT the payment hashes of invoices issued for this
            // task. Carrying them looks like it would let a restart mid-payment
            // still verify a rider's preimage, but rehydrateFromNostr skips
            // terminal tasks and `completed` is terminal — settlement happens
            // after /complete, so a completed task is never restored and there
            // would be no reader. A publish needs a reader; this one has none.
            //
            // The real limitation is broader and by design: a completed task
            // does not survive a restart at all, so /settle and
            // /confirm-received are both gone for it. Both parties keep their
            // own device-local record, and the operator holds no money, so
            // nothing is lost but the operator's note of it. Widening
            // rehydration to settlement-pending tasks would resurrect their
            // participants and geohashes, which is exactly what the
            // ephemerality protects, so it is a design decision and not a
            // gap to paper over here.
            geohashPickup,
            geohashDropoff,
            geohashStops: geohashStops.length > 0 ? geohashStops : undefined,
            timestamps: task.timestamps || null
        }
    };
}

function publishTaskSnapshot(task) {
    if (!SNAPSHOTS_ENABLED || !operatorAnnounce.canPublish() || !task?.id) {
        return;
    }
    operatorAnnounce.publishTaskSnapshot(buildTaskSnapshot(task))
        .catch((err) => console.warn(`Failed to publish snapshot for ${task.id}:`, err.message));
}

/**
 * Reconstruct an in-memory task from a PII-free Nostr snapshot. Location is
 * restored to the geohash cell centre (approximate) — exact coordinates were
 * never persisted. Enough to continue the lifecycle after an operator restart.
 */
function taskFromSnapshot(content) {
    if (!content || !content.status) {
        return null;
    }
    const pickup = content.geohashPickup ? decodeGeohash(content.geohashPickup) : null;
    const dropoff = content.geohashDropoff ? decodeGeohash(content.geohashDropoff) : null;
    return {
        status: content.status,
        domain: content.domain,
        requester: content.requester || null,
        provider: content.provider || null,
        rider: content.requester || null,
        driver: content.provider || null,
        pickup: pickup ? { lat: pickup.lat, lon: pickup.lon, approximate: true } : null,
        dropoff: dropoff ? { lat: dropoff.lat, lon: dropoff.lon, approximate: true } : null,
        stops: Array.isArray(content.geohashStops) && content.geohashStops.length > 0
            ? content.geohashStops.map((gh) => {
                const cell = decodeGeohash(gh);
                return { lat: cell.lat, lon: cell.lon, approximate: true };
            })
            : null,
        fare: content.fare ?? null,
        currency: content.currency || null,
        settlementMode: content.settlementMode || 'priced',
        locationMode: content.locationMode || 'operator_memory',
        stopCount: Number.isInteger(content.stopCount) ? content.stopCount : 0,
        scheduledFor: content.scheduledFor || null,
        timestamps: content.timestamps || {},
        history: [],
        rehydratedFromNostr: true,
        piiEphemeral: true
    };
}

/**
 * Rehydrate active tasks from the operator's own kind 30078 snapshots on
 * relays. Used when there is no database in the loop.
 */
async function rehydrateFromNostr() {
    const operatorPubkey = operatorAnnounce.getOperatorPubkey();
    if (!operatorPubkey) {
        return 0;
    }
    let restored = 0;
    try {
        const events = await reputation.queryEvents([{ kinds: [30078], authors: [operatorPubkey], limit: 500 }]);
        for (const event of events) {
            try {
                const taskId = (event.tags.find((t) => t[0] === 'd') || [])[1];
                if (!taskId) continue;
                // Sealed to us. Anything we cannot open is not our state:
                // a foreign event, a corrupt one, or a plaintext snapshot
                // from before sealing — all are skipped rather than trusted.
                const content = operatorAnnounce.openSnapshot(event.content);
                if (!content) continue;
                const manager = _getManagerForDomain(content.domain || domainProfile.id);
                if (manager.isTerminal(content.status)) continue;
                if (manager.getRide(taskId)) continue; // already in memory
                const task = taskFromSnapshot(content);
                if (!task) continue;
                task.id = taskId;
                manager.hydrateTask(task);
                _rideIndex.set(taskId, content.domain || domainProfile.id);
                restored += 1;
            } catch (error) {
                // skip malformed snapshot
            }
        }
    } catch (error) {
        console.warn('Nostr rehydration failed:', error.message);
    }
    return restored;
}

// ==========================================
// WEBSOCKET FOR REAL-TIME UPDATES
// ==========================================

const wsDisabled = (process.env.DISABLE_WS || '').toLowerCase() === 'true';
const wss = wsDisabled ? null : new WebSocket.Server({ port: config.wsPort, maxPayload: 64 * 1024 });

if (wsDisabled) {
    console.log('⚠️  WebSocket broadcasting disabled via DISABLE_WS');
}

/**
 * Validate a WebSocket auth frame: a signed NIP-98-style event (kind 27235,
 * method GET) sent as the first message. Signature, kind, freshness and
 * single-use are enforced; the `u` tag must be present (host-agnostic, same
 * rationale as the HTTP middleware's path-only default behind proxies).
 */
const wsSeenAuthEvents = new Map(); // event id -> expiry epoch ms

function validateWsAuthEvent(event) {
    try {
        reputation.ensureEventIntegrity(event);
    } catch (error) {
        return { ok: false, reason: error.message };
    }
    if (event.kind !== 27235) {
        return { ok: false, reason: 'Auth event must be kind 27235' };
    }
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - event.created_at) > 60) {
        return { ok: false, reason: 'Auth event timestamp out of range' };
    }
    const method = (event.tags.find(t => t[0] === 'method')?.[1] || '').toUpperCase();
    if (method !== 'GET') {
        return { ok: false, reason: 'Auth event method must be GET' };
    }
    if (!event.tags.find(t => t[0] === 'u')?.[1]) {
        return { ok: false, reason: 'Auth event missing u tag' };
    }
    if (wsSeenAuthEvents.has(event.id)) {
        return { ok: false, reason: 'Auth event already used' };
    }
    wsSeenAuthEvents.set(event.id, Date.now() + 120000);
    return { ok: true, pubkey: event.pubkey.toLowerCase() };
}

const wsAuthSweep = setInterval(() => {
    const now = Date.now();
    for (const [id, expiry] of wsSeenAuthEvents) {
        if (expiry < now) {
            wsSeenAuthEvents.delete(id);
        }
    }
}, 60000);
wsAuthSweep.unref();

function validLatLon(lat, lon) {
    return Number.isFinite(lat) && lat >= -90 && lat <= 90
        && Number.isFinite(lon) && lon >= -180 && lon <= 180;
}

/** Is this pubkey a participant on the ride (task record or Flow-A session)? */
function wsMayAccessRide(pubkey, rideId) {
    if (!pubkey || !rideId) {
        return false;
    }
    const ride = rideManager.getRide(rideId);
    if (ride) {
        const hexes = [
            ride.requester?.pubkey, ride.provider?.pubkey,
            ride.rider?.pubkey, ride.driver?.pubkey
        ].filter(Boolean).map(x => x.toLowerCase());
        if (hexes.includes(pubkey)) {
            return true;
        }
        try {
            const npub = nip19.npubEncode(pubkey).toLowerCase();
            const npubs = [
                ride.requester?.npub, ride.provider?.npub,
                ride.rider?.npub, ride.driver?.npub
            ].filter(Boolean).map(x => x.toLowerCase());
            if (npubs.includes(npub)) {
                return true;
            }
        } catch (error) {
            // fall through
        }
    }
    const session = activeRides.get(rideId);
    if (session) {
        const ids = [session.riderId, session.driverId].filter(Boolean).map(x => x.toLowerCase());
        if (ids.includes(pubkey)) {
            return true;
        }
    }
    return false;
}

if (wss) {
    wss.on('connection', (ws) => {
        ws.isAlive = true;
        ws.authedPubkey = null;

        // When auth is enforced, unauthenticated sockets get one action:
        // send a valid auth frame. Everything else is rejected.
        const requireAuth = () => {
            if (!nip98Enabled || ws.authedPubkey) {
                return true;
            }
            ws.send(JSON.stringify({ type: 'error', error: 'auth_required' }));
            return false;
        };

        ws.on('pong', () => {
            ws.isAlive = true;
        });

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);

                switch (data.type) {
                    case 'auth': {
                        const result = validateWsAuthEvent(data.event || {});
                        if (!result.ok) {
                            ws.send(JSON.stringify({ type: 'error', error: 'auth_failed', details: result.reason }));
                            break;
                        }
                        ws.authedPubkey = result.pubkey;
                        ws.send(JSON.stringify({ type: 'auth_ok', pubkey: result.pubkey }));
                        break;
                    }

                    case 'subscribe_ride': {
                        if (!requireAuth()) break;
                        // Verify participation whenever there is an identity
                        // to verify — a client that authenticated voluntarily
                        // gets checked even if the global toggle is off.
                        if ((nip98Enabled || ws.authedPubkey)
                            && !wsMayAccessRide(ws.authedPubkey, data.rideId)) {
                            ws.send(JSON.stringify({ type: 'error', error: 'forbidden', details: 'Not a participant on this ride' }));
                            break;
                        }
                        ws.rideId = data.rideId;
                        ws.clientType = 'rider';
                        break;
                    }

                    case 'register_driver': {
                        if (!requireAuth()) break;
                        // With auth on, identity comes from the verified key —
                        // a client cannot register presence as someone else.
                        const pubkey = nip98Enabled ? ws.authedPubkey : ((data.pubkey || '').toLowerCase() || null);
                        let npub = null;
                        try {
                            npub = pubkey ? nip19.npubEncode(pubkey) : (data.npub || null);
                        } catch (error) {
                            npub = data.npub || null;
                        }
                        if (nip98Enabled && data.pubkey && (data.pubkey || '').toLowerCase() !== ws.authedPubkey) {
                            ws.send(JSON.stringify({ type: 'error', error: 'forbidden', details: 'pubkey does not match authenticated key' }));
                            break;
                        }
                        const location = data.location && validLatLon(data.location.lat, data.location.lon)
                            ? { lat: data.location.lat, lon: data.location.lon }
                            : null;
                        const credentials = OPERATOR_DATA_MODE === 'blind'
                            ? []
                            : sanitiseCredentials(data.credentials, domainProfile);
                        const admission = evaluateDriverAdmission(operatorPolicy, {
                            pubkey,
                            npub,
                            credentials,
                            requiredCredentials: requiredCredentialIds(domainProfile)
                        });
                        if (!admission.allowed) {
                            ws.send(JSON.stringify({
                                type: 'error',
                                error: 'operator_admission_denied',
                                details: admission.missingAllowlist
                                    ? 'This driver identity is not on this operator\'s roster.'
                                    : 'This operator requires current credential declarations.',
                                missing: admission.missingCredentials
                            }));
                            break;
                        }
                        ws.driverNpub = npub;
                        ws.driverPubkey = pubkey;
                        ws.clientType = 'driver';
                        // Driver-declared working areas (geohash cells) —
                        // omitted keeps any stored areas, [] clears them
                        updateDriverPresence({
                            npub, pubkey, location,
                            areas: sanitiseWorkingAreas(data.areas),
                            // Self-declared, for women-only matching
                            gender: data.gender,
                            womenOnly: data.women_only,
                            accessFeatures: sanitiseAccessNeeds(data.access_features, domainProfile),
                            // Vehicle classes this driver can serve
                            serviceOptions: sanitiseServiceOptions(data.service_options),
                            credentials
                        });
                        sendPendingRideRequests(ws);
                        break;
                    }

                    case 'driver_location': {
                        if (!requireAuth()) break;
                        const pubkey = nip98Enabled ? ws.authedPubkey : ((data.pubkey || ws.driverPubkey || '').toLowerCase() || null);
                        const rawLocation = data.location
                            || (Number.isFinite(data.lat) ? { lat: data.lat, lon: data.lon } : null);
                        const location = rawLocation && validLatLon(rawLocation.lat, rawLocation.lon)
                            ? { lat: rawLocation.lat, lon: rawLocation.lon }
                            : null;
                        updateDriverPresence({
                            npub: nip98Enabled ? ws.driverNpub : (data.npub || ws.driverNpub),
                            pubkey,
                            location,
                            gender: data.gender,
                            womenOnly: data.women_only,
                            accessFeatures: sanitiseAccessNeeds(data.access_features, domainProfile)
                        });
                        break;
                    }

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
                console.error('WebSocket message error:', error.message);
            }
        });

        ws.on('close', () => {});
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
if (interval && interval.unref) {
    interval.unref();
}

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
// How far a rider may move the pickup after a provider has committed —
// a walk to a legal kerb, not a different job.
const PICKUP_ADJUST_MAX_KM = parseFloat(process.env.PICKUP_ADJUST_MAX_KM) || 1;
// "Black gate, side entrance" — meeting instructions, not an essay
const PICKUP_NOTE_MAX_CHARS = 140;
// "Manchester Piccadilly, Piccadilly Station, M1 2DT" — a searched address,
// generous enough for a long one but not a place to smuggle a payload.
const ADDRESS_MAX_CHARS = 200;
// Favourite providers: how long they get the job to themselves before it
// opens to everyone, and how many a rider may name.
const FAVOURITE_HEAD_START_MS = parseInt(process.env.FAVOURITE_HEAD_START_MS || '45000', 10);
const MAX_PREFERRED_PROVIDERS = 10;
// Free waiting after the provider arrives; beyond it, the agreed fare
// grows by the rate card's per-minute rate. Set 0 to charge from arrival,
// or a huge number to disable waiting time entirely.
const FREE_WAITING_MINUTES = process.env.FREE_WAITING_MINUTES != null
    ? parseFloat(process.env.FREE_WAITING_MINUTES)
    : 3;
// STRICT_DISPATCH=true excludes drivers with no known location from dispatch
const strictDispatch = (process.env.STRICT_DISPATCH || '').toLowerCase() === 'true';
// An immediate request nobody accepts must not sit in `requested` for ever.
// It is re-offered on a widening radius, then closed honestly so the rider
// is told "nobody is available" instead of being left watching a spinner.
const REQUEST_RETRY_MS = parseInt(process.env.REQUEST_RETRY_MS || '30000', 10);
const REQUEST_EXPIRE_MS = parseInt(process.env.REQUEST_EXPIRE_MS || String(5 * 60 * 1000), 10);
// Ceiling for the widening search. Beyond this the answer is genuinely "no".
const DISPATCH_RADIUS_MAX_KM = parseFloat(
    process.env.DISPATCH_RADIUS_MAX_KM || String(DISPATCH_RADIUS_KM * 2)
);
// How long after matching a party may change their mind with nothing
// recorded against them. Beyond it, the OTHER party is told they may report
// a late cancellation — reputational only; the operator holds no money and
// levies no fee.
const CANCEL_GRACE_MS = parseInt(process.env.CANCEL_GRACE_MS || '120000', 10);

/**
 * Why a task was cancelled, as a fixed vocabulary rather than free text.
 *
 * "Requester cancelled" told nobody anything: someone whose provider never
 * moved and someone who simply changed their mind produced identical
 * records, so neither the counterparty nor the reputation layer could tell
 * them apart. The code travels on the cancel frame and in the response;
 * the operator asserts nothing about it and levies nothing for it. Free
 * text is still accepted alongside, and is still participant-gated.
 */
const CANCELLATION_REASONS = {
    requester: [
        'changed_plans',
        'provider_not_moving',
        'wait_too_long',
        'wrong_details',
        'found_another_way',
        'no_show',
        'safety',
        'other'
    ],
    provider: [
        'too_far',
        'requester_not_here',
        'wait_too_long',
        'wrong_details',
        'vehicle_problem',
        'unsafe',
        'no_show',
        'other'
    ]
};

/** A cancellation code the cancelling side is actually allowed to give */
function sanitiseCancellationReason(code, side) {
    if (typeof code !== 'string') {
        return null;
    }
    const wanted = code.trim().toLowerCase();
    return (CANCELLATION_REASONS[side] || []).includes(wanted) ? wanted : null;
}

/** Plain-English gloss for push copy; clients translate the code themselves */
const CANCELLATION_REASON_TEXT = {
    changed_plans: 'plans changed',
    provider_not_moving: 'nobody was coming',
    wait_too_long: 'the wait was too long',
    wrong_details: 'the details were wrong',
    found_another_way: 'another way was found',
    no_show: 'nobody showed up',
    safety: 'a safety concern',
    too_far: 'the pickup was too far',
    requester_not_here: 'nobody was at the pickup',
    vehicle_problem: 'a vehicle problem',
    unsafe: 'a safety concern',
    other: null
};

// Scheduled rides: a request carrying scheduled_for is stored (and browsable
// on the open list, so drivers can pre-book) but only enters live dispatch —
// WS broadcast + web push — inside the lead window before the pickup time.
const SCHEDULE_DISPATCH_LEAD_MS = parseInt(process.env.SCHEDULE_DISPATCH_LEAD_MS || String(15 * 60 * 1000), 10);
const SCHEDULE_MAX_ADVANCE_MS = parseInt(process.env.SCHEDULE_MAX_ADVANCE_MS || String(30 * 24 * 3600 * 1000), 10);
const SCHEDULE_EXPIRE_GRACE_MS = parseInt(process.env.SCHEDULE_EXPIRE_GRACE_MS || String(60 * 60 * 1000), 10);
const SCHEDULE_SWEEP_MS = parseInt(process.env.SCHEDULE_SWEEP_MS || '30000', 10);

// Driver-declared working areas: geohash cells (precision 1-9), capped so a
// hostile registration cannot balloon presence memory.
const MAX_WORKING_AREAS = 64;
const GEOHASH_CELL = /^[0123456789bcdefghjkmnpqrstuvwxyz]{1,9}$/;

/**
 * Validate driver-supplied working areas. Returns a deduped, lowercased
 * array of geohash cells; null when the input is not a list at all
 * (callers treat null as "leave the stored areas unchanged").
 */
function sanitiseWorkingAreas(raw) {
    if (!Array.isArray(raw)) {
        return null;
    }
    const cells = [];
    for (const value of raw) {
        if (typeof value !== 'string') {
            continue;
        }
        const cell = value.trim().toLowerCase();
        if (GEOHASH_CELL.test(cell) && !cells.includes(cell)) {
            cells.push(cell);
            if (cells.length >= MAX_WORKING_AREAS) {
                break;
            }
        }
    }
    return cells;
}

/**
 * Progressive location disclosure: pre-accept payloads (dispatch
 * broadcasts, pending replays, the open-jobs list) carry only an
 * APPROXIMATE location — rounded to ~1 km — and no route geometry.
 * Exact coordinates are revealed only to the driver who accepts (the
 * participant-gated ride detail). Someone scraping open jobs learns the
 * neighbourhood, never the doorstep.
 */
function approximateLocation(loc) {
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) {
        return null;
    }
    return {
        lat: Math.round(loc.lat * 100) / 100,
        lon: Math.round(loc.lon * 100) / 100,
        approximate: true
    };
}

/** Is this origin inside any of the given working-area cells? */
function originInAreas(origin, areas) {
    const hash = encodeGeohash(origin.lat, origin.lon, 9);
    return areas.some((cell) => hash.startsWith(cell));
}

/**
 * Service classes a provider can actually serve. A driver who declares
 * nothing serves the default class only — so an XL request never lands
 * with a hatchback (fail closed for the request side, as with
 * women-only). Unknown ids are dropped rather than trusted.
 */
function sanitiseServiceOptions(raw, profile = domainProfile) {
    if (!Array.isArray(raw)) {
        return null;
    }
    const known = new Set((profile.serviceOptions || []).map((o) => o.id));
    const ids = [];
    for (const value of raw) {
        if (typeof value !== 'string') {
            continue;
        }
        const id = value.trim().toLowerCase();
        if (known.has(id) && !ids.includes(id)) {
            ids.push(id);
        }
    }
    return ids;
}

/** The class a task is asking for; null when the domain has no classes */
function resolveServiceOption(requested, profile) {
    const options = profile.serviceOptions || [];
    if (options.length === 0) {
        return null;
    }
    const found = typeof requested === 'string'
        ? options.find((o) => o.id === requested.trim().toLowerCase())
        : null;
    return found || options[0];
}

// ==========================================
// PROVIDER CREDENTIALS
//
// A private hire licence, hire-and-reward insurance, an SIA badge. The
// domain profile says what exists; the provider says what they hold; the
// requester sees it before they get in the car. Three rules follow from
// the rest of the architecture:
//
//   1. SELF-ATTESTED, AND SAID SO. The operator does not verify these and
//      never claims to, exactly as it never asserts a rating. The client
//      copy says "declared", not "verified".
//   2. EXPIRY IS PART OF THE CLAIM. A licence that ran out in March is not
//      a licence, so an expired declaration is dropped rather than shown.
//   3. NOT A GATE BY DEFAULT. OPERATOR_ADMISSION_MODE=credentials (or the
//      combined roster mode) makes required credentials fail closed. An
//      open operator and a fleet operator run the same code with different
//      policy, and the client reads that policy before a shift.
// ==========================================

const operatorPolicy = createOperatorPolicy(process.env);
const ENFORCE_CREDENTIALS = admissionNeedsCredentials(operatorPolicy);
if (operatorPolicy.admissionMode !== 'open' && !nip98Enabled) {
    throw new Error(
        'Non-open OPERATOR_ADMISSION_MODE requires ENABLE_NIP98_AUTH=true; an unsigned driver identity can be spoofed'
    );
}
const MAX_CREDENTIAL_REF_CHARS = 60;

/**
 * Normalise a provider's declared credentials against a domain profile.
 * Unknown ids and expired claims are dropped — an expired licence is not
 * a licence, and pretending otherwise is the whole failure mode here.
 */
function sanitiseCredentials(raw, profile) {
    const known = new Map(
        ((profile || domainProfile).credentials || []).map((c) => [c.id, c])
    );
    if (!Array.isArray(raw) || known.size === 0) {
        return [];
    }
    const now = Date.now();
    const seen = new Set();
    const out = [];
    for (const entry of raw) {
        const id = typeof entry?.id === 'string' ? entry.id.trim().toLowerCase() : null;
        if (!id || !known.has(id) || seen.has(id)) {
            continue;
        }
        const expiresAt = entry?.expiresAt != null ? Number(entry.expiresAt) : null;
        if (expiresAt != null) {
            if (!Number.isFinite(expiresAt) || expiresAt <= now) {
                continue; // expired, or unreadable — not a claim we will carry
            }
        }
        seen.add(id);
        out.push({
            id,
            ...(expiresAt != null ? { expiresAt } : {}),
            // A licence number is on the plate of the car anyway, but it is
            // still participant-gated: in memory, never broadcast, never
            // snapshotted to a relay.
            ...(typeof entry?.reference === 'string' && entry.reference.trim()
                ? { reference: entry.reference.trim().slice(0, MAX_CREDENTIAL_REF_CHARS) }
                : {})
        });
    }
    return out;
}

/** Credential ids this domain says a provider must hold */
function requiredCredentialIds(profile) {
    return ((profile || domainProfile).credentials || [])
        .filter((c) => c.required === true)
        .map((c) => c.id);
}

/** Can this provider serve the class this task asked for? */
function optionEligible(entry, ride) {
    const wanted = ride?.option;
    if (!wanted) {
        return true;
    }
    const profile = rideManager.getProfileForRide(ride.id) || domainProfile;
    const options = profile.serviceOptions || [];
    const defaultId = options.length > 0 ? options[0].id : null;
    if (wanted === defaultId) {
        return true;
    }
    // Anything beyond the default class must be explicitly declared
    const declared = entry?.serviceOptions;
    return Array.isArray(declared) && declared.includes(wanted);
}

// ==========================================
// DEMAND PRICING ("surge")
//
// The ridesharing profile has always declared `distance_time_surge`, but no
// multiplier existed anywhere — the model was a claim the code did not make
// good on. This implements it, with three constraints that follow from the
// rest of the architecture:
//
//   1. OFF BY DEFAULT. Turning demand pricing on for every existing operator
//      would silently raise fares. It is opt-in (SURGE_ENABLED=true).
//   2. DISCLOSED BEFORE COMMITTING. The multiplier and the reason travel in
//      the estimate, so the rider sees it on the confirm screen and not on
//      the receipt. The quote is still exactly what the ride records.
//   3. THE UPLIFT IS THE DRIVER'S. A non-custodial operator takes no cut of
//      a fare it never holds, so demand pricing here pulls drivers toward
//      demand rather than pulling a margin out of riders.
// ==========================================

const SURGE_ENABLED = (process.env.SURGE_ENABLED || '').toLowerCase() === 'true';
/** Ceiling. Uncapped surge is how a ride home after a concert costs £200. */
const SURGE_MAX = Math.max(1, parseFloat(process.env.SURGE_MAX || '2'));
/** Radius over which supply and demand are compared */
const SURGE_RADIUS_KM = parseFloat(process.env.SURGE_RADIUS_KM || '5');
/** Below this many waiting requests, never surge — small numbers are noise */
const SURGE_MIN_DEMAND = parseInt(process.env.SURGE_MIN_DEMAND || '3', 10);

/** Available providers within SURGE_RADIUS_KM of a point, right now */
function supplyNear(origin) {
    const now = Date.now();
    let count = 0;
    for (const [, entry] of driverPresence) {
        if ((now - entry.lastSeen) > DRIVER_PRESENCE_TTL_MS) continue;
        if (!entry.location) continue;
        if (calculateDistance(
            entry.location.lat, entry.location.lon, origin.lat, origin.lon
        ) <= SURGE_RADIUS_KM) count++;
    }
    return count;
}

/** Unmatched requests within SURGE_RADIUS_KM of a point, right now */
function demandNear(origin) {
    let count = 0;
    for (const ride of rideManager.getActiveRides()) {
        if (ride.driver || ride.provider) continue;
        if (ride.scheduledFor) continue; // pre-booked demand is not now
        const pickup = ride.pickup;
        if (!pickup || !Number.isFinite(pickup.lat)) continue;
        if (calculateDistance(
            pickup.lat, pickup.lon, origin.lat, origin.lon
        ) <= SURGE_RADIUS_KM) count++;
    }
    return count;
}

/**
 * The demand multiplier for a pickup, and an honest reason for it.
 *
 * Stepped to 0.1 rather than continuous: a number that twitches between
 * quotes reads as a machine haggling with you. Always returns a shape, so
 * callers never branch on whether the feature is on.
 */
function surgeFor(origin) {
    const off = { multiplier: 1, enabled: SURGE_ENABLED, waiting: 0, available: 0 };
    if (!SURGE_ENABLED || !origin || !Number.isFinite(origin.lat)) return off;

    const waiting = demandNear(origin);
    const available = supplyNear(origin);
    if (waiting < SURGE_MIN_DEMAND) return { ...off, waiting, available };

    // No providers at all is not infinite demand — it is a search that will
    // fail, and pricing it at the ceiling would be charging for absence.
    if (available === 0) return { ...off, waiting, available };

    const raw = waiting / available;
    if (raw <= 1) return { ...off, waiting, available };

    const multiplier = Math.min(SURGE_MAX, Math.round(raw * 10) / 10);
    return {
        multiplier,
        enabled: true,
        waiting,
        available,
        reason: 'high_demand'
    };
}

/** Access-need ids this domain recognises */
function accessOptionIds(profile) {
    return new Set((profile?.accessOptions || []).map((o) => o.id));
}

/**
 * Normalise a list of access-need ids against the domain's own catalogue.
 * Unknown ids are dropped rather than rejected: a newer client asking for
 * something this operator does not model should still get a ride.
 */
function sanitiseAccessNeeds(value, profile) {
    if (!Array.isArray(value)) return [];
    const known = accessOptionIds(profile);
    const seen = new Set();
    for (const raw of value) {
        if (typeof raw === 'string' && known.has(raw)) seen.add(raw);
        if (seen.size >= 6) break;
    }
    return [...seen];
}

/**
 * Access needs: does this provider meet EVERY need the request carries?
 *
 * Fail closed, exactly like women-only. A provider who has not declared a
 * feature never sees, and can never accept, a job that needs it. The cost
 * of the alternative is not a mismatched ride — it is a wheelchair user
 * watching a car they cannot board drive away, which is the outcome this
 * whole mechanism exists to prevent.
 *
 * Requests with no access needs are unaffected and carry no such data.
 */
function accessEligible(entry, ride) {
    const needs = ride?.accessNeeds;
    if (!Array.isArray(needs) || needs.length === 0) return true;
    const declared = entry?.accessFeatures;
    if (!Array.isArray(declared) || declared.length === 0) return false;
    return needs.every((need) => declared.includes(need));
}

/**
 * Favourite providers get a head start.
 *
 * The rider's list lives on their device; it reaches the operator only
 * as part of a request they chose to make, stays in memory for that
 * request alone, and is never snapshotted to relays. During the window
 * the job is invisible and unacceptable to everyone else — a head start
 * that other drivers can simply out-tap is not a head start.
 */
function inFavouriteWindow(ride) {
    return Boolean(
        ride?.preferredProviders?.length
        && ride.preferredUntil
        && Date.now() < ride.preferredUntil
        && !(ride.driver || ride.provider)
    );
}

function isPreferredProvider(ride, pubkey) {
    const key = (pubkey || '').toLowerCase();
    return Boolean(key && ride?.preferredProviders?.includes(key));
}

/** May this provider see/take this job right now? */
function favouriteEligible(entry, ride) {
    if (!inFavouriteWindow(ride)) {
        return true;
    }
    return isPreferredProvider(ride, entry?.pubkey || entry?.driverPubkey);
}

/**
 * Self-declared gender for women-only matching. TROTT is pseudonymous:
 * this is attestation, not verification, and the UI says so honestly.
 * Only 'woman' has matching semantics; anything else normalises to null.
 */
function sanitiseGender(value) {
    return value === 'woman' || value === 'man' ? value : null;
}

/**
 * Women-only pairing (both directions, Bolt W4W-style):
 * - a women-only request reaches only drivers who declared woman — fail
 *   closed: a driver with no presence/gender never sees it;
 * - a driver who set women_only receives only women-only requests.
 * Ordinary requests carry no gender information at all.
 */
function genderEligible(entry, ride) {
    if (ride?.womenOnly && entry?.gender !== 'woman') return false;
    if (entry?.womenOnly && !ride?.womenOnly) return false;
    return true;
}

// key: npub or pubkey (lowercase) →
//   { npub, pubkey, location: {lat, lon}, areas: [geohash]|null,
//     gender: 'woman'|'man'|null, womenOnly: bool, lastSeen }
const driverPresence = new Map();

// Evict entries that stopped heart-beating — without this the map grows
// forever and (pre-auth) was attacker-inflatable.
const presenceSweep = setInterval(() => {
    const cutoff = Date.now() - (DRIVER_PRESENCE_TTL_MS * 5);
    for (const [key, entry] of driverPresence) {
        if ((entry.lastSeen || 0) < cutoff) {
            driverPresence.delete(key);
        }
    }
}, 60000);
presenceSweep.unref();

function updateDriverPresence({ npub, pubkey, location, areas, gender, womenOnly, serviceOptions, accessFeatures, credentials }) {
    const key = (npub || pubkey || '').toLowerCase();
    if (!key) {
        return null;
    }
    const existing = driverPresence.get(key) || {};
    let storedLocation = location && Number.isFinite(location.lat) && Number.isFinite(location.lon)
        ? { lat: location.lat, lon: location.lon }
        : null;
    if (storedLocation && OPERATOR_DATA_MODE === 'blind') {
        const cell = encodeGeohash(
            storedLocation.lat, storedLocation.lon, PRIVATE_LOCATION_PRECISION
        );
        const centre = decodeGeohash(cell);
        storedLocation = { lat: centre.lat, lon: centre.lon };
    }
    const privateCoordinator = OPERATOR_DATA_MODE === 'blind';
    const entry = {
        npub: npub || existing.npub || null,
        pubkey: (pubkey || existing.pubkey || null),
        // Service classes this vehicle can serve; undefined keeps the
        // stored list, [] means default class only
        serviceOptions: Array.isArray(serviceOptions)
            ? serviceOptions
            : existing.serviceOptions || null,
        location: storedLocation || existing.location || null,
        // null/undefined keeps the stored areas; [] clears them (back to radius)
        areas: Array.isArray(areas) ? areas : existing.areas || null,
        // undefined keeps the stored declaration; an explicit value replaces it
        gender: privateCoordinator
            ? null
            : (gender !== undefined ? sanitiseGender(gender) : existing.gender || null),
        womenOnly: privateCoordinator
            ? false
            : (womenOnly !== undefined ? womenOnly === true : existing.womenOnly || false),
        // What this vehicle/driver can actually accommodate. Undeclared is
        // the safe default: they simply never see jobs that need it.
        accessFeatures: privateCoordinator ? [] : Array.isArray(accessFeatures)
            ? accessFeatures : (existing.accessFeatures || []),
        // Sanitised declarations are retained only in live memory, so an
        // operator can apply its admission rule on reconnect and accept.
        credentials: privateCoordinator ? [] : Array.isArray(credentials)
            ? credentials : (existing.credentials || []),
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
 * Drivers with declared working areas get a geohash cell-membership check
 * (wherever they currently are); drivers with a fresh location get a
 * haversine radius check; drivers with neither are included unless
 * STRICT_DISPATCH=true.
 */
/**
 * How close to their drop-off a provider must be before the next job is
 * offered against where they are ABOUT to be rather than where they are.
 */
const BACK_TO_BACK_LEAD_KM = parseFloat(process.env.BACK_TO_BACK_LEAD_KM || '3');

/**
 * Where each busy provider's current job ends, keyed by pubkey.
 *
 * Rebuilt on demand with a short TTL: dispatch asks this once per waiting
 * request per driver, and a stale answer would offer somebody a job from
 * a destination they have already left.
 */
let _finishingCache = { at: 0, map: null };
function finishingProviders() {
    if (_finishingCache.map && Date.now() - _finishingCache.at < 1000) {
        return _finishingCache.map;
    }
    const map = new Map();
    for (const ride of rideManager.getActiveRides()) {
        const provider = ride.provider || ride.driver;
        const pubkey = (provider?.pubkey || '').toLowerCase();
        if (!pubkey || !ride.dropoff) {
            continue;
        }
        const profile = rideManager.getProfileForRide(ride.id);
        if (ride.status !== profile.states.values.ACTIVE) {
            continue;
        }
        map.set(pubkey, { rideId: ride.id, dropoff: ride.dropoff });
        if (provider.npub) {
            map.set(provider.npub.toLowerCase(), { rideId: ride.id, dropoff: ride.dropoff });
        }
    }
    _finishingCache = { at: Date.now(), map };
    return map;
}

/**
 * The point a provider should be judged against for the NEXT job.
 *
 * A driver ten minutes from their drop-off is invisible to every request
 * around that drop-off, so they finish a trip into an empty screen and
 * drive back across town. If they are on an active job and already close
 * to the end of it, dispatch also considers where that job ends. Never a
 * replacement for their real position — an addition to it.
 */
function finishingNear(driverIdentifier, currentLocation) {
    const key = (driverIdentifier || '').toLowerCase();
    const entry = finishingProviders().get(key);
    if (!entry || !currentLocation) {
        return null;
    }
    const remainingKm = calculateDistance(
        currentLocation.lat, currentLocation.lon,
        entry.dropoff.lat, entry.dropoff.lon
    );
    return remainingKm <= BACK_TO_BACK_LEAD_KM ? entry.dropoff : null;
}

function driverInRange(driverIdentifier, origin, radiusKm = DISPATCH_RADIUS_KM) {
    if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lon)) {
        return true;
    }
    const presence = getDriverPresence(driverIdentifier);
    if (presence && Array.isArray(presence.areas) && presence.areas.length > 0) {
        return originInAreas(origin, presence.areas);
    }
    if (!presence || !presence.location) {
        return !strictDispatch;
    }
    const distanceKm = calculateDistance(
        presence.location.lat, presence.location.lon,
        origin.lat, origin.lon
    );
    if (distanceKm <= radiusKm) {
        return true;
    }
    // Nearly done with the current job: judge them from where it ends
    const finishing = finishingNear(driverIdentifier, presence.location);
    if (finishing) {
        return calculateDistance(
            finishing.lat, finishing.lon, origin.lat, origin.lon
        ) <= radiusKm;
    }
    return false;
}

/** The radius a request is currently reaching out to. Grows as a request
 *  goes unanswered (see the retry sweep) — a job nobody nearby wants is
 *  better offered to someone further out than left to rot. */
function rideRadiusKm(ride) {
    const r = ride && Number(ride.dispatchRadiusKm);
    return Number.isFinite(r) && r > 0 ? r : DISPATCH_RADIUS_KM;
}

// ==========================================
// WEB PUSH JOB ALERTS (VAPID, no Firebase)
// A WS frame only reaches an open socket; a backgrounded driver app gets
// a Web Push instead. Payloads are E2E encrypted to the device (RFC 8291)
// and carry no rider identity or exact coordinates.
// ==========================================

pushService.init();

/** Drivers with an open, registered dispatch socket right now */
function connectedDriverPubkeys() {
    const connected = new Set();
    if (wss) {
        wss.clients.forEach((client) => {
            if (client.clientType === 'driver' && client.readyState === WebSocket.OPEN
                && client.driverPubkey) {
                connected.add(client.driverPubkey.toLowerCase());
            }
        });
    }
    return connected;
}

/** driverInRange semantics, but against the push store's own snapshot —
 *  a backgrounded driver's live presence has typically expired */
function pushEligible(entry, origin, radiusKm = DISPATCH_RADIUS_KM) {
    if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lon)) {
        return true;
    }
    if (Array.isArray(entry.areas) && entry.areas.length > 0) {
        return originInAreas(origin, entry.areas);
    }
    if (!entry.location || !validLatLon(entry.location.lat, entry.location.lon)) {
        return !strictDispatch;
    }
    return calculateDistance(
        entry.location.lat, entry.location.lon,
        origin.lat, origin.lon
    ) <= radiusKm;
}

/** Push a new-job alert to every eligible subscribed driver whose app is
 *  not currently connected over WS (those already got the live frame). */
function pushRideRequestToOfflineDrivers(ride, estimate) {
    const connected = connectedDriverPubkeys();
    const noun = rideManager.getProfileForRide(ride.id)?.labels?.taskNoun || 'job';
    const fareText = estimate?.fare?.formatted || null;
    const payload = {
        title: `New ${noun} nearby`,
        body: fareText
            ? `${fareText} — open DonkeyRide to view and accept`
            : 'Open DonkeyRide to view and accept',
        tag: `ride-${ride.id}`,
        url: '/provide'
    };
    let count = 0;
    for (const entry of pushService.listSubscriptions()) {
        // Riders subscribe to the same service for their own alerts —
        // they must never be offered a job
        if (entry.role === 'requester') {
            continue;
        }
        if (connected.has(entry.pubkey)) {
            continue;
        }
        if (!pushEligible(entry, ride.pickup, rideRadiusKm(ride))) {
            continue;
        }
        if (!genderEligible(entry, ride)) {
            continue;
        }
        if (!accessEligible(entry, ride)) {
            continue;
        }
        if (!optionEligible(entry, ride)) {
            continue;
        }
        if (!favouriteEligible(entry, ride)) {
            continue;
        }
        void pushService.sendTo(entry.pubkey, payload);
        count++;
    }
    return count;
}

/** "Blue Toyota Corolla (AB12 CDE)" — for alerts, never for relays */
function describeVehicleText(vehicle) {
    if (!vehicle || typeof vehicle !== 'object') {
        return null;
    }
    const car = [vehicle.colour, vehicle.make, vehicle.model].filter(Boolean).join(' ');
    const reg = vehicle.registration ? ` (${vehicle.registration})` : '';
    return car ? `${car}${reg}` : (vehicle.registration || null);
}

/** Is this participant watching the ride right now (socket open)? */
function participantSocketOpen(rideId, pubkey) {
    if (!wss || !pubkey) {
        return false;
    }
    for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN
            && client.rideId === rideId
            && client.authedPubkey === pubkey.toLowerCase()) {
            return true;
        }
    }
    return false;
}

/**
 * Alert a participant whose app is not on screen.
 *
 * The WS frame only reaches an open socket, so without this the rider
 * learns their car arrived by unlocking the phone and looking — the one
 * thing every commercial app gets right. Payload is E2E encrypted to the
 * device (RFC 8291) and carries no counterparty identity or exact
 * coordinates.
 */
function pushToParticipant(ride, identity, { title, body, url, tag }) {
    const pubkey = (identity?.pubkey || '').toLowerCase();
    if (!pubkey || participantSocketOpen(ride.id, pubkey)) {
        return false;
    }
    void pushService.sendTo(pubkey, {
        title,
        body,
        tag: tag || `ride-${ride.id}`,
        url: url || '/request/active'
    });
    return true;
}

// Broadcast to drivers, geo-filtered by origin when provided. `constraints`
// (a ride, or {womenOnly}) additionally applies women-only pairing.
function broadcastToDrivers(message, origin = null, constraints = null) {
    if (!wss) {
        return 0;
    }
    let count = 0;
    wss.clients.forEach(client => {
        if (client.clientType === 'driver' && client.readyState === WebSocket.OPEN) {
            const identifier = client.driverNpub || client.driverPubkey;
            if (!driverInRange(identifier, origin, rideRadiusKm(constraints))) {
                return;
            }
            if (constraints) {
                const presence = getDriverPresence(identifier);
                if (!genderEligible(presence, constraints)) {
                    return;
                }
                if (!accessEligible(presence, constraints)) {
                    return;
                }
                if (!optionEligible(presence, constraints)) {
                    return;
                }
                if (!favouriteEligible(
                    presence || { pubkey: client.driverPubkey }, constraints
                )) {
                    return;
                }
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
        const presence = getDriverPresence(ws.driverNpub || ws.driverPubkey);
        if (!genderEligible(presence, ride)) {
            return;
        }
        if (!accessEligible(presence, ride)) {
            return;
        }
        if (!optionEligible(presence, ride)) {
            return;
        }
        if (!favouriteEligible(presence || { pubkey: ws.driverPubkey }, ride)) {
            return;
        }
        // Pre-booked rides outside the lead window are browsable on the open
        // list but not replayed as live jobs
        if (ride.scheduledFor && ride.scheduledFor - Date.now() > SCHEDULE_DISPATCH_LEAD_MS) {
            return;
        }
        const session = activeRides.get(ride.id) || {};
        const estimate = session.estimate || ride.estimate || null;
        const distanceKm = typeof estimate?.distance?.km === 'number'
            ? estimate.distance.km
            : null;
        const payload = {
            type: 'ride_request',
            ride: {
                id: ride.id,
                // Approximate pre-accept — see approximateLocation
                pickup: approximateLocation(ride.pickup),
                dropoff: approximateLocation(ride.dropoff),
                stopCount: ride.stopCount ?? (ride.stops ? ride.stops.length : 0),
                fare: ride.fare,
                settlementMode: ride.settlementMode || 'priced',
                locationMode: ride.locationMode || 'operator_memory',
                distance: distanceKm,
                estimatedFare: estimate,
                currency: ride.currency || session.currency || 'GBP',
                scheduledFor: ride.scheduledFor || null,
                womenOnly: ride.womenOnly === true,
                accessNeeds: ride.accessNeeds || [],
                option: ride.option || null
            }
        };

        try {
            ws.send(JSON.stringify(payload));
        } catch (error) {
            console.warn(`Failed to send pending ride ${ride.id} to driver:`, error.message);
        }
    });
}

/** Live-dispatch a pre-booked ride whose lead window has opened — same frame
 *  and push semantics as an immediate request. */
function dispatchScheduledRide(ride) {
    const session = activeRides.get(ride.id) || {};
    const estimate = session.estimate || ride.estimate || null;
    const distanceKm = typeof estimate?.distance?.km === 'number'
        ? estimate.distance.km
        : null;
    const driverCount = broadcastToDrivers({
        type: 'ride_request',
        ride: {
            id: ride.id,
            pickup: approximateLocation(ride.pickup),
            dropoff: approximateLocation(ride.dropoff),
            stopCount: ride.stopCount ?? (ride.stops ? ride.stops.length : 0),
            fare: ride.fare,
            settlementMode: ride.settlementMode || 'priced',
            locationMode: ride.locationMode || 'operator_memory',
            distance: distanceKm,
            estimatedFare: estimate,
            currency: ride.currency || session.currency || 'GBP',
            scheduledFor: ride.scheduledFor || null,
            womenOnly: ride.womenOnly === true,
            accessNeeds: ride.accessNeeds || [],
            option: ride.option || null
            // No requester identity pre-accept. A pubkey is a PERSISTENT
            // identity — broadcasting it to every provider in the dispatch
            // radius lets anyone merely listening tie a person to a pickup
            // time and place, and to their public Nostr profile, without
            // ever committing to the job. The accepting provider gets it
            // from the participant-gated task detail. Keep this in step with
            // sendPendingRideRequests() and GET /api/rides/open.
        }
    }, ride.pickup, ride);
    const pushed = pushRideRequestToOfflineDrivers(ride, estimate);
    return { driverCount, pushed };
}

/**
 * One immediate (not pre-booked) request, one sweep tick.
 *
 * Nobody has taken it yet, so do what a dispatcher does: offer it again, a
 * little further out each time, and when the search is genuinely exhausted
 * say so. The failure mode this replaces is the worst one in the app — the
 * rider watching a "REQUESTED" badge for ever because no driver was in range
 * at the one instant the request was broadcast.
 */
function sweepImmediateRequest(ride, now) {
    const profile = rideManager.getProfileForRide(ride.id);
    if (ride.status !== profile.states.values.REQUESTED) return;
    if (ride.driver || ride.provider) return;
    // A favourite head start is a deliberate silence — don't widen through it
    if (ride.preferredUntil && !ride.preferredExpanded && now < ride.preferredUntil) return;

    const requestedAt = ride.timestamps?.requested || now;
    const waited = now - requestedAt;

    // Search exhausted — close it out and tell the rider why
    if (waited >= REQUEST_EXPIRE_MS) {
        try {
            rideManager.cancelRide(ride.id, 'system', 'no_providers');
            finalizeRideSession(ride.id, 'cancelled');
            const payload = {
                ride_id: ride.id,
                task_id: ride.id,
                reason: 'no_providers',
                cancelled_by: 'system',
                searched_radius_km: rideRadiusKm(ride),
                waited_ms: waited
            };
            broadcastToRide(ride.id, { type: 'ride_cancelled', ...payload });
            broadcastToRide(ride.id, { type: 'task_cancelled', ...payload });
            console.log(`🕓 Request ${ride.id} expired — no provider within ${rideRadiusKm(ride)}km after ${Math.round(waited / 1000)}s`);
        } catch (error) {
            console.warn(`Failed to expire request ${ride.id}:`, error.message);
        }
        return;
    }

    // Not yet time to try again
    const lastTry = ride.lastDispatchAt || requestedAt;
    if (now - lastTry < REQUEST_RETRY_MS) return;

    // Widen and re-offer. Drivers with declared working areas are unaffected
    // by radius, so this only ever reaches further-out radius drivers.
    const previous = rideRadiusKm(ride);
    ride.dispatchRadiusKm = Math.min(DISPATCH_RADIUS_MAX_KM, previous * 1.5);
    ride.lastDispatchAt = now;
    ride.dispatchAttempts = (ride.dispatchAttempts || 0) + 1;

    const { driverCount, pushed } = dispatchScheduledRide(ride);
    // Tell the rider the search is still live and getting wider — silence is
    // what makes a wait feel broken
    broadcastToRide(ride.id, {
        type: 'searching',
        ride_id: ride.id,
        task_id: ride.id,
        attempt: ride.dispatchAttempts,
        radius_km: ride.dispatchRadiusKm,
        providers_notified: driverCount + pushed,
        expires_in_ms: Math.max(0, REQUEST_EXPIRE_MS - waited)
    });
    console.log(`🔎 Request ${ride.id} retry ${ride.dispatchAttempts}: radius ${previous}→${ride.dispatchRadiusKm}km, ${driverCount} live, ${pushed} pushed`);
}

// Scheduled-ride lifecycle. Restart-safe: everything derives from
// task.scheduledFor, which travels in the Nostr snapshot — a rehydrated
// operator picks pre-booked rides straight back up (an already-dispatched
// ride is re-announced after a restart, which is harmless).
const scheduleSweep = setInterval(() => {
    const now = Date.now();
    for (const ride of rideManager.getActiveRides()) {
        // Favourite head start lapsed with nobody committed — open the job
        // to every eligible provider rather than let it sit unseen
        if (ride.preferredUntil && !ride.preferredExpanded
            && now >= ride.preferredUntil
            && !(ride.driver || ride.provider)) {
            ride.preferredExpanded = true;
            const profile = rideManager.getProfileForRide(ride.id);
            if (ride.status === profile.states.values.REQUESTED) {
                const { driverCount, pushed } = dispatchScheduledRide(ride);
                console.log(`⭐ Ride ${ride.id}: favourite window closed — opened to ${driverCount} live, ${pushed} pushed`);
            }
        }

        // Immediate requests: retry on a widening radius, then close.
        // Pre-booked rides have their own (much longer) clock below.
        if (!ride.scheduledFor) {
            sweepImmediateRequest(ride, now);
            continue;
        }
        const profile = rideManager.getProfileForRide(ride.id);
        const requested = ride.status === profile.states.values.REQUESTED;
        // Accept auto-transitions matched → en_route, so a pre-booked ride
        // waits out its lead time in either state
        const accepted = [
            profile.states.values.MATCHED,
            profile.states.values.PROVIDER_EN_ROUTE
        ].includes(ride.status);

        // Nobody accepted and the pickup time is long gone — close it out
        if (requested && now > ride.scheduledFor + SCHEDULE_EXPIRE_GRACE_MS) {
            try {
                rideManager.cancelRide(ride.id, 'system', 'scheduled_expired');
                finalizeRideSession(ride.id, 'cancelled');
                const cancelPayload = {
                    ride_id: ride.id,
                    task_id: ride.id,
                    reason: 'scheduled_expired',
                    cancelled_by: 'system'
                };
                broadcastToRide(ride.id, { type: 'ride_cancelled', ...cancelPayload });
                broadcastToRide(ride.id, { type: 'task_cancelled', ...cancelPayload });
                console.log(`🗓️  Scheduled ride ${ride.id} expired unmatched`);
            } catch (error) {
                console.warn(`Failed to expire scheduled ride ${ride.id}:`, error.message);
            }
            continue;
        }

        // Lead window opened and still unmatched — enter live dispatch
        if (requested && !ride.scheduleDispatched
            && now >= ride.scheduledFor - SCHEDULE_DISPATCH_LEAD_MS) {
            ride.scheduleDispatched = true;
            const { driverCount, pushed } = dispatchScheduledRide(ride);
            console.log(`🗓️  Scheduled ride ${ride.id} entered dispatch: ${driverCount} live, ${pushed} pushed`);
        }

        // Pre-booked and accepted — remind both parties as the time approaches
        if (accepted && !ride.scheduleReminderSent
            && now >= ride.scheduledFor - SCHEDULE_DISPATCH_LEAD_MS) {
            ride.scheduleReminderSent = true;
            broadcastToRide(ride.id, {
                type: 'scheduled_reminder',
                ride_id: ride.id,
                task_id: ride.id,
                scheduled_for: ride.scheduledFor
            });
            // The committed driver may have the app closed — web push reaches them
            const driverKey = (ride.driver?.pubkey || ride.provider?.pubkey || '').toLowerCase();
            if (driverKey && !connectedDriverPubkeys().has(driverKey)) {
                const noun = profile?.labels?.taskNoun || 'job';
                void pushService.sendTo(driverKey, {
                    title: `Upcoming ${noun}`,
                    body: `Your pre-booked ${noun} is at ${new Date(ride.scheduledFor).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
                    tag: `ride-${ride.id}`,
                    url: '/provide'
                });
            }
            console.log(`🗓️  Reminder sent for scheduled ride ${ride.id}`);
        }
    }
}, SCHEDULE_SWEEP_MS);
scheduleSweep.unref();

function finalizeRideSession(rideId, finalStatus) {
    const session = activeRides.get(rideId);
    if (session) {
        if (finalStatus) {
            session.status = finalStatus;
        }
        session.finalizedAt = Date.now();
    }

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
        // How long a provider waits at the pickup before waiting time is
        // added to the agreed fare. The clients show a countdown against
        // this, so it MUST come from the operator rather than a client-side
        // constant — otherwise an operator who changes it shows both parties
        // free minutes that are already chargeable.
        freeWaitingMinutes: FREE_WAITING_MINUTES,
        // The REAL count. `activeRides` is the legacy demo-session Map, which
        // the React apps never populate — so this field read 0 on every
        // operator actually running the product, however busy it was.
        activeRides: rideManager.getActiveRides().length,
        uptime: process.uptime(),
        version: packageVersion,
        nostrRelay: config.nostrRelay,
        // Relay URLs reachable by CLIENTS (the internal NOSTR_RELAY hostname
        // is meaningless outside the Docker network)
        public_relays: config.publicRelays,
        data_handling: {
            mode: OPERATOR_DATA_MODE,
            exact_itinerary: OPERATOR_DATA_MODE === 'blind'
                ? 'participant_encrypted'
                : 'operator_memory',
            storage: taskStore?.backend || 'memory',
            database_enabled: Boolean(taskStore),
            // Honest boundary: encryption hides content, not IP addresses,
            // timing, task ids, coarse cells or participant pubkeys.
            residual_metadata: ['network_address', 'timing', 'task_id', 'coarse_location', 'pubkey']
        },
        routing: {
            provider: String(process.env.NAVIGATION_PROVIDER || 'osrm').toLowerCase(),
            // In blind mode the browser talks to the router directly. It may
            // be run by the same firm or by somebody else; its own privacy
            // policy applies because it necessarily processes the points.
            client_url: OPERATOR_DATA_MODE === 'blind' ? (PUBLIC_ROUTING_URL || null) : null,
            client_direct: OPERATOR_DATA_MODE === 'blind'
        },
        policy: publicOperatorPolicy(operatorPolicy, {
            requiredCredentials: requiredCredentialIds(domainProfile),
            storageBackend: taskStore?.backend || null
        }),
        payment: {
            provider: paymentProvider.providerName,
            trust_model: caps.trustModel,
            custody: typeof paymentProvider.getCustodyModel === 'function' ? paymentProvider.getCustodyModel() : 'custodial',
            capabilities: caps.features
        },
        // Non-custodial settlement rails riders can pay the driver on directly.
        settlement_rails: require('./settlement').listRails(),
        // Regulatory posture, machine-readable. The reference operator is an
        // information-society coordination service, not a payment institution.
        regulatory: {
            role: 'coordinator',
            money_transmitter: false,
            custody: typeof paymentProvider.getCustodyModel === 'function' ? paymentProvider.getCustodyModel() : 'custodial',
            settlement: 'peer-to-peer',
            note: 'The operator coordinates tasks and records commitments. Fares settle directly between the parties; the operator never receives, holds, or transmits funds.'
        },
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

        const fiatCurrency = resolveFiatCurrency(currency);

        if (typeof rideId !== 'string' || !/^[A-Za-z0-9_-]{4,64}$/.test(rideId)) {
            return res.status(400).json({ error: 'rideId must be 4-64 chars of [A-Za-z0-9_-]' });
        }
        if (activeRides.has(rideId) || rideManager.getRide(rideId)) {
            return res.status(409).json({ error: 'Ride id already exists' });
        }
        if (fareSats > 100000000) {
            return res.status(400).json({ error: 'Fare exceeds maximum' });
        }

        const authenticatedPubkey = req.user.pubkey;
        if (riderId && riderId.toLowerCase() !== authenticatedPubkey.toLowerCase()) {
            return res.status(403).json({
                error: 'Forbidden',
                details: 'Authenticated pubkey must match riderId'
            });
        }

        // Calculate stakes (bounded by operator policy)
        const riderStake = Math.min(
            config.maxStakeAmount,
            Math.max(config.minStakeAmount, Math.floor(fareSats * 0.1))
        );
        const operatorFee = Math.floor(fareSats * config.operatorFeePercent);

        // Store ride session. No invoice is issued here: the real invoice
        // (when the rail needs one) comes from the payment provider at the
        // /rider-stake step. The previous decorative `lnbc...` string was
        // unpayable and has been removed.
        activeRides.set(rideId, {
            riderId: authenticatedPubkey,
            fareAmount: fareSats,
            riderStake,
            operatorFee,
            status: 'waiting_rider_stake',
            createdAt: Date.now(),
            currency: fiatCurrency
        });

        res.json({
            success: true,
            rideId,
            stakeAmount: riderStake,
            operatorFee,
            currency: fiatCurrency,
            next: `/rides/${rideId}/rider-stake`,
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
        if (!ride) return res.status(404).json({ error: 'Ride not found' });

        const authErr = authoriseSessionActor(req, ride.riderId);
        if (authErr) return res.status(authErr.status).json(authErr);

        // Re-locking would orphan an existing (possibly already paid) hodl
        // invoice, destroying its preimage. Return the existing state instead.
        if (ride.riderStakeLocked) {
            return res.status(409).json({ error: 'Rider stake already locked' });
        }
        if (ride.riderStakeInvoice) {
            return res.json({
                success: true,
                status: 'awaiting_payment',
                invoice: ride.riderStakeInvoice,
                stakeAmount: ride.riderStake,
                confirm: `/rides/${rideId}/rider-stake/confirm`
            });
        }

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
        if (!ride) return res.status(404).json({ error: 'Ride not found' });
        if (ride.status !== 'waiting_driver') return res.status(409).json({ error: 'Ride not available' });

        // With auth on, the driver identity is the authenticated signer —
        // the body cannot assign the job (and its payout address) to someone else.
        let driverHex = (driverPubkey || driverId || '').toLowerCase();
        if (nip98Enabled && req.user) {
            const signer = (req.user.pubkey || '').toLowerCase();
            if (driverHex && driverHex !== signer) {
                return res.status(403).json({
                    error: 'Forbidden',
                    details: 'Authenticated pubkey must match the accepting driver'
                });
            }
            driverHex = signer;
        }
        if (!driverHex) {
            return res.status(400).json({ error: 'driverPubkey required' });
        }

        // Calculate driver stake (15% of fare, bounded by operator policy)
        const driverStake = Math.min(
            config.maxStakeAmount,
            Math.max(config.minStakeAmount, Math.floor(ride.fareAmount * 0.15))
        );

        ride.driverId = driverHex;
        ride.driverNpub = driverId;
        ride.driverPubkey = driverHex;
        ride.driverLightning = driverLightning;
        ride.driverStake = driverStake;
        ride.status = 'waiting_driver_stake';

        // The real invoice (if the rail needs one) is issued by the payment
        // provider at the /driver-stake step.
        res.json({
            success: true,
            stakeAmount: driverStake,
            next: `/rides/${rideId}/driver-stake`
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
        if (!ride) return res.status(404).json({ error: 'Ride not found' });

        const authErr = authoriseSessionActor(req, ride.driverId);
        if (authErr) return res.status(authErr.status).json(authErr);

        if (ride.driverStakeLocked) {
            return res.status(409).json({ error: 'Driver stake already locked' });
        }
        if (ride.driverStakeInvoice) {
            return res.json({
                success: true,
                status: 'awaiting_payment',
                invoice: ride.driverStakeInvoice,
                stakeAmount: ride.driverStake,
                confirm: `/rides/${rideId}/driver-stake/confirm`
            });
        }

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
        if (!ride) return res.status(404).json({ error: 'Ride not found' });

        const authErr = authoriseSessionActor(req, role === 'rider' ? ride.riderId : ride.driverId);
        if (authErr) return res.status(authErr.status).json(authErr);

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
        if (!ride) return res.status(404).json({ error: 'Ride not found' });
        if (ride.status !== 'active') return res.status(409).json({ error: 'Ride not active' });

        const authErr = authoriseSessionActor(req, ride.riderId, ride.driverId);
        if (authErr) return res.status(authErr.status).json(authErr);

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
            // The fee is accrued against the fare; automatic payout is not
            // implemented, so this endpoint no longer claims it was paid.
            operatorFee: { amount: ride.operatorFee, status: 'accrued' },
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
        const { reason } = req.body;

        const ride = activeRides.get(rideId);
        if (!ride) return res.status(404).json({ error: 'Ride not found' });

        const authErr = authoriseSessionActor(req, ride.riderId, ride.driverId);
        if (authErr) return res.status(authErr.status).json(authErr);

        // Who cancelled is derived from the authenticated signer, never the
        // body — otherwise anyone could pin the penalty on the other party.
        const cancelledBy = (nip98Enabled && req.user)
            ? (req.user.pubkey || '').toLowerCase()
            : (req.body.cancelledBy || 'unknown');

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
app.get('/rides/:rideId', optionalNip98, (req, res) => {
    const { rideId } = req.params;
    const session = activeRides.get(rideId);

    if (session) {
        const authErr = authoriseSessionActor(req, session.riderId, session.driverId);
        if (authErr) return res.status(authErr.status).json(authErr);
    } else {
        const record = rideManager.getRide(rideId);
        if (record) {
            const authErr = authoriseRideActor(req, record);
            if (authErr) return res.status(authErr.status).json(authErr);
        }
    }

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
        finalizedAt: rideRecord.finalizedAt || timestamps.completed || timestamps.cancelled || null,
        currency: rideRecord.currency || 'GBP'
    };

    res.json(response);
});

// Liveness: process is up. Used by container restart policies.
app.get('/health/live', (req, res) => {
    res.json({ status: 'alive', uptime: process.uptime() });
});

// Readiness: checks the hard dependencies with a 2s budget each. A dead
// database or payment provider returns 503 so load balancers stop routing.
app.get('/health', async (req, res) => {
    const timeout = (ms) => new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), ms);
        if (t.unref) t.unref();
    });

    const checks = {};

    if (redis) {
        try {
            await Promise.race([redis.ping(), timeout(2000)]);
            checks.redis = 'ok';
        } catch (error) {
            checks.redis = 'down';
        }
    } else {
        checks.redis = 'disabled';
    }

    if (taskStore) {
        try {
            const ok = typeof taskStore.healthCheck === 'function'
                ? await Promise.race([taskStore.healthCheck(), timeout(2000)])
                : true;
            checks.database = ok ? `ok (${taskStore.backend})` : 'down';
        } catch (error) {
            checks.database = 'down';
        }
    } else {
        checks.database = 'memory-only';
    }

    try {
        const ok = await Promise.race([paymentProvider.healthCheck(), timeout(2000)]);
        checks.paymentProvider = ok ? `ok (${paymentProvider.providerName})` : 'down';
    } catch (error) {
        checks.paymentProvider = 'down';
    }

    const degraded = Object.values(checks).includes('down');
    res.status(degraded ? 503 : 200).json({
        status: degraded ? 'degraded' : 'healthy',
        checks,
        uptime: process.uptime(),
        activeRides: rideManager.getActiveRides().length,
        memoryUsage: process.memoryUsage()
    });
});

// ==========================================
// TASK-FLOW STAKES
// Stake endpoints for tasks created via /api/rides/request (the React
// apps). Same per-stake provider interface as the legacy /rides flow;
// stakeIds stay `${rideId}_rider` / `${rideId}_driver` across both flows.
// ==========================================

async function handleTaskStake(req, res, side) {
    try {
        const { rideId } = req.params;
        const ride = rideManager.getRide(rideId);
        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }

        const authErr = authoriseRideActor(req, ride, [side]);
        if (authErr) {
            return res.status(authErr.status).json(authErr);
        }

        const stakeType = side === 'requester' ? 'rider' : 'driver';
        ride.stakes = ride.stakes || {};
        const existing = ride.stakes[side];
        if (existing?.locked) {
            return res.status(409).json({ error: `${side} stake already locked` });
        }
        if (existing?.invoice) {
            return res.json({
                success: true,
                status: 'awaiting_payment',
                invoice: existing.invoice,
                stakeAmount: existing.amount,
                confirm: `/api/tasks/${rideId}/${side}-stake/confirm`
            });
        }

        const identity = side === 'requester'
            ? (ride.requester || ride.rider)
            : (ride.provider || ride.driver);
        if (!identity) {
            return res.status(400).json({ error: `No ${side} on this ride yet` });
        }

        const fare = Number(ride.fare) || 0;
        const pct = side === 'requester' ? 0.1 : 0.15;
        const amount = Math.min(
            config.maxStakeAmount,
            Math.max(config.minStakeAmount, Math.floor(fare * pct))
        );

        const lock = await stakeManager.lockStake(rideId, identity.pubkey || identity.npub, amount, stakeType);
        if (!lock || !lock.success) {
            return res.status(502).json({
                error: 'Stake lock failed',
                details: lock?.error || 'Payment provider rejected the stake lock'
            });
        }

        const instantLock = stakeManager.currentProvider?.getCapabilities?.().features?.instantLock !== false;
        if (!instantLock) {
            ride.stakes[side] = { amount, invoice: lock.invoice, proof: lock.holdId || lock.lockId, locked: false };
            rideManager.persistRide(rideId);
            return res.json({
                success: true,
                status: 'awaiting_payment',
                invoice: lock.invoice,
                stakeAmount: amount,
                confirm: `/api/tasks/${rideId}/${side}-stake/confirm`
            });
        }

        ride.stakes[side] = { amount, proof: lock.holdId || lock.lockId, locked: true, lockedAt: Date.now() };
        rideManager.persistRide(rideId);

        broadcastToRide(rideId, { type: 'stake_locked', ride_id: rideId, side, amount });
        stakeEvents.publishStakeLock({
            rideId,
            role: stakeType,
            amount,
            participant: identity.pubkey || null,
            providerEvent: lock.event,
            escrowId: lock.holdId,
            currency: 'SAT',
            trustModel: stakeManager.currentProvider?.getTrustModel() || 'unknown'
        }).catch((err) => console.warn(`Failed to publish ${side} stake lock for ${rideId}:`, err.message));

        res.json({ success: true, status: 'stake_locked', stakeAmount: amount, proof: lock.event });
    } catch (error) {
        console.error(`Error locking ${side} stake:`, error.message);
        res.status(500).json({ error: 'Failed to lock stake' });
    }
}

async function confirmTaskStake(req, res, side) {
    try {
        const { rideId } = req.params;
        const ride = rideManager.getRide(rideId);
        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }
        const authErr = authoriseRideActor(req, ride, [side]);
        if (authErr) {
            return res.status(authErr.status).json(authErr);
        }
        const stakeType = side === 'requester' ? 'rider' : 'driver';
        const stake = ride.stakes?.[side];
        if (!stake) {
            return res.status(400).json({ error: `No ${side} stake to confirm` });
        }
        if (stake.locked) {
            return res.json({ success: true, paid: true, status: 'stake_locked' });
        }

        const result = await stakeManager.confirmStakePaid(`${rideId}_${stakeType}`);
        if (!result.paid) {
            return res.status(402).json({
                success: false,
                paid: false,
                status: result.status,
                details: 'Stake invoice not yet paid/held'
            });
        }

        stake.locked = true;
        stake.lockedAt = Date.now();
        rideManager.persistRide(rideId);
        broadcastToRide(rideId, { type: 'stake_locked', ride_id: rideId, side, amount: stake.amount });

        const identity = side === 'requester'
            ? (ride.requester || ride.rider)
            : (ride.provider || ride.driver);
        stakeEvents.publishStakeLock({
            rideId,
            role: stakeType,
            amount: stake.amount,
            participant: identity?.pubkey || null,
            escrowId: stake.proof,
            currency: 'SAT',
            trustModel: stakeManager.currentProvider?.getTrustModel() || 'unknown'
        }).catch((err) => console.warn(`Failed to publish ${side} stake lock for ${rideId}:`, err.message));

        res.json({ success: true, paid: true, status: 'stake_locked' });
    } catch (error) {
        console.error(`Error confirming ${side} stake:`, error.message);
        res.status(500).json({ error: 'Failed to confirm stake' });
    }
}

app.post('/api/rides/:rideId/requester-stake', stakeLimiter, (req, res) => handleTaskStake(req, res, 'requester'));
app.post('/api/rides/:rideId/provider-stake', stakeLimiter, (req, res) => handleTaskStake(req, res, 'provider'));
app.post('/api/rides/:rideId/requester-stake/confirm', (req, res) => confirmTaskStake(req, res, 'requester'));
app.post('/api/rides/:rideId/provider-stake/confirm', (req, res) => confirmTaskStake(req, res, 'provider'));

// ==========================================
// NON-CUSTODIAL MULTI-RAIL SETTLEMENT
// The driver advertises accepted rails; the rider pays the driver DIRECTLY
// (Lightning wallet-to-wallet, M-Pesa Send Money, Tando, cash). The operator
// resolves a payable artefact, records/verifies proof, and moves nothing.
// ==========================================
const settlement = require('./settlement');
const { tryDecodeBolt11 } = require('farrier-kit/bolt11');

// Every invoice this operator has handed the rider for a ride, newest first.
//
// A preimage only ever matches the ONE invoice it paid. Verifying proof
// against just the most recent instruction therefore tells a rider who
// genuinely did pay that their proof is bad, as soon as anything caused a
// second instruction to be issued — re-selecting the rail is enough, because
// each call mints a fresh bolt11 with a fresh payment hash. The paste-your-
// preimage field exists precisely to rescue a payment the app lost track of,
// so it is the one path that must not be broken by the operator forgetting
// which invoices it issued.
const MAX_RECORDED_INSTRUCTIONS = 5;
// Reuse an invoice only while comfortably live; a rider paying one that
// expires mid-flight is the failure this is meant to avoid.
const INVOICE_REUSE_MARGIN_MS = 60 * 1000;

// When a bolt11 stops being payable, in ms — decoded locally, no network.
function invoiceExpiresAt(invoice) {
    if (!invoice) return null;
    const decoded = tryDecodeBolt11(invoice);
    if (!decoded) return null;
    return (decoded.timestamp + decoded.expirySeconds) * 1000;
}

// The ledger is deliberately NON-ENUMERABLE. GET /api/rides/:id serialises the
// ride object wholesale, and while that endpoint is participant-gated, the
// narrow `{rail, paymentHash, verifyUrl}` shape `pendingInstruction` has always
// had was a deliberate minimisation — nothing outside this file reads either
// field, so an internal ledger carrying whole invoices has no business
// appearing in an API response. Hidden from JSON.stringify rather than deleted
// per-endpoint, so it stays hidden from any future serialiser too, and still
// lives on the ride so it is garbage-collected with it.
function setLedger(ride, records) {
    Object.defineProperty(ride, 'paymentInstructions', {
        value: records,
        enumerable: false,
        writable: true,
        configurable: true
    });
}

function recordInstruction(ride, rail, instruction) {
    const record = {
        rail,
        paymentHash: instruction.paymentHash || null,
        verifyUrl: instruction.verifyUrl || null,
        invoice: instruction.invoice || null,
        expiresAt: invoiceExpiresAt(instruction.invoice),
        // What this invoice actually asks for. A real LNURL service issues
        // invoices valid for many hours (24 on the one this was verified
        // against), so an invoice can easily outlive the fare it was built
        // for — waiting time is added on start, for instance. Reuse must
        // never hand back an invoice for a different amount.
        amountSats: Number(instruction.amountSats) || null,
        // Who this invoice actually pays. A driver may correct a mistyped
        // Lightning Address or M-Pesa number from their own active screen
        // (PaymentMethodsEditor -> POST /payment-methods replaces
        // ride.paymentMethods wholesale), and an invoice minted for the old
        // handle stays live for hours. Reusing on rail and amount alone would
        // hand the rider a stale invoice that pays a stranger.
        handle: instruction.lnAddress || instruction.mpesaNumber || null,
        issuedAt: Date.now(),
        // Kept only for rails whose instruction IS an invoice, so a repeat
        // request can be answered with the same one rather than a new hash.
        payload: instruction.invoice ? instruction : null
    };
    const previous = (ride.paymentInstructions || [])
        .filter((i) => !record.paymentHash || i.paymentHash !== record.paymentHash);
    setLedger(ride, [record, ...previous].slice(0, MAX_RECORDED_INSTRUCTIONS));
    // Keeps exactly the shape it had before this ledger existed: the rail
    // default and single-candidate fallback on /settle need nothing more, and
    // this one IS serialised with the ride.
    ride.pendingInstruction = narrowInstruction(record);
    return record;
}

/** The three fields /settle needs, and nothing that carries an invoice. */
function narrowInstruction(record) {
    return {
        rail: record.rail,
        paymentHash: record.paymentHash || null,
        verifyUrl: record.verifyUrl || null,
        // Carried so the shortfall check works on the LUD-21 path too, where
        // this projection is the only candidate. It is a number, not the
        // invoice, and the fare is on the ride already, so it discloses
        // nothing the narrowing was protecting.
        amountSats: typeof record.amountSats === 'number' ? record.amountSats : null
    };
}

// Two taps in the same second must not each mint an invoice. liveInstruction
// can only see instructions that have already RESOLVED, and building one takes
// a network round trip, so without this both requests find nothing recorded
// and both mint — handing the rider two payable invoices, which is the double
// payment the reuse rule exists to prevent. Keyed by ride and rail, dropped as
// soon as the build settles.
const inFlightInstructions = new Map();

function instructionOnce(key, build) {
    const existing = inFlightInstructions.get(key);
    if (existing) return existing;
    const pending = (async () => build())().finally(() => inFlightInstructions.delete(key));
    inFlightInstructions.set(key, pending);
    return pending;
}

// An invoice already issued for this rail, still safely payable, still for the
// right amount, and still paying the same person.
function liveInstruction(ride, rail, amountSats, handle) {
    return (ride.paymentInstructions || []).find((i) => (
        i.rail === rail
        && i.payload
        && i.expiresAt
        && i.expiresAt > Date.now() + INVOICE_REUSE_MARGIN_MS
        && i.amountSats === amountSats
        && i.handle === handle
    )) || null;
}

// Public catalogue of rails a driver can offer.
app.get('/api/settlement/rails', publicRateLimiter, (req, res) => {
    res.json({ rails: settlement.listRails() });
});

// The cancellation vocabulary each side may use. Clients render their own
// wording for these codes; the server only decides what is valid.
app.get('/api/cancellation-reasons', publicRateLimiter, (req, res) => {
    res.json({ reasons: CANCELLATION_REASONS });
});

/** Cell size for demand reporting — precision 5 is roughly 5 km square */
const DEMAND_GEOHASH_PRECISION = 5;
/** Below this, a cell is one person waiting, not a pattern worth driving to */
const DEMAND_MIN_WAITING = parseInt(process.env.DEMAND_MIN_WAITING || '2', 10);

/**
 * Where the work is.
 *
 * A driver deciding where to sit and wait has, until now, had nothing to
 * go on but their own guess. This aggregates the SAME waiting requests the
 * open list already exposes, but coarsened to ~5 km cells and reported as
 * counts — never a pickup, never an identity, and never a cell with a
 * single person in it, which would point at a specific doorway.
 *
 * Supply is reported alongside demand deliberately: "twelve people waiting"
 * with thirty idle drivers in the cell is not somewhere to drive to.
 */
app.get('/api/demand', publicRateLimiter, (req, res) => {
    const cells = new Map();
    for (const ride of rideManager.getActiveRides()) {
        if (ride.driver || ride.provider) continue;
        if (ride.scheduledFor) continue; // pre-booked demand is not now
        const pickup = ride.pickup;
        if (!pickup || !Number.isFinite(pickup.lat) || !Number.isFinite(pickup.lon)) continue;
        const cell = encodeGeohash(pickup.lat, pickup.lon, DEMAND_GEOHASH_PRECISION);
        const existing = cells.get(cell);
        if (existing) {
            existing.waiting += 1;
        } else {
            cells.set(cell, { geohash: cell, waiting: 1 });
        }
    }

    const now = Date.now();
    const list = [];
    for (const entry of cells.values()) {
        if (entry.waiting < DEMAND_MIN_WAITING) continue;
        const centre = decodeGeohash(entry.geohash);
        if (!centre) continue;
        // Idle providers sitting in the same cell
        let available = 0;
        for (const [, presence] of driverPresence) {
            if ((now - presence.lastSeen) > DRIVER_PRESENCE_TTL_MS) continue;
            if (!presence.location) continue;
            if (encodeGeohash(
                presence.location.lat, presence.location.lon, DEMAND_GEOHASH_PRECISION
            ) === entry.geohash) available += 1;
        }
        list.push({
            geohash: entry.geohash,
            lat: centre.lat,
            lon: centre.lon,
            waiting: entry.waiting,
            available,
            // What a request from this cell would price at right now, so the
            // number a driver sees is the number they would actually earn
            multiplier: surgeFor({ lat: centre.lat, lon: centre.lon }).multiplier
        });
    }

    // Busiest first — a driver reads the top of this list and nothing else
    list.sort((a, b) => (b.waiting - b.available) - (a.waiting - a.available));

    res.json({
        cells: list.slice(0, 20),
        precision: DEMAND_GEOHASH_PRECISION,
        min_waiting: DEMAND_MIN_WAITING,
        surge_enabled: SURGE_ENABLED,
        generated_at: now
    });
});

// Driver declares which rails they accept for THIS ride, with handles.
// Lightning/Tando handles are payment endpoints; the M-Pesa number is PII and
// is delivered per-ride to the matched rider only, never published.
app.post('/api/rides/:rideId/payment-methods', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { methods } = req.body || {};
        const ride = rideManager.getRide(rideId);
        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }
        if (ride.settlementMode === 'none') {
            return res.status(409).json({ error: 'This journey has no monetary settlement' });
        }
        const authErr = authoriseRideActor(req, ride, ['provider']);
        if (authErr) {
            return res.status(authErr.status).json(authErr);
        }
        if (ride.locationMode === 'participant_encrypted') {
            return res.status(409).json({
                error: 'Payment handles stay in encrypted participant chat in privacy mode'
            });
        }
        if (!Array.isArray(methods) || methods.length === 0) {
            return res.status(400).json({ error: 'methods must be a non-empty array of { rail, handle }' });
        }
        const accepted = [];
        for (const m of methods.slice(0, 6)) {
            const rail = (m?.rail || '').toLowerCase();
            const rawHandle = typeof m?.handle === 'string' ? m.handle.trim() : '';
            if (!settlement.isKnownRail(rail)) {
                return res.status(400).json({ error: `Unknown rail: ${m?.rail}` });
            }
            if (rail !== 'cash' && !settlement.validateHandle(rail, rawHandle)) {
                return res.status(400).json({ error: `Invalid handle for ${rail}` });
            }
            // Tando: a bare Kenyan number becomes a Lightning Address at bitcoin.co.ke.
            const handle = rail === 'cash' ? null : settlement.normaliseHandle(rail, rawHandle);
            accepted.push({ rail, handle });
        }
        // Ephemeral, in-memory only. PII (M-Pesa number) is never persisted or relayed.
        ride.paymentMethods = accepted;
        res.json({ success: true, methods: accepted.map((m) => ({ rail: m.rail })) });
    } catch (error) {
        console.error('Error setting payment methods:', error.message);
        res.status(500).json({ error: 'Failed to set payment methods' });
    }
});

// Rider sees which rails the driver accepts (with handles, since the rider is
// the matched counterparty who needs them to pay directly).
app.get('/api/rides/:rideId/payment-options', optionalNip98, (req, res) => {
    try {
        const { rideId } = req.params;
        const ride = rideManager.getRide(rideId);
        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }
        if (ride.settlementMode === 'none') {
            return res.json({
                fare: 0,
                currency: ride.currency || 'GBP',
                custody: 'none',
                settlement: 'none',
                methods: []
            });
        }
        const authErr = authoriseRideActor(req, ride);
        if (authErr) {
            return res.status(authErr.status).json(authErr);
        }
        const methods = ride.paymentMethods || [{ rail: 'cash', handle: null }];
        res.json({
            fare: ride.fare ?? null,
            currency: ride.currency || 'GBP',
            custody: 'none',
            settlement: 'peer-to-peer',
            methods
        });
    } catch (error) {
        console.error('Error getting payment options:', error.message);
        res.status(500).json({ error: 'Failed to get payment options' });
    }
});

// Rider requests a payable artefact for a chosen rail (e.g. resolves the
// driver's Lightning Address to an invoice the rider's wallet pays directly).
app.post('/api/rides/:rideId/pay-instruction', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { rail } = req.body || {};
        const ride = rideManager.getRide(rideId);
        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }
        if (ride.settlementMode === 'none') {
            return res.status(409).json({ error: 'This journey has no monetary settlement' });
        }
        const authErr = authoriseRideActor(req, ride, ['requester']);
        if (authErr) {
            return res.status(authErr.status).json(authErr);
        }
        const method = (ride.paymentMethods || [{ rail: 'cash', handle: null }])
            .find((m) => m.rail === (rail || '').toLowerCase());
        if (!method) {
            return res.status(400).json({ error: `Driver does not accept rail: ${rail}` });
        }
        const railImpl = settlement.getRail(method.rail);
        const fareSats = Number(ride.fare) || 0;
        // Hand back the invoice already issued for this ride while it is still
        // live and still for this fare, rather than minting another. A fresh
        // invoice means a fresh payment hash, which is exactly what turns
        // "the rider tapped again" into "the rider paid twice": bolt11's own
        // replay protection only covers re-paying the SAME invoice.
        const reusable = liveInstruction(ride, method.rail, fareSats, method.handle || null);
        if (reusable) {
            ride.pendingInstruction = narrowInstruction(reusable);
            return res.json(reusable.payload);
        }
        // Lightning rails (incl. Tando) are paid in sats — the invoice IS the
        // amount. Fiat rails (M-Pesa, cash) need the human fiat figure, derived
        // from the sats fare via the live BTC price so it survives rehydration
        // (ride.fare is the only amount the Nostr snapshot preserves).
        const isLightningRail = ['lnaddress', 'lightning', 'tando'].includes(method.rail);
        let fiatAmount;
        let fiatCurrency = ride.currency || 'GBP';
        if (!isLightningRail) {
            try {
                const fiat = await satsToFiat(fareSats, fiatCurrency);
                fiatAmount = fiat.amount;
            } catch (e) {
                fiatAmount = undefined; // price unavailable — rail falls back gracefully
            }
        }
        // Concurrent taps share one build (see instructionOnce), so a rider
        // double-tapping is handed the same invoice rather than two payable
        // ones. recordInstruction dedupes by payment hash, so both callers
        // recording the shared result leaves a single entry.
        // The amount and handle are part of the key for the same reason
        // liveInstruction checks them: a shared in-flight build bypasses that
        // predicate entirely, so two concurrent calls straddling a fare change
        // or a corrected payment handle would both be answered with the first
        // one's invoice — for the wrong number, or the wrong person.
        const instruction = await instructionOnce(
            `${rideId}:${method.rail}:${fareSats}:${method.handle || ''}`,
            () => railImpl.getPayInstructions({
                handle: method.handle,
                amountSats: fareSats,
                amount: fiatAmount,
                currency: isLightningRail ? 'SAT' : fiatCurrency,
                memo: `DonkeyRide ${rideId}`
            })
        );
        // Remember the instruction so /settle can verify against it — and
        // against every earlier one still on record (see recordInstruction).
        recordInstruction(ride, method.rail, instruction);
        res.json(instruction);
    } catch (error) {
        console.error('Error building pay instruction:', error.message);
        res.status(502).json({ error: 'Failed to build payment instruction', details: error.message });
    }
});

// Rider submits proof of a direct payment; the operator verifies/records it.
app.post('/api/rides/:rideId/settle', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { rail, proof } = req.body || {};
        const ride = rideManager.getRide(rideId);
        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }
        if (ride.settlementMode === 'none') {
            return res.status(409).json({ error: 'This journey has no monetary settlement' });
        }
        const authErr = authoriseRideActor(req, ride, ['requester']);
        if (authErr) {
            return res.status(authErr.status).json(authErr);
        }
        const railId = (rail || ride.pendingInstruction?.rail || 'cash').toLowerCase();
        if (!settlement.isKnownRail(railId)) {
            return res.status(400).json({ error: `Unknown rail: ${rail}` });
        }
        const railImpl = settlement.getRail(railId);
        // Check a supplied preimage against EVERY invoice still on record for
        // this rail, newest first — a rider who paid an earlier one is not
        // wrong, the operator just moved on. This stays local: a rail that
        // gets a well-formed preimage answers from crypto alone and never
        // reaches its network fallback, so the loop costs nothing.
        //
        // With no preimage to check, behaviour is unchanged: verify once
        // against the latest instruction, so a rail with a LUD-21 verify URL
        // makes exactly one call, as before.
        const hasPreimage = /^[0-9a-f]{64}$/i.test((proof?.preimage || '').trim());
        // Only records that actually carry a hash: a preimage cannot be
        // checked against nothing. A rail handed an instruction with no hash
        // answers `recorded` rather than `failed` (it has no grounds to
        // contradict the proof), so leaving one in the list would let it
        // OVERWRITE a genuine mismatch from a hashed record and downgrade
        // "this proof is wrong" to "declared, awaiting the driver" — the
        // opposite of the never-silently-accepted rule below.
        //
        // Restricted to records issued for the handle the driver accepts NOW.
        // Blocking a stale invoice from being handed out is not enough on its
        // own: if one was already paid before the driver corrected a mistyped
        // address, matching its preimage here would have the operator assert a
        // verified settlement and publish a receipt for money that went to
        // whoever the typo belonged to. The proof is real; what it proves is a
        // payment to the wrong person, so it must not read as settlement.
        const currentHandle = (ride.paymentMethods || []).find((m) => m.rail === railId)?.handle ?? null;
        const candidates = hasPreimage
            ? (ride.paymentInstructions || []).filter((i) => (
                i.rail === railId && i.paymentHash && i.handle === currentHandle
            ))
            : [];
        if (candidates.length === 0) {
            candidates.push(ride.pendingInstruction || {});
        }
        let result = { verified: false };
        let proven = null;
        for (const candidate of candidates) {
            result = await railImpl.verify({ instruction: candidate, proof: proof || {} });
            if (result.verified) {
                proven = candidate;
                break;
            }
        }
        // A proven preimage says what was paid, not that the fare was met. The
        // ledger deliberately keeps older invoices, and ride.fare genuinely
        // moves after one is minted — waiting time is added on /start, and
        // changing the destination re-prices mid-trip — so a rider can hold
        // valid proof of paying LESS than they now owe. Treating that as
        // `verified` would have the operator cryptographically assert a
        // payment of an amount nobody ever paid, and publish a receipt for it.
        // Only when the proven instruction actually states an amount. Coercing
        // an absent one to 0 claimed a shortfall of the entire fare against
        // every settlement whose amount we simply do not know — which silently
        // downgraded every LUD-21 verified payment to `short`, since the
        // no-preimage path verifies against a projection that had no amount on
        // it. Not knowing what was paid is not evidence of underpayment.
        const fareNow = Number(ride.fare) || 0;
        const paidSats = typeof proven?.amountSats === 'number' ? proven.amountSats : null;
        const short = paidSats !== null && paidSats < fareNow;
        if (short) {
            result = {
                verified: false,
                detail: `preimage proves payment of ${paidSats} sats, but the fare is now ${fareNow} sats`
            };
        }
        // verified: proof checked out (e.g. preimage matches the invoice).
        // unverified: a proof was supplied but did NOT check out (rail sets
        //             result.failed) — surfaced, never silently accepted.
        // declared: rider asserts they paid; awaits the driver's confirm-received
        //           (cash, M-Pesa, or a Lightning payment with no preimage yet).
        // In every case the driver's confirmation is the backstop for payout.
        // 'short' rather than 'declared': the proof is real and the operator
        // knows exactly what was paid, so saying "awaiting confirmation" would
        // hide a known shortfall from both parties. Not 'unverified' either —
        // the preimage did check out, it just does not cover the fare.
        const settleStatus = result.verified
            ? 'verified'
            : (short ? 'short' : (result.failed ? 'unverified' : 'declared'));
        ride.settlementRecord = {
            rail: railId,
            custody: 'none',
            operator_transmitted: 0,
            settlement: 'peer-to-peer',
            verified: !!result.verified,
            status: settleStatus,
            detail: result.detail || null,
            confirmationCode: result.confirmationCode || null,
            // Present only when a preimage proved a specific amount, so both
            // sides can see the gap rather than argue about it.
            paidAmountSats: paidSats,
            expectedAmountSats: proven ? fareNow : null,
            declaredBy: 'requester',
            timestamp: Date.now()
        };
        rideManager.persistRide(rideId);
        broadcastToRide(rideId, {
            type: 'settlement_declared',
            ride_id: rideId,
            rail: railId,
            verified: !!result.verified
        });
        // A cryptographically verified payment earns its receipt at once;
        // declared-only settlements wait for the driver's confirmation
        if (result.verified) {
            void stakeEvents.publishPaymentReceipt({
                rideId,
                amount: ride.fare,
                paymentRail: railId,
                status: 'verified',
                verified: true
            }).catch(() => {});
        }
        res.json({ success: true, settlement: ride.settlementRecord });
    } catch (error) {
        console.error('Error settling:', error.message);
        // A rail may refuse the proof outright for a reason the payer needs to
        // hear — a card number typed where a receipt reference belongs. Those
        // are marked client-safe and are the payer's error, not a server fault;
        // everything else stays a generic 500 so internals are not echoed back.
        if (error.clientSafe) {
            return res.status(error.status || 400).json({
                error: 'Payment not recorded',
                details: error.message
            });
        }
        res.status(500).json({ error: 'Failed to record settlement' });
    }
});

// Driver confirms funds received (the human counterpart to verification;
// required for rails that cannot be auto-verified, e.g. cash and M-Pesa).
app.post('/api/rides/:rideId/confirm-received', async (req, res) => {
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
        ride.settlementRecord = {
            ...(ride.settlementRecord || { rail: (ride.paymentMethods?.[0]?.rail) || 'cash', custody: 'none', operator_transmitted: 0, settlement: 'peer-to-peer' }),
            status: 'confirmed',
            confirmedByProvider: true,
            confirmedAt: Date.now()
        };
        rideManager.persistRide(rideId);
        broadcastToRide(rideId, { type: 'settlement_confirmed', ride_id: rideId, rail: ride.settlementRecord.rail });
        // Kind 30535 payment receipt — addressable, so this supersedes any
        // verified-only receipt from the settle step
        void stakeEvents.publishPaymentReceipt({
            rideId,
            amount: ride.fare,
            paymentRail: ride.settlementRecord.rail,
            status: 'confirmed',
            verified: !!ride.settlementRecord.verified
        }).catch(() => {});
        res.json({ success: true, settlement: ride.settlementRecord });
    } catch (error) {
        console.error('Error confirming receipt:', error.message);
        res.status(500).json({ error: 'Failed to confirm receipt' });
    }
});

// ==========================================
// PARTICIPANT ACTIVE-TASK RECOVERY
// A phone OS killing the PWA mid-ride is routine; without this endpoint a
// restarted client could never find its in-flight task again.
// ==========================================

app.get('/api/participants/:pubkey/active', optionalNip98, (req, res) => {
    try {
        const pubkey = (req.params.pubkey || '').toLowerCase();
        if (!/^[0-9a-f]{64}$/.test(pubkey)) {
            return res.status(400).json({ error: 'pubkey must be 64 hex chars' });
        }
        if (nip98Enabled && req.user && (req.user.pubkey || '').toLowerCase() !== pubkey) {
            return res.status(403).json({ error: 'Forbidden', details: 'You can only query your own active task' });
        }

        const candidates = rideManager.getTasksByParticipant(pubkey)
            .filter((task) => !rideManager.isTerminal(task.status))
            .sort((a, b) => (b.timestamps?.requested || 0) - (a.timestamps?.requested || 0));

        res.json({ task: candidates[0] || null });
    } catch (error) {
        console.error('Error finding active task:', error.message);
        res.status(500).json({ error: 'Failed to find active task' });
    }
});

// ==========================================
// DEMO & TRACKING API ENDPOINTS
// ==========================================

// Get available drivers — merges live presence (real drivers) with Redis
// entries (demo/simulator fleets). Optional ?lat/&lon/&radius filter.
app.get('/api/drivers/available', publicRateLimiter, async (req, res) => {
    try {
        const byKey = new Map();

        // Live presence from real connected drivers. Positions are rounded
        // to ~100m and identities are withheld: this endpoint answers "are
        // there drivers nearby?", not "where exactly is this person?".
        const coarse = (loc) => loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lon)
            ? { lat: Math.round(loc.lat * 1000) / 1000, lon: Math.round(loc.lon * 1000) / 1000 }
            : null;

        const now = Date.now();
        for (const [key, entry] of driverPresence) {
            if ((now - entry.lastSeen) > DRIVER_PRESENCE_TTL_MS) {
                continue;
            }
            byKey.set(key, {
                name: 'Driver',
                location: coarse(entry.location),
                available: true,
                // Never invent a rating: identity is withheld here, so no
                // reputation can honestly be attached
                rating: null,
                totalRides: null,
                lastUpdate: entry.lastSeen,
                source: 'live'
            });
        }

        // Redis-backed entries (demo bot fleets, external feeders).
        // SCAN, not KEYS — KEYS blocks the Redis event loop.
        if (redis) {
            const keys = [];
            for await (const key of redis.scanIterator({ MATCH: 'driver:online:*', COUNT: 100 })) {
                keys.push(key);
                if (keys.length >= 500) break;
            }
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
                        name: driver.name || 'Driver',
                        location: coarse(driver.location ? {
                            lat: driver.location.lat,
                            lon: driver.location.lon ?? driver.location.lng
                        } : null),
                        available: driver.available !== false,
                        rating: driver.rating ?? null,
                        totalRides: driver.totalRides ?? null,
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
        const { npub, pubkey, lat, lon, areas, gender, women_only, service_options, access_features } = req.body || {};
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
            location: { lat, lon },
            areas: sanitiseWorkingAreas(areas),
            gender,
            womenOnly: women_only,
            accessFeatures: sanitiseAccessNeeds(access_features, domainProfile),
            serviceOptions: sanitiseServiceOptions(service_options)
        });

        if (!entry) {
            return res.status(400).json({ error: 'Missing driver identity (npub or pubkey)' });
        }

        // Keep push targeting in step with the driver's live position/areas
        pushService.updateTargeting((pubkey || signerPubkey || '').toLowerCase(), {
            areas: sanitiseWorkingAreas(areas),
            location: entry.location,
            gender: OPERATOR_DATA_MODE === 'blind'
                ? null : (gender !== undefined ? sanitiseGender(gender) : undefined),
            womenOnly: OPERATOR_DATA_MODE === 'blind'
                ? false : (women_only !== undefined ? women_only === true : undefined),
            accessFeatures: OPERATOR_DATA_MODE === 'blind'
                ? [] : sanitiseAccessNeeds(access_features, domainProfile),
            serviceOptions: sanitiseServiceOptions(service_options)
        });

        res.json({ success: true, lastSeen: entry.lastSeen });
    } catch (error) {
        console.error('Error updating driver presence:', error);
        res.status(500).json({ error: 'Failed to update driver presence' });
    }
});

// Web Push: the operator's self-generated VAPID public key
app.get('/api/push/vapid-key', publicRateLimiter, (req, res) => {
    res.json({ key: pushService.getPublicKey() });
});

// Driver subscribes for job alerts while their app is backgrounded.
// The push endpoint URL is device-addressing PII: held in memory only.
app.post('/api/push/subscribe', optionalNip98, (req, res) => {
    try {
        const { subscription, pubkey, areas, location, gender, women_only, role, access_features } = req.body || {};
        if (nip98Enabled && req.user && pubkey
            && !actorMatchesIdentity(req.user, { pubkey })) {
            return res.status(403).json({
                error: 'Forbidden',
                details: 'Signer does not match the subscribing identity'
            });
        }
        const subscriber = ((nip98Enabled && req.user?.pubkey) || pubkey || '').toLowerCase();
        if (!subscriber) {
            return res.status(400).json({ error: 'Missing pubkey' });
        }
        if (!pushService.isValidSubscription(subscription)) {
            return res.status(400).json({ error: 'Invalid push subscription' });
        }
        let loc = location && validLatLon(location.lat, location.lon)
            ? { lat: location.lat, lon: location.lon }
            : null;
        if (loc && OPERATOR_DATA_MODE === 'blind') {
            const centre = decodeGeohash(encodeGeohash(
                loc.lat, loc.lon, PRIVATE_LOCATION_PRECISION
            ));
            loc = { lat: centre.lat, lon: centre.lon };
        }
        pushService.subscribe(subscriber, subscription, {
            // Riders subscribe for "your driver is on the way / is here";
            // only providers are ever swept into job dispatch.
            role: role === 'requester' ? 'requester' : 'provider',
            areas: sanitiseWorkingAreas(areas),
            location: loc,
            gender: OPERATOR_DATA_MODE === 'blind' ? null : sanitiseGender(gender),
            womenOnly: OPERATOR_DATA_MODE === 'blind' ? false : women_only === true,
            accessFeatures: OPERATOR_DATA_MODE === 'blind'
                ? [] : sanitiseAccessNeeds(access_features, domainProfile),
            serviceOptions: sanitiseServiceOptions(req.body.service_options)
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Error subscribing for push:', error.message);
        res.status(500).json({ error: 'Failed to subscribe' });
    }
});

// Driver goes off shift — stop pushing to this device
app.delete('/api/push/subscribe', optionalNip98, (req, res) => {
    try {
        const { pubkey } = req.body || {};
        if (nip98Enabled && req.user && pubkey
            && !actorMatchesIdentity(req.user, { pubkey })) {
            return res.status(403).json({
                error: 'Forbidden',
                details: 'Signer does not match the unsubscribing driver identity'
            });
        }
        const subscriber = ((nip98Enabled && req.user?.pubkey) || pubkey || '').toLowerCase();
        if (!subscriber) {
            return res.status(400).json({ error: 'Missing driver pubkey' });
        }
        pushService.unsubscribe(subscriber);
        res.json({ success: true });
    } catch (error) {
        console.error('Error unsubscribing from push:', error.message);
        res.status(500).json({ error: 'Failed to unsubscribe' });
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
                rating: task.feedback?.rider?.rating ?? null,
                settlement: task.payment ? {
                    method: task.payment.method || null,
                    status: task.payment.status || null,
                    trust_model: task.payment.trust_model || null
                } : null
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
        const {
            pickup_lat, pickup_lon, dropoff_lat, dropoff_lon, currency, stops,
            location_mode, pickup_cell, dropoff_cell, route_summary, stop_count
        } = req.body;
        const fiatCurrency = resolveFiatCurrency(currency);

        const privateItinerary = location_mode === 'participant_encrypted';
        if (OPERATOR_DATA_MODE === 'blind' && !privateItinerary) {
            return res.status(400).json({
                error: 'This operator accepts coarse cells and routed totals only',
                details: 'Route in the client and send location_mode=participant_encrypted'
            });
        }

        let pickup;
        let dropoff;
        let via = [];
        let quotedStopCount = 0;
        let distance;
        let duration;
        let coordinates = null;
        let routed = false;
        let estimate;

        if (privateItinerary) {
            const summary = parseRouteSummary(route_summary);
            const pickupHash = typeof pickup_cell === 'string' ? pickup_cell.trim().toLowerCase() : '';
            const dropoffHash = typeof dropoff_cell === 'string' ? dropoff_cell.trim().toLowerCase() : '';
            if (!summary) {
                return res.status(400).json({
                    error: 'route_summary must carry valid routed distance and duration'
                });
            }
            if (!GEOHASH_CELL.test(pickupHash) || pickupHash.length > PRIVATE_LOCATION_PRECISION
                || !GEOHASH_CELL.test(dropoffHash) || dropoffHash.length > PRIVATE_LOCATION_PRECISION) {
                return res.status(400).json({
                    error: `pickup_cell and dropoff_cell must be geohashes no more precise than ${PRIVATE_LOCATION_PRECISION} characters`
                });
            }
            quotedStopCount = Number(stop_count || 0);
            if (!Number.isInteger(quotedStopCount) || quotedStopCount < 0 || quotedStopCount > 3) {
                return res.status(400).json({ error: 'stop_count must be an integer from 0 to 3' });
            }
            const pickupCentre = decodeGeohash(pickupHash);
            const dropoffCentre = decodeGeohash(dropoffHash);
            pickup = { lat: pickupCentre.lat, lon: pickupCentre.lon };
            dropoff = { lat: dropoffCentre.lat, lon: dropoffCentre.lon };
            distance = summary.distanceKm;
            duration = summary.durationMinutes;
            routed = true;
        } else {
            if (!isValidLat(pickup_lat) || !isValidLon(pickup_lon)
                || !isValidLat(dropoff_lat) || !isValidLon(dropoff_lon)) {
                return res.status(400).json({
                    error: 'Missing or invalid route coordinates',
                    required: ['pickup_lat', 'pickup_lon', 'dropoff_lat', 'dropoff_lon']
                });
            }
            pickup = { lat: pickup_lat, lon: pickup_lon };
            dropoff = { lat: dropoff_lat, lon: dropoff_lon };
            // Intermediate stops, so a multi-stop quote covers the detour
            via = Array.isArray(stops)
                ? stops
                    .map((s) => ({ lat: Number(s?.lat), lon: Number(s?.lon != null ? s.lon : s?.lng) }))
                    .filter((s) => isValidLat(s.lat) && isValidLon(s.lon))
                    .slice(0, 3)
                : [];
            quotedStopCount = via.length;
        }

        // Demand pricing, if this operator runs it. Resolved once and
        // carried into the response so the rider sees the multiplier on the
        // confirm screen — never discovered afterwards on a receipt.
        const surge = surgeFor(pickup);

        // THE upfront-price guarantee: this is the same routing and pricing
        // path /api/rides/request uses, so the number the rider approves here
        // is the number recorded on the ride. Quoting a straight line and
        // charging a road route is how you overcharge everyone by 30%.
        if (privateItinerary) {
            estimate = await estimateTripCost(
                distance, duration, rateCardOptions(fiatCurrency, surge.multiplier)
            );
        } else {
            const priced = await routeAndPrice(
                pickup, dropoff, via, fiatCurrency, surge.multiplier
            );
            distance = priced.distance;
            duration = priced.duration;
            coordinates = priced.coordinates;
            routed = priced.routed;
            estimate = priced.estimate;
        }

        // Per-class prices so the picker shows real numbers, not a
        // multiplier the client had to guess at
        const classes = [];
        // What each class was priced at, kept for the quote. Not part of the
        // response — the client already has fareSats per class.
        const pricedByOption = {};
        for (const option of (domainProfile.serviceOptions || [])) {
            // Class multiplier composes with demand: an XL in a surge is
            // one rate card scaled once, so its breakdown still sums
            const combined = option.fareMultiplier * surge.multiplier;
            const priced = combined === surge.multiplier
                ? estimate
                : await estimateTripCost(
                    distance, duration, rateCardOptions(fiatCurrency, combined)
                );
            classes.push({
                id: option.id,
                label: option.label,
                description: option.description || null,
                seats: option.seats || null,
                fareSats: priced.fare.sats,
                fareFormatted: priced.fare.formatted,
                fareBreakdown: breakdownSats(priced)
            });
            pricedByOption[option.id] = { sats: priced.fare.sats, estimate: priced };
        }

        // Remember exactly what this screen showed, for every class on it.
        // The request redeems this rather than re-deriving, so the number the
        // rider approves is the number recorded even if the BTC price ticks
        // between reading the quote and tapping the button.
        const quoteId = rememberQuote({
            pickup,
            dropoff,
            locationMode: privateItinerary ? 'participant_encrypted' : 'operator_memory',
            distanceKm: distance,
            durationMinutes: duration,
            stopCount: quotedStopCount,
            currency: fiatCurrency,
            surgeMultiplier: surge.multiplier,
            fares: { __default__: { sats: estimate.fare.sats, estimate }, ...pricedByOption },
        });

        res.json({
            ...estimate,
            // Rows in sats that sum to the quoted fare — the client renders
            // these instead of inventing percentages
            fareBreakdown: breakdownSats(estimate),
            options: classes,
            // Hand this back on request and the quoted fare is honoured
            // verbatim. Valid for QUOTE_TTL_MS, for THIS journey only.
            quote_id: quoteId,
            quote_expires_at: Date.now() + QUOTE_TTL_MS,
            // Same polyline the ride will carry, so the confirm screen shows
            // the road the price was calculated from
            routeGeometry: coordinates,
            routed,
            // Disclosed before the rider commits, never after
            surge: {
                multiplier: surge.multiplier,
                active: surge.multiplier > 1,
                reason: surge.reason || null,
                waiting: surge.waiting,
                available: surge.available
            },
            pickup,
            dropoff,
            location_mode: privateItinerary ? 'participant_encrypted' : 'operator_memory',
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
            GBP: await getBitcoinPrice('GBP'),
            KES: await getBitcoinPrice('KES')
        };

        res.json({
            prices,
            lastUpdate: Date.now(),
            source: 'CoinGecko + open.er-api.com (KES)'
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
        if (OPERATOR_DATA_MODE === 'blind') {
            return res.status(409).json({
                error: 'Route directly from the participant device in privacy mode'
            });
        }
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
                pickup_lat: suppliedPickupLat,
                pickup_lon: suppliedPickupLon,
                dropoff_lat: suppliedDropoffLat,
                dropoff_lon: suppliedDropoffLon,
                rider_npub,
                ride_id,
                fare_sats,
                currency,
                domain,
                scheduled_for,
                stops,
                women_only,
                access_needs,
                pickup_note,
                pickup_address,
                dropoff_address,
                option,
                preferred_providers,
                location_mode,
                pickup_cell,
                dropoff_cell,
                route_summary,
                stop_count,
                settlement_mode
            } = req.body;

            const privateItinerary = location_mode === 'participant_encrypted';
            if (OPERATOR_DATA_MODE === 'blind' && !privateItinerary) {
                return res.status(400).json({
                    error: 'This operator accepts participant-encrypted itineraries only'
                });
            }
            const settlementMode = normaliseSettlementMode(settlement_mode);
            if (!settlementMode) {
                return res.status(400).json({ error: 'settlement_mode must be priced or none' });
            }

            let pickup_lat = suppliedPickupLat;
            let pickup_lon = suppliedPickupLon;
            let dropoff_lat = suppliedDropoffLat;
            let dropoff_lon = suppliedDropoffLon;
            let privateSummary = null;
            let privateStopCount = 0;

            if (privateItinerary) {
                privateSummary = parseRouteSummary(route_summary, true);
                const pickupHash = typeof pickup_cell === 'string' ? pickup_cell.trim().toLowerCase() : '';
                const dropoffHash = typeof dropoff_cell === 'string' ? dropoff_cell.trim().toLowerCase() : '';
                if (!privateSummary) {
                    return res.status(400).json({ error: 'A valid routed route_summary is required' });
                }
                const validPickupCell = GEOHASH_CELL.test(pickupHash)
                    && pickupHash.length <= PRIVATE_LOCATION_PRECISION;
                const validDropoffCell = !dropoffHash || (
                    GEOHASH_CELL.test(dropoffHash)
                    && dropoffHash.length <= PRIVATE_LOCATION_PRECISION
                );
                if (!validPickupCell || !validDropoffCell) {
                    return res.status(400).json({
                        error: `pickup_cell and optional dropoff_cell must be geohashes no more precise than ${PRIVATE_LOCATION_PRECISION} characters`
                    });
                }
                privateStopCount = Number(stop_count || 0);
                if (!Number.isInteger(privateStopCount) || privateStopCount < 0 || privateStopCount > 3) {
                    return res.status(400).json({ error: 'stop_count must be an integer from 0 to 3' });
                }
                const pickupCentre = decodeGeohash(pickupHash);
                const dropoffCentre = dropoffHash ? decodeGeohash(dropoffHash) : null;
                pickup_lat = pickupCentre.lat;
                pickup_lon = pickupCentre.lon;
                dropoff_lat = dropoffCentre?.lat ?? null;
                dropoff_lon = dropoffCentre?.lon ?? null;
            }

            // Intermediate stops (multi-stop trips) — visited in order
            // between pickup and dropoff. Exact coordinates are PII: they
            // stay in memory and only ever leave as a count pre-accept.
            const parsedStops = privateItinerary ? { stops: null } : parseStops(stops);
            if (parsedStops.error) {
                return res.status(400).json({ error: parsedStops.error });
            }
            const rideStops = parsedStops.stops && parsedStops.stops.length > 0
                ? parsedStops.stops
                : null;

            // Pre-booked pickup time (unix ms). Anything inside the dispatch
            // lead window is treated as an immediate request.
            let scheduledFor = null;
            if (scheduled_for != null) {
                scheduledFor = Number(scheduled_for);
                if (!Number.isFinite(scheduledFor)) {
                    return res.status(400).json({ error: 'scheduled_for must be a unix timestamp in milliseconds' });
                }
                if (scheduledFor < Date.now() - 2 * 60 * 1000) {
                    return res.status(400).json({ error: 'scheduled_for is in the past' });
                }
                if (scheduledFor > Date.now() + SCHEDULE_MAX_ADVANCE_MS) {
                    return res.status(400).json({
                        error: `scheduled_for is too far ahead (maximum ${Math.round(SCHEDULE_MAX_ADVANCE_MS / 86400000)} days)`
                    });
                }
            }

            // Use request-specified domain profile if provided, else the server's startup profile
            const requestProfile = domain && domain !== domainProfile.id
                ? (() => { try { return loadProfile(domain); } catch { return domainProfile; } })()
                : domainProfile;

            const fiatCurrency = resolveFiatCurrency(currency);

            // Validate — dropoff is optional for single-location domains (e.g. locksmith)
            if (!isValidLat(pickup_lat) || !isValidLon(pickup_lon)) {
                return res.status(400).json({
                    error: 'pickup_lat/pickup_lon must be valid coordinates',
                    required: ['pickup_lat', 'pickup_lon']
                });
            }

            const dropoffProvided = dropoff_lat != null || dropoff_lon != null;
            if (requestProfile.features.requiresDestination || dropoffProvided) {
                if (requestProfile.features.requiresDestination && !dropoffProvided) {
                    return res.status(400).json({
                        error: 'Missing required parameters',
                        required: ['dropoff_lat', 'dropoff_lon']
                    });
                }
                if (dropoffProvided && (!isValidLat(dropoff_lat) || !isValidLon(dropoff_lon))) {
                    return res.status(400).json({
                        error: 'dropoff_lat/dropoff_lon must be valid coordinates'
                    });
                }
            }

            if (fare_sats != null && !isPositiveInt(fare_sats, 100000000)) {
                return res.status(400).json({ error: 'fare_sats must be a positive integer' });
            }

            // A real identity is required — a placeholder identity would
            // permanently lock the requester out of their own ride (403 on
            // cancel/rate/panic) once auth is on.
            const riderNpub = rider_npub;
            if (!riderNpub && !req.body.rider_pubkey) {
                return res.status(400).json({ error: 'rider_npub or rider_pubkey is required' });
            }
            const rideOptions = ride_id ? { rideId: ride_id } : {};
            const sessionForRide = ride_id ? activeRides.get(ride_id) : null;
            const riderPubkeyHex = (sessionForRide?.riderId || req.body.rider_pubkey || '').toLowerCase() || null;
            rideOptions.currency = fiatCurrency;
            rideOptions.domain = requestProfile.id;
            if (scheduledFor) {
                rideOptions.scheduledFor = scheduledFor;
            }
            if (rideStops) {
                rideOptions.stops = rideStops;
            }
            rideOptions.locationMode = privateItinerary
                ? 'participant_encrypted'
                : 'operator_memory';
            rideOptions.stopCount = privateItinerary ? privateStopCount : (rideStops?.length || 0);
            rideOptions.settlementMode = settlementMode;

            const hasDropoff = dropoff_lat && dropoff_lon;
            // Stops without a destination make no sense — quietly ignore them
            // for single-location domains rather than reject
            const routeVia = (hasDropoff && rideStops) ? rideStops : [];

            // Service class (Standard / Comfort / XL): scales the rate card
            const serviceOption = resolveServiceOption(option, requestProfile);

            // The SAME demand multiplier the quote used. Recomputing it here
            // is deliberate — surge moves with the market, and a quote taken
            // minutes ago must not silently reprice on tap. The client sends
            // back the multiplier it was shown; anything higher is refused
            // below, so the rider can only ever be charged what they saw.
            const liveSurge = surgeFor({ lat: pickup_lat, lon: pickup_lon });
            const quotedSurge = Number(req.body.surge_multiplier);
            const honouredSurge = Number.isFinite(quotedSurge) && quotedSurge > 0
                ? Math.min(liveSurge.multiplier, Math.max(1, quotedSurge))
                : liveSurge.multiplier;

            // Same path as the quote the rider just approved — see
            // routeAndPrice(). Do not inline routing here again.
            let distance;
            let duration;
            let routeCoordinates;
            let routed;
            let estimate;
            if (privateItinerary) {
                distance = privateSummary.distanceKm;
                duration = privateSummary.durationMinutes;
                routeCoordinates = null;
                routed = true;
                estimate = await estimateTripCost(
                    distance,
                    duration,
                    rateCardOptions(
                        fiatCurrency,
                        (serviceOption?.fareMultiplier || 1) * honouredSurge
                    )
                );
            } else {
                const priced = await routeAndPrice(
                    { lat: pickup_lat, lon: pickup_lon },
                    hasDropoff ? { lat: dropoff_lat, lon: dropoff_lon } : null,
                    routeVia, fiatCurrency,
                    (serviceOption?.fareMultiplier || 1) * honouredSurge
                );
                distance = priced.distance;
                duration = priced.duration;
                routeCoordinates = priced.coordinates;
                routed = priced.routed;
                estimate = priced.estimate;
            }
            if (!hasDropoff) {
                console.log(`📍 Single-location task — no route needed`);
            } else {
                console.log(privateItinerary
                    ? `🛣️  Client-routed summary: ${distance.toFixed(2)}km, ${Math.round(duration)} min; exact shape withheld`
                    : `🗺️  Using road routing: ${distance.toFixed(2)}km, ${Math.round(duration)} min, ${routeCoordinates.length} points`);
            }

            // The quote the rider actually approved, if they still hold one
            // for THIS journey. Honoured verbatim: the fiat rate card reaches
            // sats through a five-minute-cached BTC price, so re-deriving here
            // records a number the confirm screen never showed and then calls
            // it the agreed amount. An expired or mismatched quote falls back
            // to live pricing rather than failing the request.
            const heldQuote = redeemQuote(req.body.quote_id, {
                pickup: { lat: pickup_lat, lon: pickup_lon },
                dropoff: hasDropoff ? { lat: dropoff_lat, lon: dropoff_lon } : null,
                distanceKm: distance,
                durationMinutes: duration,
                stopCount: privateItinerary ? privateStopCount : (routeVia ? routeVia.length : 0),
                currency: fiatCurrency
            });
            // ...but only while the demand multiplier has not FALLEN. Those
            // are two different reasons the number can move: price-feed noise
            // (pin it, the rider approved that figure) and surge easing off
            // (re-price, the rider should get the cheaper one). Honouring the
            // quote blindly would turn the existing min(live, quoted) surge
            // protection into a floor.
            const surgeHeld = heldQuote == null
                || Math.abs((heldQuote.surgeMultiplier || 1) - honouredSurge) < 1e-9;
            const quotedFare = surgeHeld ? quotedFareFor(heldQuote, serviceOption?.id || null) : null;
            if (req.body.quote_id && !quotedFare) {
                console.log(heldQuote && !surgeHeld
                    ? `💱 Quote ${req.body.quote_id} superseded — demand eased since it was given, re-priced lower`
                    : `💱 Quote ${req.body.quote_id} not honoured (expired or different journey) — re-priced live`);
            }

            const estimatedFareSats = settlementMode === 'none'
                ? 0
                : fare_sats
                    ? parseInt(fare_sats, 10)
                    : (quotedFare ? quotedFare.sats : estimate.fare.sats);
            // Everything downstream (breakdown rows, the driver's card, the
            // receipt) reads the estimate, so it has to describe the fare
            // actually recorded — not the one we just declined to use.
            const pricedEstimate = quotedFare && !fare_sats ? quotedFare.estimate : estimate;

            // Create ride
            const dropoffLocation = hasDropoff ? { lat: dropoff_lat, lon: dropoff_lon } : null;
            const ride = rideManager.createRide(
                { npub: riderNpub, pubkey: riderPubkeyHex },
                { lat: pickup_lat, lon: pickup_lon },
                dropoffLocation,
                estimatedFareSats,
                rideOptions
            );
            ride.locationMode = rideOptions.locationMode;
            ride.stopCount = rideOptions.stopCount;
            ride.settlementMode = rideOptions.settlementMode;

            // Add route coordinates if available
            if (routeCoordinates) {
                ride.route = routeCoordinates;
            }

            if (rideOptions.rideId) {
                const session = activeRides.get(rideOptions.rideId);
                if (session) {
                    session.pickup = ride.pickup;
                    session.dropoff = ride.dropoff;
                    session.estimate = pricedEstimate;
                    session.route = routeCoordinates;
                    session.currency = fiatCurrency;
                }
            }

            ride.currency = fiatCurrency;
            // Kept in memory (never snapshotted) so deferred dispatch and the
            // open list can show the fare estimate without a session
            ride.estimate = pricedEstimate;

            // Women-only matching (self-declared, honesty-based). Deliberately
            // NOT in the Nostr snapshot: publishing the flag would tag a
            // pseudonym with special-category data on public relays forever.
            // Trade-off: the constraint is lost if the operator restarts
            // mid-request — the rider still has the driver identity, vehicle,
            // pickup code and ratings at match.
            // Access needs: requirements that filter WHO may take the job.
            // In memory for the life of the request and deliberately kept
            // out of the Nostr snapshot — health-adjacent data must never
            // reach a public relay, exactly like the women-only flag.
            const accessNeeds = privateItinerary
                ? []
                : sanitiseAccessNeeds(access_needs, requestProfile);
            if (accessNeeds.length > 0) {
                ride.accessNeeds = accessNeeds;
            }
            if (!privateItinerary && women_only === true) {
                ride.womenOnly = true;
            }

            // Meeting instructions for the provider ("black gate, side
            // entrance"). Participant-gated: in memory, never in a
            // pre-accept payload, never in the Nostr snapshot.
            if (!privateItinerary && typeof pickup_note === 'string' && pickup_note.trim()) {
                ride.pickupNote = pickup_note.trim().slice(0, PICKUP_NOTE_MAX_CHARS);
            }

            // Human-readable addresses. The requester already has these —
            // they searched for them — and without them the provider drives
            // to a pair of decimals and the receipt records a journey nobody
            // can read back. Full addresses ARE PII, so they are handled
            // exactly like the meeting note: participant-gated, in memory,
            // never in a pre-accept payload, never in the kind 30078
            // snapshot (which carries geohashes only).
            if (!privateItinerary && typeof pickup_address === 'string' && pickup_address.trim()) {
                ride.pickupAddress = pickup_address.trim().slice(0, ADDRESS_MAX_CHARS);
            }
            if (!privateItinerary && typeof dropoff_address === 'string' && dropoff_address.trim()) {
                ride.dropoffAddress = dropoff_address.trim().slice(0, ADDRESS_MAX_CHARS);
            }

            if (serviceOption) {
                ride.option = serviceOption.id;
            }

            // The multiplier the rider actually agreed to. Kept so a later
            // destination change re-prices on the SAME terms rather than
            // silently repricing at whatever the market is doing by then.
            if (honouredSurge > 1) {
                ride.surgeMultiplier = honouredSurge;
            }

            // Favourite providers get a short exclusive window. The list is
            // the rider's own, held in memory for this request only and
            // never snapshotted to relays.
            const preferred = !privateItinerary && Array.isArray(preferred_providers)
                ? preferred_providers
                    .filter((p) => typeof p === 'string' && /^[0-9a-f]{64}$/i.test(p.trim()))
                    .map((p) => p.trim().toLowerCase())
                    .slice(0, MAX_PREFERRED_PROVIDERS)
                : [];
            if (preferred.length > 0 && !scheduledFor) {
                ride.preferredProviders = preferred;
                ride.preferredUntil = Date.now() + FAVOURITE_HEAD_START_MS;
            }

            // The task manager persisted the base object at creation. Persist
            // once more after attaching privacy/settlement flags and the
            // participant-gated optional fields so snapshots reflect the
            // actual coordination contract.
            rideManager.persistRide(ride.id);

            // Broadcast to drivers within DISPATCH_RADIUS_KM of the pickup
            // Approximate location + no route pre-accept. In blind mode the
            // accepting driver gets the exact itinerary by NIP-17 from the
            // requester; managed mode discloses it through this operator.
            // A pre-booked ride outside the lead window is NOT broadcast yet —
            // the schedule sweep dispatches it when the window opens.
            const deferDispatch = scheduledFor
                && (scheduledFor - Date.now() > SCHEDULE_DISPATCH_LEAD_MS);

            let driverCount = 0;
            if (deferDispatch) {
                console.log(`🗓️  Ride ${ride.id} scheduled for ${new Date(scheduledFor).toISOString()} — dispatch deferred`);
            } else {
                ride.scheduleDispatched = true;
                driverCount = broadcastToDrivers({
                    type: 'ride_request',
                    ride: {
                        id: ride.id,
                        pickup: approximateLocation(ride.pickup),
                        dropoff: approximateLocation(ride.dropoff),
                        // Count only pre-accept — stop locations are PII
                        stopCount: ride.stopCount ?? (ride.stops ? ride.stops.length : 0),
                        fare: ride.fare,
                        settlementMode: ride.settlementMode || 'priced',
                        locationMode: ride.locationMode || 'operator_memory',
                        distance: distance,
                        estimatedFare: pricedEstimate,
                        currency: fiatCurrency,
                        scheduledFor: ride.scheduledFor || null,
                        womenOnly: ride.womenOnly === true,
                        accessNeeds: ride.accessNeeds || [],
                        option: ride.option || null
                        // No requester identity pre-accept — see
                        // dispatchScheduledRide() for why. This payload is
                        // the one GET /api/rides/open claims to mirror, and
                        // it used to be the odd one out: identity arrived on
                        // the live broadcast, then vanished when the 30 s
                        // open-list reconcile replaced the same job.
                    }
                }, ride.pickup, ride);

                console.log(`📢 Broadcast ride request ${ride.id} to ${driverCount} drivers`);

                // Backgrounded driver apps get a Web Push instead of the WS frame
                const pushed = pushRideRequestToOfflineDrivers(ride, pricedEstimate);
                if (pushed > 0) {
                    console.log(`🔔 Pushed ride request ${ride.id} to ${pushed} offline drivers`);
                }
            }

            res.json({
                success: true,
                ride_id: ride.id,
                status: ride.status,
                estimated_fare: estimatedFareSats,
                estimated_cost: pricedEstimate.fare.formatted,
                distance_km: distance,
                duration_minutes: Math.round(duration),
                drivers_notified: driverCount,
                scheduled_for: scheduledFor,
                stops: privateItinerary ? null : (ride.stops || null),
                stop_count: ride.stopCount || 0,
                location_mode: ride.locationMode,
                settlement_mode: ride.settlementMode,
                women_only: ride.womenOnly === true,
                access_needs: ride.accessNeeds || [],
                option: ride.option || null,
                // What was actually applied — never more than the rider saw
                surge_multiplier: honouredSurge,
                favourites_first: inFavouriteWindow(ride),
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
        const { driver_npub, driver_name, driver_pubkey } = req.body;

        if (nip98Enabled && req.user && !actorMatchesIdentity(req.user, { pubkey: driver_pubkey, npub: driver_npub })) {
            return res.status(403).json({
                error: 'Forbidden',
                details: 'Signer does not match the accepting driver identity'
            });
        }

        // Normalise and validate the location BEFORE any state mutation —
        // a throw after acceptRide left the ride stuck with a driver
        // assigned and the client seeing a failure. Accept lng or lon.
        let driver_location = null;
        const rawLoc = req.body.driver_location;
        if (rawLoc) {
            const lon = rawLoc.lon != null ? rawLoc.lon : rawLoc.lng;
            if (!isValidLat(rawLoc.lat) || !isValidLon(lon)) {
                return res.status(400).json({ error: 'driver_location must contain valid lat and lon/lng' });
            }
            driver_location = { lat: Number(rawLoc.lat), lon: Number(lon) };
        }

        // Vehicle details — what the rider looks for at the kerb. Free
        // text, capped. Participant-gated PII: lives in-memory on the
        // ride only (never broadcast, never snapshotted).
        let vehicle = null;
        const rawVehicle = req.body.vehicle;
        if (rawVehicle && typeof rawVehicle === 'object') {
            const field = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : null);
            vehicle = {
                make: field(rawVehicle.make),
                model: field(rawVehicle.model),
                colour: field(rawVehicle.colour),
                registration: field(rawVehicle.registration)
            };
            if (!vehicle.make && !vehicle.model && !vehicle.colour && !vehicle.registration) {
                vehicle = null;
            }
        }

        // Women-only pairing: enforce the contract explicitly so an
        // ordinary driver gets a clear refusal, not a race loss. Gender is
        // self-attested (pseudonymous system) — the claim comes from the
        // accept body or the driver's registered presence.
        const pendingRide = rideManager.getRide(rideId);
        if (pendingRide?.locationMode === 'participant_encrypted') {
            vehicle = null;
        }
        if (driver_location && pendingRide?.locationMode === 'participant_encrypted') {
            const cell = encodeGeohash(
                driver_location.lat, driver_location.lon, PRIVATE_LOCATION_PRECISION
            );
            const centre = decodeGeohash(cell);
            driver_location = { lat: centre.lat, lon: centre.lon };
        }
        if (pendingRide?.womenOnly) {
            const claimed = sanitiseGender(req.body.gender)
                || getDriverPresence(driver_npub || driver_pubkey)?.gender
                || null;
            if (claimed !== 'woman') {
                return res.status(403).json({
                    error: 'Women-only request',
                    details: 'The requester asked to be matched only with drivers who have declared they are women.'
                });
            }
        }

        // Access needs: fail closed at accept too, so a driver who slipped
        // past dispatch (stale presence, a replayed payload) still cannot
        // take a job they cannot serve. The person waiting has no fallback.
        if (Array.isArray(pendingRide?.accessNeeds) && pendingRide.accessNeeds.length > 0) {
            const acceptProfileForAccess = rideManager.getProfileForRide(rideId) || domainProfile;
            const declared = sanitiseAccessNeeds(
                req.body.access_features, acceptProfileForAccess
            );
            const presenceFeatures = getDriverPresence(driver_npub || driver_pubkey)?.accessFeatures || [];
            const claimed = declared.length > 0 ? declared : presenceFeatures;
            const missing = pendingRide.accessNeeds.filter((n) => !claimed.includes(n));
            if (missing.length > 0) {
                const labels = (acceptProfileForAccess.accessOptions || [])
                    .filter((o) => missing.includes(o.id))
                    .map((o) => o.label);
                return res.status(403).json({
                    error: 'Access needs not met',
                    details: `This request needs: ${labels.join(', ') || missing.join(', ')}. Declare these on your profile if your vehicle can provide them.`,
                    missing
                });
            }
        }

        // A head start other drivers can out-tap is not a head start
        if (inFavouriteWindow(pendingRide) && !isPreferredProvider(pendingRide, driver_pubkey)) {
            return res.status(403).json({
                error: 'Reserved for the requester\'s saved providers',
                details: 'This job opens to everyone shortly — it is held for the requester\'s favourites first.',
                opens_in_seconds: Math.max(0, Math.ceil((pendingRide.preferredUntil - Date.now()) / 1000))
            });
        }

        // Service class: an XL request must not land with a hatchback
        if (pendingRide?.option) {
            const declared = sanitiseServiceOptions(
                req.body.service_options,
                rideManager.getProfileForRide(rideId)
            );
            const presence = getDriverPresence(driver_npub || driver_pubkey);
            const entry = declared && declared.length > 0
                ? { serviceOptions: declared }
                : presence;
            if (!optionEligible(entry, pendingRide)) {
                return res.status(403).json({
                    error: 'Vehicle class not declared',
                    details: `This request asked for '${pendingRide.option}'. Declare that class on your vehicle to take it.`
                });
            }
        }

        // What this provider declares they hold. Shown to the requester at
        // match; never verified here and never presented as verified.
        const acceptProfileForCreds = rideManager.getProfileForRide(rideId) || domainProfile;
        const credentials = pendingRide?.locationMode === 'participant_encrypted'
            ? []
            : sanitiseCredentials(req.body.credentials, acceptProfileForCreds);
        const admission = evaluateDriverAdmission(operatorPolicy, {
            pubkey: driver_pubkey,
            npub: driver_npub,
            credentials,
            requiredCredentials: requiredCredentialIds(acceptProfileForCreds)
        });
        if (!admission.allowed) {
            if (admission.missingAllowlist) {
                return res.status(403).json({
                    error: 'Driver not admitted by this operator',
                    details: 'This operator accepts drivers from its own roster. Ask the operator to add this driver identity.'
                });
            }
            if (admission.missingCredentials.length > 0) {
                const missing = admission.missingCredentials;
                const labels = (acceptProfileForCreds.credentials || [])
                    .filter((c) => missing.includes(c.id))
                    .map((c) => c.label);
                return res.status(403).json({
                    error: 'Required credentials not declared',
                    details: `This operator requires: ${labels.join(', ') || missing.join(', ')}. Declare them (with expiry dates) on your profile.`,
                    missing
                });
            }
        }

        // Note: any driver_rating in the body is deliberately ignored — a
        // rating is never self-reported. Clients read the counterparty's
        // aggregated signed ratings from GET /api/reputation/:npub.
        const ride = rideManager.acceptRide(rideId, driver_npub, {
            name: driver_name,
            location: driver_location,
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

        if (vehicle) {
            ride.vehicle = vehicle;
        }
        if (credentials.length > 0) {
            ride.providerCredentials = credentials;
        }

        // Start en route
        rideManager.startEnRoute(rideId);

        // Calculate driver-to-pickup route using OSRM. Missing location or
        // a routing failure must never fail the accept — the assignment
        // already happened.
        let driverRoute = null;
        let driverToPickupRoute = null;
        const driverPickupDistanceKm = driver_location
            ? calculateDistance(
                driver_location.lat, driver_location.lon,
                ride.pickup.lat, ride.pickup.lon
            )
            : null;
        // Routers can snap two nearly identical points to opposite road
        // segments and return an absurd multi-hour loop. At the kerb the
        // honest ETA is simply "about a minute" and no route is needed.
        const alreadyAtPickup = driverPickupDistanceKm != null && driverPickupDistanceKm <= 0.1;
        if (driver_location && !alreadyAtPickup) {
            try {
                driverToPickupRoute = await getRoute(
                    driver_location.lat,
                    driver_location.lon,
                    ride.pickup.lat,
                    ride.pickup.lon
                );
            } catch (routeError) {
                console.warn(`Route calculation failed for ${rideId}:`, safeErrorMessage(routeError));
            }
        }

        if (driverToPickupRoute) {
            driverRoute = driverToPickupRoute.coordinates;
        }

        // Calculate ETA
        const eta = alreadyAtPickup
            ? 60
            : driverToPickupRoute
                ? driverToPickupRoute.duration  // Use OSRM duration in seconds
                : (driver_location ? rideManager.calculateETA(driver_location, ride.pickup) : null);

        // Notify rider with driver route (emit both legacy and generic event types)
        const matchPayload = {
            id: ride.id,
            status: ride.status,
            driver: ride.driver,
            vehicle: ride.vehicle || null,
            eta_seconds: eta,
            driver_route: driverRoute  // Route from driver to pickup
        };
        broadcastToRide(rideId, { type: 'ride_matched', ride: matchPayload });
        broadcastToRide(rideId, { type: 'task_matched', task: matchPayload });

        // …and reach the rider's lock screen, not just an open socket
        const acceptProfile = rideManager.getProfileForRide(rideId);
        const providerNoun = acceptProfile.roles.provider;
        pushToParticipant(ride, ride.requester || ride.rider, {
            title: `Your ${providerNoun} is on the way`,
            body: [describeVehicleText(ride.vehicle), eta ? `about ${Math.max(1, Math.round(eta / 60))} min away` : null]
                .filter(Boolean).join(' · ') || 'Open DonkeyRide for details',
            url: '/request/active'
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
        const ride = rideManager.getRide(rideId);

        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }

        const authErr = authoriseRideActor(req, ride, ['provider']);
        if (authErr) {
            return res.status(authErr.status).json(authErr);
        }
        if (ride.locationMode === 'participant_encrypted') {
            return res.status(409).json({
                error: 'Live location is disabled for participant-encrypted tasks'
            });
        }

        const lat = req.body.lat;
        const lon = req.body.lon != null ? req.body.lon : req.body.lng;

        if (!isValidLat(lat) || !isValidLon(lon)) {
            return res.status(400).json({ error: 'lat and lon/lng must be valid coordinates' });
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

/**
 * Move the pickup point — the rider walked.
 *
 * People do not stand still while a car comes to them: they leave the
 * pub, cross to a legal kerb, or dropped the pin on the wrong side of a
 * dual carriageway. The point stays editable until the provider
 * arrives.
 *
 * Policy: requester only. Before a provider commits, the pickup may move
 * anywhere and the fare is re-estimated. Once a provider has committed,
 * the move is capped at PICKUP_ADJUST_MAX_KM (they agreed to drive to a
 * place, not to a different town) and the AGREED FARE IS NEVER CHANGED —
 * a short walk must not re-price the job in either direction. The route
 * is recalculated either way so navigation stays honest.
 */
app.post('/api/rides/:rideId/pickup', async (req, res) => {
    try {
        const { rideId } = req.params;
        const lat = req.body.lat;
        const lon = req.body.lon != null ? req.body.lon : req.body.lng;
        // A note alone is a valid update ("black gate, side entrance")
        const noteOnly = lat == null && lon == null && req.body.note !== undefined;

        if (!noteOnly && (!isValidLat(lat) || !isValidLon(lon))) {
            return res.status(400).json({ error: 'lat and lon/lng must be valid coordinates' });
        }

        const ride = rideManager.getRide(rideId);
        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }
        const authErr = authoriseRideActor(req, ride, ['requester']);
        if (authErr) {
            return res.status(authErr.status).json(authErr);
        }
        if (ride.locationMode === 'participant_encrypted') {
            return res.status(409).json({
                error: 'Pickup changes stay participant-to-participant in privacy mode'
            });
        }

        const rideProfile = rideManager.getProfileForRide(rideId);
        const states = rideProfile.states.values;

        // Once the provider is at the kerb (or the job is under way, or
        // over), the pickup is history — not a setting.
        const movableStates = [states.REQUESTED, states.MATCHED, states.PROVIDER_EN_ROUTE]
            .filter(Boolean);
        if (!movableStates.includes(ride.status)) {
            return res.status(409).json({
                error: 'Pickup can no longer be changed',
                details: `The ${rideProfile.roles.provider} has already arrived or the ${rideProfile.labels?.taskNoun || 'task'} is under way`,
                status: ride.status
            });
        }

        const newPickup = noteOnly
            ? { lat: ride.pickup.lat, lon: ride.pickup.lon }
            : { lat: Number(lat), lon: Number(lon) };
        const movedKm = calculateDistance(ride.pickup.lat, ride.pickup.lon, newPickup.lat, newPickup.lon);
        const matched = Boolean(ride.driver || ride.provider);

        // Meeting instructions ("black gate, side entrance, blue coat").
        // Participant-gated free text: in memory only, never broadcast
        // pre-accept and never snapshotted to relays. '' clears it.
        let note;
        if (req.body.note !== undefined) {
            note = typeof req.body.note === 'string' && req.body.note.trim()
                ? req.body.note.trim().slice(0, PICKUP_NOTE_MAX_CHARS)
                : null;
        }

        if (matched && movedKm > PICKUP_ADJUST_MAX_KM) {
            return res.status(400).json({
                error: 'New pickup is too far from the agreed one',
                details: `Move it by at most ${PICKUP_ADJUST_MAX_KM} km once a ${rideProfile.roles.provider} has committed, or cancel and request again`,
                moved_km: Math.round(movedKm * 100) / 100,
                max_km: PICKUP_ADJUST_MAX_KM
            });
        }

        const address = typeof req.body.address === 'string' && req.body.address.trim()
            ? req.body.address.trim().slice(0, 200)
            : undefined;

        // Recalculate the route from the new pickup so both apps navigate
        // to the right place. Pre-accept the fare follows the route;
        // post-accept the agreed fare stands.
        const fiatCurrency = resolveFiatCurrency(ride.currency);
        let distance = 0;
        let duration = 0;
        let routeCoordinates = null;

        if (ride.dropoff && !noteOnly) {
            const routeVia = Array.isArray(ride.stops) ? ride.stops : [];
            const osrmRoute = await getRoute(
                newPickup.lat, newPickup.lon, ride.dropoff.lat, ride.dropoff.lon, routeVia
            );
            if (osrmRoute) {
                distance = parseFloat(osrmRoute.distanceKm);
                duration = osrmRoute.durationMin;
                routeCoordinates = osrmRoute.coordinates;
            } else {
                const error = new Error('Road routing is unavailable; pickup was not changed');
                error.code = 'ROAD_ROUTING_UNAVAILABLE';
                throw error;
            }
        }

        // A note-only edit touches neither the route nor the price
        const estimate = noteOnly
            ? (ride.estimate || null)
            : await estimateTripCost(distance, duration, rateCardOptions(fiatCurrency));

        const updated = rideManager.updatePickup(rideId, newPickup, {
            ...(address !== undefined ? { address } : {}),
            ...(note !== undefined ? { note } : {}),
            ...(routeCoordinates ? { route: routeCoordinates } : {}),
            ...(noteOnly ? {} : { distanceKm: distance, durationMin: Math.round(duration) }),
            // Never re-price a committed job
            ...(matched || noteOnly ? {} : { fare: estimate.fare.sats })
        });
        if (estimate) {
            updated.estimate = estimate;
        }

        const session = activeRides.get(rideId);
        if (session && !noteOnly) {
            session.pickup = updated.pickup;
            session.estimate = estimate;
            session.route = routeCoordinates;
        }

        // Managed-mode only (privacy tasks were rejected above): tell the
        // committed provider over the participant-gated ride socket.
        if (matched) {
            broadcastToRide(rideId, {
                type: 'pickup_updated',
                ride_id: rideId,
                pickup: updated.pickup,
                ...(address ? { address } : {}),
                ...(note !== undefined ? { note: updated.pickupNote || null } : {}),
                moved_m: Math.round(movedKm * 1000),
                note_only: noteOnly,
                route: routeCoordinates
            });
            // A driver already turning into the old street needs this even
            // with the app in their pocket
            pushToParticipant(updated, updated.provider || updated.driver, {
                title: noteOnly
                    ? `${rideProfile.roles.requester} added a note`
                    : `${rideProfile.labels?.originLabel || 'Pickup'} moved`,
                body: noteOnly
                    ? (updated.pickupNote || 'Open DonkeyRide for details')
                    : (address || `The ${rideProfile.roles.requester} moved it ${Math.round(movedKm * 1000)} m`),
                url: '/provide/active'
            });
        }

        console.log(`📍 Ride ${rideId}: ${noteOnly ? 'note updated' : `rider moved pickup ${Math.round(movedKm * 1000)}m`}${matched ? ' (provider notified)' : ''}`);

        res.json({
            success: true,
            ride: updated,
            moved_m: Math.round(movedKm * 1000),
            repriced: !matched && !noteOnly,
            estimate
        });

    } catch (error) {
        console.error('Error updating pickup:', error);
        res.status(500).json({
            error: 'Failed to update pickup',
            details: error.message
        });
    }
});

/**
 * Change the destination (and/or the calling points) of a live task.
 *
 * The pickup endpoint above deliberately freezes the fare once a provider
 * has committed: the requester walks a few metres and the agreed number
 * must stand. A destination change is the opposite case — it is different
 * work, over a different route, and pretending otherwise would either
 * short the provider or overcharge the requester. So this RE-PRICES, on
 * the same terms the requester originally agreed (their service class and
 * the demand multiplier they accepted at booking, never today's), carries
 * any waiting charge across untouched, and tells the provider loudly.
 *
 * `preview: true` prices the change without applying it, so the requester
 * sees the new number BEFORE they commit to it.
 */
app.post('/api/rides/:rideId/dropoff', async (req, res) => {
    try {
        const { rideId } = req.params;
        const lat = req.body.lat;
        const lon = req.body.lon != null ? req.body.lon : req.body.lng;
        // Adding or removing a calling point is a valid change on its own
        const stopsOnly = lat == null && lon == null && req.body.stops !== undefined;

        if (!stopsOnly && (!isValidLat(lat) || !isValidLon(lon))) {
            return res.status(400).json({ error: 'lat and lon/lng must be valid coordinates' });
        }

        const ride = rideManager.getRide(rideId);
        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }

        const authErr = authoriseRideActor(req, ride, ['requester']);
        if (authErr) {
            return res.status(authErr.status).json(authErr);
        }
        if (ride.locationMode === 'participant_encrypted') {
            return res.status(409).json({
                error: 'Destination changes stay participant-to-participant in privacy mode'
            });
        }

        const rideProfile = rideManager.getProfileForRide(rideId);
        if (rideProfile.features?.requiresDestination === false) {
            return res.status(400).json({
                error: 'This service has no destination to change',
                domain: rideProfile.id
            });
        }
        if (!ride.dropoff && stopsOnly) {
            return res.status(400).json({ error: 'This task has no destination yet' });
        }

        // Changeable right up until the job is finished — the whole point is
        // that plans change mid-journey.
        if ((rideProfile.states.terminal || []).includes(ride.status)) {
            return res.status(409).json({
                error: 'Destination can no longer be changed',
                details: `This ${rideProfile.labels?.taskNoun || 'task'} has already ended`,
                status: ride.status
            });
        }

        const parsed = parseStops(req.body.stops);
        if (parsed.error) {
            return res.status(400).json({ error: parsed.error });
        }
        const newStops = req.body.stops !== undefined
            ? parsed.stops
            : (Array.isArray(ride.stops) ? ride.stops : []);

        const newDropoff = stopsOnly
            ? { lat: ride.dropoff.lat, lon: ride.dropoff.lon }
            : { lat: Number(lat), lon: Number(lon) };
        const movedKm = ride.dropoff
            ? calculateDistance(ride.dropoff.lat, ride.dropoff.lon, newDropoff.lat, newDropoff.lon)
            : 0;

        const address = typeof req.body.address === 'string' && req.body.address.trim()
            ? req.body.address.trim().slice(0, 200)
            : undefined;

        // Same rate card the requester agreed to: their class, and the
        // multiplier disclosed at booking rather than the live one.
        const fiatCurrency = resolveFiatCurrency(ride.currency);
        const serviceOption = resolveServiceOption(ride.option, rideProfile);
        const agreedMultiplier = (serviceOption?.fareMultiplier || 1)
            * (Number.isFinite(ride.surgeMultiplier) && ride.surgeMultiplier > 1
                ? ride.surgeMultiplier : 1);

        const { distance, duration, coordinates: routeCoordinates, routed, estimate: livePricing } =
            await routeAndPrice(
                ride.pickup, newDropoff, newStops, fiatCurrency, agreedMultiplier
            );

        // Waiting already accrued is not part of the route — carry it over
        // rather than quietly refunding it with a change of plan.
        const waitingSats = ride.waiting?.sats || 0;
        const previousFare = ride.fare || 0;

        // The preview exists so the rider taps a second time on a number they
        // have SEEN. Pricing the preview and the change independently breaks
        // exactly that: both go through routeAndPrice, and the fiat rate card
        // reaches sats through a five-minute-cached BTC price, so a rider who
        // read "24,882 sats" was charged 24,888. Same remedy as the booking
        // quote — the preview mints one, the change spends it.
        const journey = {
            pickup: ride.pickup,
            dropoff: newDropoff,
            stopCount: newStops ? newStops.length : 0,
            currency: fiatCurrency
        };

        if (req.body.preview === true) {
            // Price it live and remember that price. Nothing is applied.
            const quoteId = rememberQuote({
                ...journey,
                // Already agreed on this ride, so it cannot move underneath
                // the rider between seeing the number and accepting it.
                surgeMultiplier: agreedMultiplier,
                fares: { __default__: { sats: livePricing.fare.sats, estimate: livePricing } }
            });
            const previewFare = livePricing.fare.sats + waitingSats;
            return res.json({
                success: true,
                preview: true,
                quote_id: quoteId,
                quote_expires_at: Date.now() + QUOTE_TTL_MS,
                fare_sats: previewFare,
                previous_fare_sats: previousFare,
                fare_change_sats: previewFare - previousFare,
                distance_km: distance,
                duration_minutes: Math.round(duration),
                moved_m: Math.round(movedKm * 1000),
                routed,
                estimate: livePricing
            });
        }

        // Applying: honour the previewed price if the rider still holds it for
        // THIS destination, otherwise price live (an expired preview must not
        // cost them the change).
        const heldChange = quotedFareFor(redeemQuote(req.body.quote_id, journey), null);
        if (req.body.quote_id && !heldChange) {
            console.log(`💱 Dropoff preview ${req.body.quote_id} not honoured (expired or different destination) — re-priced live`);
        }
        const estimate = heldChange ? heldChange.estimate : livePricing;
        const newFare = estimate.fare.sats + waitingSats;

        const updated = rideManager.updateDropoff(rideId, newDropoff, {
            ...(address !== undefined ? { address } : {}),
            ...(req.body.stops !== undefined ? { stops: newStops } : {}),
            ...(routeCoordinates ? { route: routeCoordinates } : {}),
            distanceKm: distance,
            durationMin: Math.round(duration),
            fare: newFare
        });
        updated.estimate = estimate;

        const session = activeRides.get(rideId);
        if (session) {
            session.dropoff = updated.dropoff;
            session.estimate = estimate;
            session.route = routeCoordinates;
        }

        const matched = Boolean(ride.driver || ride.provider);
        if (matched) {
            broadcastToRide(rideId, {
                type: 'dropoff_updated',
                ride_id: rideId,
                dropoff: updated.dropoff,
                ...(address ? { address } : {}),
                stops: updated.stops || [],
                moved_m: Math.round(movedKm * 1000),
                fare_sats: newFare,
                previous_fare_sats: previousFare,
                distance_km: distance,
                duration_minutes: Math.round(duration),
                route: routeCoordinates
            });
            // The provider may already be driving the old route
            pushToParticipant(updated, updated.provider || updated.driver, {
                title: `${rideProfile.labels?.destinationLabel || 'Destination'} changed`,
                body: address
                    || `The ${rideProfile.roles.requester} changed where this ${rideProfile.labels?.taskNoun || 'task'} ends`,
                url: '/provide/active'
            });
        }

        console.log(`🏁 Ride ${rideId}: destination changed (${previousFare} → ${newFare} sats)${matched ? ' (provider notified)' : ''}`);

        res.json({
            success: true,
            ride: updated,
            moved_m: Math.round(movedKm * 1000),
            fare_sats: newFare,
            previous_fare_sats: previousFare,
            fare_change_sats: newFare - previousFare,
            distance_km: distance,
            duration_minutes: Math.round(duration),
            estimate
        });

    } catch (error) {
        console.error('Error updating destination:', error);
        res.status(500).json({
            error: 'Failed to update destination',
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

        const arriveProfile = rideManager.getProfileForRide(rideId);
        pushToParticipant(ride, ride.requester || ride.rider, {
            title: `Your ${arriveProfile.roles.provider} is here`,
            body: describeVehicleText(ride.vehicle) || 'Head out to your pickup point',
            url: '/request/active'
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

        // Transition first: an illegal start must never reach the pricing
        // below (a second /start would otherwise stack another charge).
        const ride = rideManager.startTrip(rideId);

        // Waiting time — Mode A, no custody involved.
        //
        // A provider who sat at the kerb for twelve minutes did real work.
        // The operator holds no money, so this is not a "charge" it can
        // levy: it simply recalculates the number BOTH parties see and
        // settle peer-to-peer, using the same per-minute rate as the fare
        // and only past the free waiting period. Transparent by design —
        // the rider sees the timer running before it costs anything.
        const arrivedAt = ride.timestamps?.providerArrived
            || ride.timestamps?.driverArrived
            || null;
        if (arrivedAt && !ride.waiting && FREE_WAITING_MINUTES >= 0) {
            const waitedMinutes = (Date.now() - arrivedAt) / 60000;
            const chargeable = Math.max(0, waitedMinutes - FREE_WAITING_MINUTES);
            if (chargeable >= 1) {
                const currency = resolveFiatCurrency(ride.currency);
                const card = rateCardOptions(currency);
                // Time component only: no base fare, no distance
                const waitingCost = await estimateTripCost(0, chargeable, {
                    ...card, baseFare: 0, perKm: 0
                });
                const waitingSats = waitingCost.fare.sats;
                if (waitingSats > 0) {
                    ride.waiting = {
                        minutes: Math.round(chargeable),
                        sats: waitingSats,
                        freeMinutes: FREE_WAITING_MINUTES
                    };
                    ride.fare = (ride.fare || 0) + waitingSats;
                    rideManager.persistRide(rideId);
                    console.log(`⏱️  Ride ${rideId}: ${Math.round(chargeable)} min waiting added (${waitingSats} sats)`);
                }
            }
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

        // With auth on, who cancelled is the signer — the body cannot pin
        // the cancellation (and any stake penalty) on the other party.
        const actualCancelledBy = (nip98Enabled && req.user)
            ? (req.user.pubkey || '').toLowerCase()
            : (cancelledBy || 'unknown');

        // Which side cancelled decides which vocabulary applies: a rider
        // cannot claim "vehicle problem" and a driver cannot claim "found
        // another way".
        const requesterPubkey = (ride.requester?.pubkey || ride.rider?.pubkey || '').toLowerCase();
        const cancellingSide = actualCancelledBy === requesterPubkey ? 'requester' : 'provider';
        const rawReasonCode = req.body?.reason_code != null
            ? req.body.reason_code
            : req.body?.reasonCode;
        // The no-show flow predates the vocabulary and sends reason:'no_show'
        const reasonCode = sanitiseCancellationReason(rawReasonCode, cancellingSide)
            || (reason === 'no_show' ? 'no_show' : null);

        // Task-flow stakes: the cancelling party's stake is forfeited, the
        // other party's is released. LND hodl stakes are all-or-nothing.
        if (ride.stakes) {
            const requesterHex = (ride.requester?.pubkey || ride.rider?.pubkey || '').toLowerCase();
            const cancellerSide = actualCancelledBy === requesterHex ? 'requester' : 'provider';
            for (const [side, stake] of Object.entries(ride.stakes)) {
                if (!stake?.locked || stake.released || stake.forfeited) {
                    continue;
                }
                const stakeType = side === 'requester' ? 'rider' : 'driver';
                try {
                    if (side === cancellerSide) {
                        const forfeit = await stakeManager.forfeitStake(
                            `${rideId}_${stakeType}`, actualCancelledBy, `${stakeType}_cancelled`
                        );
                        stake.forfeited = true;
                        stakeEvents.publishStakePenalty({
                            rideId,
                            role: stakeType,
                            reason: `${stakeType}_cancelled`,
                            penalty: forfeit?.penalty || 0,
                            refund: forfeit?.refund || 0,
                            providerEvent: forfeit?.event,
                            currency: 'SAT',
                            trustModel: stakeManager.currentProvider?.getTrustModel() || 'unknown'
                        }).catch((err) => console.warn(`Failed to publish ${side} stake penalty for ${rideId}:`, err.message));
                    } else {
                        const release = await stakeManager.releaseStake(`${rideId}_${stakeType}`);
                        stake.released = true;
                        stakeEvents.publishStakeRelease({
                            rideId,
                            role: stakeType,
                            amount: stake.amount,
                            providerEvent: release?.event,
                            reason: 'cancelled',
                            currency: 'SAT',
                            trustModel: stakeManager.currentProvider?.getTrustModel() || 'unknown'
                        }).catch((err) => console.warn(`Failed to publish ${side} stake release for ${rideId}:`, err.message));
                    }
                } catch (stakeError) {
                    console.error(`Stake handling failed during cancel of ${rideId} (${side}):`, stakeError.message);
                }
            }
        }

        // Was this a late cancellation — one that actually cost the other
        // party something?
        //
        // Mode A holds no money, so there is no fee to levy and none is
        // levied. What there IS, is a fact worth recording: somebody was
        // committed to and then dropped. Three things must all be true, so
        // that ordinary behaviour is never marked:
        //   - a provider had committed (nobody is wronged by cancelling a
        //     request that no one has taken)
        //   - the grace window has passed (changing your mind seconds after
        //     matching is not a late cancellation)
        //   - the job had not started (mid-trip is a different problem)
        const matchedAt = ride.timestamps?.matched || null;
        const lateCancellation = Boolean(
            matchedAt
            && !ride.timestamps?.started
            && Date.now() - matchedAt > CANCEL_GRACE_MS
        );

        const cancelled = rideManager.cancelRide(
            rideId,
            actualCancelledBy,
            clampText(reason, 200) || reasonCode || 'No reason given'
        );
        // In-memory only, like every other participant-gated fact: it exists
        // to tell the wronged party they may record it, not to build an
        // operator-held disciplinary record.
        cancelled.lateCancellation = lateCancellation;
        if (reasonCode) {
            cancelled.cancellationReasonCode = reasonCode;
            cancelled.cancelledSide = cancellingSide;
        }
        finalizeRideSession(rideId, 'cancelled');

        const cancelPayload = {
            ride_id: rideId,
            task_id: rideId,
            reason: reason || null,
            // The structured half: a fixed code the other app can act on
            reason_code: reasonCode,
            cancelled_side: reasonCode ? cancellingSide : null,
            cancelled_by: cancelledBy || null,
            // Whether the OTHER party has grounds to record this against the
            // canceller. Reported, never asserted: the operator states the
            // fact, the wronged party decides whether to publish anything.
            late_cancellation: cancelled.lateCancellation === true
        };
        broadcastToRide(rideId, { type: 'ride_cancelled', ...cancelPayload });
        broadcastToRide(rideId, { type: 'task_cancelled', ...cancelPayload });

        // The party who did NOT cancel needs to hear about it even with
        // the app shut — they may be walking to a kerb right now
        const cancelProfile = rideManager.getProfileForRide(rideId);
        const requesterId = ride.requester || ride.rider;
        const providerId = ride.provider || ride.driver;
        const cancelledByRequester = actualCancelledBy === (requesterId?.pubkey || '').toLowerCase();
        // Say why, when there is a why — "cancelled" alone leaves the other
        // party guessing whether they did something wrong
        const why = reasonCode ? CANCELLATION_REASON_TEXT[reasonCode] : null;
        if (cancelledByRequester) {
            pushToParticipant(cancelled, providerId, {
                title: `${cancelProfile.labels?.taskNoun || 'Job'} cancelled`,
                body: why
                    ? `The ${cancelProfile.roles.requester} cancelled: ${why}`
                    : `The ${cancelProfile.roles.requester} cancelled — you are free for the next one`,
                url: '/provide'
            });
        } else {
            pushToParticipant(cancelled, requesterId, {
                title: `Your ${cancelProfile.labels?.taskNoun || 'task'} was cancelled`,
                body: why
                    ? `The ${cancelProfile.roles.provider} cancelled: ${why}`
                    : `The ${cancelProfile.roles.provider} cancelled. Request another when you're ready.`,
                url: '/request'
            });
        }

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

        // Metadata is caller-supplied: cap its size and depth rather than
        // spreading arbitrary payloads into the task record and history.
        let safeMetadata = {};
        if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
            const serialised = JSON.stringify(metadata);
            if (serialised.length > 4096) {
                return res.status(400).json({ error: 'metadata too large (4KB max)' });
            }
            safeMetadata = metadata;
        }

        rideManager.transitionTo(rideId, targetState, safeMetadata);

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

        const rawPanicLocation = req.body.location;
        let panicLocation = rawPanicLocation
            && isValidLat(rawPanicLocation.lat)
            && isValidLon(rawPanicLocation.lon ?? rawPanicLocation.lng)
            ? { lat: rawPanicLocation.lat, lon: rawPanicLocation.lon ?? rawPanicLocation.lng }
            : null;
        if (panicLocation && ride.locationMode === 'participant_encrypted') {
            const centre = decodeGeohash(encodeGeohash(
                panicLocation.lat, panicLocation.lon, PRIVATE_LOCATION_PRECISION
            ));
            panicLocation = { lat: centre.lat, lon: centre.lon };
        }

        const publishResult = await reputation.publishPanic(event, ride);


        try {
            ride.safety = ride.safety || { panicEvents: [], checkIns: [] };
            ride.safety.panicEvents = ride.safety.panicEvents || [];
            ride.safety.panicEvents.push({
                eventId: event.id,
                role: publishResult.role,
                pubkey: event.pubkey,
                note: event.content || '',
                tags: event.tags || [],
                location: panicLocation,
                createdAt: (event.created_at || Math.floor(Date.now() / 1000)) * 1000,
                cachedLocally: !!publishResult.cachedLocally,
                relayStatuses: publishResult.relayStatuses || []
            });
        } catch (recordError) {
            console.warn(`Failed to append panic event for ride ${rideId}:`, recordError.message);
        }

        // Participant-gated socket. Managed mode can carry the exact point;
        // privacy mode carries the same coarse cell as the signed event.
        broadcastToRide(rideId, {
            type: 'panic_alert',
            ride_id: rideId,
            initiated_by: event.pubkey,
            triggered_by: event.pubkey,
            role: publishResult.role,
            content: event.content,
            tags: event.tags,
            location: panicLocation,
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
        if (ride.safety.checkIns.length >= 100) {
            return res.status(400).json({ error: 'Check-in limit reached for this task' });
        }
        ride.safety.checkIns.push({
            status: clampText(status, 32) || 'ok',
            source: clampText(source, 32) || 'manual',
            note: note ? clampText(note, 500) : null,
            by: by ? clampText(by, 128) : null,
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
        // A cancelled ride accepts exactly two kinds of rating, both about
        // the ride NOT happening: a no-show report, and a late-cancellation
        // report. An ordinary quality rating on a trip that never ran would
        // be meaningless, so it is still refused.
        const hasFlag = (name) => Array.isArray(event?.tags)
            && event.tags.some((t) => t[0] === name && t[1] === 'true');
        const isNonEventReport = hasFlag('no_show') || hasFlag('late_cancel');
        if (!rideManager.isTerminal(ride.status)
            || (ride.status === rideProfile.states.values.CANCELLED && !isNonEventReport)) {
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
        if (ride.settlementMode === 'none') {
            return res.status(409).json({ error: 'Tips are disabled for a no-money journey' });
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
        if (ride.locationMode === 'participant_encrypted') {
            return res.status(409).json({
                error: 'Operator-held photo and signature proofs are disabled in privacy mode'
            });
        }

        ride.proofs = ride.proofs || [];
        if (ride.proofs.length >= 10) {
            return res.status(400).json({ error: 'Proof limit reached for this task (10)' });
        }

        const dataUrl = req.body?.dataUrl;
        if (dataUrl != null) {
            if (typeof dataUrl !== 'string' || !/^data:image\/(png|jpe?g|webp);base64,/.test(dataUrl)) {
                return res.status(400).json({ error: 'dataUrl must be a base64 image data URL (png/jpeg/webp)' });
            }
            if (dataUrl.length > 2 * 1024 * 1024) {
                return res.status(413).json({ error: 'Proof image too large (2MB max)' });
            }
        }

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
        if (description.length > 2000) {
            return res.status(400).json({ error: 'Description too long (2000 chars max)' });
        }

        const ride = rideManager.getRide(rideId);
        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }

        const authErr = authoriseRideActor(req, ride, ['provider']);
        if (authErr) {
            return res.status(authErr.status).json(authErr);
        }
        if (ride.settlementMode === 'none') {
            return res.status(409).json({ error: 'This journey has no monetary quote' });
        }
        if (ride.locationMode === 'participant_encrypted') {
            return res.status(409).json({
                error: 'Quote descriptions stay in encrypted participant chat in privacy mode'
            });
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
        reputation.ensureEventIntegrity(event);

        if (event.kind !== 7543) {
            return res.status(400).json({ error: 'Event kind must be 7543 (TROTT-05b dispute claim)' });
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

        // Only the operator installs arbiters — otherwise anyone could
        // appoint themselves and forfeit the accused's stake.
        if (nip98Enabled && (req.user?.pubkey || '').toLowerCase() !== (config.operatorPubkey || '').toLowerCase()) {
            return res.status(403).json({ error: 'Forbidden', details: 'Only the operator can assign arbiters' });
        }

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

        // Resolution requires an assigned arbiter, and only that arbiter
        // (or the operator) may resolve.
        if (dispute.status !== 'assigned') {
            return res.status(400).json({ error: 'Dispute must have an assigned arbiter before resolution' });
        }
        if (nip98Enabled) {
            const signer = (req.user?.pubkey || '').toLowerCase();
            const allowed = [dispute.arbiter?.pubkey, config.operatorPubkey]
                .filter(Boolean).map(x => x.toLowerCase());
            if (!allowed.includes(signer)) {
                return res.status(403).json({ error: 'Forbidden', details: 'Only the assigned arbiter or operator can resolve this dispute' });
            }
        }

        if (!outcome || !disputeEvents.VALID_OUTCOMES.includes(outcome)) {
            return res.status(400).json({ error: `Invalid outcome. Must be one of: ${disputeEvents.VALID_OUTCOMES.join(', ')}` });
        }

        const plannedAccusedStake = accusedStake || (outcome === 'dismissed' ? 'released' : 'forfeited');
        if (plannedAccusedStake === 'partial_forfeit'
            && stakeManager?.currentProvider?.getCapabilities?.().features?.partialForfeit === false) {
            return res.status(400).json({
                error: 'partial_forfeit is not supported by the active payment rail (all-or-nothing stakes)'
            });
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
                                dispute.accused?.pubkey || dispute.accusedPubkey || 'accused',
                                `dispute_${outcome}`
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

        if (event.kind !== 39503) {
            return res.status(400).json({ error: 'Event kind must be 39503 (appeal request)' });
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
    if (nip98Enabled && (req.user?.pubkey || '').toLowerCase() !== (config.operatorPubkey || '').toLowerCase()) {
        return res.status(403).json({ error: 'Forbidden', details: 'Operator only' });
    }
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
    if (nip98Enabled && (req.user?.pubkey || '').toLowerCase() !== (config.operatorPubkey || '').toLowerCase()) {
        return res.status(403).json({ error: 'Forbidden', details: 'Operator only' });
    }
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
    if (nip98Enabled && (req.user?.pubkey || '').toLowerCase() !== (config.operatorPubkey || '').toLowerCase()) {
        return res.status(403).json({ error: 'Forbidden', details: 'Operator only' });
    }
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

        if (event.kind !== 30546) {
            return res.status(400).json({ error: 'Event kind must be 30546 (TROTT-05c abuse report)' });
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

        if (event.kind !== 39500) {
            return res.status(400).json({ error: 'Event kind must be 39500 (watchdog claim)' });
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

        if (event.kind !== 39504) {
            return res.status(400).json({ error: 'Event kind must be 39504 (slashing proposal)' });
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

        if (event.kind !== 39505) {
            return res.status(400).json({ error: 'Event kind must be 39505 (guardian vote)' });
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
function authoriseDisputeReader(req, dispute) {
    if (!nip98Enabled || !req.user) {
        return null;
    }
    const signer = (req.user.pubkey || '').toLowerCase();
    const allowed = [
        dispute.complainant?.pubkey,
        dispute.accused?.pubkey,
        dispute.arbiter?.pubkey,
        config.operatorPubkey
    ].filter(Boolean).map(x => x.toLowerCase());
    if (allowed.includes(signer)) {
        return null;
    }
    return { status: 403, error: 'Forbidden', details: 'Not a party to this dispute' };
}

app.get('/api/disputes/:disputeId', optionalNip98, (req, res) => {
    try {
        const dispute = disputes.get(req.params.disputeId);
        if (!dispute) {
            return res.status(404).json({ error: 'Dispute not found' });
        }
        const authErr = authoriseDisputeReader(req, dispute);
        if (authErr) {
            return res.status(authErr.status).json(authErr);
        }
        res.json({ success: true, dispute });
    } catch (error) {
        console.error('Error fetching dispute:', error);
        res.status(500).json({ error: 'Failed to fetch dispute', details: error.message });
    }
});

// D2. List disputes for a ride
app.get('/api/rides/:rideId/disputes', optionalNip98, (req, res) => {
    try {
        const { rideId } = req.params;
        const rideDisputes = Array.from(disputes.values())
            .filter(d => d.taskId === rideId)
            .filter(d => !authoriseDisputeReader(req, d));
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
        const custodyModel = typeof paymentProvider?.getCustodyModel === 'function'
            ? paymentProvider.getCustodyModel() : 'custodial';

        // ride.fare is ALWAYS sats. Reporting it under the ride's fiat currency
        // claimed "8914 GBP" for what was 8,914 sats — roughly a thousandfold
        // overstatement in the record, and a straight contradiction of the rule
        // that an amount is the smallest unit of the currency beside it. Report
        // the sats honestly, and carry the fiat figure alongside for the humans
        // who settled in pounds (derived on demand, so it survives rehydration).
        const fareSats = Number(ride.fare) || 0;
        let fareFiat = null;
        try {
            const converted = await satsToFiat(fareSats, currency);
            fareFiat = { amount: converted.amount, currency };
        } catch (_err) {
            fareFiat = null; // no price available — omit rather than invent one
        }

        let payment;
        if (ride.settlementMode === 'none') {
            payment = {
                success: true,
                method: 'none',
                status: 'not_applicable',
                amount: 0,
                currency: 'SAT',
                fiat: null,
                trust_model: 'no_money',
                custody: 'none',
                operator_transmitted: 0,
                settlement: 'none',
                timestamp: Date.now()
            };
        } else if (paymentProvider && typeof paymentProvider.recordSettlement === 'function') {
            // Record-only rails (cash): the fare changes hands face-to-face.
            // The operator records that it happened; it moves no money itself.
            const record = await paymentProvider.recordSettlement(rideId, fareSats, 'SAT');
            payment = {
                success: true,
                method: paymentProvider.providerName,
                status: 'declared',
                amount: fareSats,
                currency: 'SAT',
                fiat: fareFiat,
                trust_model: paymentProvider.getTrustModel(),
                custody: custodyModel,
                operator_transmitted: 0,
                settlement: 'peer-to-peer',
                record,
                timestamp: Date.now()
            };
        } else if (paymentProvider && paymentProvider.providerName === 'demo') {
            payment = {
                success: true,
                method: 'demo',
                status: 'simulated',
                payment_hash: `demo_${Date.now()}`,
                amount: fareSats,
                currency: 'SAT',
                fiat: fareFiat,
                trust_model: 'demo',
                custody: 'none',
                operator_transmitted: 0,
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
                amount: fareSats,
                currency: 'SAT',
                fiat: fareFiat,
                trust_model: paymentProvider?.getTrustModel?.() || 'unknown',
                custody: custodyModel,
                operator_transmitted: 0,
                settlement: 'peer-to-peer',
                timestamp: Date.now()
            };
        }

        // Release any task-flow stakes before marking complete — a failed
        // release is an operator incident, not something to swallow.
        if (ride.stakes) {
            for (const [side, stake] of Object.entries(ride.stakes)) {
                if (!stake?.locked || stake.released) {
                    continue;
                }
                const stakeType = side === 'requester' ? 'rider' : 'driver';
                const release = await stakeManager.releaseStake(`${rideId}_${stakeType}`);
                if (!release?.success) {
                    return res.status(502).json({
                        error: `Stake release failed for ${side} — ride left active`,
                        details: release?.error || 'Payment provider rejected the release'
                    });
                }
                stake.released = true;
                stake.releasedAt = Date.now();
                stakeEvents.publishStakeRelease({
                    rideId,
                    role: stakeType,
                    amount: stake.amount,
                    providerEvent: release.event,
                    reason: 'completed',
                    currency: 'SAT',
                    trustModel: stakeManager.currentProvider?.getTrustModel() || 'unknown'
                }).catch((err) => console.warn(`Failed to publish ${side} stake release for ${rideId}:`, err.message));
            }
        }

        const completedRide = rideManager.completeTrip(rideId, payment);

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

// Open (unaccepted) requests — lets a provider browse every waiting
// requester rather than only catching live broadcasts. Filterable by
// working-area cells (?areas=gcpv,gcpw) or proximity (?lat/&lon, operator
// dispatch radius). Payload mirrors the WS ride_request broadcast: no
// requester identity, no route geometry. Registered before /api/rides/:rideId
// so 'open' is not captured as a ride id.
app.get('/api/rides/open', publicRateLimiter, optionalNip98, (req, res) => {
    try {
        const lat = parseFloat(req.query.lat);
        const lon = parseFloat(req.query.lon ?? req.query.lng);
        const areas = sanitiseWorkingAreas(
            typeof req.query.areas === 'string' && req.query.areas.length > 0
                ? req.query.areas.split(',')
                : null
        );

        // Service classes this browser can serve, and who is browsing —
        // both only ever narrow what comes back
        const browsingOptions = sanitiseServiceOptions(
            typeof req.query.options === 'string' && req.query.options.length > 0
                ? req.query.options.split(',')
                : null
        ) || [];
        // Access features this browser can provide (?access=wheelchair,…).
        // Declaring none is the safe default: jobs with needs stay hidden.
        const browsingAccess = sanitiseAccessNeeds(
            typeof req.query.access === 'string' && req.query.access.length > 0
                ? req.query.access.split(',')
                : null,
            domainProfile
        );
        const browsingPubkey = ((nip98Enabled && req.user?.pubkey) || req.query.pubkey || '').toLowerCase();

        const rides = rideManager.getActiveRides()
            .filter((ride) => {
                const p = rideManager.getProfileForRide(ride.id);
                return ride.status === p.states.values.REQUESTED;
            })
            .filter((ride) => {
                const pickup = ride.pickup;
                if (!pickup || !Number.isFinite(pickup.lat) || !Number.isFinite(pickup.lon)) {
                    return true;
                }
                if (areas && areas.length > 0) {
                    return originInAreas(pickup, areas);
                }
                if (Number.isFinite(lat) && Number.isFinite(lon)) {
                    return calculateDistance(lat, lon, pickup.lat, pickup.lon) <= DISPATCH_RADIUS_KM;
                }
                return true;
            })
            // Women-only requests are only listed to browsers declaring
            // ?gender=woman (self-attested — accept enforces the same claim)
            .filter((ride) => !ride.womenOnly || req.query.gender === 'woman')
            // Access needs: a job needing a feature is listed only to
            // providers declaring it (?access=wheelchair,child_seat).
            // Fail closed — a browser declaring nothing sees no such job.
            .filter((ride) => accessEligible({ accessFeatures: browsingAccess }, ride))
            // Service classes: a job is listed only to providers who
            // declared the class it asked for (?options=xl,comfort)
            .filter((ride) => optionEligible({ serviceOptions: browsingOptions }, ride))
            // A favourite's head start also hides the job from the list —
            // otherwise the window would leak straight through it
            .filter((ride) => favouriteEligible({ pubkey: browsingPubkey }, ride))
            .map((ride) => {
                const session = activeRides.get(ride.id) || {};
                const estimate = session.estimate || ride.estimate || null;
                const distanceKm = typeof estimate?.distance?.km === 'number'
                    ? estimate.distance.km
                    : null;
                return {
                    id: ride.id,
                    // Approximate pre-accept — see approximateLocation
                    pickup: approximateLocation(ride.pickup),
                    dropoff: approximateLocation(ride.dropoff),
                    stopCount: ride.stopCount ?? (ride.stops ? ride.stops.length : 0),
                    fare: ride.fare,
                    settlementMode: ride.settlementMode || 'priced',
                    locationMode: ride.locationMode || 'operator_memory',
                    distance: distanceKm,
                    estimatedFare: estimate,
                    currency: ride.currency || session.currency || 'GBP',
                    // Pre-booked pickup time — drivers can browse and accept
                    // ahead of the dispatch window
                    scheduledFor: ride.scheduledFor || null,
                    womenOnly: ride.womenOnly === true,
                    accessNeeds: ride.accessNeeds || [],
                    option: ride.option || null,
                    requestedAt: ride.timestamps?.requested || null
                };
            });

        res.json({ success: true, rides, count: rides.length, timestamp: Date.now() });
    } catch (error) {
        console.error('Error listing open rides:', error);
        res.status(500).json({
            error: 'Failed to list open rides',
            details: error.message
        });
    }
});

// Ride statistics — MUST be registered before /api/rides/:rideId or the
// literal path 'stats' is captured as a ride id and 404s
app.get('/api/rides/stats', publicRateLimiter, (req, res) => {
    try {
        const stats = rideManager.getStats();
        const activeCount = rideManager.getActiveRides().length;

        // Counts only. The previous response enumerated every active ride id
        // and both parties' npubs to anyone who asked \u2014 an index for
        // scraping live PII from the per-ride endpoints.
        res.json({
            success: true,
            total: stats.total || 0,
            active: activeCount,
            completed: stats.completed || 0,
            cancelled: stats.cancelled || 0,
            active_rides: activeCount
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
app.get('/api/rides/:rideId', optionalNip98, (req, res) => {
    try {
        const { rideId } = req.params;

        const ride = rideManager.getRide(rideId);

        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }

        // Full task objects hold PII (coordinates, proofs, panic events) \u2014
        // participants only.
        const authErr = authoriseRideActor(req, ride);
        if (authErr) {
            return res.status(authErr.status).json(authErr);
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
        serviceOptions: domainProfile.serviceOptions || [],
        // Without this the access-needs picker has nothing to render, and a
        // wheelchair user is quietly offered no way to say so.
        accessOptions: domainProfile.accessOptions || [],
        // What a provider may declare they hold (licence, insurance, badge).
        // Self-attested and shown to the requester; never operator-verified.
        credentials: domainProfile.credentials || [],
        enforceCredentials: ENFORCE_CREDENTIALS,
        operatorPolicy: publicOperatorPolicy(operatorPolicy, {
            requiredCredentials: requiredCredentialIds(domainProfile),
            storageBackend: taskStore?.backend || null
        }),
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
            serviceOptions: profile.serviceOptions || [],
            accessOptions: profile.accessOptions || [],
            credentials: profile.credentials || [],
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
// Shell presence is checked once at boot, not per request.
const driverShellPath = path.join(reactBuildPath, 'driver.html');
const hasDriverShell = fs.existsSync(driverShellPath);
const hasRiderShell = fs.existsSync(reactIndexPath);

// Where an operator drops the signed driver APK. Absent from git: a release
// build is per-operator and signed with a key only they hold.
const DOWNLOADS_DIR = path.join(__dirname, 'public', 'downloads');

/**
 * What Android build, if any, this operator actually publishes.
 *
 * The download page used to hardcode a filename and a size. Nothing checked
 * that the file was there, so an operator who had never built the app still
 * served a confident "Download the app (5 MB)" button. A page may not
 * advertise an artefact the operator does not have — the honest answer is
 * "not published here", and the web app at /provide still works.
 */
function publishedDriverApk() {
    let names;
    try {
        names = fs.readdirSync(DOWNLOADS_DIR).filter(n => n.endsWith('.apk'));
    } catch {
        return null; // no downloads dir at all — nothing published
    }
    // Newest first, so a v1.1 supersedes a v1.0 left in place.
    const builds = names
        .map(name => {
            try {
                return { name, mtime: fs.statSync(path.join(DOWNLOADS_DIR, name)).mtimeMs,
                         bytes: fs.statSync(path.join(DOWNLOADS_DIR, name)).size };
            } catch { return null; }
        })
        .filter(Boolean)
        .sort((a, b) => b.mtime - a.mtime);
    if (!builds.length) return null;

    const build = builds[0];
    // The checksum is whatever the operator put beside the APK; we never
    // invent one, because a hash the operator did not produce proves nothing.
    let sha256 = null;
    try {
        sha256 = fs.readFileSync(path.join(DOWNLOADS_DIR, `${build.name}.sha256`), 'utf8')
            .trim().split(/\s+/)[0] || null;
    } catch { /* no sidecar — the page simply omits the verification block */ }

    // CDNs may cache a brief 404 when a new versioned filename is requested
    // before the image containing it reaches the origin. Tie the advertised
    // URL to the signed artefact's checksum so each published binary has a
    // fresh cache key, without granting the deploy process cache-purge access.
    const cacheKey = /^[0-9a-f]{64}$/i.test(sha256 || '')
        ? `?sha256=${sha256.slice(0, 16).toLowerCase()}`
        : '';
    return {
        url: `/downloads/${encodeURIComponent(build.name)}${cacheKey}`,
        filename: build.name,
        bytes: build.bytes,
        sha256
    };
}

// The landing page explaining what this operator is, on a clean URL. It has
// to be an explicit route: '/about' carries no extension, so the SPA
// catch-all below would otherwise hand it the rider shell.
app.get('/about', (req, res, next) => {
    res.sendFile(path.join(__dirname, 'public', 'about.html'), (err) => {
        if (err) next();
    });
});

// Lets /download.html render what is really there instead of a fixed claim.
app.get('/api/driver-app', publicRateLimiter, (req, res) => {
    const apk = publishedDriverApk();
    res.json({
        android: apk ? { available: true, ...apk } : { available: false },
        webApp: '/provide'
    });
});

app.get('*', (req, res, next) => {
    // Skip API routes and health checks
    if (req.path.startsWith('/api/') || req.path.startsWith('/rides/') || req.path.startsWith('/tasks/') ||
        req.path === '/info' || req.path === '/health' || req.path === '/health/live') {
        return next();
    }
    // A request for a FILE is never an SPA route. This was a denylist of four
    // extensions, so every other missing asset — the driver APK, an icon, a
    // webmanifest — fell through to the rider shell and was answered
    // 200 text/html. A phone downloading `donkeyride-driver-1.0.apk` got a
    // 1 KB HTML page wearing an .apk name, which fails to install with no
    // clue as to why. Anything with an extension that express.static did not
    // find is a genuine 404 and must say so.
    if (path.extname(req.path)) {
        return next();
    }
    // Rider and driver are separate apps sharing one origin: driver paths
    // get the driver shell, everything else gets the rider shell.
    if ((req.path.startsWith('/provide') || req.path.startsWith('/drive')) && hasDriverShell) {
        return res.sendFile(driverShellPath);
    }
    if (hasRiderShell) {
        return res.sendFile(reactIndexPath);
    }
    next();
});

// Terminal 404. Anything reaching here matched no route, no static file and
// no SPA shell. Express's default answers it with an HTML "Cannot GET /x"
// page, which is the wrong content type for an API this JSON throughout and
// \u2014 worse \u2014 is indistinguishable in a browser from the app failing to load.
app.use((req, res) => {
    res.status(404).json({ error: 'Not found', path: req.path });
});

// Terminal error handler. Without one, malformed JSON and handler throws
// fell through to Express's default HTML page \u2014 a stack trace with
// absolute filesystem paths in any non-production NODE_ENV.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
        return res.status(400).json({ error: 'Malformed JSON body' });
    }
    if (err?.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Request body too large' });
    }
    console.error(`Unhandled error on ${req.method} ${req.path}:`, err);
    const isProd = process.env.NODE_ENV === 'production';
    res.status(err?.status || 500).json({
        error: 'Internal server error',
        ...(isProd ? {} : { details: err?.message })
    });
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

// ==========================================
// SERVER STARTUP
// ==========================================

async function startServer(options = {}) {
    const listen = options.listen !== false;

    // Task persistence first \u2014 providers restore persisted stakes from it
    await initializeTaskStore();
    if (operatorPolicy.recordMode === 'durable' && !taskStore) {
        throw new Error(
            'OPERATOR_RECORD_MODE=durable requires a working DATABASE_URL; refusing to advertise durable records while running in memory'
        );
    }

    await initializeStakeManager();
    adoptPaymentProvider();

    if (taskStore) {
        for (const provider of stakeManager.providers) {
            if (typeof provider.setStakeStore === 'function') {
                await provider.setStakeStore(taskStore);
            }
        }
    }

    // Initialize Redis for driver tracking
    await initializeRedis();

    // Rehydrate active tasks from Nostr snapshots (the no-database durability
    // path). Runs regardless of whether a store is configured; a DB restore,
    // if any, already ran in initializeTaskStore and hydrateTask skips dupes.
    if (operatorAnnounce.canPublish()) {
        const restored = await rehydrateFromNostr();
        if (restored > 0) {
            console.log(`🌐 Rehydrated ${restored} active task(s) from Nostr snapshots`);
        }
    }

    // Operator discoverability: announcement now, heartbeat every 5 min,
    // and a retry loop for events that failed to reach any relay.
    if (operatorAnnounce.canPublish()) {
        const caps = paymentProvider.getCapabilities();
        operatorAnnounce.publishAnnouncement({
            name: config.operatorName,
            domains: listProfiles(),
            feePercent: config.operatorFeePercent * 100,
            paymentProviders: [paymentProvider.providerName],
            trustModels: [caps.trustModel],
            supportedCurrencies: ['SAT', 'GBP', 'USD', 'EUR'],
            serviceUrl: process.env.PUBLIC_BASE_URL || null,
            publicRelays: config.publicRelays,
            policy: publicOperatorPolicy(operatorPolicy, {
                requiredCredentials: requiredCredentialIds(domainProfile),
                storageBackend: taskStore?.backend || null
            })
        }).catch((err) => console.warn('Operator announcement failed:', err.message));

        const heartbeatTimer = setInterval(() => {
            operatorAnnounce.publishHeartbeat({
                activeTasks: rideManager.getActiveRides().length,
                domains: listProfiles(),
                uptimeSeconds: process.uptime()
            }).catch((err) => console.warn('Heartbeat publish failed:', err.message));
        }, 5 * 60 * 1000);
        heartbeatTimer.unref();
    }

    // Outbox retry loop — drains the database outbox when a store is present,
    // otherwise the in-memory buffer. Runs either way.
    const outboxTimer = setInterval(async () => {
        try {
            if (taskStore) {
                const events = await taskStore.loadOutboxEvents(50);
                for (const event of events) {
                    try {
                        const result = await reputation.publishGeneric(event, event.pubkey);
                        if ((result.relayStatuses || []).some((status) => status.ok)) {
                            await taskStore.deleteOutboxEvent(event.id);
                        } else {
                            await taskStore.saveOutboxEvent(event); // attempts++
                        }
                    } catch (error) {
                        await taskStore.saveOutboxEvent(event).catch(() => {});
                    }
                }
            } else if (memoryOutbox.size > 0) {
                for (const [id, event] of Array.from(memoryOutbox.entries()).slice(0, 50)) {
                    try {
                        const result = await reputation.publishGeneric(event, event.pubkey);
                        if ((result.relayStatuses || []).some((status) => status.ok)) {
                            memoryOutbox.delete(id);
                        }
                    } catch (error) {
                        // keep for next tick
                    }
                }
            }
        } catch (error) {
            // retry next tick
        }
    }, 60000);
    outboxTimer.unref();

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
    \uD83D\uDEE1\uFE0F  Rate limiting ${rateLimitingEnabled ? 'active' : 'disabled'}
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
        // Bound slow clients and hung handlers at the socket layer
        httpServer.requestTimeout = 30000;
        httpServer.headersTimeout = 10000;
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
    pushService,
    getHttpServer: () => httpServer,
    // Tests that exercise real WS dispatch need to close this to exit cleanly
    getWss: () => wss,
    // Exposed so what the operator puts in a relay-bound snapshot can be
    // asserted directly, rather than inferred from a response body that
    // never carried it.
    buildTaskSnapshot
};

// Graceful shutdown.
// Held stakes are deliberately NOT auto-released here: stake state is
// persisted and rehydrated on restart, and refunding everyone on every
// deploy would void in-flight penalties.
let isShuttingDown = false;

async function shutdown(signal) {
    if (isShuttingDown) {
        return;
    }
    isShuttingDown = true;
    console.log(`${signal} received \u2014 shutting down gracefully...`);

    const forceExit = setTimeout(() => {
        console.error('Forced exit after 15s shutdown timeout');
        process.exit(1);
    }, 15000);
    forceExit.unref();

    try {
        if (httpServer) {
            await new Promise((resolve) => httpServer.close(resolve));
        }
        if (wss && typeof wss.close === 'function') {
            for (const client of wss.clients || []) {
                try { client.close(1001, 'Server shutting down'); } catch (error) { /* already closed */ }
            }
            await new Promise((resolve) => wss.close(resolve));
        }

        // Drain pending task persistence before closing the store
        for (const manager of _domainManagers.values()) {
            if (typeof manager.flushPersistence === 'function') {
                await manager.flushPersistence();
            }
        }
        if (taskStore) {
            await taskStore.close();
        }
        if (redis) {
            await redis.quit();
        }
        reputation.shutdown();
    } catch (error) {
        console.warn('Shutdown cleanup error:', error.message);
    }

    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
