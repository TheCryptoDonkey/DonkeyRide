// ==========================================
// DEMO PAYMENT PROVIDER
// For testing and presentations only
// ==========================================

const PaymentProvider = require('./base');
const crypto = require('crypto');

/**
 * Demo Provider
 *
 * A mock payment provider for testing and demonstrations
 * Does NOT actually process payments
 * Uses in-memory storage only
 *
 * USE ONLY FOR:
 * - Testing
 * - Development
 * - Presentations/Demos
 *
 * DO NOT USE IN PRODUCTION!
 */
class DemoProvider extends PaymentProvider {
    constructor(config) {
        super(config);
        this.providerName = 'demo';
        this.type = 'mock';
        this.stakes = new Map();
    }

    /**
     * Mock stake lock
     */
    async lockStake(rideId, userId, amount, type) {
        this.validateStakeParams(rideId, amount);

        try {
            const lockId = crypto.randomBytes(16).toString('hex');
            const stakeId = `${rideId}_${type}`;

            this.stakes.set(stakeId, {
                rideId,
                userId,
                amount,
                type,
                lockId,
                status: 'locked',
                createdAt: Date.now()
            });

            const event = this.createStakeEvent('locked', {
                rideId,
                userId,
                amount,
                type,
                providerTxId: lockId
            });

            console.log(`🎭 DEMO: Locked ${amount} sats for ${type} (ride ${rideId})`);

            return {
                success: true,
                lockId,
                amount,
                lockedAt: Date.now(),
                invoice: `lnbc${amount}demo...`, // Fake invoice
                proof: {
                    provider: 'demo',
                    mechanism: 'mock',
                    note: 'This is a demo - no real funds locked'
                },
                event
            };

        } catch (error) {
            console.error('Demo lock failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Mock stake release.
     * Per-stake: stakeId = `${rideId}_${role}` — release exactly one party's
     * stake, matching how the server releases/forfeits parties independently.
     */
    async releaseStake(stakeId) {
        try {
            const stake = this.stakes.get(stakeId);
            if (!stake) {
                throw new Error(`No stake found for ${stakeId}`);
            }

            stake.status = 'released';
            stake.releasedAt = Date.now();

            const event = this.createStakeEvent('released', {
                rideId: stake.rideId,
                amount: stake.amount,
                providerTxId: stake.lockId
            });

            console.log(`🎭 DEMO: Released ${stake.amount} sats (${stakeId})`);

            return {
                success: true,
                releaseId: stakeId,
                amount: stake.amount,
                releasedAt: stake.releasedAt,
                event
            };

        } catch (error) {
            console.error('Demo release failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Mock stake forfeit — per-stake (stakeId = `${rideId}_${role}`).
     * The server decides which party forfeits and releases the innocent
     * party's stake separately.
     */
    async forfeitStake(stakeId, cancellingParty, reason) {
        try {
            const stake = this.stakes.get(stakeId);
            if (!stake) {
                throw new Error(`No stake found for ${stakeId}`);
            }

            // Mock penalty calculation (80% penalty)
            const penalty = Math.floor(stake.amount * 0.8);
            const refund = stake.amount - penalty;

            stake.status = 'forfeited';
            stake.forfeitedAt = Date.now();
            stake.penalty = penalty;

            const event = this.createStakeEvent('forfeited', {
                rideId: stake.rideId,
                amount: stake.amount,
                penalty,
                refund,
                reason,
                providerTxId: stake.lockId
            });

            console.log(`🎭 DEMO: Forfeited ${penalty} sats (${stakeId}, ${reason})`);

            return {
                success: true,
                penalty,
                refund,
                reason,
                event
            };

        } catch (error) {
            console.error('Demo forfeit failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get stake status — per-stake (stakeId = `${rideId}_${role}`)
     */
    async getStakeStatus(stakeId) {
        return this.stakes.get(stakeId) || null;
    }

    /**
     * Health check (always passes for demo)
     */
    async healthCheck() {
        console.log('🎭 DEMO: Provider health check passed');
        return true;
    }

    /**
     * Get provider capabilities
     */
    getCapabilities() {
        return {
            ...super.getCapabilities(),
            name: 'Demo Provider',
            type: 'mock',
            trustModel: 'demo',
            features: {
                instantLock: true,
                instantRelease: true,
                partialForfeit: true,
                batchOperations: false,
                refunds: true,
                automaticRefund: false,
                trustless: false
            },
            note: '⚠️  DEMO MODE - No real payments processed'
        };
    }

    /**
     * Get trust model
     */
    getTrustModel() {
        return 'demo';
    }
}

module.exports = DemoProvider;
