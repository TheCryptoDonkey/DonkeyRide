// ==========================================
// PAYMENT PROVIDER BASE INTERFACE
// All payment providers must implement this interface
// ==========================================

/**
 * Base class for all payment providers
 * Provides stake lock/release/forfeit functionality
 *
 * Providers can be:
 * - Custodial (Strike, Alby, Wallet of Satoshi)
 * - Non-custodial (LND hodl, Core Lightning hold)
 * - Federated (Fedimint, Cashu)
 * - Smart contracts (DLC, Polygon)
 */
class PaymentProvider {
    constructor(config) {
        this.config = config;
        this.providerName = 'base';
        this.type = 'unknown'; // custodial|hodl|federated|smart_contract
    }

    /**
     * Lock a stake for a ride
     * @param {string} rideId - Unique ride identifier
     * @param {string} userId - User's Nostr pubkey
     * @param {number} amount - Amount in satoshis
     * @param {string} type - 'rider' or 'driver'
     * @returns {Promise<StakeLock>} Lock details and proof
     */
    async lockStake(rideId, userId, amount, type) {
        throw new Error(`lockStake() not implemented in ${this.providerName}`);
    }

    /**
     * Release a single party's stake (money goes back to the payer)
     * @param {string} stakeId - `${rideId}_${role}` (role: 'rider'|'driver')
     * @returns {Promise<StakeRelease>} Release confirmation
     */
    async releaseStake(stakeId) {
        throw new Error(`releaseStake() not implemented in ${this.providerName}`);
    }

    /**
     * Forfeit a single party's stake (penalty for cancellation)
     * @param {string} stakeId - `${rideId}_${role}` of the forfeiting party
     * @param {string} cancellingParty - Pubkey of party that cancelled
     * @param {string} reason - Cancellation reason
     * @returns {Promise<StakeForfeit>} Penalty distribution details
     */
    async forfeitStake(stakeId, cancellingParty, reason) {
        throw new Error(`forfeitStake() not implemented in ${this.providerName}`);
    }

    /**
     * Get current status of a stake
     * @param {string} stakeId - `${rideId}_${role}`
     * @returns {Promise<StakeStatus>} Current stake status
     */
    async getStakeStatus(stakeId) {
        throw new Error(`getStakeStatus() not implemented in ${this.providerName}`);
    }

    /**
     * Check if provider is available and configured
     * @returns {Promise<boolean>} True if provider is ready
     */
    async healthCheck() {
        throw new Error(`healthCheck() not implemented in ${this.providerName}`);
    }

    /**
     * Get provider capabilities
     * @returns {Object} Provider features and limits
     */
    getCapabilities() {
        return {
            name: this.providerName,
            type: this.type,
            trustModel: this.getTrustModel(),
            features: {
                instantLock: false,
                instantRelease: false,
                partialForfeit: false,
                batchOperations: false,
                refunds: true
            },
            limits: {
                minStake: 1,
                maxStake: 1000000,
                maxDailyVolume: 10000000
            }
        };
    }

    /**
     * Get trust model description
     * @returns {string} custodial|trustless|federated
     */
    getTrustModel() {
        return 'unknown';
    }

    /**
     * Create Nostr event for stake proof
     * @param {string} action - 'locked'|'released'|'forfeited'
     * @param {Object} details - Stake details
     * @returns {Object} Nostr event (kind 30532 lock / 30533 settlement)
     */
    createStakeEvent(action, details) {
        const baseEvent = {
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['session', details.rideId],
                ['amount', details.amount.toString()],
                ['mechanism', this.type],
                ['provider', this.providerName]
            ]
        };

        if (action === 'locked') {
            return {
                kind: 30532,
                ...baseEvent,
                tags: [
                    ...baseEvent.tags,
                    ['d', `${details.rideId}_${details.type}`],
                    ['e', details.rideId],
                    ['p', details.userId],
                    ['type', `${details.type}_stake`],
                    ['status', 'locked'],
                    ['proof', details.providerTxId],
                    ['lock_time', Date.now().toString()],
                    ['timeout', (Date.now() + 86400000).toString()]
                ],
                content: `Stake locked: ${details.amount} sats via ${this.providerName}`
            };
        } else if (action === 'released') {
            return {
                kind: 30533,
                ...baseEvent,
                tags: [
                    ...baseEvent.tags,
                    ['e', details.rideId],
                    ['action', 'release'],
                    ['proof', details.providerTxId]
                ],
                content: `Stake released: ${details.amount} sats`
            };
        } else if (action === 'forfeited') {
            return {
                kind: 30533,
                ...baseEvent,
                tags: [
                    ...baseEvent.tags,
                    ['e', details.rideId],
                    ['action', 'forfeit'],
                    ['penalty', details.penalty.toString()],
                    ['refund', details.refund.toString()],
                    ['reason', details.reason]
                ],
                content: `Stake forfeited: ${details.penalty} sats penalty`
            };
        }
    }

    /**
     * Validate stake parameters
     * @param {string} rideId - Ride ID
     * @param {number} amount - Stake amount
     * @throws {Error} If validation fails
     */
    validateStakeParams(rideId, amount) {
        if (!rideId || typeof rideId !== 'string') {
            throw new Error('Invalid rideId');
        }

        if (!amount || typeof amount !== 'number' || amount <= 0) {
            throw new Error('Invalid amount');
        }

        const caps = this.getCapabilities();
        if (amount < caps.limits.minStake) {
            throw new Error(`Amount below minimum: ${caps.limits.minStake} sats`);
        }

        if (amount > caps.limits.maxStake) {
            throw new Error(`Amount above maximum: ${caps.limits.maxStake} sats`);
        }
    }
}

/**
 * TypeScript-style type definitions for documentation
 */

/**
 * @typedef {Object} StakeLock
 * @property {boolean} success - Whether lock succeeded
 * @property {string} lockId - Provider-specific lock ID
 * @property {number} amount - Amount locked in sats
 * @property {number} lockedAt - Timestamp of lock
 * @property {Object} proof - Cryptographic proof
 * @property {Object} event - Nostr event (kind 30532)
 */

/**
 * @typedef {Object} StakeRelease
 * @property {boolean} success - Whether release succeeded
 * @property {string} releaseId - Provider-specific release ID
 * @property {number} amount - Amount released in sats
 * @property {number} releasedAt - Timestamp of release
 * @property {Object} proof - Release proof
 * @property {Object} event - Nostr event (kind 30533)
 */

/**
 * @typedef {Object} StakeForfeit
 * @property {boolean} success - Whether forfeit succeeded
 * @property {number} penalty - Penalty amount (to other party)
 * @property {number} refund - Refund amount (to cancelling party)
 * @property {string} reason - Cancellation reason
 * @property {Object} event - Nostr event (kind 30533)
 */

/**
 * @typedef {Object} StakeStatus
 * @property {string} rideId - Ride identifier
 * @property {string} status - 'locked'|'released'|'forfeited'|'expired'
 * @property {number} amount - Stake amount
 * @property {number} lockedAt - Lock timestamp
 * @property {number} expiresAt - Expiry timestamp
 * @property {Object} providerData - Provider-specific data
 */

module.exports = PaymentProvider;
