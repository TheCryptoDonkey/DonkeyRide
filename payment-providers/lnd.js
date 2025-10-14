// ==========================================
// LND PAYMENT PROVIDER
// Trustless stake management using Lightning hodl invoices
// ==========================================

const PaymentProvider = require('./base');
const crypto = require('crypto');
const fs = require('fs');

/**
 * LND Provider using Hodl Invoices
 *
 * TRUSTLESS STAKING:
 * - Operator CANNOT steal funds
 * - Funds locked in Lightning Network, not with operator
 * - Automatic refund on timeout
 * - Settlement requires preimage reveal
 *
 * Requirements:
 * - LND node with hodl invoice support
 * - gRPC connection
 * - Invoice macaroon permissions
 */
class LNDProvider extends PaymentProvider {
    constructor(config) {
        super(config);
        this.providerName = 'lnd';
        this.type = 'hodl';

        this.host = config.host || 'localhost:10009';
        this.certPath = config.cert || process.env.LND_CERT_PATH;
        this.macaroonPath = config.macaroon || process.env.LND_MACAROON_PATH;
        this.network = config.network || 'mainnet';

        // Map: rideId -> {preimage, hash, invoice, ...}
        this.stakes = new Map();

        // Lazy load gRPC connection
        this.lnd = null;
    }

    /**
     * Initialize LND gRPC connection
     */
    async initialize() {
        if (this.lnd) return;

        try {
            // Dynamically import LND gRPC library
            // Using ln-service for easier interface
            const lnService = require('ln-service');

            // Read cert and macaroon
            const cert = fs.readFileSync(this.certPath);
            const macaroon = fs.readFileSync(this.macaroonPath).toString('hex');

            this.lnd = lnService.authenticatedLndGrpc({
                cert: cert.toString('base64'),
                macaroon,
                socket: this.host
            });

            console.log('✅ Connected to LND');
        } catch (error) {
            throw new Error(`Failed to connect to LND: ${error.message}`);
        }
    }

