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
     * Mock stake release
     */
    async releaseStake(rideId) {
        try {
            const riderStake = this.stakes.get(`${rideId}_rider`);
            const driverStake = this.stakes.get(`${rideId}_driver`);

            if (!riderStake && !driverStake) {
                throw new Error('No stakes found for this ride');
            }

            if (riderStake) {
                riderStake.status = 'released';
                riderStake.releasedAt = Date.now();
            }

            if (driverStake) {
                driverStake.status = 'released';
                driverStake.releasedAt = Date.now();
            }

            const totalAmount = (riderStake?.amount || 0) + (driverStake?.amount || 0);

            const event = this.createStakeEvent('released', {
                rideId,
                amount: totalAmount,
                providerTxId: rideId
            });

            console.log(`🎭 DEMO: Released ${totalAmount} sats for ride ${rideId}`);

            return {
                success: true,
                releaseId: rideId,
                amount: totalAmount,
                releasedAt: Date.now(),
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
     * Mock stake forfeit
     */
    async forfeitStake(rideId, cancellingParty, reason) {
        try {
            const riderStake = this.stakes.get(`${rideId}_rider`);
            const driverStake = this.stakes.get(`${rideId}_driver`);

            if (!riderStake && !driverStake) {
                throw new Error('No stakes found for this ride');
            }

            let forfeitingStake, innocentStake;

            if (cancellingParty === riderStake?.userId) {
                forfeitingStake = riderStake;
                innocentStake = driverStake;
            } else {
                forfeitingStake = driverStake;
                innocentStake = riderStake;
            }

            if (!forfeitingStake) {
                throw new Error('Could not determine forfeiting party');
            }

            // Mock penalty calculation (80% penalty)
            const penalty = Math.floor(forfeitingStake.amount * 0.8);
            const refund = forfeitingStake.amount - penalty;

            forfeitingStake.status = 'forfeited';
            forfeitingStake.forfeitedAt = Date.now();
            forfeitingStake.penalty = penalty;

            if (innocentStake) {
                innocentStake.status = 'released';
                innocentStake.releasedAt = Date.now();
            }

            const event = this.createStakeEvent('forfeited', {
                rideId,
                amount: forfeitingStake.amount,
                penalty,
                refund,
                reason,
                providerTxId: forfeitingStake.lockId
            });

            console.log(`🎭 DEMO: Forfeited ${penalty} sats from ride ${rideId} (${reason})`);

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
     * Get stake status
     */
    async getStakeStatus(rideId) {
        const riderStake = this.stakes.get(`${rideId}_rider`);
        const driverStake = this.stakes.get(`${rideId}_driver`);

        return {
            rider: riderStake || null,
            driver: driverStake || null
        };
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
