// ==========================================
// BTCPAY SERVER PAYMENT PROVIDER
// Self-hosted stake management via BTCPay Server
// ==========================================

const PaymentProvider = require('./base');
const { fetchWithTimeout: fetch } = require('../src/utils/fetch-timeout');

/**
 * BTCPay Server Provider
 *
 * Advantages:
 * - Self-hosted (no third-party dependency)
 * - Open source
 * - Supports Lightning + on-chain
 * - No KYC required
 * - Can use Greenfield API
 *
 * Requirements:
 * - BTCPay Server instance
 * - Store ID and API key
 * - Lightning node (LND or CLN)
 */
class BTCPayProvider extends PaymentProvider {
    constructor(config) {
        super(config);
        this.providerName = 'btcpay';
        this.type = 'self-hosted';

        this.url = config.url || process.env.BTCPAY_URL;
        this.apiKey = config.apiKey || process.env.BTCPAY_API_KEY;
        this.storeId = config.storeId || process.env.BTCPAY_STORE_ID;

        if (!this.url || !this.apiKey || !this.storeId) {
            throw new Error('BTCPay URL, API key, and store ID are required');
        }

        // Remove trailing slash from URL
        this.url = this.url.replace(/\/$/, '');

        // Map: rideId -> {invoice, ...}
        this.stakes = new Map();
    }