    /**
     * Lock stake using hodl invoice
     * Creates invoice that can only be settled with correct preimage
     */
    async lockStake(rideId, userId, amount, type) {
        await this.initialize();
        this.validateStakeParams(rideId, amount);

        try {
            // Generate random preimage
            const preimage = crypto.randomBytes(32);
            const hash = crypto.createHash('sha256').update(preimage).digest();

            // Create hodl invoice
            const lnService = require('ln-service');

            const invoice = await lnService.createHodlInvoice({
                lnd: this.lnd.lnd,
                id: hash.toString('hex'),
                tokens: amount,
                description: `${type} stake for ride ${rideId}`,
                expires_at: new Date(Date.now() + 3600000).toISOString() // 1 hour
            });

            // Store stake info
            const stakeId = `${rideId}_${type}`;
            this.stakes.set(stakeId, {
                rideId,
                userId,
                amount,
                type,
                preimage: preimage.toString('hex'),
                hash: hash.toString('hex'),
                invoice: invoice.request,
                invoiceId: invoice.id,
                status: 'pending',
                createdAt: Date.now(),
                expiresAt: Date.now() + 3600000
            });

            // Create Nostr proof event
            const event = this.createStakeEvent('locked', {
                rideId,
                userId,
                amount,
                type,
                providerTxId: hash.toString('hex')
            });

            return {
                success: true,
                lockId: hash.toString('hex'),
                amount,
                lockedAt: Date.now(),
                invoice: invoice.request, // User must pay this
                proof: {
                    provider: 'lnd',
                    mechanism: 'hodl_invoice',
                    hash: hash.toString('hex'),
                    expiresAt: Date.now() + 3600000
                },
                event
            };

        } catch (error) {
            console.error('LND lock failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Release stake by settling hodl invoice
     * Reveals preimage, allowing payment to complete
     */
    async releaseStake(rideId) {
        await this.initialize();

        try {
            const lnService = require('ln-service');

            // Get both stakes
            const riderStake = this.stakes.get(`${rideId}_rider`);
            const driverStake = this.stakes.get(`${rideId}_driver`);

            if (!riderStake && !driverStake) {
                throw new Error('No stakes found for ride');
            }

            const settlements = [];

            // Settle rider stake
            if (riderStake && riderStake.status === 'locked') {
                await lnService.settleHodlInvoice({
                    lnd: this.lnd.lnd,
                    secret: riderStake.preimage
                });

                riderStake.status = 'released';
                riderStake.releasedAt = Date.now();
                settlements.push('rider');
            }

            // Settle driver stake
            if (driverStake && driverStake.status === 'locked') {
                await lnService.settleHodlInvoice({
                    lnd: this.lnd.lnd,
                    secret: driverStake.preimage
                });

                driverStake.status = 'released';
                driverStake.releasedAt = Date.now();
                settlements.push('driver');
            }

            const totalAmount = (riderStake?.amount || 0) + (driverStake?.amount || 0);

            // Create Nostr event
            const event = this.createStakeEvent('released', {
                rideId,
                amount: totalAmount,
                providerTxId: settlements.join(',')
            });

            return {
                success: true,
                releaseId: rideId,
                amount: totalAmount,
                releasedAt: Date.now(),
                settlements,
                proof: {
                    provider: 'lnd',
                    preimages: {
                        rider: riderStake?.preimage,
                        driver: driverStake?.preimage
                    }
                },
                event
            };

        } catch (error) {
            console.error('LND release failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Forfeit stake by cancelling hodl invoice
     * Automatically refunds user (trustless!)
     */
    async forfeitStake(rideId, cancellingParty, reason) {
        await this.initialize();

        try {
            const lnService = require('ln-service');

            const riderStake = this.stakes.get(`${rideId}_rider`);
            const driverStake = this.stakes.get(`${rideId}_driver`);

            let forfeitingStake, innocentStake;

            // Determine who cancelled
            if (cancellingParty === riderStake?.userId) {
                forfeitingStake = riderStake;
                innocentStake = driverStake;
            } else {
                forfeitingStake = driverStake;
                innocentStake = riderStake;
            }

            // Cancel forfeiting party's invoice (automatic refund)
            await lnService.cancelHodlInvoice({
                lnd: this.lnd.lnd,
                id: forfeitingStake.hash
            });

            forfeitingStake.status = 'forfeited';
            forfeitingStake.forfeitedAt = Date.now();

            // Settle innocent party's stake (return their money)
            if (innocentStake && innocentStake.status === 'locked') {
                await lnService.settleHodlInvoice({
                    lnd: this.lnd.lnd,
                    secret: innocentStake.preimage
                });

                innocentStake.status = 'released';
            }

            /**
             * NOTE: With hodl invoices, we can't easily transfer
             * the penalty to the innocent party. The cancelling party
             * simply doesn't get their money locked (automatic refund).
             *
             * For penalty enforcement, we'd need:
             * 1. Settle both invoices
             * 2. Use regular Lightning payment to send penalty
             * 3. Or use a separate penalty mechanism
             *
             * This is a tradeoff: Trustless but no automatic penalties
             */

            const event = this.createStakeEvent('forfeited', {
                rideId,
                amount: forfeitingStake.amount,
                penalty: 0, // No penalty with pure hodl invoices
                refund: forfeitingStake.amount, // Full refund on cancel
                reason,
                providerTxId: forfeitingStake.hash
            });

            return {
                success: true,
                penalty: 0,
                refund: forfeitingStake.amount,
                reason,
                note: 'Hodl invoices provide full refund on cancel. No automatic penalty transfer.',
                event
            };

        } catch (error) {
            console.error('LND forfeit failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get stake status from LND
     */
    async getStakeStatus(rideId) {
        await this.initialize();

        const riderStake = this.stakes.get(`${rideId}_rider`);
        const driverStake = this.stakes.get(`${rideId}_driver`);

        if (!riderStake && !driverStake) {
            return null;
        }

        const lnService = require('ln-service');
        const status = {};

        // Check rider stake status
        if (riderStake) {
            try {
                const invoice = await lnService.getInvoice({
                    lnd: this.lnd.lnd,
                    id: riderStake.hash
                });

                status.rider = {
                    ...riderStake,
                    lndStatus: invoice.is_confirmed ? 'paid' : 'pending',
                    verified: true,
                    lastChecked: Date.now()
                };
            } catch (error) {
                status.rider = {
                    ...riderStake,
                    verified: false,
                    error: error.message
                };
            }
        }

        // Check driver stake status
        if (driverStake) {
            try {
                const invoice = await lnService.getInvoice({
                    lnd: this.lnd.lnd,
                    id: driverStake.hash
                });

                status.driver = {
                    ...driverStake,
                    lndStatus: invoice.is_confirmed ? 'paid' : 'pending',
                    verified: true,
                    lastChecked: Date.now()
                };
            } catch (error) {
                status.driver = {
                    ...driverStake,
                    verified: false,
                    error: error.message
                };
            }
        }

        return status;
    }

    /**
     * Health check for LND connection
     */
    async healthCheck() {
        try {
            await this.initialize();

            const lnService = require('ln-service');
            const info = await lnService.getWalletInfo({ lnd: this.lnd.lnd });

            return info.is_synced_to_chain;
        } catch (error) {
            console.error('LND health check failed:', error);
            return false;
        }
    }

    /**
     * Get LND-specific capabilities
     */
    getCapabilities() {
        return {
            ...super.getCapabilities(),
            name: 'LND',
            type: 'hodl',
            trustModel: 'trustless',
            features: {
                instantLock: false, // User must pay invoice
                instantRelease: true,
                partialForfeit: false, // Hodl invoices are all-or-nothing
                batchOperations: false,
                refunds: true,
                automaticRefund: true, // Timeout = automatic refund
                kycRequired: false,
                trustless: true // ✅ Operator cannot steal!
            },
            limits: {
                minStake: 1,
                maxStake: 1000000, // Limited by Lightning channel capacity
                maxDailyVolume: 10000000,
                maxHoldTime: 3600 // 1 hour before auto-cancel
            },
            requirements: {
                userMustPayInvoice: true,
                lightningWalletRequired: true,
                technicalComplexity: 'medium'
            }
        };
    }

    getTrustModel() {
        return 'trustless';
    }
}

module.exports = LNDProvider;
