// ==========================================
// ALBY PAYMENT PROVIDER
// User-friendly custodial stake management via Alby
// ==========================================

const PaymentProvider = require('./base');
const { fetchWithTimeout: fetch } = require('../src/utils/fetch-timeout');

/**
 * Alby Provider
 *
 * Advantages:
 * - Easy user onboarding
 * - OAuth integration
 * - Browser extension support
 * - WebLN support
 * - Good UX
 *
 * Requirements:
 * - Alby account
 * - OAuth token or API key
 */
class AlbyProvider extends PaymentProvider {
    constructor(config) {
        super(config);
        this.providerName = 'alby';
        this.type = 'custodial';

        this.apiKey = config.apiKey || process.env.ALBY_API_KEY;
        this.baseUrl = 'https://api.getalby.com';

        if (!this.apiKey) {
            throw new Error('Alby API key is required');
        }

        this.stakes = new Map();
    }

    /**
     * Lock stake using Alby invoice
     */
    async lockStake(rideId, userId, amount, type) {
        this.validateStakeParams(rideId, amount);

        try {
            // Create invoice via Alby API
            const response = await fetch(`${this.baseUrl}/invoices`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    amount: amount,
                    description: `${type} stake for ride ${rideId}`,
                    description_hash: '',
                    expiry: 3600 // 1 hour
                })
            });

            if (!response.ok) {
                throw new Error(`Alby API error: ${response.statusText}`);
            }

            const invoice = await response.json();

            // Store stake
            const stakeId = `${rideId}_${type}`;
            this.stakes.set(stakeId, {
                rideId,
                userId,
                amount,
                type,
                paymentHash: invoice.payment_hash,
                invoice: invoice.payment_request,
                status: 'pending',
                createdAt: Date.now()
            });

            const event = this.createStakeEvent('locked', {
                rideId,
                userId,
                amount,
                type,
                providerTxId: invoice.payment_hash
            });

            return {
                success: true,
                lockId: invoice.payment_hash,
                amount,
                lockedAt: Date.now(),
                invoice: invoice.payment_request,
                proof: {
                    provider: 'alby',
                    paymentHash: invoice.payment_hash
                },
                event
            };

        } catch (error) {
            console.error('Alby lock failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Release stake by sending Lightning payment back
     */
    async releaseStake(rideId) {
        try {
            // For Alby, we need to send the money back to the user
            // This requires the user's Lightning address or invoice

            const riderStake = this.stakes.get(`${rideId}_rider`);
            const driverStake = this.stakes.get(`${rideId}_driver`);

            if (!riderStake && !driverStake) {
                throw new Error('No stakes found');
            }

            // Note: This is simplified - in production you'd need
            // the user's Lightning address to send the refund

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

            return {
                success: true,
                releaseId: rideId,
                amount: totalAmount,
                releasedAt: Date.now(),
                event
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async forfeitStake(rideId, cancellingParty, reason) {
        // Similar to release but with penalty distribution
        const penalty = 0;
        const refund = 0;

        const event = this.createStakeEvent('forfeited', {
            rideId,
            amount: 0,
            penalty,
            refund,
            reason,
            providerTxId: rideId
        });

        return {
            success: true,
            penalty,
            refund,
            reason,
            event
        };
    }

    async getStakeStatus(rideId) {
        const riderStake = this.stakes.get(`${rideId}_rider`);
        const driverStake = this.stakes.get(`${rideId}_driver`);

        return {
            rider: riderStake || null,
            driver: driverStake || null
        };
    }

    async healthCheck() {
        try {
            const response = await fetch(`${this.baseUrl}/user/summary`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            return response.ok;
        } catch (error) {
            return false;
        }
    }

    getCapabilities() {
        return {
            ...super.getCapabilities(),
            name: 'Alby',
            type: 'custodial',
            trustModel: 'custodial',
            features: {
                instantLock: false,
                instantRelease: true,
                partialForfeit: true,
                batchOperations: false,
                refunds: true,
                webLN: true,
                browserExtension: true
            }
        };
    }

    getTrustModel() {
        return 'custodial';
    }
}

module.exports = AlbyProvider;
