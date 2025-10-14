// ==========================================
// NIP-98 HTTP AUTHENTICATION MIDDLEWARE
// Verifies Nostr event signatures on API requests
// ==========================================

const { verifySignature, getEventHash } = require('nostr-tools');

/**
 * NIP-98 Authentication Middleware
 *
 * Validates that API requests are signed by the claimed Nostr pubkey
 *
 * Authorization header format:
 * Authorization: Nostr <base64-encoded-event>
 *
 * Event must be kind 27235 with:
 * - 'u' tag: full URL being accessed
 * - 'method' tag: HTTP method (GET, POST, etc.)
 * - created_at: recent timestamp (within 60 seconds)
 *
 * Example:
 * {
 *   "kind": 27235,
 *   "created_at": 1234567890,
 *   "tags": [
 *     ["u", "https://operator.com/api/rides/123"],
 *     ["method", "POST"]
 *   ],
 *   "content": "",
 *   "pubkey": "<user-pubkey>",
 *   "id": "...",
 *   "sig": "..."
 * }
 */

/**
 * Validate NIP-98 authentication
 */
function validateNIP98Auth(req, res, next) {
    try {
        // Get Authorization header
        const authHeader = req.headers['authorization'];

        if (!authHeader) {
            return res.status(401).json({
                error: 'Missing Authorization header',
                details: 'NIP-98 authentication required. Include: Authorization: Nostr <base64-event>'
            });
        }

        // Check format: "Nostr <base64-event>"
        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Nostr') {
            return res.status(401).json({
                error: 'Invalid Authorization format',
                details: 'Expected: Authorization: Nostr <base64-event>'
            });
        }

        // Decode base64 event
        let event;
        try {
            const eventJson = Buffer.from(parts[1], 'base64').toString('utf8');
            event = JSON.parse(eventJson);
        } catch (error) {
            return res.status(401).json({
                error: 'Invalid event encoding',
                details: 'Event must be base64-encoded JSON'
            });
        }

        // Validate event structure
        const validation = validateAuthEvent(event, req);
        if (!validation.valid) {
            return res.status(401).json({
                error: 'Authentication failed',
                details: validation.error
            });
        }

        // Verify signature
        if (!verifySignature(event)) {
            return res.status(401).json({
                error: 'Invalid signature',
                details: 'Nostr event signature verification failed'
            });
        }

        // Verify event hash
        const expectedId = getEventHash(event);
        if (event.id !== expectedId) {
            return res.status(401).json({
                error: 'Invalid event ID',
                details: 'Event ID does not match computed hash'
            });
        }

        // Attach authenticated user to request
        req.user = {
            pubkey: event.pubkey,
            authEvent: event
        };

        next();

    } catch (error) {
        console.error('NIP-98 auth error:', error);
        return res.status(500).json({
            error: 'Authentication error',
            details: error.message
        });
    }
}

/**
 * Validate auth event content
 */
function validateAuthEvent(event, req) {
    // Check kind
    if (event.kind !== 27235) {
        return {
            valid: false,
            error: 'Invalid event kind. Expected 27235 for NIP-98 auth'
        };
    }

    // Check required fields
    if (!event.pubkey || !event.created_at || !event.tags || !event.id || !event.sig) {
        return {
            valid: false,
            error: 'Missing required event fields'
        };
    }

    // Check timestamp freshness (within 60 seconds)
    const now = Math.floor(Date.now() / 1000);
    const age = now - event.created_at;

    if (age > 60) {
        return {
            valid: false,
            error: `Event too old (${age} seconds). Must be within 60 seconds`
        };
    }

    if (age < -60) {
        return {
            valid: false,
            error: `Event timestamp in future (${Math.abs(age)} seconds)`
        };
    }

    // Check URL tag matches request URL
    const urlTag = event.tags.find(t => t[0] === 'u');
    if (!urlTag) {
        return {
            valid: false,
            error: 'Missing "u" tag (URL)'
        };
    }

    const expectedUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    if (urlTag[1] !== expectedUrl) {
        return {
            valid: false,
            error: `URL mismatch. Expected: ${expectedUrl}, Got: ${urlTag[1]}`
        };
    }

    // Check method tag matches HTTP method
    const methodTag = event.tags.find(t => t[0] === 'method');
    if (!methodTag) {
        return {
            valid: false,
            error: 'Missing "method" tag'
        };
    }

    if (methodTag[1] !== req.method) {
        return {
            valid: false,
            error: `Method mismatch. Expected: ${req.method}, Got: ${methodTag[1]}`
        };
    }

    return { valid: true };
}

/**
 * Optional: Only allow specific pubkeys
 */
function requirePubkey(allowedPubkeys) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'Not authenticated'
            });
        }

        if (!allowedPubkeys.includes(req.user.pubkey)) {
            return res.status(403).json({
                error: 'Forbidden',
                details: 'Your pubkey is not authorized for this operation'
            });
        }

        next();
    };
}

/**
 * Optional: Verify user owns a specific resource
 */
function requireOwnership(getResourceOwner) {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'Not authenticated'
            });
        }

        try {
            const owner = await getResourceOwner(req);

            if (owner !== req.user.pubkey) {
                return res.status(403).json({
                    error: 'Forbidden',
                    details: 'You do not own this resource'
                });
            }

            next();
        } catch (error) {
            return res.status(500).json({
                error: 'Ownership verification failed',
                details: error.message
            });
        }
    };
}

/**
 * Helper: Generate NIP-98 auth event (for documentation/testing)
 */
function generateAuthEvent(url, method, privateKey) {
    const { getPublicKey, finalizeEvent } = require('nostr-tools');

    const pubkey = getPublicKey(privateKey);

    const event = {
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['u', url],
            ['method', method]
        ],
        content: '',
        pubkey
    };

    return finalizeEvent(event, privateKey);
}

/**
 * Helper: Create Authorization header (for documentation/testing)
 */
function createAuthHeader(event) {
    const eventJson = JSON.stringify(event);
    const base64Event = Buffer.from(eventJson).toString('base64');
    return `Nostr ${base64Event}`;
}

module.exports = {
    validateNIP98Auth,
    requirePubkey,
    requireOwnership,
    generateAuthEvent,
    createAuthHeader
};
