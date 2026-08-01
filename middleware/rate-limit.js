// ==========================================
// RATE LIMITING MIDDLEWARE
// Prevents spam and abuse of operator API
// ==========================================

/**
 * Simple in-memory rate limiter
 * For production, use Redis-backed solution (express-rate-limit + rate-limit-redis)
 */
class RateLimiter {
    constructor(options = {}) {
        this.windowMs = options.windowMs || 60000; // 1 minute default
        this.maxRequests = options.max || 10; // 10 requests per window
        this.message = options.message || 'Too many requests';
        this.keyGenerator = options.keyGenerator || this.defaultKeyGenerator.bind(this);

        // Map: key -> { count, resetTime }
        this.requests = new Map();

        // Cleanup old entries every minute (unref so it never blocks process exit)
        const cleanupTimer = setInterval(() => this.cleanup(), 60000);
        if (typeof cleanupTimer.unref === 'function') {
            cleanupTimer.unref();
        }
    }

    /**
     * Default key generator (IP address)
     */
    defaultKeyGenerator(req) {
        return req.ip || req.connection.remoteAddress;
    }

    /**
     * Middleware function
     */
    middleware() {
        return (req, res, next) => {
            const key = this.keyGenerator(req);
            const now = Date.now();

            // Get or create rate limit entry
            let entry = this.requests.get(key);

            if (!entry || now > entry.resetTime) {
                // New window
                entry = {
                    count: 0,
                    resetTime: now + this.windowMs
                };
                this.requests.set(key, entry);
            }

            // Increment counter
            entry.count++;

            // Add rate limit headers
            res.setHeader('X-RateLimit-Limit', this.maxRequests);
            res.setHeader('X-RateLimit-Remaining', Math.max(0, this.maxRequests - entry.count));
            res.setHeader('X-RateLimit-Reset', entry.resetTime);

            // Check if over limit
            if (entry.count > this.maxRequests) {
                return res.status(429).json({
                    error: 'Too many requests',
                    message: this.message,
                    retryAfter: Math.ceil((entry.resetTime - now) / 1000)
                });
            }

            next();
        };
    }

    /**
     * Cleanup expired entries
     */
    cleanup() {
        const now = Date.now();
        for (const [key, entry] of this.requests.entries()) {
            if (now > entry.resetTime) {
                this.requests.delete(key);
            }
        }
    }

    /**
     * Reset rate limit for a key (useful for testing)
     */
    reset(key) {
        this.requests.delete(key);
    }

    /**
     * Get current rate limit status
     */
    getStatus(key) {
        const entry = this.requests.get(key);
        if (!entry) {
            return {
                count: 0,
                remaining: this.maxRequests,
                resetTime: Date.now() + this.windowMs
            };
        }

        return {
            count: entry.count,
            remaining: Math.max(0, this.maxRequests - entry.count),
            resetTime: entry.resetTime
        };
    }
}

/**
 * Rate limiter for public endpoints (more lenient)
 */
const publicRateLimiter = new RateLimiter({
    windowMs: 60000, // 1 minute
    max: 30, // 30 requests per minute
    message: 'Too many requests to public API'
});

/**
 * Rate limiter for authenticated endpoints (stricter)
 */
const authenticatedRateLimiter = new RateLimiter({
    windowMs: 60000, // 1 minute
    max: 10, // 10 requests per minute
    message: 'Too many requests to authenticated API',
    keyGenerator: (req) => {
        // Use pubkey if authenticated, otherwise IP
        return req.user?.pubkey || req.ip;
    }
});

/**
 * Rate limiter for ride creation (very strict)
 */
const rideCreationLimiter = new RateLimiter({
    windowMs: 300000, // 5 minutes
    max: 5, // 5 ride creations per 5 minutes
    message: 'Too many ride creation attempts',
    keyGenerator: (req) => {
        return req.user?.pubkey || req.ip;
    }
});

/**
 * Rate limiter for stake operations (strict)
 */
const stakeLimiter = new RateLimiter({
    windowMs: 60000, // 1 minute
    max: 20, // 20 stake operations per minute
    message: 'Too many stake operations',
    keyGenerator: (req) => {
        return req.user?.pubkey || req.ip;
    }
});

/**
 * Progressive rate limiting based on behavior
 */
class AdaptiveRateLimiter {
    constructor() {
        this.violations = new Map(); // key -> violation count
        this.baseWindowMs = 60000;
        this.baseMax = 10;
    }

    middleware() {
        return (req, res, next) => {
            const key = req.user?.pubkey || req.ip;
            const violations = this.violations.get(key) || 0;

            // Progressive penalties
            const penalty = Math.min(violations, 5); // Max 5x penalty
            const maxRequests = Math.max(1, this.baseMax - (penalty * 2));
            const windowMs = this.baseWindowMs * (1 + penalty);

            const limiter = new RateLimiter({
                windowMs,
                max: maxRequests,
                message: `Rate limit reduced due to violations (${violations})`
            });

            // Intercept 429 response to track violations
            const originalJson = res.json.bind(res);
            res.json = (data) => {
                if (res.statusCode === 429) {
                    this.violations.set(key, violations + 1);
                    // Violations decay over time
                    setTimeout(() => {
                        const current = this.violations.get(key) || 0;
                        if (current > 0) {
                            this.violations.set(key, current - 1);
                        }
                    }, 300000); // Decay after 5 minutes
                }
                return originalJson(data);
            };

            limiter.middleware()(req, res, next);
        };
    }
}

module.exports = {
    RateLimiter,
    publicRateLimiter: publicRateLimiter.middleware(),
    authenticatedRateLimiter: authenticatedRateLimiter.middleware(),
    rideCreationLimiter: rideCreationLimiter.middleware(),
    stakeLimiter: stakeLimiter.middleware(),
    AdaptiveRateLimiter
};