    /**
     * Lock stake using BTCPay invoice
     */
    async lockStake(rideId, userId, amount, type) {
        this.validateStakeParams(rideId, amount);

        try {
            // Create Lightning invoice via Greenfield API
            const response = await fetch(`${this.url}/api/v1/stores/${this.storeId}/invoices`, {
                method: 'POST',
                headers: {
                    'Authorization': `token ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    amount: (amount / 100000000).toString(), // Convert sats to BTC
                    currency: 'BTC',
                    metadata: {
                        rideId,
                        userId,
                        type,
                        purpose: 'stake'
                    },
                    checkout: {
                        speedPolicy: 'HighSpeed',
                        paymentMethods: ['BTC-LightningNetwork'], // Only Lightning
                        expirationMinutes: 60,
                        monitoring: {
                            enabled: true
                        },
                        redirectURL: null,
                        defaultLanguage: 'en'
                    }
                })
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`BTCPay API error: ${error}`);
            }

            const invoice = await response.json();

            // Store stake info
            const stakeId = `${rideId}_${type}`;
            this.stakes.set(stakeId, {
                rideId,
                userId,
                amount,
                type,
                invoiceId: invoice.id,
                status: 'pending',
                createdAt: Date.now(),
                expiresAt: Date.now() + 3600000 // 1 hour
            });

            // Get Lightning invoice from payment methods
            const lightningMethod = invoice.checkout.paymentMethods.find(
                pm => pm.paymentMethod === 'BTC-LightningNetwork'
            );

            const event = this.createStakeEvent('locked', {
                rideId,
                userId,
                amount,
                type,
                providerTxId: invoice.id
            });

            return {
                success: true,
                lockId: invoice.id,
                amount,
                lockedAt: Date.now(),
                invoice: lightningMethod.destination, // BOLT11 invoice
                proof: {
                    provider: 'btcpay',
                    invoiceId: invoice.id,
                    checkoutUrl: invoice.checkoutLink
                },
                event
            };

        } catch (error) {
            console.error('BTCPay lock failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Release stake (refund invoice)
     */
    async releaseStake(rideId) {
        try {
            const riderStake = this.stakes.get(`${rideId}_rider`);
            const driverStake = this.stakes.get(`${rideId}_driver`);

            if (!riderStake && !driverStake) {
                throw new Error('No stakes found for ride');
            }

            const refunds = [];

            // Refund rider
            if (riderStake) {
                await this.refundInvoice(riderStake);
                riderStake.status = 'released';
                riderStake.releasedAt = Date.now();
                refunds.push('rider');
            }

            // Refund driver
            if (driverStake) {
                await this.refundInvoice(driverStake);
                driverStake.status = 'released';
                driverStake.releasedAt = Date.now();
                refunds.push('driver');
            }

            const totalAmount = (riderStake?.amount || 0) + (driverStake?.amount || 0);

            const event = this.createStakeEvent('released', {
                rideId,
                amount: totalAmount,
                providerTxId: refunds.join(',')
            });

            return {
                success: true,
                releaseId: rideId,
                amount: totalAmount,
                releasedAt: Date.now(),
                refunds,
                event
            };

        } catch (error) {
            console.error('BTCPay release failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Refund a BTCPay invoice
     */
    async refundInvoice(stake) {
        // Mark invoice as refund in BTCPay
        const response = await fetch(
            `${this.url}/api/v1/stores/${this.storeId}/invoices/${stake.invoiceId}/refund`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `token ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    refundVariant: 'CurrentRate',
                    paymentMethod: 'BTC-LightningNetwork',
                    description: `Stake released for ride ${stake.rideId}`
                })
            }
        );

        if (!response.ok) {
            throw new Error(`Refund failed: ${response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Forfeit stake with penalty
     * Note: BTCPay doesn't have native penalty splitting
     * This requires manual payment to other party
     */
    async forfeitStake(rideId, cancellingParty, reason) {
        try {
            const riderStake = this.stakes.get(`${rideId}_rider`);
            const driverStake = this.stakes.get(`${rideId}_driver`);

            let forfeitingStake, innocentStake;

            if (cancellingParty === riderStake?.userId) {
                forfeitingStake = riderStake;
                innocentStake = driverStake;
            } else {
                forfeitingStake = driverStake;
                innocentStake = riderStake;
            }

            // Mark forfeiting invoice (no refund)
            forfeitingStake.status = 'forfeited';
            forfeitingStake.forfeitedAt = Date.now();

            // Refund innocent party
            if (innocentStake) {
                await this.refundInvoice(innocentStake);
                innocentStake.status = 'released';
            }

            /**
             * NOTE: BTCPay doesn't have built-in penalty transfer.
             * The forfeiting party's payment is kept by the store.
             * To transfer penalty to innocent party, operator would need to:
             * 1. Keep the forfeited payment
             * 2. Manually pay penalty to innocent party via Lightning
             *
             * This requires additional implementation.
             */

            const penalty = Math.floor(forfeitingStake.amount * 0.8);
            const refund = 0; // No refund for forfeiting party

            const event = this.createStakeEvent('forfeited', {
                rideId,
                amount: forfeitingStake.amount,
                penalty,
                refund,
                reason,
                providerTxId: forfeitingStake.invoiceId
            });

            return {
                success: true,
                penalty,
                refund,
                reason,
                note: 'Penalty requires manual Lightning payment to innocent party',
                event
            };

        } catch (error) {
            console.error('BTCPay forfeit failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get invoice status from BTCPay
     */
    async getStakeStatus(rideId) {
        const riderStake = this.stakes.get(`${rideId}_rider`);
        const driverStake = this.stakes.get(`${rideId}_driver`);

        if (!riderStake && !driverStake) {
            return null;
        }

        const status = {};

        // Check rider
        if (riderStake) {
            status.rider = await this.checkInvoiceStatus(riderStake);
        }

        // Check driver
        if (driverStake) {
            status.driver = await this.checkInvoiceStatus(driverStake);
        }

        return status;
    }

    /**
     * Check invoice status via API
     */
    async checkInvoiceStatus(stake) {
        try {
            const response = await fetch(
                `${this.url}/api/v1/stores/${this.storeId}/invoices/${stake.invoiceId}`,
                {
                    headers: {
                        'Authorization': `token ${this.apiKey}`
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Failed to get invoice: ${response.statusText}`);
            }

            const invoice = await response.json();

            return {
                ...stake,
                btcpayStatus: invoice.status,
                paid: invoice.status === 'Settled',
                verified: true,
                lastChecked: Date.now()
            };
        } catch (error) {
            return {
                ...stake,
                verified: false,
                error: error.message,
                lastChecked: Date.now()
            };
        }
    }

    /**
     * Health check for BTCPay Server
     */
    async healthCheck() {
        try {
            const response = await fetch(`${this.url}/api/v1/health`, {
                headers: {
                    'Authorization': `token ${this.apiKey}`
                }
            });

            if (!response.ok) {
                return false;
            }

            const health = await response.json();
            return health.status === 'Healthy';
        } catch (error) {
            console.error('BTCPay health check failed:', error);
            return false;
        }
    }

    /**
     * Get BTCPay-specific capabilities
     */
    getCapabilities() {
        return {
            ...super.getCapabilities(),
            name: 'BTCPay Server',
            type: 'self-hosted',
            trustModel: 'self-hosted',
            features: {
                instantLock: false, // User must pay invoice
                instantRelease: true,
                partialForfeit: false, // Requires manual implementation
                batchOperations: false,
                refunds: true,
                automaticRefund: false,
                kycRequired: false,
                selfHosted: true,
                openSource: true
            },
            limits: {
                minStake: 1,
                maxStake: 1000000,
                maxDailyVolume: 100000000 // No practical limit
            },
            requirements: {
                userMustPayInvoice: true,
                lightningWalletRequired: true,
                selfHostingRequired: true
            }
        };
    }

    getTrustModel() {
        return 'self-hosted';
    }

    // Funds flow through the operator's BTCPay store — custodial.
    getCustodyModel() {
        return 'custodial';
    }
}

module.exports = BTCPayProvider;
